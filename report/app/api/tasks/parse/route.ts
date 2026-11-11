import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import {
  CATEGORY_LABEL,
  TASK_CATEGORIES,
  TaskCategory,
  kstDateString,
  normalizeTasks,
} from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";

// 출력 모양은 이 스키마가 보장한다. 프롬프트에 "JSON만 출력해" 라고 적고
// 응답에서 대괄호를 잘라내 파싱하던 방식은 구조화 출력 이전의 방법이다.
const TaskSchema = z.object({
  title: z.string(),
  note: z.string().optional(),
  category: z.enum(TASK_CATEGORIES as [TaskCategory, ...TaskCategory[]]),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  source: z.string().optional(),
  shared: z.boolean(),
  reason: z.string().optional(),
});
const TasksSchema = z.object({ tasks: z.array(TaskSchema) });

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
2) category는 아래 다섯 중 하나만 골라라.
${categoryGuide}
3) 메모에 기한 근거가 없으면 due 자체를 빼라. 날짜를 지어내지 마라.
4) source에는 이 할 일의 근거가 된 원문 문장을 그대로 따와라. 요약하지 마라.
5) shared는 "다른 담당자도 알아야 하는 건물 문제"로 읽힐 때만 true. 나 혼자 처리할 일이면 false.
   true면 reason에 그 이유를 짧게 적어라.
6) 원문에 없는 사실을 지어내지 마라. 쪼개고 분류만 해라.
7) 할 일이 아닌 단순 정보·결정 사항은 뽑지 마라.

--- 메모 ---
${text}`;

  const client = new Anthropic({ apiKey });

  let msg;
  try {
    msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      // 추출 작업이라 깊게 생각할 이유가 없다. thinking 토큰도 max_tokens 에 포함되므로
      // effort 를 낮춰 두면 본문이 잘릴 여지가 줄어든다.
      output_config: { effort: "low", format: zodOutputFormat(TasksSchema) },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Claude API 키가 올바르지 않습니다. Vercel의 ANTHROPIC_API_KEY 값을 확인해 주세요." }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return NextResponse.json({ error: "Claude에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
    }
    return NextResponse.json({ error: "정리에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  console.log(
    JSON.stringify({
      route: "tasks/parse",
      model: MODEL,
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
      thinking_tokens: msg.usage.output_tokens_details?.thinking_tokens ?? null,
      stop_reason: msg.stop_reason,
    }),
  );

  // 길이에 걸려 중간에 끊긴 응답을 "형식 오류" 로 보여주지 않는다.
  if (msg.stop_reason === "max_tokens") {
    return NextResponse.json({ error: "내용이 길어 정리가 중간에 끊겼습니다. 메모를 나눠서 다시 시도해 주세요." }, { status: 502 });
  }

  const tasks = normalizeTasks(msg.parsed_output?.tasks ?? []);
  if (!tasks.length) {
    return NextResponse.json({ error: "할 일로 뽑을 내용을 찾지 못했습니다. 조금 더 구체적으로 적어 주세요." }, { status: 422 });
  }
  return NextResponse.json({ tasks });
}
