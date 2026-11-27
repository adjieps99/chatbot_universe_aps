import type { ChatbotPresetKey } from './shared/kresna-logic';
import type { ChatbotType, NormalizedVehicle, UiComponentPayload } from './shared/vehicle-types';

export interface PlatformMetadata {
  localSingleUserMode: boolean;
  multiUserAuthEnabled: boolean;
  vehicleIntelligenceEnabled: boolean;
  chatbotTypes: Array<{
    id: ChatbotType;
    label: string;
    description: string;
    badge: string;
    capabilities: string[];
  }>;
  mapTileUrl: string;
  osrmConfigured: boolean;
  suggestedOllamaModels: Array<{ id: string; label: string; tier: string; notes: string }>;
  legacyGeminiCatalog: Array<{ id: string; label: string; tier: string; notes: string }>;
  platformKeyConfigured: boolean;
}

export interface SessionResponse {
  authenticated: boolean;
  localSingleUserMode: boolean;
  user?: { id: string; email: string; name: string };
  activeWorkspace?: { id: string; name: string; slug: string; plan: string; role: string };
  platformKeyConfigured?: boolean;
}

export interface ModelConnection {
  id: string;
  workspace_id: string;
  name: string;
  provider: string;
  auth_mode: string;
  key_hint: string | null;
  endpoint: string | null;
  default_model: string;
  embedding_model: string;
  capabilities_json?: string;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface OllamaDiscovery {
  reachable: boolean;
  endpoint: string;
  models: Array<{ name: string; size?: number }>;
  chatModels: string[];
  embeddingModels: string[];
  error?: string;
}

export interface ChatbotRecord {
  id: string;
  workspace_id: string;
  public_bot_id: string;
  name: string;
  purpose: string;
  preset: ChatbotPresetKey;
  chatbot_type: ChatbotType;
  industry: string;
  language: string;
  style: string;
  system_instructions: string;
  welcome_message: string;
  model_connection_id: string | null;
  model_id: string;
  embedding_model_id: string;
  escalation_mode: string;
  mode: string;
  status: 'draft' | 'published';
  widget_config_json: string;
  model_connection_name?: string;
  model_provider?: string;
  model_connection_status?: string;
  knowledge_count?: number;
  conversation_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeItem {
  id: string;
  chatbot_id: string;
  chatbot_name?: string;
  title: string;
  source_type: string;
  source_url: string | null;
  file_name: string | null;
  chunk_count: number;
  status: string;
  created_at: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ itemId: string; title: string; excerpt: string; score: number }>;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; ok: boolean }>;
  uiComponents?: UiComponentPayload[];
  suggestedFollowups?: string[];
  feedback?: 'up' | 'down' | null;
  latencyMs?: number;
}

export interface VehicleProviderClient {
  id: string;
  chatbotId: string | null;
  providerType: string;
  name: string;
  baseUrl: string;
  authType: string;
  hasCredentials: boolean;
  config: Record<string, unknown>;
  fieldMapping: Record<string, unknown>;
  accessConfig: { allowedFleetGroups?: string[]; staleThresholdMinutes?: number };
  syncIntervalSeconds: number;
  status: string;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  cachedVehicleCount: number;
}

export type { NormalizedVehicle, UiComponentPayload };
