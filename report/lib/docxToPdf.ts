"use client";

// 생성된 워드(.docx)를 화면에 렌더한 뒤 그대로 PDF로 변환 — "워드 파일을 먼저 만들고 PDF로 출력".
// docx-preview로 오프스크린 렌더 → html2canvas 기반 docxElementToPdfBlob으로 A4 PDF.
//
// 머리글은 따로 떼어 PDF 페이지마다 얹는다. 양식 머리글에는 본문 뒤에 깔리는 큰 배경
// 워터마크가 들어 있는데, docx-preview는 그것을 본문 흐름 안에 넣어 버려서 그대로 두면
// 첫 장 위쪽이 통째로 빈 공간이 된다.

export async function docxBlobToPdfBlob(blob: Blob): Promise<Blob> {
  const docx = await import("docx-preview");
  const { docxElementToPdfBlob } = await import("@/lib/pdf");

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
      renderHeaders: true, // 머리글은 아래에서 본문과 분리해 따로 쓴다
      renderFooters: false, // 바닥글(페이지 번호)은 PDF 쪽에서 페이지마다 다시 그린다
      useBase64URL: true, // 이미지 base64 → html2canvas 오염 방지
      experimental: true,
    });
    // 이미지·폰트 렌더 대기
    await new Promise((r) => setTimeout(r, 250));

    const section = container.querySelector<HTMLElement>("section.docxpv") ?? container;
    const header = extractHeader(section, container);
    // 위아래 여백은 PDF에서 직접 잡는다 (머리글·바닥글 자리를 확보해야 하므로)
    section.style.paddingTop = "0";
    section.style.paddingBottom = "0";

    return await docxElementToPdfBlob(section, header);
  } finally {
    container.remove();
  }
}

// 머리글을 본문에서 떼어내 캡처용으로 따로 세워 둔다.
// 배경 워터마크(절대 배치 요소)는 지운다 — 본문 위에 겹쳐 찍히면 글씨를 가린다.
function extractHeader(section: HTMLElement, container: HTMLElement): HTMLElement | null {
  const header = section.querySelector<HTMLElement>("header");
  if (!header) return null;

  const cs = getComputedStyle(section);
  const inner = section.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");

  // 워터마크 지우기. docx-preview는 "떠 있는" 그림을 크기 0짜리 칸에 넣고 그 안의
  // 그림만 키운다 — 칸은 0이어도 그림이 자리를 차지해 머리글이 15cm까지 늘어난다.
  header.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (getComputedStyle(el).position === "absolute") el.remove();
  });
  header.querySelectorAll<HTMLElement>("div").forEach((el) => {
    if (el.offsetWidth === 0 && el.querySelector("img")) el.remove();
  });

  header.remove();
  header.style.margin = "0";
  header.style.minHeight = "0";
  header.style.position = "static";
  if (inner > 0) header.style.width = `${inner}px`;
  container.appendChild(header);
  return header;
}
