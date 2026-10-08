export type Me = {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  digestEnabled: boolean;
  /** "HH:MM", Europe/Berlin. */
  notifyTime: string;
};

export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type Unit = 'DAY' | 'WEEK' | 'MONTH';
export type Mode = 'AFTER_COMPLETION' | 'FIXED';
export type SectionName = 'faellig' | 'demnaechst' | 'spaeter' | 'irgendwann';

export interface Recurrence {
  every: number;
  unit: Unit;
  mode: Mode;
  /** Months 1-12, both inclusive; from > to wraps the year end (ADR-0008). */
  season?: Season | null;
}

export interface Season {
  from: number;
  to: number;
}

export type Refire = 'PUSH' | 'NONE';

/** Trigger task (ADR-0010): waiting while dueDate is null, fired otherwise. */
export interface Trigger {
  refire: Refire;
  hasToken: boolean;
  /** ISO instant of the last fire. */
  firedAt: string | null;
  /** ADR-0011: follows another task, `hours` after it is done. */
  after: { taskId: number; title: string; hours: number } | null;
  /** ADR-0011: ISO instant a pending follow-up fires. */
  fireAt: string | null;
}

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  recurrence: Recurrence | null;
  /** Push when it becomes due (ADR-0009). */
  notify: boolean;
  trigger: Trigger | null;
  /** ADR-0011: active trigger tasks that follow this one. */
  followUps: { id: number; title: string; hours: number }[];
  /** Seasonal chore out of season and not due yet (ADR-0008). */
  resting: boolean;
  createdBy: { id: number; displayName: string };
  lastDone: { date: string; by: { id: number; displayName: string } } | null;
  urgency: number | null;
  section: SectionName;
}

export interface TaskList {
  today: string;
  sections: Record<SectionName, Task[]>;
}

export interface TaskPatch {
  title?: string;
  notes?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  recurrence?: Recurrence | null;
  notify?: boolean;
  /** Send { refire } to make it a trigger task; null turns that off. */
  trigger?: { refire: Refire; after?: { taskId: number; hours: number } | null } | null;
}

/** An API failure with a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function germanMessage(status: number): string {
  if (status === 0) return 'Keine Verbindung zum Server.';
  if (status === 404) return 'Das gibt es nicht mehr.';
  if (status === 409) return 'Das ist so nicht mehr möglich.';
  if (status === 400) return 'Die Eingabe ist ungültig.';
  if (status === 401) return 'Nicht angemeldet.';
  return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, germanMessage(0));
  }
  if (!res.ok) {
    // A server that knows better (e.g. the test push) sends a German `message`.
    const detail = await res.json().then((b) => (typeof b?.message === 'string' ? b.message : null), () => null);
    throw new ApiError(res.status, detail ?? germanMessage(res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const getMe = () => request<Me>('GET', '/api/me');
export const patchMe = (patch: { digestEnabled?: boolean; notifyTime?: string }) =>
  request<Me>('PATCH', '/api/me', patch);
export const listTasks = () => request<TaskList>('GET', '/api/tasks');
export interface RecurringList {
  today: string;
  tasks: Task[];
}

export const listRecurring = () => request<RecurringList>('GET', '/api/recurring');
export const createTask = (input: string | (TaskPatch & { title: string })) =>
  request<Task>('POST', '/api/tasks', typeof input === 'string' ? { title: input } : input);
export const updateTask = (id: number, patch: TaskPatch) =>
  request<Task>('PATCH', `/api/tasks/${id}`, patch);
export const completeTask = (id: number, date?: string) =>
  request<Task>('POST', `/api/tasks/${id}/complete`, date ? { date } : undefined);
export const skipTask = (id: number) => request<Task>('POST', `/api/tasks/${id}/skip`);
export const undoTask = (id: number) => request<Task>('POST', `/api/tasks/${id}/undo`);
/** Generates or replaces the trigger task's token; the only time it is ever returned. */
export const issueHookToken = (id: number) =>
  request<{ token: string; url: string }>('POST', `/api/tasks/${id}/hook-token`);
/** ADR-0011: every active task, for the "Folgt auf" picker. */
export const listChoices = () => request<{ tasks: { id: number; title: string }[] }>('GET', '/api/tasks/choices');
export const deleteTask = (id: number) => request<void>('DELETE', `/api/tasks/${id}`);

export interface McpConfig {
  configured: boolean;
  endpoint: string;
}
export interface McpClient {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const getMcpConfig = () => request<McpConfig>('GET', '/api/mcp/config');
export const listMcpClients = () => request<McpClient[]>('GET', '/api/mcp/clients');
export const renameMcpClient = (id: number, name: string) =>
  request<McpClient>('PATCH', `/api/mcp/clients/${id}`, { name });
export const revokeMcpClient = (id: number) => request<void>('DELETE', `/api/mcp/clients/${id}`);

export const getPushConfig = () => request<{ publicKey: string }>('GET', '/api/push/config');
export const savePushSubscription = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
  request<unknown>('POST', '/api/push/subscriptions', sub);
export const deletePushSubscription = (endpoint: string) =>
  request<void>('DELETE', '/api/push/subscriptions', { endpoint });
export const sendPushTest = (endpoint: string) => request<void>('POST', '/api/push/test', { endpoint });

export const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
