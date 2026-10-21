import { NextRequest, NextResponse } from "next/server";

// Identity is checked by middleware. Restrict both payload size and log fields.
export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > 1024) return NextResponse.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  let event;
  try { event = JSON.parse(text); } catch { return NextResponse.json({ error: "올바르지 않은 요청입니다." }, { status: 400 }); }
  if (!event || !/^[a-f0-9-]{36}$/.test(event.requestId) || !["search", "details"].includes(event.operation)
    || typeof event.code !== "string" || !/^[A-Z0-9_]{1,64}$/.test(event.code)
    || !Number.isInteger(event.durationMs) || event.durationMs < 0 || event.durationMs > 600000
    || (event.count !== undefined && (!Number.isInteger(event.count) || event.count < 0 || event.count > 20))) {
    return NextResponse.json({ error: "올바르지 않은 요청입니다." }, { status: 400 });
  }
  const record = { event: "google_places", provider: "Google Places", requestId: event.requestId, operation: event.operation,
    code: event.code, durationMs: event.durationMs, resultCount: event.count };
  if (event.code === "OK") console.info(JSON.stringify(record));
  else console.error(JSON.stringify(record));
  return new NextResponse(null, { status: 204 });
}
