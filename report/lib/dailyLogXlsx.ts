// 일일 업무일지 → 예전 엑셀과 같은 월별 파일(날짜마다 시트 "09.29").
// 양식은 public/daily-log-template.xlsx — 예전 엑셀 시트 한 장에서 값만 비운 것(서식·병합·인쇄 설정 그대로).
// 시트 XML 의 빈 칸(<c r="C11" s="72"/>)에 값만 넣으므로 서식은 손대지 않는다.
// 계산 칸은 예전 엑셀과 같은 수식(사용량 =(G30-E30)*3600, 월 누계 ='전날시트'!K30+I30 …)을 넣는다 —
// 상사가 전날 시트를 따라가며 확인하는 방식이라. 입력값(인원·지침)만 웹 데이터로 채우고,
// 수식 칸에는 웹이 계산한 값을 캐시로 같이 넣어 재계산 전에도 숫자가 보이게 한다.

import PizZip from "pizzip";
import type { DailyLog } from "./dailyLog.ts";
import { meterRows, WORK_SLOTS } from "./dailyLog.ts";

// 구분 → 양식의 행 (금일 C, 명일 I, 비고 N, 두 번째 줄은 다음 행 C)
const WORK_ROW: Record<string, number> = { 민원: 9, 행정: 10, 전기: 11, 기계: 13, 소방: 15, 건축: 17, 보안: 19 };
const METER_ROW0 = 30; // METERS 순서대로 30~36행

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 엑셀 날짜 일련번호 (양식 L2 서식이 "Date : yyyy년 m월 d일[aaaa]")
export function excelSerial(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

// 양식의 한 칸(<c r="C11" s="72"/> 또는 <c ...>...</c>)을 서식(s)은 두고 내용만 바꾼다
function putCell(xml: string, ref: string, body: (attrs: string) => string): string {
  const re = new RegExp(`<c r="${ref}"((?: [a-z]+="[^"]*")*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(re);
  if (!m) throw new Error(`양식에 ${ref} 칸이 없습니다`);
  return xml.replace(re, body(m[1].replace(/ t="[^"]*"/, "")));
}

export function setCell(xml: string, ref: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return xml;
  return putCell(xml, ref, (a) => typeof value === "number"
    ? `<c r="${ref}"${a}><v>${value}</v></c>`
    : `<c r="${ref}"${a} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`);
}

// 수식 칸: <f> 에 수식, <v> 에 미리 계산한 값
export function setFormula(xml: string, ref: string, formula: string, cached: number | null): string {
  return putCell(xml, ref, (a) => `<c r="${ref}"${a}><f>${esc(formula)}</f>${cached === null ? "" : `<v>${cached}</v>`}</c>`);
}

// prevSheet: 같은 달 바로 앞 시트 이름("09.28"), 그 달 첫 시트면 null
export function fillSheet(tpl: string, logs: DailyLog[], log: DailyLog, prevSheet: string | null = null): string {
  let x = tpl;
  const set = (ref: string, v: string | number | null | undefined) => (x = setCell(x, ref, v));
  const fx = (ref: string, f: string, cached: number | null) => (x = setFormula(x, ref, f, cached));
  set("L2", excelSerial(log.date));

  const p = log.people;
  if (p) {
    const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
    "CDEF".split("").forEach((col, i) => { set(`${col}4`, p.to[i] ?? 0); set(`${col}5`, p.actual[i] ?? 0); });
    fx("G4", "SUM(C4:F4)", sum(p.to)); fx("G5", "SUM(C5:F5)", sum(p.actual)); fx("C6", "G5", sum(p.actual));
    set("I4", p.off); fx("J4", "G4-G5", sum(p.to) - sum(p.actual)); set("K4", p.leave); set("L4", p.note);
  }

  for (const s of WORK_SLOTS) {
    const e = log.work[s.key];
    if (!e) continue;
    const r = WORK_ROW[s.key];
    if (r) { set(`C${r}`, e.today); set(`I${r}`, e.plan); set(`N${r}`, e.note); set(`C${r + 1}`, e.extra); }
    else if (s.key === "미화공용") { set("D21", e.today); set("I21", e.plan); set("C23", e.extra); }
    else if (s.key === "미화전용") { set("D22", e.today); set("I22", e.plan); }
  }
  set("B26", log.special);

  const prev = prevSheet ? `'${prevSheet}'!` : null;
  meterRows(logs, log.date).forEach((m, i) => {
    const r = METER_ROW0 + i;
    set(`G${r}`, m.today);
    if (m.def.daily) {
      // 태양광: 전일 = 앞 시트 월 누계, 월 누계 = 그날 발전량 + 전일 (첫 시트는 원본처럼 =G31+I31)
      if (prev) fx(`E${r}`, `${prev}K${r}`, m.prev); else set(`E${r}`, m.prev);
      fx(`K${r}`, prev ? `G${r}+E${r}` : `G${r}+I${r}`, m.month);
      return;
    }
    set(`E${r}`, m.prev);
    // 지침이 빠진 날은 사용량 수식을 넣지 않는다(빈 칸이면 =(G-E) 가 음수가 됨) — 누계는 앞 시트 값 그대로
    if (m.usage !== null) fx(`I${r}`, m.def.factor ? `(G${r}-E${r})*${m.def.factor}` : `G${r}-E${r}`, m.usage);
    fx(`K${r}`, prev ? `${prev}K${r}+I${r}` : `I${r}`, m.month);
  });
  return x;
}

// 제출 파일 이름 (예전 엑셀과 같은 형식)
export const xlsxFileName = (date: string) => `[일일업무일지] 바이오 이노베이션 허브_${date.replace(/-/g, ".")}.xlsx`;

// date "2026-09-29" 기준: 그 달 1일부터 그날까지 일지마다 시트 하나, 그날 시트가 맨 뒤이고 열면 그 시트가 보인다.
export function buildDayXlsx(template: ArrayBuffer | Uint8Array, logs: DailyLog[], date: string): Uint8Array {
  const days = logs.filter((l) => l.date.startsWith(date.slice(0, 8)) && l.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  if (days.at(-1)?.date !== date) throw new Error("이 날 업무일지가 저장되어 있지 않습니다");
  const names = days.map((l) => `${l.date.slice(5, 7)}.${l.date.slice(8, 10)}`);
  return assembleWorkbook(template, (tpl) => days.map((l, i) => ({ name: names[i], xml: fillSheet(tpl, logs, l, i > 0 ? names[i - 1] : null) })), days.length - 1);
}

// 시트 한 장짜리 양식(xl/worksheets/sheet1.xml)을 여러 장으로 — 주간업무보고 엑셀도 같이 쓴다.
// active 번째 시트가 선택된 채로 열리고, 열 때 수식을 다시 계산한다.
export function assembleWorkbook(template: ArrayBuffer | Uint8Array, build: (sheetXml: string) => { name: string; xml: string }[], active: number): Uint8Array {
  const zip = new PizZip(template);
  const read = (p: string) => zip.file(p)!.asText();
  const sheets = build(read("xl/worksheets/sheet1.xml"));
  const names = sheets.map((s) => s.name);

  zip.remove("xl/worksheets/sheet1.xml");
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, i === active ? s.xml : s.xml.replace(/ tabSelected="1"/, "")));

  const wbXml = read("xl/workbook.xml").replace(/<sheets>[\s\S]*?<\/sheets>/,
    `<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rIdS${i + 1}"/>`).join("")}</sheets>`)
    .replace(/<workbookView( activeTab="\d+")?/, `<workbookView activeTab="${active}"`);
  // 양식에 <calcPr calcId=…/> 가 있다 — 거기에 fullCalcOnLoad 만 붙인다
  zip.file("xl/workbook.xml", wbXml.replace(/<calcPr([^>]*?)\s*\/>/, (_, a: string) => `<calcPr${a.replace(/ fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`));
  zip.file("xl/_rels/workbook.xml.rels", read("xl/_rels/workbook.xml.rels")
    .replace(/<Relationship [^>]*Target="worksheets\/sheet1\.xml"\/>/, names.map((_, i) =>
      `<Relationship Id="rIdS${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")));
  zip.file("[Content_Types].xml", read("[Content_Types].xml")
    .replace(/<Override PartName="\/xl\/worksheets\/sheet1\.xml"[^>]*\/>/, names.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")));
  zip.file("docProps/app.xml", read("docProps/app.xml")
    .replace(/<vt:i4>\d+<\/vt:i4>/, `<vt:i4>${names.length}</vt:i4>`)
    .replace(/<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/,
      `<TitlesOfParts><vt:vector size="${names.length}" baseType="lpstr">${names.map((n) => `<vt:lpstr>${n}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>`));

  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}
