"use client";

// 주간 업무보고 PPT를 원본 양식(weekly.pptx) 그대로 채워 생성 — 클라이언트 전용.
//  · 표지: {기간}
//  · 하자리스트 표(2p): 공종별 발행/치유/진행률 (+증감 빨강)
//  · 작업 슬라이드(3p~): 항목마다 별도 슬라이드로 복제. 제목·사진2·캡션·개요·세부.
// docxtemplater 무료판은 슬라이드 복제를 못 하므로, 렌더 전에 작업 슬라이드를
// 항목 수만큼 zip 레벨에서 복제하고 태그에 _i 접미사를 붙여 각 슬라이드를 개별로 채운다.

import type { WeeklyDraft, WeeklyWork } from "@/lib/weekly";
import { 공종목록, defectDisplay, defectTotals } from "@/lib/weekly";
import { proxied } from "@/lib/client";

export type WorkPhrase = { 본문: string };

// 작업 슬라이드 사진 슬롯(4.92×2.32in ≒ 472×222px)
const IMG_W = 472;
const IMG_H = 222;

async function normalizePhoto(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = IMG_W;
    canvas.height = IMG_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, IMG_W, IMG_H);
    const ratio = Math.max(IMG_W / bitmap.width, IMG_H / bitmap.height);
    const w = bitmap.width * ratio;
    const h = bitmap.height * ratio;
    ctx.drawImage(bitmap, (IMG_W - w) / 2, (IMG_H - h) / 2, w, h);
    const outBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!outBlob) return null;
    return new Uint8Array(await outBlob.arrayBuffer());
  } catch {
    return null;
  }
}

// 작업 슬라이드 태그에 _i 접미사 + 루프 마커 제거
function suffixWorkTags(xml: string, i: number): string {
  const toks = ["{번호}", "{주제}", "{본문}", "{사진1설명}", "{사진2설명}", "{%사진1}", "{%사진2}"];
  let out = xml;
  for (const t of toks) {
    const inner = t.replace(/^\{[#/%]?/, "").replace(/\}$/, "");
    const prefix = t.slice(0, t.length - inner.length - 1); // '{', '{#', '{/', '{%'
    out = out.split(t).join(`${prefix}${inner}_${i}}`);
  }
  return out.split("{#작업들}").join("").split("{/작업들}").join("");
}

// zip 조작에 필요한 최소 구조 (pizzip 인스턴스가 구조적으로 만족)
interface ZipLike {
  file(name: string): { asText(): string } | null;
  file(name: string, content: string): unknown;
  remove(name: string): void;
}

// 작업 슬라이드(slide3)를 n개로 확장. n=1이면 slide3 재사용, n>1이면 slide101.. 추가.
function expandWorkSlides(zip: ZipLike, n: number): void {
  const WORK = "ppt/slides/slide3.xml";
  const WORK_RELS = "ppt/slides/_rels/slide3.xml.rels";
  const baseXml = zip.file(WORK)!.asText();
  const baseRels = zip.file(WORK_RELS)!.asText();

  if (n <= 0) {
    zip.remove(WORK);
    zip.remove(WORK_RELS);
    let ct = zip.file("[Content_Types].xml")!.asText();
    ct = ct.replace(`<Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`, "");
    zip.file("[Content_Types].xml", ct);
    let prel = zip.file("ppt/_rels/presentation.xml.rels")!.asText();
    prel = prel.replace(/<Relationship Id="rId4"[^>]*\/>/, "");
    zip.file("ppt/_rels/presentation.xml.rels", prel);
    let pres = zip.file("ppt/presentation.xml")!.asText();
    pres = pres.replace(/<p:sldId id="1887" r:id="rId4"\/>/, "");
    zip.file("ppt/presentation.xml", pres);
    return;
  }

  zip.file(WORK, suffixWorkTags(baseXml, 0));

  const newOverrides: string[] = [];
  const newRels: string[] = [];
  const newSldIds: string[] = [];
  for (let i = 1; i < n; i++) {
    const name = `slide${100 + i}.xml`;
    zip.file(`ppt/slides/${name}`, suffixWorkTags(baseXml, i));
    zip.file(`ppt/slides/_rels/${name}.rels`, baseRels);
    newOverrides.push(`<Override PartName="/ppt/slides/${name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    const rid = `rIdW${i}`;
    newRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${name}"/>`);
    newSldIds.push(`<p:sldId id="${2000 + i}" r:id="${rid}"/>`);
  }

  let ct = zip.file("[Content_Types].xml")!.asText();
  ct = ct.replace("</Types>", newOverrides.join("") + "</Types>");
  zip.file("[Content_Types].xml", ct);

  let prel = zip.file("ppt/_rels/presentation.xml.rels")!.asText();
  prel = prel.replace("</Relationships>", newRels.join("") + "</Relationships>");
  zip.file("ppt/_rels/presentation.xml.rels", prel);

  let pres = zip.file("ppt/presentation.xml")!.asText();
  pres = pres.replace(`<p:sldId id="1887" r:id="rId4"/>`, `<p:sldId id="1887" r:id="rId4"/>` + newSldIds.join(""));
  zip.file("ppt/presentation.xml", pres);
}

// 본문: Claude 정리 문구가 있으면 그것, 없으면 메모를 그대로(줄바꿈·띄어쓰기 보존)
function workBody(work: WeeklyWork, phrase?: WorkPhrase): string {
  if (phrase && phrase.본문 && phrase.본문.trim()) return phrase.본문;
  return work.memo || "";
}

export async function generateWeeklyPptx(
  draft: WeeklyDraft,
  phrases: Record<string, WorkPhrase> = {}
): Promise<Blob> {
  const { default: PizZip } = await import("pizzip");
  const { default: Docxtemplater } = await import("docxtemplater");
  const ImageModule = (await import("docxtemplater-image-module-free")).default;

  const works = draft.works.filter((w) => w.title.trim() || w.memo.trim() || w.photos.length);
  const N = works.length;

  // 데이터 조립
  const data: Record<string, unknown> = {
    기간: draft.period,
    기준일: draft.baseDate,
  };
  // 하자표 (발행 / 이번 주 치유 / 누적(이번주 포함) / 진행률)
  for (const k of 공종목록) {
    const d = defectDisplay(draft.defects[k]);
    data[`${k}_발행`] = d.발행;
    data[`${k}_이번주`] = d.이번주;
    data[`${k}_누적`] = d.누적;
    data[`${k}_진행률`] = d.진행률;
  }
  const tot = defectDisplay(defectTotals(draft.defects));
  data["합계_발행"] = tot.발행;
  data["합계_이번주"] = tot.이번주;
  data["합계_누적"] = tot.누적;
  data["합계_진행률"] = tot.진행률;

  // 작업 슬라이드 이미지 + 텍스트
  const store = new Map<string, Uint8Array>();
  for (let i = 0; i < N; i++) {
    const w = works[i];
    data[`번호_${i}`] = String(i + 2).padStart(2, "0");
    data[`주제_${i}`] = w.title || "(제목 없음)";
    data[`본문_${i}`] = workBody(w, phrases[w.id]);
    const p1 = w.photos[0];
    const p2 = w.photos[1];
    data[`사진1설명_${i}`] = p1?.caption || "";
    data[`사진2설명_${i}`] = p2?.caption || "";
    const b1 = p1?.url ? await normalizePhoto(p1.url) : null;
    const b2 = p2?.url ? await normalizePhoto(p2.url) : null;
    if (b1) {
      store.set(`사진1_${i}`, b1);
      data[`사진1_${i}`] = `사진1_${i}`;
    } else {
      data[`사진1_${i}`] = "";
    }
    if (b2) {
      store.set(`사진2_${i}`, b2);
      data[`사진2_${i}`] = `사진2_${i}`;
    } else {
      data[`사진2_${i}`] = "";
    }
  }

  const res = await fetch("/templates/weekly.pptx");
  if (!res.ok) throw new Error("PPT 양식을 불러오지 못했습니다.");
  const content = await res.arrayBuffer();
  const zip = new PizZip(content);
  expandWorkSlides(zip, N);

  const imageModule = new ImageModule({
    getImage: (key: string) => store.get(key) ?? new Uint8Array(),
    getSize: () => [IMG_W, IMG_H],
  });
  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
