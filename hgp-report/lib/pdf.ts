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
