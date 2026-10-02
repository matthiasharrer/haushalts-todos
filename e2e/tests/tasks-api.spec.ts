import { test, expect, type APIRequestContext } from '@playwright/test';
import { ANNA, MATTHIAS, addDays, dbAll, today, uniq } from '../support/tasks.js';

// Identity is set per request; every case creates its own uniquely titled tasks.
test.use({ extraHTTPHeaders: {} });

const SECTIONS = ['faellig', 'demnaechst', 'spaeter', 'irgendwann'] as const;

async function create(request: APIRequestContext, body: object, headers = MATTHIAS) {
  const res = await request.post('/api/tasks', { data: body, headers });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

async function list(request: APIRequestContext, headers = MATTHIAS) {
  const res = await request.get('/api/tasks', { headers });
  expect(res.status()).toBe(200);
  return res.json();
}

/** Which section holds the task (or null), and the task itself. */
async function find(request: APIRequestContext, id: number, headers = MATTHIAS) {
  const { sections } = await list(request, headers);
  for (const s of SECTIONS) {
    const t = sections[s].find((x: any) => x.id === id);
    if (t) return { section: s as string, task: t };
  }
  return { section: null, task: null };
}

const post = (request: APIRequestContext, path: string, data?: object, headers = MATTHIAS) =>
  request.post(path, { data, headers });

test('TC-14 create a one-off: defaults, creator, irgendwann; bad title -> 400', async ({ request }) => {
  const title = uniq('Fahrradschloss');
  const t = await create(request, { title });
  expect(t).toMatchObject({
    title,
    priority: 'NORMAL',
    dueDate: null,
    recurrence: null,
    lastDone: null,
    urgency: null,
    section: 'irgendwann',
  });
  expect(t.createdBy.displayName).toBe('Matthias');
  const l = await list(request);
  expect(l.today).toBe(today());
  expect(l.sections.irgendwann.map((x: any) => x.id)).toContain(t.id);

  for (const bad of [{}, { title: '' }, { title: '   ' }]) {
    expect((await post(request, '/api/tasks', bad)).status()).toBe(400);
  }
});

test('TC-15 recurring: default due today; due in 3 days -> demnaechst; invalid -> 400', async ({
  request,
}) => {
  const rec = { every: 1, unit: 'WEEK' };
  const a = await create(request, { title: uniq('Bettwäsche'), recurrence: rec });
  expect(a.dueDate).toBe(today());
  expect(a.recurrence).toEqual({ every: 1, unit: 'WEEK', mode: 'AFTER_COMPLETION' });
  expect((await find(request, a.id)).section).toBe('faellig');

  const b = await create(request, {
    title: uniq('Filter'),
    recurrence: rec,
    dueDate: addDays(today(), 3),
  });
  expect((await find(request, b.id)).section).toBe('demnaechst');

  for (const recurrence of [
    { every: 0, unit: 'WEEK' },
    { every: 1, unit: 'YEAR' },
    { every: 1.5, unit: 'DAY' },
    { every: 1, unit: 'DAY', mode: 'NOPE' },
  ]) {
    const res = await post(request, '/api/tasks', { title: uniq('x'), recurrence });
    expect(res.status()).toBe(400);
  }
});

test('TC-16 complete a weekly AFTER_COMPLETION task', async ({ request }) => {
  const t = await create(request, { title: uniq('Kaffeemaschine'), recurrence: { every: 1, unit: 'WEEK' } });
  const res = await post(request, `/api/tasks/${t.id}/complete`);
  expect(res.status()).toBe(200);
  const done = await res.json();
  expect(done.dueDate).toBe(addDays(today(), 7));
  expect(done.lastDone).toMatchObject({ date: today(), by: { displayName: 'Matthias' } });
  expect((await find(request, t.id)).section).toBe('demnaechst');

  const rows = dbAll('SELECT * FROM Completion WHERE taskId = ?', t.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    via: 'web',
    kind: 'DONE',
    date: today(),
    dueDateBefore: today(),
  });
});

test('TC-17 complete with an explicit earlier date; future date -> 400', async ({ request }) => {
  const t = await create(request, { title: uniq('Sheets'), recurrence: { every: 2, unit: 'WEEK' } });
  const yesterday = addDays(today(), -1);
  const res = await post(request, `/api/tasks/${t.id}/complete`, { date: yesterday });
  expect((await res.json()).dueDate).toBe(addDays(yesterday, 14));

  const bad = await post(request, `/api/tasks/${t.id}/complete`, { date: addDays(today(), 1) });
  expect(bad.status()).toBe(400);
  const junk = await post(request, `/api/tasks/${t.id}/complete`, { date: '2026-02-30' });
  expect(junk.status()).toBe(400);
});

test('TC-18 completing a one-off removes it; undo brings it back unchanged', async ({ request }) => {
  const t = await create(request, { title: uniq('Steuerbescheid'), priority: 'HIGH', notes: 'abheften' });
  expect((await post(request, `/api/tasks/${t.id}/complete`)).status()).toBe(200);
  expect((await find(request, t.id)).section).toBeNull();

  const undo = await post(request, `/api/tasks/${t.id}/undo`);
  expect(undo.status()).toBe(200);
  const back = await find(request, t.id);
  expect(back.section).toBe('irgendwann');
  expect(back.task).toEqual(t);
});

test('TC-19 undo restores previous due dates in turn; none -> 409', async ({ request }) => {
  const t = await create(request, { title: uniq('Dunstabzug'), recurrence: { every: 1, unit: 'WEEK' } });
  const d0 = t.dueDate;
  expect((await post(request, `/api/tasks/${t.id}/undo`)).status()).toBe(409);

  const d1 = (await (await post(request, `/api/tasks/${t.id}/complete`)).json()).dueDate;
  await post(request, `/api/tasks/${t.id}/complete`, { date: addDays(today(), -3) });
  expect(d1).toBe(addDays(today(), 7));

  const u1 = await (await post(request, `/api/tasks/${t.id}/undo`)).json();
  expect(u1.dueDate).toBe(d1);
  const u2 = await (await post(request, `/api/tasks/${t.id}/undo`)).json();
  expect(u2.dueDate).toBe(d0);
  expect((await post(request, `/api/tasks/${t.id}/undo`)).status()).toBe(409);
});

test('TC-20 skip moves the date but is not "done"; skip on one-off -> 400', async ({ request }) => {
  const t = await create(request, { title: uniq('Fenster'), recurrence: { every: 3, unit: 'DAY' } });
  await post(request, `/api/tasks/${t.id}/complete`, { date: addDays(today(), -1) });
  const before = (await find(request, t.id)).task;
  expect(before.lastDone.date).toBe(addDays(today(), -1));

  const res = await post(request, `/api/tasks/${t.id}/skip`);
  expect(res.status()).toBe(200);
  const skipped = await res.json();
  expect(skipped.dueDate).toBe(addDays(today(), 3));
  expect(skipped.lastDone).toEqual(before.lastDone);
  expect(dbAll("SELECT kind FROM Completion WHERE taskId = ? ORDER BY id", t.id).map((r) => r.kind)).toEqual([
    'DONE',
    'SKIPPED',
  ]);

  const one = await create(request, { title: uniq('einmalig') });
  expect((await post(request, `/api/tasks/${one.id}/skip`)).status()).toBe(400);
});

test('TC-21 shared list: Anna completes Matthias\'s task', async ({ request }) => {
  const t = await create(request, { title: uniq('Müll'), recurrence: { every: 1, unit: 'WEEK' } });
  const res = await post(request, `/api/tasks/${t.id}/complete`, undefined, ANNA);
  expect(res.status()).toBe(200);
  const forAnna = (await find(request, t.id, ANNA)).task;
  const forMatthias = (await find(request, t.id, MATTHIAS)).task;
  expect(forAnna.lastDone.by.displayName).toBe('Anna');
  expect(forMatthias).toEqual(forAnna);
  expect(forMatthias.createdBy.displayName).toBe('Matthias');
});

test('TC-22 PATCH fields, recurrence null -> one-off; unknown id -> 404', async ({ request }) => {
  const t = await create(request, { title: uniq('alt'), recurrence: { every: 1, unit: 'WEEK' } });
  const next = addDays(today(), 20);
  const res = await request.patch(`/api/tasks/${t.id}`, {
    headers: MATTHIAS,
    data: { title: 'neu', notes: 'Notiz', priority: 'HIGH', dueDate: next },
  });
  expect(res.status()).toBe(200);
  expect((await find(request, t.id)).task).toMatchObject({
    title: 'neu',
    notes: 'Notiz',
    priority: 'HIGH',
    dueDate: next,
    section: 'spaeter',
    recurrence: { every: 1, unit: 'WEEK', mode: 'AFTER_COMPLETION' },
  });

  const fixed = await request.patch(`/api/tasks/${t.id}`, {
    headers: MATTHIAS,
    data: { recurrence: { every: 2, unit: 'MONTH', mode: 'FIXED' } },
  });
  expect((await fixed.json()).recurrence).toEqual({ every: 2, unit: 'MONTH', mode: 'FIXED' });

  const one = await request.patch(`/api/tasks/${t.id}`, { headers: MATTHIAS, data: { recurrence: null } });
  expect((await one.json()).recurrence).toBeNull();
  expect((await find(request, t.id)).task.recurrence).toBeNull();
  expect((await post(request, `/api/tasks/${t.id}/skip`)).status()).toBe(400);

  for (const id of ['999999', 'abc']) {
    const nf = await request.patch(`/api/tasks/${id}`, { headers: MATTHIAS, data: { title: 'x' } });
    expect(nf.status()).toBe(404);
  }
});

test('TC-23 DELETE archives: gone from the list, completions kept', async ({ request }) => {
  const t = await create(request, { title: uniq('Archiv'), recurrence: { every: 1, unit: 'WEEK' } });
  await post(request, `/api/tasks/${t.id}/complete`);
  const del = await request.delete(`/api/tasks/${t.id}`, { headers: MATTHIAS });
  expect(del.status()).toBe(204);
  expect((await find(request, t.id)).section).toBeNull();

  const rows = dbAll('SELECT archivedAt FROM Task WHERE id = ?', t.id);
  expect(rows[0].archivedAt).not.toBeNull();
  expect(dbAll('SELECT id FROM Completion WHERE taskId = ?', t.id)).toHaveLength(1);

  for (const res of [
    await request.delete(`/api/tasks/${t.id}`, { headers: MATTHIAS }),
    await post(request, `/api/tasks/${t.id}/complete`),
    await post(request, `/api/tasks/${t.id}/undo`),
  ]) {
    expect(res.status()).toBe(404);
  }
});

test('TC-24 list order: weekly 8 days late > HIGH today > NORMAL today', async ({ request }) => {
  const normal = await create(request, { title: uniq('normal'), dueDate: today() });
  const high = await create(request, { title: uniq('high'), dueDate: today(), priority: 'HIGH' });
  const weekly = await create(request, {
    title: uniq('weekly'),
    dueDate: addDays(today(), -8),
    recurrence: { every: 1, unit: 'WEEK' },
  });
  const { sections } = await list(request);
  const ids = sections.faellig.map((x: any) => x.id);
  const [iw, ih, inn] = [weekly.id, high.id, normal.id].map((id) => ids.indexOf(id));
  expect(iw).toBeGreaterThanOrEqual(0);
  expect(iw).toBeLessThan(ih);
  expect(ih).toBeLessThan(inn);
  const urg = (id: number) => sections.faellig.find((x: any) => x.id === id).urgency;
  expect(urg(weekly.id)).toBeCloseTo(1 + 8 / 7);
  expect(urg(high.id)).toBe(2);
  expect(urg(normal.id)).toBe(1);
});

test('TC-25 lastDone is the latest day it counts for, not the latest tap', async ({ request }) => {
  const t = await create(request, { title: uniq('Bad'), recurrence: { every: 1, unit: 'WEEK' } });
  expect((await post(request, `/api/tasks/${t.id}/complete`, undefined, MATTHIAS)).status()).toBe(200);
  // Anna logs a back-dated completion after Matthias's of today.
  const back = addDays(today(), -3);
  expect((await post(request, `/api/tasks/${t.id}/complete`, { date: back }, ANNA)).status()).toBe(200);
  const task = (await find(request, t.id)).task;
  expect(task.lastDone).toEqual({ date: today(), by: expect.objectContaining({ displayName: 'Matthias' }) });
  // Undo still reverts the latest *recorded* one (Anna's), leaving Matthias's.
  expect((await post(request, `/api/tasks/${t.id}/undo`)).status()).toBe(200);
  expect((await find(request, t.id)).task.lastDone.by.displayName).toBe('Matthias');
});
