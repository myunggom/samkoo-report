// 접속 키 검사 (Vercel Routing Middleware).
// 회로표는 건물 전기 정보라 아무나 보면 안 된다.
// - QR 주소에 ?k=키 가 붙어 있으면 → 쿠키에 키를 저장하고 키를 뺀 주소로 다시 보냄
// - 쿠키에 맞는 키가 있으면 → 통과
// - 둘 다 없으면 → 401 안내
// 키는 Vercel 환경변수 PANEL_KEY 에만 있다 (코드에 적지 않는다).

export const config = { matcher: "/((?!favicon.ico).*)" };

const ONE_YEAR = 60 * 60 * 24 * 365;

function getCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function denied() {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>접속 키 필요</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:'Malgun Gothic',system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
<div><div style="font-size:9vh;font-weight:700">접속 키가 필요합니다</div>
<div style="font-size:6vh;color:#aaa;margin-top:3vh">분전반에 붙은 QR을 스캔해 주세요</div></div></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

export default function middleware(req) {
  const key = process.env.PANEL_KEY;
  if (!key) return denied();               // 키가 설정 안 됐으면 아무도 못 들어오게

  const url = new URL(req.url);
  const given = url.searchParams.get("k");
  if (given !== null) {
    if (given !== key) return denied();
    url.searchParams.delete("k");
    return new Response(null, {
      status: 302,
      headers: {
        location: url.pathname + (url.search || ""),
        "set-cookie": `pk=${encodeURIComponent(key)}; Path=/; Max-Age=${ONE_YEAR}; Secure; SameSite=Lax`,
        "cache-control": "no-store",
      },
    });
  }
  if (getCookie(req, "pk") === key) return;   // 통과
  return denied();
}
