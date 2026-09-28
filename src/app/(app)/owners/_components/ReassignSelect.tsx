"use client";

import { useState, useTransition } from "react";
import { reassignOwner } from "@/lib/actions/owners";

/**
 * A select that moves an owner to another property manager. Only rendered
 * for a GM or director (the page checks canReassign before showing it).
 */
export function ReassignSelect({
  ownerId,
  ownerName,
  currentPmId,
  staff,
}: {
  ownerId: string;
  ownerName: string;
  currentPmId: string | null;
  staff: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(currentPmId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`Reassign ${ownerName}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!next || next === value) return;
          const previous = value;
          setValue(next);
          setMessage(null);
          startTransition(async () => {
            const r = await reassignOwner(ownerId, next);
            if (!r.ok) {
              setValue(previous);
              setMessage(r.message);
            }
          });
        }}
        className="h-11 min-w-[140px] rounded-[6px] border border-hairline bg-card px-3 text-sm text-ink disabled:opacity-50"
      >
        {!value ? <option value="">Unassigned</option> : null}
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {message ? (
        <span role="status" className="text-xs text-ink-66">
          {message}
        </span>
      ) : null}
    </span>
  );
}
