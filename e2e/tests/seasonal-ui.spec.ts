// Seasonal chores in the UI, TC-55 (ADR-0008), at the phone viewport.
import { test, expect, type Page } from '@playwright/test';
import { MATTHIAS, MONTH_NAMES, farSeason, today, uniq } from '../support/tasks.js';

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const create = (page: Page) => page.getByRole('dialog', { name: 'Neue wiederkehrende Aufgabe' });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
const noHScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('TC-55 Saison im Sheet: Schalter, Standard März–Oktober, Rhythmus-Text, Wiederöffnen, ausschalten', async ({ page }) => {
  const title = uniq('Rasen mähen');
  await page.goto('/#/wiederkehrend');
  await page.getByRole('button', { name: /Neue wiederkehrende Aufgabe/ }).click();
  const dlg = create(page);
  await dlg.getByLabel('Titel').fill(title);
  await dlg.getByLabel('Anzahl').fill('2');

  const sw = dlg.getByRole('checkbox', { name: 'Nur in bestimmten Monaten' });
  await expect(sw).not.toBeChecked();
  const von = dlg.getByLabel('von', { exact: true });
  await expect(von).toHaveCount(0);
  await sw.check();
  const bis = dlg.getByLabel('bis', { exact: true });
  await expect(von).toHaveValue('3');
  await expect(bis).toHaveValue('10');
  await expect(von.locator('option')).toHaveText(MONTH_NAMES);
  for (const el of [sw, von, bis]) {
    const box = (await el.locator('xpath=ancestor-or-self::*[self::label or self::select][1]').boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await noHScroll(page)).toBe(true);
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg).toHaveCount(0);

  await expect(row(page, title)).toContainText('alle 2 Wochen · März–Oktober');
  expect(await noHScroll(page)).toBe(true);

  // reopening shows the saved months; change them
  await row(page, title).getByRole('button', { name: /Bearbeiten/ }).click();
  const edit = sheet(page);
  await expect(edit.getByRole('checkbox', { name: 'Nur in bestimmten Monaten' })).toBeChecked();
  await expect(edit.getByLabel('von', { exact: true })).toHaveValue('3');
  await expect(edit.getByLabel('bis', { exact: true })).toHaveValue('10');
  await edit.getByLabel('von', { exact: true }).selectOption('11');
  await edit.getByLabel('bis', { exact: true }).selectOption('2');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(edit).toHaveCount(0);
  await expect(row(page, title)).toContainText('November–Februar');

  // switch off -> season gone
  await row(page, title).getByRole('button', { name: /Bearbeiten/ }).click();
  await edit.getByRole('checkbox', { name: 'Nur in bestimmten Monaten' }).uncheck();
  await expect(edit.getByLabel('von', { exact: true })).toHaveCount(0);
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(edit).toHaveCount(0);
  await expect(row(page, title)).toContainText('alle 2 Wochen');
  await expect(row(page, title)).not.toContainText('·  ');
  await expect(row(page, title)).not.toContainText('November');
});

test('TC-55 ruhende Aufgabe: gedämpft, "ruht bis <Monat>", Wiederöffnen zeigt die Monate', async ({ page, request }) => {
  const title = uniq('Hecke schneiden');
  const season = farSeason();
  const res = await request.post('/api/tasks', {
    data: { title, recurrence: { every: 1, unit: 'MONTH', season } },
    headers: MATTHIAS,
  });
  expect(res.status()).toBe(201);
  await page.goto('/#/wiederkehrend');
  const r = row(page, title);
  await expect(r).toContainText(`ruht bis ${MONTH_NAMES[season.from - 1]}`);
  await expect(r).toHaveClass(/resting/);
  expect(await r.locator('.title').evaluate((el) => getComputedStyle(el).color)).not.toBe(
    await page.locator('body').evaluate((el) => getComputedStyle(el).color),
  );
  await r.getByRole('button', { name: /Bearbeiten/ }).click();
  const edit = sheet(page);
  await expect(edit.getByLabel('von', { exact: true })).toHaveValue(String(season.from));
  await expect(edit.getByLabel('bis', { exact: true })).toHaveValue(String(season.to));
  expect(await noHScroll(page)).toBe(true);
  void today;
});
