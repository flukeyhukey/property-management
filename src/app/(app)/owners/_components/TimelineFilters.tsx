"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import type { Channel } from "@/lib/domain/types";

type Chip = { value: Channel | ""; label: string };

/**
 * Filter chips and a search box for the timeline. Both write to the URL
 * (?channel= and ?q=) so the server renders the filtered list.
 */
export function TimelineFilters({ chips, channel, q }: { chips: Chip[]; channel: Channel | ""; q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setText(q), [q]);

  function push(patch: Record<string, string>) {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onText(value: string) {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ q: value.trim() }), 350);
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => {
          const active = c.value === channel;
          return (
            <button
              key={c.value || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => push({ channel: c.value })}
              className={cx(
                "inline-flex h-11 shrink-0 items-center rounded-[6px] border px-3.5 text-sm font-semibold cursor-pointer sm:h-9",
                active ? "border-navy bg-navy text-on-navy" : "border-hairline bg-card text-ink-78 hover:bg-ground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          push({ q: text.trim() });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-40" strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          name="q"
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Search the timeline"
          aria-label="Search the timeline"
          className="h-11 w-full rounded-[6px] border border-hairline bg-card pl-10 pr-11 text-[15px] text-ink placeholder:text-ink-40"
        />
        {text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText("");
              if (timer.current) clearTimeout(timer.current);
              push({ q: "" });
            }}
            className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[6px] text-ink-66 hover:bg-ground cursor-pointer"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : null}
      </form>
    </div>
  );
}
