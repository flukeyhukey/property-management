/** Dialpad, mock. A missed call and a text per half hour from the seed owners. */
import type { AdminClient } from "@/lib/supabase/admin";
import { mockDialpadEvents } from "@/lib/seed/data";
import { loadMockOwners } from "../mock-owners";
import type { CallEvent, SmsEvent } from "../types";

export async function pullAll(db: AdminClient, since: Date): Promise<(CallEvent | SmsEvent)[]> {
  const owners = await loadMockOwners(db);
  return mockDialpadEvents(owners).filter((e) => e.occurredAt >= since);
}

export async function sendSms(_db: AdminClient, _staffId: string, phone: string, _body: string): Promise<{ externalId?: string; threadId?: string }> {
  return { externalId: `mock-sms-out-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, threadId: phone };
}
