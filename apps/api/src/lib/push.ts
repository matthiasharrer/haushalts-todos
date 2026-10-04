// Web Push plumbing (ADR-0009): VAPID keys, the swappable transport and the
// sender. The sender is DB-free on purpose (its callbacks are injected), so
// the unit test needs neither Prisma nor a DATABASE_URL; the DB-backed
// defaults are imported lazily.
import fs from 'node:fs';
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
  /** Where a tap on the notification goes. */
  url: string;
  /** Alert again although a notification with this tag is already shown (needs a tag). */
  renotify?: boolean;
}

export interface PushSub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one payload to one subscription; rejects on failure (with `statusCode` when the push service answered). */
export type Transport = (sub: PushSub, payload: PushPayload) => Promise<void>;

export interface SenderDeps {
  transport: Transport;
  /** The push service said 404/410: the subscription is dead. */
  onGone: (sub: PushSub) => Promise<void>;
  onSuccess: (sub: PushSub) => Promise<void>;
  log: (message: string, err?: unknown) => void;
}

// ---- VAPID -------------------------------------------------------------------

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let vapidCache: VapidKeys | null = null;

/** The key pair from AppSetting "vapid"; generated and stored on first use. */
export async function getVapid(): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const { prisma } = await import('../db.js');
  const row = await prisma.appSetting.findUnique({ where: { key: 'vapid' } });
  if (row) {
    vapidCache = JSON.parse(row.value) as VapidKeys;
    return vapidCache;
  }
  const generated = webpush.generateVAPIDKeys();
  // Two first requests racing: the unique key makes the loser read the winner's pair.
  try {
    await prisma.appSetting.create({ data: { key: 'vapid', value: JSON.stringify(generated) } });
    vapidCache = generated;
  } catch {
    const winner = await prisma.appSetting.findUniqueOrThrow({ where: { key: 'vapid' } });
    vapidCache = JSON.parse(winner.value) as VapidKeys;
  }
  return vapidCache;
}

function vapidSubject(): string {
  return process.env.PUBLIC_URL?.trim() || 'mailto:haushalt@example.invalid';
}

// ---- transports --------------------------------------------------------------

/** Appends `{endpoint, payload}` as one JSON line to `file`; sends nothing (e2e). */
export function outboxTransport(file: string): Transport {
  return async (sub, payload) => {
    fs.appendFileSync(file, JSON.stringify({ endpoint: sub.endpoint, payload }) + '\n');
  };
}

const webPushTransport: Transport = async (sub, payload) => {
  const keys = await getVapid();
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    {
      vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 24 * 60 * 60,
    },
  );
};

export function defaultTransport(): Transport {
  const outbox = process.env.PUSH_OUTBOX;
  return outbox ? outboxTransport(outbox) : webPushTransport;
}

// ---- sender ------------------------------------------------------------------

async function defaultDeps(): Promise<SenderDeps> {
  const { prisma } = await import('../db.js');
  return {
    transport: defaultTransport(),
    onGone: async (sub) => {
      await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
    },
    onSuccess: async (sub) => {
      await prisma.pushSubscription.updateMany({ where: { id: sub.id }, data: { lastSuccessAt: new Date() } });
    },
    log: (message, err) => console.error(message, err ?? ''),
  };
}

/** One device that didn't get the push: the push service's HTTP status, or the network error code. */
export interface SendFailure {
  subId: number;
  status?: number;
  code?: string;
}

/** German explanation of a failure, for "Test senden" (the only caller who waits for the answer). */
export function describeFailure(f: SendFailure): string {
  if (f.status === 404 || f.status === 410) {
    return 'Dieses Gerät ist beim Push-Dienst nicht mehr angemeldet. Schalte „Auf diesem Gerät“ aus und wieder ein.';
  }
  if (f.status) return `Der Push-Dienst hat abgelehnt (HTTP ${f.status}).`;
  return `Push-Dienst nicht erreichbar${f.code ? ` (${f.code})` : ''}. Darf der Server ins Internet (fcm.googleapis.com:443)?`;
}

/**
 * Best effort, never throws: one failing device doesn't stop the others.
 * 404/410 deletes the subscription; any other error is logged and the row kept.
 * Returns the failures, so a caller that waits (the test push) can report them.
 */
export async function sendToSubscriptions(
  subs: PushSub[],
  payload: PushPayload,
  deps?: SenderDeps,
): Promise<SendFailure[]> {
  const failures: SendFailure[] = [];
  if (subs.length === 0) return failures;
  const d = deps ?? (await defaultDeps());
  for (const sub of subs) {
    try {
      await d.transport(sub, payload);
    } catch (err) {
      const status = (err as { statusCode?: number } | null)?.statusCode;
      const code = (err as { code?: unknown } | null)?.code;
      failures.push({ subId: sub.id, status, code: typeof code === 'string' ? code : undefined });
      try {
        if (status === 404 || status === 410) {
          await d.onGone(sub);
        } else {
          d.log(`push to subscription ${sub.id} failed${status ? ` (${status})` : ''}`, err);
        }
      } catch (inner) {
        d.log(`push cleanup for subscription ${sub.id} failed`, inner);
      }
      continue;
    }
    try {
      await d.onSuccess(sub);
    } catch (err) {
      d.log(`recording push success for subscription ${sub.id} failed`, err);
    }
  }
  return failures;
}
