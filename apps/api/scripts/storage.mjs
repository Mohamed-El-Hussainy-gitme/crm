import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const action = process.argv[2];
const arg = process.argv[3] || 'manual';
const cwd = process.cwd();
const schemaDir = path.resolve(cwd, 'prisma');
const dbUrl = process.env.DATABASE_URL || 'postgresql://smartcrm:smartcrm@localhost:5432/smartcrm?schema=public';
const isSqlite = dbUrl.startsWith('file:');

function unsupported() {
  console.error('File-based backup commands are only available for SQLite. For PostgreSQL use managed snapshots, pg_dump, or your platform backup tooling.');
  process.exit(1);
}

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('Only file-based SQLite DATABASE_URL is supported');
  }

  const dbRef = databaseUrl.slice('file:'.length);
  if (path.isAbsolute(dbRef)) {
    return dbRef;
  }

  const schemaRelativePath = path.resolve(schemaDir, dbRef);
  const cwdRelativePath = path.resolve(cwd, dbRef);

  if (existsSync(schemaRelativePath)) return schemaRelativePath;
  if (existsSync(cwdRelativePath)) return cwdRelativePath;
  return schemaRelativePath;
}

if (!isSqlite) unsupported();

const dbPath = resolveDatabasePath(dbUrl);
const backupDir = path.resolve(cwd, 'storage', 'backups');

await fs.mkdir(backupDir, { recursive: true });

if (action === 'backup') {
  try {
    await fs.access(dbPath);
  } catch {
    console.error('Database file does not exist yet. Run prisma db push or db:seed first.');
    process.exit(1);
  }

  const label = arg.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'manual';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}-${label}.db`;
  const targetPath = path.join(backupDir, fileName);
  await fs.copyFile(dbPath, targetPath);
  console.log(targetPath);
  process.exit(0);
}

if (action === 'restore') {
  const fileName = arg;
  const sourcePath = path.join(backupDir, fileName);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.copyFile(sourcePath, dbPath);
  console.log(dbPath);
  process.exit(0);
}

if (action === 'list') {
  const items = (await fs.readdir(backupDir)).filter((item) => item.endsWith('.db')).sort().reverse();
  console.log(JSON.stringify(items, null, 2));
  process.exit(0);
}

console.error('Usage: node apps/api/scripts/storage.mjs <backup|restore|list> [label|fileName]');
process.exit(1);
