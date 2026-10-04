// Trigger tasks (ADR-0010), browser half: TC-80 at the phone viewport.
import { test, expect, type Page } from '@playwright/test';
import { MATTHIAS, today, uniq } from '../support/tasks.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const noHScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

async function expectTargets(page: Page, scope: ReturnType<Page['locator']>) {
  const targets = scope.locator('button, .segmented label, .radio-row, .switch-row, input[type=date], select');
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

test('TC-80 Routinen-Tab, Art-Auswahl, Token-Dialog, Neuen Token erzeugen, Auslösen', async ({ page, request }) => {
  const chore = uniq('ZZ-Trigger Filter');
  const title = uniq('ZZ-Trigger Waschmaschine fertig');
  const seeded = await request.post('/api/tasks', {
    data: { title: chore, dueDate: today(), recurrence: { every: 1, unit: 'WEEK' } },
    headers: MATTHIAS,
  });
  expect(seeded.status()).toBe(201);

  // the tab is "Routinen"; the old hash still lands there
  await page.goto('/#/wiederkehrend');
  const routinen = tabs(page).getByRole('link', { name: 'Routinen' });
  await expect(routinen).toHaveAttribute('aria-current', 'page');
  await expect(tabs(page).getByRole('link', { name: 'Wiederkehrend' })).toHaveCount(0);
  await page.goto('/#/routinen');
  await expect(routinen).toHaveAttribute('aria-current', 'page');
  await expect(section(page, 'Wiederkehrend').getByText(chore)).toBeVisible();

  // create: kind choice, Auslöser hides the date and turns notify on
  await page.getByRole('button', { name: /Neue wiederkehrende Aufgabe/ }).click();
  const dlg = page.getByRole('dialog').first();
  await expect(dlg.getByRole('radio', { name: 'Wiederkehrend' })).toBeChecked();
  await expect(dlg.getByRole('radio', { name: 'Einmalig' })).toHaveCount(0); // ADR-0007: no one-offs from here
  await dlg.getByLabel('Titel').fill(title);
  const notify = dlg.getByRole('checkbox', { name: /Benachrichtigen/ });
  await expect(notify).not.toBeChecked();
  await expect(dlg.getByLabel('Fällig am')).toBeVisible();
  await dlg.getByText('Auslöser', { exact: true }).click();
  await expect(dlg.getByRole('heading', { name: 'Neue Auslöser-Aufgabe' })).toBeVisible();
  await expect(dlg.getByLabel('Fällig am')).toHaveCount(0);
  await expect(dlg.getByText('Wenn schon fällig')).toBeVisible();
  await expect(dlg.getByRole('radio', { name: /Erneut benachrichtigen/ })).toBeChecked();
  await expect(dlg.getByRole('radio', { name: /Nichts tun/ })).not.toBeChecked();
  await expect(notify).toBeChecked();
  await expect(dlg.getByLabel('Anzahl')).toHaveCount(0);
  await expectTargets(page, dlg);
  expect(await noHScroll(page)).toBe(false);

  // saving opens the token dialog: URL + YAML with the bearer, shown once
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  const tokenDlg = page.getByRole('dialog', { name: /^Token für/ });
  await expect(tokenDlg).toBeVisible();
  await expect(tokenDlg.getByText('Wird nur jetzt angezeigt.')).toBeVisible();
  const snippet = (await tokenDlg.locator('.token-snippet').innerText()).trim();
  expect(snippet).toMatch(/^rest_command:\n {2}haushalt_zz_trigger_waschmaschine_fertig_\d+_\d+:\n {4}url: http\S+\/hooks\/\d+\n {4}method: POST\n {4}headers:\n {6}Authorization: Bearer hh_[A-Za-z0-9_-]{43,}$/);
  const id = Number(/\/hooks\/(\d+)/.exec(snippet)![1]);
  const token1 = /Bearer (hh_\S+)/.exec(snippet)![1];
  await tokenDlg.getByRole('button', { name: 'Kopieren' }).click();
  await expect(tokenDlg.getByText('Kopiert.')).toBeVisible();
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(snippet);
  await expectTargets(page, tokenDlg);
  expect(await noHScroll(page)).toBe(false);
  await tokenDlg.getByRole('button', { name: 'Fertig' }).click();
  await expect(tokenDlg).toBeHidden();

  // the waiting row: group "Auf Auslöser", "wartet", bolt, nothing to tick off
  const waiting = row(page, title);
  await expect(section(page, 'Auf Auslöser').getByText(title)).toBeVisible();
  await expect(waiting).toContainText('wartet');
  await expect(waiting.getByRole('img', { name: 'Auslöser' })).toBeVisible();
  await expect(waiting.getByRole('button', { name: /^Erledigt:/ })).toBeDisabled();
  await expect(page.getByText(token1)).toHaveCount(0);
  expect(await noHScroll(page)).toBe(false);

  // not on Aufgaben while waiting
  await tabs(page).getByRole('link', { name: 'Aufgaben' }).click();
  await expect(page.getByRole('textbox', { name: 'Neue Aufgabe' })).toBeVisible();
  await expect(row(page, title)).toHaveCount(0);
  await routinen.click();

  // reopening: "Token aktiv", no token shown; replacing asks first
  await waiting.locator('.task-body').click();
  const sheet = page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
  await expect(sheet.getByText('Home Assistant', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Token aktiv')).toBeVisible();
  await expect(sheet.getByText('hh_')).toHaveCount(0);
  await expect(sheet.getByLabel('Fällig am')).toHaveCount(0);
  await expectTargets(page, sheet);
  await sheet.getByRole('button', { name: 'Neuen Token erzeugen' }).click();
  const confirm = page.getByRole('dialog', { name: 'Neuen Token erzeugen?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(confirm).toBeHidden();
  await expect(tokenDlg).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Neuen Token erzeugen' }).click();
  await page.getByRole('dialog', { name: 'Neuen Token erzeugen?' }).getByRole('button', { name: 'Neuen Token erzeugen' }).click();
  await expect(tokenDlg).toBeVisible();
  const token2 = /Bearer (hh_\S+)/.exec((await tokenDlg.locator('.token-snippet').innerText()))![1];
  expect(token2).not.toBe(token1);
  await tokenDlg.getByRole('button', { name: 'Fertig' }).click();
  await sheet.getByRole('button', { name: 'Schließen' }).click();
  await expect(sheet).toBeHidden();
  const fire = (bearer: string) => request.post(`/hooks/${id}`, { headers: { Authorization: `Bearer ${bearer}` } });
  expect((await fire(token1)).status()).toBe(401);

  // fire it: on Aufgaben with a bolt, and "ausgelöst heute …" in Routinen
  const fired = await fire(token2);
  expect(fired.status()).toBe(200);
  await page.reload();
  await expect(waiting).toContainText(/ausgelöst heute \d\d:\d\d/);
  await expect(waiting.getByRole('button', { name: /^Erledigt:/ })).toBeEnabled();
  await tabs(page).getByRole('link', { name: 'Aufgaben' }).click();
  const onHome = section(page, 'Fällig').getByRole('listitem').filter({ hasText: title });
  await expect(onHome).toBeVisible();
  await expect(onHome.getByRole('img', { name: 'Auslöser' })).toBeVisible();
  expect(await noHScroll(page)).toBe(false);

  // ticking it off sends it back to waiting
  await onHome.getByRole('button', { name: /^Erledigt:/ }).click();
  await expect(onHome).toHaveCount(0);
  await routinen.click();
  await expect(waiting).toContainText('wartet');
  await expect(waiting).toContainText('zuletzt heute · Matthias');
});
