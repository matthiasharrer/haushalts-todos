import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addInterval, diffDays, todayBerlin } from './dates.js';

test('TC-10 todayBerlin: 22:30Z is already the next day in Berlin', () => {
  assert.equal(todayBerlin(new Date('2026-10-02T22:30:00Z')), '2026-10-03');
});

test('TC-10 todayBerlin: DST night 2026-03-29', () => {
  assert.equal(todayBerlin(new Date('2026-03-29T00:30:00Z')), '2026-03-29');
});

test('TC-08 addInterval clamps months', () => {
  assert.equal(addInterval('2026-01-31', 1, 'MONTH'), '2026-02-28');
  assert.equal(addInterval('2028-01-31', 1, 'MONTH'), '2028-02-29');
  assert.equal(addInterval('2026-11-30', 3, 'MONTH'), '2027-02-28');
  assert.equal(addInterval('2026-12-15', 1, 'MONTH'), '2027-01-15');
});

test('TC-09 addInterval days/weeks across year boundary and DST', () => {
  assert.equal(addInterval('2026-12-30', 3, 'DAY'), '2027-01-02');
  assert.equal(addInterval('2026-03-25', 1, 'WEEK'), '2026-04-01');
  assert.equal(addInterval('2026-10-20', 2, 'WEEK'), '2026-11-03');
});

test('diffDays is signed and DST-safe', () => {
  assert.equal(diffDays('2026-10-10', '2026-10-17'), 7);
  assert.equal(diffDays('2026-10-17', '2026-10-10'), -7);
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(diffDays('2026-10-24', '2026-10-26'), 2);
});
