import { useState } from 'react';
import { Bot, Check, Cpu, FileSpreadsheet, FileText, Truck, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { CHATBOT_PRESETS, type ChatbotPresetKey } from '../shared/kresna-logic';
import type { ChatbotType } from '../shared/vehicle-types';
import type { ChatbotRecord, ModelConnection, PlatformMetadata } from '../types';

interface CreateChatbotModalProps {
  metadata: PlatformMetadata | null;
  connections: ModelConnection[];
  onClose: () => void;
  onCreated: (bot: ChatbotRecord) => void;
}

export function CreateChatbotModal({
  metadata,
  connections,
  onClose,
  onCreated,
}: CreateChatbotModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<'simple' | 'developer'>('simple');
  const [chatbotType, setChatbotType] = useState<ChatbotType>('knowledge_faq');
  const [preset, setPreset] = useState<ChatbotPresetKey>('customer_support');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [industry, setIndustry] = useState('');
  const [language, setLanguage] = useState('Indonesian');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [starterTitle, setStarterTitle] = useState('');
  const [starterContent, setStarterContent] = useState('');
  const [importSampleLogis, setImportSampleLogis] = useState(true);
  const [modelConnectionId, setModelConnectionId] = useState(
    connections.find((c) => c.status === 'connected')?.id || connections[0]?.id || ''
  );
  const selectedConn = connections.find((c) => c.id === modelConnectionId);
  const [modelId, setModelId] = useState(
    selectedConn?.default_model ||
      (selectedConn?.provider === 'gemini' ? 'gemini-4-hydrogen' : '')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handlePresetChange = (key: ChatbotPresetKey) => {
    setPreset(key);
    if (key === 'fleet_intelligence' && metadata?.vehicleIntelligenceEnabled) {
      setChatbotType('vehicle_intelligence');
      setMode('developer');
    }
  };

  const handleConnectionChange = (id: string) => {
    setModelConnectionId(id);
    const c = connections.find((x) => x.id === id);
    if (c) {
      setModelId(c.default_model || (c.provider === 'gemini' ? 'gemini-4-hydrogen' : ''));
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await apiFetch<{ chatbot: ChatbotRecord }>('/api/chatbots', {
        method: 'POST',
        body: JSON.stringify({
          name,
          purpose,
          preset,
          chatbotType,
          industry,
          language,
          mode,
          systemInstructions,
          modelConnectionId,
          modelId,
          importSampleLogis: chatbotType === 'knowledge_faq' && importSampleLogis,
          starterKnowledge:
            starterTitle.trim() && starterContent.trim()
              ? [{ title: starterTitle.trim(), content: starterContent.trim(), sourceType: 'faq' }]
              : [],
        }),
      });
      onCreated(res.chatbot);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create chatbot.');
    } finally {
      setSaving(false);
    }
  };

  const activeConn = connections.find((c) => c.id === modelConnectionId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Create New Chatbot</h2>
              <p className="text-xs text-slate-500">Step {step} of 3</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('simple')}
                className={`rounded-md px-2.5 py-1 font-semibold ${
                  mode === 'simple' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setMode('developer')}
                className={`rounded-md px-2.5 py-1 font-semibold ${
                  mode === 'developer' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Developer
              </button>
            </div>
            <button
              type="button"
              aria-label="Close create chatbot modal"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {metadata?.vehicleIntelligenceEnabled && (
                <div>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pilih Jenis Chatbot
                  </span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setChatbotType('knowledge_faq')}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        chatbotType === 'knowledge_faq'
                          ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Knowledge & Customer Service
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Asisten CS profesional berbasis dokumen (Excel, PDF, Web) & REST API dengan follow-up bertahap.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChatbotType('vehicle_intelligence');
                        setPreset('fleet_intelligence');
                      }}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        chatbotType === 'vehicle_intelligence'
                          ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                        <Truck className="h-4 w-4 text-teal-600" />
                        Vehicle & Fleet Intelligence
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Pantau posisi GPS armada, peta live, riwayat trip, jarak tempuh, dan deteksi unit silent.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="create-preset" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Template Kepribadian Asisten
                </label>
                <select
                  id="create-preset"
                  value={preset}
                  onChange={(e) => handlePresetChange(e.target.value as ChatbotPresetKey)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {CHATBOT_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} — {p.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-bot-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Nama Chatbot *
                  </label>
                  <input
                    id="create-bot-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: CS Operasional LOGis"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="create-bot-lang" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Bahasa Awal Percakapan
                  </label>
                  <select
                    id="create-bot-lang"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Indonesian">Bahasa Indonesia (Default)</option>
                    <option value="English">English</option>
                    <option value="Multilingual">Multilingual (Auto-detect)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="create-bot-purpose" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Tujuan & Tugas Utama Chatbot *
                </label>
                <textarea
                  id="create-bot-purpose"
                  rows={3}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Contoh: Membantu user menyelesaikan kendala UJP, POD, pairing unit, atau cek status order."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              {mode === 'developer' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="create-bot-industry" className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Industry (Optional)
                    </label>
                    <input
                      id="create-bot-industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g. Logistics, Fleet, E-Commerce"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="create-bot-sys" className="mb-1.5 block text-xs font-semibold text-slate-700">
                      System Instructions Override
                    </label>
                    <input
                      id="create-bot-sys"
                      value={systemInstructions}
                      onChange={(e) => setSystemInstructions(e.target.value)}
                      placeholder="Optional tone / domain rules..."
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {chatbotType === 'vehicle_intelligence' ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-xs text-teal-900 space-y-1.5">
                  <p className="font-bold">Vehicle Telemetry Data Source</p>
                  <p>
                    This agent automatically equips all 17 Vehicle Intelligence tools and links to your workspace Simulator (22 live demo units) or any Traccar, Generic REST, or Skyward Legacy provider configured in <span className="font-semibold">Vehicle Intelligence</span>.
                  </p>
                </div>
              ) : (
                <label className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importSampleLogis}
                    onChange={(e) => setImportSampleLogis(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                      Pre-load LOGis Operations & Admin QnA (logis.xlsx)
                    </div>
                    <p className="mt-0.5 text-slate-600">
                      Indexes all 5 sheets (Sales, Fleet, Driver, Operation, Administration) with CS progressive follow-up routing.
                    </p>
                  </div>
                </label>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Starter FAQ / SOP Note (Optional)</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Add an initial custom FAQ or policy right now. You can upload more XLSX, CSV, PDF, DOCX, or URLs anytime.
                </p>
              </div>
              <div>
                <label htmlFor="starter-title" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Starter Entry Title
                </label>
                <input
                  id="starter-title"
                  value={starterTitle}
                  onChange={(e) => setStarterTitle(e.target.value)}
                  placeholder="e.g. Shipping SLA & Cut-off Times"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="starter-content" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Knowledge Content
                </label>
                <textarea
                  id="starter-content"
                  rows={4}
                  value={starterContent}
                  onChange={(e) => setStarterContent(e.target.value)}
                  placeholder="Paste key facts, policies, or product specs..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="create-conn" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  AI Model Connection
                </label>
                <select
                  id="create-conn"
                  value={modelConnectionId}
                  onChange={(e) => handleConnectionChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.provider} · {c.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="create-model-id" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  {activeConn?.provider === 'azure_openai'
                    ? 'Azure Deployment Name'
                    : 'Model Identifier'}
                </label>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-slate-400" />
                  <input
                    id="create-model-id"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder={
                      activeConn?.provider === 'azure_openai'
                        ? 'e.g. gpt-4o or gpt-4o-mini'
                        : 'e.g. gemini-4-hydrogen or llama3.1:8b'
                    }
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {activeConn?.provider === 'azure_openai'
                    ? 'Using Azure OpenAI deployment from your connected subscription.'
                    : 'Supports connected Azure OpenAI deployments, Gemini models, or local Ollama models.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2))}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && (name.trim().length < 2 || purpose.trim().length < 8)}
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Creating...' : 'Create Chatbot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
