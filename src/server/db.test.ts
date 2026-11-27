import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDbFile = path.join(
  os.tmpdir(),
  `kresna-db-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);
process.env.KRESNA_DB_PATH = tempDbFile;

test('SQLite schema initializes local workspace, seeded chatbots, and FTS5 table', async (t) => {
  t.after(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${tempDbFile}${suffix}`)) {
        fs.rmSync(`${tempDbFile}${suffix}`, { force: true });
      }
    }
  });

  const { getDb, getDbPath } = await import('./db.ts');
  assert.equal(getDbPath(), tempDbFile);

  const db = getDb();
  const workspaces = db.prepare(`SELECT id, name FROM workspaces`).all() as Array<{
    id: string;
    name: string;
  }>;
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0].name, 'My Workspace');

  const chatbots = db.prepare(`SELECT name, chatbot_type FROM chatbots`).all() as Array<{
    name: string;
    chatbot_type: string;
  }>;
  assert.ok(chatbots.some((c) => c.chatbot_type === 'knowledge_faq'));
  assert.ok(chatbots.some((c) => c.chatbot_type === 'vehicle_intelligence'));

  const fts = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_chunks_fts'`)
    .get() as { name: string } | undefined;
  assert.equal(fts?.name, 'knowledge_chunks_fts');
});
