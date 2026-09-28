import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/primitives";
import { Wordmark } from "@/components/ui/wordmark";
import type { Staff } from "@/lib/domain/types";

/** Top bar on phones (wordmark, date, avatar); hidden on desktop where the rail carries it. */
export function MobileTopBar({ staff, right }: { staff: Staff; right?: ReactNode }) {
  const now = new Date();
  const date = now.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
  return (
    <header className="flex items-center justify-between border-b border-hairline bg-card px-4 pb-3 pt-4 lg:hidden">
      <Wordmark className="text-[22px]" />
      <div className="flex items-center gap-3">
        {right ?? <span className="num text-[13px] text-ink-66">{date}</span>}
        <Avatar name={staff.name} />
      </div>
    </header>
  );
}

export function PageTitle({
  title,
  lead,
  actions,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="display text-[28px] leading-[1.1] sm:text-[40px] [text-wrap:balance]">
          {title}
          <span className="text-harbour">.</span>
        </h1>
        {lead ? <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink-78 sm:text-[16px]">{lead}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
