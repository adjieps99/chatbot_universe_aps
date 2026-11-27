export type QnaResponseStrategy =
  | 'direct_short'
  | 'progressive_long'
  | 'diagnostic_multicause'
  | 'explicit_full';

export interface RetrievedPassageLike {
  title?: string;
  content: string;
}

const EXPLICIT_FULL_REGEX =
  /\b(jelaskan semua|semua langkah|detail lengkap|lengkapnya|secara lengkap|all steps|full details|step by step semuanya)\b/i;

const DIAGNOSTIC_HINT_REGEX =
  /penyebab yang (paling )?sering|beberapa penyebab|kasus yang sering|beberapa kasus|waiting process from sap|pod|ujp|termin|pairing|obd|reroute|failed|pending/i;

/**
 * Classifies how a Customer Service agent should structure its reply based on
 * the retrieved QnA passage structure and the user's phrasing.
 *
 * - `direct_short`: Simple, factual, single-cause Q&As -> 1-3 crisp sentences, NO forced follow-up.
 * - `progressive_long`: Long or multi-step SOPs -> concise summary + 1 offer to walk through next steps.
 * - `diagnostic_multicause`: Multi-cause troubleshooting -> brief natural empathy + top check + 1 diagnostic question.
 * - `explicit_full`: User asked for complete details -> deliver full structured breakdown.
 */
export function classifyQnaResponseStrategy(
  passages: RetrievedPassageLike[],
  userMessage: string
): QnaResponseStrategy {
  if (EXPLICIT_FULL_REGEX.test(userMessage)) {
    return 'explicit_full';
  }

  if (!passages || passages.length === 0) {
    return 'direct_short';
  }

  const primary = passages[0].content || '';
  const bulletLines = primary
    .split('\n')
    .filter((line) => /^\s*[-•*\d]+[.)]?\s+/.test(line.trim())).length;

  const hasMultipleCauses =
    (bulletLines >= 3 && /penyebab|kasus|alasan|gagal|pending|tidak bisa|tidak muncul/i.test(primary)) ||
    (DIAGNOSTIC_HINT_REGEX.test(primary) && bulletLines >= 3);

  if (hasMultipleCauses) {
    return 'diagnostic_multicause';
  }

  if (primary.length > 420 || bulletLines >= 4) {
    return 'progressive_long';
  }

  return 'direct_short';
}

export function buildCsDirectiveHint(strategy: QnaResponseStrategy): string {
  switch (strategy) {
    case 'direct_short':
      return [
        'Turn Strategy [DIRECT_SHORT]:',
        'The retrieved answer is straightforward and factual. Reply warmly and directly in 1-3 concise sentences.',
        'Do NOT tack on unnecessary diagnostic questions or extra follow-up prompts unless genuinely needed.',
      ].join(' ');
    case 'progressive_long':
      return [
        'Turn Strategy [PROGRESSIVE_LONG]:',
        'The retrieved SOP/answer is long. Give a clear, helpful 2-3 sentence summary of the primary action first—do NOT dump every bullet at once.',
        'End with 1 brief, friendly offer asking if they would like the detailed step-by-step guide or help checking a specific part.',
      ].join(' ');
    case 'diagnostic_multicause':
      return [
        'Turn Strategy [DIAGNOSTIC_MULTICAUSE]:',
        'The retrieved QnA has multiple possible causes or status branches. Acknowledge the user situation naturally in 1 brief empathetic phrase (never robotic), mention the 1-2 most common checks concisely, and ask ONE specific diagnostic follow-up question from this exact QnA (for example: current status on screen or whether prerequisite approval/data validation is complete) so you can narrow down the exact fix step by step.',
      ].join(' ');
    case 'explicit_full':
      return [
        'Turn Strategy [EXPLICIT_FULL]:',
        'The user explicitly asked for complete details. Provide the full, clearly structured step-by-step explanation based strictly on the retrieved passages.',
      ].join(' ');
  }
}

export function buildSmartFollowupSuggestions(params: {
  isVehicleBot: boolean;
  strategy: QnaResponseStrategy;
  passages: RetrievedPassageLike[];
  lastVehiclePlate?: string;
  userMessage: string;
}): string[] {
  if (params.isVehicleBot) {
    if (params.lastVehiclePlate) {
      return [
        `Sudah berapa lama ${params.lastVehiclePlate} di lokasi itu?`,
        `Cari unit lain di sekitar ${params.lastVehiclePlate}`,
        `Cek kondisi GPS & baterai ${params.lastVehiclePlate}`,
      ];
    }
    return [
      'Unit mana saja yang sedang jalan sekarang?',
      'Tampilkan unit yang silent / offline',
      'Bandingkan jarak tempuh harian armada',
    ];
  }

  // Simple factual Q&As shouldn't force follow-up pills onto the user
  if (params.strategy === 'direct_short' || params.strategy === 'explicit_full') {
    return [];
  }

  const combined = params.passages.map((p) => p.content).join('\n');
  if (/UJP|Termin|SAP|transfer|rekening|Talenta/i.test(combined)) {
    return [
      'Statusnya Waiting Process From SAP',
      'Nama rekening / bank bermasalah',
      'Jelaskan semua langkah solusinya',
    ];
  }
  if (/POD|Unloading|SO\b|Sales Order|BPH/i.test(combined)) {
    return [
      'POD sudah di-approve tapi SO belum muncul',
      'POD tidak muncul di POD Collection',
      'Jelaskan semua penyebabnya',
    ];
  }
  if (/OBD|Tracking|Tracing|Geofence|Skyward|WAHA/i.test(combined)) {
    return [
      'Masih ada shipment lama yang menggantung',
      'Notifikasi WA/Email tidak masuk',
      'Jelaskan semua langkah pengecekan',
    ];
  }
  if (/Driver|Pairing|Unit|Contract|Reroute|JMP|DAMIRA/i.test(combined)) {
    return [
      'Tipe unit atau kategori driver berbeda',
      'JMP / Expense belum dibuat',
      'Jelaskan semua langkah solusinya',
    ];
  }

  return ['Jelaskan langkah lengkapnya', 'Buatkan tiket ke tim support'];
}
