// TC-58…60: the daily push planner (ADR-0009). Pure, so no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDaily, type PlanTask, type PlanUser } from './notifications.js';

const DAY = '2026-10-10';
let seq = 0;
const user = (p: Partial<PlanUser> = {}): PlanUser => ({
  id: 1,
  hasSubscription: true,
  digestEnabled: true,
  notifyTime: '08:00',
  notifyRunOn: null,
  ...p,
});
const task = (p: Partial<PlanTask> = {}): PlanTask => ({
  id: ++seq,
  title: `Aufgabe ${seq}`,
  priority: 'NORMAL',
  dueDate: DAY,
  recurrence: null,
  createdAt: new Date('2026-10-01T08:00:00Z'),
  notify: false,
  notifiedFor: null,
  ...p,
});
const at = (iso: string) => new Date(iso);

test('TC-58 daily timing: nothing before the time, one digest at it, once per day', () => {
  const t = [task()];
  assert.equal(planDaily(at('2026-10-10T05:59:00Z'), [user()], t).pushes.length, 0);
  assert.deepEqual(planDaily(at('2026-10-10T05:59:00Z'), [user()], t).ranUsers, []);

  const hit = planDaily(at('2026-10-10T06:00:00Z'), [user()], t);
  assert.equal(hit.pushes.length, 1);
  assert.deepEqual(hit.ranUsers, [1]);
  assert.equal(hit.today, DAY);

  // already ran today -> nothing, later that day too
  const ran = user({ notifyRunOn: DAY });
  assert.equal(planDaily(at('2026-10-10T06:00:00Z'), [ran], t).pushes.length, 0);
  assert.equal(planDaily(at('2026-10-10T15:00:00Z'), [ran], t).pushes.length, 0);
  assert.deepEqual(planDaily(at('2026-10-10T15:00:00Z'), [ran], t).ranUsers, []);

  // a server that was down at 08:00 catches up on the next tick that day
  assert.equal(planDaily(at('2026-10-10T09:30:00Z'), [user()], t).pushes.length, 1);

  // next day
  const next = planDaily(at('2026-10-11T06:00:00Z'), [ran], [task({ dueDate: '2026-10-11' })]);
  assert.equal(next.pushes.length, 1);
  assert.deepEqual(next.ranUsers, [1]);
});

test('TC-58 winter time: 08:00 CET is 07:00Z', () => {
  const t = [task({ dueDate: '2026-10-26' })];
  assert.equal(planDaily(at('2026-10-26T06:59:00Z'), [user()], t).pushes.length, 0);
  assert.equal(planDaily(at('2026-10-26T07:00:00Z'), [user()], t).pushes.length, 1);
});

test('TC-58 a user without a subscription gets nothing and no run is recorded', () => {
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user({ hasSubscription: false })], [task()]);
  assert.deepEqual(plan.pushes, []);
  assert.deepEqual(plan.ranUsers, []);
});

test('TC-58 each user has their own time', () => {
  const users = [user({ id: 1, notifyTime: '08:00' }), user({ id: 2, notifyTime: '09:30' })];
  const plan = planDaily(at('2026-10-10T06:30:00Z'), users, [task()]); // 08:30 Berlin
  assert.deepEqual(plan.ranUsers, [1]);
  assert.deepEqual(plan.pushes.map((p) => p.userId), [1]);
});

test('TC-59 digest content: singular, plural, body in Fällig order', () => {
  const one = planDaily(at('2026-10-10T06:00:00Z'), [user()], [task({ title: 'Müll' })]);
  assert.equal(one.pushes[0].payload.title, '1 Aufgabe fällig');
  assert.equal(one.pushes[0].payload.body, 'Müll');
  assert.equal(one.pushes[0].payload.tag, 'digest');

  // order: most overdue-relative-to-interval first (ADR-0005): HIGH beats NORMAL
  const three = planDaily(
    at('2026-10-10T06:00:00Z'),
    [user()],
    [
      task({ id: 101, title: 'B normal', dueDate: DAY }),
      task({ id: 102, title: 'A wichtig', dueDate: DAY, priority: 'HIGH' }),
      task({ id: 103, title: 'C normal', dueDate: DAY }),
    ],
  );
  assert.equal(three.pushes[0].payload.title, '3 Aufgaben fällig');
  assert.equal(three.pushes[0].payload.body, 'A wichtig, B normal, C normal');
});

test('TC-59 seven due: the first five and "und 2 weitere"', () => {
  const tasks = Array.from({ length: 7 }, (_, i) => task({ id: 200 + i, title: `T${i + 1}` }));
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user()], tasks);
  assert.equal(plan.pushes[0].payload.title, '7 Aufgaben fällig');
  assert.equal(plan.pushes[0].payload.body, 'T1, T2, T3, T4, T5 und 2 weitere');
});

test('TC-59 nothing due: no push, run still recorded; Demnächst/Irgendwann are not listed', () => {
  const tasks = [task({ dueDate: '2026-10-12' }), task({ dueDate: null }), task({ dueDate: '2026-12-01' })];
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user()], tasks);
  assert.deepEqual(plan.pushes, []);
  assert.deepEqual(plan.ranUsers, [1]);
});

test('TC-59 overdue tasks are part of Fällig; done and archived are not', () => {
  const tasks = [
    task({ title: 'überfällig', dueDate: '2026-10-05' }),
    task({ title: 'erledigt', doneAt: new Date() }),
    task({ title: 'archiviert', archivedAt: new Date() }),
  ];
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user()], tasks);
  assert.equal(plan.pushes[0].payload.title, '1 Aufgabe fällig');
  assert.equal(plan.pushes[0].payload.body, 'überfällig');
});

test('TC-60 digest off: one push per notify task due today', () => {
  const a = task({ id: 301, title: 'Waschmaschine', notify: true });
  const b = task({ id: 302, title: 'Trockner', notify: true });
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user({ digestEnabled: false })], [b, a]);
  assert.deepEqual(
    plan.pushes.map((p) => [p.payload.title, p.payload.tag, p.payload.body]),
    [
      ['Waschmaschine', 'task-301', 'Jetzt fällig'],
      ['Trockner', 'task-302', 'Jetzt fällig'],
    ],
  );
  assert.deepEqual(plan.ranUsers, [1]);
});

test('TC-60 digest off for two users at different times: both get the single push', () => {
  const t = task({ id: 303, title: 'Mülltonne raus', notify: true });
  const a = user({ id: 1, digestEnabled: false, notifyTime: '08:00' });
  const b = user({ id: 2, digestEnabled: false, notifyTime: '09:00' });
  const first = planDaily(at('2026-10-10T06:00:00Z'), [a, b], [t]);
  assert.deepEqual(first.pushes.map((p) => p.userId), [1]);
  const later = planDaily(at('2026-10-10T07:00:00Z'), [{ ...a, notifyRunOn: DAY }, b], [t]);
  assert.deepEqual(later.pushes.map((p) => [p.userId, p.payload.tag]), [[2, 'task-303']]);
});

test('TC-60 digest off: excluded cases', () => {
  const tasks = [
    task({ title: 'gestern', notify: true, dueDate: '2026-10-09' }),
    task({ title: 'ohne Glocke', notify: false }),
    task({ title: 'schon gepusht', notify: true, notifiedFor: DAY }),
    task({ title: 'erledigt', notify: true, doneAt: new Date() }),
    task({ title: 'archiviert', notify: true, archivedAt: new Date() }),
    task({ title: 'morgen', notify: true, dueDate: '2026-10-11' }),
  ];
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user({ digestEnabled: false })], tasks);
  assert.deepEqual(plan.pushes, []);
  assert.deepEqual(plan.ranUsers, [1]);
});

test('TC-60 digest on: only the digest, no single pushes', () => {
  const plan = planDaily(at('2026-10-10T06:00:00Z'), [user()], [task({ title: 'Waschmaschine', notify: true })]);
  assert.deepEqual(plan.pushes.map((p) => p.payload.tag), ['digest']);
});

// TC-79: trigger tasks (ADR-0010). A waiting one has dueDate null, so it is
// not due and appears in neither the digest nor the single pushes.
test('TC-79 a waiting trigger task is in neither the digest nor the single pushes', () => {
  const waiting = task({ id: 701, title: 'Wäsche aufhängen', notify: true, dueDate: null });
  const other = task({ id: 702, title: 'Müll', notify: true });

  const digest = planDaily(at('2026-10-10T06:00:00Z'), [user()], [waiting, other]);
  assert.equal(digest.pushes.length, 1);
  assert.equal(digest.pushes[0].payload.title, '1 Aufgabe fällig');
  assert.equal(digest.pushes[0].payload.body, 'Müll');

  const singles = planDaily(at('2026-10-10T06:00:00Z'), [user({ digestEnabled: false })], [waiting, other]);
  assert.deepEqual(singles.pushes.map((p) => p.payload.tag), ['task-702']);

  // alone: nothing at all, but the run still counts
  const alone = planDaily(at('2026-10-10T06:00:00Z'), [user()], [waiting]);
  assert.deepEqual(alone.pushes, []);
  assert.deepEqual(alone.ranUsers, [1]);
});

test('TC-79 a fired trigger task (due today) counts like any task due today', () => {
  const fired = task({ id: 703, title: 'Wäsche aufhängen', notify: true });
  const digest = planDaily(at('2026-10-10T06:00:00Z'), [user()], [fired]);
  assert.equal(digest.pushes[0].payload.body, 'Wäsche aufhängen');
  const singles = planDaily(at('2026-10-10T06:00:00Z'), [user({ digestEnabled: false })], [fired]);
  assert.deepEqual(singles.pushes.map((p) => p.payload.tag), ['task-703']);
  // the fire itself already pushed (notifiedFor), so no second single push
  const pushed = task({ id: 704, notify: true, notifiedFor: DAY });
  assert.deepEqual(planDaily(at('2026-10-10T06:00:00Z'), [user({ digestEnabled: false })], [pushed]).pushes, []);
});
