import { NextRequest, NextResponse } from "next/server";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";

// proxy로 잠겨 있지만 라우트에서도 인증 재확인 (다른 공개 페이지에서 절대 호출 불가)
function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

type InWork = { id: string; title: string; memo: string; captions: string[] };

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  // 앞뒤 공백/따옴표를 제거(붙여넣기 사고 방지). 헤더에 못 들어갈 문자면 즉시 안내.
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!apiKey) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요." }, { status: 500 });
  }
  if (!/^[\x20-\x7E]+$/.test(apiKey)) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 값에 이상한 문자(공백·줄바꿈 등)가 있습니다. 키를 다시 붙여넣어 주세요." }, { status: 500 });
  }

  const b = await req.json().catch(() => null);
  const raw = Array.isArray(b?.works) ? b.works : Array.isArray(b?.items) ? b.items : [];
  const works: InWork[] = raw.map((it: Record<string, unknown>) => ({
    id: String(it.id || ""),
    title: typeof it.title === "string" ? it.title : "",
    memo: typeof it.memo === "string" ? it.memo : "",
    captions: Array.isArray(it.captions) ? (it.captions as unknown[]).map((c) => String(c)).filter(Boolean) : [],
  }));
  const usable = works.filter((it) => it.title.trim() || it.memo.trim());
  if (usable.length === 0) {
    return NextResponse.json({ error: "정리할 작업 항목이 없습니다. 주제나 메모를 먼저 적어 주세요." }, { status: 400 });
  }

  const listText = usable
    .map((it, i) => {
      const cap = it.captions.length ? `\n   사진설명: ${it.captions.join(" / ")}` : "";
      return `${i + 1}. 주제: ${it.title || "(제목 없음)"}\n   메모: ${it.memo || "(메모 없음)"}${cap}`;
    })
    .join("\n");

  const prompt = `너는 시설관리 회사의 주간 업무보고 슬라이드를 만드는 담당자야. 아래 작업 항목별 메모(와 사진설명)를 바탕으로, 각 항목의 발표용 본문 문구를 간결한 존댓말 한국어로 정리해줘. 메모에 없는 사실을 지어내지 말고, 있는 내용만 다듬어. 항목 순서와 개수는 그대로 유지해.

각 항목의 "본문"은 슬라이드에 그대로 들어갈 여러 줄 텍스트야. 실제 조치/결과를 2~5줄로 나눠서 각 줄을 간결하게. 줄바꿈은 \\n 으로 표현해. 불릿 기호(-, •)는 넣지 마.

반드시 아래 JSON 형식만 출력해. 다른 설명이나 코드펜스 없이 JSON만:
{"items":[{"본문":"첫째 줄\\n둘째 줄"}, ...]}

작업 항목:
${listText}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) {
    return NextResponse.json({ error: `Claude 서버에 연결하지 못했습니다: ${(e as Error).message}` }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let msg = `Claude API 오류 (${res.status})`;
    try {
      const j = JSON.parse(errText);
      if (j?.error?.message) msg = `Claude API 오류: ${j.error.message}`;
    } catch {}
    if (res.status === 401) msg = "Claude API 키가 올바르지 않습니다. Vercel의 ANTHROPIC_API_KEY 값을 확인해 주세요.";
    if (res.status === 400 && /credit|balance/i.test(errText)) msg = "Claude 계정 잔액(크레딧)이 부족합니다. 결제/충전 후 다시 시도해 주세요.";
    if (res.status === 404) msg = `모델(${MODEL})을 사용할 수 없는 계정입니다. 콘솔에서 모델 접근 권한을 확인해 주세요.`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let text = "";
  try {
    const data = await res.json();
    text = (data?.content?.[0]?.text ?? "").trim();
  } catch (e) {
    return NextResponse.json({ error: `Claude 응답을 읽지 못했습니다: ${(e as Error).message}` }, { status: 502 });
  }

  // 코드펜스/앞뒤 텍스트 제거 후 JSON 파싱 (실패해도 원문 일부를 안내)
  let outItems: { 본문?: unknown }[] = [];
  try {
    const jsonStr = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? jsonStr.slice(start, end + 1) : jsonStr);
    outItems = Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return NextResponse.json({ error: `AI 응답 형식을 해석하지 못했습니다. 응답 일부: ${text.slice(0, 120)}` }, { status: 502 });
  }

  const result = usable.map((it, i) => {
    const o = outItems[i] || {};
    let 본문 = "";
    if (typeof o.본문 === "string") 본문 = o.본문;
    else if (Array.isArray(o.본문)) 본문 = (o.본문 as unknown[]).map((s) => String(s)).join("\n");
    return { id: it.id, 본문 };
  });
  return NextResponse.json({ items: result });
}
