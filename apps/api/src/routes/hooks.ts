// POST /hooks/:id (ADR-0010): Home Assistant fires a trigger task. Mounted
// outside /api (no Remote-User); the per-task bearer token is the credential.
// Every failure is the same 401, so the endpoint doesn't reveal which ids exist.
import { Hono } from 'hono';
import { TaskError, checkHookToken, fireTask } from '../lib/tasks.js';

export const hooks = new Hono();

const unauthorized = (c: { json: (b: unknown, s: 401) => Response }) => c.json({ error: 'Unauthorized' }, 401);

hooks.post('/:id', async (c) => {
  const raw = c.req.param('id');
  const bearer = /^Bearer (.+)$/i.exec(c.req.header('Authorization') ?? '');
  if (!/^\d+$/.test(raw) || !bearer) return unauthorized(c);
  const id = Number(raw);
  if (!(await checkHookToken(id, bearer[1].trim()))) return unauthorized(c);
  try {
    return c.json({ taskId: id, result: await fireTask(id) });
  } catch (err) {
    if (err instanceof TaskError) return unauthorized(c); // archived between the check and the fire
    throw err;
  }
});
