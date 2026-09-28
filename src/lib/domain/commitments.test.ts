import { describe, expect, it } from "vitest";
import {
  canTransition,
  carriesPromises,
  findDuplicate,
  healthAfterMissed,
  hitsTwoMissedRule,
  isResolvedIssueStatus,
  isSimilarText,
  matchIssue,
  nextHonestDue,
} from "./commitments";

const bris = (s: string) => new Date(`${s}+10:00`);
const NOW = bris("2026-09-29T10:00:00");

describe("status transitions", () => {
  it("suggested can be confirmed or kept, open can be kept or missed", () => {
    expect(canTransition("suggested", "open")).toBe(true);
    expect(canTransition("suggested", "kept")).toBe(true);
    expect(canTransition("open", "kept")).toBe(true);
    expect(canTransition("open", "missed")).toBe(true);
  });
  it("kept and missed are terminal (reopening makes a new row)", () => {
    expect(canTransition("kept", "open")).toBe(false);
    expect(canTransition("missed", "open")).toBe(false);
    expect(canTransition("missed", "kept")).toBe(false);
    expect(canTransition("suggested", "missed")).toBe(false);
  });
});

describe("dedupe", () => {
  it("treats reworded promises as the same", () => {
    expect(isSimilarText("Send the invoice", "Send the invoice for the plumber")).toBe(true);
    expect(isSimilarText("Send the plumber's quote", "Call back about the pool gate")).toBe(false);
  });
  it("finds a duplicate inside the window and ignores one outside it", () => {
    const existing = [
      { id: "a", text: "Send the invoice", made_at: bris("2026-09-25T09:00:00").toISOString() },
      { id: "b", text: "Chase the electrician", made_at: bris("2026-09-01T09:00:00").toISOString() },
    ];
    expect(findDuplicate(existing, "Send you the invoice", NOW)?.id).toBe("a");
    expect(findDuplicate(existing, "Chase the electrician for a quote", NOW)).toBeNull();
    expect(findDuplicate(existing, "Book the cleaner", NOW)).toBeNull();
  });
});

describe("two-missed rule", () => {
  it("fires on two missed in 90 days, not on one, not on old ones", () => {
    expect(hitsTwoMissedRule([bris("2026-09-01T10:00:00"), bris("2026-09-20T10:00:00")], NOW)).toBe(true);
    expect(hitsTwoMissedRule([bris("2026-09-20T10:00:00")], NOW)).toBe(false);
    expect(hitsTwoMissedRule([bris("2026-05-01T10:00:00"), bris("2026-09-20T10:00:00")], NOW)).toBe(false);
  });
  it("turns green amber, leaves red alone, never changes when the rule misses", () => {
    expect(healthAfterMissed("green", true)).toBe("amber");
    expect(healthAfterMissed("amber", true)).toBe("amber");
    expect(healthAfterMissed("red", true)).toBe("red");
    expect(healthAfterMissed("green", false)).toBe("green");
  });
});

describe("helpers", () => {
  it("offers a new date two business days out", () => {
    expect(nextHonestDue(NOW).toISOString()).toBe(bris("2026-10-01T18:00:00").toISOString());
    expect(nextHonestDue(bris("2026-10-01T15:00:00")).toISOString()).toBe(bris("2026-10-05T18:00:00").toISOString());
  });
  it("knows which issue statuses count as resolved", () => {
    expect(isResolvedIssueStatus("resolved")).toBe(true);
    expect(isResolvedIssueStatus("Closed")).toBe(true);
    expect(isResolvedIssueStatus("open")).toBe(false);
    expect(isResolvedIssueStatus(null)).toBe(false);
  });
  it("links a promise to the issue it is about", () => {
    const issues = [
      { id: "1", description: "Pool gate latch broken, does not close", category: "maintenance" },
      { id: "2", description: "Leaking tap in the ensuite", category: "maintenance" },
    ];
    expect(matchIssue("Send the plumber's quote for the leaking tap", issues)?.id).toBe("2");
    expect(matchIssue("Send the owner statement", issues)).toBeNull();
  });
  it("only outbound emails, SMS and transcribed calls carry promises", () => {
    expect(carriesPromises({ direction: "outbound", channel: "email", is_auto_reply: false, body: "I'll send it", transcript: null })).toBe(true);
    expect(carriesPromises({ direction: "outbound", channel: "call", is_auto_reply: false, body: null, transcript: "I'll send it" })).toBe(true);
    expect(carriesPromises({ direction: "outbound", channel: "call", is_auto_reply: false, body: null, transcript: null })).toBe(false);
    expect(carriesPromises({ direction: "inbound", channel: "email", is_auto_reply: false, body: "I'll send it", transcript: null })).toBe(false);
    expect(carriesPromises({ direction: "outbound", channel: "email", is_auto_reply: true, body: "Out of office", transcript: null })).toBe(false);
  });
});
