// ─────────────────────────────────────────────────────────────
//  공기구 이름(또는 사진)을 받아 안전 표준운영절차 한 건을 만든다.
//
//  돌아가는 자리 : Vercel 서버(여기). 브라우저가 아니다.
//  이유는 API 키 때문이다. 키를 브라우저로 내려보내면 누구나 꺼내 쓸 수 있다.
//
//  Vercel 프로젝트 설정 → Environment Variables 에 아래를 등록해야 한다.
//     ANTHROPIC_API_KEY = sk-ant-...
//
//  로그인 보호는 middleware.js 가 이미 모든 경로에 걸려 있어서
//  로그인하지 않은 사람은 이 주소도 못 부른다. 여기서 따로 할 일은 없다.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const MODEL = "claude-sonnet-5";

// ── 돈이 새지 않게 거는 울타리 ───────────────────────────────
//  이 주소는 부를 때마다 요금이 나간다. 그래서 세 겹으로 막는다.
//
//   1) 누가 쓸 수 있는가   SOP_GEN_USERS 에 적힌 사람만 (안 적으면 전원 허용)
//   2) 얼마나 자주         한 사람당 MIN_GAP 초에 한 번
//   3) 하루 몇 건까지      SOP_GEN_DAILY_MAX (기본 30건)
//
//  2)·3) 은 서버가 켜져 있는 동안만 기억한다(서버리스라 가끔 초기화된다).
//  급한 연타와 실수로 도는 반복은 막지만, 완전한 상한은 아니다.
//  진짜 상한은 Anthropic 콘솔의 '한도(Spend limit)' 로 거는 것이 맞다.
const MIN_GAP = Number(process.env.SOP_GEN_MIN_GAP || 20);        // 초
const DAILY_MAX = Number(process.env.SOP_GEN_DAILY_MAX || 30);    // 건
const MAX_TOKENS = 8000;      // 한 건은 4천 토큰이면 충분하다. 사고로 길어지는 걸 막는다.

const seen = new Map();       // 아이디 → { last, day, count }

function b64u(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 로그인 쿠키에서 사용자를 꺼낸다. middleware.js 와 같은 방식으로 서명을 확인한다. */
function whoIs(req) {
  const secret = process.env.SOP_SECRET || "";
  const raw = req.headers.cookie || "";
  const m = /(?:^|;\s*)sop_auth=([^;]+)/.exec(raw);
  if (!secret || !m) return null;
  const token = decodeURIComponent(m[1]);
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const want = b64u(crypto.createHmac("sha256", secret).update(payload).digest());
  if (sig.length !== want.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return d.e > Date.now() ? d : null;
  } catch { return null; }
}

/** 써도 되는지 본다. 되면 null, 안 되면 사용자에게 보여줄 말. */
function gateKeep(user) {
  const allow = (process.env.SOP_GEN_USERS || "").split(/[,\s]+/).filter(Boolean);
  if (allow.length && !allow.includes(user.u)) {
    return "이 기능을 쓸 권한이 없습니다. 관리자에게 문의해 주세요.";
  }
  const today = new Date().toISOString().slice(0, 10);
  const rec = seen.get(user.u) || { last: 0, day: today, count: 0 };
  if (rec.day !== today) { rec.day = today; rec.count = 0; }

  const gap = (Date.now() - rec.last) / 1000;
  if (gap < MIN_GAP) {
    return `잠시만요. ${Math.ceil(MIN_GAP - gap)}초 뒤에 다시 눌러 주세요.`;
  }
  if (rec.count >= DAILY_MAX) {
    return `오늘 만들 수 있는 횟수(${DAILY_MAX}건)를 다 쓰셨습니다. 내일 다시 시도해 주세요.`;
  }
  rec.last = Date.now();
  rec.count += 1;
  seen.set(user.u, rec);
  return null;
}

// data.js 의 작업 한 건과 똑같은 모양. 이 틀에서 벗어나면 화면이 깨진다.
const Item = z.object({
  n: z.number(),
  name: z.string(),
  desc: z.string(),
});

const Guide = z.object({
  n: z.number(),
  name: z.string(),
  must: z.boolean().optional(),
  warn: z.string(),
  bullets: z.array(z.string()),
});

const RiskRow = z.object({
  step: z.string(),
  hazards: z.array(z.string()),
  results: z.array(z.string()),
  f: z.number(),
  s: z.number(),
  measures: z.array(z.string()),
  due: z.string(),
  owner: z.string(),
  f2: z.number(),
  s2: z.number(),
});

const Schema = z.object({
  name: z.string(),
  place: z.string(),
  parts: z.object({
    subtitle: z.string(),
    items: z.array(Item),
    pre: z.array(z.string()),
    use: z.array(z.string()),
    ban: z.array(z.string()),
  }),
  ppe: z.array(z.object({ name: z.string() })),
  guide: z.array(z.object({ title: z.string(), items: z.array(Guide) })),
  risk: z.object({ target: z.string(), rows: z.array(RiskRow) }),
});

const SYSTEM = `당신은 건물 시설관리 회사의 안전관리 담당자입니다.
공기구(공구·장비) 하나를 받아 '안전 표준운영절차' 한 건을 작성합니다.

이 자료는 실제 작업자 교육에 쓰입니다. 그럴듯한 말이 아니라
현장에서 실제로 지켜야 하는 것을 적어야 합니다.

반드시 지킬 것

1. 각부 명칭(parts.items)은 **정확히 6개**.
   그 장비에 실제로 있는 부위 이름과, 작업 전에 눈으로 확인할 점을 적습니다.
   desc 는 "균열 · 변형 여부 확인" 처럼 짧게.

2. 안전조치(guide)는 **정확히 3묶음, 각 묶음 4개, 합계 12개**.
   묶음 제목은 작업 흐름을 따릅니다.
   예) "작업 전 조치" / "작업 및 사용 조치" / "작업 중 금지 및 정리"
   n 은 1부터 12까지 이어서 매깁니다.
   warn 은 그 조치를 안 지켰을 때 생기는 사고를 2~3단어로. 예) "추락 · 사망"
   must 는 생명과 직결되는 조치에만 true.
   bullets 는 한 조치당 2개, 각 25자 안팎의 명령문.

3. 위험성평가(risk.rows)는 **정확히 8행**.
   step 은 안전조치와 짝이 맞는 작업단계 이름.
   f(빈도) · s(강도)는 1~5. 개선 전이므로 위험한 작업은 f×s 가 12 이상 나오게.
   f2 · s2 는 개선 후이므로 1~2 로 낮게.
   due 는 "즉시" / "작업 전" / "작업 중" / "작업 후" 중 하나.
   owner 는 "작업자" 또는 "작업자 감독자".
   hazards · results · measures 는 각 2개씩.

4. 보호구(ppe)는 그 작업에 실제로 필요한 것만. 보통 3~5개.
   예) 안전모, 안전화, 보호장갑, 보안경, 방진마스크, 절연장갑, 안전대

5. 장소(place)는 건물 안에서 그 작업을 하는 곳. 예) 기계실, 전기실, 각층, 외부

문체는 기존 자료와 맞춥니다. 명사형으로 끊어 쓰고(" ~ 확인", " ~ 금지"),
존댓말을 쓰지 않습니다. 가운뎃점(·)으로 항목을 잇습니다.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 로 보내 주세요." });
  }

  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    return res.status(500).json({
      error: "서버에 ANTHROPIC_API_KEY 가 설정되지 않았습니다. "
           + "Vercel 프로젝트 설정 → Environment Variables 를 확인해 주세요.",
    });
  }

  // 누가 부르는지 확인하고, 너무 자주·너무 많이 부르는 것을 막는다
  const user = whoIs(req);
  if (!user) {
    return res.status(401).json({ error: "로그인이 필요합니다. 새로고침 후 다시 시도해 주세요." });
  }
  const blocked = gateKeep(user);
  if (blocked) {
    return res.status(429).json({ error: blocked });
  }

  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const hint = typeof body.hint === "string" ? body.hint.trim() : "";
  const photo = typeof body.photo === "string" ? body.photo : "";

  if (!name && !photo) {
    return res.status(400).json({ error: "공기구 이름을 적거나 사진을 올려 주세요." });
  }

  // 사람이 보낸 내용 — 이름, 보충 설명, 사진 중 있는 것만 넣는다
  const content = [];
  if (photo) {
    const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(photo);
    if (!m) {
      return res.status(400).json({ error: "사진 형식을 읽지 못했습니다. png · jpg 로 올려 주세요." });
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: m[1].replace("jpg", "jpeg"), data: m[3] },
    });
  }
  content.push({
    type: "text",
    text: [
      photo ? "첨부한 사진의 공기구에 대한 안전 표준운영절차를 작성해 주세요." : "",
      name ? `공기구 이름 : ${name}` : "사진을 보고 공기구 이름을 직접 정하세요.",
      hint ? `참고 사항 : ${hint}` : "",
      "",
      "우리 건물은 연구소 건물입니다. 시설관리팀이 쓰는 장비 기준으로 적어 주세요.",
    ].filter(Boolean).join("\n"),
  });

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      output_config: { effort: "high", format: zodOutputFormat(Schema) },
      messages: [{ role: "user", content }],
    });

    if (msg.stop_reason === "max_tokens") {
      return res.status(502).json({
        error: "내용이 길어 생성이 중간에 끊겼습니다. 다시 시도해 주세요.",
      });
    }
    const data = msg.parsed_output;
    if (!data) {
      return res.status(502).json({ error: "생성 결과를 읽지 못했습니다. 다시 시도해 주세요." });
    }

    console.log(JSON.stringify({
      route: "api/generate", model: MODEL, user: user.u, name: data.name,
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    }));

    return res.status(200).json({ task: data });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "API 키가 올바르지 않습니다. Vercel 환경변수를 확인해 주세요." });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return res.status(502).json({ error: "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요." });
    }
    if (e instanceof Anthropic.APIConnectionError) {
      return res.status(502).json({ error: "생성 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return res.status(502).json({ error: "생성에 실패했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
