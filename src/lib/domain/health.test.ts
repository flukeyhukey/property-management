import { describe, expect, it } from "vitest";
import { cadenceDaysFor, computeHealth, type HealthInputs } from "./health";

function inputs(over: Partial<HealthInputs> = {}): HealthInputs {
  return {
    latestNps: null,
    openLoops: [],
    avgResponseLagMinutes90d: null,
    avgSentiment90d: null,
    occupancyGap: null,
    missedCommitments90d: 0,
    churnFlag90d: false,
    recentNegativeIntent: null,
    ...over,
  };
}

const BANNED = /churn|risk|detractor/i;

describe("computeHealth", () => {
  it("is green with nothing going on", () => {
    const r = computeHealth(inputs());
    expect(r.health).toBe("green");
    expect(r.reason).toBe("Everything's on track");
  });

  it("is red for a low NPS with churn language", () => {
    const r = computeHealth(inputs({ latestNps: 4, churnFlag90d: true }));
    expect(r.health).toBe("red");
    expect(r.reason).toBe("Mentioned looking elsewhere");
  });

  it("is red for a low NPS with two late follow-ups", () => {
    const r = computeHealth(inputs({ latestNps: 6, missedCommitments90d: 2 }));
    expect(r.health).toBe("red");
    expect(r.reason).toBe("Gave us a 6 in the last survey");
  });

  it("is red for churn language with a loop waiting over a day", () => {
    const r = computeHealth(inputs({ churnFlag90d: true, openLoops: [{ ageMinutesBusiness: 700, ageMinutesClock: 25 * 60 }] }));
    expect(r.health).toBe("red");
  });

  it("is amber for churn language alone", () => {
    expect(computeHealth(inputs({ churnFlag90d: true })).health).toBe("amber");
  });

  it("is amber for a 6 alone", () => {
    const r = computeHealth(inputs({ latestNps: 6 }));
    expect(r.health).toBe("amber");
    expect(r.reason).toBe("Gave us a 6 in the last survey");
  });

  it("a 7 is not low", () => {
    expect(computeHealth(inputs({ latestNps: 7 })).health).toBe("green");
  });

  it("is amber for two late follow-ups", () => {
    const r = computeHealth(inputs({ missedCommitments90d: 2 }));
    expect(r.health).toBe("amber");
    expect(r.reason).toBe("A follow-up ran late twice recently");
  });

  it("is amber when a loop is more than 4 business hours past its clock", () => {
    const r = computeHealth(inputs({ openLoops: [{ ageMinutesBusiness: 600, ageMinutesClock: 20 * 60, pastDueMinutesBusiness: 300 }] }));
    expect(r.health).toBe("amber");
    expect(r.reason).toBe("Has been waiting on a reply since yesterday");
  });

  it("a loop just past its clock stays green", () => {
    expect(computeHealth(inputs({ openLoops: [{ ageMinutesBusiness: 300, pastDueMinutesBusiness: 60 }] })).health).toBe("green");
  });

  it("names a frustrated repair", () => {
    const r = computeHealth(inputs({ avgSentiment90d: -0.5, recentNegativeIntent: "maintenance" }));
    expect(r.health).toBe("amber");
    expect(r.reason).toBe("Frustrated about a repair");
  });

  it("is amber when bookings trail expectations", () => {
    const r = computeHealth(inputs({ occupancyGap: -0.2 }));
    expect(r.health).toBe("amber");
    expect(r.reason).toMatch(/^Bookings are below/);
  });

  it("is amber when replies are slow on average", () => {
    expect(computeHealth(inputs({ avgResponseLagMinutes90d: 500 })).health).toBe("amber");
    expect(computeHealth(inputs({ avgResponseLagMinutes90d: 480 })).health).toBe("green");
  });

  it("never uses harsh words in a reason", () => {
    const cases: Partial<HealthInputs>[] = [
      {},
      { churnFlag90d: true },
      { latestNps: 0 },
      { missedCommitments90d: 3 },
      { avgSentiment90d: -0.9 },
      { occupancyGap: -0.5 },
      { avgResponseLagMinutes90d: 900 },
      { openLoops: [{ ageMinutesBusiness: 2000, ageMinutesClock: 4000, pastDueMinutesBusiness: 1500 }] },
    ];
    for (const c of cases) expect(computeHealth(inputs(c)).reason).not.toMatch(BANNED);
  });
});

describe("cadenceDaysFor", () => {
  const now = new Date("2026-09-28T00:00:00Z");
  it("is 30 days for amber and red", () => {
    expect(cadenceDaysFor("amber", "2020-01-01", now)).toBe(30);
    expect(cadenceDaysFor("red", null, now)).toBe(30);
  });
  it("is 30 days for owners in their first 90 days", () => {
    expect(cadenceDaysFor("green", "2026-08-01", now)).toBe(30);
  });
  it("is 90 days for settled green owners", () => {
    expect(cadenceDaysFor("green", "2025-01-01", now)).toBe(90);
    expect(cadenceDaysFor("green", null, now)).toBe(90);
  });
});
