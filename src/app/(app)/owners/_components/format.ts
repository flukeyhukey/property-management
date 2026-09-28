/**
 * Small, pure formatting helpers for the owner pages. Everything is in
 * Brisbane time and reads like a person wrote it.
 */
import { TZ, formatMinutes } from "@/lib/domain/time";
import type { ContactMethod } from "@/lib/domain/types";

const DAY = 24 * 60 * 60 * 1000;

export function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / DAY);
}

/** "today", "yesterday", "3 days ago", "6 weeks ago", "4 months ago". */
export function ago(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = daysBetween(d, now);
  if (d > now) return inDays(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks". */
export function inDays(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "not set";
  const d = new Date(iso);
  if (d < now) return ago(iso, now);
  const days = daysBetween(now, d);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/** "12 Sep" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: TZ });
}

/** "12 Sep 2025" */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

/** "March 2024" */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: TZ });
}

/** "Today 4:10pm", "Yesterday 9:02am", "12 Sep, 4:10pm", "12 Sep 2025". */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
    .replace(/\s/g, "")
    .toLowerCase();
  const days = daysBetween(d, now);
  const sameYear = d.toLocaleDateString("en-AU", { year: "numeric", timeZone: TZ }) === now.toLocaleDateString("en-AU", { year: "numeric", timeZone: TZ });
  if (days === 0 && d <= now) return `Today ${time}`;
  if (days === 1 && d <= now) return `Yesterday ${time}`;
  if (sameYear) return `${shortDate(iso)}, ${time}`;
  return longDate(iso);
}

/** Business minutes as "1h 38m", or a friendlier day count when it is long. */
export function waitLabel(minutes: number | null): string {
  if (minutes === null) return "Nothing waiting";
  return formatMinutes(minutes);
}

export function contactMethodLabel(method: ContactMethod): string {
  switch (method) {
    case "call":
      return "a phone call";
    case "email":
      return "email";
    case "sms":
      return "a text";
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "the Gold Coast", "Brisbane and the Sunshine Coast" */
export function regionsSentence(regions: string[]): string {
  const named = regions.map((r) => (/coast$/i.test(r) && !/^the /i.test(r) ? `the ${r}` : r));
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  if (named.length === 2) return `${named[0]} and ${named[1]}`;
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? "–" : `${Math.round(n)}%`;
}
