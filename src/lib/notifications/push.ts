/**
 * Web push delivery. This is the only place notifications leave the system:
 * every other module inserts a lane_notifications row and flushNotifications
 * sends it. Without VAPID keys nothing is sent and rows are still stamped so
 * they do not pile up.
 */
import webpush, { WebPushError } from "web-push";
import type { AdminClient } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body: string; url?: string | null };

const SUBJECT = "mailto:liam@laneproperty.com.au";

let configured: boolean | null = null;

/** True when VAPID keys are set and web-push is ready to send. */
export function pushConfigured(): boolean {
  if (configured != null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set; notifications are logged, not sent.");
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(SUBJECT, pub, priv);
  configured = true;
  return configured;
}

type SubscriptionRow = { id: string; endpoint: string; keys: unknown };

function toSubscription(row: SubscriptionRow): webpush.PushSubscription | null {
  const keys = row.keys as { p256dh?: unknown; auth?: unknown } | null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  return { endpoint: row.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Sends one payload to every device a staff member has subscribed. Dead
 * subscriptions (404, 410) are deleted. Returns how many devices took it.
 */
export async function sendToStaff(db: AdminClient, staffId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const { data: rows, error } = await db.from("lane_push_subscriptions").select("id, endpoint, keys").eq("staff_id", staffId);
  if (error) throw new Error(`sendToStaff: ${error.message}`);
  if (!rows?.length) return { sent: 0, removed: 0 };

  if (!pushConfigured()) {
    console.info(`[push] (not sent) to ${staffId}: ${payload.title} — ${payload.body}`);
    return { sent: 0, removed: 0 };
  }

  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? "/queue" });
  let sent = 0;
  let removed = 0;
  for (const row of rows) {
    const sub = toSubscription(row);
    if (!sub) {
      await db.from("lane_push_subscriptions").delete().eq("id", row.id);
      removed += 1;
      continue;
    }
    try {
      await webpush.sendNotification(sub, body, { TTL: 60 * 60 * 12 });
      sent += 1;
    } catch (err) {
      const status = err instanceof WebPushError ? err.statusCode : (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await db.from("lane_push_subscriptions").delete().eq("id", row.id);
        removed += 1;
      } else {
        console.error(`[push] send to ${staffId} failed`, err);
      }
    }
  }
  return { sent, removed };
}

/**
 * Sends every unsent lane_notifications row and stamps sent_at. A row is
 * stamped even when the staff member has no device subscribed, so a
 * notification is only ever attempted once.
 */
export async function flushNotifications(db: AdminClient, limit = 200): Promise<{ rows: number; sent: number; removed: number }> {
  const { data: rows, error } = await db
    .from("lane_notifications")
    .select("id, staff_id, title, body, url")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`flushNotifications: ${error.message}`);
  if (!rows?.length) return { rows: 0, sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  for (const row of rows) {
    const result = await sendToStaff(db, row.staff_id, { title: row.title, body: row.body, url: row.url });
    sent += result.sent;
    removed += result.removed;
    const { error: stampError } = await db
      .from("lane_notifications")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id);
    if (stampError) console.error(`[push] could not stamp ${row.id}: ${stampError.message}`);
  }
  return { rows: rows.length, sent, removed };
}
