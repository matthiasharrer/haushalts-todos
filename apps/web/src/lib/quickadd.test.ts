/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, berlinToday, weekendDate } from './format.js';

// TC-100 (dates behind the quick-add chips). 2026-10-15 is a Thursday.
test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-10-15', 1), '2026-10-16');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('weekendDate: the coming Saturday, or today on the weekend', () => {
  assert.equal(weekendDate('2026-10-15'), '2026-10-17'); // Thu -> Sat
  assert.equal(weekendDate('2026-10-12'), '2026-10-17'); // Mon -> Sat
  assert.equal(weekendDate('2026-10-16'), '2026-10-17'); // Fri -> Sat
  assert.equal(weekendDate('2026-10-17'), '2026-10-17'); // Sat
  assert.equal(weekendDate('2026-10-18'), '2026-10-18'); // Sun
});

test('berlinToday is a calendar date', () => {
  assert.match(berlinToday(), /^\d{4}-\d{2}-\d{2}$/);
});
