"use client";

import { startTransition, type ReactNode } from "react";
import { logCall } from "@/lib/actions/loops";
import { cx } from "@/components/ui/primitives";
import { clickToDialUrl } from "./helpers";

/**
 * Opens Dialpad on the device and notes the attempt at the same time, so the
 * loop closes without the PM doing anything else.
 */
export function CallLink({
  loopId,
  phone,
  variant = "secondary",
  size = "md",
  className,
  children,
  ariaLabel,
}: {
  loopId?: string;
  phone: string | null | undefined;
  variant?: "primary" | "secondary";
  size?: "md" | "lg" | "icon";
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[6px] text-[15px] font-semibold whitespace-nowrap no-underline";
  const look = variant === "primary" ? "bg-navy text-on-navy hover:bg-ink-78" : "border border-hairline bg-card text-ink hover:bg-ground";
  const h = size === "lg" ? "h-12 px-4" : size === "icon" ? "h-11 w-11 px-0" : "h-11 px-4";
  const disabled = !phone;
  return (
    <a
      href={clickToDialUrl(phone)}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cx(base, look, h, disabled && "opacity-50 pointer-events-none", className)}
      onClick={() => {
        if (loopId) startTransition(() => void logCall(loopId));
      }}
    >
      {children}
    </a>
  );
}
