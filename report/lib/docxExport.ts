"use client";

// 보고서(GenReport)를 원본 양식형 워드(.docx)로 생성 — 클라이언트 전용.
// 텍스트는 docxtemplater 플레이스홀더로, 사진은 개수에 맞춰 행 반복(이미지 모듈)으로 채웁니다.

import type { GenReport } from "@/lib/reports";
import { dotDate, layoutOf } from "@/lib/reports";
import { proxied } from "@/lib/client";

// 사진 1장을 흰 배경 고정 크기(4:3)로 정규화한 JPEG 바이트로 변환 (칸 크기 통일 → 왜곡 방지)
const IMG_W = 280;
const IMG_H = 210;

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
    // contain 배치
    const ratio = Math.min(IMG_W / bitmap.width, IMG_H / bitmap.height);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    ctx.drawImage(bitmap, Math.round((IMG_W - w) / 2), Math.round((IMG_H - h) / 2), w, h);
    const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  }
}

// 이미지 태그 값은 "문자열 키"로 넘기고, getImage가 이 저장소에서 실제 바이트를 돌려줍니다.
// (이 모듈의 동기 render()는 태그 값이 문자열일 때만 getImage를 호출함)
type PhotoRow = {
  c1img: string;
  c1cap: string;
  c2img: string; // 홀수 마지막 칸은 빈 흰색 이미지 키(빈 사진칸처럼 보임)
  c2cap: string;
};

// 280×210 흰색 빈 이미지
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

async function buildPhotoRows(report: GenReport, store: Map<string, Uint8Array>): Promise<PhotoRow[]> {
  const filled = report.photos.filter((p) => p.url);
  const imgs = await Promise.all(filled.map((p) => normalizePhoto(p.url!)));
  const items = filled
    .map((p, i) => ({ img: imgs[i], cap: p.caption || "" }))
    .filter((x): x is { img: Uint8Array; cap: string } => x.img != null);

  if (items.length === 0) return [];
  const blankKey = "__blank__";
  store.set(blankKey, await blankImage());
  items.forEach((it, i) => store.set(`p${i}`, it.img));

  const rows: PhotoRow[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const hasB = i + 1 < items.length;
    rows.push({
      c1img: `p${i}`,
      c1cap: items[i].cap,
      c2img: hasB ? `p${i + 1}` : blankKey,
      c2cap: hasB ? items[i + 1].cap : "",
    });
  }
  return rows;
}

function buildData(report: GenReport, photoRows: PhotoRow[]) {
  if (layoutOf(report.kind) === "accident") {
    const a = report.accident;
    return {
      docTitle: report.docTitle || "사 고 보 고 서",
      dateText: dotDate(report.date),
      reporter: a.reporter,
      title: a.title,
      occurredAt: a.occurredAt,
      place: a.place,
      cause: a.cause,
      scope: a.scope,
      humanDamage: a.humanDamage,
      propertyDamage: a.propertyDamage,
      damageCost: a.damageCost,
      actions: a.actions,
      followup: a.followup,
      photoRows,
    };
  }
  return {
    docTitle: report.docTitle || report.subject || "보고서",
    dateLine: `${dotDate(report.date)} · 삼구INC`,
    sections: report.sections.map((s, i) => ({ heading: `${i + 1}. ${s.heading}`, body: s.body || " " })),
    photosLabel: `${report.sections.length + 1}. 첨부사진`,
    photoRows,
  };
}

export async function generateReportDocx(report: GenReport): Promise<Blob> {
  const { default: PizZip } = await import("pizzip");
  const { default: Docxtemplater } = await import("docxtemplater");
  const ImageModule = (await import("docxtemplater-image-module-free")).default;

  const templateFile = layoutOf(report.kind) === "accident" ? "gen-accident.docx" : "gen-common.docx";
  const res = await fetch(`/templates/${templateFile}`);
  if (!res.ok) throw new Error("워드 양식을 불러오지 못했습니다.");
  const content = await res.arrayBuffer();

  const store = new Map<string, Uint8Array>();
  const photoRows = await buildPhotoRows(report, store);

  const imageModule = new ImageModule({
    getImage: (key: string) => store.get(key) ?? new Uint8Array(),
    getSize: () => [IMG_W, IMG_H],
  });

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(buildData(report, photoRows));

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
