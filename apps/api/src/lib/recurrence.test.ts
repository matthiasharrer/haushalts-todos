import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inSeason, nextDueDate, normalizeSeason, seasonDate } from './recurrence.js';

test('TC-06 AFTER_COMPLETION counts from the completion date', () => {
  const t = { dueDate: '2026-10-01', every: 2, unit: 'WEEK', mode: 'AFTER_COMPLETION' } as const;
  assert.equal(nextDueDate(t, '2026-10-04'), '2026-10-18');
  assert.equal(nextDueDate(t, '2026-09-28'), '2026-10-12');
});

test('TC-07 FIXED consumes the current slot and skips missed ones', () => {
  const t = { dueDate: '2026-10-06', every: 1, unit: 'WEEK', mode: 'FIXED' } as const;
  assert.equal(nextDueDate(t, '2026-10-06'), '2026-10-13');
  assert.equal(nextDueDate(t, '2026-10-05'), '2026-10-13');
  assert.equal(nextDueDate(t, '2026-10-15'), '2026-10-20');
});

test('TC-08 months clamp; FIXED continues from the clamped date', () => {
  const ac = (dueDate: string) =>
    ({ dueDate, every: 1, unit: 'MONTH', mode: 'AFTER_COMPLETION' }) as const;
  assert.equal(nextDueDate(ac('2026-01-31'), '2026-01-31'), '2026-02-28');
  assert.equal(nextDueDate(ac('2028-01-31'), '2028-01-31'), '2028-02-29');
  const fixed = { dueDate: '2026-01-31', every: 1, unit: 'MONTH', mode: 'FIXED' } as const;
  assert.equal(nextDueDate(fixed, '2026-01-31'), '2026-02-28');
  assert.equal(nextDueDate({ ...fixed, dueDate: '2026-02-28' }, '2026-02-28'), '2026-03-28');
});

test('TC-09 days unit across the year boundary', () => {
  const t = { dueDate: '2026-12-30', every: 3, unit: 'DAY', mode: 'AFTER_COMPLETION' } as const;
  assert.equal(nextDueDate(t, '2026-12-30'), '2027-01-02');
});

test('TC-50 seasonDate', () => {
  const s = { from: 3, to: 10 };
  assert.equal(seasonDate('2026-10-31', s), '2026-10-31');
  assert.equal(seasonDate('2026-11-01', s), '2027-03-01');
  assert.equal(seasonDate('2026-02-10', s), '2026-03-01');
  assert.equal(seasonDate('2026-03-01', s), '2026-03-01');
  const w = { from: 11, to: 2 };
  assert.equal(seasonDate('2026-12-15', w), '2026-12-15');
  assert.equal(seasonDate('2027-01-31', w), '2027-01-31');
  assert.equal(seasonDate('2026-03-01', w), '2026-11-01');
  assert.equal(seasonDate('2026-07-01', { from: 6, to: 6 }), '2027-06-01');
  assert.equal(seasonDate('2026-07-01', null), '2026-07-01');
  assert.equal(inSeason('2026-01-15', w), true);
  assert.equal(inSeason('2026-06-15', w), false);
  assert.equal(normalizeSeason({ from: 1, to: 12 }), null);
  assert.equal(normalizeSeason({ from: 3, to: 2 }), null);
  assert.deepEqual(normalizeSeason({ from: 3, to: 10 }), { from: 3, to: 10 });
  assert.equal(normalizeSeason(undefined), null);
});

test('TC-51 nextDueDate with a season', () => {
  const ac = { dueDate: '2026-10-01', every: 2, unit: 'WEEK', mode: 'AFTER_COMPLETION', season: { from: 3, to: 10 } } as const;
  assert.equal(nextDueDate(ac, '2026-10-10'), '2026-10-24');
  assert.equal(nextDueDate(ac, '2026-10-20'), '2027-03-01');
  const fixed = { dueDate: '2026-10-27', every: 1, unit: 'WEEK', mode: 'FIXED', season: { from: 3, to: 10 } } as const;
  assert.equal(nextDueDate(fixed, '2026-10-27'), '2027-03-01');
  const m = { dueDate: '2027-02-15', every: 1, unit: 'MONTH', mode: 'AFTER_COMPLETION', season: { from: 11, to: 2 } } as const;
  assert.equal(nextDueDate(m, '2027-02-15'), '2027-11-01');
});
