"use client";

import { useState, useTransition } from "react";
import { Button, cx } from "@/components/ui/primitives";
import { addNote, saveNotes, setPreferredContact } from "@/lib/actions/owners";
import type { ContactMethod } from "@/lib/domain/types";

const METHODS: { value: ContactMethod; label: string }[] = [
  { value: "call", label: "A phone call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "A text" },
];

/**
 * Notes and preferences. The notes textarea saves on demand; the preferred
 * contact select saves as soon as it changes. A second box adds a dated
 * note to the timeline.
 */
export function NotesForm({
  ownerId,
  notes,
  preferredContact,
  compact = false,
}: {
  ownerId: string;
  notes: string;
  preferredContact: ContactMethod;
  compact?: boolean;
}) {
  const [text, setText] = useState(notes);
  const [saved, setSaved] = useState(notes);
  const [method, setMethod] = useState<ContactMethod>(preferredContact);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = text !== saved;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setStatus(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setStatus(done);
      else setStatus(result.message ?? "That did not save.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">Prefers</span>
        <select
          value={method}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as ContactMethod;
            setMethod(next);
            run(() => setPreferredContact(ownerId, next), "Preference saved");
          }}
          className="h-11 rounded-[6px] border border-hairline bg-card px-3 text-[15px] text-ink"
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">Notes</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 4 : 6}
          placeholder="Anything worth remembering: best time to call, family, how they like their reports."
          className="min-h-[88px] rounded-[6px] border border-hairline bg-card px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-40"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={!dirty || pending}
          onClick={() =>
            run(async () => {
              const r = await saveNotes(ownerId, text);
              if (r.ok) setSaved(text);
              return r;
            }, "Notes saved")
          }
        >
          Save notes
        </Button>
        {status ? (
          <span role="status" className="text-sm text-ink-66">
            {status}
          </span>
        ) : null}
      </div>

      <div className={cx("flex flex-col gap-1.5 border-t border-hairline pt-4", compact && "hidden")}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">Add a note to the timeline</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What happened, in a line or two."
            className="rounded-[6px] border border-hairline bg-card px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-40"
          />
        </label>
        <div>
          <Button
            disabled={!note.trim() || pending}
            onClick={() =>
              run(async () => {
                const r = await addNote(ownerId, note);
                if (r.ok) setNote("");
                return r;
              }, "Note added")
            }
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
