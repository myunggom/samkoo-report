// ─────────────────────────────────────────────────────────────
//  안전 표준운영절차(SOP) 웹사이트 — 로그인(접근 권한) 미들웨어
//  Vercel Edge Middleware  /  무료(Hobby) 요금제에서 동작
//
//  ▸ 이 파일을 웹 배포 폴더의 "맨 바깥"(index.html 과 같은 위치)에 두세요.
//  ▸ Vercel 프로젝트 설정 → Environment Variables 에 아래 2개를 등록하세요.
//
//     SOP_USERS   아이디:비밀번호:이름  형식, 여러 명은 줄바꿈 또는 쉼표로 구분
//                 예)  hong:sop2026!:홍길동
//                      kim:abcd1234:김철수
//                      elec:pw7788:전기팀
//
//     SOP_SECRET  아무도 모르는 임의의 긴 문자열 (로그인 상태 위조 방지용)
//                 예)  ka83jf0s9dl2mx7qzb4vn1ep6hg5tywr
//
//  ※ 비밀번호에 콜론( : ) 과 쉼표( , ) 는 쓰지 마세요.
// ─────────────────────────────────────────────────────────────

export const config = { matcher: '/:path*' };

// ★ 로그인 사용 여부 스위치 ★
//   false : 로그인 없이 누구나 접속 (현재 설정 — 2026.09.29 임시 해제)
//   true  : 아이디·비밀번호 로그인 필요
//   다시 켜려면 아래 false 를 true 로 바꾼 뒤 Vercel_배포.bat 실행
const LOGIN_ENABLED = false;

const COOKIE   = 'sop_auth';
const MAX_AGE  = 60 * 60 * 24 * 30;          // 로그인 유지 30일
const BRAND    = '안전 표준운영절차';

// ── 유틸 ──────────────────────────────────────────────────────
const enc = new TextEncoder();

function b64u(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uToStr(str) {
  let t = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqual(a, b) {                    // 타이밍 공격 방지
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseUsers(raw) {
  const map = {};
  String(raw || '').split(/[\n,;]+/).forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const p = t.split(':');
    if (p.length < 2) return;
    const id = p[0].trim();
    if (!id) return;
    map[id] = { pw: p[1].trim(), name: (p[2] || id).trim() };
  });
  return map;
}

function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// ── 로그인 화면 ────────────────────────────────────────────────
function loginPage(err, next) {
  const html = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${BRAND} — 로그인</title>
<style>
 *{box-sizing:border-box}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#f2f5fa;font-family:"맑은 고딕","Malgun Gothic",system-ui,sans-serif;color:#1f2937;padding:20px}
 .card{width:100%;max-width:380px;background:#fff;border:1px solid #d5dce5;border-radius:14px;
       padding:36px 30px 30px;box-shadow:0 8px 28px rgba(30,58,110,.08)}
 .logo{width:44px;height:44px;border-radius:11px;background:#1e3a6e;color:#fff;display:flex;
       align-items:center;justify-content:center;font-size:21px;font-weight:800;margin-bottom:18px}
 h1{font-size:19px;margin:0 0 6px;color:#1e3a6e;letter-spacing:-.3px}
 p.sub{margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.5}
 label{display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;color:#1f2937}
 input{width:100%;padding:12px 13px;font-size:15px;border:1px solid #cbd4df;border-radius:9px;
       margin-bottom:16px;font-family:inherit;background:#fff}
 input:focus{outline:none;border-color:#1e3a6e;box-shadow:0 0 0 3px rgba(30,58,110,.11)}
 button{width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;background:#1e3a6e;
        border:0;border-radius:9px;cursor:pointer;font-family:inherit}
 button:hover{background:#162d56}
 .err{background:#fbe3e3;border:1px solid #c62828;color:#c62828;font-size:13px;font-weight:700;
      padding:10px 12px;border-radius:8px;margin-bottom:18px}
 .foot{margin-top:20px;font-size:11.5px;color:#9aa7b6;line-height:1.6;text-align:center}
</style></head><body>
<form class="card" method="POST" action="/api/login">
  <div class="logo">安</div>
  <h1>${BRAND}</h1>
  <p class="sub">접근 권한이 있는 담당자만 열람할 수 있습니다.<br>발급받은 아이디로 로그인하십시오.</p>
  ${err ? '<div class="err">아이디 또는 비밀번호가 올바르지 않습니다.</div>' : ''}
  <input type="hidden" name="next" value="${(next || '/').replace(/"/g, '&quot;')}">
  <label for="id">아이디</label>
  <input id="id" name="id" autocomplete="username" autocapitalize="off" autocorrect="off" required>
  <label for="pw">비밀번호</label>
  <input id="pw" name="pw" type="password" autocomplete="current-password" required>
  <button type="submit">로그인</button>
  <div class="foot">로그인 후 30일간 유지됩니다.<br>계정 발급 · 문의는 시설관리소장에게 연락하십시오.</div>
</form></body></html>`;
  return new Response(html, {
    status: err ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function setupPage(msg) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:'맑은 고딕',sans-serif;padding:40px;color:#1f2937">
     <h2 style="color:#c62828">설정이 필요합니다</h2><p>${msg}</p>
     <p style="font-size:14px;color:#6b7280">Vercel → 프로젝트 → Settings → Environment Variables 에서
     <b>SOP_USERS</b> 와 <b>SOP_SECRET</b> 을 등록한 뒤 다시 배포하십시오.</p></body>`,
    { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── 메인 ──────────────────────────────────────────────────────
export default async function middleware(request) {
  const url    = new URL(request.url);
  const path   = url.pathname;

  // 로그인 해제 상태 — 모든 페이지를 그대로 공개
  if (!LOGIN_ENABLED) {
    if (path === '/login' || path === '/login.html' || path === '/api/login') {
      return new Response(null, { status: 303, headers: { Location: '/' } });
    }
    return undefined;
  }
  const SECRET = process.env.SOP_SECRET;
  const USERS  = parseUsers(process.env.SOP_USERS);

  // 로그아웃
  if (path === '/api/logout' || path === '/logout') {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/login',
        'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  if (!SECRET || Object.keys(USERS).length === 0) {
    return setupPage('환경변수 SOP_USERS 또는 SOP_SECRET 이 등록되지 않았습니다.');
  }

  // 로그인 처리
  if (path === '/api/login' && request.method === 'POST') {
    const form = new URLSearchParams(await request.text());
    const id   = (form.get('id') || '').trim();
    const pw   = (form.get('pw') || '').trim();
    let next   = form.get('next') || '/';
    if (!next.startsWith('/') || next.startsWith('//')) next = '/';

    const u = USERS[id];
    if (!u || !safeEqual(u.pw, pw)) {
      return new Response(null, {
        status: 303,
        headers: { Location: '/login?e=1&next=' + encodeURIComponent(next) },
      });
    }
    const payload = b64u(enc.encode(JSON.stringify({
      u: id, n: u.name, e: Date.now() + MAX_AGE * 1000,
    })));
    const token = payload + '.' + (await hmac(payload, SECRET));
    return new Response(null, {
      status: 303,
      headers: {
        Location: next,
        'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
      },
    });
  }

  // 현재 로그인 상태 확인
  let user = null;
  const token = getCookie(request, COOKIE);
  if (token && token.includes('.')) {
    const [payload, sig] = token.split('.');
    try {
      if (safeEqual(sig, await hmac(payload, SECRET))) {
        const data = JSON.parse(b64uToStr(payload));
        if (data.e > Date.now() && USERS[data.u]) user = data;
      }
    } catch (_) { /* 손상된 쿠키 무시 */ }
  }

  // 로그인 화면
  if (path === '/login' || path === '/login.html') {
    if (user) return new Response(null, { status: 303, headers: { Location: '/' } });
    return loginPage(url.searchParams.get('e'), url.searchParams.get('next'));
  }

  // 미로그인 → 로그인 화면으로
  if (!user) {
    if (path === '/favicon.ico') return new Response(null, { status: 204 });
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/login?next=' + encodeURIComponent(path + url.search),
        'cache-control': 'no-store',
      },
    });
  }

  // 로그인 통과 — 원래 파일을 그대로 제공
  return undefined;
}
