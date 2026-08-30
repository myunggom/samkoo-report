import { NextRequest, NextResponse } from "next/server";
import { WEEKLY_COOKIE, checkPassword, passwordToToken } from "@/lib/weeklyAuth";

export const dynamic = "force-dynamic";

// 로그인: 비밀번호 확인 후 인증 쿠키 발급
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const password = typeof b?.password === "string" ? b.password : "";
  if (!process.env.WEEKLY_REPORT_PASSWORD) {
    return NextResponse.json({ error: "서버에 비밀번호가 설정되지 않았습니다." }, { status: 500 });
  }
  if (!checkPassword(password)) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(WEEKLY_COOKIE, passwordToToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  return res;
}

// 로그아웃: 쿠키 제거
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(WEEKLY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
