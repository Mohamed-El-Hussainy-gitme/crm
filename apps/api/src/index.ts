import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { registerReminderJobs } from "./cron/reminders.js";

const app = buildApp();
registerReminderJobs();

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(
      {
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        database: env.DATABASE_PROVIDER,
        proxyAware: env.TRUST_PROXY,
      },
      "api started",
    );
  } catch (error) {
    app.log.error({ error }, "failed to start api");
    process.exit(1);
  }
}

process.on("unhandledRejection", (error) => {
  app.log.error({ error }, "unhandled rejection");
});

process.on("uncaughtException", (error) => {
  app.log.fatal({ error }, "uncaught exception");
  process.exit(1);
});

void start();
