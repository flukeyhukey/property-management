"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "@/components/ui/icons";
import { Button, cx } from "@/components/ui/primitives";

/**
 * A small bottom sheet for pick-from-four choices. Slides up on phones,
 * sits as a centred card on desktop. Escape and the backdrop close it.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-navy/40 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative w-full max-w-[480px] rounded-t-[12px] border border-hairline bg-card px-4 pt-4",
          "pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-[12px] sm:pb-4",
        )}
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className="text-[15px] font-semibold">{title}</p>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="h-11 w-11 px-0">
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A stack of full-width choices for the sheet. */
export function SheetOptions<T extends string>({
  options,
  onPick,
  disabled,
}: {
  options: { value: T; label: string }[];
  onPick: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <Button key={o.value} size="lg" className="w-full justify-start" disabled={disabled} onClick={() => onPick(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}
