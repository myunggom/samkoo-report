"use client";

import { useState } from "react";
import type { Schedule } from "@/lib/types";

type Props = {
  initial?: Partial<Schedule>;
  onClose: () => void;
  onSaved: (s: Schedule) => void;
};

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

export default function ScheduleModal({ initial, onClose, onSaved }: Props) {
  const editing = !!initial?.id;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [shootType, setShootType] = useState(initial?.shootType ?? "");
  const [production, setProduction] = useState(initial?.production ?? "");
  const [manager, setManager] = useState(initial?.manager ?? "");
  const [start, setStart] = useState(toLocalInput(initial?.start));
  const [end, setEnd] = useState(toLocalInput(initial?.end));
  const [setupStart, setSetupStart] = useState(toLocalInput(initial?.setupStart));
  const [setupEnd, setSetupEnd] = useState(toLocalInput(initial?.setupEnd));
  const [shootStart, setShootStart] = useState(toLocalInput(initial?.shootStart));
  const [shootEnd, setShootEnd] = useState(toLocalInput(initial?.shootEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!title.trim()) return setError("촬영명을 입력해 주세요.");
    if (!start) return setError("촬영일시를 입력해 주세요.");
    setSaving(true);
    setError("");
    const iso = (v: string) => (v ? new Date(v).toISOString() : "");
    const payload = {
      title: title.trim(),
      shootType: shootType.trim(),
      production: production.trim(),
      manager: manager.trim(),
      start: new Date(start).toISOString(),
      end: end ? new Date(end).toISOString() : undefined,
      setupStart: iso(setupStart),
      setupEnd: iso(setupEnd),
      shootStart: iso(shootStart),
      shootEnd: iso(shootEnd),
    };
    try {
      const res = await fetch(editing ? `/api/schedules/${initial!.id}` : "/api/schedules", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      onSaved(await res.json());
    } catch {
      setError("저장에 실패했습니다. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? "일정 수정" : "일정 추가"}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>촬영명 *</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 프로젠 홍보영상" />
          </div>
          <div>
            <label className={labelCls}>촬영종류</label>
            <input className={inputCls} value={shootType} onChange={(e) => setShootType(e.target.value)} placeholder="예: 드라마 / 광고 / 화보" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>제작사</label>
              <input className={inputCls} value={production} onChange={(e) => setProduction(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>관리자</label>
              <input className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>촬영일시(시작) *</label>
              <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>종료(선택)</label>
              <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <label className={labelCls}>보양 및 세팅 시간</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" className={inputCls} value={setupStart} onChange={(e) => setSetupStart(e.target.value)} />
              <input type="datetime-local" className={inputCls} value={setupEnd} onChange={(e) => setSetupEnd(e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-slate-400">시작 ~ 종료</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <label className={labelCls}>촬영 및 철수 시간</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="datetime-local" className={inputCls} value={shootStart} onChange={(e) => setShootStart(e.target.value)} />
              <input type="datetime-local" className={inputCls} value={shootEnd} onChange={(e) => setShootEnd(e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-slate-400">시작 ~ 종료</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ISO → datetime-local 입력값(로컬 타임존 보정)
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
