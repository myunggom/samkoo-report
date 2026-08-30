// 주간 업무보고 데이터 (사장 전용 /weekly-report)
//
// 구성:
//  · 표지 기간(period) + 하자리스트 기준일(baseDate)
//  · 하자리스트(defects): 공종별 발행 수 / 치유 수(누적) / 이번 주 증감 → 진행률 자동 계산
//  · 작업 항목(works): 제목 + 메모 + 사진(2장 필수, 더 가능). 메모는 Claude가 개요/세부로 정리.
// 원본 PPT 양식(weekly.pptx)의 플레이스홀더를 그대로 채워 PPT 생성.

export const 공종목록 = ["전기", "건축", "기계", "소방", "인테리어"] as const;
export type 공종 = (typeof 공종목록)[number];

export type DefectRow = {
  발행: number; // 하자 발행 수(총)
  치유: number; // 하자 치유 수(누적)
  증감: number; // 이번 주 치유 증가분
};

export type WeeklyDefects = Record<공종, DefectRow>;

export type WeeklyPhoto = { url: string; caption?: string };

export type WeeklyWork = {
  id: string;
  title: string; // 주제 (예: 3층 전기실 누수 보수)
  memo: string; // 자유 메모 → 개요/세부로 정리됨
  photos: WeeklyPhoto[]; // 2장 필수, 더 가능
};

export type WeeklyDraft = {
  period: string; // 표지 기간 (예: 2026.08.25 ~ 08.29)
  baseDate: string; // 하자리스트 기준일 (예: 2026.08.29 (금) 기준)
  defects: WeeklyDefects;
  works: WeeklyWork[];
  updatedAt: string;
};

export function newWorkId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyDefectRow(): DefectRow {
  return { 발행: 0, 치유: 0, 증감: 0 };
}

export function emptyDefects(): WeeklyDefects {
  return 공종목록.reduce((acc, k) => {
    acc[k] = emptyDefectRow();
    return acc;
  }, {} as WeeklyDefects);
}

export function emptyWork(): WeeklyWork {
  return { id: newWorkId(), title: "", memo: "", photos: [] };
}

// 이번 주(월~금) 기간 문자열 (예: 2026.08.25 ~ 08.29)
export function thisWeekRange(d = new Date()): string {
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${mon.getFullYear()}.${p(mon.getMonth() + 1)}.${p(mon.getDate())} ~ ${p(fri.getMonth() + 1)}.${p(fri.getDate())}`;
}

// 오늘 기준일 문자열 (예: 2026.08.29 (금) 기준)
export function todayBaseDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} (${dow}) 기준`;
}

export function emptyDraft(): WeeklyDraft {
  return {
    period: thisWeekRange(),
    baseDate: todayBaseDate(),
    defects: emptyDefects(),
    works: [emptyWork()],
    updatedAt: new Date().toISOString(),
  };
}

// 저장된(구버전 포함) 데이터를 새 형태로 정규화
export function normalizeDraft(raw: unknown): WeeklyDraft {
  const base = emptyDraft();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const defects = emptyDefects();
  if (r.defects && typeof r.defects === "object") {
    for (const k of 공종목록) {
      const row = (r.defects as Record<string, unknown>)[k];
      if (row && typeof row === "object") {
        const rr = row as Record<string, unknown>;
        defects[k] = {
          발행: Number(rr.발행) || 0,
          치유: Number(rr.치유) || 0,
          증감: Number(rr.증감) || 0,
        };
      }
    }
  }
  // works (신규) 또는 items (구버전) 지원
  const srcWorks = Array.isArray(r.works) ? r.works : Array.isArray(r.items) ? r.items : [];
  const works: WeeklyWork[] = srcWorks.map((it) => {
    const w = (it || {}) as Record<string, unknown>;
    return {
      id: typeof w.id === "string" && w.id ? w.id : newWorkId(),
      title: typeof w.title === "string" ? w.title : "",
      memo: typeof w.memo === "string" ? w.memo : "",
      photos: Array.isArray(w.photos)
        ? (w.photos as Record<string, unknown>[])
            .filter((p) => typeof p?.url === "string")
            .map((p) => ({ url: String(p.url), caption: typeof p.caption === "string" ? p.caption : "" }))
        : [],
    };
  });
  return {
    period: typeof r.period === "string" && r.period ? r.period : base.period,
    baseDate: typeof r.baseDate === "string" && r.baseDate ? r.baseDate : base.baseDate,
    defects,
    works: works.length ? works : [emptyWork()],
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

// ── 하자표 표시 문자열 계산 ──
export type DefectDisplay = {
  발행: string;
  치유: string;
  치유증감: string; // " ( +6 )" 또는 ""
  진행률: string; // "77.7%"
  진행률증감: string; // "( +6.4 %)" 또는 ""
};

function pct(cured: number, issued: number): number {
  if (!issued) return 0;
  return (cured / issued) * 100;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function defectDisplay(row: DefectRow): DefectDisplay {
  const cur = pct(row.치유, row.발행);
  const prev = pct(row.치유 - row.증감, row.발행);
  const dPct = cur - prev;
  return {
    발행: fmtInt(row.발행),
    치유: fmtInt(row.치유),
    치유증감: row.증감 > 0 ? ` ( +${fmtInt(row.증감)} )` : "",
    진행률: `${cur.toFixed(1)}%`,
    진행률증감: row.증감 > 0 ? `( +${dPct.toFixed(1)} %)` : "",
  };
}

export function defectTotals(defects: WeeklyDefects): DefectRow {
  return 공종목록.reduce(
    (acc, k) => {
      acc.발행 += defects[k].발행;
      acc.치유 += defects[k].치유;
      acc.증감 += defects[k].증감;
      return acc;
    },
    { 발행: 0, 치유: 0, 증감: 0 }
  );
}
