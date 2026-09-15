import { NextRequest, NextResponse } from "next/server";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import { CATEGORY_LABEL, kstDateString, parseTasksJson } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";

function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  // 앞뒤 공백/따옴표 제거(붙여넣기 사고 방지). 헤더에 못 들어갈 문자면 즉시 안내.
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!apiKey) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요." }, { status: 500 });
  }
  if (!/^[\x20-\x7E]+$/.test(apiKey)) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 값에 이상한 문자(공백·줄바꿈 등)가 있습니다. 키를 다시 붙여넣어 주세요." }, { status: 500 });
  }

  const b = await req.json().catch(() => null);
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  if (!text) return NextResponse.json({ error: "정리할 내용을 먼저 적어 주세요." }, { status: 400 });

  const now = new Date();
  const today = kstDateString(now);
  const dow = WEEKDAY[new Date(now.getTime() + 9 * 3600000).getUTCDay()];

  const categoryGuide = Object.entries(CATEGORY_LABEL)
    .map(([key, label]) => `  "${key}" = ${label}`)
    .join("\n");

  const prompt = `너는 건물 시설관리 담당자의 비서야. 아래 업무 메모·회의 내용을 읽고 "해야 할 일"을 하나씩 뽑아내.

오늘은 ${today} (${dow}요일)이야. "다음 주 금요일까지", "이달 말까지" 같은 표현은 이 날짜를 기준으로 실제 날짜로 환산해.

규칙:
1) 할 일 하나당 객체 하나. 여러 일이 한 문장에 섞여 있으면 쪼개라.
2) category는 아래 다섯 중 하나만 골라라. 새로 만들지 마라.
${categoryGuide}
3) due는 "YYYY-MM-DD" 형식. 메모에 기한 근거가 없으면 due 자체를 빼라. 날짜를 지어내지 마라.
4) source에는 이 할 일의 근거가 된 원문 문장을 그대로 따와라. 요약하지 마라.
5) shared는 "다른 담당자도 알아야 하는 건물 문제"로 읽힐 때만 true. 나 혼자 처리할 일이면 false.
   true면 reason에 그 이유를 짧게 적어라.
6) 원문에 없는 사실을 지어내지 마라. 쪼개고 분류만 해라.
7) 할 일이 아닌 단순 정보·결정 사항은 뽑지 마라.

JSON 배열만 출력해. 설명이나 코드펜스 없이.

형식:
[{"title":"소방 수신기 점검 업체 견적 받기","note":"3층 수신기 오작동 반복","category":"facility","due":"2026-09-19","source":"3층 수신기가 계속 오작동해서 업체 견적을 금요일까지 받기로 함","shared":true,"reason":"다른 담당자도 알아야 하는 건물 문제"}]

--- 메모 ---
${text}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Claude에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  if (!res.ok) {
    let msg = "정리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    if (res.status === 401) msg = "Claude API 키가 올바르지 않습니다. Vercel의 ANTHROPIC_API_KEY 값을 확인해 주세요.";
    else if (res.status === 429) msg = "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: msg }, { status: res.status === 401 ? 500 : 502 });
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");

  try {
    const tasks = parseTasksJson(raw);
    if (!tasks.length) {
      return NextResponse.json({ error: "할 일로 뽑을 내용을 찾지 못했습니다. 조금 더 구체적으로 적어 주세요." }, { status: 422 });
    }
    return NextResponse.json({ tasks });
  } catch {
    return NextResponse.json({ error: "정리에 실패했어요. 다시 시도하거나 직접 추가해 주세요." }, { status: 502 });
  }
}
