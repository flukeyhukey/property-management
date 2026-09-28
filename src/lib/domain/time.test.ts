import { describe, expect, it } from "vitest";
import { addBusinessMinutes, businessMinutesBetween, dueAtFor, endOfBusinessDay, nextBusinessStart } from "./time";

// Brisbane is UTC+10 all year.
const bris = (s: string) => new Date(`${s}+10:00`);

describe("business hours (Brisbane, 8am to 6pm, Mon to Fri)", () => {
  it("keeps an in-hours time as is", () => {
    expect(nextBusinessStart(bris("2026-09-29T10:15:00")).toISOString()).toBe(bris("2026-09-29T10:15:00").toISOString());
  });
  it("moves after-hours to 8am next business day", () => {
    expect(nextBusinessStart(bris("2026-09-29T19:00:00")).toISOString()).toBe(bris("2026-09-30T08:00:00").toISOString());
  });
  it("moves Friday night to Monday 8am", () => {
    expect(nextBusinessStart(bris("2026-10-02T18:30:00")).toISOString()).toBe(bris("2026-10-05T08:00:00").toISOString());
  });
  it("adds 4 business hours across a day boundary", () => {
    expect(addBusinessMinutes(bris("2026-09-29T16:00:00"), 240).toISOString()).toBe(bris("2026-09-30T10:00:00").toISOString());
  });
  it("email at 5pm Friday is due 11am Monday", () => {
    expect(dueAtFor("email", bris("2026-10-02T17:00:00")).toISOString()).toBe(bris("2026-10-05T11:00:00").toISOString());
  });
  it("maintenance is same business day", () => {
    expect(endOfBusinessDay(bris("2026-09-29T09:00:00")).toISOString()).toBe(bris("2026-09-29T18:00:00").toISOString());
    expect(endOfBusinessDay(bris("2026-09-29T20:00:00")).toISOString()).toBe(bris("2026-09-30T18:00:00").toISOString());
  });
  it("counts business minutes over a weekend", () => {
    expect(businessMinutesBetween(bris("2026-10-02T17:00:00"), bris("2026-10-05T09:00:00"))).toBe(120);
  });
});
