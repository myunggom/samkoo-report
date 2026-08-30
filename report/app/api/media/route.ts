import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addMedia, listMedia } from "@/lib/store";
import { DEFAULT_CATEGORY, todayYmd, type MediaItem } from "@/lib/archive";

export const dynamic = "force-dynamic";

// 목록 (최신 촬영일순)
export async function GET() {
  return NextResponse.json(await listMedia());
}

// 업로드된 파일의 메타데이터 등록 (파일 자체는 Blob에 직접 업로드됨)
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.url || typeof b.url !== "string") {
    return NextResponse.json({ error: "url이 필요합니다." }, { status: 400 });
  }
  const item: MediaItem = {
    id: randomUUID(),
    url: String(b.url),
    type: b.type === "video" ? "video" : "image",
    category: typeof b.category === "string" && b.category ? b.category : DEFAULT_CATEGORY,
    title: b.title ? String(b.title) : "",
    note: b.note ? String(b.note) : "",
    area: b.area ? String(b.area) : "",
    takenAt: typeof b.takenAt === "string" && b.takenAt ? b.takenAt : todayYmd(),
    uploader: b.uploader ? String(b.uploader) : "",
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(await addMedia(item), { status: 201 });
}
