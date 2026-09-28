"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "@/components/ui/icons";

/**
 * Search, health and PM filters for the owners list. Everything goes to the
 * URL so the server renders the filtered rows.
 */
export function OwnerFilters({
  q,
  health,
  pmId,
  staff,
}: {
  q: string;
  health: string;
  pmId: string;
  staff: { id: string; name: string }[];
}) {
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

  const select = "h-11 rounded-[6px] border border-hairline bg-card px-3 text-[15px] text-ink";

  return (
    <form
      role="search"
      aria-busy={pending}
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        push({ q: text.trim() });
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-40" strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          name="q"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            const value = e.target.value;
            timer.current = setTimeout(() => push({ q: value.trim() }), 350);
          }}
          placeholder="Search owners"
          aria-label="Search owners"
          className="h-11 w-full rounded-[6px] border border-hairline bg-card pl-10 pr-3 text-[15px] text-ink placeholder:text-ink-40"
        />
      </div>
      <select aria-label="Health" value={health} onChange={(e) => push({ health: e.target.value })} className={select}>
        <option value="">Everyone</option>
        <option value="red">Needs attention</option>
        <option value="amber">Needs some care</option>
        <option value="green">Happy</option>
      </select>
      <select aria-label="Property manager" value={pmId} onChange={(e) => push({ pm: e.target.value })} className={select}>
        <option value="">Any manager</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </form>
  );
}
