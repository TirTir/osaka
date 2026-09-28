import { NextRequest, NextResponse } from "next/server";
import { db, getSessionUser, sameOrigin, sha256 } from "@/auth/server";

type SessionUser = { id: string; email: string };
type ItineraryRow = {
  id: string;
  tripId: string;
  tripTitle: string;
  ownerUserId: string;
  ownerEmail: string;
  title: string;
  startDate: string | null;
  dayCount: number;
  createdAt: string;
};

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });
const asText = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asDay = (value: unknown) => {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 30 ? day : null;
};
const transportModes = new Set(["walk", "transit", "drive", "rail", "bus", "taxi"]);

async function requireUser(request: NextRequest): Promise<SessionUser | null> {
  return getSessionUser(request);
}

async function itineraryAccess(id: string, userId: string): Promise<{ itinerary: ItineraryRow; access: "owner" | "view" } | null> {
  const itinerary = await db().prepare(`
    SELECT i.id, i.trip_id AS tripId, t.title AS tripTitle, i.owner_user_id AS ownerUserId,
      u.email AS ownerEmail, i.title, i.start_date AS startDate, i.day_count AS dayCount, i.created_at AS createdAt
    FROM itineraries i
    JOIN trips t ON t.id = i.trip_id
    JOIN users u ON u.id = i.owner_user_id
    WHERE i.id = ? AND (
      i.owner_user_id = ? OR EXISTS (
        SELECT 1 FROM itinerary_shares s WHERE s.itinerary_id = i.id AND s.user_id = ?
      )
    )
  `).bind(id, userId, userId).first<ItineraryRow>();
  if (!itinerary) return null;
  return { itinerary, access: itinerary.ownerUserId === userId ? "owner" : "view" };
}

async function canUseTrip(request: NextRequest, tripId: string, userId: string) {
  const available = await db().prepare(`SELECT t.id, t.title FROM trips t LEFT JOIN trip_shares s ON s.trip_id = t.id AND s.user_id = ? WHERE t.id = ? AND (t.owner_user_id = ? OR s.user_id = ?)`)
    .bind(userId, tripId, userId, userId).first<{ id: string; title: string }>();
  if (available) return available;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  return db().prepare("SELECT id, title FROM trips WHERE id = ? AND (token_hash = ? OR view_token_hash = ?)")
    .bind(tripId, hash, hash).first<{ id: string; title: string }>();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return error("로그인이 필요합니다.", 401);
    if (request.nextUrl.searchParams.has("list")) {
      const result = await db().prepare(`
        SELECT i.id, i.trip_id AS tripId, t.title AS tripTitle, i.owner_user_id AS ownerUserId,
          u.email AS ownerEmail, i.title, i.start_date AS startDate, i.day_count AS dayCount,
          i.created_at AS createdAt,
          CASE WHEN i.owner_user_id = ? THEN 'owner' ELSE 'view' END AS access,
          (SELECT COUNT(*) FROM route_variants v WHERE v.itinerary_id = i.id) AS variantCount
        FROM itineraries i
        JOIN trips t ON t.id = i.trip_id
        JOIN users u ON u.id = i.owner_user_id
        WHERE i.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM itinerary_shares s WHERE s.itinerary_id = i.id AND s.user_id = ?
        )
        ORDER BY CASE WHEN i.owner_user_id = ? THEN 0 ELSE 1 END, i.created_at DESC
      `).bind(user.id, user.id, user.id, user.id).all();
      return NextResponse.json({ itineraries: result.results });
    }

    const id = request.nextUrl.searchParams.get("id") || "";
    const authorized = await itineraryAccess(id, user.id);
    if (!authorized) return error("이 동선을 볼 권한이 없습니다.", 403);
    const variants = await db().prepare(`
      SELECT id, itinerary_id AS itineraryId, day, name, transport_mode AS transportMode, created_at AS createdAt
      FROM route_variants WHERE itinerary_id = ? ORDER BY day, created_at
    `).bind(id).all();
    const stops = await db().prepare(`
      SELECT rs.id AS stopId, rs.variant_id AS variantId, rs.position,
        rs.transport_mode AS legTransportMode, rs.fare_yen AS legFareYen,
        p.id, p.source_id AS sourceId, p.collection_id AS collectionId, p.name, p.address, p.category, p.lat, p.lon,
        p.opening_hours AS openingHours, p.menu_url AS menuUrl, p.website_url AS websiteUrl, p.notes
      FROM route_stops rs
      JOIN route_variants rv ON rv.id = rs.variant_id
      JOIN places p ON p.id = rs.place_id
      WHERE rv.itinerary_id = ?
      ORDER BY rv.day, rv.created_at, rs.position, rs.created_at
    `).bind(id).all();
    const places = authorized.access === "owner"
      ? await db().prepare(`
          SELECT p.id, p.source_id AS sourceId, p.collection_id AS collectionId, p.name, p.address, p.category, p.lat, p.lon,
            opening_hours AS openingHours, menu_url AS menuUrl, website_url AS websiteUrl, notes
          FROM places p WHERE trip_id = ? ORDER BY name
        `).bind(authorized.itinerary.tripId).all()
      : { results: [] };
    const collections = authorized.access === "owner"
      ? await db().prepare("SELECT id, name, color, is_default AS isDefault, position FROM place_collections WHERE trip_id = ? ORDER BY position, created_at")
          .bind(authorized.itinerary.tripId).all()
      : { results: [] };
    const shares = authorized.access === "owner"
      ? await db().prepare(`
          SELECT s.id, s.user_id AS userId, u.email, s.created_at AS createdAt
          FROM itinerary_shares s JOIN users u ON u.id = s.user_id
          WHERE s.itinerary_id = ? ORDER BY u.email
        `).bind(id).all()
      : { results: [] };
    return NextResponse.json({ itinerary: { ...authorized.itinerary, access: authorized.access }, variants: variants.results, stops: stops.results, places: places.results, collections: collections.results, shares: shares.results });
  } catch (cause) {
    console.error(cause);
    return error("동선을 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const user = await requireUser(request);
    if (!user) return error("로그인이 필요합니다.", 401);
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;

    if (action === "create") {
      const tripId = asText(body.tripId, 100);
      const trip = await canUseTrip(request, tripId, user.id);
      if (!trip) return error("이 장소 목록으로 동선을 만들 권한이 없습니다.", 403);
      const dayCount = asDay(body.dayCount) || 1;
      const id = crypto.randomUUID();
      const title = asText(body.title) || `${trip.title} 동선`;
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(asText(body.startDate, 10)) ? asText(body.startDate, 10) : null;
      await db().prepare("INSERT INTO itineraries (id, trip_id, owner_user_id, title, start_date, day_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, tripId, user.id, title, startDate, dayCount, new Date().toISOString()).run();
      return NextResponse.json({ itinerary: { id, tripId, tripTitle: trip.title, ownerUserId: user.id, ownerEmail: user.email, title, startDate, dayCount, access: "owner" } }, { status: 201 });
    }

    const itineraryId = asText(body.itineraryId, 100);
    const authorized = await itineraryAccess(itineraryId, user.id);
    if (!authorized || authorized.access !== "owner") return error("동선 소유자만 수정할 수 있습니다.", 403);

    if (action === "variant") {
      const day = asDay(body.day);
      if (!day || day > authorized.itinerary.dayCount) return error("여행 일차를 확인해 주세요.", 400);
      const count = await db().prepare("SELECT COUNT(*) AS count FROM route_variants WHERE itinerary_id = ? AND day = ?")
        .bind(itineraryId, day).first<{ count: number }>();
      const id = crypto.randomUUID();
      const name = asText(body.name, 60) || `${(count?.count || 0) + 1}안`;
      const mode = transportModes.has(String(body.transportMode)) ? String(body.transportMode) : "transit";
      await db().prepare("INSERT INTO route_variants (id, itinerary_id, day, name, transport_mode, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, itineraryId, day, name, mode, new Date().toISOString()).run();
      return NextResponse.json({ id }, { status: 201 });
    }

    if (action === "stop") {
      const variantId = asText(body.variantId, 100);
      const placeId = asText(body.placeId, 100);
      const valid = await db().prepare(`
        SELECT rv.id FROM route_variants rv
        JOIN places p ON p.id = ?
        JOIN itineraries i ON i.id = rv.itinerary_id
        WHERE rv.id = ? AND rv.itinerary_id = ? AND p.trip_id = i.trip_id
      `).bind(placeId, variantId, itineraryId).first();
      if (!valid) return error("동선안과 장소를 확인해 주세요.", 400);
      const position = await db().prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM route_stops WHERE variant_id = ?")
        .bind(variantId).first<{ next: number }>();
      const id = crypto.randomUUID();
      await db().prepare("INSERT INTO route_stops (id, variant_id, place_id, position, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, variantId, placeId, position?.next || 1, new Date().toISOString()).run();
      return NextResponse.json({ id }, { status: 201 });
    }

    if (action === "share") {
      const email = asText(body.email, 254).toLowerCase();
      const target = await db().prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first<{ id: string; email: string }>();
      if (!target) return error("해당 이메일로 가입한 사용자를 찾지 못했습니다.", 404);
      if (target.id === user.id) return error("내 동선은 이미 볼 수 있습니다.", 400);
      const existing = await db().prepare("SELECT id FROM itinerary_shares WHERE itinerary_id = ? AND user_id = ?")
        .bind(itineraryId, target.id).first<{ id: string }>();
      if (existing) return NextResponse.json({ id: existing.id, email: target.email });
      const id = crypto.randomUUID();
      await db().prepare("INSERT INTO itinerary_shares (id, itinerary_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, itineraryId, target.id, new Date().toISOString()).run();
      return NextResponse.json({ id, email: target.email }, { status: 201 });
    }

    return error("알 수 없는 요청입니다.", 400);
  } catch (cause) {
    console.error(cause);
    return error("동선을 저장하지 못했습니다.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const user = await requireUser(request);
    if (!user) return error("로그인이 필요합니다.", 401);
    const body = await request.json() as Record<string, unknown>;
    const itineraryId = asText(body.itineraryId, 100);
    const authorized = await itineraryAccess(itineraryId, user.id);
    if (!authorized || authorized.access !== "owner") return error("동선 소유자만 수정할 수 있습니다.", 403);

    if (body.action === "itinerary") {
      const title = asText(body.title);
      const dayCount = asDay(body.dayCount);
      if (!title || !dayCount) return error("여행 이름과 기간을 확인해 주세요.", 400);
      const outside = await db().prepare("SELECT id FROM route_variants WHERE itinerary_id = ? AND day > ? LIMIT 1")
        .bind(itineraryId, dayCount).first();
      if (outside) return error("줄이려는 일차에 동선안이 있습니다. 먼저 해당 동선안을 삭제해 주세요.", 409);
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(asText(body.startDate, 10)) ? asText(body.startDate, 10) : null;
      await db().prepare("UPDATE itineraries SET title = ?, start_date = ?, day_count = ? WHERE id = ?")
        .bind(title, startDate, dayCount, itineraryId).run();
      return NextResponse.json({ ok: true });
    }

    if (body.action === "variant") {
      const variantId = asText(body.variantId, 100);
      const name = asText(body.name, 60);
      const mode = String(body.transportMode);
      if (!name || !transportModes.has(mode)) return error("동선안 이름과 이동수단을 확인해 주세요.", 400);
      const result = await db().prepare("UPDATE route_variants SET name = ?, transport_mode = ? WHERE id = ? AND itinerary_id = ?")
        .bind(name, mode, variantId, itineraryId).run();
      if (result.meta.changes !== 1) return error("동선안을 찾지 못했습니다.", 404);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "move") {
      const stopId = asText(body.stopId, 100);
      const direction = Number(body.direction) < 0 ? -1 : 1;
      const current = await db().prepare(`
        SELECT rs.id, rs.position, rs.variant_id AS variantId FROM route_stops rs
        JOIN route_variants rv ON rv.id = rs.variant_id
        WHERE rs.id = ? AND rv.itinerary_id = ?
      `).bind(stopId, itineraryId).first<{ id: string; position: number; variantId: string }>();
      if (!current) return error("장소를 찾지 못했습니다.", 404);
      const neighbor = await db().prepare(`
        SELECT id, position FROM route_stops
        WHERE variant_id = ? AND position ${direction < 0 ? "<" : ">"} ?
        ORDER BY position ${direction < 0 ? "DESC" : "ASC"} LIMIT 1
      `).bind(current.variantId, current.position).first<{ id: string; position: number }>();
      if (neighbor) {
        await db().batch([
          db().prepare("UPDATE route_stops SET position = ? WHERE id = ?").bind(neighbor.position, current.id),
          db().prepare("UPDATE route_stops SET position = ? WHERE id = ?").bind(current.position, neighbor.id),
        ]);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "leg") {
      const stopId = asText(body.stopId, 100);
      const mode = String(body.transportMode);
      const fareYen = Math.max(0, Math.min(100_000, Math.round(Number(body.fareYen) || 0)));
      if (!transportModes.has(mode) || mode === "transit" || mode === "drive") return error("이동수단을 확인해 주세요.", 400);
      const result = await db().prepare(`
        UPDATE route_stops SET transport_mode = ?, fare_yen = ?
        WHERE id = ? AND variant_id IN (SELECT id FROM route_variants WHERE itinerary_id = ?)
      `).bind(mode, fareYen, stopId, itineraryId).run();
      if (result.meta.changes !== 1) return error("이동 구간을 찾지 못했습니다.", 404);
      return NextResponse.json({ ok: true });
    }

    return error("알 수 없는 요청입니다.", 400);
  } catch (cause) {
    console.error(cause);
    return error("동선을 수정하지 못했습니다.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const user = await requireUser(request);
    if (!user) return error("로그인이 필요합니다.", 401);
    const itineraryId = request.nextUrl.searchParams.get("itineraryId") || "";
    const authorized = await itineraryAccess(itineraryId, user.id);
    if (!authorized || authorized.access !== "owner") return error("동선 소유자만 수정할 수 있습니다.", 403);

    const stopId = request.nextUrl.searchParams.get("stopId");
    if (stopId) {
      await db().prepare(`DELETE FROM route_stops WHERE id = ? AND variant_id IN (SELECT id FROM route_variants WHERE itinerary_id = ?)`)
        .bind(stopId, itineraryId).run();
      return NextResponse.json({ ok: true });
    }
    const variantId = request.nextUrl.searchParams.get("variantId");
    if (variantId) {
      await db().prepare("DELETE FROM route_variants WHERE id = ? AND itinerary_id = ?").bind(variantId, itineraryId).run();
      return NextResponse.json({ ok: true });
    }
    const shareId = request.nextUrl.searchParams.get("shareId");
    if (shareId) {
      await db().prepare("DELETE FROM itinerary_shares WHERE id = ? AND itinerary_id = ?").bind(shareId, itineraryId).run();
      return NextResponse.json({ ok: true });
    }
    if (request.nextUrl.searchParams.get("delete") === "itinerary") {
      await db().prepare("DELETE FROM itineraries WHERE id = ? AND owner_user_id = ?").bind(itineraryId, user.id).run();
      return NextResponse.json({ ok: true });
    }
    return error("삭제할 항목을 확인해 주세요.", 400);
  } catch (cause) {
    console.error(cause);
    return error("삭제하지 못했습니다.", 500);
  }
}
