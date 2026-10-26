/* 사진 개선 · 비용 보고 자료.
   index.html 의 탭과 compare.html 의 보고 페이지가 같은 내용을 쓴다.
   숫자를 고칠 일이 생기면 이 파일만 고친다. */
(function () {
  var 장당 = 190;              /* gemini-3-pro-image 2K 1장 (원) */
  var 작업당장수 = 12;
  var 전체작업 = 110;           /* 사진을 아직 만들지 않은 작업 수 */

  /* 사진을 다시 만든(또는 만들 예정인) 작업.
     대기:true 는 지시문은 다 써 두었고 충전만 기다리는 상태. */
  var 작업 = {
    c02: {
      name: '사다리 작업',
      where: '공통부문',
      옛: 'jpg',
      날짜: '2026.10.23',
      생성: 18,               /* 실제로 돌린 횟수 (재작업 포함) */
      채택: 12,
      요약: '첫 작업이었습니다. 인원 수 · 복장 · 자세가 틀린 장면이 나와 ' +
        '여섯 번을 다시 만들었고, 그때 알아낸 것을 지시문에 모두 적어 두었습니다.',
      바뀐점: {
        1: '마스크 제거 · 안전모 글자 바로잡음 · 검정 안전화',
        2: '세 사람 나오던 것을 두 사람으로',
        3: '인증 라벨을 짚는 동작으로 명확하게',
        4: '마스크 제거 · 눕혀 놓고 점검하는 자세',
        5: '바닥 상태를 직접 확인하는 동작',
        6: '전도방지대를 펴는 동작이 보이게',
        7: '기대는 각도와 접지부가 한눈에',
        8: '세 곳 접촉과 공구주머니를 함께',
        9: '안전대를 견고한 구조물에 체결',
        10: '정면을 마주본 자세로 교정',
        11: '보조자의 역할이 드러나게',
        12: '보관 자리에 세우는 마무리 장면'
      }
    },
    m06: {
      name: '흡수식 냉동기 일상 점검',
      where: '기계부문',
      옛: 'png',          /* 옛 사진은 PNG, 새 사진은 가벼운 JPEG */
      날짜: '2026.10.26',
      생성: 13,
      채택: 12,
      요약: '사다리 작업에서 지적받은 것(어두운 배경 · 실제와 다른 설비)을 ' +
        '지시문에 먼저 반영하고 만들었습니다. 열두 장면이 모두 한 번에 ' +
        '나왔고, 한 번만 다시 돌렸습니다.',
      바뀐점: {
        1: '내열장갑을 끼는 동작 · 귀마개를 함께',
        2: '보조자를 떨어뜨려 두 사람이 모두 보이게',
        3: '점검 일지와 무전기 통보를 한 장면에',
        4: '냉동기를 가리키며 회의하는 모습으로',
        5: '자동밸브의 개폐 표시를 보는 동작',
        6: '판넬 표시등 · 전류계를 보는 것으로 한정',
        7: '압력계 눈금이 보이게 크게',
        8: '고온부에 손대지 않고 기다리는 자세',
        9: '판넬을 지키는 감시자 역할을 분명히',
        10: '문을 닫은 채 손을 모은 금지 자세',
        11: '한 걸음 떨어진 거리를 보이게',
        12: '문을 닫고 잠그는 마무리 장면'
      }
    }
  };

  /* 밑작업 — 한 번만 쓰고 모든 작업에 재사용한다 */
  var 밑작업 = [
    ['표준 인물 확정 (얼굴 후보 · 기준 사진)', 21, 3140,
      '한 번만 만들면 전 작업에 재사용'],
    ['방식 검토 (모델 비교 · 시험 생성)', 5, 530, '안전모 글자 품질 확인']
  ];

  /* 사람이 하던 방식 — 인건비는 환산 가정값임을 반드시 밝힌다 */
  var 사람방식 = {
    인원: 5, 시간: 4, 시급: 20000,
    설명: '사진을 찍고 추려내는 데 5명이 각 4시간씩 들었던 것으로 보고, ' +
      '시간당 2만원으로 환산한 가정값입니다. 실제 인건비 자료가 아닙니다.'
  };

  var 충전 = { 넣은돈: 8000, 쓴돈: 7090 };

  /* 받고 나서 눈에 띈 것. 다시 만들지는 사장 결정 */
  var 손볼것 = {
    m06: ['바닥색이 장면마다 회색과 녹색을 오갑니다. 같은 기계실인데 ' +
      '달라 보입니다 — 지시문에 바닥색을 하나로 못박으면 잡힙니다.',
      '설비가 흡수식이라기보다 터보 · 스크류 냉동기 모양에 가깝습니다. ' +
      '고온재생기가 뚜렷하지 않습니다.']
  };

  function 원(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 사진 파일 이름.
     옛 사진은 원래 확장자 그대로, 새 사진은 자료에 적힌 이름을 쓴다.
     자료가 비어 있으면(아직 안 만든 작업) 규칙으로 되살린다. */
  function 번호(it) {
    return it.n < 10 ? '0' + it.n : '' + it.n;
  }
  function 옛파일(tid, it) {
    return tid + '_g' + 번호(it) + '.' + ((작업[tid] || {}).옛 || 'jpg');
  }
  function 새파일(tid, it) {
    return it.img || (tid + '_g' + 번호(it) + '.jpg');
  }

  function 항목들(tid) {
    var T = (window.TASKS || {})[tid], out = [];
    ((T || {}).guide || []).forEach(function (s) {
      (s.items || []).forEach(function (i) { out.push(i); });
    });
    return out;
  }

  /* 사진 비교 격자. 옛 사진은 assets/old/, 새 사진은 assets/img/ */
  function 사진격자(tid) {
    var info = 작업[tid];
    if (!info) return '';
    return 항목들(tid).map(function (it) {
      var 개선 = info.대기
        ? '<div class="half after wait"><span class="tagp">개선</span>' +
          '<div class="ph"><span>생성 대기</span></div></div>'
        : '<div class="half after"><span class="tagp">개선</span>' +
          '<img src="assets/img/' + 새파일(tid, it) +
          '" alt="" loading="lazy"></div>';
      return '<div class="item"><div class="hd"><span class="no">' + it.n +
        '</span><span class="nm">' + esc(it.name) + '</span></div>' +
        '<div class="pair">' +
        '<div class="half"><span class="tagp">기존</span>' +
        '<img src="assets/old/' + 옛파일(tid, it) +
        '" alt="" loading="lazy"></div>' +
        개선 + '</div><div class="fixed"><b>' +
        (info.대기 ? '고칠 점' : '바뀐 점') + '</b> ' +
        esc(info.바뀐점[it.n] || '') + '</div></div>';
    }).join('');
  }

  function 요약칸(tid) {
    var w = 작업[tid];
    if (!w) return '';
    if (w.대기) {
      return '<div class="kpi">' +
        '<div class="k"><b>12장</b><span>만들 사진</span>' +
        '<em>장면 지시문 12개 작성 완료</em></div>' +
        '<div class="k"><b>' + 원(w.예정 * 장당) + '</b>' +
        '<span>예상 비용</span><em>재작업 없을 때 (장당 ' + 원(장당) +
        ')</em></div>' +
        '<div class="k good"><b>0원</b><span>지금까지 쓴 돈</span>' +
        '<em>충전액이 떨어져 생성이 시작되지 않았습니다</em></div>' +
        '<div class="k"><b>충전 대기</b><span>남은 일</span>' +
        '<em>충전하면 명령 한 번으로 채워집니다</em></div></div>';
    }
    var 재 = w.생성 - w.채택;
    return '<div class="kpi">' +
      '<div class="k good"><b>' + w.채택 + ' / ' + w.채택 +
      '</b><span>같은 인물로 통일</span>' +
      '<em>전에는 장면마다 얼굴이 달랐습니다</em></div>' +
      '<div class="k good"><b>0명</b><span>사람 손이 들어간 작업</span>' +
      '<em>전에는 5명이 나눠 만들고 추려냈습니다</em></div>' +
      '<div class="k"><b>' + 원(w.생성 * 장당) + '</b>' +
      '<span>이 작업 사진 비용</span><em>' + w.생성 + '회 생성 · 재작업 ' +
      (재 ? 재 + '회' : '없음') + '</em></div>' +
      '<div class="k"><b>' + esc(w.날짜) + '</b><span>만든 날</span>' +
      '<em>' + esc(w.where) + ' · ' + esc(w.name) + '</em></div></div>';
  }

  /* 비용 비교 */
  function 비용표() {
    var ids = Object.keys(작업);
    var h = '';

    /* 1. 작업별 실측 */
    h += '<h2>1. 작업별 사진 비용 — 실측</h2>' +
      '<p class="lede">같은 12장을 받는 데 몇 번 돌렸는지가 그대로 돈입니다. ' +
      '첫 작업에서 틀린 이유를 지시문에 적어 둔 덕에 재작업이 줄었습니다.</p>' +
      '<table><tr><th>작업</th><th>부문</th><th class="n">생성 횟수</th>' +
      '<th class="n">받은 사진</th><th class="n">재작업</th>' +
      '<th class="n">비용</th><th class="n">장당</th></tr>';
    var 총생성 = 0, 총채택 = 0;
    ids.forEach(function (id) {
      var w = 작업[id];
      if (w.대기) {
        h += '<tr><td>' + esc(w.name) + '</td><td>' + esc(w.where) + '</td>' +
          '<td class="n">예정 ' + w.예정 + '회</td>' +
          '<td class="n">0장</td><td class="n">—</td>' +
          '<td class="n">예상 ' + 원(w.예정 * 장당) + '</td>' +
          '<td class="n">' + 원(장당) + '</td></tr>';
        return;
      }
      var 재 = w.생성 - w.채택;
      총생성 += w.생성; 총채택 += w.채택;
      h += '<tr><td>' + esc(w.name) + '</td><td>' + esc(w.where) + '</td>' +
        '<td class="n">' + w.생성 + '회</td>' +
        '<td class="n">' + w.채택 + '장</td>' +
        '<td class="n">' + (재 ? 재 + '회' : '없음') + '</td>' +
        '<td class="n">' + 원(w.생성 * 장당) + '</td>' +
        '<td class="n">' + 원(w.생성 * 장당 / w.채택) + '</td></tr>';
    });
    h += '<tr class="sum"><td colspan="2">지금까지 쓴 것</td>' +
      '<td class="n">' + 총생성 + '회</td><td class="n">' + 총채택 + '장</td>' +
      '<td class="n">' + (총생성 - 총채택) + '회</td>' +
      '<td class="n">' + 원(총생성 * 장당) + '</td><td class="n">' +
      원(총생성 * 장당 / 총채택) + '</td></tr></table>';

    /* 2. 밑작업 */
    var 밑합 = 밑작업.reduce(function (a, r) { return a + r[2]; }, 0);
    h += '<h2>2. 밑작업 — 한 번만 들어가는 돈</h2>' +
      '<p class="lede">표준 인물은 이미 만들어 두었습니다. 앞으로 어떤 작업을 ' +
      '만들어도 이 돈은 다시 들지 않습니다.</p>' +
      '<table><tr><th>항목</th><th class="n">수량</th><th class="n">금액</th>' +
      '<th>비고</th></tr>';
    밑작업.forEach(function (r) {
      h += '<tr><td>' + esc(r[0]) + '</td><td class="n">' + r[1] + '장</td>' +
        '<td class="n">' + 원(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>';
    });
    h += '<tr class="sum"><td>합계</td><td class="n">' +
      밑작업.reduce(function (a, r) { return a + r[1]; }, 0) + '장</td>' +
      '<td class="n">' + 원(밑합) + '</td><td>다시 들지 않음</td></tr></table>';

    /* 3. 쓴 돈 */
    h += '<h2>3. 지금까지 쓴 돈 — 2026.10.26 기준</h2>' +
      '<table><tr><th>구분</th><th class="n">금액</th><th>내용</th></tr>' +
      '<tr><td>밑작업</td><td class="n">' + 원(밑합) +
      '</td><td>표준 인물 · 방식 검토. 다시 들지 않음</td></tr>' +
      '<tr><td>사다리 작업</td><td class="n">' + 원(18 * 장당) +
      '</td><td>18회 생성 · 12장 채택</td></tr>' +
      '<tr><td>냉동기 작업</td><td class="n">' + 원(13 * 장당) +
      '</td><td>13회 생성 · 12장 채택</td></tr>' +
      '<tr class="sum"><td>합계 (공개 단가 추정)</td><td class="n">' +
      원(밑합 + 31 * 장당) + '</td>' +
      '<td>1차 충전 8,000원 + 추가 충전</td></tr></table>' +
      '<p class="fine">※ 10월 26일 1차 충전분이 소진돼 12건이 ' +
      '<b>402 (prepaid credits depleted)</b>로 거절됐습니다. ' +
      '실패한 호출은 과금되지 않아 이 표에 넣지 않았습니다.<br>' +
      '※ 공개 단가(2K 1장 ' + 원(장당) + ')로 계산한 추정치입니다. ' +
      '정확한 금액은 Google AI Studio 결제 화면에서 확인해야 합니다.</p>';

    /* 4. 사람이 하던 방식과 */
    var 사람1건 = 사람방식.인원 * 사람방식.시간 * 사람방식.시급;
    h += '<h2 class="pagebreak">4. 사람이 하던 방식과 비교 — 작업 1건(12장) 기준</h2>' +
      '<table><tr><th>구분</th><th>사람이 찍고 추려내던 방식</th>' +
      '<th>지금 방식 (자동 생성)</th></tr>' +
      '<tr><th>투입 인원</th><td>' + 사람방식.인원 + '명</td>' +
      '<td>0명 (지시문만 고침)</td></tr>' +
      '<tr><th>소요</th><td>며칠</td><td>약 1시간</td></tr>' +
      '<tr><th>얼굴 일관성</th><td>장면마다 달라짐</td>' +
      '<td>12장 모두 같은 인물</td></tr>' +
      '<tr><th>마스크</th><td>얼굴을 가려야 했음</td><td>필요 없음</td></tr>' +
      '<tr><th>지식재산권</th><td>외부 사진 사용 우려</td>' +
      '<td>직접 생성 — 우려 없음</td></tr>' +
      '<tr><th>직접비</th><td>0원</td><td class="n">' +
      원(작업당장수 * 장당) + '</td></tr>' +
      '<tr class="sum"><th>인건비 환산 (가정)</th><td class="n">약 ' +
      원(사람1건) + '</td><td class="n">약 ' + 원(작업당장수 * 장당) +
      '</td></tr></table>' +
      '<p class="fine">※ ' + esc(사람방식.설명) + '<br>' +
      '※ 자동 생성 쪽에도 지시문을 고치는 시간이 들지만, 한 번 고치면 ' +
      '나머지 작업에 그대로 쓰입니다.</p>';

    /* 5. 전체로 넓힐 때 */
    var 장수 = 전체작업 * 작업당장수;
    var 최소 = 장수 * 장당;
    h += '<h2>5. 남은 ' + 전체작업 + '건으로 넓힐 때</h2>' +
      '<table><tr><th>구분</th><th class="n">작업</th><th class="n">사진</th>' +
      '<th class="n">재작업 없을 때</th><th class="n">10% 재작업 볼 때</th></tr>' +
      '<tr><td>한 부문 먼저 (평균)</td><td class="n">16건</td>' +
      '<td class="n">192장</td><td class="n">' + 원(192 * 장당) + '</td>' +
      '<td class="n">약 ' + 원(Math.round(192 * 장당 * 1.1 / 1000) * 1000) +
      '</td></tr>' +
      '<tr class="sum"><td>전체</td><td class="n">' + 전체작업 + '건</td>' +
      '<td class="n">' + 장수.toLocaleString('ko-KR') + '장</td>' +
      '<td class="n">' + 원(최소) + '</td><td class="n">약 ' +
      원(Math.round(최소 * 1.1 / 1000) * 1000) + '</td></tr></table>' +
      '<p class="fine">※ 사다리 작업은 재작업이 50%였습니다. 그때 나온 문제를 ' +
      '지시문에 반영했으므로 앞으로는 10% 안쪽으로 봅니다.<br>' +
      '※ 사람이 하던 방식으로 ' + 전체작업 + '건을 하면 인건비 환산 ' +
      '약 ' + 원(사람1건 * 전체작업) + ' 입니다 (위 가정 기준).<br>' +
      '※ 공개 단가(2K 1장 ' + 원(장당) + ')로 계산한 값이며, 실제 청구액은 ' +
      'Google AI Studio 에서 확인합니다.</p>';
    return h;
  }

  window.REPORT = {
    작업: 작업, 장당: 장당,
    사진격자: 사진격자, 비용표: 비용표, 요약칸: 요약칸,
    has: function (tid) { return !!작업[tid]; },
    ids: function () { return Object.keys(작업); },
    대기: function (tid) { return !!(작업[tid] || {}).대기; },
    요약글: function (tid) { return (작업[tid] || {}).요약 || ''; },
    손볼것: function (tid) { return 손볼것[tid] || []; },
    이름: function (tid) { return (작업[tid] || {}).name || ''; }
  };
})();
