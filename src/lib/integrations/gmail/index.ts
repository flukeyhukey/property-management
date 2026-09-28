/**
 * Gmail adapter, mock or live by INTEGRATIONS_MODE.
 *
 *   const g = gmail(db);
 *   await g.pull(since);                       // every connected inbox
 *   await g.sendReply(staffId, { threadId, to, subject, body, inReplyToMessageId });
 */
import type { AdminClient } from "@/lib/supabase/admin";
import { integrationsMode } from "@/lib/env";
import type { Integration } from "../types";
import * as live from "./live";
import * as mock from "./mock";

export type { EmailEvent, SendReplyInput, SendResult } from "./live";
export { GMAIL_SCOPES, gmailRedirectUri, oauthClient, storeRefreshToken } from "./live";

export interface GmailAdapter extends Integration<live.EmailEvent> {
  sendReply(staffId: string, input: live.SendReplyInput): Promise<live.SendResult>;
}

export function gmail(db: AdminClient, mode: "mock" | "live" = integrationsMode()): GmailAdapter {
  const impl = mode === "live" ? live : mock;
  return {
    name: `gmail:${mode}`,
    pull: (since) => impl.pullAll(db, since),
    sendReply: (staffId, input) => impl.sendReply(db, staffId, input),
  };
}
