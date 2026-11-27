import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Navigation,
  Play,
  Route,
  Send,
  Settings,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from 'lucide-react';
import { apiFetch, streamPlaygroundTurn } from '../lib/api';
import type {
  DeviceHealth,
  VehicleEvent,
  VehicleTrip,
} from '../shared/vehicle-types';
import type {
  ChatMessageItem,
  ChatbotRecord,
  ModelConnection,
  NormalizedVehicle,
  PlatformMetadata,
} from '../types';
import { VehicleMap } from './VehicleMap';

interface ChatbotDetailViewProps {
  chatbotId: string;
  metadata: PlatformMetadata | null;
  connections: ModelConnection[];
  onBack: () => void;
  onUpdated: () => void;
}

export function ChatbotDetailView({
  chatbotId,
  metadata,
  connections,
  onBack,
  onUpdated,
}: ChatbotDetailViewProps) {
  const [tab, setTab] = useState<'playground' | 'widget' | 'settings'>('playground');
  const [bot, setBot] = useState<ChatbotRecord | null>(null);
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    score: number;
    checks: Array<{ id: string; label: string; passed: boolean; hint: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Settings & Widget form state
  const [editName, setEditName] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editWelcome, setEditWelcome] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editConnId, setEditConnId] = useState('');
  const [editModelId, setEditModelId] = useState('');
  const [accentColor, setAccentColor] = useState('#1D4ED8');
  const [allowedDomains, setAllowedDomains] = useState('localhost, 127.0.0.1, *');
  const [saving, setSaving] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        chatbot: ChatbotRecord;
        readiness: {
          ready: boolean;
          score: number;
          checks: Array<{ id: string; label: string; passed: boolean; hint: string }>;
        };
      }>(`/api/chatbots/${encodeURIComponent(chatbotId)}`);
      const c = res.chatbot;
      setBot(c);
      setReadiness(res.readiness);
      setEditName(c.name);
      setEditPurpose(c.purpose);
      setEditWelcome(c.welcome_message);
      setEditInstructions(c.system_instructions || '');
      setEditConnId(c.model_connection_id || '');
      setEditModelId(c.model_id || '');
      try {
        const wCfg = JSON.parse(c.widget_config_json || '{}') as {
          accentColor?: string;
          allowedDomains?: string[];
        };
        if (wCfg.accentColor) setAccentColor(wCfg.accentColor);
        if (Array.isArray(wCfg.allowedDomains)) setAllowedDomains(wCfg.allowedDomains.join(', '));
      } catch {
        // ignore
      }
      setMessages((prev) =>
        prev.length > 0
          ? prev
          : c.welcome_message
            ? [{ id: 'welcome', role: 'assistant', content: c.welcome_message }]
            : []
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load chatbot.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMessages([]);
    setConversationId('');
    void loadDetail();
  }, [chatbotId]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending || !bot) return;
    if (!textOverride) setInput('');
    setError('');
    setSending(true);

    const userMsgId = `u_${Date.now()}`;
    const tempBotId = `a_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: tempBotId, role: 'assistant', content: '' },
    ]);

    try {
      let streamed = '';
      const payload = await streamPlaygroundTurn({
        chatbotId: bot.id,
        message: text,
        conversationId: conversationId || undefined,
        onToken: (tok) => {
          streamed += tok;
          setMessages((prev) =>
            prev.map((m) => (m.id === tempBotId ? { ...m, content: streamed } : m))
          );
        },
      });

      const convId = String(payload.conversationId || '');
      if (convId) setConversationId(convId);

      const am = (payload.assistantMessage || {}) as Record<string, unknown>;
      const trace = (payload.trace || {}) as Record<string, unknown>;
      const finalMsg: ChatMessageItem = {
        id: String(am.id || tempBotId),
        role: 'assistant',
        content: String(am.content || streamed),
        citations: (am.citations as ChatMessageItem['citations']) || [],
        toolCalls: (am.toolCalls as ChatMessageItem['toolCalls']) || [],
        uiComponents: (am.uiComponents as ChatMessageItem['uiComponents']) || [],
        suggestedFollowups: (am.suggestedFollowups as string[]) || [],
        latencyMs: Number(trace.totalResponseMs || am.latency_ms || 0),
      };

      setMessages((prev) => prev.map((m) => (m.id === tempBotId ? finalMsg : m)));
      void loadDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Playground failed.';
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempBotId ? { ...m, content: `Error: ${msg}` } : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleFeedback = async (messageId: string, feedback: 'up' | 'down') => {
    try {
      await apiFetch(`/api/messages/${encodeURIComponent(messageId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    } catch {
      // ignore feedback error on welcome bubble
    }
  };

  const handleSaveSettings = async () => {
    if (!bot) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/chatbots/${encodeURIComponent(bot.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          purpose: editPurpose,
          welcomeMessage: editWelcome,
          systemInstructions: editInstructions,
          modelConnectionId: editConnId,
          modelId: editModelId,
          widgetConfig: {
            accentColor,
            title: editName,
            allowedDomains: allowedDomains
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean),
          },
        }),
      });
      await loadDetail();
      onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    if (!bot) return;
    const nextStatus = bot.status === 'published' ? 'draft' : 'published';
    await apiFetch(`/api/chatbots/${encodeURIComponent(bot.id)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadDetail();
    onUpdated();
  };

  if (loading && !bot) {
    return <div className="p-8 text-sm text-slate-500">Loading chatbot workspace...</div>;
  }

  if (!bot) {
    return (
      <div className="p-8">
        <button onClick={onBack} className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to Chatbots
        </button>
        <p className="mt-4 text-sm text-red-600">{error || 'Chatbot not found.'}</p>
      </div>
    );
  }

  const embedCode = `<script src="${window.location.origin}/widget.js" data-bot-id="${bot.public_bot_id}"></script>`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back to chatbots"
            onClick={onBack}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-900">{bot.name}</h1>
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  bot.status === 'published'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {bot.status === 'published' ? 'Published' : 'Draft'}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {bot.chatbot_type === 'vehicle_intelligence' ? 'Vehicle Intelligence' : 'Knowledge & API'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Model: <span className="font-mono text-slate-700">{bot.model_id || 'Unassigned'}</span> · Bot ID:{' '}
              <span className="font-mono text-slate-700">{bot.public_bot_id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/widget-preview/${bot.public_bot_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Widget Preview
          </a>
          <button
            type="button"
            onClick={togglePublish}
            className={`rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${
              bot.status === 'published'
                ? 'bg-slate-700 hover:bg-slate-800'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {bot.status === 'published' ? 'Unpublish to Draft' : 'Publish Chatbot'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {[
          { id: 'playground', label: 'Agent Playground', icon: Play },
          { id: 'widget', label: 'Website Widget & Readiness', icon: Globe },
          { id: 'settings', label: 'Prompt & Model Settings', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                tab === item.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === 'playground' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 flex h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Asisten CS & Agent Live ({bot.language || 'Indonesian'})
              </div>
              <button
                type="button"
                onClick={() => {
                  setConversationId('');
                  setMessages(
                    bot.welcome_message
                      ? [{ id: 'welcome', role: 'assistant', content: bot.welcome_message }]
                      : []
                  );
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Percakapan Baru
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-800 shadow-2xs'
                    }`}
                  >
                    {msg.content || (sending ? 'Sedang memeriksa...' : '')}
                  </div>

                  {msg.uiComponents && msg.uiComponents.length > 0 && (
                    <div className="mt-2.5 w-full space-y-2.5">
                      {msg.uiComponents.map((comp, idx) => {
                        if (comp.type === 'VehicleMap') {
                          const vList = (comp.data.vehicles as NormalizedVehicle[]) || [];
                          return (
                            <div key={idx} className="space-y-1">
                              {comp.title && (
                                <p className="text-xs font-semibold text-slate-600">{comp.title}</p>
                              )}
                              <VehicleMap vehicles={vList} mapTileUrl={metadata?.mapTileUrl} />
                            </div>
                          );
                        }

                        if (comp.type === 'FleetTable') {
                          const vList = (comp.data.vehicles as NormalizedVehicle[]) || [];
                          return (
                            <div
                              key={idx}
                              className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
                            >
                              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                                <span>{comp.title || 'Fleet Vehicles'}</span>
                                <span className="text-[11px] font-normal text-slate-500">
                                  Click a plate to inspect
                                </span>
                              </div>
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-100 text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2">Plate</th>
                                    <th className="px-3 py-2">Unit</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Speed</th>
                                    <th className="px-3 py-2">Daily km</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {vList.map((v) => (
                                    <tr key={v.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 font-mono font-semibold">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void sendMessage(
                                              `Show details and trip history for ${v.plateNumber}`
                                            )
                                          }
                                          className="text-blue-700 hover:underline"
                                        >
                                          {v.plateNumber}
                                        </button>
                                      </td>
                                      <td className="px-3 py-2 text-slate-700">{v.name}</td>
                                      <td className="px-3 py-2">
                                        {v.status}
                                        {v.isSilent ? ' (silent)' : ''}
                                      </td>
                                      <td className="px-3 py-2">{v.speedKmh} km/h</td>
                                      <td className="px-3 py-2">
                                        {v.dailyMileageKm !== null ? `${v.dailyMileageKm} km` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        }

                        if (comp.type === 'VehicleCard') {
                          const v = comp.data.vehicle as NormalizedVehicle | undefined;
                          if (!v) return null;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900">
                                    {v.plateNumber} · {v.name}
                                  </span>
                                  {v.isSimulated && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                      Simulated
                                    </span>
                                  )}
                                  {v.isSilent && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                      Stale ({v.staleMinutes}m)
                                    </span>
                                  )}
                                </div>
                                <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                                  {v.status} · {v.speedKmh} km/h
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                                <div>Fleet: {v.fleetGroup}</div>
                                <div>Driver: {v.driverName || '—'}</div>
                                <div>Odometer: {v.odometerKm ?? '—'} km</div>
                                <div>Fuel: {v.fuelLevelPct ?? '—'}%</div>
                              </div>
                              {v.address && (
                                <p className="text-slate-500">Location: {v.address}</p>
                              )}
                            </div>
                          );
                        }

                        if (comp.type === 'AnalyticsSummary') {
                          return (
                            <div
                              key={idx}
                              className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-5 text-xs"
                            >
                              {Object.entries(comp.data)
                                .filter(([, val]) => typeof val === 'number')
                                .map(([k, val]) => (
                                  <div key={k} className="rounded-lg bg-slate-50 p-2">
                                    <div className="text-[11px] text-slate-500">{k}</div>
                                    <div className="text-sm font-bold text-slate-900">
                                      {String(val)}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          );
                        }

                        if (comp.type === 'TripHistoryTable') {
                          const trips = (comp.data.trips as VehicleTrip[]) || [];
                          return (
                            <div
                              key={idx}
                              className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
                            >
                              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                                <Route className="h-3.5 w-3.5 text-teal-600" />
                                {comp.title || 'Trip History'}
                              </div>
                              {trips.length === 0 ? (
                                <div className="p-3 text-xs text-slate-500">No trips recorded.</div>
                              ) : (
                                <table className="w-full text-left text-xs">
                                  <thead className="border-b border-slate-100 text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2">Origin → Destination</th>
                                      <th className="px-3 py-2">Distance</th>
                                      <th className="px-3 py-2">Duration</th>
                                      <th className="px-3 py-2">Max Speed</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {trips.map((t) => (
                                      <tr key={t.id}>
                                        <td className="px-3 py-2 text-slate-700">
                                          {t.startAddress} → {t.endAddress}
                                        </td>
                                        <td className="px-3 py-2 font-medium">{t.distanceKm} km</td>
                                        <td className="px-3 py-2">{t.durationMinutes} min</td>
                                        <td className="px-3 py-2">{t.maxSpeedKmh} km/h</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        }

                        if (comp.type === 'VehicleEventList') {
                          const events = (comp.data.events as VehicleEvent[]) || [];
                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-2"
                            >
                              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                {comp.title || 'Vehicle Events'}
                              </div>
                              {events.length === 0 ? (
                                <p className="text-slate-500">No recent alerts or events.</p>
                              ) : (
                                <div className="divide-y divide-slate-100">
                                  {events.map((ev) => (
                                    <div key={ev.id} className="py-1.5 flex items-start justify-between gap-2">
                                      <div>
                                        <span className="font-mono font-semibold text-slate-900">
                                          {ev.plateNumber}
                                        </span>{' '}
                                        — <span className="text-slate-700">{ev.message}</span>
                                      </div>
                                      <span
                                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                          ev.severity === 'critical'
                                            ? 'bg-red-50 text-red-700'
                                            : ev.severity === 'warning'
                                              ? 'bg-amber-50 text-amber-700'
                                              : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {ev.type}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (comp.type === 'DeviceHealthCard') {
                          const h = comp.data.health as DeviceHealth | undefined;
                          if (!h) return null;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
                                  <Activity className="h-3.5 w-3.5 text-teal-600" />
                                  {comp.title || `Device Health — ${h.plateNumber}`}
                                </span>
                                <span
                                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                                    h.transmitting
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-red-50 text-red-700'
                                  }`}
                                >
                                  {h.transmitting ? 'Transmitting' : `Silent (${h.staleMinutes}m)`}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                                <div>IMEI: {h.imei || '—'}</div>
                                <div>Battery: {h.batteryVoltage ?? '—'} V</div>
                                <div>Signal: {h.signalStrength || '—'}</div>
                                <div>Satellites: {h.satellites ?? '—'}</div>
                              </div>
                            </div>
                          );
                        }

                        if (comp.type === 'ETAResult') {
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-950"
                            >
                              <span className="inline-flex items-center gap-1.5 font-semibold">
                                <Navigation className="h-3.5 w-3.5 text-teal-700" />
                                {comp.title || 'Route ETA'}
                              </span>
                              <span className="font-mono font-bold">
                                {String(comp.data.distanceKm ?? '—')} km · ~{String(comp.data.etaMinutes ?? '—')} min
                              </span>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  )}

                  {msg.role === 'assistant' && msg.id !== 'welcome' && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      {msg.latencyMs ? <span>{msg.latencyMs} ms</span> : null}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-teal-700">
                          <Wrench className="h-3 w-3" />
                          {msg.toolCalls.map((t) => t.name).join(', ')}
                        </span>
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <span>
                          Sources: {msg.citations.map((c) => c.title).join(', ')}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Helpful response"
                          onClick={() => handleFeedback(msg.id, 'up')}
                          className={`rounded p-1 hover:bg-slate-200 ${
                            msg.feedback === 'up' ? 'text-emerald-600' : ''
                          }`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Unhelpful response"
                          onClick={() => handleFeedback(msg.id, 'down')}
                          className={`rounded p-1 hover:bg-slate-200 ${
                            msg.feedback === 'down' ? 'text-red-600' : ''
                          }`}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.suggestedFollowups && msg.suggestedFollowups.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.suggestedFollowups.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => sendMessage(q)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="flex gap-2 border-t border-slate-200 bg-white p-3.5"
            >
              <input
                aria-label="Chat message input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  bot.chatbot_type === 'vehicle_intelligence'
                    ? 'Tanya ringkasan armada, posisi B 9102 KRN, riwayat trip, atau unit silent...'
                    : 'Tulis pertanyaan atau kendala operasional Anda di sini...'
                }
                className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Kirim
              </button>
            </form>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-900">Contoh Pertanyaan Cepat</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Klik salah satu untuk mencoba respon CS & penelusuran data:
              </p>
              <div className="mt-3 space-y-2">
                {(bot.chatbot_type === 'vehicle_intelligence'
                  ? [
                      'Tampilkan ringkasan armada & peta live sekarang',
                      'Di mana posisi unit B 9102 KRN saat ini?',
                      'Cek riwayat perjalanan dan kesehatan GPS B 9102 KRN',
                      'Unit mana saja yang sedang silent / offline?',
                      'Kendaraan mana yang jarak tempuh hariannya paling tinggi?',
                    ]
                  : [
                      'UJP saya sudah diajukan tapi belum cair / masih pending',
                      'Kenapa nomor kontrak (Contract No.) kosong di LOGis?',
                      'Kenapa POD sudah di-approve tapi SO belum muncul?',
                      'Data OBD tracking tidak terupdate di monitoring',
                    ]
                ).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {readiness && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Publish Readiness</h3>
                  <span className="text-xs font-bold text-blue-600">{readiness.score}%</span>
                </div>
                <div className="mt-3 space-y-2">
                  {readiness.checks.map((ch) => (
                    <div key={ch.id} className="flex items-start gap-2 text-xs">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          ch.passed ? 'text-emerald-600' : 'text-slate-300'
                        }`}
                      />
                      <div>
                        <p className="font-medium text-slate-800">{ch.label}</p>
                        {!ch.passed && <p className="text-slate-500">{ch.hint}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'widget' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">Embeddable Website Snippet</h3>
            </div>
            <p className="text-xs text-slate-600">
              Paste this script before the closing <code className="rounded bg-slate-100 px-1">&lt;/body&gt;</code> tag on any website. The chatbot must be Published to respond publicly.
            </p>
            <div className="relative rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100">
              <pre className="overflow-x-auto whitespace-pre-wrap">{embedCode}</pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(embedCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied!' : 'Copy Snippet'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Widget Appearance & Domain Security</h3>
            <div>
              <label htmlFor="widget-accent" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="widget-accent"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                />
                <input
                  aria-label="Accent color hex"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>
            <div>
              <label htmlFor="widget-domains" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Allowed Host Domains (comma-separated, * allows all)
              </label>
              <input
                id="widget-domains"
                value={allowedDomains}
                onChange={(e) => setAllowedDomains(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {saving ? 'Saving...' : 'Save Widget Config'}
            </button>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 max-w-3xl">
          <h3 className="text-base font-bold text-slate-900">Agent Prompt & Model Routing</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-bot-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Name
              </label>
              <input
                id="edit-bot-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-bot-welcome" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Welcome Message
              </label>
              <input
                id="edit-bot-welcome"
                value={editWelcome}
                onChange={(e) => setEditWelcome(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="edit-bot-purpose" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Purpose
            </label>
            <textarea
              id="edit-bot-purpose"
              rows={2}
              value={editPurpose}
              onChange={(e) => setEditPurpose(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="edit-bot-instructions" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Custom System Instructions
            </label>
            <textarea
              id="edit-bot-instructions"
              rows={4}
              value={editInstructions}
              onChange={(e) => setEditInstructions(e.target.value)}
              placeholder="Optional extra rules, tone instructions, or domain constraints..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-bot-conn" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Model Connection
              </label>
              <select
                id="edit-bot-conn"
                value={editConnId}
                onChange={(e) => {
                  const id = e.target.value;
                  setEditConnId(id);
                  const found = connections.find((x) => x.id === id);
                  if (found?.default_model) setEditModelId(found.default_model);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.provider} · {c.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-bot-model" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Model / Deployment ID
              </label>
              <input
                id="edit-bot-model"
                value={editModelId}
                onChange={(e) => setEditModelId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
