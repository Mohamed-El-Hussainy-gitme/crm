import "dotenv/config";
import { z } from "zod";

const booleanish = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().default("postgresql://smartcrm:smartcrm@localhost:5432/smartcrm?schema=public"),
  JWT_SECRET: z.string().min(16).default("smartcrm-local-secret-123456"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: booleanish.default(false),
  SESSION_COOKIE_NAME: z.string().min(1).default("smartcrm_session"),
  SESSION_COOKIE_DOMAIN: z.string().default(""),
  SESSION_COOKIE_SECURE: booleanish.optional(),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 12),
  SESSION_JWT_EXPIRES_IN: z.string().min(2).default("12h"),
  WHATSAPP_PROVIDER: z.enum(["DEEP_LINK", "CLOUD_API"]).default("DEEP_LINK"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(""),
  WHATSAPP_API_VERSION: z.string().default("v23.0"),
});

const parsed = envSchema.parse(process.env);

const additionalOrigins = parsed.CORS_ORIGINS.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const databaseProvider = parsed.DATABASE_URL.startsWith("postgresql://") || parsed.DATABASE_URL.startsWith("postgres://")
  ? "postgresql"
  : parsed.DATABASE_URL.startsWith("file:")
    ? "sqlite"
    : "unknown";

export const env = {
  ...parsed,
  TRUST_PROXY: parsed.TRUST_PROXY,
  SESSION_COOKIE_SECURE: parsed.SESSION_COOKIE_SECURE ?? parsed.NODE_ENV === "production",
  SESSION_COOKIE_DOMAIN: parsed.SESSION_COOKIE_DOMAIN || undefined,
  CORS_ORIGINS_LIST: Array.from(new Set([parsed.APP_URL, ...additionalOrigins])),
  DATABASE_PROVIDER: databaseProvider,
};
