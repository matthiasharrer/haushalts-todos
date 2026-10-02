// Mounts the MCP endpoint (rezepte ADR-0023, Haushalt ADR-0006) — the one
// deliberate exception to "no login code in the app" (CLAUDE.md, ADR-0003). Authelia's ForwardAuth covers
// every other route at the ingress; `/mcp` is carved out of that so an MCP
// client can reach it without an Authelia session, which means the gate
// below is the *only* thing standing between this route and the open
// internet. Get it right, fail closed.
//
// The gate is now the SDK's own `requireBearerAuth` (ADR-0024) rather than a
// hand-rolled header check: it accepts only a signed OAuth access-token blob
// (verifier.ts) — `MCP_TOKEN` is the HMAC signing secret, NOT an accepted
// bearer (MCP is OAuth-only) — and on rejection answers with
// the spec's `WWW-Authenticate` challenge — including `resource_metadata`, so
// a client that hasn't done discovery yet can still find its way there. The
// OAuth discovery/DCR endpoints (oauthRoutes.ts) are mounted first, before
// `/mcp` itself and well before `mountStatic`'s wildcard (app.ts).
import type { Hono } from 'hono';
import type { AppEnv } from '../identity.js';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from '@modelcontextprotocol/server';
import { buildMcpServer } from './server.js';
import { makeVerifier } from './verifier.js';
import { mountMcpOAuth } from './oauthRoutes.js';
import { externalOrigin } from '../lib/externalOrigin.js';

/** `requireBearerAuth`'s documented contract is `AuthInfo | Response`, checked
 * with `result instanceof Response` (see the SDK's own example). That check
 * is unsound in this app: `@hono/node-server`'s `serve()` replaces
 * `globalThis.Response` with its own lightweight subclass the first time it
 * handles a request (`overrideGlobalObjects`, on by default) — but the SDK
 * built its 401/403 challenge earlier via a closed-over reference to the
 * *original* native `Response`. The challenge object is a genuine `Response`
 * by any structural test, but `instanceof` against the now-current,
 * `@hono/node-server`-owned `Response` returns **false** for it — which,
 * followed naively, would hand the challenge straight to the MCP handler as
 * if it were a validated `AuthInfo`, an outright auth bypass — reproduced in
 * isolation (a bare `serve()` + one route, no MCP SDK involved) before this
 * guard was written. Duck-typing `AuthInfo`'s own shape instead sidesteps
 * the class-identity question entirely — it's correct no matter which
 * `Response` implementation produced the rejection. */
function isAuthInfo(value: AuthInfo | Response): value is AuthInfo {
  return typeof (value as AuthInfo).token === 'string' && typeof (value as AuthInfo).clientId === 'string';
}

export function mountMcp(app: Hono<AppEnv>): void {
  const token = process.env.MCP_TOKEN;
  if (!token) {
    console.log('MCP disabled (MCP_TOKEN not set).');
    return;
  }

  // Built once at mount time and reused for every request: the v2 SDK's
  // handler is per-exchange stateless already (buildMcpServer is the
  // per-request factory it calls internally), so there's nothing to gain
  // from rebuilding the handler itself on every call.
  const handler = createMcpHandler(buildMcpServer);
  const verifier = makeVerifier(token);

  mountMcpOAuth(app, token);

  app.all('/mcp', async (c) => {
    // Built per request, not once at mount time: `resourceMetadataUrl` is
    // origin-dependent (urls.ts), and the origin can legitimately vary
    // request to request (different `X-Forwarded-Host`, or none in a local
    // curl) — `requireBearerAuth` itself does no expensive setup, so there's
    // nothing to lose by not caching this.
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(`${externalOrigin(c)}/mcp`));
    const gate = requireBearerAuth({ verifier, requiredScopes: ['mcp'], resourceMetadataUrl });

    const result = await gate(c.req.raw);
    if (!isAuthInfo(result)) {
      // Re-wrap in the *current* global Response (see isAuthInfo's comment)
      // rather than returning `result` as-is — a foreign Response instance
      // straight out of Hono's own handler is exactly the shape mismatch
      // this whole guard exists to avoid propagating further.
      return new Response(result.body, { status: result.status, statusText: result.statusText, headers: result.headers });
    }

    return handler.fetch(c.req.raw, { authInfo: result });
  });

  console.log('MCP mounted at /mcp.');
}
