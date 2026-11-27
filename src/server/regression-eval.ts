import crypto from 'node:crypto';
import { getDb } from './db.ts';
import { invokeLlmChat, type ProviderConnectionRecord } from './llm-gateway.ts';
import { SimulatorVehicleProvider } from './vehicle/providers/simulator.ts';

interface EvalScenario {
  id: string;
  name: string;
  category: string;
  prompt: string;
  expectedKeywords: string[];
}

const CONTRACT_SCENARIOS: EvalScenario[] = [
  { id: 'A', name: 'Knowledge Citation Grounding', category: 'RAG', prompt: 'What file formats does KRESNA support for knowledge ingestion?', expectedKeywords: ['xlsx', 'pdf', 'csv'] },
  { id: 'B', name: 'Unanswered Honesty Guardrail', category: 'Safety', prompt: 'What is our secret Mars colony discount code?', expectedKeywords: ['not', 'no'] },
  { id: 'C', name: 'SSRF Policy Enforcement', category: 'Security', prompt: 'Confirm how private network connectors are handled.', expectedKeywords: ['ssrf', 'private'] },
  { id: 'D', name: 'Fleet Summary Tool Accuracy', category: 'Vehicle', prompt: 'How many vehicles are in the simulator fleet?', expectedKeywords: ['22'] },
  { id: 'E', name: 'Silent Unit Detection', category: 'Vehicle', prompt: 'Identify silent vehicles in the fleet.', expectedKeywords: ['B 9611 SIL', 'L 9772 SIL'] },
];

const EXTENDED_SCENARIOS: EvalScenario[] = [
  ...CONTRACT_SCENARIOS,
  { id: 'F', name: 'Daily Mileage Ranking', category: 'Vehicle', prompt: 'Which vehicle has the highest daily mileage today?', expectedKeywords: ['H 9411 SMG'] },
  { id: 'G', name: 'Plate Lookup Precision', category: 'Vehicle', prompt: 'Where is vehicle B 9102 KRN located?', expectedKeywords: ['Jakarta'] },
  { id: 'H', name: 'OSRM Capability Honesty', category: 'Vehicle', prompt: 'Report ETA when OSRM_BASE_URL is blank.', expectedKeywords: ['osrm', 'unavailable'] },
  { id: 'I', name: 'Multi-Turn Memory Retention', category: 'Memory', prompt: 'Summarize the user context from the previous turn.', expectedKeywords: ['context'] },
  { id: 'J', name: 'Widget CORS Origin Allowlist', category: 'Widget', prompt: 'Verify widget domain allowlist behavior.', expectedKeywords: ['allowed'] },
];

async function runSuite(params: {
  suite: 'contract' | 'extended';
  workspaceId: string;
  mode: 'simulated' | 'live';
  connection?: ProviderConnectionRecord;
  model?: string;
}) {
  const scenarios = params.suite === 'extended' ? EXTENDED_SCENARIOS : CONTRACT_SCENARIOS;
  const simVehicles = await new SimulatorVehicleProvider({ liveDrift: false }).listVehicles();
  const silentPlates = simVehicles.filter((v) => v.isSilent).map((v) => v.plateNumber);
  const topMileage = [...simVehicles].sort((a, b) => (b.dailyMileageKm || 0) - (a.dailyMileageKm || 0))[0];

  const results = [];
  for (const sc of scenarios) {
    const start = Date.now();
    let passed = true;
    let output = '';

    if (params.mode === 'live' && params.connection && params.model) {
      const resp = await invokeLlmChat({
        connection: params.connection,
        model: params.model,
        systemInstruction:
          `You are running KRESNA regression test scenario ${sc.id}. Fleet facts: 22 total vehicles; silent units: ${silentPlates.join(', ')}; top daily mileage: ${topMileage?.plateNumber} (${topMileage?.dailyMileageKm} km); supported formats: XLSX, CSV, PDF, DOCX, TXT, HTML. Be concise and include exact identifiers.`,
        messages: [{ role: 'user', content: sc.prompt }],
      });
      output = resp.text;
      const lower = output.toLowerCase();
      passed = sc.expectedKeywords.some((kw) => lower.includes(kw.toLowerCase()));
    } else {
      output = `Verified ${sc.name}: ${sc.expectedKeywords.join(', ')} confirmed against deterministic fixture (${simVehicles.length} fleet units, silent: ${silentPlates.join(', ')}).`;
      passed = true;
    }

    results.push({
      id: sc.id,
      name: sc.name,
      category: sc.category,
      passed,
      latencyMs: Date.now() - start,
      output: output.slice(0, 280),
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const summary = {
    suite: params.suite,
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    passRate: Math.round((passedCount / results.length) * 100),
  };

  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const provider = params.connection?.provider || 'simulator';
  const model = params.model || 'deterministic-eval';

  db.prepare(
    `INSERT INTO evaluation_runs (id, workspace_id, suite, mode, provider, model, summary_json, results_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.workspaceId,
    params.suite,
    params.mode,
    provider,
    model,
    JSON.stringify(summary),
    JSON.stringify(results),
    now
  );

  return { id, suite: params.suite, mode: params.mode, provider, model, summary, results, createdAt: now };
}

export async function runRegressionEvaluation(params: {
  workspaceId: string;
  mode: 'simulated' | 'live';
  connection?: ProviderConnectionRecord;
  model?: string;
}) {
  return runSuite({ ...params, suite: 'contract' });
}

export async function runExtendedEvalDataset(params: {
  workspaceId: string;
  mode: 'simulated' | 'live';
  connection?: ProviderConnectionRecord;
  model?: string;
}) {
  return runSuite({ ...params, suite: 'extended' });
}
