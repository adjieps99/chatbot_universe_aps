import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './crypto.ts';

let dbInstance: DatabaseSync | null = null;
let resolvedDbPath = '';

export function getDbPath(): string {
  if (resolvedDbPath) return resolvedDbPath;
  const configured = process.env.KRESNA_DB_PATH?.trim();
  resolvedDbPath = configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), 'data', 'kresna.db');
  return resolvedDbPath;
}

function initializeSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'starter',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_connections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      auth_mode TEXT NOT NULL,
      encrypted_api_key TEXT,
      key_hint TEXT,
      endpoint TEXT,
      default_model TEXT NOT NULL DEFAULT '',
      embedding_model TEXT NOT NULL DEFAULT '',
      capabilities_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'untested',
      last_tested_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chatbots (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      public_bot_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      purpose TEXT NOT NULL,
      preset TEXT NOT NULL,
      chatbot_type TEXT NOT NULL DEFAULT 'knowledge_faq',
      industry TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'English',
      style TEXT NOT NULL DEFAULT '',
      system_instructions TEXT NOT NULL DEFAULT '',
      welcome_message TEXT NOT NULL DEFAULT '',
      model_connection_id TEXT,
      model_id TEXT NOT NULL DEFAULT '',
      embedding_connection_id TEXT,
      embedding_model_id TEXT NOT NULL DEFAULT '',
      escalation_mode TEXT NOT NULL DEFAULT '',
      max_output_tokens INTEGER NOT NULL DEFAULT 1024,
      mode TEXT NOT NULL DEFAULT 'simple',
      status TEXT NOT NULL DEFAULT 'draft',
      widget_config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      file_name TEXT,
      mime_type TEXT,
      content TEXT NOT NULL,
      content_hash TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'indexed',
      error_message TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      knowledge_item_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      token_estimate INTEGER NOT NULL DEFAULT 0,
      embedding_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      workspace_id UNINDEXED,
      chatbot_id UNINDEXED,
      knowledge_item_id UNINDEXED,
      title,
      content
    );

    CREATE TABLE IF NOT EXISTS channel_configs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'configured',
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_connectors (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      url TEXT NOT NULL,
      headers_json TEXT NOT NULL DEFAULT '{}',
      query_params_json TEXT NOT NULL DEFAULT '{}',
      body_template_json TEXT NOT NULL DEFAULT '{}',
      auth_type TEXT NOT NULL DEFAULT 'none',
      encrypted_auth_config TEXT,
      input_schema_json TEXT NOT NULL DEFAULT '{}',
      requires_confirmation INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connector_execution_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      connector_id TEXT,
      chatbot_id TEXT,
      conversation_id TEXT,
      request_url TEXT,
      request_method TEXT,
      status_code INTEGER,
      ok INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      request_payload_json TEXT,
      response_excerpt TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT,
      conversation_id TEXT,
      subject TEXT NOT NULL,
      summary TEXT NOT NULL,
      requester_email TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      channel_type TEXT NOT NULL DEFAULT 'playground',
      external_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      title TEXT,
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      ui_components_json TEXT NOT NULL DEFAULT '[]',
      suggested_followups_json TEXT NOT NULL DEFAULT '[]',
      feedback TEXT,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_memory (
      conversation_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      facts_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_response TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_latency_ms INTEGER NOT NULL DEFAULT 0,
      total_response_ms INTEGER NOT NULL DEFAULT 0,
      iterations INTEGER NOT NULL DEFAULT 1,
      retrieval_count INTEGER NOT NULL DEFAULT 0,
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      unanswered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_providers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT,
      provider_type TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      auth_type TEXT NOT NULL DEFAULT 'none',
      encrypted_credentials TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      field_mapping_json TEXT NOT NULL DEFAULT '{}',
      access_config_json TEXT NOT NULL DEFAULT '{}',
      sync_interval_seconds INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'untested',
      last_tested_at TEXT,
      last_synced_at TEXT,
      last_error TEXT,
      cached_vehicle_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_cache (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      external_vehicle_id TEXT NOT NULL,
      plate_number TEXT,
      vehicle_name TEXT,
      fleet_group TEXT,
      status TEXT,
      speed_kmh REAL,
      latitude REAL,
      longitude REAL,
      ignition INTEGER,
      odometer_km REAL,
      fuel_level_pct REAL,
      last_update_at TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_tool_executions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chatbot_id TEXT NOT NULL,
      conversation_id TEXT,
      provider_id TEXT,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '{}',
      success INTEGER NOT NULL DEFAULT 1,
      capability_unavailable INTEGER NOT NULL DEFAULT 0,
      provider_latency_ms INTEGER NOT NULL DEFAULT 0,
      ui_component_types_json TEXT NOT NULL DEFAULT '[]',
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      suite TEXT NOT NULL DEFAULT 'contract',
      mode TEXT NOT NULL DEFAULT 'simulated',
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      results_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chatbots_workspace ON chatbots(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_items_bot ON knowledge_items(chatbot_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_bot ON knowledge_chunks(chatbot_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_bot ON conversations(chatbot_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_cache_provider ON vehicle_cache(provider_id);
  `);
}

export function createWorkspaceDefaults(
  db: DatabaseSync,
  params: { userId: string; workspaceName: string; plan?: string }
): { workspaceId: string } {
  const now = new Date().toISOString();
  const workspaceId = crypto.randomUUID();
  const slug =
    params.workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'workspace';

  db.prepare(
    `INSERT INTO workspaces (id, name, slug, plan, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(workspaceId, params.workspaceName, slug, params.plan || 'starter', now);

  db.prepare(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`
  ).run(crypto.randomUUID(), workspaceId, params.userId, now);

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const geminiConnId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO model_connections
      (id, workspace_id, name, provider, auth_mode, encrypted_api_key, key_hint, endpoint, default_model, embedding_model, capabilities_json, status, last_tested_at, last_error, created_at)
     VALUES (?, ?, 'Platform Gemini', 'gemini', 'platform_managed', NULL, 'Managed Server Key', NULL, 'gemini-4-hydrogen', 'gemini-embedding-2', '{}', ?, ?, NULL, ?)`
  ).run(
    geminiConnId,
    workspaceId,
    hasGeminiKey ? 'connected' : 'untested',
    hasGeminiKey ? now : null,
    now
  );

  const ollamaEndpoint = process.env.OLLAMA_BASE_URL?.trim() || 'http://ollama:11434';
  const ollamaConnId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO model_connections
      (id, workspace_id, name, provider, auth_mode, encrypted_api_key, key_hint, endpoint, default_model, embedding_model, capabilities_json, status, last_tested_at, last_error, created_at)
     VALUES (?, ?, 'Local Ollama', 'ollama', 'local', NULL, ?, ?, ?, ?, '{}', 'untested', NULL, NULL, ?)`
  ).run(
    ollamaConnId,
    workspaceId,
    ollamaEndpoint,
    ollamaEndpoint,
    process.env.OLLAMA_CHAT_MODEL?.trim() || '',
    process.env.OLLAMA_EMBED_MODEL?.trim() || 'nomic-embed-text',
    now
  );

  // Seed default Knowledge Assistant chatbot + Vehicle Intelligence chatbot for immediate exploration
  const defaultBotId = crypto.randomUUID();
  const preferredConnId = hasGeminiKey ? geminiConnId : ollamaConnId;
  const preferredModel = hasGeminiKey ? 'gemini-4-hydrogen' : process.env.OLLAMA_CHAT_MODEL?.trim() || '';

  db.prepare(
    `INSERT INTO chatbots
      (id, workspace_id, public_bot_id, name, purpose, preset, chatbot_type, industry, language, style, system_instructions, welcome_message, model_connection_id, model_id, embedding_connection_id, embedding_model_id, escalation_mode, max_output_tokens, mode, status, widget_config_json, created_at, updated_at)
     VALUES (?, ?, ?, 'KRESNA Support Concierge', 'Menjawab pertanyaan pelanggan & tim operasional dari knowledge base (logis.xlsx, SOP, FAQ) dan API connector secara ringkas dan bertahap.', 'customer_support', 'knowledge_faq', 'Logistik & Operasional', 'Indonesian', 'Hangat, empatik, ringkas, dan seperti CS profesional', '', 'Halo! Saya asisten Customer Support KRESNA. Ada kendala operasional (seperti UJP, POD, pairing, atau tracking) atau pertanyaan yang bisa saya bantu cek sekarang?', ?, ?, ?, 'gemini-embedding-2', 'Buatkan tiket support jika butuh eskalasi tim internal', 1024, 'simple', 'published', ?, ?, ?)`
  ).run(
    defaultBotId,
    workspaceId,
    `bot_${defaultBotId.slice(0, 12)}`,
    preferredConnId,
    preferredModel,
    preferredConnId,
    JSON.stringify({
      accentColor: '#1D4ED8',
      position: 'bottom-right',
      title: 'KRESNA Support Concierge',
      subtitle: 'Online · Customer Support KRESNA',
      allowedDomains: ['localhost', '127.0.0.1', '*'],
    }),
    now,
    now
  );

  db.prepare(
    `INSERT INTO channel_configs (id, workspace_id, chatbot_id, channel_type, status, config_json, updated_at)
     VALUES (?, ?, ?, 'website', 'configured', ?, ?)`
  ).run(
    crypto.randomUUID(),
    workspaceId,
    defaultBotId,
    JSON.stringify({ accentColor: '#1D4ED8', position: 'bottom-right', allowedDomains: ['*'] }),
    now
  );

  // Seed starter FAQ knowledge item
  const faqId = crypto.randomUUID();
  const faqContent =
    'KRESNA adalah platform AI Chatbot Universal yang mendukung basis pengetahuan hybrid RAG (XLSX, CSV, PDF, DOCX, TXT, HTML, dan URL web), model Gemini / Azure OpenAI / Ollama lokal, REST API connector aman SSRF, serta Vehicle Fleet Intelligence dengan peta GPS live.';
  db.prepare(
    `INSERT INTO knowledge_items
      (id, workspace_id, chatbot_id, title, source_type, content, content_hash, chunk_count, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, 'KRESNA Platform Overview', 'faq', ?, ?, 1, 'indexed', '{}', ?, ?)`
  ).run(
    faqId,
    workspaceId,
    defaultBotId,
    faqContent,
    crypto.createHash('sha256').update(faqContent).digest('hex'),
    now,
    now
  );
  const chunkId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO knowledge_chunks (id, workspace_id, chatbot_id, knowledge_item_id, chunk_index, content, metadata_json, token_estimate, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).run(
    chunkId,
    workspaceId,
    defaultBotId,
    faqId,
    faqContent,
    JSON.stringify({ title: 'KRESNA Platform Overview', sourceType: 'faq' }),
    Math.ceil(faqContent.length / 4),
    now
  );
  db.prepare(
    `INSERT INTO knowledge_chunks_fts (chunk_id, workspace_id, chatbot_id, knowledge_item_id, title, content)
     VALUES (?, ?, ?, ?, 'KRESNA Platform Overview', ?)`
  ).run(chunkId, workspaceId, defaultBotId, faqId, faqContent);

  // Seed Vehicle Intelligence bot + Built-in Demo Fleet Simulator if enabled
  if (process.env.VEHICLE_INTELLIGENCE_ENABLED !== 'false') {
    const fleetBotId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO chatbots
        (id, workspace_id, public_bot_id, name, purpose, preset, chatbot_type, industry, language, style, system_instructions, welcome_message, model_connection_id, model_id, embedding_connection_id, embedding_model_id, escalation_mode, max_output_tokens, mode, status, widget_config_json, created_at, updated_at)
       VALUES (?, ?, ?, 'Nusantara Fleet Copilot', 'Memantau posisi GPS armada komersial, jarak tempuh harian, alert kecepatan, dan unit silent secara natural.', 'fleet_intelligence', 'vehicle_intelligence', 'Logistik & Armada', 'Indonesian', 'Operasional, ramah, ringkas, dan berbasis data telemetri', '', 'Halo! Copilot Armada Nusantara siap membantu. Mau cek lokasi unit tertentu (misal B 9102 KRN), ringkasan armada aktif, riwayat trip, atau unit yang sedang silent?', ?, ?, ?, 'gemini-embedding-2', 'Laporkan secara jujur bila kapabilitas GPS tidak tersedia', 1024, 'simple', 'published', ?, ?, ?)`
    ).run(
      fleetBotId,
      workspaceId,
      `bot_${fleetBotId.slice(0, 12)}`,
      preferredConnId,
      preferredModel,
      preferredConnId,
      JSON.stringify({
        accentColor: '#0F766E',
        position: 'bottom-right',
        title: 'Nusantara Fleet Copilot',
        subtitle: 'Online · Telemetri Armada Live',
        allowedDomains: ['*'],
      }),
      now,
      now
    );

    db.prepare(
      `INSERT INTO channel_configs (id, workspace_id, chatbot_id, channel_type, status, config_json, updated_at)
       VALUES (?, ?, ?, 'website', 'configured', ?, ?)`
    ).run(
      crypto.randomUUID(),
      workspaceId,
      fleetBotId,
      JSON.stringify({ accentColor: '#0F766E', position: 'bottom-right', allowedDomains: ['*'] }),
      now
    );

    db.prepare(
      `INSERT INTO vehicle_providers
        (id, workspace_id, chatbot_id, provider_type, name, base_url, auth_type, encrypted_credentials, config_json, field_mapping_json, access_config_json, sync_interval_seconds, status, last_tested_at, last_synced_at, last_error, cached_vehicle_count, created_at, updated_at)
       VALUES (?, ?, ?, 'simulator', 'Nusantara Commercial Fleet Simulator (22 Units)', 'simulator://local', 'none', NULL, ?, '{}', ?, 30, 'connected', ?, ?, NULL, 22, ?, ?)`
    ).run(
      crypto.randomUUID(),
      workspaceId,
      fleetBotId,
      JSON.stringify({ liveDrift: true }),
      JSON.stringify({ allowedFleetGroups: [], staleThresholdMinutes: 60 }),
      now,
      now,
      now,
      now
    );
  }

  return { workspaceId };
}

function seedLocalAdminWorkspace(db: DatabaseSync) {
  const existingWs = db.prepare(`SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`).get() as
    | { id: string }
    | undefined;
  if (existingWs) return;

  const now = new Date().toISOString();
  const userId = 'local-admin-user';
  const existingUser = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
  if (!existingUser) {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, 'admin@kresna.local', 'Local Admin', ?, ?)`
    ).run(userId, hashPassword('kresna-local-admin'), now);
  }
  createWorkspaceDefaults(db, {
    userId,
    workspaceName: 'My Workspace',
    plan: 'self-hosted',
  });
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dbPath = getDbPath();
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    dbInstance = new DatabaseSync(dbPath);
  } catch (err) {
    console.warn('[KRESNA DB] Falling back to :memory: SQLite:', err);
    dbInstance = new DatabaseSync(':memory:');
  }
  initializeSchema(dbInstance);
  seedLocalAdminWorkspace(dbInstance);
  return dbInstance;
}

export function backupSqliteDatabase(): { path: string; name: string; sizeBytes: number } {
  const db = getDb();
  const backupsDir = path.resolve(process.cwd(), 'data', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `kresna-backup-${stamp}.db`;
  const target = path.join(backupsDir, name);
  const escaped = target.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  const sizeBytes = fs.existsSync(target) ? fs.statSync(target).size : 0;
  return { path: target, name, sizeBytes };
}
