import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDueDate } from './recurrence.js';

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
