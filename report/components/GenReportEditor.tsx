"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GenReport, ReportTextSection, AccidentFields } from "@/lib/reports";
import { KIND_LABEL, layoutOf, reportFileName } from "@/lib/reports";
import { elementToPdfBlobFlow, shareOrDownloadPdf, shareOrDownloadFile } from "@/lib/pdf";
import { generateReportDocx } from "@/lib/docxExport";
import { generateReportPptx } from "@/lib/pptxExport";
import ReportPhotoField from "@/components/ReportPhotoField";
import GenReportDocument from "@/components/GenReportDocument";

export default function GenReportEditor({ initial }: { initial: GenReport }) {
  const router = useRouter();
  const [r, setR] = useState<GenReport>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingPpt, setExportingPpt] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
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

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      if (!res.ok) throw new Error();
      setR(await res.json());
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      alert("저장에 실패했습니다.");
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
  async function exportPdf() {
    setExporting(true);
    try {
      await save();
      await new Promise((res) => setTimeout(res, 50));
      if (!docRef.current) throw new Error();
      const blob = await elementToPdfBlobFlow(docRef.current, { orientation: "portrait" });
      await shareOrDownloadPdf(blob, reportFileName(r), reportFileName(r).replace(/\.pdf$/, ""));
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
  async function exportPpt() {
    setExportingPpt(true);
    try {
      await save();
      const blob = await generateReportPptx(r);
      const name = reportFileName(r).replace(/\.pdf$/, ".pptx");
      await shareOrDownloadFile(blob, name, "application/vnd.openxmlformats-officedocument.presentationml.presentation", name.replace(/\.pptx$/, ""));
    } catch {
      alert("PPT 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExportingPpt(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      {/* 헤더/파일명 정보 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">
            <span className="mr-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{KIND_LABEL[r.kind]}</span>
            보고서 작성
          </h1>
          <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50">삭제</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">제목 [ ] 내용</span>
            <input value={r.bracket} onChange={(e) => patch({ bracket: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">대상/사업장</span>
            <input value={r.site} onChange={(e) => patch({ site: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">제목 요약(파일명)</span>
            <input value={r.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder="예: 10층 EHP 누수" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">작성일</span>
            <input type="date" value={r.date} onChange={(e) => patch({ date: e.target.value })} className={field} />
          </label>
        </div>
        {layout === "common" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">문서 상단 큰 제목</span>
            <input value={r.docTitle} onChange={(e) => patch({ docTitle: e.target.value })} placeholder="예: 10층 직원휴게실 EHP 점검 완료 보고서" className={field} />
          </label>
        )}
        <p className="mt-2 text-xs text-slate-400">
          PDF 파일명: <span className="font-medium text-slate-500">{reportFileName(r)}</span>
        </p>
      </div>

      {/* 본문 */}
      {layout === "common" ? (
        <div className="space-y-3">
          {r.sections.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-400">{i + 1}.</span>
                <input value={s.heading} onChange={(e) => updateSection(i, { heading: e.target.value })} placeholder="소제목" className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold" />
                <button onClick={() => removeSection(i)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-400 hover:bg-red-50">삭제</button>
              </div>
              <textarea value={s.body} onChange={(e) => updateSection(i, { body: e.target.value })} rows={3} placeholder="내용을 입력하세요" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          ))}
          <button onClick={addSection} className="w-full rounded-lg border-2 border-dashed border-slate-300 py-2 text-xs text-slate-400 hover:border-slate-400 hover:bg-slate-50">＋ 항목 추가</button>
        </div>
      ) : (
        <AccidentForm a={r.accident} patch={patchAccident} />
      )}

      {/* 첨부사진 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-slate-800">첨부사진</h2>
        <ReportPhotoField photos={r.photos} onChange={(photos) => patch({ photos })} />
      </div>

      {/* 액션 */}
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{savedAt ? `저장됨 · ${savedAt}` : ""}</span>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {saving ? "저장 중…" : "저장"}
            </button>
            <button onClick={exportPdf} disabled={exporting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {exporting ? "만드는 중…" : "PDF로 출력"}
            </button>
            <button onClick={exportWord} disabled={exportingWord} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50">
              {exportingWord ? "만드는 중…" : "워드로 출력"}
            </button>
            <button onClick={exportPpt} disabled={exportingPpt} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50">
              {exportingPpt ? "만드는 중…" : "PPT로 출력"}
            </button>
          </div>
        </div>
      </div>

      {/* PDF 캡처용 오프스크린 문서 */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <div ref={docRef}>
          <GenReportDocument report={r} />
        </div>
      </div>
    </div>
  );
}

// 모듈 레벨 컴포넌트로 분리 — 렌더마다 새로 정의되면 입력 시 포커스가 빠져 1글자만 입력되는 버그가 생김
const ACC_FIELD_CLASS = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
function AccField({ value, onChange, label, ph }: { value: string; onChange: (v: string) => void; label: string; ph?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} className={ACC_FIELD_CLASS} />
    </label>
  );
}

function AccidentForm({ a, patch }: { a: AccidentFields; patch: (p: Partial<AccidentFields>) => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <AccField value={a.reporter} onChange={(v) => patch({ reporter: v })} label="보고자" ph="예: 시설팀장 이명진" />
        <AccField value={a.title} onChange={(v) => patch({ title: v })} label="제목(사고 개요)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AccField value={a.occurredAt} onChange={(v) => patch({ occurredAt: v })} label="발생 일시" />
        <AccField value={a.place} onChange={(v) => patch({ place: v })} label="발생 장소" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AccField value={a.cause} onChange={(v) => patch({ cause: v })} label="발생 원인" />
        <AccField value={a.scope} onChange={(v) => patch({ scope: v })} label="피해 범위" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <AccField value={a.humanDamage} onChange={(v) => patch({ humanDamage: v })} label="인적 피해" />
        <AccField value={a.propertyDamage} onChange={(v) => patch({ propertyDamage: v })} label="물적 피해" />
        <AccField value={a.damageCost} onChange={(v) => patch({ damageCost: v })} label="피해액" />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">조치 사항 및 경과</span>
        <textarea value={a.actions} onChange={(e) => patch({ actions: e.target.value })} rows={5} placeholder={"예:\n1) 10:48 누수 확인\n2) 10:49 보고"} className={ACC_FIELD_CLASS} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">대응 적합성 및 향후 방안</span>
        <textarea value={a.followup} onChange={(e) => patch({ followup: e.target.value })} rows={3} className={ACC_FIELD_CLASS} />
      </label>
    </div>
  );
}
