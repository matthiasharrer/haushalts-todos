import { addInterval, type Unit } from './dates.js';

export type Mode = 'AFTER_COMPLETION' | 'FIXED';

export interface RecurrenceInput {
  dueDate: string;
  every: number;
  unit: Unit;
  mode: Mode;
  season?: Season | null;
}

/** ADR-0008: a month window, both ends inclusive; from > to wraps the year end. */
export interface Season {
  from: number;
  to: number;
}

function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

export function inSeason(date: string, season: Season): boolean {
  const m = monthOf(date);
  return season.from <= season.to
    ? m >= season.from && m <= season.to
    : m >= season.from || m <= season.to;
}

/** `date` if it is in season (or there is no season), else the 1st of the next start month. */
export function seasonDate(date: string, season: Season | null): string {
  if (!season || inSeason(date, season)) return date;
  const year = Number(date.slice(0, 4));
  const y = monthOf(date) < season.from ? year : year + 1;
  return `${String(y).padStart(4, '0')}-${String(season.from).padStart(2, '0')}-01`;
}

/** A window covering all 12 months is no season. */
export function normalizeSeason(s: Season | null | undefined): Season | null {
  if (!s) return null;
  const len = ((s.to - s.from + 12) % 12) + 1;
  return len === 12 ? null : { from: s.from, to: s.to };
}

/**
 * ADR-0004. The one place that decides where a recurring chore's due date goes
 * after a completion (or skip) counted for `completionDate`.
 *
 * AFTER_COMPLETION: completion date + interval.
 * FIXED: step from the current due date on its own grid (each step from the
 * previous, already clamped result) until strictly after both the current due
 * date and the completion date. Missed slots are skipped, never queued.
 * ADR-0008: the result then goes through seasonDate (both modes).
 */
export function nextDueDate(task: RecurrenceInput, completionDate: string): string {
  return seasonDate(rawNext(task, completionDate), task.season ?? null);
}

function rawNext(task: RecurrenceInput, completionDate: string): string {
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
