import { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Bot,
  Cpu,
  ExternalLink,
  Menu,
  Plug,
  Plus,
  Settings,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { AnalyticsView } from './components/AnalyticsView';
import { ChatbotDetailView } from './components/ChatbotDetailView';
import { ConnectorsView } from './components/ConnectorsView';
import { CreateChatbotModal } from './components/CreateChatbotModal';
import { EvaluationsSettingsView } from './components/EvaluationsSettingsView';
import { KnowledgeView } from './components/KnowledgeView';
import { ModelsView } from './components/ModelsView';
import { VehicleProvidersView } from './components/VehicleProvidersView';
import { apiFetch } from './lib/api';
import type { ChatbotRecord, ModelConnection, PlatformMetadata, SessionResponse } from './types';

type NavSection =
  | 'chatbots'
  | 'knowledge'
  | 'models'
  | 'vehicles'
  | 'connectors'
  | 'analytics'
  | 'settings';

export function App() {
  const [section, setSection] = useState<NavSection>('chatbots');
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [metadata, setMetadata] = useState<PlatformMetadata | null>(null);
  const [chatbots, setChatbots] = useState<ChatbotRecord[]>([]);
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspace = async () => {
    try {
      const [sess, meta, bots, mods] = await Promise.all([
        apiFetch<SessionResponse>('/api/auth/session'),
        apiFetch<PlatformMetadata>('/api/platform/metadata'),
        apiFetch<{ chatbots: ChatbotRecord[] }>('/api/chatbots'),
        apiFetch<{ connections: ModelConnection[] }>('/api/models'),
      ]);
      setSession(sess);
      setMetadata(meta);
      setChatbots(bots.chatbots);
      setConnections(mods.connections);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const navItems: Array<{ id: NavSection; label: string; icon: typeof Bot; hidden?: boolean }> = [
    { id: 'chatbots', label: 'My Chatbots', icon: Bot },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'models', label: 'AI Models', icon: Cpu },
    {
      id: 'vehicles',
      label: 'Vehicle Intelligence',
      icon: Truck,
      hidden: metadata ? !metadata.vehicleIntelligenceEnabled : false,
    },
    { id: 'connectors', label: 'API Connectors', icon: Plug },
    { id: 'analytics', label: 'Analytics & Logs', icon: BarChart3 },
    { id: 'settings', label: 'Evals & Backups', icon: Settings },
  ];

  const handleNavClick = (id: NavSection) => {
    setSection(id);
    if (id !== 'chatbots') setSelectedBotId(null);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-display font-extrabold text-sm">
            K
          </div>
          <span className="font-display text-sm font-extrabold tracking-tight text-slate-900">
            KRESNA
          </span>
        </div>
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      <aside
        className={`${
          mobileMenuOpen ? 'flex' : 'hidden'
        } md:flex w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-white flex-col justify-between`}
      >
        <div>
          <div className="hidden md:flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-display font-extrabold text-base">
              K
            </div>
            <div>
              <div className="font-display text-sm font-extrabold tracking-tight text-slate-900">
                KRESNA
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                Universal AI Platform
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {navItems
              .filter((item) => !item.hidden)
              .map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
          </nav>
        </div>

        <div className="border-t border-slate-100 p-4 text-xs">
          <div className="font-semibold text-slate-800">
            {session?.activeWorkspace?.name || 'My Workspace'}
          </div>
          <div className="mt-0.5 text-slate-500">
            {session?.user?.name || 'Local Admin'} ·{' '}
            {session?.localSingleUserMode ? 'Local Mode' : 'Multi-User'}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading KRESNA workspace...
            </div>
          ) : section === 'chatbots' && selectedBotId ? (
            <ChatbotDetailView
              chatbotId={selectedBotId}
              metadata={metadata}
              connections={connections}
              onBack={() => setSelectedBotId(null)}
              onUpdated={() => void loadWorkspace()}
            />
          ) : section === 'chatbots' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">My Chatbots</h1>
                  <p className="text-sm text-slate-500">
                    Build, test, and deploy grounded Knowledge Agents and Vehicle Fleet Copilots.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Chatbot
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {chatbots.map((bot) => (
                  <div
                    key={bot.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                              bot.chatbot_type === 'vehicle_intelligence'
                                ? 'bg-teal-50 text-teal-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {bot.chatbot_type === 'vehicle_intelligence' ? (
                              <Truck className="h-5 w-5" />
                            ) : (
                              <Bot className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900">{bot.name}</h3>
                            <span className="text-xs font-mono text-slate-500">
                              {bot.model_id || 'No model selected'}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            bot.status === 'published'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {bot.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600 line-clamp-2">{bot.purpose}</p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>{bot.knowledge_count ?? 0} sources</span>
                        <span>{bot.conversation_count ?? 0} chats</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/widget-preview/${bot.public_bot_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          title="Open Widget Preview"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/chatbots/${bot.id}`, { method: 'DELETE' });
                            await loadWorkspace();
                          }}
                          className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50"
                          title="Delete Chatbot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedBotId(bot.id)}
                          className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Open Playground
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : section === 'knowledge' ? (
            <KnowledgeView chatbots={chatbots} />
          ) : section === 'models' ? (
            <ModelsView onConnectionsChanged={() => void loadWorkspace()} />
          ) : section === 'vehicles' ? (
            <VehicleProvidersView chatbots={chatbots} metadata={metadata} />
          ) : section === 'connectors' ? (
            <ConnectorsView chatbots={chatbots} />
          ) : section === 'analytics' ? (
            <AnalyticsView />
          ) : (
            <EvaluationsSettingsView />
          )}
        </div>
      </main>

      {showCreateModal && (
        <CreateChatbotModal
          metadata={metadata}
          connections={connections}
          onClose={() => setShowCreateModal(false)}
          onCreated={(bot) => {
            setShowCreateModal(false);
            void loadWorkspace();
            setSelectedBotId(bot.id);
          }}
        />
      )}
    </div>
  );
}

export default App;
