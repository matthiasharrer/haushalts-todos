import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db.js';
import type { AppEnv } from '../identity.js';

export const me = new Hono<AppEnv>();

const patchSchema = z.object({
  digestEnabled: z.boolean().optional(),
  notifyTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM')
    .optional(),
});

// GET /api/me — the current user (upserted by the identity middleware).
me.get('/', (c) => {
  c.header('Cache-Control', 'no-store');
  const { id, username, displayName, email, digestEnabled, notifyTime } = c.get('user');
  return c.json({ id, username, displayName, email, digestEnabled, notifyTime });
});

// PATCH /api/me — notification preferences (ADR-0009).
me.patch('/', async (c) => {
  let raw: unknown;
  try {
    raw = JSON.parse(await c.req.text());
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
  }
  const current = c.get('user');
  const { digestEnabled, notifyTime } = parsed.data;
  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      ...(digestEnabled !== undefined && { digestEnabled }),
      ...(notifyTime !== undefined && { notifyTime }),
      // A new time re-arms today's run (it fires on the next tick if that time has already passed).
      ...(notifyTime !== undefined && notifyTime !== current.notifyTime && { notifyRunOn: null }),
    },
  });
  c.header('Cache-Control', 'no-store');
  return c.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    digestEnabled: user.digestEnabled,
    notifyTime: user.notifyTime,
  });
});
