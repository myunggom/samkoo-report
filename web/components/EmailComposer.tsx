"use client";

import { useState } from "react";
import type { Schedule } from "@/lib/types";
import { buildEmailBody, emailSubject, setupRange, shootRange } from "@/lib/format";

type Props = {
  schedule: Schedule;
};

export default function EmailComposer({ schedule }: Props) {
  const [copied, setCopied] = useState("");
  const subject = emailSubject(schedule);
  const body = buildEmailBody(schedule);
  const missing = setupRange(schedule) === "-" || shootRange(schedule) === "-";

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(which);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        일정 정보로 메일 문안을 자동 작성했습니다. <b>복사</b>해서 메일에 붙여넣으세요.
      </p>
      {missing && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          보양·세팅/촬영·철수 시간이 비어 있습니다. 위의 <b>수정</b>에서 시간을 입력하면 문안에 자동 반영됩니다.
        </p>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">메일 제목</label>
          <button
            onClick={() => copy(subject, "subject")}
            className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
          >
            {copied === "subject" ? "복사됨 ✓" : "제목 복사"}
          </button>
        </div>
        <input readOnly value={subject} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">메일 내용</label>
          <button
            onClick={() => copy(body, "body")}
            className="rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700"
          >
            {copied === "body" ? "복사됨 ✓" : "내용 복사"}
          </button>
        </div>
        <textarea
          readOnly
          value={body}
          rows={16}
          className="w-full whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm leading-relaxed"
        />
      </div>
    </div>
  );
}
