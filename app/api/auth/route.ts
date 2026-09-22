import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual, createSession, db, getSessionUser, normalizeEmail, passwordHash, randomToken, sameOrigin, SESSION_COOKIE, sha256, validEmail } from "@/auth/server";

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ user: await getSessionUser(request) }); }
  catch (cause) { console.error(cause); return fail("계정을 확인하지 못했습니다.", 500); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("요청 출처를 확인하지 못했습니다.", 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!validEmail(email) || password.length < 10 || password.length > 128) return fail("이메일과 10자 이상 비밀번호를 확인해 주세요.", 400);
    const action = body.action;
    let user: { id: string; email: string };
    if (action === "signup") {
      const existing = await db().prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (existing) return fail("이미 가입된 이메일입니다.", 409);
      const salt = randomToken();
      user = { id: crypto.randomUUID(), email };
      await db().prepare("INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.id, email, await passwordHash(password, salt), salt, new Date().toISOString()).run();
    } else if (action === "login") {
      const key = await sha256(email);
      const recent = await db().prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE email_hash = ? AND created_at > ?")
        .bind(key, new Date(Date.now() - 15 * 60_000).toISOString()).first<{ count: number }>();
      if ((recent?.count || 0) >= 8) return fail("로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.", 429);
      const found = await db().prepare("SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?")
        .bind(email).first<{ id: string; email: string; passwordHash: string; passwordSalt: string }>();
      const derived = await passwordHash(password, found?.passwordSalt || "missing-user-salt");
      if (!found || !constantTimeEqual(derived, found.passwordHash)) {
        await db().prepare("INSERT INTO login_attempts (id, email_hash, created_at) VALUES (?, ?, ?)")
          .bind(crypto.randomUUID(), key, new Date().toISOString()).run();
        return fail("이메일 또는 비밀번호가 올바르지 않습니다.", 401);
      }
      await db().prepare("DELETE FROM login_attempts WHERE email_hash = ?").bind(key).run();
      user = { id: found.id, email: found.email };
    } else return fail("알 수 없는 요청입니다.", 400);
    const session = await createSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
    return response;
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
