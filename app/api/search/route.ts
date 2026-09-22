import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

type SearchPlace = { sourceId: string; name: string; address: string; lat: number; lon: number; category: string; openingHours: string; websiteUrl: string; menuUrl: string };
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (query.length < 2) return fail("두 글자 이상 입력해 주세요.", 400);
  const key = env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY;

  try {
    if (!key) {
      const aliases: Record<string, string> = { "도톤보리": "道頓堀", "난바": "難波", "우메다": "梅田", "신사이바시": "心斎橋", "오사카성": "大阪城", "이치란": "一蘭", "돈키호테": "ドン・キホーテ", "유니버설 스튜디오": "ユニバーサル・スタジオ・ジャパン" };
      const localizedQuery = Object.entries(aliases).reduce((value, [from, to]) => value.replaceAll(from, to), query);
      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", localizedQuery);
      url.searchParams.set("lat", "34.6688");
      url.searchParams.set("lon", "135.5013");
      url.searchParams.set("limit", "15");
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Photon ${response.status}`);
      const data = await response.json() as { features?: Array<{ properties?: { osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; name?: string; street?: string; housenumber?: string; locality?: string; district?: string; city?: string; state?: string; country?: string }; geometry?: { coordinates?: number[] } }> };
      const places: SearchPlace[] = (data.features || []).filter(feature => {
        const [lon, lat] = feature.geometry?.coordinates || [];
        return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 34.3 && lat <= 35.2 && lon >= 135.1 && lon <= 135.9;
      }).slice(0, 12).map(feature => {
        const info = feature.properties || {};
        const [lon, lat] = feature.geometry!.coordinates!;
        const address = [info.street, info.housenumber, info.locality, info.district, info.city, info.state].filter(Boolean).join(", ");
        const kind = info.osm_value || "";
        return { sourceId: `photon:${info.osm_type || ""}:${info.osm_id || ""}`, name: /[가-힣]/.test(query) && localizedQuery !== query && info.name === localizedQuery ? query : (info.name || query), address, lat, lon,
          category: ["hotel", "hostel", "guest_house", "motel"].includes(kind) ? "stay" : ["restaurant", "cafe", "fast_food", "bar", "bakery", "food_court"].includes(kind) ? "food" : "place",
          openingHours: "", websiteUrl: "", menuUrl: "" };
      });
      return NextResponse.json({ places, provider: "Photon" });
    }
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.searchParams.set("text", `${query} Osaka Japan`);
    url.searchParams.set("filter", "rect:135.25,34.45,135.80,35.00");
    url.searchParams.set("bias", "proximity:135.5013,34.6688");
    url.searchParams.set("lang", "ko");
    url.searchParams.set("limit", "12");
    url.searchParams.set("format", "json");
    url.searchParams.set("apiKey", key);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Geoapify ${response.status}`);
    const data = await response.json() as { results?: Array<{ place_id?: string; name?: string; formatted?: string; lat?: number; lon?: number; result_type?: string }> };
    const places: SearchPlace[] = (data.results || []).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon)).map(place => ({
      sourceId: place.place_id ? `geoapify:${place.place_id}` : "", name: place.name || place.formatted?.split(",")[0] || query,
      address: place.formatted || "", lat: place.lat!, lon: place.lon!, category: place.result_type === "amenity" ? "food" : "place", openingHours: "", websiteUrl: "", menuUrl: "",
    }));
    return NextResponse.json({ places, provider: "Geoapify" });
  } catch (cause) { console.error(cause); return fail("장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502); }
}
