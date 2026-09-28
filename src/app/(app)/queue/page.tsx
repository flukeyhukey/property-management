import { requireStaff } from "@/lib/auth";
import { timeLeftLabel } from "@/lib/domain/time";
import { getQueueForStaff, type QueueCommitment, type QueueLoopItem, type QueueOutreach } from "@/lib/queries/queue";
import { MobileTopBar } from "@/components/page-header";
import { EmptyState, Headline, Stat, cx } from "@/components/ui/primitives";
import { LoopCard, type LoopCardData } from "./_components/LoopCard";
import { PromptRow } from "./_components/PromptRow";
import { FollowUpRow } from "./_components/FollowUpRow";
import { OutreachRow } from "./_components/OutreachRow";
import { contextLine, daysAgo, firstName, numberWord, plural, propertyLine, timeOfDay } from "./_components/helpers";

export const metadata = { title: "Queue" };
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Shaping rows for the client components
// ---------------------------------------------------------------------------

function toCard(loop: QueueLoopItem, now: Date): LoopCardData {
  const { label, overdue } = timeLeftLabel(new Date(loop.due_at), now);
  const tags: string[] = [];
  if (loop.texted_not_called) tags.push("Texted, call still to do");
  if (loop.trigger?.churn_flag) tags.push("Sounds unhappy");
  if (loop.issue_id) tags.push("Relates to the repair booking");
  return {
    id: loop.id,
    type: loop.type,
    ownerId: loop.owner.id,
    ownerName: loop.owner.name,
    ownerHealth: loop.owner.health,
    phone: loop.owner.primary_phone,
    timeLabel: label,
    pastDue: overdue,
    contextLine: contextLine(loop.type, loop.property),
    summary: loop.summary ?? loop.trigger?.ai_summary ?? loop.trigger?.subject ?? null,
    tags,
  };
}

function relativeDay(iso: string, now: Date): string {
  const d = daysAgo(iso, now) ?? 0;
  if (d === 0) return "today’s";
  if (d === 1) return "yesterday’s";
  const weekday = new Date(iso).toLocaleDateString("en-AU", { weekday: "long", timeZone: "Australia/Brisbane" });
  return `${weekday}’s`;
}

function promptQuestion(c: QueueCommitment): string {
  const p = c.prompt_interaction;
  const who = c.owner.name;
  const when = p ? ` at ${timeOfDay(p.occurred_at)}` : "";
  const what = p?.channel === "email" ? `your email to ${who}` : p?.channel === "sms" ? `your text to ${who}` : `your call with ${who}`;
  return `did ${what}${when} cover ${c.text}?`;
}

function originLine(c: QueueCommitment, now: Date): string {
  const s = c.source_interaction;
  const verb = s?.channel === "call" ? "call" : "send it";
  if (!s) return `Added by hand · ticks off when you ${verb}`;
  const channel = s.channel === "call" ? "call" : s.channel === "sms" ? "text" : "email";
  return `From ${relativeDay(s.occurred_at, now)} ${channel} · ticks off when you ${verb}`;
}

function outreachMeta(o: QueueOutreach, now: Date): string {
  const days = daysAgo(o.owner.last_contact_at, now);
  const spoke = days === null ? "Not spoken yet" : days === 0 ? "Spoke today" : `Last spoke ${days} ${plural(days, "day", "days")} ago`;
  const where = o.property
    ? [o.property.suburb ?? o.property.region, o.property.bedrooms ? `${o.property.bedrooms}BR` : null].filter(Boolean).join(" ") ||
      propertyLine(o.property)
    : null;
  return where ? `${spoke} · ${where}` : spoke;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function GroupHeading({ label, tone }: { label: string; tone: "amber" | "harbour" | "grey" }) {
  const dot = tone === "amber" ? "bg-amber" : tone === "harbour" ? "bg-harbour" : "bg-ink-40";
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-66">
      <span aria-hidden="true" className={cx("inline-block h-2 w-2 rounded-full", dot)} />
      {label}
    </h3>
  );
}

export default async function QueuePage() {
  const staff = await requireStaff();
  const now = new Date();
  const { loops, commitments, outreach, stats } = await getQueueForStaff(staff.id, now);

  const ownerCount = new Set(loops.all.map((l) => l.owner.id)).size;
  const groups: { label: string; tone: "amber" | "harbour" | "grey"; items: QueueLoopItem[] }[] = [
    { label: "Start here", tone: "amber", items: loops.startHere },
    { label: "Next up", tone: "harbour", items: loops.nextUp },
    { label: "New today", tone: "grey", items: loops.newToday },
  ];

  const third =
    stats.waitingCount > 0
      ? {
          value: `${stats.waitingCount}`,
          label: `${stats.waitingCount === 1 ? "thing gets" : "things get"} you back to all caught up`,
        }
      : {
          value: `${stats.streakDays} ${plural(stats.streakDays, "day", "days")}`,
          label:
            stats.nextUpCount > 0
              ? `all caught up. ${capitalise(numberWord(stats.nextUpCount))} ${stats.nextUpCount === 1 ? "reply keeps" : "replies keep"} it going`
              : "all caught up. Nothing waiting. Nice",
        };

  return (
    <>
      <MobileTopBar staff={staff} />
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-10 px-4 py-5 lg:max-w-[760px] lg:px-8 lg:py-10">
        <section aria-label="Your numbers" className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat
            value={stats.answeredOnTimePct === null ? "New" : `${stats.answeredOnTimePct}%`}
            label={stats.answeredOnTimePct === null ? "no owner replies to count yet" : "of owners answered on time"}
          />
          <Stat
            value={stats.followUpsOnTimePct === null ? "New" : `${stats.followUpsOnTimePct}%`}
            label={stats.followUpsOnTimePct === null ? "no follow-ups to count yet" : "of follow-ups done on time"}
          />
          <Stat value={third.value} label={third.label} />
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Headline className="text-[28px] sm:text-[36px]">
              {loops.all.length === 0
                ? "Nothing waiting on you"
                : `${ownerCount} ${plural(ownerCount, "owner", "owners")} to get back to today`}
            </Headline>
            <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-78 sm:text-[16px]">
              {loops.all.length === 0
                ? "Nice. Anything new lands here the moment it arrives."
                : "Most pressing first. Each one comes with a summary and a drafted reply, so you can sort it in a tap."}
            </p>
          </div>
          {loops.all.length === 0 ? (
            <EmptyState title="Nothing waiting on you. Nice." body="Owners who write, call or text will show up here." />
          ) : (
            groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.label} className="flex flex-col gap-3">
                  <GroupHeading label={g.label} tone={g.tone} />
                  {g.items.map((loop) => (
                    <LoopCard key={loop.id} loop={toCard(loop, now)} />
                  ))}
                </div>
              ))
          )}
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Headline as="h2" className="text-[24px] sm:text-[30px]">
              {commitments.length === 0
                ? "No follow-ups due today"
                : `${commitments.length} ${plural(commitments.length, "follow-up", "follow-ups")} for today`}
            </Headline>
            <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-78 sm:text-[16px]">
              We tick these off for you as soon as the email or call goes out.
            </p>
          </div>
          {commitments.length === 0 ? (
            <EmptyState title="Nothing promised for today." body="Add one from any reply and we’ll keep track of it." />
          ) : (
            <div className="flex flex-col gap-3">
              {commitments.map((c) => {
                const promptPending = Boolean(c.prompt_interaction_id) && !c.prompt_answered_at;
                if (promptPending) return <PromptRow key={c.id} commitmentId={c.id} question={promptQuestion(c)} />;
                const draftReady = c.status === "missed" && Boolean(c.draft_update);
                return (
                  <FollowUpRow
                    key={c.id}
                    commitmentId={c.id}
                    ownerId={c.owner.id}
                    ownerName={c.owner.name}
                    ownerFirstName={firstName(c.owner.name)}
                    text={c.text}
                    timeLabel={`By ${timeOfDay(c.due_at)}`}
                    origin={draftReady ? "A new date goes with the update" : originLine(c, now)}
                    draftReady={draftReady}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Headline as="h2" className="text-[24px] sm:text-[30px]">
              {outreach.length === 0
                ? "Everyone’s been heard from lately"
                : `${outreach.length} ${outreach.length === 1 ? "owner is" : "owners are"} due a catch-up`}
            </Headline>
            <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-78 sm:text-[16px]">
              Each comes with something good to mention.
            </p>
          </div>
          {outreach.length === 0 ? (
            <EmptyState title="No catch-ups this week." body="We’ll line one up when an owner is due a call." />
          ) : (
            <div className="flex flex-col gap-3">
              {outreach.map((o) => (
                <OutreachRow
                  key={o.id}
                  ownerId={o.owner.id}
                  ownerName={o.owner.name}
                  ownerHealth={o.owner.health}
                  phone={o.owner.primary_phone}
                  metaLine={outreachMeta(o, now)}
                  talkingPoint={o.talking_point}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
