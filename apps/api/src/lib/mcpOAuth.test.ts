// Unit tests for the pure signing/claims logic in mcpOAuth.ts — no HTTP, no
// SDK, no DB. Run with `npm run test:unit` (apps/api), or directly via
// `tsx --test src/lib/mcpOAuth.test.ts`. See docs/testing.md TC-42…49. This is the
// auth-bypass-risk core of the MCP OAuth server (ADR-0024): a signed blob that
// verifies when it shouldn't is a forged token, so the negative cases matter
// more than the happy path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  signBlob,
  verifyBlob,
  issueAuthCode,
  issueAccessToken,
  issueRefreshToken,
  verifyPkceS256,
  timingSafeEqualStr,
  type AccessClaims,
  type CodeClaims,
  type RefreshClaims,
} from './mcpOAuth.js';

const SECRET = 'test-server-secret-01234567890';

test('access token round-trips: valid signature, right type, carries claims', () => {
  const tok = issueAccessToken({ cid: 'client-abc', uid: 7, scope: ['mcp'] }, SECRET);
  const claims = verifyBlob<AccessClaims>(tok, 'access', SECRET);
  assert.ok(claims);
  assert.equal(claims.cid, 'client-abc');
  assert.equal(claims.uid, 7);
  assert.deepEqual(claims.scope, ['mcp']);
  assert.equal(claims.typ, 'access');
  assert.ok(claims.exp > claims.iat);
});

test('a tampered payload fails verification', () => {
  const tok = issueAccessToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET);
  const [payload, sig] = tok.split('.');
  // Flip a byte in the payload but keep the old signature.
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  decoded.scope = ['mcp', 'admin']; // privilege escalation attempt
  const forgedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  assert.equal(verifyBlob(`${forgedPayload}.${sig}`, 'access', SECRET), null);
});

test('a tampered signature fails verification', () => {
  const tok = issueAccessToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET);
  const [payload] = tok.split('.');
  assert.equal(verifyBlob(`${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, 'access', SECRET), null);
});

test('a token signed with a different secret fails (secret rotation logs everything out)', () => {
  const tok = issueAccessToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET);
  assert.equal(verifyBlob(tok, 'access', 'a-different-secret'), null);
});

test('type confusion is rejected: a refresh token cannot verify as an access token', () => {
  const refresh = issueRefreshToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET);
  assert.equal(verifyBlob(refresh, 'access', SECRET), null);
  // ...and vice versa.
  const access = issueAccessToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET);
  assert.equal(verifyBlob(access, 'refresh', SECRET), null);
  // Each still verifies as its own type.
  assert.ok(verifyBlob<RefreshClaims>(refresh, 'refresh', SECRET));
  assert.ok(verifyBlob<AccessClaims>(access, 'access', SECRET));
});

test('an expired token is rejected; the same token verified earlier is accepted', () => {
  const t0 = 1_000_000_000_000; // fixed epoch-ms
  const tok = issueAccessToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET, t0);
  // Just before expiry: valid. Just after: rejected.
  assert.ok(verifyBlob<AccessClaims>(tok, 'access', SECRET, t0 + 60 * 1000));
  assert.equal(verifyBlob(tok, 'access', SECRET, t0 + (3600 + 1) * 1000), null);
});

test('malformed inputs never throw, always return null', () => {
  for (const bad of ['', '.', 'x.', '.y', 'no-dot', 'a.b.c', '!!!.???']) {
    assert.equal(verifyBlob(bad, 'access', SECRET), null);
  }
});

test('auth code carries the PKCE challenge and the exact redirect_uri', () => {
  const code = issueAuthCode(
    { cid: 'c', uid: 1, redirect_uri: 'https://claude.ai/cb', code_challenge: 'CHALLENGE', scope: ['mcp'] },
    SECRET,
  );
  const claims = verifyBlob<CodeClaims>(code, 'code', SECRET);
  assert.ok(claims);
  assert.equal(claims.redirect_uri, 'https://claude.ai/cb');
  assert.equal(claims.code_challenge, 'CHALLENGE');
});

test('PKCE S256: the matching verifier passes, a wrong one fails', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256('the-wrong-verifier', challenge), false);
  assert.equal(verifyPkceS256('', challenge), false);
});

test('timingSafeEqualStr: equal strings true, any difference false, no throw on length mismatch', () => {
  assert.equal(timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
  assert.equal(timingSafeEqualStr('', ''), true);
});

test('signBlob is deterministic for the same claims and secret', () => {
  const claims = { typ: 'access' as const, iat: 1000, exp: 4600, cid: 'c', uid: 1, scope: ['mcp'] };
  assert.equal(signBlob(claims, SECRET), signBlob(claims, SECRET));
});

test('the user id is part of the signed payload: forging uid invalidates the signature', () => {
  for (const [typ, tok] of [
    ['access', issueAccessToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET)],
    ['refresh', issueRefreshToken({ cid: 'c', uid: 1, scope: ['mcp'] }, SECRET)],
    ['code', issueAuthCode({ cid: 'c', uid: 1, redirect_uri: 'https://x/cb', code_challenge: 'C', scope: ['mcp'] }, SECRET)],
  ] as const) {
    const [payload, sig] = tok.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    assert.equal(decoded.uid, 1);
    decoded.uid = 2; // act as the other user
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    assert.equal(verifyBlob(`${forged}.${sig}`, typ, SECRET), null);
  }
});
