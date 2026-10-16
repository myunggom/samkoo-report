/* ============================================================
   edit.js — 내용 수정 편집기
   · 수정본은 이 브라우저(localStorage)에 저장되어 즉시 미리보기 가능
   · [data.js 내려받기] 로 파일을 받아 assets/data.js 를 덮어쓰고
     Vercel_배포.bat 을 실행하면 모두에게 반영됩니다.
   ============================================================ */
(function () {
  'use strict';

  var D = null, ORIG = null, cur = null, tab = 'base', dirty = false;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function seg(p) { return p.split('.').map(function (x) { return /^\d+$/.test(x) ? +x : x; }); }
  function get(p) { return seg(p).reduce(function (o, k) { return o == null ? o : o[k]; }, D); }
  function set(p, v) {
    var s = seg(p), last = s.pop();
    s.reduce(function (a, k) { return a[k]; }, D)[last] = v;
  }
  function E(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function markDirty() {
    dirty = true;
    var b = document.getElementById('btnSave');
    if (b) { b.classList.add('hot'); b.textContent = '● 저장 (미저장 변경)'; }
  }
  function status(msg) { document.getElementById('status').textContent = msg; }

  /* ── 입력 위젯 ── */
  function txt(p, label, ph, wide) {
    return '<div class="fld' + (wide ? ' w' : '') + '"><label>' + E(label) + '</label>' +
      '<input data-p="' + p + '" value="' + E(get(p)) + '" placeholder="' + E(ph || '') + '"></div>';
  }
  function num(p, label) {
    return '<div class="fld n"><label>' + E(label) + '</label>' +
      '<input type="number" min="1" max="5" data-p="' + p + '" data-t="num" value="' + E(get(p)) + '"></div>';
  }
  function chk(p, label) {
    return '<label class="chk"><input type="checkbox" data-p="' + p + '" data-t="bool"' +
      (get(p) ? ' checked' : '') + '> ' + E(label) + '</label>';
  }
  function listArea(p, label, hint) {
    var v = (get(p) || []).join('\n');
    return '<div class="fld w"><label>' + E(label) + (hint ? ' <em>' + E(hint) + '</em>' : '') + '</label>' +
      '<textarea rows="' + Math.max(2, (get(p) || []).length + 1) + '" data-p="' + p + '" data-t="list">' + E(v) + '</textarea></div>';
  }
  function img(p, label) {
    var v = get(p) || '';
    return '<div class="fld"><label>' + E(label) + '</label><div class="imgrow">' +
      '<input list="imgnames" data-p="' + p + '" value="' + E(v) + '" placeholder="예) ppe_helmet.jpg">' +
      (v ? '<img src="' + (/^data:/.test(v) ? v : 'assets/img/' + E(v)) + '" alt="" onerror="this.style.opacity=.15">' : '<span class="noimg">없음</span>') +
      '</div></div>';
  }
  function rowHead(title, path, i, n) {
    return '<div class="rh"><b>' + E(title) + '</b><span class="sp"></span>' +
      '<button type="button" class="mini" data-act="up" data-arr="' + path + '" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="mini" data-act="down" data-arr="' + path + '" data-i="' + i + '"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="mini del" data-act="del" data-arr="' + path + '" data-i="' + i + '">삭제</button></div>';
  }
  function addBtn(path, kind, label) {
    return '<button type="button" class="add" data-act="add" data-arr="' + path + '" data-kind="' + kind + '">+ ' + E(label) + '</button>';
  }
  function lvl(v) { return v >= 15 ? 'hi' : v >= 8 ? 'md' : 'lo'; }

  /* ── 탭별 폼 ── */
  var TABS = [
    ['base', '기본 정보'], ['parts', '각부 명칭'], ['ppe', '개인보호구'],
    ['guide', '교육자료'], ['risk', '위험성평가'], ['report', '보고서 예시'], ['site', '사이트 정보']
  ];

  function formBase() {
    var b = 'TASKS.' + cur;
    return '<div class="grid">' +
      txt(b + '.no', '번호', '1') + txt(b + '.name', '작업명', '사다리 작업') +
      txt(b + '.color', '대표 색상', '#1d4ed8') + txt(b + '.place', '장소', '공통') +
      txt(b + '.sop', 'SOP 구분', '안전 표준운영절차 1. 공통부문', true) +
      txt(b + '.docNo', '문서번호', '공통(장비/시설) 1-2', true) + '</div>';
  }

  function markUI(b, p) {
    if (!p.figure) return '';
    var marks = p.marks || [];
    return '<div class="sec sub"><h4>번호 마커 위치 <em>그림 위 빈 곳을 누르면 추가 · 드래그로 이동 · 더블클릭하면 삭제</em></h4>' +
      '<div class="markbox"><span class="mkwrap" id="mkwrap">' +
      '<img src="assets/img/' + E(p.figure) + '" alt="" id="mkimg">' +
      marks.map(function (m, i) {
        return '<span class="mk" data-mi="' + i + '" style="left:' + m.x + '%;top:' + m.y + '%">' + m.n + '</span>';
      }).join('') + '</span></div>' +
      '<div class="mkbar"><button type="button" class="mini" data-act="mkclear">마커 전체 삭제</button></div></div>';
  }

  function formParts() {
    var b = 'TASKS.' + cur + '.parts', p = get(b);
    var h = '<div class="grid">' + txt(b + '.title', '슬라이드 제목', '', true) +
      txt(b + '.subtitle', '부제 (한 줄 설명)', '', true) +
      txt(b + '.figureCaption', '그림 설명', '', true) + '</div>';
    if (p.figures) h += '<div class="sec"><h4>그림 파일 (여러 장)</h4>' + listArea(b + '.figures', '파일명 — 한 줄에 하나') + '</div>';
    else h += '<div class="sec"><h4>그림 파일</h4>' + img(b + '.figure', '파일명') + markUI(b, p) + '</div>';

    h += '<div class="sec"><h4>점검 항목 <em>번호 · 명칭 · 설명</em></h4>';
    (p.items || []).forEach(function (it, i) {
      h += '<div class="row">' + rowHead(it.n + '. ' + (it.name || ''), b + '.items', i, p.items.length) +
        '<div class="grid">' + num(b + '.items.' + i + '.n', '번호') +
        txt(b + '.items.' + i + '.name', '명칭') +
        txt(b + '.items.' + i + '.desc', '설명 (작은 글씨)', '', true) + '</div></div>';
    });
    h += addBtn(b + '.items', 'partItem', '점검 항목 추가') + '</div>';
    h += '<div class="sec"><h4>하단 3개 상자</h4>' +
      listArea(b + '.pre', '작업 전 점검 (파란 상자)', '한 줄에 하나') +
      listArea(b + '.use', '사용 기준 (초록 상자)', '한 줄에 하나') +
      listArea(b + '.ban', '금지 사항 (빨간 상자)', '한 줄에 하나') + '</div>';
    return h;
  }

  function formPpe() {
    var b = 'TASKS.' + cur, t = get(b);
    if (t.ppeNote === undefined) t.ppeNote = '';
    var h = '<div class="sec"><h4>개인보호구</h4>';
    (t.ppe || []).forEach(function (x, i) {
      h += '<div class="row">' + rowHead(x.name || '(이름 없음)', b + '.ppe', i, t.ppe.length) +
        '<div class="grid">' + txt(b + '.ppe.' + i + '.name', '명칭') + img(b + '.ppe.' + i + '.img', '이미지 파일') + '</div></div>';
    });
    h += addBtn(b + '.ppe', 'ppe', '보호구 추가') + '</div>';
    h += '<div class="sec"><h4>보호구 주의문구</h4>' +
      txt(b + '.ppeNote', '※ 로 시작하는 빨간 안내문 (비워두면 표시 안 됨)', '', true) + '</div>';
    return h;
  }

  function formGuide() {
    var b = 'TASKS.' + cur + '.guide', G = get(b) || [], h = '';
    if (get('TASKS.' + cur + '.guideFigure') !== undefined)
      h += '<div class="sec"><h4>교육자료 가운데 그림 <em>비우면 각부 명칭 그림을 사용</em></h4>' +
        img('TASKS.' + cur + '.guideFigure', '파일명') + '</div>';
    G.forEach(function (g, gi) {
      h += '<div class="sec"><h4>' + E(g.title) + ' <em>' + (gi === 2 ? '하단 가로 배치' : '좌 · 우 세로 배치') + '</em></h4>' +
        txt(b + '.' + gi + '.title', '구역 제목', '', true);
      (g.items || []).forEach(function (it, i) {
        var q = b + '.' + gi + '.items.' + i;
        h += '<div class="row">' + rowHead(it.n + '. ' + (it.name || ''), b + '.' + gi + '.items', i, g.items.length) +
          '<div class="grid">' + num(q + '.n', '번호') + txt(q + '.name', '항목명') +
          txt(q + '.warn', '위험 태그 (예: 추락 · 사망)') + img(q + '.img', '사진 파일') + '</div>' +
          '<div class="chkrow">' + chk(q + '.must', '[필수] 빨간 태그 표시') + '</div>' +
          listArea(q + '.bullets', '설명 (한 줄에 하나)') + '</div>';
      });
      h += addBtn(b + '.' + gi + '.items', 'guideItem', '항목 추가') + '</div>';
    });
    return h;
  }

  function formRisk() {
    var b = 'TASKS.' + cur + '.risk', R = get(b);
    var h = '<div class="grid">' + txt(b + '.target', '평가대상', '', true) +
      txt(b + '.date', '평가일자 (비워두면 현장 입력)') + txt(b + '.assessor', '평가자') + '</div>';
    h += '<div class="sec"><h4>평가 행</h4>';
    (R.rows || []).forEach(function (r, i) {
      var q = b + '.rows.' + i, v1 = (r.f || 0) * (r.s || 0), v2 = (r.f2 || 0) * (r.s2 || 0);
      h += '<div class="row">' + rowHead((i + 1) + '. ' + (r.step || ''), b + '.rows', i, R.rows.length) +
        '<div class="grid">' + txt(q + '.step', '작업단계') + txt(q + '.due', '조치 기한') + txt(q + '.owner', '담당자') + '</div>' +
        listArea(q + '.hazards', '유해 · 위험요인 (한 줄에 하나)') +
        listArea(q + '.results', '위험 발생 상황 및 결과 (한 줄에 하나)') +
        listArea(q + '.measures', '위험성 감소대책 (한 줄에 하나)') +
        '<div class="grid nums">' + num(q + '.f', '빈도') + num(q + '.s', '강도') +
        '<div class="fld n"><label>현재 위험도</label><div class="calc ' + lvl(v1) + '">' + v1 + '</div></div>' +
        num(q + '.f2', '개선 후 빈도') + num(q + '.s2', '개선 후 강도') +
        '<div class="fld n"><label>개선 후</label><div class="calc ' + lvl(v2) + '">' + v2 + '</div></div>' +
        '</div></div>';
    });
    h += addBtn(b + '.rows', 'riskRow', '평가 행 추가') + '</div>';
    return h;
  }

  function formReport() {
    var b = 'TASKS.' + cur + '.report', R = get(b);
    if (!R) { D.TASKS[cur].report = { sample: {}, examples: [] }; R = get(b); }
    if (!R.sample) R.sample = { name: '', date: '', place: '', leader: '', crew: '' };
    if (!R.examples) R.examples = [];
    return '<div class="sec"><h4>예시 정보</h4><div class="grid">' +
      txt(b + '.sample.name', '작업명') + txt(b + '.sample.date', '작업일시') +
      txt(b + '.sample.place', '작업장소') + txt(b + '.sample.leader', '작업책임자') +
      txt(b + '.sample.crew', '작업인원 · 명단', '', true) + '</div></div>' +
      '<div class="sec"><h4>예시 사진</h4>' +
      listArea(b + '.examples', '파일명 — 한 줄에 하나 (교육 · 점검 · 작업 · 정리 순서)') + '</div>';
  }

  function formSite() {
    return '<div class="sec"><h4>사이트 공통</h4><div class="grid">' +
      txt('SITE.org', '기관명', '', true) + txt('SITE.owner', '작성자 표기', '', true) + '</div>' +
      listArea('SITE.taskOrder', '메인화면 작업 순서 (작업 id — 한 줄에 하나)',
        '등록된 id : ' + Object.keys(D.TASKS).join(', ')) + '</div>';
  }

  var FORM = { base: formBase, parts: formParts, ppe: formPpe, guide: formGuide, risk: formRisk, report: formReport, site: formSite };

  var NEW = {
    partItem: function (a) { return { n: a.length + 1, name: '새 항목', desc: '' }; },
    ppe: function () { return { name: '보호구', img: '' }; },
    guideItem: function (a) { return { n: a.length + 1, name: '새 항목', must: false, warn: '', img: null, bullets: [''] }; },
    riskRow: function () { return { step: '새 작업단계', hazards: [''], results: [''], f: 3, s: 3, measures: [''], due: '', owner: '', done: '', f2: 1, s2: 2 }; }
  };

  /* ── 렌더 ── */
  function render() {
    var t = D.TASKS[cur];
    /* 작업 선택 : 부문 · 챕터별 목록 (작업이 많아 드롭다운으로) */
    var S0 = window.SITE, T0 = window.TASKS; window.SITE = D.SITE; window.TASKS = D.TASKS;
    var GS = window.taskGroups ? taskGroups() : [{ title: '', chapters: [{ title: '', tasks: Object.keys(D.TASKS) }] }];
    window.SITE = S0; window.TASKS = T0;
    var tsel = '<label style="font-size:13px;font-weight:800;color:#1e3a6e;align-self:center">작업 선택</label>' +
      '<select id="tksel" style="flex:1;min-width:240px;max-width:560px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px">';
    GS.forEach(function (g) {
      g.chapters.forEach(function (c) {
        if (!c.tasks.length) return;
        tsel += '<optgroup label="' + E(g.title + (c.title && c.title !== g.title ? '  ›  ' + c.title : '')) + '">' +
          c.tasks.map(function (id) {
            return '<option value="' + id + '"' + (id === cur ? ' selected' : '') + '>' +
              E(D.TASKS[id].no + '. ' + D.TASKS[id].name + '  (' + D.TASKS[id].docNo + ')') + '</option>';
          }).join('') + '</optgroup>';
      });
    });
    document.getElementById('taskbar').innerHTML = tsel + '</select>';
    document.getElementById('tksel').onchange = function () { cur = this.value; render(); };
    document.getElementById('tabbar').innerHTML = TABS.map(function (x) {
      return '<button type="button" class="tb' + (x[0] === tab ? ' on' : '') + '" data-tab="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var lb = (TABS.filter(function (x) { return x[0] === tab; })[0] || [])[1] || '';
    document.getElementById('form').innerHTML =
      '<div class="ftitle">' + E(tab === 'site' ? '사이트 공통 설정' : t.no + '. ' + t.name) +
      ' <span>' + E(lb) + '</span></div>' + FORM[tab]();
    bindMarks();
  }

  /* ── 마커 드래그 ── */
  var mkDrag = null;
  function bindMarks() {
    var wrap = document.getElementById('mkwrap');
    if (!wrap) return;
    var b = 'TASKS.' + cur + '.parts';
    function pos(ev) {
      var r = wrap.getBoundingClientRect();
      return { x: Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100)),
               y: Math.max(0, Math.min(100, (ev.clientY - r.top) / r.height * 100)) };
    }
    wrap.addEventListener('mousedown', function (ev) {
      var m = ev.target.closest('.mk'); if (!m) return;
      ev.preventDefault(); mkDrag = { i: +m.dataset.mi, el: m, wrap: wrap, base: b, moved: false };
    });
    wrap.addEventListener('click', function (ev) {
      if (ev.target.closest('.mk')) return;
      if (!get(b + '.marks')) set(b + '.marks', []);
      var marks = get(b + '.marks'), p = pos(ev);
      marks.push({ n: marks.length + 1, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
      markDirty(); render();
    });
    wrap.addEventListener('dblclick', function (ev) {
      var m = ev.target.closest('.mk'); if (!m) return;
      get(b + '.marks').splice(+m.dataset.mi, 1); markDirty(); render();
    });
  }
  window.addEventListener('mousemove', function (ev) {
    if (!mkDrag) return;
    var r = mkDrag.wrap.getBoundingClientRect();
    var x = Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100));
    var y = Math.max(0, Math.min(100, (ev.clientY - r.top) / r.height * 100));
    var marks = get(mkDrag.base + '.marks');
    marks[mkDrag.i].x = Math.round(x * 10) / 10;
    marks[mkDrag.i].y = Math.round(y * 10) / 10;
    mkDrag.el.style.left = marks[mkDrag.i].x + '%';
    mkDrag.el.style.top = marks[mkDrag.i].y + '%';
    mkDrag.moved = true; markDirty();
  });
  window.addEventListener('mouseup', function () { mkDrag = null; });

  /* ── 이벤트 ── */
  function onInput(ev) {
    var el = ev.target, p = el.dataset.p;
    if (!p) return;
    var t = el.dataset.t;
    if (t === 'list') set(p, el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean));
    else if (t === 'num') { var v = parseInt(el.value, 10); set(p, isNaN(v) ? 1 : v); }
    else if (t === 'bool') set(p, el.checked);
    else set(p, el.value);
    markDirty();
  }
  function onClick(ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.task) { cur = b.dataset.task; render(); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    var act = b.dataset.act; if (!act) return;
    if (act === 'mkclear') { set('TASKS.' + cur + '.parts.marks', []); markDirty(); render(); return; }
    var arr = get(b.dataset.arr), i = +b.dataset.i;
    if (act === 'del') { if (!confirm('이 항목을 삭제합니다.')) return; arr.splice(i, 1); }
    else if (act === 'up') arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'down') arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'add') arr.push(NEW[b.dataset.kind](arr));
    else return;
    markDirty(); render();
  }

  /* ── 저장 / 내보내기 ── */
  function saveDraft() {
    try {
      localStorage.setItem(window.DATA_KEY, JSON.stringify({ SITE: D.SITE, TASKS: D.TASKS }));
      dirty = false;
      var b = document.getElementById('btnSave');
      b.classList.remove('hot'); b.textContent = '✔ 저장됨';
      setTimeout(function () { b.textContent = '저장'; }, 1600);
      status('이 브라우저에 저장했습니다. 사이트의 모든 페이지에 바로 반영됩니다.');
      return true;
    } catch (e) { alert('저장에 실패했습니다 : ' + e.message); return false; }
  }
  function exportJs() {
    var s = '/* 작업별 안전 표준운영절차 데이터 — edit.html 편집기에서 저장 (' +
      new Date().toLocaleString('ko-KR') + ') */\n' +
      'window.SITE = ' + JSON.stringify(D.SITE, null, 2) + ';\n\n' +
      'window.TASKS = ' + JSON.stringify(D.TASKS, null, 2) + ';\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], { type: 'text/javascript;charset=utf-8' }));
    a.download = 'data.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    status('data.js 를 내려받았습니다 → 다운로드 폴더에 두고 Vercel_배포.bat 을 실행하면 자동으로 반영됩니다.');
  }
  function importJs(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var w = {};
        (new Function('window', fr.result))(w);
        if (!w.SITE || !w.TASKS) throw new Error('SITE / TASKS 를 찾을 수 없습니다');
        D = { SITE: w.SITE, TASKS: w.TASKS };
        cur = (D.SITE.taskOrder && D.SITE.taskOrder[0]) || Object.keys(D.TASKS)[0];
        markDirty(); render();
        status('파일을 불러왔습니다. [저장] 을 눌러야 사이트에 반영됩니다.');
      } catch (e) { alert('data.js 를 읽지 못했습니다 : ' + e.message); }
    };
    fr.readAsText(file, 'utf-8');
  }

  /* ── 시작 ── */
  window.startEditor = function (origSite, origTasks) {
    ORIG = { SITE: clone(origSite), TASKS: clone(origTasks) };
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(window.DATA_KEY) || 'null'); } catch (e) { }
    D = (draft && draft.SITE && draft.TASKS) ? window.mergeDraft(draft, clone(ORIG.SITE), clone(ORIG.TASKS)) : clone(ORIG);
    cur = (D.SITE.taskOrder && D.SITE.taskOrder[0]) || Object.keys(D.TASKS)[0];

    var f = document.getElementById('form');
    f.addEventListener('input', onInput);
    f.addEventListener('change', onInput);
    document.body.addEventListener('click', onClick);
    document.getElementById('btnSave').addEventListener('click', saveDraft);
    document.getElementById('btnExport').addEventListener('click', function () {
      if (dirty) saveDraft();
      exportJs();
    });
    document.getElementById('btnPreview').addEventListener('click', function () {
      if (dirty) saveDraft();
      window.open('parts.html?id=' + cur, '_blank');
    });
    document.getElementById('fileIn').addEventListener('change', function () {
      if (this.files && this.files[0]) importJs(this.files[0]);
      this.value = '';
    });
    document.getElementById('btnRevert').addEventListener('click', function () {
      if (!confirm('편집한 내용을 모두 버리고 배포된 원본(data.js)으로 되돌립니다.')) return;
      try { localStorage.removeItem(window.DATA_KEY); } catch (e) { }
      location.reload();
    });
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    if (draft) status('이 브라우저에 저장된 편집본을 불러왔습니다.');
    render();
  };
})();
