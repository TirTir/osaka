import { NextResponse } from "next/server";

// Old clients must refresh; new clients use the Google Maps Places library.
export function GET() {
  return NextResponse.json({ error: "장소 검색이 Google Maps로 변경되었습니다. 페이지를 새로고침해 주세요." }, { status: 410 });
}
