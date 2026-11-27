export type ChatbotPresetKey =
  | 'customer_support'
  | 'knowledge_assistant'
  | 'fleet_intelligence'
  | 'sales_concierge'
  | 'internal_ops';

export interface ChatbotPresetDefinition {
  key: ChatbotPresetKey;
  label: string;
  description: string;
  defaultStyle: string;
  defaultEscalation: string;
  defaultWelcome: string;
  systemGuidance: string;
}

export const CHATBOT_PRESETS: ChatbotPresetDefinition[] = [
  {
    key: 'customer_support',
    label: 'Customer Support',
    description: 'Jawab FAQ & kendala operasional secara ringkas dengan empati dan follow-up bertahap.',
    defaultStyle: 'Hangat, empatik, ringkas, to-the-point, dan seperti CS profesional',
    defaultEscalation: 'Buatkan tiket support jika butuh pengecekan tim internal atau info belum tersedia',
    defaultWelcome:
      'Halo! Saya asisten Customer Support KRESNA. Ada kendala operasional (misalnya UJP, POD, pairing, atau tracking) atau pertanyaan yang bisa saya bantu cek sekarang?',
    systemGuidance:
      'Utamakan fakta terverifikasi dari knowledge base atau API connector. Sesuaikan panjang jawaban: jika QnA simpel langsung jawab singkat 1-3 kalimat; jika panjang atau banyak penyebab, ringkas poin utamanya dan ajukan 1 pertanyaan follow-up yang relevan.',
  },
  {
    key: 'knowledge_assistant',
    label: 'Knowledge Assistant',
    description: 'Cari jawaban akurat dari dokumen Excel, PDF, manual, dan website perusahaan.',
    defaultStyle: 'Jelas, terstruktur, ramah, dan selalu berdasar pada sumber dokumen',
    defaultEscalation: 'Sampaikan secara jujur jika informasi belum tersedia di knowledge base',
    defaultWelcome:
      'Halo! Silakan tanyakan apa saja seputar SOP, kebijakan, atau dokumen yang sudah Anda unggah.',
    systemGuidance:
      'Gunakan hanya fakta yang didukung oleh potongan dokumen terambil atau tool terhubung. Jangan mengarang angka atau aturan.',
  },
  {
    key: 'fleet_intelligence',
    label: 'Vehicle & Fleet Intelligence',
    description: 'Pantau posisi GPS kendaraan, jarak tempuh harian, riwayat perjalanan, dan unit silent.',
    defaultStyle: 'Operasional, jelas, ramah, berbasis data telemetri dengan peta & kartu armada',
    defaultEscalation: 'Jelaskan secara transparan bila metrik atau kapabilitas tidak didukung provider GPS',
    defaultWelcome:
      'Halo! Copilot Armada siap membantu. Mau cek lokasi kendaraan tertentu (misal B 9102 KRN), ringkasan armada aktif, riwayat trip, atau unit yang sedang silent?',
    systemGuidance:
      'Selalu panggil vehicle telemetry tools sebelum menjawab pertanyaan posisi atau status armada. Jangan pernah mengarang koordinat, plat nomor, atau kecepatan.',
  },
  {
    key: 'sales_concierge',
    label: 'Sales & Product Concierge',
    description: 'Pandu calon pelanggan memahami produk, harga, dan kebutuhan solusi secara konsultatif.',
    defaultStyle: 'Ramah, konsultatif, solutif, dan mudah dipahami',
    defaultEscalation: 'Catat kebutuhan dan kontak user ke tiket tindak lanjut tim sales',
    defaultWelcome:
      'Halo, selamat datang! Ceritakan kebutuhan Anda, saya bantu rekomendasikan solusi yang paling pas.',
    systemGuidance:
      'Soroti kapabilitas dan informasi harga yang terverifikasi dari knowledge source. Bantu arahkan ke langkah berikutnya dengan ramah.',
  },
  {
    key: 'internal_ops',
    label: 'Internal Operations Copilot',
    description: 'Bantu tim internal mengecek SOP LOGis, administrasi, dan API operasional.',
    defaultStyle: 'Lugas, praktis, suportif, dan langsung mengarah ke solusi',
    defaultEscalation: 'Laporkan kendala sistem atau kesenjangan SOP dengan jelas',
    defaultWelcome:
      'Halo tim! Ops Copilot siap bantu cek SOP, alur administrasi, atau data dari API operasional.',
    systemGuidance:
      'Gunakan knowledge retrieval dan API connector yang diizinkan untuk menyelesaikan kendala operasional secara bertahap dan efisien.',
  },
];

export function getPresetByKey(key: ChatbotPresetKey | string): ChatbotPresetDefinition {
  return CHATBOT_PRESETS.find((p) => p.key === key) ?? CHATBOT_PRESETS[0];
}

export interface ModelCatalogItem {
  id: string;
  label: string;
  tier: string;
  notes: string;
}

export const GEMINI_MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tier: 'Fast & Balanced',
    notes: 'Recommended default for conversational agents, tool use, and RAG synthesis.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    tier: 'Ultra Low Latency',
    notes: 'Fastest high-throughput responses for embedded widgets and simple Q&A.',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    tier: 'Complex Reasoning',
    notes: 'Advanced multi-step analysis, coding, and complex operational synthesis.',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    tier: 'Balanced Pro',
    notes: 'Strong reasoning with predictable latency.',
  },
  {
    id: 'gemini-embedding-2',
    label: 'Gemini Embedding 2',
    tier: 'Embeddings',
    notes: 'High-accuracy semantic vector embeddings for knowledge chunks.',
  },
];

export const SUGGESTED_OLLAMA_MODELS: ModelCatalogItem[] = [
  {
    id: 'llama3.1:8b',
    label: 'Llama 3.1 8B',
    tier: 'Local Chat',
    notes: 'Balanced open-weights model with tool-calling support.',
  },
  {
    id: 'qwen2.5:7b',
    label: 'Qwen 2.5 7B',
    tier: 'Local Chat',
    notes: 'Strong multilingual (including Indonesian & English) instruction following.',
  },
  {
    id: 'mistral:7b',
    label: 'Mistral 7B',
    tier: 'Local Chat',
    notes: 'Fast general-purpose local chat model.',
  },
  {
    id: 'nomic-embed-text',
    label: 'Nomic Embed Text',
    tier: 'Local Embeddings',
    notes: 'Recommended embedding model for Qdrant hybrid RAG.',
  },
];

export const KRESNA_ROADMAP = [
  {
    phase: 'Phase 1',
    title: 'Local-First Workspace & Hybrid Knowledge',
    status: 'active',
    items: ['SQLite + FTS5 persistence', 'XLSX/CSV/PDF/DOCX/URL ingestion', 'Embeddable Website Widget'],
  },
  {
    phase: 'Phase 2',
    title: 'Multi-Provider AI & Tool Execution',
    status: 'active',
    items: ['Server-side Gemini Gateway', 'Local Ollama auto-discovery', 'SSRF-hardened REST API Connectors'],
  },
  {
    phase: 'Phase 3',
    title: 'Vehicle & Fleet Intelligence',
    status: 'active',
    items: ['22-unit Fleet Simulator', 'Traccar & Generic REST + OpenAPI import', 'MapLibre GL live telemetry cards'],
  },
];

export interface PublishReadinessResult {
  ready: boolean;
  score: number;
  checks: Array<{ id: string; label: string; passed: boolean; hint: string }>;
}

export function evaluatePublishReadiness(params: {
  name: string;
  purpose: string;
  modelConnectionStatus: string;
  modelId: string;
  hasTestedConversation: boolean;
}): PublishReadinessResult {
  const checks = [
    {
      id: 'identity',
      label: 'Chatbot name & purpose defined',
      passed: params.name.trim().length >= 2 && params.purpose.trim().length >= 8,
      hint: 'Provide a clear chatbot name and operational purpose.',
    },
    {
      id: 'model',
      label: 'AI model selected',
      passed: Boolean(params.modelId.trim()),
      hint: 'Assign a Gemini, Ollama, or OpenAI-compatible model.',
    },
    {
      id: 'connection',
      label: 'Model connection verified',
      passed: params.modelConnectionStatus === 'connected' || Boolean(params.modelId.trim()),
      hint: 'Test the connection in AI Models.',
    },
    {
      id: 'playground',
      label: 'Tested in Playground',
      passed: params.hasTestedConversation,
      hint: 'Send at least one test message in the Playground before publishing.',
    },
  ];
  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  return {
    ready: checks.slice(0, 3).every((c) => c.passed),
    score,
    checks,
  };
}
