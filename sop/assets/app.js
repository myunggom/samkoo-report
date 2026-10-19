/* 공통 유틸 */
(function () {
  'use strict';

  window.qs = function (k) {
    return new URLSearchParams(location.search).get(k);
  };

  window.currentTask = function () {
    var id = qs('id');
    var t = window.TASKS[id];
    if (!t) { location.replace('index.html'); return null; }
    document.documentElement.style.setProperty('--tc', t.color);
    return t;
  };

  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  window.topbar = function (title, sub, back) {
    return '<header class="topbar">' +
      (back ? '<a class="back" href="' + back + '" aria-label="뒤로">‹</a>' : '') +
      '<div class="grow"><h1>' + esc(title) + '</h1>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
      '<img class="logo" src="assets/img/logo.png" alt="">' +
      '</header>';
  };

  window.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2000);
  };

  /* 위험도 계산 */
  window.riskClass = function (v) { return v >= 15 ? 'hi' : (v >= 8 ? 'mid' : 'lo'); };
  window.riskLabel = function (v) { return v >= 15 ? '고위험' : (v >= 8 ? '중위험' : '저위험'); };

  /* localStorage 저장 (브라우저별 저장, 실패해도 무시) */
  window.store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  window.todayStr = function () {
    var d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  };

  /* 파일 → 리사이즈된 dataURL (긴 변 1400px, JPEG) */
  window.fileToDataURL = function (file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1400, w = img.width, h = img.height;
        if (Math.max(w, h) > max) { var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(cv.toDataURL('image/jpeg', 0.85)); } catch (e) { cb(fr.result); }
      };
      img.onerror = function () { cb(fr.result); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  };
})();

/* ============================================================
   편집본 오버레이 + 슬라이드(PPT형) 렌더 헬퍼
   ============================================================ */
(function () {
  'use strict';

  window.DATA_KEY = 'sop:data';

  /* 편집기에서 저장한 내용이 있으면 원본 data.js 대신 사용 */
  /* 편집본이 만들어진 뒤 data.js 에 새로 추가된 작업 · 분류는 편집본에 합쳐서 보여준다 */
  window.mergeDraft = function (d, OS, OT) {
    Object.keys(OT).forEach(function (id) { if (!d.TASKS[id]) d.TASKS[id] = OT[id]; });
    if (!d.SITE.groups && OS.groups) d.SITE.groups = OS.groups;
    d.SITE.taskOrder = d.SITE.taskOrder || [];
    (OS.taskOrder || []).forEach(function (id) { if (d.SITE.taskOrder.indexOf(id) < 0) d.SITE.taskOrder.push(id); });
    return d;
  };
  window.applyDraft = function () {
    try {
      var raw = localStorage.getItem(window.DATA_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (d && d.SITE && d.TASKS) {
        mergeDraft(d, window.SITE || {}, window.TASKS || {});
        window.SITE = d.SITE; window.TASKS = d.TASKS; return true;
      }
    } catch (e) { }
    return false;
  };
  window.hasDraft = function () {
    try { return !!localStorage.getItem(window.DATA_KEY); } catch (e) { return false; }
  };
  window.isDraft = window.applyDraft();

  /* 부문 · 챕터 목록 (SITE.groups 가 없으면 taskOrder 전체를 한 묶음으로) */
  window.taskGroups = function () {
    var S = window.SITE, T = window.TASKS, seen = {};
    var gs = (S.groups && S.groups.length) ? S.groups : [{ id: 'all', title: '전체 작업', open: true, chapters: [{ title: '', tasks: S.taskOrder || Object.keys(T) }] }];
    gs = gs.map(function (g) {
      return { id: g.id, title: g.title, desc: g.desc, open: g.open, chapters: (g.chapters || []).map(function (c) {
        return { title: c.title, color: c.color, tasks: (c.tasks || []).filter(function (id) { if (!T[id] || seen[id]) return false; seen[id] = 1; return true; }) };
      }) };
    });
    var rest = (S.taskOrder || Object.keys(T)).filter(function (id) { return T[id] && !seen[id]; });
    Object.keys(T).forEach(function (id) { if (!seen[id] && rest.indexOf(id) < 0) rest.push(id); });
    if (rest.length) gs.push({ id: 'etc', title: '기타', open: true, chapters: [{ title: '', tasks: rest }] });
    return gs;
  };
  /* 해당 작업이 속한 부문 · 챕터 이름 */
  window.taskPath = function (id) {
    var r = null;
    taskGroups().forEach(function (g) { g.chapters.forEach(function (c) { if (c.tasks.indexOf(id) >= 0 && !r) r = { group: g, chapter: c }; }); });
    return r;
  };

  /* 상단 내비게이션 (인쇄 제외) */
  window.snav = function (title, back) {
    return '<div class="snav noprint">' +
      (back ? '<a class="back" href="' + back + '" aria-label="뒤로">‹</a>' : '') +
      '<span class="grow">' + esc(title) + '</span>' +
      (window.isDraft ? '<span style="font-size:11.5px;background:#b45309;padding:3px 8px;border-radius:20px;font-weight:800">편집본</span>' : '') +
      '<a href="edit.html" style="font-size:12.5px;font-weight:700">✎ 내용 수정</a>' +
      '<button type="button" id="btnExport" onclick="(window.openSaveDialog||window.print)()">⤓ 저장 · 인쇄</button>' +
      '</div>';
  };

  /* 슬라이드 머리말 / 꼬리말 */
  window.sHead = function (title, sub, raw) {
    return '<div class="s-head"><div><h1 class="s-title">' + title + '</h1>' +
      (sub ? '<p class="s-sub">' + (raw ? sub : esc(sub)) + '</p>' : '') + '</div>' +
      '<img class="s-logo" src="assets/img/logo.png" alt=""></div>';
  };
  window.sFoot = function (t) {
    if (!t) return '';
    return '<div class="s-foot">' + esc(t.sop) + ' ｜ 문서번호 ' + esc(t.docNo) + ' ｜ 장소 : ' + esc(t.place) + '</div>';
  };

  /* 편집 가능한 꼬리말 */
  window.sFootE = function (t, b) {
    if (!t) return '';
    return '<div class="s-foot"><span' + EA(b + '.sop') + '>' + esc(t.sop) + '</span> ｜ 문서번호 ' +
      '<span' + EA(b + '.docNo') + '>' + esc(t.docNo) + '</span> ｜ 장소 : ' +
      '<span' + EA(b + '.place') + '>' + esc(t.place) + '</span></div>';
  };

  /* 번호 마커가 올라간 그림 */
  window.figWithMarks = function (src, marks) {
    var h = '<div class="pt-figwrap"><img src="assets/img/' + esc(src) + '" alt="">';
    (marks || []).forEach(function (m) {
      h += '<span class="mark" style="left:' + m.x + '%;top:' + m.y + '%">' + m.n + '</span>';
    });
    return h + '</div>';
  };

  window.riskCell = function (v) {
    return '<td class="v ' + (v >= 15 ? 'v-hi' : v >= 8 ? 'v-md' : 'v-lo') + '">' + v + '</td>';
  };

  /* 여러 줄 텍스트를 <p>로 */
  window.lines = function (arr) {
    return (arr || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('');
  };
})();

/* ============================================================
   인라인 편집 지원 (모든 페이지에서 눌러서 수정)
   ============================================================ */
(function () {
  'use strict';

  /* 사진 경로 : 파일명 또는 data URL 모두 지원 */
  window.imgSrc = function (v) {
    if (!v) return '';
    return /^data:/.test(v) ? v : 'assets/img/' + v;
  };

  /* 편집 대상 표시용 속성 */
  window.EA = function (path, type) {
    return ' data-e="' + path + '"' + (type ? ' data-et="' + type + '"' : '');
  };
  window.EI = function (path) { return ' data-ei="' + path + '"'; };

  /* 보고서 · 메인화면의 고정 문구도 편집 가능하도록 SITE 로 승격 */
  var S = window.SITE || (window.SITE = {});
  if (!S.report) S.report = {};
  var R = S.report;
  /* 양식이 바뀌면 v 를 올려 기본값을 새로 채운다 (2 : 사전작업 허가 서명부) */
  if (R.v !== 2) {
    R.v = 2;
    R.title = '사전작업 허가 · 위험성평가 교육 확인 서명부';
    R.subtitle = '표준작업 1건 · 1일 단위로 1장 작성  ｜  교육 · 점검 · 작업 · 정리 사진 4종 필수 첨부';
    R.foot = '안전 표준운영절차  ｜  작업 완료보고서 (공통 서식)  ｜  보존연한 : 3년';
    R.fields = ['작업명', '작업일시', '작업장소', '작업책임자', '작업인원 · 명단', '현장명'];
    R.slots = [
      { n: 1, name: '교육 사진', desc: '작업 전 안전교육 ( TBM ) 실시 장면' },
      { n: 2, name: '안전장구류 점검 사진', desc: '개인보호구 · 장비 점검 상태' },
      { n: 3, name: '작업 사진', desc: '실제 작업 수행 장면' },
      { n: 4, name: '종료 후 정리 사진', desc: '작업장 정리 · 원상복구 상태' }
    ];
    R.checkTitle = '교육 및 평가 실시 내용';
    R.checkNote = '실시 항목 전부 체크';
    R.checks = [
      '안전작업허가(사전작업 허가) 내용 고지',
      '유해 · 위험요인 및 위험성평가 결과 전파',
      '안전작업수칙 및 비상조치 계획 교육',
      '개인보호구 지급 · 착용상태 확인',
      '작업 전 안전점검회의(TBM) 실시'
    ];
    R.crewTitle = '작업 참여자 확인 서명부';
    R.crewNote = '작업자 전원 작성';
    R.crewHead = ['연번', '소속', '성명', '확인 서명'];
    R.crewRows = 5;
    R.signTitle = '확  인';
    R.signHead = ['구분', '성명', '확인 서명'];
    R.signs = ['작성자', '승인자'];
    R.pledge = '본인은 위 작업과 관련하여 안전작업허가 내용 및 위험성평가 결과에 대한 설명을 듣고 충분히 이해하였으며, 안전수칙을 준수할 것을 서약합니다.\n또한 급박한 위험을 인지한 경우 즉시 작업을 중지하고 대피한 후 보고할 수 있음(작업중지권)을 고지받았습니다.';
    R.opinion = '종사자 의견 청취 결과 :';
    R.opinionNone = '해당 없음';
    R.legal = '※ 법적 근거 : 「중대재해처벌법」 제4조 · 시행령 제4조제3호 · 제7호 · 제8호 · 제9호｜「산업안전보건법」 제16조(관리감독자) · 제29조(안전보건교육) · 제36조(위험성평가) · 제52조(근로자의 작업중지)\n※ 본 서명부는 위험성평가표 · 작업 완료보고서와 함께 1건 1세트로 편철하여 3년간 보존　　※ 작업 내용 · 인원 · 공법이 변경되면 반드시 재교육 후 새로 서명을 받을 것';
    delete R.memoTitle; delete R.texts; delete R.note;
  }

  if (!S.hero) S.hero = {};
  if (!S.hero.title) S.hero.title = '작업별 안전 표준운영절차';
  if (!S.hero.text) S.hero.text = '현장에 부착된 QR코드를 스캔하면 해당 작업의 점검 포인트 · 안전지침 · 위험성평가 · 완료보고서를 바로 확인할 수 있습니다.';

  if (!S.labels) S.labels = {};
  var L = S.labels;
  if (!L.partsPanel) L.partsPanel = '각부 명칭 및 점검 포인트';
  if (!L.notePre) L.notePre = '작업 전 점검';
  if (!L.noteUse) L.noteUse = '사용 기준';
  if (!L.noteBan) L.noteBan = '금지 사항';
  if (!L.ppeHead) L.ppeHead = '■ 작업별 필수 개인보호구';
  if (!L.guideHint) L.guideHint = '▲ 장비 상세설명도 — 번호를 짚어가며 좌 · 우 · 하단 항목을 설명하십시오';
  if (!L.riskSub) L.riskSub = '위험도평가 기준 : 빈도강도법 ｜ 빈도 (1~5) x 강도 (1~5)';
})();

/* ── 짧은 라벨 한 줄 유지 ───────────────────────────────────────────
   작업명 · 메뉴 설명 · 보호구 이름처럼 한 줄로 보여야 하는 글이
   칸보다 길면 글씨를 조금만 줄여 한 줄에 맞춘다. (최대 22% 축소)   */
(function oneLine() {
  var SEL = '.taskcard h3,.taskcard .no,.taskcard .meta,' +
            '.menucard strong,.menucard span,.ppe .it span';
  var MIN = 0.78;

  function fit(el) {
    var base = parseFloat(el.getAttribute('data-fs0'));
    if (!base) {
      base = parseFloat(getComputedStyle(el).fontSize);
      el.setAttribute('data-fs0', base);
    }
    el.style.fontSize = base + 'px';
    var room = el.clientWidth, need = el.scrollWidth;
    if (!room || need <= room + 0.5) return;
    var size = Math.max(base * MIN, base * (room / need) - 0.2);
    el.style.fontSize = size.toFixed(2) + 'px';
    if (el.scrollWidth > el.clientWidth + 0.5) {
      el.style.fontSize = (base * MIN).toFixed(2) + 'px';
    }
  }

  function run() {
    var ns = document.querySelectorAll(SEL);
    for (var i = 0; i < ns.length; i++) fit(ns[i]);
  }

  var timer;
  function later() { clearTimeout(timer); timer = setTimeout(run, 60); }

  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later);
  window.addEventListener('resize', later);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  if (window.MutationObserver) {
    new MutationObserver(later).observe(document.documentElement,
      { childList: true, subtree: true });
  }
  window.fitOneLine = run;
})();
