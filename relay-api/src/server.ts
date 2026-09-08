import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPgStore } from "./store.js";

const config = loadConfig();
if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
});

const app = createApp(createPgStore(pool), config);
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`oneliferelay_api_listening port=${info.port}`);
});

async function shutdown(signal: string) {
  console.log(`oneliferelay_api_shutdown signal=${signal}`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
