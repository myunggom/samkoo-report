"use client";

// 생성된 워드(.docx)를 화면에 렌더한 뒤 그대로 PDF로 변환 — "워드 파일을 먼저 만들고 PDF로 출력".
// docx-preview로 오프스크린 렌더 → html2canvas 기반 elementToPdfBlobFlow로 A4 PDF.

export async function docxBlobToPdfBlob(blob: Blob): Promise<Blob> {
  const docx = await import("docx-preview");
  const { elementToPdfBlobFlow } = await import("@/lib/pdf");

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
      breakPages: false,
      useBase64URL: true, // 이미지 base64 → html2canvas 오염 방지
      experimental: true,
    });
    // 이미지·폰트 렌더 대기
    await new Promise((r) => setTimeout(r, 250));
    return await elementToPdfBlobFlow(container, { orientation: "portrait" });
  } finally {
    container.remove();
  }
}
