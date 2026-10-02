// Task list UI, TC-26…TC-35, at the configured phone viewport (390×844).
// Tasks are seeded through the API with unique titles; every locator is scoped
// to the task a test created, because the e2e DB is shared across specs.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { MATTHIAS, addDays, today, uniq } from '../support/tasks.js';

type Seed = {
  title: string;
  dueDate?: string | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  recurrence?: { every: number; unit: 'DAY' | 'WEEK' | 'MONTH'; mode?: 'AFTER_COMPLETION' | 'FIXED' };
};

async function seed(request: APIRequestContext, body: Seed) {
  const res = await request.post('/api/tasks', { data: body, headers: MATTHIAS });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number; title: string };
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
const openSheet = async (page: Page, title: string) => {
  await row(page, title).locator('.task-body').click();
  await expect(sheet(page)).toBeVisible();
};
const noHScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test('TC-26 Schnell hinzufügen: Enter legt eine Aufgabe unter Irgendwann an, Feld bleibt fokussiert', async ({ page }) => {
  const a = uniq('Schnell A');
  const b = uniq('Schnell B');
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Neue Aufgabe' });
  await input.fill(a);
  await input.press('Enter');
  await expect(section(page, 'Irgendwann').getByText(a)).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  // second one in a row without tapping the field again
  await page.keyboard.type(b);
  await page.keyboard.press('Enter');
  await expect(section(page, 'Irgendwann').getByText(b)).toBeVisible();
  // blank input adds nothing
  const before = await page.getByRole('listitem').count();
  await input.fill('   ');
  await input.press('Enter');
  await expect(input).toBeFocused();
  expect(await page.getByRole('listitem').count()).toBe(before);
});

test('TC-27 Abschnitte: Reihenfolge, Zähler, Später eingeklappt, Leerzustand', async ({ page, request }) => {
  const t = today();
  const over = uniq('Sek fällig');
  const soon = uniq('Sek demnächst');
  const later = uniq('Sek später');
  const some = uniq('Sek irgendwann');
  await seed(request, { title: over, dueDate: addDays(t, -2) });
  await seed(request, { title: soon, dueDate: addDays(t, 3) });
  await seed(request, { title: later, dueDate: addDays(t, 30) });
  await seed(request, { title: some });
  await page.goto('/');
  await expect(row(page, over)).toBeVisible();

  const headings = await page.locator('section.section > h2').evaluateAll((els) =>
    els.map((e) => e.textContent ?? ''),
  );
  const names = headings.map((h) => h.replace(/\s*\d+\s*$/, '').trim());
  expect(names).toEqual(['Fällig', 'Demnächst', 'Später', 'Irgendwann']);

  // each heading shows its count (for Später: the toggle's count; expand to compare)
  for (const name of ['Fällig', 'Demnächst', 'Irgendwann']) {
    const sec = section(page, name);
    const n = Number((await sec.locator('h2 .count').innerText()).trim());
    await expect(sec.getByRole('listitem')).toHaveCount(n);
  }

  // Später: collapsed by default, expands on tap
  const spaeter = section(page, 'Später');
  await expect(row(page, later)).toHaveCount(0);
  const toggle = spaeter.getByRole('button', { name: /Später/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const n = Number((await spaeter.locator('.count').innerText()).trim());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, later)).toBeVisible();
  await expect(spaeter.getByRole('listitem')).toHaveCount(n);

  // empty state with nothing at all
  await page.route('**/api/tasks', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: { today: t, sections: { faellig: [], demnaechst: [], spaeter: [], irgendwann: [] } },
        })
      : route.continue(),
  );
  await page.reload();
  await expect(page.getByText('Alles erledigt')).toBeVisible();
  await expect(page.locator('section.section')).toHaveCount(0);
});

test('TC-28 Wiederkehrende Aufgabe abhaken, Rückgängig stellt sie wieder her', async ({ page, request }) => {
  const title = uniq('Bettwäsche');
  await seed(request, { title, dueDate: today(), recurrence: { every: 1, unit: 'WEEK' } });
  await page.goto('/');
  await expect(section(page, 'Fällig').getByText(title)).toBeVisible();

  await row(page, title).getByRole('button', { name: /^Erledigt:/ }).click();
  const toast = page.getByRole('status');
  await expect(toast).toContainText(`„${title}“ erledigt`);
  await expect(section(page, 'Fällig').getByText(title)).toHaveCount(0);
  const moved = row(page, title);
  await expect(moved).toContainText(/zuletzt heute · Matthias/);
  await expect(moved).toContainText('in 7 Tagen');
  await expect(section(page, 'Demnächst').getByText(title)).toBeVisible();

  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(section(page, 'Fällig').getByText(title)).toBeVisible();
  await expect(row(page, title)).toContainText('heute');
  await expect(row(page, title)).not.toContainText('zuletzt');
});

test('TC-29 Einmalige Aufgabe abhaken, Rückgängig bringt sie zurück', async ({ page, request }) => {
  const title = uniq('Einmalig');
  await seed(request, { title });
  await page.goto('/');
  await row(page, title).getByRole('button', { name: /^Erledigt:/ }).click();
  await expect(row(page, title)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('erledigt');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(section(page, 'Irgendwann').getByText(title)).toBeVisible();
});

test('TC-30 Bearbeiten-Sheet: Titel, wichtig, Wiederholung alle 2 Wochen', async ({ page, request }) => {
  const title = uniq('Zu bearbeiten');
  const renamed = uniq('Umbenannt');
  await seed(request, { title });
  await page.goto('/');
  await openSheet(page, title);
  const dlg = sheet(page);
  await dlg.getByLabel('Titel').fill(renamed);
  await dlg.locator('.segmented').getByText('wichtig', { exact: true }).click();
  await dlg.getByRole('checkbox', { name: 'Wiederholung' }).check();
  await dlg.getByLabel('Anzahl').fill('2');
  await dlg.getByLabel('Einheit').selectOption('WEEK');
  await expect(dlg.getByRole('radio', { name: /nach Erledigung/ })).toBeChecked();
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg).toBeHidden();
  const r = row(page, renamed);
  await expect(r).toBeVisible();
  await expect(r).toContainText('wichtig');
  await expect(r).toContainText('alle 2 Wochen');
  await expect(row(page, title).filter({ hasNotText: renamed })).toHaveCount(0);
});

test('TC-31 Diesmal überspringen verschiebt das Datum, "zuletzt" bleibt', async ({ page, request }) => {
  const title = uniq('Überspringen');
  const oneOff = uniq('Nicht wiederkehrend');
  const t = today();
  const created = await seed(request, { title, dueDate: t, recurrence: { every: 1, unit: 'WEEK' } });
  const done = await request.post(`/api/tasks/${created.id}/complete`, {
    data: { date: addDays(t, -1) },
    headers: MATTHIAS,
  });
  expect(done.ok()).toBe(true);
  await seed(request, { title: oneOff });
  await page.goto('/');
  const r = row(page, title);
  await expect(r).toContainText('in 6 Tagen');
  await expect(r).toContainText(/zuletzt gestern · /);

  await openSheet(page, oneOff);
  await expect(sheet(page).getByRole('button', { name: 'Diesmal überspringen' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();

  await openSheet(page, title);
  await sheet(page).getByRole('button', { name: 'Diesmal überspringen' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByRole('status')).toContainText(`„${title}“ übersprungen`);
  await expect(r).not.toContainText('in 6 Tagen');
  await expect(r).toContainText(/zuletzt gestern · /);
});

test('TC-32 Erledigt am gestern: nächste Fälligkeit in 6 Tagen', async ({ page, request }) => {
  const title = uniq('Gestern erledigt');
  const t = today();
  await seed(request, { title, dueDate: t, recurrence: { every: 1, unit: 'WEEK' } });
  await page.goto('/');
  await openSheet(page, title);
  const dlg = sheet(page);
  await dlg.getByRole('button', { name: /Erledigt am/ }).click();
  await dlg.getByLabel('Erledigt am', { exact: true }).fill(addDays(t, -1));
  await dlg.getByRole('button', { name: 'Eintragen' }).click();
  await expect(dlg).toBeHidden();
  const r = row(page, title);
  await expect(r).toContainText('in 6 Tagen');
  await expect(r).toContainText(/zuletzt gestern · /);
});

test('TC-33 Löschen mit Bestätigung; Abbrechen behält die Aufgabe', async ({ page, request }) => {
  const title = uniq('Löschen');
  await seed(request, { title });
  await page.goto('/');
  await openSheet(page, title);
  await sheet(page).getByRole('button', { name: 'Löschen' }).click();
  const confirm = page.getByRole('dialog', { name: /löschen\?/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(confirm).toBeHidden();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(row(page, title)).toBeVisible();

  await openSheet(page, title);
  await sheet(page).getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog', { name: /löschen\?/ }).getByRole('button', { name: 'Löschen' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(row(page, title)).toHaveCount(0);
});

test('TC-34 Handy-Layout: kein Scrollen seitwärts, Touch-Ziele, deutsche Datumsangaben', async ({ page, request }) => {
  const t = today();
  const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  const far = addDays(t, 12);
  const [y, m, d] = far.split('-').map(Number);
  const farLabel = `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`;
  const long = uniq('Sehr lange Aufgabenbezeichnung ohne Leerzeichen-Pause damit der Umbruch geprüft wird');
  const cases: [string, number | null, string][] = [
    [uniq('L heute'), 0, 'heute'],
    [uniq('L überfällig'), -3, 'seit 3 Tagen'],
    [uniq('L morgen'), 1, 'morgen'],
    [uniq('L bald'), 4, 'in 4 Tagen'],
    [uniq('L fern'), 12, farLabel],
  ];
  for (const [title, off] of cases) {
    await seed(request, { title, dueDate: off === null ? null : addDays(t, off) });
  }
  await seed(request, { title: long, dueDate: t, recurrence: { every: 3, unit: 'MONTH', mode: 'FIXED' } });
  await page.goto('/');
  await expect(row(page, long)).toBeVisible();
  for (const [title, , label] of cases) {
    if (title.startsWith('L fern')) {
      // 12 days out → Später (collapsed)
      await section(page, 'Später').getByRole('button').click();
    }
    await expect(row(page, title)).toContainText(label);
  }
  await expect(row(page, long)).toContainText('alle 3 Monate');
  await expect(row(page, long)).toContainText('fest');
  expect(await noHScroll(page)).toBe(false);

  const check = await row(page, cases[0][0]).getByRole('button', { name: /^Erledigt:/ }).boundingBox();
  expect(check!.width).toBeGreaterThanOrEqual(44);
  expect(check!.height).toBeGreaterThanOrEqual(44);
  const add = await page.getByRole('button', { name: 'Hinzufügen' }).boundingBox();
  expect(add!.width).toBeGreaterThanOrEqual(44);

  // the fixed bar must not cover the last list item
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = (await page.locator('.quick-add').boundingBox())!;
  const lastRow = (await page.getByRole('listitem').last().boundingBox())!;
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(bar.y);

  await openSheet(page, long);
  const dlg = sheet(page);
  await dlg.getByRole('checkbox', { name: 'Wiederholung' }).check();
  await dlg.getByRole('button', { name: /Erledigt am/ }).click();
  const targets = dlg.locator('button, .segmented label, .switch-row, .radio-row, input[type=date], select');
  const n = await targets.count();
  expect(n).toBeGreaterThan(8);
  for (let i = 0; i < n; i++) {
    const box = await targets.nth(i).boundingBox();
    expect(box, `target ${i}`).not.toBeNull();
    expect(box!.height, `height of target ${i}`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `width of target ${i}: ${await targets.nth(i).evaluate((e) => e.outerHTML.slice(0, 80))}`).toBeGreaterThanOrEqual(44);
  }
  expect(await noHScroll(page)).toBe(false);
});

test('TC-35 Fehler sind sichtbar; Speichern ist bei leerem Titel gesperrt', async ({ page, request }) => {
  const title = uniq('Fehlerfall');
  const added = uniq('Fehler neu');
  await seed(request, { title });
  await page.goto('/');
  await expect(row(page, title)).toBeVisible();

  // failing mutations -> German message, field text kept, list stays truthful
  await page.route('**/api/tasks**', (route) => {
    const method = route.request().method();
    return method === 'GET' ? route.continue() : route.fulfill({ status: 500, json: { error: 'boom' } });
  });
  const input = page.getByRole('textbox', { name: 'Neue Aufgabe' });
  await input.fill(added);
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Das hat nicht geklappt');
  await expect(input).toHaveValue(added);
  await expect(row(page, added)).toHaveCount(0);

  await row(page, title).getByRole('button', { name: /^Erledigt:/ }).click();
  await expect(page.getByRole('alert')).toContainText('Das hat nicht geklappt');
  await expect(row(page, title)).toBeVisible();

  // sheet: Save disabled while the title is empty; failure shown inline
  await openSheet(page, title);
  const dlg = sheet(page);
  const save = dlg.getByRole('button', { name: 'Speichern' });
  await dlg.getByLabel('Titel').fill('');
  await expect(save).toBeDisabled();
  await dlg.getByLabel('Titel').fill(title + ' neu');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dlg.getByRole('alert')).toContainText('Das hat nicht geklappt');
  await expect(dlg).toBeVisible();
  await page.unroute('**/api/tasks**');
});
