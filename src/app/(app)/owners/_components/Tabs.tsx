"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/components/ui/primitives";

export type TabDef = { value: string; label: string; count?: number };

/**
 * Real buttons that write ?tab= to the URL. The page renders the right
 * panel on the server, so the tab survives a refresh and a share.
 */
export function Tabs({ tabs, active, param = "tab" }: { tabs: TabDef[]; active: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(value: string) {
    const next = new URLSearchParams(search.toString());
    if (value === tabs[0]?.value) next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div role="tablist" aria-label="Sections" className="scroll-thin -mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 sm:mx-0 sm:px-0" aria-busy={pending}>
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(t.value)}
            className={cx(
              "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold whitespace-nowrap cursor-pointer",
              isActive ? "border-harbour text-ink" : "border-transparent text-ink-66 hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 ? (
              <span className={cx("num rounded-full px-2 py-0.5 text-xs", isActive ? "bg-harbour-tint text-ink" : "bg-ground text-ink-66")}>{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
