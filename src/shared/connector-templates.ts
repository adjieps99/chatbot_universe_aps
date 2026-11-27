export interface GeneralConnectorTemplate {
  id: string;
  title: string;
  category: 'live_public' | 'business_ops' | 'support_crm';
  badge: string;
  summary: string;
  name: string;
  description: string;
  method: 'GET' | 'POST';
  url: string;
  authType: 'none' | 'bearer' | 'api_key' | 'basic';
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  bodyTemplate: Record<string, unknown>;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  sampleTestArgs: Record<string, unknown>;
}

export const GENERAL_CONNECTOR_TEMPLATES: GeneralConnectorTemplate[] = [
  {
    id: 'weather_openmeteo',
    title: 'Cek Cuaca Lokasi / Rute (Live Public)',
    category: 'live_public',
    badge: 'Langsung Bisa Test (Tanpa Key)',
    summary: 'Mengambil kondisi cuaca real-time berdasarkan koordinat latitude & longitude via Open-Meteo.',
    name: 'cek_cuaca_lokasi',
    description:
      'Cek kondisi cuaca real-time (suhu, kecepatan angin) pada koordinat latitude dan longitude tertentu.',
    method: 'GET',
    url: 'https://api.open-meteo.com/v1/forecast',
    authType: 'none',
    headers: {},
    queryParams: {
      latitude: '{{latitude}}',
      longitude: '{{longitude}}',
      current_weather: 'true',
    },
    bodyTemplate: {},
    inputSchema: {
      type: 'object',
      properties: {
        latitude: { type: 'string', description: 'Latitude lokasi, misal -6.2088' },
        longitude: { type: 'string', description: 'Longitude lokasi, misal 106.8456' },
      },
      required: ['latitude', 'longitude'],
    },
    sampleTestArgs: { latitude: '-6.2088', longitude: '106.8456' },
  },
  {
    id: 'currency_frankfurter',
    title: 'Konversi Kurs Mata Uang (Live Public)',
    category: 'live_public',
    badge: 'Langsung Bisa Test (Tanpa Key)',
    summary: 'Cek nilai tukar mata uang harian (misal USD ke IDR) menggunakan Frankfurter public API.',
    name: 'cek_kurs_mata_uang',
    description: 'Mengambil kurs valuta asing terbaru dari mata uang asal ke mata uang tujuan.',
    method: 'GET',
    url: 'https://api.frankfurter.app/latest',
    authType: 'none',
    headers: {},
    queryParams: {
      from: '{{from}}',
      to: '{{to}}',
    },
    bodyTemplate: {},
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Kode mata uang asal (contoh: USD)' },
        to: { type: 'string', description: 'Kode mata uang tujuan (contoh: IDR)' },
      },
      required: ['from', 'to'],
    },
    sampleTestArgs: { from: 'USD', to: 'IDR' },
  },
  {
    id: 'order_status',
    title: 'Cek Status Order / Resi Pengiriman',
    category: 'business_ops',
    badge: 'Template Umum',
    summary: 'Mengambil status pesanan, nomor resi, atau shipment dari sistem ERP/OMS perusahaan.',
    name: 'cek_status_order',
    description: 'Cek status terbaru pesanan, shipment, atau nomor resi berdasarkan ID order.',
    method: 'GET',
    url: 'https://api.perusahaan-anda.com/v1/orders/{{orderId}}',
    authType: 'bearer',
    headers: { Accept: 'application/json' },
    queryParams: {},
    bodyTemplate: {},
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Nomor order, invoice, atau resi pengiriman' },
      },
      required: ['orderId'],
    },
    sampleTestArgs: { orderId: 'ORD-2026-001' },
  },
  {
    id: 'crm_customer',
    title: 'Cek Profil Pelanggan / Member (CRM)',
    category: 'support_crm',
    badge: 'Template Umum',
    summary: 'Mencari status akun pelanggan, paket aktif, atau histori transaksi di sistem CRM.',
    name: 'cek_data_pelanggan',
    description: 'Cari data pelanggan atau member berdasarkan email, nomor HP, atau ID pelanggan.',
    method: 'GET',
    url: 'https://crm.perusahaan-anda.com/api/v1/customers',
    authType: 'api_key',
    headers: { Accept: 'application/json' },
    queryParams: {
      query: '{{query}}',
    },
    bodyTemplate: {},
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Email, nomor HP, atau ID pelanggan' },
      },
      required: ['query'],
    },
    sampleTestArgs: { query: 'budi@contoh.co.id' },
  },
  {
    id: 'booking_availability',
    title: 'Cek Jadwal & Slot Tersedia',
    category: 'business_ops',
    badge: 'Template Umum',
    summary: 'Memeriksa ketersediaan jadwal teknisi, ruangan, atau slot pickup/delivery pada tanggal tertentu.',
    name: 'cek_slot_jadwal',
    description: 'Cek slot jadwal atau kuota layanan yang tersedia pada tanggal tertentu.',
    method: 'GET',
    url: 'https://booking.perusahaan-anda.com/api/v1/availability',
    authType: 'bearer',
    headers: { Accept: 'application/json' },
    queryParams: {
      date: '{{date}}',
    },
    bodyTemplate: {},
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Tanggal format YYYY-MM-DD' },
      },
      required: ['date'],
    },
    sampleTestArgs: { date: '2026-12-01' },
  },
  {
    id: 'helpdesk_ticket_webhook',
    title: 'Kirim Tiket Eskalasi / Webhook Notifikasi',
    category: 'support_crm',
    badge: 'Template Umum',
    summary: 'Mengirim ringkasan keluhan pelanggan atau alert operasional ke webhook Slack/Helpdesk.',
    name: 'kirim_notifikasi_tiket',
    description: 'Kirim eskalasi tiket atau notifikasi alert ke sistem helpdesk / channel tim.',
    method: 'POST',
    url: 'https://hooks.perusahaan-anda.com/v1/tickets',
    authType: 'bearer',
    headers: { 'Content-Type': 'application/json' },
    queryParams: {},
    bodyTemplate: {
      subject: '{{subject}}',
      summary: '{{summary}}',
      priority: '{{priority}}',
    },
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Judul singkat kendala' },
        summary: { type: 'string', description: 'Ringkasan konteks percakapan user' },
        priority: { type: 'string', description: 'Prioritas: low, normal, atau high' },
      },
      required: ['subject', 'summary'],
    },
    sampleTestArgs: {
      subject: 'Butuh verifikasi UJP manual',
      summary: 'User sudah cek di Finance -> UJP Monitoring dan statusnya Failed.',
      priority: 'high',
    },
  },
];

export function buildConnectorDraftFromTemplate(templateId: string): GeneralConnectorTemplate | undefined {
  return GENERAL_CONNECTOR_TEMPLATES.find((t) => t.id === templateId);
}
