// Helpers for the task API cases. Dates are computed independently of the
// server code (Intl + UTC arithmetic) so the cases check the server, not
// themselves.
import { createRequire } from 'node:module';
import { DB_PATH } from './paths.js';

const require = createRequire(import.meta.url);

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const MATTHIAS = { 'Remote-User': 'matthias', 'Remote-Name': 'Matthias' };
export const ANNA = { 'Remote-User': 'anna', 'Remote-Name': 'Anna' };

let counter = 0;
/** Unique per test run so cases never see each other's tasks. */
export const uniq = (prefix: string) => `${prefix} ${Date.now()}-${++counter}`;

/** Read-only query against the e2e SQLite file (WAL: safe next to the server). */
export function dbAll(sql: string, ...params: unknown[]): any[] {
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

// ---- seasons (ADR-0008): computed relative to the current Berlin month ------

export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** The current Berlin month, 1-12. */
export const monthNow = (): number => Number(today().slice(5, 7));

/** month + n, wrapped into 1-12. */
export const wrapMonth = (m: number, n: number): number => ((((m - 1 + n) % 12) + 12) % 12) + 1;

/** The first YYYY-MM-01 of `month` strictly after `date`. */
export function nextMonthStart(date: string, month: number): string {
  const y = Number(date.slice(0, 4));
  const cand = `${y}-${String(month).padStart(2, '0')}-01`;
  return cand > date ? cand : `${y + 1}-${String(month).padStart(2, '0')}-01`;
}

/** A season that excludes the current month and starts >= 2 months out. */
export const farSeason = () => ({ from: wrapMonth(monthNow(), 2), to: wrapMonth(monthNow(), 3) });

/** A season that is only last month (the current month is outside it). */
export const lastMonthSeason = () => ({ from: wrapMonth(monthNow(), -1), to: wrapMonth(monthNow(), -1) });

/** The 1st of last month (a date inside lastMonthSeason, before today). */
export function firstOfLastMonth(): string {
  const t = today();
  const m = monthNow();
  const y = Number(t.slice(0, 4)) - (m === 1 ? 1 : 0);
  return `${y}-${String(wrapMonth(m, -1)).padStart(2, '0')}-01`;
}
