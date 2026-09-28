import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { timeLeftLabel } from "@/lib/domain/time";
import { LOOP_TYPE_LABEL } from "@/lib/domain/types";
import type { Interaction } from "@/lib/domain/types";
import { getLoopWithThread } from "@/lib/queries/queue";
import { ChannelIcon, ChevronLeft } from "@/components/ui/icons";
import { Card, HealthDot, Tag } from "@/components/ui/primitives";
import { firstName, propertyLine, shortDate, timeOfDay } from "@/app/(app)/queue/_components/helpers";
import { ReplyScreen, type SuggestedFollowUp } from "./_components/ReplyScreen";
import { CallScreen } from "./_components/CallScreen";

export const metadata = { title: "Reply" };
export const dynamic = "force-dynamic";

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function threadLine(i: Interaction): string {
  if (i.ai_summary) return i.ai_summary;
  if (i.channel === "call") {
    if (i.direction === "inbound") return i.call_answered === false ? "They called and we didn’t pick up" : "They called";
    return i.call_answered === false ? "We called and left it" : "We called";
  }
  return i.subject ?? i.body?.slice(0, 140) ?? "";
}

export default async function LoopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const data = await getLoopWithThread(id);
  if (!data) notFound();

  const { loop, owner, property, issue, trigger, thread, commitments } = data;
  const now = new Date();
  const { label } = timeLeftLabel(new Date(loop.due_at), now);
  const first = firstName(owner.name);
  const closed = loop.status === "closed";

  const tags: string[] = [];
  if (loop.texted_not_called) tags.push("Texted, call still to do");
  if (trigger?.churn_flag) tags.push("Sounds unhappy");
  if (loop.issue_id) tags.push("Relates to the repair booking");

  const followUps: SuggestedFollowUp[] = commitments.map((c) => ({
    id: c.id,
    text: c.text,
    dueLabel: `By ${shortDate(c.due_at)}`,
    status: c.status === "open" ? "open" : "suggested",
  }));

  // What the owner said, or what the repair is about.
  const message =
    loop.type === "maintenance"
      ? issue?.description ?? loop.summary ?? null
      : trigger?.body ?? trigger?.transcript ?? loop.summary ?? null;

  const channel: "email" | "sms" = loop.type === "sms" ? "sms" : "email";
  const starter =
    loop.type === "maintenance"
      ? `Hi ${first},\n\nA quick note on ${issue?.description ? lower(issue.description) : "the repair at your place"}. `
      : channel === "sms"
        ? `Hi ${first}, `
        : `Hi ${first},\n\nThanks for getting in touch. `;
  const draft = loop.ai_draft ?? starter;
  const smsStarter = `Hi ${first}, sorry I couldn’t pick up. I’ll give you a call shortly.`;

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-4 lg:max-w-[760px] lg:px-8 lg:py-10">
      <header className="flex items-center gap-2">
        <Link href="/queue" aria-label="Back to the queue" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-ink hover:bg-ground">
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <Link href={`/owners/${owner.id}`} className="display truncate text-[22px] text-ink no-underline hover:underline">
              {owner.name}
            </Link>
            <HealthDot health={owner.health} />
          </span>
          <span className="num text-[13px] text-ink-66">
            {LOOP_TYPE_LABEL[loop.type]} · {closed ? "sorted" : lower(label)}
            {property ? ` · ${propertyLine(property)}` : ""}
          </span>
        </div>
      </header>

      {closed ? (
        <Card className="p-4">
          <p className="text-[15px] font-semibold">This one’s sorted.</p>
          <p className="mt-1 text-[13px] text-ink-66">Anything new from {first} opens a fresh one.</p>
        </Card>
      ) : null}

      {loop.type === "missed_call" ? (
        <>
          {thread.length ? (
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-[13px] font-semibold text-ink-66">Recently with {first}</p>
              <ul className="flex flex-col divide-y divide-hairline">
                {[...thread].reverse().map((i) => (
                  <li key={i.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="mt-0.5 text-ink-66">
                      <ChannelIcon channel={i.channel} className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] leading-relaxed">{threadLine(i)}</span>
                      <span className="num text-[13px] text-ink-66">
                        {shortDate(i.occurred_at)} · {timeOfDay(i.occurred_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Tag key={t} tone={t === "Sounds unhappy" ? "amber" : "tint"}>
                      {t}
                    </Tag>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}
          {!closed ? (
            <CallScreen
              loopId={loop.id}
              ownerId={owner.id}
              ownerFirstName={first}
              phone={owner.primary_phone}
              textedAlready={loop.texted_not_called}
              smsStarter={smsStarter}
            />
          ) : null}
        </>
      ) : (
        <>
          {message ? (
            <figure className="flex flex-col gap-3">
              <blockquote className="border-l-2 border-harbour pl-4 text-[15px] leading-relaxed text-ink-78 whitespace-pre-line">
                {message}
              </blockquote>
              <figcaption className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-66">
                {trigger ? (
                  <span className="num">
                    {loop.type === "maintenance" ? "Logged" : `From ${first}`} · {shortDate(trigger.occurred_at)} · {timeOfDay(trigger.occurred_at)}
                  </span>
                ) : null}
                {tags.map((t) => (
                  <Tag key={t} tone={t === "Sounds unhappy" ? "amber" : "tint"}>
                    {t}
                  </Tag>
                ))}
              </figcaption>
            </figure>
          ) : null}
          {loop.type === "email" && thread.length > 1 ? (
            <details className="text-[13px] text-ink-66">
              <summary className="cursor-pointer py-2 font-semibold">Earlier in this thread ({thread.length - 1})</summary>
              <ul className="flex flex-col divide-y divide-hairline">
                {thread
                  .filter((i) => i.id !== trigger?.id)
                  .map((i) => (
                    <li key={i.id} className="flex flex-col gap-1 py-2.5">
                      <span className="num">
                        {i.direction === "inbound" ? first : "You"} · {shortDate(i.occurred_at)}
                      </span>
                      <span className="text-[15px] text-ink whitespace-pre-line">{i.body ?? i.subject ?? ""}</span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          {!closed ? (
            <ReplyScreen loopId={loop.id} ownerId={owner.id} ownerFirstName={first} channel={channel} draft={draft} followUps={followUps} />
          ) : null}
        </>
      )}
    </main>
  );
}
