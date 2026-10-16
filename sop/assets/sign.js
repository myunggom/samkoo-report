/* ============================================================
   sign.js — 손글씨 서명 입력
   · 화면에 손가락 · 마우스 · 펜으로 서명하면 이미지로 저장됩니다.
   · 종이에 한 서명을 찍어 [사진으로 올리기] 해도 됩니다.
   ============================================================ */
(function () {
  'use strict';

  /* 여백을 잘라내고 PNG data URL 로 */
  function trim(cv) {
    var ctx = cv.getContext('2d');
    var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    var x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0, found = false;
    for (var y = 0; y < cv.height; y++) {
      for (var x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] > 8) {
          found = true;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (!found) return null;
    var pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(cv.width - 1, x1 + pad); y1 = Math.min(cv.height - 1, y1 + pad);
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    var out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
    return out.toDataURL('image/png');
  }

  /* 업로드한 사진에서 흰 배경을 투명하게 (밝은 픽셀 제거) */
  function fromPhoto(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var max = 900, w = im.width, h = im.height;
        if (Math.max(w, h) > max) { var r = max / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.drawImage(im, 0, 0, w, h);
        try {
          var img = ctx.getImageData(0, 0, w, h), d = img.data;
          for (var i = 0; i < d.length; i += 4) {
            var lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
            if (lum > 190) d[i + 3] = 0;                         /* 밝은 종이 → 투명 */
            else if (lum > 120) d[i + 3] = Math.round((190 - lum) / 70 * 255);
            else { d[i] = 20; d[i + 1] = 30; d[i + 2] = 70; }    /* 진한 획 → 남색 */
          }
          ctx.putImageData(img, 0, 0);
          cb(trim(cv) || cv.toDataURL('image/png'));
        } catch (e) { cb(cv.toDataURL('image/png')); }
      };
      im.onerror = function () { cb(null); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* 서명 입력 창 열기 — done(dataURL 또는 null) */
  window.signPad = function (title, cur, done) {
    var mask = document.createElement('div');
    mask.className = 'sg-mask';
    mask.innerHTML =
      '<div class="sg"><div class="sg-h"><b>' + (title || '서명') + '</b>' +
      '<span class="sg-hint">아래 칸에 손가락 · 마우스 · 펜으로 서명하세요</span>' +
      '<button type="button" class="sg-x">닫기</button></div>' +
      '<div class="sg-b"><canvas id="sgCv"></canvas><div class="sg-line"></div></div>' +
      '<div class="sg-f">' +
      '<button type="button" class="sg-btn" id="sgClear">지우기</button>' +
      '<label class="sg-btn">사진으로 올리기<input type="file" accept="image/*" hidden id="sgFile"></label>' +
      '<span class="sg-sp"></span>' +
      (cur ? '<button type="button" class="sg-btn del" id="sgDel">서명 삭제</button>' : '') +
      '<button type="button" class="sg-btn" id="sgCancel">취소</button>' +
      '<button type="button" class="sg-btn pri" id="sgOk">확인</button></div></div>';
    document.body.appendChild(mask);

    var cv = mask.querySelector('#sgCv');
    var box = mask.querySelector('.sg-b');
    var ratio = window.devicePixelRatio || 1;
    var W = Math.min(760, box.clientWidth - 24), H = Math.round(W * 0.32);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cv.width = Math.round(W * ratio); cv.height = Math.round(H * ratio);
    var ctx = cv.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#141e46';

    var drawing = false, last = null, dirty = false;
    function pt(ev) {
      var r = cv.getBoundingClientRect();
      var t = ev.touches ? ev.touches[0] : ev;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function start(ev) { ev.preventDefault(); drawing = true; last = pt(ev); }
    function move(ev) {
      if (!drawing) return;
      ev.preventDefault();
      var p = pt(ev);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() { drawing = false; }
    cv.addEventListener('mousedown', start); cv.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('mousemove', move); cv.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', end); cv.addEventListener('touchend', end);

    var uploaded = null;
    function close(v) {
      cv.removeEventListener('mousedown', start);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      mask.remove();
      if (v !== undefined) done(v);
    }
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('.sg-x')) close();
    });
    mask.querySelector('#sgClear').addEventListener('click', function () {
      ctx.clearRect(0, 0, cv.width, cv.height); dirty = false; uploaded = null;
    });
    mask.querySelector('#sgCancel').addEventListener('click', function () { close(); });
    var del = mask.querySelector('#sgDel');
    if (del) del.addEventListener('click', function () { close(null); });
    mask.querySelector('#sgFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      fromPhoto(f, function (url) {
        if (!url) { alert('사진을 읽지 못했습니다.'); return; }
        uploaded = url;
        var im = new Image();
        im.onload = function () {
          ctx.clearRect(0, 0, cv.width, cv.height);
          var s = Math.min(W / im.width, H / im.height);
          ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
          dirty = true;
        };
        im.src = url;
      });
    });
    mask.querySelector('#sgOk').addEventListener('click', function () {
      if (uploaded) { close(uploaded); return; }
      if (!dirty) { alert('서명을 입력하거나 사진을 올려주세요.'); return; }
      close(trim(cv));
    });
  };
})();
