import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 월간보고 엑셀 양식 — 브라우저가 Blob 「templates/monthly-report/」에 직접 올리고(/api/blob-upload), 여기서는 가장 최근 것의 주소만 알려 준다.
// 양식에는 직원 실명·연락처·사진이 있어 공개 저장소(public/)에 두지 않는다.
export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ url: null });
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "templates/monthly-report/" });
  const last = blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0];
  return NextResponse.json(last ? { url: last.url, name: last.pathname.split("/").pop(), uploadedAt: last.uploadedAt } : { url: null });
}
