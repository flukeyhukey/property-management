/**
 * NPS transport. Tool-agnostic on purpose: surveys go out as a JSON POST
 * to NPS_SEND_URL (a Zapier/Make hook, Delighted, Typeform, anything that
 * can email a one-question survey), and responses come back as a JSON POST
 * to /api/webhooks/nps.
 *
 * Env:
 *   NPS_WEBHOOK_SECRET  shared secret. Inbound requests must carry either
 *                       `x-nps-signature: <hex hmac-sha256 of the raw body>`
 *                       (optionally prefixed "sha256=") or
 *                       `Authorization: Bearer <secret>`. Outbound sends are
 *                       signed the same way.
 *   NPS_SEND_URL        where live mode POSTs survey requests:
 *                       { surveyId, ownerId, email, name, kind }.
 *                       The tool must echo `surveyId` back on the response.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { integrationsMode } from "@/lib/env";
import type { NpsKind } from "@/lib/domain/types";
import { MockNpsSender } from "./mock";

export const NPS_KINDS = ["quarterly", "onboarding", "maintenance_closed"] as const satisfies readonly NpsKind[];

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

export const NpsWebhookSchema = z.object({
  email: z.string().email(),
  score: z.coerce.number().int().min(0).max(10),
  comment: z.string().nullish(),
  respondedAt: z.string().nullish(),
  surveyId: z.string().min(1),
  kind: z.enum(NPS_KINDS).nullish(),
});

export type NpsWebhookPayload = z.infer<typeof NpsWebhookSchema>;

export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Checks the shared secret. Without NPS_WEBHOOK_SECRET the webhook is open
 * outside production only.
 */
export function verifyNpsRequest(headers: Headers, rawBody: string, secret = process.env.NPS_WEBHOOK_SECRET): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = headers.get("authorization");
  if (auth && safeEqual(auth, `Bearer ${secret}`)) return true;
  const sig = headers.get("x-nps-signature")?.trim().replace(/^sha256=/i, "");
  if (!sig) return false;
  return safeEqual(sig.toLowerCase(), signBody(rawBody, secret));
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "nps:sent:<ownerId>:<kind>:<period>" -> kind, when the tool echoes our surveyId. */
export function kindFromSurveyId(surveyId: string): NpsKind | null {
  const parts = surveyId.split(":");
  const kind = parts[0] === "nps" && parts[1] === "sent" ? parts[3] : null;
  return (NPS_KINDS as readonly string[]).includes(kind ?? "") ? (kind as NpsKind) : null;
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

export type SurveyRequest = {
  /** Our dedupe key; the tool echoes it back as surveyId. */
  surveyId: string;
  ownerId: string;
  email: string;
  name: string;
  kind: NpsKind;
};

export interface NpsSender {
  readonly mode: "mock" | "live";
  send(survey: SurveyRequest): Promise<{ ok: boolean; detail: string }>;
}

export class LiveNpsSender implements NpsSender {
  readonly mode = "live" as const;
  constructor(
    private readonly url: string,
    private readonly secret: string | undefined = process.env.NPS_WEBHOOK_SECRET,
  ) {}

  async send(survey: SurveyRequest): Promise<{ ok: boolean; detail: string }> {
    const body = JSON.stringify(survey);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.secret) headers["x-nps-signature"] = signBody(body, this.secret);
    try {
      const res = await fetch(this.url, { method: "POST", headers, body, cache: "no-store" });
      return { ok: res.ok, detail: `${res.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

export function createNpsSender(): NpsSender {
  const url = process.env.NPS_SEND_URL;
  if (integrationsMode() === "live" && url) return new LiveNpsSender(url);
  return new MockNpsSender();
}

export { MockNpsSender };
