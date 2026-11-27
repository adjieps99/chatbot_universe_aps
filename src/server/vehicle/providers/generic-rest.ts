import type {
  GenericRestProviderConfig,
  NormalizedVehicle,
  VehicleFieldMapping,
} from '../../../shared/vehicle-types.ts';
import { assertSafeExternalUrl } from '../../ssrf.ts';

function getByDotPath(obj: unknown, dotPath?: string): unknown {
  if (!obj || !dotPath) return undefined;
  const parts = dotPath.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function extractArray(data: unknown, preferredPath?: string): Record<string, unknown>[] {
  if (preferredPath) {
    const picked = getByDotPath(data, preferredPath);
    if (Array.isArray(picked)) return picked as Record<string, unknown>[];
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    for (const k of ['data', 'vehicles', 'items', 'results', 'units', 'devices', 'rows']) {
      if (Array.isArray(rec[k])) return rec[k] as Record<string, unknown>[];
    }
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function normalizeStatus(raw: unknown, speed: number, ignition: boolean | null, isSilent: boolean): NormalizedVehicle['status'] {
  if (isSilent) return 'offline';
  const s = String(raw || '').toLowerCase();
  if (s.includes('alert') || s.includes('alarm')) return 'alert';
  if (s.includes('offline')) return 'offline';
  if (speed > 3 || s.includes('mov') || s.includes('driv') || s.includes('run')) return 'moving';
  if (ignition === true || s.includes('idle')) return 'idle';
  return 'parked';
}

export class GenericRestVehicleProvider {
  private config: GenericRestProviderConfig;
  private credentials: Record<string, string>;
  private fieldMapping: VehicleFieldMapping;

  constructor(params: {
    config: GenericRestProviderConfig;
    credentials?: Record<string, string>;
    fieldMapping?: VehicleFieldMapping;
  }) {
    this.config = params.config;
    this.credentials = params.credentials || {};
    this.fieldMapping = params.fieldMapping || {};
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(this.config.customHeaders || {}),
    };

    if (this.config.authType === 'bearer' && this.credentials.token) {
      headers.Authorization = `Bearer ${this.credentials.token}`;
    } else if (this.config.authType === 'api_key' && this.credentials.apiKey) {
      headers[this.config.apiKeyHeader || 'X-API-Key'] = this.credentials.apiKey;
    } else if (this.config.authType === 'basic' && this.credentials.username) {
      const encoded = Buffer.from(
        `${this.credentials.username}:${this.credentials.password || ''}`
      ).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    } else if (
      this.config.authType === 'oauth2_client_credentials' &&
      this.config.oauthTokenUrl &&
      this.credentials.clientId
    ) {
      await assertSafeExternalUrl(this.config.oauthTokenUrl);
      const tokenRes = await fetch(this.config.oauthTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret || '',
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs || 10000),
      });
      if (tokenRes.ok) {
        const json = (await tokenRes.json()) as { access_token?: string };
        if (json.access_token) {
          headers.Authorization = `Bearer ${json.access_token}`;
        }
      }
    }

    return headers;
  }

  async executeEndpoint(params: {
    path: string;
    method?: 'GET' | 'POST';
    queryParams?: Record<string, string>;
    bodyTemplate?: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    statusCode: number;
    data: unknown;
    rawText: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    const base = this.config.baseUrl.trim().replace(/\/+$/, '');
    const epPath = params.path.startsWith('/') ? params.path : `/${params.path}`;
    const fullUrl = new URL(`${base}${epPath}`);
    await assertSafeExternalUrl(fullUrl.toString());

    if (params.queryParams) {
      for (const [k, v] of Object.entries(params.queryParams)) {
        fullUrl.searchParams.set(k, v);
      }
    }

    const headers = await this.buildHeaders();
    const method = params.method || 'GET';
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(fullUrl.toString(), {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(params.bodyTemplate || {}) : undefined,
      signal: AbortSignal.timeout(this.config.timeoutMs || 10000),
    });

    const rawText = await res.text();
    let data: unknown = rawText;
    try {
      data = JSON.parse(rawText);
    } catch {
      // keep rawText
    }

    return {
      ok: res.ok,
      statusCode: res.status,
      data,
      rawText,
      latencyMs: Date.now() - start,
    };
  }

  async listVehicles(opts?: {
    allowedFleetGroups?: string[];
    staleThresholdMinutes?: number;
  }): Promise<NormalizedVehicle[]> {
    const ep = this.config.endpoints?.listVehicles || { path: '/vehicles', method: 'GET' };
    const res = await this.executeEndpoint({
      path: ep.path,
      method: ep.method || 'GET',
      queryParams: ep.queryParams,
      bodyTemplate: ep.bodyTemplate,
    });
    if (!res.ok) {
      throw new Error(`Vehicle API HTTP ${res.statusCode}: ${res.rawText.slice(0, 160)}`);
    }

    const rows = extractArray(res.data, ep.responseArrayPath);
    const staleLimit = opts?.staleThresholdMinutes ?? 60;
    const nowMs = Date.now();
    const fm = this.fieldMapping;

    const vehicles = rows.map((row, idx): NormalizedVehicle => {
      const id = String(
        getByDotPath(row, fm.id) ?? row.id ?? row.vehicleId ?? row.deviceId ?? `unit_${idx + 1}`
      );
      const plateNumber = String(
        getByDotPath(row, fm.plateNumber) ?? row.plateNumber ?? row.plate ?? row.nopol ?? id
      );
      const name = String(
        getByDotPath(row, fm.name) ?? row.name ?? row.vehicleName ?? plateNumber
      );
      const fleetGroup = String(
        getByDotPath(row, fm.fleetGroup) ?? row.fleetGroup ?? row.group ?? 'Default Fleet'
      );
      const speedRaw = Number(getByDotPath(row, fm.speedKmh) ?? row.speedKmh ?? row.speed ?? 0);
      const speedKmh = Number.isFinite(speedRaw) ? Number(speedRaw.toFixed(1)) : 0;
      const latRaw = getByDotPath(row, fm.latitude) ?? row.latitude ?? row.lat;
      const lngRaw = getByDotPath(row, fm.longitude) ?? row.longitude ?? row.lng ?? row.lon;
      const latitude = latRaw !== undefined && latRaw !== null ? Number(latRaw) : null;
      const longitude = lngRaw !== undefined && lngRaw !== null ? Number(lngRaw) : null;
      const ignRaw = getByDotPath(row, fm.ignition) ?? row.ignition ?? row.acc;
      const ignition =
        ignRaw === undefined || ignRaw === null ? null : Boolean(ignRaw === true || ignRaw === 1 || ignRaw === 'on');
      const odoRaw = getByDotPath(row, fm.odometerKm) ?? row.odometerKm ?? row.odometer;
      const dailyRaw = getByDotPath(row, fm.dailyMileageKm) ?? row.dailyMileageKm ?? row.dailyMileage;
      const maxSpdRaw = getByDotPath(row, fm.maxSpeedKmh) ?? row.maxSpeedKmh ?? row.maxSpeed;
      const fuelRaw = getByDotPath(row, fm.fuelLevelPct) ?? row.fuelLevelPct ?? row.fuel;
      const lastUpdateStr = String(
        getByDotPath(row, fm.lastUpdateAt) ?? row.lastUpdateAt ?? row.updatedAt ?? new Date().toISOString()
      );
      const updateMs = Date.parse(lastUpdateStr);
      const staleMinutes = Number.isFinite(updateMs)
        ? Math.max(0, Math.round((nowMs - updateMs) / 60000))
        : 0;
      const isSilent = staleMinutes >= staleLimit;

      return {
        id,
        plateNumber,
        name,
        fleetGroup,
        vehicleType: String(getByDotPath(row, fm.vehicleType) ?? row.vehicleType ?? 'Commercial'),
        driverName: String(getByDotPath(row, fm.driverName) ?? row.driverName ?? '') || undefined,
        address: String(getByDotPath(row, fm.address) ?? row.address ?? '') || undefined,
        status: normalizeStatus(
          getByDotPath(row, fm.status) ?? row.status,
          speedKmh,
          ignition,
          isSilent
        ),
        speedKmh,
        latitude: latitude !== null && Number.isFinite(latitude) ? latitude : null,
        longitude: longitude !== null && Number.isFinite(longitude) ? longitude : null,
        ignition,
        odometerKm: odoRaw !== undefined && odoRaw !== null && Number.isFinite(Number(odoRaw)) ? Number(odoRaw) : null,
        dailyMileageKm:
          dailyRaw !== undefined && dailyRaw !== null && Number.isFinite(Number(dailyRaw)) ? Number(dailyRaw) : null,
        maxSpeedKmh:
          maxSpdRaw !== undefined && maxSpdRaw !== null && Number.isFinite(Number(maxSpdRaw)) ? Number(maxSpdRaw) : null,
        fuelLevelPct:
          fuelRaw !== undefined && fuelRaw !== null && Number.isFinite(Number(fuelRaw)) ? Number(fuelRaw) : null,
        lastUpdateAt: lastUpdateStr,
        staleMinutes,
        isSilent,
      };
    });

    if (opts?.allowedFleetGroups && opts.allowedFleetGroups.length > 0) {
      const allowed = new Set(opts.allowedFleetGroups.map((g) => g.toLowerCase()));
      return vehicles.filter((v) => allowed.has(v.fleetGroup.toLowerCase()));
    }
    return vehicles;
  }
}

export function parseOpenApiVehicleSpec(spec: unknown): {
  baseUrl: string;
  endpoints: Array<{ path: string; method: string; summary?: string }>;
  suggestedEndpoint?: string;
} {
  let obj = spec;
  if (typeof spec === 'string') {
    obj = JSON.parse(spec);
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('OpenAPI spec must be a valid JSON object.');
  }
  const doc = obj as Record<string, unknown>;
  let baseUrl = '';
  if (Array.isArray(doc.servers) && doc.servers[0] && typeof doc.servers[0] === 'object') {
    baseUrl = String((doc.servers[0] as Record<string, unknown>).url || '');
  } else if (typeof doc.host === 'string') {
    const scheme = Array.isArray(doc.schemes) && doc.schemes[0] ? String(doc.schemes[0]) : 'https';
    baseUrl = `${scheme}://${doc.host}${typeof doc.basePath === 'string' ? doc.basePath : ''}`;
  }

  const paths = (doc.paths && typeof doc.paths === 'object' ? doc.paths : {}) as Record<
    string,
    Record<string, { summary?: string }>
  >;
  const endpoints: Array<{ path: string; method: string; summary?: string }> = [];
  for (const [epPath, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const [m, info] of Object.entries(methods)) {
      const upper = m.toUpperCase();
      if (['GET', 'POST'].includes(upper)) {
        endpoints.push({
          path: epPath,
          method: upper,
          summary: info?.summary,
        });
      }
    }
  }

  const suggested = endpoints.find((e) =>
    /vehicle|fleet|device|unit|position|track/i.test(`${e.path} ${e.summary || ''}`)
  );

  return {
    baseUrl,
    endpoints: endpoints.slice(0, 40),
    suggestedEndpoint: suggested?.path || endpoints[0]?.path,
  };
}
