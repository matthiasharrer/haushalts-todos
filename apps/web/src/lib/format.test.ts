/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comesAtLabel, triggerLabel } from './format.js';

// TC-88. 2026-10-08 is a Thursday; Berlin is UTC+2 until 2026-10-25.
const TODAY = '2026-10-08';
const none = { firedAt: null, after: null, fireAt: null };

test('pending fireAt: heute / morgen / weekday date in Berlin time', () => {
  assert.equal(triggerLabel({ ...none, fireAt: '2026-10-08T20:15:00Z' }, null, TODAY), 'kommt heute 22:15');
  assert.equal(triggerLabel({ ...none, fireAt: '2026-10-09T20:15:00Z' }, null, TODAY), 'kommt morgen 22:15');
  assert.equal(triggerLabel({ ...none, fireAt: '2026-10-15T20:15:00Z' }, null, TODAY), 'kommt Do. 15.10. 22:15');
});

test('the Berlin day counts, not the UTC day', () => {
  assert.equal(triggerLabel({ ...none, fireAt: '2026-10-08T22:30:00Z' }, null, TODAY), 'kommt morgen 00:30');
});

test('predecessor with nothing pending, and plain waiting', () => {
  const after = { taskId: 1, title: 'Wäsche aufhängen', hours: 24 };
  assert.equal(triggerLabel({ ...none, after }, null, TODAY), 'nach „Wäsche aufhängen“ + 24 h');
  assert.equal(triggerLabel(none, null, TODAY), 'wartet');
});

test('fired is unchanged, even with a predecessor', () => {
  const after = { taskId: 1, title: 'X', hours: 24 };
  assert.equal(triggerLabel({ ...none, after, firedAt: '2026-10-08T12:32:00Z' }, TODAY, TODAY), 'ausgelöst heute 14:32');
  assert.equal(triggerLabel({ ...none, firedAt: '2026-10-03T12:32:00Z' }, '2026-10-03', TODAY), 'ausgelöst am 3.10.');
});

test('comesAtLabel for the sheet hint', () => {
  assert.equal(comesAtLabel('2026-10-15T20:15:00Z', TODAY), 'Do. 15.10. um 22:15');
  assert.equal(comesAtLabel('2026-10-09T20:15:00Z', TODAY), 'morgen um 22:15');
});
