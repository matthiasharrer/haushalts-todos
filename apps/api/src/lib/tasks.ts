// Task domain operations: the single implementation behind the REST routes and
// (later) the MCP tools. No HTTP in here; `actor.via` says which channel the
// caller came through ("web", "mcp:<client>").
import { z } from 'zod';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isValidDate, todayBerlin } from './dates.js';
import { foldText } from './text.js';
import { inSeason, nextDueDate, normalizeSeason, seasonDate, type Season } from './recurrence.js';
import { hashToken, newToken, verifyToken } from './hookToken.js';
import { pushAfterWrite, pushFired, type Before } from './pushEvents.js';
import { followUpBase, followUpFireAt } from './followUp.js';
import { sectionOf, sortTasks, urgencyScore, type Section } from './urgency.js';

export class TaskError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface Actor {
  userId: number;
  via: string;
}

// ---- input schemas ---------------------------------------------------------

const dateStr = z.string().refine(isValidDate, 'must be a real date as YYYY-MM-DD');

const month = z.number().int().min(1).max(12);

const recurrence = z.object({
  every: z.number().int().min(1).max(1000),
  unit: z.enum(['DAY', 'WEEK', 'MONTH']),
  mode: z.enum(['AFTER_COMPLETION', 'FIXED']).default('AFTER_COMPLETION'),
  // ADR-0008: both ends required inside the object; null/absent = year-round.
  season: z.object({ from: month, to: month }).nullish(),
});

// ADR-0010: sending { refire } makes it a trigger task; null (update only) turns it off.
// refire defaults to PUSH on create; on update an absent refire keeps the stored one.
// ADR-0011: `after` names the predecessor and the delay; on update absent = unchanged, null = remove.
const trigger = z.object({
  refire: z.enum(['PUSH', 'NONE']).optional(),
  after: z
    .object({ taskId: z.number().int().positive(), hours: z.number().int().min(1).max(720) })
    .nullish(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000).nullish(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  dueDate: dateStr.nullish(),
  recurrence: recurrence.nullish(),
  notify: z.boolean().optional(),
  trigger: trigger.nullish(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  dueDate: dateStr.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  notify: z.boolean().optional(),
  trigger: trigger.nullable().optional(),
});

export const completeSchema = z.object({ date: dateStr.optional() });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ---- DTO -------------------------------------------------------------------

const taskInclude = {
  createdBy: { select: { id: true, displayName: true } },
  completions: {
    where: { kind: 'DONE' as const },
    // "Last done" is the latest day it counts for, not the latest tap: a
    // back-dated "hab ich gestern gemacht" logged after today's must not win.
    // (Undo is different: it reverts the latest *recorded* completion.)
    orderBy: [{ date: 'desc' as const }, { at: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    include: { user: { select: { id: true, displayName: true } } },
  },
  afterTask: { select: { id: true, title: true } },
  // ADR-0011: the active trigger tasks that follow this one.
  followUps: {
    where: { archivedAt: null, triggerRefire: { not: null } },
    orderBy: { id: 'asc' as const },
    select: { id: true, title: true, afterHours: true },
  },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export interface TaskDto {
  id: number;
  title: string;
  notes: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  dueDate: string | null;
  recurrence: {
    every: number;
    unit: 'DAY' | 'WEEK' | 'MONTH';
    mode: 'AFTER_COMPLETION' | 'FIXED';
    season: Season | null;
  } | null;
  /** Push when it becomes due (ADR-0009). */
  notify: boolean;
  /** Trigger task (ADR-0010) or null. Never carries the token or its hash. */
  trigger: {
    refire: 'PUSH' | 'NONE';
    hasToken: boolean;
    firedAt: string | null;
    /** ADR-0011: the predecessor and delay, if this is a follow-up. */
    after: { taskId: number; title: string; hours: number } | null;
    /** ADR-0011: ISO time a pending follow-up fires, else null. */
    fireAt: string | null;
  } | null;
  /** ADR-0011: active follow-ups of this task. */
  followUps: { id: number; title: string; hours: number }[];
  /** Derived (ADR-0008): seasonal, out of season today, and not due yet. */
  resting: boolean;
  createdBy: { id: number; displayName: string };
  lastDone: { date: string; by: { id: number; displayName: string } } | null;
  urgency: number | null;
  section: Section;
}

function toDto(t: TaskRow, today: string): TaskDto {
  const rec =
    t.recurrenceEvery && t.recurrenceUnit && t.recurrenceMode
      ? {
          every: t.recurrenceEvery,
          unit: t.recurrenceUnit,
          mode: t.recurrenceMode,
          season:
            t.seasonFrom !== null && t.seasonTo !== null
              ? { from: t.seasonFrom, to: t.seasonTo }
              : null,
        }
      : null;
  const season = rec?.season ?? null;
  const last = t.completions[0];
  const sortable = {
    id: t.id,
    priority: t.priority,
    dueDate: t.dueDate,
    recurrence: rec,
    createdAt: t.createdAt,
  };
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    dueDate: t.dueDate,
    recurrence: rec,
    notify: t.notify,
    trigger: t.triggerRefire
      ? {
          refire: t.triggerRefire,
          hasToken: t.hookTokenHash !== null,
          firedAt: t.firedAt?.toISOString() ?? null,
          after:
            t.afterTask && t.afterHours !== null
              ? { taskId: t.afterTask.id, title: t.afterTask.title, hours: t.afterHours }
              : null,
          fireAt: t.fireAt?.toISOString() ?? null,
        }
      : null,
    followUps: t.followUps.map((f) => ({ id: f.id, title: f.title, hours: f.afterHours ?? 0 })),
    resting: !!season && !inSeason(today, season) && t.dueDate !== null && t.dueDate > today,
    createdBy: t.createdBy,
    lastDone: last ? { date: last.date, by: last.user } : null,
    urgency: urgencyScore(sortable, today),
    section: sectionOf(sortable, today),
  };
}

// ---- helpers ---------------------------------------------------------------

type Db = Prisma.TransactionClient;

/** An active (not archived) task or 404. */
async function activeTask(db: Db, id: number) {
  const task = await db.task.findFirst({ where: { id, archivedAt: null } });
  if (!task) throw new TaskError(404, 'Task not found');
  return task;
}

async function dtoById(db: Db, id: number): Promise<TaskDto> {
  const row = await db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  return toDto(row, todayBerlin());
}

/** ADR-0011: a predecessor must be another active task (not archived, not a finished one-off). */
async function checkPredecessor(db: Db, predecessorId: number, selfId: number | null) {
  const pred = await db.task.findFirst({ where: { id: predecessorId, archivedAt: null, doneAt: null } });
  if (!pred || pred.id === selfId) {
    throw new TaskError(400, 'The predecessor must be another active task');
  }
}

const NO_FOLLOW_UP = { afterTaskId: null, afterHours: null, fireAt: null, fireAtCompletionId: null };

function recurrenceColumns(r: z.infer<typeof recurrence> | null) {
  const season = normalizeSeason(r?.season);
  return {
    recurrenceEvery: r?.every ?? null,
    recurrenceUnit: r?.unit ?? null,
    recurrenceMode: r?.mode ?? null,
    seasonFrom: season?.from ?? null,
    seasonTo: season?.to ?? null,
  };
}

// ---- operations ------------------------------------------------------------

export async function listTasks(now: Date = new Date()) {
  const today = todayBerlin(now);
  const rows = await prisma.task.findMany({
    // A waiting trigger task (ADR-0010) has no date but isn't "Irgendwann": it's not on the home list at all.
    where: { archivedAt: null, doneAt: null, OR: [{ triggerRefire: null }, { dueDate: { not: null } }] },
    include: taskInclude,
  });
  const dtos = rows.map((r) => toDto(r, today));
  const byId = new Map(dtos.map((d) => [d.id, d]));
  const sorted = sortTasks(
    rows.map((r, i) => ({
      id: r.id,
      priority: r.priority,
      dueDate: r.dueDate,
      recurrence: dtos[i].recurrence,
      createdAt: r.createdAt,
    })),
    today,
  );
  const pick = (s: Section) => sorted[s].map((t) => byId.get(t.id)!);
  return {
    today,
    sections: {
      faellig: pick('faellig'),
      demnaechst: pick('demnaechst'),
      // ADR-0007: Später is one-offs only; recurring chores far out live in /api/recurring.
      spaeter: pick('spaeter').filter((t) => t.recurrence === null),
      irgendwann: pick('irgendwann'),
    },
  };
}

/**
 * ADR-0007 / ADR-0010: every active recurring task by next due date (then id),
 * followed by the trigger tasks: fired ones by date, then the waiting ones.
 */
export async function listRecurring(now: Date = new Date()) {
  const today = todayBerlin(now);
  const rows = await prisma.task.findMany({
    where: { archivedAt: null, OR: [{ recurrenceEvery: { not: null } }, { triggerRefire: { not: null } }] },
    include: taskInclude,
  });
  // Sorted here, not in SQL: SQLite sorts NULL (waiting) first.
  const rank = (r: TaskRow) => (r.triggerRefire === null ? 0 : r.dueDate !== null ? 1 : 2);
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
      a.id - b.id,
  );
  return { today, tasks: rows.map((r) => toDto(r, today)) };
}

export async function createTask(input: CreateTaskInput, actor: Actor): Promise<TaskDto> {
  const rec = input.recurrence ?? null;
  const trig = input.trigger ?? null;
  if (trig && rec) throw new TaskError(400, 'A task cannot be both recurring and a trigger task');
  // A recurring task always has a due date; default: today (TC-15). A trigger
  // task is born waiting: a date sent along is ignored (ADR-0010).
  let dueDate = trig ? null : (input.dueDate ?? (rec ? todayBerlin() : null));
  if (rec && dueDate) dueDate = seasonDate(dueDate, normalizeSeason(rec.season));
  const after = trig?.after ?? null;
  if (after) await checkPredecessor(prisma, after.taskId, null);
  const task = await prisma.task.create({
    data: {
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? 'NORMAL',
      dueDate,
      ...recurrenceColumns(rec),
      notify: input.notify ?? false,
      triggerRefire: trig ? (trig.refire ?? 'PUSH') : null,
      afterTaskId: after?.taskId ?? null,
      afterHours: after?.hours ?? null,
      createdById: actor.userId,
      createdVia: actor.via,
    },
  });
  const dto = await dtoById(prisma, task.id);
  await pushAfterWrite(task.id, actor.userId, null);
  return dto;
}

export async function updateTask(id: number, patch: UpdateTaskInput, actor: Actor): Promise<TaskDto> {
  let before: Before = null;
  const dto = await prisma.$transaction(async (tx) => {
    const task = await activeTask(tx, id);
    before = { dueDate: task.dueDate, notify: task.notify };
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.notify !== undefined) data.notify = patch.notify;

    // ADR-0010: kinds are exclusive. Switching to a trigger clears the rule and
    // the date (waiting); switching away drops the token. A recurrence sent for
    // a task that stays a trigger is a 400; send trigger: null along to switch.
    const willTrigger = patch.trigger !== undefined ? patch.trigger !== null : task.triggerRefire !== null;
    if (willTrigger && patch.recurrence) {
      throw new TaskError(400, 'A task cannot be both recurring and a trigger task');
    }
    const toTrigger = willTrigger && task.triggerRefire === null;
    const fromTrigger = !willTrigger && task.triggerRefire !== null;
    if (patch.trigger) data.triggerRefire = patch.trigger.refire ?? task.triggerRefire ?? 'PUSH';
    if (fromTrigger) Object.assign(data, { triggerRefire: null, hookTokenHash: null, firedAt: null }, NO_FOLLOW_UP);
    if (toTrigger) Object.assign(data, { firedAt: null }, recurrenceColumns(null), NO_FOLLOW_UP);

    // ADR-0011: predecessor and delay. Resending the same predecessor is a no-op
    // (the sheet resends everything); a different one or none clears a pending
    // fireAt; only new hours recompute it from the original completion time.
    if (willTrigger && patch.trigger && patch.trigger.after !== undefined) {
      const after = patch.trigger.after;
      if (after === null) {
        // Only when there is a link to remove: after the predecessor was archived the
        // sheet resends null, and that must not cancel a still pending fireAt.
        if (task.afterTaskId !== null) Object.assign(data, NO_FOLLOW_UP);
      } else if (after.taskId !== task.afterTaskId) {
        await checkPredecessor(tx, after.taskId, id);
        Object.assign(data, NO_FOLLOW_UP, { afterTaskId: after.taskId, afterHours: after.hours });
      } else if (after.hours !== task.afterHours) {
        data.afterHours = after.hours;
        if (task.fireAt && task.afterHours !== null) {
          data.fireAt = followUpFireAt(followUpBase(task.fireAt, task.afterHours), after.hours);
        }
      }
    }

    const willRecur = willTrigger
      ? false
      : patch.recurrence !== undefined
        ? patch.recurrence !== null
        : task.recurrenceEvery !== null;
    let dueDate = toTrigger ? null : patch.dueDate !== undefined ? patch.dueDate : task.dueDate;
    if (willRecur && dueDate === null) {
      if (patch.dueDate === null) throw new TaskError(400, 'A recurring task needs a dueDate');
      dueDate = todayBerlin(); // one-off without date turned into a recurring one
    }
    // ADR-0008: a seasonal chore's date is snapped only when the date or the
    // season actually changes. The web sheet resends both on every save, so
    // "present in the patch" isn't enough: renaming an overdue chore after its
    // season ended must not move it.
    const oldSeason =
      task.seasonFrom !== null && task.seasonTo !== null
        ? { from: task.seasonFrom, to: task.seasonTo }
        : null;
    const season = patch.recurrence !== undefined ? normalizeSeason(patch.recurrence?.season) : oldSeason;
    const seasonChanged = season?.from !== oldSeason?.from || season?.to !== oldSeason?.to;
    const today = todayBerlin();
    const wasResting =
      oldSeason !== null && !inSeason(today, oldSeason) && task.dueDate !== null && task.dueDate > today;
    if (willRecur && patch.recurrence && wasResting && seasonChanged && dueDate === task.dueDate) {
      // Changing the season of a resting chore: its date is a placeholder (the old
      // season's start), so recompute what the normal rule gives for the latest
      // completion or skip, but never earlier than today. A date set by hand
      // (dueDate differs from the stored one) skips this and wins.
      const last = await tx.completion.findFirst({
        where: { taskId: id },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
      });
      const base = last
        ? nextDueDate(
            {
              dueDate: last.dueDateBefore ?? last.date,
              every: patch.recurrence.every,
              unit: patch.recurrence.unit,
              mode: patch.recurrence.mode,
              season: null,
            },
            last.date,
          )
        : today;
      dueDate = seasonDate(base > today ? base : today, season);
    } else if (willRecur && dueDate !== null && (dueDate !== task.dueDate || seasonChanged)) {
      dueDate = seasonDate(dueDate, season);
    }
    if (dueDate !== task.dueDate) data.dueDate = dueDate;
    if (patch.recurrence !== undefined && !toTrigger) Object.assign(data, recurrenceColumns(patch.recurrence));

    await tx.task.update({ where: { id }, data });
    return dtoById(tx, id);
  });
  await pushAfterWrite(id, actor.userId, before);
  return dto;
}

/** Shared by complete and skip: log it and move the due date / finish the one-off. */
async function record(
  id: number,
  kind: 'DONE' | 'SKIPPED',
  date: string | undefined,
  actor: Actor,
): Promise<TaskDto> {
  const today = todayBerlin();
  const day = date ?? today;
  if (day > today) throw new TaskError(400, 'date must not be in the future');

  return prisma.$transaction(async (tx) => {
    const task = await activeTask(tx, id);
    const isTrigger = task.triggerRefire !== null;
    if (isTrigger && task.dueDate === null) {
      throw new TaskError(400, 'A waiting trigger task has nothing to do yet');
    }
    const recurring =
      !isTrigger && task.recurrenceEvery && task.recurrenceUnit && task.recurrenceMode && task.dueDate;
    if (!recurring && !isTrigger && kind === 'SKIPPED') {
      throw new TaskError(400, 'Only recurring tasks can be skipped');
    }
    if (!recurring && task.doneAt) throw new TaskError(409, 'Task is already done');

    const completion = await tx.completion.create({
      data: {
        taskId: id,
        userId: actor.userId,
        via: actor.via,
        kind,
        date: day,
        dueDateBefore: task.dueDate,
      },
    });
    if (recurring) {
      await tx.task.update({
        where: { id },
        data: {
          dueDate: nextDueDate(
            {
              dueDate: task.dueDate!,
              every: task.recurrenceEvery!,
              unit: task.recurrenceUnit!,
              mode: task.recurrenceMode!,
              season:
                task.seasonFrom !== null && task.seasonTo !== null
                  ? { from: task.seasonFrom, to: task.seasonTo }
                  : null,
            },
            day,
          ),
        },
      });
    } else if (isTrigger) {
      // ADR-0010: back to waiting; never doneAt. Undo restores the fired date.
      await tx.task.update({ where: { id }, data: { dueDate: null } });
    } else {
      await tx.task.update({ where: { id }, data: { doneAt: new Date() } });
    }
    // ADR-0011: only "done" schedules the follow-ups, counted from now (the
    // completion's `at`), even for a back-dated day. The latest completion wins.
    if (kind === 'DONE') {
      const followUps = await tx.task.findMany({
        where: { afterTaskId: id, archivedAt: null, triggerRefire: { not: null }, afterHours: { not: null } },
        select: { id: true, afterHours: true },
      });
      for (const f of followUps) {
        await tx.task.update({
          where: { id: f.id },
          data: { fireAt: followUpFireAt(completion.at, f.afterHours!), fireAtCompletionId: completion.id },
        });
      }
    }
    return dtoById(tx, id);
  });
}

export const completeTask = (id: number, date: string | undefined, actor: Actor) =>
  record(id, 'DONE', date, actor);

export const skipTask = (id: number, actor: Actor) => record(id, 'SKIPPED', undefined, actor);

/** Delete the latest completion (DONE or SKIPPED) and restore the task to before it. */
export async function undoTask(id: number): Promise<TaskDto> {
  return prisma.$transaction(async (tx) => {
    await activeTask(tx, id);
    const last = await tx.completion.findFirst({
      where: { taskId: id },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
    });
    if (!last) throw new TaskError(409, 'Nothing to undo');
    await tx.completion.delete({ where: { id: last.id } });
    // ADR-0011: a pending follow-up this completion scheduled is cancelled.
    await tx.task.updateMany({
      where: { fireAtCompletionId: last.id },
      data: { fireAt: null, fireAtCompletionId: null },
    });
    await tx.task.update({
      where: { id },
      data: { dueDate: last.dueDateBefore, doneAt: null },
    });
    return dtoById(tx, id);
  });
}

export type FireResult = 'fired' | 'repushed' | 'ignored';

/**
 * ADR-0010: the trigger fired (Home Assistant). A waiting task becomes due
 * today; one that is already fired keeps its date and, per its refire setting,
 * pushes again or does nothing. 404 for anything that isn't an active trigger task.
 */
export async function fireTask(id: number, now: Date = new Date()): Promise<FireResult> {
  const today = todayBerlin(now);
  const task = await prisma.task.findFirst({ where: { id, archivedAt: null, triggerRefire: { not: null } } });
  if (!task) throw new TaskError(404, 'Task not found');

  // Conditional update, so two simultaneous fires of a waiting task are one "fired".
  const woke = await prisma.task.updateMany({
    where: { id, dueDate: null },
    data: {
      dueDate: today,
      firedAt: now,
      notifiedFor: task.notify ? today : task.notifiedFor,
      // ADR-0011: any fire that wakes the task ends a pending scheduled one.
      fireAt: null,
      fireAtCompletionId: null,
    },
  });
  if (woke.count === 1) {
    await pushFired(id, false);
    return 'fired';
  }
  if (task.triggerRefire === 'NONE') return 'ignored';
  await prisma.task.update({ where: { id }, data: { firedAt: now } });
  await pushFired(id, true);
  return 'repushed';
}

/** Does `token` belong to this active trigger task? The hook's only auth check. */
export async function checkHookToken(id: number, token: string | null): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id, archivedAt: null, triggerRefire: { not: null } },
    select: { hookTokenHash: true },
  });
  return verifyToken(token, task?.hookTokenHash);
}

/** Generates (or replaces) the task's hook token. The plain token is returned once, never stored. */
export async function issueHookToken(id: number): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const task = await activeTask(tx, id);
    if (task.triggerRefire === null) throw new TaskError(400, 'Only trigger tasks have a hook token');
    const token = newToken();
    await tx.task.update({ where: { id }, data: { hookTokenHash: hashToken(token) } });
    return token;
  });
}

export async function archiveTask(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await activeTask(tx, id);
    await tx.task.update({ where: { id }, data: { archivedAt: new Date() } });
    // ADR-0011: its follow-ups lose the link; a pending fireAt of theirs stays.
    await tx.task.updateMany({ where: { afterTaskId: id }, data: { afterTaskId: null, afterHours: null } });
  });
}

/** ADR-0011: what the sheet's "Folgt auf" picker lists: every active task, by title. */
export async function listChoices(): Promise<{ tasks: { id: number; title: string }[] }> {
  const rows = await prisma.task.findMany({
    where: { archivedAt: null, doneAt: null },
    select: { id: true, title: true },
  });
  rows.sort((a, b) => a.title.localeCompare(b.title, 'de') || a.id - b.id);
  return { tasks: rows };
}

// ---- search and history (MCP; usable by the web later) -----------------------

/**
 * Active tasks (not archived, not a finished one-off: the same set as the home
 * list) whose title or notes contain `query` as a case- and umlaut-insensitive
 * substring. Sorted like the home list's sections would (urgent first), then
 * by id. An empty query is a 400.
 */
export async function searchTasks(query: string, now: Date = new Date()): Promise<{ today: string; tasks: TaskDto[] }> {
  const needle = foldText(query.trim());
  if (needle === '') throw new TaskError(400, 'query must not be empty');
  const today = todayBerlin(now);
  const rows = await prisma.task.findMany({
    where: { archivedAt: null, doneAt: null },
    include: taskInclude,
  });
  const hits = rows.filter(
    (r) => foldText(r.title).includes(needle) || foldText(r.notes ?? '').includes(needle),
  );
  const dtos = hits.map((r) => toDto(r, today));
  const byId = new Map(dtos.map((d) => [d.id, d]));
  const sorted = sortTasks(
    dtos.map((d, i) => ({
      id: d.id,
      priority: d.priority,
      dueDate: d.dueDate,
      recurrence: d.recurrence,
      createdAt: hits[i].createdAt,
    })),
    today,
  );
  const order = [...sorted.faellig, ...sorted.demnaechst, ...sorted.spaeter, ...sorted.irgendwann];
  return { today, tasks: order.map((t) => byId.get(t.id)!) };
}

export interface HistoryEntry {
  date: string;
  kind: 'DONE' | 'SKIPPED';
  by: { id: number; displayName: string };
  via: string;
  at: string;
}

const HISTORY_LIMIT = 20;

/** An active task plus its latest completions (DONE and SKIPPED), newest first. */
export async function getTask(
  id: number,
  now: Date = new Date(),
): Promise<{ today: string; task: TaskDto; history: HistoryEntry[] }> {
  await activeTask(prisma, id);
  const task = await dtoById(prisma, id);
  const rows = await prisma.completion.findMany({
    where: { taskId: id },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    take: HISTORY_LIMIT,
    include: { user: { select: { id: true, displayName: true } } },
  });
  return {
    today: todayBerlin(now),
    task,
    history: rows.map((r) => ({
      date: r.date,
      kind: r.kind,
      by: r.user,
      via: r.via,
      at: r.at.toISOString(),
    })),
  };
}
