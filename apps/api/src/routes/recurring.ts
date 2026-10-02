import { Hono } from 'hono';
import type { AppEnv } from '../identity.js';
import { listRecurring } from '../lib/tasks.js';

export const recurring = new Hono<AppEnv>();

recurring.get('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await listRecurring());
});
