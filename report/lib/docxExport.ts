"use client";

// 보고서(GenReport)를 원본 양식형 워드(.docx)로 생성 — 클라이언트 전용.
//  · 사고보고서: 사장 원본 양식(public/templates/accident.docx)을 그대로 채움(텍스트 태그 + 사진 이미지 태그)
//  · 완료/점검/보수요청: 섹션이 가변이라 공통 생성템플릿(gen-common.docx)에 반복 채움
// 사진은 개수에 맞춰 채우고, 셀에 꽉 차게(여백 없이) 넣습니다. 글꼴은 템플릿에서 맑은 고딕으로 통일.

import type { GenReport } from "@/lib/reports";
import { dotDate, layoutOf } from "@/lib/reports";
import { proxied } from "@/lib/client";

// 사진을 셀에 꽉 차게 채우기 위한 고정 박스(4:3), 여백 없이 cover-crop
const IMG_W = 300;
const IMG_H = 225;

async function normalizePhoto(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = IMG_W;
    canvas.height = IMG_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, IMG_W, IMG_H);
    // cover: 박스를 꽉 채우도록 확대 후 가운데 crop (여백 없음)
    const ratio = Math.max(IMG_W / bitmap.width, IMG_H / bitmap.height);
    const w = bitmap.width * ratio;
    const h = bitmap.height * ratio;
    ctx.drawImage(bitmap, (IMG_W - w) / 2, (IMG_H - h) / 2, w, h);
    const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  }
}

async function blankImage(): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, IMG_W, IMG_H);
  }
  const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.6));
  return b ? new Uint8Array(await b.arrayBuffer()) : new Uint8Array();
}

// 여러 줄 텍스트를 n개 슬롯으로 분배 (부족하면 빈칸, 넘치면 마지막에 몰아넣음)
function splitLines(text: string, n: number): string[] {
  const lines = (text || "").split("\n").map((s) => s.trim());
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(lines[i] ?? "");
  if (lines.length > n) out[n - 1] = lines.slice(n - 1).join(" ");
  return out;
}

// ── 공통 양식(완료/점검/보수요청): 사진 2열 반복 ──
type PhotoRow = { c1img: string; c1cap: string; c2img: string; c2cap: string };

async function buildCommonData(report: GenReport, store: Map<string, Uint8Array>) {
  const filled = report.photos.filter((p) => p.url);
  const imgs = await Promise.all(filled.map((p) => normalizePhoto(p.url!)));
  const items = filled
    .map((p, i) => ({ img: imgs[i], cap: p.caption || "" }))
    .filter((x): x is { img: Uint8Array; cap: string } => x.img != null);

  const rows: PhotoRow[] = [];
  if (items.length > 0) {
    const blankKey = "__blank__";
    store.set(blankKey, await blankImage());
    items.forEach((it, i) => store.set(`p${i}`, it.img));
    for (let i = 0; i < items.length; i += 2) {
      const hasB = i + 1 < items.length;
      rows.push({ c1img: `p${i}`, c1cap: items[i].cap, c2img: hasB ? `p${i + 1}` : blankKey, c2cap: hasB ? items[i + 1].cap : "" });
    }
  }
  return {
    docTitle: report.docTitle || report.subject || "보고서",
    dateLine: `${dotDate(report.date)} · 삼구INC`,
    sections: report.sections.map((s, i) => ({ heading: `${i + 1}. ${s.heading}`, body: s.body || " " })),
    photosLabel: `${report.sections.length + 1}. 첨부사진`,
    photoRows: rows,
  };
}

// ── 사고보고서: 원본 양식의 태그를 그대로 채움 ──
async function buildAccidentData(report: GenReport, store: Map<string, Uint8Array>) {
  const a = report.accident;
  const data: Record<string, string> = {
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
  // 조치 사항 및 경과: 줄 단위로 5개 슬롯의 '내용'에 채움 (시간칸은 비움)
  const acts = splitLines(a.actions, 5);
  acts.forEach((line, i) => {
    data[`사고 시간${i + 1}`] = "";
    data[`사고 시간${i + 1} 내용`] = line;
  });
  // 대응 적합성 및 향후 방안: 2개 슬롯
  const fol = splitLines(a.followup, 2);
  data["대응 적합성 및 향후 방안1"] = fol[0];
  data["대응 적합성 및 향후 방안2"] = fol[1];

  // 사진 8칸: 있는 만큼 채우고 나머지는 빈칸
  const filled = report.photos.filter((p) => p.url).slice(0, 8);
  const imgs = await Promise.all(filled.map((p) => normalizePhoto(p.url!)));
  for (let n = 1; n <= 8; n++) {
    const idx = n - 1;
    const bytes = imgs[idx];
    if (bytes) {
      store.set(`사진${n}`, bytes);
      data[`사진${n}`] = `사진${n}`; // 이미지 태그 값 = 저장소 키
      data[`사진${n} 내용`] = filled[idx].caption || "";
    } else {
      data[`사진${n}`] = ""; // 빈 슬롯 → 이미지 렌더 안 됨
      data[`사진${n} 내용`] = "";
    }
  }
  return data;
}

export async function generateReportDocx(report: GenReport): Promise<Blob> {
  const { default: PizZip } = await import("pizzip");
  const { default: Docxtemplater } = await import("docxtemplater");
  const ImageModule = (await import("docxtemplater-image-module-free")).default;

  const isAccident = layoutOf(report.kind) === "accident";
  const templateFile = isAccident ? "accident.docx" : "gen-common.docx";
  const res = await fetch(`/templates/${templateFile}`);
  if (!res.ok) throw new Error("워드 양식을 불러오지 못했습니다.");
  const content = await res.arrayBuffer();

  const store = new Map<string, Uint8Array>();
  const data = isAccident ? await buildAccidentData(report, store) : await buildCommonData(report, store);

  const imageModule = new ImageModule({
    getImage: (key: string) => store.get(key) ?? new Uint8Array(),
    getSize: () => [IMG_W, IMG_H],
  });

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "", // 값 없는 태그는 빈 문자열
  });
  doc.render(data);

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
