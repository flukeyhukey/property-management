/**
 * Mock Resly: everything is derived from what the cleaning app already
 * syncs into public.properties and public.reservations, plus a small
 * deterministic review generator, so the whole app runs without a Resly key.
 *
 * Read-only: this never writes to properties or reservations.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, dayIndex, lastYear, localDate, monthWindow, overlapNights, type LocalDate } from "./dates";
import type {
  ReslyCancellation,
  ReslyClient,
  ReslyOccupancy,
  ReslyProperty,
  ReslyPropertyStatus,
  ReslyReview,
  ReslyStatus,
} from "./types";

type ReservationRow = {
  id: string;
  property_id: string | null;
  resly_reservation_id: string;
  channel: string | null;
  check_in: string;
  check_out: string;
  status: string | null;
  is_owner_stay: boolean | null;
  accommodation_value: number | null;
  updated_at: string | null;
};

const RESERVATION_COLUMNS =
  "id, property_id, resly_reservation_id, channel, check_in, check_out, status, is_owner_stay, accommodation_value, updated_at";

/** The cleaning app stores Resly's status text; treat any "cancel..." as cancelled. */
export function isCancelled(status: string | null | undefined): boolean {
  return Boolean(status && status.toLowerCase().includes("cancel"));
}

/** A stay that counts towards occupancy and revenue. */
export function countsAsBooked(r: Pick<ReservationRow, "status" | "is_owner_stay">): boolean {
  return !isCancelled(r.status) && !r.is_owner_stay;
}

/** Forecast used when a property has no bookings history to compare against. */
export const DEFAULT_FORECAST = 0.7;

/**
 * Pure occupancy maths over reservation rows so it can be tested without
 * a database.
 */
export function occupancyFromReservations(
  propertyId: string,
  rows: Pick<ReservationRow, "check_in" | "check_out" | "status" | "is_owner_stay">[],
  from: LocalDate,
  to: LocalDate,
): ReslyOccupancy {
  const nightsAvailable = Math.max(0, dayIndex(to) - dayIndex(from));
  let nightsBooked = 0;
  let bookings = 0;
  for (const r of rows) {
    if (!countsAsBooked(r)) continue;
    const n = overlapNights(r.check_in, r.check_out, from, to);
    if (n > 0) {
      nightsBooked += n;
      bookings += 1;
    }
  }
  nightsBooked = Math.min(nightsBooked, nightsAvailable);
  return {
    propertyId,
    from,
    to,
    nightsBooked,
    nightsAvailable,
    occupancy: nightsAvailable ? round(nightsBooked / nightsAvailable) : 0,
    bookings,
  };
}

// ---------------------------------------------------------------------------
// Deterministic reviews
// ---------------------------------------------------------------------------

const REVIEW_TOPICS: { topic: string; good: string; bad: string }[] = [
  { topic: "aircon", good: "Aircon kept the place cool all week.", bad: "The aircon in the main bedroom barely worked and it was a hot week." },
  { topic: "cleaning", good: "Spotless on arrival, beds made beautifully.", bad: "Kitchen was not cleaned properly, crumbs in the drawers and a sticky bench." },
  { topic: "wifi", good: "Fast wifi, worked from the balcony.", bad: "Wifi dropped out constantly, had to tether all weekend." },
  { topic: "hot water", good: "Great shower pressure.", bad: "Hot water ran out after one shower every morning." },
  { topic: "noise", good: "Quiet street, slept well.", bad: "Construction noise from 6am next door, nobody warned us." },
  { topic: "check-in", good: "Check-in instructions were clear and easy.", bad: "Lockbox code did not work and it took an hour to get hold of someone." },
  { topic: "view", good: "The view from the balcony is even better than the photos.", bad: "Balcony furniture was broken so we could not use the view." },
  { topic: "location", good: "Perfect spot, walked everywhere.", bad: "Parking was a nightmare and the listing did not mention it." },
];

const REVIEW_CHANNELS = ["airbnb", "booking.com", "direct", "airbnb", "airbnb"];

/** Small seeded PRNG (mulberry32) so mock reviews are stable per property. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Four to six reviews per property spread over the last 150 days, mostly
 * 4 and 5 stars, a few 3s and the odd 2. Same property id, same reviews.
 */
export function generateReviews(propertyId: string, today: LocalDate): ReslyReview[] {
  const rand = seededRandom(propertyId);
  const count = 4 + Math.floor(rand() * 3);
  const reviews: ReslyReview[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = rand();
    const rating = r < 0.5 ? 5 : r < 0.8 ? 4 : r < 0.93 ? 3 : 2;
    const topic = REVIEW_TOPICS[Math.floor(rand() * REVIEW_TOPICS.length)];
    const daysAgo = Math.floor(rand() * 150);
    const channel = REVIEW_CHANNELS[Math.floor(rand() * REVIEW_CHANNELS.length)];
    const date = addDays(today, -daysAgo);
    reviews.push({
      externalId: `mock-review-${propertyId.slice(0, 8)}-${i}`,
      propertyId,
      rating,
      title: rating >= 4 ? "Lovely stay" : rating === 3 ? "Good but a few things" : "Disappointing",
      body: rating >= 4 ? topic.good : topic.bad,
      reviewedAt: new Date(`${date}T09:00:00+10:00`),
      channel,
    });
  }
  return reviews.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MockReslyClient implements ReslyClient {
  readonly mode = "mock" as const;
  private readonly reservations = new Map<string, Promise<ReservationRow[]>>();
  private properties: Promise<ReslyProperty[]> | null = null;

  constructor(
    private readonly db: AdminClient,
    private readonly now: Date = new Date(),
  ) {}

  private get today(): LocalDate {
    return localDate(this.now);
  }

  listProperties(): Promise<ReslyProperty[]> {
    if (!this.properties) this.properties = this.loadProperties();
    return this.properties;
  }

  private async loadProperties(): Promise<ReslyProperty[]> {
    const { data: links, error: linkError } = await this.db.from("lane_owner_properties").select("property_id");
    if (linkError) throw new Error(`resly mock: ${linkError.message}`);
    const ids = Array.from(new Set((links ?? []).map((l) => l.property_id)));
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("properties")
      .select("id, name, is_active, resly_room_id, resly_listing_id")
      .in("id", ids);
    if (error) throw new Error(`resly mock: ${error.message}`);
    return (data ?? []).map((p) => ({
      propertyId: p.id,
      name: p.name,
      reslyRoomId: p.resly_room_id,
      reslyListingId: p.resly_listing_id,
      status: statusOf(p.is_active),
    }));
  }

  private reservationsFor(propertyId: string): Promise<ReservationRow[]> {
    let p = this.reservations.get(propertyId);
    if (!p) {
      p = (async () => {
        const { data, error } = await this.db
          .from("reservations")
          .select(RESERVATION_COLUMNS)
          .eq("property_id", propertyId);
        if (error) throw new Error(`resly mock: ${error.message}`);
        return (data ?? []) as ReservationRow[];
      })();
      this.reservations.set(propertyId, p);
    }
    return p;
  }

  async occupancy(propertyId: string, from: LocalDate, to: LocalDate): Promise<ReslyOccupancy> {
    const rows = await this.reservationsFor(propertyId);
    return occupancyFromReservations(propertyId, rows, from, to);
  }

  /** Same window last year, or DEFAULT_FORECAST when the property has no history that far back. */
  async forecast(propertyId: string, from: LocalDate, to: LocalDate): Promise<number | null> {
    const rows = await this.reservationsFor(propertyId);
    const lyFrom = lastYear(from);
    const lyTo = lastYear(to);
    const hasHistory = rows.some((r) => countsAsBooked(r) && dayIndex(r.check_in) < dayIndex(lyTo));
    if (!hasHistory) return DEFAULT_FORECAST;
    return occupancyFromReservations(propertyId, rows, lyFrom, lyTo).occupancy;
  }

  async revenueForMonth(propertyId: string, yyyyMm: string): Promise<number | null> {
    const rows = await this.reservationsFor(propertyId);
    const { from, to } = monthWindow(`${yyyyMm}-01`);
    let total = 0;
    for (const r of rows) {
      if (!countsAsBooked(r)) continue;
      const ci = dayIndex(r.check_in);
      if (ci >= dayIndex(from) && ci < dayIndex(to)) total += Number(r.accommodation_value ?? 0);
    }
    return Math.round(total * 100) / 100;
  }

  async reviewsSince(since: Date): Promise<ReslyReview[]> {
    const properties = await this.listProperties();
    const out: ReslyReview[] = [];
    for (const p of properties) {
      for (const r of generateReviews(p.propertyId, this.today)) {
        if (r.reviewedAt.getTime() >= since.getTime()) out.push(r);
      }
    }
    return out;
  }

  async cancellationsSince(since: Date): Promise<ReslyCancellation[]> {
    const properties = await this.listProperties();
    const ids = properties.map((p) => p.propertyId);
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .in("property_id", ids)
      .gte("updated_at", since.toISOString());
    if (error) throw new Error(`resly mock: ${error.message}`);
    return ((data ?? []) as ReservationRow[])
      .filter((r) => isCancelled(r.status) && r.property_id)
      .map((r) => ({
        reservationId: r.id,
        reslyReservationId: r.resly_reservation_id,
        propertyId: r.property_id as string,
        accommodationValue: r.accommodation_value,
        checkIn: r.check_in.slice(0, 10),
        checkOut: r.check_out.slice(0, 10),
        cancelledAt: new Date(r.updated_at ?? this.now.toISOString()),
        channel: r.channel,
      }));
  }

  async propertyStatus(propertyId: string): Promise<ReslyPropertyStatus> {
    const known = (await this.listProperties()).find((p) => p.propertyId === propertyId);
    if (known) return { propertyId, status: known.status };
    const { data } = await this.db.from("properties").select("is_active").eq("id", propertyId).maybeSingle();
    return { propertyId, status: statusOf(data?.is_active) };
  }
}

export function statusOf(isActive: boolean | null | undefined): ReslyStatus {
  return isActive === false ? "inactive" : "active";
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
