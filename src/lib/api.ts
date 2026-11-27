export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }

  if (!res.ok) {
    const errMsg =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return json as T;
}

export async function streamPlaygroundTurn(params: {
  chatbotId: string;
  message: string;
  conversationId?: string;
  onToken: (token: string) => void;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/chatbots/${encodeURIComponent(params.chatbotId)}/playground`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: params.message,
      conversationId: params.conversationId || undefined,
    }),
  });

  if (!res.ok || !res.body) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      (errJson as { error?: string }).error || `Playground error (${res.status})`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload: Record<string, unknown> | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const lines = frame.split('\n');
      let eventType = 'message';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      const parsed = JSON.parse(dataStr) as Record<string, unknown>;
      if (eventType === 'token' && typeof parsed.token === 'string') {
        params.onToken(parsed.token);
      } else if (eventType === 'done') {
        finalPayload = parsed;
      } else if (eventType === 'error') {
        throw new Error(String(parsed.error || 'Agent execution error'));
      }
    }
  }

  if (!finalPayload) {
    throw new Error('Stream ended without completion payload.');
  }
  return finalPayload;
}
