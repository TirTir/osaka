import { NextRequest, NextResponse } from "next/server";
import { createSession, db, getChatGPTIdentity, getOrCreateChatGPTUser, getSessionUser, sameOrigin, SESSION_COOKIE, sha256 } from "@/auth/server";

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ user: await getSessionUser(request) }); }
  catch (cause) { console.error(cause); return fail("계정을 확인하지 못했습니다.", 500); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    if (action === "chatgpt") {
      const identity = getChatGPTIdentity(request);
      if (!identity) return fail("ChatGPT 로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.", 401);
      const existing = await getSessionUser(request);
      if (existing) return NextResponse.json({ user: existing });
      const user = await getOrCreateChatGPTUser(identity);
      const session = await createSession(user.id);
      const response = NextResponse.json({ user });
      response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
      return response;
    }
    return fail("ChatGPT 계정으로 로그인해 주세요.", 400);
  } catch (cause) { console.error(cause); return fail("계정을 처리하지 못했습니다.", 500); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return fail("요청 출처를 확인하지 못했습니다.", 403);
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (/^[0-9a-f]{64}$/.test(token)) await db().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
