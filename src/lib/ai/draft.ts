/**
 * Drafts in Lane's tone: a reply to an owner, and the honest update that
 * goes out when a follow-up ran late.
 */
import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import type { Commitment, Interaction, Loop, Owner, Property } from "@/lib/domain/types";
import { TZ } from "@/lib/domain/time";
import { firstName, structured } from "./client";
import { renderThread } from "./summarise";

export type DraftReplyInput = {
  owner: Pick<Owner, "name">;
  loop: Pick<Loop, "type" | "summary" | "opened_at"> | null;
  thread: Interaction[];
  pmName: string;
  property?: Pick<Property, "name"> | null;
  openCommitments?: Pick<Commitment, "text" | "due_at">[];
};

const DraftSchema = z.object({ body: z.string() });

/** A reply to the owner, honest and specific, signed with the PM's first name. */
export async function draftReply(input: DraftReplyInput): Promise<string> {
  const fallback = heuristicReply(input);
  const lastInbound = [...input.thread]
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .find((i) => i.direction === "inbound");
  if (!lastInbound && input.loop?.type !== "missed_call" && input.loop?.type !== "maintenance") return fallback;

  const ai = await structured(DraftSchema, {
    system: [
      `You are ${input.pmName}, a property manager at Lane, replying to an owner.`,
      "Write the email body only, no subject line. Open with the owner's first name.",
      "Answer what they actually asked. If we do not know something yet, say what we will do and when.",
      "Keep it under 150 words. Do not invent facts, prices, dates or names that are not in the thread.",
      `Sign off with a short line and then "${firstName(input.pmName)}" on its own line.`,
    ].join(" "),
    user: [
      `Owner: ${input.owner.name}`,
      input.property?.name ? `Property: ${input.property.name}` : null,
      input.loop ? `Why the owner is waiting: ${input.loop.type}${input.loop.summary ? ` — ${input.loop.summary}` : ""}` : null,
      input.openCommitments?.length
        ? `Follow-ups we already owe this owner:\n${input.openCommitments.map((c) => `- ${c.text} by ${fmtDay(c.due_at)}`).join("\n")}`
        : null,
      "",
      "Thread (oldest first):",
      renderThread(input.thread) || "(no messages; this loop came from a call or an issue)",
    ]
      .filter((l) => l !== null)
      .join("\n"),
    maxTokens: 700,
  });
  return ai?.body?.trim() || fallback;
}

export type HonestUpdateInput = {
  owner: Pick<Owner, "name">;
  commitment: Pick<Commitment, "text" | "due_at">;
  pmName: string;
  newDueAt: Date;
};

/** "We said Friday, it did not happen, here is the new date." */
export async function draftHonestUpdate(input: HonestUpdateInput): Promise<string> {
  const fallback = heuristicHonestUpdate(input);
  const ai = await structured(DraftSchema, {
    system: [
      `You are ${input.pmName}, a property manager at Lane, writing to an owner about a follow-up that ran late.`,
      "Write the email body only. Open with the owner's first name. Say plainly what we said we would do and by when, that it has not happened yet,",
      "and give the new date. No excuses, no over-apologising, one short sorry at most. Under 90 words.",
      `Sign off with "${firstName(input.pmName)}" on its own line.`,
    ].join(" "),
    user: [
      `Owner: ${input.owner.name}`,
      `What we promised: ${input.commitment.text}`,
      `Original date: ${fmtDay(input.commitment.due_at)}`,
      `New date: ${fmtDay(input.newDueAt)}`,
    ].join("\n"),
    maxTokens: 400,
  });
  return ai?.body?.trim() || fallback;
}

// ---------- heuristics ----------

export function heuristicReply(input: DraftReplyInput): string {
  const owner = firstName(input.owner.name) || "there";
  const pm = firstName(input.pmName);
  const property = input.property?.name ? ` at ${input.property.name}` : "";
  const lastInbound = [...input.thread]
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .find((i) => i.direction === "inbound");
  const topic = input.loop?.summary ?? lastInbound?.ai_summary ?? null;

  const lines: string[] = [`Hi ${owner},`, ""];
  switch (input.loop?.type) {
    case "missed_call":
      lines.push(`Sorry I missed your call${property ? ` about the place${property}` : ""}. I will try you again shortly, or reply here with a good time and I will call then.`);
      break;
    case "maintenance":
      lines.push(`A quick note to let you know about a maintenance item${property}. ${topic ? `${topic}. ` : ""}We are on it and I will tell you the outcome as soon as the trade has been through.`);
      break;
    case "detractor":
      lines.push(`Thank you for the honest feedback. I would like to hear more about what has not worked, and put it right. Can I call you this week?`);
      break;
    case "sms":
      lines.push(`Thanks for your message${property}. ${topic ? `${topic}. ` : ""}I will come back to you with an answer today.`);
      break;
    default:
      lines.push(`Thanks for your email${property}.`);
      if (topic) lines.push("", `${topic}. I will come back to you with a proper answer today, and if it needs more time I will say when.`);
      else lines.push("", "I will come back to you with a proper answer today, and if it needs more time I will say when.");
  }
  if (input.openCommitments?.length) {
    lines.push("", `I also still owe you: ${input.openCommitments.map((c) => `${lowerFirst(c.text)} by ${fmtDay(c.due_at)}`).join("; ")}.`);
  }
  lines.push("", "Thanks,", pm);
  return lines.join("\n");
}

export function heuristicHonestUpdate(input: HonestUpdateInput): string {
  const owner = firstName(input.owner.name) || "there";
  const pm = firstName(input.pmName);
  return [
    `Hi ${owner},`,
    "",
    `I said I would ${lowerFirst(input.commitment.text)} by ${fmtDay(input.commitment.due_at)}, and that has not happened yet. Sorry for the wait.`,
    "",
    `The new date is ${fmtDay(input.newDueAt)}. I will confirm with you as soon as it is done.`,
    "",
    "Thanks,",
    pm,
  ].join("\n");
}

function fmtDay(d: string | Date): string {
  const date = new TZDate(typeof d === "string" ? new Date(d) : d, TZ);
  return date.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
