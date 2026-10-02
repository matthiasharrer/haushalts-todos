export type Me = { id: number; username: string; displayName: string; email: string | null };

export async function getMe(): Promise<Me> {
  const res = await fetch('/api/me');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
