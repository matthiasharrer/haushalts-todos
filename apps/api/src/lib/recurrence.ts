import { addInterval, type Unit } from './dates.js';

export type Mode = 'AFTER_COMPLETION' | 'FIXED';

export interface RecurrenceInput {
  dueDate: string;
  every: number;
  unit: Unit;
  mode: Mode;
}

/**
 * ADR-0004. The one place that decides where a recurring chore's due date goes
 * after a completion (or skip) counted for `completionDate`.
 *
 * AFTER_COMPLETION: completion date + interval.
 * FIXED: step from the current due date on its own grid (each step from the
 * previous, already clamped result) until strictly after both the current due
 * date and the completion date. Missed slots are skipped, never queued.
 */
export function nextDueDate(task: RecurrenceInput, completionDate: string): string {
  if (task.mode === 'AFTER_COMPLETION') {
    return addInterval(completionDate, task.every, task.unit);
  }
  let next = addInterval(task.dueDate, task.every, task.unit);
  // ISO date strings compare correctly as plain strings.
  while (next <= completionDate) {
    next = addInterval(next, task.every, task.unit);
  }
  return next;
}
