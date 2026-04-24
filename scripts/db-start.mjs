import { spawnSync, spawn } from "node:child_process";

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
}

function canRun(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: process.platform === "win32" });
  return result.status === 0;
}

const compose = canRun("docker", ["compose", "version"])
  ? { command: "docker", args: ["compose"] }
  : canRun("docker-compose", ["version"])
    ? { command: "docker-compose", args: [] }
    : null;

if (!canRun("docker", ["version"])) {
  console.error("Docker is not available. Start Docker Desktop / Docker Engine, then run npm run db:start again.");
  process.exit(1);
}

if (!compose) {
  console.error("Docker Compose is not available. Install Docker Desktop or docker compose plugin.");
  process.exit(1);
}

const up = run(compose.command, [...compose.args, "up", "-d", "postgres"]);
if (up.status !== 0) process.exit(up.status ?? 1);

const maxAttempts = 45;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const ready = spawnSync("docker", ["exec", "smartcrm-postgres", "pg_isready", "-U", "smartcrm", "-d", "smartcrm"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });

  if (ready.status === 0) {
    console.log("PostgreSQL is ready on localhost:5432.");
    process.exit(0);
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}

console.error("PostgreSQL container started but did not become ready within 45 seconds.");
process.exit(1);
