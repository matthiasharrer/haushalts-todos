// Follow-up triggers (ADR-0011), API half: TC-89 … TC-92. The server runs with
// PUSH_OUTBOX and a 500 ms tick. To reach a scheduled time a case writes
// `fireAt` into the past in the e2e DB (support/tasks.ts setFireAt, own rows
// only) and waits for the ticker. The DB and outbox are shared across specs:
// every case uses its own titles and fake endpoints.
import { test, expect, type APIRequestContext } from '@playwright/test';
import { ANNA, MATTHIAS, addDays, dbAll, setFireAt, today, uniq } from '../support/tasks.js';
import { outboxForTask, settle, subscribe, unsubscribe } from '../support/push.js';

test.use({ extraHTTPHeaders: {} });

const HOUR = 3_600_000;
const SECTIONS = ['faellig', 'demnaechst', 'spaeter', 'irgendwann'] as const;

async function create(request: APIRequestContext, body: object) {
  const res = await request.post('/api/tasks', { data: body, headers: MATTHIAS });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}
const patch = (request: APIRequestContext, id: number, data: object) =>
  request.patch(`/api/tasks/${id}`, { data, headers: MATTHIAS });
const act = (request: APIRequestContext, id: number, what: 'complete' | 'skip' | 'undo', data?: object) =>
  request.post(`/api/tasks/${id}/${what}`, { headers: MATTHIAS, data });
async function get(request: APIRequestContext, id: number) {
  const all = (await (await request.get('/api/recurring', { headers: MATTHIAS })).json()).tasks as any[];
  const hit = all.find((t) => t.id === id);
  if (hit) return hit;
  const sections = (await (await request.get('/api/tasks', { headers: MATTHIAS })).json()).sections;
  return SECTIONS.flatMap((s) => sections[s]).find((t: any) => t.id === id);
}
async function sectionOf(request: APIRequestContext, id: number): Promise<string | null> {
  const sections = (await (await request.get('/api/tasks', { headers: MATTHIAS })).json()).sections;
  return SECTIONS.find((s) => sections[s].some((t: any) => t.id === id)) ?? null;
}
const row = (id: number) => dbAll('select * from Task where id = ?', id)[0];
const after = (taskId: number, hours = 24) => ({ refire: 'PUSH', after: { taskId, hours } });
const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();
const ago = (ms: number) => new Date(Date.now() - ms);

/** A one-off predecessor and a follow-up (notify on) after it. */
async function chain(request: APIRequestContext, label: string, hours = 24, pred: object = {}) {
  const p = await create(request, { title: uniq(`ZZ-FU ${label} P`), ...pred });
  const f = await create(request, { title: uniq(`ZZ-FU ${label} F`), trigger: after(p.id, hours), notify: true });
  return { p, f };
}

test('TC-89 Verknüpfung, Validierung, erneutes Speichern, Entfernen, choices', async ({ request }) => {
  const p = await create(request, { title: uniq('ZZ-FU Link P') });
  const f = await create(request, { title: uniq('ZZ-FU Link F'), trigger: after(p.id, 24) });
  expect(f.trigger.after).toEqual({ taskId: p.id, title: p.title, hours: 24 });
  expect(f.trigger.fireAt).toBeNull();
  expect(f.dueDate).toBeNull();
  expect((await get(request, p.id)).followUps).toEqual([{ id: f.id, title: f.title, hours: 24 }]);
  expect(p.followUps).toEqual([]);

  // validation: self, archived, finished one-off, unknown, hours
  expect((await patch(request, f.id, { trigger: after(f.id) })).status()).toBe(400);
  const archived = await create(request, { title: uniq('ZZ-FU Link archiviert') });
  expect((await request.delete(`/api/tasks/${archived.id}`, { headers: MATTHIAS })).status()).toBe(204);
  const finished = await create(request, { title: uniq('ZZ-FU Link erledigt') });
  expect((await act(request, finished.id, 'complete')).status()).toBe(200);
  for (const bad of [archived.id, finished.id, 999999]) {
    const res = await request.post('/api/tasks', {
      data: { title: uniq('ZZ-FU Link ungültig'), trigger: after(bad) },
      headers: MATTHIAS,
    });
    expect(res.status(), `predecessor ${bad}`).toBe(400);
    expect((await patch(request, f.id, { trigger: after(bad) })).status()).toBe(400);
  }
  for (const hours of [0, 721, 1.5]) {
    expect((await request.post('/api/tasks', { data: { title: 'x', trigger: after(p.id, hours) }, headers: MATTHIAS })).status()).toBe(400);
    expect((await patch(request, f.id, { trigger: after(p.id, hours) })).status()).toBe(400);
  }
  // resaving the full sheet payload changes nothing
  const resave = await patch(request, f.id, {
    title: f.title, notes: null, priority: 'NORMAL', notify: false, recurrence: null, trigger: after(p.id, 24),
  });
  expect(resave.status()).toBe(200);
  const again = await resave.json();
  expect(again.trigger).toEqual(f.trigger);
  expect(again.dueDate).toBeNull();

  // after:null and trigger:null remove it
  const noAfter = await (await patch(request, f.id, { trigger: { refire: 'PUSH', after: null } })).json();
  expect(noAfter.trigger.after).toBeNull();
  expect((await get(request, p.id)).followUps).toEqual([]);
  await patch(request, f.id, { trigger: after(p.id, 12) });
  const off = await (await patch(request, f.id, { trigger: null })).json();
  expect(off.trigger).toBeNull();
  expect(row(f.id).afterTaskId).toBeNull();
  expect(row(f.id).afterHours).toBeNull();

  // choices: active only, sorted by title
  const res = await request.get('/api/tasks/choices', { headers: MATTHIAS });
  expect(res.status()).toBe(200);
  const { tasks } = await res.json();
  const ids = tasks.map((t: any) => t.id);
  expect(ids).toContain(p.id);
  expect(ids).not.toContain(archived.id);
  expect(ids).not.toContain(finished.id);
  expect(Object.keys(tasks[0]).sort()).toEqual(['id', 'title']);
  const titles: string[] = tasks.map((t: any) => t.title);
  const collator = new Intl.Collator('de');
  expect(titles).toEqual([...titles].sort(collator.compare));
});

test('TC-90 Planung: erledigen, überspringen, rückdatiert, erneut, Undo, Stunden ändern, Wechsel, zwei Nachfolger', async ({ request }) => {
  const aEp = await subscribe(request, ANNA);
  const { p, f } = await chain(request, 'Plan');
  const f2 = await create(request, { title: uniq('ZZ-FU Plan F2'), trigger: after(p.id, 48) });

  // complete -> fireAt ~ now + 24 h, still waiting, not on home, no push; two follow-ups both scheduled
  expect((await act(request, p.id, 'complete')).status()).toBe(200);
  const f1 = await get(request, f.id);
  expect(Math.abs(msUntil(f1.trigger.fireAt) - 24 * HOUR)).toBeLessThan(120_000);
  expect(f1.dueDate).toBeNull();
  expect(await sectionOf(request, f.id)).toBeNull();
  const f2dto = await get(request, f2.id);
  expect(Math.abs(msUntil(f2dto.trigger.fireAt) - 48 * HOUR)).toBeLessThan(120_000);
  await settle(1500);
  expect(outboxForTask(aEp, f.id)).toHaveLength(0);

  // changing only the hours recomputes from the original completion time
  const original = new Date(f1.trigger.fireAt).getTime() - 24 * HOUR;
  const changed = await (await patch(request, f.id, { trigger: after(p.id, 20) })).json();
  expect(new Date(changed.trigger.fireAt).getTime()).toBe(original + 20 * HOUR);
  expect(changed.trigger.after.hours).toBe(20);

  // another predecessor / after:null clears a pending time
  const other = await create(request, { title: uniq('ZZ-FU Plan Other') });
  const moved = await (await patch(request, f.id, { trigger: after(other.id, 20) })).json();
  expect(moved.trigger.fireAt).toBeNull();
  expect(row(f.id).fireAtCompletionId).toBeNull();
  await act(request, p.id, 'undo'); // un-schedule f2 for the next steps
  expect((await get(request, f2.id)).trigger.fireAt).toBeNull();
  await patch(request, f.id, { trigger: after(p.id, 24) });
  await act(request, p.id, 'complete');
  expect((await get(request, f.id)).trigger.fireAt).not.toBeNull();
  const cleared = await (await patch(request, f.id, { trigger: { refire: 'PUSH', after: null } })).json();
  expect(cleared.trigger.fireAt).toBeNull();
  await unsubscribe(request, ANNA, aEp);
});

test('TC-90 Überspringen plant nichts, rückdatiert zählt ab jetzt, erneut erledigt = später, Undo löscht', async ({ request }) => {
  const p = await create(request, { title: uniq('ZZ-FU Skip P'), dueDate: today(), recurrence: { every: 1, unit: 'WEEK' } });
  const f = await create(request, { title: uniq('ZZ-FU Skip F'), trigger: after(p.id, 24) });

  expect((await act(request, p.id, 'skip')).status()).toBe(200);
  expect((await get(request, f.id)).trigger.fireAt).toBeNull();

  expect((await act(request, p.id, 'complete', { date: addDays(today(), -1) })).status()).toBe(200);
  const first = (await get(request, f.id)).trigger.fireAt as string;
  expect(Math.abs(msUntil(first) - 24 * HOUR)).toBeLessThan(120_000);

  await new Promise((r) => setTimeout(r, 30));
  expect((await act(request, p.id, 'complete')).status()).toBe(200);
  const second = (await get(request, f.id)).trigger.fireAt as string;
  expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());

  // undo of the completion that scheduled it clears it (the earlier time isn't restored)
  expect((await act(request, p.id, 'undo')).status()).toBe(200);
  const undone = await get(request, f.id);
  expect(undone.trigger.fireAt).toBeNull();
  expect(row(f.id).fireAtCompletionId).toBeNull();
});

test('TC-91 Fällt zur Zeit: Push je Gerät, Startseite, erneut, NONE, archiviert, HA-Auslösung', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);

  // scheduled fire
  const { p, f } = await chain(request, 'Fire');
  await act(request, p.id, 'complete');
  setFireAt(f.id, ago(60_000));
  await expect.poll(async () => (await get(request, f.id)).dueDate, { timeout: 8000 }).toBe(today());
  const fired = await get(request, f.id);
  expect(fired.trigger.firedAt).not.toBeNull();
  expect(fired.trigger.fireAt).toBeNull();
  expect(row(f.id).fireAtCompletionId).toBeNull();
  expect(await sectionOf(request, f.id)).toBe('faellig');
  for (const ep of [mEp, aEp]) {
    await expect.poll(() => outboxForTask(ep, f.id).length).toBe(1);
    const push = outboxForTask(ep, f.id)[0].payload;
    expect(push.title).toBe(f.title);
    expect(push.body).toBe('Jetzt fällig');
    expect(push.tag).toBe(`task-${f.id}`);
  }

  // already fired + refire PUSH: repushed with renotify, date unchanged
  const dateBefore = fired.dueDate;
  setFireAt(f.id, ago(30_000));
  await expect.poll(() => outboxForTask(aEp, f.id).length, { timeout: 8000 }).toBe(2);
  expect((outboxForTask(aEp, f.id)[1].payload as any).renotify).toBe(true);
  expect((await get(request, f.id)).dueDate).toBe(dateBefore);
  expect(row(f.id).fireAt).toBeNull();

  // refire NONE: no push, fireAt cleared
  const q = await create(request, { title: uniq('ZZ-FU None P') });
  const n = await create(request, { title: uniq('ZZ-FU None F'), trigger: { refire: 'NONE', after: { taskId: q.id, hours: 1 } }, notify: true });
  await act(request, q.id, 'complete');
  setFireAt(n.id, ago(60_000));
  await expect.poll(async () => (await get(request, n.id)).dueDate, { timeout: 8000 }).toBe(today());
  const firedAt = (await get(request, n.id)).trigger.firedAt;
  expect(outboxForTask(aEp, n.id)).toHaveLength(1);
  setFireAt(n.id, ago(30_000));
  await expect.poll(() => row(n.id).fireAt, { timeout: 8000 }).toBeNull();
  await settle(800);
  expect(outboxForTask(aEp, n.id)).toHaveLength(1);
  expect((await get(request, n.id)).trigger.firedAt).toBe(firedAt);

  // archived follow-up never fires
  const { p: ap, f: af } = await chain(request, 'Arch');
  await act(request, ap.id, 'complete');
  expect((await request.delete(`/api/tasks/${af.id}`, { headers: MATTHIAS })).status()).toBe(204);
  setFireAt(af.id, ago(60_000));
  await settle(2000);
  expect(row(af.id).dueDate).toBeNull();
  expect(row(af.id).firedAt).toBeNull();
  expect(outboxForTask(aEp, af.id)).toHaveLength(0);

  // an HA fire of a waiting follow-up with a pending fireAt clears it
  const { p: hp, f: hf } = await chain(request, 'HA');
  await act(request, hp.id, 'complete');
  expect((await get(request, hf.id)).trigger.fireAt).not.toBeNull();
  const tk = await (await request.post(`/api/tasks/${hf.id}/hook-token`, { headers: MATTHIAS })).json();
  const hook = await request.post(`/hooks/${hf.id}`, { headers: { Authorization: `Bearer ${tk.token}` } });
  expect((await hook.json()).result).toBe('fired');
  const afterHa = await get(request, hf.id);
  expect(afterHa.trigger.fireAt).toBeNull();
  expect(row(hf.id).fireAtCompletionId).toBeNull();

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-92 Vorgänger archivieren: Verknüpfung weg, anstehende Zeit bleibt und feuert', async ({ request }) => {
  const aEp = await subscribe(request, ANNA);
  const { p, f } = await chain(request, 'ArchP');
  await act(request, p.id, 'complete');
  const pending = (await get(request, f.id)).trigger.fireAt;
  expect(pending).not.toBeNull();

  expect((await request.delete(`/api/tasks/${p.id}`, { headers: MATTHIAS })).status()).toBe(204);
  const unlinked = await get(request, f.id);
  expect(unlinked.trigger.after).toBeNull();
  expect(unlinked.trigger.fireAt).toBe(pending);
  expect(row(f.id).afterHours).toBeNull();
  // Resaving the follow-up's sheet now sends after: null; that must not cancel the pending time.
  expect((await patch(request, f.id, { title: f.title, trigger: { refire: 'PUSH', after: null } })).status()).toBe(200);
  expect((await get(request, f.id)).trigger.fireAt).toBe(pending);

  setFireAt(f.id, ago(60_000));
  await expect.poll(async () => (await get(request, f.id)).dueDate, { timeout: 8000 }).toBe(today());
  await expect.poll(() => outboxForTask(aEp, f.id).length).toBe(1);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-89 refire bleibt, wenn update nur after schickt (MCP-Weg)', async ({ request }) => {
  const p = await create(request, { title: uniq('ZZ-FU Refire P') });
  const f = await create(request, { title: uniq('ZZ-FU Refire F'), trigger: { refire: 'NONE', after: { taskId: p.id, hours: 24 } } });
  expect(f.trigger.refire).toBe('NONE');
  const res = await patch(request, f.id, { trigger: { after: null } });
  expect(res.status()).toBe(200);
  const now = await res.json();
  expect(now.trigger.refire).toBe('NONE');
  expect(now.trigger.after).toBeNull();
  // create without refire still defaults to PUSH
  const g = await create(request, { title: uniq('ZZ-FU Refire G'), trigger: {} });
  expect(g.trigger.refire).toBe('PUSH');
});
