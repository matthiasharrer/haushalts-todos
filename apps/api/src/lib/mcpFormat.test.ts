import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { triggerLabel } from '../mcp/format.js';
import type { TaskDto } from './tasks.js';

// TC-88 (MCP part). 2026-10-08 is a Thursday; Berlin is UTC+2 until 2026-10-25.
const TODAY = '2026-10-08';

function task(over: { dueDate?: string | null; after?: boolean; fireAt?: string | null }): TaskDto {
  return {
    dueDate: over.dueDate ?? null,
    trigger: {
      refire: 'PUSH',
      hasToken: false,
      firedAt: null,
      after: over.after ? { taskId: 1, title: 'Wäsche aufhängen', hours: 24 } : null,
      fireAt: over.fireAt ?? null,
    },
  } as TaskDto;
}

describe('MCP triggerLabel (ADR-0011)', () => {
  it('pending fireAt: heute / morgen / weekday date, in Berlin time', () => {
    assert.equal(triggerLabel(task({ fireAt: '2026-10-08T20:15:00Z' }), TODAY), 'Auslöser · kommt heute 22:15');
    assert.equal(triggerLabel(task({ fireAt: '2026-10-09T20:15:00Z' }), TODAY), 'Auslöser · kommt morgen 22:15');
    assert.equal(triggerLabel(task({ fireAt: '2026-10-15T20:15:00Z' }), TODAY), 'Auslöser · kommt Do. 15.10. 22:15');
  });

  it('uses the Berlin day, not the UTC day', () => {
    // 22:30Z on the 8th is 00:30 on the 9th in Berlin.
    assert.equal(triggerLabel(task({ fireAt: '2026-10-08T22:30:00Z' }), TODAY), 'Auslöser · kommt morgen 00:30');
  });

  it('predecessor without a pending time', () => {
    assert.equal(triggerLabel(task({ after: true }), TODAY), 'Auslöser · nach „Wäsche aufhängen“ + 24 h');
  });

  it('plain waiting, fired, and not a trigger', () => {
    assert.equal(triggerLabel(task({}), TODAY), 'Auslöser · wartet');
    assert.equal(triggerLabel(task({ dueDate: TODAY }), TODAY), 'Auslöser · ausgelöst heute');
    assert.equal(triggerLabel({ trigger: null } as TaskDto, TODAY), null);
  });
});
