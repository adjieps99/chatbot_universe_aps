import crypto from 'node:crypto';
import type {
  GenericRestProviderConfig,
  NormalizedVehicle,
  VehicleFieldMapping,
  VehicleProviderType,
} from '../../shared/vehicle-types.ts';
import { decryptSecret, encryptSecret } from '../crypto.ts';
import { getDb } from '../db.ts';
import { assertSafeExternalUrl } from '../ssrf.ts';
import { GenericRestVehicleProvider } from './providers/generic-rest.ts';
import { SimulatorVehicleProvider } from './providers/simulator.ts';
import { SkywardLegacyVehicleProvider } from './providers/skyward-legacy.ts';
import { TraccarVehicleProvider } from './providers/traccar.ts';

export function isVehicleIntelligenceEnabled(): boolean {
  return process.env.VEHICLE_INTELLIGENCE_ENABLED !== 'false';
}

export function parseAccessConfig(jsonStr: string | null | undefined): {
  allowedFleetGroups: string[];
  staleThresholdMinutes: number;
} {
  try {
    const parsed = JSON.parse(jsonStr || '{}') as {
      allowedFleetGroups?: unknown;
      staleThresholdMinutes?: unknown;
    };
    const allowedFleetGroups = Array.isArray(parsed.allowedFleetGroups)
      ? parsed.allowedFleetGroups.map((g) => String(g).trim()).filter(Boolean)
      : [];
    const staleThresholdMinutes =
      typeof parsed.staleThresholdMinutes === 'number' && parsed.staleThresholdMinutes > 0
        ? parsed.staleThresholdMinutes
        : 60;
    return { allowedFleetGroups, staleThresholdMinutes };
  } catch {
    return { allowedFleetGroups: [], staleThresholdMinutes: 60 };
  }
}

export function sanitizeProviderRecordForClient(row: Record<string, unknown>) {
  let config: Record<string, unknown> = {};
  let fieldMapping: Record<string, unknown> = {};
  let accessConfig: Record<string, unknown> = {};
  try {
    config = JSON.parse(String(row.config_json || '{}'));
  } catch {
    config = {};
  }
  try {
    fieldMapping = JSON.parse(String(row.field_mapping_json || '{}'));
  } catch {
    fieldMapping = {};
  }
  try {
    accessConfig = JSON.parse(String(row.access_config_json || '{}'));
  } catch {
    accessConfig = {};
  }

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    chatbotId: (row.chatbot_id as string | null) ?? null,
    providerType: String(row.provider_type),
    name: String(row.name),
    baseUrl: String(row.base_url || ''),
    authType: String(row.auth_type || 'none'),
    hasCredentials: Boolean(row.encrypted_credentials),
    config,
    fieldMapping,
    accessConfig,
    syncIntervalSeconds: Number(row.sync_interval_seconds || 60),
    status: String(row.status || 'untested'),
    lastTestedAt: (row.last_tested_at as string | null) ?? null,
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    cachedVehicleCount: Number(row.cached_vehicle_count || 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function instantiateVehicleProvider(row: Record<string, unknown>): {
  listVehicles: (opts?: {
    allowedFleetGroups?: string[];
    staleThresholdMinutes?: number;
  }) => Promise<NormalizedVehicle[]>;
  getTripHistory?: (vehicle: NormalizedVehicle) => Promise<unknown[]>;
  getVehicleEvents?: (vehicle: NormalizedVehicle) => Promise<unknown[]>;
  getDeviceHealth?: (vehicle: NormalizedVehicle) => Promise<unknown>;
} {
  const providerType = String(row.provider_type || 'simulator') as VehicleProviderType;
  let config: Record<string, unknown> = {};
  let fieldMapping: VehicleFieldMapping = {};
  let credentials: Record<string, string> = {};

  try {
    config = JSON.parse(String(row.config_json || '{}'));
  } catch {
    config = {};
  }
  try {
    fieldMapping = JSON.parse(String(row.field_mapping_json || '{}'));
  } catch {
    fieldMapping = {};
  }
  if (row.encrypted_credentials) {
    try {
      credentials = JSON.parse(decryptSecret(String(row.encrypted_credentials)) || '{}');
    } catch {
      credentials = {};
    }
  }

  if (providerType === 'simulator') {
    return new SimulatorVehicleProvider({
      liveDrift: config.liveDrift !== false,
    });
  }

  if (providerType === 'traccar') {
    return new TraccarVehicleProvider({
      baseUrl: String(row.base_url || ''),
      authType: String(row.auth_type || 'basic'),
      credentials,
    });
  }

  if (providerType === 'skyward_legacy') {
    return new SkywardLegacyVehicleProvider({
      cosmosEndpoint: typeof config.cosmosEndpoint === 'string' ? config.cosmosEndpoint : undefined,
      tenantCode: typeof config.tenantCode === 'string' ? config.tenantCode : undefined,
    });
  }

  return new GenericRestVehicleProvider({
    config: {
      baseUrl: String(row.base_url || ''),
      authType: String(row.auth_type || 'none') as GenericRestProviderConfig['authType'],
      apiKeyHeader: typeof config.apiKeyHeader === 'string' ? config.apiKeyHeader : undefined,
      customHeaders:
        config.customHeaders && typeof config.customHeaders === 'object'
          ? (config.customHeaders as Record<string, string>)
          : undefined,
      oauthTokenUrl: typeof config.oauthTokenUrl === 'string' ? config.oauthTokenUrl : undefined,
      endpoints:
        config.endpoints && typeof config.endpoints === 'object'
          ? (config.endpoints as GenericRestProviderConfig['endpoints'])
          : undefined,
    },
    credentials,
    fieldMapping,
  });
}

export async function createOrUpdateVehicleProvider(params: {
  id?: string;
  workspaceId: string;
  chatbotId: string | null;
  providerType: VehicleProviderType;
  name: string;
  baseUrl: string;
  authType: string;
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
  fieldMapping?: Record<string, unknown>;
  accessConfig?: Record<string, unknown>;
  syncIntervalSeconds?: number;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const cleanUrl = params.baseUrl.trim();
  if (params.providerType !== 'simulator' && cleanUrl) {
    await assertSafeExternalUrl(cleanUrl);
  }

  const encryptedCreds =
    params.credentials && Object.keys(params.credentials).length > 0
      ? encryptSecret(JSON.stringify(params.credentials))
      : undefined;

  if (params.id) {
    const existing = db
      .prepare(`SELECT * FROM vehicle_providers WHERE id = ? AND workspace_id = ?`)
      .get(params.id, params.workspaceId) as Record<string, unknown> | undefined;
    if (!existing) throw new Error('Vehicle provider not found.');

    db.prepare(
      `UPDATE vehicle_providers
       SET chatbot_id = ?, provider_type = ?, name = ?, base_url = ?, auth_type = ?,
           encrypted_credentials = COALESCE(?, encrypted_credentials),
           config_json = COALESCE(?, config_json),
           field_mapping_json = COALESCE(?, field_mapping_json),
           access_config_json = COALESCE(?, access_config_json),
           sync_interval_seconds = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`
    ).run(
      params.chatbotId,
      params.providerType,
      params.name,
      cleanUrl,
      params.authType,
      encryptedCreds ?? null,
      params.config ? JSON.stringify(params.config) : null,
      params.fieldMapping ? JSON.stringify(params.fieldMapping) : null,
      params.accessConfig ? JSON.stringify(params.accessConfig) : null,
      params.syncIntervalSeconds ?? 60,
      now,
      params.id,
      params.workspaceId
    );
    const updated = db.prepare(`SELECT * FROM vehicle_providers WHERE id = ?`).get(params.id) as Record<
      string,
      unknown
    >;
    return sanitizeProviderRecordForClient(updated);
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO vehicle_providers
      (id, workspace_id, chatbot_id, provider_type, name, base_url, auth_type, encrypted_credentials, config_json, field_mapping_json, access_config_json, sync_interval_seconds, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.workspaceId,
    params.chatbotId,
    params.providerType,
    params.name,
    params.providerType === 'simulator' ? cleanUrl || 'simulator://local' : cleanUrl,
    params.authType,
    encryptedCreds ?? null,
    JSON.stringify(params.config || {}),
    JSON.stringify(params.fieldMapping || {}),
    JSON.stringify(params.accessConfig || { allowedFleetGroups: [], staleThresholdMinutes: 60 }),
    params.syncIntervalSeconds ?? 60,
    params.providerType === 'simulator' ? 'connected' : 'untested',
    now,
    now
  );

  const created = db.prepare(`SELECT * FROM vehicle_providers WHERE id = ?`).get(id) as Record<
    string,
    unknown
  >;
  return sanitizeProviderRecordForClient(created);
}

export async function syncVehicleProviderCache(workspaceId: string, providerId: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM vehicle_providers WHERE id = ? AND workspace_id = ?`)
    .get(providerId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Vehicle provider not found.');

  const start = Date.now();
  try {
    const access = parseAccessConfig(row.access_config_json as string);
    const instance = instantiateVehicleProvider(row);
    const vehicles = await instance.listVehicles(access);
    const now = new Date().toISOString();

    db.prepare(`DELETE FROM vehicle_cache WHERE provider_id = ? AND workspace_id = ?`).run(
      providerId,
      workspaceId
    );

    const insertStmt = db.prepare(
      `INSERT INTO vehicle_cache
        (id, workspace_id, provider_id, external_vehicle_id, plate_number, vehicle_name, fleet_group, status, speed_kmh, latitude, longitude, ignition, odometer_km, fuel_level_pct, last_update_at, raw_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const v of vehicles) {
      insertStmt.run(
        crypto.randomUUID(),
        workspaceId,
        providerId,
        v.id,
        v.plateNumber,
        v.name,
        v.fleetGroup,
        v.status,
        v.speedKmh,
        v.latitude,
        v.longitude,
        v.ignition === null ? null : v.ignition ? 1 : 0,
        v.odometerKm,
        v.fuelLevelPct,
        v.lastUpdateAt,
        JSON.stringify(v),
        now
      );
    }

    db.prepare(
      `UPDATE vehicle_providers
       SET status = 'connected', last_synced_at = ?, last_error = NULL, cached_vehicle_count = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, vehicles.length, now, providerId);

    return { ok: true, count: vehicles.length, latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Vehicle sync failed.';
    db.prepare(
      `UPDATE vehicle_providers SET status = 'error', last_error = ?, updated_at = ? WHERE id = ?`
    ).run(message, new Date().toISOString(), providerId);
    return { ok: false, count: 0, error: message, latencyMs: Date.now() - start };
  }
}

export async function testAndUpdateProviderConnection(workspaceId: string, providerId: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM vehicle_providers WHERE id = ? AND workspace_id = ?`)
    .get(providerId, workspaceId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Vehicle provider not found.');

  const start = Date.now();
  const now = new Date().toISOString();
  try {
    const access = parseAccessConfig(row.access_config_json as string);
    const instance = instantiateVehicleProvider(row);
    const vehicles = await instance.listVehicles(access);
    db.prepare(
      `UPDATE vehicle_providers
       SET status = 'connected', last_tested_at = ?, last_error = NULL, cached_vehicle_count = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, vehicles.length, now, providerId);
    return {
      ok: true,
      message: `Connected successfully. Retrieved ${vehicles.length} vehicle(s).`,
      vehicleCount: vehicles.length,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Provider connection failed.';
    db.prepare(
      `UPDATE vehicle_providers SET status = 'error', last_tested_at = ?, last_error = ?, updated_at = ? WHERE id = ?`
    ).run(now, msg, now, providerId);
    return {
      ok: false,
      message: msg,
      vehicleCount: 0,
      latencyMs: Date.now() - start,
    };
  }
}
