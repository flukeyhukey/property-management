/**
 * Summaries for Owner 360: a thread in at most three sentences, and the
 * last 30 days for an owner in a short paragraph.
 */
import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { CHANNEL_LABEL, type Commitment, type Interaction, type Loop, type Owner } from "@/lib/domain/types";
import { TZ } from "@/lib/domain/time";
import { clip, structured } from "./client";

const ThreadSummarySchema = z.object({ summary: z.string() });

/** Summarises a thread of interactions in at most three sentences. */
export async function summariseThread(interactions: Interaction[]): Promise<string> {
  const sorted = byTime(interactions);
  if (sorted.length === 0) return "No messages yet.";
  const fallback = heuristicThreadSummary(sorted);
  const ai = await structured(ThreadSummarySchema, {
    system:
      "Summarise this conversation between a property owner and their property manager in at most three sentences. " +
      "Say what the owner wanted, what we did, and what is still open. Refer to the owner by first name and to Lane as \"we\".",
    user: renderThread(sorted),
    maxTokens: 400,
  });
  return ai?.summary ? limitSentences(ai.summary.trim(), 3) : fallback;
}

const MonthSummarySchema = z.object({ summary: z.string() });

/** One short paragraph on the last 30 days: contact, waits, promises, mood. */
export async function summariseLast30Days(
  owner: Pick<Owner, "name" | "health" | "health_reason">,
  interactions: Interaction[],
  loops: Loop[],
  commitments: Commitment[],
): Promise<string> {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = byTime(interactions.filter((i) => new Date(i.occurred_at).getTime() >= since));
  const recentLoops = loops.filter((l) => new Date(l.opened_at).getTime() >= since);
  const recentCommitments = commitments.filter((c) => new Date(c.made_at).getTime() >= since);
  const fallback = heuristicMonthSummary(owner, recent, recentLoops, recentCommitments);
  if (recent.length === 0 && recentLoops.length === 0 && recentCommitments.length === 0) return fallback;

  const ai = await structured(MonthSummarySchema, {
    system:
      "Write one short paragraph (at most four sentences) for a property manager about the last 30 days with this owner. " +
      "Cover how often we spoke, what the owner asked for, whether they waited long, which follow-ups we kept or still owe, and their mood. " +
      "Plain, kind words. Refer to the owner by first name and to Lane as \"we\".",
    user: [
      `Owner: ${owner.name}. Health: ${owner.health}${owner.health_reason ? ` (${owner.health_reason})` : ""}.`,
      "",
      "Interactions:",
      renderThread(recent) || "(none)",
      "",
      "Loops (things the owner was waiting on):",
      recentLoops.map(renderLoop).join("\n") || "(none)",
      "",
      "Follow-ups (promises we made):",
      recentCommitments.map(renderCommitment).join("\n") || "(none)",
    ].join("\n"),
    maxTokens: 500,
  });
  return ai?.summary ? limitSentences(ai.summary.trim(), 4) : fallback;
}

// ---------- heuristics ----------

export function heuristicThreadSummary(interactions: Interaction[]): string {
  const sorted = byTime(interactions);
  const first = sorted[0];
  const lastInbound = [...sorted].reverse().find((i) => i.direction === "inbound");
  const lastOutbound = [...sorted].reverse().find((i) => i.direction === "outbound");
  const parts: string[] = [];

  const opener = lastInbound?.ai_summary ?? first.ai_summary ?? first.subject ?? null;
  parts.push(opener ? `The owner ${lowerFirst(opener.replace(/\.$/, ""))}.` : `The thread started with ${describe(first)}.`);

  const inbound = sorted.filter((i) => i.direction === "inbound").length;
  const outbound = sorted.filter((i) => i.direction === "outbound").length;
  parts.push(`${sorted.length === 1 ? "One message" : `${sorted.length} messages`} so far, ${inbound} from the owner and ${outbound} from us.`);

  if (lastOutbound && lastInbound && new Date(lastOutbound.occurred_at) > new Date(lastInbound.occurred_at)) {
    parts.push(`We last replied ${when(lastOutbound.occurred_at)}, so the ball is with the owner.`);
  } else if (lastInbound) {
    parts.push(`The owner wrote last, ${when(lastInbound.occurred_at)}, and is waiting on us.`);
  }
  return parts.slice(0, 3).join(" ");
}

export function heuristicMonthSummary(
  owner: Pick<Owner, "name">,
  interactions: Interaction[],
  loops: Loop[],
  commitments: Commitment[],
): string {
  const first = owner.name.trim().split(/\s+/)[0] || "The owner";
  if (interactions.length === 0 && loops.length === 0 && commitments.length === 0) {
    return `Nothing from ${first} in the last 30 days and nothing outstanding on our side.`;
  }
  const parts: string[] = [];
  const inbound = interactions.filter((i) => i.direction === "inbound");
  const outbound = interactions.filter((i) => i.direction === "outbound");
  const calls = interactions.filter((i) => i.channel === "call").length;
  const emails = interactions.filter((i) => i.channel === "email").length;
  const touch = [emails ? plural(emails, "email") : null, calls ? plural(calls, "call") : null].filter(Boolean).join(" and ");
  parts.push(
    interactions.length
      ? `${first} was in touch ${plural(inbound.length, "time")} and we reached out ${plural(outbound.length, "time")}${touch ? ` (${touch})` : ""}.`
      : `No messages either way with ${first} this month.`,
  );

  const topics = uniq(inbound.map((i) => i.ai_intent).filter((x): x is NonNullable<typeof x> => Boolean(x)));
  if (topics.length) parts.push(`Mostly about ${topics.map(topicWord).join(" and ")}.`);

  const openLoops = loops.filter((l) => l.status === "open");
  const closedLoops = loops.filter((l) => l.status === "closed");
  if (openLoops.length) parts.push(`${first} is waiting on ${plural(openLoops.length, "reply")} right now.`);
  else if (closedLoops.length) parts.push(`Every question got answered (${plural(closedLoops.length, "reply")}).`);

  const kept = commitments.filter((c) => c.status === "kept").length;
  const missed = commitments.filter((c) => c.status === "missed").length;
  const open = commitments.filter((c) => c.status === "open").length;
  if (kept || missed || open) {
    const bits = [kept ? `${kept} kept` : null, open ? `${open} still to do` : null, missed ? `${missed} ran late` : null].filter(Boolean);
    parts.push(`Follow-ups: ${bits.join(", ")}.`);
  }

  const churn = inbound.some((i) => i.churn_flag);
  const sentiment = average(inbound.map((i) => i.ai_sentiment).filter((s): s is number => typeof s === "number"));
  if (churn) parts.push(`${first} has hinted at looking elsewhere, so a call would be worth it.`);
  else if (sentiment !== null && sentiment < -0.3) parts.push(`The tone has been frustrated lately.`);
  else if (sentiment !== null && sentiment > 0.3) parts.push(`The tone has been warm.`);

  return parts.slice(0, 4).join(" ");
}

// ---------- rendering helpers ----------

export function renderThread(interactions: Interaction[]): string {
  return byTime(interactions)
    .map((i) => {
      const who = i.direction === "inbound" ? "Owner" : i.direction === "outbound" ? "Lane" : "Note";
      const body = (i.transcript ?? i.body ?? i.ai_summary ?? "").replace(/\s+/g, " ").trim();
      const subject = i.subject ? ` "${i.subject}"` : "";
      return `[${fmt(i.occurred_at)}] ${who} (${CHANNEL_LABEL[i.channel].toLowerCase()})${subject}: ${clip(body, 1200)}`;
    })
    .join("\n");
}

function renderLoop(l: Loop): string {
  return `- ${l.type} opened ${fmt(l.opened_at)}, ${l.status}${l.closed_at ? ` ${fmt(l.closed_at)}` : ""}${l.summary ? `: ${l.summary}` : ""}`;
}

function renderCommitment(c: Commitment): string {
  return `- "${c.text}" due ${fmt(c.due_at)}, ${c.status === "missed" ? "ran late" : c.status}`;
}

function byTime(list: Interaction[]): Interaction[] {
  return [...list].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

function fmt(iso: string): string {
  const d = new TZDate(new Date(iso), TZ);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: TZ });
}

function when(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${fmt(iso)}`;
}

function describe(i: Interaction): string {
  return i.direction === "inbound" ? `a ${CHANNEL_LABEL[i.channel].toLowerCase()} from the owner` : `a ${CHANNEL_LABEL[i.channel].toLowerCase()} from us`;
}

function topicWord(intent: NonNullable<Interaction["ai_intent"]>): string {
  switch (intent) {
    case "payout":
      return "payouts";
    case "maintenance":
      return "repairs";
    case "complaint":
      return "how things went";
    case "booking":
      return "bookings";
    case "churn_risk":
      return "whether to stay with us";
    default:
      return "general questions";
  }
}

function plural(n: number, word: string): string {
  if (word === "reply") return n === 1 ? "1 reply" : `${n} replies`;
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function average(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function limitSentences(text: string, max: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, max).join(" ");
}
