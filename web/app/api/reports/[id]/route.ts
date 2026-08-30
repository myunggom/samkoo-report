import { NextRequest, NextResponse } from "next/server";
import { getReport, saveReport } from "@/lib/store";
import type { Report } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  return NextResponse.json(report);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Partial<Report>;
  const saved = await saveReport({
    scheduleId: id,
    sections: {
      setup: body.sections?.setup ?? [],
      shoot: body.sections?.shoot ?? [],
      teardown: body.sections?.teardown ?? [],
    },
    cover: body.cover ?? undefined,
    sectionNotes: {
      setup: body.sectionNotes?.setup ?? "",
      shoot: body.sectionNotes?.shoot ?? "",
      teardown: body.sectionNotes?.teardown ?? "",
    },
    specialPhotos: body.specialPhotos ?? [],
    specialNote: body.specialNote ?? "",
    note: body.note,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json(saved);
}
