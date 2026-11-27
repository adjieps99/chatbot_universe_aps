import { useEffect, useState } from 'react';
import { Activity, MessageSquare, Truck } from 'lucide-react';
import { apiFetch } from '../lib/api';

export function AnalyticsView() {
  const [data, setData] = useState<{
    overview: Record<string, number | null>;
    vehicleIntelligence: Record<string, unknown>;
    recentExecutions: Array<Record<string, unknown>>;
  } | null>(null);
  const [conversations, setConversations] = useState<Array<Record<string, unknown>>>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<{
    conversation: Record<string, unknown>;
    messages: Array<Record<string, unknown>>;
  } | null>(null);

  const loadAll = async () => {
    const [ov, convs] = await Promise.all([
      apiFetch<{
        overview: Record<string, number | null>;
        vehicleIntelligence: Record<string, unknown>;
        recentExecutions: Array<Record<string, unknown>>;
      }>('/api/analytics/overview'),
      apiFetch<{ conversations: Array<Record<string, unknown>> }>('/api/conversations'),
    ]);
    setData(ov);
    setConversations(convs.conversations);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const ov = data?.overview || {};
  const vi = data?.vehicleIntelligence || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Analytics, Telemetry & Conversations</h1>
        <p className="text-sm text-slate-500">
          Monitor conversation volume, satisfaction, RAG/tool usage, latency, and vehicle queries.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Chatbots', val: ov.totalChatbots ?? 0 },
          { label: 'Conversations', val: ov.totalConversations ?? 0 },
          { label: 'Avg Latency', val: `${ov.avgLatencyMs ?? 0} ms` },
          {
            label: 'Satisfaction Rate',
            val: ov.satisfactionRate !== null && ov.satisfactionRate !== undefined ? `${ov.satisfactionRate}%` : '—',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase text-slate-500">{kpi.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{kpi.val}</div>
          </div>
        ))}
      </div>

      {Boolean(vi.enabled) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Truck className="h-4 w-4 text-teal-600" />
            Vehicle Intelligence Telemetry Metrics
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">Total Vehicle Queries</div>
              <div className="mt-1 text-lg font-bold">{String(vi.totalVehicleQueries ?? 0)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">Fleet Map Renders</div>
              <div className="mt-1 text-lg font-bold">{String(vi.mapRenderCount ?? 0)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">Analytics Queries</div>
              <div className="mt-1 text-lg font-bold">{String(vi.fleetAnalyticsUsage ?? 0)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-slate-500">Avg Provider Latency</div>
              <div className="mt-1 text-lg font-bold">{String(vi.avgProviderLatencyMs ?? 0)} ms</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Conversations ({conversations.length})</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={String(c.id)}
                onClick={async () => {
                  const res = await apiFetch<{
                    conversation: Record<string, unknown>;
                    messages: Array<Record<string, unknown>>;
                  }>(`/api/conversations/${String(c.id)}`);
                  setSelectedTranscript(res);
                }}
                className="w-full px-5 py-3.5 text-left hover:bg-slate-50"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">{String(c.chatbot_name)}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">{String(c.channel_type)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-600">
                  {String(c.last_message || c.title || 'Empty conversation')}
                </p>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500">No conversations recorded yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-3">
            <Activity className="h-4 w-4 text-blue-600" />
            {selectedTranscript ? 'Conversation Transcript' : 'Recent Execution Traces'}
          </div>
          {selectedTranscript ? (
            <div className="space-y-2.5 max-h-80 overflow-y-auto text-xs">
              {selectedTranscript.messages.map((m) => (
                <div
                  key={String(m.id)}
                  className={`rounded-xl p-3 ${
                    m.role === 'user' ? 'bg-blue-50 text-blue-950' : 'bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="font-bold uppercase text-[10px] opacity-60">{String(m.role)}</div>
                  <div className="mt-1 whitespace-pre-wrap">{String(m.content)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
              {(data?.recentExecutions || []).map((ex) => (
                <div key={String(ex.id)} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>{String(ex.chatbot_name)}</span>
                    <span className="font-mono">{String(ex.model)} · {String(ex.total_response_ms)}ms</span>
                  </div>
                  <p className="mt-1 truncate text-slate-600">{String(ex.user_message)}</p>
                </div>
              ))}
              {(data?.recentExecutions || []).length === 0 && (
                <p className="text-slate-500">Test a chatbot in the Playground to see execution traces.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
