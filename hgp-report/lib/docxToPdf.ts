"use client";

// 생성된 워드(.docx)를 화면에 렌더한 뒤 그대로 PDF로 변환 — "워드 파일을 먼저 만들고 PDF로 출력".
//
// docx-preview로 오프스크린 렌더 → 페이지마다 워드와 같은 모양으로 합성:
//  · 머리글(로고)·배경 워터마크·바닥글(- n / N -)을 매 페이지에 그림
//  · 본문은 표 "행 사이"에서만 페이지를 나눔(행이 잘리지 않음). 소제목 행은 다음 행과 붙여 넘김.
//  · 한 행이 한 페이지보다 길면 어쩔 수 없이 그 안에서 자름.
//  · 양식의 강제 페이지 나눔(풍수해 2쪽 등)은 그대로 유지.

const PX_PER_TWIP = 96 / 1440;
const PX_PER_EMU = 96 / 914400;
const SCALE = 2; // 캡처 배율(선명도)
const NAVY = "rgb(19, 41, 75)";

type Rect = { top: number; bottom: number };

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

// 워드 문서 설정(여백·머리글 위치·워터마크 위치)을 docx에서 직접 읽음
type PageSetup = {
  pageW: number; pageH: number;
  top: number; bottom: number; left: number;
  header: number; footer: number;
  watermark?: { x: number; y: number; w: number; h: number };
};
async function readPageSetup(blob: Blob): Promise<PageSetup> {
  const setup: PageSetup = { pageW: 794, pageH: 1123, top: 72, bottom: 72, left: 72, header: 48, footer: 48 };
  try {
    const { default: PizZip } = await import("pizzip");
    const zip = new PizZip(await blob.arrayBuffer());
    const doc = zip.file("word/document.xml")?.asText() ?? "";
    const num = (re: RegExp, s: string) => {
      const m = s.match(re);
      return m ? Number(m[1]) : NaN;
    };
    const sz = doc.match(/<w:pgSz[^>]*>/)?.[0] ?? "";
    const mar = doc.match(/<w:pgMar[^>]*>/)?.[0] ?? "";
    const w = num(/w:w="(\d+)"/, sz), h = num(/w:h="(\d+)"/, sz);
    if (w && h) { setup.pageW = w * PX_PER_TWIP; setup.pageH = h * PX_PER_TWIP; }
    const g = (k: string) => num(new RegExp(`w:${k}="(\\d+)"`), mar);
    if (!isNaN(g("top"))) setup.top = g("top") * PX_PER_TWIP;
    if (!isNaN(g("bottom"))) setup.bottom = g("bottom") * PX_PER_TWIP;
    if (!isNaN(g("left"))) setup.left = g("left") * PX_PER_TWIP;
    if (!isNaN(g("header"))) setup.header = g("header") * PX_PER_TWIP;
    if (!isNaN(g("footer"))) setup.footer = g("footer") * PX_PER_TWIP;
    // 머리글의 페이지 기준 뒤쪽 그림 = 워터마크
    for (const name of Object.keys(zip.files)) {
      if (!/^word\/header\d*\.xml$/.test(name)) continue;
      const x = zip.file(name)!.asText();
      const anchor = x.match(/<wp:anchor[^>]*behindDoc="1"[\s\S]*?<\/wp:anchor>/)?.[0];
      if (!anchor) continue;
      const px = anchor.match(/<wp:positionH relativeFrom="page"><wp:posOffset>(-?\d+)/);
      const py = anchor.match(/<wp:positionV relativeFrom="page"><wp:posOffset>(-?\d+)/);
      const ext = anchor.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
      if (px && py && ext) {
        setup.watermark = {
          x: Number(px[1]) * PX_PER_EMU, y: Number(py[1]) * PX_PER_EMU,
          w: Number(ext[1]) * PX_PER_EMU, h: Number(ext[2]) * PX_PER_EMU,
        };
      }
    }
  } catch {
    /* 기본값 사용 */
  }
  return setup;
}

function isEmptyPara(el: Element): boolean {
  return el.tagName === "P" && !(el.textContent || "").trim() && !el.querySelector("img, svg, table");
}
function firstCellIsNavy(tr: Element | null | undefined): boolean {
  const td = tr?.querySelector("td");
  return !!td && getComputedStyle(td).backgroundColor === NAVY;
}
function directRows(table: Element): HTMLTableRowElement[] {
  return Array.from((table as HTMLTableElement).rows);
}

// 페이지를 나눠도 되는 위치(본문 기준 y) 목록
function breakCandidates(article: HTMLElement): { cuts: number[]; skips: Rect[] } {
  const base = article.getBoundingClientRect().top;
  const kids = Array.from(article.children) as HTMLElement[];
  const cuts: number[] = [];
  const skips: Rect[] = []; // 페이지 맨 위에 오면 건너뛸 빈 문단
  let noCutUntilTable = false;

  kids.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const bottom = r.bottom - base;
    if (isEmptyPara(el)) skips.push({ top: r.top - base, bottom });

    if (el.tagName === "TABLE") {
      noCutUntilTable = false;
      const rows = directRows(el);
      rows.forEach((tr, ri) => {
        if (ri === rows.length - 1) return; // 표 끝은 아래에서 처리
        if (ri === 0 && firstCellIsNavy(tr)) return; // 소제목(번호) 행 뒤에서는 자르지 않음
        if (ri === 1 && firstCellIsNavy(tr)) return; // 표 머리(시각·구분…) 뒤도 X
        // 낮은 제목 행 바로 뒤에 큰 행(사진칸 등)이 오면 붙여서 넘김 (예: 풍수해 "1층 풍수해 점검")
        const h = tr.getBoundingClientRect().height;
        const nh = rows[ri + 1].getBoundingClientRect().height;
        if (h < 40 && nh > h * 3) return;
        cuts.push(tr.getBoundingClientRect().bottom - base);
      });
      // 한 줄짜리 소제목 표(예: 6 첨부)는 다음 표와 붙여서 넘김
      const next = kids.slice(i + 1).find((k) => !isEmptyPara(k));
      if (rows.length === 1 && firstCellIsNavy(rows[0]) && next?.tagName === "TABLE") {
        noCutUntilTable = true;
        return;
      }
    }
    if (noCutUntilTable) return;
    cuts.push(bottom);
  });
  return { cuts: Array.from(new Set(cuts.map((c) => Math.round(c)))).sort((a, b) => a - b), skips };
}

function paginate(total: number, avail: number, cuts: number[], skips: Rect[]): [number, number][] {
  const pages: [number, number][] = [];
  let start = 0;
  const skipEmpty = (y: number) => {
    let moved = true;
    while (moved) {
      moved = false;
      for (const s of skips) {
        if (Math.abs(s.top - y) <= 2 && s.bottom > y) {
          y = s.bottom;
          moved = true;
        }
      }
    }
    return y;
  };
  while (start < total - 1) {
    const limit = start + avail;
    if (limit >= total) {
      pages.push([start, total]);
      break;
    }
    const fit = cuts.filter((c) => c > start + 20 && c <= limit);
    const end = fit.length ? fit[fit.length - 1] : limit; // 들어갈 자리가 없으면 강제 절단
    pages.push([start, end]);
    start = skipEmpty(end);
  }
  return pages;
}

async function capture(el: HTMLElement, transparent: boolean): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas-pro");
  return html2canvas(el, { scale: SCALE, useCORS: true, backgroundColor: transparent ? null : "#ffffff", logging: false });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export async function docxBlobToPdfBlob(blob: Blob): Promise<Blob> {
  const docx = await import("docx-preview");
  const { default: jsPDF } = await import("jspdf");
  const setup = await readPageSetup(blob);

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-99999px",
    top: "0",
    background: "#ffffff",
  } as CSSStyleDeclaration);
  document.body.appendChild(container);

  try {
    await docx.renderAsync(blob, container, undefined, {
      className: "docxpv",
      inWrapper: false, // 페이지 배경/그림자 없이 본문만
      ignoreWidth: false,
      ignoreHeight: true, // 높이 제한 없이 연속 렌더
      breakPages: true, // 양식의 강제 페이지 나눔만 section으로 분리
      ignoreLastRenderedPageBreak: true,
      useBase64URL: true, // 이미지 base64 → html2canvas 오염 방지
      experimental: true,
    });
    await waitForImages(container);
    await new Promise((r) => setTimeout(r, 250));
    // html2canvas가 밑줄을 그리지 않음 → 같은 색 아래 테두리로 대체(서명 문구 밑줄 등)
    container.querySelectorAll<HTMLElement>("span").forEach((s) => {
      if (/underline/.test(s.style.textDecoration)) {
        s.style.textDecoration = "none";
        s.style.display = "inline-block";
        s.style.borderBottom = "1px solid currentColor";
        s.style.lineHeight = "1.25";
      }
    });

    const pdf = new jsPDF({ orientation: setup.pageW > setup.pageH ? "landscape" : "portrait", unit: "px", format: [setup.pageW, setup.pageH], hotfixes: ["px_scaling"] });
    const sections = Array.from(container.querySelectorAll<HTMLElement>("section.docxpv"));
    type PageJob = { art: HTMLCanvasElement; y0: number; y1: number; header?: HTMLCanvasElement; wm?: HTMLImageElement | null; hasFooter: boolean };
    const jobs: PageJob[] = [];

    for (const sec of sections) {
      const header = sec.querySelector<HTMLElement>(":scope > header");
      const footer = sec.querySelector<HTMLElement>(":scope > footer");
      const article = sec.querySelector<HTMLElement>(":scope > article") ?? sec;

      // 워터마크 이미지: 머리글 안 큰 그림(페이지 기준 배치) → 떼어내 직접 그림
      let wm: HTMLImageElement | null = null;
      if (header && setup.watermark) {
        const big = Array.from(header.querySelectorAll("img")).find((im) => im.naturalHeight > 300 || parseFloat(im.style.height) > 200);
        if (big) {
          wm = await loadImage(big.src);
          (big.parentElement ?? big).style.display = "none";
        }
      }
      const headerCanvas = header && header.offsetHeight > 0 ? await capture(header, true) : undefined;
      if (footer) footer.style.display = "none";
      if (header) header.style.display = "none";

      const contentTop = Math.max(setup.top, header ? setup.header + header.offsetHeight + 4 : setup.top);
      const avail = setup.pageH - setup.bottom - contentTop;
      const { cuts, skips } = breakCandidates(article);
      // 끝의 빈 문단은 제외(빈 마지막 페이지 방지)
      const artTop = article.getBoundingClientRect().top;
      const filled = Array.from(article.children).filter((k) => !isEmptyPara(k));
      const total = filled.length
        ? Math.ceil(Math.max(...filled.map((k) => k.getBoundingClientRect().bottom)) - artTop) + 2
        : article.scrollHeight;
      const art = await capture(article, true);
      for (const [y0, y1] of paginate(total, avail, cuts, skips)) {
        jobs.push({ art, y0, y1, header: headerCanvas, wm, hasFooter: !!footer });
      }
    }

    const W = setup.pageW, H = setup.pageH;
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      const page = document.createElement("canvas");
      page.width = Math.round(W * SCALE);
      page.height = Math.round(H * SCALE);
      const ctx = page.getContext("2d")!;
      ctx.scale(SCALE, SCALE);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      if (j.wm && setup.watermark) {
        const m = setup.watermark;
        ctx.drawImage(j.wm, m.x, m.y, m.w, m.h);
      }
      const artW = j.art.width / SCALE;
      const hdrH = j.header ? j.header.height / SCALE : 0;
      if (j.header) ctx.drawImage(j.header, setup.left, setup.header, j.header.width / SCALE, hdrH);
      const contentTop = Math.max(setup.top, j.header ? setup.header + hdrH + 4 : setup.top);
      const h = j.y1 - j.y0;
      ctx.drawImage(j.art, 0, j.y0 * SCALE, j.art.width, h * SCALE, setup.left, contentTop, artW, h);
      if (j.hasFooter) {
        // 바닥글: 윗선 + 가운데 "- n / N -" (원본 양식과 동일 색)
        const y = H - setup.footer - 14;
        ctx.strokeStyle = "#C7D2E0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(setup.left, y);
        ctx.lineTo(setup.left + artW, y);
        ctx.stroke();
        ctx.fillStyle = "#13294B";
        ctx.font = "9.5px 'Malgun Gothic', 'Noto Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`- ${i + 1} / ${jobs.length} -`, setup.left + artW / 2, y + 4);
      }
      if (i > 0) pdf.addPage([W, H], W > H ? "landscape" : "portrait");
      pdf.addImage(page.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
    }
    return pdf.output("blob");
  } finally {
    container.remove();
  }
}
