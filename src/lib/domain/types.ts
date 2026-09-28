/**
 * Row types and enums for the owner system. Everything here is derived from
 * the generated Database type so it stays in step with the schema.
 */
import type { Database } from "./database";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
type Enums = Database["public"]["Enums"];

export type Staff = Tables["lane_staff"]["Row"];
export type StaffRole = Enums["lane_staff_role"];
export type Owner = Tables["lane_owners"]["Row"];
export type OwnerInsert = Tables["lane_owners"]["Insert"];
export type OwnerContactPoint = Tables["lane_owner_contact_points"]["Row"];
export type OwnerProperty = Tables["lane_owner_properties"]["Row"];
export type Interaction = Tables["lane_interactions"]["Row"];
export type InteractionInsert = Tables["lane_interactions"]["Insert"];
export type Loop = Tables["lane_loops"]["Row"];
export type LoopInsert = Tables["lane_loops"]["Insert"];
export type Commitment = Tables["lane_commitments"]["Row"];
export type CommitmentInsert = Tables["lane_commitments"]["Insert"];
export type OutreachTask = Tables["lane_outreach_tasks"]["Row"];
export type NpsResponse = Tables["lane_nps_responses"]["Row"];
export type PropertyReview = Tables["lane_property_reviews"]["Row"];
export type PropertySnapshot = Tables["lane_property_snapshots"]["Row"];
export type HealthSnapshot = Tables["lane_health_snapshots"]["Row"];
export type Notification = Tables["lane_notifications"]["Row"];

/** Read-only projections of the cleaning app's tables. */
export type Property = Views["lane_properties"]["Row"];
export type Issue = Views["lane_issues"]["Row"];
export type Reservation = Views["lane_reservations"]["Row"];
export type LoopStats = Views["lane_v_loop_stats"]["Row"];

export type Health = Enums["lane_health"];
export type Channel = Enums["lane_channel"];
export type Direction = Enums["lane_direction"];
export type LoopType = Enums["lane_loop_type"];
export type LoopStatus = Enums["lane_loop_status"];
export type CloseKind = Enums["lane_close_kind"];
export type CloseReason = Enums["lane_close_reason"];
export type SnoozeReason = Enums["lane_snooze_reason"];
export type CommitmentStatus = Enums["lane_commitment_status"];
export type OutreachSource = Enums["lane_outreach_source"];
export type NpsKind = Enums["lane_nps_kind"];
export type Intent = Enums["lane_intent"];
export type Urgency = Enums["lane_urgency"];
export type ContactMethod = Enums["lane_contact_method"];

/** The pick-from-four lists the PM sees. Never free text. */
export const CLOSE_REASONS: { value: CloseReason; label: string }[] = [
  { value: "resolved_elsewhere", label: "Sorted it another way" },
  { value: "no_reply_needed", label: "No reply needed" },
  { value: "duplicate", label: "Same as another one" },
  { value: "owner_withdrew", label: "Owner said leave it" },
];

export const SNOOZE_REASONS: { value: SnoozeReason; label: string }[] = [
  { value: "waiting_on_owner", label: "Waiting on the owner" },
  { value: "waiting_on_trade", label: "Waiting on a trade" },
  { value: "owner_asked_later", label: "Owner asked for later" },
  { value: "after_hours", label: "Pick up first thing" },
];

/** Words in an owner's email that count as churn language for the health score. */
export const CHURN_PHRASES = [
  "other agencies",
  "other agency",
  "another agency",
  "cancel",
  "not happy",
  "unhappy",
  "reconsidering",
  "reconsider",
  "terminate",
  "leave",
  "move my property",
  "not working",
];

/** Queue row: a loop with the owner and property it belongs to. */
export type QueueLoop = Loop & {
  owner: Pick<Owner, "id" | "name" | "health" | "preferred_contact" | "primary_phone" | "primary_email">;
  property: Pick<Property, "id" | "name" | "region"> | null;
};

export type CommitmentWithOwner = Commitment & {
  owner: Pick<Owner, "id" | "name">;
};

export type OutreachWithOwner = OutreachTask & {
  owner: Pick<Owner, "id" | "name" | "health">;
  property: Pick<Property, "id" | "name" | "region"> | null;
};

export const LOOP_TYPE_LABEL: Record<LoopType, string> = {
  email: "Email",
  missed_call: "Missed call",
  sms: "SMS",
  maintenance: "New maintenance",
  detractor: "Survey response",
  resly: "Resly",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  call: "Call",
  sms: "SMS",
  maintenance: "Maintenance",
  nps: "Survey",
  note: "Note",
  commitment: "Follow-up",
  resly: "Resly",
};
