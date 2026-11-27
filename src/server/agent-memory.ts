import { getDb } from './db.ts';

export interface FactRecord {
  key: string;
  value: string;
  recordedAt: string;
  source?: string;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'proposed' | 'awaiting_confirmation' | 'executed' | 'failed';
  timestamp: string;
}

export interface ToolResultRecord {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
  executedAt: string;
}

export interface TaskRecord {
  id: string;
  objective: string;
  topic: string;
  missingFields?: string[];
  notes?: string;
  updatedAt: string;
}

export interface PendingConfirmation {
  toolName: string;
  arguments: Record<string, unknown>;
  summary: string;
  missingFields: string[];
  requestedAt: string;
}

/**
 * Structured, conversation-scoped memory. Facts reported by users are kept
 * separate from facts verified by an executed backend tool.
 */
export interface ConversationMemoryState {
  schemaVersion: 3;
  currentObjective: string;
  currentTopic: string;
  confirmedFacts: FactRecord[];
  userReportedFacts: FactRecord[];
  inferredContext: string[];
  extractedEntities: Record<string, string>;
  pendingQuestions: string[];
  previousToolCalls: ToolCallRecord[];
  actualToolResults: ToolResultRecord[];
  unresolvedTasks: TaskRecord[];
  pausedTasks: TaskRecord[];
  pendingConfirmation: PendingConfirmation | null;
  frustrationLevel: 'none' | 'mild' | 'high';
  /** Provider-specific continuity facts, e.g. lastVehiclePlate / lastCoordinates. */
  contextFacts: Record<string, unknown>;
  /** Compatibility fields consumed by the current conversation inspector UI. */
  summary: string;
  facts: Record<string, unknown>;
  updated_at: string;
}

export function createEmptyMemory(): ConversationMemoryState {
  return {
    schemaVersion: 3,
    currentObjective: '',
    currentTopic: '',
    confirmedFacts: [],
    userReportedFacts: [],
    inferredContext: [],
    extractedEntities: {},
    pendingQuestions: [],
    previousToolCalls: [],
    actualToolResults: [],
    unresolvedTasks: [],
    pausedTasks: [],
    pendingConfirmation: null,
    frustrationLevel: 'none',
    contextFacts: {},
    summary: '',
    facts: {},
    updated_at: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeMemory(parsed: Record<string, unknown>, summary: string, updatedAt: string): ConversationMemoryState {
  const base = createEmptyMemory();
  const candidate = isRecord(parsed.__agentMemoryV3)
    ? parsed.__agentMemoryV3
    : parsed;
  const contextFacts = isRecord(candidate.contextFacts)
    ? candidate.contextFacts
    : Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== '__agentMemoryV3'));

  const memory: ConversationMemoryState = {
    ...base,
    ...(candidate as Partial<ConversationMemoryState>),
    schemaVersion: 3,
    confirmedFacts: asArray<FactRecord>(candidate.confirmedFacts),
    userReportedFacts: asArray<FactRecord>(candidate.userReportedFacts),
    inferredContext: asArray<string>(candidate.inferredContext),
    extractedEntities: isRecord(candidate.extractedEntities)
      ? (candidate.extractedEntities as Record<string, string>)
      : {},
    pendingQuestions: asArray<string>(candidate.pendingQuestions),
    previousToolCalls: asArray<ToolCallRecord>(candidate.previousToolCalls),
    actualToolResults: asArray<ToolResultRecord>(candidate.actualToolResults),
    unresolvedTasks: asArray<TaskRecord>(candidate.unresolvedTasks),
    pausedTasks: asArray<TaskRecord>(candidate.pausedTasks),
    pendingConfirmation: isRecord(candidate.pendingConfirmation)
      ? (candidate.pendingConfirmation as unknown as PendingConfirmation)
      : null,
    frustrationLevel:
      candidate.frustrationLevel === 'mild' || candidate.frustrationLevel === 'high'
        ? candidate.frustrationLevel
        : 'none',
    contextFacts,
    summary: summary || String(candidate.summary || ''),
    facts: contextFacts,
    updated_at: updatedAt || new Date().toISOString(),
  };

  // Migrate the latest Phase-1 flat memory format without losing useful context.
  if (!memory.extractedEntities.vehicle_plate && typeof contextFacts.lastVehiclePlate === 'string') {
    memory.extractedEntities.vehicle_plate = contextFacts.lastVehiclePlate;
  }
  if (!memory.currentTopic && memory.summary) {
    memory.inferredContext = [...memory.inferredContext, memory.summary].slice(-10);
  }
  return memory;
}

export function loadConversationMemory(conversationId: string): ConversationMemoryState {
  const db = getDb();
  const row = db
    .prepare(`SELECT summary, facts_json, updated_at FROM conversation_memory WHERE conversation_id = ?`)
    .get(conversationId) as
    | { summary: string; facts_json: string; updated_at: string }
    | undefined;

  if (!row) return createEmptyMemory();
  try {
    const parsed = JSON.parse(row.facts_json || '{}') as Record<string, unknown>;
    return normalizeMemory(parsed, row.summary || '', row.updated_at || '');
  } catch {
    return normalizeMemory({}, row.summary || '', row.updated_at || '');
  }
}

function buildMemorySummary(memory: ConversationMemoryState): string {
  const parts: string[] = [];
  if (memory.currentObjective) parts.push(`Tujuan aktif: ${memory.currentObjective}`);
  if (memory.currentTopic) parts.push(`Topik: ${memory.currentTopic}`);
  if (memory.extractedEntities && Object.keys(memory.extractedEntities).length > 0) {
    parts.push(`Entitas: ${JSON.stringify(memory.extractedEntities)}`);
  }
  if (memory.pendingQuestions.length > 0) {
    parts.push(`Informasi yang masih ditunggu: ${memory.pendingQuestions.join('; ')}`);
  }
  if (memory.pendingConfirmation) {
    parts.push(`Menunggu konfirmasi: ${memory.pendingConfirmation.summary}`);
  }
  const latestResult = memory.actualToolResults.at(-1);
  if (latestResult) {
    parts.push(`Hasil tindakan terakhir (${latestResult.toolName}): ${latestResult.summary}`);
  }
  if (memory.inferredContext.length > 0) {
    parts.push(`Konteks tambahan: ${memory.inferredContext.slice(-3).join(' | ')}`);
  }
  return parts.join('\n').slice(0, 3000);
}

export function saveConversationMemory(params: {
  conversationId: string;
  workspaceId: string;
  chatbotId?: string;
  memory: ConversationMemoryState;
}): void {
  const db = getDb();
  const now = new Date().toISOString();
  params.memory.schemaVersion = 3;
  params.memory.updated_at = now;
  params.memory.summary = buildMemorySummary(params.memory);
  params.memory.facts = params.memory.contextFacts;
  const memory = { ...params.memory };
  // Keep contextFacts at the top level for compatibility with Phase-1 records.
  const factsPayload = {
    ...memory.contextFacts,
    __agentMemoryV3: memory,
  };
  db.prepare(
    `INSERT INTO conversation_memory (conversation_id, workspace_id, summary, facts_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       summary = excluded.summary,
       facts_json = excluded.facts_json,
       updated_at = excluded.updated_at`
  ).run(
    params.conversationId,
    params.workspaceId,
    memory.summary,
    JSON.stringify(factsPayload),
    now
  );
}

export interface MemoryPatchInput {
  currentObjective?: string;
  currentTopic?: string;
  userReportedFacts?: Array<{ key: string; value: string }>;
  inferredContext?: string[];
  extractedEntities?: Record<string, string>;
  pendingQuestions?: string[];
  pauseCurrentTask?: boolean;
  completeCurrentTask?: boolean;
  frustrationLevel?: 'none' | 'mild' | 'high';
}

export function applyMemoryPatch(
  current: ConversationMemoryState,
  patch: MemoryPatchInput | undefined
): ConversationMemoryState {
  if (!patch) return current;
  const now = new Date().toISOString();
  const next: ConversationMemoryState = {
    ...current,
    confirmedFacts: [...current.confirmedFacts],
    userReportedFacts: [...current.userReportedFacts],
    inferredContext: [...current.inferredContext],
    extractedEntities: { ...current.extractedEntities },
    pendingQuestions: [...current.pendingQuestions],
    previousToolCalls: [...current.previousToolCalls],
    actualToolResults: [...current.actualToolResults],
    unresolvedTasks: [...current.unresolvedTasks],
    pausedTasks: [...current.pausedTasks],
    contextFacts: { ...current.contextFacts },
    facts: { ...current.contextFacts },
  };

  if (
    patch.pauseCurrentTask &&
    current.currentObjective &&
    patch.currentObjective &&
    patch.currentObjective !== current.currentObjective
  ) {
    const alreadyPaused = next.pausedTasks.some((task) => task.objective === current.currentObjective);
    if (!alreadyPaused) {
      next.pausedTasks.push({
        id: `task_${cryptoSafeId()}`,
        objective: current.currentObjective,
        topic: current.currentTopic || 'previous_issue',
        notes: 'Paused because the user moved to a different topic.',
        updatedAt: now,
      });
    }
  }

  if (patch.completeCurrentTask === true) {
    next.currentObjective = '';
    next.currentTopic = '';
    next.pendingQuestions = [];
    next.unresolvedTasks = next.unresolvedTasks.filter((task) => task.objective !== current.currentObjective);
  } else {
    if (typeof patch.currentObjective === 'string' && patch.currentObjective.trim()) {
      next.currentObjective = patch.currentObjective.trim().slice(0, 500);
      next.pausedTasks = next.pausedTasks.filter((task) => task.objective !== next.currentObjective);
    }
    if (typeof patch.currentTopic === 'string' && patch.currentTopic.trim()) {
      next.currentTopic = patch.currentTopic.trim().slice(0, 240);
    }
  }

  if (Array.isArray(patch.userReportedFacts)) {
    for (const fact of patch.userReportedFacts.slice(0, 12)) {
      if (!fact?.key || !fact?.value) continue;
      const key = String(fact.key).trim().slice(0, 100);
      const value = String(fact.value).trim().slice(0, 1000);
      if (!key || !value) continue;
      const index = next.userReportedFacts.findIndex((item) => item.key === key);
      const record: FactRecord = { key, value, recordedAt: now, source: 'user_reported' };
      if (index >= 0) next.userReportedFacts[index] = record;
      else next.userReportedFacts.push(record);
    }
  }

  if (Array.isArray(patch.inferredContext)) {
    for (const item of patch.inferredContext.slice(0, 8)) {
      const clean = String(item || '').trim().slice(0, 500);
      if (clean && !next.inferredContext.includes(clean)) next.inferredContext.push(clean);
    }
    next.inferredContext = next.inferredContext.slice(-10);
  }

  if (patch.extractedEntities && isRecord(patch.extractedEntities)) {
    for (const [key, value] of Object.entries(patch.extractedEntities).slice(0, 20)) {
      const clean = String(value ?? '').trim().slice(0, 300);
      if (!key) continue;
      if (clean) next.extractedEntities[key.slice(0, 80)] = clean;
      else delete next.extractedEntities[key.slice(0, 80)];
    }
  }

  if (Array.isArray(patch.pendingQuestions)) {
    next.pendingQuestions = patch.pendingQuestions
      .map((question) => String(question || '').trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 5);
  }

  if (
    patch.frustrationLevel === 'none' ||
    patch.frustrationLevel === 'mild' ||
    patch.frustrationLevel === 'high'
  ) {
    next.frustrationLevel = patch.frustrationLevel;
  }

  next.updated_at = now;
  return next;
}

export function recordVerifiedFact(
  memory: ConversationMemoryState,
  key: string,
  value: string,
  source: string
): ConversationMemoryState {
  const now = new Date().toISOString();
  const next = { ...memory, confirmedFacts: [...memory.confirmedFacts] };
  const index = next.confirmedFacts.findIndex((fact) => fact.key === key);
  const record: FactRecord = { key, value: value.slice(0, 1200), source, recordedAt: now };
  if (index >= 0) next.confirmedFacts[index] = record;
  else next.confirmedFacts.push(record);
  next.confirmedFacts = next.confirmedFacts.slice(-20);
  return next;
}

/** Compatibility wrapper for the compact Phase-1 memory writer. */
export function updateConversationMemory(params: {
  conversationId: string;
  workspaceId: string;
  userMessage: string;
  assistantResponse: string;
  newFacts?: Record<string, unknown>;
}): void {
  const memory = loadConversationMemory(params.conversationId);
  memory.contextFacts = { ...memory.contextFacts, ...(params.newFacts || {}) };
  memory.facts = memory.contextFacts;
  memory.inferredContext = [
    ...memory.inferredContext,
    `User: ${params.userMessage.slice(0, 180)} | Assistant: ${params.assistantResponse.slice(0, 180)}`,
  ].slice(-10);
  saveConversationMemory({
    conversationId: params.conversationId,
    workspaceId: params.workspaceId,
    memory,
  });
}

function cryptoSafeId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}
