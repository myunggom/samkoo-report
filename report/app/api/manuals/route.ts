import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listManuals, saveManual } from "@/lib/store";
import { emptyManual, SITES, type Site } from "@/lib/manual";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listManuals());
}

// 새 매뉴얼 만들기 — { site }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const site: Site = (SITES as string[]).includes(b.site) ? (b.site as Site) : "1사옥";
  const manual = await saveManual(emptyManual(randomUUID(), site));
  return NextResponse.json(manual, { status: 201 });
}
