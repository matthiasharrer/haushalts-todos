import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  irgendwannScore,
  sectionOf,
  sortTasks,
  urgencyScore,
  type SortableTask,
} from './urgency.js';

const TODAY = '2026-10-10';
let seq = 0;
function task(p: Partial<SortableTask> = {}): SortableTask {
  return {
    id: ++seq,
    priority: 'NORMAL',
    dueDate: null,
    recurrence: null,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    ...p,
  };
}
const near = (a: number | null, b: number) => assert.ok(Math.abs(a! - b) < 1e-9, `${a} != ${b}`);

test('TC-11 sections relative to today', () => {
  const s = (dueDate: string | null) => sectionOf({ dueDate }, TODAY);
  assert.equal(s('2026-10-10'), 'faellig');
  assert.equal(s('2026-09-01'), 'faellig');
  assert.equal(s('2026-10-11'), 'demnaechst');
  assert.equal(s('2026-10-17'), 'demnaechst');
  assert.equal(s('2026-10-18'), 'spaeter');
  assert.equal(s('2027-01-01'), 'spaeter');
  assert.equal(s(null), 'irgendwann');
});

test('TC-12 urgency scores', () => {
  const sc = (p: Partial<SortableTask>) => urgencyScore(task(p), TODAY);
  near(sc({ dueDate: TODAY }), 1);
  near(sc({ dueDate: TODAY, priority: 'HIGH' }), 2);
  near(sc({ dueDate: TODAY, priority: 'LOW' }), 0.5);
  near(sc({ dueDate: '2026-10-03', recurrence: { every: 1, unit: 'WEEK' } }), 2);
  near(sc({ dueDate: '2026-10-03', recurrence: { every: 12, unit: 'WEEK' } }), 1 + 7 / 84);
  near(sc({ dueDate: '2026-10-03' }), 2);
  assert.equal(sc({ dueDate: null }), null);
});

test('TC-13 ordering within sections', () => {
  // faellig: score desc, then older due date, then lower id
  const weekly8 = task({ dueDate: '2026-10-02', recurrence: { every: 1, unit: 'WEEK' } }); // 2.14
  const hi = task({ dueDate: TODAY, priority: 'HIGH' }); // 2, newer due
  const weekly7 = task({ dueDate: '2026-10-03', recurrence: { every: 1, unit: 'WEEK' } }); // 2, older due
  const normal = task({ dueDate: TODAY }); // 1
  const lowId = task({ dueDate: '2026-10-07' }); // 1 + 3/7
  const highId = task({ dueDate: '2026-10-07' }); // same score and due: lower id first
  const sorted = sortTasks([normal, hi, highId, lowId, weekly7, weekly8], TODAY).faellig.map(
    (t) => t.id,
  );
  assert.deepEqual(sorted, [weekly8.id, weekly7.id, hi.id, lowId.id, highId.id, normal.id]);

  // demnaechst: due date, then priority (HIGH first)
  const d1 = task({ dueDate: '2026-10-12' });
  const d2h = task({ dueDate: '2026-10-11', priority: 'HIGH' });
  const d2n = task({ dueDate: '2026-10-11' });
  const dl = task({ dueDate: '2026-10-11', priority: 'LOW' });
  assert.deepEqual(
    sortTasks([d1, dl, d2n, d2h], TODAY).demnaechst.map((t) => t.id),
    [d2h.id, d2n.id, dl.id, d1.id],
  );

  // spaeter: by due date
  const s1 = task({ dueDate: '2026-12-01' });
  const s2 = task({ dueDate: '2026-10-20' });
  assert.deepEqual(
    sortTasks([s1, s2], TODAY).spaeter.map((t) => t.id),
    [s2.id, s1.id],
  );

  // irgendwann: weight * (1 + age/30); 60-day-old NORMAL (3) beats fresh HIGH (2)
  const old = task({ createdAt: new Date('2026-08-11T10:00:00Z') });
  const fresh = task({ priority: 'HIGH' });
  near(irgendwannScore(old, TODAY), 3);
  near(irgendwannScore(fresh, TODAY), 2);
  assert.deepEqual(
    sortTasks([fresh, old], TODAY).irgendwann.map((t) => t.id),
    [old.id, fresh.id],
  );
});
