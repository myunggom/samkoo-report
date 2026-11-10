// ─────────────────────────────────────────────────────────────
//  일일 작업 보고서 저장소 — 결재권자가 링크로 열고 서명할 수 있게 한다.
//
//  왜 서버가 필요한가
//    보고서를 작성자 브라우저 안(localStorage)에만 두면 다른 사람은 못 연다.
//    결재권자가 링크 하나로 열어 서명하려면 공용 보관함이 있어야 한다.
//
//  준비 (한 번만)
//    Vercel 프로젝트 → Storage → Blob 스토어를 만들어 이 프로젝트에 연결한다.
//    연결하면 BLOB_READ_WRITE_TOKEN 환경변수가 자동으로 생긴다.
//    토큰이 없으면 이 주소는 400 을 돌려주고, 사이트의 나머지 기능은 그대로 돈다.
//
//  주소
//    GET  /api/day?d=<id>        보고서 한 건 읽기
//    POST /api/day               보고서 저장 (본문 = 보고서 전체)
//    POST /api/day?act=photo     사진 한 장 올리기 → 주소를 돌려준다
//    POST /api/day?act=sign      결재 서명 넣기
//
//  보안
//    보고서 id 자체가 열쇠다(무작위 14자). 링크를 아는 사람만 열 수 있다.
//    링크를 아무 데나 뿌리지 말 것.
// ─────────────────────────────────────────────────────────────

const PREFIX = "day/";
const MAX_JSON = 3.8 * 1024 * 1024;   // Vercel 요청 본문 한계(4.5MB) 안쪽
const ID_RE = /^d\d{8}-[a-z0-9]{6,32}$/;

function bad(res, code, msg) {
  return res.status(code).json({ error: msg });
}

function hasToken() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

/** 저장된 파일의 공개 주소를 찾는다. 없으면 null. */
async function findUrl(pathname) {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: pathname });
  const hit = blobs.find((b) => b.pathname === pathname);
  return hit ? hit.url : null;
}

async function readJson(pathname) {
  const url = await findUrl(pathname);
  if (!url) return null;
  // 캐시를 피해야 방금 저장한 내용이 보인다
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

async function writeJson(pathname, data) {
  const { put } = await import("@vercel/blob");
  const out = await put(pathname, JSON.stringify(data), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  return out.url;
}

export default async function handler(req, res) {
  if (!hasToken()) {
    return bad(
      res,
      400,
      "서버에 보관함(Blob)이 연결되어 있지 않습니다. " +
        "Vercel 프로젝트 → Storage → Blob 을 만들어 이 프로젝트에 연결해 주세요."
    );
  }

  const act = String((req.query && req.query.act) || "");

  try {
    // ── 읽기 ───────────────────────────────────────────────
    if (req.method === "GET") {
      const id = String((req.query && req.query.d) || "");
      if (!ID_RE.test(id)) return bad(res, 400, "보고서 번호가 올바르지 않습니다.");
      const rec = await readJson(PREFIX + id + ".json");
      if (!rec) return bad(res, 404, "보고서를 찾지 못했습니다. 링크를 다시 확인해 주세요.");
      res.setHeader("cache-control", "no-store");
      return res.status(200).json({ rec });
    }

    if (req.method !== "POST") {
      return bad(res, 405, "POST 로 보내 주세요.");
    }

    const body = req.body || {};

    // ── 사진 한 장 올리기 ───────────────────────────────────
    if (act === "photo") {
      const id = String(body.id || "");
      const key = String(body.key || "").replace(/[^a-zA-Z0-9_-]/g, "");
      const dataUrl = String(body.dataUrl || "");
      if (!ID_RE.test(id)) return bad(res, 400, "보고서 번호가 올바르지 않습니다.");
      if (!key) return bad(res, 400, "사진 이름이 비어 있습니다.");

      const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl);
      if (!m) return bad(res, 400, "사진 형식을 읽지 못했습니다. png · jpg 로 올려 주세요.");

      const bytes = Buffer.from(m[3], "base64");
      if (bytes.length > MAX_JSON) return bad(res, 413, "사진 용량이 너무 큽니다.");

      const { put } = await import("@vercel/blob");
      const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
      /* 파일이름에 시각을 붙인다.
         같은 이름으로 덮어쓰면 주소가 그대로여서, 사진을 바꿔도 브라우저가
         예전 사진을 캐시에서 꺼내 보여 준다. 새 주소를 주면 그 일이 없다. */
      const stamp = Date.now().toString(36);
      const out = await put(`${PREFIX}${id}/${key}-${stamp}.${ext}`, bytes, {
        access: "public",
        contentType: m[1],
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      /* 바꾸기였다면 예전 사진은 지워 둔다 (보관함을 쓸데없이 늘리지 않는다) */
      const prev = String(body.prev || "");
      if (prev && prev !== out.url && /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(prev)) {
        try {
          const { del } = await import("@vercel/blob");
          await del(prev);
        } catch (e) {
          /* 못 지워도 사진 올리기는 성공이다. 조용히 넘어간다. */
        }
      }
      return res.status(200).json({ url: out.url });
    }

    // ── 결재 서명 ──────────────────────────────────────────
    if (act === "sign") {
      const id = String(body.id || "");
      if (!ID_RE.test(id)) return bad(res, 400, "보고서 번호가 올바르지 않습니다.");
      const sig = String(body.sig || "");
      if (!/^data:image\/(png|jpeg);base64,/.test(sig)) {
        return bad(res, 400, "서명을 읽지 못했습니다. 다시 서명해 주세요.");
      }
      const rec = await readJson(PREFIX + id + ".json");
      if (!rec) return bad(res, 404, "보고서를 찾지 못했습니다.");

      rec.sigs = rec.sigs || {};
      rec.sigs.approver = sig;
      rec.approver = {
        name: String(body.name || "").slice(0, 40),
        at: new Date().toISOString(),
      };
      rec.at = new Date().toISOString();
      await writeJson(PREFIX + id + ".json", rec);
      return res.status(200).json({ ok: true, approver: rec.approver });
    }

    // ── 보고서 저장 ────────────────────────────────────────
    const rec = body;
    if (!rec || !ID_RE.test(String(rec.id || ""))) {
      return bad(res, 400, "보고서 번호가 올바르지 않습니다.");
    }
    const text = JSON.stringify(rec);
    if (text.length > MAX_JSON) {
      return bad(
        res,
        413,
        "보고서 용량이 너무 큽니다. 사진을 먼저 올린 뒤 다시 시도해 주세요."
      );
    }

    // 이미 결재 서명이 들어간 보고서를 덮어쓰면서 서명이 지워지는 것을 막는다
    const old = await readJson(PREFIX + rec.id + ".json");
    if (old && old.sigs && old.sigs.approver) {
      rec.sigs = rec.sigs || {};
      if (!rec.sigs.approver) rec.sigs.approver = old.sigs.approver;
      if (!rec.approver || !rec.approver.at) rec.approver = old.approver;
    }

    rec.at = new Date().toISOString();
    await writeJson(PREFIX + rec.id + ".json", rec);
    return res.status(200).json({ ok: true, id: rec.id });
  } catch (e) {
    return bad(res, 500, "처리하지 못했습니다 : " + (e && e.message ? e.message : String(e)));
  }
}
