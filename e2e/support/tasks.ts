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
