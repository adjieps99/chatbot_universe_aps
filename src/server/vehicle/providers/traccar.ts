import type {
  DeviceHealth,
  NormalizedVehicle,
  VehicleEvent,
  VehicleTrip,
} from '../../../shared/vehicle-types.ts';
import { assertSafeExternalUrl } from '../../ssrf.ts';

export class TraccarVehicleProvider {
  private baseUrl: string;
  private credentials: Record<string, string>;
  private authType: string;

  constructor(params: {
    baseUrl: string;
    authType: string;
    credentials?: Record<string, string>;
  }) {
    this.baseUrl = params.baseUrl.trim().replace(/\/+$/, '');
    this.authType = params.authType || 'basic';
    this.credentials = params.credentials || {};
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.authType === 'bearer' && this.credentials.token) {
      headers.Authorization = `Bearer ${this.credentials.token}`;
    } else if (this.credentials.username) {
      const encoded = Buffer.from(
        `${this.credentials.username}:${this.credentials.password || ''}`
      ).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }
    return headers;
  }

  async listVehicles(opts?: {
    allowedFleetGroups?: string[];
    staleThresholdMinutes?: number;
  }): Promise<NormalizedVehicle[]> {
    await assertSafeExternalUrl(this.baseUrl);
    const headers = this.buildHeaders();
    const [devRes, posRes] = await Promise.all([
      fetch(`${this.baseUrl}/api/devices`, { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`${this.baseUrl}/api/positions`, { headers, signal: AbortSignal.timeout(10000) }),
    ]);

    if (!devRes.ok) {
      throw new Error(`Traccar /api/devices HTTP ${devRes.status}`);
    }

    const devices = (await devRes.json()) as Array<Record<string, unknown>>;
    const positions = posRes.ok
      ? ((await posRes.json()) as Array<Record<string, unknown>>)
      : [];
    const posByDevice = new Map<string, Record<string, unknown>>();
    for (const p of positions) {
      posByDevice.set(String(p.deviceId), p);
    }

    const staleLimit = opts?.staleThresholdMinutes ?? 60;
    const nowMs = Date.now();

    let vehicles = devices.map((d): NormalizedVehicle => {
      const pos = posByDevice.get(String(d.id)) || {};
      const speedKnots = Number(pos.speed || 0);
      const speedKmh = Number((speedKnots * 1.852).toFixed(1));
      const attrs = (pos.attributes && typeof pos.attributes === 'object'
        ? pos.attributes
        : {}) as Record<string, unknown>;
      const lastUpdateAt = String(pos.fixTime || d.lastUpdate || new Date().toISOString());
      const updateMs = Date.parse(lastUpdateAt);
      const staleMinutes = Number.isFinite(updateMs)
        ? Math.max(0, Math.round((nowMs - updateMs) / 60000))
        : 0;
      const isSilent = staleMinutes >= staleLimit || d.status === 'offline';
      const ignition = attrs.ignition !== undefined ? Boolean(attrs.ignition) : null;
      const totalDistMeters = Number(attrs.totalDistance || 0);

      return {
        id: String(d.id),
        plateNumber: String(d.uniqueId || d.name || d.id),
        name: String(d.name || d.uniqueId || d.id),
        fleetGroup: String(d.category || 'Traccar Fleet'),
        vehicleType: String(d.model || d.category || 'GPS Unit'),
        status: isSilent ? 'offline' : speedKmh > 3 ? 'moving' : ignition ? 'idle' : 'parked',
        speedKmh,
        headingDeg: typeof pos.course === 'number' ? pos.course : undefined,
        latitude: typeof pos.latitude === 'number' ? pos.latitude : null,
        longitude: typeof pos.longitude === 'number' ? pos.longitude : null,
        address: typeof pos.address === 'string' ? pos.address : undefined,
        ignition,
        odometerKm: totalDistMeters > 0 ? Number((totalDistMeters / 1000).toFixed(1)) : null,
        dailyMileageKm: null,
        maxSpeedKmh: null,
        fuelLevelPct: typeof attrs.fuel === 'number' ? attrs.fuel : null,
        lastUpdateAt,
        staleMinutes,
        isSilent,
        isSimulated: false,
        availableCapabilities: ['positions', 'trips', 'events', 'deviceHealth'],
      };
    });

    if (opts?.allowedFleetGroups && opts.allowedFleetGroups.length > 0) {
      const allowed = new Set(opts.allowedFleetGroups.map((g) => g.toLowerCase()));
      vehicles = vehicles.filter((v) => allowed.has(v.fleetGroup.toLowerCase()));
    }
    return vehicles;
  }

  async getTripHistory(vehicle: NormalizedVehicle): Promise<VehicleTrip[]> {
    await assertSafeExternalUrl(this.baseUrl);
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await fetch(
      `${this.baseUrl}/api/reports/trips?deviceId=${encodeURIComponent(vehicle.id)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: this.buildHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.map((r, i) => ({
      id: `traccar-trip-${vehicle.id}-${i}`,
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      startTime: String(r.startTime || from),
      endTime: String(r.endTime || to),
      startAddress: String(r.startAddress || 'Origin'),
      endAddress: String(r.endAddress || 'Destination'),
      distanceKm: Number((Number(r.distance || 0) / 1000).toFixed(1)),
      durationMinutes: Math.round(Number(r.duration || 0) / 60000),
      maxSpeedKmh: Number((Number(r.maxSpeed || 0) * 1.852).toFixed(1)),
      averageSpeedKmh: Number((Number(r.averageSpeed || 0) * 1.852).toFixed(1)),
    }));
  }

  async getVehicleEvents(vehicle: NormalizedVehicle): Promise<VehicleEvent[]> {
    await assertSafeExternalUrl(this.baseUrl);
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await fetch(
      `${this.baseUrl}/api/reports/events?deviceId=${encodeURIComponent(vehicle.id)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: this.buildHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.slice(0, 20).map((r, i) => ({
      id: String(r.id || `traccar-evt-${i}`),
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      type: (String(r.type || 'ignition_on') as VehicleEvent['type']),
      severity: String(r.type || '').includes('Overspeed') ? 'warning' : 'info',
      timestamp: String(r.eventTime || to),
      message: String(r.type || 'Traccar event'),
    }));
  }

  async getDeviceHealth(vehicle: NormalizedVehicle): Promise<DeviceHealth> {
    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      transmitting: !vehicle.isSilent,
      lastHeartbeatAt: vehicle.lastUpdateAt,
      staleMinutes: vehicle.staleMinutes,
      batteryVoltage: null,
      signalStrength: vehicle.isSilent ? 'Offline' : 'Connected',
      satellites: null,
    };
  }
}
