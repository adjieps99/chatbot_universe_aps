export interface OllamaModelInfo {
  name: string;
  size?: number;
  modified_at?: string;
}

export interface OllamaDiscoveryResult {
  reachable: boolean;
  endpoint: string;
  models: OllamaModelInfo[];
  chatModels: string[];
  embeddingModels: string[];
  error?: string;
}

function isEmbeddingModelName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('embed') || lower.includes('minilm') || lower.includes('bge-');
}

export async function discoverOllamaModels(endpointInput?: string): Promise<OllamaDiscoveryResult> {
  const endpoint = (endpointInput || process.env.OLLAMA_BASE_URL || 'http://ollama:11434')
    .trim()
    .replace(/\/+$/, '');
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 2500);

  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return {
        reachable: false,
        endpoint,
        models: [],
        chatModels: [],
        embeddingModels: [],
        error: `Ollama HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { models?: OllamaModelInfo[] };
    const models = Array.isArray(json.models) ? json.models : [];
    const names = models.map((m) => m.name).filter(Boolean);
    return {
      reachable: true,
      endpoint,
      models,
      chatModels: names.filter((n) => !isEmbeddingModelName(n)),
      embeddingModels: names.filter((n) => isEmbeddingModelName(n)),
    };
  } catch (err: unknown) {
    return {
      reachable: false,
      endpoint,
      models: [],
      chatModels: [],
      embeddingModels: [],
      error: err instanceof Error ? err.message : 'Ollama unreachable',
    };
  }
}

export async function generateOllamaChat(params: {
  endpoint: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  maxOutputTokens?: number;
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  onToken?: (token: string) => void;
}): Promise<{
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  inputTokens: number;
  outputTokens: number;
}> {
  const endpoint = params.endpoint.trim().replace(/\/+$/, '');
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
  const useStream = Boolean(params.onToken && (!params.tools || params.tools.length === 0));

  const res = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      tools: params.tools && params.tools.length > 0 ? params.tools : undefined,
      ...(params.maxOutputTokens ? { options: { num_predict: params.maxOutputTokens } } : {}),
      stream: useStream,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Ollama error (${res.status}): ${errText.slice(0, 200)}`);
  }

  if (useStream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content?: string };
            prompt_eval_count?: number;
            eval_count?: number;
          };
          const chunk = parsed.message?.content || '';
          if (chunk) {
            fullText += chunk;
            params.onToken?.(chunk);
          }
          if (typeof parsed.prompt_eval_count === 'number') inputTokens = parsed.prompt_eval_count;
          if (typeof parsed.eval_count === 'number') outputTokens = parsed.eval_count;
        } catch {
          // ignore partial JSON line
        }
      }
    }
    return { text: fullText, toolCalls: [], inputTokens, outputTokens };
  }

  const data = (await res.json()) as {
    message?: {
      content?: string;
      tool_calls?: Array<{ function?: { name?: string; arguments?: Record<string, unknown> } }>;
    };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const text = data.message?.content || '';
  if (text && params.onToken) {
    params.onToken(text);
  }
  const toolCalls = (data.message?.tool_calls || [])
    .filter((t) => t.function?.name)
    .map((t, idx) => ({
      id: `ollama_tc_${idx}_${Date.now()}`,
      name: String(t.function?.name || ''),
      arguments: (t.function?.arguments as Record<string, unknown>) || {},
    }));

  return {
    text,
    toolCalls,
    inputTokens: data.prompt_eval_count || Math.ceil(JSON.stringify(params.messages).length / 4),
    outputTokens: data.eval_count || Math.ceil(text.length / 4),
  };
}

export async function embedWithOllama(
  endpointInput: string,
  model: string,
  text: string
): Promise<number[] | null> {
  const endpoint = endpointInput.trim().replace(/\/+$/, '');
  try {
    const res = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
  }
}
