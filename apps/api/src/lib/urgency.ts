import { diffDays, todayBerlin, type Unit } from './dates.js';

// ADR-0005. Section and score are derived, never stored.

export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type Section = 'faellig' | 'demnaechst' | 'spaeter' | 'irgendwann';

export interface SortableTask {
  id: number;
  priority: Priority;
  dueDate: string | null;
  recurrence: { every: number; unit: Unit } | null;
  createdAt: Date;
}

export const WEIGHT: Record<Priority, number> = { LOW: 0.5, NORMAL: 1, HIGH: 2 };
const SOON_DAYS = 7;
const ONE_OFF_SCALE = 7;
const AGING_DAYS = 30;

/** Interval length in days for scoring: DAY = n, WEEK = 7n, MONTH = 30n (approximation). */
export function intervalDays(every: number, unit: Unit): number {
  return unit === 'DAY' ? every : unit === 'WEEK' ? 7 * every : 30 * every;
}

export function sectionOf(task: Pick<SortableTask, 'dueDate'>, today: string): Section {
  if (task.dueDate === null) return 'irgendwann';
  const ahead = diffDays(today, task.dueDate);
  if (ahead <= 0) return 'faellig';
  if (ahead <= SOON_DAYS) return 'demnaechst';
  return 'spaeter';
}

/** Urgency of a dated task; null if undated. Not yet due counts as 0 days overdue. */
export function urgencyScore(task: SortableTask, today: string): number | null {
  if (task.dueDate === null) return null;
  const overdue = Math.max(0, diffDays(task.dueDate, today));
  const scale = task.recurrence
    ? intervalDays(task.recurrence.every, task.recurrence.unit)
    : ONE_OFF_SCALE;
  return WEIGHT[task.priority] * (1 + overdue / scale);
}

/** Sort key of an undated task: weight × (1 + age in days / 30). */
export function irgendwannScore(task: SortableTask, today: string): number {
  const age = Math.max(0, diffDays(todayBerlin(task.createdAt), today));
  return WEIGHT[task.priority] * (1 + age / AGING_DAYS);
}

export type Sections<T> = Record<Section, T[]>;

export function sortTasks<T extends SortableTask>(tasks: T[], today: string): Sections<T> {
  const out: Sections<T> = { faellig: [], demnaechst: [], spaeter: [], irgendwann: [] };
  for (const t of tasks) out[sectionOf(t, today)].push(t);

  const byDue = (a: T, b: T) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0);

  out.faellig.sort(
    (a, b) =>
      urgencyScore(b, today)! - urgencyScore(a, today)! || byDue(a, b) || a.id - b.id,
  );
  out.demnaechst.sort(
    (a, b) => byDue(a, b) || WEIGHT[b.priority] - WEIGHT[a.priority] || a.id - b.id,
  );
  out.spaeter.sort((a, b) => byDue(a, b) || a.id - b.id);
  out.irgendwann.sort(
    (a, b) => irgendwannScore(b, today) - irgendwannScore(a, today) || a.id - b.id,
  );
  return out;
}
