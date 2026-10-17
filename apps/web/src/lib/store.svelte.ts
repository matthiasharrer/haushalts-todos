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

// Changes by the other person (or via MCP / a trigger) only show after a
// refetch. An installed app stays open in the background for days, so refetch
// whenever it comes back to the foreground, and poll while it's visible.
const POLL_MS = 30_000;
let pollTimer: ReturnType<typeof setInterval> | undefined;

function syncPolling() {
  clearInterval(pollTimer);
  pollTimer = document.visibilityState === 'visible' ? setInterval(invalidate, POLL_MS) : undefined;
}

/** Keep the mounted view fresh. Call once at startup. */
export function watchForChanges(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') invalidate();
    syncPolling();
  });
  syncPolling();
}
