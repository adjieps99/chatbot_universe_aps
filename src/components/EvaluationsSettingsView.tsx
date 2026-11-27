import { useEffect, useState } from 'react';
import { CheckCircle2, Database, FlaskConical, HardDriveDownload, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

export function EvaluationsSettingsView() {
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [sysInfo, setSysInfo] = useState<{
    databasePath: string;
    databaseSizeBytes: number;
    backups: Array<{ name: string; sizeBytes: number }>;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  const loadAll = async () => {
    const [ev, sys] = await Promise.all([
      apiFetch<{ runs: Array<Record<string, unknown>> }>('/api/evaluations'),
      apiFetch<{
        databasePath: string;
        databaseSizeBytes: number;
        backups: Array<{ name: string; sizeBytes: number }>;
      }>('/api/system/info'),
    ]);
    setRuns(ev.runs);
    setSysInfo(sys);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleRunEval = async (suite: 'contract' | 'extended') => {
    setRunning(true);
    setMsg('');
    try {
      await apiFetch('/api/evaluations/run', {
        method: 'POST',
        body: JSON.stringify({ mode: 'simulated', suite }),
      });
      setMsg(`Completed ${suite} regression suite.`);
      await loadAll();
    } finally {
      setRunning(false);
    }
  };

  const handleBackup = async () => {
    const res = await apiFetch<{ backup: { name: string } }>('/api/system/backup', {
      method: 'POST',
    });
    setMsg(`Created SQLite snapshot: ${res.backup.name}`);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Evaluations & System Persistence</h1>
        <p className="text-sm text-slate-500">
          Run Regression Evaluation Suites (Scenarios A–J) and manage SQLite database backups.
        </p>
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <FlaskConical className="h-4 w-4 text-blue-600" />
              Regression Evaluation Suite
            </div>
            <div className="flex gap-2">
              <button
                disabled={running}
                onClick={() => handleRunEval('contract')}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Run Core (A–E)
              </button>
              <button
                disabled={running}
                onClick={() => handleRunEval('extended')}
                className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Run Full Suite (A–J)
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {runs.map((r) => {
              const summary = JSON.parse(String(r.summary_json || '{}')) as {
                passRate?: number;
                passed?: number;
                total?: number;
              };
              const results = JSON.parse(String(r.results_json || '[]')) as Array<{
                id: string;
                name: string;
                passed: boolean;
              }>;
              return (
                <div key={String(r.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>{String(r.model)}</span>
                    <span className="text-emerald-700">
                      {summary.passed}/{summary.total} ({summary.passRate}%)
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {results.map((item) => (
                      <div key={item.id} className="flex items-center gap-1.5 text-slate-700">
                        {item.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                        <span>
                          {item.id}. {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {runs.length === 0 && (
              <p className="text-xs text-slate-500">Click "Run Full Suite (A–J)" to verify RAG, SSRF, and Vehicle Intelligence contracts.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Database className="h-4 w-4 text-slate-700" />
              SQLite Database & Snapshots
            </div>
            <button
              onClick={handleBackup}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <HardDriveDownload className="h-3.5 w-3.5" />
              Create Backup
            </button>
          </div>
          {sysInfo && (
            <div className="space-y-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 font-mono text-slate-700">
                <div>Path: {sysInfo.databasePath}</div>
                <div className="mt-1">Size: {(sysInfo.databaseSizeBytes / 1024).toFixed(1)} KB</div>
              </div>
              {sysInfo.backups.length > 0 && (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-700">Recent Backups</p>
                  {sysInfo.backups.map((b) => (
                    <div key={b.name} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 font-mono">
                      <span>{b.name}</span>
                      <span>{(b.sizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
