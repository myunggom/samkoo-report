/* ============================================================
   inline.js — 화면에서 바로 고치기 (편집 모드)
   · 상단 [✎ 편집] 을 누르면 글자를 눌러 고치고, 사진을 눌러 바꿀 수 있습니다.
   · 고친 내용은 이 브라우저(localStorage)에 저장됩니다.
   · [⤓ data.js 내려받기] 후 Vercel_배포.bat 을 실행하면 모두에게 반영됩니다.
   ============================================================ */
(function () {
  'use strict';
  var KEY = window.DATA_KEY || 'sop:data';
  var MODE = 'sop:editmode';
  var on = false, timer = null, curImg = null;

  function seg(p) { return p.split('.').map(function (x) { return /^\d+$/.test(x) ? +x : x; }); }
  function root() { return { SITE: window.SITE, TASKS: window.TASKS }; }
  function get(p) { return seg(p).reduce(function (o, k) { return o == null ? o : o[k]; }, root()); }
  function set(p, v) {
    var s = seg(p), last = s.pop();
    var o = s.reduce(function (a, k) { return a == null ? a : a[k]; }, root());
    if (o) o[last] = v;
  }
  function st(msg, warn) {
    var e = document.getElementById('ebSt');
    if (e) { e.textContent = msg; e.className = warn ? 'warn' : ''; }
  }
  function save() {
    try {
      var s = JSON.stringify({ SITE: window.SITE, TASKS: window.TASKS });
      localStorage.setItem(KEY, s);
      st('저장됨 · ' + Math.round(s.length / 1024) + ' KB');
    } catch (e) { st('저장 실패 : 용량 초과 — 올린 사진 수를 줄이세요', true); }
  }
  function saveSoon() { clearTimeout(timer); timer = setTimeout(save, 500); st('입력 중...'); }

  /* ── 편집 모드 ON / OFF ── */
  function apply() {
    document.body.classList.toggle('edit-on', on);
    document.querySelectorAll('[data-e]').forEach(function (el) {
      if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); }
      else el.removeAttribute('contenteditable');
    });
    var b = document.getElementById('ebToggle');
    if (b) b.textContent = on ? '✓ 편집 끝내기' : '✎ 편집';
    var bar = document.getElementById('ebar');
    if (bar) bar.style.display = on ? '' : 'none';
    try { sessionStorage.setItem(MODE, on ? '1' : ''); } catch (e) { }
  }
  function toggle() { on = !on; apply(); st(''); }

  /* ── 글자 편집 ── */
  document.addEventListener('input', function (ev) {
    if (!on) return;
    var el = ev.target.closest && ev.target.closest('[data-e]');
    if (!el) return;
    var v = el.innerText.replace(/ /g, ' ').replace(/\n+$/, '').trim();
    if (el.dataset.et === 'num') { var n = parseInt(v, 10); v = isNaN(n) ? 1 : n; }
    set(el.dataset.e, v);
    saveSoon();
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (!on) return;
    var el = ev.target.closest && ev.target.closest('[data-e]');
    if (el && ev.key === 'Enter' && el.dataset.et !== 'multi') { ev.preventDefault(); el.blur(); }
  }, true);
  document.addEventListener('paste', function (ev) {
    if (!on) return;
    var el = ev.target.closest && ev.target.closest('[data-e]');
    if (!el) return;
    ev.preventDefault();
    var t = (ev.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, t.replace(/\s*\n\s*/g, ' '));
  }, true);

  /* ── 숫자 입력칸(위험성평가표) 도 편집 모드에서는 원본값을 바꿈 ── */
  document.addEventListener('change', function (ev) {
    if (!on) return;
    var el = ev.target;
    if (el.dataset && el.dataset.ed) {
      var n = parseInt(el.value, 10);
      if (!isNaN(n)) { set(el.dataset.ed, Math.max(1, Math.min(5, n))); saveSoon(); }
    }
  }, true);

  /* ── 사진 편집 ── */
  document.addEventListener('click', function (ev) {
    if (!on) return;
    var el = ev.target.closest && ev.target.closest('[data-ei]');
    if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    openPicker(el.dataset.ei);
  }, true);

  function openPicker(path) {
    curImg = path;
    var cur = get(path) || '';
    var list = window.IMGLIST || [];
    var h = '<div class="ip"><div class="ip-h"><b>사진 선택</b>' +
      '<span class="ip-p">' + esc(/^data:/.test(cur) ? '(올린 사진)' : cur || '(없음)') + '</span>' +
      '<button type="button" class="ip-x">닫기</button></div>' +
      '<div class="ip-b"><div class="ip-grid">' +
      list.map(function (f) {
        return '<button type="button" class="ip-i' + (f === cur ? ' on' : '') + '" data-f="' + esc(f) + '">' +
          '<img src="assets/img/' + esc(f) + '" alt="" loading="lazy"><span>' + esc(f) + '</span></button>';
      }).join('') + '</div></div>' +
      '<div class="ip-f"><label class="ip-btn pri">＋ 새 사진 올리기' +
      '<input type="file" accept="image/*" hidden id="ipFile"></label>' +
      '<button type="button" class="ip-btn" id="ipNone">사진 없애기</button>' +
      '<span class="ip-hint">올린 사진은 data.js 안에 함께 저장됩니다. 용량이 커지면 assets\\img 폴더에 파일을 넣고 파일명을 고르는 편이 좋습니다.</span>' +
      '</div></div>';
    var mask = document.createElement('div');
    mask.className = 'ip-mask'; mask.innerHTML = h;
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask || e.target.closest('.ip-x')) close(); });
    mask.querySelectorAll('.ip-i').forEach(function (b) {
      b.addEventListener('click', function () { pick(b.dataset.f); });
    });
    mask.querySelector('#ipNone').addEventListener('click', function () { pick(null); });
    mask.querySelector('#ipFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      shrink(f, function (url) { pick(url); });
    });
    function close() { mask.remove(); }
    window.__ipClose = close;
  }
  function pick(v) {
    set(curImg, v);
    save();
    if (window.__ipClose) window.__ipClose();
    location.reload();
  }
  function shrink(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var max = 1000, w = im.width, h = im.height;
        if (Math.max(w, h) > max) { var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        try { cb(c.toDataURL('image/jpeg', 0.82)); } catch (e) { cb(fr.result); }
      };
      im.onerror = function () { cb(fr.result); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* ── data.js 내려받기 ── */
  window.exportDataJs = function () {
    var s = '/* 작업별 안전 표준운영절차 데이터 — 웹에서 편집 후 저장 (' +
      new Date().toLocaleString('ko-KR') + ') */\n' +
      'window.SITE = ' + JSON.stringify(window.SITE, null, 2) + ';\n\n' +
      'window.TASKS = ' + JSON.stringify(window.TASKS, null, 2) + ';\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], { type: 'text/javascript;charset=utf-8' }));
    a.download = 'data.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    st('data.js 를 내려받았습니다 → Vercel_배포.bat 실행');
  };

  /* ── 버튼 붙이기 ── */
  window.initInline = function () {
    var nav = document.querySelector('.snav');
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'ebToggle'; b.textContent = '✎ 편집';
    b.addEventListener('click', toggle);
    if (nav) nav.insertBefore(b, nav.querySelector('button') || null);
    else { b.className = 'eb-float noprint'; document.body.appendChild(b); }
    var bar = document.createElement('div');
    bar.id = 'ebar'; bar.className = 'ebar noprint'; bar.style.display = 'none';
    bar.innerHTML = '<b>편집 모드</b><span class="eb-h">글자를 눌러 고치고, 사진을 눌러 바꾸세요</span>' +
      '<span id="ebSt"></span><span class="eb-sp"></span>' +
      '<button type="button" id="ebExport" class="pri">⤓ data.js 내려받기</button>' +
      '<a href="edit.html" class="eb-a">전체 편집기</a>' +
      '<button type="button" id="ebRevert">원본으로</button>' +
      '<button type="button" id="ebOff">편집 끝내기</button>';
    document.body.appendChild(bar);
    bar.querySelector('#ebExport').addEventListener('click', window.exportDataJs);
    bar.querySelector('#ebOff').addEventListener('click', toggle);
    bar.querySelector('#ebRevert').addEventListener('click', function () {
      if (!confirm('이 브라우저에서 고친 내용을 모두 버리고 배포된 원본으로 되돌립니다.')) return;
      try { localStorage.removeItem(KEY); } catch (e) { }
      location.reload();
    });
    try { on = !!sessionStorage.getItem(MODE); } catch (e) { on = false; }
    apply();
  };
})();
