// /weekly-report 비밀번호 잠금 공용 로직 (proxy.ts와 API 라우트가 함께 사용)
//
// 쿠키에는 비밀번호 원문 대신 해시를 저장한다. proxy가 요청마다 환경변수
// WEEKLY_REPORT_PASSWORD 로 기대 해시를 계산해 쿠키와 상수시간 비교한다.
// Next.js 16의 proxy는 기본 Node.js 런타임이라 node:crypto 사용이 가능하다.

import { createHash, timingSafeEqual } from "crypto";

export const WEEKLY_COOKIE = "wr_auth";

// 비밀번호 → 쿠키에 담을 토큰(해시)
export function passwordToToken(password: string): string {
  return createHash("sha256").update(`weekly:${password}`, "utf8").digest("hex");
}

// 환경변수에 설정된 비밀번호의 기대 토큰 (미설정이면 빈 문자열 → 항상 불일치)
export function expectedToken(): string {
  const pw = process.env.WEEKLY_REPORT_PASSWORD || "";
  if (!pw) return "";
  return passwordToToken(pw);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// 제출된 비밀번호가 맞는지 (비밀번호 미설정 시 항상 false → 잠금 유지)
export function checkPassword(password: string): boolean {
  const pw = process.env.WEEKLY_REPORT_PASSWORD || "";
  if (!pw) return false;
  return safeEqual(password, pw);
}

// 쿠키 토큰이 유효한지
export function isTokenValid(token: string | undefined): boolean {
  const expected = expectedToken();
  if (!expected || !token) return false;
  return safeEqual(token, expected);
}
