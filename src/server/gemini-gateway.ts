import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from '@google/genai';

export function getServerGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

export function createGeminiClient(apiKeyOverride?: string): GoogleGenAI {
  const apiKey = apiKeyOverride?.trim() || getServerGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function testGeminiConnection(params: {
  apiKey?: string;
  model?: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number; model: string }> {
  const start = Date.now();
  const model = params.model?.trim() || 'gemini-3.1-flash-lite';
  try {
    const ai = createGeminiClient(params.apiKey);
    const res = await ai.models.generateContent({
      model,
      contents: 'Reply with OK.',
    });
    const text = (res.text || '').trim();
    return {
      ok: true,
      message: `Connected to Gemini (${model}). Response: ${text.slice(0, 40) || 'OK'}`,
      latencyMs: Date.now() - start,
      model,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Gemini connection failed.',
      latencyMs: Date.now() - start,
      model,
    };
  }
}

export async function generateGeminiTurn(params: {
  apiKey?: string;
  model: string;
  systemInstruction: string;
  contents: Content[];
  functionDeclarations?: FunctionDeclaration[];
  onToken?: (token: string) => void;
  maxOutputTokens?: number;
}): Promise<{
  text: string;
  functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  rawModelParts: Part[];
  inputTokens: number;
  outputTokens: number;
}> {
  const ai = createGeminiClient(params.apiKey);
  const hasTools = Boolean(params.functionDeclarations && params.functionDeclarations.length > 0);

  const config = {
    systemInstruction: params.systemInstruction,
    ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
    ...(hasTools
      ? {
          tools: [{ functionDeclarations: params.functionDeclarations }],
        }
      : {}),
  };

  if (params.onToken && !hasTools) {
    const stream = await ai.models.generateContentStream({
      model: params.model,
      contents: params.contents,
      config,
    });
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const chunk of stream) {
      const piece = chunk.text || '';
      if (piece) {
        fullText += piece;
        params.onToken(piece);
      }
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens;
        outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens;
      }
    }
    return {
      text: fullText,
      functionCalls: [],
      rawModelParts: fullText ? [{ text: fullText }] : [],
      inputTokens,
      outputTokens,
    };
  }

  const response = await ai.models.generateContent({
    model: params.model,
    contents: params.contents,
    config,
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const text = response.text || '';
  if (text && params.onToken && !(response.functionCalls && response.functionCalls.length > 0)) {
    params.onToken(text);
  }

  const functionCalls = (response.functionCalls || []).map((fc, idx) => ({
    id: fc.id || `gem_fc_${idx}_${Date.now()}`,
    name: fc.name || '',
    args: (fc.args as Record<string, unknown>) || {},
  }));

  return {
    text,
    functionCalls,
    rawModelParts: parts,
    inputTokens: response.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
  };
}

export async function embedWithGemini(text: string, apiKey?: string): Promise<number[] | null> {
  const key = apiKey?.trim() || getServerGeminiApiKey();
  if (!key) return null;
  try {
    const ai = createGeminiClient(key);
    const res = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: text,
    });
    const values = res.embeddings?.[0]?.values;
    return Array.isArray(values) ? values : null;
  } catch {
    return null;
  }
}
