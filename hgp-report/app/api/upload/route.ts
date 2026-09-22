import { NextRequest, NextResponse } from "next/server";
import { savePhoto } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || file.type.split("/").pop() || "jpg").toLowerCase();
  const url = await savePhoto(buffer, ext);
  return NextResponse.json({ url });
}
