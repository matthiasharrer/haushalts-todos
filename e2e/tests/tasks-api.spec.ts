import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  ANNA, MATTHIAS, addDays, dbAll, farSeason, monthNow, wrapMonth, firstOfLastMonth, lastMonthSeason, nextMonthStart, today, uniq,
} from '../support/tasks.js';

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
  expect(a.recurrence).toEqual({ every: 1, unit: 'WEEK', mode: 'AFTER_COMPLETION', season: null });
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
  // ADR-0007: a recurring task 20 days out is no longer on home, so look it up in /api/recurring
  const recurring = await (await request.get('/api/recurring', { headers: MATTHIAS })).json();
  expect(recurring.tasks.find((x: any) => x.id === t.id)).toMatchObject({
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
  expect((await fixed.json()).recurrence).toEqual({ every: 2, unit: 'MONTH', mode: 'FIXED', season: null });

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

test('TC-36 recurring far out is not on home; /api/recurring lists active recurring by due date', async ({ request }) => {
  const t = today();
  const far = await create(request, {
    title: uniq('Fern wiederkehrend'),
    dueDate: addDays(t, 20),
    recurrence: { every: 1, unit: 'MONTH' },
  });
  const soon = await create(request, {
    title: uniq('Bald wiederkehrend'),
    dueDate: addDays(t, 3),
    recurrence: { every: 1, unit: 'WEEK' },
  });
  const sameDay = await create(request, {
    title: uniq('Gleicher Tag'),
    dueDate: addDays(t, 20),
    recurrence: { every: 2, unit: 'WEEK' },
  });
  const oneOff = await create(request, { title: uniq('Fern einmalig'), dueDate: addDays(t, 20) });
  const archived = await create(request, {
    title: uniq('Archiviert wiederkehrend'),
    recurrence: { every: 1, unit: 'DAY' },
  });
  expect((await request.delete(`/api/tasks/${archived.id}`, { headers: MATTHIAS })).status()).toBe(204);

  // home: far recurring in no section; far one-off in spaeter; near recurring in demnaechst
  expect((await find(request, far.id)).section).toBeNull();
  expect((await find(request, sameDay.id)).section).toBeNull();
  expect((await find(request, oneOff.id)).section).toBe('spaeter');
  expect((await find(request, soon.id)).section).toBe('demnaechst');

  const res = await request.get('/api/recurring', { headers: MATTHIAS });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.today).toBe(t);
  const ids = body.tasks.map((x: any) => x.id);
  expect(ids).toEqual(expect.arrayContaining([far.id, soon.id, sameDay.id]));
  expect(ids).not.toContain(oneOff.id);
  expect(ids).not.toContain(archived.id);
  expect(body.tasks.every((x: any) => x.recurrence !== null)).toBe(true);
  // sorted by dueDate, then id
  const keys = body.tasks.map((x: any) => [x.dueDate, x.id]);
  const sorted = [...keys].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  expect(keys).toEqual(sorted);
  expect(ids.indexOf(far.id)).toBeLessThan(ids.indexOf(sameDay.id)); // same date: lower id first
  expect(ids.indexOf(soon.id)).toBeLessThan(ids.indexOf(far.id));

  // identity is required
  const anon = await request.get('/api/recurring');
  expect(anon.status()).toBe(401);
});

// ---- seasonal chores (ADR-0008) --------------------------------------------

const recurringList = async (request: APIRequestContext) =>
  (await request.get('/api/recurring', { headers: MATTHIAS })).json();

test('TC-52 seasonal create: rests until the next season start; validation; full year = none', async ({ request }) => {
  const season = farSeason();
  const t = await create(request, { title: uniq('Rasen'), recurrence: { every: 2, unit: 'WEEK', season } });
  expect(t.dueDate).toBe(nextMonthStart(today(), season.from));
  expect(t.recurrence.season).toEqual(season);
  expect(t.resting).toBe(true);
  expect((await find(request, t.id)).section).toBeNull();
  const rec = (await recurringList(request)).tasks.find((x: any) => x.id === t.id);
  expect(rec.resting).toBe(true);

  const rule = { every: 1, unit: 'WEEK' };
  const bad = (body: object) => post(request, '/api/tasks', { title: uniq('bad'), ...body });
  for (const season of [{ from: 0, to: 5 }, { from: 3, to: 13 }, { from: 3 }, { to: 5 }, { from: 2.5, to: 4 }]) {
    expect((await bad({ recurrence: { ...rule, season } })).status()).toBe(400);
  }
  // a season without a rhythm (i.e. on something that isn't a recurring chore)
  expect((await bad({ recurrence: { season: { from: 3, to: 10 } } })).status()).toBe(400);

  for (const full of [{ from: 1, to: 12 }, { from: 3, to: 2 }]) {
    const f = await create(request, { title: uniq('Ganzjahr'), recurrence: { ...rule, season: full } });
    expect(f.recurrence.season).toBeNull();
    expect(f.dueDate).toBe(today());
    expect(f.resting).toBe(false);
  }
  const plain = await create(request, { title: uniq('ohne'), recurrence: rule });
  expect(plain.recurrence.season).toBeNull();
});

test('TC-53 overdue stays due after the season ended; completing jumps to the next season; undo', async ({ request }) => {
  const season = lastMonthSeason();
  const old = firstOfLastMonth();
  const t = await create(request, {
    title: uniq('Laub'),
    dueDate: old,
    recurrence: { every: 1, unit: 'WEEK', season },
  });
  expect(t.dueDate).toBe(old);
  expect(t.resting).toBe(false);
  expect((await find(request, t.id)).section).toBe('faellig');

  const done = await (await post(request, `/api/tasks/${t.id}/complete`)).json();
  expect(done.dueDate).toBe(nextMonthStart(addDays(today(), 7), season.from));
  expect(done.resting).toBe(true);
  expect((await find(request, t.id)).section).toBeNull();

  const undone = await (await post(request, `/api/tasks/${t.id}/undo`)).json();
  expect(undone.dueDate).toBe(old);
  expect((await find(request, t.id)).section).toBe('faellig');
});

test('TC-54 seasonal update: adding a season snaps the date; title patch keeps it; null clears', async ({ request }) => {
  const patch = (id: number, body: object) => request.patch(`/api/tasks/${id}`, { data: body, headers: MATTHIAS });
  const t = await create(request, { title: uniq('Hecke'), recurrence: { every: 1, unit: 'WEEK' } });
  expect(t.dueDate).toBe(today());
  const season = farSeason();
  const snapped = await (await patch(t.id, { recurrence: { every: 1, unit: 'WEEK', season } })).json();
  expect(snapped.dueDate).toBe(nextMonthStart(today(), season.from));
  expect(snapped.recurrence.season).toEqual(season);
  expect(snapped.resting).toBe(true);

  // title-only on an overdue chore whose season has ended: date stays
  const old = firstOfLastMonth();
  const o = await create(request, {
    title: uniq('Beet'),
    dueDate: old,
    recurrence: { every: 1, unit: 'WEEK', season: lastMonthSeason() },
  });
  const renamed = await (await patch(o.id, { title: uniq('Beet neu') })).json();
  expect(renamed.dueDate).toBe(old);
  expect(renamed.recurrence.season).toEqual(lastMonthSeason());
  // the web sheet resends dueDate and recurrence unchanged on every save: still stays
  const resaved = await (
    await patch(o.id, {
      title: uniq('Beet Sheet'),
      dueDate: old,
      recurrence: { every: 1, unit: 'WEEK', mode: 'AFTER_COMPLETION', season: lastMonthSeason() },
    })
  ).json();
  expect(resaved.dueDate).toBe(old);

  // a recurrence patch without season replaces the rule: season gone
  const noSeason = await (await patch(snapped.id, { recurrence: { every: 1, unit: 'WEEK' } })).json();
  expect(noSeason.recurrence.season).toBeNull();
  expect(noSeason.resting).toBe(false);
  // recurrence: null makes it a one-off and clears the columns
  const again = await (await patch(snapped.id, { recurrence: { every: 1, unit: 'WEEK', season } })).json();
  const oneOff = await (await patch(again.id, { recurrence: null })).json();
  expect(oneOff.recurrence).toBeNull();
  expect(oneOff.resting).toBe(false);
  expect(dbAll('select seasonFrom, seasonTo from Task where id = ?', again.id)).toEqual([
    { seasonFrom: null, seasonTo: null },
  ]);
});

test('TC-57 un-resting on season change: recompute from the latest completion, at the earliest today', async ({ request }) => {
  const patch = (id: number, body: object) => request.patch(`/api/tasks/${id}`, { data: body, headers: MATTHIAS });
  const rule = { every: 1, unit: 'WEEK', mode: 'AFTER_COMPLETION' };
  const far = farSeason();
  const resting = async (completedOn?: string) => {
    const t = await create(request, { title: uniq('Ruhend'), recurrence: { ...rule, season: far } });
    if (completedOn) {
      const done = await (await post(request, `/api/tasks/${t.id}/complete`, { date: completedOn })).json();
      expect(done.resting).toBe(true);
      expect(done.dueDate).toBe(t.dueDate);
      return done;
    }
    expect(t.resting).toBe(true);
    return t;
  };
  const m = monthNow();
  const includesNow = { from: m, to: m };
  const otherFar = { from: wrapMonth(m, 5), to: wrapMonth(m, 6) };

  // completed 10 days ago (completion + 7 is in the past), season removed, dueDate resent unchanged -> today, faellig
  const a = await resting(addDays(today(), -10));
  const aRes = await (await patch(a.id, { dueDate: a.dueDate, recurrence: rule })).json();
  expect(aRes.dueDate).toBe(today());
  expect(aRes.resting).toBe(false);
  expect((await find(request, a.id)).section).toBe('faellig');

  // completed 3 days ago: completion + 7 is still ahead (today + 4), so it wins over today
  const a2 = await resting(addDays(today(), -3));
  expect((await (await patch(a2.id, { recurrence: rule })).json()).dueDate).toBe(addDays(today(), 4));

  // completed today -> today + 7
  const b = await resting(today());
  expect((await (await patch(b.id, { recurrence: rule })).json()).dueDate).toBe(addDays(today(), 7));

  // season that includes the current month -> same recomputation
  const c = await resting(addDays(today(), -10));
  const cRes = await (await patch(c.id, { recurrence: { ...rule, season: includesNow } })).json();
  expect(cRes.dueDate).toBe(today());
  expect(cRes.recurrence.season).toEqual(includesNow);

  // different season that also excludes today -> its next start
  const d = await resting(addDays(today(), -10));
  const dRes = await (await patch(d.id, { recurrence: { ...rule, season: otherFar } })).json();
  expect(dRes.dueDate).toBe(nextMonthStart(today(), otherFar.from));
  expect(dRes.resting).toBe(true);

  // no completion, season removed -> today
  const e = await resting();
  expect((await (await patch(e.id, { recurrence: rule })).json()).dueDate).toBe(today());

  // a different dueDate in the same patch wins
  const f = await resting(addDays(today(), -10));
  const wanted = addDays(today(), 40);
  expect((await (await patch(f.id, { dueDate: wanted, recurrence: rule })).json()).dueDate).toBe(wanted);

  // a non-resting chore is not recomputed
  const g = await create(request, { title: uniq('Aktiv'), dueDate: addDays(today(), 2), recurrence: rule });
  const gRes = await (await patch(g.id, { recurrence: { ...rule, season: includesNow } })).json();
  expect(gRes.dueDate).toBe(addDays(today(), 2));
});
