import Link from "next/link";
import { Phone } from "@/components/ui/icons";
import { Card, HealthDot } from "@/components/ui/primitives";
import type { Health } from "@/lib/domain/types";
import { CallLink } from "./CallLink";

/** "Last spoke 86 days ago · Newstead 2BR" with something good to mention and a call button. */
export function OutreachRow({
  ownerId,
  ownerName,
  ownerHealth,
  phone,
  metaLine,
  talkingPoint,
}: {
  ownerId: string;
  ownerName: string;
  ownerHealth: Health;
  phone: string | null;
  metaLine: string;
  talkingPoint: string;
}) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <Link href={`/owners/${ownerId}`} className="truncate text-[16px] font-semibold text-ink no-underline hover:underline">
            {ownerName}
          </Link>
          <HealthDot health={ownerHealth} />
        </span>
        <p className="text-[13px] text-ink-66">{metaLine}</p>
        <p className="text-[15px] leading-relaxed">{talkingPoint}</p>
      </div>
      <CallLink phone={phone} size="icon" ariaLabel={`Call ${ownerName}`} className="shrink-0">
        <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </CallLink>
    </Card>
  );
}
