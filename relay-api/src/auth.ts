import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export class UnauthorizedError extends Error {
  constructor(message = "인증이 필요합니다.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(secret: string, now = Date.now()) {
  const subject = randomUUID();
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${subject}.${expiresAt}`;
  return { token: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): string {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) throw new UnauthorizedError();
  const [version, subject, expiryText, signature] = parts;
  const expiresAt = Number(expiryText);
  if (!/^[0-9a-f-]{36}$/i.test(subject) || !Number.isInteger(expiresAt) || expiresAt <= now / 1000) {
    throw new UnauthorizedError();
  }
  const payload = `${version}.${subject}.${expiryText}`;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedError();
  return subject;
}

export function requireSessionSubject(authorization: string | undefined, secret: string): string {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization || "");
  if (!match) throw new UnauthorizedError();
  return verifySessionToken(match[1], secret);
}
