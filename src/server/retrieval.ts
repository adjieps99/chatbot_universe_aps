import { getDb } from './db.ts';
import { embedWithGemini } from './gemini-gateway.ts';
import { searchQdrantPoints } from './qdrant-client.ts';

export interface RetrievedKnowledgeChunk {
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  sourceType: string;
  content: string;
  score: number;
  citation: {
    itemId: string;
    title: string;
    excerpt: string;
    score: number;
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function buildSafeFtsQuery(query: string): string {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' OR ');
}

export async function retrieveHybridKnowledge(params: {
  workspaceId: string;
  chatbotId: string;
  query: string;
  sourceIds?: string[];
  topK?: number;
}): Promise<{
  chunks: RetrievedKnowledgeChunk[];
  sources: Array<{ citation: { itemId: string; title: string; excerpt: string; score: number } }>;
  totalMatches: number;
  mode: string;
}> {
  const db = getDb();
  const topK = params.topK || 5;
  const ftsExpr = buildSafeFtsQuery(params.query);
  const scoreMap = new Map<string, { score: number; row: Record<string, unknown> }>();

  if (ftsExpr) {
    try {
      const sourceFilter = params.sourceIds?.length
        ? ` AND f.knowledge_item_id IN (${params.sourceIds.map(() => '?').join(',')})`
        : '';
      const ftsRows = db
        .prepare(
          `SELECT f.chunk_id, f.knowledge_item_id, f.title, f.content, bm25(knowledge_chunks_fts) AS rank,
                  ki.source_type
           FROM knowledge_chunks_fts f
           JOIN knowledge_items ki ON ki.id = f.knowledge_item_id
           WHERE knowledge_chunks_fts MATCH ? AND f.workspace_id = ? AND f.chatbot_id = ?${sourceFilter}
           ORDER BY rank ASC
           LIMIT ?`
        )
        .all(ftsExpr, params.workspaceId, params.chatbotId, ...(params.sourceIds || []), topK * 2) as Array<Record<string, unknown>>;

      for (const r of ftsRows) {
        const bm25Raw = Math.abs(Number(r.rank || 0));
        const normScore = 1 / (1 + bm25Raw * 0.2);
        scoreMap.set(String(r.chunk_id), { score: normScore, row: r });
      }
    } catch {
      // Fallback to LIKE scan if FTS syntax encounters edge characters
    }
  }

  // Vector similarity (Qdrant or local stored embeddings)
  const queryVec = await embedWithGemini(params.query);
  let mode = 'sqlite_fts5';
  if (queryVec) {
    const qdrantHits = await searchQdrantPoints({
      vector: queryVec,
      workspaceId: params.workspaceId,
      chatbotId: params.chatbotId,
      sourceIds: params.sourceIds,
      limit: topK,
    });
    if (qdrantHits.length > 0) {
      mode = 'hybrid_qdrant_fts5';
      for (const hit of qdrantHits) {
        const prev = scoreMap.get(hit.id);
        if (prev) {
          prev.score = prev.score * 0.5 + hit.score * 0.5;
        } else if (hit.payload?.content) {
          scoreMap.set(hit.id, {
            score: hit.score,
            row: {
              chunk_id: hit.id,
              knowledge_item_id: String(hit.payload.itemId || ''),
              title: String(hit.payload.title || 'Knowledge Source'),
              source_type: 'vector',
              content: String(hit.payload.content || ''),
            },
          });
        }
      }
    } else {
      const embeddedRows = db
        .prepare(
          `SELECT kc.id AS chunk_id, kc.knowledge_item_id, kc.content, kc.embedding_json,
                  ki.title, ki.source_type
           FROM knowledge_chunks kc
           JOIN knowledge_items ki ON ki.id = kc.knowledge_item_id
           WHERE kc.workspace_id = ? AND kc.chatbot_id = ? AND kc.embedding_json IS NOT NULL
             ${params.sourceIds?.length ? `AND kc.knowledge_item_id IN (${params.sourceIds.map(() => '?').join(',')})` : ''}
           LIMIT 100`
        )
        .all(params.workspaceId, params.chatbotId, ...(params.sourceIds || [])) as Array<Record<string, unknown>>;

      if (embeddedRows.length > 0) {
        mode = 'hybrid_local_vector_fts5';
        for (const r of embeddedRows) {
          try {
            const vec = JSON.parse(String(r.embedding_json || '[]')) as number[];
            const sim = cosineSimilarity(queryVec, vec);
            if (sim > 0.25) {
              const id = String(r.chunk_id);
              const prev = scoreMap.get(id);
              if (prev) {
                prev.score = prev.score * 0.45 + sim * 0.55;
              } else {
                scoreMap.set(id, { score: sim, row: r });
              }
            }
          } catch {
            // ignore malformed vector
          }
        }
      }
    }
  }

  // Fallback keyword substring scan if nothing matched yet
  if (scoreMap.size === 0) {
    const terms = params.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 5);
    const allChunks = db
      .prepare(
        `SELECT kc.id AS chunk_id, kc.knowledge_item_id, kc.content, ki.title, ki.source_type
         FROM knowledge_chunks kc
         JOIN knowledge_items ki ON ki.id = kc.knowledge_item_id
         WHERE kc.workspace_id = ? AND kc.chatbot_id = ?
           ${params.sourceIds?.length ? `AND kc.knowledge_item_id IN (${params.sourceIds.map(() => '?').join(',')})` : ''}
         ORDER BY kc.created_at DESC LIMIT 80`
      )
      .all(params.workspaceId, params.chatbotId, ...(params.sourceIds || [])) as Array<Record<string, unknown>>;

    for (const r of allChunks) {
      const hay = `${String(r.title || '')} ${String(r.content || '')}`.toLowerCase();
      const hits = terms.filter((t) => hay.includes(t)).length;
      if (hits > 0) {
        scoreMap.set(String(r.chunk_id), { score: hits / Math.max(terms.length, 1), row: r });
      }
    }
  }

  const sorted = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const chunks: RetrievedKnowledgeChunk[] = sorted.map(({ score, row }) => {
    const content = String(row.content || '');
    const title = String(row.title || 'Knowledge Source');
    const itemId = String(row.knowledge_item_id || '');
    return {
      chunkId: String(row.chunk_id),
      knowledgeItemId: itemId,
      title,
      sourceType: String(row.source_type || 'faq'),
      content,
      score: Number(score.toFixed(3)),
      citation: {
        itemId,
        title,
        excerpt: content.slice(0, 180) + (content.length > 180 ? '...' : ''),
        score: Number(score.toFixed(3)),
      },
    };
  });

  return {
    chunks,
    sources: chunks.map((c) => ({ citation: c.citation })),
    totalMatches: chunks.length,
    mode,
  };
}
