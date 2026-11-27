import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsDirectiveHint,
  buildSmartFollowupSuggestions,
  classifyQnaResponseStrategy,
} from './cs-strategy.ts';
import {
  buildConnectorDraftFromTemplate,
  GENERAL_CONNECTOR_TEMPLATES,
} from './connector-templates.ts';

test('classifyQnaResponseStrategy distinguishes direct_short vs diagnostic_multicause vs progressive_long vs explicit_full', () => {
  const shortContractQna = [
    {
      title: 'Mengapa nomor kontrak kosong?',
      content: 'Contract No. memang hanya terisi untuk tipe kontrak Dedicated. Jika tipe unitnya Non-Dedicated atau Ritase, kolom tersebut otomatis kosong.',
    },
  ];
  assert.equal(classifyQnaResponseStrategy(shortContractQna, 'Kenapa nomor kontrak kosong?'), 'direct_short');

  const multiCauseUjpQna = [
    {
      title: 'UJP Failed atau Pending',
      content: [
        'Beberapa penyebab yang sering terjadi saat UJP tertahan:',
        '- Status masih Waiting Process From SAP.',
        '- Nama pemilik rekening tidak sesuai atau akun bank bermasalah.',
        '- POD belum di-approve di modul Operation.',
      ].join('\n'),
    },
  ];
  assert.equal(
    classifyQnaResponseStrategy(multiCauseUjpQna, 'UJP saya belum cair nih'),
    'diagnostic_multicause'
  );

  const longSopQna = [
    {
      title: 'Prosedur Tambah Rental Unit',
      content: [
        'Berikut panduan umum pendaftaran unit rental baru di modul Fleet:',
        '1. Buka menu Fleet Management lalu pilih Daftar Kendaraan.',
        '2. Klik Tambah Unit Baru dan lengkapi nomor polisi serta kapasitas armada.',
        '3. Pilih kategori kontrak apakah Dedicated atau Ritase sesuai kesepakatan.',
        '4. Unggah dokumen STNK dan KIR yang masih berlaku lalu simpan perubahan.',
      ].join('\n'),
    },
  ];
  assert.equal(classifyQnaResponseStrategy(longSopQna, 'Gimana cara tambah unit rental?'), 'progressive_long');

  assert.equal(
    classifyQnaResponseStrategy(multiCauseUjpQna, 'Tolong jelaskan semua langkah lengkapnya ya'),
    'explicit_full'
  );
});

test('buildCsDirectiveHint adapts instructions cleanly per strategy', () => {
  assert.match(buildCsDirectiveHint('direct_short'), /DIRECT_SHORT/);
  assert.match(buildCsDirectiveHint('diagnostic_multicause'), /DIAGNOSTIC_MULTICAUSE/);
  assert.match(buildCsDirectiveHint('progressive_long'), /PROGRESSIVE_LONG/);
  assert.match(buildCsDirectiveHint('explicit_full'), /EXPLICIT_FULL/);
});

test('buildSmartFollowupSuggestions omits followups for direct_short and generates domain Indonesian followups for multicause & vehicle bots', () => {
  assert.deepEqual(
    buildSmartFollowupSuggestions({
      isVehicleBot: false,
      strategy: 'direct_short',
      passages: [{ content: 'Contract No hanya terisi untuk kontrak Dedicated.' }],
      userMessage: 'Kenapa nomor kontrak kosong?',
    }),
    []
  );

  assert.deepEqual(
    buildSmartFollowupSuggestions({
      isVehicleBot: false,
      strategy: 'explicit_full',
      passages: [{ content: 'UJP Waiting Process From SAP' }],
      userMessage: 'jelaskan semua',
    }),
    []
  );

  const ujpFollowups = buildSmartFollowupSuggestions({
    isVehicleBot: false,
    strategy: 'diagnostic_multicause',
    passages: [{ content: 'Status UJP Waiting Process From SAP atau rekening bermasalah.' }],
    userMessage: 'UJP saya gagal',
  });
  assert.ok(ujpFollowups.length >= 2);
  assert.ok(ujpFollowups.some((s) => /SAP|rekening/i.test(s)));

  const vehiclePlateFollowups = buildSmartFollowupSuggestions({
    isVehicleBot: true,
    strategy: 'direct_short',
    passages: [],
    lastVehiclePlate: 'B9811UEW',
    userMessage: 'Cek posisi B9811UEW',
  });
  assert.equal(vehiclePlateFollowups.length, 3);
  assert.ok(vehiclePlateFollowups[0].includes('B9811UEW'));
});

test('GENERAL_CONNECTOR_TEMPLATES provides ready-to-use live_public and general business templates', () => {
  assert.ok(GENERAL_CONNECTOR_TEMPLATES.length >= 6);
  const weather = buildConnectorDraftFromTemplate('weather_openmeteo');
  assert.ok(weather);
  assert.equal(weather.authType, 'none');
  assert.equal(weather.category, 'live_public');
  assert.ok(weather.sampleTestArgs.latitude);
  assert.ok(weather.sampleTestArgs.longitude);

  const currency = buildConnectorDraftFromTemplate('currency_frankfurter');
  assert.ok(currency);
  assert.equal(currency.authType, 'none');
  assert.equal(currency.sampleTestArgs.from, 'USD');
});
