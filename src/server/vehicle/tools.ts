import crypto from 'node:crypto';
import type { NormalizedVehicle, UiComponentPayload } from '../../shared/vehicle-types.ts';
import { getDb } from '../db.ts';
import type { UnifiedToolDefinition } from '../llm-gateway.ts';
import { instantiateVehicleProvider, parseAccessConfig } from './registry.ts';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const VEHICLE_TOOL_DEFINITIONS: UnifiedToolDefinition[] = [
  {
    name: 'search_fleet',
    description: 'Search fleet vehicles by plate number, name, driver, fleet group, or status.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Plate number, name, fleet group, or city keyword' },
        status: { type: 'string', description: 'Optional filter: moving, idle, parked, offline' },
      },
    },
  },
  {
    name: 'get_vehicle_detail',
    description: 'Get full telemetry details for a specific vehicle by plate number or ID.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number, name, or ID' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_vehicle_position',
    description: 'Get latest GPS coordinates, speed, address, timestamp, and map pin for a vehicle.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number, name, or ID' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_vehicle_status',
    description: 'Check ignition, motion status, speed, and data freshness for a specific vehicle.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number, name, or ID' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_fleet_summary',
    description: 'Get overall fleet counts (total, moving, idle, parked, silent/offline) and map overview.',
    parameters: {
      type: 'object',
      properties: {
        fleetGroup: { type: 'string', description: 'Optional fleet group filter' },
      },
    },
  },
  {
    name: 'get_vehicle_trip_history',
    description: 'Retrieve recent or yesterday trip history (origin, destination, distance, duration, speeds) for a vehicle.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number, name, or ID' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_vehicle_events',
    description: 'Retrieve operational events such as overspeed, ignition, or device offline alerts for a vehicle.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number, name, or ID (optional — omit for fleet-wide events)' },
      },
    },
  },
  {
    name: 'get_device_health',
    description: 'Check GPS device transmission health, battery voltage, signal strength, and satellite lock.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number, name, or ID' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'find_nearby_vehicles',
    description: 'Find vehicles nearest to a reference vehicle or coordinates.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Optional reference vehicle plate or ID (if lat/lng not provided)' },
        latitude: { type: 'number', description: 'Reference latitude' },
        longitude: { type: 'number', description: 'Reference longitude' },
        radiusKm: { type: 'number', description: 'Search radius in kilometers (default 50)' },
      },
    },
  },
  {
    name: 'find_vehicles_by_coordinates',
    description: 'Find vehicles within a radius around explicit latitude and longitude coordinates.',
    parameters: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Target latitude' },
        longitude: { type: 'number', description: 'Target longitude' },
        radiusKm: { type: 'number', description: 'Search radius in kilometers (default 25)' },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'get_daily_mileage',
    description: 'Get today daily mileage leaderboard across vehicles.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of vehicles to return' },
      },
    },
  },
  {
    name: 'get_average_mileage',
    description: 'Calculate average daily mileage across the active fleet.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_max_speed',
    description: 'Identify vehicles with the highest recorded speeds.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max vehicles to return' },
      },
    },
  },
  {
    name: 'get_silent_units',
    description: 'List vehicles that have not reported GPS updates within the configured stale threshold.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_oldest_update',
    description: 'Find the vehicles with the oldest GPS fix timestamps.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_fleet_unit_count',
    description: 'Count total fleet units grouped by fleet group and status.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_vehicle_eta',
    description: 'Estimate route distance and ETA from a vehicle to destination coordinates using OSRM if configured.',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Vehicle plate number or ID' },
        destLat: { type: 'number', description: 'Destination latitude' },
        destLng: { type: 'number', description: 'Destination longitude' },
      },
      required: ['identifier', 'destLat', 'destLng'],
    },
  },
];

async function loadChatbotVehicles(workspaceId: string, chatbotId: string): Promise<{
  providerId: string | null;
  providerName: string;
  providerType: string;
  instance: ReturnType<typeof instantiateVehicleProvider> | null;
  vehicles: NormalizedVehicle[];
  staleThresholdMinutes: number;
  latencyMs: number;
}> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM vehicle_providers
       WHERE workspace_id = ? AND (chatbot_id = ? OR chatbot_id IS NULL)
       ORDER BY CASE WHEN chatbot_id = ? THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`
    )
    .get(workspaceId, chatbotId, chatbotId) as Record<string, unknown> | undefined;

  if (!row) {
    return {
      providerId: null,
      providerName: 'None',
      providerType: 'none',
      instance: null,
      vehicles: [],
      staleThresholdMinutes: 60,
      latencyMs: 0,
    };
  }

  const start = Date.now();
  const access = parseAccessConfig(row.access_config_json as string);
  const instance = instantiateVehicleProvider(row);
  const vehicles = await instance.listVehicles(access);
  const providerName = String(row.name || 'Fleet Provider');
  return {
    providerId: String(row.id),
    providerName,
    providerType: String(row.provider_type || 'simulator'),
    instance,
    vehicles: vehicles.map((v) => ({ ...v, providerName })),
    staleThresholdMinutes: access.staleThresholdMinutes,
    latencyMs: Date.now() - start,
  };
}

function findVehicleMatch(vehicles: NormalizedVehicle[], identifier: string): NormalizedVehicle | undefined {
  const q = identifier.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return undefined;
  return (
    vehicles.find(
      (v) =>
        v.plateNumber.toLowerCase().replace(/\s+/g, '') === q ||
        v.id.toLowerCase() === q
    ) ||
    vehicles.find(
      (v) =>
        v.plateNumber.toLowerCase().replace(/\s+/g, '').includes(q) ||
        v.name.toLowerCase().includes(identifier.trim().toLowerCase()) ||
        (v.driverName || '').toLowerCase().includes(identifier.trim().toLowerCase())
    )
  );
}

export async function executeVehicleTool(params: {
  workspaceId: string;
  chatbotId: string;
  conversationId: string;
  toolName: string;
  args: Record<string, unknown>;
}): Promise<{
  data: unknown;
  uiComponents: UiComponentPayload[];
  contextUpdate?: {
    lastVehicleId?: string;
    lastVehiclePlate?: string;
    lastCoordinates?: { lat: number; lng: number };
  };
}> {
  const db = getDb();
  let providerId: string | null = null;
  let latencyMs = 0;
  let success = true;
  let capabilityUnavailable = false;
  let errorMessage: string | null = null;
  const uiComponents: UiComponentPayload[] = [];
  let data: unknown = {};
  let contextUpdate:
    | { lastVehicleId?: string; lastVehiclePlate?: string; lastCoordinates?: { lat: number; lng: number } }
    | undefined;

  try {
    const loaded = await loadChatbotVehicles(params.workspaceId, params.chatbotId);
    providerId = loaded.providerId;
    latencyMs = loaded.latencyMs;
    const vehicles = loaded.vehicles;

    if (!providerId || !loaded.instance) {
      capabilityUnavailable = true;
      data = { error: 'No vehicle telemetry provider is configured for this chatbot.' };
    } else {
      switch (params.toolName) {
        case 'get_fleet_summary':
        case 'get_fleet_unit_count': {
          const groupFilter =
            typeof params.args.fleetGroup === 'string' ? params.args.fleetGroup.trim().toLowerCase() : '';
          const subset = groupFilter
            ? vehicles.filter((v) => v.fleetGroup.toLowerCase().includes(groupFilter))
            : vehicles;
          const moving = subset.filter((v) => v.status === 'moving').length;
          const idle = subset.filter((v) => v.status === 'idle').length;
          const parked = subset.filter((v) => v.status === 'parked').length;
          const silent = subset.filter((v) => v.isSilent).length;
          const byGroup: Record<string, number> = {};
          for (const v of subset) {
            byGroup[v.fleetGroup] = (byGroup[v.fleetGroup] || 0) + 1;
          }
          data = {
            providerName: loaded.providerName,
            isSimulated: loaded.providerType === 'simulator',
            retrievedAt: new Date().toISOString(),
            totalUnits: subset.length,
            moving,
            idle,
            parked,
            silent,
            byGroup,
            sampleVehicles: subset.slice(0, 8),
          };
          uiComponents.push({
            type: 'AnalyticsSummary',
            title: 'Fleet Status Summary',
            data: { totalUnits: subset.length, moving, idle, parked, silent, byGroup },
          });
          uiComponents.push({
            type: 'VehicleMap',
            title: `Live Fleet Map (${subset.length} units)`,
            data: { vehicles: subset.filter((v) => v.latitude !== null && v.longitude !== null) },
          });
          break;
        }

        case 'search_fleet': {
          const q = String(params.args.query || '').trim().toLowerCase();
          const status = String(params.args.status || '').trim().toLowerCase();
          const matched = vehicles.filter((v) => {
            const matchQ =
              !q ||
              v.plateNumber.toLowerCase().includes(q) ||
              v.name.toLowerCase().includes(q) ||
              v.fleetGroup.toLowerCase().includes(q) ||
              (v.address || '').toLowerCase().includes(q) ||
              (v.driverName || '').toLowerCase().includes(q);
            const matchS = !status || v.status.toLowerCase() === status;
            return matchQ && matchS;
          });
          data = {
            providerName: loaded.providerName,
            isSimulated: loaded.providerType === 'simulator',
            count: matched.length,
            vehicles: matched.slice(0, 15),
          };
          if (matched.length > 0) {
            uiComponents.push({
              type: 'FleetTable',
              title: `Matching Vehicles (${matched.length})`,
              data: { vehicles: matched.slice(0, 15) },
            });
            uiComponents.push({
              type: 'VehicleMap',
              title: 'Matched Fleet Locations',
              data: {
                vehicles: matched
                  .filter((v) => v.latitude !== null && v.longitude !== null)
                  .slice(0, 15),
              },
            });
          }
          break;
        }

        case 'get_vehicle_detail':
        case 'get_vehicle_position':
        case 'get_vehicle_status': {
          const idStr = String(params.args.identifier || '');
          const match = findVehicleMatch(vehicles, idStr);
          if (!match) {
            data = { found: false, message: `No vehicle matched "${idStr}".` };
          } else {
            contextUpdate = {
              lastVehicleId: match.id,
              lastVehiclePlate: match.plateNumber,
              ...(match.latitude !== null && match.longitude !== null
                ? { lastCoordinates: { lat: match.latitude, lng: match.longitude } }
                : {}),
            };
            data = {
              found: true,
              providerName: loaded.providerName,
              isSimulated: loaded.providerType === 'simulator',
              retrievedAt: new Date().toISOString(),
              vehicle: match,
            };
            uiComponents.push({
              type: 'VehicleCard',
              title: `${match.plateNumber} — ${match.name}`,
              data: { vehicle: match },
            });
            if (match.latitude !== null && match.longitude !== null) {
              uiComponents.push({
                type: 'VehicleMap',
                title: `${match.plateNumber} Position`,
                data: { vehicles: [match] },
              });
            }
          }
          break;
        }

        case 'get_vehicle_trip_history': {
          const idStr = String(params.args.identifier || '');
          const match = findVehicleMatch(vehicles, idStr);
          if (!match) {
            data = { found: false, message: `No vehicle matched "${idStr}".` };
          } else if (!loaded.instance.getTripHistory) {
            capabilityUnavailable = true;
            data = {
              capabilityUnavailable: true,
              message: `Provider "${loaded.providerName}" does not expose trip history endpoints.`,
            };
          } else {
            const trips = await loaded.instance.getTripHistory(match);
            contextUpdate = { lastVehicleId: match.id, lastVehiclePlate: match.plateNumber };
            data = {
              found: true,
              isSimulated: loaded.providerType === 'simulator',
              vehicle: match.plateNumber,
              trips,
            };
            uiComponents.push({
              type: 'TripHistoryTable',
              title: `Trip History — ${match.plateNumber}`,
              data: { plateNumber: match.plateNumber, trips },
            });
          }
          break;
        }

        case 'get_vehicle_events': {
          const idStr = String(params.args.identifier || '').trim();
          if (!loaded.instance.getVehicleEvents) {
            capabilityUnavailable = true;
            data = {
              capabilityUnavailable: true,
              message: `Provider "${loaded.providerName}" does not expose operational event logs.`,
            };
          } else if (idStr) {
            const match = findVehicleMatch(vehicles, idStr);
            if (!match) {
              data = { found: false, message: `No vehicle matched "${idStr}".` };
            } else {
              const events = await loaded.instance.getVehicleEvents(match);
              contextUpdate = { lastVehicleId: match.id, lastVehiclePlate: match.plateNumber };
              data = { found: true, vehicle: match.plateNumber, events };
              uiComponents.push({
                type: 'VehicleEventList',
                title: `Events — ${match.plateNumber}`,
                data: { events },
              });
            }
          } else {
            const allEvents: unknown[] = [];
            for (const v of vehicles.slice(0, 12)) {
              const evs = await loaded.instance.getVehicleEvents(v);
              allEvents.push(...evs);
            }
            data = { count: allEvents.length, events: allEvents.slice(0, 20) };
            uiComponents.push({
              type: 'VehicleEventList',
              title: 'Recent Fleet Events',
              data: { events: allEvents.slice(0, 20) },
            });
          }
          break;
        }

        case 'get_device_health': {
          const idStr = String(params.args.identifier || '');
          const match = findVehicleMatch(vehicles, idStr);
          if (!match) {
            data = { found: false, message: `No vehicle matched "${idStr}".` };
          } else if (!loaded.instance.getDeviceHealth) {
            capabilityUnavailable = true;
            data = {
              capabilityUnavailable: true,
              message: `Provider "${loaded.providerName}" does not expose GPS device health telemetry.`,
            };
          } else {
            const health = await loaded.instance.getDeviceHealth(match);
            contextUpdate = { lastVehicleId: match.id, lastVehiclePlate: match.plateNumber };
            data = { found: true, health };
            uiComponents.push({
              type: 'DeviceHealthCard',
              title: `Device Health — ${match.plateNumber}`,
              data: { health },
            });
          }
          break;
        }

        case 'find_nearby_vehicles':
        case 'find_vehicles_by_coordinates': {
          let lat = Number(params.args.latitude);
          let lng = Number(params.args.longitude);
          if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof params.args.identifier === 'string') {
            const ref = findVehicleMatch(vehicles, params.args.identifier);
            if (ref && ref.latitude !== null && ref.longitude !== null) {
              lat = ref.latitude;
              lng = ref.longitude;
            }
          }
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            data = { error: 'Provide latitude/longitude or a valid reference vehicle identifier.' };
            break;
          }
          const radiusKm = Number(params.args.radiusKm || 50);
          const nearby = vehicles
            .filter((v) => v.latitude !== null && v.longitude !== null)
            .map((v) => ({
              vehicle: v,
              distanceKm: Number(haversineKm(lat, lng, v.latitude!, v.longitude!).toFixed(2)),
            }))
            .filter((x) => x.distanceKm <= radiusKm)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 12);
          data = { center: { lat, lng }, radiusKm, count: nearby.length, results: nearby };
          if (nearby.length > 0) {
            uiComponents.push({
              type: 'VehicleMap',
              title: `Vehicles within ${radiusKm} km`,
              data: { vehicles: nearby.map((n) => n.vehicle) },
            });
            uiComponents.push({
              type: 'FleetTable',
              title: `Nearby Units (${nearby.length})`,
              data: { vehicles: nearby.map((n) => n.vehicle) },
            });
          }
          break;
        }

        case 'get_daily_mileage': {
          const withMileage = vehicles.filter((v) => v.dailyMileageKm !== null);
          if (withMileage.length === 0) {
            capabilityUnavailable = true;
            data = {
              capabilityUnavailable: true,
              message: 'Connected provider does not supply daily mileage.',
            };
          } else {
            const sorted = [...withMileage]
              .sort((a, b) => (b.dailyMileageKm || 0) - (a.dailyMileageKm || 0))
              .slice(0, Number(params.args.limit || 10));
            const totalKm = withMileage.reduce((acc, v) => acc + (v.dailyMileageKm || 0), 0);
            data = {
              totalDailyMileageKm: Number(totalKm.toFixed(1)),
              topVehicles: sorted,
            };
            uiComponents.push({
              type: 'FleetTable',
              title: 'Daily Mileage Leaderboard',
              data: { vehicles: sorted },
            });
          }
          break;
        }

        case 'get_average_mileage': {
          const withMileage = vehicles.filter((v) => v.dailyMileageKm !== null);
          if (withMileage.length === 0) {
            capabilityUnavailable = true;
            data = { capabilityUnavailable: true, message: 'Daily mileage unavailable from provider.' };
          } else {
            const total = withMileage.reduce((acc, v) => acc + (v.dailyMileageKm || 0), 0);
            const avg = Number((total / withMileage.length).toFixed(1));
            data = { averageDailyMileageKm: avg, sampleSize: withMileage.length };
            uiComponents.push({
              type: 'AnalyticsSummary',
              title: 'Fleet Mileage Analytics',
              data: {
                averageDailyMileageKm: avg,
                totalDailyMileageKm: Number(total.toFixed(1)),
                sampleSize: withMileage.length,
              },
            });
          }
          break;
        }

        case 'get_max_speed': {
          const ranked = [...vehicles]
            .sort((a, b) => (b.maxSpeedKmh ?? b.speedKmh) - (a.maxSpeedKmh ?? a.speedKmh))
            .slice(0, Number(params.args.limit || 8));
          data = { topSpeedVehicles: ranked };
          uiComponents.push({
            type: 'FleetTable',
            title: 'Highest Speed Units',
            data: { vehicles: ranked },
          });
          break;
        }

        case 'get_silent_units': {
          const silent = vehicles.filter((v) => v.isSilent);
          data = {
            thresholdMinutes: loaded.staleThresholdMinutes,
            silentCount: silent.length,
            silentUnits: silent,
          };
          if (silent.length > 0) {
            uiComponents.push({
              type: 'FleetTable',
              title: `Silent Units (> ${loaded.staleThresholdMinutes}m stale)`,
              data: { vehicles: silent },
            });
            uiComponents.push({
              type: 'VehicleMap',
              title: 'Last Known Positions of Silent Units',
              data: { vehicles: silent.filter((v) => v.latitude !== null && v.longitude !== null) },
            });
          }
          break;
        }

        case 'get_oldest_update': {
          const oldest = [...vehicles].sort((a, b) => b.staleMinutes - a.staleMinutes).slice(0, 5);
          data = { oldestUnits: oldest };
          uiComponents.push({
            type: 'FleetTable',
            title: 'Oldest Telemetry Updates',
            data: { vehicles: oldest },
          });
          break;
        }

        case 'get_vehicle_eta': {
          const match = findVehicleMatch(vehicles, String(params.args.identifier || ''));
          const destLat = Number(params.args.destLat);
          const destLng = Number(params.args.destLng);
          const osrmBase = process.env.OSRM_BASE_URL?.trim().replace(/\/+$/, '');
          if (!osrmBase) {
            capabilityUnavailable = true;
            data = {
              capabilityUnavailable: true,
              message:
                'OSRM routing is not configured (OSRM_BASE_URL is blank). Cannot compute road ETA.',
            };
          } else if (!match || match.latitude === null || match.longitude === null) {
            data = { found: false, message: 'Vehicle or GPS coordinates unavailable.' };
          } else {
            const routeRes = await fetch(
              `${osrmBase}/route/v1/driving/${match.longitude},${match.latitude};${destLng},${destLat}?overview=false`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (!routeRes.ok) {
              capabilityUnavailable = true;
              data = { capabilityUnavailable: true, message: `OSRM HTTP ${routeRes.status}` };
            } else {
              const routeJson = (await routeRes.json()) as {
                routes?: Array<{ distance: number; duration: number }>;
              };
              const r = routeJson.routes?.[0];
              if (r) {
                const etaObj = {
                  vehicle: match.plateNumber,
                  distanceKm: Number((r.distance / 1000).toFixed(1)),
                  etaMinutes: Math.round(r.duration / 60),
                };
                data = etaObj;
                uiComponents.push({
                  type: 'ETAResult',
                  title: `Route ETA — ${match.plateNumber}`,
                  data: etaObj,
                });
              } else {
                capabilityUnavailable = true;
                data = { capabilityUnavailable: true, message: 'No OSRM route found.' };
              }
            }
          }
          break;
        }

        default:
          data = { error: `Unknown vehicle tool: ${params.toolName}` };
          success = false;
      }
    }
  } catch (err: unknown) {
    success = false;
    errorMessage = err instanceof Error ? err.message : 'Vehicle tool error.';
    data = { error: errorMessage };
  }

  db.prepare(
    `INSERT INTO vehicle_tool_executions
      (id, workspace_id, chatbot_id, conversation_id, provider_id, tool_name, args_json, success, capability_unavailable, provider_latency_ms, ui_component_types_json, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    params.workspaceId,
    params.chatbotId,
    params.conversationId,
    providerId,
    params.toolName,
    JSON.stringify(params.args),
    success ? 1 : 0,
    capabilityUnavailable ? 1 : 0,
    latencyMs,
    JSON.stringify(uiComponents.map((c) => c.type)),
    errorMessage,
    new Date().toISOString()
  );

  return { data, uiComponents, contextUpdate };
}
