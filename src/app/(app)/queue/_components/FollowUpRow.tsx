import Link from "next/link";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";

/**
 * One follow-up for today. A slipped one carries its drafted update; a due
 * one just says when and reminds the PM it ticks off by itself.
 */
export function FollowUpRow({
  commitmentId,
  ownerId,
  ownerFirstName,
  ownerName,
  text,
  timeLabel,
  origin,
  draftReady,
}: {
  commitmentId: string;
  ownerId: string;
  ownerFirstName: string;
  ownerName: string;
  text: string;
  timeLabel: string;
  origin: string;
  draftReady: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/owners/${ownerId}`} className="text-[16px] font-semibold text-ink no-underline hover:underline">
            {ownerName}
          </Link>
          <p className="text-[15px] leading-relaxed">{text}</p>
          <p className="text-[13px] text-ink-66">{origin}</p>
        </div>
        {draftReady ? <Tag tone="amber">Draft ready</Tag> : <span className="num shrink-0 text-[13px] font-semibold text-ink-66">{timeLabel}</span>}
      </div>
      {draftReady ? (
        <ButtonLink href={`/loops/new-update/${commitmentId}`} variant="primary" className="w-full">
          Send {ownerFirstName} a quick update
        </ButtonLink>
      ) : null}
    </Card>
  );
}
