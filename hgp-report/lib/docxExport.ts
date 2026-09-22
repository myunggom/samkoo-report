"use client";

// 보고서를 사장 원본 양식(.docx)으로 채워 생성 — 클라이언트 전용.
//  · 사고/완료/점검/보수요청: 원본 [사고보고서] 한독·제넥신·프로젠 양식 기반 템플릿
//    (scripts/build_report_templates.py 가 public/templates/*.docx 생성)
//  · 풍수해: pungsuhae.docx (점검표 결과 + 사진 5구간×3)
// 표 행(조치 경과·대책·사진)은 입력 개수만큼 늘어나고, 사진은 칸에 꽉 차게(cover) 들어갑니다.

import type { GenReport, PlanRow, ReportKind } from "@/lib/reports";
import { DEFAULT_SIGNOFF, KIND_BANNER, KIND_PLACE_LABEL, layoutOf } from "@/lib/reports";
import type { PungReport } from "@/lib/pungsuhae";
import { dotDate as pungDotDate } from "@/lib/pungsuhae";
import { proxied } from "@/lib/client";

// 사진 박스(px). 양식의 사진 셀 크기에 맞춰 넣어야 표 크기가 변하지 않음.
type Box = { w: number; h: number };
const COMMON_BOX: Box = { w: 240, h: 180 }; // 보고서 2열 사진표(셀 3.44in) 안 4:3
const PUNG_BOX: Box = { w: 198, h: 138 }; // 풍수해 사진 셀(2.25×1.50in 고정) 안에 맞춤

// 사진을 흰 배경 고정 박스에 여백 없이 cover-crop → 셀 크기에 딱 맞게(표가 커지지 않음).
// 인쇄 선명도를 위해 2배 해상도로 저장(표시 크기는 box).
async function normalizePhoto(url: string, box: Box = COMMON_BOX): Promise<Uint8Array | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = box.w * 2;
    canvas.height = box.h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * ratio;
    const h = bitmap.height * ratio;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  }
}

// 사진들 → 2열 반복표 데이터 (개수에 맞춰 행 생성, 홀수 마지막은 빈 칸)
type PhotoRow = {
  c1img: string; c1label: string; c1cap: string; c1sub: string;
  c2img: string; c2label: string; c2cap: string; c2sub: string;
};
async function buildPhotoRows(
  photos: { url?: string; caption?: string; note?: string }[],
  store: Map<string, Uint8Array>,
  box: Box = COMMON_BOX
): Promise<PhotoRow[]> {
  const filled = photos.filter((p) => p.url);
  const imgs = await Promise.all(filled.map((p) => normalizePhoto(p.url!, box)));
  const items = filled
    .map((p, i) => ({ img: imgs[i], cap: p.caption || "", sub: p.note || "" }))
    .filter((x): x is { img: Uint8Array; cap: string; sub: string } => x.img != null);
  items.forEach((it, i) => store.set(`p${i}`, it.img));
  const rows: PhotoRow[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const b = i + 1 < items.length ? items[i + 1] : null;
    rows.push({
      c1img: `p${i}`, c1label: `PHOTO ${i + 1}`, c1cap: items[i].cap, c1sub: items[i].sub,
      c2img: b ? `p${i + 1}` : "", c2label: b ? `PHOTO ${i + 2}` : "", c2cap: b?.cap ?? "", c2sub: b?.sub ?? "",
    });
  }
  return rows;
}

const TEMPLATE_BY_KIND: Record<ReportKind, string> = {
  accident: "accident.docx",
  completion: "completion.docx",
  inspection: "inspection.docx",
  repair: "repair.docx",
};

// ── 글자색 자동 (템플릿의 {#prefix_tone} 조건 런과 이름 일치) ──
type Tone = "green" | "blue" | "orange" | "red" | "gray" | "navy";
function toneFlags(prefix: string, tone: Tone): Record<string, boolean> {
  return { [`${prefix}_${tone}`]: true };
}
const isNone = (v: string) => !v.trim() || /없\s*음|해당\s*없|^-$|^0원?$/.test(v.trim());
// 피해 값: 없음=초록, 있으면 빨강
const damageTone = (v: string): Tone => (isNone(v) ? "green" : "red");
// 사고 등급
function gradeTone(v: string): Tone {
  if (/중대|심각|level\s*3/i.test(v)) return "red";
  if (/보통|주의|level\s*2/i.test(v)) return "orange";
  return "green";
}
// 조치 경과 구분
function kindTone(v: string): Tone {
  if (/접수|신고|원인/.test(v)) return "orange";
  if (/현장|확인|출동|합동/.test(v)) return "blue";
  if (/조치|복구|완료|해제/.test(v)) return "green";
  if (/보고|전파|공유/.test(v)) return "navy";
  return "gray";
}
// 대책 결과
function resultTone(v: string): Tone {
  if (/완료/.test(v)) return "green";
  if (/진행/.test(v)) return "blue";
  if (/예정/.test(v)) return "orange";
  return "gray";
}

// "2026-08-28" → "2026. 08. 28 (금)"
function reportDate(ymd: string): string {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return ymd || "";
  const wd = "일월화수목금토"[new Date(y, m - 1, d).getDay()];
  return `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")} (${wd})`;
}

function planRows(list: PlanRow[]) {
  const rows = list
    .filter((p) => p.text.trim() || p.result.trim())
    .map((p) => ({ 내용: p.text, 결과: p.result, ...toneFlags("r", resultTone(p.result)) }));
  return { first: rows.slice(0, 1), rest: rows.slice(1) };
}

async function buildCommonData(report: GenReport, store: Map<string, Uint8Array>) {
  const photoRows = await buildPhotoRows(report.photos, store);
  const sections = report.sections
    .filter((s) => s.heading.trim() || s.body.trim())
    .map((s, i) => ({
      no: String(i + 1),
      heading: s.heading,
      // 본문은 줄마다 한 문단(• 글머리). 이미 기호로 시작하면 그대로.
      lines: (s.body || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (/^[•·○●\-※▶■□◆*]/.test(l) ? l : `• ${l}`)),
    }));
  return {
    문서제목: KIND_BANNER[report.kind],
    제목: report.docTitle || report.subject || "",
    보고자: report.reporter,
    보고일: reportDate(report.date),
    보고대상: report.reportTo,
    항목4라벨: KIND_PLACE_LABEL[report.kind],
    항목4: report.place,
    has요약: !!report.summary.trim(),
    요약라벨: "한 줄 요약",
    한줄요약: report.summary,
    sections,
    hasPhotos: photoRows.length > 0,
    photoNo: String(sections.length + 1),
    photoRows,
    발신: report.signoff || DEFAULT_SIGNOFF,
  };
}

async function buildAccidentData(report: GenReport, store: Map<string, Uint8Array>) {
  const a = report.accident;
  const photoRows = await buildPhotoRows(report.photos, store);
  const plans = planRows(a.plans || []);
  const prevents = planRows(a.prevents || []);
  const note = (a.damageNote || "").trim();
  return {
    문서제목: KIND_BANNER.accident,
    제목: a.title,
    보고자: report.reporter,
    보고일: reportDate(report.date),
    보고대상: report.reportTo,
    등급: a.grade,
    ...toneFlags("g", gradeTone(a.grade)),
    등급비고: a.gradeNote,
    요약일시: a.sumTime || a.occurredAt,
    요약장소: a.sumPlace || a.place,
    피해규모: a.sumDamage,
    ...toneFlags("d", damageTone(a.sumDamage)),
    임시조치: a.sumTemp,
    한줄요약: report.summary,
    발생일시: a.occurredAt,
    발생장소: a.place,
    발생원인: a.cause,
    영향범위: a.scope,
    신고경로: a.reportPath,
    인적피해: a.humanDamage,
    ...toneFlags("h", damageTone(a.humanDamage)),
    물적피해: a.propertyDamage,
    ...toneFlags("m", damageTone(a.propertyDamage)),
    피해금액: a.damageCost,
    ...toneFlags("c", damageTone(a.damageCost)),
    피해비고: note ? (note.startsWith("※") ? note : `※ ${note}`) : "",
    경과: (a.timeline || [])
      .filter((t) => t.time.trim() || t.kind.trim() || t.content.trim() || t.actor.trim())
      .map((t) => ({ 시각: t.time, 구분: t.kind, 내용: t.content, 담당: t.actor, ...toneFlags("t", kindTone(t.kind)) })),
    조치첫: plans.first,
    조치나머지: plans.rest,
    재발첫: prevents.first,
    재발나머지: prevents.rest,
    hasPhotos: photoRows.length > 0,
    photoRows,
    발신: report.signoff || DEFAULT_SIGNOFF,
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

// ── 풍수해 예방 점검 보고서 (원본 양식) ──
export async function generatePungReportDocx(report: PungReport): Promise<Blob> {
  const store = new Map<string, Uint8Array>();
  const data: Record<string, unknown> = {
    점검일자: pungDotDate(report.date),
    점검자: report.inspector || "",
    사업장명: report.site || "",
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
