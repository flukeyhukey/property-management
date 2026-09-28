/**
 * The seed dataset. Pure: takes the real property rows and the staff ids it
 * is given and returns rows ready to insert. The mock integrations read the
 * same templates so mock mode and the seed tell one story.
 */
import { TZDate } from "@date-fns/tz";
import { dueAtFor, TZ } from "@/lib/domain/time";
import type { Database, Json } from "@/lib/domain/database";
import type { CallEvent, InboundEmail, OutboundEmail, SmsEvent } from "@/lib/integrations/types";

type Tables = Database["public"]["Tables"];
export type OwnerRow = Tables["lane_owners"]["Insert"] & { id: string };
export type ContactPointRow = Tables["lane_owner_contact_points"]["Insert"];
export type OwnerPropertyRow = Tables["lane_owner_properties"]["Insert"];
export type InteractionRow = Tables["lane_interactions"]["Insert"] & { id: string };
export type LoopRow = Tables["lane_loops"]["Insert"] & { id: string };
export type CommitmentRow = Tables["lane_commitments"]["Insert"] & { id: string };
export type OutreachRow = Tables["lane_outreach_tasks"]["Insert"] & { id: string };
export type NpsRow = Tables["lane_nps_responses"]["Insert"] & { id: string };

export const SEED_TAG = "seed";
/** Owners created by the seed carry this prefix in hubspot_contact_id so a re-run can find them. */
export const SEED_OWNER_PREFIX = "seed-owner-";

export type SeedStaff = {
  email: string;
  name: string;
  role: "pm" | "gm" | "director";
  dialpadUserId: string;
};

export const SEED_STAFF: SeedStaff[] = [
  { email: "priya@laneproperty.com.au", name: "Priya Nair", role: "pm", dialpadUserId: "dp-priya" },
  { email: "tom@laneproperty.com.au", name: "Tom Reyes", role: "pm", dialpadUserId: "dp-tom" },
  { email: "mia@laneproperty.com.au", name: "Mia Chen", role: "pm", dialpadUserId: "dp-mia" },
  { email: "alex@laneproperty.com.au", name: "Alex Hart", role: "gm", dialpadUserId: "dp-alex" },
  { email: "liam@laneproperty.com.au", name: "Liam Hukins", role: "director", dialpadUserId: "dp-liam" },
  { email: "dan@laneproperty.com.au", name: "Dan Lane", role: "director", dialpadUserId: "dp-dan" },
];

export const PM_EMAILS = SEED_STAFF.filter((s) => s.role === "pm").map((s) => s.email);

type OwnerTemplate = {
  name: string;
  email: string;
  phone: string;
  preferred: "call" | "email" | "sms";
  health: "green" | "amber" | "red";
  healthReason: string | null;
  onboardedDaysAgo: number;
  expectedOccupancy: number;
};

export const OWNER_TEMPLATES: OwnerTemplate[] = [
  { name: "Sarah Whitfield", email: "sarah.whitfield@gmail.com", phone: "+61412000101", preferred: "call", health: "amber", healthReason: "Frustrated about a repair", onboardedDaysAgo: 400, expectedOccupancy: 0.72 },
  { name: "Graham Oduya", email: "g.oduya@outlook.com", phone: "+61412000102", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 800, expectedOccupancy: 0.68 },
  { name: "Helen Marsh", email: "helen.marsh@bigpond.com", phone: "+61412000103", preferred: "call", health: "red", healthReason: "Mentioned looking at other agencies", onboardedDaysAgo: 300, expectedOccupancy: 0.75 },
  { name: "Kiri Tane", email: "kiri.tane@gmail.com", phone: "+61412000104", preferred: "sms", health: "green", healthReason: null, onboardedDaysAgo: 45, expectedOccupancy: 0.7 },
  { name: "David Lim", email: "david.lim@icloud.com", phone: "+61412000105", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 600, expectedOccupancy: 0.65 },
  { name: "Mark Delaney", email: "mark.delaney@gmail.com", phone: "+61412000106", preferred: "call", health: "amber", healthReason: "Two follow-ups slipped this quarter", onboardedDaysAgo: 220, expectedOccupancy: 0.7 },
  { name: "Anna Petrakis", email: "anna.petrakis@hotmail.com", phone: "+61412000107", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 900, expectedOccupancy: 0.74 },
  { name: "James Okafor", email: "james.okafor@gmail.com", phone: "+61412000108", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 150, expectedOccupancy: 0.66 },
  { name: "Lucy Brennan", email: "lucy.brennan@gmail.com", phone: "+61412000109", preferred: "sms", health: "green", healthReason: null, onboardedDaysAgo: 20, expectedOccupancy: 0.7 },
  { name: "Peter Nguyen", email: "peter.nguyen@outlook.com", phone: "+61412000110", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 700, expectedOccupancy: 0.62 },
  { name: "Rachel Stone", email: "rachel.stone@gmail.com", phone: "+61412000111", preferred: "call", health: "amber", healthReason: "Occupancy below what she was told to expect", onboardedDaysAgo: 250, expectedOccupancy: 0.78 },
  { name: "Tony Moretti", email: "tony.moretti@bigpond.com", phone: "+61412000112", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 1000, expectedOccupancy: 0.7 },
  { name: "Fiona Walsh", email: "fiona.walsh@gmail.com", phone: "+61412000113", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 500, expectedOccupancy: 0.69 },
  { name: "Ben Carter", email: "ben.carter@icloud.com", phone: "+61412000114", preferred: "sms", health: "green", healthReason: null, onboardedDaysAgo: 330, expectedOccupancy: 0.71 },
  { name: "Mei Zhang", email: "mei.zhang@gmail.com", phone: "+61412000115", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 60, expectedOccupancy: 0.7 },
  { name: "Owen Fitzgerald", email: "owen.fitz@gmail.com", phone: "+61412000116", preferred: "call", health: "amber", healthReason: "Waiting a while on a payout question", onboardedDaysAgo: 420, expectedOccupancy: 0.73 },
  { name: "Priyanka Rao", email: "priyanka.rao@outlook.com", phone: "+61412000117", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 210, expectedOccupancy: 0.67 },
  { name: "Chris Hall", email: "chris.hall@gmail.com", phone: "+61412000118", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 640, expectedOccupancy: 0.7 },
  { name: "Natalie Brooks", email: "nat.brooks@gmail.com", phone: "+61412000119", preferred: "sms", health: "green", healthReason: null, onboardedDaysAgo: 90, expectedOccupancy: 0.72 },
  { name: "Sam Kowalski", email: "sam.kowalski@bigpond.com", phone: "+61412000120", preferred: "email", health: "red", healthReason: "Gave us a low score after the dishwasher repair", onboardedDaysAgo: 380, expectedOccupancy: 0.7 },
  { name: "Emma Sutherland", email: "emma.sutherland@gmail.com", phone: "+61412000121", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 720, expectedOccupancy: 0.66 },
  { name: "Raj Patel", email: "raj.patel@icloud.com", phone: "+61412000122", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 280, expectedOccupancy: 0.69 },
  { name: "Olivia Grant", email: "olivia.grant@gmail.com", phone: "+61412000123", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 160, expectedOccupancy: 0.71 },
  { name: "Hamish Douglas", email: "hamish.douglas@outlook.com", phone: "+61412000124", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 1100, expectedOccupancy: 0.64 },
  { name: "Grace Ito", email: "grace.ito@gmail.com", phone: "+61412000125", preferred: "sms", health: "green", healthReason: null, onboardedDaysAgo: 35, expectedOccupancy: 0.7 },
  { name: "Daniel Murphy", email: "dan.murphy@gmail.com", phone: "+61412000126", preferred: "call", health: "amber", healthReason: "A booking he cared about was cancelled", onboardedDaysAgo: 460, expectedOccupancy: 0.75 },
  { name: "Sophie Laurent", email: "sophie.laurent@gmail.com", phone: "+61412000127", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 530, expectedOccupancy: 0.68 },
  { name: "Michael Tran", email: "michael.tran@icloud.com", phone: "+61412000128", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 610, expectedOccupancy: 0.7 },
  { name: "Isabelle Roy", email: "isabelle.roy@gmail.com", phone: "+61412000129", preferred: "email", health: "green", healthReason: null, onboardedDaysAgo: 75, expectedOccupancy: 0.72 },
  { name: "George Papadopoulos", email: "george.papa@bigpond.com", phone: "+61412000130", preferred: "call", health: "green", healthReason: null, onboardedDaysAgo: 850, expectedOccupancy: 0.67 },
];

/** Inbound owner emails: subject, body, and the reply a PM would send. */
export const EMAIL_THREADS = [
  { subject: "Payout for September", body: "Hi, could you let me know when the September payout lands? The statement shows a different figure to what hit my account.", reply: "Hi {first}, the September payout went out on the 3rd. The difference is the cleaning fee for the owner stay, which I have itemised below. Let me know if anything does not add up." },
  { subject: "Dishwasher not draining", body: "The guest mentioned the dishwasher was not draining properly over the weekend. Can someone take a look before the next check-in?", reply: "Hi {first}, thanks for flagging it. I have booked the appliance tech for Thursday morning and the cleaner will run a cycle after. I will confirm once it is done." },
  { subject: "Blocking dates in October", body: "We would like to use the apartment from the 14th to the 20th of October. Can you block those dates for us?", reply: "Hi {first}, those dates are now blocked for you. I have arranged a clean before you arrive." },
  { subject: "Occupancy looks low", body: "Looking at the calendar, next month looks quieter than I expected. Is there anything we should be doing on pricing?", reply: "Hi {first}, you are right that early next month is soft. I have adjusted the midweek rate and opened a two-night minimum. Happy to talk it through on a call." },
  { subject: "Question about the new cleaner", body: "The last guest review mentioned the bathroom was not quite up to scratch. Has the cleaner changed recently?", reply: "Hi {first}, yes, we moved to a new team last month. I have raised the review with them and will do a spot check after the next clean." },
  { subject: "Insurance certificate", body: "My insurer is asking for a copy of the current management agreement and the cleaning schedule. Could you send them across?", reply: "Hi {first}, both documents are attached. Let me know if the insurer needs anything else." },
  { subject: "Thinking about our arrangement", body: "To be honest I have been reconsidering things. A friend uses another agency and seems to be getting better returns. Can we talk?", reply: "Hi {first}, I would like to understand what is not working. Are you free for a call tomorrow morning?" },
  { subject: "Balcony door lock", body: "The balcony door lock is sticking again. It was looked at earlier this year but it seems to have come back.", reply: "Hi {first}, I have asked the locksmith to replace the mechanism rather than adjust it this time. He is booked for Tuesday." },
  { subject: "Statement query", body: "There is a line on the statement called 'consumables' that I do not recognise. What does that cover?", reply: "Hi {first}, consumables are the toiletries, coffee pods and cleaning products restocked between stays. I have attached the breakdown for the month." },
  { subject: "Guest damage", body: "I saw on the calendar that a guest checked out early. Was there any damage? Just want to make sure we are covered.", reply: "Hi {first}, there was a small mark on the hallway wall which the guest has paid for through the platform. Photos attached." },
];

export const AUTO_REPLY_SUBJECT = "Automatic reply: Out of office";

export const SMS_TEMPLATES = {
  inbound: [
    "Hi, did the plumber end up coming today?",
    "Can you call me when you get a chance?",
    "Just checking the guests checked out ok this morning",
    "Any update on the dishwasher?",
    "Thanks for sorting the lock, much appreciated",
  ],
  outbound: [
    "Hi {first}, tried to call you just now. Free to talk this afternoon?",
    "Hi {first}, the plumber has been and it is all sorted. I will send photos tonight.",
    "Hi {first}, guests checked out fine, cleaner is in now.",
    "Hi {first}, it is Lane here, will call you back within the hour.",
  ],
};

export const CALL_SUMMARIES = [
  "Talked through the September statement and the owner stay cleaning fee.",
  "Owner asked about pricing for the shoulder season; agreed to review midweek rates.",
  "Confirmed the appliance tech booking and the follow-up clean.",
  "Owner wants a call once the locksmith has been.",
  "Caught up on occupancy for next month; owner is comfortable with the plan.",
  "Owner raised the last guest review; agreed to a spot check after the next clean.",
];

export const MAINTENANCE_DESCRIPTIONS = [
  "Dishwasher not draining, water left in the base after a cycle",
  "Balcony door lock sticking, guest could not lock it from inside",
  "Leaking tap in the ensuite, dripping overnight",
  "Air conditioner in the living room not cooling",
  "Hallway wall scuffed by luggage, needs a patch and paint",
  "Bedroom blind cord snapped",
  "Smoke alarm chirping, battery due",
  "Washing machine door seal torn",
];

export const COMMITMENT_TEXTS = [
  "Send the plumber quote",
  "Call back about the October dates",
  "Send photos after the clean",
  "Confirm the locksmith booking",
  "Share the pricing plan for next month",
  "Send the cleaning schedule to the insurer",
  "Let the owner know when the dishwasher is fixed",
  "Follow up on the guest damage claim",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small deterministic PRNG so the seed is the same every run. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function firstName(name: string) {
  return name.split(" ")[0];
}

export function fill(template: string, name: string) {
  return template.replace(/\{first\}/g, firstName(name));
}

/** A Brisbane business-hours moment `daysAgo` days before `now`. Weekends roll back to Friday. */
export function businessMoment(now: Date, daysAgo: number, hour: number, minute = 0): Date {
  const d = new TZDate(now, TZ);
  let t = new TZDate(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo, hour, minute, 0, 0, TZ);
  while (t.getDay() === 0 || t.getDay() === 6) {
    t = new TZDate(t.getFullYear(), t.getMonth(), t.getDate() - 1, hour, minute, 0, 0, TZ);
  }
  return new Date(t.getTime());
}

function uuid() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// The dataset
// ---------------------------------------------------------------------------

export type SeedProperty = { id: string; name: string };

export type SeedInput = {
  properties: SeedProperty[];
  /** staff email → lane_staff.id, for those that exist as users. */
  staffIds: Map<string, string>;
  now?: Date;
};

export type SeedDataset = {
  owners: OwnerRow[];
  contactPoints: ContactPointRow[];
  ownerProperties: OwnerPropertyRow[];
  interactions: InteractionRow[];
  loops: LoopRow[];
  commitments: CommitmentRow[];
  outreach: OutreachRow[];
  nps: NpsRow[];
  syncState: { key: string; value: Json }[];
};

export function buildSeedDataset(input: SeedInput): SeedDataset {
  const now = input.now ?? new Date();
  const rand = mulberry32(20260928);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const staffId = (email: string) => input.staffIds.get(email) ?? null;
  const pmEmails = PM_EMAILS.filter((e) => input.staffIds.has(e));
  const directorId = staffId("liam@laneproperty.com.au") ?? staffId("dan@laneproperty.com.au");

  const owners: OwnerRow[] = [];
  const contactPoints: ContactPointRow[] = [];
  const ownerProperties: OwnerPropertyRow[] = [];
  const interactions: InteractionRow[] = [];
  const loops: LoopRow[] = [];
  const commitments: CommitmentRow[] = [];
  const outreach: OutreachRow[] = [];
  const nps: NpsRow[] = [];

  const ownerCount = Math.min(OWNER_TEMPLATES.length, Math.max(input.properties.length, 8));
  const ownerPm = new Map<string, string | null>();
  const ownerProperty = new Map<string, SeedProperty | null>();

  for (let i = 0; i < ownerCount; i++) {
    const t = OWNER_TEMPLATES[i];
    const id = uuid();
    const pmEmail = pmEmails.length ? pmEmails[i % pmEmails.length] : null;
    const pmId = pmEmail ? staffId(pmEmail) : null;
    const property = input.properties[i] ?? null;
    ownerPm.set(id, pmId);
    ownerProperty.set(id, property);
    const onboarded = new Date(now.getTime() - t.onboardedDaysAgo * 86400000);
    owners.push({
      id,
      name: t.name,
      primary_email: t.email,
      primary_phone: t.phone,
      preferred_contact: t.preferred,
      assigned_pm_id: pmId,
      hubspot_contact_id: `${SEED_OWNER_PREFIX}${i + 1}`,
      onboarded_at: onboarded.toISOString().slice(0, 10),
      expected_occupancy: t.expectedOccupancy,
      health: t.health,
      health_reason: t.healthReason,
      health_updated_at: now.toISOString(),
      cadence_days: t.health === "green" && t.onboardedDaysAgo > 90 ? 90 : 30,
      notes: null,
      is_active: true,
    });
    contactPoints.push({ owner_id: id, kind: "email", value: t.email, is_primary: true });
    contactPoints.push({ owner_id: id, kind: "call", value: t.phone, is_primary: true });
    if (property) ownerProperties.push({ owner_id: id, property_id: property.id });
  }

  const meta = (extra: Record<string, Json> = {}): Json => ({ [SEED_TAG]: true, ...extra });

  const addInteraction = (row: Omit<InteractionRow, "id" | "metadata"> & { metadata?: Record<string, Json> }): InteractionRow => {
    const r: InteractionRow = { ...row, id: uuid(), metadata: meta(row.metadata) };
    interactions.push(r);
    return r;
  };

  let seq = 0;
  const ext = (prefix: string) => `seed-${prefix}-${++seq}`;

  // Closed history: 60 days of email threads, calls and texts per owner.
  for (const owner of owners) {
    const pmId = ownerPm.get(owner.id) ?? null;
    const property = ownerProperty.get(owner.id) ?? null;
    const pmEmail = pmEmails.length ? pmEmails[owners.indexOf(owner) % pmEmails.length] : "priya@laneproperty.com.au";
    const touches = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < touches; k++) {
      const daysAgo = 3 + Math.floor(rand() * 56);
      const hour = 8 + Math.floor(rand() * 9);
      const at = businessMoment(now, daysAgo, hour, Math.floor(rand() * 60));
      const roll = rand();
      if (roll < 0.5) {
        const thread = pick(EMAIL_THREADS);
        const threadId = `seed-thread-${owner.id.slice(0, 8)}-${k}`;
        const inbound = addInteraction({
          owner_id: owner.id,
          property_id: property?.id ?? null,
          staff_id: pmId,
          channel: "email",
          direction: "inbound",
          occurred_at: at.toISOString(),
          subject: thread.subject,
          body: thread.body,
          external_id: ext("email"),
          thread_id: threadId,
          ai_summary: thread.subject,
          churn_flag: /reconsidering|other agency/i.test(thread.body),
          metadata: { from: owner.primary_email ?? "", to: pmEmail },
        });
        const replyMinutes = 20 + Math.floor(rand() * 300);
        const replyAt = new Date(at.getTime() + replyMinutes * 60000);
        const reply = addInteraction({
          owner_id: owner.id,
          property_id: property?.id ?? null,
          staff_id: pmId,
          channel: "email",
          direction: "outbound",
          occurred_at: replyAt.toISOString(),
          subject: `Re: ${thread.subject}`,
          body: fill(thread.reply, owner.name),
          external_id: ext("email"),
          thread_id: threadId,
          metadata: { from: pmEmail, to: owner.primary_email ?? "" },
        });
        loops.push({
          id: uuid(),
          owner_id: owner.id,
          property_id: property?.id ?? null,
          assigned_pm_id: pmId,
          type: "email",
          status: "closed",
          opened_at: at.toISOString(),
          due_at: dueAtFor("email", at).toISOString(),
          closed_at: replyAt.toISOString(),
          closed_by: pmId,
          close_kind: "evidence",
          trigger_interaction_id: inbound.id,
          closing_interaction_id: reply.id,
          thread_id: threadId,
          summary: thread.subject,
        });
        if (rand() < 0.3) {
          const text = pick(COMMITMENT_TEXTS);
          const due = new Date(replyAt.getTime() + (2 + Math.floor(rand() * 5)) * 86400000);
          const kept = rand() < 0.7;
          commitments.push({
            id: uuid(),
            owner_id: owner.id,
            made_by: pmId,
            source_interaction_id: reply.id,
            text,
            made_at: replyAt.toISOString(),
            due_at: due.toISOString(),
            status: due < now ? (kept ? "kept" : "missed") : "open",
            kept_at: due < now && kept ? new Date(due.getTime() - 3600000).toISOString() : null,
            close_kind: due < now && kept ? "evidence" : null,
            missed_at: due < now && !kept ? due.toISOString() : null,
          });
        }
      } else if (roll < 0.8) {
        const answered = rand() < 0.7;
        const callAt = at;
        addInteraction({
          owner_id: owner.id,
          property_id: property?.id ?? null,
          staff_id: pmId,
          channel: "call",
          direction: rand() < 0.5 ? "inbound" : "outbound",
          occurred_at: callAt.toISOString(),
          external_id: ext("call"),
          call_answered: answered,
          call_duration_seconds: answered ? 120 + Math.floor(rand() * 900) : 0,
          ai_summary: answered ? pick(CALL_SUMMARIES) : null,
          metadata: { dialpad_user_id: SEED_STAFF.find((s) => s.email === pmEmail)?.dialpadUserId ?? null },
        });
      } else {
        const sms = pick(SMS_TEMPLATES.inbound);
        const inbound = addInteraction({
          owner_id: owner.id,
          property_id: property?.id ?? null,
          staff_id: pmId,
          channel: "sms",
          direction: "inbound",
          occurred_at: at.toISOString(),
          body: sms,
          external_id: ext("sms"),
        });
        const replyAt = new Date(at.getTime() + (5 + Math.floor(rand() * 50)) * 60000);
        const reply = addInteraction({
          owner_id: owner.id,
          property_id: property?.id ?? null,
          staff_id: pmId,
          channel: "sms",
          direction: "outbound",
          occurred_at: replyAt.toISOString(),
          body: fill(pick(SMS_TEMPLATES.outbound), owner.name),
          external_id: ext("sms"),
        });
        loops.push({
          id: uuid(),
          owner_id: owner.id,
          property_id: property?.id ?? null,
          assigned_pm_id: pmId,
          type: "sms",
          status: "closed",
          opened_at: at.toISOString(),
          due_at: dueAtFor("sms", at).toISOString(),
          closed_at: replyAt.toISOString(),
          closed_by: pmId,
          close_kind: "evidence",
          trigger_interaction_id: inbound.id,
          closing_interaction_id: reply.id,
          summary: sms,
        });
      }
    }
  }

  // Open loops in mixed states. Named owners first so the queue reads well.
  type OpenSpec = {
    ownerIndex: number;
    type: "email" | "missed_call" | "sms" | "maintenance" | "detractor";
    minutesAgo: number;
    texted?: boolean;
    threadIndex?: number;
  };
  const openSpecs: OpenSpec[] = [
    { ownerIndex: 0, type: "email", minutesAgo: 98, threadIndex: 1 }, // Sarah Whitfield, waiting
    { ownerIndex: 1, type: "missed_call", minutesAgo: 25 }, // Graham Oduya
    { ownerIndex: 2, type: "email", minutesAgo: 330, threadIndex: 6 }, // Helen Marsh, past due
    { ownerIndex: 3, type: "sms", minutesAgo: 12 }, // Kiri Tane
    { ownerIndex: 4, type: "email", minutesAgo: 45, threadIndex: 0 }, // David Lim
    { ownerIndex: 5, type: "missed_call", minutesAgo: 140, texted: true }, // Mark Delaney, texted not called
    { ownerIndex: 6, type: "maintenance", minutesAgo: 200 }, // Anna Petrakis
    { ownerIndex: 7, type: "email", minutesAgo: 15, threadIndex: 2 },
    { ownerIndex: 8, type: "sms", minutesAgo: 95 }, // past due
    { ownerIndex: 9, type: "maintenance", minutesAgo: 30 },
    { ownerIndex: 10, type: "missed_call", minutesAgo: 8 },
    { ownerIndex: 19, type: "detractor", minutesAgo: 60 * 30 }, // Sam Kowalski, director loop, past due
  ];

  const openedFrom = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60000);

  for (const spec of openSpecs) {
    const owner = owners[spec.ownerIndex];
    if (!owner) continue;
    const pmId = ownerPm.get(owner.id) ?? null;
    const property = ownerProperty.get(owner.id) ?? null;
    const openedAt = openedFrom(spec.minutesAgo);
    let trigger: InteractionRow | null = null;
    let threadId: string | null = null;
    let summary: string | null = null;

    if (spec.type === "email") {
      const thread = EMAIL_THREADS[spec.threadIndex ?? 0];
      threadId = `seed-open-thread-${owner.id.slice(0, 8)}`;
      summary = thread.subject;
      trigger = addInteraction({
        owner_id: owner.id,
        property_id: property?.id ?? null,
        staff_id: pmId,
        channel: "email",
        direction: "inbound",
        occurred_at: openedAt.toISOString(),
        subject: thread.subject,
        body: thread.body,
        external_id: ext("email"),
        thread_id: threadId,
        ai_summary: thread.subject,
        ai_intent: /payout|statement/i.test(thread.subject) ? "payout" : /reconsidering/i.test(thread.body) ? "churn_risk" : "general",
        churn_flag: /reconsidering|other agency/i.test(thread.body),
      });
    } else if (spec.type === "missed_call") {
      summary = "Missed call";
      trigger = addInteraction({
        owner_id: owner.id,
        property_id: property?.id ?? null,
        staff_id: pmId,
        channel: "call",
        direction: "inbound",
        occurred_at: openedAt.toISOString(),
        external_id: ext("call"),
        call_answered: false,
        call_duration_seconds: 0,
      });
      if (spec.texted) {
        addInteraction({
          owner_id: owner.id,
          property_id: property?.id ?? null,
          staff_id: pmId,
          channel: "sms",
          direction: "outbound",
          occurred_at: new Date(openedAt.getTime() + 10 * 60000).toISOString(),
          body: fill(SMS_TEMPLATES.outbound[3], owner.name),
          external_id: ext("sms"),
        });
      }
    } else if (spec.type === "sms") {
      summary = pick(SMS_TEMPLATES.inbound);
      trigger = addInteraction({
        owner_id: owner.id,
        property_id: property?.id ?? null,
        staff_id: pmId,
        channel: "sms",
        direction: "inbound",
        occurred_at: openedAt.toISOString(),
        body: summary,
        external_id: ext("sms"),
      });
    } else if (spec.type === "maintenance") {
      summary = pick(MAINTENANCE_DESCRIPTIONS);
      trigger = addInteraction({
        owner_id: owner.id,
        property_id: property?.id ?? null,
        staff_id: null,
        channel: "maintenance",
        direction: "internal",
        occurred_at: openedAt.toISOString(),
        subject: "New maintenance issue",
        body: summary,
        external_id: ext("maint"),
      });
    } else if (spec.type === "detractor") {
      summary = "Scored us 3 after the dishwasher repair";
      trigger = addInteraction({
        owner_id: owner.id,
        property_id: property?.id ?? null,
        staff_id: null,
        channel: "nps",
        direction: "inbound",
        occurred_at: openedAt.toISOString(),
        subject: "Survey response: 3",
        body: "It took three weeks to get the dishwasher looked at and I had to chase twice.",
        external_id: ext("nps"),
      });
    }

    const loop: LoopRow = {
      id: uuid(),
      owner_id: owner.id,
      property_id: property?.id ?? null,
      assigned_pm_id: spec.type === "detractor" ? directorId ?? pmId : pmId,
      type: spec.type,
      status: "open",
      opened_at: openedAt.toISOString(),
      due_at: dueAtFor(spec.type, openedAt).toISOString(),
      trigger_interaction_id: trigger?.id ?? null,
      thread_id: threadId,
      summary,
      texted_not_called: Boolean(spec.texted),
    };
    loops.push(loop);

    if (spec.type === "detractor" && trigger) {
      nps.push({
        id: uuid(),
        owner_id: owner.id,
        kind: "maintenance_closed",
        score: 3,
        comment: trigger.body ?? null,
        responded_at: openedAt.toISOString(),
        external_id: ext("nps-ext"),
        loop_id: loop.id,
        interaction_id: trigger.id,
      });
    }
  }

  // A few suggested and open follow-ups due soon.
  const soonSpecs: { ownerIndex: number; text: string; daysAhead: number; status: "suggested" | "open" }[] = [
    { ownerIndex: 0, text: "Send the plumber quote", daysAhead: 1, status: "open" },
    { ownerIndex: 1, text: "Call back about the October dates", daysAhead: 0, status: "open" },
    { ownerIndex: 4, text: "Share the pricing plan for next month", daysAhead: 2, status: "suggested" },
    { ownerIndex: 6, text: "Let the owner know when the dishwasher is fixed", daysAhead: 1, status: "suggested" },
    { ownerIndex: 11, text: "Send photos after the clean", daysAhead: 3, status: "open" },
    { ownerIndex: 13, text: "Confirm the locksmith booking", daysAhead: -1, status: "open" },
  ];
  for (const s of soonSpecs) {
    const owner = owners[s.ownerIndex];
    if (!owner) continue;
    const due = businessMoment(now, -s.daysAhead, 17);
    commitments.push({
      id: uuid(),
      owner_id: owner.id,
      made_by: ownerPm.get(owner.id) ?? null,
      text: s.text,
      made_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
      due_at: due.toISOString(),
      status: s.status,
    });
  }

  // Outreach tasks with a talking point.
  const outreachSpecs: { ownerIndex: number; source: "cadence" | "occupancy" | "review"; point: string }[] = [
    { ownerIndex: 12, source: "cadence", point: "Ninety days since the last catch-up. Bookings are up 12% on last spring." },
    { ownerIndex: 10, source: "occupancy", point: "Next 30 days are at 48% against a 70% forecast. Midweek rate could come down." },
    { ownerIndex: 4, source: "review", point: "A guest left three stars and mentioned the wifi. Worth a heads up before he sees it." },
  ];
  for (const s of outreachSpecs) {
    const owner = owners[s.ownerIndex];
    if (!owner) continue;
    outreach.push({
      id: uuid(),
      owner_id: owner.id,
      property_id: ownerProperty.get(owner.id)?.id ?? null,
      assigned_pm_id: ownerPm.get(owner.id) ?? null,
      source: s.source,
      talking_point: s.point,
      due_at: businessMoment(now, -2, 17).toISOString(),
      status: "open",
    });
  }

  // NPS responses: a spread of scores.
  const npsSpecs: { ownerIndex: number; score: number; kind: "quarterly" | "onboarding" | "maintenance_closed"; comment: string | null; daysAgo: number }[] = [
    { ownerIndex: 1, score: 9, kind: "quarterly", comment: "Always easy to reach.", daysAgo: 20 },
    { ownerIndex: 3, score: 10, kind: "onboarding", comment: "Smooth start, thank you.", daysAgo: 12 },
    { ownerIndex: 6, score: 8, kind: "quarterly", comment: null, daysAgo: 33 },
    { ownerIndex: 0, score: 6, kind: "maintenance_closed", comment: "The repair took longer than I hoped.", daysAgo: 9 },
    { ownerIndex: 12, score: 9, kind: "quarterly", comment: null, daysAgo: 41 },
  ];
  for (const s of npsSpecs) {
    const owner = owners[s.ownerIndex];
    if (!owner) continue;
    nps.push({
      id: uuid(),
      owner_id: owner.id,
      kind: s.kind,
      score: s.score,
      comment: s.comment,
      responded_at: businessMoment(now, s.daysAgo, 11).toISOString(),
      external_id: ext("nps-ext"),
    });
  }

  // Owner last-contact stamps from the interactions above.
  for (const owner of owners) {
    const mine = interactions.filter((i) => i.owner_id === owner.id).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    owner.last_contact_at = mine[0]?.occurred_at ?? null;
    owner.last_outbound_at = mine.find((i) => i.direction === "outbound")?.occurred_at ?? null;
  }

  const syncState = [
    { key: "seed", value: { seeded_at: now.toISOString(), owners: owners.length } as Json },
    { key: "dialpad", value: { last_sync: new Date(now.getTime() - 3600000).toISOString() } as Json },
    { key: "maintenance:issues", value: { last_sync: new Date(now.getTime() - 3600000).toISOString() } as Json },
    ...pmEmails.map((e) => ({
      key: `gmail:${input.staffIds.get(e)}`,
      value: { last_sync: new Date(now.getTime() - 3600000).toISOString() } as Json,
    })),
  ];

  return { owners, contactPoints, ownerProperties, interactions, loops, commitments, outreach, nps, syncState };
}

// ---------------------------------------------------------------------------
// Mock integration events: a few "new" things each half hour, deterministic
// within the half hour so a re-run does not duplicate them.
// ---------------------------------------------------------------------------

export type MockOwner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pmEmail: string | null;
  pmDialpadUserId: string | null;
  pmStaffId: string | null;
};

export function mockBucket(now: Date, minutes = 30): number {
  return Math.floor(now.getTime() / (minutes * 60000));
}

export function mockGmailEvents(owners: MockOwner[], now: Date = new Date()): (InboundEmail | OutboundEmail)[] {
  if (!owners.length) return [];
  const bucket = mockBucket(now);
  const rand = mulberry32(bucket);
  const out: (InboundEmail | OutboundEmail)[] = [];
  const count = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < count; i++) {
    const owner = owners[Math.floor(rand() * owners.length)];
    if (!owner.email || !owner.pmEmail) continue;
    const thread = EMAIL_THREADS[Math.floor(rand() * EMAIL_THREADS.length)];
    const threadId = `mock-thread-${bucket}-${i}`;
    const at = new Date(now.getTime() - (5 + i * 7) * 60000);
    out.push({
      kind: "email",
      direction: "inbound",
      externalId: `mock-gmail-${bucket}-${i}`,
      threadId,
      messageIdHeader: `<mock-${bucket}-${i}@mail.gmail.com>`,
      from: owner.email,
      to: [owner.pmEmail],
      subject: thread.subject,
      body: thread.body,
      occurredAt: at,
      isAutoReply: false,
      staffId: owner.pmStaffId,
      staffEmail: owner.pmEmail,
    });
  }
  // One auto-reply per bucket to prove they are ignored.
  const owner = owners[bucket % owners.length];
  if (owner.email && owner.pmEmail) {
    out.push({
      kind: "email",
      direction: "inbound",
      externalId: `mock-gmail-${bucket}-auto`,
      threadId: `mock-thread-${bucket}-auto`,
      from: owner.email,
      to: [owner.pmEmail],
      subject: AUTO_REPLY_SUBJECT,
      body: "I am away until Monday and will reply when I am back.",
      occurredAt: new Date(now.getTime() - 3 * 60000),
      isAutoReply: true,
      staffId: owner.pmStaffId,
      staffEmail: owner.pmEmail,
    });
  }
  return out;
}

export function mockDialpadEvents(owners: MockOwner[], now: Date = new Date()): (CallEvent | SmsEvent)[] {
  if (!owners.length) return [];
  const bucket = mockBucket(now);
  const rand = mulberry32(bucket + 7);
  const out: (CallEvent | SmsEvent)[] = [];
  const a = owners[Math.floor(rand() * owners.length)];
  const b = owners[Math.floor(rand() * owners.length)];
  const lane = "+61730000000";
  if (a.phone) {
    out.push({
      kind: "call",
      externalId: `mock-call-${bucket}-0`,
      direction: "inbound",
      state: "missed",
      fromNumber: a.phone,
      toNumber: lane,
      contactNumber: a.phone,
      durationSeconds: 0,
      occurredAt: new Date(now.getTime() - 9 * 60000),
      dialpadUserId: a.pmDialpadUserId,
      staffId: a.pmStaffId,
    });
  }
  if (b.phone) {
    out.push({
      kind: "sms",
      externalId: `mock-sms-${bucket}-0`,
      direction: "inbound",
      fromNumber: b.phone,
      toNumber: lane,
      contactNumber: b.phone,
      body: SMS_TEMPLATES.inbound[bucket % SMS_TEMPLATES.inbound.length],
      occurredAt: new Date(now.getTime() - 4 * 60000),
      dialpadUserId: b.pmDialpadUserId,
      staffId: b.pmStaffId,
    });
  }
  return out;
}
