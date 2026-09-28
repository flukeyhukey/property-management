/**
 * Dialpad adapter, mock or live by INTEGRATIONS_MODE.
 *
 *   const d = dialpad(db);
 *   await d.pull(since);
 *   clickToDialUrl("0412 000 101")  // { dialpad: "dialpad://+61412000101", tel: "tel:+61412000101" }
 */
import type { AdminClient } from "@/lib/supabase/admin";
import { integrationsMode } from "@/lib/env";
import type { CallEvent, Integration, SmsEvent } from "../types";
import * as live from "./live";
import * as mock from "./mock";

export { clickToDialUrl, isSmsPayload, normaliseCall, normaliseSms, verifyWebhook } from "./live";

export type DialpadEvent = CallEvent | SmsEvent;

export interface DialpadAdapter extends Integration<DialpadEvent> {
  sendSms(staffId: string, phone: string, body: string): Promise<{ externalId?: string; threadId?: string }>;
}

export function dialpad(db: AdminClient, mode: "mock" | "live" = integrationsMode()): DialpadAdapter {
  const impl = mode === "live" ? live : mock;
  return {
    name: `dialpad:${mode}`,
    pull: (since) => impl.pullAll(db, since),
    sendSms: (staffId, phone, body) => impl.sendSms(db, staffId, phone, body),
  };
}
