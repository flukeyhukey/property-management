/**
 * Gmail, mock. Pulls a few templated owner emails per half hour from the seed
 * dataset; sending returns a made-up message id without touching Google.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import { mockGmailEvents } from "@/lib/seed/data";
import { loadMockOwners } from "../mock-owners";
import type { EmailEvent, SendReplyInput, SendResult } from "./live";

export async function pullAll(db: AdminClient, since: Date): Promise<EmailEvent[]> {
  const owners = await loadMockOwners(db);
  return mockGmailEvents(owners).filter((e) => e.occurredAt >= since);
}

export async function sendReply(_db: AdminClient, _staffId: string, input: SendReplyInput): Promise<SendResult> {
  const id = `mock-sent-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return { messageId: id, threadId: input.threadId ?? `mock-thread-${id}`, messageIdHeader: `<${id}@mock.laneproperty.com.au>` };
}
