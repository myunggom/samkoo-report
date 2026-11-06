"use client";

// 화면의 보고서 문서(element)를 캡처해 A4 PDF로 만들고, 폰 공유창 또는 다운로드로 내보냅니다.

async function waitForImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
    )
  );
}

type PdfOptions = {
  orientation?: "landscape" | "portrait";
  pageSelector?: string; // 페이지 단위 element 선택자 (기본 ".pdf-page")
};

export async function elementToPdfBlob(el: HTMLElement, opts: PdfOptions = {}): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const { default: jsPDF } = await import("jspdf");

  await waitForImages(el);

  const orientation = opts.orientation ?? "landscape";
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  // A4: 가로 297×210, 세로 210×297
  const pageW = orientation === "landscape" ? 297 : 210;
  const pageH = orientation === "landscape" ? 210 : 297;

  const selector = opts.pageSelector ?? ".pdf-page";
  const pageEls = Array.from(el.querySelectorAll<HTMLElement>(selector));
  const targets = pageEls.length > 0 ? pageEls : [el];

  for (let i = 0; i < targets.length; i++) {
    const canvas = await html2canvas(targets[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
  }

  return pdf.output("blob");
}

// 길이가 가변인 문서(보고서)용 — A4 너비 컨테이너 하나를 캡처해 세로로 잘라 여러 A4 페이지로 만듭니다.
export async function elementToPdfBlobFlow(
  el: HTMLElement,
  opts: { orientation?: "landscape" | "portrait" } = {}
): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const { default: jsPDF } = await import("jspdf");

  await waitForImages(el);

  const orientation = opts.orientation ?? "portrait";
  const pageW = orientation === "landscape" ? 297 : 210;
  const pageH = orientation === "landscape" ? 210 : 297;

  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });

  // 캔버스를 페이지 너비에 맞췄을 때의 전체 높이(mm)
  const imgHmm = (canvas.height * pageW) / canvas.width;
  const pages = Math.max(1, Math.ceil(imgHmm / pageH));
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage();
    // 같은 이미지를 위로 밀어 각 페이지 구간만 보이게 함
    pdf.addImage(imgData, "JPEG", 0, -(i * pageH), pageW, imgHmm);
  }
  return pdf.output("blob");
}

// ── 워드 문서(docx-preview 로 렌더한 본문) → A4 PDF ───────────────
// 양식의 머리글(삼구 로고)과 바닥글(페이지 번호)을 페이지마다 다시 얹는다.
// docx-preview 는 머리글을 본문 흐름 안에 넣기 때문에, 머리글을 따로 떼어
// 캡처해서 올려야 배경 워터마크가 첫 장을 통째로 밀어내지 않는다.
const A4 = { w: 210, h: 297, side: 17.6, headTop: 8, gap: 5, footGap: 4, bottom: 14 };

export async function docxElementToPdfBlob(body: HTMLElement, header?: HTMLElement | null): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const { default: jsPDF } = await import("jspdf");

  await waitForImages(body);
  const shot = (el: HTMLElement) =>
    html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });

  // 머리글 — 본문과 같은 폭으로 맞춰 페이지 위쪽에 얹는다
  const headW = A4.w - A4.side * 2;
  let headImg = "";
  let headH = 0;
  if (header) {
    const hc = await shot(header);
    if (hc.width > 0 && hc.height > 0) {
      headImg = hc.toDataURL("image/jpeg", 0.92);
      headH = (hc.height * headW) / hc.width;
    }
  }

  // 캡처 전에 "여기서 끊어도 되는 지점"(문단·표 행의 아래 경계)을 재어 둔다
  const breaks = breakPoints(body, 2);

  const canvas = await shot(body);
  const bodyTop = headImg ? A4.headTop + headH + A4.gap : A4.bottom;
  const bodyBottom = A4.h - A4.bottom;
  const areaH = bodyBottom - bodyTop;

  const cuts = pageCuts(canvas.height, (areaH * canvas.width) / A4.w, breaks);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let i = 0; i < cuts.length; i++) {
    if (i > 0) pdf.addPage();
    const [y0, y1] = cuts[i];
    const part = sliceCanvas(canvas, y0, y1);
    pdf.addImage(part, "JPEG", 0, bodyTop, A4.w, ((y1 - y0) * A4.w) / canvas.width);
    if (headImg) pdf.addImage(headImg, "JPEG", A4.side, A4.headTop, headW, headH);
    // 바닥글 — 양식과 같은 얇은 선 + 가운데 페이지 번호
    pdf.setDrawColor(0xc7, 0xd2, 0xe0);
    pdf.setLineWidth(0.2);
    pdf.line(A4.side, bodyBottom + A4.footGap, A4.w - A4.side, bodyBottom + A4.footGap);
    pdf.setTextColor(0x13, 0x29, 0x4b);
    pdf.setFontSize(7);
    pdf.text(`- ${i + 1} / ${cuts.length} -`, A4.w / 2, bodyBottom + A4.footGap + 4, { align: "center" });
  }
  return pdf.output("blob");
}

// 끊어도 되는 지점 = 문단과 표 행의 아래 경계 (캔버스 좌표).
// 사진이나 글줄 한가운데가 아니라 요소와 요소 사이에서만 페이지를 나누기 위한 것.
function breakPoints(body: HTMLElement, scale: number): number[] {
  const top = body.getBoundingClientRect().top;
  const pts: number[] = [];
  body.querySelectorAll("article > *, tr").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) pts.push(Math.round((r.bottom - top) * scale));
  });
  return Array.from(new Set(pts)).sort((a, b) => a - b);
}

// 페이지를 어디서 끊을지 고른다 — 한 쪽에 들어가는 범위에서 가장 아래쪽 경계.
// 쓸 만한 경계가 없으면(사진 한 장이 한 쪽보다 큰 경우 등) 그냥 높이로 자른다.
function pageCuts(totalH: number, pageH: number, breaks: number[]): [number, number][] {
  const cuts: [number, number][] = [];
  let y = 0;
  while (y < totalH) {
    const target = y + Math.floor(pageH);
    if (target >= totalH) {
      cuts.push([y, totalH]);
      break;
    }
    // 페이지를 너무 조금만 채우고 넘기지 않도록 아래쪽 30% 지점 이후의 경계만 쓴다
    const usable = breaks.filter((p) => p > y + pageH * 0.3 && p <= target);
    const end = usable.length ? usable[usable.length - 1] : target;
    cuts.push([y, end]);
    y = end;
  }
  return cuts.length ? cuts : [[0, totalH]];
}

function sliceCanvas(src: HTMLCanvasElement, y0: number, y1: number): string {
  const part = document.createElement("canvas");
  part.width = src.width;
  part.height = Math.max(1, y1 - y0);
  const ctx = part.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(src, 0, -y0);
  }
  return part.toDataURL("image/jpeg", 0.92);
}

// 폰(터치 기기)으로 판단되면 공유창, 그 외(PC)는 다운로드
function isMobileDevice(): boolean {
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  return navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches;
}

// 범용: 폰이면 공유창(카톡·메일 첨부), PC면 다운로드. PDF·워드·PPT 등 모든 파일에 사용.
export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  mime: string,
  shareText?: string
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (isMobileDevice() && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text: shareText });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "shared";
      // 그 외 오류는 아래 다운로드로 폴백
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return "downloaded";
}

export async function shareOrDownloadPdf(blob: Blob, filename: string, shareText?: string): Promise<"shared" | "downloaded"> {
  return shareOrDownloadFile(blob, filename, "application/pdf", shareText);
}

// 페이지마다 방향이 다른 문서(월간 보고서) — 각 페이지 element 의 data-landscape="1" 이면 가로 A4
export async function pagesToPdfBlob(el: HTMLElement, selector: string): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const { default: jsPDF } = await import("jspdf");
  await waitForImages(el);
  const pages = Array.from(el.querySelectorAll<HTMLElement>(selector));
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const page of pages) {
    const landscape = page.dataset.landscape === "1";
    const orientation = landscape ? "landscape" : "portrait";
    const [w, h] = landscape ? [297, 210] : [210, 297];
    const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
    if (!pdf) pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    else pdf.addPage("a4", orientation);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h);
  }
  if (!pdf) throw new Error("페이지 없음");
  return pdf.output("blob");
}
