// ─────────────────────────────────────────────────────────────
//  SOP 사진 검수 기록 — review.html 이 쓰고, tools/sop_task_photos.py 가 읽는다.
//
//  왜 서버가 필요한가
//    검수 내용을 브라우저(localStorage)에만 두면 다른 PC 에서 이어 볼 수 없고,
//    사진을 다시 만드는 도구도 읽을 수 없다. 그래서 Blob 보관함에 둔다.
//
//  준비 (2026-11-16 끝남)
//    Blob 스토어 sop-photo-review 를 이 프로젝트에 연결했다.
//    BLOB_READ_WRITE_TOKEN 환경변수는 Vercel 이 넣어 준다. 코드에 적지 않는다.
//
//  주소
//    GET  /api/review                   전체 검수 기록 { reviews: { 작업: { 번호: 기록 } } }
//    POST /api/review                   한 장 기록 { tid, n, s, tags, note }
//                                       s = "ok"(통과) | "bad"(문제) | ""(지움)
//    POST /api/review?act=redone        다시 만들었음 표시 { tid, n }
//                                       → 지난 판정은 history 로 옮기고 '다시 볼 것' 으로
//
//  저장 모양 : review/<작업>.json  (작업 하나에 파일 하나)
//    { "3": { s, tags, note, at, redo, redoneAt, history:[...] }, "fig": {...} }
// ─────────────────────────────────────────────────────────────

const PREFIX = "review/";
const TID_RE = /^[a-z][a-z0-9]{1,11}$/;
const N_RE = /^(\d{1,2}|fig|gfig)$/;
const TAGS = new Set([
  "팔·손만", "상반신만", "하반신만", "머리 잘림", "발 잘림", "사람 겹침",
  "사람 수 틀림", "설비가 다름", "보호구 틀림", "동작이 내용과 다름",
  "가짜 글자", "화면 나뉨", "어색함", "기타",
]);

function bad(res, code, msg) {
  return res.status(code).json({ error: msg });
}

async function urlsByPath() {
  const { list } = await import("@vercel/blob");
  const out = {};
  let cursor;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const b of r.blobs) out[b.pathname] = b.url;
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function fetchJson(url) {
  // 캐시를 피해야 방금 저장한 내용이 보인다
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
    cache: "no-store",
  });
  return r.ok ? r.json() : null;
}

async function readTask(tid) {
  const urls = await urlsByPath();
  const u = urls[PREFIX + tid + ".json"];
  return (u && (await fetchJson(u))) || {};
}

async function writeTask(tid, data) {
  const { put } = await import("@vercel/blob");
  await put(PREFIX + tid + ".json", JSON.stringify(data), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch { return {}; }
  }
  return b;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!(process.env.BLOB_READ_WRITE_TOKEN || "").trim()) {
    return bad(res, 400, "검수 보관함(Blob)이 연결되어 있지 않습니다.");
  }

  try {
    if (req.method === "GET") {
      const urls = await urlsByPath();
      const reviews = {};
      await Promise.all(
        Object.entries(urls).map(async ([p, u]) => {
          const tid = p.slice(PREFIX.length).replace(/\.json$/, "");
          if (!TID_RE.test(tid)) return;
          reviews[tid] = (await fetchJson(u)) || {};
        })
      );
      return res.status(200).json({ reviews });
    }

    if (req.method !== "POST") return bad(res, 405, "GET 또는 POST 만 됩니다.");

    const b = body(req);
    const tid = String(b.tid || "");
    const n = String(b.n || "");
    if (!TID_RE.test(tid) || !N_RE.test(n)) return bad(res, 400, "작업 · 번호가 이상합니다.");

    const act = String((req.query && req.query.act) || "");
    const data = await readTask(tid);
    const now = new Date().toISOString();
    const 전 = data[n] || {};

    if (act === "redone") {
      const history = (전.history || []).slice(-9);
      if (전.s) history.push({ s: 전.s, tags: 전.tags || [], note: 전.note || "", at: 전.at || "" });
      data[n] = { s: "", tags: [], note: "", at: "", redo: (전.redo || 0) + 1, redoneAt: now, history };
      await writeTask(tid, data);
      return res.status(200).json({ ok: true, rec: data[n] });
    }

    const s = String(b.s || "");
    if (!["ok", "bad", ""].includes(s)) return bad(res, 400, "판정 값이 이상합니다.");
    const tags = (Array.isArray(b.tags) ? b.tags : []).map(String).filter((t) => TAGS.has(t)).slice(0, 14);
    const note = String(b.note || "").slice(0, 600);

    data[n] = { ...전, s, tags: s === "bad" ? tags : [], note, at: now };
    await writeTask(tid, data);
    return res.status(200).json({ ok: true, rec: data[n] });
  } catch (e) {
    return bad(res, 500, "저장 중 오류 : " + String((e && e.message) || e).slice(0, 200));
  }
}
