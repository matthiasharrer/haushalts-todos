// Daily push planning (ADR-0009). Pure: no Prisma, no clock. The impure tick
// that loads, sends and records lives in notifyTick.ts.
import { todayBerlin } from './dates.js';
import type { PushPayload } from './push.js';
import { sortTasks, type SortableTask } from './urgency.js';

export interface PlanUser {
  id: number;
  /** Does the user have at least one device? Without one nothing is planned (and the run is not recorded). */
  hasSubscription: boolean;
  digestEnabled: boolean;
  /** "HH:MM", Europe/Berlin. */
  notifyTime: string;
  /** Berlin date of the last daily run, or null. */
  notifyRunOn: string | null;
}

export interface PlanTask extends SortableTask {
  title: string;
  notify: boolean;
  notifiedFor: string | null;
  doneAt?: Date | null;
  archivedAt?: Date | null;
}

export interface DailyPlan {
  pushes: { userId: number; payload: PushPayload }[];
  /** Users whose `notifyRunOn` becomes `today`. */
  ranUsers: number[];
  today: string;
}

const hm = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "HH:MM" in Europe/Berlin at the given instant. */
export function timeBerlin(now: Date): string {
  const parts = Object.fromEntries(hm.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}`;
}

const MAX_LISTED = 5;

export function digestPayload(titles: string[]): PushPayload {
  const n = titles.length;
  const listed = titles.slice(0, MAX_LISTED).join(', ');
  const more = n > MAX_LISTED ? ` und ${n - MAX_LISTED} weitere` : '';
  return {
    title: n === 1 ? '1 Aufgabe fällig' : `${n} Aufgaben fällig`,
    body: listed + more,
    tag: 'digest',
    url: '/',
  };
}

export function planDaily(now: Date, users: PlanUser[], tasks: PlanTask[]): DailyPlan {
  const today = todayBerlin(now);
  const time = timeBerlin(now);
  const active = tasks.filter((t) => !t.doneAt && !t.archivedAt);
  const faellig = sortTasks(active, today).faellig;
  // notifiedFor only records the immediate "due now" push (pushEvents.ts), which
  // already reached everyone but the actor. The daily run doesn't set it: users
  // run at different times, and notifyRunOn already keeps each to once a day.
  const singles = active
    .filter((t) => t.notify && t.dueDate === today && t.notifiedFor !== t.dueDate)
    .sort((a, b) => a.id - b.id);

  const plan: DailyPlan = { pushes: [], ranUsers: [], today };

  for (const user of users) {
    if (!user.hasSubscription) continue;
    if (user.notifyRunOn === today || time < user.notifyTime) continue;
    plan.ranUsers.push(user.id);
    if (user.digestEnabled) {
      if (faellig.length > 0) {
        plan.pushes.push({ userId: user.id, payload: digestPayload(faellig.map((t) => t.title)) });
      }
    } else {
      for (const t of singles) {
        plan.pushes.push({
          userId: user.id,
          payload: { title: t.title, body: 'Jetzt fällig', tag: `task-${t.id}`, url: '/' },
        });
      }
    }
  }
  return plan;
}
