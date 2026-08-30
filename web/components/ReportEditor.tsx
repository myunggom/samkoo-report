"use client";

import { useEffect, useRef, useState } from "react";
import PhotoGrid from "./PhotoGrid";
import ReportDocument from "./ReportDocument";
import type { Photo, Report, ReportSection, Schedule } from "@/lib/types";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/types";
import { elementToPdfBlob, shareOrDownloadPdf } from "@/lib/pdf";
import { buildEmailBody, ymd } from "@/lib/format";

type Props = {
  schedule: Schedule;
  initialReport: Report;
};

export default function ReportEditor({ schedule, initialReport }: Props) {
  const [report, setReport] = useState<Report>(initialReport);
  const [active, setActive] = useState<ReportSection | "special">("setup");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [generating, setGenerating] = useState(false);
  const [rounds, setRounds] = useState<Schedule[]>([]);
  const docRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  // 변경 시 자동 저장(0.8초 디바운스)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reports/${schedule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report),
        });
        if (res.ok) setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [report, schedule.id]);

  function setSectionPhotos(sec: ReportSection, photos: Photo[]) {
    setReport((r) => ({ ...r, sections: { ...r.sections, [sec]: photos } }));
  }

  // 같은 촬영명(회차)들을 불러와 개요 페이지 회차표에 표시
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/schedules", { cache: "no-store" });
        if (!res.ok) return;
        const all: Schedule[] = await res.json();
        const same = all
          .filter((s) => s.title.trim() === schedule.title.trim())
          .sort((a, b) => a.start.localeCompare(b.start));
        setRounds(same.length ? same : [schedule]);
      } catch {
        setRounds([schedule]);
      }
    })();
  }, [schedule]);

  async function exportPdf() {
    if (!docRef.current) return;
    setGenerating(true);
    try {
      const blob = await elementToPdfBlob(docRef.current);
      const dateStr = ymd(schedule.start).replace(/-/g, "."); // yyyy.mm.dd
      const filename = `[촬영완료보고서] 제넥신·프로젠_${schedule.title}_${dateStr}.pdf`.replace(
        /[\\/:*?"<>|]/g,
        "_"
      );
      const result = await shareOrDownloadPdf(blob, filename, buildEmailBody(schedule));
      if (result === "downloaded") {
        alert("PDF를 다운로드했습니다. 저장된 파일을 메일·카톡에 첨부해 보고하세요.");
      }
    } catch (e) {
      console.error(e);
      alert("PDF 생성에 실패했습니다. 사진이 모두 표시된 뒤 다시 시도해 주세요.");
    } finally {
      setGenerating(false);
    }
  }

  const totalPhotos = SECTION_ORDER.reduce((n, s) => n + (report.sections[s]?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* 섹션 탭 (+ 마지막 특이사항 페이지) */}
      <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
        {SECTION_ORDER.map((sec) => {
          const count = report.sections[sec]?.length ?? 0;
          return (
            <button
              key={sec}
              onClick={() => setActive(sec)}
              className={
                "flex-1 rounded-lg px-2 py-2 text-sm font-medium transition " +
                (active === sec ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
              }
            >
              {SECTION_LABELS[sec]}
              {count > 0 && <span className="ml-1 text-xs text-slate-400">({count})</span>}
            </button>
          );
        })}
        <button
          onClick={() => setActive("special")}
          className={
            "flex-1 rounded-lg px-2 py-2 text-sm font-medium transition " +
            (active === "special" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
          }
        >
          특이사항
          {(report.specialPhotos?.length ?? 0) > 0 && (
            <span className="ml-1 text-xs text-slate-400">({report.specialPhotos!.length})</span>
          )}
        </button>
      </div>

      {active === "special" ? (
        <>
          <p className="text-sm text-slate-500">
            보고서 <b>마지막 페이지</b>입니다. 사진 4장(2×2)과 오른쪽 설명으로 만들어집니다.
          </p>
          <PhotoGrid
            photos={report.specialPhotos ?? []}
            onChange={(p) => setReport((r) => ({ ...r, specialPhotos: p }))}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">특이사항 설명 (오른쪽에 표시)</label>
            <textarea
              value={report.specialNote ?? ""}
              onChange={(e) => setReport((r) => ({ ...r, specialNote: e.target.value }))}
              rows={5}
              placeholder="특이사항 내용을 적어 주세요. (없으면 비워두세요)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
        </>
      ) : (
        <>
          <PhotoGrid photos={report.sections[active] ?? []} onChange={(p) => setSectionPhotos(active as ReportSection, p)} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              특이사항 · 비고 — {SECTION_LABELS[active as ReportSection]}
            </label>
            <textarea
              value={report.sectionNotes?.[active as ReportSection] ?? ""}
              onChange={(e) =>
                setReport((r) => ({ ...r, sectionNotes: { ...r.sectionNotes, [active]: e.target.value } }))
              }
              rows={3}
              placeholder={`${SECTION_LABELS[active as ReportSection]} 중 특이사항이 있으면 적어 주세요. (없으면 비워두세요)`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
        </>
      )}

      {/* 상태 + 액션 */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-xs text-slate-400">
          {status === "saving" ? "저장 중…" : status === "saved" ? "자동 저장됨 ✓" : "사진 " + totalPhotos + "장"}
        </span>
        <button
          onClick={exportPdf}
          disabled={generating}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
        >
          {generating ? "PDF 생성 중…" : "📄 PDF 출력 · 공유"}
        </button>
      </div>

      {/* PDF 캡처용(화면 밖) 문서 */}
      <div style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ReportDocument ref={docRef} schedule={schedule} report={report} rounds={rounds} />
      </div>
    </div>
  );
}
