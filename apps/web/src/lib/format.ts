// Pure German label formatting for the task list. `today` and dates are
// calendar dates (YYYY-MM-DD, Europe/Berlin, as delivered by the API).
import type { Recurrence } from './api';

const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

function utc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** "Fr. 17.10." */
export function weekdayDate(date: string): string {
  const d = new Date(utc(date));
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]} ${dd}.${mm}.`;
}

/** heute / morgen / gestern / seit N Tagen / in N Tagen / "Fr. 17.10." (> 7 days out). */
export function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const n = daysBetween(today, due);
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n === -1) return 'seit gestern';
  if (n < 0) return `seit ${-n} Tagen`;
  if (n <= 7) return `in ${n} Tagen`;
  return weekdayDate(due);
}

export function recurrenceLabel(r: Recurrence | null): string | null {
  if (!r) return null;
  const { every, unit } = r;
  if (every === 1) return unit === 'DAY' ? 'jeden Tag' : unit === 'WEEK' ? 'jede Woche' : 'jeden Monat';
  const u = unit === 'DAY' ? 'Tage' : unit === 'WEEK' ? 'Wochen' : 'Monate';
  return `alle ${every} ${u}`;
}

/** "zuletzt heute · Matthias" */
export function lastDoneLabel(
  last: { date: string; by: { displayName: string } } | null,
  today: string,
): string | null {
  if (!last) return null;
  const n = daysBetween(last.date, today);
  const when = n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`;
  return `zuletzt ${when} · ${last.by.displayName}`;
}
