import { Hono } from 'hono';
import type { AppEnv } from '../identity.js';

export const me = new Hono<AppEnv>();

// GET /api/me — the current user (upserted by the identity middleware).
me.get('/', (c) => {
  c.header('Cache-Control', 'no-store');
  const { id, username, displayName, email } = c.get('user');
  return c.json({ id, username, displayName, email });
});
