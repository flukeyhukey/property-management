import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { canReassign, requireStaff } from "@/lib/auth";
import { businessMinutesBetween, formatMinutes } from "@/lib/domain/time";
import { CHANNEL_LABEL, LOOP_TYPE_LABEL, type Channel, type Commitment, type Loop } from "@/lib/domain/types";
import {
  TIMELINE_CHANNELS,
  firstName,
  getOwner360,
  issueStatusLabel,
  normalisePct,
  type Owner360,
  type TimelineItem,
} from "@/lib/queries/owners";
import { summariseLast30Days } from "@/lib/ai/summarise";
import { MobileTopBar } from "@/components/page-header";
import { ChannelIcon, ChevronRight, ClipboardList, LoopTypeIcon, Mail, Phone, StickyNote } from "@/components/ui/icons";
import { ButtonLink, Card, EmptyState, HealthDot, Tag, cx } from "@/components/ui/primitives";
import { NotesForm } from "../_components/NotesForm";
import { ReassignSelect } from "../_components/ReassignSelect";
import { Tabs } from "../_components/Tabs";
import { TimelineFilters } from "../_components/TimelineFilters";
import { ago, contactMethodLabel, inDays, longDate, monthYear, pct, plural, regionsSentence, shortDate, waitLabel, whenLabel } from "../_components/format";

const TABS = ["timeline", "reply", "followups", "maintenance", "properties", "notes"] as const;
type Tab = (typeof TABS)[number];
const CHANNELS = new Set<string>(TIMELINE_CHANNELS.map((c) => c.value).filter(Boolean));

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function OwnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tabParam = first(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : "timeline";
  const channelParam = first(sp.channel);
  const channel = CHANNELS.has(channelParam) ? (channelParam as Channel) : "";
  const q = first(sp.q).trim();

  const data = await getOwner360(id, { channel: channel || null, q: q || null });
  if (!data) notFound();

  const { owner } = data;
  const now = new Date();
  const name = firstName(owner.name);
  const regions = Array.from(new Set(data.properties.map((p) => p.property.region).filter((r): r is string => Boolean(r))));
  const emailLoop = data.openLoops.find((l) => l.type === "email");
  const openCommitments = data.commitments.filter((c) => c.status === "open" || c.status === "suggested");
  const keptCommitments = data.commitments.filter((c) => c.status === "kept");
  const lateCommitments = data.commitments.filter((c) => c.status === "missed");
  const openIssues = data.issues.filter((i) => !isSorted(i.issue.status));

  const leadParts = [
    `${plural(data.properties.length, "property", "properties")}${regions.length ? ` on ${regionsSentence(regions)}` : ""}`,
    owner.onboarded_at ? `Owner since ${monthYear(owner.onboarded_at)}` : null,
    data.pm ? `Assigned to ${data.pm.name}` : "Not assigned yet",
    `Prefers ${contactMethodLabel(owner.preferred_contact)}`,
  ].filter(Boolean);

  const tabs = [
    { value: "timeline", label: "Timeline" },
    { value: "reply", label: "To reply", count: data.openLoops.length },
    { value: "followups", label: "Follow-ups", count: openCommitments.length },
    { value: "maintenance", label: "Maintenance", count: openIssues.length },
    { value: "properties", label: "Properties", count: data.properties.length },
    { value: "notes", label: "Notes and preferences" },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <MobileTopBar staff={staff} />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-66">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/owners" className="text-ink-66 no-underline hover:text-ink">
                Owners
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-ink" aria-current="page">
              {owner.name}
            </li>
          </ol>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="display text-[28px] leading-[1.1] sm:text-[40px] [text-wrap:balance]">{owner.name}</h1>
            <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink-78 sm:text-[16px]">{leadParts.join(" · ")}</p>
            {canReassign(staff) ? (
              <div className="flex items-center gap-2 text-sm text-ink-66">
                <span>Managed by</span>
                <ReassignSelect ownerId={owner.id} ownerName={owner.name} currentPmId={owner.assigned_pm_id} staff={data.staff.map((s) => ({ id: s.id, name: s.name }))} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {owner.primary_phone ? (
              <ButtonLink href={`tel:${owner.primary_phone.replace(/\s+/g, "")}`} variant="primary">
                <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                Call {name}
              </ButtonLink>
            ) : null}
            {emailLoop ? (
              <ButtonLink href={`/loops/${emailLoop.id}`} variant="secondary">
                <Mail className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                Reply to {name}&rsquo;s email
              </ButtonLink>
            ) : owner.primary_email ? (
              <ButtonLink href={`mailto:${owner.primary_email}`} variant="secondary">
                <Mail className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                Email {name}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <HealthCard data={data} now={now} />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            value={data.occupancy.thisYear === null ? "–" : pct(data.occupancy.thisYear)}
            label={
              data.occupancy.thisYear === null
                ? `Occupancy, ${data.occupancy.monthLabel}. No booking data yet`
                : `Occupancy, ${data.occupancy.monthLabel}${data.occupancy.lastYear !== null ? ` · ${pct(data.occupancy.lastYear)} in ${data.occupancy.lastYearLabel}` : ""}`
            }
          />
          <StatCard value="[PAYOUT]" label="Payout · Resly payout data not connected yet" />
          <StatCard
            value={data.lastContactFromUs ? daysLabel(data.lastContactFromUs.at, now) : "–"}
            label={
              data.lastContactFromUs
                ? `Last contact from us · ${data.lastContactFromUs.staffName ? firstName(data.lastContactFromUs.staffName) : "Lane"} by ${CHANNEL_LABEL[data.lastContactFromUs.channel].toLowerCase()}, ${shortDate(data.lastContactFromUs.at)}`
                : "Last contact from us · Nothing recorded yet"
            }
          />
          <StatCard
            value={`${owner.cadence_days} days`}
            label={`Contact cadence · Next catch-up ${data.nextCatchUpAt ? inDays(data.nextCatchUpAt, now) : "not set"}${data.nextCatchUpAt ? `, ${shortDate(data.nextCatchUpAt)}` : ""}`}
          />
        </div>

        {/* Body */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-w-0 flex-col gap-4">
            <Tabs tabs={tabs} active={tab} />
            {tab === "timeline" ? <TimelinePanel data={data} channel={channel} q={q} now={now} /> : null}
            {tab === "reply" ? <ReplyPanel loops={data.openLoops} now={now} /> : null}
            {tab === "followups" ? <FollowUpsPanel open={openCommitments} kept={keptCommitments} late={lateCommitments} now={now} /> : null}
            {tab === "maintenance" ? <MaintenancePanel data={data} now={now} /> : null}
            {tab === "properties" ? <PropertiesPanel data={data} /> : null}
            {tab === "notes" ? (
              <Card className="p-4 sm:p-5">
                <h2 className="mb-4 text-[17px] font-semibold">Notes and preferences</h2>
                <ContactPoints data={data} />
                <NotesForm ownerId={owner.id} notes={owner.notes ?? ""} preferredContact={owner.preferred_contact} />
              </Card>
            ) : null}
          </section>

          <aside className="flex flex-col gap-4">
            <SideCard title="Waiting on a reply" href={`/owners/${owner.id}?tab=reply`}>
              {data.openLoops.length === 0 ? (
                <p className="text-sm text-ink-66">Nothing waiting. Nice.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.openLoops.slice(0, 3).map((l) => (
                    <li key={l.id}>
                      <Link href={`/loops/${l.id}`} className="flex items-start gap-3 no-underline">
                        <LoopTypeIcon type={l.type} className="mt-0.5 h-5 w-5 shrink-0 text-ink-66" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-semibold text-ink">{l.summary ?? LOOP_TYPE_LABEL[l.type]}</span>
                          <span className="text-xs text-ink-66">Waiting {formatMinutes(Math.max(1, businessMinutesBetween(new Date(l.opened_at), now)))}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SideCard>

            <SideCard title="Follow-ups" href={`/owners/${owner.id}?tab=followups`}>
              <p className="num mb-3 text-sm text-ink-78">
                {openCommitments.length} open · {keptCommitments.length} done · {lateCommitments.length} ran late
              </p>
              {data.commitments.length === 0 ? (
                <p className="text-sm text-ink-66">No follow-ups yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {[...data.commitments]
                    .sort((a, b) => Date.parse(b.made_at) - Date.parse(a.made_at))
                    .slice(0, 3)
                    .map((c) => (
                      <li key={c.id} className="flex flex-col gap-0.5">
                        <span className="text-sm text-ink">{c.text}</span>
                        <span className="text-xs text-ink-66">{commitmentStatusLine(c, now)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </SideCard>

            <SideCard title="Properties" href={`/owners/${owner.id}?tab=properties`}>
              {data.properties.length === 0 ? (
                <p className="text-sm text-ink-66">No properties linked yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.properties.map((p) => (
                    <li key={p.property.id ?? p.property.name ?? ""} className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-ink">{p.property.name ?? "Unnamed property"}</span>
                      <span className="text-xs text-ink-66">
                        {[p.property.region, p.snapshot?.occupancy_month !== null && p.snapshot?.occupancy_month !== undefined ? `${normalisePct(p.snapshot.occupancy_month)}% this month` : null, p.reviewAverage !== null ? `${p.reviewAverage} stars` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SideCard>

            <SideCard title="Notes and preferences">
              <NotesForm ownerId={owner.id} notes={owner.notes ?? ""} preferredContact={owner.preferred_contact} compact />
            </SideCard>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function isSorted(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "resolved" || s === "closed" || s === "done" || s === "sorted";
}

function daysLabel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86400000);
  if (days <= 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function commitmentStatusLine(c: Commitment, now: Date): string {
  switch (c.status) {
    case "kept":
      return `Done ${c.kept_at ? ago(c.kept_at, now) : ""}`.trim();
    case "missed":
      return `Ran late · was due ${shortDate(c.due_at)}${c.draft_update ? " · Draft ready" : ""}`;
    case "suggested":
      return `Suggested · due ${shortDate(c.due_at)}`;
    default:
      return Date.parse(c.due_at) < now.getTime() ? `Due ${shortDate(c.due_at)} · Draft ready` : `Due ${inDays(c.due_at, now)}`;
  }
}

function StatCard({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-3 sm:p-5">
      <span className="display num text-2xl leading-none sm:text-[28px]">{value}</span>
      <span className="text-xs leading-snug text-ink-66 sm:text-[13px]">{label}</span>
    </Card>
  );
}

function SideCard({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className="inline-flex h-11 items-center gap-0.5 text-sm text-ink-66 no-underline hover:text-ink" scroll={false}>
            See all
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function HealthCard({ data, now }: { data: Owner360; now: Date }) {
  const { owner, healthInputs: h } = data;
  const headline = owner.health === "red" ? "Needs attention" : owner.health === "amber" ? "Needs some care" : "Owner is happy";
  const reason = owner.health_reason ?? data.healthSnapshot?.reason ?? (owner.health === "green" ? "Nothing is waiting and the last few conversations were easy." : "Have a look at the inputs below.");
  const occ =
    h.occupancy.actual === null
      ? "No booking data yet"
      : h.occupancy.expected === null
        ? `${pct(h.occupancy.actual)}, no expectation set`
        : `${pct(h.occupancy.actual)} against ${pct(h.occupancy.expected)} hoped for`;
  const inputs: { label: string; value: string }[] = [
    { label: "Follow-ups that ran late, 90 days", value: h.lateFollowUps90 === 0 ? "None" : String(h.lateFollowUps90) },
    { label: "Tone of recent emails", value: h.tone ?? "No recent emails" },
    { label: "Waiting on a reply", value: waitLabel(h.waitingMinutes) },
    { label: "Usual reply time, 90 days", value: h.usualReplyMinutes === null ? "No loops closed yet" : formatMinutes(Math.round(h.usualReplyMinutes)) },
    { label: `Occupancy vs ${owner.name.split(" ")[0]}'s expectation`, value: occ },
    { label: "Latest survey score", value: h.latestSurvey === null ? "Not surveyed yet" : `${h.latestSurvey} out of 10` },
  ];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <HealthDot health={owner.health} />
        <h2 className={cx("text-[17px] font-semibold", owner.health === "red" ? "text-error" : owner.health === "amber" ? "text-amber" : "text-ink")}>{headline}</h2>
        {owner.health_updated_at ? <span className="ml-auto text-xs text-ink-66">Updated {ago(owner.health_updated_at, now)}</span> : null}
      </div>
      <p className="mt-1 max-w-[70ch] text-[15px] leading-relaxed text-ink-78">{reason}</p>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-3">
        {inputs.map((i) => (
          <div key={i.label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-ink-66">{i.label}</dt>
            <dd className="num text-[15px] font-semibold text-ink">{i.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ContactPoints({ data }: { data: Owner360 }) {
  const points = data.contactPoints.length
    ? data.contactPoints.map((c) => ({ kind: c.kind, value: c.value, primary: c.is_primary }))
    : [
        data.owner.primary_phone ? { kind: "call" as const, value: data.owner.primary_phone, primary: true } : null,
        data.owner.primary_email ? { kind: "email" as const, value: data.owner.primary_email, primary: true } : null,
      ].filter((p): p is { kind: "call" | "email"; value: string; primary: boolean } => Boolean(p));
  if (!points.length) return null;
  return (
    <ul className="mb-5 flex flex-col gap-2 border-b border-hairline pb-5">
      {points.map((p) => (
        <li key={`${p.kind}:${p.value}`} className="flex items-center gap-3 text-sm">
          {p.kind === "email" ? <Mail className="h-5 w-5 text-ink-66" strokeWidth={1.75} aria-hidden="true" /> : <Phone className="h-5 w-5 text-ink-66" strokeWidth={1.75} aria-hidden="true" />}
          <a href={p.kind === "email" ? `mailto:${p.value}` : `tel:${p.value.replace(/\s+/g, "")}`} className="text-ink">
            {p.value}
          </a>
          {p.primary ? <Tag tone="outline">Primary</Tag> : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

async function summaryOfLast30Days(data: Owner360): Promise<string> {
  try {
    const out = await summariseLast30Days(data.owner, data.recentInteractions, data.openLoops, data.commitments);
    if (out.trim()) return out.trim();
  } catch {
    // Fall through to the plain sentence below.
  }
  return plainSummary(data);
}

function plainSummary(data: Owner360): string {
  const name = firstName(data.owner.name);
  const ix = data.recentInteractions;
  const since = Date.now() - 30 * 86400000;
  const inboundEmails = ix.filter((i) => i.channel === "email" && i.direction === "inbound").length;
  const calls = ix.filter((i) => i.channel === "call").length;
  const texts = ix.filter((i) => i.channel === "sms").length;
  const kept = data.commitments.filter((c) => c.status === "kept" && c.kept_at && Date.parse(c.kept_at) >= since).length;
  const late = data.commitments.filter((c) => c.status === "missed" && c.missed_at && Date.parse(c.missed_at) >= since).length;
  const parts: string[] = [];
  if (inboundEmails) parts.push(`${plural(inboundEmails, "email")} from ${name}`);
  if (calls) parts.push(plural(calls, "call"));
  if (texts) parts.push(plural(texts, "text"));
  if (kept) parts.push(`${plural(kept, "follow-up")} kept`);
  if (late) parts.push(`${plural(late, "follow-up")} that ran late`);
  const opening = parts.length ? `In the last 30 days: ${parts.join(", ")}.` : `Quiet month: nothing from ${name} in the last 30 days.`;
  const waiting = data.openLoops.length ? ` ${name} is waiting on ${plural(data.openLoops.length, "reply", "replies")} right now.` : " Nothing is waiting on us.";
  return opening + waiting;
}

async function TimelinePanel({ data, channel, q, now }: { data: Owner360; channel: Channel | ""; q: string; now: Date }) {
  const summary = await summaryOfLast30Days(data);
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold">Summary of the last 30 days</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-78">{summary}</p>
      </Card>
      <TimelineFilters chips={TIMELINE_CHANNELS} channel={channel} q={q} />
      {data.timeline.length === 0 ? (
        <EmptyState title="Nothing here yet" body={q || channel ? "Try a different filter or search." : "The timeline fills in as emails, calls and texts arrive."} />
      ) : (
        <ol className="flex flex-col gap-2">
          {data.timeline.map((item) => (
            <TimelineRow key={item.id} item={item} now={now} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineIcon({ channel }: { channel: Channel }) {
  if (channel === "note") return <StickyNote className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />;
  if (channel === "commitment") return <ClipboardList className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />;
  return <ChannelIcon channel={channel} />;
}

function TimelineRow({ item, now }: { item: TimelineItem; now: Date }) {
  const inner = (
    <>
      <span
        className={cx(
          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          item.direction === "inbound" ? "bg-harbour-tint text-ink" : "bg-ground text-ink-66",
        )}
      >
        <TimelineIcon channel={item.channel} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[15px] font-semibold text-ink">{item.title}</span>
          <time dateTime={item.occurredAt} className="num text-xs text-ink-66">
            {whenLabel(item.occurredAt, now)}
          </time>
        </span>
        {item.body ? <span className="text-sm leading-relaxed text-ink-78">{item.body}</span> : null}
        {item.tags.length ? (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <Tag key={t} tone={t === "Ran late" || t === "Sounds unhappy" || t === "Time sensitive" ? "amber" : "outline"}>
                {t}
              </Tag>
            ))}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className="flex gap-3 rounded-[12px] border border-hairline bg-card p-4 no-underline hover:bg-ground">
          {inner}
        </Link>
      ) : (
        <div className="flex gap-3 rounded-[12px] border border-hairline bg-card p-4">{inner}</div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Other tabs
// ---------------------------------------------------------------------------

function ReplyPanel({ loops, now }: { loops: Loop[]; now: Date }) {
  if (!loops.length) return <EmptyState title="Nothing waiting" body="Every message from this owner has a reply." />;
  const sorted = [...loops].sort((a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at));
  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((l) => {
        const mins = Math.max(1, businessMinutesBetween(new Date(l.opened_at), now));
        return (
          <li key={l.id}>
            <Link href={`/loops/${l.id}`} className="flex items-start gap-3 rounded-[12px] border border-hairline bg-card p-4 no-underline hover:bg-ground">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-harbour-tint text-ink">
                <LoopTypeIcon type={l.type} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[15px] font-semibold text-ink">{LOOP_TYPE_LABEL[l.type]}</span>
                  <span className="num text-xs text-ink-66">Waiting {formatMinutes(mins)}</span>
                </span>
                {l.summary ? <span className="text-sm text-ink-78">{l.summary}</span> : null}
                <span className="text-xs text-ink-66">
                  Came in {whenLabel(l.opened_at, now)}
                  {l.snoozed_until && Date.parse(l.snoozed_until) > now.getTime() ? ` · Picking up ${inDays(l.snoozed_until, now)}` : ""}
                  {l.texted_not_called ? " · Texted, not called yet" : ""}
                  {l.ai_draft ? " · Draft ready" : ""}
                </span>
              </span>
              <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-ink-40" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function FollowUpsPanel({ open, kept, late, now }: { open: Commitment[]; kept: Commitment[]; late: Commitment[]; now: Date }) {
  if (!open.length && !kept.length && !late.length) {
    return <EmptyState title="No follow-ups yet" body="Promises made in emails and calls show up here, with a nudge before they are due." />;
  }
  const groups: { title: string; items: Commitment[]; empty: string }[] = [
    { title: "Open", items: [...open].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)), empty: "Nothing open." },
    { title: "Ran late", items: [...late].sort((a, b) => Date.parse(b.due_at) - Date.parse(a.due_at)), empty: "Nothing ran late. Nice." },
    { title: "Done", items: [...kept].sort((a, b) => Date.parse(b.kept_at ?? b.due_at) - Date.parse(a.kept_at ?? a.due_at)), empty: "Nothing done yet." },
  ];
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">
            {g.title} <span className="num text-ink-66">{g.items.length}</span>
          </h2>
          {g.items.length === 0 ? (
            <p className="text-sm text-ink-66">{g.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {g.items.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 rounded-[12px] border border-hairline bg-card p-4">
                  <span className="text-[15px] text-ink">{c.text}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-ink-66">
                    <span>{commitmentStatusLine(c, now)}</span>
                    <span>· Made {longDate(c.made_at)}</span>
                    {c.close_kind === "manual" && c.close_reason ? <Tag tone="outline">Closed by hand: {c.close_reason}</Tag> : null}
                  </span>
                  {c.status === "missed" && c.draft_update ? <p className="mt-1 border-l-2 border-hairline pl-3 text-sm leading-relaxed text-ink-78">{c.draft_update}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function MaintenancePanel({ data, now }: { data: Owner360; now: Date }) {
  if (!data.issues.length) return <EmptyState title="No maintenance on record" body="Issues raised by cleaners and guests on this owner's properties show up here." />;
  return (
    <ul className="flex flex-col gap-2">
      {data.issues.map(({ issue, property }) => (
        <li key={issue.id ?? `${issue.property_id}-${issue.created_at}`} className="flex flex-col gap-1 rounded-[12px] border border-hairline bg-card p-4">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[15px] font-semibold text-ink">{property?.name ?? "Property"}</span>
            {issue.created_at ? <span className="num text-xs text-ink-66">{whenLabel(issue.created_at, now)}</span> : null}
          </span>
          {issue.description ? <span className="text-sm leading-relaxed text-ink-78">{issue.description}</span> : null}
          <span className="mt-1 flex flex-wrap gap-1.5">
            {issue.status ? <Tag tone={isSorted(issue.status) ? "outline" : "tint"}>{issueStatusLabel(issue.status)}</Tag> : null}
            {issue.category ? <Tag tone="outline">{issue.category}</Tag> : null}
            {issue.severity ? <Tag tone="outline">{issue.severity}</Tag> : null}
            {issue.due_date ? <Tag tone="outline">Due {shortDate(issue.due_date)}</Tag> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PropertiesPanel({ data }: { data: Owner360 }) {
  if (!data.properties.length) return <EmptyState title="No properties linked yet" body="Link a property to this owner and their bookings and reviews will show here." />;
  return (
    <ul className="flex flex-col gap-2">
      {data.properties.map((p) => {
        const rows: { label: string; value: ReactNode }[] = [
          { label: "Region", value: p.property.region ?? "–" },
          { label: "Key number", value: p.property.key_number !== null ? <span className="num">{p.property.key_number}</span> : "–" },
          { label: "Building", value: p.property.building_name ?? "–" },
          { label: "Cleaning company", value: p.property.cleaning_company ?? "–" },
          {
            label: "Occupancy this month",
            value: p.snapshot?.occupancy_month !== null && p.snapshot?.occupancy_month !== undefined ? <span className="num">{normalisePct(p.snapshot.occupancy_month)}%</span> : "–",
          },
          {
            label: "Reviews",
            value: p.reviewAverage !== null ? (
              <span className="num">
                {p.reviewAverage} stars from {p.reviewCount}
              </span>
            ) : (
              "None yet"
            ),
          },
        ];
        return (
          <li key={p.property.id ?? p.property.name ?? ""} className="rounded-[12px] border border-hairline bg-card p-4">
            <h3 className="text-[15px] font-semibold text-ink">{p.property.name ?? "Unnamed property"}</h3>
            {p.property.address ? <p className="text-sm text-ink-66">{p.property.address}</p> : null}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {rows.map((r) => (
                <div key={r.label} className="flex flex-col">
                  <dt className="text-xs text-ink-66">{r.label}</dt>
                  <dd className="text-sm text-ink">{r.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
