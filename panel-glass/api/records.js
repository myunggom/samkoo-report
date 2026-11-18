// 하루치 기록 읽기:  GET /api/records?date=2026-11-18
import { list, get } from "@vercel/blob";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readOne(pathname) {
  // 기록이 많아지면 동시 읽기가 실패할 수 있어 3번까지 다시 시도
  for (let i = 0; i < 3; i++) {
    try {
      const r = await get(pathname, { access: "private", useCache: false });
      if (!r) return null;
      return JSON.parse(await new Response(r.stream).text());
    } catch (e) {
      if (i === 2) return null;
      await new Promise((ok) => setTimeout(ok, 200 * (i + 1)));
    }
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const date = url.searchParams.get("date") || kst;
  if (!DATE_RE.test(date)) return json({ error: "bad date" }, 400);

  const paths = [];
  let cursor;
  do {
    const r = await list({ prefix: `rec/${date}/`, cursor, limit: 1000 });
    r.blobs.forEach((b) => paths.push(b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);

  const out = [];
  for (let i = 0; i < paths.length; i += 24) {
    const part = await Promise.all(paths.slice(i, i + 24).map(readOne));
    part.forEach((x) => x && out.push(x));
  }
  out.sort((a, b) => a.at - b.at);
  return json({ date, records: out, failed: paths.length - out.length });
}
