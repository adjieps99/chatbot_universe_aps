import { useEffect, useState } from 'react';
import { Eye, FileCode2, Plus, RefreshCw, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ChatbotRecord, NormalizedVehicle, PlatformMetadata, VehicleProviderClient } from '../types';
import { VehicleMap } from './VehicleMap';

interface VehicleProvidersViewProps {
  chatbots: ChatbotRecord[];
  metadata: PlatformMetadata | null;
}

export function VehicleProvidersView({ chatbots, metadata }: VehicleProvidersViewProps) {
  const [providers, setProviders] = useState<VehicleProviderClient[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<NormalizedVehicle[]>([]);
  const [activeProviderName, setActiveProviderName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<
    'simulator' | 'traccar' | 'generic_rest' | 'skyward_legacy'
  >('generic_rest');
  const [chatbotId, setChatbotId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState('bearer');
  const [token, setToken] = useState('');
  const [endpointPath, setEndpointPath] = useState('/vehicles');
  const [allowedGroupsInput, setAllowedGroupsInput] = useState('');
  const [staleThresholdMinutes, setStaleThresholdMinutes] = useState(60);
  const [fieldMapping, setFieldMapping] = useState<Record<string, unknown>>({});
  const [previewSample, setPreviewSample] = useState<string>('');
  const [openApiText, setOpenApiText] = useState('');
  const [showOpenApi, setShowOpenApi] = useState(false);
  const [openApiEndpoints, setOpenApiEndpoints] = useState<
    Array<{ path: string; method: string; summary?: string }>
  >([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadProviders = async () => {
    const res = await apiFetch<{ providers: VehicleProviderClient[] }>('/api/vehicle/providers');
    setProviders(res.providers);
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  const handleImportOpenApi = async () => {
    setErr('');
    setMsg('');
    try {
      const res = await apiFetch<{
        baseUrl: string;
        endpoints: Array<{ path: string; method: string; summary?: string }>;
        suggestedEndpoint?: string;
      }>('/api/vehicle/providers/import-openapi', {
        method: 'POST',
        body: JSON.stringify({ spec: openApiText }),
      });
      if (res.baseUrl) setBaseUrl(res.baseUrl);
      if (res.suggestedEndpoint) setEndpointPath(res.suggestedEndpoint);
      setOpenApiEndpoints(res.endpoints);
      setMsg(`Imported OpenAPI spec: ${res.endpoints.length} endpoint(s) parsed.`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'OpenAPI import failed.');
    }
  };

  const handlePreviewEndpoint = async () => {
    setErr('');
    try {
      const res = await apiFetch<{
        rawSample: unknown;
        suggestion: { mapping: Record<string, unknown> };
      }>('/api/vehicle/providers/preview-endpoint', {
        method: 'POST',
        body: JSON.stringify({
          baseUrl,
          path: endpointPath,
          authType,
          credentials: token ? { token, apiKey: token } : {},
        }),
      });
      setPreviewSample(JSON.stringify(res.rawSample, null, 2));
      setFieldMapping(res.suggestion.mapping || {});
      setMsg('Endpoint previewed and field mapping auto-suggested.');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Endpoint preview failed.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const allowedFleetGroups = allowedGroupsInput
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      await apiFetch('/api/vehicle/providers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          providerType,
          chatbotId: chatbotId || null,
          baseUrl: providerType === 'simulator' ? 'simulator://local' : baseUrl,
          authType: providerType === 'simulator' ? 'none' : authType,
          credentials: token ? { token, apiKey: token } : undefined,
          config:
            providerType === 'generic_rest'
              ? { baseUrl, authType, endpoints: { listVehicles: { path: endpointPath, method: 'GET' } } }
              : {},
          fieldMapping,
          accessConfig: {
            allowedFleetGroups,
            staleThresholdMinutes: Number(staleThresholdMinutes) || 60,
          },
        }),
      });
      setShowCreate(false);
      setName('');
      setBaseUrl('');
      setToken('');
      setAllowedGroupsInput('');
      setMsg('Vehicle provider saved.');
      await loadProviders();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create provider.');
    }
  };

  const handleTestProvider = async (p: VehicleProviderClient) => {
    setErr('');
    setMsg('');
    try {
      const res = await apiFetch<{ result: { ok: boolean; message: string } }>(
        `/api/vehicle/providers/${p.id}/test`,
        { method: 'POST' }
      );
      setMsg(res.result.message);
      await loadProviders();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Provider test failed.');
      await loadProviders();
    }
  };

  const viewVehicles = async (p: VehicleProviderClient) => {
    setErr('');
    try {
      const res = await apiFetch<{ vehicles: NormalizedVehicle[] }>(
        `/api/vehicle/providers/${p.id}/vehicles`
      );
      setSelectedVehicles(res.vehicles);
      setActiveProviderName(p.name);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to fetch vehicles.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Vehicle Intelligence & GPS Providers</h1>
          <p className="text-sm text-slate-500">
            Connect live fleet telemetry (Simulator, Traccar, Generic REST + OpenAPI, or Skyward Legacy adapter).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Vehicle Provider
        </button>
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {err}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tambah Provider Telemetri Kendaraan</h3>
              <p className="text-xs text-slate-500">Pilih tipe sumber data atau klik preset cepat di bawah:</p>
            </div>
            {providerType === 'generic_rest' && (
              <button
                type="button"
                onClick={() => setShowOpenApi((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {showOpenApi ? 'Tutup Importer OpenAPI' : 'Import OpenAPI / Swagger JSON'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setProviderType('simulator');
                setName('Demo Simulator Armada (22 Unit)');
                setBaseUrl('simulator://local');
                setAuthType('none');
              }}
              className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              Preset: Demo Simulator (Tanpa Key)
            </button>
            <button
              type="button"
              onClick={() => {
                setProviderType('traccar');
                setName('Traccar GPS Server');
                setBaseUrl('https://demo.traccar.org');
                setAuthType('basic');
                setEndpointPath('/api/devices');
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Preset: Traccar GPS Server
            </button>
            <button
              type="button"
              onClick={() => {
                setProviderType('generic_rest');
                setName('Fleet REST API Kustom');
                setBaseUrl('https://api.fleet-anda.com');
                setAuthType('bearer');
                setEndpointPath('/v1/vehicles');
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Preset: Generic REST API
            </button>
          </div>

          {showOpenApi && providerType === 'generic_rest' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <label htmlFor="openapi-spec-json" className="block text-xs font-semibold text-slate-700">
                Paste OpenAPI 3.x / Swagger 2.0 JSON
              </label>
              <textarea
                id="openapi-spec-json"
                rows={4}
                value={openApiText}
                onChange={(e) => setOpenApiText(e.target.value)}
                placeholder='{"openapi":"3.0.0","servers":[{"url":"https://gps.example.com"}],"paths":{"/vehicles":{"get":{"summary":"List vehicles"}}}}'
                className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleImportOpenApi}
                  className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Parse OpenAPI Endpoints
                </button>
                {openApiEndpoints.length > 0 && (
                  <select
                    aria-label="Select endpoint from OpenAPI"
                    value={endpointPath}
                    onChange={(e) => setEndpointPath(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs"
                  >
                    {openApiEndpoints.map((ep) => (
                      <option key={`${ep.method}:${ep.path}`} value={ep.path}>
                        {ep.method} {ep.path} {ep.summary ? `— ${ep.summary}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input
              aria-label="Provider name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama Provider"
              className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
            <select
              aria-label="Provider type"
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as typeof providerType)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
            >
              <option value="generic_rest">Generic REST Fleet API</option>
              <option value="traccar">Traccar Server</option>
              <option value="simulator">Built-in Fleet Simulator (22 Units)</option>
              <option value="skyward_legacy">Skyward Legacy Adapter (Extension Point)</option>
            </select>
            <select
              aria-label="Assign provider to chatbot"
              value={chatbotId}
              onChange={(e) => setChatbotId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
            >
              <option value="">Workspace-wide (Any Fleet Bot)</option>
              {chatbots.map((b) => (
                <option key={b.id} value={b.id}>
                  Assign to: {b.name}
                </option>
              ))}
            </select>
          </div>

          {providerType === 'skyward_legacy' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <span className="font-bold">Skyward Legacy Adapter Extension Point:</span> Keeps the private Cosmos DB / SQL Server / HERE Maps adapter boundary clean. Private enterprise driver credentials are not bundled in the open-source core.
            </div>
          )}

          {providerType !== 'simulator' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <input
                aria-label="Provider base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://gps.company.com"
                className="sm:col-span-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
              <input
                aria-label="Vehicle list endpoint path"
                value={endpointPath}
                onChange={(e) => setEndpointPath(e.target.value)}
                placeholder="/api/vehicles"
                className="rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm"
              />
              <select
                aria-label="Provider auth type"
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key Header</option>
                <option value="basic">Basic Auth</option>
              </select>
              {authType !== 'none' && (
                <input
                  aria-label="Provider credential token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Bearer Token / API Key"
                  className="sm:col-span-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              )}
              {providerType === 'generic_rest' && (
                <button
                  type="button"
                  onClick={handlePreviewEndpoint}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Preview & Auto-Map Fields
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="allowed-fleet-groups" className="mb-1 block text-xs font-semibold text-slate-700">
                Allowed Fleet Groups Scope (optional, comma-separated)
              </label>
              <input
                id="allowed-fleet-groups"
                value={allowedGroupsInput}
                onChange={(e) => setAllowedGroupsInput(e.target.value)}
                placeholder="e.g. Jakarta Cold-Chain, Surabaya Express"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="stale-threshold" className="mb-1 block text-xs font-semibold text-slate-700">
                Silent-Unit Stale Threshold (minutes)
              </label>
              <input
                id="stale-threshold"
                type="number"
                min={5}
                value={staleThresholdMinutes}
                onChange={(e) => setStaleThresholdMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs"
              />
            </div>
          </div>

          {previewSample && (
            <pre className="max-h-40 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-100">
              {previewSample}
            </pre>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Save Provider
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{p.name}</h4>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px]">
                    {p.providerType}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      p.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {p.status} · {p.cachedVehicleCount} units
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-mono text-slate-500">{p.baseUrl}</p>
                {p.lastError && <p className="mt-1 text-xs text-red-600">{p.lastError}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleTestProvider(p)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Test
              </button>
              <button
                type="button"
                onClick={() => viewVehicles(p)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-3.5 w-3.5" />
                Live Map & Fleet
              </button>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/vehicle/providers/${p.id}/sync`, { method: 'POST' });
                  await loadProviders();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync
              </button>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                onClick={async () => {
                  await apiFetch(`/api/vehicle/providers/${p.id}`, { method: 'DELETE' });
                  await loadProviders();
                }}
                className="rounded-xl border border-slate-200 p-2 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedVehicles.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {activeProviderName} — {selectedVehicles.length} Live Units
            </h3>
            <button
              type="button"
              onClick={() => setSelectedVehicles([])}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Close Viewer
            </button>
          </div>
          <VehicleMap vehicles={selectedVehicles} mapTileUrl={metadata?.mapTileUrl} heightClass="h-80" />
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">Plate</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Fleet Group</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Speed</th>
                  <th className="px-3 py-2">Daily km</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedVehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900">{v.plateNumber}</td>
                    <td className="px-3 py-2">{v.name}</td>
                    <td className="px-3 py-2 text-slate-600">{v.fleetGroup}</td>
                    <td className="px-3 py-2">{v.status}</td>
                    <td className="px-3 py-2">{v.speedKmh} km/h</td>
                    <td className="px-3 py-2">{v.dailyMileageKm ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{v.address || `${v.latitude}, ${v.longitude}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
