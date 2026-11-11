"use client";

// 보고서를 사장 결재 양식(.docx) 그대로 채워 생성 — 클라이언트 전용.
// 양식 5종은 모두 구매검토서와 같은 모양: 네이비 제목 머리 + 메타표(작성일/작성/대상 건물/구분)
// + 번호 붙은 섹션 바 + 연청색 표 + 삼구 로고 머리글 + 페이지 번호 바닥글.
//  · 사고: accident.docx (사고 개요·피해 현황 표 + 조치·향후방안 + 사진)
//  · 점검/완료/보수요청: inspection/completion/repair.docx (섹션 반복 + 사진)
//  · 풍수해: pungsuhae.docx (점검표 반복 + 구간별 사진 3칸 반복)
// 사진·섹션·점검 항목은 개수에 맞춰 표가 늘어납니다. 글꼴은 양식에서 맑은 고딕.

import type { GenReport, ReportKind } from "@/lib/reports";
import { DEFAULT_AUTHOR, DEFAULT_BUILDING, KIND_CATEGORY, KIND_LABEL, dotDate, layoutOf } from "@/lib/reports";
import type { PungReport } from "@/lib/pungsuhae";
import {
  PUNG_BUILDING, PUNG_CATEGORY, PUNG_SUBTITLE, PUNG_TITLE, RESULT_LEGEND,
  dotDate as pungDotDate, effectiveCaption,
} from "@/lib/pungsuhae";
import { tablesToXml } from "@/lib/docxTable";
import { proxied } from "@/lib/client";

// 사진 박스(px). 양식의 사진 셀 크기에 맞춰 넣어야 표 크기가 변하지 않음.
type Box = { w: number; h: number };
const COMMON_BOX: Box = { w: 300, h: 225 }; // 일반 보고서 2열 표(셀 4959dxa ≈ 3.3in)
const PUNG_BOX: Box = { w: 198, h: 138 }; // 풍수해 3열 표(셀 3306dxa ≈ 2.2in) 안에 맞춤

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
  review: "review.docx",
};

// 엔터로 나눈 줄 = 불릿 한 줄. 빈 줄은 버린다.
function bulletLines(text: string): string[] {
  return (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

async function buildCommonData(report: GenReport, store: Map<string, Uint8Array>) {
  const photoRows = await buildPhotoRows(report.photos, store);
  // 섹션 바 번호(1,2,3…)는 코드에서 매긴다 — 사진 섹션이 마지막 번호를 이어받는다.
  const sections = report.sections.map((s, i) => ({
    no: String(i + 1),
    heading: s.heading,
    내용: bulletLines(s.body),
    // 화면에서 만든 표를 워드 표 XML 로 바꿔 양식의 {@tablesXml} 자리에 그대로 끼운다
    tablesXml: tablesToXml(s.tables),
  }));
  return {
    제목: report.docTitle?.trim() || report.subject?.trim() || KIND_LABEL[report.kind],
    부제: report.subtitle?.trim() || "",
    "작성 일자": dotDate(report.date),
    작성자: report.author?.trim() || DEFAULT_AUTHOR,
    "대상 건물": report.building?.trim() || DEFAULT_BUILDING,
    구분: report.category?.trim() || KIND_CATEGORY[report.kind],
    sections,
    photoNo: String(sections.length + 1),
    photosLabel: "첨부사진",
    photoRows,
  };
}

async function buildAccidentData(report: GenReport, store: Map<string, Uint8Array>) {
  const a = report.accident;
  return {
    제목: report.docTitle?.trim() || a.title?.trim() || "사고 보고서",
    부제: report.subtitle?.trim() || "",
    "보고 일자": dotDate(report.date),
    "보고자 직책": report.author?.trim() || a.reporter?.trim() || DEFAULT_AUTHOR,
    "대상 건물": report.building?.trim() || DEFAULT_BUILDING,
    구분: report.category?.trim() || KIND_CATEGORY.accident,
    "사고 제목": a.title,
    "사고 발생일자": a.occurredAt,
    "사고 장소": a.place,
    "사고 발생 원인": a.cause,
    "피해 범위": a.scope,
    "인적 피해": a.humanDamage,
    "물적 피해": a.propertyDamage,
    "피해 금액": a.damageCost,
    조치: bulletLines(a.actions),
    향후방안: bulletLines(a.followup),
    tablesXml: tablesToXml(report.tables),
    photoRows: await buildPhotoRows(report.photos, store),
  };
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

// ── 풍수해 예방 점검 보고서 (같은 양식) ──
// 점검 항목과 사진 칸은 개수가 바뀔 수 있으므로 모두 반복으로 채운다.
export async function generatePungReportDocx(report: PungReport): Promise<Blob> {
  const store = new Map<string, Uint8Array>();

  let n = 0;
  const photoSections: { no: string; title: string; rows: Record<string, string>[] }[] = [];
  for (let si = 0; si < report.sections.length; si++) {
    const sec = report.sections[si];
    const items = await Promise.all(
      sec.slots.map(async (slot) => {
        const cap = effectiveCaption(slot);
        if (!slot.url) return { key: "", cap };
        const bytes = await normalizePhoto(slot.url, PUNG_BOX);
        if (!bytes) return { key: "", cap };
        const key = `p${n++}`;
        store.set(key, bytes);
        return { key, cap };
      })
    );
    // 한 행에 3칸. 칸이 3의 배수가 아니면 마지막 행 남은 칸은 비워 둔다.
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < items.length; i += 3) {
      const g = [items[i], items[i + 1], items[i + 2]];
      rows.push({
        i1: g[0]?.key ?? "", c1: g[0]?.cap ?? "",
        i2: g[1]?.key ?? "", c2: g[1]?.cap ?? "",
        i3: g[2]?.key ?? "", c3: g[2]?.cap ?? "",
      });
    }
    // 섹션 바 번호: 1번은 점검 결과이므로 사진 구간은 2번부터
    photoSections.push({ no: String(si + 2), title: sec.title, rows });
  }

  const data: Record<string, unknown> = {
    제목: PUNG_TITLE,
    부제: PUNG_SUBTITLE,
    점검일자: pungDotDate(report.date),
    점검자: report.inspector || "",
    "대상 건물": PUNG_BUILDING,
    구분: PUNG_CATEGORY,
    범례: RESULT_LEGEND,
    checkRows: report.checklist.map((it) => ({
      category: it.category,
      content: it.content,
      result: it.result || "",
    })),
    photoSections,
  };
  return renderDocx("pungsuhae.docx", data, store, PUNG_BOX);
}
