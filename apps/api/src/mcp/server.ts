// The MCP tool surface (ADR-0006). Structure follows rezepte's mcp/server.ts;
// the tools are Haushalt's. Every tool goes through lib/tasks.ts, the same
// service the REST routes use, so behaviour can't drift between the two
// surfaces. buildMcpServer() is a per-request factory (createMcpHandler calls
// it per exchange): nothing here holds state across calls.
//
// WHO is acting comes only from `AuthInfo.extra`, which mcp/verifier.ts fills
// from the verified token + the client row's user binding - never from a tool
// argument. Failures are `isError: true` text results in German, not protocol
// errors.
import { McpServer } from '@modelcontextprotocol/server';
import type { ServerContext } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { todayBerlin } from '../lib/dates.js';
import {
  TaskError,
  archiveTask,
  completeSchema,
  completeTask,
  createTask,
  createTaskSchema,
  getTask,
  listRecurring,
  listTasks,
  searchTasks,
  skipTask,
  undoTask,
  updateTask,
  updateTaskSchema,
  type Actor,
} from '../lib/tasks.js';
import { historyForModel, longDate, taskForModel } from './format.js';

export const INSTRUCTIONS =
  'Haushalt ist die gemeinsame Aufgaben-App eines Haushalts mit zwei Personen: einmalige Aufgaben ' +
  'und wiederkehrende Haushaltsarbeiten, sortiert nach Dringlichkeit (fällig, demnächst, später, ' +
  'irgendwann). "Heute" ist immer das Datum in Europe/Berlin; alle Daten sind Kalendertage ' +
  '(JJJJ-MM-TT). Du handelst im Namen der Person, die diesen Konnektor freigegeben hat: Alles, was ' +
  'du abhakst, überspringst oder anlegst, wird ihr zugeschrieben (mit dem Hinweis "über Claude"). ' +
  'Zusätzlich zu den Rohdaten liefern die Tools deutsche Felder (z.B. dueLabel "seit 3 Tagen"), ' +
  'die du direkt in der Antwort verwenden kannst. Wenn jemand sagt "ich hab X gemacht": erst ' +
  'search_tasks, dann complete_task mit der gefundenen id.';

/** The acting user and client, from the verified token. Fails closed. */
function actorFrom(ctx: ServerContext): Actor {
  const extra = ctx.http?.authInfo?.extra;
  const userId = extra?.userId;
  const clientName = extra?.clientName;
  if (typeof userId !== 'number' || !Number.isInteger(userId) || typeof clientName !== 'string') {
    throw new Error('MCP call without a verified user binding');
  }
  return { userId, via: `mcp:${clientName}` };
}

type ToolResult = { isError?: true; content: { type: 'text'; text: string }[] };

function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

const GERMAN_TASK_ERRORS: Record<string, string> = {
  'Task not found':
    'Diese Aufgabe gibt es nicht (oder sie wurde archiviert). Mit search_tasks oder list_tasks die richtige id finden.',
  'Task is already done': 'Diese einmalige Aufgabe ist bereits erledigt.',
  'Nothing to undo': 'Es gibt nichts, was sich rückgängig machen ließe.',
  'date must not be in the future': 'Das Datum darf nicht in der Zukunft liegen.',
  'Only recurring tasks can be skipped': 'Nur wiederkehrende Aufgaben lassen sich überspringen.',
  'A recurring task needs a dueDate': 'Eine wiederkehrende Aufgabe braucht ein Fälligkeitsdatum.',
  'query must not be empty': 'Der Suchbegriff darf nicht leer sein.',
};

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    if (err instanceof TaskError) return errorResult(GERMAN_TASK_ERRORS[err.message] ?? `Ungültige Eingabe: ${err.message}`);
    throw err; // unexpected: surfaces as a protocol-level error
  }
}

/** Validates tool input with the service's own schema; German error on failure. */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.') || 'Eingabe'}: ${i.message}`).join('; ');
    throw new TaskError(400, detail);
  }
  return r.data;
}

const idSchema = z.number().int().positive().describe('Die id der Aufgabe (aus list_tasks, list_recurring oder search_tasks).');

const prioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']).describe('Priorität: LOW (niedrig), NORMAL (normal, Standard) oder HIGH (hoch).');

const recurrenceSchema = z
  .object({
    every: z.number().int().min(1).max(1000).describe('Intervall, z.B. 2 für "alle 2 Wochen".'),
    unit: z.enum(['DAY', 'WEEK', 'MONTH']).describe('Einheit: DAY (Tage), WEEK (Wochen) oder MONTH (Monate).'),
    mode: z
      .enum(['AFTER_COMPLETION', 'FIXED'])
      .optional()
      .describe(
        'AFTER_COMPLETION (Standard): das nächste Mal wird ab dem Erledigungstag gerechnet. ' +
          'FIXED: fester Kalendertakt, unabhängig davon, wann erledigt wurde.',
      ),
  })
  .describe('Wiederholung. Weglassen für eine einmalige Aufgabe.');

const dateDescription = 'Kalendertag als JJJJ-MM-TT (Europe/Berlin).';

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'haushalt', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'list_tasks',
    {
      title: 'Aufgaben auflisten',
      description:
        'Die Aufgabenliste wie auf der Startseite der App: vier Abschnitte nach Dringlichkeit, ' +
        'jeweils schon richtig sortiert: faellig (heute oder überfällig), demnaechst (in den ' +
        'nächsten 7 Tagen), spaeter (einmalige Aufgaben weiter in der Zukunft) und irgendwann ' +
        '(ohne Datum). Wiederkehrende Aufgaben, die weit in der Zukunft liegen, stehen hier nicht, ' +
        'sondern in list_recurring. Erledigte einmalige und archivierte Aufgaben fehlen. Jede ' +
        'Aufgabe hat Rohdaten (dueDate) und deutsche Felder (dueLabel, recurrenceLabel, lastDone.label).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(async () => {
        const { today, sections } = await listTasks();
        const out = Object.fromEntries(
          Object.entries(sections).map(([k, v]) => [k, v.map((t) => taskForModel(t, today))]),
        );
        return { today, todayLabel: longDate(today), sections: out };
      }),
  );

  server.registerTool(
    'list_recurring',
    {
      title: 'Wiederkehrende Aufgaben auflisten',
      description:
        'Alle aktiven wiederkehrenden Aufgaben (Haushaltsarbeiten), nach nächstem Fälligkeitstag ' +
        'sortiert, auch die, die erst in Wochen wieder dran sind. Mit recurrenceLabel ("alle 2 Wochen") ' +
        'und lastDone (wer es zuletzt wann gemacht hat).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      run(async () => {
        const { today, tasks } = await listRecurring();
        return { today, todayLabel: longDate(today), tasks: tasks.map((t) => taskForModel(t, today)) };
      }),
  );

  server.registerTool(
    'search_tasks',
    {
      title: 'Aufgaben suchen',
      description:
        'Sucht aktive Aufgaben (nicht archiviert, nicht erledigt) per Teilstring in Titel und Notizen; ' +
        'Groß-/Kleinschreibung und Umlaute sind egal ("kuhlschrank" findet "Kühlschrank abtauen"). ' +
        'Das ist der erste Schritt, wenn jemand sagt "ich hab die Waschmaschine gereinigt" oder ' +
        '"verschieb das mit dem Müll": erst hier die id finden, dann mit complete_task, update_task ' +
        'usw. weitermachen. Bei mehreren Treffern lieber nachfragen, statt zu raten.',
      inputSchema: z.object({
        query: z.string().describe('Suchbegriff, z.B. "waschmaschine". Teilstring, Umlaute und Schreibweise egal.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) =>
      run(async () => {
        const { today, tasks } = await searchTasks(query);
        return { today, count: tasks.length, tasks: tasks.map((t) => taskForModel(t, today)) };
      }),
  );

  server.registerTool(
    'get_task',
    {
      title: 'Aufgabe ansehen',
      description:
        'Eine einzelne Aufgabe mit allen Details und ihrem Verlauf: die letzten 20 Erledigungen/' +
        'Überspringungen (neueste zuerst) mit Datum, Art (DONE/SKIPPED), wer und worüber (via: "web" ' +
        'oder "mcp:<Client>"). Gut für "wann hat X das zuletzt gemacht?".',
      inputSchema: z.object({ id: idSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      run(async () => {
        const { today, task, history } = await getTask(id);
        return { today, task: taskForModel(task, today), history: history.map((h) => historyForModel(h, today)) };
      }),
  );

  server.registerTool(
    'add_task',
    {
      title: 'Aufgabe anlegen',
      description:
        'Legt eine neue Aufgabe an (einmalig oder wiederkehrend). Sie wird der verbundenen Person ' +
        'als Ersteller zugeschrieben. Ohne due_date ist sie "irgendwann"; eine wiederkehrende ' +
        'Aufgabe ohne due_date ist heute fällig.',
      inputSchema: z.object({
        title: z.string().describe('Titel, kurz und knapp (max. 200 Zeichen).'),
        notes: z.string().optional().describe('Notizen, optional.'),
        priority: prioritySchema.optional(),
        due_date: z.string().optional().describe(`Fälligkeitsdatum. ${dateDescription} Weglassen = kein Datum.`),
        recurrence: recurrenceSchema.optional(),
      }),
    },
    async (args, ctx) =>
      run(async () => {
        const actor = actorFrom(ctx);
        const input = parse(createTaskSchema, {
          title: args.title,
          notes: args.notes,
          priority: args.priority,
          dueDate: args.due_date,
          recurrence: args.recurrence,
        });
        return taskForModel(await createTask(input, actor), todayBerlin());
      }),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Aufgabe ändern',
      description:
        'Ändert Felder einer aktiven Aufgabe; nur übergebene Felder werden geändert. notes: null ' +
        'löscht die Notiz, due_date: null entfernt das Datum (geht nicht bei wiederkehrenden), ' +
        'recurrence: null macht die Aufgabe zu einer einmaligen. Zum Verschieben einer Fälligkeit ' +
        'due_date setzen.',
      inputSchema: z.object({
        id: idSchema,
        title: z.string().optional().describe('Neuer Titel.'),
        notes: z.string().nullable().optional().describe('Neue Notiz; null löscht sie.'),
        priority: prioritySchema.optional(),
        due_date: z.string().nullable().optional().describe(`Neues Fälligkeitsdatum. ${dateDescription} null entfernt es.`),
        recurrence: recurrenceSchema.nullable().optional().describe('Neue Wiederholung; null macht die Aufgabe einmalig.'),
      }),
    },
    async ({ id, ...rest }) =>
      run(async () => {
        const patch = parse(updateTaskSchema, {
          title: rest.title,
          notes: rest.notes,
          priority: rest.priority,
          dueDate: rest.due_date,
          recurrence: rest.recurrence,
        });
        return taskForModel(await updateTask(id, patch), todayBerlin());
      }),
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Aufgabe abhaken',
      description:
        'Hakt eine Aufgabe als erledigt ab. Einmalige Aufgaben sind danach fertig; bei ' +
        'wiederkehrenden rückt das Fälligkeitsdatum zum nächsten Termin weiter. Wird der verbundenen ' +
        'Person zugeschrieben. `date` ist der Tag, an dem es wirklich erledigt wurde ("gestern": ' +
        'gestriges Datum, nie in der Zukunft); ohne Angabe gilt heute. Die id vorher mit search_tasks ' +
        'oder list_tasks bestimmen.',
      inputSchema: z.object({
        id: idSchema,
        date: z.string().optional().describe(`Erledigungstag. ${dateDescription} Standard: heute.`),
      }),
    },
    async ({ id, date }, ctx) =>
      run(async () => {
        const actor = actorFrom(ctx);
        const input = parse(completeSchema, { date });
        return taskForModel(await completeTask(id, input.date, actor), todayBerlin());
      }),
  );

  server.registerTool(
    'skip_task',
    {
      title: 'Aufgabe überspringen',
      description:
        'Überspringt den aktuellen Termin einer wiederkehrenden Aufgabe: sie rückt zum nächsten ' +
        'Termin weiter, ohne als erledigt zu zählen (steht im Verlauf als "übersprungen"). Nur für ' +
        'wiederkehrende Aufgaben.',
      inputSchema: z.object({ id: idSchema }),
    },
    async ({ id }, ctx) =>
      run(async () => {
        const actor = actorFrom(ctx);
        return taskForModel(await skipTask(id, actor), todayBerlin());
      }),
  );

  server.registerTool(
    'undo_last',
    {
      title: 'Letzte Erledigung rückgängig machen',
      description:
        'Macht die zuletzt erfasste Erledigung oder Überspringung dieser Aufgabe rückgängig ' +
        '(unabhängig davon, wer sie erfasst hat) und stellt das vorherige Fälligkeitsdatum wieder her. ' +
        'Fehler, wenn es nichts rückgängig zu machen gibt.',
      inputSchema: z.object({ id: idSchema }),
    },
    async ({ id }) => run(async () => taskForModel(await undoTask(id), todayBerlin())),
  );

  server.registerTool(
    'archive_task',
    {
      title: 'Aufgabe archivieren',
      description:
        'Archiviert eine Aufgabe: sie verschwindet aus allen Listen (der Verlauf bleibt erhalten). ' +
        'Für Aufgaben, die nicht mehr gebraucht werden. Nicht für erledigte Aufgaben, dafür gibt es ' +
        'complete_task.',
      inputSchema: z.object({ id: idSchema }),
    },
    async ({ id }) =>
      run(async () => {
        await archiveTask(id);
        return { archived: true, id };
      }),
  );

  return server;
}
