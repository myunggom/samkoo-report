"use client";

// 촬영 완료보고서 PPT — PDF(ReportDocument.tsx)와 똑같은 모양의 양식(public/templates/shoot.pptx,
// scripts/build_shoot_pptx.py로 생성)을 채워 만든다.
//  · 1 표지 · 2 촬영 개요(회차 표 행 반복, 이번 회차 강조) · 3 구역 사진 · 4 특이사항
//  · 구역 사진 슬라이드는 PDF와 같게 "구역마다, 사진 8장마다" 한 장씩 → zip 단계에서 slide3을 복제하고
//    복제본마다 태그에 _i 접미사를 붙여 개별로 채운다 (docxtemplater 무료판은 슬라이드 복제를 못 함).
//  · 사진 설명은 PDF처럼 사진 아래쪽 반투명 띠로 사진에 합성한다.

import type { Photo, Report, ReportSection, Schedule } from "./types";
import { SECTION_LABELS, SECTION_ORDER } from "./types";
import { prettyDateTime, setupRange, shootPeriod, shootRange } from "./format";
import { proxied } from "@/lib/client";

const PER_PAGE = 8;
type Box = { w: number; h: number };
// 사진 크기(px) — build_shoot_pptx.py의 사진칸 안쪽 크기와 같아야 함
const SECTION_BOX: Box = { w: 258.8, h: 211.5 };
const SPECIAL_BOX: Box = { w: 334.4, h: 285.8 };
const COVER_BOX: Box = { w: 1123, h: 794 };
const EMU = 9525;

// 구역 슬라이드에서 복제본마다 달라지는 태그
const PER_SLIDE_TAGS = ["구역", "쪽", "비고", "noteOk", ...Array.from({ length: PER_PAGE }, (_, i) => `p${i + 1}`)];

// 사진 → 칸 크기로 cover-crop(2배 해상도) + 설명 띠(PDF: rgba(15,23,42,.72), 흰 글씨 11px)
async function normalizePhoto(url: string, box: Box, caption = ""): Promise<Uint8Array | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob()).catch(() => null);
    if (!bitmap) return null;
    const S = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(box.w * S);
    canvas.height = Math.round(box.h * S);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const ratio = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * ratio;
    const h = bitmap.height * ratio;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if (caption.trim()) {
      const barH = 22.5 * S;
      ctx.fillStyle = "rgba(15,23,42,0.72)";
      ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${11 * S}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
      ctx.textBaseline = "middle";
      let t = caption.trim();
      const maxW = canvas.width - 12 * S;
      while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
      if (t !== caption.trim()) t = t.slice(0, -1) + "…";
      ctx.fillText(t, 6 * S, canvas.height - barH / 2);
    }
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return out ? new Uint8Array(await out.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

function suffixTags(xml: string, i: number): string {
  let out = xml;
  for (const t of PER_SLIDE_TAGS) {
    for (const pre of ["", "%", "#", "/", "^"]) out = out.split(`{${pre}${t}}`).join(`{${pre}${t}_${i}}`);
  }
  return out;
}

// 구역 배지 폭을 글자 길이에 맞춤(PDF는 글자폭+좌우 14px), (1/2) 표시는 배지 오른쪽 8px
function fitBadge(xml: string, label: string): string {
  const textW = Array.from(label).reduce((n, ch) => n + (ch === " " ? 3.9 : /[\x21-\x7e]/.test(ch) ? 8 : 14.4), 0);
  const w = Math.round(textW + 28);
  const x = 28;
  const setExt = (name: string, fn: (off: string, ext: string) => string) =>
    xml.replace(new RegExp(`(<p:cNvPr[^>]*name="${name}"[\\s\\S]*?<a:off )([^/]*)/><a:ext ([^/]*)/>`), (_m, head, off, ext) => head + fn(off, ext));
  xml = setExt("BADGE", (off, ext) => `${off}/><a:ext ${ext.replace(/cx="\d+"/, `cx="${w * EMU}"`)}/>`);
  xml = setExt("BADGE_PART", (off, ext) => `${off.replace(/x="\d+"/, `x="${(x + w + 8) * EMU}"`)}/><a:ext ${ext}/>`);
  return xml;
}

interface ZipLike {
  file(name: string): { asText(): string } | null;
  file(name: string, content: string): unknown;
}

// slide3(구역 사진)을 페이지 수만큼: 첫 장은 slide3 재사용, 나머지는 slide101.. 추가 후 slide3 바로 뒤에 배치
function expandSectionSlides(zip: ZipLike, labels: string[]): void {
  const n = labels.length;
  const BASE = "ppt/slides/slide3.xml";
  const baseXml = zip.file(BASE)!.asText();
  const baseRels = zip.file("ppt/slides/_rels/slide3.xml.rels")!.asText();
  zip.file(BASE, fitBadge(suffixTags(baseXml, 0), labels[0]));

  const prelPath = "ppt/_rels/presentation.xml.rels";
  let prel = zip.file(prelPath)!.asText();
  const baseRid = /<Relationship Id="([^"]+)"[^>]*Target="slides\/slide3\.xml"/.exec(prel)?.[1];
  let pres = zip.file("ppt/presentation.xml")!.asText();
  const baseSld = baseRid ? new RegExp(`<p:sldId id="\\d+" r:id="${baseRid}"/>`).exec(pres)?.[0] : undefined;
  if (!baseRid || !baseSld) throw new Error("PPT 양식 구조를 읽지 못했습니다.");
  const maxId = Math.max(...Array.from(pres.matchAll(/<p:sldId id="(\d+)"/g)).map((m) => Number(m[1])));

  let ct = zip.file("[Content_Types].xml")!.asText();
  const overrides: string[] = [];
  const rels: string[] = [];
  const ids: string[] = [];
  for (let i = 1; i < n; i++) {
    const name = `slide${100 + i}.xml`;
    zip.file(`ppt/slides/${name}`, fitBadge(suffixTags(baseXml, i), labels[i]));
    zip.file(`ppt/slides/_rels/${name}.rels`, baseRels);
    overrides.push(`<Override PartName="/ppt/slides/${name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    rels.push(`<Relationship Id="rIdS${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${name}"/>`);
    ids.push(`<p:sldId id="${maxId + i}" r:id="rIdS${i}"/>`);
  }
  ct = ct.replace("</Types>", overrides.join("") + "</Types>");
  prel = prel.replace("</Relationships>", rels.join("") + "</Relationships>");
  pres = pres.replace(baseSld, baseSld + ids.join(""));
  zip.file("[Content_Types].xml", ct);
  zip.file(prelPath, prel);
  zip.file("ppt/presentation.xml", pres);
}

function pagesOf(photos: Photo[]): Photo[][] {
  if (photos.length === 0) return [[]];
  const out: Photo[][] = [];
  for (let i = 0; i < photos.length; i += PER_PAGE) out.push(photos.slice(i, i + PER_PAGE));
  return out;
}

export async function generateShootPptx(schedule: Schedule, report: Report, rounds: Schedule[]): Promise<Blob> {
  const { default: PizZip } = await import("pizzip");
  const { default: Docxtemplater } = await import("docxtemplater");
  const ImageModule = (await import("docxtemplater-image-module-free")).default;

  const store = new Map<string, { bytes: Uint8Array; box: Box }>();
  const put = async (key: string, photo: Photo | undefined, box: Box, withCaption = true) => {
    const bytes = photo?.url ? await normalizePhoto(photo.url, box, withCaption ? photo.caption || "" : "") : null;
    if (!bytes) return "";
    store.set(key, { bytes, box });
    return key;
  };

  const roundList = rounds.length ? rounds : [schedule];
  const cur = Math.max(0, roundList.findIndex((r) => r.id === schedule.id));
  const period = shootPeriod(schedule);
  const specialNote = report.specialNote?.trim() || "";

  const data: Record<string, unknown> = {
    촬영종류: schedule.shootType || "-",
    표지종류: schedule.shootType || "촬영",
    촬영명: schedule.title,
    제작사: schedule.production || "-",
    관리자: schedule.manager || "-",
    관리자있음: !!schedule.manager,
    촬영일시: prettyDateTime(schedule.start),
    촬영기간: period,
    보양세팅: setupRange(schedule),
    촬영철수: shootRange(schedule),
    회차수: String(roundList.length),
    이번: String(cur + 1),
    회차: roundList.map((r, i) => ({
      회차명: `${i + 1}회차`,
      일시: prettyDateTime(r.start),
      철수: shootRange(r),
      관리자: r.manager || "-",
      now: i === cur,
    })),
    특이설명: specialNote,
    specialOk: !!specialNote,
    cover: await put("cover", report.cover, COVER_BOX, false),
  };

  // 구역 사진 슬라이드 (구역마다, 8장마다)
  const pages: { sec: ReportSection; photos: Photo[]; part: number; parts: number }[] = [];
  for (const sec of SECTION_ORDER) {
    const groups = pagesOf(report.sections[sec] ?? []);
    groups.forEach((g, i) => pages.push({ sec, photos: g, part: i + 1, parts: groups.length }));
  }
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const note = report.sectionNotes?.[pg.sec]?.trim() || "";
    data[`구역_${i}`] = SECTION_LABELS[pg.sec];
    data[`쪽_${i}`] = pg.parts > 1 ? `(${pg.part}/${pg.parts})` : "";
    data[`비고_${i}`] = note;
    data[`noteOk_${i}`] = !!note;
    for (let k = 0; k < PER_PAGE; k++) {
      data[`p${k + 1}_${i}`] = await put(`p${k + 1}_${i}`, pg.photos[k], SECTION_BOX);
    }
  }
  // 특이사항 사진 2×2
  for (let k = 0; k < 4; k++) {
    data[`s${k + 1}`] = await put(`s${k + 1}`, report.specialPhotos?.[k], SPECIAL_BOX);
  }

  const res = await fetch("/templates/shoot.pptx");
  if (!res.ok) throw new Error("PPT 양식을 불러오지 못했습니다.");
  const zip = new PizZip(await res.arrayBuffer());
  expandSectionSlides(zip, pages.map((p) => SECTION_LABELS[p.sec]));

  const imageModule = new ImageModule({
    getImage: (key: string) => store.get(key)?.bytes ?? new Uint8Array(),
    getSize: (_img: unknown, key?: string) => {
      const b = (key && store.get(key)?.box) || SECTION_BOX;
      return [b.w, b.h];
    },
  });
  const doc = new Docxtemplater(zip, { modules: [imageModule], paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(data);
  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
