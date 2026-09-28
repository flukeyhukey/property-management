import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileTopBar, PageTitle } from "@/components/page-header";
import { Card, EmptyState, HealthDot, Stat, cx } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDashboard, minutesLabel, parsePeriod, type PmRow } from "@/lib/queries/dashboard";
import { PeriodToggle } from "./_components/PeriodToggle";

export const metadata: Metadata = { title: "Dashboard" };

const TH = "px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-66 whitespace-nowrap";
const TD = "px-3 py-3 text-[14px] whitespace-nowrap";

const COLUMNS: { label: string; goal: string; cell: (r: PmRow) => React.ReactNode }[] = [
  { label: "First reply call", goal: "1h", cell: (r) => minutesLabel(r.firstReplyCall) },
  { label: "First reply SMS", goal: "1h", cell: (r) => minutesLabel(r.firstReplySms) },
  { label: "First reply email", goal: "4h", cell: (r) => minutesLabel(r.firstReplyEmail) },
  { label: "Answered on time", goal: "95%", cell: (r) => pctLabel(r.answeredOnTimePct) },
  { label: "Calls to return", goal: "0", cell: (r) => r.callsToReturn },
  { label: "Waiting 2+ days", goal: "0", cell: (r) => r.waitingTwoDays },
  {
    label: "Follow-ups done",
    goal: "95%",
    cell: (r) => (
      <span>
        {pctLabel(r.followUpsPct)}
        {r.followUpsMade > 0 ? (
          <span className="ml-1.5 text-[12px] text-ink-66">
            {r.followUpsKept} of {r.followUpsMade}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    label: "Closed by hand",
    goal: "under 5%",
    cell: (r) => (
      <span>
        {pctLabel(r.closedByHandPct)}
        {r.closedByHand > 0 ? <span className="ml-1.5 text-[12px] text-ink-66">{r.closedByHand}</span> : null}
      </span>
    ),
  },
  { label: "Due a catch-up", goal: "0", cell: (r) => r.dueCatchUp },
];

function pctLabel(v: number | null) {
  return v == null ? "—" : `${v}%`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const staff = await requireStaff();
  const period = parsePeriod((await searchParams).period);
  const db = await createClient();
  const data = await getDashboard(db, { period, staffId: staff.id });

  return (
    <>
      <MobileTopBar staff={staff} />
      <main className="flex flex-col gap-8 px-4 py-6 lg:px-10 lg:py-10">
        <PageTitle
          title={`How the team is tracking, ${data.range.label}`}
          lead="One shared view, so we can all see where owners are waiting and lend a hand. Your row is highlighted."
          actions={
            <Suspense fallback={null}>
              <PeriodToggle />
            </Suspense>
          }
        />

        <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {data.headline.map((s) => (
            <Stat
              key={s.key}
              value={s.value}
              label={
                <>
                  <span className="block font-semibold text-ink">{s.label}</span>
                  {s.detail ? <span className="block">{s.detail}</span> : null}
                </>
              }
            />
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="display text-[22px] leading-tight">Across the team</h2>
          <Card className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[960px] border-collapse">
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className={TH}>
                    PM
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.label} scope="col" className={cx(TH, "text-right")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className={cx(TD, "text-ink-66")}>
                      No property managers yet.
                    </td>
                  </tr>
                ) : null}
                {data.rows.map((r) => (
                  <tr key={r.staffId} className={cx("border-b border-hairline", r.isYou && "bg-harbour-tint")}>
                    <th scope="row" className={cx(TD, "text-left font-semibold")}>
                      {r.name}
                      {r.isYou ? <span className="font-normal text-ink-66"> · you</span> : null}
                    </th>
                    {COLUMNS.map((c) => (
                      <td key={c.label} className={cx(TD, "num text-right")}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className={cx(TD, "text-left text-ink-66")}>
                    Team goal
                  </th>
                  {COLUMNS.map((c) => (
                    <td key={c.label} className={cx(TD, "num text-right text-ink-66")}>
                      {c.goal}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Card>
          <p className="text-[13px] text-ink-66">First reply is the median time to answer, counted in business hours, 8am to 6pm.</p>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="display text-[22px] leading-tight">Owners who need some care</h2>
            {data.care.length === 0 ? (
              <EmptyState title="Every owner is in good shape" body="Nobody is amber or red right now." />
            ) : (
              <Card className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th scope="col" className={TH}>
                        Owner
                      </th>
                      <th scope="col" className={TH}>
                        What&rsquo;s going on
                      </th>
                      <th scope="col" className={TH}>
                        Latest
                      </th>
                      <th scope="col" className={TH}>
                        PM
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.care.map((o) => (
                      <tr key={o.id} className="border-b border-hairline last:border-b-0 align-top">
                        <td className={cx(TD, "whitespace-normal")}>
                          <span className="inline-flex items-center gap-2">
                            <HealthDot health={o.health} />
                            <Link href={`/owners/${o.id}`} className="font-semibold text-ink">
                              {o.name}
                            </Link>
                          </span>
                        </td>
                        <td className={cx(TD, "whitespace-normal text-ink-78")}>{o.reason}</td>
                        <td className={cx(TD, "max-w-[28ch] whitespace-normal text-ink-78")}>{o.latest}</td>
                        <td className={cx(TD, "text-ink-78")}>{o.pmName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="display text-[22px] leading-tight">Where a hand would help today</h2>
            {data.help.length === 0 ? (
              <EmptyState title="Nothing waiting long today" body="Every owner has been answered and every follow-up is on track." />
            ) : (
              <Card>
                <ul className="divide-y divide-hairline">
                  {data.help.map((h, i) => (
                    <li key={`${h.href}-${i}`} className="flex flex-col gap-1 px-4 py-3">
                      <span className="text-[12px] font-semibold text-amber">{h.kind}</span>
                      <Link href={h.href} className="text-[14px] leading-relaxed text-ink no-underline hover:underline">
                        {h.sentence}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        <p className="text-[13px] text-ink-66">Every Monday the whole team gets the same summary, with how it compares to last week.</p>
      </main>
    </>
  );
}
