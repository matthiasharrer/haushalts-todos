// State shared by both views: the toast (survives tab switches) and a counter
// that tells the mounted view to refetch after something changed elsewhere.
export type Toast = { id: number; text: string; undo?: () => Promise<unknown>; error?: boolean };

export const shared = $state<{ toast: Toast | null; version: number }>({ toast: null, version: 0 });

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string, opts: { undo?: () => Promise<unknown>; error?: boolean } = {}) {
  clearTimeout(timer);
  shared.toast = { id: ++seq, text, ...opts };
  timer = setTimeout(() => (shared.toast = null), 6000);
}

export function clearToast() {
  clearTimeout(timer);
  shared.toast = null;
}

/** Ask the mounted view to refetch. */
export const invalidate = () => void shared.version++;
