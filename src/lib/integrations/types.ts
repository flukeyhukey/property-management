/**
 * Normalised event shapes every adapter (Gmail, Dialpad, sheets, mock)
 * produces. The ingest layer only ever sees these; it never sees a raw API
 * payload.
 */

/** Extra facts stored on the interaction row (for example issue_id on a status email). */
export type EventMetadata = Record<string, string | number | boolean | null>;

export type InboundEmail = {
  kind: "email";
  direction: "inbound";
  metadata?: EventMetadata;
  /** Gmail message id (unique per channel). */
  externalId: string;
  threadId: string;
  /** Gmail Message-ID header, for In-Reply-To on replies. */
  messageIdHeader?: string | null;
  from: string;
  to: string[];
  cc?: string[];
  subject: string | null;
  body: string | null;
  occurredAt: Date;
  isAutoReply: boolean;
  /** The staff inbox this arrived in. */
  staffId?: string | null;
  staffEmail?: string | null;
};

export type OutboundEmail = Omit<InboundEmail, "direction"> & { direction: "outbound" };

export type CallState = "answered" | "missed" | "voicemail";

export type CallEvent = {
  kind: "call";
  externalId: string;
  metadata?: EventMetadata;
  direction: "inbound" | "outbound";
  state: CallState;
  fromNumber: string | null;
  toNumber: string | null;
  /** The owner's number, whichever side it was on. */
  contactNumber: string | null;
  durationSeconds: number | null;
  recordingUrl?: string | null;
  transcriptUrl?: string | null;
  transcript?: string | null;
  occurredAt: Date;
  /** Dialpad user id of the staff member on the call. */
  dialpadUserId?: string | null;
  staffId?: string | null;
};

export type SmsEvent = {
  kind: "sms";
  externalId: string;
  metadata?: EventMetadata;
  direction: "inbound" | "outbound";
  fromNumber: string | null;
  toNumber: string | null;
  contactNumber: string | null;
  body: string | null;
  occurredAt: Date;
  /** Dialpad conversation / thread id when known. */
  threadId?: string | null;
  dialpadUserId?: string | null;
  staffId?: string | null;
};

export type MaintenanceIssueStatus = "open" | "in_progress" | "resolved" | "auto_closed" | string;

export type MaintenanceIssueEvent = {
  kind: "maintenance";
  /** public.issues id, or the sheet's issue id when the sheet is the source. */
  issueId: string;
  propertyId: string | null;
  propertyName?: string | null;
  category: string;
  description: string;
  status: MaintenanceIssueStatus;
  createdAt: Date;
  updatedAt: Date | null;
  /** "created" when first seen, "status_changed" when its status moved. */
  change: "created" | "status_changed";
};

export type IngestEvent = InboundEmail | OutboundEmail | CallEvent | SmsEvent | MaintenanceIssueEvent;

/** Every adapter, mock or live, implements this. */
export interface Integration<E extends IngestEvent = IngestEvent> {
  readonly name: string;
  /** Events that happened at or after `since`, oldest first. Must be safe to call repeatedly. */
  pull(since: Date): Promise<E[]>;
}

export type MasterSheetRow = {
  propertyName: string;
  address: string;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  keyNumber: string | null;
  buildingManager: string | null;
  cleaner: string | null;
  region: string | null;
  onboardDate: string | null;
  assignedPmEmail: string | null;
};

export type MaintenanceSheetRow = {
  issueId: string;
  property: string;
  description: string;
  status: string;
  created: string | null;
  updated: string | null;
};
