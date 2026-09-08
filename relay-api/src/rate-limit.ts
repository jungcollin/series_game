import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs?: number;
  writeLimit?: number;
  maxEntries?: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60_000;
  const writeLimit = options.writeLimit ?? 30;
  const maxEntries = options.maxEntries ?? 10_000;
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    const path = c.req.path;
    const method = c.req.method.toUpperCase();
    if (!path.startsWith("/v1/") || path === "/v1/health" || method === "GET" || method === "HEAD" || method === "OPTIONS") {
      await next();
      return;
    }

    const now = Date.now();
    const key = `write:${clientAddress(c)}`;
    const bucket = buckets.get(key);
    const current = bucket && bucket.resetAt > now
      ? bucket
      : { count: 0, resetAt: now + windowMs };

    current.count += 1;
    buckets.set(key, current);
    pruneExpiredBuckets(buckets, now, maxEntries);

    const remaining = Math.max(0, writeLimit - current.count);
    c.header("X-RateLimit-Limit", String(writeLimit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

    if (current.count > writeLimit) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "rate_limited", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        429,
      );
    }

    await next();
  };
}

function clientAddress(c: Context): string {
  const cloudflareAddress = c.req.header("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress;

  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  return c.req.header("x-real-ip")?.trim() || "unknown";
}

function pruneExpiredBuckets(buckets: Map<string, Bucket>, now: number, maxEntries: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now || buckets.size > maxEntries) buckets.delete(key);
  }
}
