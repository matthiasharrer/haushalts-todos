export type Me = { id: number; username: string; displayName: string; email: string | null };

export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type Unit = 'DAY' | 'WEEK' | 'MONTH';
export type Mode = 'AFTER_COMPLETION' | 'FIXED';
export type SectionName = 'faellig' | 'demnaechst' | 'spaeter' | 'irgendwann';

export interface Recurrence {
  every: number;
  unit: Unit;
  mode: Mode;
}

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  priority: Priority;
  dueDate: string | null;
  recurrence: Recurrence | null;
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
  if (!res.ok) throw new ApiError(res.status, germanMessage(res.status));
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const getMe = () => request<Me>('GET', '/api/me');
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

export const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
