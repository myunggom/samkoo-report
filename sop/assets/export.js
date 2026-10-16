/* ============================================================
   export.js — 페이지 선택 → PDF / 이미지 / 인쇄 → 저장 · 공유
   · 같은 작업 안의 4개 페이지를 골라 한 번에 묶을 수 있습니다.
   · 화면 크기와 상관없이 항상 인쇄용(A4 가로) 배치로 만듭니다.
   ============================================================ */
(function () {
  'use strict';
  var A4W = 842, A4H = 595;     /* A4 가로 (pt) */
  var PXW = 1123;               /* 297mm @96dpi */

  var PAGES = [
    { k: 'parts', n: '1. 각부 명칭 및 점검 포인트', f: 'parts.html' },
    { k: 'guide', n: '2. 안전작업 지침 · 교육자료', f: 'guide.html' },
    { k: 'risk', n: '3. 위험성평가표', f: 'risk.html', sub: '평가표 + 매트릭스 기준 2쪽' },
    { k: 'report', n: '4. 작업 완료보고서', f: 'report.html' }
  ];
  function curKey() {
    var m = /([^\/]+)\.html/.exec(location.pathname);
    return m ? m[1] : '';
  }
  function taskId() { return new URLSearchParams(location.search).get('id') || ''; }

  /* ── 인쇄 CSS 추출 ── */
  var CSS = null;
  function extractPrint(text) {
    var out = '', i = 0;
    while (true) {
      var re = /@media\s+print\s*\{/g; re.lastIndex = i;
      var f = re.exec(text); if (!f) break;
      var s = re.lastIndex, depth = 1, j = s;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++; else if (text[j] === '}') depth--;
        j++;
      }
      out += text.slice(s, j - 1) + '\n';
      i = j;
    }
    return out.replace(/@page[^{]*\{[^}]*\}/g, '');
  }
  function loadCss() {
    if (CSS !== null) return Promise.resolve(CSS);
    var files = [];
    document.querySelectorAll('link[rel=stylesheet]').forEach(function (l) { files.push(l.getAttribute('href')); });
    return Promise.all(files.map(function (f) {
      return fetch(f).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
    })).then(function (all) {
      CSS = all.map(extractPrint).join('\n') + '\n' +
        'html,body{background:#fff!important;overflow:visible!important}' +
        '.stage{padding:0!important;background:#fff!important;width:' + PXW + 'px!important;max-width:none!important}' +
        '.slide{width:' + PXW + 'px!important;max-width:none!important;margin:0!important;' +
        'border:0!important;border-radius:0!important;box-shadow:none!important}' +
        '.snav,.btnbar,.ebar,.eb-float,.noprint,.savebar{display:none!important}' +
        '.s-head{grid-template-columns:1fr auto!important}' +
        '.s-logo{display:block!important}' +
        '.s-title{font-size:2.05em!important}' +
        '.gd-mid{order:0!important}' +
        '.slide .ppe{flex-wrap:nowrap!important}' +
        '.gi .shot{max-height:none!important}' +
        '.tblscroll{overflow:visible!important;border:0!important;background:none!important}' +
        '.tblscroll > *{min-width:0!important}' +
        '.thint{display:none!important}';
      return CSS;
    });
  }

  /* ── 진행 표시 ── */
  function busy(msg) {
    var el = document.getElementById('exBusy');
    if (!el) { el = document.createElement('div'); el.id = 'exBusy'; el.className = 'ex-busy noprint'; document.body.appendChild(el); }
    el.innerHTML = '<div class="ex-busy-b"><div class="ex-spin"></div><span id="exBusyT"></span></div>';
    el.querySelector('#exBusyT').textContent = msg;
    el.style.display = '';
    return el;
  }
  function busyMsg(msg) { var t = document.getElementById('exBusyT'); if (t) t.textContent = msg; }
  function unbusy() { var el = document.getElementById('exBusy'); if (el) el.style.display = 'none'; }

  /* ── 한 페이지를 숨은 프레임에서 그려 이미지로 ── */
  function waitReady(d) {
    var imgs = [].slice.call(d.images);
    /* 화면 밖 프레임에서는 lazy 이미지가 절대 로드되지 않으므로 즉시 로드로 바꿈 */
    imgs.forEach(function (im) {
      try {
        if (im.loading === 'lazy') { im.loading = 'eager'; var sc = im.src; im.src = ''; im.src = sc; }
        im.decoding = 'sync';
      } catch (e) { }
    });
    /* 체크박스 · 라디오는 속성이 아니라 속성값(property)만 바뀌어 있어
       직렬화(복제) 시 체크가 사라진다 → 속성으로 옮겨 기록 */
    d.querySelectorAll('input[type=checkbox],input[type=radio]').forEach(function (el) {
      if (el.checked) el.setAttribute('checked', 'checked');
      else el.removeAttribute('checked');
    });
    var ps = imgs.map(function (im) {
      if (im.complete && im.naturalWidth) return Promise.resolve();
      return new Promise(function (r) {
        var t = setTimeout(r, 10000);          /* 개별 이미지도 무한 대기 금지 */
        im.addEventListener('load', function () { clearTimeout(t); r(); }, { once: true });
        im.addEventListener('error', function () { clearTimeout(t); r(); }, { once: true });
      });
    });
    if (d.fonts && d.fonts.ready) {
      ps.push(Promise.race([d.fonts.ready.catch(function () { }),
        new Promise(function (r) { setTimeout(r, 6000); })]));
    }
    return Promise.all(ps).then(function () {
      return new Promise(function (r) { setTimeout(r, 350); });
    });
  }
  function renderNodes(nodes, type, quality) {
    var out = [];
    var scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    function one(i) {
      if (i >= nodes.length) return Promise.resolve(out);
      var node = nodes[i];
      var w = PXW, h = Math.max(node.scrollHeight, Math.round(PXW * A4H / A4W));
      var opt = { backgroundColor: '#ffffff', pixelRatio: scale, cacheBust: false,
        width: w, height: h, style: { margin: '0', transform: 'none' } };
      var fn = (type === 'png') ? htmlToImage.toPng : htmlToImage.toJpeg;
      if (type !== 'png') opt.quality = quality;
      return fn(node, opt).then(function () { return fn(node, opt); })
        .then(function (url) {
          return new Promise(function (res) {
            var im = new Image();
            im.onload = function () { res({ url: url, pw: im.naturalWidth, ph: im.naturalHeight }); };
            im.onerror = function () { res({ url: url, pw: w, ph: h }); };
            im.src = url;
          });
        }).then(function (r) { out.push(r); return one(i + 1); });
    }
    return one(0);
  }
  function captureUrl(url, type, quality) {
    return loadCss().then(function (css) {
      return new Promise(function (resolve, reject) {
        var fr = document.createElement('iframe');
        fr.setAttribute('aria-hidden', 'true');
        fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + PXW + 'px;height:1400px;border:0;';
        var done = false;
        var timer = setTimeout(function () {
          if (!done) { done = true; try { fr.remove(); } catch (e) { } reject(new Error('시간이 초과되었습니다 : ' + url)); }
        }, 90000);
        fr.onload = function () {
          if (done) return;
          try {
            var d = fr.contentDocument;
            var st = d.createElement('style'); st.textContent = css; d.head.appendChild(st);
            waitReady(d).then(function () {
              var slides = [].slice.call(d.querySelectorAll('.slide')).filter(function (s) {
                return d.defaultView.getComputedStyle(s).display !== 'none';
              });
              if (!slides.length) throw new Error('페이지 내용을 찾지 못했습니다');
              return renderNodes(slides, type, quality);
            }).then(function (list) {
              done = true; clearTimeout(timer); fr.remove(); resolve(list);
            }).catch(function (e) {
              done = true; clearTimeout(timer); fr.remove(); reject(e);
            });
          } catch (e) { done = true; clearTimeout(timer); fr.remove(); reject(e); }
        };
        fr.src = url;
        document.body.appendChild(fr);
      });
    });
  }

  /* ── JPEG → A4 가로 PDF (외부 라이브러리 없이) ── */
  function b64ToBytes(b64) {
    var bin = atob(b64), n = bin.length, a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function makePdf(pages) {
    var enc = new TextEncoder();
    var chunks = [], len = 0, offsets = [];
    function put(x) { var b = (typeof x === 'string') ? enc.encode(x) : x; chunks.push(b); len += b.length; }
    function obj(n, body, stream) {
      offsets[n] = len;
      put(n + ' 0 obj\n' + body + '\n');
      if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
      put('endobj\n');
    }
    var N = pages.length, kids = [];
    for (var i = 0; i < N; i++) kids.push((3 + i * 3) + ' 0 R');
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<</Type/Catalog/Pages 2 0 R>>');
    obj(2, '<</Type/Pages/Kids[' + kids.join(' ') + ']/Count ' + N + '>>');
    pages.forEach(function (p, i) {
      var pageN = 3 + i * 3, contN = pageN + 1, imgN = pageN + 2;
      var sc = Math.min(A4W / p.pw, A4H / p.ph);
      var dw = p.pw * sc, dh = p.ph * sc;
      var dx = (A4W - dw) / 2, dy = (A4H - dh) / 2;
      var content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' +
        dx.toFixed(2) + ' ' + dy.toFixed(2) + ' cm /Im0 Do Q';
      obj(pageN, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + A4W + ' ' + A4H + ']' +
        '/Resources<</XObject<</Im0 ' + imgN + ' 0 R>>/ProcSet[/PDF/ImageC]>>/Contents ' + contN + ' 0 R>>');
      obj(contN, '<</Length ' + content.length + '>>', enc.encode(content));
      var bytes = b64ToBytes(p.url.split(',')[1]);
      obj(imgN, '<</Type/XObject/Subtype/Image/Width ' + p.pw + '/Height ' + p.ph +
        '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + bytes.length + '>>', bytes);
    });
    var xref = len, total = 3 + N * 3;
    var s = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var k = 1; k < total; k++) s += ('0000000000' + (offsets[k] || 0)).slice(-10) + ' 00000 n \n';
    s += 'trailer\n<</Size ' + total + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF\n';
    put(s);
    var all = new Uint8Array(len), pos = 0;
    chunks.forEach(function (c) { all.set(c, pos); pos += c.length; });
    return new Blob([all], { type: 'application/pdf' });
  }

  /* ── 이미지들을 A4 가로로 인쇄 ── */
  function printImages(pages) {
    var fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:1123px;height:800px;border:0;';
    document.body.appendChild(fr);
    var d = fr.contentDocument;
    d.open();
    d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      (document.title || '인쇄') + '</title><style>' +
      '@page{size:A4 landscape;margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}' +
      'img{display:block;width:297mm;height:210mm;object-fit:contain;page-break-after:always;break-after:page}' +
      'img:last-child{page-break-after:auto;break-after:auto}' +
      '</style></head><body>' +
      pages.map(function (p) { return '<img src="' + p.url + '">'; }).join('') +
      '</body></html>');
    d.close();
    var imgs = [].slice.call(d.images);
    Promise.all(imgs.map(function (im) {
      return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
    })).then(function () {
      setTimeout(function () {
        try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { window.print(); }
        setTimeout(function () { try { fr.remove(); } catch (e) { } }, 90000);
      }, 250);
    });
  }

  /* ── 보내기 동작 (반드시 사용자가 버튼을 누른 그 순간에 호출) ── */
  function toFiles(files) {
    return files.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type }); });
  }
  function canShareFiles(files) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: toFiles(files) })); }
    catch (e) { return false; }
  }
  function doShare(files) {
    return navigator.share({ files: toFiles(files), title: files[0].name });
  }
  function doDl(files) {
    files.forEach(function (f, i) {
      setTimeout(function () {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(f.blob); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
      }, i * 400);
    });
    return Promise.resolve('다운로드 폴더에 저장했습니다');
  }
  function doPick(files) {
    var i = 0;
    function next() {
      if (i >= files.length) return Promise.resolve('위치를 지정해 저장했습니다');
      var f = files[i++], ext = f.name.split('.').pop();
      var types = { pdf: ['application/pdf', '.pdf'], png: ['image/png', '.png'], jpg: ['image/jpeg', '.jpg'] };
      var t = types[ext] || types.pdf, acc = {}; acc[t[0]] = [t[1]];
      return window.showSaveFilePicker({ suggestedName: f.name, types: [{ description: ext.toUpperCase(), accept: acc }] })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(f.blob).then(function () { return w.close(); }); })
        .then(next);
    }
    return next();
  }
  /* 이미지 → PNG 로 클립보드 복사 (PC 카톡 · 메일에 Ctrl+V) */
  function canCopy(files) {
    return !!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write &&
      files.length === 1 && /^image\//.test(files[0].blob.type));
  }
  function doCopy(files) {
    var b = files[0].blob;
    var toPng = (b.type === 'image/png') ? Promise.resolve(b) : new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0);
        c.toBlob(function (nb) { nb ? res(nb) : rej(new Error('변환 실패')); }, 'image/png');
      };
      im.onerror = function () { rej(new Error('변환 실패')); };
      im.src = URL.createObjectURL(b);
    });
    /* 사파리 대응 : ClipboardItem 에 Promise 를 바로 넘김 */
    try {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng })])
        .then(function () { return '복사했습니다 — 붙여넣기(Ctrl+V) 하세요'; });
    } catch (e) {
      return toPng.then(function (pb) {
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': pb })]);
      }).then(function () { return '복사했습니다 — 붙여넣기(Ctrl+V) 하세요'; });
    }
  }

  /* ── 결과 창 : 여기서부터는 버튼 클릭 = 사용자 동작이므로 공유가 됩니다 ── */
  function showResult(files) {
    var sh = canShareFiles(files), pk = !!window.showSaveFilePicker, cp = canCopy(files);
    var size = files.reduce(function (a, f) { return a + f.blob.size; }, 0);
    var sizeTxt = (size > 1048576) ? (size / 1048576).toFixed(1) + ' MB' : Math.round(size / 1024) + ' KB';
    var mask = document.createElement('div');
    mask.className = 'ex-mask noprint';
    mask.innerHTML =
      '<div class="ex"><div class="ex-h"><b>준비 완료</b><button type="button" class="ex-x">닫기</button></div>' +
      '<div class="ex-b">' +
      '<div class="ex-done">파일 ' + files.length + '개 · ' + sizeTxt + '</div>' +
      '<ul class="ex-files">' + files.map(function (f) {
        return '<li>' + f.name.replace(/</g, '&lt;') + '</li>';
      }).join('') + '</ul>' +
      '<div class="ex-lb" style="margin-top:12px">어떻게 보낼까요?</div>' +
      (sh ? '<button type="button" class="ex-act pri" data-a="share">📤 카카오톡 · 문자로 공유</button>' :
            '<div class="ex-note" style="margin-bottom:8px">이 브라우저는 파일 공유를 지원하지 않습니다. ' +
            '휴대폰 크롬 · 사파리에서 열면 공유 버튼이 나타납니다.</div>') +
      (cp ? '<button type="button" class="ex-act" data-a="copy">📋 이미지 복사 <i>PC 카톡 · 메일에 Ctrl+V 로 붙여넣기</i></button>' : '') +
      (pk ? '<button type="button" class="ex-act" data-a="pick">💾 위치를 골라 저장</button>' : '') +
      '<button type="button" class="ex-act" data-a="dl">⤓ 저장 <i>휴대폰은 내 파일 &gt; 다운로드</i></button>' +
      '<div class="ex-msg" id="exMsg"></div>' +
      '</div></div>';
    document.body.appendChild(mask);
    function close() { mask.remove(); }
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('.ex-x')) close();
    });
    function msg(t, bad) {
      var el = mask.querySelector('#exMsg');
      el.textContent = t; el.className = 'ex-msg' + (bad ? ' bad' : ' ok');
    }
    mask.querySelectorAll('.ex-act').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var a = btn.dataset.a;
        var run = (a === 'share') ? doShare(files)
          : (a === 'copy') ? doCopy(files)
          : (a === 'pick') ? doPick(files) : doDl(files);
        Promise.resolve(run).then(function (m) {
          if (a === 'share') { close(); if (window.toast) toast('공유했습니다'); return; }
          msg(m || '완료했습니다');
          if (a !== 'copy') setTimeout(close, 1200);
        }).catch(function (e) {
          if (e && e.name === 'AbortError') { msg('취소했습니다'); return; }
          if (a === 'share') {
            msg('공유하지 못했습니다 (' + (e && e.name ? e.name : '오류') + '). 아래 [저장] 을 눌러 파일로 받은 뒤 보내주세요.', true);
          } else {
            msg('실패했습니다 : ' + (e && e.message ? e.message : e), true);
          }
        });
      });
    });
  }

  /* ── 실행 ── */
  function baseName(sel) {
    var t = (document.title || '자료').replace(/\s*\|.*$/, '').trim();
    if (sel && sel.length > 1) {
      var task = (window.TASKS && window.TASKS[taskId()]) ? window.TASKS[taskId()].name : '안전자료';
      t = task + '_' + sel.length + '개페이지';
    }
    var d = new Date();
    var ds = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return (t + '_' + ds).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  }
  function run(sel, fmt) {
    var id = taskId();
    var urls = sel.map(function (k) {
      var pg = PAGES.filter(function (p) { return p.k === k; })[0];
      return { k: k, n: pg ? pg.n : k,
        url: (pg ? pg.f : location.pathname.split('/').pop()) + (id ? '?id=' + encodeURIComponent(id) : '') };
    });
    var type = (fmt === 'png') ? 'png' : 'jpg';
    var q = (fmt === 'jpg') ? 0.92 : 0.95;
    busy('준비 중입니다...');
    var all = [];
    function step(i) {
      if (i >= urls.length) return Promise.resolve(all);
      busyMsg('(' + (i + 1) + '/' + urls.length + ') ' + urls[i].n + ' 만드는 중...');
      return captureUrl(urls[i].url, type, q).then(function (list) {
        list.forEach(function (p) { all.push(p); });
        return step(i + 1);
      });
    }
    step(0).then(function (pages) {
      if (fmt === 'print') { unbusy(); printImages(pages); return null; }
      busyMsg('파일로 만드는 중...');
      var name = baseName(sel);
      if (fmt === 'pdf') return [{ blob: makePdf(pages), name: name + '.pdf' }];
      var ext = (fmt === 'png') ? 'png' : 'jpg';
      return Promise.all(pages.map(function (p, i) {
        return fetch(p.url).then(function (r) { return r.blob(); }).then(function (b) {
          return { blob: b, name: name + (pages.length > 1 ? '_' + (i + 1) : '') + '.' + ext };
        });
      }));
    }).then(function (files) {
      unbusy();
      if (files) showResult(files);
    }).catch(function (e) {
      unbusy();
      if (e && e.name === 'AbortError') return;
      alert('만들지 못했습니다.\n\n' + (e && e.message ? e.message : e));
    });
  }
  window.__exRun = run;
  window.__exPages = PAGES;
  window.__exCur = curKey;
  window.__exTask = taskId;
})();

/* ============================================================
   만들기 창 (페이지 · 형식 선택)
   ============================================================ */
(function () {
  'use strict';
  window.openSaveDialog = function () {
    var cur = window.__exCur(), id = window.__exTask();
    var PAGES = window.__exPages;
    var inTask = !!id && PAGES.some(function (p) { return p.k === cur; });

    var pageList = '';
    if (inTask) {
      pageList = '<div class="ex-lb">1. 페이지 고르기 <button type="button" class="ex-mini" id="exAll">전체 선택</button></div>' +
        PAGES.map(function (p) {
          return '<label class="ex-op sm"><input type="checkbox" name="expg" value="' + p.k + '"' +
            (p.k === cur ? ' checked' : '') + '>' +
            '<span><b>' + p.n + (p.k === cur ? ' <i>지금 보는 페이지</i>' : '') + '</b>' +
            (p.sub ? '<em>' + p.sub + '</em>' : '') + '</span></label>';
        }).join('');
    }
    var no = inTask ? 2 : 1;
    var mask = document.createElement('div');
    mask.className = 'ex-mask noprint';
    mask.innerHTML =
      '<div class="ex"><div class="ex-h"><b>공유 / 저장 / 인쇄</b>' +
      '<button type="button" class="ex-x">닫기</button></div>' +
      '<div class="ex-b">' + pageList +
      '<div class="ex-lb" style="margin-top:' + (inTask ? '14px' : '0') + '">' + no + '. 형식</div>' +
      '<label class="ex-op"><input type="radio" name="exfmt" value="pdf" checked>' +
      '<span><b>PDF 파일</b><em>A4 가로. 고른 페이지가 한 파일에 순서대로 묶입니다.</em></span></label>' +
      '<label class="ex-op"><input type="radio" name="exfmt" value="jpg">' +
      '<span><b>그림 파일 (JPG)</b><em>카톡 · 문자 전송에 가장 좋습니다. 쪽마다 한 장씩.</em></span></label>' +
      '<label class="ex-op"><input type="radio" name="exfmt" value="png">' +
      '<span><b>그림 파일 (PNG)</b><em>글자가 가장 선명합니다. 용량이 큽니다.</em></span></label>' +
      '<label class="ex-op"><input type="radio" name="exfmt" value="print">' +
      '<span><b>🖨 인쇄하기</b><em>고른 페이지를 A4 가로로 바로 인쇄합니다.</em></span></label>' +
      '<div class="ex-note">파일을 만든 뒤 <b>공유 · 복사 · 저장</b> 중에서 고르는 창이 나옵니다.</div>' +
      '</div>' +
      '<div class="ex-f"><button type="button" class="ex-btn" id="exCancel">취소</button>' +
      '<button type="button" class="ex-btn pri" id="exGo">만들기</button></div></div>';
    document.body.appendChild(mask);

    function close() { mask.remove(); }
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('.ex-x') || e.target.closest('#exCancel')) close();
    });
    var allBtn = mask.querySelector('#exAll');
    if (allBtn) allBtn.addEventListener('click', function () {
      var boxes = mask.querySelectorAll('input[name=expg]');
      var on = [].slice.call(boxes).some(function (b) { return !b.checked; });
      boxes.forEach(function (b) { b.checked = on; });
      allBtn.textContent = on ? '전체 해제' : '전체 선택';
    });
    mask.querySelectorAll('input[name=exfmt]').forEach(function (r) {
      r.addEventListener('change', function () {
        var isPrint = mask.querySelector('input[name=exfmt]:checked').value === 'print';
        mask.querySelector('#exGo').textContent = isPrint ? '인쇄' : '만들기';
      });
    });
    mask.querySelector('#exGo').addEventListener('click', function () {
      var sel = [].slice.call(mask.querySelectorAll('input[name=expg]:checked')).map(function (b) { return b.value; });
      if (inTask && !sel.length) { alert('페이지를 하나 이상 골라주세요.'); return; }
      if (!inTask) sel = [cur || 'parts'];
      var order = window.__exPages.map(function (p) { return p.k; });
      sel.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      var fmt = mask.querySelector('input[name=exfmt]:checked').value;
      close();
      window.__exRun(sel, fmt);
    });
  };
})();
