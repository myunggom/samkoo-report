"use client";

// 보고서 안에 넣을 표를 화면에서 직접 그리는 편집기.
// 행·열을 자유롭게 넣고 뺄 수 있고, 적은 그대로 워드·PDF 로 나간다.

import type { ReportTable } from "@/lib/reports";
import { TABLE_MAX_COLS, TABLE_MAX_ROWS, emptyTable, normalizeTable } from "@/lib/reports";

const BTN =
  "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_RED = "rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40";

/** 표 하나 */
function OneTable({
  table,
  index,
  onChange,
  onRemove,
}: {
  table: ReportTable;
  index: number;
  onChange: (t: ReportTable) => void;
  onRemove: () => void;
}) {
  const t = normalizeTable(table);
  const cols = t.widths.length;
  const rows = t.rows.length;

  function setCell(r: number, c: number, v: string) {
    const next = t.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row));
    onChange({ ...t, rows: next });
  }
  function addRow(at = rows) {
    if (rows >= TABLE_MAX_ROWS) return;
    const blank = Array.from({ length: cols }, () => "");
    const next = t.rows.slice();
    next.splice(at, 0, blank);
    onChange({ ...t, rows: next });
  }
  function delRow(r: number) {
    if (rows <= 1) return;
    onChange({ ...t, rows: t.rows.filter((_, i) => i !== r) });
  }
  function addCol(at = cols) {
    if (cols >= TABLE_MAX_COLS) return;
    const widths = t.widths.slice();
    widths.splice(at, 0, 1);
    const next = t.rows.map((row) => {
      const r = row.slice();
      r.splice(at, 0, "");
      return r;
    });
    onChange({ ...t, widths, rows: next });
  }
  function delCol(c: number) {
    if (cols <= 1) return;
    onChange({
      ...t,
      widths: t.widths.filter((_, i) => i !== c),
      rows: t.rows.map((row) => row.filter((_, i) => i !== c)),
    });
  }
  function setWidth(c: number, v: number) {
    onChange({ ...t, widths: t.widths.map((w, i) => (i === c ? Math.max(1, Math.min(9, v)) : w)) });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-bold text-white">표 {index + 1}</span>
        <input
          value={t.caption}
          onChange={(e) => onChange({ ...t, caption: e.target.value })}
          placeholder="표 이름 (비워도 됩니다)"
          className="min-w-[140px] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={t.header} onChange={(e) => onChange({ ...t, header: e.target.checked })} />
          첫 줄을 머리글로
        </label>
        <button type="button" onClick={onRemove} className={BTN_RED}>
          표 삭제
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm" style={{ minWidth: Math.max(320, cols * 120) }}>
          <thead>
            {/* 열 머리 — 너비와 열 지우기 */}
            <tr>
              <th className="w-8 border-b border-slate-200 bg-slate-50" />
              {t.widths.map((w, c) => (
                <th key={c} className="border-b border-l border-slate-200 bg-slate-50 px-1 py-1">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[10px] text-slate-400">너비</span>
                    <input
                      type="number"
                      min={1}
                      max={9}
                      value={w}
                      onChange={(e) => setWidth(c, Number(e.target.value) || 1)}
                      className="w-9 rounded border border-slate-300 px-1 py-0.5 text-center text-[11px]"
                      title="옆 칸보다 몇 배 넓게 할지"
                    />
                    <button
                      type="button"
                      onClick={() => delCol(c)}
                      disabled={cols <= 1}
                      title="이 열 지우기"
                      className="rounded px-1 text-[11px] text-red-400 hover:bg-red-50 disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((row, r) => (
              <tr key={r}>
                <td className="border-t border-slate-200 bg-slate-50 px-1 py-0.5 text-center align-middle">
                  <button
                    type="button"
                    onClick={() => delRow(r)}
                    disabled={rows <= 1}
                    title="이 줄 지우기"
                    className="rounded px-1 text-[11px] text-red-400 hover:bg-red-50 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </td>
                {row.map((cell, c) => (
                  <td key={c} className="border-l border-t border-slate-200 p-0">
                    <textarea
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      rows={1}
                      placeholder={t.header && r === 0 ? "머리글" : ""}
                      className={
                        "block w-full resize-y border-0 px-2 py-1.5 text-sm outline-none focus:bg-blue-50/60 " +
                        (t.header && r === 0 ? "bg-slate-50 text-center font-semibold" : "")
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => addRow()} disabled={rows >= TABLE_MAX_ROWS} className={BTN}>
          ＋ 줄 추가
        </button>
        <button type="button" onClick={() => addCol()} disabled={cols >= TABLE_MAX_COLS} className={BTN}>
          ＋ 열 추가
        </button>
        <span className="self-center text-[11px] text-slate-400">
          {rows}줄 · {cols}열 (최대 {TABLE_MAX_ROWS}줄 · {TABLE_MAX_COLS}열)
        </span>
      </div>
    </div>
  );
}

/** 표 목록 — 몇 개든 붙일 수 있다 */
export default function TableEditor({
  tables,
  onChange,
  addLabel = "＋ 표 추가",
}: {
  tables: ReportTable[] | undefined;
  onChange: (t: ReportTable[]) => void;
  addLabel?: string;
}) {
  const list = tables || [];
  return (
    <div className="space-y-2">
      {list.map((t, i) => (
        <OneTable
          key={t.id || i}
          table={t}
          index={i}
          onChange={(nt) => onChange(list.map((x, xi) => (xi === i ? nt : x)))}
          onRemove={() => onChange(list.filter((_, xi) => xi !== i))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, emptyTable()])}
        className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50"
      >
        {addLabel}
      </button>
    </div>
  );
}
