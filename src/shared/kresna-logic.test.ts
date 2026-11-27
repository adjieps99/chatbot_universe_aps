import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHATBOT_PRESETS,
  evaluatePublishReadiness,
  getPresetByKey,
} from './kresna-logic.ts';
import { suggestVehicleFieldMapping } from './vehicle-types.ts';

test('getPresetByKey returns requested preset or defaults cleanly', () => {
  assert.equal(getPresetByKey('fleet_intelligence').key, 'fleet_intelligence');
  assert.equal(getPresetByKey('unknown_key').key, CHATBOT_PRESETS[0].key);
});

test('evaluatePublishReadiness scores all 4 readiness checks', () => {
  const incomplete = evaluatePublishReadiness({
    name: 'A',
    purpose: 'short',
    modelConnectionStatus: 'untested',
    modelId: '',
    hasTestedConversation: false,
  });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.score, 0);

  const ready = evaluatePublishReadiness({
    name: 'LOGis Support',
    purpose: 'Help operations and admin teams solve UJP and POD tickets.',
    modelConnectionStatus: 'connected',
    modelId: 'gpt-4o',
    hasTestedConversation: true,
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.score, 100);
});

test('suggestVehicleFieldMapping auto-detects nested GPS fields', () => {
  const sample = {
    vehicles: [
      {
        unitId: 'v-10',
        plateNumber: 'B 9102 KRN',
        vehicleName: 'Hino Wingbox 01',
        fleetGroup: 'Jakarta Logistics',
        speedKmh: 62,
        gps: { lat: -6.2, lng: 106.8 },
        ignition: true,
        dailyMileageKm: 184.5,
      },
    ],
  };
  const out = suggestVehicleFieldMapping(sample);
  assert.equal(out.mapping.plateNumber, 'plateNumber');
  assert.equal(out.mapping.latitude, 'gps.lat');
  assert.equal(out.mapping.longitude, 'gps.lng');
  assert.equal(out.mapping.dailyMileageKm, 'dailyMileageKm');
});
