/**
 * Business-hours clock: Australia/Brisbane (no daylight saving), 8am to 6pm,
 * Monday to Friday. Mirrors the lane_* SQL functions so the app and the
 * database agree on every due time.
 */
import { TZDate } from "@date-fns/tz";
import { addMinutes, differenceInMinutes, isAfter, isBefore } from "date-fns";

export const TZ = "Australia/Brisbane";
const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;

function local(d: Date): TZDate {
  return new TZDate(d, TZ);
}

function at(d: TZDate, hour: number): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0, TZ);
}

function isWeekend(d: TZDate) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function nextDay(d: TZDate): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + 1, OPEN_HOUR, 0, 0, 0, TZ);
}

/** First moment on or after `d` that falls inside business hours. */
export function nextBusinessStart(d: Date): Date {
  let cur = local(d);
  for (;;) {
    if (isWeekend(cur)) {
      cur = nextDay(cur);
      continue;
    }
    const open = at(cur, OPEN_HOUR);
    const close = at(cur, CLOSE_HOUR);
    if (isBefore(cur, open)) return new Date(open.getTime());
    if (!isBefore(cur, close)) {
      cur = nextDay(cur);
      continue;
    }
    return new Date(cur.getTime());
  }
}

/** Adds `minutes` of business time to `d`. After-hours input starts at 8am next business day. */
export function addBusinessMinutes(d: Date, minutes: number): Date {
  let cur = local(nextBusinessStart(d));
  let remaining = minutes;
  for (;;) {
    const close = at(cur, CLOSE_HOUR);
    const avail = differenceInMinutes(close, cur);
    if (remaining <= avail) return new Date(addMinutes(cur, remaining).getTime());
    remaining -= avail;
    cur = local(nextBusinessStart(nextDay(cur)));
  }
}

/** 6pm on the business day `d` falls in, or the next business day if after hours. */
export function endOfBusinessDay(d: Date): Date {
  const start = local(nextBusinessStart(d));
  return new Date(at(start, CLOSE_HOUR).getTime());
}

/** Business minutes elapsed between `a` and `b`. */
export function businessMinutesBetween(a: Date, b: Date): number {
  let cur = local(nextBusinessStart(a));
  let total = 0;
  if (!isAfter(b, cur)) return 0;
  for (;;) {
    const close = at(cur, CLOSE_HOUR);
    if (!isAfter(b, close)) return total + differenceInMinutes(b, cur);
    total += differenceInMinutes(close, cur);
    cur = local(nextBusinessStart(nextDay(cur)));
    if (!isAfter(b, cur)) return total;
  }
}

export function isBusinessHours(d: Date = new Date()): boolean {
  return nextBusinessStart(d).getTime() === new Date(d).getTime();
}

/** SLA clocks from the brief, in business minutes. */
export const SLA_MINUTES = {
  missed_call: 60,
  sms: 60,
  email: 4 * 60,
  detractor: 24 * 60, // 24 clock hours, applied as-is (see dueAtFor)
} as const;

/** When a loop of `type` opened at `openedAt` is due. */
export function dueAtFor(type: "email" | "missed_call" | "sms" | "maintenance" | "detractor" | "resly", openedAt: Date): Date {
  switch (type) {
    case "missed_call":
      return addBusinessMinutes(openedAt, SLA_MINUTES.missed_call);
    case "sms":
      return addBusinessMinutes(openedAt, SLA_MINUTES.sms);
    case "email":
      return addBusinessMinutes(openedAt, SLA_MINUTES.email);
    case "maintenance":
      return endOfBusinessDay(openedAt);
    case "detractor":
      return new Date(openedAt.getTime() + 24 * 60 * 60 * 1000);
    case "resly":
      return addBusinessMinutes(openedAt, 2 * 10 * 60); // two business days
  }
}

/** "18m left", "Waiting 1h 38m", "By end of day" style labels for the queue. */
export function timeLeftLabel(dueAt: Date, now: Date = new Date()): { label: string; overdue: boolean } {
  const diff = Math.round((dueAt.getTime() - now.getTime()) / 60000);
  if (diff < 0) {
    return { label: `Waiting ${formatMinutes(-diff)}`, overdue: true };
  }
  if (diff < 60 * 3) return { label: `${formatMinutes(diff)} left`, overdue: false };
  const dueLocal = local(dueAt);
  const nowLocal = local(now);
  if (dueLocal.getDate() === nowLocal.getDate() && dueLocal.getMonth() === nowLocal.getMonth()) {
    return { label: "By end of day", overdue: false };
  }
  return { label: "Tomorrow", overdue: false };
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
