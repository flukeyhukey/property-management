/**
 * Small pure helpers shared by the queue and the reply screen. No React here
 * so both server and client components can import it.
 */
import type { LoopType } from "@/lib/domain/types";
import { LOOP_TYPE_LABEL } from "@/lib/domain/types";
import { normalisePhone } from "@/lib/domain/match";
import type { QueueProperty } from "@/lib/queries/queue";

/**
 * Dialpad click-to-dial, same format as the Dialpad adapter's clickToDialUrl
 * (which can't be imported client-side because it pulls in node:crypto).
 */
export function clickToDialUrl(phone: string | null | undefined): string {
  const e164 = normalisePhone(phone);
  return e164 ? `dialpad://${e164}` : "#";
}

/** "2BR Wickham St, Fortitude Valley" from what the cleaning app knows. */
export function propertyLine(p: QueueProperty | null | undefined): string | null {
  if (!p) return null;
  const parts: string[] = [];
  const br = p.bedrooms ? `${p.bedrooms}BR` : null;
  const street = p.address?.trim() || p.name?.trim() || null;
  const suburb = p.suburb?.trim() || p.region?.trim() || null;
  if (br && street) parts.push(`${br} ${street}`);
  else if (street) parts.push(street);
  else if (br) parts.push(br);
  if (suburb) parts.push(suburb);
  return parts.length ? parts.join(", ") : null;
}

/** "Missed call · 2BR Wickham St, Fortitude Valley" */
export function contextLine(type: LoopType, property: QueueProperty | null | undefined): string {
  const place = propertyLine(property);
  return place ? `${LOOP_TYPE_LABEL[type]} · ${place}` : LOOP_TYPE_LABEL[type];
}

/** Which of Call / Reply is the navy button for this kind of loop. */
export function primaryActionFor(type: LoopType): "call" | "reply" {
  return type === "missed_call" || type === "detractor" || type === "resly" ? "call" : "reply";
}

export function daysAgo(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export function numberWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "11:02am" in Brisbane time. */
export function timeOfDay(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })
    .replace(/\s/g, "")
    .toLowerCase();
}

/** "Tue 3 Oct" in Brisbane time. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
}

/** yyyy-mm-dd in Brisbane time, for date inputs. */
export function dateInputValue(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
}
