import { NextRequest, NextResponse } from "next/server";
import { WEEK_SLOTS, parseSummaryJson } from "@/lib/weeklyLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5"; // 할 일 AI 정리(api/tasks/parse)와 같은 모델
// 이 탭은 잠금이 없어서(ADR-0003) 누구나 부를 수 있다 — 한 번에 보내는 양으로 비용을 묶는다.
// ponytail: 호출 횟수 제한은 없다. 남용되면 IP 별 제한이나 잠금을 붙일 것.
const MAX_CHARS = 20000;

// 주간 보고 초안(분야별 이번주·다음주 목록)을 비슷한 항목끼리 묶어 짧게 정리한다
export async function POST(req: NextRequest) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!apiKey || !/^[\x20-\x7E]+$/.test(apiKey)) {
    return NextResponse.json({ error: "서버의 ANTHROPIC_API_KEY 설정을 확인해 주세요." }, { status: 500 });
  }

  const b = await req.json().catch(() => null);
  const work = (b?.work ?? {}) as Record<string, { done?: unknown; plan?: unknown }>;
  const input: Record<string, { done: string; plan: string }> = {};
  for (const s of WEEK_SLOTS) {
    const done = typeof work[s.key]?.done === "string" ? (work[s.key].done as string) : "";
    const plan = typeof work[s.key]?.plan === "string" ? (work[s.key].plan as string) : "";
    if (done.trim() || plan.trim()) input[s.key] = { done, plan };
  }
  const body = JSON.stringify(input, null, 1);
  if (!Object.keys(input).length) return NextResponse.json({ error: "정리할 내용이 없습니다." }, { status: 400 });
  if (body.length > MAX_CHARS) return NextResponse.json({ error: `내용이 너무 깁니다(${MAX_CHARS.toLocaleString()}자 이하).` }, { status: 413 });

  const prompt = `너는 건물 시설관리 팀의 고객사 주간 업무 보고를 다듬는 사람이다.
아래는 분야별 "이번주 업무수행(done)"과 "다음주 업무 계획(plan)" 초안이다. 매일 쓴 일일 업무일지를 그대로 모은 것이라 비슷한 항목이 여러 번 나온다.

규칙:
1) 분야마다 done·plan 을 각각 5~7개 항목으로 줄인다. 원래 항목이 그보다 적으면 그대로 둔다.
2) 뜻이 같은 항목은 하나로 합친다 (예: "전기시설물 점검"과 "전기 시설물 점검 실시").
3) 여러 날 나눠 한 같은 종류 작업은 한 항목으로 묶고, 중요한 세부(설비명·업체명·날짜)는 " - " 로 시작하는 하위 줄로 남긴다.
4) 원문에 없는 사실·수치·일정을 지어내지 않는다. 원문 표현을 되도록 살린다.
5) 형식: "1. 항목\\n - 하위\\n2. 항목" (번호는 1부터, 하위 줄은 공백 한 칸 + "- ").
6) 입력에 없는 분야는 출력하지 않는다. 비어 있던 done 이나 plan 은 빈 문자열로 둔다.

JSON 객체만 출력한다. 설명·코드펜스 없이.
형식: {"전기":{"done":"1. ...","plan":"1. ..."}, ...}

--- 초안 ---
${body}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    });
  } catch {
    return NextResponse.json({ error: "Claude에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
  if (!res.ok) {
    const msg = res.status === 429 ? "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요." : "요약에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  try {
    const summary = parseSummaryJson(raw);
    // 비어 있던 칸은 원래대로(빈 칸) — AI 가 채워 넣은 내용은 받지 않는다
    for (const [k, e] of Object.entries(summary)) {
      if (!input[k]?.done.trim()) e.done = undefined;
      if (!input[k]?.plan.trim()) e.plan = undefined;
    }
    return NextResponse.json({ work: summary });
  } catch {
    return NextResponse.json({ error: "요약 결과를 읽지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
  }
}