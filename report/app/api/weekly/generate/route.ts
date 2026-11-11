import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";

// 출력 모양은 이 스키마가 보장한다. 프롬프트에 "코드펜스 없이 JSON만" 이라고 적고
// 응답에서 백틱을 벗겨 중괄호를 잘라내던 방식은 구조화 출력 이전의 방법이다.
const WeeklySchema = z.object({
  items: z.array(z.object({ 본문: z.string() })),
});

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

  const prompt = `너는 시설관리 회사의 주간 업무보고 슬라이드를 만드는 유능한 담당자야. 아래 작업 항목별 메모(와 사진설명)를 발표 자료 수준으로 재구성해줘. 단순히 존댓말로만 바꾸지 말고, 내용을 분석해서 읽기 좋게 구조화하는 게 핵심이야.

각 항목의 "본문" 작성 규칙:
1) 내용을 의미 단위로 묶어 카테고리로 나눠라. 메모 내용에 맞게 제목을 지어라 (예: "점검 배경", "진행 내용", "조치 결과", "특이사항", "향후 계획" 등). 카테고리는 1~4개.
2) 카테고리 제목 줄은 맨 앞에 "# "를 붙여라. 이 줄만 볼드로 강조된다. 예: "# 조치 결과"
3) 각 세부 내용 줄은 맨 앞에 "- "를 붙여 구분해라. 핵심만 간결한 존댓말/명사형으로.
4) 메모에 없는 사실을 지어내지 마라. 있는 내용을 분류·요약·정리만 해라. 숫자·고유명사는 그대로 유지.
5) 전체는 슬라이드 한 장에 들어가는 분량으로.

예시 형식:
# 점검 배경
- 3층 전기실에서 야간 순찰 중 누수 확인
# 조치 결과
- 즉시 밸브 차단 후 실링 보수 완료
- 재발 여부 모니터링 중

items 는 아래 작업 항목과 같은 순서, 같은 개수로 채워라.

작업 항목:
${listText}`;

  const client = new Anthropic({ apiKey });

  let msg;
  try {
    msg = await client.messages.parse({
      model: MODEL,
      // 항목 수만큼 본문이 나오고 thinking 토큰도 여기에 포함된다. 2000 은 잘리기 쉬웠다.
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(WeeklySchema) },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Claude API 키가 올바르지 않습니다. Vercel의 ANTHROPIC_API_KEY 값을 확인해 주세요." }, { status: 502 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return NextResponse.json({ error: "Claude 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }
    if (e instanceof Anthropic.APIError && /credit|balance/i.test(String(e.message))) {
      return NextResponse.json({ error: "Claude 계정 잔액(크레딧)이 부족합니다. 결제/충전 후 다시 시도해 주세요." }, { status: 502 });
    }
    if (e instanceof Anthropic.NotFoundError) {
      return NextResponse.json({ error: `모델(${MODEL})을 사용할 수 없는 계정입니다. 콘솔에서 모델 접근 권한을 확인해 주세요.` }, { status: 502 });
    }
    return NextResponse.json({ error: "주간보고 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  console.log(
    JSON.stringify({
      route: "weekly/generate",
      model: MODEL,
      items: usable.length,
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      thinking_tokens: msg.usage.output_tokens_details?.thinking_tokens ?? null,
      stop_reason: msg.stop_reason,
    }),
  );

  // 길이에 걸려 중간에 끊긴 응답을 "형식 오류" 로 보여주지 않는다.
  if (msg.stop_reason === "max_tokens") {
    return NextResponse.json({ error: "내용이 길어 생성이 중간에 끊겼습니다. 항목을 나눠서 다시 시도해 주세요." }, { status: 502 });
  }

  const outItems = msg.parsed_output?.items ?? [];
  const result = usable.map((it, i) => ({ id: it.id, 본문: outItems[i]?.본문 ?? "" }));
  return NextResponse.json({ items: result });
}
