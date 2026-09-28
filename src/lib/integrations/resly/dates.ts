/**
 * Local-date arithmetic for occupancy windows. Resly and the cleaning app
 * both think in Brisbane calendar dates, so everything here works on
 * "YYYY-MM-DD" strings and integer day indexes, never on timestamps.
 */
import { TZDate } from "@date-fns/tz";
import { TZ } from "@/lib/domain/time";

export type LocalDate = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;

/** The Brisbane calendar date `d` falls on. */
export function localDate(d: Date): LocalDate {
  const t = new TZDate(d, TZ);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Days since the epoch for a local date (or the date part of an ISO string). */
export function dayIndex(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayIndex(idx: number): LocalDate {
  const d = new Date(idx * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayIndex(dayIndex(date) + days);
}

/** Same calendar date one year earlier (29 Feb becomes 28 Feb). */
export function lastYear(date: LocalDate): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m - 1, Math.min(d, 28)));
  return fromDayIndex(Math.floor(last.getTime() / DAY_MS));
}

/** "2026-10" for a local date. */
export function yyyyMm(date: LocalDate): string {
  return date.slice(0, 7);
}

/** [first of month, first of next month) for the month containing `date`. */
export function monthWindow(date: LocalDate): { from: LocalDate; to: LocalDate } {
  const [y, m] = date.split("-").map(Number);
  const from = `${y}-${pad(m)}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { from, to };
}

/** [date, date + 30) */
export function next30Window(date: LocalDate): { from: LocalDate; to: LocalDate } {
  return { from: date, to: addDays(date, 30) };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October" for "2026-10-14" or "2026-10". */
export function monthName(date: string): string {
  return MONTH_NAMES[Number(date.slice(5, 7)) - 1];
}

/** Nights a stay [checkIn, checkOut) spends inside the window [from, to). */
export function overlapNights(checkIn: string, checkOut: string, from: LocalDate, to: LocalDate): number {
  const start = Math.max(dayIndex(checkIn), dayIndex(from));
  const end = Math.min(dayIndex(checkOut), dayIndex(to));
  return Math.max(0, end - start);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
