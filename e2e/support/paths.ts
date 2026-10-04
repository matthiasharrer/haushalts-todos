// Paths and network coordinates for the e2e harness. Everything lives under
// .e2e/ (gitignored), fully separate from the dev DB.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — two levels up from e2e/support/. */
export const ROOT = path.resolve(here, '../..');

export const E2E_DIR = path.join(ROOT, '.e2e');
export const DB_PATH = path.join(E2E_DIR, 'e2e.db');
export const DATABASE_URL = `file:${DB_PATH}`;
export const REPORT_DIR = path.join(E2E_DIR, 'report');
export const TEST_RESULTS_DIR = path.join(E2E_DIR, 'test-results');

// Dev servers own 3001/5174 and rezepte owns 3000/5173/3101/3102 — never
// collide with those.
export const PORT = 3201;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const WEB_DIST = path.join(ROOT, 'apps/web/dist');
export const SERVER_ENTRY = path.join(ROOT, 'apps/api/dist/index.js');

// The built server mounts /mcp only when MCP_TOKEN is set. It is the HMAC
// secret that signs the OAuth codes/tokens, never a bearer (ADR-0006);
// tc43 sends it as one to prove it is rejected.
export const MCP_TOKEN = 'e2e-test-mcp-token';

// Push (ADR-0009): the server appends every would-be push as a JSON line here
// instead of sending (truncated in prepare.ts), and ticks fast.
export const PUSH_OUTBOX = path.join(E2E_DIR, 'push-outbox.jsonl');
export const PUSH_TICK_MS = 500;
