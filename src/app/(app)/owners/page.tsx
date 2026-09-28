import Link from "next/link";
import { canReassign, requireStaff } from "@/lib/auth";
import { listOwners } from "@/lib/queries/owners";
import { createClient } from "@/lib/supabase/server";
import type { Health } from "@/lib/domain/types";
import { MobileTopBar, PageTitle } from "@/components/page-header";
import { ChevronRight } from "@/components/ui/icons";
import { EmptyState, HealthDot, cx } from "@/components/ui/primitives";
import { OwnerFilters } from "./_components/OwnerFilters";
import { ReassignSelect } from "./_components/ReassignSelect";
import { ago, inDays, plural } from "./_components/format";

const HEALTHS: Health[] = ["green", "amber", "red"];

const GRID = "lg:grid lg:grid-cols-[16px_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px_minmax(0,1fr)_24px] lg:items-center lg:gap-4";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const q = first(params.q).trim();
  const healthParam = first(params.health);
  const health = HEALTHS.includes(healthParam as Health) ? (healthParam as Health) : null;
  const pmId = first(params.pm);

  const supabase = await createClient();
  const [rows, { data: staffList }] = await Promise.all([
    listOwners({ q, health, pmId: pmId || null }),
    supabase.from("lane_staff").select("id, name, role").eq("is_active", true).order("name"),
  ]);
  const pms = (staffList ?? []).map((s) => ({ id: s.id, name: s.name }));
  const showReassign = canReassign(staff);
  const now = new Date();

  const needsAttention = rows.filter((r) => r.owner.health === "red").length;
  const needsCare = rows.filter((r) => r.owner.health === "amber").length;
  let lead: string;
  if (rows.length === 0) lead = "No owners match yet.";
  else if (needsAttention + needsCare === 0) lead = `${plural(rows.length, "owner")}, and everyone is in good shape.`;
  else {
    const parts: string[] = [];
    if (needsAttention) parts.push(`${needsAttention} could use a call today`);
    if (needsCare) parts.push(`${needsCare} could use a little care`);
    lead = `${plural(rows.length, "owner")}. ${parts.join(", ")}.`;
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileTopBar staff={staff} />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-8">
        <PageTitle title="Owners" lead={lead} />

        <OwnerFilters q={q} health={health ?? ""} pmId={pmId} staff={pms} />

        {rows.length === 0 ? (
          <EmptyState title="Nobody here" body="Try a different name, or clear the filters." />
        ) : (
          <div className="rounded-[12px] border border-hairline bg-card">
            <div className={cx("hidden border-b border-hairline px-4 py-2 text-xs font-semibold text-ink-66", GRID)}>
              <span aria-hidden="true" />
              <span>Owner</span>
              <span>Properties</span>
              <span>Manager</span>
              <span>Last contact</span>
              <span className="text-right">To reply</span>
              <span>Next catch-up</span>
              <span aria-hidden="true" />
            </div>
            <ul className="divide-y divide-hairline">
              {rows.map((row) => {
                const { owner } = row;
                const where = row.regions.length ? row.regions.join(", ") : "No region yet";
                const manager = showReassign ? (
                  <span className="relative z-10">
                    <ReassignSelect ownerId={owner.id} ownerName={owner.name} currentPmId={owner.assigned_pm_id} staff={pms} />
                  </span>
                ) : (
                  <span className="truncate text-sm text-ink-78">{row.pm ? row.pm.name : "Unassigned"}</span>
                );
                return (
                  <li key={owner.id} className={cx("relative hover:bg-ground", GRID, "lg:px-4 lg:py-3")}>
                    {/* Phone layout */}
                    <div className="flex items-start gap-3 px-4 py-4 lg:hidden">
                      <HealthDot health={owner.health} className="mt-2" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Link href={`/owners/${owner.id}`} className="text-[16px] font-semibold text-ink no-underline after:absolute after:inset-0 after:content-['']">
                          {owner.name}
                        </Link>
                        <span className="text-sm text-ink-66">
                          {plural(row.propertyCount, "property", "properties")} · {where}
                        </span>
                        <span className="text-sm text-ink-66">
                          {row.pm ? row.pm.name : "Unassigned"} · Last contact {ago(owner.last_contact_at, now)}
                        </span>
                        <span className="text-sm text-ink-66">
                          {row.openLoops > 0 ? `${plural(row.openLoops, "reply", "replies")} waiting · ` : ""}
                          Catch-up {row.nextCatchUpAt ? inDays(row.nextCatchUpAt, now) : "not set"}
                        </span>
                        {showReassign ? <span className="mt-2">{manager}</span> : null}
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-40" strokeWidth={1.75} aria-hidden="true" />
                    </div>

                    {/* Desktop cells */}
                    <span className="hidden lg:flex lg:justify-center">
                      <HealthDot health={owner.health} />
                    </span>
                    <Link
                      href={`/owners/${owner.id}`}
                      className="hidden truncate text-[15px] font-semibold text-ink no-underline after:absolute after:inset-0 after:content-[''] lg:block"
                    >
                      {owner.name}
                    </Link>
                    <span className="hidden truncate text-sm text-ink-78 lg:block">
                      <span className="num">{row.propertyCount}</span> · {where}
                    </span>
                    <span className="hidden lg:block">{manager}</span>
                    <span className="hidden text-sm text-ink-78 lg:block">{ago(owner.last_contact_at, now)}</span>
                    <span className={cx("num hidden text-right text-sm lg:block", row.openLoops > 0 ? "font-semibold text-ink" : "text-ink-40")}>
                      {row.openLoops}
                    </span>
                    <span className="hidden text-sm text-ink-78 lg:block">{row.nextCatchUpAt ? inDays(row.nextCatchUpAt, now) : "Not set"}</span>
                    <ChevronRight className="hidden h-5 w-5 text-ink-40 lg:block" strokeWidth={1.75} aria-hidden="true" />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
