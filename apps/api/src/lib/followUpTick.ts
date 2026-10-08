// ADR-0011: the scheduled fire source. Called from the one-minute ticker.
import { prisma } from '../db.js';
import { fireTask } from './tasks.js';

let running = false;

/**
 * Fires every active trigger task whose `fireAt` has passed. Each is claimed
 * first with a conditional update (fireAt back to null where it still has the
 * value we read), so two overlapping runs fire it once. A restart just catches
 * up on the next tick.
 */
export async function runFollowUpTick(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await prisma.task.findMany({
      where: { archivedAt: null, triggerRefire: { not: null }, fireAt: { lte: now } },
      select: { id: true, fireAt: true },
    });
    for (const t of due) {
      try {
        const claimed = await prisma.task.updateMany({
          where: { id: t.id, archivedAt: null, fireAt: t.fireAt },
          data: { fireAt: null, fireAtCompletionId: null },
        });
        if (claimed.count === 1) await fireTask(t.id, now);
      } catch (err) {
        console.error(`follow-up fire failed for task ${t.id}`, err);
      }
    }
  } catch (err) {
    console.error('follow-up tick failed', err);
  } finally {
    running = false;
  }
}
