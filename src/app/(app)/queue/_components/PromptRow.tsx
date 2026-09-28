"use client";

import { useState, useTransition } from "react";
import { answerPrompt } from "@/lib/actions/commitments";
import { Button, Card } from "@/components/ui/primitives";

/** "Quick check: did your call with Paul Brennan at 11:02am cover the new cleaner roster?" */
export function PromptRow({ commitmentId, question }: { commitmentId: string; question: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answer = (a: "yes" | "no" | "not_yet") => {
    setError(null);
    startTransition(async () => {
      const res = await answerPrompt(commitmentId, a);
      if (!res.ok) setError(res.message);
    });
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-[15px] leading-relaxed">
        <span className="font-semibold">Quick check: </span>
        {question}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={pending} onClick={() => answer("yes")}>
          Yes
        </Button>
        <Button className="flex-1" disabled={pending} onClick={() => answer("no")}>
          No
        </Button>
        <Button className="flex-1" disabled={pending} onClick={() => answer("not_yet")}>
          Not yet
        </Button>
      </div>
      {error ? (
        <p className="text-[13px] text-amber" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
