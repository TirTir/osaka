import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f]{20,200}$/i.test(id)) return NextResponse.json({ error: "장소 ID가 올바르지 않습니다." }, { status: 400 });
  const key = env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY;
  if (!key) return NextResponse.json({ error: "장소 검색 API 키가 설정되지 않았습니다." }, { status: 503 });
  try {
    const url = new URL("https://api.geoapify.com/v2/place-details");
    url.searchParams.set("id", id);
    url.searchParams.set("features", "details");
    url.searchParams.set("apiKey", key);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Geoapify details ${response.status}`);
    const data = await response.json() as { features?: Array<{ properties?: { feature_type?: string; opening_hours?: string; website?: string; categories?: string[] } }> };
    const details = data.features?.find(feature => feature.properties?.feature_type === "details")?.properties;
    return NextResponse.json({ openingHours: details?.opening_hours || "", websiteUrl: details?.website || "", category: details?.categories?.some(value => value.startsWith("accommodation")) ? "stay" : details?.categories?.some(value => value.startsWith("catering")) ? "food" : "place" });
  } catch (cause) { console.error(cause); return NextResponse.json({ error: "영업시간을 불러오지 못했습니다." }, { status: 502 }); }
}
