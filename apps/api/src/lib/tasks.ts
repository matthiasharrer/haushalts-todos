// Task domain operations: the single implementation behind the REST routes and
// (later) the MCP tools. No HTTP in here; `actor.via` says which channel the
// caller came through ("web", "mcp:<client>").
import { z } from 'zod';
import { prisma } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isValidDate, todayBerlin } from './dates.js';
import { nextDueDate } from './recurrence.js';
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

const recurrence = z.object({
  every: z.number().int().min(1).max(1000),
  unit: z.enum(['DAY', 'WEEK', 'MONTH']),
  mode: z.enum(['AFTER_COMPLETION', 'FIXED']).default('AFTER_COMPLETION'),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000).nullish(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  dueDate: dateStr.nullish(),
  recurrence: recurrence.nullish(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  dueDate: dateStr.nullable().optional(),
  recurrence: recurrence.nullable().optional(),
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
  } | null;
  createdBy: { id: number; displayName: string };
  lastDone: { date: string; by: { id: number; displayName: string } } | null;
  urgency: number | null;
  section: Section;
}

function toDto(t: TaskRow, today: string): TaskDto {
  const rec =
    t.recurrenceEvery && t.recurrenceUnit && t.recurrenceMode
      ? { every: t.recurrenceEvery, unit: t.recurrenceUnit, mode: t.recurrenceMode }
      : null;
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
  return {
    recurrenceEvery: r?.every ?? null,
    recurrenceUnit: r?.unit ?? null,
    recurrenceMode: r?.mode ?? null,
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
      spaeter: pick('spaeter'),
      irgendwann: pick('irgendwann'),
    },
  };
}

export async function createTask(input: CreateTaskInput, actor: Actor): Promise<TaskDto> {
  const rec = input.recurrence ?? null;
  // A recurring task always has a due date; default: today (TC-15).
  const dueDate = input.dueDate ?? (rec ? todayBerlin() : null);
  const task = await prisma.task.create({
    data: {
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? 'NORMAL',
      dueDate,
      ...recurrenceColumns(rec),
      createdById: actor.userId,
      createdVia: actor.via,
    },
  });
  return dtoById(prisma, task.id);
}

export async function updateTask(id: number, patch: UpdateTaskInput): Promise<TaskDto> {
  return prisma.$transaction(async (tx) => {
    const task = await activeTask(tx, id);
    const data: Prisma.TaskUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.priority !== undefined) data.priority = patch.priority;

    const willRecur =
      patch.recurrence !== undefined
        ? patch.recurrence !== null
        : task.recurrenceEvery !== null;
    let dueDate = patch.dueDate !== undefined ? patch.dueDate : task.dueDate;
    if (willRecur && dueDate === null) {
      if (patch.dueDate === null) throw new TaskError(400, 'A recurring task needs a dueDate');
      dueDate = todayBerlin(); // one-off without date turned into a recurring one
    }
    if (dueDate !== task.dueDate) data.dueDate = dueDate;
    if (patch.recurrence !== undefined) Object.assign(data, recurrenceColumns(patch.recurrence));

    await tx.task.update({ where: { id }, data });
    return dtoById(tx, id);
  });
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
