/**
 * Live Resly client. Thin, typed, and deliberately dumb: one function per
 * endpoint, response shapes narrowed with small pickers so a field rename
 * on Resly's side breaks in one place.
 *
 * Env: RESLY_API_KEY, RESLY_BASE_URL (default https://api.resly.com).
 *
 * The endpoint paths below are our best reading of Resly's partner API and
 * have NOT been verified against a live account. Correct them here; nothing
 * else in the app knows a URL.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import { statusOf } from "./mock";
import type {
  ReslyCancellation,
  ReslyClient,
  ReslyOccupancy,
  ReslyProperty,
  ReslyPropertyStatus,
  ReslyReview,
} from "./types";
import { dayIndex } from "./dates";

// ---------------------------------------------------------------------------
// Endpoints (edit here when Resly's paths differ)
// ---------------------------------------------------------------------------
export const RESLY_ENDPOINTS = {
  /** GET: all rooms/listings on the account. */
  rooms: "/v1/rooms",
  /** GET ?room_id&from&to: nights booked / available for a room in a window. */
  occupancy: "/v1/reports/occupancy",
  /** GET ?room_id&from&to: expected occupancy (Resly's own forecast) for a window. */
  forecast: "/v1/reports/forecast",
  /** GET ?room_id&month=YYYY-MM: accommodation revenue by check-in month. */
  revenue: "/v1/reports/revenue",
  /** GET ?since=ISO: guest reviews across the account. */
  reviews: "/v1/reviews",
  /** GET ?status=cancelled&updated_since=ISO: reservations cancelled since. */
  cancellations: "/v1/reservations",
  /** GET /v1/rooms/{roomId}: room detail including active flag. */
  room: (roomId: string) => `/v1/rooms/${encodeURIComponent(roomId)}`,
} as const;

export const RESLY_DEFAULT_BASE_URL = "https://api.resly.com";

type Json = Record<string, unknown>;

export class ReslyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "ReslyApiError";
  }
}

type PropertyLink = { propertyId: string; name: string; roomId: string | null; listingId: string | null; isActive: boolean | null };

export class LiveReslyClient implements ReslyClient {
  readonly mode = "live" as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private links: Promise<PropertyLink[]> | null = null;

  constructor(private readonly db: AdminClient) {
    const key = process.env.RESLY_API_KEY;
    if (!key) throw new Error("RESLY_API_KEY is not set");
    this.apiKey = key;
    this.baseUrl = (process.env.RESLY_BASE_URL || RESLY_DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  // -- HTTP ------------------------------------------------------------------

  private async get<T = unknown>(path: string, query: Record<string, string | undefined> = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Api-Key": this.apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new ReslyApiError(`Resly ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`, res.status, path);
    }
    return (await res.json()) as T;
  }

  // -- Property <-> room mapping -------------------------------------------

  private loadLinks(): Promise<PropertyLink[]> {
    if (!this.links) {
      this.links = (async () => {
        const { data: owned, error: linkError } = await this.db.from("lane_owner_properties").select("property_id");
        if (linkError) throw new Error(`resly live: ${linkError.message}`);
        const ids = Array.from(new Set((owned ?? []).map((l) => l.property_id)));
        if (ids.length === 0) return [];
        const { data, error } = await this.db
          .from("properties")
          .select("id, name, is_active, resly_room_id, resly_listing_id")
          .in("id", ids);
        if (error) throw new Error(`resly live: ${error.message}`);
        return (data ?? []).map((p) => ({
          propertyId: p.id,
          name: p.name,
          roomId: p.resly_room_id,
          listingId: p.resly_listing_id,
          isActive: p.is_active,
        }));
      })();
    }
    return this.links;
  }

  private async roomIdFor(propertyId: string): Promise<string | null> {
    return (await this.loadLinks()).find((l) => l.propertyId === propertyId)?.roomId ?? null;
  }

  private async propertyIdForRoom(roomId: string | null | undefined, listingId?: string | null): Promise<string | null> {
    if (!roomId && !listingId) return null;
    const links = await this.loadLinks();
    return (
      links.find((l) => (roomId && l.roomId === roomId) || (listingId && l.listingId === listingId))?.propertyId ?? null
    );
  }

  // -- ReslyClient -----------------------------------------------------------

  async listProperties(): Promise<ReslyProperty[]> {
    const links = await this.loadLinks();
    let rooms: Json[] = [];
    try {
      rooms = list(await this.get(RESLY_ENDPOINTS.rooms), ["rooms", "data", "items"]);
    } catch (e) {
      // Fall back to what the cleaning app synced; a listing failure should not stop snapshots.
      console.warn("[resly] rooms listing failed, using synced properties", e);
    }
    return links.map((l) => {
      const room = rooms.find((r) => str(r, "id") === l.roomId || str(r, "room_id") === l.roomId);
      const active = room ? bool(room, "active") ?? bool(room, "is_active") ?? !(str(room, "status") ?? "").match(/inactive|archived|disabled/i) : l.isActive;
      return {
        propertyId: l.propertyId,
        name: l.name,
        reslyRoomId: l.roomId,
        reslyListingId: l.listingId,
        status: statusOf(active),
      };
    });
  }

  async occupancy(propertyId: string, from: string, to: string): Promise<ReslyOccupancy> {
    const roomId = await this.roomIdFor(propertyId);
    const empty: ReslyOccupancy = {
      propertyId,
      from,
      to,
      nightsBooked: 0,
      nightsAvailable: Math.max(0, dayIndex(to) - dayIndex(from)),
      occupancy: 0,
      bookings: 0,
    };
    if (!roomId) return empty;
    const body = await this.get<Json>(RESLY_ENDPOINTS.occupancy, { room_id: roomId, from, to });
    const data = obj(body, "data") ?? body;
    const nightsBooked = num(data, "nights_booked") ?? num(data, "booked_nights") ?? 0;
    const nightsAvailable = num(data, "nights_available") ?? num(data, "available_nights") ?? empty.nightsAvailable;
    const rate = num(data, "occupancy") ?? num(data, "occupancy_rate");
    return {
      ...empty,
      nightsBooked,
      nightsAvailable,
      occupancy: normaliseRate(rate) ?? (nightsAvailable ? nightsBooked / nightsAvailable : 0),
      bookings: num(data, "bookings") ?? num(data, "reservations") ?? 0,
    };
  }

  async forecast(propertyId: string, from: string, to: string): Promise<number | null> {
    const roomId = await this.roomIdFor(propertyId);
    if (!roomId) return null;
    const body = await this.get<Json>(RESLY_ENDPOINTS.forecast, { room_id: roomId, from, to });
    const data = obj(body, "data") ?? body;
    return normaliseRate(num(data, "forecast") ?? num(data, "expected_occupancy") ?? num(data, "occupancy"));
  }

  async revenueForMonth(propertyId: string, yyyyMm: string): Promise<number | null> {
    const roomId = await this.roomIdFor(propertyId);
    if (!roomId) return null;
    const body = await this.get<Json>(RESLY_ENDPOINTS.revenue, { room_id: roomId, month: yyyyMm });
    const data = obj(body, "data") ?? body;
    return num(data, "accommodation_revenue") ?? num(data, "revenue") ?? num(data, "total") ?? null;
  }

  async reviewsSince(since: Date): Promise<ReslyReview[]> {
    const body = await this.get(RESLY_ENDPOINTS.reviews, { since: since.toISOString() });
    const out: ReslyReview[] = [];
    for (const r of list(body, ["reviews", "data", "items"])) {
      const propertyId = await this.propertyIdForRoom(str(r, "room_id") ?? str(r, "roomId"), str(r, "listing_id"));
      const id = str(r, "id") ?? str(r, "review_id");
      const rating = num(r, "rating") ?? num(r, "score");
      const at = str(r, "created_at") ?? str(r, "reviewed_at") ?? str(r, "date");
      if (!propertyId || !id || rating == null || !at) continue;
      out.push({
        externalId: id,
        propertyId,
        rating: rating > 5 ? rating / 2 : rating, // 10-point channels
        title: str(r, "title"),
        body: str(r, "body") ?? str(r, "comment") ?? str(r, "text"),
        reviewedAt: new Date(at),
        channel: str(r, "channel") ?? str(r, "source"),
      });
    }
    return out;
  }

  async cancellationsSince(since: Date): Promise<ReslyCancellation[]> {
    const body = await this.get(RESLY_ENDPOINTS.cancellations, {
      status: "cancelled",
      updated_since: since.toISOString(),
    });
    const out: ReslyCancellation[] = [];
    for (const r of list(body, ["reservations", "data", "items"])) {
      const status = (str(r, "status") ?? "").toLowerCase();
      if (status && !status.includes("cancel")) continue;
      const propertyId = await this.propertyIdForRoom(str(r, "room_id") ?? str(r, "roomId"), str(r, "listing_id"));
      const reslyId = str(r, "id") ?? str(r, "reservation_id");
      const checkIn = str(r, "check_in") ?? str(r, "arrival");
      const checkOut = str(r, "check_out") ?? str(r, "departure");
      if (!propertyId || !reslyId || !checkIn || !checkOut) continue;
      // Prefer our own reservation id so dedupe keys match the mock's.
      const { data: local } = await this.db
        .from("reservations")
        .select("id")
        .eq("resly_reservation_id", reslyId)
        .maybeSingle();
      out.push({
        reservationId: local?.id ?? reslyId,
        reslyReservationId: reslyId,
        propertyId,
        accommodationValue: num(r, "accommodation_value") ?? num(r, "accommodation_total") ?? num(r, "total"),
        checkIn: checkIn.slice(0, 10),
        checkOut: checkOut.slice(0, 10),
        cancelledAt: new Date(str(r, "cancelled_at") ?? str(r, "updated_at") ?? since.toISOString()),
        channel: str(r, "channel") ?? str(r, "source"),
      });
    }
    return out;
  }

  async propertyStatus(propertyId: string): Promise<ReslyPropertyStatus> {
    const roomId = await this.roomIdFor(propertyId);
    if (!roomId) {
      const link = (await this.loadLinks()).find((l) => l.propertyId === propertyId);
      return { propertyId, status: statusOf(link?.isActive) };
    }
    const body = await this.get<Json>(RESLY_ENDPOINTS.room(roomId));
    const data = obj(body, "data") ?? obj(body, "room") ?? body;
    const active = bool(data, "active") ?? bool(data, "is_active") ?? !(str(data, "status") ?? "").match(/inactive|archived|disabled/i);
    return { propertyId, status: statusOf(active) };
  }
}

// ---------------------------------------------------------------------------
// Response pickers
// ---------------------------------------------------------------------------

function list(body: unknown, keys: string[]): Json[] {
  if (Array.isArray(body)) return body as Json[];
  if (body && typeof body === "object") {
    for (const k of keys) {
      const v = (body as Json)[k];
      if (Array.isArray(v)) return v as Json[];
    }
  }
  return [];
}

function obj(o: Json, k: string): Json | null {
  const v = o[k];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function str(o: Json, k: string): string | null {
  const v = o[k];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}

function num(o: Json, k: string): number | null {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function bool(o: Json, k: string): boolean | null {
  const v = o[k];
  return typeof v === "boolean" ? v : null;
}

/** Resly may return 0–1 or 0–100; bring it to 0–1. */
function normaliseRate(v: number | null): number | null {
  if (v == null) return null;
  return v > 1 ? v / 100 : v;
}
