import { Hono } from 'hono';

// GET /api/mcp/config - tells the settings page whether MCP is configured and
// at what path, so it can show the URL to paste into Claude. Reports only
// `{ configured, endpoint }`: the raw MCP_TOKEN is the HMAC signing secret
// (never a bearer, ADR-0006) and is never put on the wire.
export const mcpConfig = new Hono();

mcpConfig.get('/config', (c) => {
  c.header('Cache-Control', 'no-store');
  const configured = (process.env.MCP_TOKEN ?? '') !== '';
  return c.json({ configured, endpoint: '/mcp' });
});
