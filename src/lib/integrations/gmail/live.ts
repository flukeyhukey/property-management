/**
 * Gmail, live. One connection per staff member: the refresh token they
 * granted from Settings lives on lane_staff.gmail_refresh_token. Reading
 * uses messages.list since the last sync; replies go out through
 * messages.send in the original thread.
 */
import { google, type gmail_v1 } from "googleapis";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Staff } from "@/lib/domain/types";
import { normaliseEmail } from "@/lib/domain/match";
import type { InboundEmail, OutboundEmail } from "../types";

export type EmailEvent = InboundEmail | OutboundEmail;

export type SendReplyInput = {
  threadId?: string | null;
  to: string;
  subject: string;
  body: string;
  /** The Message-ID header of the email being replied to. */
  inReplyToMessageId?: string | null;
};

export type SendResult = { messageId: string; threadId: string; messageIdHeader: string | null };

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function gmailRedirectUri(origin: string) {
  return `${origin}/api/integrations/gmail/callback`;
}

export function oauthClient(redirectUri?: string) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set");
  return new google.auth.OAuth2(id, secret, redirectUri);
}

function clientFor(refreshToken: string): gmail_v1.Gmail {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type Header = { name?: string | null; value?: string | null };

export function header(headers: Header[] | undefined, name: string): string | null {
  const h = headers?.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

export function splitAddresses(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => normaliseEmail(v))
    .filter((v): v is string => Boolean(v));
}

/** Auto-replies never open or close a loop. */
export function isAutoReply(headers: Header[] | undefined, subject: string | null): boolean {
  const auto = (header(headers, "Auto-Submitted") ?? "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (header(headers, "X-Autoreply") || header(headers, "X-Autorespond") || header(headers, "X-Auto-Response-Suppress")) return true;
  const precedence = (header(headers, "Precedence") ?? "").toLowerCase();
  if (precedence === "bulk" || precedence === "auto_reply" || precedence === "junk") return true;
  const s = (subject ?? "").toLowerCase();
  return /^(automatic reply|auto-reply|autoreply|out of office|ooo:)/.test(s) || s.includes("automatic reply") || s.includes("out of office");
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text from a message payload: text/plain first, stripped HTML otherwise. */
export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!payload) return null;
  let plain: string | null = null;
  let html: string | null = null;
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const mime = part.mimeType ?? "";
    const data = part.body?.data;
    if (data && mime === "text/plain" && plain === null) plain = decodeBase64Url(data);
    else if (data && mime === "text/html" && html === null) html = decodeBase64Url(data);
    for (const p of part.parts ?? []) walk(p);
  };
  walk(payload);
  const text: string | null = plain ?? (html ? stripHtml(html) : null);
  return text ? trimQuotedReply(text) : null;
}

/** Drops the quoted history under "On ... wrote:" so the body is what was actually said. */
export function trimQuotedReply(text: string): string {
  const idx = text.search(/\n\s*On .{5,120} wrote:\s*\n/);
  const cut = idx > 0 ? text.slice(0, idx) : text;
  return cut
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n")
    .trim();
}

export function toEvent(message: gmail_v1.Schema$Message, staff: Pick<Staff, "id" | "email">): EmailEvent | null {
  if (!message.id || !message.threadId) return null;
  if ((message.labelIds ?? []).includes("DRAFT")) return null;
  const headers = message.payload?.headers ?? undefined;
  const from = normaliseEmail(header(headers, "From"));
  if (!from) return null;
  const subject = header(headers, "Subject");
  const dateHeader = header(headers, "Date");
  const occurredAt = message.internalDate ? new Date(Number(message.internalDate)) : dateHeader ? new Date(dateHeader) : new Date();
  const base = {
    kind: "email" as const,
    externalId: message.id,
    threadId: message.threadId,
    messageIdHeader: header(headers, "Message-ID"),
    from,
    to: splitAddresses(header(headers, "To")),
    cc: splitAddresses(header(headers, "Cc")),
    subject,
    body: extractBody(message.payload ?? undefined),
    occurredAt,
    isAutoReply: isAutoReply(headers, subject),
    staffId: staff.id,
    staffEmail: staff.email,
  };
  const outbound = from === staff.email.toLowerCase() || (message.labelIds ?? []).includes("SENT");
  return outbound ? { ...base, direction: "outbound" } : { ...base, direction: "inbound" };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listSince(staff: Staff, since: Date, max = 200): Promise<EmailEvent[]> {
  if (!staff.gmail_refresh_token) return [];
  const gmail = clientFor(staff.gmail_refresh_token);
  const q = `after:${Math.floor(since.getTime() / 1000)} -in:chats -in:spam -in:trash`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({ userId: "me", q, maxResults: Math.min(100, max - ids.length), pageToken });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < max);

  const events: EmailEvent[] = [];
  for (const id of ids) {
    const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const ev = toEvent(res.data, staff);
    if (ev && ev.occurredAt >= since) events.push(ev);
  }
  return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

export async function readSyncState(db: AdminClient, key: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("lane_sync_state").select("value").eq("key", key).maybeSingle();
  const v = data?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function writeSyncState(db: AdminClient, key: string, value: Record<string, unknown>) {
  await db.from("lane_sync_state").upsert({ key, value: value as never, updated_at: new Date().toISOString() });
}

/** Every staff member with a connected inbox, since their own last sync. */
export async function pullAll(db: AdminClient, since: Date): Promise<EmailEvent[]> {
  const { data: staff } = await db.from("lane_staff").select("*").eq("is_active", true).not("gmail_refresh_token", "is", null);
  const all: EmailEvent[] = [];
  for (const s of staff ?? []) {
    const key = `gmail:${s.id}`;
    const state = await readSyncState(db, key);
    const last = typeof state.last_sync === "string" ? new Date(state.last_sync) : null;
    const from = last && last > since ? last : since;
    const events = await listSince(s, new Date(from.getTime() - 60000));
    all.push(...events);
    await writeSyncState(db, key, { last_sync: new Date().toISOString(), pulled: events.length });
  }
  return all;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function encodeSubject(subject: string) {
  return /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export function buildRawMessage(from: string, input: SendReplyInput, messageIdHeader: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    `Message-ID: ${messageIdHeader}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyToMessageId) {
    lines.push(`In-Reply-To: ${input.inReplyToMessageId}`);
    lines.push(`References: ${input.inReplyToMessageId}`);
  }
  const raw = `${lines.join("\r\n")}\r\n\r\n${input.body}`;
  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendReply(db: AdminClient, staffId: string, input: SendReplyInput): Promise<SendResult> {
  const { data: staff } = await db.from("lane_staff").select("*").eq("id", staffId).maybeSingle();
  if (!staff?.gmail_refresh_token) throw new Error("This inbox is not connected to Gmail yet");
  const gmail = clientFor(staff.gmail_refresh_token);
  const messageIdHeader = `<${crypto.randomUUID()}@laneproperty.com.au>`;
  const raw = buildRawMessage(staff.email, input, messageIdHeader);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: input.threadId ?? undefined },
  });
  if (!res.data.id || !res.data.threadId) throw new Error("Gmail did not return a message id");
  return { messageId: res.data.id, threadId: res.data.threadId, messageIdHeader };
}

/** Exchange the OAuth code for tokens and keep the refresh token on the staff row. */
export async function storeRefreshToken(db: AdminClient, staffId: string, code: string, redirectUri: string) {
  const auth = oauthClient(redirectUri);
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the app's access at myaccount.google.com and connect again.");
  }
  await db.from("lane_staff").update({ gmail_refresh_token: tokens.refresh_token }).eq("id", staffId);
}
