import { describe, expect, it } from "vitest";
import { cadenceDueAt, cadenceTalkingPoint, type CadenceOwner } from "./cadence";

const now = new Date("2026-09-28T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function owner(over: Partial<CadenceOwner>): CadenceOwner {
  return { lastOutboundAt: null, onboardedAt: null, createdAt: daysAgo(400), cadenceDays: 90, hasOpenTask: false, ...over };
}

describe("cadenceDueAt", () => {
  it("waits until a week before contact is due", () => {
    expect(cadenceDueAt(owner({ lastOutboundAt: daysAgo(82) }), now)).toBeNull();
    const due = cadenceDueAt(owner({ lastOutboundAt: daysAgo(83) }), now);
    expect(due?.toISOString()).toBe(new Date(now.getTime() + 7 * 86_400_000).toISOString());
  });
  it("clamps a past due date to now", () => {
    expect(cadenceDueAt(owner({ lastOutboundAt: daysAgo(120) }), now)?.toISOString()).toBe(now.toISOString());
  });
  it("falls back to onboarding when we have never reached out", () => {
    expect(cadenceDueAt(owner({ onboardedAt: daysAgo(25), cadenceDays: 30 }), now)).not.toBeNull();
    expect(cadenceDueAt(owner({ onboardedAt: daysAgo(10), cadenceDays: 30 }), now)).toBeNull();
  });
  it("never doubles up on an open task", () => {
    expect(cadenceDueAt(owner({ lastOutboundAt: daysAgo(200), hasOpenTask: true }), now)).toBeNull();
  });
});

describe("cadenceTalkingPoint", () => {
  it("compares the month with last year", () => {
    expect(
      cadenceTalkingPoint({
        snapshot: { snapshot_date: "2026-10-03", occupancy_month: 0.81, occupancy_month_last_year: 0.72, occupancy_next_30: 0.8 },
        reviewRatings: [],
        isNewOwner: false,
      }),
    ).toBe("October is 81% booked, up 9 points on last year.");
  });
  it("uses first reviews for new owners", () => {
    expect(cadenceTalkingPoint({ snapshot: null, reviewRatings: [5, 5, 4, 5.2], isNewOwner: true })).toBe(
      "First four guest reviews average 4.8. Ask how handover felt.",
    );
  });
  it("has a gentle fallback", () => {
    expect(cadenceTalkingPoint({ snapshot: null, reviewRatings: [], isNewOwner: false })).toBe(
      "A good time to check in and see how things are going.",
    );
  });
});
