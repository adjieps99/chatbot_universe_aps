import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Play, Plug, Plus, Sparkles, Ticket, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildConnectorDraftFromTemplate,
  GENERAL_CONNECTOR_TEMPLATES,
  type GeneralConnectorTemplate,
} from '../shared/connector-templates';
import type { ChatbotRecord } from '../types';

interface ConnectorsViewProps {
  chatbots: ChatbotRecord[];
}

export function ConnectorsView({ chatbots }: ConnectorsViewProps) {
  const [connectors, setConnectors] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [url, setUrl] = useState('');
  const [chatbotId, setChatbotId] = useState('');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'api_key' | 'basic'>('none');
  const [authTokenOrKey, setAuthTokenOrKey] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key');
  const [queryParamsJson, setQueryParamsJson] = useState('{}');
  const [bodyTemplateJson, setBodyTemplateJson] = useState('{}');
  const [inputSchemaJson, setInputSchemaJson] = useState('{}');
  const [testArgsJson, setTestArgsJson] = useState('{}');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadData = async () => {
    const res = await apiFetch<{
      connectors: Array<Record<string, unknown>>;
      logs: Array<Record<string, unknown>>;
      tickets: Array<Record<string, unknown>>;
    }>('/api/connectors');
    setConnectors(res.connectors);
    setLogs(res.logs);
    setTickets(res.tickets);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const applyTemplate = (tpl: GeneralConnectorTemplate) => {
    setSelectedTemplateId(tpl.id);
    setShowForm(true);
    setName(tpl.name);
    setDescription(tpl.description);
    setMethod(tpl.method);
    setUrl(tpl.url);
    setAuthType(tpl.authType);
    setAuthTokenOrKey('');
    setQueryParamsJson(JSON.stringify(tpl.queryParams, null, 2));
    setBodyTemplateJson(JSON.stringify(tpl.bodyTemplate, null, 2));
    setInputSchemaJson(JSON.stringify(tpl.inputSchema, null, 2));
    setTestArgsJson(JSON.stringify(tpl.sampleTestArgs, null, 2));
    setShowAdvanced(true);
    setErr('');
    setMsg(`Template "${tpl.title}" dimuat ke form. Sesuaikan URL/credential jika perlu lalu klik Simpan Connector.`);
  };

  const handleQuickInstallTemplate = async (templateId: string) => {
    const tpl = buildConnectorDraftFromTemplate(templateId);
    if (!tpl) return;
    setErr('');
    setMsg('');
    try {
      await apiFetch('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({
          name: tpl.name,
          description: tpl.description,
          method: tpl.method,
          url: tpl.url,
          authType: tpl.authType,
          queryParams: tpl.queryParams,
          bodyTemplate: tpl.bodyTemplate,
          inputSchema: tpl.inputSchema,
          headers: tpl.headers,
          chatbotId: chatbotId || null,
        }),
      });
      setTestArgsJson(JSON.stringify(tpl.sampleTestArgs, null, 2));
      setMsg(`Connector "${tpl.title}" berhasil ditambahkan dan siap ditest.`);
      await loadData();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memasang template connector.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      let queryParams: Record<string, unknown> = {};
      let bodyTemplate: Record<string, unknown> = {};
      let inputSchema: Record<string, unknown> = {};
      try {
        queryParams = JSON.parse(queryParamsJson || '{}');
        bodyTemplate = JSON.parse(bodyTemplateJson || '{}');
        inputSchema = JSON.parse(inputSchemaJson || '{}');
      } catch {
        setErr('Format JSON pada Query Params / Body Template / Input Schema tidak valid.');
        return;
      }

      const authConfig =
        authType === 'bearer' && authTokenOrKey
          ? { token: authTokenOrKey }
          : authType === 'api_key' && authTokenOrKey
            ? { key: authTokenOrKey, header: apiKeyHeader || 'X-API-Key' }
            : authType === 'basic' && authTokenOrKey
              ? { username: authTokenOrKey.split(':')[0] || '', password: authTokenOrKey.split(':')[1] || '' }
              : undefined;

      await apiFetch('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          method,
          url,
          authType,
          authConfig,
          queryParams,
          bodyTemplate,
          inputSchema,
          chatbotId: chatbotId || null,
        }),
      });
      setShowForm(false);
      setName('');
      setDescription('');
      setUrl('');
      setAuthTokenOrKey('');
      setSelectedTemplateId('');
      setMsg('API Connector berhasil disimpan.');
      await loadData();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create connector.');
    }
  };

  const handleTest = async (c: Record<string, unknown>) => {
    setErr('');
    setMsg('');
    try {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(testArgsJson || '{}');
      } catch {
        parsedArgs = {};
      }
      // Auto-supply sample args when user tests one of the known general templates without filling args
      if (Object.keys(parsedArgs).length === 0) {
        const matchedTpl = GENERAL_CONNECTOR_TEMPLATES.find((t) => t.name === String(c.name));
        if (matchedTpl) parsedArgs = matchedTpl.sampleTestArgs;
      }

      const res = await apiFetch<Record<string, unknown>>(`/api/connectors/${String(c.id)}/test`, {
        method: 'POST',
        body: JSON.stringify({ args: parsedArgs }),
      });
      setTestOutput(JSON.stringify(res, null, 2));
      setMsg(`Test "${String(c.name)}" berhasil (HTTP ${String(res.statusCode ?? 200)}).`);
      await loadData();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Connector test failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">API Connectors & Support Tickets</h1>
          <p className="text-sm text-slate-500">
            Hubungkan chatbot ke API eksternal (aman SSRF) pakai template siap pakai atau konfigurasi kustom.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Buat API Connector
        </button>
      </div>

      {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{msg}</div>}
      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Template API Connector Siap Pakai (General)</h2>
          </div>
          <span className="text-xs text-slate-500">Klik "Pakai ke Form" untuk edit, atau "Pasang Cepat" untuk langsung aktifkan.</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {GENERAL_CONNECTOR_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                selectedTemplateId === tpl.id
                  ? 'border-blue-500 bg-blue-50/40'
                  : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                    {tpl.method}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      tpl.category === 'live_public'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {tpl.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{tpl.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{tpl.summary}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-200/70">
                <button
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Pakai ke Form
                </button>
                {tpl.category === 'live_public' && (
                  <button
                    type="button"
                    onClick={() => void handleQuickInstallTemplate(tpl.id)}
                    className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Pasang Cepat
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Konfigurasi API Connector</h3>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAdvanced ? 'Sembunyikan Parameter JSON' : 'Tampilkan Parameter & Schema JSON'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="conn-name" className="mb-1 block text-xs font-semibold text-slate-700">
                Nama Tool Connector *
              </label>
              <input
                id="conn-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Misal: cek_status_order"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="conn-method" className="mb-1 block text-xs font-semibold text-slate-700">
                HTTP Method
              </label>
              <select
                id="conn-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'GET' | 'POST')}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="GET">GET (Baca Data)</option>
                <option value="POST">POST (Kirim Data / Webhook)</option>
              </select>
            </div>
            <div>
              <label htmlFor="conn-bot" className="mb-1 block text-xs font-semibold text-slate-700">
                Aktif Untuk Chatbot
              </label>
              <select
                id="conn-bot"
                value={chatbotId}
                onChange={(e) => setChatbotId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="">Semua Chatbot di Workspace</option>
                {chatbots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="conn-url" className="mb-1 block text-xs font-semibold text-slate-700">
                Endpoint URL (dukung placeholder {'{{param}}'}) *
              </label>
              <input
                id="conn-url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/v1/orders/{{orderId}}"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="conn-auth" className="mb-1 block text-xs font-semibold text-slate-700">
                Tipe Autentikasi
              </label>
              <select
                id="conn-auth"
                value={authType}
                onChange={(e) => setAuthType(e.target.value as typeof authType)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="none">Tanpa Auth (Public API)</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key Header</option>
                <option value="basic">Basic Auth (user:pass)</option>
              </select>
            </div>
          </div>

          {authType !== 'none' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {authType === 'api_key' && (
                <div>
                  <label htmlFor="conn-header" className="mb-1 block text-xs font-semibold text-slate-700">
                    Nama Header API Key
                  </label>
                  <input
                    id="conn-header"
                    value={apiKeyHeader}
                    onChange={(e) => setApiKeyHeader(e.target.value)}
                    placeholder="X-API-Key"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm"
                  />
                </div>
              )}
              <div className={authType === 'api_key' ? '' : 'sm:col-span-2'}>
                <label htmlFor="conn-secret" className="mb-1 block text-xs font-semibold text-slate-700">
                  {authType === 'bearer'
                    ? 'Bearer Token (Terenkripsi AES-256-GCM di Server)'
                    : authType === 'api_key'
                      ? 'API Key Value'
                      : 'Username:Password'}
                </label>
                <input
                  id="conn-secret"
                  type="password"
                  value={authTokenOrKey}
                  onChange={(e) => setAuthTokenOrKey(e.target.value)}
                  placeholder="Masukkan token / key..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="conn-desc" className="mb-1 block text-xs font-semibold text-slate-700">
              Kapan AI Harus Memanggil API Ini? *
            </label>
            <input
              id="conn-desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Gunakan untuk mengecek status order atau resi pengiriman pelanggan."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="conn-query" className="mb-1 block text-xs font-semibold text-slate-700">
                  Query Params JSON
                </label>
                <textarea
                  id="conn-query"
                  rows={4}
                  value={queryParamsJson}
                  onChange={(e) => setQueryParamsJson(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="conn-body" className="mb-1 block text-xs font-semibold text-slate-700">
                  Body Template JSON (POST)
                </label>
                <textarea
                  id="conn-body"
                  rows={4}
                  value={bodyTemplateJson}
                  onChange={(e) => setBodyTemplateJson(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="conn-schema" className="mb-1 block text-xs font-semibold text-slate-700">
                  Input Parameter Schema JSON
                </label>
                <textarea
                  id="conn-schema"
                  rows={4}
                  value={inputSchemaJson}
                  onChange={(e) => setInputSchemaJson(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Simpan Connector
            </button>
          </div>
        </form>
      )}

      {connectors.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
          <label htmlFor="test-args-json" className="text-xs font-semibold text-slate-700 shrink-0">
            Parameter Test JSON (opsional):
          </label>
          <input
            id="test-args-json"
            value={testArgsJson}
            onChange={(e) => setTestArgsJson(e.target.value)}
            placeholder='{"latitude":"-6.2088","longitude":"106.8456"}'
            className="flex-1 min-w-[220px] rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs"
          />
          <span className="text-[11px] text-slate-500">Kosongkan untuk otomatis pakai sample arguments template.</span>
        </div>
      )}

      {testOutput && (
        <pre className="max-h-56 overflow-auto rounded-2xl bg-slate-900 p-4 font-mono text-xs text-slate-100">
          {testOutput}
        </pre>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <Plug className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">API Connectors Aktif ({connectors.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {connectors.map((c) => (
              <div key={String(c.id)} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{String(c.method)}</span>
                    {String(c.name)}
                  </p>
                  <p className="text-xs font-mono text-slate-500 truncate">{String(c.url)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={`Test connector ${String(c.name)}`}
                    onClick={() => void handleTest(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    title="Test"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Test
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus connector ${String(c.name)}`}
                    onClick={async () => {
                      await apiFetch(`/api/connectors/${String(c.id)}`, { method: 'DELETE' });
                      await loadData();
                    }}
                    className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {connectors.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500">
                Belum ada REST API connector. Pilih salah satu template di atas untuk langsung mencoba.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <Ticket className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Tiket Eskalasi Support ({tickets.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <div key={String(t.id)} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{String(t.subject)}</p>
                  <p className="text-xs text-slate-500 line-clamp-2">{String(t.summary)}</p>
                </div>
                <select
                  aria-label={`Status tiket ${String(t.subject)}`}
                  value={String(t.status)}
                  onChange={async (e) => {
                    await apiFetch(`/api/tickets/${String(t.id)}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ status: e.target.value }),
                    });
                    await loadData();
                  }}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            ))}
            {tickets.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500">Belum ada tiket support yang dieskalasi.</p>
            )}
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Log Eksekusi Connector Terbaru</h3>
          <div className="space-y-2 text-xs">
            {logs.slice(0, 10).map((l) => (
              <div key={String(l.id)} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 font-mono">
                <span className="truncate">{String(l.request_method)} {String(l.request_url)}</span>
                <span>HTTP {String(l.status_code ?? 'ERR')} · {String(l.latency_ms)}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
