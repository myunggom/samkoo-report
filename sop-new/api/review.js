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
//    POST /api/review                   한 장 기록 { tid, n, s, tags, note, by }
//                                       s = "ok"(통과) | "bad"(문제) | ""(지움)
//    POST /api/review?act=redone        다시 만들었음 표시 { tid, n }
//                                       → 지난 판정은 history 로 옮기고 '다시 볼 것' 으로
//
//  저장 모양 (2026-11-16 바꿈)
//    review/v/<작업>/<번호>/<시각>-<난수>.json   사진 한 장, 저장할 때마다 새 파일
//
//  ※ 왜 이렇게 바꿨나 — 같은 이름에 덮어쓰면 Blob 주소가 잠깐(1분 안팎) 옛 내용을
//    돌려준다. 예전처럼 작업 하나를 파일 하나에 두고 '읽고 → 고치고 → 쓰기' 를 하면
//    연달아 누른 판정이 서로 지워졌다 (다시 만듦 표시 34장 중 20장이 사라짐).
//    새 이름으로만 쓰면 옛 내용이 섞일 수 없고, 목록(list)은 바로 맞는 값을 준다.
//    사진마다 따로라 여러 사람이 같은 작업을 동시에 봐도 서로 지우지 않는다.
//    옛 모양 review/<작업>.json 은 읽기만 한다(새 기록이 없는 사진의 바탕).
// ─────────────────────────────────────────────────────────────

const OLD = "review/";
const NEW = "review/v/";
const KEEP = 3; // 사진마다 남길 옛 판 수
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

async function listAll(prefix) {
  const { list } = await import("@vercel/blob");
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

// 한 파일 읽기 — 잠깐 끊겨도 3번까지 다시 해 본다
async function fetchJson(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
        cache: "no-store",
      });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      last = new Error("HTTP " + r.status);
    } catch (e) {
      last = e;
    }
    await new Promise((ok) => setTimeout(ok, 300 * (i + 1)));
  }
  throw last;
}

// 여러 개를 한 번에 LIMIT 개씩만 읽는다.
// ※ 2026-11-18 : 검수 기록이 1,000장을 넘자 전부 동시에 읽다가 "fetch failed" 로
//   검수 화면이 통째로 안 열렸다. 동시에 여는 연결 수를 묶어 둔다.
const LIMIT = 32;
async function pool(items, fn) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const k = i++;
      await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LIMIT, items.length) }, run));
}

// 파일 이름이 시각으로 시작하므로 이름 순 = 시간 순
function byName(a, b) {
  return a.pathname < b.pathname ? -1 : a.pathname > b.pathname ? 1 : 0;
}

// 새 모양 : { "tid/n": [blob…(오래된 것부터)] }
function groupNew(blobs) {
  const g = {};
  for (const b of blobs) {
    const rest = b.pathname.slice(NEW.length).split("/");
    if (rest.length !== 3 || !TID_RE.test(rest[0]) || !N_RE.test(rest[1])) continue;
    (g[rest[0] + "/" + rest[1]] ||= []).push(b);
  }
  for (const k in g) g[k].sort(byName);
  return g;
}

async function readOldTask(tid, blobs) {
  const b = blobs.find((x) => x.pathname === OLD + tid + ".json");
  return (b && (await fetchJson(b.url))) || {};
}

async function readOne(tid, n) {
  const vs = (await listAll(NEW + tid + "/" + n + "/")).sort(byName);
  if (vs.length) return { rec: (await fetchJson(vs[vs.length - 1].url)) || {}, vs };
  const old = await listAll(OLD + tid + ".json");
  const t = await readOldTask(tid, old);
  return { rec: t[n] || {}, vs };
}

async function writeOne(tid, n, rec, vs) {
  const { put, del } = await import("@vercel/blob");
  const name = NEW + tid + "/" + n + "/" + Date.now().toString().padStart(14, "0") + "-" +
    Math.random().toString(36).slice(2, 8) + ".json";
  await put(name, JSON.stringify(rec), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
  });
  const old = vs.slice(0, Math.max(0, vs.length - (KEEP - 1)));
  if (old.length) {
    try { await del(old.map((b) => b.url)); } catch { /* 지우기 실패는 넘어간다 */ }
  }
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
      const all = await listAll(OLD);
      const reviews = {};
      // 1) 옛 모양을 바탕으로
      const olds = all.filter((b) => b.pathname.startsWith(OLD) && !b.pathname.startsWith(NEW));
      await pool(olds, async (b) => {
          const tid = b.pathname.slice(OLD.length).replace(/\.json$/, "");
          if (!TID_RE.test(tid)) return;
          const d = (await fetchJson(b.url)) || {};
          for (const n in d) if (N_RE.test(n)) (reviews[tid] ||= {})[n] = d[n];
        });
      // 2) 새 모양(사진마다 마지막 판)이 이긴다
      const g = groupNew(all.filter((b) => b.pathname.startsWith(NEW)));
      await pool(Object.entries(g), async ([k, vs]) => {
          const [tid, n] = k.split("/");
          const rec = await fetchJson(vs[vs.length - 1].url);
          if (rec) (reviews[tid] ||= {})[n] = rec;
        });
      return res.status(200).json({ reviews });
    }

    if (req.method !== "POST") return bad(res, 405, "GET 또는 POST 만 됩니다.");

    const b = body(req);
    const tid = String(b.tid || "");
    const n = String(b.n || "");
    if (!TID_RE.test(tid) || !N_RE.test(n)) return bad(res, 400, "작업 · 번호가 이상합니다.");

    const act = String((req.query && req.query.act) || "");
    const { rec: 전, vs } = await readOne(tid, n);
    const now = new Date().toISOString();

    if (act === "redone") {
      const history = (전.history || []).slice(-9);
      if (전.s) history.push({ s: 전.s, tags: 전.tags || [], note: 전.note || "", at: 전.at || "", by: 전.by || "" });
      const rec = { s: "", tags: [], note: "", at: "", by: "", redo: (전.redo || 0) + 1, redoneAt: now, history };
      await writeOne(tid, n, rec, vs);
      return res.status(200).json({ ok: true, rec });
    }

    const s = String(b.s || "");
    if (!["ok", "bad", ""].includes(s)) return bad(res, 400, "판정 값이 이상합니다.");
    const tags = (Array.isArray(b.tags) ? b.tags : []).map(String).filter((t) => TAGS.has(t)).slice(0, 14);
    const note = String(b.note || "").slice(0, 600);
    const by = String(b.by || "").trim().slice(0, 20);

    const rec = { ...전, s, tags: s === "bad" ? tags : [], note, at: now, by };
    await writeOne(tid, n, rec, vs);
    return res.status(200).json({ ok: true, rec });
  } catch (e) {
    return bad(res, 500, (req.method === "GET" ? "불러오기" : "저장") + " 중 오류 : " + String((e && e.message) || e).slice(0, 200));
  }
}
