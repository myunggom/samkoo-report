import { NextRequest, NextResponse } from "next/server";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";

// proxy로 잠겨 있지만 라우트에서도 인증 재확인 (다른 공개 페이지에서 절대 호출 불가)
function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

type InItem = { id: string; title: string; memo: string };

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const b = await req.json().catch(() => null);
  const items: InItem[] = Array.isArray(b?.items)
    ? b.items.map((it: Record<string, unknown>) => ({
        id: String(it.id || ""),
        title: typeof it.title === "string" ? it.title : "",
        memo: typeof it.memo === "string" ? it.memo : "",
      }))
    : [];
  const usable = items.filter((it) => it.title.trim() || it.memo.trim());
  if (usable.length === 0) {
    return NextResponse.json({ error: "정리할 업무 항목이 없습니다." }, { status: 400 });
  }

  const listText = usable
    .map((it, i) => `${i + 1}. 제목: ${it.title || "(제목 없음)"}\n   메모: ${it.memo || "(메모 없음)"}`)
    .join("\n");

  const prompt = `너는 시설관리 회사의 주간 업무보고 슬라이드를 만드는 담당자야. 아래 업무 항목별 메모를 바탕으로, 각 항목의 발표용 문구를 간결한 존댓말 한국어로 정리해줘. 메모에 없는 사실을 지어내지 말고, 있는 내용만 다듬어. 항목 순서와 개수는 그대로 유지해.

각 항목마다:
- subtitle: 핵심을 요약한 짧은 한 줄 (15자 내외)
- summary: 슬라이드에 넣을 요약. 1~3개의 짧은 문장을 줄바꿈(\\n)으로 구분. 각 문장은 간결하게.

반드시 아래 JSON 형식만 출력해. 다른 설명이나 코드펜스 없이 JSON만:
{"items":[{"subtitle":"...","summary":"..."}, ...]}

업무 항목:
${listText}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ error: `Claude API 오류 (${res.status})`, detail: errText.slice(0, 300) }, { status: 502 });
    }
    const data = await res.json();
    const text: string = (data?.content?.[0]?.text ?? "").trim();

    // 코드펜스/앞뒤 텍스트 제거 후 JSON 파싱
    const jsonStr = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? jsonStr.slice(start, end + 1) : jsonStr);
    const outItems: { subtitle: string; summary: string }[] = Array.isArray(parsed?.items) ? parsed.items : [];

    // 원래 항목 순서에 맞춰 결합 (부족하면 빈 값)
    const result = usable.map((it, i) => ({
      id: it.id,
      title: it.title,
      subtitle: typeof outItems[i]?.subtitle === "string" ? outItems[i].subtitle : "",
      summary: typeof outItems[i]?.summary === "string" ? outItems[i].summary : "",
    }));
    return NextResponse.json({ items: result });
  } catch (e) {
    return NextResponse.json({ error: "정리 중 오류가 발생했습니다.", detail: (e as Error).message }, { status: 500 });
  }
}
