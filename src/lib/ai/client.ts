/**
 * Thin wrapper over the Anthropic SDK. Every caller must have a heuristic
 * fallback: when ANTHROPIC_API_KEY is missing (mock mode) these helpers
 * return null and the caller falls back to its own templated logic.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { hasAnthropic } from "@/lib/env";

export const MODEL = "claude-sonnet-5";

/**
 * How Lane talks. Prepended to every system prompt so drafts and summaries
 * read as one voice.
 */
export const LANE_TONE = [
  "You write for Lane Property, a holiday-home management company in Queensland.",
  "Write in plain words, in sentences, in sentence case. Say \"you\" and \"we\".",
  "No exclamation marks, no jargon, no hype, no emoji. Name the outcome for the owner.",
  "Be honest and specific. If something ran late, say so and say what happens next.",
  "Never use the words accountability, SLA, overdue, escalated or missed when describing our own work.",
].join(" ");

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return hasAnthropic();
}

function getClient(): Anthropic | null {
  if (!aiAvailable()) return null;
  if (!client) client = new Anthropic();
  return client;
}

export type StructuredOptions = {
  system: string;
  user: string;
  maxTokens?: number;
};

/**
 * Asks the model for a JSON object that validates against `schema`. Returns
 * null when there is no key, the call fails, or the output does not parse.
 */
export async function structured<S extends z.ZodType>(schema: S, opts: StructuredOptions): Promise<z.infer<S> | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const response = await c.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      system: `${LANE_TONE}\n\n${opts.system}`,
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: "low", format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === "refusal") return null;
    const parsed = response.parsed_output;
    if (parsed == null) return null;
    const checked = schema.safeParse(parsed);
    return checked.success ? checked.data : null;
  } catch (error) {
    logAiError("structured", error);
    return null;
  }
}

export type TextOptions = {
  system: string;
  user: string;
  maxTokens?: number;
};

/** Asks the model for plain text. Returns null on no key or any failure. */
export async function text(opts: TextOptions): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: `${LANE_TONE}\n\n${opts.system}`,
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: "low" },
    });
    if (response.stop_reason === "refusal") return null;
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return out || null;
  } catch (error) {
    logAiError("text", error);
    return null;
  }
}

function logAiError(where: string, error: unknown) {
  if (error instanceof Anthropic.RateLimitError) {
    console.warn(`[ai:${where}] rate limited, falling back to heuristics`);
  } else if (error instanceof Anthropic.AuthenticationError) {
    console.warn(`[ai:${where}] bad API key, falling back to heuristics`);
  } else if (error instanceof Anthropic.APIError) {
    console.warn(`[ai:${where}] API error ${error.status}: ${error.message}`);
  } else {
    console.warn(`[ai:${where}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** First name for sign-offs: "Sarah Jones" -> "Sarah". */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

/** Trims to `max` characters on a word boundary, no trailing punctuation mess. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:\-\s]+$/, "")}…`;
}
