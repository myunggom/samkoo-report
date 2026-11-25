"use client";

// 공조기 운전 설정값 → 고객사에 보낼 PPT 한 장 (pptxgenjs, 브라우저에서 만든다).
// 화면에서 고른 기준일 · 입주사 그대로 나간다. 34대 전부여도 한 장에 들어가게 행 높이를 맞춘다.

import { AHU_UNITS, daysText, type AhuUnit, type HvacVersion, type UnitSetting } from "@/lib/hvac";

const NAVY = "1F3A5F";
const LINE = "BFC7D2";
const MODE_FILL: Record<string, string> = { 냉방: "DCEBFB", 난방: "FDE6D6", 송풍: "DDF3E8", 정지: "E5E7EB", "": "FFFFFF" };

export async function buildHvacPptx(opts: {
  date: string;
  tenant: string;                       // "전체" | 입주사
  version: HvacVersion | null;
  settings: Record<string, UnitSetting>;
}): Promise<{ blob: Blob; fileName: string }> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  const s = pptx.addSlide();

  const units: AhuUnit[] = AHU_UNITS.filter((u) => opts.tenant === "전체" || u.tenant === opts.tenant);
  const who = opts.tenant === "전체" ? "전 호기" : `${opts.tenant} 담당 호기`;

  s.addText("공조기 운전 설정값", { x: 0.45, y: 0.2, w: 8, h: 0.5, fontSize: 22, bold: true, color: NAVY, fontFace: "맑은 고딕" });
  s.addText(`바이오 이노베이션 허브 · ${who} ${units.length}대`, {
    x: 0.45, y: 0.66, w: 8, h: 0.3, fontSize: 11, color: "4B5563", fontFace: "맑은 고딕",
  });
  const basis = opts.version
    ? `기준일 ${opts.date}  ·  ${opts.version.effectiveFrom} 부터 적용  ·  ${opts.version.reason}`
    : `기준일 ${opts.date}`;
  s.addText(basis, { x: 6.4, y: 0.66, w: 6.5, h: 0.3, fontSize: 10, color: "4B5563", align: "right", fontFace: "맑은 고딕" });
  s.addShape(pptx.ShapeType.line, { x: 0.45, y: 1.0, w: 12.43, h: 0, line: { color: NAVY, width: 1.5 } });

  const head = ["층", "호기", "입주사", "담당 구역", "모드", "설정온도\n(℃)", "급기팬\n(Hz)", "환기팬\n(Hz)", "엔탈피\n모드", "댐퍼\n개도(%)", "가동 요일", "가동 시간"];
  const colW = [0.55, 0.65, 0.75, 2.75, 0.7, 0.85, 0.8, 0.8, 0.75, 0.8, 1.4, 1.63]; // 합 12.43
  const hdr = head.map((t) => ({
    text: t,
    options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, align: "center" as const, valign: "middle" as const },
  }));

  const rows = units.map((u) => {
    const v = opts.settings[u.id];
    const stop = v.mode === "정지";
    const c = (text: string, extra: Record<string, unknown> = {}) => ({
      text, options: { align: "center" as const, valign: "middle" as const, ...extra },
    });
    return [
      c(u.floor),
      c(u.id, { bold: true }),
      c(u.tenant),
      c(" " + u.zone, { align: "left" as const }),
      c(v.mode || "-", { bold: true, fill: { color: MODE_FILL[v.mode] } }),
      c(v.temp != null ? String(v.temp) : "-"),
      c(String(v.supplyHz)),
      c(String(v.exhaustHz)),
      c(v.enthalpy ? "사용" : "-"),
      c(v.damper != null ? String(v.damper) : "-"),
      c(stop ? "-" : daysText(v.days)),
      c(stop ? "정지" : `${v.start} ~ ${v.end}`),
    ];
  });

  // 한 장에 들어가게 : 표는 1.1in ~ 7.12in. 34대 전부면 행 0.16in · 7.5pt
  // (PowerPoint 는 글자 크기보다 낮게 행을 못 줄인다 — 처음엔 0.02 여백으로 맨 아래 두 줄이 꼬리말과 겹쳤다)
  const hdrH = 0.4;
  const avail = 7.12 - 1.1 - hdrH;
  const rowH = Math.min(0.42, avail / Math.max(1, rows.length));
  const font = rowH >= 0.3 ? 10.5 : rowH >= 0.21 ? 9 : 7.5;
  s.addTable([hdr, ...rows], {
    x: 0.45, y: 1.1, w: 12.43, colW,
    rowH: [hdrH, ...rows.map(() => rowH)],
    fontSize: font, fontFace: "맑은 고딕", color: "111827",
    border: { type: "solid", pt: 0.5, color: LINE },
    margin: 0,
  });

  s.addText(
    "※ 팬 Hz 는 인버터 운전 주파수(기본 50Hz)입니다.  ※ 엔탈피 모드는 봄 · 가을철 외기 엔탈피 제어 사용 여부입니다.  ※ 댐퍼 개도는 0~100% 입니다.",
    { x: 0.45, y: 7.2, w: 9.5, h: 0.25, fontSize: 8, color: "6B7280", fontFace: "맑은 고딕" },
  );
  s.addText(`바이오 이노베이션 허브 시설관리 · 출력 ${new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`, {
    x: 9.5, y: 7.2, w: 3.38, h: 0.25, fontSize: 8, color: "6B7280", align: "right", fontFace: "맑은 고딕",
  });

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const fileName = `[공조기 운전 설정값] 바이오 이노베이션 허브${opts.tenant === "전체" ? "" : "_" + opts.tenant}_${opts.date.replace(/-/g, ".")}.pptx`;
  return { blob, fileName };
}
