import { NextRequest, NextResponse } from "next/server";
import { db, getSessionUser, randomToken, sameOrigin, sha256 } from "@/auth/server";

type PlaceInput = { name?: unknown; address?: unknown; category?: unknown; collectionId?: unknown; lat?: unknown; lon?: unknown; openingHours?: unknown; menuUrl?: unknown; websiteUrl?: unknown; notes?: unknown; day?: unknown; position?: unknown; sourceId?: unknown };
type Trip = { id: string; title: string; createdAt: string; ownerUserId: string | null };
type Access = "owner" | "edit" | "view";
const asText = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asUrl = (value: unknown) => { const raw = asText(value, 1200); if (!raw) return ""; try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; } };
const asColor = (value: unknown) => /^#[0-9a-f]{6}$/i.test(asText(value, 7)) ? asText(value, 7) : "#d9553c";
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

async function authorizedTrip(request: NextRequest): Promise<{ trip: Trip; access: Access } | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (/^[0-9a-f]{64}$/.test(token)) {
    const hash = await sha256(token);
    const trip = await db().prepare("SELECT id, title, created_at AS createdAt, owner_user_id AS ownerUserId, token_hash AS tokenHash, view_token_hash AS viewTokenHash FROM trips WHERE token_hash = ? OR view_token_hash = ?")
      .bind(hash, hash).first<Trip & { tokenHash: string; viewTokenHash: string | null }>();
    if (trip) return { trip, access: trip.tokenHash === hash ? "edit" : "view" };
  }
  const id = request.nextUrl.searchParams.get("id") || "";
  const user = await getSessionUser(request);
  if (user && id) {
    const trip = await db().prepare(`
      SELECT t.id, t.title, t.created_at AS createdAt, t.owner_user_id AS ownerUserId, ts.role AS sharedRole
      FROM trips t LEFT JOIN trip_shares ts ON ts.trip_id = t.id AND ts.user_id = ?
      WHERE t.id = ? AND (t.owner_user_id = ? OR ts.user_id = ?)
    `).bind(user.id, id, user.id, user.id).first<Trip & { sharedRole: "edit" | "view" | null }>();
    if (trip) return { trip, access: trip.ownerUserId === user.id ? "owner" : trip.sharedRole || "view" };
  }
  return null;
}

const defaultCollections = [
  { name: "기본", color: "#6f7f85", isDefault: 1 },
  { name: "카페", color: "#c58a28", isDefault: 0 },
  { name: "음식점", color: "#d9553c", isDefault: 0 },
  { name: "관광지", color: "#3478a5", isDefault: 0 },
  { name: "쇼핑", color: "#b35478", isDefault: 0 },
  { name: "숙소", color: "#6d65a8", isDefault: 0 },
];

async function getDefaultCollectionId(tripId: string) {
  return (await db().prepare("SELECT id FROM place_collections WHERE trip_id = ? AND is_default = 1 LIMIT 1").bind(tripId).first<{ id: string }>())?.id || null;
}

async function resolveCollectionId(tripId: string, value: unknown) {
  const requested = asText(value, 100);
  if (requested) {
    const collection = await db().prepare("SELECT id FROM place_collections WHERE id = ? AND trip_id = ?").bind(requested, tripId).first<{ id: string }>();
    if (collection) return collection.id;
  }
  return getDefaultCollectionId(tripId);
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.has("list")) {
      const user = await getSessionUser(request);
      if (!user) return error("로그인이 필요합니다.", 401);
      const result = await db().prepare(`
        SELECT t.id, t.title, t.created_at AS createdAt, COUNT(DISTINCT p.id) AS placeCount,
          CASE WHEN t.owner_user_id = ? THEN 'owner' ELSE ts.role END AS access,
          owner.email AS ownerEmail
        FROM trips t
        JOIN users owner ON owner.id = t.owner_user_id
        LEFT JOIN trip_shares ts ON ts.trip_id = t.id AND ts.user_id = ?
        LEFT JOIN places p ON p.trip_id = t.id
        WHERE t.owner_user_id = ? OR ts.user_id = ?
        GROUP BY t.id, ts.role, owner.email
        ORDER BY CASE WHEN t.owner_user_id = ? THEN 0 ELSE 1 END, t.created_at DESC
      `).bind(user.id, user.id, user.id, user.id, user.id).all();
      return NextResponse.json({ trips: result.results });
    }
    const authorization = await authorizedTrip(request);
    if (!authorization) return error("목록을 열 수 없습니다. 로그인이나 공유 링크를 확인해 주세요.", 401);
    const result = await db().prepare("SELECT id, source_id AS sourceId, collection_id AS collectionId, name, address, category, lat, lon, opening_hours AS openingHours, menu_url AS menuUrl, website_url AS websiteUrl, notes, day, position FROM places WHERE trip_id = ? ORDER BY COALESCE(day, 999), position, created_at")
      .bind(authorization.trip.id).all();
    const collections = await db().prepare("SELECT id, name, color, is_default AS isDefault, position, created_at AS createdAt FROM place_collections WHERE trip_id = ? ORDER BY position, created_at")
      .bind(authorization.trip.id).all();
    const shares = authorization.access === "owner"
      ? await db().prepare(`SELECT s.id, s.user_id AS userId, u.email, s.role, s.created_at AS createdAt FROM trip_shares s JOIN users u ON u.id = s.user_id WHERE s.trip_id = ? ORDER BY u.email`).bind(authorization.trip.id).all()
      : { results: [] };
    const { id, title, createdAt } = authorization.trip;
    return NextResponse.json({ trip: { id, title, createdAt }, access: authorization.access, legacy: authorization.trip.ownerUserId === null, places: result.results, collections: collections.results, shares: shares.results });
  } catch (cause) { console.error(cause); return error("여행 정보를 불러오지 못했습니다.", 500); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "create") {
      const user = await getSessionUser(request);
      if (!user) return error("로그인이 필요합니다.", 401);
      const id = crypto.randomUUID();
      const title = asText(body.title, 100) || "새 여행";
      const createdAt = new Date().toISOString();
      const statements = [db().prepare("INSERT INTO trips (id, title, token_hash, owner_user_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, title, await sha256(randomToken()), user.id, createdAt)];
      defaultCollections.forEach((collection, index) => statements.push(db().prepare("INSERT INTO place_collections (id, trip_id, name, color, is_default, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, collection.name, collection.color, collection.isDefault, index + 1, createdAt)));
      await db().batch(statements);
      return NextResponse.json({ trip: { id, title, createdAt } }, { status: 201 });
    }
    const authorization = await authorizedTrip(request);
    if (!authorization) return error("목록을 수정할 권한이 없습니다.", 401);
    const { trip, access } = authorization;
    if (body.action === "claim") {
      const user = await getSessionUser(request);
      if (!user || access !== "edit" || trip.ownerUserId !== null) return error("이 목록을 가져올 권한이 없습니다.", 403);
      const result = await db().prepare("UPDATE trips SET owner_user_id = ?, token_hash = ? WHERE id = ? AND owner_user_id IS NULL")
        .bind(user.id, await sha256(randomToken()), trip.id).run();
      if (result.meta.changes !== 1) return error("이미 가져온 목록입니다.", 409);
      return NextResponse.json({ trip: { id: trip.id, title: trip.title } });
    }
    if (body.action === "share") {
      if (access !== "owner") return error("목록 소유자만 공유 링크를 만들 수 있습니다.", 403);
      const role = body.role;
      if (role !== "view" && role !== "edit") return error("공유 권한을 확인해 주세요.", 400);
      const token = randomToken();
      const column = role === "view" ? "view_token_hash" : "token_hash";
      await db().prepare(`UPDATE trips SET ${column} = ? WHERE id = ?`).bind(await sha256(token), trip.id).run();
      return NextResponse.json({ token, role });
    }
    if (body.action === "share_user") {
      if (access !== "owner") return error("목록 소유자만 사용자를 관리할 수 있습니다.", 403);
      const user = await getSessionUser(request);
      const email = asText(body.email, 254).toLowerCase();
      const role = body.role === "edit" ? "edit" : "view";
      const target = await db().prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first<{ id: string; email: string }>();
      if (!target) return error("해당 이메일로 가입한 사용자를 찾지 못했습니다.", 404);
      if (target.id === user?.id) return error("내 목록은 이미 관리할 수 있습니다.", 400);
      const existing = await db().prepare("SELECT id FROM trip_shares WHERE trip_id = ? AND user_id = ?").bind(trip.id, target.id).first<{ id: string }>();
      if (existing) {
        await db().prepare("UPDATE trip_shares SET role = ? WHERE id = ?").bind(role, existing.id).run();
        return NextResponse.json({ share: { id: existing.id, userId: target.id, email: target.email, role } });
      }
      const id = crypto.randomUUID();
      await db().prepare("INSERT INTO trip_shares (id, trip_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, trip.id, target.id, role, new Date().toISOString()).run();
      return NextResponse.json({ share: { id, userId: target.id, email: target.email, role } }, { status: 201 });
    }
    if (access === "view") return error("보기 링크로는 장소를 수정할 수 없습니다.", 403);
    if (body.action === "collection") {
      const name = asText(body.name, 60);
      if (!name) return error("목록 이름을 입력해 주세요.", 400);
      const position = await db().prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM place_collections WHERE trip_id = ?").bind(trip.id).first<{ next: number }>();
      const id = crypto.randomUUID();
      const color = asColor(body.color);
      await db().prepare("INSERT INTO place_collections (id, trip_id, name, color, is_default, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
        .bind(id, trip.id, name, color, position?.next ?? 1, new Date().toISOString()).run();
      return NextResponse.json({ collection: { id, name, color, isDefault: 0, position: position?.next ?? 1 } }, { status: 201 });
    }
    if (body.action !== "add") return error("알 수 없는 요청입니다.", 400);
    const place = body.place as PlaceInput | undefined;
    const name = asText(place?.name, 150);
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return error("장소 이름과 위치를 확인해 주세요.", 400);
    const id = crypto.randomUUID();
    const collectionId = await resolveCollectionId(trip.id, place?.collectionId);
    const position = await db().prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM places WHERE trip_id = ?").bind(trip.id).first<{ next: number }>();
    await db().prepare("INSERT INTO places (id, trip_id, collection_id, source_id, name, address, category, lat, lon, opening_hours, menu_url, website_url, notes, day, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, trip.id, collectionId, asText(place?.sourceId, 100) || null, name, asText(place?.address, 300), asText(place?.category, 40) || "place", lat, lon, asText(place?.openingHours, 500), asUrl(place?.menuUrl), asUrl(place?.websiteUrl), asText(place?.notes, 2000), null, position?.next ?? 1, new Date().toISOString()).run();
    return NextResponse.json({ id }, { status: 201 });
  } catch (cause) { console.error(cause); return error("저장하지 못했습니다.", 500); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const authorization = await authorizedTrip(request);
    if (!authorization) return error("목록을 수정할 권한이 없습니다.", 401);
    if (authorization.access === "view") return error("보기 링크로는 장소를 수정할 수 없습니다.", 403);
    const body = await request.json() as Record<string, unknown>;
    const trip = authorization.trip;
    if (body.action === "trip") {
      if (authorization.access !== "owner") return error("목록 소유자만 이름을 바꿀 수 있습니다.", 403);
      const title = asText(body.title, 100);
      if (!title) return error("여행 이름을 입력해 주세요.", 400);
      await db().prepare("UPDATE trips SET title = ? WHERE id = ?").bind(title, trip.id).run();
      return NextResponse.json({ ok: true });
    }
    if (body.action === "collection") {
      const id = asText(body.id, 100);
      const name = asText(body.name, 60);
      if (!name) return error("목록 이름을 입력해 주세요.", 400);
      const result = await db().prepare("UPDATE place_collections SET name = ?, color = ? WHERE id = ? AND trip_id = ? AND is_default = 0")
        .bind(name, asColor(body.color), id, trip.id).run();
      if (result.meta.changes !== 1) return error("장소 목록을 찾지 못했습니다.", 404);
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "place") return error("알 수 없는 요청입니다.", 400);
    const id = asText(body.id, 100);
    const place = body.place as PlaceInput | undefined;
    const day = place?.day === null || place?.day === "" ? null : Number(place?.day);
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 30)) return error("일차를 확인해 주세요.", 400);
    const position = Number(place?.position);
    const collectionId = await resolveCollectionId(trip.id, place?.collectionId);
    await db().prepare("UPDATE places SET collection_id = ?, name = ?, address = ?, category = ?, opening_hours = ?, menu_url = ?, website_url = ?, notes = ?, day = ?, position = ? WHERE id = ? AND trip_id = ?")
      .bind(collectionId, asText(place?.name, 150), asText(place?.address, 300), asText(place?.category, 40) || "place", asText(place?.openingHours, 500), asUrl(place?.menuUrl), asUrl(place?.websiteUrl), asText(place?.notes, 2000), day, Number.isInteger(position) ? position : 0, id, trip.id).run();
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error(cause); return error("수정하지 못했습니다.", 500); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const authorization = await authorizedTrip(request);
    if (!authorization) return error("목록을 수정할 권한이 없습니다.", 401);
    if (authorization.access === "view") return error("보기 링크로는 장소를 수정할 수 없습니다.", 403);
    if (request.nextUrl.searchParams.has("trip")) {
      if (authorization.access !== "owner") return error("목록 소유자만 여행 목록을 삭제할 수 있습니다.", 403);
      await db().batch([
        db().prepare("DELETE FROM route_stops WHERE variant_id IN (SELECT rv.id FROM route_variants rv JOIN itineraries i ON i.id = rv.itinerary_id WHERE i.trip_id = ?)").bind(authorization.trip.id),
        db().prepare("DELETE FROM itinerary_shares WHERE itinerary_id IN (SELECT id FROM itineraries WHERE trip_id = ?)").bind(authorization.trip.id),
        db().prepare("DELETE FROM route_variants WHERE itinerary_id IN (SELECT id FROM itineraries WHERE trip_id = ?)").bind(authorization.trip.id),
        db().prepare("DELETE FROM itineraries WHERE trip_id = ?").bind(authorization.trip.id),
        db().prepare("DELETE FROM trips WHERE id = ? AND owner_user_id = ?").bind(authorization.trip.id, authorization.trip.ownerUserId),
      ]);
      return NextResponse.json({ ok: true });
    }
    const collectionId = request.nextUrl.searchParams.get("collectionId") || "";
    if (collectionId) {
      const collection = await db().prepare("SELECT id, is_default AS isDefault FROM place_collections WHERE id = ? AND trip_id = ?").bind(collectionId, authorization.trip.id).first<{ id: string; isDefault: number }>();
      if (!collection) return error("장소 카테고리를 찾지 못했습니다.", 404);
      if (collection.isDefault) return error("기본 카테고리는 삭제할 수 없습니다.", 400);
      const defaultCollectionId = await getDefaultCollectionId(authorization.trip.id);
      await db().batch([
        db().prepare("UPDATE places SET collection_id = ? WHERE collection_id = ? AND trip_id = ?").bind(defaultCollectionId, collectionId, authorization.trip.id),
        db().prepare("DELETE FROM place_collections WHERE id = ? AND trip_id = ?").bind(collectionId, authorization.trip.id),
      ]);
      return NextResponse.json({ ok: true });
    }
    const shareId = request.nextUrl.searchParams.get("shareId") || "";
    if (shareId) {
      if (authorization.access !== "owner") return error("목록 소유자만 공유를 해제할 수 있습니다.", 403);
      await db().prepare("DELETE FROM trip_shares WHERE id = ? AND trip_id = ?").bind(shareId, authorization.trip.id).run();
      return NextResponse.json({ ok: true });
    }
    const id = request.nextUrl.searchParams.get("placeId") || "";
    if (!id) return error("장소 ID가 필요합니다.", 400);
    await db().prepare("DELETE FROM places WHERE id = ? AND trip_id = ?").bind(id, authorization.trip.id).run();
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error(cause); return error("삭제하지 못했습니다.", 500); }
}
