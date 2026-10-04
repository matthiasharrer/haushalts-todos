// TC-72: trigger-task hook tokens (ADR-0010). Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, newToken, verifyToken } from './hookToken.js';

test('TC-72 tokens: prefix, length, uniqueness', () => {
  const a = newToken();
  const b = newToken();
  assert.ok(a.startsWith('hh_'));
  assert.ok(a.length - 3 >= 43);
  assert.match(a, /^hh_[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
});

test('TC-72 hash is sha256 hex and verify accepts only the right token', () => {
  const t = newToken();
  const h = hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, t);
  assert.equal(verifyToken(t, h), true);
  const last = t.slice(-1) === 'A' ? 'B' : 'A';
  assert.equal(verifyToken(t.slice(0, -1) + last, h), false);
  assert.equal(verifyToken(newToken(), h), false);
});

test('TC-72 empty or missing input is never valid', () => {
  const h = hashToken(newToken());
  assert.equal(verifyToken('', h), false);
  assert.equal(verifyToken(null, h), false);
  assert.equal(verifyToken(undefined, h), false);
  assert.equal(verifyToken(newToken(), null), false);
  assert.equal(verifyToken(newToken(), ''), false);
  assert.equal(verifyToken('', ''), false);
});
