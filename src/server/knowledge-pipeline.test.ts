import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDbFile = path.join(
  os.tmpdir(),
  `kresna-kp-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.KRESNA_DB_PATH = tempDbFile;

test('ingests logis.xlsx into atomic Q&A row chunks and retrieves via FTS5', async (t) => {
  t.after(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbFile}${suffix}`)) {
        fs.rmSync(`${tempDbFile}${suffix}`, { force: true });
      }
    }
  });

  const { getDb } = await import('./db.ts');
  const { ingestUploadedKnowledgeFile, ingestManualKnowledgeRecord } = await import(
    './knowledge-pipeline.ts'
  );
  const { retrieveHybridKnowledge } = await import('./retrieval.ts');

  const db = getDb();
  const ws = db.prepare(`SELECT id FROM workspaces LIMIT 1`).get() as { id: string };
  const bot = db
    .prepare(`SELECT id FROM chatbots WHERE chatbot_type = 'knowledge_faq' LIMIT 1`)
    .get() as { id: string };

  const manual = await ingestManualKnowledgeRecord({
    workspaceId: ws.id,
    chatbotId: bot.id,
    title: 'Cut-off SLA Policy',
    sourceType: 'faq',
    content: 'Standard dispatch cut-off is 16:00 WIB Monday through Saturday.',
  });
  assert.equal(manual.indexing.chunkCount, 1);

  const logisPath = path.resolve(process.cwd(), 'logis.xlsx');
  assert.equal(fs.existsSync(logisPath), true, 'logis.xlsx must exist in workspace root');
  const buf = fs.readFileSync(logisPath);

  const uploaded = await ingestUploadedKnowledgeFile({
    workspaceId: ws.id,
    chatbotId: bot.id,
    fileName: 'logis.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: buf,
    title: 'LOGis QnA Master',
  });

  // logis.xlsx has 5 sheets totaling >50 Q&A rows; each row should remain an atomic chunk
  assert.ok(uploaded.indexing.chunkCount >= 40, `Expected >=40 row chunks, got ${uploaded.indexing.chunkCount}`);

  const ujpSearch = await retrieveHybridKnowledge({
    workspaceId: ws.id,
    chatbotId: bot.id,
    query: 'UJP Waiting Process From SAP transfer',
    topK: 3,
  });
  assert.ok(ujpSearch.chunks.length > 0);
  assert.match(ujpSearch.chunks[0].content, /UJP|SAP/i);

  const podSearch = await retrieveHybridKnowledge({
    workspaceId: ws.id,
    chatbotId: bot.id,
    query: 'POD sudah approve SO tidak muncul',
    topK: 3,
  });
  assert.ok(podSearch.chunks.length > 0);
});
