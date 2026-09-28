/**
 * Recording what happened. Every interaction, from any source, goes through
 * recordInteraction so the loop rules run the same way for a Gmail sync, a
 * Dialpad webhook or a PM tapping "Log call".
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/domain/database";
import { applyEvidence, openLoop, openLoopForInbound } from "@/lib/domain/loops";
import {
  matchOwnerByAnyEmail,
  matchOwnerByPhone,
  matchStaffByAnyEmail,
  matchStaffByDialpadUser,
  normaliseEmail,
} from "@/lib/domain/match";
import type { Interaction, InteractionInsert } from "@/lib/domain/types";
import type { CallEvent, InboundEmail, MaintenanceIssueEvent, OutboundEmail, SmsEvent } from "@/lib/integrations/types";
import { closeOutreachWithEvidence } from "@/lib/domain/cadence";
import { closeFromIssueStatus } from "@/lib/domain/commitments";
import { gmail } from "@/lib/integrations/gmail";
import { hasMaintenanceSheet, readMaintenanceRows } from "@/lib/integrations/sheets/live";
import { normaliseText } from "@/lib/integrations/sheets";

export type RecordableEvent = InboundEmail | OutboundEmail | CallEvent | SmsEvent;

function isEvent(input: InteractionInsert | RecordableEvent): input is RecordableEvent {
  return "kind" in input && !("owner_id" in input);
}

async function ownerPropertyId(db: AdminClient, ownerId: string): Promise<string | null> {
  const { data } = await db.from("lane_owner_properties").select("property_id").eq("owner_id", ownerId).limit(1).maybeSingle();
  return data?.property_id ?? null;
}

/**
 * Turns a normalised event into an interaction row: finds the owner and the
 * staff member. Null when the event is not about an owner we know.
 */
export async function eventToInsert(db: AdminClient, event: RecordableEvent): Promise<InteractionInsert | null> {
  if (event.kind === "email") {
    const from = normaliseEmail(event.from);
    const others = [...event.to, ...(event.cc ?? [])];
    const owner =
      event.direction === "inbound" ? await matchOwnerByAnyEmail(db, [from]) : await matchOwnerByAnyEmail(db, others);
    if (!owner) return null;
    const staff = event.staffId
      ? { id: event.staffId }
      : await matchStaffByAnyEmail(db, event.direction === "outbound" ? [from] : [event.staffEmail, ...others]);
    const metadata: Record<string, Json> = {
      from: from ?? event.from,
      to: event.to,
      cc: event.cc ?? [],
      message_id_header: event.messageIdHeader ?? null,
      ...(event.metadata ?? {}),
    };
    return {
      owner_id: owner.id,
      property_id: await ownerPropertyId(db, owner.id),
      staff_id: staff?.id ?? owner.assigned_pm_id,
      channel: "email",
      direction: event.direction,
      occurred_at: event.occurredAt.toISOString(),
      subject: event.subject,
      body: event.body,
      external_id: event.externalId,
      thread_id: event.threadId,
      is_auto_reply: event.isAutoReply,
      metadata,
    };
  }

  const owner = await matchOwnerByPhone(db, event.contactNumber);
  if (!owner) return null;
  const staff = event.staffId ? { id: event.staffId } : await matchStaffByDialpadUser(db, event.dialpadUserId);
  const base = {
    owner_id: owner.id,
    property_id: await ownerPropertyId(db, owner.id),
    staff_id: staff?.id ?? (event.direction === "inbound" ? owner.assigned_pm_id : null),
    direction: event.direction,
    occurred_at: event.occurredAt.toISOString(),
    external_id: event.externalId,
  } as const;

  if (event.kind === "call") {
    return {
      ...base,
      channel: "call",
      call_answered: event.state === "answered",
      call_duration_seconds: event.durationSeconds,
      recording_url: event.recordingUrl ?? null,
      transcript: event.transcript ?? null,
      metadata: {
        state: event.state,
        from_number: event.fromNumber,
        to_number: event.toNumber,
        dialpad_user_id: event.dialpadUserId ?? null,
        transcript_url: event.transcriptUrl ?? null,
        ...(event.metadata ?? {}),
      },
    };
  }

  return {
    ...base,
    channel: "sms",
    body: event.body,
    thread_id: event.threadId ?? null,
    metadata: {
      from_number: event.fromNumber,
      to_number: event.toNumber,
      dialpad_user_id: event.dialpadUserId ?? null,
      ...(event.metadata ?? {}),
    },
  };
}

/**
 * Stores an interaction (unique on channel + external_id) and runs the loop
 * rules: inbound opens a loop, outbound closes the loops it satisfies.
 * Recording the same event twice is a no-op that returns the stored row.
 *
 * Pass either a ready-made row (from a server action) or a normalised event
 * from an adapter. Events that match no owner return null.
 */
export async function recordInteraction(db: AdminClient, input: InteractionInsert): Promise<Interaction>;
export async function recordInteraction(db: AdminClient, input: RecordableEvent): Promise<Interaction | null>;
export async function recordInteraction(
  db: AdminClient,
  input: InteractionInsert | RecordableEvent,
): Promise<Interaction | null> {
  const row = isEvent(input) ? await eventToInsert(db, input) : input;
  if (!row) return null;
  const { interaction, created } = await insertInteraction(db, row);
  if (created) await runLoopRules(db, interaction);
  return interaction;
}

async function insertInteraction(db: AdminClient, row: InteractionInsert): Promise<{ interaction: Interaction; created: boolean }> {
  if (row.external_id) {
    const { data: existing } = await db
      .from("lane_interactions")
      .select("*")
      .eq("channel", row.channel)
      .eq("external_id", row.external_id)
      .maybeSingle();
    if (existing) return { interaction: existing, created: false };
  }
  const { data, error } = await db.from("lane_interactions").insert(row).select("*").single();
  if (error) {
    // Lost a race with another run: read the winner back.
    if (error.code === "23505" && row.external_id) {
      const { data: existing } = await db
        .from("lane_interactions")
        .select("*")
        .eq("channel", row.channel)
        .eq("external_id", row.external_id)
        .single();
      if (existing) return { interaction: existing, created: false };
    }
    throw new Error(`recordInteraction: ${error.message}`);
  }
  return { interaction: data, created: true };
}

async function runLoopRules(db: AdminClient, interaction: Interaction) {
  if (interaction.direction === "inbound") await openLoopForInbound(db, interaction);
  else if (interaction.direction === "outbound") {
    await applyEvidence(db, interaction);
    try {
      await closeOutreachWithEvidence(db, interaction);
    } catch (e) {
      console.error("[record] outreach evidence failed", e);
    }
  }
  // Follow-up suggestion and evidence run in /api/cron/commitments, so a slow
  // AI call never holds up recording.
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

const MAINTENANCE_CATEGORIES = ["maintenance", "damage"];
const DONE_STATUSES = ["resolved", "auto_closed", "closed", "done", "complete", "completed"];
const SYNC_KEY = "maintenance:issues";

type IssueRow = {
  id: string;
  property_id: string | null;
  category: string;
  description: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

async function readLastSync(db: AdminClient): Promise<Date> {
  const { data } = await db.from("lane_sync_state").select("value").eq("key", SYNC_KEY).maybeSingle();
  const v = data?.value as { last_sync?: string } | null;
  return v?.last_sync ? new Date(v.last_sync) : new Date(Date.now() - 7 * 86400000);
}

async function ownerForProperty(db: AdminClient, propertyId: string | null) {
  if (!propertyId) return null;
  const { data: link } = await db
    .from("lane_owner_properties")
    .select("owner_id")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!link) return null;
  const { data: owner } = await db.from("lane_owners").select("*").eq("id", link.owner_id).eq("is_active", true).maybeSingle();
  return owner ?? null;
}

function statusEmail(ownerName: string, description: string, status: string) {
  const first = ownerName.split(" ")[0];
  const done = status === "auto_closed" ? "has been closed off" : "has been sorted";
  return {
    subject: "Update on the maintenance at your property",
    body: [
      `Hi ${first},`,
      "",
      `A quick update: the issue we logged, "${description}", ${done}.`,
      "If you notice anything else, just reply to this email or give me a call.",
      "",
      "Thanks,",
    ].join("\n"),
  };
}

export type MaintenanceResult = { created: number; resolved: number; emailed: number; skipped: number };

/**
 * New maintenance/damage issues open a maintenance loop for the property's
 * owner. When an issue is resolved we note it on the timeline and, with
 * AUTO_MAINTENANCE_EMAILS=true, email the owner from their PM, which closes
 * the loop through the evidence rules.
 */
export async function ingestMaintenance(db: AdminClient, now: Date = new Date()): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { created: 0, resolved: 0, emailed: 0, skipped: 0 };
  const since = await readLastSync(db);
  const events = hasMaintenanceSheet() ? await maintenanceFromSheet(db, since) : await maintenanceFromIssues(db, since);

  for (const ev of events) {
    const owner = await ownerForProperty(db, ev.propertyId);
    if (!owner) {
      result.skipped += 1;
      continue;
    }
    const fromSheet = ev.issueId.startsWith("sheet:");
    const issueId = fromSheet ? null : ev.issueId;

    if (ev.change === "created") {
      // Seen before: its loop is open or already closed. Never reopen.
      const { data: seen } = await db
        .from("lane_interactions")
        .select("id")
        .eq("channel", "maintenance")
        .eq("external_id", ev.issueId)
        .maybeSingle();
      if (seen) continue;
      const interaction = await recordInteraction(db, {
        owner_id: owner.id,
        property_id: ev.propertyId,
        channel: "maintenance",
        direction: "internal",
        occurred_at: ev.createdAt.toISOString(),
        subject: "New maintenance issue",
        body: ev.description,
        external_id: ev.issueId,
        metadata: { issue_id: ev.issueId, category: ev.category, status: ev.status },
      });
      const { created } = await openLoop(db, {
        ownerId: owner.id,
        propertyId: ev.propertyId,
        type: "maintenance",
        issueId,
        threadId: fromSheet ? ev.issueId : null,
        triggerInteractionId: interaction.id,
        summary: ev.description,
        openedAt: ev.createdAt,
      });
      if (created) result.created += 1;
      continue;
    }

    // Status changed to done.
    const at = ev.updatedAt ?? now;
    const { data: already } = await db
      .from("lane_interactions")
      .select("id")
      .eq("channel", "maintenance")
      .eq("external_id", `${ev.issueId}:${ev.status}`)
      .maybeSingle();
    if (already) continue;

    await recordInteraction(db, {
      owner_id: owner.id,
      property_id: ev.propertyId,
      channel: "maintenance",
      direction: "internal",
      occurred_at: at.toISOString(),
      subject: ev.status === "auto_closed" ? "Maintenance issue closed" : "Maintenance issue resolved",
      body: ev.description,
      external_id: `${ev.issueId}:${ev.status}`,
      metadata: { issue_id: ev.issueId, status: ev.status },
    });
    result.resolved += 1;
    if (issueId) {
      try {
        await closeFromIssueStatus(db, issueId, ev.status);
      } catch (e) {
        console.error(`[maintenance] follow-ups for ${ev.issueId} failed`, e);
      }
    }

    if (process.env.AUTO_MAINTENANCE_EMAILS === "true" && owner.primary_email && owner.assigned_pm_id) {
      try {
        const { subject, body } = statusEmail(owner.name, ev.description, ev.status);
        const sent = await gmail(db).sendReply(owner.assigned_pm_id, { to: owner.primary_email, subject, body, threadId: null });
        await recordInteraction(db, {
          owner_id: owner.id,
          property_id: ev.propertyId,
          staff_id: owner.assigned_pm_id,
          channel: "email",
          direction: "outbound",
          occurred_at: new Date().toISOString(),
          subject,
          body,
          external_id: sent.messageId,
          thread_id: sent.threadId,
          metadata: { issue_id: ev.issueId, automatic: true, message_id_header: sent.messageIdHeader },
        });
        result.emailed += 1;
      } catch (e) {
        console.error(`[maintenance] status email for ${ev.issueId} failed`, e);
      }
    }
  }

  await db.from("lane_sync_state").upsert({
    key: SYNC_KEY,
    value: { last_sync: now.toISOString(), ...result },
    updated_at: now.toISOString(),
  });
  return result;
}

async function maintenanceFromIssues(db: AdminClient, since: Date): Promise<MaintenanceIssueEvent[]> {
  const sinceIso = new Date(since.getTime() - 5 * 60000).toISOString();
  const { data, error } = await db
    .from("issues")
    .select("id, property_id, category, description, status, created_at, updated_at")
    .in("category", MAINTENANCE_CATEGORIES)
    .or(`created_at.gte.${sinceIso},updated_at.gte.${sinceIso}`)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`ingestMaintenance: ${error.message}`);
  const out: MaintenanceIssueEvent[] = [];
  for (const i of (data ?? []) as IssueRow[]) {
    const createdAt = i.created_at ? new Date(i.created_at) : new Date();
    const status = (i.status ?? "open").toLowerCase();
    const base = {
      kind: "maintenance" as const,
      issueId: i.id,
      propertyId: i.property_id,
      category: i.category,
      description: i.description,
      status,
      createdAt,
      updatedAt: i.updated_at ? new Date(i.updated_at) : null,
    };
    if (createdAt.toISOString() >= sinceIso) out.push({ ...base, change: "created" });
    if (DONE_STATUSES.includes(status)) out.push({ ...base, change: "status_changed" });
  }
  return out;
}

/** Fallback when MAINTENANCE_SHEET_ID is set: sheet rows matched to properties by name/address. */
async function maintenanceFromSheet(db: AdminClient, since: Date): Promise<MaintenanceIssueEvent[]> {
  const rows = await readMaintenanceRows();
  const { data: props } = await db.from("properties").select("id, name, address").eq("is_active", true);
  const index = new Map<string, string>();
  for (const p of props ?? []) {
    index.set(normaliseText(p.name), p.id);
    if (p.address) index.set(normaliseText(p.address), p.id);
  }
  const out: MaintenanceIssueEvent[] = [];
  for (const r of rows) {
    const propertyId = index.get(normaliseText(r.property)) ?? null;
    const createdAt = r.created ? new Date(r.created) : new Date();
    const updatedAt = r.updated ? new Date(r.updated) : null;
    const base = {
      kind: "maintenance" as const,
      issueId: `sheet:${r.issueId}`,
      propertyId,
      propertyName: r.property,
      category: "maintenance",
      description: r.description,
      status: r.status,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
      updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
    };
    // The sheet has no reliable history, so every open row is offered; openLoop dedupes.
    if (!DONE_STATUSES.includes(r.status)) out.push({ ...base, change: "created" });
    else if (!base.updatedAt || base.updatedAt >= since) out.push({ ...base, change: "status_changed" });
  }
  return out;
}
