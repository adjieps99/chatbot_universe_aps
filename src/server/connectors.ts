import crypto from 'node:crypto';
import { decryptSecret } from './crypto.ts';
import { getDb } from './db.ts';
import { assertSafeExternalUrl } from './ssrf.ts';

export interface ApiConnectorRow {
  id: string;
  workspace_id: string;
  chatbot_id: string | null;
  name: string;
  description: string;
  method: string;
  url: string;
  headers_json: string;
  query_params_json: string;
  body_template_json: string;
  auth_type: string;
  encrypted_auth_config: string | null;
  input_schema_json: string;
  requires_confirmation: number;
  enabled: number;
}

function interpolateString(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const val = args[key.trim()];
    return val === undefined || val === null ? '' : encodeURIComponent(String(val));
  });
}

function interpolateJson(templateObj: unknown, args: Record<string, unknown>): unknown {
  if (typeof templateObj === 'string') {
    const exactMatch = templateObj.match(/^\{\{([^}]+)\}\}$/);
    if (exactMatch) {
      const val = args[exactMatch[1].trim()];
      return val !== undefined ? val : '';
    }
    return templateObj.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => {
      const val = args[k.trim()];
      return val === undefined || val === null ? '' : String(val);
    });
  }
  if (Array.isArray(templateObj)) {
    return templateObj.map((v) => interpolateJson(v, args));
  }
  if (templateObj && typeof templateObj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(templateObj as Record<string, unknown>)) {
      out[k] = interpolateJson(v, args);
    }
    return out;
  }
  return templateObj;
}

export async function executeApiConnector(params: {
  connector: ApiConnectorRow;
  args: Record<string, unknown>;
  workspaceId: string;
  chatbotId?: string;
  conversationId?: string;
}): Promise<{
  ok: boolean;
  statusCode?: number;
  data?: unknown;
  rawText?: string;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  const db = getDb();
  const { connector, args } = params;

  const targetUrlStr = interpolateString(connector.url, args);
  let statusCode: number | undefined;
  let ok = false;
  let data: unknown;
  let rawText = '';
  let errorMessage = '';

  try {
    const parsedUrl = await assertSafeExternalUrl(targetUrlStr);

    let queryParams: Record<string, string> = {};
    try {
      queryParams = JSON.parse(connector.query_params_json || '{}');
    } catch {
      queryParams = {};
    }
    for (const [k, v] of Object.entries(queryParams)) {
      const resolved = String(interpolateJson(v, args) ?? '');
      if (resolved) parsedUrl.searchParams.set(k, resolved);
    }

    let headers: Record<string, string> = { Accept: 'application/json' };
    try {
      headers = { ...headers, ...JSON.parse(connector.headers_json || '{}') };
    } catch {
      // ignore invalid headers JSON
    }

    if (connector.auth_type !== 'none' && connector.encrypted_auth_config) {
      try {
        const authCfg = JSON.parse(decryptSecret(connector.encrypted_auth_config)) as Record<
          string,
          string
        >;
        if (connector.auth_type === 'bearer' && authCfg.token) {
          headers.Authorization = `Bearer ${authCfg.token}`;
        } else if (connector.auth_type === 'api_key' && authCfg.key) {
          headers[authCfg.header || 'X-API-Key'] = authCfg.key;
        } else if (connector.auth_type === 'basic' && authCfg.username) {
          const encoded = Buffer.from(`${authCfg.username}:${authCfg.password || ''}`).toString(
            'base64'
          );
          headers.Authorization = `Basic ${encoded}`;
        }
      } catch {
        // ignore decryption failure
      }
    }

    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(connector.method.toUpperCase())) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      let tpl: unknown = {};
      try {
        tpl = JSON.parse(connector.body_template_json || '{}');
      } catch {
        tpl = {};
      }
      const resolvedBody =
        tpl && typeof tpl === 'object' && Object.keys(tpl as Record<string, unknown>).length > 0
          ? interpolateJson(tpl, args)
          : args;
      body = JSON.stringify(resolvedBody);
    }

    const res = await fetch(parsedUrl.toString(), {
      method: connector.method.toUpperCase(),
      headers,
      body,
      signal: AbortSignal.timeout(12000),
    });

    statusCode = res.status;
    rawText = await res.text();
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }
    ok = res.ok;
    if (!ok) {
      errorMessage = `HTTP ${statusCode}: ${rawText.slice(0, 200)}`;
    }
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Connector execution failed.';
  }

  const latencyMs = Date.now() - start;
  db.prepare(
    `INSERT INTO connector_execution_logs
      (id, workspace_id, connector_id, chatbot_id, conversation_id, request_url, request_method, status_code, ok, latency_ms, request_payload_json, response_excerpt, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    params.workspaceId,
    connector.id,
    params.chatbotId || connector.chatbot_id || null,
    params.conversationId || null,
    targetUrlStr,
    connector.method.toUpperCase(),
    statusCode ?? null,
    ok ? 1 : 0,
    latencyMs,
    JSON.stringify(args),
    rawText.slice(0, 500),
    errorMessage || null,
    new Date().toISOString()
  );

  return {
    ok,
    statusCode,
    data,
    rawText: rawText.slice(0, 2000),
    latencyMs,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
}
