import { NextRequest, NextResponse } from "next/server";
import { db, getSessionUser, randomToken, sameOrigin, sha256 } from "@/auth/server";

type PlaceInput = { name?: unknown; address?: unknown; category?: unknown; lat?: unknown; lon?: unknown; openingHours?: unknown; menuUrl?: unknown; websiteUrl?: unknown; notes?: unknown; day?: unknown; position?: unknown; sourceId?: unknown };
type Trip = { id: string; title: string; createdAt: string; ownerUserId: string | null };
type Access = "owner" | "edit" | "view";
const asText = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const asUrl = (value: unknown) => { const raw = asText(value, 1200); if (!raw) return ""; try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; } };
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
    const trip = await db().prepare("SELECT id, title, created_at AS createdAt, owner_user_id AS ownerUserId FROM trips WHERE id = ? AND owner_user_id = ?")
      .bind(id, user.id).first<Trip>();
    if (trip) return { trip, access: "owner" };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.has("list")) {
      const user = await getSessionUser(request);
      if (!user) return error("로그인이 필요합니다.", 401);
      const result = await db().prepare("SELECT trips.id, trips.title, trips.created_at AS createdAt, COUNT(places.id) AS placeCount FROM trips LEFT JOIN places ON places.trip_id = trips.id WHERE trips.owner_user_id = ? GROUP BY trips.id ORDER BY trips.created_at DESC")
        .bind(user.id).all();
      return NextResponse.json({ trips: result.results });
    }
    const authorization = await authorizedTrip(request);
    if (!authorization) return error("목록을 열 수 없습니다. 로그인이나 공유 링크를 확인해 주세요.", 401);
    const result = await db().prepare("SELECT id, source_id AS sourceId, name, address, category, lat, lon, opening_hours AS openingHours, menu_url AS menuUrl, website_url AS websiteUrl, notes, day, position FROM places WHERE trip_id = ? ORDER BY COALESCE(day, 999), position, created_at")
      .bind(authorization.trip.id).all();
    const { id, title, createdAt } = authorization.trip;
    return NextResponse.json({ trip: { id, title, createdAt }, access: authorization.access, legacy: authorization.trip.ownerUserId === null, places: result.results });
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
      const title = asText(body.title, 100) || "오사카 여행";
      const createdAt = new Date().toISOString();
      await db().prepare("INSERT INTO trips (id, title, token_hash, owner_user_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, title, await sha256(randomToken()), user.id, createdAt).run();
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
    if (access === "view") return error("보기 링크로는 장소를 수정할 수 없습니다.", 403);
    if (body.action !== "add") return error("알 수 없는 요청입니다.", 400);
    const place = body.place as PlaceInput | undefined;
    const name = asText(place?.name, 150);
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return error("장소 이름과 위치를 확인해 주세요.", 400);
    const id = crypto.randomUUID();
    const position = await db().prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM places WHERE trip_id = ?").bind(trip.id).first<{ next: number }>();
    await db().prepare("INSERT INTO places (id, trip_id, source_id, name, address, category, lat, lon, opening_hours, menu_url, website_url, notes, day, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, trip.id, asText(place?.sourceId, 100) || null, name, asText(place?.address, 300), asText(place?.category, 40) || "place", lat, lon, asText(place?.openingHours, 500), asUrl(place?.menuUrl), asUrl(place?.websiteUrl), asText(place?.notes, 2000), null, position?.next ?? 1, new Date().toISOString()).run();
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
      const title = asText(body.title, 100);
      if (!title) return error("여행 이름을 입력해 주세요.", 400);
      await db().prepare("UPDATE trips SET title = ? WHERE id = ?").bind(title, trip.id).run();
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "place") return error("알 수 없는 요청입니다.", 400);
    const id = asText(body.id, 100);
    const place = body.place as PlaceInput | undefined;
    const day = place?.day === null || place?.day === "" ? null : Number(place?.day);
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 30)) return error("일차를 확인해 주세요.", 400);
    const position = Number(place?.position);
    await db().prepare("UPDATE places SET name = ?, address = ?, category = ?, opening_hours = ?, menu_url = ?, website_url = ?, notes = ?, day = ?, position = ? WHERE id = ? AND trip_id = ?")
      .bind(asText(place?.name, 150), asText(place?.address, 300), asText(place?.category, 40) || "place", asText(place?.openingHours, 500), asUrl(place?.menuUrl), asUrl(place?.websiteUrl), asText(place?.notes, 2000), day, Number.isInteger(position) ? position : 0, id, trip.id).run();
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error(cause); return error("수정하지 못했습니다.", 500); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return error("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const authorization = await authorizedTrip(request);
    if (!authorization) return error("목록을 수정할 권한이 없습니다.", 401);
    if (authorization.access === "view") return error("보기 링크로는 장소를 수정할 수 없습니다.", 403);
    const id = request.nextUrl.searchParams.get("placeId") || "";
    if (!id) return error("장소 ID가 필요합니다.", 400);
    await db().prepare("DELETE FROM places WHERE id = ? AND trip_id = ?").bind(id, authorization.trip.id).run();
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error(cause); return error("삭제하지 못했습니다.", 500); }
}
