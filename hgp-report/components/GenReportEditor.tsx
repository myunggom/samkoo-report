"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GenReport, ReportTextSection, AccidentFields, TimelineRow, PlanRow } from "@/lib/reports";
import { ACCIDENT_GRADES, KIND_LABEL, KIND_PLACE_LABEL, PLAN_RESULTS, layoutOf, reportFileName } from "@/lib/reports";
import { shareOrDownloadPdf, shareOrDownloadFile } from "@/lib/pdf";
import { generateReportDocx } from "@/lib/docxExport";
import { docxBlobToPdfBlob } from "@/lib/docxToPdf";
import ReportPhotoField from "@/components/ReportPhotoField";

export default function GenReportEditor({ initial }: { initial: GenReport }) {
  const router = useRouter();
  const [r, setR] = useState<GenReport>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const layout = layoutOf(r.kind);

  function patch(p: Partial<GenReport>) {
    setR((prev) => ({ ...prev, ...p }));
  }
  function patchAccident(p: Partial<AccidentFields>) {
    setR((prev) => ({ ...prev, accident: { ...prev.accident, ...p } }));
  }
  function updateSection(i: number, p: Partial<ReportTextSection>) {
    setR((prev) => {
      const next = prev.sections.slice();
      next[i] = { ...next[i], ...p };
      return { ...prev, sections: next };
    });
  }
  function addSection() {
    setR((prev) => ({ ...prev, sections: [...prev.sections, { id: `s-${Date.now().toString(36)}`, heading: "새 항목", body: "" }] }));
  }
  function removeSection(i: number) {
    setR((prev) => ({ ...prev, sections: prev.sections.filter((_, idx) => idx !== i) }));
  }
  function moveSection(i: number, d: -1 | 1) {
    setR((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.sections.length) return prev;
      const next = prev.sections.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...prev, sections: next };
    });
  }

  async function save(): Promise<GenReport | null> {
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as GenReport;
      setR(saved);
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      return saved;
    } catch {
      alert("저장에 실패했습니다.");
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("이 보고서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
      router.push("/reports");
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }
  // PDF = 워드 파일을 먼저 만든 뒤 그 문서를 그대로 PDF로 변환
  async function exportPdf() {
    setExporting(true);
    try {
      await save();
      const docxBlob = await generateReportDocx(r);
      const pdfBlob = await docxBlobToPdfBlob(docxBlob);
      await shareOrDownloadPdf(pdfBlob, reportFileName(r), reportFileName(r).replace(/\.pdf$/, ""));
    } catch {
      alert("PDF 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }
  async function exportWord() {
    setExportingWord(true);
    try {
      await save();
      const blob = await generateReportDocx(r);
      const name = reportFileName(r).replace(/\.pdf$/, ".docx");
      await shareOrDownloadFile(blob, name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name.replace(/\.docx$/, ""));
    } catch {
      alert("워드 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExportingWord(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 파일명 정보 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">
            <span className="mr-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{KIND_LABEL[r.kind]}</span>
            보고서 작성
          </h1>
          <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50">삭제</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="파일명 [ ] 내용" value={r.bracket} onChange={(v) => patch({ bracket: v })} />
          <Field label="대상/사업장" value={r.site} onChange={(v) => patch({ site: v })} />
          <Field label="제목 요약(파일명)" value={r.subject} onChange={(v) => patch({ subject: v })} ph="예: 10층 EHP 누수" />
          <label className="block">
            <span className={LABEL}>보고일</span>
            <input type="date" value={r.date} onChange={(e) => patch({ date: e.target.value })} className={INPUT} />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          파일명: <span className="font-medium text-slate-500">{reportFileName(r)}</span>
        </p>
      </div>

      {/* 문서 상단 — 제목바 + 정보표 */}
      <Card title="문서 상단" hint="네이비 제목바와 그 아래 정보표에 들어갑니다.">
        {layout === "accident" ? (
          <Field label="제목" value={r.accident.title} onChange={(v) => patchAccident({ title: v })} ph="예: 제넥신 9층 A코어 승강기홀 냄새 유입 발생" />
        ) : (
          <Field label="제목" value={r.docTitle} onChange={(v) => patch({ docTitle: v })} ph="예: 10층 직원휴게실 EHP 교체 완료" />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="보고자" value={r.reporter} onChange={(v) => patch({ reporter: v })} ph="예: 방재과장 신명균" />
          <Field label="보고 대상" value={r.reportTo} onChange={(v) => patch({ reportTo: v })} ph="예: 관리소장" />
        </div>
        {layout === "accident" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>사고 등급 (색 자동: 경미 초록·보통 주황·중대 빨강)</span>
              <input list="acc-grades" value={r.accident.grade} onChange={(e) => patchAccident({ grade: e.target.value })} className={INPUT} />
              <datalist id="acc-grades">
                {ACCIDENT_GRADES.map((g) => <option key={g} value={g} />)}
              </datalist>
            </label>
            <Field label="등급 옆 설명" value={r.accident.gradeNote} onChange={(v) => patchAccident({ gradeNote: v })} ph="예: 인적·물적 피해 없음" />
          </div>
        ) : (
          <Field label={KIND_PLACE_LABEL[r.kind]} value={r.place} onChange={(v) => patch({ place: v })} ph="예: 10층 직원휴게실" />
        )}
        <Area label={layout === "accident" ? "한 줄 요약" : "한 줄 요약 (비우면 문서에서 생략)"} value={r.summary} onChange={(v) => patch({ summary: v })} rows={2} />
      </Card>

      {/* 본문 */}
      {layout === "common" ? (
        <Card title="본문" hint="항목마다 번호 소제목으로 들어갑니다. 내용은 줄마다 • 글머리로 나뉩니다.">
          {r.sections.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#13294B] text-xs font-bold text-white">{i + 1}</span>
                <input value={s.heading} onChange={(e) => updateSection(i, { heading: e.target.value })} placeholder="소제목" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold" />
                <button onClick={() => moveSection(i, -1)} className={MINI} title="위로">↑</button>
                <button onClick={() => moveSection(i, 1)} className={MINI} title="아래로">↓</button>
                <button onClick={() => removeSection(i)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-400 hover:bg-red-50">삭제</button>
              </div>
              <textarea value={s.body} onChange={(e) => updateSection(i, { body: e.target.value })} rows={3} placeholder="내용을 입력하세요 (엔터로 줄 나눔)" className={INPUT} />
            </div>
          ))}
          <button onClick={addSection} className={ADD_BTN}>＋ 항목 추가</button>
        </Card>
      ) : (
        <AccidentForm a={r.accident} patch={patchAccident} />
      )}

      {/* 첨부사진 */}
      <Card title={`${layout === "accident" ? 6 : r.sections.length + 1}. 첨부 — 현장 사진 or 도면`} hint="2장씩 한 줄. 사진마다 제목(굵게)과 부가 설명(작게)이 들어갑니다. 사진이 없으면 문서에서 생략.">
        <ReportPhotoField photos={r.photos} onChange={(photos) => patch({ photos })} />
      </Card>

      <Card title="문서 끝 발신">
        <Field label="'끝.' 아래 밑줄 문구" value={r.signoff} onChange={(v) => patch({ signoff: v })} />
      </Card>

      {/* 액션 */}
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{savedAt ? `저장됨 · ${savedAt}` : ""}</span>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {saving ? "저장 중…" : "저장"}
            </button>
            <button onClick={exportWord} disabled={exportingWord} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
              {exportingWord ? "만드는 중…" : "워드로 출력"}
            </button>
            <button onClick={exportPdf} disabled={exporting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {exporting ? "만드는 중…" : "PDF로 출력"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 입력 부품 — 모두 모듈 레벨(렌더 함수 안에서 정의하면 입력 시 포커스가 빠져 1글자만 입력되는 버그) ──
const LABEL = "mb-1 block text-xs font-medium text-slate-500";
const INPUT = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const CELL = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const MINI = "rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-50";
const ADD_BTN = "w-full rounded-lg border-2 border-dashed border-slate-300 py-2 text-xs text-slate-400 hover:border-slate-400 hover:bg-slate-50";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-bold text-[#13294B]">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ value, onChange, label, ph }: { value: string; onChange: (v: string) => void; label: string; ph?: string }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} className={INPUT} />
    </label>
  );
}

function Area({ value, onChange, label, ph, rows = 2 }: { value: string; onChange: (v: string) => void; label: string; ph?: string; rows?: number }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} rows={rows} className={INPUT} />
    </label>
  );
}

const TIMELINE_KINDS = ["접수", "현장확인", "점검", "원인규명", "합동확인", "임시조치", "복구", "보고"];

function TimelineEditor({ rows, onChange }: { rows: TimelineRow[]; onChange: (r: TimelineRow[]) => void }) {
  const set = (i: number, p: Partial<TimelineRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2">
      <datalist id="tl-kinds">
        {TIMELINE_KINDS.map((k) => <option key={k} value={k} />)}
      </datalist>
      {rows.map((t, i) => (
        <div key={i} className="grid grid-cols-[4.5rem_6rem_1fr] gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[4.5rem_6rem_1fr_9rem_auto]">
          <input value={t.time} onChange={(e) => set(i, { time: e.target.value })} placeholder="08:36" className={CELL} />
          <input list="tl-kinds" value={t.kind} onChange={(e) => set(i, { kind: e.target.value })} placeholder="구분" className={CELL} />
          <input value={t.content} onChange={(e) => set(i, { content: e.target.value })} placeholder="조치 내용" className={CELL} />
          <input value={t.actor} onChange={(e) => set(i, { actor: e.target.value })} placeholder="조치자 / 담당" className={`${CELL} col-span-2 sm:col-span-1`} />
          <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} className="rounded border border-red-200 px-2 text-xs text-red-400 hover:bg-red-50">삭제</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { time: "", kind: "", content: "", actor: "" }])} className={ADD_BTN}>＋ 경과 추가</button>
    </div>
  );
}

function PlanEditor({ rows, onChange, addLabel }: { rows: PlanRow[]; onChange: (r: PlanRow[]) => void; addLabel: string }) {
  const set = (i: number, p: Partial<PlanRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2">
      {rows.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
          <input value={p.text} onChange={(e) => set(i, { text: e.target.value })} placeholder="조치 및 대책 내용" className={CELL} />
          <select value={PLAN_RESULTS.includes(p.result) ? p.result : ""} onChange={(e) => set(i, { result: e.target.value })} className={CELL}>
            <option value="">(없음)</option>
            {PLAN_RESULTS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button onClick={() => onChange(rows.filter((_, idx) => idx !== i))} className="rounded border border-red-200 px-2 text-xs text-red-400 hover:bg-red-50">삭제</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { text: "", result: "예정" }])} className={ADD_BTN}>{addLabel}</button>
    </div>
  );
}

function AccidentForm({ a, patch }: { a: AccidentFields; patch: (p: Partial<AccidentFields>) => void }) {
  return (
    <>
      <Card title="1. 핵심 요약" hint="요약 칸 4개. 발생 일시·장소를 비우면 아래 사고 개요 값이 들어갑니다.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="발생 일시(짧게)" value={a.sumTime} onChange={(v) => patch({ sumTime: v })} ph="08.28 (금) 08:36" />
          <Field label="발생 장소(짧게)" value={a.sumPlace} onChange={(v) => patch({ sumPlace: v })} ph="제넥신 9층 A코어" />
          <Field label="피해 규모" value={a.sumDamage} onChange={(v) => patch({ sumDamage: v })} ph="없음" />
          <Field label="임시조치 완료" value={a.sumTemp} onChange={(v) => patch({ sumTemp: v })} ph="09:30 (54분)" />
        </div>
      </Card>

      <Card title="2. 사고 개요">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="발생 일시" value={a.occurredAt} onChange={(v) => patch({ occurredAt: v })} ph="2026년 8월 28일(금) 08시 36분경" />
          <Field label="발생 장소" value={a.place} onChange={(v) => patch({ place: v })} ph="제넥신 9층 A코어 승강기홀" />
        </div>
        <Field label="발생 원인" value={a.cause} onChange={(v) => patch({ cause: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="영향 범위" value={a.scope} onChange={(v) => patch({ scope: v })} ph="9층 A코어 승강기홀 일부 구역" />
          <Field label="신고 경로" value={a.reportPath} onChange={(v) => patch({ reportPath: v })} ph="입주사 직접 민원 — 제넥신 9층 김상진 부장" />
        </div>
      </Card>

      <Card title="3. 피해 현황" hint="'없음'이면 초록, 피해가 있으면 빨강으로 표시됩니다.">
        <div className="grid grid-cols-3 gap-3">
          <Field label="인적 피해" value={a.humanDamage} onChange={(v) => patch({ humanDamage: v })} />
          <Field label="물적 피해" value={a.propertyDamage} onChange={(v) => patch({ propertyDamage: v })} />
          <Field label="피해 금액" value={a.damageCost} onChange={(v) => patch({ damageCost: v })} />
        </div>
        <Field label="비고(※) — 비우면 생략" value={a.damageNote} onChange={(v) => patch({ damageNote: v })} ph="설비 손상 및 기능 저하 없음. 입주사 업무 중단 사례 없음." />
      </Card>

      <Card title="4. 조치 사항 및 경과" hint="행마다 시각·구분·조치 내용·담당. 구분 색은 자동(접수 주황·현장확인 파랑·임시조치 초록…).">
        <TimelineEditor rows={a.timeline} onChange={(timeline) => patch({ timeline })} />
      </Card>

      <Card title="5. 조치 계획 및 재발 방지 대책" hint="결과 색: 진행중 파랑·예정 주황·검토 회색·완료 초록.">
        <p className="text-xs font-semibold text-slate-600">조치 및 계획</p>
        <PlanEditor rows={a.plans} onChange={(plans) => patch({ plans })} addLabel="＋ 조치 계획 추가" />
        <p className="pt-2 text-xs font-semibold text-slate-600">재발 방지 대책</p>
        <PlanEditor rows={a.prevents} onChange={(prevents) => patch({ prevents })} addLabel="＋ 재발 방지 대책 추가" />
      </Card>
    </>
  );
}
