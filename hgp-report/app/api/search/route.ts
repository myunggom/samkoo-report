import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ hits: [] });
  try {
    const hits = await searchAll(q);
    return NextResponse.json({ hits });
  } catch (e) {
    return NextResponse.json({ hits: [], error: (e as Error).message }, { status: 500 });
  }
}
