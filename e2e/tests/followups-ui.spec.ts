// Follow-up triggers (ADR-0011), browser half: TC-93 at the phone viewport.
import { test, expect, type Page } from '@playwright/test';
import { MATTHIAS, today, uniq } from '../support/tasks.js';

const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const noHScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

async function expectTargets(scope: ReturnType<Page['locator']>) {
  const targets = scope.locator('button, .segmented label, .radio-row, .switch-row, input[type=date], input[type=number], select');
  const n = await targets.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    const el = targets.nth(i);
    if (!(await el.isVisible())) continue;
    const box = (await el.boundingBox())!;
    expect(box.height, `height of target ${i}: ${await el.evaluate((e) => e.outerHTML.slice(0, 80))}`).toBeGreaterThanOrEqual(44);
    expect(box.width, `width of target ${i}`).toBeGreaterThanOrEqual(44);
  }
}

test('TC-93 Folgt auf: Auswahl, kein Token-Dialog, Routinen-Zeile, Hinweise im Sheet', async ({ page, request }) => {
  // P recurs (due today) so it stays reachable after ticking it off.
  const pTitle = uniq('ZZ-FU UI Wäsche aufhängen, eine ziemlich lange Aufgabe mit langem Titel');
  const fTitle = uniq('ZZ-FU UI aufräumen');
  const gTitle = uniq('ZZ-FU UI ohne Vorgänger');
  const seeded = await request.post('/api/tasks', {
    data: { title: pTitle, dueDate: today(), recurrence: { every: 1, unit: 'WEEK' } },
    headers: MATTHIAS,
  });
  expect(seeded.status()).toBe(201);
  const p = await seeded.json();

  await page.goto('/#/routinen');
  const newTask = () => page.getByRole('button', { name: /Neue wiederkehrende Aufgabe/ }).click();

  // a trigger without a predecessor still opens the token dialog
  await newTask();
  let dlg = page.getByRole('dialog').first();
  await dlg.getByText('Auslöser', { exact: true }).click();
  const pick = dlg.getByLabel('Folgt auf');
  await expect(pick).toBeVisible();
  await expect(pick.locator('option:checked')).toHaveText('Keine (nur Home Assistant)');
  await expect(dlg.getByLabel('Stunden')).toHaveCount(0);
  await dlg.getByLabel('Titel').fill(gTitle);
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  const tokenDlg = page.getByRole('dialog', { name: /^Token für/ });
  await expect(tokenDlg).toBeVisible();
  await tokenDlg.getByRole('button', { name: 'Fertig' }).click();
  await expect(tokenDlg).toBeHidden();

  // with a predecessor: "nach [24] Stunden", no token dialog
  await newTask();
  dlg = page.getByRole('dialog').first();
  await dlg.getByText('Auslöser', { exact: true }).click();
  await dlg.getByLabel('Titel').fill(fTitle);
  await dlg.getByLabel('Folgt auf').selectOption({ label: pTitle });
  await expect(dlg.getByLabel('Stunden')).toHaveValue('24');
  await expect(dlg.getByText('nach', { exact: true })).toBeVisible();
  await expectTargets(dlg);
  expect(await noHScroll(page)).toBe(false);
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /^Token für/ })).toHaveCount(0);

  // Routinen row: waiting with a predecessor
  const fRow = page.getByRole('listitem').filter({ hasText: fTitle });
  await expect(fRow).toContainText(`nach „${pTitle}“ + 24 h`);
  expect(await noHScroll(page)).toBe(false);
  const box = (await fRow.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);

  // tick P off on home -> scheduled
  await tabs(page).getByRole('link', { name: 'Aufgaben' }).click();
  await section(page, 'Fällig').getByRole('listitem').filter({ hasText: pTitle }).getByRole('button', { name: /^Erledigt:/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: fTitle })).toHaveCount(0); // not on home
  await tabs(page).getByRole('link', { name: 'Routinen' }).click();
  await expect(fRow).toContainText(/kommt (heute|morgen) \d\d:\d\d/);
  expect(await noHScroll(page)).toBe(false);

  // the follow-up's sheet: pending hint
  await fRow.locator('.task-body').click();
  let sheet = page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
  await expect(sheet.getByLabel('Folgt auf')).toHaveValue(String(p.id));
  await expect(sheet.getByText(/^Kommt (heute|morgen) um \d\d:\d\d$/)).toBeVisible();
  await expectTargets(sheet);
  expect(await noHScroll(page)).toBe(false);
  await sheet.getByRole('button', { name: 'Schließen' }).click();
  await expect(sheet).toBeHidden();

  // the predecessor's sheet: "Danach: …"
  await page.getByRole('listitem').filter({ hasText: pTitle }).locator('.task-body').click();
  sheet = page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
  await expect(sheet.getByText(`Danach: ${fTitle} (nach 24 h)`)).toBeVisible();
  expect(await noHScroll(page)).toBe(false);
});
