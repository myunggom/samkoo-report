// 일일 업무일지 → 예전 엑셀과 같은 월별 파일(날짜마다 시트 "09.29").
// 양식은 public/daily-log-template.xlsx — 예전 엑셀 시트 한 장에서 값만 비운 것(서식·병합·인쇄 설정 그대로).
// 시트 XML 의 빈 칸(<c r="C11" s="72"/>)에 값만 넣으므로 서식은 손대지 않는다.
// 숫자는 웹이 계산한 값을 그대로 넣는다(예전처럼 전날 시트를 잇는 수식은 쓰지 않는다).

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

export function setCell(xml: string, ref: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return xml;
  const re = new RegExp(`<c r="${ref}"((?: [a-z]+="[^"]*")*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(re);
  if (!m) throw new Error(`양식에 ${ref} 칸이 없습니다`);
  const attrs = m[1].replace(/ t="[^"]*"/, "");
  const cell = typeof value === "number"
    ? `<c r="${ref}"${attrs}><v>${value}</v></c>`
    : `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  return xml.replace(re, cell);
}

export function fillSheet(tpl: string, logs: DailyLog[], log: DailyLog): string {
  let x = tpl;
  const set = (ref: string, v: string | number | null | undefined) => (x = setCell(x, ref, v));
  set("L2", excelSerial(log.date));

  const p = log.people;
  if (p) {
    const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
    "CDEF".split("").forEach((col, i) => { set(`${col}4`, p.to[i] ?? 0); set(`${col}5`, p.actual[i] ?? 0); });
    set("G4", sum(p.to)); set("G5", sum(p.actual)); set("C6", sum(p.actual));
    set("I4", p.off); set("J4", sum(p.to) - sum(p.actual)); set("K4", p.leave); set("L4", p.note);
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

  meterRows(logs, log.date).forEach((m, i) => {
    const r = METER_ROW0 + i;
    set(`E${r}`, m.prev); set(`G${r}`, m.today); set(`I${r}`, m.usage); set(`K${r}`, m.month);
  });
  return x;
}

// month "2026-09" 의 일지마다 시트 하나. 반환은 .xlsx 바이트
export function buildMonthXlsx(template: ArrayBuffer | Uint8Array, logs: DailyLog[], month: string): Uint8Array {
  const days = logs.filter((l) => l.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) throw new Error("이 달 업무일지가 없습니다");
  const zip = new PizZip(template);
  const read = (p: string) => zip.file(p)!.asText();
  const tpl = read("xl/worksheets/sheet1.xml");
  const names = days.map((l) => `${l.date.slice(5, 7)}.${l.date.slice(8, 10)}`);

  zip.remove("xl/worksheets/sheet1.xml");
  days.forEach((l, i) => {
    let sheet = fillSheet(tpl, logs, l);
    if (i > 0) sheet = sheet.replace(/ tabSelected="1"/, "");
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheet);
  });

  zip.file("xl/workbook.xml", read("xl/workbook.xml").replace(/<sheets>[\s\S]*?<\/sheets>/,
    `<sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rIdS${i + 1}"/>`).join("")}</sheets>`));
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
