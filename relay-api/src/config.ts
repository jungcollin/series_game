const DEFAULT_ORIGINS = [
  "https://relay.collinworks.dev",
  "https://jungcollin.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
] as const;

export interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  sessionSigningSecret: string;
  corsOrigins: Set<string>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8798);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const databaseUrl = env.DATABASE_URL?.trim();
  const sessionSigningSecret = env.SESSION_SIGNING_SECRET?.trim();
  if (env.NODE_ENV === "production" && !databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (env.NODE_ENV === "production" && (!sessionSigningSecret || sessionSigningSecret.length < 32)) {
    throw new Error("SESSION_SIGNING_SECRET (at least 32 characters) is required in production");
  }
  const extra = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port,
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: databaseUrl ?? "",
    sessionSigningSecret: sessionSigningSecret || "development-only-session-secret-32chars",
    corsOrigins: new Set([...DEFAULT_ORIGINS, ...extra]),
  };
}
