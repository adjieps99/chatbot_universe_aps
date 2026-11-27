import 'dotenv/config';
import { getDb, getDbPath } from '../src/server/db.ts';

function main() {
  const db = getDb();
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name`)
    .all() as Array<{ name: string }>;
  console.log(`[KRESNA Migrate] Database initialized at ${getDbPath()} (${tables.length} tables).`);
}

main();
