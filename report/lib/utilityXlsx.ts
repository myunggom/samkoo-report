// 수도광열비 회입분 엑셀 채우기 — 지난달 회입분(양식)을 받아 「값만」 바꾼다.
// openpyxl·exceljs 처럼 통째로 다시 쓰면 인쇄 설정(printerSettings)·시트 관계가 사라진다(인수인계 7장 실측).
// 여기서는 zip 안의 시트 XML 에서 해당 칸 글자만 고치고 나머지 파일은 그대로 둔다 — 일일업무일지 엑셀과 같은 방식.
// 수식은 그대로 두고, 열 때 엑셀이 다시 계산하게(fullCalcOnLoad) 한다.

import PizZip from "pizzip";
import { excelSerial, setCell } from "./dailyLogXlsx.ts";
import { applyFixes } from "./utility.ts";
import type { Feed, Fix, Group, Kind, Meter, TplMeter } from "./utility.ts";

type Sheet = { path: string; xml: string };
export type Book = { zip: PizZip; sheets: Map<string, Sheet>; shared: string[] };

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(x?)([\da-f]+);/gi, (_, x: string, n: string) => String.fromCodePoint(parseInt(n, x ? 16 : 10))).replace(/&amp;/g, "&");

export function openBook(bytes: ArrayBuffer | Uint8Array): Book {
  const zip = new PizZip(bytes);
  const read = (p: string) => zip.file(p)?.asText() ?? "";
  // 속성 순서는 만든 프로그램마다 다르다 (엑셀은 Id 먼저, openpyxl 은 Target 먼저)
  const rels = new Map([...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/ Id="([^"]+)"/)?.[1], m[0].match(/ Target="([^"]+)"/)?.[1] ?? ""]));
  const sheets = new Map<string, Sheet>();
  for (const m of read("xl/workbook.xml").matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const t = rels.get(m[2]) ?? "";
    const path = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
    sheets.set(unesc(m[1]), { path, xml: read(path) });
  }
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  return { zip, sheets, shared };
}

type CellInfo = { ref: string; col: number; row: number; formula: boolean; text?: string; num?: number };
const colNum = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

/** 시트의 칸 전부 — 글자(공유 문자열 포함)·숫자·수식 여부 */
export function cells(book: Book, sheet: string): CellInfo[] {
  const xml = book.sheets.get(sheet)?.xml ?? "";
  const out: CellInfo[] = [];
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const body = m[4] ?? "", t = m[3].match(/ t="([^"]+)"/)?.[1];
    const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    const info: CellInfo = { ref: m[1] + m[2], col: colNum(m[1]), row: +m[2], formula: body.includes("<f") };
    if (t === "s" && v !== undefined) info.text = book.shared[+v];
    else if (t === "inlineStr") info.text = unesc(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "");
    else if (t === "str") info.text = unesc(v ?? "");
    else if (v !== undefined && v !== "") info.num = Number(v);
    out.push(info);
  }
  return out;
}

// ── 회입분마다 원격검침 DB 칸 (인수인계 4.3) ──────────────────────────────
type DbCols = { start: string; end: string; group: Group };
export const DB_SHEETS: Record<Kind, { sheet: string; cols: DbCols[] }[]> = {
  전기: [{ sheet: "원격검침 DB", cols: [{ start: "G", end: "H", group: "전기" }] }],
  열: [{ sheet: "원격검침 DB", cols: [{ start: "F", end: "G", group: "냉난방" }] }],
  수도: [
    { sheet: "수도 원격검침 DB", cols: [{ start: "F", end: "G", group: "수도" }] },
    { sheet: "온수 원격검침 DB", cols: [{ start: "F", end: "G", group: "온수" }, { start: "I", end: "J", group: "환탕" }] },
  ],
  중수: [{ sheet: "원격검침 DB", cols: [{ start: "F", end: "G", group: "수도" }] }],
};

/** 원격검침 DB 첫 번째 표(B열 NO)의 계량기 줄 — 두 번째 표는 다른 열이고 전부 수식이라 건드리지 않는다 */
function dbRows(book: Book, sheet: string): { row: number; no: number; name: string; tag: string }[] {
  const cs = cells(book, sheet);
  const head = cs.find((c) => c.col === 2 && c.text?.trim() === "NO");
  if (!head) return [];
  const at = (col: number, row: number) => cs.find((c) => c.col === col && c.row === row);
  const out: { row: number; no: number; name: string; tag: string }[] = [];
  for (const c of cs.filter((x) => x.col === 2 && x.row > head.row)) {
    const n = c.num ?? (c.text && /^\d+$/.test(c.text.trim()) ? +c.text : NaN);
    if (!Number.isFinite(n)) continue;
    out.push({ row: c.row, no: n, name: (at(4, c.row)?.text ?? "").trim(), tag: (at(5, c.row)?.text ?? "").trim() });
  }
  return out;
}

export function templateMeters(book: Book, kind: Kind): TplMeter[] {
  return dbRows(book, DB_SHEETS[kind][0].sheet).map(({ no, name, tag }) => ({ no, name, tag }));
}

/** 이 회입분이 어느 항목인지 — 시트 이름으로 */
export function bookKind(book: Book): Kind | null {
  const names = [...book.sheets.keys()];
  if (book.sheets.has("수도 원격검침 DB")) return "수도";
  if (book.sheets.has("공용부 사용량")) return "전기";
  if (names.some((n) => n.includes("열사용량"))) return "열";
  if (names.some((n) => n.includes("중수사용량"))) return "중수";
  return null;
}

// ── 고지서 입력 칸 ──────────────────────────────────────────────────
export type BillField = { key: string; label: string; last: number; date: boolean };

/** 손으로 받아 적는 칸 — 고지서 시트 C~K 열 / 작성방법 I열 이후의 「수식이 아닌 숫자」 칸. 이름은 같은 줄 왼쪽·같은 열 위쪽 글자에서 */
export function billFields(book: Book): BillField[] {
  const out: BillField[] = [];
  for (const [sheet, minCol, maxCol] of [["고지서", 3, 11], ["작성방법", 9, 30]] as const) {
    const cs = cells(book, sheet);
    const text = (col: number, row: number) => cs.find((c) => c.col === col && c.row === row && c.text && !c.formula)?.text?.trim();
    for (const c of cs) {
      if (c.formula || c.num === undefined || c.col < minCol || c.col > maxCol) continue;
      // 왼쪽 이름표는 입력 영역 안에서만 (작성방법은 I열부터 — B열의 긴 안내문을 집지 않게)
      const from = sheet === "작성방법" ? minCol : 2;
      const left = Array.from({ length: c.col - from }, (_, i) => text(c.col - 1 - i, c.row)).filter(Boolean).slice(0, 2).reverse() as string[];
      let up: string | undefined;
      for (let r = c.row - 1; r >= Math.max(1, c.row - 8) && !up; r--) up = text(c.col, r);
      const label = [...left, up].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ").replace(/\s+/g, " ") || c.ref;
      out.push({ key: `${sheet}!${c.ref}`, label, last: c.num, date: /일자|납부일/.test(label) && c.num > 30000 }); // 엑셀 날짜 일련번호
    }
  }
  return out;
}

/** 지난달 「당월지침」이 이번 달 「전월지침」이 된다 — 그 칸들의 기본값 */
export function carryOver(fields: BillField[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fields) {
    if (!f.label.includes("전월지침")) continue;
    // 같은 줄 오른쪽에 가장 가까운 당월지침(열 고지서 E16→F16, H16→I16), 없으면 같은 열의 당월지침(수도 K19→K17)
    const [sh, ref] = f.key.split("!");
    const [, col, row] = ref.match(/^([A-Z]+)(\d+)$/)!;
    const pos = (k: string) => k.split("!")[1].match(/^([A-Z]+)(\d+)$/)!;
    const cand = fields.filter((g) => g.key !== f.key && g.key.startsWith(sh + "!") && g.label.includes("당월지침"));
    const twin = cand.filter((g) => pos(g.key)[2] === row && colNum(pos(g.key)[1]) > colNum(col)).sort((a, b) => colNum(pos(a.key)[1]) - colNum(pos(b.key)[1]))[0]
      ?? cand.find((g) => pos(g.key)[1] === col);
    if (twin) out[f.key] = twin.last;
  }
  return out;
}

// ── 채우기 ─────────────────────────────────────────────────────────
/** 칸이 있으면 값만 바꾸고, 없으면 그 줄 안 알맞은 자리에 새로 넣는다 */
function upsertCell(xml: string, ref: string, value: number | string): string {
  if (new RegExp(`<c r="${ref}"[ >/]`).test(xml)) return setCell(xml, ref, value);
  const [, col, row] = ref.match(/^([A-Z]+)(\d+)$/)!;
  const cell = typeof value === "number" ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`;
  const rowRe = new RegExp(`(<row r="${row}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const m = xml.match(rowRe);
  if (!m) return xml; // 그 줄 자체가 없으면 건드리지 않는다
  const parts = [...m[2].matchAll(/<c r="([A-Z]+)\d+"[\s\S]*?(?:\/>|<\/c>)/g)];
  const after = parts.find((p) => colNum(p[1]) > colNum(col));
  const body = after ? m[2].replace(after[0], cell + after[0]) : m[2] + cell;
  return xml.replace(rowRe, `$1${body}$3`);
}

/** 칸의 값만 지운다 (서식 s 는 둔다) */
function clearCell(xml: string, ref: string): string {
  return xml.replace(new RegExp(`<c r="${ref}"((?: [a-z]+="[^"]*")*?)(?:/>|>[\s\S]*?</c>)`), (_, a: string) => `<c r="${ref}"${a.replace(/ t="[^"]*"/, "")}/>`);
}

export type FillResult = { bytes: Uint8Array; filled: number; missing: string[]; applied: string[] };

/**
 * 회입분 하나를 이번 달로 채운다.
 *  - 작성방법!B7 = 사용월 1일 (기간·납부일 수식이 이 한 칸에서 나온다)
 *  - 원격검침 DB 전월·당월검침 = 검침자료 시작·종료지침 (보정표 적용, NO 로 짝맞춤)
 *  - 고지서·작성방법 입력 칸 = 화면에 넣은 값 (안 넣은 칸은 지난달 값 그대로)
 */
export function fillBook(template: ArrayBuffer | Uint8Array, kind: Kind, month: string, feed: Feed, fixes: Fix[], inputs: Record<string, number | string>, opts: { blankMeters?: boolean } = {}): FillResult {
  const book = openBook(template);
  const { meters, applied } = applyFixes(kind, feed.meters, fixes);
  const byNo = new Map<number, Meter>(meters.map((m) => [m.no, m]));
  const edit = (sheet: string, fn: (xml: string) => string) => {
    const s = book.sheets.get(sheet);
    if (!s) throw new Error(`회입분에 「${sheet}」 시트가 없습니다`);
    s.xml = fn(s.xml);
  };
  let filled = 0;
  const missing: string[] = [];

  edit("작성방법", (x) => upsertCell(x, "B7", excelSerial(`${month}-01`)));
  for (const { sheet, cols } of DB_SHEETS[kind]) {
    const rows = dbRows(book, sheet);
    edit(sheet, (x) => {
      for (const r of rows) {
        const m = byNo.get(r.no);
        if (!m) { missing.push(`${sheet} ${r.no}. ${r.name}`); continue; }
        for (const c of cols) {
          const v = m.g[c.group];
          if (opts.blankMeters) { x = clearCell(clearCell(x, `${c.start}${r.row}`), `${c.end}${r.row}`); continue; } // 면적지분율로 배분하는 달 — 검침칸을 비운다
          if (!v) continue;
          x = upsertCell(upsertCell(x, `${c.start}${r.row}`, v.s), `${c.end}${r.row}`, v.e);
          filled += 2;
        }
      }
      return x;
    });
  }
  for (const [key, val] of Object.entries(inputs)) {
    const [sheet, ref] = key.split("!");
    if (val === "" || val === null || val === undefined) continue;
    const v = typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val) ? excelSerial(val) : val;
    edit(sheet, (x) => upsertCell(x, ref, v));
  }

  return { bytes: save(book), filled, missing, applied };
}

/** 고친 시트를 zip 에 다시 넣고, 열 때 엑셀이 수식을 다시 계산하게 한다 */
function save(book: Book): Uint8Array {
  for (const s of book.sheets.values()) book.zip.file(s.path, s.xml);
  const wb = book.zip.file("xl/workbook.xml")!.asText();
  book.zip.file("xl/workbook.xml", /<calcPr\b/.test(wb)
    ? wb.replace(/<calcPr([^>]*?)\s*\/>/, (_, a: string) => `<calcPr${a.replace(/ fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`)
    : wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>'));
  return book.zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

// ── 종합표 ─────────────────────────────────────────────────────────
// 종합표 값은 회입분 「각 사 … 사용량 및 요금」 시트의 계산 결과(수천 개 수식)라 브라우저에서 다시 계산할 수 없다.
// 그래서 엑셀에서 한 번 열어 저장한 회입분(엑셀이 계산해 둔 값이 들어 있음)을 받아 그 값을 옮긴다.
// 엑셀은 저장할 때 fullCalcOnLoad 를 지우므로, 이 표시가 남아 있으면 아직 엑셀에서 저장하지 않은 파일이다.
const yymmdd = (d: string) => d.slice(2).replace(/-/g, ".");
type Line = { row: number; label: string; d?: number; e?: number };

/** C열에 항목명이 있는 줄들 (기본요금·전력기금·전용부·공용부·합계) */
function lines(cs: CellInfo[], from = 0, to = Infinity): Line[] {
  const byRow = new Map<number, Line>();
  for (const c of cs) if (c.row >= from && c.row < to && c.col === 3 && c.text) byRow.set(c.row, { row: c.row, label: c.text.trim() });
  for (const c of cs) {
    const l = byRow.get(c.row);
    if (l && c.num !== undefined && (c.col === 4 || c.col === 5)) l[c.col === 4 ? "d" : "e"] = c.num;
  }
  return [...byRow.values()].sort((a, b) => a.row - b.row);
}

export type SummaryResult = { bytes: Uint8Array; notes: string[] };

/**
 * 종합표를 이번 달로 채운다.
 *  - 항목마다 사용량(D)·요금(E) = 회입분 「각 사」 시트의 같은 순서 줄 (항목명이 같은지 확인)
 *  - 고지서 요금(G) = 회입분 총합계 G − 차이 H (H 가 "총합계 − 고지서 금액" 수식)
 *  - 기간(H) = 그 항목 고지서 기간
 * 종합표 구역은 요금 머리글(전기요금·냉난방요금…)이 회입분 「각 사」 시트 머리글과 같은 것으로 짝짓는다.
 */
export function fillSummary(template: ArrayBuffer | Uint8Array, saved: (ArrayBuffer | Uint8Array)[], month: string, period: (k: Kind) => { from: string; to: string }): SummaryResult {
  const book = openBook(template);
  const [name, sheet] = [...book.sheets.entries()][0];
  const cs = cells(book, name);
  const starts = cs.filter((c) => c.col === 8 && c.text && /^\d{2}\.\d{2}\.\d{2}\s*~/.test(c.text)).map((c) => c.row).sort((a, b) => a - b);
  if (!starts.length) throw new Error("종합표 양식에서 기간 칸(H열 yy.mm.dd ~ yy.mm.dd)을 찾지 못했습니다");
  const head = (rows: CellInfo[], from: number) => rows.find((c) => c.col === 5 && c.row > from && c.text)?.text?.trim();
  const notes: string[] = [];
  const done = new Set<Kind>();
  let x = sheet.xml;

  for (const bytes of saved) {
    const src = openBook(bytes);
    const kind = bookKind(src);
    if (!kind) { notes.push("회입분이 아닌 파일이 있어 건너뛰었습니다"); continue; }
    if (/fullCalcOnLoad="(1|true)"/.test(src.zip.file("xl/workbook.xml")?.asText() ?? "")) throw new Error(`${kind} 회입분이 아직 엑셀에서 저장되지 않았습니다 — 엑셀로 열어 Ctrl+S 로 저장한 뒤 올려 주세요`);
    const b7 = cells(src, "작성방법").find((c) => c.ref === "B7")?.num;
    if (b7 !== excelSerial(`${month}-01`)) throw new Error(`${kind} 회입분이 ${month} 사용분이 아닙니다 (작성방법!B7)`);
    const each = [...src.sheets.keys()].find((n) => n.startsWith("각 사"));
    if (!each) throw new Error(`${kind} 회입분에 「각 사 … 사용량 및 요금」 시트가 없습니다`);
    const ec = cells(src, each);
    const i = starts.findIndex((r) => head(cs, r) === head(ec, 0));
    if (i < 0) throw new Error(`종합표에서 ${kind} 구역(머리글 「${head(ec, 0)}」)을 찾지 못했습니다`);
    const from = starts[i], to = starts[i + 1] ?? Infinity;
    const dst = lines(cs, from, to), srcLines = lines(ec);
    if (dst.length !== srcLines.length || dst.some((l, j) => l.label !== srcLines[j].label))
      throw new Error(`${kind}: 종합표와 회입분 「${each}」의 항목 줄이 맞지 않습니다 (${dst.length}줄 / ${srcLines.length}줄)`);
    dst.forEach((l, j) => {
      const s = srcLines[j];
      if (s.d !== undefined) x = upsertCell(x, `D${l.row}`, s.d);
      if (s.e !== undefined) x = upsertCell(x, `E${l.row}`, s.e);
    });
    // 총합계 줄: G = 세 회사 합, H = G − 고지서 금액
    const totRow = ec.find((c) => c.col === 2 && c.text && /총\s*합계/.test(c.text))?.row;
    const g = ec.find((c) => c.row === totRow && c.col === 7)?.num, h = ec.find((c) => c.row === totRow && c.col === 8)?.num;
    const billCell = cs.find((c) => c.row >= from && c.row < to && c.col === 7 && !c.formula && c.num !== undefined);
    if (g !== undefined && h !== undefined && billCell) {
      const bill = Math.round(g - h);
      x = upsertCell(x, billCell.ref, bill);
      notes.push(`${kind}: 고지서 ${bill.toLocaleString("ko-KR")}원 (세 회사 합과 차이 ${h.toFixed(1)}원)`);
    } else notes.push(`${kind}: 고지서 금액 칸을 찾지 못해 지난달 값 그대로입니다`);
    const p = period(kind);
    x = upsertCell(x, `H${from}`, `${yymmdd(p.from)} ~ ${yymmdd(p.to)}`);
    done.add(kind);
  }
  const left = (["전기", "열", "수도", "중수"] as Kind[]).filter((k) => !done.has(k));
  if (left.length) notes.push(`${left.join("·")} 회입분이 없어 그 구역은 지난달 값 그대로입니다`);
  sheet.xml = x;
  return { bytes: save(book), notes };
}

/** 파일 이름의 사용월을 바꾼다 — "…_2026.08월.xlsx" → "…_2026.09월.xlsx" */
export const renameForMonth = (name: string, month: string) => name.replace(/\d{4}\.\d{2}월/, `${month.replace("-", ".")}월`);
