import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodType } from 'zod';
import type { AppEnv } from '../identity.js';
import { externalOrigin } from '../lib/externalOrigin.js';
import {
  TaskError,
  archiveTask,
  completeSchema,
  completeTask,
  createTask,
  createTaskSchema,
  issueHookToken,
  listChoices,
  listTasks,
  skipTask,
  undoTask,
  updateTask,
  updateTaskSchema,
  type Actor,
} from '../lib/tasks.js';

export const tasks = new Hono<AppEnv>();

const actor = (c: Context<AppEnv>): Actor => ({ userId: c.get('user').id, via: 'web' });

function taskId(c: Context<AppEnv>): number {
  const raw = c.req.param('id') ?? '';
  if (!/^\d+$/.test(raw)) throw new TaskError(404, 'Task not found');
  return Number(raw);
}

/** Parse a JSON body with zod; an empty body counts as `{}` when allowed. */
async function body<T>(c: Context<AppEnv>, schema: ZodType<T>, optional = false): Promise<T> {
  let raw: unknown = undefined;
  const text = await c.req.text();
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new TaskError(400, 'Invalid JSON');
    }
  } else if (optional) {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new TaskError(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}

tasks.onError((err, c) => {
  if (err instanceof TaskError) return c.json({ error: err.message }, err.status);
  throw err;
});

tasks.get('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await listTasks());
});

// ADR-0011: before any /:id route.
tasks.get('/choices', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await listChoices());
});

tasks.post('/', async (c) => c.json(await createTask(await body(c, createTaskSchema), actor(c)), 201));

tasks.patch('/:id', async (c) => {
  const id = taskId(c);
  return c.json(await updateTask(id, await body(c, updateTaskSchema), actor(c)));
});

tasks.post('/:id/complete', async (c) => {
  const id = taskId(c);
  const { date } = await body(c, completeSchema, true);
  return c.json(await completeTask(id, date, actor(c)));
});

tasks.post('/:id/skip', async (c) => c.json(await skipTask(taskId(c), actor(c))));

tasks.post('/:id/undo', async (c) => c.json(await undoTask(taskId(c))));

// ADR-0010: generate or replace the trigger task's token; the only place it is ever returned.
tasks.post('/:id/hook-token', async (c) => {
  const id = taskId(c);
  const token = await issueHookToken(id);
  const base = (process.env.HOOK_BASE_URL?.trim() || externalOrigin(c)).replace(/\/+$/, '');
  c.header('Cache-Control', 'no-store');
  return c.json({ token, url: `${base}/hooks/${id}` });
});

tasks.delete('/:id', async (c) => {
  await archiveTask(taskId(c));
  return c.body(null, 204);
});
