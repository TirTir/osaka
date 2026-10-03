import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

// Browser Maps keys are intentionally delivered to the client. Restrict this
// key to the site's HTTP referrers and the Maps JavaScript API in Google Cloud.
export async function GET() {
  const apiKey = env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "지도를 준비 중입니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  return NextResponse.json({ apiKey }, { headers: { "Cache-Control": "no-store" } });
}
