import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTaskSchema } from './tasks.js';
import { followUpBase, followUpFireAt } from './followUp.js';

describe('followUpFireAt (TC-87)', () => {
  it('adds the hours to the completion time', () => {
    const at = new Date('2026-10-08T20:15:00Z');
    assert.equal(followUpFireAt(at, 24).toISOString(), '2026-10-09T20:15:00.000Z');
    assert.equal(followUpFireAt(at, 1).toISOString(), '2026-10-08T21:15:00.000Z');
  });

  it('is exactly 24 h across the DST change, not the same wall-clock time', () => {
    const at = new Date('2026-10-24T22:00:00Z'); // Berlin falls back on 2026-10-25
    const fire = followUpFireAt(at, 24);
    assert.equal(fire.toISOString(), '2026-10-25T22:00:00.000Z');
    assert.equal(fire.getTime() - at.getTime(), 24 * 3_600_000);
  });

  it('followUpBase inverts it', () => {
    const at = new Date('2026-10-08T20:15:00Z');
    assert.equal(followUpBase(followUpFireAt(at, 20), 20).getTime(), at.getTime());
  });
});

describe('trigger.after schema (TC-87)', () => {
  const parse = (hours: unknown) =>
    createTaskSchema.safeParse({ title: 'x', trigger: { after: { taskId: 1, hours } } }).success;

  it('accepts 1..720 whole hours', () => {
    assert.equal(parse(1), true);
    assert.equal(parse(24), true);
    assert.equal(parse(720), true);
  });

  it('rejects 0, 721, fractions and non-numbers', () => {
    for (const h of [0, 721, 1.5, -3, '24', null]) assert.equal(parse(h), false, String(h));
  });
});
