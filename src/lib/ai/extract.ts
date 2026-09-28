/**
 * Pulls promises out of an outbound email or a call transcript:
 * "I'll send the invoice by Friday" -> { text: "Send the invoice", dueAt }.
 */
import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { TZ, endOfBusinessDay } from "@/lib/domain/time";
import { clip, structured } from "./client";

export type ExtractedCommitment = {
  /** Imperative, at most 80 characters, e.g. "Send the invoice". */
  text: string;
  dueAt: Date;
  /** 0 to 1. */
  confidence: number;
};

export type ExtractInput = {
  text: string;
  sentAt: Date;
  ownerName: string;
};

const ExtractSchema = z.object({
  commitments: z.array(
    z.object({
      text: z.string(),
      /** As the model saw it: "Friday", "tomorrow", "end of week", "next week", or an ISO date. */
      when: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export async function extractCommitments(input: ExtractInput): Promise<ExtractedCommitment[]> {
  const fallback = heuristicExtract(input);
  const ai = await structured(ExtractSchema, {
    system: [
      "You read an email or call transcript from a property manager to a property owner and list the concrete promises the manager made to the owner.",
      "A promise is something we said we would do: send, call, chase, book, check, confirm, organise. Ignore what the owner will do, pleasantries, and vague reassurance.",
      "text: an imperative of at most 80 characters, e.g. \"Send the invoice\", \"Call back with the plumber quote\". Do not include the timing in the text.",
      "when: the timing phrase exactly as written (\"Friday\", \"tomorrow\", \"end of week\", \"next week\", \"in two days\") or an ISO date, or null if none was given.",
      "confidence: 0 to 1, how sure you are this is a real promise.",
    ].join(" "),
    user: `Owner: ${input.ownerName}\nSent: ${input.sentAt.toISOString()}\n\n${input.text.slice(0, 8000)}`,
    maxTokens: 800,
  });
  if (!ai) return fallback;
  return ai.commitments
    .filter((c) => c.text.trim())
    .map((c) => ({
      text: toImperative(c.text),
      dueAt: resolveDueDate(c.when, input.sentAt),
      confidence: Math.max(0, Math.min(1, c.confidence)),
    }));
}

// ---------- date resolution (Australia/Brisbane) ----------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

function local(d: Date): TZDate {
  return new TZDate(d, TZ);
}

/** 6pm Brisbane on the calendar day `d` falls in (next business day if it is a weekend). */
function dueOnDay(d: TZDate): Date {
  return endOfBusinessDay(new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0, TZ));
}

function plusDays(d: TZDate, days: number): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + days, 12, 0, 0, 0, TZ);
}

/** Adds `n` business days (Mon to Fri) to the day `d` falls in. */
export function addBusinessDays(d: Date, n: number): Date {
  let cur = local(d);
  let left = n;
  while (left > 0) {
    cur = plusDays(cur, 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return dueOnDay(cur);
}

/** The default when a promise has no date: two business days out. */
export function defaultDueAt(sentAt: Date): Date {
  return addBusinessDays(sentAt, 2);
}

function weekdayIndex(word: string): number | null {
  const w = word.toLowerCase();
  const full = WEEKDAYS.indexOf(w);
  if (full >= 0) return full;
  return w in WEEKDAY_SHORT ? WEEKDAY_SHORT[w] : null;
}

/** Next occurrence of `weekday` on or after `from`; `next` forces the following week. */
function nextWeekday(from: TZDate, weekday: number, next: boolean): TZDate {
  let diff = (weekday - from.getDay() + 7) % 7;
  if (next) {
    // "next Friday": the Friday of next week, even when said on a Thursday.
    const daysToNextMonday = ((1 - from.getDay() + 7) % 7) || 7;
    return plusDays(from, daysToNextMonday + ((weekday + 6) % 7));
  }
  if (diff === 0 && from.getHours() >= 18) diff = 7;
  return plusDays(from, diff);
}

/**
 * Resolves a timing phrase relative to `sentAt` in Brisbane time. Unknown or
 * empty phrases fall back to two business days out.
 */
export function resolveDueDate(phrase: string | null | undefined, sentAt: Date): Date {
  const base = local(sentAt);
  const p = (phrase ?? "").toLowerCase().replace(/[^a-z0-9:\-\s/]/g, " ").replace(/\s+/g, " ").trim();
  if (!p) return defaultDueAt(sentAt);

  // ISO date or date-time.
  const iso = p.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new TZDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0, TZ);
    return dueOnDay(d);
  }
  // "12/10" or "12/10/2026" (day/month, Australian order).
  const dm = p.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : base.getFullYear();
    let d = new TZDate(year, Number(dm[2]) - 1, Number(dm[1]), 12, 0, 0, 0, TZ);
    if (!dm[3] && d.getTime() < base.getTime() - 86_400_000) d = new TZDate(year + 1, Number(dm[2]) - 1, Number(dm[1]), 12, 0, 0, 0, TZ);
    return dueOnDay(d);
  }

  if (/\b(today|this (morning|afternoon|arvo|evening)|later today|tonight|shortly|asap|right away|straight away|within the hour|in an hour|this morning)\b/.test(p)) {
    return dueOnDay(base);
  }
  if (/\b(tomorrow|tmrw|tmr)\b/.test(p)) return dueOnDay(plusDays(base, 1));
  if (/\b(day after tomorrow)\b/.test(p)) return dueOnDay(plusDays(base, 2));
  if (/\b(end of (the )?(week|this week)|eow|by (the )?week'?s end|later (this|in the) week|this week|before the weekend)\b/.test(p)) {
    const friday = nextWeekday(base, 5, false);
    // Said on a weekend: "this week" means the coming Friday.
    return dueOnDay(friday);
  }
  if (/\b(early next week|start of next week|monday next week)\b/.test(p)) return dueOnDay(nextWeekday(base, 1, true));
  if (/\b(next week|following week|in a week|within a week|in one week|in 1 week|a week from now|a week or so|next few days)\b/.test(p)) {
    if (/\b(in a week|within a week|in one week|in 1 week|a week from now|a week or so)\b/.test(p)) return dueOnDay(plusDays(base, 7));
    if (/\b(next few days)\b/.test(p)) return addBusinessDays(sentAt, 3);
    return dueOnDay(nextWeekday(base, 5, true));
  }
  if (/\b(end of (the )?month|eom)\b/.test(p)) {
    const last = new TZDate(base.getFullYear(), base.getMonth() + 1, 0, 12, 0, 0, 0, TZ);
    return dueOnDay(last);
  }
  if (/\b(next month)\b/.test(p)) {
    const d = new TZDate(base.getFullYear(), base.getMonth() + 1, Math.min(base.getDate(), 28), 12, 0, 0, 0, TZ);
    return dueOnDay(d);
  }
  if (/\b(in a fortnight|in two weeks|in 2 weeks|within two weeks|within 2 weeks|fortnight)\b/.test(p)) return dueOnDay(plusDays(base, 14));

  const inDays = p.match(/\b(?:in|within) (\d+|a|an|one|two|three|four|five|six|seven|couple of|few) (business |working )?days?\b/);
  if (inDays) {
    const n = wordToNumber(inDays[1]);
    if (inDays[2]) return addBusinessDays(sentAt, n);
    return dueOnDay(plusDays(base, n));
  }
  const inHours = p.match(/\b(?:in|within) (\d+|a|an|one|two|three|four|five|six|couple of|few) hours?\b/);
  if (inHours) return dueOnDay(base);

  const next = p.match(/\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
  if (next) {
    const idx = weekdayIndex(next[1]);
    if (idx !== null) return dueOnDay(nextWeekday(base, idx, true));
  }
  const day = p.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
  if (day) {
    const idx = weekdayIndex(day[1]);
    if (idx !== null) return dueOnDay(nextWeekday(base, idx, false));
  }
  return defaultDueAt(sentAt);
}

function wordToNumber(w: string): number {
  const map: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, "couple of": 2, few: 3 };
  if (w in map) return map[w];
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 2;
}

// ---------- heuristic extraction ----------

// The clause stops at the end of the sentence or at the next promise marker, so
// "I'll send X and we'll chase Y" yields two follow-ups.
const PROMISE_RE =
  /\b(i['’]ll|i will|we['’]ll|we will|i['’]m going to|we['’]re going to|i am going to|we are going to|let me|i can|i['’]ll be sure to|i will be sure to|i['’]ll make sure to|leave it with me and i['’]ll)\s+((?:(?!\b(?:i['’]ll|i will|we['’]ll|we will|i['’]m going to|we['’]re going to)\b)[^.!?\n])+)/gi;

const TIME_RE =
  /\b(by |before |on |for |until |till |at )?(today|tonight|tomorrow|tmrw|tmr|day after tomorrow|this (morning|afternoon|arvo|evening)|later today|later (this|in the) week|shortly|asap|right away|straight away|end of (the )?(week|this week|month)|eow|eom|before the weekend|this week|early next week|start of next week|next (week|month|few days|sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|tues|wed|thu|thur|thurs|fri|sat)|in a fortnight|(in|within) (a|an|one|two|three|four|five|six|seven|couple of|few|\d+) (business |working )?(days?|hours?|weeks?)|a week from now|(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|tues|wed|thu|thur|thurs|fri|sat)( morning| afternoon| arvo)?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/i;

const NOT_A_PROMISE = /\b(if you|should you|would you|could you|can you|please|would like you|you['’]ll|you will|you can)\b/i;
const CLOSERS = /\b(let me know|be in touch|keep you posted|keep you updated|get back to you|come back to you)\b/i;

/** Regex extraction used when there is no API key or the call fails. */
export function heuristicExtract(input: ExtractInput): ExtractedCommitment[] {
  const out: ExtractedCommitment[] = [];
  const seen = new Set<string>();
  const source = stripQuotedAndSignature(input.text);
  for (const sentence of splitSentences(source)) {
    if (/^\s*>/.test(sentence)) continue;
    PROMISE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROMISE_RE.exec(sentence))) {
      const raw = m[2].trim();
      if (!raw || NOT_A_PROMISE.test(raw.slice(0, 40))) continue;
      const time = raw.match(TIME_RE);
      const phrase = time ? time[0] : null;
      const action = toImperative(phrase ? raw.replace(phrase, " ") : raw);
      if (action.length < 6) continue;
      const key = action.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const vague = CLOSERS.test(action);
      const confidence = Math.min(0.95, (vague ? 0.4 : 0.6) + (phrase ? 0.25 : 0) + (/\b(send|call|email|chase|book|organise|organize|arrange|confirm|check|follow up|get|post|forward|ring|update|pay|transfer|fix|look into|find out)\b/i.test(action) ? 0.1 : 0));
      out.push({ text: action, dueAt: resolveDueDate(phrase?.replace(/^(by|before|on|for|until|till|at)\s+/i, ""), input.sentAt), confidence });
    }
  }
  return out;
}

/** "send you the invoice, and" -> "Send the invoice". */
export function toImperative(raw: string): string {
  let s = raw
    .replace(/^\s*(i['’]ll|i will|we['’]ll|we will|i['’]m going to|we['’]re going to|i am going to|we are going to|let me|i can)\s+/i, "")
    .replace(/^\s*(also|just|definitely|certainly|absolutely|then|now|be sure to|make sure to|make sure i|try to|try and|aim to|endeavour to|endeavor to)\s+/i, "")
    .replace(/\s+(so|and|but|then|as|once|when|after|which|so that)\s+[^,]*$/i, (m) => (m.length > 40 ? "" : m))
    .replace(/,\s*(so|and|but|then)\b.*$/i, "")
    .replace(/\s+(for you|to you)\b/gi, "")
    .replace(/^(\w+)\s+you\s+(a|an|the|that|those|these|some|our|my|your|his|her|their)\b/i, "$1 $2")
    .replace(/^(\w+)\s+you\s+(back|through|over|up|out|a copy)\b/i, "$1 $2")
    .replace(/\s+(you|yourself)\s*$/i, "")
    .replace(/[\s,;:\-]+(and|or|but|then|so|as|which)\s*$/i, "")
    .replace(/[\s,;:\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^(\w)/, (c) => c.toUpperCase());
  return clip(s, 80).replace(/…$/, "");
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripQuotedAndSignature(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*$|^_{3,}\s*$|^From:\s/i.test(line.trim())) break;
    if (line.trim().startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n");
}
