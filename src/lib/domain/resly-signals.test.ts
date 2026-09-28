import { describe, expect, it } from "vitest";
import { generateReviews, occupancyFromReservations } from "@/lib/integrations/resly";
import {
  cancellationNeedsAttention,
  cancellationSummary,
  dedupeKeys,
  next30MonthLabel,
  occupancyBelowForecast,
  occupancyTalkingPoint,
  reviewNeedsAttention,
  reviewSummary,
  reviewTopic,
  statusChanged,
  statusSummary,
  stayLabel,
} from "./resly-signals";

describe("occupancyBelowForecast", () => {
  it("fires when next-30 occupancy is more than 15 points under forecast", () => {
    expect(occupancyBelowForecast({ occupancy_next_30: 0.48, forecast_next_30: 0.7 })).toBe(true);
  });
  it("does not fire at exactly 15 points under", () => {
    expect(occupancyBelowForecast({ occupancy_next_30: 0.55, forecast_next_30: 0.7 })).toBe(false);
  });
  it("needs both numbers", () => {
    expect(occupancyBelowForecast({ occupancy_next_30: 0.1, forecast_next_30: null })).toBe(false);
    expect(occupancyBelowForecast({ occupancy_next_30: null, forecast_next_30: 0.9 })).toBe(false);
  });
});

describe("talking points and summaries", () => {
  it("names the month with real numbers", () => {
    expect(occupancyTalkingPoint("October", 0.48, 0.7)).toBe(
      "October is 48% booked against a 70% forecast. Worth a call before they notice.",
    );
  });
  it("picks the month most of the next 30 days fall in", () => {
    expect(next30MonthLabel("2026-09-28")).toBe("October");
    expect(next30MonthLabel("2026-10-05")).toBe("October");
  });
  it("describes a low review by its topic", () => {
    expect(reviewSummary("Esplanade", 2, reviewTopic("The aircon in the main bedroom barely worked"))).toBe(
      "A 2-star review on Esplanade mentions the aircon",
    );
    expect(reviewSummary("Esplanade", 3, reviewTopic("Meh."))).toBe("A 3-star review on Esplanade needs a look");
  });
  it("describes a cancellation with value and dates", () => {
    expect(
      cancellationSummary("Esplanade", { accommodationValue: 2400, checkIn: "2026-10-12", checkOut: "2026-10-15" }),
    ).toBe("A $2,400 booking at Esplanade for 12 to 15 Oct was cancelled");
    expect(stayLabel("2026-10-30", "2026-11-02")).toBe("30 Oct to 2 Nov");
  });
  it("describes a status change without jargon", () => {
    expect(statusSummary("Esplanade", "inactive")).toBe("Esplanade has gone inactive in Resly");
    expect(statusSummary("Esplanade", "active")).toBe("Esplanade is active again in Resly");
  });
});

describe("thresholds", () => {
  it("reviews at or under 3 stars need attention", () => {
    expect(reviewNeedsAttention(3)).toBe(true);
    expect(reviewNeedsAttention(3.5)).toBe(false);
  });
  it("cancellations from $1500 need attention", () => {
    expect(cancellationNeedsAttention(1500)).toBe(true);
    expect(cancellationNeedsAttention(1499)).toBe(false);
    expect(cancellationNeedsAttention(null)).toBe(false);
  });
  it("status change needs a previous snapshot", () => {
    expect(statusChanged(null, "inactive")).toBe(false);
    expect(statusChanged("active", "inactive")).toBe(true);
    expect(statusChanged("active", "active")).toBe(false);
  });
  it("dedupe keys follow the documented shapes", () => {
    expect(dedupeKeys.occupancy("p1", "2026-10")).toBe("occupancy:p1:2026-10");
    expect(dedupeKeys.review("r9")).toBe("review:r9");
    expect(dedupeKeys.cancellation("res1")).toBe("cancel:res1");
    expect(dedupeKeys.status("p1", "inactive")).toBe("status:p1:inactive");
  });
});

describe("mock occupancy", () => {
  const rows = [
    { check_in: "2026-10-01", check_out: "2026-10-04", status: "confirmed", is_owner_stay: false }, // 3 nights
    { check_in: "2026-10-10", check_out: "2026-10-12", status: "cancelled", is_owner_stay: false }, // ignored
    { check_in: "2026-10-20", check_out: "2026-10-25", status: "confirmed", is_owner_stay: true }, // ignored
    { check_in: "2026-09-29", check_out: "2026-10-02", status: "confirmed", is_owner_stay: false }, // 1 night inside
  ];
  it("counts nights inside the window, skipping cancelled and owner stays", () => {
    const o = occupancyFromReservations("p", rows, "2026-10-01", "2026-10-11");
    expect(o.nightsAvailable).toBe(10);
    expect(o.nightsBooked).toBe(4);
    expect(o.bookings).toBe(2);
    expect(o.occupancy).toBe(0.4);
  });
});

describe("mock reviews", () => {
  it("are deterministic per property and rated 2 to 5", () => {
    const a = generateReviews("11111111-2222-3333-4444-555555555555", "2026-09-28");
    const b = generateReviews("11111111-2222-3333-4444-555555555555", "2026-09-28");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
    for (const r of a) {
      expect(r.rating).toBeGreaterThanOrEqual(2);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  });
});
