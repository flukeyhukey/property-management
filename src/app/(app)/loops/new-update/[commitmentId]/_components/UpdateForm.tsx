"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { calledInstead, sendUpdate } from "@/lib/actions/commitments";
import { Phone } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";
import { CallLink } from "@/app/(app)/queue/_components/CallLink";

/** The honest update, with the new date beside it. Send it, or say you called. */
export function UpdateForm({
  commitmentId,
  ownerFirstName,
  phone,
  draft,
  defaultDate,
}: {
  commitmentId: string;
  ownerFirstName: string;
  phone: string | null;
  draft: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState(draft);
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dueAt = `${date}T17:00:00+10:00`;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "That didn’t go through.");
      else router.push("/queue");
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">We’ve drafted an honest update. Change anything you like.</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="w-full resize-y rounded-[6px] border border-hairline bg-card p-3 text-[15px] leading-relaxed"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-ink-78">New date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="h-11 w-full rounded-[6px] border border-hairline bg-card px-3 text-[15px] sm:w-56"
        />
        <span className="text-[13px] text-ink-66">The follow-up moves to this day once the update goes out.</span>
      </label>

      {error ? (
        <p className="text-[13px] text-amber" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" size="lg" className="sm:flex-1" disabled={pending || !body.trim()} onClick={() => run(() => sendUpdate(commitmentId, body, dueAt))}>
          {pending ? "Sending" : "Send"}
        </Button>
        <Button size="lg" className="sm:flex-1" disabled={pending} onClick={() => run(() => calledInstead(commitmentId, dueAt))}>
          I called instead
        </Button>
        <CallLink phone={phone} size="lg" className="sm:flex-1" ariaLabel={`Call ${ownerFirstName}`}>
          <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          Call {ownerFirstName}
        </CallLink>
      </div>
    </div>
  );
}
