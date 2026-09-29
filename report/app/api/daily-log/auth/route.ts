import { NextRequest, NextResponse } from "next/server";
import { DAILYLOG_COOKIE, checkDailyLogPassword, dailyLogToken } from "@/lib/weeklyAuth";

export const dynamic = "force-dynamic";

// 로그인: 과장급 공용 비밀번호 확인 후 쿠키 발급 (할 일 탭은 열리지 않는다)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const password = typeof b?.password === "string" ? b.password : "";
  if (!process.env.DAILY_LOG_PASSWORD) {
    return NextResponse.json({ error: "서버에 비밀번호가 설정되지 않았습니다." }, { status: 500 });
  }
  if (!checkDailyLogPassword(password)) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DAILYLOG_COOKIE, dailyLogToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DAILYLOG_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
