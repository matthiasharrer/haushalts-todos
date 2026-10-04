// Task domain operations: the single implementation behind the REST routes and
// (later) the MCP tools. No HTTP in here; `actor.via` says which channel the
// caller came through ("web", "mcp:<client>").
import { z } from 'zod';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isValidDate, todayBerlin } from './dates.js';
import { foldText } from './text.js';
import { inSeason, nextDueDate, normalizeSeason, seasonDate, type Season } from './recurrence.js';
import { pushAfterWrite, type Before } from './pushEvents.js';
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

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000).nullish(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  dueDate: dateStr.nullish(),
  recurrence: recurrence.nullish(),
  notify: z.boolean().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  dueDate: dateStr.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
  notify: z.boolean().optional(),
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
    where: { archivedAt: null, doneAt: null },
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

/** ADR-0007: every active recurring task, by next due date (then id). */
export async function listRecurring(now: Date = new Date()) {
  const today = todayBerlin(now);
  const rows = await prisma.task.findMany({
    where: { archivedAt: null, recurrenceEvery: { not: null } },
    include: taskInclude,
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });
  return { today, tasks: rows.map((r) => toDto(r, today)) };
}

export async function createTask(input: CreateTaskInput, actor: Actor): Promise<TaskDto> {
  const rec = input.recurrence ?? null;
  // A recurring task always has a due date; default: today (TC-15).
  let dueDate = input.dueDate ?? (rec ? todayBerlin() : null);
  if (rec && dueDate) dueDate = seasonDate(dueDate, normalizeSeason(rec.season));
  const task = await prisma.task.create({
    data: {
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? 'NORMAL',
      dueDate,
      ...recurrenceColumns(rec),
      notify: input.notify ?? false,
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
    const data: Prisma.TaskUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.notify !== undefined) data.notify = patch.notify;

    const willRecur =
      patch.recurrence !== undefined
        ? patch.recurrence !== null
        : task.recurrenceEvery !== null;
    let dueDate = patch.dueDate !== undefined ? patch.dueDate : task.dueDate;
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
    if (patch.recurrence !== undefined) Object.assign(data, recurrenceColumns(patch.recurrence));

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
    const recurring =
      task.recurrenceEvery && task.recurrenceUnit && task.recurrenceMode && task.dueDate;
    if (!recurring && kind === 'SKIPPED') {
      throw new TaskError(400, 'Only recurring tasks can be skipped');
    }
    if (!recurring && task.doneAt) throw new TaskError(409, 'Task is already done');

    await tx.completion.create({
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
    } else {
      await tx.task.update({ where: { id }, data: { doneAt: new Date() } });
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
    await tx.task.update({
      where: { id },
      data: { dueDate: last.dueDateBefore, doneAt: null },
    });
    return dtoById(tx, id);
  });
}

export async function archiveTask(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await activeTask(tx, id);
    await tx.task.update({ where: { id }, data: { archivedAt: new Date() } });
  });
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
