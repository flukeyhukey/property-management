"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendReply } from "@/lib/actions/loops";
import { Phone } from "@/components/ui/icons";
import { Button, Card } from "@/components/ui/primitives";
import { CallLink } from "@/app/(app)/queue/_components/CallLink";
import { AddFollowUpForm } from "@/app/(app)/queue/_components/AddFollowUpForm";

/**
 * A missed call centres on calling back. A text is offered underneath, with
 * a kind note that it is a start rather than the thing itself.
 */
export function CallScreen({
  loopId,
  ownerId,
  ownerFirstName,
  phone,
  textedAlready,
  smsStarter,
}: {
  loopId: string;
  ownerId: string;
  ownerFirstName: string;
  phone: string | null;
  textedAlready: boolean;
  smsStarter: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState(smsStarter);
  const [texting, setTexting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sendText = () => {
    setError(null);
    startTransition(async () => {
      const res = await sendReply(loopId, body, "sms");
      if (!res.ok) setError(res.message);
      else router.push("/queue");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <CallLink loopId={loopId} phone={phone} variant="primary" size="lg" className="w-full">
        <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Call {ownerFirstName} back
      </CallLink>
      {!phone ? <p className="text-[13px] text-ink-66">We don’t have a number for {ownerFirstName} yet.</p> : null}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold">Text instead</p>
          <p className="text-[13px] leading-relaxed text-ink-66">
            {textedAlready
              ? `You’ve texted already. The call is what ${ownerFirstName} is waiting for.`
              : `A text is a good start. The call is what ${ownerFirstName} is waiting for.`}
          </p>
        </div>
        {texting ? (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-[6px] border border-hairline bg-card p-3 text-[15px] leading-relaxed"
            />
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={sendText} disabled={pending || !body.trim() || !phone}>
                {pending ? "Sending" : "Send text"}
              </Button>
              <Button className="flex-1" onClick={() => setTexting(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => setTexting(true)} disabled={!phone}>
            Write a text
          </Button>
        )}
      </Card>

      {adding ? (
        <AddFollowUpForm ownerId={ownerId} loopId={loopId} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <Button size="lg" onClick={() => setAdding(true)}>
          Add a follow-up
        </Button>
      )}

      {error ? (
        <p className="text-[13px] text-amber" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
