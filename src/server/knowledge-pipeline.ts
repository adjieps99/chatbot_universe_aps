import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import * as pdfParseMod from 'pdf-parse';
import { getDb } from './db.ts';
import { embedWithGemini } from './gemini-gateway.ts';
import { embedWithOllama } from './ollama-client.ts';
import { upsertQdrantPoints } from './qdrant-client.ts';
import { assertSafeExternalUrl } from './ssrf.ts';

function splitIntoChunks(text: string, maxChars = 1000, overlapChars = 120): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) return [];

  // Preserve explicit QnA/row record dividers (e.g. from Excel spreadsheets)
  if (cleaned.includes('\n---\n')) {
    const records = cleaned
      .split('\n---\n')
      .map((r) => r.trim())
      .filter(Boolean);
    const out: string[] = [];
    for (const rec of records) {
      if (rec.length <= maxChars) {
        out.push(rec);
      } else {
        out.push(...splitIntoChunks(rec.replace(/\n---\n/g, '\n'), maxChars, overlapChars));
      }
    }
    return out;
  }

  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    let end = Math.min(cursor + maxChars, cleaned.length);
    if (end < cleaned.length) {
      const lastBreak = Math.max(cleaned.lastIndexOf('\n', end), cleaned.lastIndexOf('. ', end));
      if (lastBreak > cursor + maxChars * 0.4) {
        end = lastBreak + 1;
      }
    }
    const piece = cleaned.slice(cursor, end).trim();
    if (piece) chunks.push(piece);
    if (end >= cleaned.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return chunks;
}

async function computeChunkEmbedding(
  workspaceId: string,
  chatbotId: string,
  text: string
): Promise<number[] | null> {
  const db = getDb();
  const bot = db
    .prepare(
      `SELECT c.embedding_model_id, mc.provider, mc.endpoint, mc.embedding_model
       FROM chatbots c
       LEFT JOIN model_connections mc ON mc.id = COALESCE(c.embedding_connection_id, c.model_connection_id)
       WHERE c.id = ? AND c.workspace_id = ?`
    )
    .get(chatbotId, workspaceId) as
    | {
        embedding_model_id?: string;
        provider?: string;
        endpoint?: string;
        embedding_model?: string;
      }
    | undefined;

  if (bot?.provider === 'ollama' && bot.endpoint) {
    const vec = await embedWithOllama(
      bot.endpoint,
      bot.embedding_model_id || bot.embedding_model || 'nomic-embed-text',
      text
    );
    if (vec) return vec;
  }

  return embedWithGemini(text);
}

async function indexChunksForItem(params: {
  workspaceId: string;
  chatbotId: string;
  itemId: string;
  title: string;
  sourceType: string;
  content: string;
}): Promise<{ chunkCount: number; qdrantSynced: boolean }> {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`DELETE FROM knowledge_chunks WHERE knowledge_item_id = ? AND workspace_id = ?`).run(
    params.itemId,
    params.workspaceId
  );
  db.prepare(`DELETE FROM knowledge_chunks_fts WHERE knowledge_item_id = ? AND workspace_id = ?`).run(
    params.itemId,
    params.workspaceId
  );

  const chunks = splitIntoChunks(params.content);
  const qdrantPoints: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const chunkId = crypto.randomUUID();
    const embedding = i < 20 ? await computeChunkEmbedding(params.workspaceId, params.chatbotId, chunkText) : null;

    db.prepare(
      `INSERT INTO knowledge_chunks
        (id, workspace_id, chatbot_id, knowledge_item_id, chunk_index, content, metadata_json, token_estimate, embedding_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      chunkId,
      params.workspaceId,
      params.chatbotId,
      params.itemId,
      i,
      chunkText,
      JSON.stringify({ title: params.title, sourceType: params.sourceType, chunkIndex: i }),
      Math.ceil(chunkText.length / 4),
      embedding ? JSON.stringify(embedding) : null,
      now
    );

    db.prepare(
      `INSERT INTO knowledge_chunks_fts (chunk_id, workspace_id, chatbot_id, knowledge_item_id, title, content)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(chunkId, params.workspaceId, params.chatbotId, params.itemId, params.title, chunkText);

    if (embedding) {
      qdrantPoints.push({
        id: chunkId,
        vector: embedding,
        payload: {
          workspaceId: params.workspaceId,
          chatbotId: params.chatbotId,
          itemId: params.itemId,
          title: params.title,
          content: chunkText,
          chunkIndex: i,
        },
      });
    }
  }

  db.prepare(
    `UPDATE knowledge_items SET chunk_count = ?, status = 'indexed', updated_at = ? WHERE id = ? AND workspace_id = ?`
  ).run(chunks.length, now, params.itemId, params.workspaceId);

  const qdrantSynced = qdrantPoints.length > 0 ? await upsertQdrantPoints(qdrantPoints) : false;
  return { chunkCount: chunks.length, qdrantSynced };
}

export async function ingestManualKnowledgeRecord(params: {
  workspaceId: string;
  chatbotId: string;
  title: string;
  sourceType: 'faq' | 'note';
  content: string;
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const contentHash = crypto.createHash('sha256').update(params.content).digest('hex');

  db.prepare(
    `INSERT INTO knowledge_items
      (id, workspace_id, chatbot_id, title, source_type, content, content_hash, chunk_count, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'indexing', '{}', ?, ?)`
  ).run(
    id,
    params.workspaceId,
    params.chatbotId,
    params.title,
    params.sourceType,
    params.content,
    contentHash,
    now,
    now
  );

  const indexing = await indexChunksForItem({
    workspaceId: params.workspaceId,
    chatbotId: params.chatbotId,
    itemId: id,
    title: params.title,
    sourceType: params.sourceType,
    content: params.content,
  });

  const item = db.prepare(`SELECT * FROM knowledge_items WHERE id = ?`).get(id);
  return { item, indexing };
}

async function extractTextFromBuffer(fileName: string, buffer: Buffer): Promise<string> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const records: string[] = [];
    workbook.eachSheet((sheet) => {
      let headers: string[] = [];
      sheet.eachRow((row, rowNum) => {
        const vals = (row.values as unknown[]).slice(1).map((v) => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
            return String((v as Record<string, unknown>).text || '');
          }
          return String(v);
        });
        if (rowNum === 1) {
          headers = vals;
        } else {
          const pairs = vals
            .map((val, idx) => (val ? `${headers[idx] || `Col${idx + 1}`}: ${val}` : ''))
            .filter(Boolean);
          if (pairs.length > 0) {
            records.push(`[Sheet: ${sheet.name}]\n${pairs.join('\n')}`);
          }
        }
      });
    });
    return records.join('\n---\n');
  }

  if (lower.endsWith('.csv')) {
    return buffer.toString('utf8');
  }

  if (lower.endsWith('.pdf')) {
    const mod = pdfParseMod as unknown as {
      PDFParse?: new (opts: { data: Buffer }) => { getText: () => Promise<{ text?: string }> };
      default?: (buf: Buffer) => Promise<{ text?: string }>;
    };
    if (typeof mod.PDFParse === 'function') {
      const parser = new mod.PDFParse({ data: buffer });
      const parsed = await parser.getText();
      return parsed.text || '';
    }
    if (typeof mod.default === 'function') {
      const parsed = await mod.default(buffer);
      return parsed.text || '';
    }
    throw new Error('PDF parser unavailable.');
  }

  if (lower.endsWith('.docx')) {
    const res = await mammoth.extractRawText({ buffer });
    return res.value || '';
  }

  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    const $ = cheerio.load(buffer.toString('utf8'));
    $('script, style, noscript').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  }

  return buffer.toString('utf8');
}

export async function ingestUploadedKnowledgeFile(params: {
  workspaceId: string;
  chatbotId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  title?: string;
}) {
  const extracted = (await extractTextFromBuffer(params.fileName, params.buffer)).trim();
  if (!extracted) {
    throw new Error(`No readable text found in "${params.fileName}".`);
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const resolvedTitle = params.title?.trim() || params.fileName;
  const contentHash = crypto.createHash('sha256').update(extracted).digest('hex');

  db.prepare(
    `INSERT INTO knowledge_items
      (id, workspace_id, chatbot_id, title, source_type, file_name, mime_type, content, content_hash, chunk_count, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?, 0, 'indexing', ?, ?, ?)`
  ).run(
    id,
    params.workspaceId,
    params.chatbotId,
    resolvedTitle,
    params.fileName,
    params.mimeType,
    extracted,
    contentHash,
    JSON.stringify({ fileSize: params.buffer.length }),
    now,
    now
  );

  const indexing = await indexChunksForItem({
    workspaceId: params.workspaceId,
    chatbotId: params.chatbotId,
    itemId: id,
    title: resolvedTitle,
    sourceType: 'file',
    content: extracted,
  });

  const item = db.prepare(`SELECT * FROM knowledge_items WHERE id = ?`).get(id);
  return { item, indexing };
}

export async function ingestWebsiteUrl(params: {
  workspaceId: string;
  chatbotId: string;
  url: string;
  title?: string;
}) {
  const safeUrl = await assertSafeExternalUrl(params.url);
  const res = await fetch(safeUrl.toString(), {
    headers: { 'User-Agent': 'KRESNA-Knowledge-Crawler/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${res.status}).`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const pageTitle = params.title?.trim() || $('title').text().trim() || safeUrl.hostname;
  $('script, style, nav, footer, noscript').remove();
  const extracted = $('body').text().replace(/\s+/g, ' ').trim();

  if (!extracted || extracted.length < 20) {
    throw new Error('Could not extract meaningful text content from that URL.');
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const contentHash = crypto.createHash('sha256').update(extracted).digest('hex');

  db.prepare(
    `INSERT INTO knowledge_items
      (id, workspace_id, chatbot_id, title, source_type, source_url, content, content_hash, chunk_count, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'url', ?, ?, ?, 0, 'indexing', '{}', ?, ?)`
  ).run(id, params.workspaceId, params.chatbotId, pageTitle, safeUrl.toString(), extracted, contentHash, now, now);

  const indexing = await indexChunksForItem({
    workspaceId: params.workspaceId,
    chatbotId: params.chatbotId,
    itemId: id,
    title: pageTitle,
    sourceType: 'url',
    content: extracted,
  });

  const item = db.prepare(`SELECT * FROM knowledge_items WHERE id = ?`).get(id);
  return { item, indexing };
}

export async function reindexKnowledgeItem(params: { workspaceId: string; itemId: string }) {
  const db = getDb();
  const item = db
    .prepare(`SELECT * FROM knowledge_items WHERE id = ? AND workspace_id = ?`)
    .get(params.itemId, params.workspaceId) as Record<string, unknown> | undefined;

  if (!item) {
    throw new Error('Knowledge item not found.');
  }

  return indexChunksForItem({
    workspaceId: params.workspaceId,
    chatbotId: String(item.chatbot_id),
    itemId: String(item.id),
    title: String(item.title),
    sourceType: String(item.source_type),
    content: String(item.content),
  });
}

export async function removeKnowledgeItem(params: {
  workspaceId: string;
  itemId: string;
}): Promise<boolean> {
  const db = getDb();
  db.prepare(`DELETE FROM knowledge_chunks_fts WHERE knowledge_item_id = ? AND workspace_id = ?`).run(
    params.itemId,
    params.workspaceId
  );
  db.prepare(`DELETE FROM knowledge_chunks WHERE knowledge_item_id = ? AND workspace_id = ?`).run(
    params.itemId,
    params.workspaceId
  );
  const res = db
    .prepare(`DELETE FROM knowledge_items WHERE id = ? AND workspace_id = ?`)
    .run(params.itemId, params.workspaceId);
  return Number(res.changes || 0) > 0;
}
