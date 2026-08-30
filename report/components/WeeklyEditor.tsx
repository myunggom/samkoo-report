"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { WeeklyDraft, WeeklyWork, 공종 } from "@/lib/weekly";
import { 공종목록, emptyWork, defectDisplay, defectTotals, normalizeDraft, foldWeek, todayBaseDate } from "@/lib/weekly";
import { uploadPhoto } from "@/lib/client";
import { generateWeeklyPptx, type WorkPhrase } from "@/lib/weeklyPptxTemplate";
import { shareOrDownloadFile } from "@/lib/pdf";
import ArchivePicker from "@/components/ArchivePicker";

type Phrase = { 본문: string };

export default function WeeklyEditor({ initial }: { initial: WeeklyDraft }) {
  const router = useRouter();
  // 기준일은 항상 오늘(작성일)로 시작 — yyyy.mm.dd (요일) 기준
  const [draft, setDraft] = useState<WeeklyDraft>(() => ({ ...normalizeDraft(initial), baseDate: todayBaseDate() }));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [phrases, setPhrases] = useState<Record<string, Phrase> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  function patch(p: Partial<WeeklyDraft>) {
    setDraft((prev) => ({ ...prev, ...p }));
  }
  function patchDefect(k: 공종, field: "발행" | "누적" | "이번주", value: number) {
    setDraft((prev) => ({ ...prev, defects: { ...prev.defects, [k]: { ...prev.defects[k], [field]: value } } }));
  }
  function patchWork(id: string, p: Partial<WeeklyWork>) {
    setDraft((prev) => ({ ...prev, works: prev.works.map((w) => (w.id === id ? { ...w, ...p } : w)) }));
  }
  function addWork() {
    setDraft((prev) => ({ ...prev, works: [...prev.works, emptyWork()] }));
  }
  function removeWork(id: string) {
    if (!confirm("이 작업 항목을 삭제할까요?")) return;
    setDraft((prev) => ({ ...prev, works: prev.works.filter((w) => w.id !== id) }));
  }

  async function save(next?: WeeklyDraft) {
    const body = next || draft;
    setSaving(true);
    try {
      const res = await fetch("/api/weekly", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // 이번 주 치유를 누적에 반영하고 이번주=0으로 → 다음 주부터는 증가분만 입력
  async function foldThisWeek() {
    if (!confirm("이번 주 치유 수를 '누적'에 더하고 이번 주 칸을 비웁니다.\n(PPT를 이미 뽑으셨다면 눌러 다음 주를 준비하세요.) 진행할까요?")) return;
    const nextDefects = foldWeek(draft.defects);
    const next = { ...draft, defects: nextDefects };
    setDraft(next);
    await save(next);
  }

  async function logout() {
    await fetch("/api/weekly/auth", { method: "DELETE" });
    router.push("/weekly-report/login");
    router.refresh();
  }

  async function generatePhrases() {
    setGenerating(true);
    try {
      await save();
      const payload = {
        works: draft.works.map((w) => ({ id: w.id, title: w.title, memo: w.memo, captions: w.photos.map((p) => p.caption || "").filter(Boolean) })),
      };
      const res = await fetch("/api/weekly/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "문구 생성에 실패했습니다.");
        return;
      }
      const map: Record<string, Phrase> = {};
      (data.items || []).forEach((r: { id: string; 본문?: string }) => {
        map[r.id] = { 본문: r.본문 || "" };
      });
      setPhrases(map);
    } catch {
      alert("문구 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }
  function patchPhrase(id: string, 본문: string) {
    setPhrases((prev) => ({ ...(prev || {}), [id]: { 본문 } }));
  }

  async function exportPptx() {
    setExporting(true);
    try {
      await save();
      const phraseMap: Record<string, WorkPhrase> = {};
      if (phrases) for (const [id, ph] of Object.entries(phrases)) phraseMap[id] = { 본문: ph.본문 };
      const blob = await generateWeeklyPptx(draft, phraseMap);
      const name = `[주간업무자료] 바이오 이노베이션 허브_${draft.period.replace(/[.\s~]+/g, "_").replace(/_+/g, "_")}.pptx`;
      await shareOrDownloadFile(blob, name, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "주간 업무보고");
    } catch {
      alert("PPT 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  const totals = defectTotals(draft.defects);
  const totDisp = defectDisplay(totals);
  const numCls = "w-full rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">🔒 주간 업무보고</h1>
          <p className="text-xs text-slate-500">원본 양식 그대로 PPT를 만들어 드립니다. (사장님 전용)</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">로그아웃</button>
      </div>

      {/* 기간/기준일 */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">표지 기간</span>
          <input value={draft.period} onChange={(e) => patch({ period: e.target.value })} placeholder="2026.08.25 ~ 08.29" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">하자리스트 기준일</span>
          <input value={draft.baseDate} onChange={(e) => patch({ baseDate: e.target.value })} placeholder="2026.08.29 (금) 기준" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>

      {/* 하자리스트 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-bold text-slate-800">01 하자리스트 <span className="text-xs font-normal text-slate-400">(필수)</span></h2>
        <p className="mb-3 text-xs text-slate-500">발행 수·지난주까지 누적은 저장돼 다음 주에 그대로 불러옵니다. <b>매주 ‘이번 주 치유’만 입력</b>하면 누적·진행률이 자동 계산됩니다.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-2 py-1.5 text-left">공종</th>
                <th className="px-2 py-1.5 text-right">하자 발행 수</th>
                <th className="px-2 py-1.5 text-right">지난주까지 누적</th>
                <th className="px-2 py-1.5 text-right text-red-500">이번 주 치유 +</th>
                <th className="px-2 py-1.5 text-right">누적(자동)</th>
                <th className="px-2 py-1.5 text-right">진행률(자동)</th>
              </tr>
            </thead>
            <tbody>
              {공종목록.map((k) => {
                const d = defectDisplay(draft.defects[k]);
                return (
                  <tr key={k} className="border-b border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-700">{k}</td>
                    <td className="px-2 py-1"><input type="number" min={0} value={draft.defects[k].발행 || ""} onChange={(e) => patchDefect(k, "발행", Math.max(0, Math.floor(Number(e.target.value) || 0)))} className={numCls} /></td>
                    <td className="px-2 py-1"><input type="number" min={0} value={draft.defects[k].누적 || ""} onChange={(e) => patchDefect(k, "누적", Math.max(0, Math.floor(Number(e.target.value) || 0)))} className={numCls} /></td>
                    <td className="px-2 py-1"><input type="number" min={0} value={draft.defects[k].이번주 || ""} onChange={(e) => patchDefect(k, "이번주", Math.max(0, Math.floor(Number(e.target.value) || 0)))} className={numCls + " text-red-600"} /></td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700">{d.누적}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{d.진행률}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-2 py-1.5 text-slate-800">합 계</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{totDisp.발행}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{totals.누적.toLocaleString("en-US")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-red-600">{totals.이번주 > 0 ? totals.이번주.toLocaleString("en-US") : ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{totDisp.누적}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{totDisp.진행률}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">PPT의 ‘누적’ 열 = 지난주까지 누적 + 이번 주 치유</p>
          <button onClick={foldThisWeek} className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
            📌 이번 주 치유를 누적에 반영 (다음 주 준비)
          </button>
        </div>
      </div>

      {/* 작업 항목 */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-800">작업 / 특이사항 <span className="text-xs font-normal text-slate-400">(항목마다 슬라이드 1장 · 사진 2장)</span></h2>
        <div className="space-y-4">
          {draft.works.map((w, idx) => (
            <WorkCard key={w.id} index={idx} work={w} onPatch={patchWork} onRemove={removeWork} canRemove={draft.works.length > 1} />
          ))}
        </div>
        <button onClick={addWork} className="mt-3 w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm text-slate-400 hover:border-slate-400 hover:bg-slate-50">＋ 작업 항목 추가</button>
      </div>

      {/* AI 문구 + 생성 */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
        <h2 className="mb-1 text-sm font-bold text-indigo-900">🤖 AI 문구 정리 · PPT 만들기</h2>
        <p className="mb-3 text-xs text-slate-500">메모를 발표용 본문으로 정리합니다. 확인·수정 후 PPT로 내려받으세요. (문구 없이 바로 PPT도 가능 — 그때는 메모가 그대로 들어갑니다)</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={generatePhrases} disabled={generating} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {generating ? "AI가 정리 중…" : "🤖 문구 생성"}
          </button>
          <button onClick={exportPptx} disabled={exporting} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50">
            {exporting ? "PPT 만드는 중…" : "📊 PPT 다운로드"}
          </button>
        </div>

        {phrases && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-500">자유롭게 수정하세요. <b># 로 시작하는 줄</b>은 볼드 제목, <b>- 로 시작하는 줄</b>은 항목으로 들어갑니다.</p>
            {draft.works.map((w, idx) => (
              <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 text-sm font-semibold text-slate-700">{idx + 1}. {w.title || "(제목 없음)"}</div>
                <label className="mb-1 block text-xs font-medium text-slate-400">본문(줄바꿈으로 여러 줄)</label>
                <textarea value={phrases[w.id]?.본문 ?? ""} onChange={(e) => patchPhrase(w.id, e.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{savedAt ? `저장됨 · ${savedAt}` : "아직 저장 안 됨"}</span>
          <button onClick={() => save()} disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkCard({
  index,
  work,
  onPatch,
  onRemove,
  canRemove,
}: {
  index: number;
  work: WeeklyWork;
  onPatch: (id: string, p: Partial<WeeklyWork>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null, ref: React.RefObject<HTMLInputElement | null>) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const added = [];
      for (const f of Array.from(files)) {
        const url = await uploadPhoto(f);
        added.push({ url, caption: "" });
      }
      onPatch(work.id, { photos: [...work.photos, ...added] });
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }
  function setCaption(i: number, caption: string) {
    const copy = work.photos.slice();
    copy[i] = { ...copy[i], caption };
    onPatch(work.id, { photos: copy });
  }
  function removePhoto(i: number) {
    onPatch(work.id, { photos: work.photos.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
        <input value={work.title} onChange={(e) => onPatch(work.id, { title: e.target.value })} placeholder="주제 (예: 3층 전기실 누수 보수)" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-slate-300" />
        {canRemove && <button onClick={() => onRemove(work.id)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50">삭제</button>}
      </div>

      <textarea value={work.memo} onChange={(e) => onPatch(work.id, { memo: e.target.value })} rows={4} placeholder="작업 내용 메모 — 줄바꿈(엔터)하면 슬라이드에도 줄이 나뉘어 들어갑니다. (AI 정리도 가능)" className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300" />

      {work.photos.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {work.photos.map((p, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-2">
              <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                <div className="relative aspect-[2/1] w-full">
                  <Image src={p.url} alt={p.caption || `사진 ${i + 1}`} fill className="object-cover" unoptimized />
                </div>
                <button onClick={() => removePhoto(i)} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80" title="삭제">×</button>
                <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">{i + 1}</span>
              </div>
              <input value={p.caption ?? ""} onChange={(e) => setCaption(i, e.target.value)} placeholder="사진 설명" className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300" />
            </div>
          ))}
        </div>
      )}
      <p className="mb-2 text-[11px] text-slate-400">사진은 앞에서부터 2장이 슬라이드에 들어갑니다. (2장 권장, 더 넣어도 됨)</p>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">📷 촬영</button>
        <button onClick={() => albumRef.current?.click()} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">🖼 앨범</button>
        <button onClick={() => setPickerOpen(true)} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">🗂 아카이브</button>
      </div>
      {uploading && <p className="mt-2 text-center text-xs text-slate-400">업로드 중…</p>}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files, cameraRef)} />
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files, albumRef)} />

      {pickerOpen && (
        <ArchivePicker
          onClose={() => setPickerOpen(false)}
          onPick={(m) => {
            onPatch(work.id, { photos: [...work.photos, { url: m.url, caption: m.title || m.note || "" }] });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
