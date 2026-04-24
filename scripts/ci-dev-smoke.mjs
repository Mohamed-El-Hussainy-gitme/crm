import { spawn } from "node:child_process";
import process from "node:process";

const ROOT = process.cwd();
const API_ORIGIN = process.env.CI_API_ORIGIN ?? "http://127.0.0.1:4000";
const WEB_ORIGIN = process.env.CI_WEB_ORIGIN ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.CI_ADMIN_EMAIL ?? "admin@smartcrm.local";
const ADMIN_PASSWORD = process.env.CI_ADMIN_PASSWORD ?? "Admin123!";
const STARTUP_TIMEOUT_MS = Number(process.env.CI_DEV_STARTUP_TIMEOUT_MS ?? 120_000);
const POLL_INTERVAL_MS = Number(process.env.CI_DEV_POLL_INTERVAL_MS ?? 1_000);

const logs = [];
const child = spawn("npm", ["run", "dev"], {
  cwd: ROOT,
  shell: process.platform === "win32",
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_API_URL: `${API_ORIGIN}/api`,
    LOG_LEVEL: process.env.LOG_LEVEL ?? "silent",
  },
});

function appendLog(source, chunk) {
  const text = chunk.toString();
  logs.push(...text.split(/\r?\n/).filter(Boolean).map((line) => `[${source}] ${line}`));
  if (logs.length > 160) logs.splice(0, logs.length - 160);
}

child.stdout.on("data", (chunk) => appendLog("stdout", chunk));
child.stderr.on("data", (chunk) => appendLog("stderr", chunk));

let childExit = null;
child.on("exit", (code, signal) => {
  childExit = { code, signal };
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown() {
  if (!child.pid || childExit) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Process already stopped.
    }
  }

  await sleep(2_000);
  if (!childExit) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Process already stopped.
      }
    }
  }
}

function assertStatus(response, expectedStatuses, label) {
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${label} returned ${response.status}; expected ${expectedStatuses.join(" or ")}`);
  }
}

async function request(label, url, options = {}, expectedStatuses = [200]) {
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: {
      accept: "application/json, text/html;q=0.9, */*;q=0.8",
      ...(options.headers ?? {}),
    },
  });
  assertStatus(response, expectedStatuses, label);
  return response;
}

async function waitFor(label, url, expectedStatuses = [200]) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    if (childExit) {
      throw new Error(`npm run dev exited early: ${JSON.stringify(childExit)}`);
    }

    try {
      return await request(label, url, {}, expectedStatuses);
    } catch (error) {
      lastError = error;
      await sleep(POLL_INTERVAL_MS);
    }
  }

  throw new Error(`${label} was not ready within ${STARTUP_TIMEOUT_MS}ms. Last error: ${lastError?.message ?? "unknown"}`);
}

async function main() {
  try {
    await waitFor("API live health", `${API_ORIGIN}/health/live`);
    await waitFor("Web login page", `${WEB_ORIGIN}/login`);

    await request("Unauthenticated /api/auth/me", `${API_ORIGIN}/api/auth/me`, {}, [401]);

    const loginResponse = await request(
      "Login endpoint",
      `${API_ORIGIN}/api/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      },
      [200],
    );

    const setCookie = loginResponse.headers.get("set-cookie");
    const sessionCookie = setCookie?.split(";", 1)[0];
    if (!sessionCookie) {
      throw new Error("Login endpoint did not return a session cookie");
    }

    await request("Authenticated /api/auth/me", `${API_ORIGIN}/api/auth/me`, {
      headers: { cookie: sessionCookie },
    });

    await request("Authenticated follow-up overview", `${API_ORIGIN}/api/follow-ups/overview`, {
      headers: { cookie: sessionCookie },
    });

    console.log("CI dev smoke passed: npm run dev serves API, web, auth, and follow-up overview.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("\nLast npm run dev logs:");
    console.error(logs.join("\n") || "No logs captured.");
    process.exitCode = 1;
  } finally {
    await shutdown();
  }
}

await main();
