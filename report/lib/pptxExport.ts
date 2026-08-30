"use client";

// 보고서(GenReport)를 PPT(.pptx)로 생성 — 클라이언트 전용(pptxgenjs).
// 1페이지: 제목 + 날짜 + 본문(섹션/사고 항목). 이후 사진은 한 슬라이드에 1~2장씩, 넘치면 자동으로 슬라이드 추가.

import type { GenReport } from "@/lib/reports";
import { dotDate, layoutOf } from "@/lib/reports";
import { proxied } from "@/lib/client";

async function fetchDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// 본문 텍스트(슬라이드 1) 구성
function bodyText(report: GenReport): { text: string; options: Record<string, unknown> }[] {
  if (layoutOf(report.kind) === "accident") {
    const a = report.accident;
    const rows: [string, string][] = [
      ["보고자", a.reporter],
      ["제목", a.title],
      ["발생 일시", a.occurredAt],
      ["발생 장소", a.place],
      ["발생 원인", a.cause],
      ["피해 범위", a.scope],
      ["인적 피해", a.humanDamage],
      ["물적 피해", a.propertyDamage],
      ["피해액", a.damageCost],
      ["조치 사항 및 경과", a.actions],
      ["대응 적합성 및 향후 방안", a.followup],
    ];
    return rows
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => ({ text: `${k}: ${v}\n`, options: { fontSize: 12, breakLine: true } }));
  }
  const out: { text: string; options: Record<string, unknown> }[] = [];
  report.sections.forEach((s, i) => {
    out.push({ text: `${i + 1}. ${s.heading}\n`, options: { fontSize: 14, bold: true, breakLine: true } });
    if (s.body && s.body.trim()) out.push({ text: `${s.body}\n`, options: { fontSize: 12, breakLine: true } });
  });
  return out;
}

export async function generateReportPptx(report: GenReport): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "A4", width: 10, height: 7.5 });
  pptx.layout = "A4";

  const title = layoutOf(report.kind) === "accident" ? report.docTitle || "사 고 보 고 서" : report.docTitle || report.subject || "보고서";

  // ── 슬라이드 1: 제목 + 날짜 + 본문 ──
  const s1 = pptx.addSlide();
  s1.addText(title, { x: 0.5, y: 0.35, w: 9, h: 0.8, fontSize: 24, bold: true, align: "center" });
  s1.addText(`${dotDate(report.date)}  ·  삼구INC`, { x: 0.5, y: 1.15, w: 9, h: 0.4, fontSize: 12, color: "666666", align: "center" });
  s1.addText(bodyText(report), { x: 0.6, y: 1.7, w: 8.8, h: 5.4, valign: "top", autoFit: true });

  // ── 사진 슬라이드: 한 장에 최대 2장 ──
  const filled = report.photos.filter((p) => p.url);
  const dataUrls = await Promise.all(filled.map((p) => fetchDataUrl(p.url!)));
  const photos = filled
    .map((p, i) => ({ data: dataUrls[i], caption: p.caption || "" }))
    .filter((x): x is { data: string; caption: string } => !!x.data);

  const total = Math.ceil(photos.length / 2);
  for (let s = 0; s < total; s++) {
    const slide = pptx.addSlide();
    slide.addText(`첨부사진 (${s + 1}/${total})`, { x: 0.5, y: 0.25, w: 9, h: 0.5, fontSize: 16, bold: true });
    const pair = [photos[s * 2], photos[s * 2 + 1]];
    pair.forEach((ph, idx) => {
      if (!ph) return;
      const x = idx === 0 ? 0.5 : 5.15;
      slide.addImage({ data: ph.data, x, y: 1.0, w: 4.35, h: 3.26, sizing: { type: "contain", w: 4.35, h: 3.26 } });
      slide.addText(ph.caption || " ", { x, y: 4.35, w: 4.35, h: 0.5, fontSize: 11, align: "center" });
    });
  }

  return (await pptx.write({ outputType: "blob" })) as Blob;
}
