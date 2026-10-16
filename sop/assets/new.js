/* 공기구 추가 — 이름이나 사진을 주면 안전 표준운영절차 한 건을 만들어 준다.
 *
 *   만드는 일은 서버(api/generate.js)가 한다. API 키를 브라우저에 두지 않기 위해서다.
 *   만들어진 내용은 기존 편집기와 똑같이 이 브라우저의 '초안' 에 쌓인다.
 *   확정하려면 편집기에서 data.js 를 내려받아 배포하면 된다.
 */
(function () {
  var NEW_PREFIX = 'n';          // 새로 만든 작업의 아이디 앞글자 (n01, n02 …)
  var CHAPTER = '추가 작업';      // 들어갈 묶음 이름. 없으면 만든다.
  var made = null;               // 방금 만든 작업
  var photoData = '';            // 올린 사진 (data URL)

  /* ───── 화면 ───── */
  var groups = (SITE.groups || []).filter(function (g) { return g.id !== 'ex'; });

  var h = topbar('공기구 추가', '이름이나 사진을 주면 표준운영절차를 만들어 드립니다', 'index.html');
  h += '<div class="wrap">';

  h += '<div class="card"><div class="card-h">1. 무엇을 만들까요</div><div class="card-b">' +
    '<div class="nf">' +
      '<label>공기구 이름</label>' +
      '<input id="nm" type="text" placeholder="예) 그라인더, 고소작업대, 유압잭" autocomplete="off">' +
      '<p class="hint">사진만 올리셔도 됩니다. 그때는 이름을 비워 두세요.</p>' +
    '</div>' +
    '<div class="nf">' +
      '<label>사진 (선택)</label>' +
      '<input id="ph" type="file" accept="image/png,image/jpeg,image/webp">' +
      '<div id="phv"></div>' +
      '<p class="hint">실제로 쓰시는 장비 사진을 올리면 그 장비에 맞게 작성됩니다.</p>' +
    '</div>' +
    '<div class="nf">' +
      '<label>참고 사항 (선택)</label>' +
      '<input id="hint" type="text" placeholder="예) 지하 기계실에서만 사용, 2인 1조 원칙" autocomplete="off">' +
    '</div>' +
    '<div class="nf">' +
      '<label>어느 부문에 넣을까요</label>' +
      '<select id="gid">' + groups.map(function (g) {
        return '<option value="' + esc(g.id) + '">' + esc(g.title) + '</option>';
      }).join('') + '</select>' +
    '</div>' +
    '<button class="btn primary" id="go">만들기</button>' +
    ' <span id="st" class="hint"></span>' +
    '</div></div>';

  h += '<div id="out"></div>';
  h += '</div>';
  document.getElementById('app').innerHTML = h;

  var $ = function (id) { return document.getElementById(id); };

  /* ───── 사진 올리기 ───── */
  $('ph').addEventListener('change', function () {
    var f = this.files && this.files[0];
    $('phv').innerHTML = '';
    photoData = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      alert('사진이 너무 큽니다. 4MB 이하로 올려 주세요.');
      this.value = '';
      return;
    }
    var r = new FileReader();
    r.onload = function () {
      photoData = r.result;
      $('phv').innerHTML = '<img class="phv" src="' + photoData + '" alt="">';
    };
    r.readAsDataURL(f);
  });

  /* ───── 만들기 ───── */
  $('go').addEventListener('click', function () {
    var name = $('nm').value.trim();
    if (!name && !photoData) { alert('공기구 이름을 적거나 사진을 올려 주세요.'); return; }

    this.disabled = true;
    $('st').textContent = '만드는 중입니다… 30초쯤 걸립니다.';
    $('out').innerHTML = '';

    fetch('api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name, hint: $('hint').value.trim(), photo: photoData })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (x) {
      $('go').disabled = false;
      if (!x.ok) { $('st').textContent = ''; alert(x.j.error || '만들지 못했습니다.'); return; }
      made = x.j.task;
      $('st').textContent = '';
      render(made);
    }).catch(function (e) {
      $('go').disabled = false;
      $('st').textContent = '';
      alert('연결하지 못했습니다 : ' + e.message);
    });
  });

  /* ───── 만든 내용 보여주기 ───── */
  function render(t) {
    var g = t.guide || [], r = (t.risk && t.risk.rows) || [];
    var n = 0; g.forEach(function (s) { n += (s.items || []).length; });

    var o = '<div class="card"><div class="card-h">2. 이렇게 만들었습니다 — ' + esc(t.name) + '</div>' +
      '<div class="card-b">';

    o += '<p class="hint">장소 ' + esc(t.place) + ' · 각부 명칭 ' +
         ((t.parts && t.parts.items) || []).length + '개 · 안전조치 ' + n + '개 · 위험성평가 ' + r.length + '행</p>';

    o += '<h4 class="nh">각부 명칭 및 점검 포인트</h4><table class="grid-t"><tbody>';
    ((t.parts && t.parts.items) || []).forEach(function (i) {
      o += '<tr><td style="width:40px;text-align:center">' + i.n + '</td><td><b>' +
           esc(i.name) + '</b></td><td>' + esc(i.desc) + '</td></tr>';
    });
    o += '</tbody></table>';

    o += '<h4 class="nh">작업 전 점검 · 사용 기준 · 사용 금지</h4><table class="grid-t"><tbody>';
    [['작업 전 점검', t.parts.pre], ['사용 기준', t.parts.use], ['사용 금지', t.parts.ban]]
      .forEach(function (p) {
        o += '<tr><td style="width:120px"><b>' + p[0] + '</b></td><td>' +
             (p[1] || []).map(esc).join('<br>') + '</td></tr>';
      });
    o += '</tbody></table>';

    o += '<h4 class="nh">안전조치 ' + n + '개</h4>';
    g.forEach(function (s) {
      o += '<p class="nsec">' + esc(s.title) + '</p><table class="grid-t"><tbody>';
      (s.items || []).forEach(function (i) {
        o += '<tr><td style="width:40px;text-align:center">' + i.n + '</td><td><b>' +
             esc(i.name) + '</b>' + (i.must ? ' <span class="nmust">필수</span>' : '') +
             '<br><span class="nwarn">⚠ ' + esc(i.warn) + '</span></td><td>' +
             (i.bullets || []).map(function (b) { return '· ' + esc(b); }).join('<br>') +
             '</td></tr>';
      });
      o += '</tbody></table>';
    });

    o += '<h4 class="nh">위험성평가 ' + r.length + '행</h4><table class="grid-t"><tbody>' +
         '<tr><th>작업단계</th><th>유해·위험요인</th><th>전</th><th>감소대책</th><th>후</th></tr>';
    r.forEach(function (x) {
      o += '<tr><td>' + esc(x.step) + '</td><td>' + (x.hazards || []).map(esc).join('<br>') +
           '</td><td style="text-align:center">' + (x.f * x.s) + '</td><td>' +
           (x.measures || []).map(esc).join('<br>') + '</td><td style="text-align:center">' +
           (x.f2 * x.s2) + '</td></tr>';
    });
    o += '</tbody></table>';

    o += '<p class="hint" style="margin-top:14px">내용을 고치시려면 초안에 넣은 뒤 ' +
         '<a href="edit.html">전체 편집기</a> 에서 수정하시면 됩니다.</p>';
    o += '<button class="btn primary" id="add">이 내용을 초안에 넣기</button>' +
         ' <button class="btn" id="again">다시 만들기</button>';
    o += '</div></div>';
    $('out').innerHTML = o;

    $('again').addEventListener('click', function () { $('go').click(); });
    $('add').addEventListener('click', save);
  }

  /* ───── 초안에 넣기 ───── */
  function nextId() {
    var n = 1;
    while (TASKS[NEW_PREFIX + String(n).padStart(2, '0')]) n++;
    return NEW_PREFIX + String(n).padStart(2, '0');
  }

  function save() {
    var gid = $('gid').value;
    var grp = (SITE.groups || []).filter(function (g) { return g.id === gid; })[0];
    if (!grp) { alert('넣을 부문을 찾지 못했습니다.'); return; }

    var id = nextId();
    var chap = (grp.chapters || []).filter(function (c) { return c.title === CHAPTER; })[0];
    if (!chap) {
      chap = { title: CHAPTER, color: '#0f766e', tasks: [] };
      grp.chapters = (grp.chapters || []).concat([chap]);
    }

    var t = made;
    TASKS[id] = {
      id: id,
      no: String(chap.tasks.length + 1),
      name: t.name,
      color: chap.color || '#1d4ed8',
      sop: '안전 표준운영절차 ' + grp.title,
      docNo: grp.title.replace(/^\d+\.\s*/, '') + ' ' + id.toUpperCase(),
      place: t.place,
      parts: {
        title: t.name + ' 각부 명칭 및 점검 포인트',
        subtitle: t.parts.subtitle || '',
        figure: '', figureCaption: '',
        marks: [],
        items: t.parts.items,
        pre: t.parts.pre, use: t.parts.use, ban: t.parts.ban
      },
      ppe: (t.ppe || []).map(function (p) { return { name: p.name, img: '' }; }),
      guide: (t.guide || []).map(function (s) {
        return {
          title: s.title,
          items: (s.items || []).map(function (i) {
            var o = { n: i.n, name: i.name, warn: i.warn, bullets: i.bullets, img: '' };
            if (i.must) o.must = true;
            return o;
          })
        };
      }),
      risk: {
        target: t.risk.target, date: '', assessor: '',
        rows: (t.risk.rows || []).map(function (x) {
          return {
            step: x.step, hazards: x.hazards, results: x.results,
            f: x.f, s: x.s, measures: x.measures,
            due: x.due, owner: x.owner, done: '', f2: x.f2, s2: x.s2
          };
        })
      },
      report: { examples: [] },
      guideFigure: ''
    };
    chap.tasks.push(id);
    SITE.taskOrder = (SITE.taskOrder || []).concat([id]);

    try {
      localStorage.setItem(window.DATA_KEY, JSON.stringify({ SITE: SITE, TASKS: TASKS }));
    } catch (e) {
      alert('이 브라우저에 저장하지 못했습니다 : ' + e.message);
      return;
    }

    var msg = '초안에 넣었습니다. (' + id + ')\n\n' +
      '· 지금 바로 화면에서 확인하실 수 있습니다\n' +
      '· 아직 다른 사람에게는 보이지 않습니다\n' +
      '· 확정하려면 [전체 편집기] → [data.js 내려받기] → Vercel_배포.bat';
    if (photoData) {
      msg += '\n\n올리신 사진을 ' + id + '_fig.png 로 내려받습니다.\n' +
             'assets/img 폴더에 넣고 배포하시면 대표 사진으로 들어갑니다.';
      var a = document.createElement('a');
      a.href = photoData;
      a.download = id + '_fig.png';
      a.click();
    }
    alert(msg);
    location.href = 'work.html?id=' + id;
  }
})();
