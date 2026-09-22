import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PDF 생성(html2canvas) 시 외부 이미지의 CORS 오염을 막기 위해 동일 출처로 프록시합니다.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": res.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
