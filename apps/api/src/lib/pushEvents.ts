// Event pushes (ADR-0009), called by lib/tasks.ts AFTER a write has committed.
// They never throw: a push problem must not fail the user's write.
import { prisma } from '../db.js';
import { todayBerlin } from './dates.js';
import { sendToSubscriptions, type PushPayload } from './push.js';

async function sendToOthers(actorId: number, payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { not: actorId } } });
  await sendToSubscriptions(subs, payload);
}

/** What an update changed from; null for a create. */
export type Before = { dueDate: string | null; notify: boolean } | null;

/**
 * After create (`before` null) or update of a task. A task that qualifies for
 * "due now" pushes that (once per dueDate, recorded in notifiedFor) instead of
 * the "new one-off" push. An update only qualifies when it moved the date or
 * turned notify on, so resaving the sheet never pushes.
 */
export async function pushAfterWrite(taskId: number, actorId: number, before: Before): Promise<void> {
  const created = before === null;
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.archivedAt || task.doneAt) return;

    const changed = created || before.dueDate !== task.dueDate || (!before.notify && task.notify);
    const dueNow =
      changed && task.notify && task.dueDate === todayBerlin() && task.notifiedFor !== task.dueDate;
    if (dueNow) {
      // Claim it first (conditional update), so two quick saves can't both push.
      const claimed = await prisma.task.updateMany({
        where: { id: taskId, OR: [{ notifiedFor: null }, { notifiedFor: { not: task.dueDate } }] },
        data: { notifiedFor: task.dueDate },
      });
      if (claimed.count === 0) return;
      await sendToOthers(actorId, { title: task.title, body: 'Jetzt fällig', tag: `task-${task.id}`, url: '/' });
      return;
    }

    if (created && task.recurrenceEvery === null) {
      const actor = await prisma.user.findUnique({ where: { id: actorId } });
      await sendToOthers(actorId, {
        title: `Neue Aufgabe von ${actor?.displayName ?? 'jemandem'}`,
        body: task.title,
        tag: `task-${task.id}`,
        url: '/',
      });
    }
  } catch (err) {
    console.error('push after write failed', err);
  }
}
