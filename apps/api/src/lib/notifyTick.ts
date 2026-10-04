// The impure half of daily pushes: load, plan (notifications.ts), record, send.
import { prisma } from '../db.js';
import { planDaily } from './notifications.js';
import { sendToSubscriptions } from './push.js';

let running = false;

export async function runNotifyTick(now: Date = new Date()): Promise<void> {
  if (running) return; // a slow send must not overlap the next tick
  running = true;
  try {
    const [users, tasks] = await Promise.all([
      prisma.user.findMany({ include: { pushSubscriptions: true } }),
      prisma.task.findMany({ where: { archivedAt: null, doneAt: null } }),
    ]);
    const plan = planDaily(
      now,
      users.map((u) => ({
        id: u.id,
        hasSubscription: u.pushSubscriptions.length > 0,
        digestEnabled: u.digestEnabled,
        notifyTime: u.notifyTime,
        notifyRunOn: u.notifyRunOn,
      })),
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
        recurrence:
          t.recurrenceEvery && t.recurrenceUnit ? { every: t.recurrenceEvery, unit: t.recurrenceUnit } : null,
        createdAt: t.createdAt,
        notify: t.notify,
        notifiedFor: t.notifiedFor,
      })),
    );
    if (plan.ranUsers.length === 0) return;

    // Record first: if sending is slow or the process dies, no second push for the same run.
    await prisma.user.updateMany({ where: { id: { in: plan.ranUsers } }, data: { notifyRunOn: plan.today } });

    for (const push of plan.pushes) {
      const user = users.find((u) => u.id === push.userId);
      await sendToSubscriptions(user?.pushSubscriptions ?? [], push.payload);
    }
  } catch (err) {
    console.error('notify tick failed', err);
  } finally {
    running = false;
  }
}

/** Starts the interval (index.ts only; never in unit tests). */
export function startNotifyTicker(): void {
  const every = Number(process.env.PUSH_TICK_MS ?? 60_000);
  const ms = Number.isFinite(every) && every > 0 ? every : 60_000;
  setInterval(() => void runNotifyTick(), ms).unref();
  setTimeout(() => void runNotifyTick(), Math.min(5_000, ms)).unref();
}
