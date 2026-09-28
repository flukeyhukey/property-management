import { describe, expect, it } from "vitest";
import { addBusinessDays, defaultDueAt, heuristicExtract, resolveDueDate, toImperative } from "./extract";

// Brisbane is UTC+10 all year.
const bris = (s: string) => new Date(`${s}+10:00`);
const iso = (d: Date) => d.toISOString();

// Tuesday 29 September 2026, 10:15am Brisbane.
const TUE = bris("2026-09-29T10:15:00");

describe("resolveDueDate (Australia/Brisbane)", () => {
  it("resolves a weekday to 6pm that day", () => {
    expect(iso(resolveDueDate("Friday", TUE))).toBe(iso(bris("2026-10-02T18:00:00")));
    expect(iso(resolveDueDate("by fri", TUE))).toBe(iso(bris("2026-10-02T18:00:00")));
  });
  it("treats the same weekday as today when said in hours", () => {
    expect(iso(resolveDueDate("Tuesday", TUE))).toBe(iso(bris("2026-09-29T18:00:00")));
  });
  it("resolves tomorrow", () => {
    expect(iso(resolveDueDate("tomorrow", TUE))).toBe(iso(bris("2026-09-30T18:00:00")));
  });
  it("moves tomorrow-on-a-Friday to Monday", () => {
    const fri = bris("2026-10-02T09:00:00");
    expect(iso(resolveDueDate("tomorrow", fri))).toBe(iso(bris("2026-10-05T18:00:00")));
  });
  it("resolves end of week to Friday", () => {
    expect(iso(resolveDueDate("by end of week", TUE))).toBe(iso(bris("2026-10-02T18:00:00")));
    expect(iso(resolveDueDate("end of the week", TUE))).toBe(iso(bris("2026-10-02T18:00:00")));
  });
  it("resolves next week to Friday of the following week", () => {
    expect(iso(resolveDueDate("next week", TUE))).toBe(iso(bris("2026-10-09T18:00:00")));
  });
  it("resolves next Monday to the Monday of next week", () => {
    expect(iso(resolveDueDate("next Monday", TUE))).toBe(iso(bris("2026-10-05T18:00:00")));
  });
  it("resolves today to end of business today", () => {
    expect(iso(resolveDueDate("this afternoon", TUE))).toBe(iso(bris("2026-09-29T18:00:00")));
  });
  it("resolves in N days", () => {
    expect(iso(resolveDueDate("in 3 days", TUE))).toBe(iso(bris("2026-10-02T18:00:00")));
    expect(iso(resolveDueDate("within two business days", TUE))).toBe(iso(bris("2026-10-01T18:00:00")));
  });
  it("resolves an ISO date", () => {
    expect(iso(resolveDueDate("2026-10-14", TUE))).toBe(iso(bris("2026-10-14T18:00:00")));
  });
  it("defaults to two business days when vague or empty", () => {
    expect(iso(resolveDueDate(null, TUE))).toBe(iso(bris("2026-10-01T18:00:00")));
    expect(iso(resolveDueDate("soonish", TUE))).toBe(iso(bris("2026-10-01T18:00:00")));
    expect(iso(defaultDueAt(TUE))).toBe(iso(bris("2026-10-01T18:00:00")));
  });
  it("skips the weekend when adding business days", () => {
    const thu = bris("2026-10-01T15:00:00");
    expect(iso(addBusinessDays(thu, 2))).toBe(iso(bris("2026-10-05T18:00:00")));
  });
});

describe("toImperative", () => {
  it("turns a promise into a short imperative", () => {
    expect(toImperative("send you the invoice")).toBe("Send the invoice");
    expect(toImperative("I'll call you back")).toBe("Call back");
    expect(toImperative("chase the plumber for a quote")).toBe("Chase the plumber for a quote");
  });
  it("caps at 80 characters", () => {
    const long = "organise " + "a very long description of what we will do ".repeat(4);
    expect(toImperative(long).length).toBeLessThanOrEqual(80);
  });
});

describe("heuristicExtract", () => {
  const ownerName = "Graham Lee";

  it("finds promises and resolves their dates", () => {
    const text = [
      "Hi Graham,",
      "",
      "Thanks for the call. I'll send you the plumber's quote by Friday and we'll chase the electrician tomorrow.",
      "Let me know if you'd like anything else.",
      "",
      "Thanks,",
      "Sarah",
    ].join("\n");
    const out = heuristicExtract({ text, sentAt: TUE, ownerName });
    expect(out.map((c) => c.text)).toEqual(["Send the plumber's quote", "Chase the electrician"]);
    expect(iso(out[0].dueAt)).toBe(iso(bris("2026-10-02T18:00:00")));
    expect(iso(out[1].dueAt)).toBe(iso(bris("2026-09-30T18:00:00")));
    expect(out[0].confidence).toBeGreaterThan(0.8);
  });

  it("defaults the due date when no time is given", () => {
    const out = heuristicExtract({ text: "I will forward the owner statement once accounts have run it.", sentAt: TUE, ownerName });
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/^Forward the owner statement/);
    expect(iso(out[0].dueAt)).toBe(iso(bris("2026-10-01T18:00:00")));
    expect(out[0].confidence).toBeLessThan(0.8);
  });

  it("ignores things the owner will do and quoted replies", () => {
    const text = [
      "If you could send the keys back we'll be able to start on Monday.",
      "",
      "On Mon, 28 Sep 2026, Graham wrote:",
      "> I'll drop them off tomorrow.",
    ].join("\n");
    const out = heuristicExtract({ text, sentAt: TUE, ownerName });
    expect(out.map((c) => c.text)).not.toContain("Drop them off");
    expect(out.some((c) => /keys/.test(c.text))).toBe(false);
  });

  it("returns nothing for a plain thank-you", () => {
    expect(heuristicExtract({ text: "Thanks Graham, all sorted.", sentAt: TUE, ownerName })).toEqual([]);
  });
});
