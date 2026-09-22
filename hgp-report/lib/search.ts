// 전역 검색 — 모든 탭의 데이터를 키워드로 조회 (서버 전용)
//
// 대상: 아카이브(사진·동영상·문서), 문제 관리, 일일 기록, 일정, 보고서, 풍수해 점검.
// 문서의 "내용(파일 내부 텍스트)"은 색인하지 않고, 제목·설명·파일명·메모 등 저장된 텍스트를 검색합니다.
// (주간업무보고는 비밀번호 전용이라 전역 검색에서 제외)

import { listMedia, listIssues, listDayNotes, listEvents, listGenReports, listPungReports } from "@/lib/store";
import { KIND_LABEL } from "@/lib/reports";
import { fileIcon } from "@/lib/archive";

export type SearchHit = {
  kind: string; // 배지 라벨 (문서/사진/동영상/문제/일일기록/일정/보고서/풍수해)
  icon: string;
  title: string;
  snippet: string;
  href: string;
  external?: boolean; // href가 외부(파일) 링크인지
  date?: string;
};

function norm(s: unknown): string {
  return (typeof s === "string" ? s : "").toLowerCase();
}

// 매칭된 첫 필드로 스니펫 만들기 (키워드 주변만)
function snippetOf(fields: string[], kw: string): string {
  for (const f of fields) {
    const i = f.toLowerCase().indexOf(kw);
    if (i >= 0) {
      const start = Math.max(0, i - 20);
      const end = Math.min(f.length, i + kw.length + 40);
      return (start > 0 ? "…" : "") + f.slice(start, end).trim() + (end < f.length ? "…" : "");
    }
  }
  // 매칭 필드가 비었으면 첫 비어있지 않은 필드
  const first = fields.find((f) => f.trim());
  return first ? first.slice(0, 60) : "";
}

export async function searchAll(query: string, limit = 60): Promise<SearchHit[]> {
  const kw = query.trim().toLowerCase();
  if (!kw) return [];

  const [media, issues, daynotes, events, genReports, pungReports] = await Promise.all([
    listMedia(),
    listIssues(),
    listDayNotes(),
    listEvents(),
    listGenReports(),
    listPungReports(),
  ]);

  const hits: SearchHit[] = [];

  // 아카이브
  for (const m of media) {
    const fields = [m.title, m.note, m.area, m.uploader, m.fileName, m.category].map((x) => x || "");
    if (!fields.some((f) => f.toLowerCase().includes(kw))) continue;
    const isFile = m.type === "file";
    const isVideo = m.type === "video";
    hits.push({
      kind: isFile ? "문서" : isVideo ? "동영상" : "사진",
      icon: isFile ? fileIcon(m.ext) : isVideo ? "🎬" : "🖼",
      title: m.title || m.fileName || (isFile ? "문서" : isVideo ? "동영상" : "사진"),
      snippet: snippetOf(fields, kw),
      href: isFile ? m.url : "/archive",
      external: isFile,
      date: m.takenAt,
    });
  }

  // 문제 관리
  for (const it of issues) {
    const fields = [it.title, it.note, it.area].map((x) => x || "");
    if (!fields.some((f) => f.toLowerCase().includes(kw))) continue;
    hits.push({ kind: "문제", icon: "🛠", title: it.title || "문제", snippet: snippetOf(fields, kw), href: "/issues", date: it.createdAt?.slice(0, 10) });
  }

  // 일일 기록
  for (const d of daynotes) {
    if (!norm(d.note).includes(kw)) continue;
    hits.push({ kind: "일일기록", icon: "🗒", title: d.date, snippet: snippetOf([d.note], kw), href: "/logs", date: d.date });
  }

  // 일정
  for (const e of events) {
    const fields = [e.title, e.note].map((x) => x || "");
    if (!fields.some((f) => f.toLowerCase().includes(kw))) continue;
    hits.push({ kind: "일정", icon: "📅", title: e.title || "일정", snippet: snippetOf(fields, kw), href: "/logs", date: e.date });
  }

  // 보고서 (일반)
  for (const r of genReports) {
    const a = r.accident || ({} as typeof r.accident);
    const secText = (r.sections || []).map((s) => `${s.heading} ${s.body}`).join(" ");
    const accText = [
      a.title, a.place, a.cause, a.scope, a.reportPath, a.actions, a.followup,
      ...(a.timeline || []).map((t) => `${t.kind} ${t.content} ${t.actor}`),
      ...[...(a.plans || []), ...(a.prevents || [])].map((p) => p.text),
    ].map((x) => x || "").join(" ");
    const fields = [r.subject, r.docTitle, r.bracket, r.site, r.summary, r.reporter, r.place, secText, accText].map((x) => x || "");
    if (!fields.some((f) => f.toLowerCase().includes(kw))) continue;
    const label = KIND_LABEL[r.kind] || "보고서";
    hits.push({ kind: `보고서·${label}`, icon: "📄", title: r.subject || r.docTitle || label, snippet: snippetOf(fields, kw), href: `/reports/${r.id}`, date: r.date });
  }

  // 풍수해 점검
  for (const p of pungReports) {
    const secText = (p.sections || []).map((s) => `${s.title} ${(s.slots || []).map((x) => x.caption || "").join(" ")}`).join(" ");
    const chkText = (p.checklist || []).map((c) => `${c.category ?? ""} ${c.content ?? ""}`).join(" ");
    const fields = [p.site, p.inspector, secText, chkText].map((x) => x || "");
    if (!fields.some((f) => f.toLowerCase().includes(kw))) continue;
    hits.push({ kind: "풍수해", icon: "🌧", title: p.site || "풍수해 점검", snippet: snippetOf(fields, kw), href: `/report/${p.id}`, date: p.date });
  }

  // 최신 날짜 우선
  hits.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return hits.slice(0, limit);
}
