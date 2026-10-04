// Home vs. recurring view, TC-37…TC-41 (ADR-0007), at the phone viewport.
// Tasks are seeded through the API with unique titles; locators are scoped to them.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { MATTHIAS, addDays, today, uniq } from '../support/tasks.js';

type Seed = {
  title: string;
  dueDate?: string | null;
  recurrence?: { every: number; unit: 'DAY' | 'WEEK' | 'MONTH'; mode?: 'AFTER_COMPLETION' | 'FIXED' };
};

async function seed(request: APIRequestContext, body: Seed) {
  const res = await request.post('/api/tasks', { data: body, headers: MATTHIAS });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number; title: string };
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const newBtn = (page: Page) => page.getByRole('button', { name: /Neue wiederkehrende Aufgabe/ });
const create = (page: Page) => page.getByRole('dialog', { name: 'Neue wiederkehrende Aufgabe' });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });

test('TC-37 Tab-Leiste: Ansicht wechseln, Hash in der URL, Reload und Zurück, Schnell-Hinzufügen nur auf Aufgaben', async ({ page }) => {
  await page.goto('/');
  const aufgaben = tabs(page).getByRole('link', { name: 'Aufgaben' });
  const wieder = tabs(page).getByRole('link', { name: 'Routinen' });
  await expect(aufgaben).toHaveAttribute('aria-current', 'page');
  await expect(wieder).not.toHaveAttribute('aria-current', 'page');
  const quick = page.getByRole('textbox', { name: 'Neue Aufgabe' });
  await expect(quick).toBeVisible();

  await wieder.click();
  await expect(page).toHaveURL(/#\/routinen$/);
  await expect(wieder).toHaveAttribute('aria-current', 'page');
  await expect(aufgaben).not.toHaveAttribute('aria-current', 'page');
  await expect(newBtn(page)).toBeVisible();
  await expect(quick).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/#\/routinen$/);
  await expect(newBtn(page)).toBeVisible();
  await expect(quick).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/(#\/)?$/); // the initial entry has no hash: that is Aufgaben too
  await expect(aufgaben).toHaveAttribute('aria-current', 'page');
  await expect(quick).toBeVisible();

  // tab targets are at least 44 px, and the quick-add bar sits above the tab bar
  for (const tab of [aufgaben, wieder]) {
    const box = (await tab.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  const bar = (await page.locator('.quick-add').boundingBox())!;
  const tab = (await tabs(page).boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(tab.y + 1);
});

test('TC-38 Wiederkehrend zeigt Termin, Rhythmus, zuletzt; ferne Aufgabe nur hier; Leerzustand', async ({ page, request }) => {
  const t = today();
  const far = uniq('Fenster putzen');
  const near = uniq('Müll rausbringen');
  const done = uniq('Staubsaugen');
  await seed(request, { title: far, dueDate: addDays(t, 20), recurrence: { every: 3, unit: 'MONTH' } });
  await seed(request, { title: near, dueDate: addDays(t, 2), recurrence: { every: 1, unit: 'WEEK', mode: 'FIXED' } });
  const d = await seed(request, { title: done, dueDate: t, recurrence: { every: 1, unit: 'WEEK' } });
  expect((await request.post(`/api/tasks/${d.id}/complete`, { headers: MATTHIAS })).status()).toBe(200);

  await page.goto('/#/wiederkehrend');
  await expect(row(page, far)).toBeVisible();
  await expect(row(page, far)).toContainText('alle 3 Monate');
  await expect(row(page, far)).toContainText(/(Mo|Di|Mi|Do|Fr|Sa|So)\. \d\d\.\d\d\./);
  await expect(row(page, near)).toContainText('in 2 Tagen');
  await expect(row(page, near)).toContainText('jede Woche');
  await expect(row(page, done)).toContainText('zuletzt heute · Matthias');
  // sorted by next due date
  const titles = await page.locator('.title').allInnerTexts();
  expect(titles.indexOf(near)).toBeLessThan(titles.indexOf(far));

  // the far one is not on Aufgaben (not even in the collapsed Später)
  await tabs(page).getByRole('link', { name: 'Aufgaben' }).click();
  await expect(row(page, near)).toBeVisible();
  await expect(row(page, far)).toHaveCount(0);
  const spaeter = section(page, 'Später');
  if (await spaeter.count()) {
    await spaeter.getByRole('button').click();
    await expect(row(page, far)).toHaveCount(0);
  }

  // empty state
  await page.route('**/api/recurring', (route) => route.fulfill({ json: { today: t, tasks: [] } }));
  await tabs(page).getByRole('link', { name: 'Routinen' }).click();
  await expect(page.getByText('Noch keine Routinen')).toBeVisible();
  await expect(newBtn(page)).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('TC-39 "+" öffnet das Sheet mit Wiederholung; Speichern legt die Aufgabe an', async ({ page }) => {
  const title = uniq('Filter wechseln');
  await page.goto('/#/wiederkehrend');
  await newBtn(page).click();
  const dlg = create(page);
  await expect(dlg).toBeVisible();
  // Always a chore when created here (ADR-0007): no switch, the rhythm fields are just there.
  await expect(dlg.getByRole('checkbox', { name: 'Wiederholung' })).toHaveCount(0);
  await expect(dlg.getByRole('radio', { name: 'Einmalig' })).toHaveCount(0);
  await expect(dlg.getByLabel('Anzahl')).toHaveValue('1');
  await expect(dlg.getByLabel('Einheit')).toHaveValue('WEEK');
  await expect(dlg.getByRole('radio', { name: /nach Erledigung/ })).toBeChecked();
  await expect(dlg.getByLabel('Fällig am')).toHaveValue(today());
  // create mode: no skip / erledigt am / löschen
  await expect(dlg.getByRole('button', { name: /Löschen|überspringen|Erledigt am/ })).toHaveCount(0);

  const save = dlg.getByRole('button', { name: 'Speichern' });
  await expect(save).toBeDisabled(); // title required
  await dlg.getByLabel('Titel').fill(title);
  await expect(save).toBeEnabled();
  await dlg.getByLabel('Anzahl').fill('3');
  await dlg.getByLabel('Einheit').selectOption('MONTH');
  await save.click();
  await expect(dlg).toBeHidden();
  await expect(row(page, title)).toContainText('alle 3 Monate');
  await expect(row(page, title)).toContainText('heute');

  await tabs(page).getByRole('link', { name: 'Aufgaben' }).click();
  await expect(section(page, 'Fällig').getByText(title)).toBeVisible();
});

test('TC-40 Einmalige Aufgabe wird wiederkehrend; Abhaken in Wiederkehrend mit Rückgängig', async ({ page, request }) => {
  const title = uniq('Wird wöchentlich');
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Neue Aufgabe' });
  await input.fill(title);
  await input.press('Enter');
  await expect(section(page, 'Irgendwann').getByText(title)).toBeVisible();

  await row(page, title).locator('.task-body').click();
  const dlg = sheet(page);
  await dlg.getByText('Wiederkehrend', { exact: true }).click(); // kind choice (ADR-0010)
  await dlg.getByLabel('Anzahl').fill('1');
  await dlg.getByLabel('Einheit').selectOption('WEEK');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg).toBeHidden();

  await tabs(page).getByRole('link', { name: 'Routinen' }).click();
  await expect(row(page, title)).toContainText('jede Woche');

  // tick it off here
  await row(page, title).getByRole('button', { name: /^Erledigt:/ }).click();
  const toast = page.getByRole('status');
  await expect(toast).toContainText(`„${title}“ erledigt`);
  await expect(row(page, title)).toContainText('zuletzt heute · Matthias');
  await expect(row(page, title)).toContainText('in 7 Tagen');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row(page, title)).not.toContainText('zuletzt');
  await expect(row(page, title)).toContainText('heute');
});

test('TC-41 Demnächst ist leiser als Fällig, bleibt aber bedienbar (44 px)', async ({ page, request }) => {
  const t = today();
  const due = uniq('Ruhe fällig');
  const soon = uniq('Ruhe bald');
  await seed(request, { title: due, dueDate: t });
  await seed(request, { title: soon, dueDate: addDays(t, 3) });
  await page.goto('/');
  await expect(row(page, due)).toBeVisible();

  const fHead = section(page, 'Fällig').locator('h2');
  const dHead = section(page, 'Demnächst').locator('h2');
  const size = (l: typeof fHead) => l.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const color = (l: typeof fHead) => l.evaluate((e) => getComputedStyle(e).color);
  const quieterTitle = async () => {
    const a = await row(page, due).locator('.title').evaluate((e) => getComputedStyle(e).color);
    const b = await row(page, soon).locator('.title').evaluate((e) => getComputedStyle(e).color);
    return a !== b;
  };
  expect((await size(dHead)) < (await size(fHead)) || (await color(dHead)) !== (await color(fHead)) || (await quieterTitle())).toBe(true);
  expect(await quieterTitle()).toBe(true);

  const check = row(page, soon).getByRole('button', { name: /^Erledigt:/ });
  const box = (await check.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await check.click();
  await expect(page.getByRole('status')).toContainText(`„${soon}“ erledigt`);
  await expect(row(page, soon)).toHaveCount(0);
});
