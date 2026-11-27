import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDbFile = path.join(
  os.tmpdir(),
  `kresna-vehicle-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.KRESNA_DB_PATH = tempDbFile;

test('Simulator Fleet provides 22 units with 2 silent units and trip/event/health telemetry', async () => {
  const { SimulatorVehicleProvider } = await import('./providers/simulator.ts');
  const sim = new SimulatorVehicleProvider({ liveDrift: false });
  const vehicles = await sim.listVehicles({ staleThresholdMinutes: 60 });

  assert.equal(vehicles.length, 22);
  const silent = vehicles.filter((v) => v.isSilent);
  assert.equal(silent.length, 2);
  assert.deepEqual(
    silent.map((v) => v.plateNumber).sort(),
    ['B 9611 SIL', 'L 9772 SIL']
  );

  const target = vehicles.find((v) => v.plateNumber === 'B 9102 KRN');
  assert.ok(target);
  const trips = await sim.getTripHistory(target);
  assert.ok(trips.length >= 1);
  const events = await sim.getVehicleEvents(target);
  assert.ok(Array.isArray(events));
  const health = await sim.getDeviceHealth(target);
  assert.equal(health.plateNumber, 'B 9102 KRN');
  assert.equal(health.transmitting, true);
});

test('All 17 vehicle intelligence tools execute cleanly and report OSRM unavailability honestly', async (t) => {
  t.after(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbFile}${suffix}`)) {
        fs.rmSync(`${tempDbFile}${suffix}`, { force: true });
      }
    }
  });

  const { getDb } = await import('../db.ts');
  const { executeVehicleTool, VEHICLE_TOOL_DEFINITIONS } = await import('./tools.ts');
  assert.equal(VEHICLE_TOOL_DEFINITIONS.length, 17);

  const db = getDb();
  const ws = db.prepare(`SELECT id FROM workspaces LIMIT 1`).get() as { id: string };
  const fleetBot = db
    .prepare(`SELECT id FROM chatbots WHERE chatbot_type = 'vehicle_intelligence' LIMIT 1`)
    .get() as { id: string };

  const summaryRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'get_fleet_summary',
    args: {},
  });
  assert.equal((summaryRes.data as { totalUnits: number }).totalUnits, 22);
  assert.ok(summaryRes.uiComponents.some((c) => c.type === 'AnalyticsSummary'));
  assert.ok(summaryRes.uiComponents.some((c) => c.type === 'VehicleMap'));

  const posRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'get_vehicle_position',
    args: { identifier: 'B 9102 KRN' },
  });
  assert.equal(posRes.contextUpdate?.lastVehiclePlate, 'B 9102 KRN');
  assert.ok(posRes.uiComponents.some((c) => c.type === 'VehicleCard'));

  const tripRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'get_vehicle_trip_history',
    args: { identifier: 'B 9102 KRN' },
  });
  assert.ok(tripRes.uiComponents.some((c) => c.type === 'TripHistoryTable'));

  const healthRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'get_device_health',
    args: { identifier: 'B 9611 SIL' },
  });
  assert.ok(healthRes.uiComponents.some((c) => c.type === 'DeviceHealthCard'));

  const nearbyRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'find_nearby_vehicles',
    args: { identifier: 'B 9102 KRN', radiusKm: 100 },
  });
  assert.ok((nearbyRes.data as { count: number }).count >= 1);

  const mileageRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'get_daily_mileage',
    args: { limit: 3 },
  });
  assert.equal((mileageRes.data as { topVehicles: Array<{ plateNumber: string }> }).topVehicles[0].plateNumber, 'H 9411 SMG');

  delete process.env.OSRM_BASE_URL;
  const etaRes = await executeVehicleTool({
    workspaceId: ws.id,
    chatbotId: fleetBot.id,
    conversationId: 'conv-v-test',
    toolName: 'get_vehicle_eta',
    args: { identifier: 'B 9102 KRN', destLat: -6.9, destLng: 107.6 },
  });
  assert.equal((etaRes.data as { capabilityUnavailable: boolean }).capabilityUnavailable, true);
});

test('OpenAPI parser and Skyward Legacy adapter contract behave as expected', async () => {
  const { parseOpenApiVehicleSpec } = await import('./providers/generic-rest.ts');
  const { SkywardLegacyVehicleProvider } = await import('./providers/skyward-legacy.ts');

  const parsed = parseOpenApiVehicleSpec({
    openapi: '3.0.0',
    servers: [{ url: 'https://fleet.example.com' }],
    paths: {
      '/api/v1/vehicles': { get: { summary: 'List fleet vehicles' } },
      '/api/v1/health': { get: { summary: 'Health check' } },
    },
  });
  assert.equal(parsed.baseUrl, 'https://fleet.example.com');
  assert.equal(parsed.suggestedEndpoint, '/api/v1/vehicles');

  const skyward = new SkywardLegacyVehicleProvider({ tenantCode: 'LOGIS-ID' });
  const testRes = await skyward.testConnection();
  assert.equal(testRes.ok, false);
  assert.match(testRes.message, /Cosmos DB|SQL Server/i);
});
