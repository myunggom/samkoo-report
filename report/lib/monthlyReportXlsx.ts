// 월간 보고서 → 원래 엑셀 양식 「[월간보고서] 바이오 이노베이션 허브_YYYY.MM.xlsx」.
// 양식은 예전에 쓰던 그 달 엑셀 한 부(Blob templates/monthly-report/ — 실명·사진이 있어 공개 저장소에는 두지 않는다).
// zip 안의 시트 XML 에서 칸 글자·숫자만 바꾸고 사진만 갈아 끼운다 — 차트·인쇄 설정·서식·수식은 그대로 두고,
// 열 때 엑셀이 다시 계산하게(fullCalcOnLoad) 한다. 날짜 칸은 표지!Q2(전월 1일) 하나에서 수식으로 따라온다.
//
// 칸 배치는 2026.09 양식 실측:
//   표지 Q1 연초·Q2 전월, 27~33행 D 당월·H 차월(COVER_SLOTS 순), B5 사진
//   1-1 6·7행 교육 1건, 1-2 칸 안 사진 B10·D10·G10·G17 + 설명 B24·D24·G24
//   2-1 C17~C21 증감분석 / 2-2~2-6 C~N 6행 작년·7행 올해 사용량, 31·32행 요금, N16·N41 특이사항
//   3-1 D6 평면도 사진 / 3-2 6~19행 연락처 / 4-1 5행부터 실적 / 4-2 공종 제목 칸 기준 세트 12개
//   5-1 5행부터 계획 / 5-2 9행부터 근무자(7·8행 본사 지원 인원은 양식 그대로), J~AN 날짜
// 사람 사진이 들어간 1-3 조직도·3-1 층별 표는 웹에 칸이 없어 양식 그대로 둔다 (Q4 날짜만 바꿈).

import PizZip from "pizzip";
import { excelSerial } from "./dailyLogXlsx.ts";
import { COVER_SLOTS, ENERGY, TRADES, addMonths, daysIn, scheduleRow } from "./monthlyReport.ts";
import type { MonthlyReport, Photo } from "./monthlyReport.ts";

/** 사진 한 장 — 브라우저가 받아 aspect(가로/세로, 알면)에 맞춰 흰 여백으로 맞춘 뒤 돌려준다 */
export type LoadImage = (url: string, aspect: number | null) => Promise<{ bytes: Uint8Array; ext: "png" | "jpeg" } | null>;
export type XlsxResult = { bytes: Uint8Array; notes: string[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colNum = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number): string => (n <= 0 ? "" : colName(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));
const ref = (col: number, row: number) => `${colName(col)}${row}`;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type Sheet = { name: string; path: string; xml: string; covered: Set<string> };

function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) seg === ".." ? parts.pop() : parts.push(seg);
  return parts.join("/");
}
const relsPath = (p: string) => p.replace(/([^/]+)$/, "_rels/$1.rels");

/** 병합 칸 중 왼쪽 위가 아닌 칸 — 여기에 쓰면 엑셀이 무시하거나 깨지므로 건너뛴다 */
function coveredCells(xml: string): Set<string> {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
    const [c1, r1, c2, r2] = [colNum(m[1]), +m[2], colNum(m[3]), +m[4]];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) out.add(ref(c, r));
  }
  return out;
}

class Book {
  zip: PizZip;
  sheets = new Map<string, Sheet>();
  shared: string[];
  notes: string[] = [];
  private media = 0;

  constructor(bytes: ArrayBuffer | Uint8Array) {
    this.zip = new PizZip(bytes);
    const rels = this.rels("xl/workbook.xml");
    for (const m of this.text("xl/workbook.xml").matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
      const path = rels.get(m[2]);
      if (!path) continue;
      const xml = this.text(path);
      this.sheets.set(unesc(m[1]), { name: unesc(m[1]), path, xml, covered: coveredCells(xml) });
    }
    this.shared = [...this.text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }
  text(p: string) { return this.zip.file(p)?.asText() ?? ""; }
  /** 관계 파일 rId → 대상 경로 (zip 기준) */
  rels(part: string): Map<string, string> {
    return new Map([...this.text(relsPath(part)).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/ Id="([^"]+)"/)![1], resolve(part, m[0].match(/ Target="([^"]+)"/)![1])]));
  }
  /** 관계 하나 추가하고 rId 를 돌려준다 */
  addRel(part: string, type: string, target: string): string {
    const p = relsPath(part);
    const x = this.text(p);
    const ids = [...x.matchAll(/ Id="rId(\d+)"/g)].map((m) => +m[1]);
    const id = `rId${Math.max(0, ...ids) + 1}`;
    this.zip.file(p, x.replace("</Relationships>", `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`));
    return id;
  }
  /** 새 그림 파일을 넣고 파일 이름을 돌려준다 */
  addMedia(img: { bytes: Uint8Array; ext: string }): string {
    const name = `mr${++this.media}.${img.ext}`;
    this.zip.file(`xl/media/${name}`, img.bytes);
    const ct = this.text("[Content_Types].xml");
    if (!new RegExp(`Extension="${img.ext}"`, "i").test(ct))
      this.zip.file("[Content_Types].xml", ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="${img.ext}" ContentType="image/${img.ext}"/>`));
    return name;
  }
  sheet(prefix: string): Sheet {
    const s = [...this.sheets.values()].find((x) => x.name === prefix || x.name.startsWith(prefix + " "));
    if (!s) throw new Error(`엑셀 양식에 「${prefix}」 시트가 없습니다`);
    return s;
  }
  /** 칸에 값 — 없으면 그 줄에 새로 넣고, null·"" 이면 비운다(서식 s 는 둔다). 병합에 가려진 칸은 건너뛴다 */
  set(sh: Sheet, r: string, value: string | number | null | undefined) {
    if (sh.covered.has(r)) return;
    const empty = value === null || value === undefined || value === "";
    const re = new RegExp(`<c r="${r}"((?: [a-z]+="[^"]*")*?)(?:/>|>[\\s\\S]*?</c>)`);
    const body = (a: string) => {
      a = a.replace(/ (t|vm|cm)="[^"]*"/g, "");
      if (empty) return `<c r="${r}"${a}/>`;
      return typeof value === "number" ? `<c r="${r}"${a}><v>${value}</v></c>` : `<c r="${r}"${a} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
    };
    const m = sh.xml.match(re);
    if (m) { sh.xml = sh.xml.replace(re, body(m[1])); return; }
    if (empty) return;
    const [, col, row] = r.match(/^([A-Z]+)(\d+)$/)!;
    const rowRe = new RegExp(`(<row r="${row}"[^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
    const rm = sh.xml.match(rowRe);
    if (!rm) { this.notes.push(`${sh.name} ${r}: 양식에 그 줄이 없어 비워 둠`); return; }
    const cells = rm[2] ?? "";
    const after = [...cells.matchAll(/<c r="([A-Z]+)\d+"[\s\S]*?(?:\/>|<\/c>)/g)].find((p) => colNum(p[1]) > colNum(col));
    const cell = body("");
    sh.xml = sh.xml.replace(rowRe, `${rm[1]}>${after ? cells.replace(after[0], cell + after[0]) : cells + cell}</row>`);
  }
  /** 칸 글자 (공유 문자열·인라인) */
  textAt(sh: Sheet, r: string): string {
    const m = sh.xml.match(new RegExp(`<c r="${r}"((?: [a-z]+="[^"]*")*?)>([\\s\\S]*?)</c>`));
    if (!m) return "";
    const v = m[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (/ t="s"/.test(m[1]) && v !== undefined) return this.shared[+v] ?? "";
    return unesc(m[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? v ?? "");
  }

  // ── 사진 ───────────────────────────────────────────────
  private drawingOf(sh: Sheet): string | null {
    for (const [, p] of this.rels(sh.path)) if (/drawings\/drawing\d+\.xml$/.test(p)) return p;
    return null;
  }
  /** 칸 위에 얹은 그림 중 왼쪽 위가 (col,row) 인 것 */
  private anchorAt(dp: string, col: number, row: number): string | null {
    for (const m of this.text(dp).matchAll(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
      const a = m[0];
      if (!a.includes("<xdr:pic>")) continue;
      const c = +(a.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? -1), r = +(a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? -1);
      if (c === col - 1 && r === row - 1) return a;
    }
    return null;
  }
  /** 칸 안에 넣은 그림(셀 그림, vm) — 그 칸의 리치 값 번호 */
  private richIndex(sh: Sheet, r: string): number | null {
    const vm = sh.xml.match(new RegExp(`<c r="${r}"[^>]*? vm="(\\d+)"`))?.[1];
    if (!vm) return null;
    const meta = this.text("xl/metadata.xml");
    const types = [...meta.matchAll(/<metadataType name="([^"]+)"/g)].map((m) => m[1]);
    const vbk = [...(meta.match(/<valueMetadata[\s\S]*?<\/valueMetadata>/)?.[0] ?? "").matchAll(/<bk>([\s\S]*?)<\/bk>/g)][+vm - 1]?.[1] ?? "";
    const rc = vbk.match(/<rc t="(\d+)" v="(\d+)"/);
    if (!rc || types[+rc[1] - 1] !== "XLRICHVALUE") return null;
    const fut = meta.match(/<futureMetadata name="XLRICHVALUE"[\s\S]*?<\/futureMetadata>/)?.[0] ?? "";
    const rvb = [...fut.matchAll(/<bk>([\s\S]*?)<\/bk>/g)][+rc[2]]?.[1].match(/rvb i="(\d+)"/)?.[1];
    return rvb === undefined ? null : +rvb;
  }

  /** (col,row) 자리 사진을 바꾼다. url 이 없으면 그 사진을 지운다. 그 자리에 사진이 없으면 false */
  async photo(sh: Sheet, col: number, row: number, url: string | undefined, load: LoadImage): Promise<boolean> {
    const dp = this.drawingOf(sh);
    const anchor = dp ? this.anchorAt(dp, col, row) : null;
    if (anchor && dp) {
      if (!url) { this.zip.file(dp, this.text(dp).replace(anchor, "")); return true; }
      const ext = anchor.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      const img = await load(url, ext ? +ext[1] / +ext[2] : null);
      if (!img) { this.notes.push(`${sh.name} ${ref(col, row)}: 사진을 받지 못해 양식 사진 그대로`); return true; }
      const id = this.addRel(dp, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", `../media/${this.addMedia(img)}`);
      this.zip.file(dp, this.text(dp).replace(anchor, anchor.replace(/r:embed="[^"]+"/, `r:embed="${id}"`)));
      return true;
    }
    const r = ref(col, row), i = this.richIndex(sh, r);
    if (i === null) return url && dp ? this.insertPhoto(sh, dp, col, row, url, load) : false;
    if (!url) { this.set(sh, r, null); return true; }
    const img = await load(url, null);
    if (!img) { this.notes.push(`${sh.name} ${r}: 사진을 받지 못해 양식 사진 그대로`); return true; }
    // 새 그림을 리치 값 관계 목록 끝에 붙이고, 그 칸의 리치 값이 새 번호를 가리키게 한다 (칸·메타데이터는 그대로)
    const rvRel = "xl/richData/richValueRel.xml";
    const id = this.addRel(rvRel, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", `../media/${this.addMedia(img)}`);
    const relXml = this.text(rvRel);
    const n = [...relXml.matchAll(/<rel /g)].length;
    this.zip.file(rvRel, relXml.replace("</richValueRels>", `<rel r:id="${id}"/></richValueRels>`));
    const rvp = "xl/richData/rdrichvalue.xml";
    let k = -1;
    this.zip.file(rvp, this.text(rvp).replace(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g, (all, inner: string) => (++k === i ? all.replace(inner, inner.replace(/<v>\d+<\/v>/, `<v>${n}</v>`)) : all)));
    return true;
  }

  /** 양식에 사진이 없던 칸(예: 지난달 비어 있던 공종) — 그 칸 크기에 꼭 맞는 그림을 새로 얹는다 */
  private async insertPhoto(sh: Sheet, dp: string, col: number, row: number, url: string, load: LoadImage): Promise<boolean> {
    const widths = [...sh.xml.matchAll(/<col min="(\d+)" max="(\d+)"[^>]*? width="([\d.]+)"/g)];
    const w = +(widths.find((m) => +m[1] <= col && col <= +m[2])?.[3] ?? 8.43);
    const ht = +(sh.xml.match(new RegExp(`<row r="${row}"[^>]*? ht="([\\d.]+)"`))?.[1] ?? sh.xml.match(/defaultRowHeight="([\d.]+)"/)?.[1] ?? 15);
    const cx = Math.trunc(w * 7 + 5) * 9525, cy = Math.round(ht * 12700); // 열 너비(글자)→픽셀→EMU, 행 높이(pt)→EMU
    const img = await load(url, cx / cy);
    if (!img) { this.notes.push(`${sh.name} ${ref(col, row)}: 사진을 받지 못했습니다`); return true; }
    const rid = this.addRel(dp, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", `../media/${this.addMedia(img)}`);
    const x = this.text(dp);
    const id = Math.max(0, ...[...x.matchAll(/<xdr:cNvPr id="(\d+)"/g)].map((m) => +m[1])) + 1;
    const pos = (c: number, r: number) => `<xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
    const anchor = `<xdr:twoCellAnchor><xdr:from>${pos(col - 1, row - 1)}</xdr:from><xdr:to>${pos(col, row)}</xdr:to>` +
      `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="그림 ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
    this.zip.file(dp, x.replace("</xdr:wsDr>", anchor + "</xdr:wsDr>"));
    return true;
  }

  save(): Uint8Array {
    for (const s of this.sheets.values()) this.zip.file(s.path, s.xml);
    // 바꿔 끼워서 더는 아무도 가리키지 않는 옛 사진은 뺀다 (안 빼면 파일이 두 배로 커진다)
    const used = new Set<string>();
    for (const f of this.zip.file(/_rels\/[^/]+\.rels$/)) {
      const part = f.name.replace(/_rels\/([^/]+)\.rels$/, "$1");
      for (const m of f.asText().matchAll(/<Relationship\b[^>]*>/g)) {
        const id = m[0].match(/ Id="([^"]+)"/)?.[1], t = m[0].match(/ Target="([^"]+)"/)?.[1];
        if (!t || /TargetMode="External"/.test(m[0])) continue;
        // 그림 관계는 실제로 쓰는 것만 — 사진을 바꾸면 옛 rId 는 관계 파일에 남지만 그림·리치 값은 새 rId 를 가리킨다
        if (/\/image"/.test(m[0]) && id && !this.text(part).includes(`"${id}"`)) continue;
        used.add(resolve(part, t));
      }
    }
    for (const f of this.zip.file(/^xl\/media\//)) if (!used.has(f.name)) this.zip.remove(f.name);
    // 값으로 바꾼 수식 칸이 계산 순서표(calcChain)에 남아 있으면 엑셀이 「복구」를 띄운다 — 지우면 열 때 다시 만든다
    this.zip.remove("xl/calcChain.xml");
    this.zip.file("[Content_Types].xml", this.text("[Content_Types].xml").replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""));
    this.zip.file("xl/_rels/workbook.xml.rels", this.text("xl/_rels/workbook.xml.rels").replace(/<Relationship [^>]*calcChain[^>]*\/>/, ""));
    const wb = this.text("xl/workbook.xml");
    this.zip.file("xl/workbook.xml", /<calcPr\b/.test(wb)
      ? wb.replace(/<calcPr([^>]*?)\s*\/>/, (_, a: string) => `<calcPr${a.replace(/ fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`)
      : wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>'));
    return this.zip.generate({ type: "uint8array", compression: "DEFLATE" });
  }
}

const serial = (month: string) => excelSerial(`${month}-01`);

/** 그 달 월간 보고서를 엑셀 양식에 채운다 */
export async function fillMonthlyXlsx(template: ArrayBuffer | Uint8Array, m: MonthlyReport, load: LoadImage): Promise<XlsxResult> {
  const b = new Book(template);
  const prev = addMonths(m.month, -1), next = addMonths(m.month, 1);
  const cap = (what: string, have: number, room: number) => have > room && b.notes.push(`${what} ${have}건 중 양식 칸(${room}건)까지만 넣었습니다`);

  // 표지 — Q2(전월 1일)에서 보고월·차월·근무표 날짜가 수식으로 따라온다
  const cover = b.sheet("표지");
  b.set(cover, "Q1", serial(`${prev.slice(0, 4)}-01`));
  b.set(cover, "Q2", serial(prev));
  COVER_SLOTS.forEach((k, i) => { b.set(cover, `D${27 + i}`, m.cover[k]?.now ?? ""); b.set(cover, `H${27 + i}`, m.cover[k]?.next ?? ""); });
  if (m.coverImage) await b.photo(cover, 2, 5, m.coverImage, load);

  // 1-1 교육 실시 내역 (한 건이 두 줄, 피교육생은 줄마다), 1-2 사진
  const edu = b.sheet("1-1, 1-2");
  cap("교육 실시 내역", m.education.rows.length, 1);
  const e = m.education.rows[0];
  const tr = (e?.trainees ?? "").split("\n");
  b.set(edu, "B6", e?.name ?? ""); b.set(edu, "C6", e?.org ?? "");
  b.set(edu, "E6", tr[0] ?? ""); b.set(edu, "E7", tr.slice(1).join("\n"));
  // 일자가 보고월 1일이면 양식 수식(=EDATE(표지!Q2,1))을 그대로 둔다
  if (e?.date !== `${m.month}-01`) b.set(edu, "F6", e?.date && isDate(e.date) ? excelSerial(e.date) : e?.date ?? "");
  b.set(edu, "H6", e?.place ?? ""); b.set(edu, "I6", e?.note ?? "");
  const ph: Photo[] = m.education.photos;
  for (const [i, [c, r]] of ([[2, 10], [4, 10], [7, 10], [7, 17]] as const).entries()) await b.photo(edu, c, r, ph[i]?.url, load);
  b.set(edu, "B24", ph[0]?.caption ?? ""); b.set(edu, "D24", ph[1]?.caption ?? "");
  b.set(edu, "G24", [ph[2]?.caption, ph[3]?.caption].filter(Boolean).join(" 및 "));

  // 1-3 조직도 — 날짜만
  b.set(b.sheet("1-3"), "Q4", serial(m.month));

  // 2-1 증감분석, 2-2~2-6 사용량·요금
  const costs = b.sheet("2-1");
  ENERGY.forEach((x, i) => b.set(costs, `C${17 + i}`, m.costNotes[x.key] ?? ""));
  for (const x of ENERGY) {
    const sh = b.sheet(x.no), en = m.energy[x.key];
    const row = (r: number, arr: (number | null)[] | undefined) => { for (let i = 0; i < 12; i++) b.set(sh, ref(3 + i, r), arr?.[i] ?? null); };
    row(6, en?.prevUsage); row(7, en?.usage); row(31, en?.prevCost); row(32, en?.cost);
    b.set(sh, "N16", en?.usageNote ?? ""); b.set(sh, "N41", en?.costNote ?? "");
  }

  // 3-1 평면도 사진, 3-2 연락처
  if (m.tenantsImage) await b.photo(b.sheet("3-1"), 4, 6, m.tenantsImage, load);
  const con = b.sheet("3-2");
  cap("고객사 연락처", m.contacts.length, 14);
  for (let i = 0; i < 14; i++) {
    const x = m.contacts[i], r = 6 + i;
    b.set(con, `B${r}`, x?.tenant ?? ""); b.set(con, `C${r}`, x?.floor && /^\d+$/.test(x.floor) ? +x.floor : x?.floor ?? "");
    b.set(con, `D${r}`, x?.person ?? ""); b.set(con, `E${r}`, x?.tel ?? ""); b.set(con, `F${r}`, x?.mobile ?? "");
    b.set(con, `G${r}`, x?.count ?? ""); b.set(con, `H${r}`, x?.note ?? "");
  }

  // 4-1 시설관리 실적 — 구분(병합 칸)은 양식 그대로, 줄 수가 다르면 알린다
  const fac = b.sheet("4-1");
  const facRows = [...fac.xml.matchAll(/<row r="(\d+)"/g)].map((x) => +x[1]).filter((r) => r >= 5 && b.textAt(fac, `D${r}`));
  if (facRows.length !== m.facility.length) b.notes.push(`시설관리 실적이 ${m.facility.length}줄인데 양식은 ${facRows.length}줄입니다 — 구분 칸 병합이 어긋날 수 있으니 엑셀에서 확인하세요`);
  const facLast = facRows.at(-1) ?? 4;
  for (let i = 0; i < Math.max(facRows.length, m.facility.length); i++) {
    const r = facRows[i] ?? facLast + 1 + i - facRows.length, x = m.facility[i];
    b.set(fac, `D${r}`, x?.content ?? "");
    // 진행상황 칸에 ○ 대신 「미운영」처럼 글을 적어 둔 줄은 그 글을 살린다
    (["완료", "진행중", "계획중"] as const).forEach((st, j) => {
      const c = ref(5 + j, r);
      if (x?.status !== st) b.set(fac, c, "");
      else if (!b.textAt(fac, c)) b.set(fac, c, "○");
    });
    b.set(fac, `H${r}`, x?.note ?? "");
  }

  // 4-2 작업 사진 — 「업무현황 - 공종」 제목 칸에서 세 줄 아래부터 두 줄 간격으로 6줄 × 좌우 2세트
  const pic = b.sheet("4-2");
  const titles = [...pic.xml.matchAll(/<c r="([A-Z]+)(\d+)"/g)].map((x) => ({ col: colNum(x[1]), row: +x[2], t: b.textAt(pic, x[1] + x[2]).replace(/\s+/g, "") }));
  for (const t of TRADES) {
    const at = titles.find((x) => x.t.endsWith(`업무현황-${t}`));
    if (!at) { b.notes.push(`작업 사진 「${t}」 칸을 양식에서 찾지 못했습니다`); continue; }
    const sets = m.photos[t] ?? [];
    for (let i = 0; i < 12; i++) {
      const r = at.row + 3 + 2 * (i >> 1), c = at.col + (i & 1) * 5, s = sets[i];
      await b.photo(pic, c, r, s?.a, load); await b.photo(pic, c + 1, r, s?.b, load);
      b.set(pic, ref(c + 2, r), s?.name ?? "");
    }
  }

  // 5-1 차월 주요업무 계획 — 작업 구분(병합 칸)은 양식 그대로
  const plan = b.sheet("5-1");
  const planRows = [...plan.xml.matchAll(/<row r="(\d+)"/g)].map((x) => +x[1]).filter((r) => r >= 5 && b.textAt(plan, `C${r}`));
  if (planRows.length !== m.nextPlan.length) b.notes.push(`차월 계획이 ${m.nextPlan.length}줄인데 양식은 ${planRows.length}줄입니다 — 작업 구분 병합이 어긋날 수 있으니 엑셀에서 확인하세요`);
  const planLast = planRows.at(-1) ?? 4;
  for (let i = 0; i < Math.max(planRows.length, m.nextPlan.length); i++) {
    const r = planRows[i] ?? planLast + 1 + i - planRows.length, x = m.nextPlan[i];
    b.set(plan, `C${r}`, x?.content ?? ""); b.set(plan, `D${r}`, x?.when ?? ""); b.set(plan, `E${r}`, x?.note ?? "");
  }

  // 5-2 차월 근무표 — 9행부터 웹 근무자(11칸), 7·8행 본사 지원 인원은 이름 그대로 평일 근무로
  const sch = b.sheet("5-2"), days = daysIn(next);
  cap("근무자", m.staff.length, 11);
  const fill = (r: number, row: string[]) => { for (let d = 0; d < 31; d++) b.set(sch, ref(10 + d, r), row[d]?.trim() ?? ""); };
  for (const r of [7, 8]) {
    const name = b.textAt(sch, `F${r}`);
    if (name) fill(r, scheduleRow({ group: "", dept: "", title: "", to: 1, name }, next, m.holidays, m.overrides[name]));
  }
  for (let i = 0; i < 11; i++) {
    const s = m.staff[i], r = 9 + i;
    b.set(sch, `D${r}`, s?.title ?? ""); b.set(sch, `E${r}`, s ? s.to : null); b.set(sch, `F${r}`, s?.name ?? "");
    b.set(sch, `G${r}`, s?.ext ?? ""); b.set(sch, `H${r}`, s?.phone ?? ""); b.set(sch, `I${r}`, s?.start && isDate(s.start) ? excelSerial(s.start) : s?.start ?? "");
    fill(r, s ? scheduleRow(s, next, m.holidays, m.overrides[s.name]) : []);
  }
  // 31일이 안 되는 달은 남는 날짜 칸(다음 달 1일…)을 비운다
  for (let d = days.length; d < 31; d++) { b.set(sch, ref(10 + d, 5), null); b.set(sch, ref(10 + d, 6), null); }
  b.set(sch, "B24", m.scheduleNote ? ` ${m.scheduleNote.trim()} ` : "");

  return { bytes: b.save(), notes: b.notes };
}
