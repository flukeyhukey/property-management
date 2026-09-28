/**
 * Classifies an inbound owner message: what they want, how urgent it is,
 * a one-line summary in kind words, sentiment and churn language.
 */
import { z } from "zod";
import { CHURN_PHRASES, type Intent, type Urgency } from "@/lib/domain/types";
import { clip, structured } from "./client";

export type Classification = {
  intent: Intent;
  urgency: Urgency;
  /** One line, at most 90 characters, what the owner wants, in kind words. */
  summary: string;
  /** -1 (upset) to 1 (pleased). */
  sentiment: number;
  churnFlag: boolean;
};

const INTENTS = ["payout", "maintenance", "complaint", "general", "churn_risk", "booking"] as const;
const URGENCIES = ["low", "normal", "high"] as const;

const ClassificationSchema = z.object({
  intent: z.enum(INTENTS),
  urgency: z.enum(URGENCIES),
  summary: z.string(),
  sentiment: z.number().min(-1).max(1),
  churnFlag: z.boolean(),
});

const SYSTEM = [
  "You read an email or message from a property owner to their property manager and classify it.",
  "intent: payout (money, statements, invoices, fees), maintenance (repairs, damage, cleaning, trades),",
  "complaint (unhappy about service or an outcome), booking (guests, reservations, calendar, pricing),",
  "churn_risk (talking about leaving, other agencies, cancelling), general (anything else).",
  "urgency: high when the owner is waiting on something today or is upset, low when it is FYI only, else normal.",
  "summary: one line of at most 90 characters saying what the owner wants, in kind words, e.g. \"Wants to know when the July payout lands\".",
  "sentiment: -1 to 1. churnFlag: true when the owner hints at leaving or comparing agencies.",
].join(" ");

export async function classifyInbound(text: string, subject?: string | null): Promise<Classification> {
  const fallback = heuristicClassify(text, subject);
  const ai = await structured(ClassificationSchema, {
    system: SYSTEM,
    user: `Subject: ${subject ?? "(none)"}\n\nMessage:\n${text.slice(0, 6000)}`,
    maxTokens: 400,
  });
  if (!ai) return fallback;
  return {
    intent: ai.intent,
    urgency: ai.urgency,
    summary: clip(ai.summary, 90) || fallback.summary,
    sentiment: Math.max(-1, Math.min(1, ai.sentiment)),
    // Keep the phrase list as a floor: if the words are there, the flag is on.
    churnFlag: ai.churnFlag || fallback.churnFlag,
  };
}

const KEYWORDS: Record<Exclude<Intent, "general">, string[]> = {
  payout: ["payout", "pay out", "payment", "statement", "invoice", "owner statement", "remittance", "fees", "commission", "money", "transfer", "paid", "bank"],
  maintenance: ["repair", "broken", "leak", "plumber", "electrician", "maintenance", "damage", "fix", "not working", "aircon", "air con", "hot water", "clean", "mould", "mold", "pool", "gate", "lock", "quote", "tradie", "trade"],
  complaint: ["disappointed", "unacceptable", "frustrated", "not happy", "unhappy", "complain", "poor", "still waiting", "no one", "nobody", "again", "ignored", "no response", "haven't heard"],
  booking: ["booking", "reservation", "guest", "calendar", "block out", "availability", "nightly rate", "pricing", "occupancy", "check in", "check-in", "check out", "airbnb", "stay"],
  churn_risk: CHURN_PHRASES,
};

const URGENT_WORDS = ["urgent", "asap", "immediately", "today", "right away", "straight away", "emergency", "now", "this morning", "this afternoon"];
const POSITIVE_WORDS = ["thanks", "thank you", "great", "appreciate", "happy", "wonderful", "lovely", "pleased", "perfect", "excellent", "cheers", "good job", "well done"];
const NEGATIVE_WORDS = ["disappointed", "unacceptable", "frustrated", "not happy", "unhappy", "angry", "poor", "terrible", "worst", "ridiculous", "still waiting", "ignored", "no response", "cancel", "leave", "unprofessional"];

function countHits(haystack: string, words: string[]): number {
  return words.reduce((n, w) => n + (haystack.includes(w) ? 1 : 0), 0);
}

/** Keyword classifier used when there is no API key or the call fails. */
export function heuristicClassify(text: string, subject?: string | null): Classification {
  const hay = `${subject ?? ""}\n${text}`.toLowerCase();
  const churnFlag = CHURN_PHRASES.some((p) => hay.includes(p));

  let intent: Intent = "general";
  let best = 0;
  for (const key of ["maintenance", "payout", "booking", "complaint"] as const) {
    const hits = countHits(hay, KEYWORDS[key]);
    if (hits > best) {
      best = hits;
      intent = key;
    }
  }
  if (churnFlag && countHits(hay, KEYWORDS.churn_risk) >= Math.max(1, best)) intent = "churn_risk";

  const negatives = countHits(hay, NEGATIVE_WORDS);
  const positives = countHits(hay, POSITIVE_WORDS);
  const raw = (positives - negatives) / Math.max(2, positives + negatives);
  const sentiment = Math.round(Math.max(-1, Math.min(1, churnFlag ? Math.min(raw, -0.3) : raw)) * 100) / 100;

  const urgentHits = countHits(hay, URGENT_WORDS);
  let urgency: Urgency = "normal";
  if (urgentHits > 0 || churnFlag || negatives >= 2 || intent === "complaint") urgency = "high";
  else if (/\b(no rush|whenever|fyi|just letting you know|no hurry)\b/.test(hay)) urgency = "low";

  return { intent, urgency, summary: heuristicSummary(text, subject, intent), sentiment, churnFlag };
}

const LEAD: Record<Intent, string> = {
  payout: "Asking about a payout",
  maintenance: "Asking about a repair",
  complaint: "Unhappy about how something went",
  booking: "Asking about bookings",
  churn_risk: "Thinking about whether to stay with us",
  general: "Has a question",
};

function heuristicSummary(text: string, subject: string | null | undefined, intent: Intent): string {
  const cleanedSubject = (subject ?? "")
    .replace(/^(re|fwd?|fw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanedSubject.length >= 6) {
    return clip(`${LEAD[intent]}: ${lowerFirst(cleanedSubject)}`, 90);
  }
  const firstSentence = firstMeaningfulSentence(text);
  if (firstSentence) return clip(`${LEAD[intent]}: ${lowerFirst(firstSentence)}`, 90);
  return LEAD[intent];
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function firstMeaningfulSentence(text: string): string | null {
  const lines = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(hi|hello|hey|dear|good (morning|afternoon|evening))\b/i.test(l) && !/^>/.test(l));
  const body = lines.join(" ");
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.find((s) => s.length > 12) ?? sentences[0] ?? null;
}
