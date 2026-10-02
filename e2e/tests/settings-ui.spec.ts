// TC-49 (UI half): Einstellungen at #/einstellungen, phone viewport.
import { test, expect } from '@playwright/test';
import { ANNA, MATTHIAS, uniq } from '../support/tasks.js';
import { MCP_TOKEN } from '../support/paths.js';
import { postMcp, runOAuthFlow } from '../support/mcpClient.js';

test('TC-49 Einstellungen: Adresse + Anleitung, nur meine Clients, umbenennen, trennen (mit Bestätigung)', async ({
  page,
  request,
  baseURL,
}) => {
  const mine = uniq('Mein Claude');
  const hers = uniq('Annas Claude');
  const a = await runOAuthFlow(request, mine, MATTHIAS);
  await runOAuthFlow(request, hers, ANNA);

  // reachable from the header
  await page.goto('/');
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page).toHaveURL(/#\/einstellungen$/);

  const url = page.getByRole('textbox', { name: 'MCP-Adresse' });
  await expect(url).toHaveValue(`${baseURL}/mcp`);
  await expect(page.getByText('Konnektoren')).toBeVisible();
  await page.getByRole('button', { name: 'Kopieren' }).click();

  const item = (name: string) => page.getByRole('listitem').filter({ hasText: name });
  await expect(item(mine)).toBeVisible();
  await expect(item(mine)).toContainText('verbunden seit');
  await expect(item(mine)).toContainText('zuletzt benutzt');
  await expect(page.getByText(hers)).toHaveCount(0);

  // no horizontal scroll
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // the secret is nowhere in the page
  expect(await page.content()).not.toContain(MCP_TOKEN);

  // rename inline
  const renamed = uniq('Umbenannt');
  await item(mine).getByRole('button', { name: 'Umbenennen' }).click();
  await page.getByRole('textbox', { name: 'Name des Clients' }).fill(renamed);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(item(renamed)).toBeVisible();

  // revoke: cancel keeps it, confirm removes it and kills the token
  await item(renamed).getByRole('button', { name: 'Trennen' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText(renamed);
  await dlg.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(item(renamed)).toBeVisible();
  expect((await postMcp(request, a.accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status()).toBe(200);

  await item(renamed).getByRole('button', { name: 'Trennen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Trennen' }).click();
  await expect(item(renamed)).toHaveCount(0);
  expect((await postMcp(request, a.accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status()).toBe(401);
});
