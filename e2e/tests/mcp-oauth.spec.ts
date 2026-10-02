// MCP gate, OAuth flow and user binding: TC-42…TC-46 (ADR-0006).
// Raw HTTP via the `request` fixture; identity per request like Traefik would.
import { spawn } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { dbAll, ANNA, MATTHIAS, uniq } from '../support/tasks.js';
import { BASE_URL, DATABASE_URL, MCP_TOKEN, SERVER_ENTRY } from '../support/paths.js';
import {
  AUTHORIZE,
  MCP_REDIRECT_URI,
  authorizeParams,
  callJson,
  csrfFrom,
  exchangeCode,
  forgeBlob,
  parseRpc,
  pkcePair,
  postMcp,
  registerMcpClient,
  runOAuthFlow,
} from '../support/mcpClient.js';

test.use({ extraHTTPHeaders: {} });

const LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
const nowSec = () => Math.floor(Date.now() / 1000);

test('TC-42 Gate: /mcp ohne Token -> 401 mit WWW-Authenticate + resource_metadata', async ({ request }) => {
  const res = await postMcp(request, null, LIST);
  expect(res.status()).toBe(401);
  const challenge = res.headers()['www-authenticate'] ?? '';
  expect(challenge).toContain('Bearer');
  expect(challenge).toContain(`resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource/mcp"`);
  // refused before the SPA fallback would answer 200 with index.html
  const get = await request.get('/mcp', { headers: { Accept: 'application/json, text/event-stream' } });
  expect(get.status()).toBe(401);
});

test('TC-42 Ohne MCP_TOKEN wird kein /mcp gemountet (404, "MCP disabled")', async ({ request }) => {
  const port = 3202;
  const env = { ...process.env, DATABASE_URL, PORT: String(port) };
  delete env.MCP_TOKEN;
  delete env.WEB_DIST;
  const child = spawn('node', [SERVER_ENTRY], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  try {
    await expect
      .poll(async () => (await request.get(`http://127.0.0.1:${port}/api/health`).catch(() => null))?.status(), {
        timeout: 20_000,
      })
      .toBe(200);
    const base = `http://127.0.0.1:${port}`;
    expect((await request.post(`${base}/mcp`, { data: LIST })).status()).toBe(404);
    expect((await request.post(`${base}/mcp/register`, { data: { redirect_uris: [MCP_REDIRECT_URI] } })).status()).toBe(404);
    expect((await request.get(`${base}/.well-known/oauth-authorization-server`)).status()).toBe(404);
    expect(log).toContain('MCP disabled');
  } finally {
    child.kill();
  }
});

test('TC-43 OAuth only: der rohe MCP_TOKEN, manipulierte, abgelaufene und fremd gebundene Tokens -> 401', async ({
  request,
}) => {
  // raw secret as a bearer
  expect((await postMcp(request, MCP_TOKEN, LIST)).status()).toBe(401);

  const m = await runOAuthFlow(request, uniq('tc43'), MATTHIAS);
  expect((await postMcp(request, m.accessToken, LIST)).status()).toBe(200);

  // tampered payload (keeps the old signature)
  const [payload, sig] = m.accessToken.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const tampered = Buffer.from(JSON.stringify({ ...claims, uid: claims.uid + 1 }), 'utf8').toString('base64url');
  expect((await postMcp(request, `${tampered}.${sig}`, LIST)).status()).toBe(401);
  expect((await postMcp(request, `${payload}.AAAA`, LIST)).status()).toBe(401);
  expect((await postMcp(request, 'garbage', LIST)).status()).toBe(401);

  // validly signed (we know the secret here) but expired
  const expired = forgeBlob({ ...claims, iat: nowSec() - 7200, exp: nowSec() - 3600 }, MCP_TOKEN);
  expect((await postMcp(request, expired, LIST)).status()).toBe(401);
  // validly signed, unknown client
  expect((await postMcp(request, forgeBlob({ ...claims, cid: 'nope' }, MCP_TOKEN), LIST)).status()).toBe(401);
  // validly signed, but a uid that is not the one the client is bound to
  const other = dbAll('select id from User where username = ?', 'anna')[0]?.id ?? claims.uid + 1000;
  expect((await postMcp(request, forgeBlob({ ...claims, uid: other }, MCP_TOKEN), LIST)).status()).toBe(401);
  // a refresh token is not an access token
  expect((await postMcp(request, m.refreshToken, LIST)).status()).toBe(401);
  // control: the genuine claims re-signed still pass (the forging helper is sound)
  expect((await postMcp(request, forgeBlob(claims, MCP_TOKEN), LIST)).status()).toBe(200);
});

test('TC-44 Discovery + Flow: Consent hinter Identity, PKCE, CSRF, Ablehnen, unregistrierte redirect_uri', async ({
  request,
}) => {
  const as = await (await request.get('/.well-known/oauth-authorization-server')).json();
  expect(as).toMatchObject({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/mcp/token`,
    registration_endpoint: `${BASE_URL}/mcp/register`,
    code_challenge_methods_supported: ['S256'],
  });
  for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    expect(await (await request.get(p)).json()).toMatchObject({
      resource: `${BASE_URL}/mcp`,
      authorization_servers: [BASE_URL],
    });
  }

  const name = uniq('tc44 <b>x</b>');
  const clientId = await registerMcpClient(request, name);
  const { verifier, challenge } = pkcePair();
  const params = authorizeParams(clientId, challenge, 'st-1');

  // consent page is behind the identity check: no Remote-User -> 401, no page
  const anon = await request.get(AUTHORIZE, { params, maxRedirects: 0 });
  expect(anon.status()).toBe(401);
  expect((await request.post(AUTHORIZE, { form: { ...params, csrf: 'x', decision: 'allow' }, maxRedirects: 0 })).status()).toBe(401);
  // a failed anonymous attempt did not bind the client
  expect(dbAll('select userId from McpClient where clientId = ?', clientId)[0].userId).toBeNull();

  const consent = await request.get(AUTHORIZE, { params, headers: MATTHIAS, maxRedirects: 0 });
  expect(consent.status()).toBe(200);
  const html = await consent.text();
  expect(html).toContain('Matthias');
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;'); // client name is escaped
  expect(html).not.toContain('<b>x</b>');
  const csrf = await csrfFrom(consent);
  expect(csrf).toBeTruthy();

  // CSRF mismatch -> refused, no redirect, no code, nothing bound
  const bad = await request.post(AUTHORIZE, { form: { ...params, csrf: 'wrong', decision: 'allow' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(bad.status()).toBe(400);
  expect(bad.headers()['location']).toBeUndefined();
  expect(dbAll('select userId from McpClient where clientId = ?', clientId)[0].userId).toBeNull();

  // deny -> redirect with access_denied, nothing bound
  const deny = await request.post(AUTHORIZE, { form: { ...params, csrf, decision: 'deny' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(deny.status()).toBe(302);
  const denyUrl = new URL(deny.headers()['location']!);
  expect(denyUrl.searchParams.get('error')).toBe('access_denied');
  expect(denyUrl.searchParams.get('state')).toBe('st-1');
  expect(denyUrl.searchParams.get('code')).toBeNull();
  expect(dbAll('select userId from McpClient where clientId = ?', clientId)[0].userId).toBeNull();

  // approve
  const ok = await request.post(AUTHORIZE, { form: { ...params, csrf, decision: 'allow' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(ok.status()).toBe(302);
  const code = new URL(ok.headers()['location']!).searchParams.get('code')!;

  // PKCE mismatch -> invalid_grant
  const wrong = await exchangeCode(request, clientId, code, 'not-the-verifier');
  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).error).toBe('invalid_grant');

  const tok = await exchangeCode(request, clientId, code, verifier);
  expect(tok.status()).toBe(200);
  const tokens = await tok.json();
  expect(tokens.token_type).toBe('Bearer');
  expect(tokens.refresh_token).toBeTruthy();

  // tools/list works, and lists the tool set
  const list = await parseRpc(await postMcp(request, tokens.access_token, LIST));
  expect(list.result.tools.map((t: any) => t.name).sort()).toEqual(
    ['add_task', 'archive_task', 'complete_task', 'get_task', 'list_recurring', 'list_tasks', 'search_tasks', 'skip_task', 'undo_last', 'update_task'],
  );

  // unregistered redirect_uri -> error page, never a redirect (GET and POST)
  const evil = { ...params, redirect_uri: 'https://evil.example/cb' };
  const g = await request.get(AUTHORIZE, { params: evil, headers: MATTHIAS, maxRedirects: 0 });
  expect(g.status()).toBe(400);
  expect(g.headers()['location']).toBeUndefined();
  const p = await request.post(AUTHORIZE, { form: { ...evil, csrf, decision: 'allow' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(p.status()).toBe(400);
  expect(p.headers()['location']).toBeUndefined();
  // unknown client_id likewise
  const u = await request.get(AUTHORIZE, { params: { ...params, client_id: 'nope' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(u.status()).toBe(400);
  expect(u.headers()['location']).toBeUndefined();
  // plain PKCE refused (redirect with invalid_request)
  const plain = await request.get(AUTHORIZE, { params: { ...params, code_challenge_method: 'plain' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(new URL(plain.headers()['location']!).searchParams.get('error')).toBe('invalid_request');
});

test('TC-45 Nutzerbindung: Anlegen/Abhaken wird dem Genehmiger zugeschrieben, auch nach Refresh', async ({ request }) => {
  const nameA = uniq('Claude Matthias');
  const nameB = uniq('Claude Anna');
  const a = await runOAuthFlow(request, nameA, MATTHIAS);
  const b = await runOAuthFlow(request, nameB, ANNA);

  const title = uniq('Bindung');
  const created = await callJson(request, a.accessToken, 'add_task', { title });
  expect(created.createdBy.displayName).toMatch(/^Matthias/);
  const row = dbAll('select t.createdVia, u.username from Task t join User u on u.id = t.createdById where t.id = ?', created.id)[0];
  expect(row).toEqual({ createdVia: `mcp:${nameA}`, username: 'matthias' });

  const done = await callJson(request, a.accessToken, 'complete_task', { id: created.id });
  const c1 = dbAll('select c.via, u.username from Completion c join User u on u.id = c.userId where c.taskId = ?', created.id);
  expect(c1).toEqual([{ via: `mcp:${nameA}`, username: 'matthias' }]);

  // the REST list shows lastDone.by for a recurring one
  const rec = await callJson(request, b.accessToken, 'add_task', { title: uniq('Bindung rec'), recurrence: { every: 1, unit: 'WEEK' } });
  const doneB = await callJson(request, b.accessToken, 'complete_task', { id: rec.id });
  expect(doneB.lastDone.by.displayName).toMatch(/^Anna/);
  expect(dbAll('select c.via, u.username from Completion c join User u on u.id = c.userId where c.taskId = ?', rec.id)).toEqual([
    { via: `mcp:${nameB}`, username: 'anna' },
  ]);
  const viaRest = await (await request.get('/api/recurring', { headers: MATTHIAS })).json();
  expect(viaRest.tasks.find((t: any) => t.id === rec.id).lastDone.by.displayName).toMatch(/^Anna/);

  // a refresh keeps the binding, and the new token acts as the same user
  const r = await request.post('/mcp/token', { form: { grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: a.clientId } });
  expect(r.status()).toBe(200);
  const fresh = (await r.json()).access_token as string;
  const t2 = await callJson(request, fresh, 'add_task', { title: uniq('Nach Refresh') });
  expect(t2.createdBy.displayName).toMatch(/^Matthias/);
  expect(dbAll('select createdVia from Task where id = ?', t2.id)[0].createdVia).toBe(`mcp:${nameA}`);

  // a rename in Settings changes the attribution of later writes
  const list = await (await request.get('/api/mcp/clients', { headers: MATTHIAS })).json();
  const mine = list.find((c: any) => c.name === nameA);
  await request.patch(`/api/mcp/clients/${mine.id}`, { data: { name: nameA + ' neu' }, headers: MATTHIAS });
  const t3 = await callJson(request, fresh, 'add_task', { title: uniq('Nach Rename') });
  expect(dbAll('select createdVia from Task where id = ?', t3.id)[0].createdVia).toBe(`mcp:${nameA} neu`);
});

test('TC-46 Ein an Matthias gebundener Client kann nicht von Anna freigegeben werden (403, kein Code)', async ({
  request,
}) => {
  const m = await runOAuthFlow(request, uniq('tc46'), MATTHIAS);
  const { challenge } = pkcePair();
  const params = authorizeParams(m.clientId, challenge);

  const consent = await request.get(AUTHORIZE, { params, headers: ANNA, maxRedirects: 0 });
  expect(consent.status()).toBe(403);
  const html = await consent.text();
  expect(html).toContain('anderen Person');
  expect(html).not.toContain('name="csrf"');

  // even a hand-crafted POST (valid csrf from Matthias's own GET) as Anna: refused
  const mine = await request.get(AUTHORIZE, { params, headers: MATTHIAS, maxRedirects: 0 });
  const csrf = await csrfFrom(mine);
  const post = await request.post(AUTHORIZE, { form: { ...params, csrf, decision: 'allow' }, headers: ANNA, maxRedirects: 0 });
  expect(post.status()).toBe(403);
  expect(post.headers()['location']).toBeUndefined();
  // a deny by Anna is refused as well (no redirect to the client)
  const deny = await request.post(AUTHORIZE, { form: { ...params, csrf, decision: 'deny' }, headers: ANNA, maxRedirects: 0 });
  expect(deny.status()).toBe(403);

  // binding unchanged
  const row = dbAll('select u.username from McpClient c join User u on u.id = c.userId where c.clientId = ?', m.clientId)[0];
  expect(row.username).toBe('matthias');
  // Matthias can still re-approve his own client
  const again = await request.post(AUTHORIZE, { form: { ...params, csrf, decision: 'allow' }, headers: MATTHIAS, maxRedirects: 0 });
  expect(again.status()).toBe(302);
});
