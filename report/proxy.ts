// Next.js 16 proxy (구 middleware) — /weekly-report 와 그 API를 비밀번호로 잠근다.
// 사장 전용 페이지이므로 인증 쿠키가 없으면 로그인 페이지로 보내거나 401을 반환한다.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";

// 잠금에서 제외할 공개 경로 (로그인 화면 + 로그인 처리 API)
const PUBLIC_PATHS = new Set(["/weekly-report/login", "/api/weekly/auth"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(WEEKLY_COOKIE)?.value;
  if (isTokenValid(token)) return NextResponse.next();

  // 미인증: API는 401, 페이지는 로그인 화면으로 이동(원래 목적지 기억)
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const loginUrl = new URL("/weekly-report/login", request.url);
  if (pathname !== "/weekly-report") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/weekly-report/:path*", "/api/weekly/:path*"],
};
