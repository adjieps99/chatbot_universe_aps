import { Type, type Content, type FunctionDeclaration, type Schema } from '@google/genai';
import { decryptSecret } from './crypto.ts';
import {
  generateGeminiTurn,
  getServerGeminiApiKey,
  testGeminiConnection,
} from './gemini-gateway.ts';
import { discoverOllamaModels, generateOllamaChat } from './ollama-client.ts';

export interface ProviderConnectionRecord {
  id: string;
  provider: string;
  auth_mode: string;
  encrypted_api_key: string | null;
  endpoint: string | null;
  default_model: string;
  embedding_model?: string;
  capabilities_json?: string;
}

export interface UnifiedToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface UnifiedChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

function resolveConnectionApiKey(conn: ProviderConnectionRecord): string {
  if (conn.auth_mode === 'platform_managed') {
    return getServerGeminiApiKey();
  }
  return decryptSecret(conn.encrypted_api_key);
}

function parseCapabilities(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function buildAzureOpenAIChatUrl(params: {
  endpoint: string;
  deployment: string;
  apiVersion?: string;
}): string {
  let cleanBase = params.endpoint.trim().replace(/\/+$/, '');
  const apiVersion = params.apiVersion?.trim() || '2024-10-21';
  // Allow users who paste either https://res.openai.azure.com OR full deployment URL
  if (cleanBase.includes('/chat/completions')) {
    return cleanBase;
  }
  if (cleanBase.endsWith('/openai/v1')) {
    return `${cleanBase}/chat/completions`;
  }
  cleanBase = cleanBase.replace(/\/openai\/deployments\/.*$/, '').replace(/\/openai$/, '');
  return `${cleanBase}/openai/deployments/${encodeURIComponent(params.deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

export function buildAzureOpenAIEmbeddingsUrl(params: {
  endpoint: string;
  deployment: string;
  apiVersion?: string;
}): string {
  let cleanBase = params.endpoint.trim().replace(/\/+$/, '');
  const apiVersion = params.apiVersion?.trim() || '2024-10-21';
  cleanBase = cleanBase.replace(/\/openai\/deployments\/.*$/, '').replace(/\/openai$/, '');
  return `${cleanBase}/openai/deployments/${encodeURIComponent(params.deployment)}/embeddings?api-version=${encodeURIComponent(apiVersion)}`;
}

function toGeminiSchemaType(typeStr: string): Type {
  switch (typeStr.toLowerCase()) {
    case 'number':
      return Type.NUMBER;
    case 'integer':
      return Type.INTEGER;
    case 'boolean':
      return Type.BOOLEAN;
    case 'array':
      return Type.ARRAY;
    case 'object':
      return Type.OBJECT;
    default:
      return Type.STRING;
  }
}

function toGeminiFunctionDeclarations(tools: UnifiedToolDefinition[]): FunctionDeclaration[] {
  return tools.map((t) => {
    const props: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(t.parameters.properties || {})) {
      props[k] = {
        type: toGeminiSchemaType(v.type || 'string'),
        description: v.description || k,
        ...(v.enum ? { enum: v.enum } : {}),
      };
    }
    return {
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties: props,
        required: t.parameters.required,
      },
    };
  });
}

function toOpenAiMessages(
  systemInstruction: string,
  messages: UnifiedChatMessage[]
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [{ role: 'system', content: systemInstruction }];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments || {}),
          },
        })),
      });
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId || `call_${Date.now()}`,
        content: m.content,
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export async function testProviderConnection(params: {
  connection: ProviderConnectionRecord;
  model?: string;
}): Promise<{ ok: boolean; message: string; latencyMs?: number; model?: string }> {
  const { connection } = params;
  const chosenModel = params.model?.trim() || connection.default_model;

  if (connection.provider === 'gemini') {
    const apiKey = resolveConnectionApiKey(connection);
    if (!apiKey) {
      return {
        ok: false,
        message:
          connection.auth_mode === 'platform_managed'
            ? 'Server GEMINI_API_KEY is not set in environment.'
            : 'No API key found for this BYOK Gemini connection.',
      };
    }
    return testGeminiConnection({ apiKey, model: chosenModel || 'gemini-3.1-flash-lite' });
  }

  if (connection.provider === 'azure_openai') {
    const start = Date.now();
    const endpoint = (connection.endpoint || '').trim();
    const apiKey = resolveConnectionApiKey(connection);
    const caps = parseCapabilities(connection.capabilities_json);
    const apiVersion =
      typeof caps.apiVersion === 'string' && caps.apiVersion.trim()
        ? caps.apiVersion.trim()
        : '2024-10-21';

    if (!endpoint) {
      return { ok: false, message: 'Azure OpenAI Resource Endpoint URL is required.' };
    }
    if (!chosenModel) {
      return { ok: false, message: 'Azure OpenAI Deployment Name is required.' };
    }
    if (!apiKey) {
      return { ok: false, message: 'Azure OpenAI API Key is required.' };
    }

    const url = buildAzureOpenAIChatUrl({ endpoint, deployment: chosenModel, apiVersion });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          max_completion_tokens: 16,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        // Retry once with max_tokens if older Azure API version rejects max_completion_tokens
        if (res.status === 400 && errBody.includes('max_completion_tokens')) {
          const retry = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'Reply with OK.' }],
              max_tokens: 16,
            }),
            signal: AbortSignal.timeout(12000),
          });
          if (retry.ok) {
            return {
              ok: true,
              message: `Connected to Azure OpenAI deployment "${chosenModel}" (api-version ${apiVersion}).`,
              latencyMs: Date.now() - start,
              model: chosenModel,
            };
          }
        }
        return {
          ok: false,
          message: `Azure OpenAI HTTP ${res.status}: ${errBody.slice(0, 220)}`,
          latencyMs: Date.now() - start,
        };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = (json.choices?.[0]?.message?.content || 'OK').trim();
      return {
        ok: true,
        message: `Connected to Azure OpenAI deployment "${chosenModel}". Response: ${reply.slice(0, 40)}`,
        latencyMs: Date.now() - start,
        model: chosenModel,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Azure OpenAI connection failed.',
        latencyMs: Date.now() - start,
      };
    }
  }

  if (connection.provider === 'ollama') {
    const endpoint = connection.endpoint || process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
    const discovery = await discoverOllamaModels(endpoint);
    if (!discovery.reachable) {
      return {
        ok: false,
        message: `Ollama unreachable at ${endpoint}: ${discovery.error || 'connection refused'}`,
      };
    }
    return {
      ok: true,
      message: `Connected to Ollama (${discovery.models.length} models installed).`,
      model: chosenModel || discovery.chatModels[0] || '',
    };
  }

  if (connection.provider === 'openai_compatible') {
    const start = Date.now();
    const endpoint = (connection.endpoint || '').trim().replace(/\/+$/, '');
    const apiKey = resolveConnectionApiKey(connection);
    if (!endpoint) {
      return { ok: false, message: 'Endpoint URL is required for OpenAI-compatible provider.' };
    }
    try {
      const res = await fetch(`${endpoint}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { ok: false, message: `Endpoint returned HTTP ${res.status}` };
      }
      return {
        ok: true,
        message: `Connected to OpenAI-compatible endpoint (${endpoint}).`,
        latencyMs: Date.now() - start,
        model: chosenModel,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'OpenAI-compatible connection failed.',
      };
    }
  }

  return { ok: false, message: `Unsupported provider: ${connection.provider}` };
}

async function invokeOpenAiStyleChat(params: {
  url: string;
  headers: Record<string, string>;
  model?: string;
  systemInstruction: string;
  messages: UnifiedChatMessage[];
  tools?: UnifiedToolDefinition[];
  onToken?: (token: string) => void;
  maxOutputTokens?: number;
}) {
  const hasTools = Boolean(params.tools && params.tools.length > 0);
  const useStream = Boolean(params.onToken && !hasTools);

  const payload: Record<string, unknown> = {
    ...(params.model ? { model: params.model } : {}),
    ...(params.maxOutputTokens ? { max_tokens: params.maxOutputTokens } : {}),
    messages: toOpenAiMessages(params.systemInstruction, params.messages),
    stream: useStream,
    ...(hasTools
      ? {
          tools: params.tools!.map((t) => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
        }
      : {}),
  };

  const res = await fetch(params.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...params.headers,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`LLM API error (${res.status}): ${errBody.slice(0, 240)}`);
  }

  if (useStream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataPart = trimmed.slice(5).trim();
        if (!dataPart || dataPart === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataPart) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            params.onToken?.(delta);
          }
        } catch {
          // ignore partial SSE line
        }
      }
    }
    return {
      text: fullText,
      toolCalls: [],
      inputTokens: Math.ceil(JSON.stringify(params.messages).length / 4),
      outputTokens: Math.ceil(fullText.length / 4),
    };
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const msg = json.choices?.[0]?.message;
  const text = (msg?.content || '').trim();
  const toolCalls = (msg?.tool_calls || [])
    .filter((tc) => tc.function?.name)
    .map((tc, idx) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      return {
        id: tc.id || `oai_tc_${idx}_${Date.now()}`,
        name: String(tc.function?.name || ''),
        arguments: parsedArgs,
      };
    });

  if (text && params.onToken && toolCalls.length === 0) {
    params.onToken(text);
  }

  return {
    text,
    toolCalls,
    inputTokens: json.usage?.prompt_tokens || 0,
    outputTokens: json.usage?.completion_tokens || 0,
  };
}

export async function invokeLlmChat(params: {
  connection: ProviderConnectionRecord;
  model: string;
  systemInstruction: string;
  messages: UnifiedChatMessage[];
  tools?: UnifiedToolDefinition[];
  onToken?: (token: string) => void;
  maxOutputTokens?: number;
}): Promise<{
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  inputTokens: number;
  outputTokens: number;
}> {
  const { connection, model, systemInstruction, messages, tools, onToken, maxOutputTokens } = params;

  if (connection.provider === 'gemini') {
    const apiKey = resolveConnectionApiKey(connection);
    const contents: Content[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              text: `[Tool Result: ${m.toolName || 'tool'}]\n${m.content}`,
            },
          ],
        });
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content || (m.toolCalls ? `Calling tools: ${m.toolCalls.map((t) => t.name).join(', ')}` : '') }],
        });
      }
    }

    const res = await generateGeminiTurn({
      apiKey,
      model: model || 'gemini-4-hydrogen',
      systemInstruction,
      contents,
      functionDeclarations: tools && tools.length > 0 ? toGeminiFunctionDeclarations(tools) : undefined,
      onToken,
      maxOutputTokens,
    });

    return {
      text: res.text,
      toolCalls: res.functionCalls.map((fc) => ({
        id: fc.id,
        name: fc.name,
        arguments: fc.args,
      })),
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    };
  }

  if (connection.provider === 'azure_openai') {
    const endpoint = (connection.endpoint || '').trim();
    const apiKey = resolveConnectionApiKey(connection);
    const caps = parseCapabilities(connection.capabilities_json);
    const apiVersion =
      typeof caps.apiVersion === 'string' && caps.apiVersion.trim()
        ? caps.apiVersion.trim()
        : '2024-10-21';
    const deployment = model?.trim() || connection.default_model;
    if (!endpoint || !apiKey || !deployment) {
      throw new Error('Azure OpenAI endpoint, deployment name, and API key are required.');
    }
    const url = buildAzureOpenAIChatUrl({ endpoint, deployment, apiVersion });
    return invokeOpenAiStyleChat({
      url,
      headers: { 'api-key': apiKey },
      systemInstruction,
      messages,
      tools,
      onToken,
      maxOutputTokens,
    });
  }

  if (connection.provider === 'ollama') {
    const endpoint = connection.endpoint || process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
    const ollamaMessages = [
      { role: 'system' as const, content: systemInstruction },
      ...messages.map((m) => ({
        role: m.role,
        content: m.role === 'tool' ? `[Tool ${m.toolName || ''}]: ${m.content}` : m.content,
      })),
    ];
    return generateOllamaChat({
      endpoint,
      model,
      messages: ollamaMessages,
      maxOutputTokens,
      tools: tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      onToken,
    });
  }

  if (connection.provider === 'openai_compatible') {
    const endpoint = (connection.endpoint || '').trim().replace(/\/+$/, '');
    const apiKey = resolveConnectionApiKey(connection);
    return invokeOpenAiStyleChat({
      url: `${endpoint}/chat/completions`,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      model,
      systemInstruction,
      messages,
      tools,
      onToken,
      maxOutputTokens,
    });
  }

  throw new Error(`Unsupported LLM provider "${connection.provider}".`);
}
