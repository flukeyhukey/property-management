"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, ClipboardList, Users } from "@/components/ui/icons";
import { Avatar, cx } from "@/components/ui/primitives";
import { Wordmark } from "@/components/ui/wordmark";
import type { Staff } from "@/lib/domain/types";

const NAV = [
  { href: "/queue", label: "Queue", icon: ClipboardList },
  { href: "/owners", label: "Owners", icon: Users },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
] as const;

/**
 * Mobile first: a bottom tab bar on phones, a left rail from 1024px.
 * The queue is the home screen and needs no menu to reach it.
 */
export function AppShell({ staff, children }: { staff: Staff; children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <nav
        aria-label="Main"
        className="hidden lg:flex w-[232px] shrink-0 flex-col gap-1 border-r border-hairline bg-card px-4 py-6"
      >
        <div className="px-3 pb-6">
          <Wordmark className="text-2xl" />
        </div>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cx(
              "flex h-11 items-center gap-3 rounded-[6px] px-3 text-[15px] font-semibold no-underline",
              active(href) ? "bg-harbour-tint text-ink" : "text-ink-78 hover:bg-ground",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        ))}
        <Link
          href="/settings"
          className="mt-auto flex items-center gap-3 border-t border-hairline px-3 pt-4 no-underline"
        >
          <Avatar name={staff.name} />
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-ink">{staff.name}</span>
            <span className="text-xs text-ink-66">
              {staff.role === "pm" ? "Property manager" : staff.role === "gm" ? "General manager" : "Director"}
            </span>
          </span>
        </Link>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-hairline bg-card px-2 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] lg:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cx(
              "flex h-12 flex-col items-center justify-center gap-0.5 text-xs font-semibold no-underline",
              active(href) ? "text-ink" : "text-ink-66",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
