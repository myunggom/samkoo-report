"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { PungReport, PungSection, PungSlot } from "@/lib/pungsuhae";
import { dotDate, pungFileName } from "@/lib/pungsuhae";
import { uploadPhoto } from "@/lib/client";
import { shareOrDownloadPdf, shareOrDownloadFile } from "@/lib/pdf";
import { generatePungReportDocx } from "@/lib/docxExport";
import { docxBlobToPdfBlob } from "@/lib/docxToPdf";
import ArchivePicker from "@/components/ArchivePicker";

export default function PungsuhaeEditor({ initial }: { initial: PungReport }) {
  const router = useRouter();
  const [report, setReport] = useState<PungReport>(initial);
  const [active, setActive] = useState(0);
  const [editTabs, setEditTabs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState<{ si: number; i: number } | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const albumMultiRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ si: number; i: number } | null>(null);
  const fillTarget = useRef<number | null>(null); // 여러 장 채우기 대상 구간

  const sections = report.sections;
  const section = sections[Math.min(active, sections.length - 1)] as PungSection | undefined;

  // ── 불변 업데이트 헬퍼 ──────────────────────────────
  function patch(p: Partial<PungReport>) {
    setReport((r) => ({ ...r, ...p }));
  }
  function updateSection(si: number, up: (s: PungSection) => PungSection) {
    setReport((r) => {
      const next = r.sections.slice();
      next[si] = up(next[si]);
      return { ...r, sections: next };
    });
  }
  function updateSlot(si: number, i: number, up: (s: PungSlot) => PungSlot) {
    updateSection(si, (s) => {
      const slots = s.slots.slice();
      slots[i] = up(slots[i]);
      return { ...s, slots };
    });
  }

  // ── 사진 업로드 ─────────────────────────────────────
  async function handleFiles(files: FileList | null, ref: React.RefObject<HTMLInputElement | null>) {
    const t = target.current;
    if (!files || files.length === 0 || !t) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(files[0]);
      updateSlot(t.si, t.i, (s) => ({ ...s, url }));
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }
  function pick(si: number, i: number, mode: "camera" | "gallery") {
    target.current = { si, i };
    (mode === "camera" ? cameraRef : galleryRef).current?.click();
  }

  // 앨범에서 여러 장 → 왼쪽 칸부터 순서대로 채움 (부족한 칸은 자동 추가)
  function pickMulti(si: number) {
    fillTarget.current = si;
    albumMultiRef.current?.click();
  }
  async function fillFromAlbum(files: FileList | null) {
    const si = fillTarget.current;
    if (files == null || files.length === 0 || si == null) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await uploadPhoto(f));
      updateSection(si, (s) => {
        const slots = s.slots.slice();
        urls.forEach((url, idx) => {
          if (idx < slots.length) slots[idx] = { ...slots[idx], url };
          else slots.push({ url, caption: "", defaultCaption: "" });
        });
        return { ...s, slots };
      });
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (albumMultiRef.current) albumMultiRef.current.value = "";
    }
  }

  // ── 구간(탭) 편집 ───────────────────────────────────
  function addSlot(si: number) {
    updateSection(si, (s) => ({ ...s, slots: [...s.slots, { url: "", caption: "", defaultCaption: "" }] }));
  }
  function removeSlot(si: number, i: number) {
    updateSection(si, (s) => ({ ...s, slots: s.slots.filter((_, idx) => idx !== i) }));
  }
  function addSection() {
    const id = `sec-${Date.now().toString(36)}`;
    setReport((r) => ({
      ...r,
      sections: [
        ...r.sections,
        { id, title: "새 구간", slots: [ { url: "", caption: "", defaultCaption: "" }, { url: "", caption: "", defaultCaption: "" }, { url: "", caption: "", defaultCaption: "" } ] },
      ],
    }));
    setActive(report.sections.length);
  }
  function removeSection(si: number) {
    if (!confirm("이 구간을 삭제할까요?")) return;
    setReport((r) => ({ ...r, sections: r.sections.filter((_, idx) => idx !== si) }));
    setActive((a) => Math.max(0, a - (si <= a ? 1 : 0)));
  }

  // ── 저장 ────────────────────────────────────────────
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/pungsuhae/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error();
      const saved: PungReport = await res.json();
      setReport(saved);
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // ── 삭제 ────────────────────────────────────────────
  async function remove() {
    if (!confirm("이 보고서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      const res = await fetch(`/api/pungsuhae/${report.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/pungsuhae");
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }

  // ── 워드 출력 (원본 양식 채우기) ──────────────────────
  async function exportWord() {
    setExportingWord(true);
    try {
      await save();
      const blob = await generatePungReportDocx(report);
      const name = pungFileName(report).replace(/\.pdf$/, ".docx");
      await shareOrDownloadFile(blob, name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `풍수해 예방 점검 보고서 (${dotDate(report.date)})`);
    } catch {
      alert("워드 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExportingWord(false);
    }
  }
  // ── PDF 출력 (워드 파일을 만든 뒤 PDF로 변환) ──────────
  async function exportPdf() {
    setExporting(true);
    try {
      await save();
      const docxBlob = await generatePungReportDocx(report);
      const pdfBlob = await docxBlobToPdfBlob(docxBlob);
      await shareOrDownloadPdf(pdfBlob, pungFileName(report), `풍수해 예방 점검 보고서 (${dotDate(report.date)})`);
    } catch {
      alert("PDF 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 상단 정보 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-slate-900">풍수해 예방 점검 보고서</h1>
          <button
            onClick={remove}
            className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">점검일자 (작성일)</span>
            <input
              type="date"
              value={report.date}
              onChange={(e) => patch({ date: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">사업장명</span>
            <input
              value={report.site}
              onChange={(e) => patch({ site: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">점검자 (비워두면 공란 출력)</span>
            <input
              value={report.inspector}
              onChange={(e) => patch({ inspector: e.target.value })}
              placeholder="(비워둠)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          PDF 파일명: <span className="font-medium text-slate-500">{pungFileName(report)}</span>
        </p>
      </div>

      {/* 구간 탭 */}
      <div>
        <div className="flex items-center justify-between">
          <div className="-mb-px flex flex-wrap gap-1 overflow-x-auto border-b border-slate-200">
            {sections.map((s, si) => (
              <button
                key={s.id}
                onClick={() => setActive(si)}
                className={
                  "shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition " +
                  (si === active
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-400 hover:text-slate-600")
                }
              >
                {s.title || "(제목 없음)"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditTabs((v) => !v)}
            className="ml-2 shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            {editTabs ? "편집 완료" : "구간 편집"}
          </button>
        </div>

        {editTabs && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
            <span className="text-slate-500">구간 관리:</span>
            <button onClick={addSection} className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100">
              + 구간 추가
            </button>
            {section && sections.length > 1 && (
              <button
                onClick={() => removeSection(active)}
                className="rounded border border-red-200 bg-white px-2 py-1 text-red-500 hover:bg-red-50"
              >
                현재 구간 삭제
              </button>
            )}
          </div>
        )}
      </div>

      {/* 활성 구간의 사진 칸 */}
      {section && (
        <div className="space-y-3">
          {editTabs && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">구간명</span>
              <input
                value={section.title}
                onChange={(e) => updateSection(active, (s) => ({ ...s, title: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          {/* 앨범에서 여러 장 → 왼쪽부터 순서대로 */}
          <button
            onClick={() => pickMulti(active)}
            disabled={uploading}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            🖼 앨범에서 여러 장 — 왼쪽 칸부터 순서대로 채우기
          </button>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {section.slots.map((slot, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-2">
                <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  <div className="relative aspect-[4/3] w-full">
                    {slot.url ? (
                      <Image src={slot.url} alt={slot.defaultCaption || `사진 ${i + 1}`} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-slate-300">
                        <span className="text-center text-xs">사진 없음</span>
                      </div>
                    )}
                  </div>
                  {slot.url && (
                    <button
                      onClick={() => updateSlot(active, i, (s) => ({ ...s, url: "" }))}
                      className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
                      title="사진 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => pick(active, i, "camera")}
                    disabled={uploading}
                    className="rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    📷 촬영
                  </button>
                  <button
                    onClick={() => pick(active, i, "gallery")}
                    disabled={uploading}
                    className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    🖼 앨범
                  </button>
                  <button
                    onClick={() => setPicking({ si: active, i })}
                    disabled={uploading}
                    className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    🗂 아카이브
                  </button>
                </div>

                <input
                  value={slot.caption ?? ""}
                  onChange={(e) => updateSlot(active, i, (s) => ({ ...s, caption: e.target.value }))}
                  placeholder={slot.defaultCaption || "설명 입력"}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                />

                {editTabs && (
                  <div className="mt-1.5 flex justify-between text-xs">
                    <input
                      value={slot.defaultCaption ?? ""}
                      onChange={(e) => updateSlot(active, i, (s) => ({ ...s, defaultCaption: e.target.value }))}
                      placeholder="기본 설명(회색)"
                      className="mr-1 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-500"
                    />
                    <button
                      onClick={() => removeSlot(active, i)}
                      className="shrink-0 rounded border border-red-200 px-1.5 py-1 text-red-400 hover:bg-red-50"
                    >
                      칸삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {editTabs && (
            <button
              onClick={() => addSlot(active)}
              className="w-full rounded-lg border-2 border-dashed border-slate-300 py-2 text-xs text-slate-400 hover:border-slate-400 hover:bg-slate-50"
            >
              ＋ 사진 칸 추가
            </button>
          )}

          <p className="text-xs text-slate-400">
            💡 설명을 비워두면 회색 <b>기본 문구</b>가 그대로 출력됩니다. 내용을 적으면 그 값으로 덮어씁니다.
          </p>
        </div>
      )}

      {/* 액션 */}
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{savedAt ? `저장됨 · ${savedAt}` : uploading ? "업로드 중…" : ""}</span>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              onClick={exportWord}
              disabled={exportingWord}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {exportingWord ? "만드는 중…" : "워드로 출력"}
            </button>
            <button
              onClick={exportPdf}
              disabled={exporting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {exporting ? "만드는 중…" : "PDF로 출력"}
            </button>
          </div>
        </div>
      </div>

      {/* 숨은 파일 입력 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, cameraRef)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, galleryRef)}
      />
      <input
        ref={albumMultiRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => fillFromAlbum(e.target.files)}
      />

      {/* 아카이브에서 사진 선택 */}
      {picking && (
        <ArchivePicker
          onClose={() => setPicking(null)}
          onPick={(m) => {
            updateSlot(picking.si, picking.i, (s) => ({ ...s, url: m.url }));
            setPicking(null);
          }}
        />
      )}

    </div>
  );
}
