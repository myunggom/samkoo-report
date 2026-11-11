"use client";

// 화면에서 만든 표를 워드 표(OOXML)로 바꾼다.
//
// 왜 이렇게 하나
//   워드 양식(docx)의 표는 열 개수가 미리 박혀 있다. docxtemplater 로는 행만 늘릴 수 있고
//   열은 못 늘린다. 사장이 표마다 열을 다르게 쓰고 싶어 하므로, 표 전체를 XML 로 직접 짜서
//   양식 안에 통째로 끼워 넣는다({@tablesXml} 자리).
//
// 서식은 tools/report_docx_templates.py 가 쓰는 양식 값과 같게 맞췄다.
//   테두리 C7D2E0 / 머리글 칸 EDF2F9 / 글꼴 맑은 고딕 / 본문 폭 9918dxa

import type { ReportTable } from "@/lib/reports";
import { normalizeTable, tableHasContent } from "@/lib/reports";

const TABLE_W = 9918; // 본문 폭(dxa) — 양식의 데이터표와 같은 폭
const BORDER = "C7D2E0";
const HEAD_FILL = "EDF2F9";
const FONT = "맑은 고딕";

function esc(t: string): string {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // 워드가 거부하는 제어문자를 뺀다
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const rPr = (bold: boolean, sz = 18) =>
  `<w:rPr><w:rFonts w:ascii="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}"/>${bold ? "<w:b/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;

/** 칸 안의 문단들. 줄바꿈(엔터)은 문단을 나눈다. */
function cellParas(text: string, bold: boolean, align: "left" | "center"): string {
  const lines = String(text ?? "").split(/\r?\n/);
  const jc = align === "center" ? '<w:jc w:val="center"/>' : "";
  return lines
    .map((line) => {
      const run = line === "" ? "" : `<w:r>${rPr(bold)}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`;
      return `<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>${jc}</w:pPr>${run}</w:p>`;
    })
    .join("");
}

function tc(text: string, w: number, head: boolean): string {
  const shd = head ? `<w:shd w:val="clear" w:color="auto" w:fill="${HEAD_FILL}"/>` : "";
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}` +
    `<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>` +
    `<w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>` +
    `<w:vAlign w:val="center"/></w:tcPr>` +
    cellParas(text, head, head ? "center" : "left") +
    `</w:tc>`
  );
}

/** 열 너비 비율 → dxa. 합이 정확히 본문 폭이 되도록 마지막 열에서 맞춘다. */
function widthsToDxa(widths: number[]): number[] {
  const safe = widths.map((w) => (w > 0 ? w : 1));
  const sum = safe.reduce((a, b) => a + b, 0) || 1;
  const out = safe.map((w) => Math.max(400, Math.round((w / sum) * TABLE_W)));
  const diff = TABLE_W - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += diff;
  return out;
}

/** 맨 끝의 빈 줄은 문서에 넣지 않는다 (화면에서 남겨 둔 여분 칸). 가운데 빈 줄은 그대로 둔다. */
function trimTrailingBlank(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 1 && rows[end - 1].every((c) => (c || "").trim() === "")) end -= 1;
  return rows.slice(0, end);
}

/** 표 하나 → <w:tbl> XML */
export function tableToXml(raw: ReportTable): string {
  const base = normalizeTable(raw);
  const t = { ...base, rows: trimTrailingBlank(base.rows) };
  const cols = widthsToDxa(t.widths);
  const grid = cols.map((w) => `<w:gridCol w:w="${w}"/>`).join("");

  const tblPr =
    `<w:tblPr><w:tblW w:w="${TABLE_W}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${BORDER}"/>`)
      .join("") +
    `</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr>`;

  const rows = t.rows
    .map((r, ri) => {
      const head = t.header && ri === 0;
      // 머리글 줄은 쪽이 넘어가도 새 쪽 맨 위에 다시 나오게 한다
      const trPr = `<w:trPr><w:cantSplit/>${head ? "<w:tblHeader/>" : ""}</w:trPr>`;
      return `<w:tr>${trPr}${r.map((v, ci) => tc(v, cols[ci], head)).join("")}</w:tr>`;
    })
    .join("");

  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

/** 표 이름(캡션) 한 줄 */
function captionXml(text: string): string {
  if (!text.trim()) return "";
  return (
    `<w:p><w:pPr><w:spacing w:before="80" w:after="40"/></w:pPr>` +
    `<w:r>${rPr(true, 18)}<w:t xml:space="preserve">${esc(text.trim())}</w:t></w:r></w:p>`
  );
}

/**
 * 표와 표 사이(그리고 표 뒤)에 넣는 아주 얇은 빈 문단.
 *
 * 왜 꼭 있어야 하나
 *   워드는 표와 표가 맞붙어 있으면 둘을 한 표로 합쳐 버린다. 뒤에 양식의 표가
 *   이어질 때도 마찬가지다. 그래서 반드시 문단을 하나 끼워 둬야 한다.
 *   다만 보통 빈 줄을 넣으면 한 줄만큼 밀려 문서가 다음 쪽으로 넘어가므로,
 *   높이를 2pt 로 눌러 자리만 차지하게 한다.
 */
const THIN_P =
  '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="40" w:lineRule="exact"/>' +
  '<w:rPr><w:sz w:val="4"/><w:szCs w:val="4"/></w:rPr></w:pPr></w:p>';

/**
 * 표 여러 개 → 양식에 끼워 넣을 XML 한 덩어리.
 * 빈 표는 건너뛴다. 표가 하나도 없으면 빈 문자열(= 아무것도 안 들어감).
 */
export function tablesToXml(tables: ReportTable[] | undefined): string {
  const list = (tables || []).filter(tableHasContent);
  if (!list.length) return "";
  return list.map((t) => captionXml(t.caption) + tableToXml(t) + THIN_P).join("");
}
