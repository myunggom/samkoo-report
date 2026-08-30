"use client";

// 보고서를 사장 원본 양식(.docx) 그대로 채워 생성 — 클라이언트 전용.
//  · 사고: accident.docx (필드표 그대로 + 사진 반복표)
//  · 점검/완료/보수요청: inspection/completion/repair.docx (반복 섹션 + 사진 반복표)
//  · 풍수해: pungsuhae.docx (점검표 결과 + 사진 5구간×3)
// 사진은 개수에 맞춰 표가 늘어나고, 셀에 꽉 차게(cover) 들어갑니다. 글꼴은 양식에서 맑은 고딕.

import type { GenReport, ReportKind } from "@/lib/reports";
import { dotDate, layoutOf } from "@/lib/reports";
import type { PungReport } from "@/lib/pungsuhae";
import { dotDate as pungDotDate } from "@/lib/pungsuhae";
import { proxied } from "@/lib/client";

// 사진 박스(px). 양식의 사진 셀 크기에 맞춰 넣어야 표 크기가 변하지 않음.
type Box = { w: number; h: number };
const COMMON_BOX: Box = { w: 300, h: 225 }; // 일반 보고서 2열 표(셀 3.25in, 높이 자동)
const PUNG_BOX: Box = { w: 198, h: 138 }; // 풍수해 사진 셀(2.25×1.50in 고정) 안에 맞춤

// 사진을 흰 배경 고정 박스에 여백 없이 cover-crop → 셀 크기에 딱 맞게(표가 커지지 않음)
async function normalizePhoto(url: string, box: Box = COMMON_BOX): Promise<Uint8Array | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = box.w;
    canvas.height = box.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, box.w, box.h);
    const ratio = Math.max(box.w / bitmap.width, box.h / bitmap.height);
    const w = bitmap.width * ratio;
    const h = bitmap.height * ratio;
    ctx.drawImage(bitmap, (box.w - w) / 2, (box.h - h) / 2, w, h);
    const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  }
}

// 사진들 → 2열 반복표 데이터 (개수에 맞춰 행 생성, 홀수 마지막은 빈 셀)
type PhotoRow = { c1img: string; c1cap: string; c2img: string; c2cap: string };
async function buildPhotoRows(
  photos: { url?: string; caption?: string }[],
  store: Map<string, Uint8Array>,
  box: Box = COMMON_BOX
): Promise<PhotoRow[]> {
  const filled = photos.filter((p) => p.url);
  const imgs = await Promise.all(filled.map((p) => normalizePhoto(p.url!, box)));
  const items = filled
    .map((p, i) => ({ img: imgs[i], cap: p.caption || "" }))
    .filter((x): x is { img: Uint8Array; cap: string } => x.img != null);
  items.forEach((it, i) => store.set(`p${i}`, it.img));
  const rows: PhotoRow[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const hasB = i + 1 < items.length;
    rows.push({ c1img: `p${i}`, c1cap: items[i].cap, c2img: hasB ? `p${i + 1}` : "", c2cap: hasB ? items[i + 1].cap : "" });
  }
  return rows;
}

const TEMPLATE_BY_KIND: Record<ReportKind, string> = {
  accident: "accident.docx",
  completion: "completion.docx",
  inspection: "inspection.docx",
  repair: "repair.docx",
};

function splitLines(text: string, n: number): string[] {
  const lines = (text || "").split("\n").map((s) => s.trim());
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(lines[i] ?? "");
  if (lines.length > n) out[n - 1] = lines.slice(n - 1).join(" ");
  return out;
}

async function buildCommonData(report: GenReport, store: Map<string, Uint8Array>) {
  const photoRows = await buildPhotoRows(report.photos, store);
  return {
    제목: report.subject || report.docTitle || "",
    "작성 일자": dotDate(report.date),
    sections: report.sections.map((s) => ({ heading: s.heading, body: s.body || " " })),
    photosLabel: `${report.sections.length + 1}. 첨부사진`,
    photoRows,
  };
}

async function buildAccidentData(report: GenReport, store: Map<string, Uint8Array>) {
  const a = report.accident;
  const data: Record<string, unknown> = {
    "보고자 직책": a.reporter,
    이름: "",
    "보고 일자": dotDate(report.date),
    제목: a.title,
    "사고 발생일자": a.occurredAt,
    "사고 장소": a.place,
    "사고 발생 원인": a.cause,
    "피해 범위": a.scope,
    "인적 피해": a.humanDamage,
    "물적 피해": a.propertyDamage,
    "피해 금액": a.damageCost,
    "사고 발생일": a.occurredAt,
  };
  splitLines(a.actions, 5).forEach((line, i) => {
    data[`사고 시간${i + 1}`] = "";
    data[`사고 시간${i + 1} 내용`] = line;
  });
  const fol = splitLines(a.followup, 2);
  data["대응 적합성 및 향후 방안1"] = fol[0];
  data["대응 적합성 및 향후 방안2"] = fol[1];
  data.photoRows = await buildPhotoRows(report.photos, store);
  return data;
}

async function renderDocx(templateFile: string, data: unknown, store: Map<string, Uint8Array>, box: Box = COMMON_BOX): Promise<Blob> {
  const { default: PizZip } = await import("pizzip");
  const { default: Docxtemplater } = await import("docxtemplater");
  const ImageModule = (await import("docxtemplater-image-module-free")).default;

  const res = await fetch(`/templates/${templateFile}`);
  if (!res.ok) throw new Error("워드 양식을 불러오지 못했습니다.");
  const content = await res.arrayBuffer();

  const imageModule = new ImageModule({
    getImage: (key: string) => store.get(key) ?? new Uint8Array(),
    getSize: () => [box.w, box.h],
  });
  const doc = new Docxtemplater(new PizZip(content), {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export async function generateReportDocx(report: GenReport): Promise<Blob> {
  const store = new Map<string, Uint8Array>();
  const isAccident = layoutOf(report.kind) === "accident";
  const data = isAccident ? await buildAccidentData(report, store) : await buildCommonData(report, store);
  return renderDocx(TEMPLATE_BY_KIND[report.kind], data, store);
}

// ── 풍수해 예방 점검 보고서 (원본 양식) ──
export async function generatePungReportDocx(report: PungReport): Promise<Blob> {
  const store = new Map<string, Uint8Array>();
  const data: Record<string, unknown> = {
    점검일자: pungDotDate(report.date),
    점검자: report.inspector || "",
  };
  // 점검결과 13칸 (항목 순서대로)
  report.checklist.forEach((it, i) => {
    data[`점검결과${i + 1}`] = it.result || "";
  });
  // 사진 5구간×3 = 최대 15칸 (구간 순서대로 평탄화)
  const slots: { url?: string; caption?: string }[] = [];
  report.sections.forEach((sec) => sec.slots.forEach((s) => slots.push(s)));
  const imgs = await Promise.all(slots.map((s) => (s.url ? normalizePhoto(s.url, PUNG_BOX) : Promise.resolve(null))));
  for (let n = 1; n <= 15; n++) {
    const bytes = imgs[n - 1];
    if (bytes) {
      store.set(`사진${n}`, bytes);
      data[`사진${n}`] = `사진${n}`;
    } else {
      data[`사진${n}`] = "";
    }
  }
  return renderDocx("pungsuhae.docx", data, store, PUNG_BOX);
}
