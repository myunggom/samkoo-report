"use client";

// 주간 업무보고 PPT 생성 (사장 전용) — pptxgenjs로 표지 + 항목별 슬라이드를 코드 생성.
// 각 항목: 번호·제목·소제목·요약(Claude 정리 문구) + 사진. 사진/항목 개수에 맞춰 자동 배치.

import { proxied } from "@/lib/client";

export type WeeklySlideItem = {
  title: string;
  subtitle: string;
  summary: string;
  photos: { url: string; caption?: string }[];
};

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

const NAVY = "1F3864";
const ACCENT = "2E75B6";

export async function generateWeeklyPptx(items: WeeklySlideItem[], period: string): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: 10, height: 7.5 });
  pptx.layout = "W";

  // ── 표지 ──
  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  cover.addShape("rect", { x: 0, y: 2.4, w: 10, h: 2.7, fill: { color: NAVY } });
  cover.addText("바이오 이노베이션 허브", { x: 0.7, y: 2.75, w: 8.6, h: 0.7, fontSize: 30, bold: true, color: "FFFFFF" });
  cover.addText(`주간회의자료   ${period}`, { x: 0.72, y: 3.65, w: 8.6, h: 0.6, fontSize: 18, color: "DDE6F5" });
  cover.addText("주식회사  I  삼구아이앤씨", { x: 0.7, y: 6.9, w: 5, h: 0.35, fontSize: 11, color: "888888" });

  // ── 항목별 슬라이드 ──
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const slide = pptx.addSlide();
    const no = String(i + 1).padStart(2, "0");

    slide.addText(no, { x: 0.5, y: 0.35, w: 0.9, h: 0.6, fontSize: 30, bold: true, color: ACCENT });
    slide.addText(it.title || "(제목 없음)", { x: 1.45, y: 0.4, w: 8, h: 0.6, fontSize: 22, bold: true, color: "222222", valign: "middle" });
    if (it.subtitle) {
      slide.addText(it.subtitle, { x: 1.45, y: 1.0, w: 8, h: 0.4, fontSize: 14, color: ACCENT });
    }
    slide.addShape("line", { x: 0.5, y: 1.5, w: 9, h: 0, line: { color: "CCCCCC", width: 1 } });
    if (it.summary) {
      const lines = it.summary
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      slide.addText(
        lines.map((t) => ({ text: `• ${t}`, options: { fontSize: 13, breakLine: true, color: "333333" } })),
        { x: 0.6, y: 1.65, w: 8.8, h: 1.5, valign: "top" }
      );
    }

    // 사진: 아래쪽에 최대 3열로 배치 (개수에 맞춰)
    const filled = it.photos.filter((p) => p.url);
    const urls = await Promise.all(filled.map((p) => fetchDataUrl(p.url)));
    const photos = filled
      .map((p, idx) => ({ data: urls[idx], caption: p.caption || "" }))
      .filter((x): x is { data: string; caption: string } => !!x.data)
      .slice(0, 6); // 슬라이드당 최대 6장 (넘으면 생략)

    const perRow = photos.length <= 2 ? photos.length || 1 : 3;
    const gap = 0.25;
    const areaX = 0.6;
    const areaW = 8.8;
    const imgW = (areaW - gap * (perRow - 1)) / perRow;
    const imgH = imgW * 0.7;
    const startY = 3.35;
    photos.forEach((ph, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const x = areaX + col * (imgW + gap);
      const y = startY + row * (imgH + 0.45);
      slide.addImage({ data: ph.data, x, y, w: imgW, h: imgH, sizing: { type: "contain", w: imgW, h: imgH } });
      if (ph.caption) slide.addText(ph.caption, { x, y: y + imgH + 0.02, w: imgW, h: 0.3, fontSize: 10, align: "center", color: "555555" });
    });

    slide.addText(`${no} / ${String(items.length).padStart(2, "0")}`, { x: 8.9, y: 7.05, w: 1, h: 0.3, fontSize: 10, color: "999999", align: "right" });
  }

  return (await pptx.write({ outputType: "blob" })) as Blob;
}
