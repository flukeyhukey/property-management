"use client";

import { useState, useTransition } from "react";
import { addFollowUp } from "@/lib/actions/commitments";
import { Button } from "@/components/ui/primitives";
import { dateInputValue } from "./helpers";

/** Two fields: what you'll do and when. That's it. */
export function AddFollowUpForm({
  ownerId,
  loopId,
  onDone,
  onCancel,
}: {
  ownerId: string;
  loopId?: string | null;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => dateInputValue(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-[12px] border border-hairline bg-ground p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          // Due at 5pm Brisbane on the chosen day.
          const res = await addFollowUp({ ownerId, loopId, text, dueAt: `${date}T17:00:00+10:00` });
          if (!res.ok) setError(res.message);
          else {
            setText("");
            onDone?.();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-ink-78">What you’ll do</span>
        <input
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send the plumber’s quote"
          required
          className="h-11 rounded-[6px] border border-hairline bg-card px-3 text-[15px]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-ink-78">By when</span>
        <input
          type="date"
          name="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="h-11 rounded-[6px] border border-hairline bg-card px-3 text-[15px]"
        />
      </label>
      {error ? (
        <p className="text-[13px] text-amber" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1" disabled={pending}>
          {pending ? "Adding" : "Add follow-up"}
        </Button>
        {onCancel ? (
          <Button className="flex-1" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
