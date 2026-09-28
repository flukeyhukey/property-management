/**
 * The scheduled nudges. Each function only INSERTS lane_notifications rows
 * (deduped by dedupe_key); flushNotifications in ./push.ts delivers them.
 *
 *  - 5pm daily to each PM: owners still waiting, follow-ups due tomorrow.
 *  - Daily to directors: new survey responses of 6 or under.
 *  - Monday to everyone: the same five numbers, this week against last.
 */
import { TZDate } from "@date-fns/tz";
import type { AdminClient } from "@/lib/supabase/admin";
import { TZ } from "@/lib/domain/time";
import { gmail } from "@/lib/integrations/gmail";
import {
  getHeadlineStats,
  isoWeekKey,
  lastCompletedWeek,
  type HeadlineStat,
  type PeriodRange,
} from "@/lib/queries/dashboard";

const DAY = 24 * 60 * 60 * 1000;

type NotificationInsert = {
  staff_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  dedupe_key: string;
};

async function enqueue(db: AdminClient, rows: NotificationInsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await db.from("lane_notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) throw new Error(`enqueue: ${error.message}`);
  return rows.length;
}

/** yyyy-mm-dd in Brisbane. */
function localDateKey(d: Date): string {
  const t = new TZDate(d, TZ);
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${mm}-${dd}`;
}

function startOfLocalDay(d: Date, offsetDays = 0): Date {
  const t = new TZDate(d, TZ);
  return new Date(new TZDate(t.getFullYear(), t.getMonth(), t.getDate() + offsetDays, 0, 0, 0, 0, TZ).getTime());
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Daily 5pm: your day in two numbers
// ---------------------------------------------------------------------------

export async function enqueueDaily5pm(db: AdminClient, now: Date = new Date()): Promise<{ queued: number }> {
  const [{ data: pms }, { data: loops }, { data: commitments }] = await Promise.all([
    db.from("lane_staff").select("id, name").eq("is_active", true).eq("role", "pm"),
    db.from("lane_loops").select("owner_id, assigned_pm_id").eq("status", "open"),
    db
      .from("lane_commitments")
      .select("id, owner_id, made_by, due_at")
      .eq("status", "open")
      .gte("due_at", startOfLocalDay(now, 1).toISOString())
      .lt("due_at", startOfLocalDay(now, 2).toISOString()),
  ]);

  // Follow-ups without a maker belong to the owner's PM.
  const ownerIds = Array.from(new Set((commitments ?? []).filter((c) => !c.made_by).map((c) => c.owner_id)));
  const ownerPm = new Map<string, string | null>();
  if (ownerIds.length) {
    const { data: owners } = await db.from("lane_owners").select("id, assigned_pm_id").in("id", ownerIds);
    for (const o of owners ?? []) ownerPm.set(o.id, o.assigned_pm_id);
  }

  const dateKey = localDateKey(now);
  const rows: NotificationInsert[] = (pms ?? []).map((pm) => {
    const waiting = new Set((loops ?? []).filter((l) => l.assigned_pm_id === pm.id).map((l) => l.owner_id)).size;
    const due = (commitments ?? []).filter((c) => (c.made_by ?? ownerPm.get(c.owner_id) ?? null) === pm.id).length;
    return {
      staff_id: pm.id,
      kind: "daily_5pm",
      title: "Your day in two numbers",
      body: `${plural(waiting, "owner", "owners")} still waiting on you · ${plural(due, "follow-up", "follow-ups")} due tomorrow`,
      url: "/queue",
      dedupe_key: `daily:${pm.id}:${dateKey}`,
    };
  });
  return { queued: await enqueue(db, rows) };
}

// ---------------------------------------------------------------------------
// Directors: new survey responses of 6 or under
// ---------------------------------------------------------------------------

export async function enqueueDirectorDetractors(db: AdminClient, now: Date = new Date()): Promise<{ queued: number }> {
  const since = new Date(now.getTime() - DAY).toISOString();
  const [{ data: directors }, { data: responses }] = await Promise.all([
    db.from("lane_staff").select("id").eq("is_active", true).eq("role", "director"),
    db
      .from("lane_nps_responses")
      .select("id, score, comment, loop_id, owner_id, owner:lane_owners!lane_nps_responses_owner_id_fkey(name)")
      .lte("score", 6)
      .gte("responded_at", since),
  ]);
  const rows: NotificationInsert[] = [];
  for (const r of responses ?? []) {
    const ownerName = (r.owner as { name: string } | null)?.name ?? "an owner";
    for (const d of directors ?? []) {
      rows.push({
        staff_id: d.id,
        kind: "detractor",
        title: `New survey response from ${ownerName}: ${r.score}`,
        body: r.comment?.trim() || "A call from a director closes it.",
        url: r.loop_id ? `/loops/${r.loop_id}` : `/owners/${r.owner_id}`,
        dedupe_key: `detractor:${r.id}:${d.id}`,
      });
    }
  }
  return { queued: await enqueue(db, rows) };
}

// ---------------------------------------------------------------------------
// Monday: the same summary for everyone
// ---------------------------------------------------------------------------

function trendShort(s: HeadlineStat): string {
  if (s.numeric == null || s.previous == null) return "";
  const diff = s.numeric - s.previous;
  if (diff === 0) return "level";
  return `${diff > 0 ? "up" : "down"} ${Math.abs(diff)}`;
}

/** "Owners answered on time 92%, up 3 · Missed calls returned within the hour 88%, down 1 · ..." */
export function weeklyBody(stats: HeadlineStat[]): string {
  return stats
    .map((s) => {
      const t = trendShort(s);
      return `${s.label} ${s.value}${t ? `, ${t}` : ""}`;
    })
    .join(" · ");
}

const PALETTE = {
  navy: "#052c55",
  harbour: "#078cc5",
  ground: "#f8f9fa",
  card: "#ffffff",
  ink78: "#3a5979",
  ink66: "#58728d",
  hairline: "#e1e6eb",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The Monday digest as an email. Inline styles only; the same five numbers as the dashboard. */
export function renderWeeklyDigestEmail(stats: HeadlineStat[], range?: PeriodRange, appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""): string {
  const heading = range ? `How the team is tracking, ${range.label}` : "How the team is tracking";
  const compare = range?.compareLabel ?? "last week";
  const rows = stats
    .map((s) => {
      const t = trendShort(s);
      return `
        <tr>
          <td style="padding:12px 0;border-top:1px solid ${PALETTE.hairline};font-size:15px;color:${PALETTE.navy};">${escapeHtml(s.label)}</td>
          <td style="padding:12px 0;border-top:1px solid ${PALETTE.hairline};font-size:22px;font-weight:700;color:${PALETTE.navy};text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(s.value)}</td>
          <td style="padding:12px 0 12px 16px;border-top:1px solid ${PALETTE.hairline};font-size:13px;color:${PALETTE.ink66};text-align:right;white-space:nowrap;">${escapeHtml(t ? `${t} on ${compare}` : s.detail)}</td>
        </tr>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:24px;background:${PALETTE.ground};font-family:Manrope,Helvetica,Arial,sans-serif;color:${PALETTE.navy};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:${PALETTE.card};border:1px solid ${PALETTE.hairline};border-radius:12px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.015em;">Lane<span style="color:${PALETTE.harbour};">.</span></p>
      <h1 style="margin:0 0 8px;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.015em;">${escapeHtml(heading)}<span style="color:${PALETTE.harbour};">.</span></h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${PALETTE.ink78};">The same five numbers the whole team sees, with how they compare to ${escapeHtml(compare)}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;">
      <a href="${escapeHtml(appUrl)}/dashboard" style="display:inline-block;padding:12px 18px;background:${PALETTE.navy};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">Open the dashboard</a>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${PALETTE.ink66};">First reply is the median time to answer, counted in business hours, 8am to 6pm.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function enqueueWeeklyDigest(
  db: AdminClient,
  now: Date = new Date(),
): Promise<{ queued: number; emailed: number }> {
  const range = lastCompletedWeek(now);
  const [stats, { data: staff }] = await Promise.all([
    getHeadlineStats(db, range, now),
    db.from("lane_staff").select("id, name, email, role, gmail_refresh_token").eq("is_active", true).order("created_at"),
  ]);
  const everyone = staff ?? [];
  const week = isoWeekKey(range.start);
  const title = `How the team is tracking, ${range.label}`;
  const body = weeklyBody(stats);

  const queued = await enqueue(
    db,
    everyone.map((s) => ({
      staff_id: s.id,
      kind: "weekly_digest",
      title,
      body,
      url: "/dashboard",
      dedupe_key: `weekly:${s.id}:${week}`,
    })),
  );

  // Email the same digest from the first connected director's Gmail. The
  // adapter sends text/plain, so the plain rendering goes out; the HTML
  // rendering is exported for when it can carry HTML. Failures are logged.
  let emailed = 0;
  const sender = everyone.find((s) => s.role === "director" && s.gmail_refresh_token);
  if (sender) {
    let adapter: ReturnType<typeof gmail> | null = null;
    try {
      adapter = gmail(db);
    } catch (err) {
      console.error("[digest] gmail adapter unavailable", err);
    }
    if (adapter && typeof adapter.sendReply === "function") {
      const text = renderWeeklyDigestText(stats, range);
      for (const s of everyone) {
        try {
          await adapter.sendReply(sender.id, { to: s.email, subject: title, body: text });
          emailed += 1;
        } catch (err) {
          console.error(`[digest] weekly email to ${s.email} failed`, err);
        }
      }
    }
  }
  return { queued, emailed };
}

/** The Monday digest as plain text, one number per line. */
export function renderWeeklyDigestText(stats: HeadlineStat[], range?: PeriodRange, appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""): string {
  const heading = range ? `How the team is tracking, ${range.label}.` : "How the team is tracking.";
  const compare = range?.compareLabel ?? "last week";
  const lines = stats.map((s) => {
    const t = trendShort(s);
    return `${s.label}: ${s.value}${t ? ` (${t} on ${compare})` : ` (${s.detail})`}`;
  });
  return [
    heading,
    "",
    `The same five numbers the whole team sees, with how they compare to ${compare}.`,
    "",
    ...lines,
    "",
    `Open the dashboard: ${appUrl}/dashboard`,
    "",
    "First reply is the median time to answer, counted in business hours, 8am to 6pm.",
  ].join("\n");
}
