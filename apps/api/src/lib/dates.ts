// Calendar-date helpers. A date is a "YYYY-MM-DD" string (Europe/Berlin
// calendar day). All arithmetic goes through Date.UTC, so local time zones and
// DST can never shift a day.

export type Unit = 'DAY' | 'WEEK' | 'MONTH';

const berlin = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in Europe/Berlin at the given instant. */
export function todayBerlin(now: Date = new Date()): string {
  const parts = Object.fromEntries(berlin.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parse(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** date + every × unit. Months clamp to the end of the month (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(date: string, every: number, unit: Unit): string {
  const [y, m, d] = parse(date);
  if (unit === 'MONTH') {
    const idx = y * 12 + (m - 1) + every;
    const ny = Math.floor(idx / 12);
    const nm = (idx % 12) + 1;
    return format(ny, nm, Math.min(d, daysInMonth(ny, nm)));
  }
  const days = unit === 'WEEK' ? 7 * every : every;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parse(a);
  const [by, bm, bd] = parse(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
