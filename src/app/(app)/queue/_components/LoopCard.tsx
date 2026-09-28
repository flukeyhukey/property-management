"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { markDone, snoozeLoop } from "@/lib/actions/loops";
import { CLOSE_REASONS, SNOOZE_REASONS } from "@/lib/domain/types";
import type { CloseReason, LoopType, SnoozeReason } from "@/lib/domain/types";
import { ChevronDown, LoopTypeIcon, Phone } from "@/components/ui/icons";
import { Button, ButtonLink, Card, HealthDot, Tag, cx } from "@/components/ui/primitives";
import type { Health } from "@/lib/domain/types";
import { CallLink } from "./CallLink";
import { Sheet, SheetOptions } from "./Sheet";
import { primaryActionFor } from "./helpers";

/** Plain data the server page prepares so the card renders the same on both sides. */
export type LoopCardData = {
  id: string;
  type: LoopType;
  ownerId: string;
  ownerName: string;
  ownerHealth: Health;
  phone: string | null;
  timeLabel: string;
  pastDue: boolean;
  contextLine: string;
  summary: string | null;
  tags: string[];
};

export function LoopCard({ loop }: { loop: LoopCardData }) {
  const [sheet, setSheet] = useState<"done" | "snooze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const primary = primaryActionFor(loop.type);

  const pick = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? "That didn’t go through.");
      else setSheet(null);
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-ink-66">
          <LoopTypeIcon type={loop.type} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Link href={`/owners/${loop.ownerId}`} className="truncate text-[16px] font-semibold text-ink no-underline hover:underline">
                {loop.ownerName}
              </Link>
              <HealthDot health={loop.ownerHealth} />
            </span>
            <span className={cx("num shrink-0 text-[13px] font-semibold", loop.pastDue ? "text-amber" : "text-ink-66")}>
              {loop.timeLabel}
            </span>
          </div>
          <p className="text-[13px] text-ink-66">{loop.contextLine}</p>
          {loop.summary ? <p className="text-[15px] leading-relaxed text-ink">{loop.summary}</p> : null}
          {loop.tags.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {loop.tags.map((t) => (
                <Tag key={t} tone={t === "Sounds unhappy" ? "amber" : "tint"}>
                  {t}
                </Tag>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <CallLink loopId={loop.id} phone={loop.phone} variant={primary === "call" ? "primary" : "secondary"} className="flex-1">
          <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          Call
        </CallLink>
        <ButtonLink href={`/loops/${loop.id}`} variant={primary === "reply" ? "primary" : "secondary"} className="flex-1">
          Reply
        </ButtonLink>
        <Button className="flex-1" onClick={() => setSheet("done")} disabled={pending}>
          Done
        </Button>
        <Button aria-label="More" className="w-11 shrink-0 px-0" onClick={() => setSheet("snooze")} disabled={pending}>
          <ChevronDown className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p className="text-[13px] text-amber" role="alert">
          {error}
        </p>
      ) : null}

      <Sheet open={sheet === "done"} title={`Done with ${loop.ownerName}. What happened?`} onClose={() => setSheet(null)}>
        <SheetOptions<CloseReason> options={CLOSE_REASONS} disabled={pending} onPick={(r) => pick(() => markDone(loop.id, r))} />
      </Sheet>
      <Sheet open={sheet === "snooze"} title="Come back to this later" onClose={() => setSheet(null)}>
        <SheetOptions<SnoozeReason> options={SNOOZE_REASONS} disabled={pending} onPick={(r) => pick(() => snoozeLoop(loop.id, r))} />
        <p className="pt-3 text-[13px] text-ink-66">It comes back in four business hours, or first thing tomorrow.</p>
      </Sheet>
    </Card>
  );
}
