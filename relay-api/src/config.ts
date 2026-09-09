import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_ORIGINS = [
  "https://relay.collinworks.dev",
  "https://jungcollin.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
] as const;

const DEFAULT_CATALOG_PATH = fileURLToPath(new URL("../../content/catalog.json", import.meta.url));

export interface Config {
  nodeEnv: string;
  port: number;
  host: string;
  databaseUrl: string;
  sessionSigningSecret: string;
  corsOrigins: Set<string>;
  rankedWritesV2: boolean;
  analyticsIngest: boolean;
  adminToken: string;
  trustRelayClientIp: boolean;
  creatorStagesByGithub: Map<string, string[]>;
}

function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
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
    rankedWritesV2: readFlag(env.RANKED_WRITES_V2, false),
    analyticsIngest: readFlag(env.ANALYTICS_INGEST, false),
    adminToken: env.ADMIN_TOKEN?.trim() || "",
    trustRelayClientIp: readFlag(env.TRUST_RELAY_CLIENT_IP, env.NODE_ENV === "production"),
    creatorStagesByGithub: loadCreatorStages(env),
  };
}

function loadCreatorStages(env: NodeJS.ProcessEnv): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const rawJson = env.CREATOR_STAGES_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      for (const [github, ids] of Object.entries(parsed)) {
        if (!Array.isArray(ids)) continue;
        map.set(github.toLowerCase(), ids.filter((id): id is string => typeof id === "string"));
      }
    } catch {
      return map;
    }
    return map;
  }
  const catalogPath = env.CATALOG_PATH?.trim() || DEFAULT_CATALOG_PATH;
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      entries?: Array<{ id?: unknown; creator?: { github?: unknown } }>;
    };
    for (const entry of catalog.entries || []) {
      const github = typeof entry.creator?.github === "string" ? entry.creator.github.trim().toLowerCase() : "";
      const id = typeof entry.id === "string" ? entry.id : "";
      if (!github || !id) continue;
      const list = map.get(github) || [];
      list.push(id);
      map.set(github, list);
    }
  } catch {
    return map;
  }
  return map;
}
