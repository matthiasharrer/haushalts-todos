// German-friendly labels for MCP tool results, so the model can answer in
// German without doing date arithmetic. Mirrors apps/web/src/lib/format.ts
// (kept separate: the API never imports from the web app).
import { diffDays } from '../lib/dates.js';
import type { HistoryEntry, TaskDto } from '../lib/tasks.js';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_SHORT = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Fr. 17.10." */
export function weekdayDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${WEEKDAYS_SHORT[weekdayIndex(date)]} ${d}.${m}.`;
}

/** "Freitag, 17.10.2026" (for "today"). */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${WEEKDAYS[weekdayIndex(date)]}, ${d}.${m}.${y}`;
}

/** heute / morgen / seit gestern / seit N Tagen / in N Tagen / "Fr. 17.10." (> 7 days out). */
export function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const n = diffDays(today, due);
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n === -1) return 'seit gestern';
  if (n < 0) return `seit ${-n} Tagen`;
  if (n <= 7) return `in ${n} Tagen`;
  return weekdayDate(due);
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "März–Oktober", or "Juni" for a single month. */
export function seasonLabel(s: { from: number; to: number }): string {
  return s.from === s.to ? MONTHS[s.from - 1] : `${MONTHS[s.from - 1]}–${MONTHS[s.to - 1]}`;
}

export function recurrenceLabel(r: TaskDto['recurrence']): string | null {
  if (!r) return null;
  const { every, unit, mode } = r;
  const base =
    every === 1
      ? unit === 'DAY' ? 'jeden Tag' : unit === 'WEEK' ? 'jede Woche' : 'jeden Monat'
      : `alle ${every} ${unit === 'DAY' ? 'Tage' : unit === 'WEEK' ? 'Wochen' : 'Monate'}`;
  const season = r.season ? `, ${seasonLabel(r.season)}` : '';
  return mode === 'FIXED' ? `${base}${season} (fester Termin)` : `${base}${season} (ab dem Erledigen)`;
}

const PRIORITY_LABEL = { LOW: 'niedrig', NORMAL: 'normal', HIGH: 'hoch' } as const;
const SECTION_LABEL = {
  faellig: 'fällig',
  demnaechst: 'demnächst',
  spaeter: 'später',
  irgendwann: 'irgendwann',
} as const;

function agoLabel(date: string, today: string): string {
  const n = diffDays(date, today);
  return n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} Tagen`;
}

/** The REST DTO (same fields, same shape) plus German label fields. */
export function taskForModel(t: TaskDto, today: string) {
  return {
    ...t,
    dueLabel: dueLabel(t.dueDate, today),
    recurrenceLabel: recurrenceLabel(t.recurrence),
    priorityLabel: PRIORITY_LABEL[t.priority],
    notifyLabel: t.notify ? 'Push-Benachrichtigung, sobald fällig' : null,
    sectionLabel: SECTION_LABEL[t.section],
    lastDone: t.lastDone
      ? { ...t.lastDone, label: `${agoLabel(t.lastDone.date, today)} von ${t.lastDone.by.displayName}` }
      : null,
  };
}

export function historyForModel(h: HistoryEntry, today: string) {
  return {
    ...h,
    kindLabel: h.kind === 'DONE' ? 'erledigt' : 'übersprungen',
    dateLabel: agoLabel(h.date, today),
    viaLabel: h.via === 'web' ? 'App' : h.via.startsWith('mcp:') ? `Claude (${h.via.slice(4)})` : h.via,
  };
}
