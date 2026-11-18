// 기록 저장: 순찰(patrol) · 순찰 이상(issue) · 화장실 점검(clean)
// 접속 키 검사는 middleware.js 가 먼저 한다.
import { put } from "@vercel/blob";

const TYPES = new Set(["patrol", "issue", "clean"]);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function kstDate(ts) {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request) {
  let b;
  try {
    const text = await request.text();
    if (text.length > 8000) return json({ error: "too large" }, 413);
    b = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  if (!TYPES.has(b.type) || !ID_RE.test(b.id || "")) return json({ error: "bad record" }, 400);

  // 오프라인으로 쌓였다가 늦게 보내진 기록은 찍은 시각(at)을 쓴다. 단, 3일 넘게 지난 건 서버 시각.
  const now = Date.now();
  let at = Number(b.at) || now;
  if (at > now + 5 * 60 * 1000 || at < now - 3 * 86400 * 1000) at = now;

  const rec = {
    type: b.type,
    id: b.id,
    who: clip(b.who, 30) || "미등록",
    at,
    savedAt: now,
    issue: clip(b.issue, 40),
    memo: clip(b.memo, 300),
    done: Array.isArray(b.done) ? b.done.slice(0, 20).map((x) => clip(x, 30)) : undefined,
    total: Number.isFinite(b.total) ? b.total : undefined,
    uid: clip(b.uid, 40),
  };
  // 기기는 응답을 못 받으면 같은 기록을 다시 보낸다(화면을 바로 넘긴 경우 등).
  // 기록마다 붙은 uid 로 파일 이름을 정해, 다시 와도 같은 파일에 덮어써서 두 번 쌓이지 않게 한다.
  const uid = /^[A-Za-z0-9]{4,40}$/.test(rec.uid || "") ? rec.uid : Math.random().toString(36).slice(2, 10);
  const path = `rec/${kstDate(at)}/${rec.type}/${at}-${uid}.json`;
  await put(path, JSON.stringify(rec), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return json({ ok: true, at });
}
