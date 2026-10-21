import { NextRequest, NextResponse } from "next/server";

// Sites dispatch supplies these verified identity headers after ChatGPT login.
// App APIs require the identity verified by Sites dispatch.
export function middleware(request: NextRequest) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id?.trim() || !email?.trim()) {
    console.warn(JSON.stringify({ event: "api_auth_required", path: request.nextUrl.pathname,
      method: request.method, requestId: crypto.randomUUID(), status: 401 }));
    return NextResponse.json({ error: "ChatGPT 계정으로 로그인해 주세요." }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
