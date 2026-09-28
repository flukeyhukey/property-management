/**
 * Normalised Resly shapes. Both the live client and the DB-backed mock
 * produce these; nothing above this layer sees a raw Resly payload.
 *
 * Every id here is OUR public.properties id, never a Resly room id. The
 * live client does the room -> property mapping internally.
 */

export type ReslyProperty = {
  /** public.properties.id */
  propertyId: string;
  name: string;
  reslyRoomId: string | null;
  reslyListingId: string | null;
  status: ReslyStatus;
};

export type ReslyStatus = "active" | "inactive";

export type ReslyOccupancy = {
  propertyId: string;
  /** Window start, inclusive (local date, YYYY-MM-DD). */
  from: string;
  /** Window end, exclusive (local date, YYYY-MM-DD). */
  to: string;
  nightsBooked: number;
  nightsAvailable: number;
  /** nightsBooked / nightsAvailable, 0 to 1. */
  occupancy: number;
  /** Distinct non-cancelled, non-owner bookings touching the window. */
  bookings: number;
};

export type ReslyReview = {
  /** Resly's review id, stable across pulls. */
  externalId: string;
  propertyId: string;
  /** 1 to 5. */
  rating: number;
  title: string | null;
  body: string | null;
  reviewedAt: Date;
  /** "airbnb", "booking.com", "direct"... */
  channel: string | null;
};

export type ReslyCancellation = {
  /** public.reservations.id when we have it, else the Resly reservation id. */
  reservationId: string;
  reslyReservationId: string | null;
  propertyId: string;
  accommodationValue: number | null;
  checkIn: string;
  checkOut: string;
  cancelledAt: Date;
  channel: string | null;
};

export type ReslyPropertyStatus = {
  propertyId: string;
  status: ReslyStatus;
};

/** What the signals layer needs from Resly. Mock and live both implement it. */
export interface ReslyClient {
  readonly mode: "mock" | "live";
  /** Every property we manage that has an owner attached, active or not. */
  listProperties(): Promise<ReslyProperty[]>;
  /** Occupancy for [from, to) — local dates, to exclusive. */
  occupancy(propertyId: string, from: string, to: string): Promise<ReslyOccupancy>;
  /** Expected occupancy for [from, to), 0 to 1, or null when Resly has no view. */
  forecast(propertyId: string, from: string, to: string): Promise<number | null>;
  /** Accommodation revenue for bookings checking in during `yyyyMm` ("2026-10"). */
  revenueForMonth(propertyId: string, yyyyMm: string): Promise<number | null>;
  /** Guest reviews written at or after `since`, across all listed properties. */
  reviewsSince(since: Date): Promise<ReslyReview[]>;
  /** Bookings cancelled at or after `since`, across all listed properties. */
  cancellationsSince(since: Date): Promise<ReslyCancellation[]>;
  propertyStatus(propertyId: string): Promise<ReslyPropertyStatus>;
}
