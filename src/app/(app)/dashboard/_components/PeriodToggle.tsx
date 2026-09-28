"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cx } from "@/components/ui/primitives";
import { PERIODS, parsePeriod } from "@/lib/queries/dashboard";

/** This week / 30 days / Quarter, kept in the URL so the view can be shared. */
export function PeriodToggle() {
  const params = useSearchParams();
  const active = parsePeriod(params.get("period") ?? undefined);
  return (
    <nav aria-label="Period" className="inline-flex rounded-[6px] border border-hairline bg-card p-1">
      {PERIODS.map((p) => (
        <Link
          key={p.value}
          href={p.value === "week" ? "/dashboard" : `/dashboard?period=${p.value}`}
          aria-current={active === p.value ? "page" : undefined}
          className={cx(
            "inline-flex h-9 items-center rounded-[4px] px-3 text-sm font-semibold no-underline",
            active === p.value ? "bg-harbour-tint text-ink" : "text-ink-66 hover:bg-ground",
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
