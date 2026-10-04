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

export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** "März–Oktober", or just "Juni" for a single month. */
export function seasonLabel(s: { from: number; to: number }): string {
  return s.from === s.to ? MONTHS[s.from - 1] : `${MONTHS[s.from - 1]}–${MONTHS[s.to - 1]}`;
}

/** "ruht bis März" for a resting seasonal chore (the month of its due date). */
export function restingLabel(due: string): string {
  return `ruht bis ${MONTHS[Number(due.slice(5, 7)) - 1]}`;
}

export function recurrenceLabel(r: Recurrence | null): string | null {
  if (!r) return null;
  const { every, unit } = r;
  const base =
    every === 1
      ? unit === 'DAY' ? 'jeden Tag' : unit === 'WEEK' ? 'jede Woche' : 'jeden Monat'
      : `alle ${every} ${unit === 'DAY' ? 'Tage' : unit === 'WEEK' ? 'Wochen' : 'Monate'}`;
  return r.season ? `${base} · ${seasonLabel(r.season)}` : base;
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

const berlinTime = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const berlinDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });

/** Trigger task state (ADR-0010): "wartet", "ausgelöst heute 14:32", "ausgelöst am 3.10.". */
export function triggerLabel(
  trigger: { firedAt: string | null },
  dueDate: string | null,
  today: string,
): string {
  if (dueDate === null) return 'wartet';
  if (!trigger.firedAt) return dueDate === today ? 'ausgelöst heute' : `ausgelöst am ${dayMonth(dueDate)}`;
  const at = new Date(trigger.firedAt);
  const day = berlinDay.format(at);
  return day === today ? `ausgelöst heute ${berlinTime.format(at)}` : `ausgelöst am ${dayMonth(day)}`;
}

/** "3.10." */
function dayMonth(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d}.${m}.`;
}
