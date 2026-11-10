/* ============================================================
   day.js — 일일 작업 보고서(묶음) 공용 모델

   하루치 작업 여러 건을 한 묶음으로 만든다.
   · 날짜 · 장소 · 작업책임자 · 참여자 · 교육확인 · 서명은 묶음에 한 번만 적는다.
   · 각 작업의 지침 / 위험성평가 / 완료보고서 페이지는 그 값을 그대로 가져다 쓴다.
     (페이지 주소에 ?day=<묶음id> 가 붙어 있으면 묶음 값이 이긴다)

   저장은 두 군데다.
   · 브라우저(localStorage) — 작성 중인 내용. 서버가 없어도 쓸 수 있다.
   · 서버(Vercel Blob)      — 결재 링크를 열려면 반드시 필요하다.
   ============================================================ */
(function () {
  'use strict';

  var LIST = 'day:list';

  /* 묶음에 넣을 수 있는 페이지.
       pg   = 작업 한 건당 나오는 쪽수
       once = 작업 수와 상관없이 묶음 맨 뒤에 한 번만 붙는 쪽수
     어느 것을 넣을지는 보고서마다 고를 수 있다(rec.pages).

     위험성평가는 평가표(작업마다) + 산정 기준(모두 같음) 두 쪽이었다.
     기준 쪽은 설명이라 작업 수만큼 되풀이할 까닭이 없어 한 번만 붙인다. */
  window.DAY_PAGE_ALL = [
    { k: 'parts', n: '각부 명칭 · 점검 포인트', f: 'parts.html', pg: 1 },
    { k: 'guide', n: '안전작업 지침 · 교육자료', f: 'guide.html', pg: 1 },
    { k: 'risk', n: '위험성평가표', f: 'risk.html', pg: 1, once: 1,
      q: '&mx=0',
      onceName: '위험도 산정 및 평가 매트릭스 기준 (공통)', onceQ: '&mx=only' },
    { k: 'report', n: '작업 완료보고서', f: 'report.html', pg: 1 }
  ];

  /* 고른 장으로 묶음 주소를 만든다. day.html 과 approve.html 이 같이 쓴다.
     두 군데에 같은 코드를 두면 한쪽만 고쳐져서 결재자가 다른 묶음을 받는다. */
  window.dayBundleUrls = function (rec) {
    var dq = '&day=' + encodeURIComponent(rec.id);
    var tasks = (rec.tasks || []).filter(function (tid) { return !!window.TASKS[tid]; });
    var 고름 = rec.pages || [];
    var urls = [], 뒤 = [];
    tasks.forEach(function (tid) {
      var t = window.TASKS[tid];
      window.DAY_PAGE_ALL.forEach(function (p) {
        if (고름.indexOf(p.k) < 0) return;
        urls.push({ k: p.k, n: t.name + ' — ' + p.n,
                    url: p.f + '?id=' + encodeURIComponent(tid) + dq + (p.q || '') });
      });
    });
    /* 모두 같은 쪽은 맨 뒤에 한 번. 어느 작업으로 열어도 같은 그림이라 첫 작업으로 연다. */
    if (tasks.length) window.DAY_PAGE_ALL.forEach(function (p) {
      if (!p.once || 고름.indexOf(p.k) < 0) return;
      뒤.push({ k: p.k + ':once', n: p.onceName,
                url: p.f + '?id=' + encodeURIComponent(tasks[0]) + dq + (p.onceQ || '') });
    });
    return urls.concat(뒤);
  };

  /* 고른 구성이 몇 쪽이 되는지. 작업 수 × 작업당 쪽수 + 한 번만 붙는 쪽수. */
  window.dayPageCount = function (rec) {
    var 고름 = rec.pages || [];
    var n = (rec.tasks || []).filter(function (tid) { return !!window.TASKS[tid]; }).length;
    var per = 0, once = 0, names = [];
    window.DAY_PAGE_ALL.forEach(function (p) {
      if (고름.indexOf(p.k) < 0) return;
      per += p.pg; once += (p.once || 0); names.push(p.n.split(' · ')[0]);
    });
    return { per: per, once: n ? once : 0, names: names,
             total: per * n + (n ? once : 0), tasks: n };
  };
  /* 예전 이름 — 쓰던 자리가 있어 남겨 둔다 */
  window.DAY_PAGES = window.DAY_PAGE_ALL.filter(function (p) { return p.k !== 'parts'; });

  /* 지난번에 고른 출력 구성을 기억해 둔다. 새 보고서의 기본값이 된다. */
  var PREF = 'day:pages';
  window.dayPagesPref = function () {
    var a = store.get(PREF);
    return (a && a.length) ? a : ['guide', 'risk', 'report'];
  };
  window.dayPagesPrefSet = function (a) { store.set(PREF, a || []); };

  window.dayKey = function (id) { return 'day:' + id; };

  /* 링크 주소가 곧 열쇠다. 짧으면 남이 찍어서 열 수 있으므로 길게 만든다. */
  function rid(n) {
    var s = '', c = 'abcdefghijkmnpqrstuvwxyz23456789';
    var a = new Uint8Array(n);
    (window.crypto || {}).getRandomValues
      ? window.crypto.getRandomValues(a)
      : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    for (var i = 0; i < n; i++) s += c[a[i] % c.length];
    return s;
  }

  window.dayNew = function () {
    var d = new Date();
    var ymd = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return {
      v: 1,
      id: 'd' + ymd + '-' + rid(14),
      date: todayStr(),
      place: '', sitename: '', leader: '', writer: '',
      tasks: [],
      pages: dayPagesPref().slice(),
      crew: [],             /* [{org,name,sig}] — 참여자. 서명은 여기 한 번만. */
      chk: {},              /* 교육 확인 체크 */
      opinion: '', opinChk: false, opinNone: false,
      sigs: {},             /* writer / approver */
      approver: { name: '', at: '' },
      photos: {},           /* { 작업id: { 1: url, 2: url ... } } */
      risk: {},             /* { 작업id: { date, assessor, rows } } */
      at: new Date().toISOString()
    };
  };

  window.dayGet = function (id) { return store.get(dayKey(id)); };

  window.dayList = function () { return store.get(LIST) || []; };

  window.daySet = function (rec) {
    rec.at = new Date().toISOString();
    var ok = store.set(dayKey(rec.id), rec);
    var a = dayList();
    var row = {
      id: rec.id, date: rec.date, n: (rec.tasks || []).length,
      at: rec.at, place: rec.place || '',
      signed: !!(rec.sigs && rec.sigs.approver),
      sent: !!rec.sent
    };
    var i = -1;
    for (var k = 0; k < a.length; k++) if (a[k].id === rec.id) { i = k; break; }
    if (i >= 0) a[i] = row; else a.unshift(row);
    store.set(LIST, a);
    return ok;
  };

  window.dayDel = function (id) {
    store.del(dayKey(id));
    store.set(LIST, dayList().filter(function (x) { return x.id !== id; }));
  };

  /* 지금 보고 있는 페이지가 묶음의 일부인가 — 맞으면 묶음 자료를 돌려준다 */
  window.dayCtx = function () {
    var id = qs('day');
    if (!id) return null;
    var rec = dayGet(id);
    return rec && rec.id ? rec : null;
  };

  /* ── 서버 (결재 링크) ───────────────────────────────────── */
  function jfetch(url, opt) {
    return fetch(url, opt).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { }
        if (!r.ok) throw new Error((j && j.error) || ('서버 오류 ' + r.status));
        return j || {};
      });
    });
  }

  /* 사진 한 장을 서버에 올리고 주소를 받는다. 한 장씩 올려야 용량 제한에 안 걸린다. */
  window.dayPutPhoto = function (id, key, dataUrl, prev) {
    return jfetch('/api/day?act=photo', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: id, key: key, dataUrl: dataUrl, prev: prev || '' })
    }).then(function (j) { return j.url; });
  };

  window.dayPush = function (rec) {
    return jfetch('/api/day', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rec)
    });
  };

  window.dayPull = function (id) {
    return jfetch('/api/day?d=' + encodeURIComponent(id));
  };

  window.daySign = function (id, name, sig) {
    return jfetch('/api/day?act=sign', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: id, name: name, sig: sig })
    });
  };

  /* 사진 한 장을 골랐을 때 — 바로 서버로 올리고 주소만 남긴다.

     왜 바로 올리나
       사진을 그림째로 브라우저 저장소(localStorage)에 담으면 한도(약 5MB)를
       금방 넘긴다. 작업 2~3건에 사진 몇 장만 넣어도 저장이 터져서 사진이 사라졌다.
       그래서 고르는 즉시 서버에 올리고, 저장소에는 짧은 주소만 남긴다.

     cb(상태) 로 알려 준다 — { busy:true } · { url:'...' } · { url, err:'...' }
  */
  window.dayPhotoSave = function (rec, tid, slot, file, cb) {
    cb = cb || function () { };
    if (!file || !/^image\//.test(file.type || '')) {
      cb({ err: '사진 파일이 아닙니다.' });
      return;
    }
    cb({ busy: true });
    fileToDataURL(file, function (dataUrl) {
      function stash(v) {
        rec.photos = rec.photos || {};
        rec.photos[tid] = rec.photos[tid] || {};
        rec.photos[tid][slot] = v;
        return daySet(rec);
      }
      var prev = ((rec.photos || {})[tid] || {})[slot] || '';
      if (prev.indexOf('data:') === 0) prev = '';
      dayPutPhoto(rec.id, tid + '-' + slot, dataUrl, prev).then(function (url) {
        stash(url);
        cb({ url: url });
      }).catch(function (e) {
        /* 서버가 안 되면 이 브라우저에만 임시로 담는다. 용량 때문에 실패할 수도 있다. */
        var ok = stash(dataUrl);
        cb({
          url: dataUrl,
          err: (e && e.message ? e.message : '올리지 못했습니다') +
            (ok ? ' — 이 기기에만 담아 두었습니다. 인터넷이 되면 다시 올려 주세요.'
                : ' — 용량이 커서 담아 두지도 못했습니다. 다시 시도해 주세요.')
        });
      });
    });
  };

  window.dayPhotoDel = function (rec, tid, slot) {
    if (rec.photos && rec.photos[tid]) delete rec.photos[tid][slot];
    return daySet(rec);
  };

  window.dayPhotoCount = function (rec, tid) {
    var o = (rec.photos || {})[tid] || {};
    return Object.keys(o).filter(function (k) { return !!o[k]; }).length;
  };

  /* dataURL 로 남아 있는 사진을 전부 서버로 올려 주소로 바꾼다 */
  window.dayUploadPhotos = function (rec, onStep) {
    var jobs = [];
    Object.keys(rec.photos || {}).forEach(function (tid) {
      Object.keys(rec.photos[tid] || {}).forEach(function (n) {
        var v = rec.photos[tid][n];
        if (typeof v === 'string' && v.indexOf('data:') === 0) jobs.push([tid, n, v]);
      });
    });
    var i = 0;
    function step() {
      if (i >= jobs.length) return Promise.resolve(rec);
      var j = jobs[i];
      if (onStep) onStep(i + 1, jobs.length);
      return dayPutPhoto(rec.id, j[0] + '-' + j[1], j[2]).then(function (url) {
        rec.photos[j[0]][j[1]] = url;
        i++;
        return step();
      });
    }
    return step();
  };

  /* 결재 링크 */
  window.dayLink = function (id) {
    return location.origin + '/approve.html?d=' + encodeURIComponent(id);
  };
})();
