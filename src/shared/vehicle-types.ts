export type ChatbotType = 'knowledge_faq' | 'vehicle_intelligence';

export type VehicleProviderType = 'simulator' | 'traccar' | 'generic_rest' | 'skyward_legacy';

export interface ChatbotTypeInfo {
  id: ChatbotType;
  label: string;
  description: string;
  badge: string;
  capabilities: string[];
}

export const CHATBOT_TYPE_CATALOG: ChatbotTypeInfo[] = [
  {
    id: 'knowledge_faq',
    label: 'Knowledge & API Agent',
    description:
      'Customer-service-grade grounded Q&A over spreadsheets, PDFs, docs, web pages, and REST API connectors.',
    badge: 'Universal',
    capabilities: ['Hybrid RAG Citations', 'Progressive CS Follow-ups', 'REST Connectors', 'Website Widget'],
  },
  {
    id: 'vehicle_intelligence',
    label: 'Vehicle & Fleet Intelligence',
    description:
      'Real-time GPS telemetry, live fleet maps, trip history, events, device health, mileage analytics, and silent-unit alerts.',
    badge: 'Fleet GPS',
    capabilities: ['Live Fleet Map', 'Traccar & Generic REST', 'Trips & Events', 'Proximity Search'],
  },
];

export const FUTURE_CHATBOT_DOMAINS = [
  { id: 'warehouse_wms', label: 'Warehouse & Inventory (WMS)', status: 'planned' },
  { id: 'field_service', label: 'Field Service Dispatch', status: 'planned' },
  { id: 'cold_chain', label: 'Cold-Chain Sensor Telemetry', status: 'planned' },
  { id: 'financial_ops', label: 'Financial Operations Intelligence', status: 'planned' },
];

export interface GenericRestEndpointSpec {
  path: string;
  method?: 'GET' | 'POST';
  queryParams?: Record<string, string>;
  bodyTemplate?: Record<string, unknown>;
  responseArrayPath?: string;
}

export interface GenericRestProviderConfig {
  baseUrl: string;
  authType: 'none' | 'bearer' | 'api_key' | 'basic' | 'oauth2_client_credentials';
  apiKeyHeader?: string;
  customHeaders?: Record<string, string>;
  oauthTokenUrl?: string;
  timeoutMs?: number;
  endpoints?: {
    listVehicles?: GenericRestEndpointSpec;
    vehicleDetail?: GenericRestEndpointSpec;
    vehiclePosition?: GenericRestEndpointSpec;
    dailyMileage?: GenericRestEndpointSpec;
  };
}

export interface VehicleFieldMapping {
  id?: string;
  plateNumber?: string;
  name?: string;
  fleetGroup?: string;
  status?: string;
  speedKmh?: string;
  latitude?: string;
  longitude?: string;
  ignition?: string;
  odometerKm?: string;
  fuelLevelPct?: string;
  lastUpdateAt?: string;
  driverName?: string;
  address?: string;
  dailyMileageKm?: string;
  maxSpeedKmh?: string;
  headingDeg?: string;
  vehicleType?: string;
}

export interface NormalizedVehicle {
  id: string;
  plateNumber: string;
  name: string;
  fleetGroup: string;
  vehicleType: string;
  driverName?: string;
  address?: string;
  status: 'moving' | 'idle' | 'parked' | 'offline' | 'alert';
  speedKmh: number;
  headingDeg?: number;
  latitude: number | null;
  longitude: number | null;
  ignition: boolean | null;
  odometerKm: number | null;
  dailyMileageKm: number | null;
  maxSpeedKmh: number | null;
  fuelLevelPct: number | null;
  lastUpdateAt: string;
  staleMinutes: number;
  isSilent: boolean;
  providerName?: string;
  isSimulated?: boolean;
  availableCapabilities?: string[];
}

export interface VehicleTrip {
  id: string;
  vehicleId: string;
  plateNumber: string;
  startTime: string;
  endTime: string;
  startAddress: string;
  endAddress: string;
  distanceKm: number;
  durationMinutes: number;
  maxSpeedKmh: number;
  averageSpeedKmh: number;
}

export interface VehicleEvent {
  id: string;
  vehicleId: string;
  plateNumber: string;
  type: 'overspeed' | 'geofence_enter' | 'geofence_exit' | 'ignition_on' | 'ignition_off' | 'idle_alert' | 'device_offline';
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  message: string;
  speedKmh?: number;
  address?: string;
}

export interface DeviceHealth {
  vehicleId: string;
  plateNumber: string;
  imei?: string;
  transmitting: boolean;
  lastHeartbeatAt: string;
  staleMinutes: number;
  batteryVoltage?: number | null;
  signalStrength?: string;
  satellites?: number | null;
}

export interface UiComponentPayload {
  type:
    | 'VehicleMap'
    | 'VehicleCard'
    | 'FleetTable'
    | 'AnalyticsSummary'
    | 'TripHistoryTable'
    | 'VehicleEventList'
    | 'DeviceHealthCard'
    | 'ETAResult';
  title?: string;
  data: Record<string, unknown>;
}

function flattenKeys(obj: unknown, prefix = '', depth = 0): Array<{ path: string; value: unknown }> {
  if (!obj || typeof obj !== 'object' || depth > 3) return [];
  if (Array.isArray(obj)) {
    return obj.length > 0 ? flattenKeys(obj[0], prefix, depth + 1) : [];
  }
  const out: Array<{ path: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextPath = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v, nextPath, depth + 1));
    } else {
      out.push({ path: nextPath, value: v });
    }
  }
  return out;
}

function pickFirstArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    for (const key of ['data', 'vehicles', 'items', 'results', 'units', 'devices', 'rows']) {
      if (Array.isArray(rec[key])) return rec[key] as unknown[];
    }
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) return v;
    }
  }
  return data && typeof data === 'object' ? [data] : [];
}

export function suggestVehicleFieldMapping(sampleData: unknown): {
  sampleRecord: Record<string, unknown> | null;
  mapping: VehicleFieldMapping;
  detectedFields: string[];
} {
  const arr = pickFirstArray(sampleData);
  const first =
    arr.length > 0 && arr[0] && typeof arr[0] === 'object'
      ? (arr[0] as Record<string, unknown>)
      : null;

  if (!first) {
    return { sampleRecord: null, mapping: {}, detectedFields: [] };
  }

  const entries = flattenKeys(first);
  const findMatch = (patterns: RegExp[]): string | undefined => {
    for (const pat of patterns) {
      const hit = entries.find((e) => pat.test(e.path));
      if (hit) return hit.path;
    }
    return undefined;
  };

  const mapping: VehicleFieldMapping = {
    id: findMatch([/^id$/i, /vehicle.?id/i, /device.?id/i, /unit.?id/i, /imei/i]),
    plateNumber: findMatch([/plate/i, /nopol/i, /license/i, /reg/i, /registration/i]),
    name: findMatch([/^name$/i, /vehicle.?name/i, /label/i, /title/i, /alias/i]),
    fleetGroup: findMatch([/group/i, /fleet/i, /depot/i, /branch/i, /region/i]),
    status: findMatch([/status/i, /state/i, /motion/i]),
    speedKmh: findMatch([/speed/i, /velocity/i, /kmh/i]),
    latitude: findMatch([/^lat$/i, /latitude/i, /\.lat$/i]),
    longitude: findMatch([/^lon$/i, /^lng$/i, /longitude/i, /\.lng$/i, /\.lon$/i]),
    ignition: findMatch([/ignition/i, /acc/i, /engine/i]),
    odometerKm: findMatch([/odometer/i, /mileage.?total/i, /total.?km/i]),
    dailyMileageKm: findMatch([/daily.?mileage/i, /distance.?today/i, /trip.?km/i]),
    fuelLevelPct: findMatch([/fuel/i, /battery/i]),
    lastUpdateAt: findMatch([/last.?update/i, /fix.?time/i, /timestamp/i, /updated.?at/i, /gps.?time/i]),
    driverName: findMatch([/driver/i, /operator/i]),
    address: findMatch([/address/i, /location.?name/i]),
  };

  return {
    sampleRecord: first,
    mapping,
    detectedFields: entries.map((e) => e.path),
  };
}
