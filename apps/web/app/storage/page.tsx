"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { RolePageGuard } from "@/components/permissions";
import { Card } from "@/components/cards";
import { apiFetch } from "@/lib/api";

type Backup = {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

type StorageStatus = {
  driver: string;
  databasePath: string;
  databaseSizeBytes: number;
  dbExists: boolean;
  databaseMissingReason: string | null;
  backupDirectory: string;
  backups: Backup[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function StoragePage() {
  const [data, setData] = useState<StorageStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setError("");
      const status = await apiFetch<StorageStatus>("/storage");
      setData(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load storage status");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateBackup() {
    try {
      setCreating(true);
      setError("");
      setMessage("");
      const response = await apiFetch<{ message: string }>("/storage/backups", {
        method: "POST",
        body: JSON.stringify({ label: label || undefined }),
      });
      setMessage(response.message);
      setLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(fileName: string) {
    const confirmed = window.confirm(`Restore backup ${fileName}? This will overwrite the current local database file.`);
    if (!confirmed) return;

    try {
      setRestoringFile(fileName);
      setError("");
      setMessage("");
      await apiFetch("/storage/restore", {
        method: "POST",
        body: JSON.stringify({ fileName }),
      });
      setMessage(`Restored ${fileName} successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore backup");
    } finally {
      setRestoringFile(null);
    }
  }

  return (
    <AppShell>
      <RolePageGuard minimumRole="ADMIN">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Local Storage</h1>
          <p className="mt-2 text-slate-400">
            SQLite file storage, local backups, and restore controls for the desktop profile.
          </p>
        </div>

        {error ? <p className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</p> : null}
        {message ? <p className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-emerald-300">{message}</p> : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card title="Storage Status">
            {data ? (
              <div className="space-y-4 text-sm text-slate-300">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-slate-400">Driver</p>
                    <p className="mt-2 text-base font-medium text-white">{data.driver}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-slate-400">Database Size</p>
                    <p className="mt-2 text-base font-medium text-white">{formatBytes(data.databaseSizeBytes)}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-slate-400">Database Path</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-200">{data.databasePath}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-slate-400">Backup Directory</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-200">{data.backupDirectory}</p>
                </div>
                {!data.dbExists ? (
                  <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-4 text-amber-300">
                    <p className="font-medium">Database file not found</p>
                    <p className="mt-2 text-sm text-amber-200">{data.databaseMissingReason || "Run prisma db push or db:seed first."}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-slate-400">Loading storage status...</p>
            )}
          </Card>

          <Card title="Create Backup">
            <div className="space-y-4">
              <label className="block text-sm text-slate-300">
                <span className="mb-2 block text-slate-400">Backup label</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="before-major-edit"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
                />
              </label>
              <button
                onClick={handleCreateBackup}
                disabled={creating || !data?.dbExists}
                className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating backup..." : "Create local backup"}
              </button>
              <p className="text-xs text-slate-500">
                Backups are stored on disk beside the app, so they remain available offline.
              </p>
            </div>
          </Card>
        </div>

        <Card title="Available Backups">
          {!data ? (
            <p className="text-slate-400">Loading backups...</p>
          ) : data.backups.length === 0 ? (
            <p className="text-slate-400">No backups created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="px-4 py-3 font-medium">File</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.backups.map((backup) => (
                    <tr key={backup.fileName} className="border-b border-slate-900">
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-xs text-white">{backup.fileName}</div>
                        <div className="mt-1 break-all text-xs text-slate-500">{backup.filePath}</div>
                      </td>
                      <td className="px-4 py-3 align-top">{formatBytes(backup.sizeBytes)}</td>
                      <td className="px-4 py-3 align-top">{new Date(backup.updatedAt).toLocaleString()}</td>
                      <td className="px-4 py-3 align-top">
                        <button
                          onClick={() => handleRestore(backup.fileName)}
                          disabled={restoringFile === backup.fileName}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {restoringFile === backup.fileName ? "Restoring..." : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      </RolePageGuard>
    </AppShell>
  );
}
