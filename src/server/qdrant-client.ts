export interface QdrantHealthResult {
  reachable: boolean;
  url: string;
  collection: string;
  error?: string;
}

export function getQdrantConfig() {
  return {
    url: (process.env.QDRANT_URL?.trim() || 'http://qdrant:6333').replace(/\/+$/, ''),
    collection: process.env.QDRANT_COLLECTION?.trim() || 'kresna_knowledge',
  };
}

export async function checkQdrantHealth(): Promise<QdrantHealthResult> {
  const { url, collection } = getQdrantConfig();
  try {
    const res = await fetch(`${url}/collections`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      return { reachable: false, url, collection, error: `Qdrant HTTP ${res.status}` };
    }
    return { reachable: true, url, collection };
  } catch (err: unknown) {
    return {
      reachable: false,
      url,
      collection,
      error: err instanceof Error ? err.message : 'Qdrant unreachable',
    };
  }
}

export async function upsertQdrantPoints(
  points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>
): Promise<boolean> {
  if (points.length === 0) return true;
  const { url, collection } = getQdrantConfig();
  try {
    const dim = points[0].vector.length;
    await fetch(`${url}/collections/${encodeURIComponent(collection)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: dim, distance: 'Cosine' },
      }),
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);

    const res = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function searchQdrantPoints(params: {
  vector: number[];
  workspaceId: string;
  chatbotId: string;
  sourceIds?: string[];
  limit?: number;
}): Promise<Array<{ id: string; score: number; payload?: Record<string, unknown> }>> {
  const { url, collection } = getQdrantConfig();
  try {
    const res = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: params.vector,
        limit: params.limit || 6,
        with_payload: true,
        filter: {
          must: [
            { key: 'workspaceId', match: { value: params.workspaceId } },
            { key: 'chatbotId', match: { value: params.chatbotId } },
            ...(params.sourceIds?.length
              ? [{ key: 'itemId', match: { any: params.sourceIds } }]
              : []),
          ],
        },
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
    };
    return (data.result || []).map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload,
    }));
  } catch {
    return [];
  }
}
