"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  LAYOUTS,
  LAYOUT_CAP,
  LAYOUT_LABEL,
  LAYOUT_NOTE_LABEL,
  SITES,
  SITE_BUILDING,
  SITE_COVER,
  emptyPage,
  manualFileName,
  stepStarts,
  totalSteps,
  type Manual,
  type ManualLayout,
  type ManualPage,
  type ManualStep,
  type Site,
} from "@/lib/manual";
import { uploadPhoto } from "@/lib/client";
import { shareOrDownloadFile, shareOrDownloadPdf, elementToPdfBlob } from "@/lib/pdf";
import { buildManualPptx } from "@/lib/manualPptx";
import ManualDocument from "@/components/ManualDocument";
import ArchivePicker from "@/components/ArchivePicker";

const PPT_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function ManualEditor({ initial }: { initial: Manual }) {
  const router = useRouter();
  const [m, setM] = useState<Manual>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "pdf" | "ppt">("");
  const [preview, setPreview] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const starts = stepStarts(m.pages);
  const total = totalSteps(m.pages);

  function patch(p: Partial<Manual>) {
    setM((prev) => ({ ...prev, ...p }));
  }
  function patchPage(i: number, p: Partial<ManualPage>) {
    setM((prev) => {
      const pages = prev.pages.slice();
      pages[i] = { ...pages[i], ...p };
      return { ...prev, pages };
    });
  }

  // ── 사진 ─────────────────────────────────────────────────────────
  // 한 쪽에 들어가는 수를 넘기면 바로 뒤에 같은 틀의 쪽을 만들어 이어 담는다.
  function addPhotos(pageIdx: number, items: ManualStep[]) {
    setM((prev) => {
      const pages = prev.pages.slice();
      const base = pages[pageIdx];
      const cap = LAYOUT_CAP[base.layout];
      const queue = items.slice();
      const room = Math.max(0, cap - base.steps.length);
      pages[pageIdx] = { ...base, steps: [...base.steps, ...queue.splice(0, room)] };
      const extra: ManualPage[] = [];
      while (queue.length) {
        const p = emptyPage(base.layout, "");
        p.steps = queue.splice(0, cap);
        extra.push(p);
      }
      if (extra.length) pages.splice(pageIdx + 1, 0, ...extra);
      return { ...prev, pages };
    });
  }

  function setCaption(pageIdx: number, i: number, caption: string) {
    setM((prev) => {
      const pages = prev.pages.slice();
      const steps = pages[pageIdx].steps.slice();
      steps[i] = { ...steps[i], caption };
      pages[pageIdx] = { ...pages[pageIdx], steps };
      return { ...prev, pages };
    });
  }

  function removeStep(pageIdx: number, i: number) {
    setM((prev) => {
      const pages = prev.pages.slice();
      pages[pageIdx] = { ...pages[pageIdx], steps: pages[pageIdx].steps.filter((_, k) => k !== i) };
      return { ...prev, pages };
    });
  }

  /** 번호 순서상 앞/뒤 사진과 자리를 바꾼다 (쪽을 넘어가도 된다) */
  function moveStep(pageIdx: number, i: number, dir: -1 | 1) {
    setM((prev) => {
      const flat: { p: number; i: number }[] = [];
      prev.pages.forEach((pg, pi) => pg.steps.forEach((_, si) => flat.push({ p: pi, i: si })));
      const at = flat.findIndex((f) => f.p === pageIdx && f.i === i);
      const to = at + dir;
      if (at < 0 || to < 0 || to >= flat.length) return prev;
      const a = flat[at];
      const b = flat[to];
      const pages = prev.pages.map((pg) => ({ ...pg, steps: pg.steps.slice() }));
      const tmp = pages[a.p].steps[a.i];
      pages[a.p].steps[a.i] = pages[b.p].steps[b.i];
      pages[b.p].steps[b.i] = tmp;
      return { ...prev, pages };
    });
  }

  // ── 쪽 ───────────────────────────────────────────────────────────
  function addPage() {
    setM((prev) => ({ ...prev, pages: [...prev.pages, emptyPage(prev.pages[prev.pages.length - 1]?.layout ?? "3x2", "")] }));
  }
  function removePage(i: number) {
    if (m.pages.length <= 1) {
      alert("쪽은 하나는 있어야 합니다.");
      return;
    }
    if (!confirm(`${i + 1}쪽을 삭제할까요? 그 쪽의 사진도 함께 빠집니다.`)) return;
    setM((prev) => ({ ...prev, pages: prev.pages.filter((_, k) => k !== i) }));
  }
  function movePage(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= m.pages.length) return;
    setM((prev) => {
      const pages = prev.pages.slice();
      [pages[i], pages[to]] = [pages[to], pages[i]];
      return { ...prev, pages };
    });
  }
  /** 사진 배열을 바꾼다. 넘치는 사진은 바로 뒤 새 쪽으로 넘긴다. */
  function setLayout(i: number, layout: ManualLayout) {
    setM((prev) => {
      const pages = prev.pages.slice();
      const cur = pages[i];
      const cap = LAYOUT_CAP[layout];
      const keep = cur.steps.slice(0, cap);
      const over = cur.steps.slice(cap);
      pages[i] = { ...cur, layout, steps: keep };
      const extra: ManualPage[] = [];
      const rest = over.slice();
      while (rest.length) {
        const p = emptyPage(layout, "");
        p.steps = rest.splice(0, cap);
        extra.push(p);
      }
      if (extra.length) pages.splice(i + 1, 0, ...extra);
      return { ...prev, pages };
    });
  }

  function setSite(site: Site) {
    setM((prev) => ({
      ...prev,
      site,
      // 건물명을 손대지 않았으면 사옥에 맞춰 같이 바꾼다
      building: prev.building === SITE_BUILDING[prev.site] ? SITE_BUILDING[site] : prev.building,
    }));
  }

  // ── 저장 · 출력 ──────────────────────────────────────────────────
  async function save(): Promise<Manual | null> {
    setSaving(true);
    try {
      const res = await fetch(`/api/manuals/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(m),
      });
      if (!res.ok) throw new Error();
      const saved: Manual = await res.json();
      setM(saved);
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
    if (!confirm("이 매뉴얼을 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await fetch(`/api/manuals/${m.id}`, { method: "DELETE" });
      router.push("/manuals");
    } catch {
      alert("삭제에 실패했습니다.");
    }
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      await save();
      if (!docRef.current) throw new Error("문서 없음");
      const blob = await elementToPdfBlob(docRef.current, { orientation: "landscape", pageSelector: ".pdf-page" });
      const name = manualFileName(m, "pdf");
      await shareOrDownloadPdf(blob, name, name.replace(/\.pdf$/, ""));
    } catch {
      alert("PDF 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  async function exportPptx() {
    setBusy("ppt");
    try {
      await save();
      const { blob, fileName } = await buildManualPptx(m);
      await shareOrDownloadFile(blob, fileName, PPT_MIME, fileName.replace(/\.pptx$/, ""));
    } catch {
      alert("PPT 출력에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      {/* ── 기본 정보 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">
            <span className="mr-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">매뉴얼</span>
            작동 매뉴얼 작성
          </h1>
          <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50">
            삭제
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">매뉴얼 이름</span>
            <input value={m.title} onChange={(e) => patch({ title: e.target.value })} placeholder="예: 냉각탑 수동 운전" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">대상 설비</span>
            <input value={m.equipment} onChange={(e) => patch({ equipment: e.target.value })} placeholder="예: 냉각탑 1호기" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">설치 위치</span>
            <input value={m.location} onChange={(e) => patch({ location: e.target.value })} placeholder="예: 옥상 기계실" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">구분</span>
            <input value={m.category} onChange={(e) => patch({ category: e.target.value })} placeholder="예: 기계설비 운전" className={field} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">사옥 (표지 사진)</span>
            <select value={m.site} onChange={(e) => setSite(e.target.value as Site)} className={field}>
              {SITES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-500">건물명 (표지 맨 윗줄)</span>
            <input value={m.building} onChange={(e) => patch({ building: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">작성일</span>
            <input type="date" value={m.date} onChange={(e) => patch({ date: e.target.value })} className={field} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">작성자</span>
            <input value={m.author} onChange={(e) => patch({ author: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">용도 · 목적</span>
            <input value={m.purpose} onChange={(e) => patch({ purpose: e.target.value })} placeholder="예: 혹한기 동파 방지를 위한 수동 정지 절차" className={field} />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">주의사항 (개요 쪽에 들어갑니다 · 비우면 안 나옵니다)</span>
          <textarea value={m.caution} onChange={(e) => patch({ caution: e.target.value })} rows={2} placeholder="예: 반드시 2인 1조로 작업하고, 차단기 투입 전 주변 인원을 확인할 것" className={field} />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={m.overview} onChange={(e) => patch({ overview: e.target.checked })} className="h-4 w-4" />
            개요 쪽 넣기 (대상·작동 순서 목록)
          </label>
          <CoverField url={m.cover} fallback={SITE_COVER[m.site]} onChange={(cover) => patch({ cover })} />
          <span className="ml-auto text-xs text-slate-400">
            전체 {total}단계 · {m.pages.length}쪽 · 파일명 <span className="font-medium text-slate-500">{manualFileName(m, "pptx")}</span>
          </span>
        </div>
      </div>

      {/* ── 쪽별 사진 ── */}
      <div className="space-y-4">
        {m.pages.map((p, i) => (
          <PageCard
            key={p.id}
            page={p}
            index={i}
            start={starts[i]}
            count={m.pages.length}
            onPatch={(x) => patchPage(i, x)}
            onLayout={(l) => setLayout(i, l)}
            onAdd={(items) => addPhotos(i, items)}
            onCaption={(k, v) => setCaption(i, k, v)}
            onRemoveStep={(k) => removeStep(i, k)}
            onMoveStep={(k, d) => moveStep(i, k, d)}
            onMovePage={(d) => movePage(i, d)}
            onRemovePage={() => removePage(i)}
          />
        ))}
        <button onClick={addPage} className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm text-slate-400 hover:border-slate-400 hover:bg-slate-50">
          ＋ 쪽 추가
        </button>
      </div>

      {/* ── 미리보기 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <button onClick={() => setPreview((v) => !v)} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          {preview ? "▾ 미리보기 닫기" : "▸ 출력 미리보기 (실제 나오는 모양)"}
        </button>
        {preview && (
          <div className="mt-3 overflow-x-auto">
            <div style={{ width: 1123 * 0.52, height: "auto" }}>
              <div style={{ transform: "scale(0.52)", transformOrigin: "top left", width: 1123 }} className="space-y-3">
                <ManualDocument manual={m} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 액션 ── */}
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{savedAt ? `저장됨 · ${savedAt}` : ""}</span>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {saving ? "저장 중…" : "저장"}
            </button>
            <button onClick={exportPptx} disabled={busy !== ""} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50">
              {busy === "ppt" ? "만드는 중…" : "PPT로 출력"}
            </button>
            <button onClick={exportPdf} disabled={busy !== ""} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {busy === "pdf" ? "만드는 중…" : "PDF로 출력"}
            </button>
          </div>
        </div>
      </div>

      {/* PDF 캡처용 — 화면 밖에 실제 크기로 그려 둔다 */}
      <div style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ManualDocument ref={docRef} manual={m} />
      </div>
    </div>
  );
}

// ── 표지 사진 ────────────────────────────────────────────────────
function CoverField({ url, fallback, onChange }: { url: string; fallback: string; onChange: (u: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [up, setUp] = useState(false);

  async function pick(files: FileList | null) {
    if (!files?.[0]) return;
    setUp(true);
    try {
      onChange(await uploadPhoto(files[0]));
    } catch {
      alert("사진 업로드에 실패했습니다.");
    } finally {
      setUp(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="relative h-8 w-14 overflow-hidden rounded border border-slate-200 bg-slate-50">
        <Image src={url || fallback} alt="표지" fill className="object-cover" unoptimized />
      </span>
      <button onClick={() => ref.current?.click()} disabled={up} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        {up ? "올리는 중…" : "표지 사진 바꾸기"}
      </button>
      {url && (
        <button onClick={() => onChange("")} className="text-xs text-slate-400 underline hover:text-slate-600">
          기본 사진으로
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}

// ── 쪽 하나 ──────────────────────────────────────────────────────
function PageCard({
  page,
  index,
  start,
  count,
  onPatch,
  onLayout,
  onAdd,
  onCaption,
  onRemoveStep,
  onMoveStep,
  onMovePage,
  onRemovePage,
}: {
  page: ManualPage;
  index: number;
  start: number;
  count: number;
  onPatch: (p: Partial<ManualPage>) => void;
  onLayout: (l: ManualLayout) => void;
  onAdd: (items: ManualStep[]) => void;
  onCaption: (i: number, v: string) => void;
  onRemoveStep: (i: number) => void;
  onMoveStep: (i: number, dir: -1 | 1) => void;
  onMovePage: (dir: -1 | 1) => void;
  onRemovePage: () => void;
}) {
  const cap = LAYOUT_CAP[page.layout];
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);

  async function handleFiles(files: FileList | null, ref: React.RefObject<HTMLInputElement | null>) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const added: ManualStep[] = [];
      for (const f of Array.from(files)) added.push({ url: await uploadPhoto(f), caption: "" });
      onAdd(added);
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">{index + 1}쪽</span>
        <input
          value={page.heading}
          onChange={(e) => onPatch({ heading: e.target.value })}
          placeholder="쪽 제목 (예: 기동 전 점검)"
          className="min-w-[160px] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold"
        />
        <select value={page.layout} onChange={(e) => onLayout(e.target.value as ManualLayout)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
          {LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {LAYOUT_LABEL[l]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button onClick={() => onMovePage(-1)} disabled={index === 0} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="앞으로">
            ↑
          </button>
          <button onClick={() => onMovePage(1)} disabled={index === count - 1} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="뒤로">
            ↓
          </button>
          <button onClick={onRemovePage} className="rounded border border-red-200 px-2 py-1 text-xs text-red-400 hover:bg-red-50">
            쪽 삭제
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-400">
        사진 {page.steps.length} / {cap}장 · 번호 {start}번부터
      </p>

      <div className={`grid gap-3 ${page.layout === "3x2" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
        {Array.from({ length: cap }, (_, i) => {
          const s = page.steps[i];
          if (!s) {
            return (
              <div key={i} className="grid aspect-[4/3] place-items-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-300">
                빈 칸
              </div>
            );
          }
          return (
            <div key={i} className="rounded-xl border border-slate-200 p-2">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {s.url ? (
                  <Image src={s.url} alt={s.caption || `${start + i}단계`} fill className="object-cover" unoptimized />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs text-slate-300">사진 없음</div>
                )}
                <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded bg-[#0f2c5c] px-1 text-[10px] font-bold text-white">
                  {start + i}
                </span>
                <button
                  onClick={() => onRemoveStep(i)}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
                  title="삭제"
                >
                  ×
                </button>
              </div>
              <input
                value={s.caption ?? ""}
                onChange={(e) => onCaption(i, e.target.value)}
                placeholder={`${start + i}단계 설명`}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              <div className="mt-1 flex gap-1">
                <button onClick={() => onMoveStep(i, -1)} className="flex-1 rounded border border-slate-200 py-1 text-[11px] text-slate-500 hover:bg-slate-50" title="앞 번호와 바꾸기">
                  ←
                </button>
                <button onClick={() => onMoveStep(i, 1)} className="flex-1 rounded border border-slate-200 py-1 text-[11px] text-slate-500 hover:bg-slate-50" title="뒤 번호와 바꾸기">
                  →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          📷 촬영
        </button>
        <button onClick={() => albumRef.current?.click()} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          🖼 앨범(여러 장)
        </button>
        <button onClick={() => setPicking(true)} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          🗂 아카이브
        </button>
      </div>
      {uploading && <p className="mt-2 text-center text-xs text-slate-400">업로드 중…</p>}
      <p className="mt-1 text-center text-[11px] text-slate-300">칸보다 많이 넣으면 바로 뒤에 쪽이 자동으로 생깁니다</p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">{LAYOUT_NOTE_LABEL[page.layout]}</span>
        <textarea
          value={page.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          rows={page.layout === "2x2" ? 4 : 2}
          placeholder={page.layout === "2x2" ? "오른쪽 칸에 들어갈 설명" : "이 쪽에서 조심할 것 · 비고"}
          className={field}
        />
      </label>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files, cameraRef)} />
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files, albumRef)} />

      {picking && (
        <ArchivePicker
          onClose={() => setPicking(false)}
          onPick={(item) => {
            onAdd([{ url: item.url, caption: item.title || item.note || "" }]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
