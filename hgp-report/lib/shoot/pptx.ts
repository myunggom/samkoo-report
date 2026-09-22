"use client";

// 촬영 완료보고서 PPT — 양식(public/templates/shoot.pptx, scripts/build_shoot_pptx.py로 생성)을 채워 만든다.
//  · 1 표지(원본 겉지 양식) · 2 촬영 개요(회차 표 행 반복) · 3 구역 사진 · 4 특이사항
//  · 구역 사진 슬라이드는 PDF와 같게 "구역마다, 사진 8장마다" 한 장씩 → zip 단계에서 slide3을 복제하고
//    복제본마다 태그에 _i 접미사를 붙여 개별로 채운다 (docxtemplater 무료판은 슬라이드 복제를 못 함).

import type { Photo, Report, ReportSection, Schedule } from "./types";
import { SECTION_LABELS, SECTION_ORDER } from "./types";
import { prettyDateTime, setupRange, shootPeriod, shootRange } from "./format";
import { proxied } from "@/lib/client";

const PER_PAGE = 8;
// 사진칸 크기(px) — build_shoot_pptx.py의 칸 크기와 같아야 칸에 꼭 맞음
const SECTION_BOX = { w: 242, h: 192 };
const SPECIAL_BOX = { w: 311, h: 254 };

// 구역 슬라이드에서 복제본마다 달라지는 태그 (공통 정보표 태그는 그대로 둠)
const PER_SLIDE_TAGS = ["구역", "쪽", "비고", ...Array.from({ length: PER_PAGE }, (_, i) => [`p${i + 1}`, `c${i + 1}`]).flat()];

async function normalizePhoto(url: string, box: { w: number; h: number }): Promise<Uint8Array | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob()).catch(() => null);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = box.w * 2;
    canvas.height = box.h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const ratio = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * ratio;
    const h = bitmap.height * ratio;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return out ? new Uint8Array(await out.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

function suffixTags(xml: string, i: number): string {
  let out = xml;
  for (const t of PER_SLIDE_TAGS) {
    out = out.split(`{${t}}`).join(`{${t}_${i}}`).split(`{%${t}}`).join(`{%${t}_${i}}`);
  }
  return out;
}

interface ZipLike {
  file(name: string): { asText(): string } | null;
  file(name: string, content: string): unknown;
}

// slide3(구역 사진)을 n장으로: 첫 장은 slide3 재사용, 나머지는 slide101.. 추가 후 slide3 바로 뒤에 순서대로 배치
function expandSectionSlides(zip: ZipLike, n: number): void {
  const BASE = "ppt/slides/slide3.xml";
  const baseXml = zip.file(BASE)!.asText();
  const baseRels = zip.file("ppt/slides/_rels/slide3.xml.rels")!.asText();
  zip.file(BASE, suffixTags(baseXml, 0));

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
    zip.file(`ppt/slides/${name}`, suffixTags(baseXml, i));
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

  const store = new Map<string, { bytes: Uint8Array; box: { w: number; h: number } }>();
  const put = async (key: string, photo: Photo | undefined, box: { w: number; h: number }) => {
    const bytes = photo?.url ? await normalizePhoto(photo.url, box) : null;
    if (!bytes) return "";
    store.set(key, { bytes, box });
    return key;
  };

  const roundList = rounds.length ? rounds : [schedule];
  const cur = Math.max(0, roundList.findIndex((r) => r.id === schedule.id));
  const period = shootPeriod(schedule);

  const data: Record<string, unknown> = {
    촬영종류: schedule.shootType || "-",
    촬영명: schedule.title,
    제작사: schedule.production || "-",
    관리자: schedule.manager || "-",
    촬영일시: prettyDateTime(schedule.start),
    촬영기간: period,
    보양세팅: setupRange(schedule),
    촬영철수: shootRange(schedule),
    표지정보: `${schedule.shootType || "촬영"}${schedule.production ? ` · 제작사 ${schedule.production}` : ""} · 촬영 기간 : ${period}`,
    회차요약: `총 ${roundList.length}회차 · 이번은 ${cur + 1}번째 촬영`,
    회차: roundList.map((r, i) => ({
      회차명: `${i + 1}회차`,
      일시: prettyDateTime(r.start),
      철수: shootRange(r),
      관리자: r.manager || "-",
      비고: i === cur ? "이번 촬영" : "",
      now: i === cur,
    })),
    특이설명: report.specialNote?.trim() || "해당 없음",
  };

  // 구역 사진 슬라이드 (구역마다, 8장마다)
  const pages: { sec: ReportSection; photos: Photo[]; part: number; parts: number }[] = [];
  for (const sec of SECTION_ORDER) {
    const groups = pagesOf(report.sections[sec] ?? []);
    groups.forEach((g, i) => pages.push({ sec, photos: g, part: i + 1, parts: groups.length }));
  }
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    data[`구역_${i}`] = SECTION_LABELS[pg.sec];
    data[`쪽_${i}`] = pg.parts > 1 ? `(${pg.part}/${pg.parts})` : "";
    data[`비고_${i}`] = report.sectionNotes?.[pg.sec]?.trim() || "해당 없음";
    for (let k = 0; k < PER_PAGE; k++) {
      const photo = pg.photos[k];
      data[`p${k + 1}_${i}`] = await put(`p${k + 1}_${i}`, photo, SECTION_BOX);
      data[`c${k + 1}_${i}`] = photo?.caption || "";
    }
  }
  // 특이사항 사진 2×2
  for (let k = 0; k < 4; k++) {
    const photo = report.specialPhotos?.[k];
    data[`s${k + 1}`] = await put(`s${k + 1}`, photo, SPECIAL_BOX);
    data[`sc${k + 1}`] = photo?.caption || "";
  }

  const res = await fetch("/templates/shoot.pptx");
  if (!res.ok) throw new Error("PPT 양식을 불러오지 못했습니다.");
  const zip = new PizZip(await res.arrayBuffer());
  expandSectionSlides(zip, pages.length);

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
