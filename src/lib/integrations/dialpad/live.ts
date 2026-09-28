/**
 * Dialpad, live. Calls and texts are listed from the REST API since the last
 * sync; the webhook route also hands events through the same normalisers.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdminClient } from "@/lib/supabase/admin";
import { normalisePhone } from "@/lib/domain/match";
import type { CallEvent, CallState, SmsEvent } from "../types";

const BASE = process.env.DIALPAD_BASE_URL ?? "https://dialpad.com/api/v2";

function apiKey(): string {
  const key = process.env.DIALPAD_API_KEY;
  if (!key) throw new Error("DIALPAD_API_KEY is not set");
  return key;
}

async function get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T | null> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Dialpad ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Normalising raw payloads (shared with the webhook)
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function when(v: unknown): Date {
  const n = num(v);
  if (n !== null) return new Date(n > 1e12 ? n : n * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function targetUserId(raw: Raw): string | null {
  const t = raw.target as Raw | undefined;
  if (t && (t.type === "user" || !t.type)) return str(t.id);
  return str(raw.target_id) ?? str(raw.user_id);
}

/** Dialpad call states we treat as a finished call, mapped to ours. */
export function callState(raw: Raw): CallState | null {
  const state = (str(raw.state) ?? "").toLowerCase();
  const wasVoicemail = Boolean(raw.voicemail_link) || state === "voicemail";
  const duration = num(raw.duration) ?? 0;
  if (wasVoicemail) return "voicemail";
  if (state === "missed" || state === "abandoned" || state === "cancelled" || state === "canceled") return "missed";
  if (state === "hangup" || state === "completed" || state === "ended" || state === "answered") {
    // A hangup with no talk time on an inbound call is a missed call.
    const talk = num(raw.talk_time) ?? num(raw.duration_seconds) ?? duration;
    const direction = (str(raw.direction) ?? "").toLowerCase();
    return talk > 0 || direction === "outbound" ? "answered" : "missed";
  }
  // ringing, connected, queued, etc. are not final.
  return null;
}

export function normaliseCall(raw: Raw): CallEvent | null {
  const id = str(raw.call_id) ?? str(raw.id);
  if (!id) return null;
  const state = callState(raw);
  if (!state) return null;
  const direction = (str(raw.direction) ?? "").toLowerCase() === "outbound" ? "outbound" : "inbound";
  const external = normalisePhone(str(raw.external_number) ?? str(raw.from_number) ?? null);
  const internal = normalisePhone(str(raw.internal_number) ?? str(raw.to_number) ?? null);
  const fromNumber = direction === "inbound" ? external : internal;
  const toNumber = direction === "inbound" ? internal : external;
  const durationMs = num(raw.duration);
  const talk = num(raw.talk_time);
  const recordings = Array.isArray(raw.recording_details) ? (raw.recording_details as Raw[]) : [];
  const recordingUrl = str(recordings[0]?.url) ?? str(raw.recording_url) ?? str(raw.voicemail_link) ?? null;
  const transcriptUrl = str(raw.transcription_url) ?? str(raw.transcript_url) ?? null;
  const transcript = str(raw.transcription_text) ?? str(raw.transcript) ?? null;
  return {
    kind: "call",
    externalId: id,
    direction,
    state,
    fromNumber,
    toNumber,
    contactNumber: external,
    durationSeconds: talk !== null ? Math.round(talk) : durationMs !== null ? Math.round(durationMs / 1000) : null,
    recordingUrl,
    transcriptUrl,
    transcript,
    occurredAt: when(raw.date_started ?? raw.date_connected ?? raw.started_at ?? raw.date_ended),
    dialpadUserId: targetUserId(raw),
  };
}

export function normaliseSms(raw: Raw): SmsEvent | null {
  const id = str(raw.id) ?? str(raw.message_id) ?? str(raw.sms_id);
  if (!id) return null;
  const direction = (str(raw.direction) ?? "").toLowerCase() === "outbound" ? "outbound" : "inbound";
  const from = normalisePhone(str(raw.from_number));
  const toList = Array.isArray(raw.to_numbers) ? (raw.to_numbers as unknown[]).map(str) : [str(raw.to_number)];
  const to = normalisePhone(toList[0] ?? null);
  const contact = direction === "inbound" ? from : to;
  return {
    kind: "sms",
    externalId: id,
    direction,
    fromNumber: from,
    toNumber: to,
    contactNumber: contact,
    body: str(raw.text) ?? str(raw.body) ?? null,
    occurredAt: when(raw.created_date ?? raw.date_created ?? raw.created_at),
    threadId: str(raw.conversation_id) ?? contact,
    dialpadUserId: targetUserId(raw) ?? str(raw.sender_id),
  };
}

export function isSmsPayload(raw: Raw): boolean {
  return "text" in raw || "to_numbers" in raw || "message_status" in raw || raw.event_type === "sms";
}

// ---------------------------------------------------------------------------
// Pulling
// ---------------------------------------------------------------------------

type ListResponse = { items?: Raw[]; cursor?: string | null };

export async function listCalls(since: Date, max = 500): Promise<CallEvent[]> {
  const out: CallEvent[] = [];
  let cursor: string | undefined;
  do {
    const res = await get<ListResponse>("/call", { started_after: since.getTime(), limit: 100, cursor });
    if (!res) break;
    for (const raw of res.items ?? []) {
      const ev = normaliseCall(raw);
      if (ev) out.push(ev);
    }
    cursor = res.cursor ?? undefined;
  } while (cursor && out.length < max);
  return out.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** Dialpad exposes SMS listing on some plans only; a 404 is treated as "none". */
export async function listSms(since: Date, max = 500): Promise<SmsEvent[]> {
  const out: SmsEvent[] = [];
  let cursor: string | undefined;
  do {
    const res = await get<ListResponse>("/sms", { created_after: since.getTime(), limit: 100, cursor });
    if (!res) break;
    for (const raw of res.items ?? []) {
      const ev = normaliseSms(raw);
      if (ev) out.push(ev);
    }
    cursor = res.cursor ?? undefined;
  } while (cursor && out.length < max);
  return out.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export async function pullAll(db: AdminClient, since: Date): Promise<(CallEvent | SmsEvent)[]> {
  const { data } = await db.from("lane_sync_state").select("value").eq("key", "dialpad").maybeSingle();
  const v = data?.value as { last_sync?: string } | null;
  const last = v?.last_sync ? new Date(v.last_sync) : null;
  const from = last && last > since ? last : since;
  const overlap = new Date(from.getTime() - 5 * 60000);
  const [calls, sms] = await Promise.all([listCalls(overlap), listSms(overlap)]);
  await db.from("lane_sync_state").upsert({
    key: "dialpad",
    value: { last_sync: new Date().toISOString(), calls: calls.length, sms: sms.length },
    updated_at: new Date().toISOString(),
  });
  return [...calls, ...sms].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** Tap-to-call from the queue. Dialpad app first; plain tel: when it is not installed. */
export function clickToDialUrl(phone: string | null | undefined): { dialpad: string; tel: string } | null {
  const e164 = normalisePhone(phone);
  if (!e164) return null;
  return { dialpad: `dialpad://${e164}`, tel: `tel:${e164}` };
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Dialpad signs webhook bodies as an HS256 JWT with the subscription secret. */
export function verifyJwt(token: string, secret: string): Raw | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const headerJson = JSON.parse(Buffer.from(h.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Raw;
    if (headerJson.alg !== "HS256") return null;
    const expected = b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
    if (!safeEqual(expected, s)) return null;
    return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Raw;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 of the raw body in a signature header, hex or base64. */
export function verifyHmac(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const mac = createHmac("sha256", secret).update(body);
  const digest = mac.digest();
  const hex = digest.toString("hex");
  const b64 = digest.toString("base64");
  const given = signature.replace(/^sha256=/i, "").trim();
  return safeEqual(given, hex) || safeEqual(given, b64);
}

/**
 * Returns the verified payload, or null when the signature does not check
 * out. Without a secret configured, accepts the body outside production.
 */
export function verifyWebhook(rawBody: string, headers: Headers): Raw | null {
  const secret = process.env.DIALPAD_WEBHOOK_SECRET;
  const trimmed = rawBody.trim();
  const looksLikeJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
  if (!secret) {
    if (process.env.NODE_ENV === "production") return null;
    if (looksLikeJwt) {
      try {
        return JSON.parse(Buffer.from(trimmed.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Raw;
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(trimmed) as Raw;
    } catch {
      return null;
    }
  }
  if (looksLikeJwt) return verifyJwt(trimmed, secret);
  const sig = headers.get("x-dialpad-signature") ?? headers.get("x-signature") ?? headers.get("x-hub-signature-256");
  if (!verifyHmac(rawBody, sig, secret)) return null;
  try {
    return JSON.parse(trimmed) as Raw;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type SendSmsResult = { externalId?: string; threadId?: string };

/** Sends a text from the staff member's Dialpad line. */
export async function sendSms(db: AdminClient, staffId: string, phone: string, body: string): Promise<SendSmsResult> {
  const to = normalisePhone(phone);
  if (!to) throw new Error("That number doesn't look right");
  const { data: staff } = await db.from("lane_staff").select("dialpad_user_id").eq("id", staffId).maybeSingle();
  if (!staff?.dialpad_user_id) throw new Error("Your Dialpad line isn't linked yet");
  const res = await fetch(`${BASE}/sms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ user_id: staff.dialpad_user_id, to_numbers: [to], text: body, infer_country_code: false }),
  });
  if (!res.ok) throw new Error(`Dialpad sms failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as Raw;
  return { externalId: str(json.id) ?? undefined, threadId: to };
}
