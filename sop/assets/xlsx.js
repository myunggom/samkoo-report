/* ============================================================
   xlsx.js — 진짜 엑셀 파일(.xlsx)을 브라우저에서 직접 만든다.

   왜 직접 만드나
     CSV 로 내보내면 값만 쉼표로 나열될 뿐, 표 모양 · 칸 합치기 · 색 ·
     테두리가 전부 사라진다. "양식 그대로" 받으려면 엑셀 파일이어야 한다.
     바깥 라이브러리를 받아 쓰지 않는 사이트라서 여기서 만든다.

   .xlsx 는 XML 몇 장을 zip 으로 묶은 것이다.
     [Content_Types].xml · _rels/.rels · xl/workbook.xml ·
     xl/_rels/workbook.xml.rels · xl/styles.xml · xl/worksheets/sheetN.xml
   zip 은 압축하지 않고 그대로 담는다(store 방식). 엑셀은 이것도 잘 읽는다.

   쓰는 법
     var sh = XL.sheet('위험성평가표');
     sh.cols = [{ w: 4 }, { w: 12 }];
     sh.row([XL.t('NO', XL.HEAD), XL.t('작업단계', XL.HEAD)], 30);
     sh.merge('A1:B1');
     XL.save('파일이름.xlsx', [sh]);
   ============================================================ */
(function () {
  'use strict';

  /* ── 글자를 바이트로 ─────────────────────────────────────── */
  function utf8(s) {
    if (window.TextEncoder) return new TextEncoder().encode(s);
    var b = unescape(encodeURIComponent(s)), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }

  /* ── CRC32 (zip 이 요구한다) ─────────────────────────────── */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ── zip 묶기 (압축 없음) ────────────────────────────────── */
  function zip(files) {
    var parts = [], central = [], off = 0, i;

    for (i = 0; i < files.length; i++) {
      var nm = utf8(files[i].name), dt = files[i].data;
      var crc = crc32(dt), len = dt.length;

      var lh = new Uint8Array(30 + nm.length), d1 = new DataView(lh.buffer);
      d1.setUint32(0, 0x04034b50, true);
      d1.setUint16(4, 20, true);        /* 필요한 버전 */
      d1.setUint16(6, 0x0800, true);    /* 파일이름이 UTF-8 임을 알린다 */
      d1.setUint16(8, 0, true);         /* 압축 안 함 */
      d1.setUint16(10, 0, true);        /* 시각 */
      d1.setUint16(12, 0x21, true);     /* 날짜 (1980.01.01) */
      d1.setUint32(14, crc, true);
      d1.setUint32(18, len, true);
      d1.setUint32(22, len, true);
      d1.setUint16(26, nm.length, true);
      d1.setUint16(28, 0, true);
      lh.set(nm, 30);

      var ch = new Uint8Array(46 + nm.length), d2 = new DataView(ch.buffer);
      d2.setUint32(0, 0x02014b50, true);
      d2.setUint16(4, 20, true);
      d2.setUint16(6, 20, true);
      d2.setUint16(8, 0x0800, true);
      d2.setUint16(10, 0, true);
      d2.setUint16(12, 0, true);
      d2.setUint16(14, 0x21, true);
      d2.setUint32(16, crc, true);
      d2.setUint32(20, len, true);
      d2.setUint32(24, len, true);
      d2.setUint16(28, nm.length, true);
      d2.setUint32(42, off, true);
      ch.set(nm, 46);

      parts.push(lh, dt);
      central.push(ch);
      off += lh.length + len;
    }

    var csize = 0;
    for (i = 0; i < central.length; i++) csize += central[i].length;
    var eo = new Uint8Array(22), d3 = new DataView(eo.buffer);
    d3.setUint32(0, 0x06054b50, true);
    d3.setUint16(8, files.length, true);
    d3.setUint16(10, files.length, true);
    d3.setUint32(12, csize, true);
    d3.setUint32(16, off, true);

    return new Blob(parts.concat(central, [eo]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ── XML 글자 다듬기 ─────────────────────────────────────── */
  function x(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      /* 엑셀이 거부하는 제어문자를 뺀다 */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  function col(n) {                 /* 0 → A, 26 → AA */
    var s = '';
    n = n + 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
    return s;
  }

  /* ── 칸 모양표 (styles.xml) ──────────────────────────────── */
  /*  아래 번호를 셀의 s= 값으로 쓴다. 이름은 XL.HEAD 처럼 꺼내 쓴다. */
  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6">' +
      '<font><sz val="10"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>' +
      '<font><b/><sz val="10"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>' +
      '<font><b/><sz val="16"/><color rgb="FF1E3A6E"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>' +
      '<font><sz val="9"/><color rgb="FF475569"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF1E3A6E"/><name val="맑은 고딕"/><family val="2"/><charset val="129"/></font>' +
    '</fonts>' +
    '<fills count="8">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4E4"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF1DC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE7F4EC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1E3A6E"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border>' +
        '<left style="thin"><color rgb="FFB0BCCE"/></left><right style="thin"><color rgb="FFB0BCCE"/></right>' +
        '<top style="thin"><color rgb="FFB0BCCE"/></top><bottom style="thin"><color rgb="FFB0BCCE"/></bottom>' +
        '<diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="14">' +
      /* 0 기본 */        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      /* 1 제목 */        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      /* 2 표머리 */      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      /* 3 표머리(진한) */'<xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      /* 4 항목이름 */    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      /* 5 글 */          '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>' +
      /* 6 가운데 */      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      /* 7 숫자 */        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      /* 8 고위험 */      '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      /* 9 중위험 */      '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      /* 10 저위험 */     '<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      /* 11 참고글 */     '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +
      /* 12 글(굵게) */   '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +
      /* 13 소제목 */     '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    /* 위험도 칸은 숫자를 고치면 색이 따라 바뀌도록 조건부 서식을 쓴다 */
    '<dxfs count="3">' +
      '<dxf><font><b/><color rgb="FFC62828"/></font><fill><patternFill><bgColor rgb="FFFCE4E4"/></patternFill></fill></dxf>' +
      '<dxf><font><b/><color rgb="FFB45309"/></font><fill><patternFill><bgColor rgb="FFFEF1DC"/></patternFill></fill></dxf>' +
      '<dxf><font><b/><color rgb="FF1F7A4C"/></font><fill><patternFill><bgColor rgb="FFE7F4EC"/></patternFill></fill></dxf>' +
    '</dxfs>' +
    '</styleSheet>';

  /* ── 한 장(sheet) 만들기 ─────────────────────────────────── */
  function sheet(name) {
    return {
      /* 엑셀 탭 이름에 못 쓰는 글자를 치우고 31자로 줄인다 */
      name: String(name || '표').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31) || '표',
      cols: [], rows: [], merges: [], cf: [], dv: [], freeze: 0,
      land: true, fit: 1,
      row: function (cells, h) { this.rows.push({ c: cells || [], h: h || 0 }); return this; },
      merge: function (ref) { this.merges.push(ref); return this; },
      /* 위험도 칸 색칠 : 15↑ 적색 · 8~14 황색 · 7↓ 녹색 */
      riskColor: function (ref) { this.cf.push(ref); return this; },
      /* 1~5 만 넣게 막기 */
      only1to5: function (ref) { this.dv.push(ref); return this; }
    };
  }

  function cell(v, s, type, f) { return { v: v, s: s == null ? 0 : s, t: type || 's', f: f || null }; }

  function sheetXml(sh) {
    var o = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
      (sh.freeze ? '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) +
        '" activePane="bottomLeft" state="frozen"/>' : '') +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16.5"/>';

    if (sh.cols.length) {
      o += '<cols>';
      sh.cols.forEach(function (c, i) {
        o += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 9) + '" customWidth="1"/>';
      });
      o += '</cols>';
    }

    o += '<sheetData>';
    sh.rows.forEach(function (r, ri) {
      var n = ri + 1;
      o += '<row r="' + n + '"' + (r.h ? ' ht="' + r.h + '" customHeight="1"' : '') + '>';
      r.c.forEach(function (c, ci) {
        if (c == null) return;
        var ref = col(ci) + n;
        o += '<c r="' + ref + '" s="' + c.s + '"';
        if (c.f) {                                  /* 수식 */
          o += '><f>' + x(c.f) + '</f>' + (c.v === '' || c.v == null ? '' : '<v>' + x(c.v) + '</v>') + '</c>';
        } else if (c.t === 'n') {
          if (c.v === '' || c.v == null || isNaN(c.v)) o += '/>';
          else o += '><v>' + Number(c.v) + '</v></c>';
        } else {
          if (c.v === '' || c.v == null) o += '/>';
          else o += ' t="inlineStr"><is><t xml:space="preserve">' + x(c.v) + '</t></is></c>';
        }
      });
      o += '</row>';
    });
    o += '</sheetData>';

    if (sh.merges.length) {
      o += '<mergeCells count="' + sh.merges.length + '">';
      sh.merges.forEach(function (m) { o += '<mergeCell ref="' + m + '"/>'; });
      o += '</mergeCells>';
    }

    sh.cf.forEach(function (ref) {
      var first = ref.split(':')[0];
      o += '<conditionalFormatting sqref="' + ref + '">' +
        '<cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThanOrEqual"><formula>15</formula></cfRule>' +
        '<cfRule type="cellIs" dxfId="1" priority="2" operator="between"><formula>8</formula><formula>14</formula></cfRule>' +
        '<cfRule type="cellIs" dxfId="2" priority="3" operator="lessThanOrEqual"><formula>7</formula></cfRule>' +
        '</conditionalFormatting>';
      void first;
    });

    if (sh.dv.length) {
      o += '<dataValidations count="' + sh.dv.length + '">';
      sh.dv.forEach(function (ref) {
        o += '<dataValidation type="whole" operator="between" allowBlank="1" showInputMessage="1" showErrorMessage="1"' +
          ' errorTitle="1 ~ 5" error="빈도 · 강도는 1 부터 5 까지만 넣습니다." sqref="' + ref + '">' +
          '<formula1>1</formula1><formula2>5</formula2></dataValidation>';
      });
      o += '</dataValidations>';
    }

    o += '<printOptions horizontalCentered="1"/>' +
      '<pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.2" footer="0.2"/>' +
      '<pageSetup paperSize="9" orientation="' + (sh.land ? 'landscape' : 'portrait') +
      '" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
    return o;
  }

  function build(sheets) {
    var files = [];
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    var wbs = '', wbr = '';
    sheets.forEach(function (sh, i) {
      var n = i + 1;
      ct += '<Override PartName="/xl/worksheets/sheet' + n +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbs += '<sheet name="' + x(sh.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      wbr += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      files.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: utf8(sheetXml(sh)) });
    });
    ct += '</Types>';

    files.unshift(
      { name: '[Content_Types].xml', data: utf8(ct) },
      {
        name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>')
      },
      {
        name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
          ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets>' + wbs + '</sheets></workbook>')
      },
      {
        name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbr +
          '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>')
      },
      { name: 'xl/styles.xml', data: utf8(STYLES) }
    );

    return zip(files);
  }

  function save(name, sheets) {
    if (!sheets || !sheets.length) throw new Error('내보낼 표가 없습니다.');
    var blob = build(sheets);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(name).replace(/[\\\/:*?"<>|]/g, '_');
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return blob.size;
  }

  window.XL = {
    sheet: sheet, build: build, save: save,
    t: function (v, s) { return cell(v, s, 's'); },             /* 글 */
    n: function (v, s) { return cell(v, s, 'n'); },             /* 숫자 */
    fx: function (formula, cached, s) { return cell(cached, s, 'n', formula); },  /* 수식 */
    NONE: 0, TITLE: 1, HEAD: 2, HEADD: 3, LABEL: 4,
    TXT: 5, CTR: 6, NUM: 7, HI: 8, MD: 9, LO: 10, NOTE: 11, TXTB: 12, SUB: 13
  };

  /* ==========================================================
     여기서부터는 위험성평가표 전용 — 화면의 표를 그대로 엑셀로 옮긴다.
     ========================================================== */

  var CN = '①②③④⑤⑥⑦⑧⑨⑩';
  function numbered(a) {
    return (a || []).map(function (s, i) { return (CN[i] || (i + 1) + '.') + ' ' + s; }).join('\n');
  }
  /* 글이 몇 줄로 접힐지 어림잡아 줄높이를 정한다. 한글은 한 글자가 약 2칸. */
  function lines(txt, w) {
    var per = Math.max(6, Math.floor(w / 2));
    return String(txt || '').split('\n').reduce(function (n, L) {
      return n + Math.max(1, Math.ceil(L.length / per));
    }, 0);
  }
  function lvl(v) { return v >= 15 ? window.XL.HI : v >= 8 ? window.XL.MD : window.XL.LO; }

  var W = [4.5, 13, 32, 28, 5.5, 5.5, 7, 38, 10, 10, 8, 5.5, 5.5, 7];

  /** 작업 한 건의 위험성평가표를 엑셀 한 장으로 만든다.
   *  t    : 작업 (TASKS 의 항목)
   *  head : { date, assessor }
   *  rows : [{ f, s, f2, s2, done }] — 화면에서 고친 값
   */
  window.riskSheet = function (t, head, rows) {
    var XLc = window.XL;
    var sh = XLc.sheet((t.no ? t.no + '. ' : '') + t.name);
    sh.cols = W.map(function (w) { return { w: w }; });
    var E = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(null); return a; };

    /* 1 제목 */
    sh.row([XLc.t('위험성평가표 — ' + t.name, XLc.TITLE)].concat(E(13)), 30);
    sh.merge('A1:N1');
    /* 2 설명 */
    var sub = (window.SITE && SITE.labels && SITE.labels.riskSub) || '';
    sh.row([XLc.t(sub, XLc.NOTE)].concat(E(13)), 16);
    sh.merge('A2:N2');
    /* 3 비움 */
    sh.row([], 6);

    /* 4 머릿말 */
    sh.row([
      XLc.t('공정 / 작업명', XLc.LABEL), XLc.t(t.name, XLc.TXTB), null,
      XLc.t('평가대상', XLc.LABEL), XLc.t(t.risk.target, XLc.TXTB), null, null,
      XLc.t('평가일자', XLc.LABEL), XLc.t(head.date || '', XLc.CTR), null,
      XLc.t('평가자', XLc.LABEL), XLc.t(head.assessor || '', XLc.CTR), null, null
    ], 24);
    sh.merge('B4:C4'); sh.merge('E4:G4'); sh.merge('I4:J4'); sh.merge('L4:N4');
    /* 5 비움 */
    sh.row([], 6);

    /* 6 ~ 7 표머리 */
    sh.row([
      XLc.t('NO', XLc.HEADD), XLc.t('작업단계', XLc.HEADD), XLc.t('유해 · 위험요인', XLc.HEADD),
      XLc.t('위험 발생 상황 및 결과', XLc.HEADD), XLc.t('현재 위험도', XLc.HEADD), null, null,
      XLc.t('위험성 감소대책 (개선 조치사항)', XLc.HEADD), XLc.t('조치\n기한', XLc.HEADD),
      XLc.t('담당자', XLc.HEADD), XLc.t('조치\n여부', XLc.HEADD),
      XLc.t('개선 후 위험도', XLc.HEADD), null, null
    ], 20);
    sh.row([
      null, null, null, null,
      XLc.t('빈도', XLc.HEAD), XLc.t('강도', XLc.HEAD), XLc.t('위험도', XLc.HEAD),
      null, null, null, null,
      XLc.t('빈도', XLc.HEAD), XLc.t('강도', XLc.HEAD), XLc.t('위험도', XLc.HEAD)
    ], 20);
    ['A', 'B', 'C', 'D', 'H', 'I', 'J', 'K'].forEach(function (c) { sh.merge(c + '6:' + c + '7'); });
    sh.merge('E6:G6'); sh.merge('L6:N6');
    sh.freeze = 7;

    /* 8 부터 내용 */
    var first = 8;
    t.risk.rows.forEach(function (r, i) {
      var a = rows[i] || r;
      var n = first + i;
      var hz = numbered(r.hazards), rs = numbered(r.results), ms = numbered(r.measures);
      var hi = Math.max(lines(hz, W[2]), lines(rs, W[3]), lines(ms, W[7]), 1);
      var v1 = (a.f || 0) * (a.s || 0), v2 = (a.f2 || 0) * (a.s2 || 0);
      sh.row([
        XLc.n(i + 1, XLc.NUM),
        XLc.t(r.step, XLc.CTR),
        XLc.t(hz, XLc.TXT),
        XLc.t(rs, XLc.TXT),
        XLc.n(a.f, XLc.NUM), XLc.n(a.s, XLc.NUM),
        XLc.fx('E' + n + '*F' + n, v1, lvl(v1)),
        XLc.t(ms, XLc.TXT),
        XLc.t(r.due, XLc.CTR), XLc.t(r.owner, XLc.CTR), XLc.t(a.done || '', XLc.CTR),
        XLc.n(a.f2, XLc.NUM), XLc.n(a.s2, XLc.NUM),
        XLc.fx('L' + n + '*M' + n, v2, lvl(v2))
      ], Math.min(409, Math.max(30, hi * 14 + 8)));
    });
    var last = first + t.risk.rows.length - 1;

    /* 숫자를 고치면 색이 따라 바뀌고, 1~5 밖은 막는다 */
    sh.riskColor('G' + first + ':G' + last);
    sh.riskColor('N' + first + ':N' + last);
    sh.only1to5('E' + first + ':F' + last + ' L' + first + ':M' + last);

    /* 범례 */
    sh.row([], 6);
    sh.row([XLc.t('※ 위험도 색상 : 15~25 고위험(적색) · 8~14 중위험(황색) · 1~7 저위험(녹색)　　' +
      '※ 위험도 = 빈도 × 강도 (수식으로 들어가 있어 숫자를 고치면 자동으로 다시 계산됩니다)　　' +
      '※ 평가일자 · 평가자 · 조치여부는 실제 평가 시행 시 기입', XLc.NOTE)].concat(E(13)), 18);
    sh.merge('A' + (last + 2) + ':N' + (last + 2));
    return sh;
  };

  /** 5 × 5 매트릭스 기준표 — 묶음 맨 뒤에 붙인다 */
  window.riskMatrixSheet = function () {
    var XLc = window.XL;
    var sh = XLc.sheet('위험도 산정 기준');
    sh.land = false;
    sh.cols = [{ w: 20 }, { w: 15 }, { w: 15 }, { w: 15 }, { w: 15 }, { w: 15 }];
    var E = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(null); return a; };

    sh.row([XLc.t('위험도 산정 및 평가 매트릭스 기준', XLc.TITLE)].concat(E(5)), 30);
    sh.merge('A1:F1');
    sh.row([XLc.t('위험도 = 빈도(Possibility) × 강도(Severity) — 5 × 5 Matrix', XLc.NOTE)].concat(E(5)), 16);
    sh.merge('A2:F2');
    sh.row([], 6);

    var HD = ['1 ( 매우 낮음 )', '2 ( 낮음 )', '3 ( 보통 )', '4 ( 높음 )', '5 ( 매우 높음 )'];
    var LB = { 5: '5 ( 치명적 / 사망 )', 4: '4 ( 중상 / 장해 )', 3: '3 ( 경상 / 휴업 )', 2: '2 ( 경미 / 비휴업 )', 1: '1 ( 극히 경미 )' };
    sh.row([XLc.t('빈도 × 강도', XLc.HEADD)].concat(HD.map(function (x2) { return XLc.t(x2, XLc.HEADD); })), 22);
    [5, 4, 3, 2, 1].forEach(function (s) {
      var c = [XLc.t(LB[s], XLc.LABEL)];
      [1, 2, 3, 4, 5].forEach(function (f) { var v = f * s; c.push(XLc.n(v, lvl(v))); });
      sh.row(c, 20);
    });
    /* 숫자가 든 칸만 색칠한다. 4행은 머릿말이라서 뺀다 (글자를 숫자와 견주면 빨갛게 된다) */
    sh.riskColor('B5:F9');

    sh.row([], 8);
    sh.row([XLc.t('위험성 수준별 조치 기준', XLc.SUB)].concat(E(5)), 22);
    sh.merge('A11:F11');
    sh.row([XLc.t('위험도', XLc.HEADD), XLc.t('수준', XLc.HEADD), XLc.t('조치 기준', XLc.HEADD), null, null, null], 20);
    sh.merge('C12:F12');
    [['15 ~ 25', '고위험 (High)', '즉시 작업을 중단하고 개선 대책 수립 및 위험요인 제거 후 작업 재개', XLc.HI],
     ['8 ~ 14', '중위험 (Medium)', '계획된 기한 내 개선 대책을 시행하고 안전수칙 준수 철저 관리', XLc.MD],
     ['1 ~ 7', '저위험 (Low)', '현재의 안전상태 유지 및 지속적인 작업자 교육 · 점검 실시', XLc.LO]
    ].forEach(function (r, i) {
      sh.row([XLc.t(r[0], r[3]), XLc.t(r[1], r[3]), XLc.t(r[2], XLc.TXT), null, null, null], 22);
      sh.merge('C' + (13 + i) + ':F' + (13 + i));
    });
    return sh;
  };
})();
