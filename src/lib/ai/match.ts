/**
 * Does a later outbound email or call cover a promise we made?
 * Heuristic: token overlap between the commitment and the interaction.
 * With a key, the model confirms the borderline cases.
 */
import { z } from "zod";
import type { Commitment, Interaction } from "@/lib/domain/types";
import { structured } from "./client";

export type MatchResult = {
  matches: boolean;
  /** 0 to 1. */
  confidence: number;
};

/** At or above this the commitment closes on its own. */
export const MATCH_HIGH = 0.75;
/** At or above this (and below MATCH_HIGH) the PM gets one yes/no prompt. */
export const MATCH_MEDIUM = 0.4;

export type MatchInput = {
  commitment: Pick<Commitment, "text" | "made_at">;
  interaction: Pick<Interaction, "subject" | "body" | "transcript" | "ai_summary" | "occurred_at" | "channel" | "direction">;
};

const MatchSchema = z.object({
  covers: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export async function matchesCommitment(input: MatchInput): Promise<MatchResult> {
  const heuristic = heuristicMatch(input);
  // Clear cases do not need a model call.
  if (heuristic.confidence >= 0.9 || heuristic.confidence < 0.15) return heuristic;

  const ai = await structured(MatchSchema, {
    system: [
      "A property manager promised an owner something. Later, the manager sent the owner an email or had a call with them.",
      "Decide whether that later message actually delivers or completes the promise (not just mentions it).",
      "covers: true only if the promise is done by this message. confidence: 0 to 1.",
    ].join(" "),
    user: [
      `Promise (made ${input.commitment.made_at}): ${input.commitment.text}`,
      "",
      `Later ${input.interaction.channel} on ${input.interaction.occurred_at}:`,
      input.interaction.subject ? `Subject: ${input.interaction.subject}` : null,
      (input.interaction.transcript ?? input.interaction.body ?? input.interaction.ai_summary ?? "").slice(0, 6000),
    ]
      .filter((l) => l !== null)
      .join("\n"),
    maxTokens: 200,
  });
  if (!ai) return heuristic;
  const confidence = ai.covers ? Math.max(ai.confidence, heuristic.confidence * 0.5) : Math.min(1 - ai.confidence, heuristic.confidence);
  return { matches: confidence >= MATCH_HIGH, confidence: round(confidence) };
}

const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "to", "of", "for", "in", "on", "at", "by", "with", "about", "from", "as", "is", "are", "was", "were",
  "be", "been", "it", "its", "this", "that", "these", "those", "you", "your", "yours", "we", "our", "ours", "i", "me", "my", "he", "she", "they",
  "them", "their", "will", "would", "can", "could", "should", "just", "so", "if", "then", "than", "up", "out", "back", "over", "through",
  "get", "got", "let", "know", "please", "thanks", "thank", "hi", "hello", "regards", "cheers", "re", "fw", "fwd", "not", "do", "does", "did",
  "have", "has", "had", "here", "there", "also", "any", "some", "all", "very", "again", "into", "onto", "off", "when", "what", "which", "who",
]);

const SYNONYMS: Record<string, string> = {
  invoice: "invoice", invoices: "invoice", bill: "invoice", receipt: "invoice",
  quote: "quote", quotes: "quote", quotation: "quote", estimate: "quote", pricing: "quote",
  plumber: "plumber", plumbing: "plumber",
  electrician: "electrician", electrical: "electrician", sparky: "electrician",
  payout: "payout", payment: "payout", payouts: "payout", statement: "statement", statements: "statement",
  call: "call", ring: "call", phone: "call", called: "call", calling: "call",
  send: "send", sent: "send", sending: "send", email: "send", emailed: "send", forward: "send", forwarded: "send", attach: "send", attached: "send",
  book: "book", booked: "book", booking: "booking", bookings: "booking", reservation: "booking",
  clean: "clean", cleaner: "clean", cleaning: "clean",
  repair: "repair", repaired: "repair", fix: "repair", fixed: "repair", fixing: "repair",
  photo: "photo", photos: "photo", picture: "photo", pictures: "photo", images: "photo", image: "photo",
  update: "update", updated: "update", confirm: "confirm", confirmed: "confirm", confirmation: "confirm",
  chase: "chase", chased: "chase", follow: "chase",
  aircon: "aircon", "air-con": "aircon", airconditioner: "aircon", ac: "aircon",
};

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => SYNONYMS[t] ?? stem(t));
}

function stem(t: string): string {
  if (t.length <= 4) return t;
  return t.replace(/(ing|ed|es|s)$/g, "");
}

/** Share of the commitment's meaningful words that appear in the interaction. */
export function heuristicMatch(input: MatchInput): MatchResult {
  const madeAt = new Date(input.commitment.made_at).getTime();
  const at = new Date(input.interaction.occurred_at).getTime();
  if (input.interaction.direction !== "outbound" || at <= madeAt) return { matches: false, confidence: 0 };

  const want = Array.from(new Set(tokenise(input.commitment.text)));
  if (want.length === 0) return { matches: false, confidence: 0 };
  const haveText = [input.interaction.subject, input.interaction.body, input.interaction.transcript, input.interaction.ai_summary].filter(Boolean).join("\n");
  const have = new Set(tokenise(haveText));
  if (have.size === 0) return { matches: false, confidence: 0 };

  const hits = want.filter((w) => have.has(w)).length;
  let confidence = hits / want.length;
  // A bare verb match ("send") is not evidence; a noun match ("invoice") is.
  if (want.length >= 2 && hits === 1 && ["send", "call", "update", "confirm", "chase", "check"].includes(want.find((w) => have.has(w)) ?? "")) confidence *= 0.5;
  // Mentions of not-yet: "still waiting on the quote" should not close it.
  if (/\b(still waiting|haven'?t heard|no word yet|not yet|chasing|will (send|call|get|have)|once i|as soon as)\b/i.test(haveText)) confidence *= 0.6;
  confidence = round(Math.max(0, Math.min(1, confidence)));
  return { matches: confidence >= MATCH_HIGH, confidence };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
