import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { addBusinessMinutes } from "@/lib/domain/time";
import { getCommitmentForUpdate } from "@/lib/queries/queue";
import { ChevronLeft } from "@/components/ui/icons";
import { Card, Tag } from "@/components/ui/primitives";
import { dateInputValue, firstName, shortDate } from "@/app/(app)/queue/_components/helpers";
import { UpdateForm } from "./_components/UpdateForm";

export const metadata = { title: "Quick update" };
export const dynamic = "force-dynamic";

export default async function NewUpdatePage({ params }: { params: Promise<{ commitmentId: string }> }) {
  const { commitmentId } = await params;
  await requireStaff();
  const c = await getCommitmentForUpdate(commitmentId);
  if (!c) notFound();

  const first = firstName(c.owner.name);
  const now = new Date();
  const defaultDate = dateInputValue(addBusinessMinutes(now, 2 * 10 * 60));
  const draft =
    c.draft_update ??
    `Hi ${first},\n\nA quick update on ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}. It’s taken longer than I said, and I’m sorry about that. I’ll have it to you by the new date below and will let you know the moment it’s done.\n\n`;
  const alreadySent = c.status !== "missed";

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-4 lg:max-w-[760px] lg:px-8 lg:py-10">
      <header className="flex items-center gap-2">
        <Link href="/queue" aria-label="Back to the queue" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-ink hover:bg-ground">
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={`/owners/${c.owner.id}`} className="display truncate text-[22px] text-ink no-underline hover:underline">
            {c.owner.name}
          </Link>
          <span className="num text-[13px] text-ink-66">Follow-up · was due {shortDate(c.due_at)}</span>
        </div>
      </header>

      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] leading-relaxed">{c.text}</p>
          {alreadySent ? <Tag>Back on track</Tag> : <Tag tone="amber">Draft ready</Tag>}
        </div>
        <p className="text-[13px] leading-relaxed text-ink-66">
          {alreadySent
            ? `This one is back on your list for ${shortDate(c.due_at)}.`
            : `${first} hasn’t heard about this yet. A quick note with a new date keeps things easy.`}
        </p>
      </Card>

      {alreadySent ? null : (
        <UpdateForm commitmentId={c.id} ownerFirstName={first} phone={c.owner.primary_phone} draft={draft} defaultDate={defaultDate} />
      )}
    </main>
  );
}
