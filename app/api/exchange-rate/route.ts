import { NextResponse } from "next/server";

type FrankfurterRate = {
  date?: unknown;
  base?: unknown;
  quote?: unknown;
  rate?: unknown;
};

let cached: { rate: number; date: string; expiresAt: number } | null = null;

export async function GET() {
  try {
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ rate: cached.rate, date: cached.date, unit: 100, source: "Frankfurter" });
    }
    const response = await fetch("https://api.frankfurter.dev/v2/rate/jpy/krw", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Exchange rate request failed: ${response.status}`);
    const data = await response.json() as FrankfurterRate;
    const rate = Number(data.rate);
    const date = typeof data.date === "string" ? data.date : "";
    if (!Number.isFinite(rate) || rate <= 0 || !date) throw new Error("Exchange rate response was invalid");
    cached = { rate, date, expiresAt: Date.now() + 60 * 60_000 };
    return NextResponse.json({ rate, date, unit: 100, source: "Frankfurter" }, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch (cause) {
    console.error(cause);
    return NextResponse.json({ error: "현재 환율을 불러오지 못했습니다." }, { status: 503 });
  }
}
