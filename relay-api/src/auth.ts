import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_V1 = "v1";
const TOKEN_V2 = "v2";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_COOKIE_NAME = "relay_session";

export class UnauthorizedError extends Error {
  constructor(message = "인증이 필요합니다.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "권한이 없습니다.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "찾을 수 없습니다.") {
    super(message);
    this.name = "NotFoundError";
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const expected = Buffer.from(left);
  const actual = Buffer.from(right);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface SessionToken {
  token: string;
  expiresAt: number;
  subject: string;
  jti: string;
}

export interface VerifiedSession {
  subject: string;
  jti: string | null;
  token: string;
}

export function createSessionToken(secret: string, now = Date.now()): SessionToken {
  const subject = randomUUID();
  const jti = randomUUID();
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${TOKEN_V2}.${jti}.${subject}.${expiresAt}`;
  return { token: `${payload}.${sign(payload, secret)}`, expiresAt, subject, jti };
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): VerifiedSession {
  const parts = token.split(".");
  if (parts[0] === TOKEN_V2 && parts.length === 5) {
    const [, jti, subject, expiryText, signature] = parts;
    const expiresAt = Number(expiryText);
    if (!/^[0-9a-f-]{36}$/i.test(jti) || !/^[0-9a-f-]{36}$/i.test(subject) || !Number.isInteger(expiresAt) || expiresAt <= now / 1000) {
      throw new UnauthorizedError();
    }
    const payload = `${TOKEN_V2}.${jti}.${subject}.${expiryText}`;
    if (!safeEqual(sign(payload, secret), signature)) throw new UnauthorizedError();
    return { subject, jti, token };
  }
  if (parts[0] === TOKEN_V1 && parts.length === 4) {
    const [version, subject, expiryText, signature] = parts;
    const expiresAt = Number(expiryText);
    if (!/^[0-9a-f-]{36}$/i.test(subject) || !Number.isInteger(expiresAt) || expiresAt <= now / 1000) {
      throw new UnauthorizedError();
    }
    const payload = `${version}.${subject}.${expiryText}`;
    if (!safeEqual(sign(payload, secret), signature)) throw new UnauthorizedError();
    return { subject, jti: null, token };
  }
  throw new UnauthorizedError();
}

export function readSessionToken(authorization?: string, cookieHeader?: string): string | undefined {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization || "");
  if (match) return match[1];
  const cookieMatch = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`).exec(cookieHeader || "");
  if (cookieMatch) return cookieMatch[1];
  return undefined;
}

export function requireSession(authorization: string | undefined, secret: string, cookieHeader?: string): VerifiedSession {
  const token = readSessionToken(authorization, cookieHeader);
  if (!token) throw new UnauthorizedError();
  return verifySessionToken(token, secret);
}

export function requireSessionSubject(authorization: string | undefined, secret: string, cookieHeader?: string): string {
  return requireSession(authorization, secret, cookieHeader).subject;
}

export function buildSessionCookie(token: string, expiresAt: number, secure: boolean): string {
  const maxAge = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : null,
    secure ? "SameSite=None" : "SameSite=Lax",
  ].filter(Boolean).join("; ");
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  return safeEqual(left, right);
}
