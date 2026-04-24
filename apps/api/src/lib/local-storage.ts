import { mkdir, readdir, copyFile, stat, access } from "node:fs/promises";
import path from "node:path";
import { constants, existsSync } from "node:fs";
import { env } from "../config/env.js";

function getDatabaseProvider() {
  if (env.DATABASE_URL.startsWith("file:")) return "sqlite";
  if (env.DATABASE_URL.startsWith("postgresql://") || env.DATABASE_URL.startsWith("postgres://")) return "postgresql";
  return "unknown";
}

function assertSqliteBackupMode() {
  const provider = getDatabaseProvider();
  if (provider !== "sqlite") {
    throw new Error(
      "File-based backup and restore are available only for SQLite. For PostgreSQL use managed snapshots, pg_dump, or your hosting backup strategy.",
    );
  }
}

function normalizeDbUrl(url: string) {
  if (!url.startsWith("file:")) {
    throw new Error("Only file-based SQLite DATABASE_URL is supported in local backup mode");
  }

  return url.slice("file:".length);
}

export function resolveProjectRoot() {
  return process.cwd();
}

function resolveSchemaDirectory() {
  return path.resolve(resolveProjectRoot(), "prisma");
}

export function resolveDatabasePath() {
  assertSqliteBackupMode();
  const dbRef = normalizeDbUrl(env.DATABASE_URL);

  if (path.isAbsolute(dbRef)) {
    return dbRef;
  }

  const schemaRelativePath = path.resolve(resolveSchemaDirectory(), dbRef);
  const cwdRelativePath = path.resolve(resolveProjectRoot(), dbRef);

  if (existsSync(schemaRelativePath)) {
    return schemaRelativePath;
  }

  if (existsSync(cwdRelativePath)) {
    return cwdRelativePath;
  }

  return schemaRelativePath;
}

export function resolveBackupDirectory() {
  return path.resolve(resolveProjectRoot(), "storage", "backups");
}

export async function ensureBackupDirectory() {
  const backupDir = resolveBackupDirectory();
  await mkdir(backupDir, { recursive: true });
  return backupDir;
}

export async function getStorageStatus() {
  const provider = getDatabaseProvider();
  const backupDir = await ensureBackupDirectory();

  if (provider !== "sqlite") {
    return {
      driver: provider,
      databasePath: null,
      databaseSizeBytes: null,
      dbExists: true,
      databaseMissingReason: null,
      backupDirectory: backupDir,
      backups: [],
      supportsFileBackups: false,
      backupStrategy: "Use managed PostgreSQL backups, snapshots, or pg_dump outside the app process.",
    };
  }

  const dbPath = resolveDatabasePath();
  const backupEntries = await readdir(backupDir);
  const backups = await Promise.all(
    backupEntries
      .filter((entry) => entry.endsWith(".db"))
      .sort()
      .reverse()
      .map(async (fileName) => {
        const filePath = path.join(backupDir, fileName);
        const fileStats = await stat(filePath);
        return {
          fileName,
          filePath,
          sizeBytes: fileStats.size,
          createdAt: fileStats.birthtime.toISOString(),
          updatedAt: fileStats.mtime.toISOString(),
        };
      }),
  );

  try {
    const dbStats = await stat(dbPath);
    return {
      driver: "sqlite-file",
      databasePath: dbPath,
      databaseSizeBytes: dbStats.size,
      dbExists: true,
      databaseMissingReason: null,
      backupDirectory: backupDir,
      backups,
      supportsFileBackups: true,
      backupStrategy: "Local file copy",
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;

    return {
      driver: "sqlite-file",
      databasePath: dbPath,
      databaseSizeBytes: 0,
      dbExists: false,
      databaseMissingReason: "Database file does not exist yet. Run prisma db push or db:seed first.",
      backupDirectory: backupDir,
      backups,
      supportsFileBackups: true,
      backupStrategy: "Local file copy",
    };
  }
}

export async function createDatabaseBackup(label?: string) {
  assertSqliteBackupMode();
  const dbPath = resolveDatabasePath();
  const backupDir = await ensureBackupDirectory();

  try {
    await access(dbPath, constants.F_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error("Database file does not exist yet. Run prisma db push or db:seed first.");
    }
    throw error;
  }

  const sanitizedLabel = (label || "manual")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "manual";

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${timestamp}-${sanitizedLabel}.db`;
  const targetPath = path.join(backupDir, fileName);

  await copyFile(dbPath, targetPath);

  const fileStats = await stat(targetPath);

  return {
    fileName,
    filePath: targetPath,
    sizeBytes: fileStats.size,
    createdAt: fileStats.birthtime.toISOString(),
  };
}

export async function restoreDatabaseBackup(fileName: string) {
  assertSqliteBackupMode();

  if (!/^[a-zA-Z0-9._-]+\.db$/.test(fileName)) {
    throw new Error("Invalid backup file name");
  }

  const backupDir = await ensureBackupDirectory();
  const backupPath = path.join(backupDir, fileName);
  const dbPath = resolveDatabasePath();

  await access(backupPath, constants.F_OK);
  await mkdir(path.dirname(dbPath), { recursive: true });
  await copyFile(backupPath, dbPath);

  const dbStats = await stat(dbPath);

  return {
    restoredFrom: fileName,
    databasePath: dbPath,
    databaseSizeBytes: dbStats.size,
    restoredAt: new Date().toISOString(),
  };
}
