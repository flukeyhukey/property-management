"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendReply, snoozeLoop } from "@/lib/actions/loops";
import { remindMe } from "@/lib/actions/commitments";
import { SNOOZE_REASONS } from "@/lib/domain/types";
import type { SnoozeReason } from "@/lib/domain/types";
import { Check } from "@/components/ui/icons";
import { Button, Card, cx } from "@/components/ui/primitives";
import { AddFollowUpForm } from "@/app/(app)/queue/_components/AddFollowUpForm";
import { Sheet, SheetOptions } from "@/app/(app)/queue/_components/Sheet";

export type SuggestedFollowUp = { id: string; text: string; dueLabel: string; status: "suggested" | "open" };

/**
 * The drafted reply, the follow-ups we spotted, and Send. Works the same for
 * an email, a text, or telling an owner how a repair went.
 */
export function ReplyScreen({
  loopId,
  ownerId,
  ownerFirstName,
  channel,
  draft,
  followUps,
}: {
  loopId: string;
  ownerId: string;
  ownerFirstName: string;
  channel: "email" | "sms";
  draft: string;
  followUps: SuggestedFollowUp[];
}) {
  const router = useRouter();
  const [body, setBody] = useState(draft);
  const [adding, setAdding] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    setError(null);
    startTransition(async () => {
      const res = await sendReply(loopId, body, channel);
      if (!res.ok) setError(res.message);
      else router.push("/queue");
    });
  };

  const snooze = (reason: SnoozeReason) => {
    setError(null);
    startTransition(async () => {
      const res = await snoozeLoop(loopId, reason);
      if (!res.ok) setError(res.message);
      else router.push("/queue");
    });
  };

  const suggested = followUps.filter((f) => f.status === "suggested");

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">We’ve drafted a reply. Change anything you like.</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={channel === "sms" ? 5 : 10}
          className="w-full resize-y rounded-[6px] border border-hairline bg-card p-3 text-[15px] leading-relaxed"
        />
        {channel === "sms" ? <span className="num text-[13px] text-ink-66">{body.length} characters</span> : null}
      </label>

      {followUps.length ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold">Want a reminder for these?</p>
            <p className="text-[13px] leading-relaxed text-ink-66">
              {suggested.length
                ? `We spotted ${suggested.length} ${suggested.length === 1 ? "follow-up" : "follow-ups"} for ${ownerFirstName}. They tick off by themselves once you do them.`
                : `Your open follow-ups for ${ownerFirstName}. They tick off by themselves once you do them.`}
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-hairline">
            {followUps.map((f) => (
              <FollowUpLine key={f.id} item={f} />
            ))}
          </ul>
        </Card>
      ) : null}

      {adding ? <AddFollowUpForm ownerId={ownerId} loopId={loopId} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} /> : null}

      {error ? (
        <p className="text-[13px] text-amber" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" size="lg" className="sm:flex-1" onClick={send} disabled={pending || !body.trim()}>
          {pending ? "Sending" : "Send"}
        </Button>
        <Button size="lg" className={cx("sm:flex-1", adding && "bg-ground")} onClick={() => setAdding((v) => !v)} disabled={pending}>
          Add a follow-up
        </Button>
        <Button size="lg" className="sm:flex-1" onClick={() => setSnoozing(true)} disabled={pending}>
          Snooze
        </Button>
      </div>

      <Sheet open={snoozing} title="Come back to this later" onClose={() => setSnoozing(false)}>
        <SheetOptions<SnoozeReason> options={SNOOZE_REASONS} disabled={pending} onPick={snooze} />
        <p className="pt-3 text-[13px] text-ink-66">It comes back in four business hours, or first thing tomorrow.</p>
      </Sheet>
    </div>
  );
}

function FollowUpLine({ item }: { item: SuggestedFollowUp }) {
  const [state, setState] = useState<"suggested" | "open">(item.status);
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <span className="text-[15px]">{item.text}</span>
        <span className="text-[13px] text-ink-66">{item.dueLabel}</span>
      </div>
      {state === "open" ? (
        <span className="inline-flex h-11 shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-66">
          <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          On your list
        </span>
      ) : (
        <Button
          size="md"
          className="shrink-0"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await remindMe(item.id);
              if (res.ok) setState("open");
            })
          }
        >
          Remind me
        </Button>
      )}
    </li>
  );
}
