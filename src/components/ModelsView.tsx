import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  HelpCircle,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ModelConnection, OllamaDiscovery } from '../types';

interface ModelsViewProps {
  onConnectionsChanged: () => void;
}

function parseApiVersion(capabilitiesJson?: string): string {
  if (!capabilitiesJson) return '2024-10-21';
  try {
    const parsed = JSON.parse(capabilitiesJson) as { apiVersion?: string };
    return parsed.apiVersion || '2024-10-21';
  } catch {
    return '2024-10-21';
  }
}

export function ModelsView({ onConnectionsChanged }: ModelsViewProps) {
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [ollamaDiscovery, setOllamaDiscovery] = useState<OllamaDiscovery | null>(null);
  const [qdrantHealth, setQdrantHealth] = useState<{
    reachable: boolean;
    url: string;
    collection: string;
  } | null>(null);
  const [platformKeyConfigured, setPlatformKeyConfigured] = useState(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://ollama:11434');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Azure OpenAI / BYOK provider creation state
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAzureGuide, setShowAzureGuide] = useState(true);
  const [newProvider, setNewProvider] = useState<'azure_openai' | 'openai_compatible'>('azure_openai');
  const [connName, setConnName] = useState('Azure OpenAI');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [deploymentName, setDeploymentName] = useState('');
  const [apiVersion, setApiVersion] = useState('2024-10-21');
  const [embeddingDeployment, setEmbeddingDeployment] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [creating, setCreating] = useState(false);

  // Inline edit state for existing Azure / OpenAI-compatible / Ollama connections
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editEmbedding, setEditEmbedding] = useState('');
  const [editApiVersion, setEditApiVersion] = useState('2024-10-21');
  const [editApiKey, setEditApiKey] = useState('');

  const loadModels = async () => {
    const res = await apiFetch<{
      connections: ModelConnection[];
      ollamaDiscovery: OllamaDiscovery;
      qdrantHealth: { reachable: boolean; url: string; collection: string };
      platformKeyConfigured: boolean;
    }>('/api/models');
    setConnections(res.connections);
    setOllamaDiscovery(res.ollamaDiscovery);
    setQdrantHealth(res.qdrantHealth);
    setPlatformKeyConfigured(res.platformKeyConfigured);
    const ol = res.connections.find((c) => c.provider === 'ollama');
    if (ol?.endpoint) setOllamaEndpoint(ol.endpoint);
  };

  useEffect(() => {
    void loadModels();
  }, []);

  const handleTest = async (id: string) => {
    setErrorMsg('');
    setStatusMsg('');
    setBusyId(id);
    try {
      const res = await apiFetch<{ message: string }>(`/api/models/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStatusMsg(res.message);
      await loadModels();
      onConnectionsChanged();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Test failed.');
      await loadModels();
    } finally {
      setBusyId(null);
    }
  };

  const handleApplyAll = async (id: string, model?: string) => {
    setErrorMsg('');
    setStatusMsg('');
    setBusyId(id);
    try {
      const res = await apiFetch<{ updatedChatbots: number; model: string }>(
        `/api/models/${id}/apply-all`,
        { method: 'POST', body: JSON.stringify({ model }) }
      );
      setStatusMsg(`Applied model/deployment "${res.model}" to ${res.updatedChatbots} chatbot(s).`);
      await loadModels();
      onConnectionsChanged();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Apply failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscoverOllama = async () => {
    setErrorMsg('');
    const ol = connections.find((c) => c.provider === 'ollama');
    const res = await apiFetch<{ discovery: OllamaDiscovery }>('/api/models/ollama/discover', {
      method: 'POST',
      body: JSON.stringify({ endpoint: ollamaEndpoint, connectionId: ol?.id }),
    });
    setOllamaDiscovery(res.discovery);
    await loadModels();
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setCreating(true);
    try {
      const res = await apiFetch<{ connection: ModelConnection }>('/api/models', {
        method: 'POST',
        body: JSON.stringify({
          name: connName.trim(),
          provider: newProvider,
          authMode: 'byok',
          endpoint: endpointUrl.trim(),
          defaultModel: deploymentName.trim(),
          embeddingModel: embeddingDeployment.trim(),
          apiVersion: apiVersion.trim() || '2024-10-21',
          apiKey: apiKey.trim(),
          testConnection: true,
        }),
      });
      await loadModels();
      onConnectionsChanged();
      if (res.connection.status === 'connected') {
        setStatusMsg(
          `Saved & connected to "${res.connection.name}" (${res.connection.default_model}). Click "Apply to All Chatbots" to route your bots to it.`
        );
        setShowAddForm(false);
        setApiKey('');
      } else {
        setErrorMsg(
          res.connection.last_error ||
            'Connection saved, but the live test check failed. Verify endpoint, deployment name, and API key.'
        );
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create model connection.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (conn: ModelConnection) => {
    setEditingId(conn.id);
    setEditEndpoint(conn.endpoint || '');
    setEditModel(conn.default_model || '');
    setEditEmbedding(conn.embedding_model || '');
    setEditApiVersion(parseApiVersion(conn.capabilities_json));
    setEditApiKey('');
  };

  const handleSaveEdit = async (connId: string) => {
    setErrorMsg('');
    setStatusMsg('');
    setBusyId(connId);
    try {
      await apiFetch(`/api/models/${connId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          endpoint: editEndpoint.trim(),
          defaultModel: editModel.trim(),
          embeddingModel: editEmbedding.trim(),
          apiVersion: editApiVersion.trim() || '2024-10-21',
          ...(editApiKey.trim() ? { apiKey: editApiKey.trim() } : {}),
        }),
      });
      setEditingId(null);
      setEditApiKey('');
      await handleTest(connId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (conn: ModelConnection) => {
    setErrorMsg('');
    setStatusMsg('');
    try {
      await apiFetch(`/api/models/${conn.id}`, { method: 'DELETE' });
      setStatusMsg(`Removed connection "${conn.name}".`);
      await loadModels();
      onConnectionsChanged();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Models & Vector Runtime</h1>
          <p className="text-sm text-slate-500">
            Connect Azure OpenAI (BYOK), server-managed Gemini, or local Ollama models with one-click test verification.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewProvider('azure_openai');
            setConnName('Azure OpenAI');
            setShowAddForm((v) => !v);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Connect Azure OpenAI / Custom LLM
        </button>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={handleCreateConnection}
          className="rounded-2xl border border-blue-200 bg-white p-6 space-y-5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {newProvider === 'azure_openai'
                    ? 'Connect Your Azure OpenAI Subscription'
                    : 'Connect OpenAI-Compatible Endpoint'}
                </h2>
                <p className="text-xs text-slate-500">
                  Credentials are encrypted at rest with AES-256-GCM and never returned raw to the browser.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAzureGuide((g) => !g)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {showAzureGuide ? 'Hide Field Guide' : 'Where do I find these?'}
              </button>
              <select
                aria-label="Provider type"
                value={newProvider}
                onChange={(e) => {
                  const val = e.target.value as 'azure_openai' | 'openai_compatible';
                  setNewProvider(val);
                  setConnName(val === 'azure_openai' ? 'Azure OpenAI' : 'OpenAI-Compatible LLM');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="azure_openai">Azure OpenAI Service</option>
                <option value="openai_compatible">OpenAI-Compatible API</option>
              </select>
            </div>
          </div>

          {newProvider === 'azure_openai' && showAzureGuide && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs text-slate-700 space-y-1.5">
              <p className="font-bold text-blue-950">Panduan Input Credential Azure OpenAI (Azure Portal / Azure AI Foundry):</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="font-semibold">Resource Endpoint URL</span>: Buka Azure Portal → Resource Azure OpenAI kamu → <span className="font-mono">Keys and Endpoint</span> → copy <span className="font-semibold">Endpoint</span> (format: <span className="font-mono">https://nama-resource.openai.azure.com</span>).
                </li>
                <li>
                  <span className="font-semibold">Deployment Name</span>: Buka Azure AI Foundry → <span className="font-mono">Deployments</span> → copy <span className="font-semibold">Name</span> deployment-nya (bukan nama base model kalau berbeda, misal <span className="font-mono">gpt-4o</span> atau <span className="font-mono">gpt-4o-mini</span>).
                </li>
                <li>
                  <span className="font-semibold">API Key</span>: Dari menu <span className="font-mono">Keys and Endpoint</span>, copy <span className="font-semibold">KEY 1</span> atau <span className="font-semibold">KEY 2</span>.
                </li>
                <li>
                  <span className="font-semibold">API Version</span>: Default <span className="font-mono">2024-10-21</span> (atau sesuaikan dengan Target URI di Azure AI Foundry, misal <span className="font-mono">2024-08-01-preview</span> / <span className="font-mono">2025-01-01-preview</span>).
                </li>
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="azure-conn-name" className="mb-1 block text-xs font-semibold text-slate-700">
                Connection Name *
              </label>
              <input
                id="azure-conn-name"
                required
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                placeholder="e.g. Azure OpenAI Production"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="azure-endpoint" className="mb-1 block text-xs font-semibold text-slate-700">
                {newProvider === 'azure_openai' ? 'Azure Resource Endpoint URL *' : 'Base URL *'}
              </label>
              <input
                id="azure-endpoint"
                required
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder={
                  newProvider === 'azure_openai'
                    ? 'https://my-resource.openai.azure.com'
                    : 'https://api.openai.com/v1'
                }
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="azure-deployment" className="mb-1 block text-xs font-semibold text-slate-700">
                {newProvider === 'azure_openai' ? 'Deployment Name (Chat Model) *' : 'Model Name *'}
              </label>
              <input
                id="azure-deployment"
                required
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder={newProvider === 'azure_openai' ? 'gpt-4o or gpt-4o-mini' : 'gpt-4o-mini'}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="azure-api-key" className="mb-1 block text-xs font-semibold text-slate-700">
                API Key *
              </label>
              <div className="relative">
                <input
                  id="azure-api-key"
                  type="password"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste KEY 1 from Azure Keys and Endpoint"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 pr-9 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
                <KeyRound className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
            </div>

            {newProvider === 'azure_openai' && (
              <div>
                <label htmlFor="azure-api-version" className="mb-1 block text-xs font-semibold text-slate-700">
                  API Version
                </label>
                <input
                  id="azure-api-version"
                  value={apiVersion}
                  onChange={(e) => setApiVersion(e.target.value)}
                  placeholder="2024-10-21"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label htmlFor="azure-embed-deployment" className="mb-1 block text-xs font-semibold text-slate-700">
                Embedding Deployment Name (Optional)
              </label>
              <input
                id="azure-embed-deployment"
                value={embeddingDeployment}
                onChange={(e) => setEmbeddingDeployment(e.target.value)}
                placeholder="e.g. text-embedding-3-small"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              {creating ? 'Testing & Saving...' : 'Save & Test Connection'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Server Gemini Key</span>
            <Sparkles className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">
            {platformKeyConfigured ? 'Configured (Active)' : 'Not Set'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Managed securely via server environment secrets.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Local Ollama</span>
            <Cpu className="h-4 w-4 text-slate-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">
            {ollamaDiscovery?.reachable
              ? `${ollamaDiscovery.models.length} Model(s) Installed`
              : 'Offline / Not Running'}
          </p>
          <p className="mt-1 truncate text-xs font-mono text-slate-500">
            {ollamaDiscovery?.endpoint || ollamaEndpoint}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Qdrant Vector DB</span>
            <Database className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">
            {qdrantHealth?.reachable ? 'Healthy' : 'SQLite FTS5 Fallback'}
          </p>
          <p className="mt-1 truncate text-xs font-mono text-slate-500">
            {qdrantHealth?.collection || 'kresna_knowledge'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">Ollama Model Discovery</h3>
          <div className="flex gap-2">
            <input
              aria-label="Ollama endpoint URL"
              value={ollamaEndpoint}
              onChange={(e) => setOllamaEndpoint(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              onClick={handleDiscoverOllama}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Installed Models
            </button>
          </div>
        </div>
        {ollamaDiscovery?.reachable && ollamaDiscovery.models.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ollamaDiscovery.models.map((m) => (
              <span
                key={m.name}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs text-slate-800"
              >
                {m.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {ollamaDiscovery?.error ||
              'No local Ollama models discovered. Connect Azure OpenAI above or configure server Gemini key.'}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {connections.map((conn) => {
          const isEditing = editingId === conn.id;
          const apiVer = conn.provider === 'azure_openai' ? parseApiVersion(conn.capabilities_json) : null;
          return (
            <div
              key={conn.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{conn.name}</h4>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                      {conn.provider}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                        conn.status === 'connected'
                          ? 'bg-emerald-50 text-emerald-700'
                          : conn.status === 'error'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {conn.status === 'connected' && <CheckCircle2 className="h-3 w-3" />}
                      {conn.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {conn.provider === 'azure_openai' ? 'Deployment' : 'Default model'}:{' '}
                    <span className="font-mono text-slate-800">{conn.default_model || 'None'}</span>
                    {conn.endpoint ? ` · ${conn.endpoint}` : ''}
                    {apiVer ? ` · api-version ${apiVer}` : ''}
                    {conn.key_hint ? ` · ${conn.key_hint}` : ''}
                  </p>
                  {conn.last_error && <p className="mt-1 text-xs text-red-600">{conn.last_error}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {conn.auth_mode !== 'platform_managed' && (
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingId(null) : startEdit(conn))}
                      aria-label={`Edit ${conn.name}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === conn.id}
                    onClick={() => handleTest(conn.id)}
                    className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === conn.id ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === conn.id}
                    onClick={() => handleApplyAll(conn.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Apply to All Chatbots
                  </button>
                  {conn.auth_mode === 'byok' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(conn)}
                      aria-label={`Delete ${conn.name}`}
                      className="rounded-xl border border-slate-200 p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
                  <input
                    aria-label="Edit endpoint"
                    value={editEndpoint}
                    onChange={(e) => setEditEndpoint(e.target.value)}
                    placeholder="Endpoint URL"
                    className="rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs"
                  />
                  <input
                    aria-label="Edit deployment or model"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="Deployment / Model"
                    className="rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs"
                  />
                  {conn.provider === 'azure_openai' && (
                    <input
                      aria-label="Edit API version"
                      value={editApiVersion}
                      onChange={(e) => setEditApiVersion(e.target.value)}
                      placeholder="API Version (2024-10-21)"
                      className="rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  )}
                  <input
                    aria-label="Rotate API key"
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder="New API Key (leave blank to keep)"
                    className="rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(conn.id)}
                    className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Save & Re-Test
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
