// Trigger-task hook tokens (ADR-0010). Pure. A token is 32 random bytes; only
// its SHA-256 hash is stored, so a DB leak doesn't hand out working tokens.
// The token is high-entropy, so a fast hash is enough.
import crypto from 'node:crypto';

export const TOKEN_PREFIX = 'hh_';

export function newToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time check of a presented token against a stored hash. False for empty or missing input. */
export function verifyToken(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
