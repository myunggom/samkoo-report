/*! Minimal QR Code encoder (byte mode, EC L/M/Q/H, versions 1-20) — no dependencies. */
(function (global) {
  'use strict';

  // total codewords per version (1..20)
  var TOTAL_CW = [26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085];

  // [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] for L,M,Q,H
  var RS = {
    L: [[7,1,19,0,0],[10,1,34,0,0],[15,1,55,0,0],[20,1,80,0,0],[26,1,108,0,0],[18,2,68,0,0],[20,2,78,0,0],
        [24,2,97,0,0],[30,2,116,0,0],[18,2,68,2,69],[20,4,81,0,0],[24,2,92,2,93],[26,4,107,0,0],[30,3,115,1,116],
        [22,5,87,1,88],[24,5,98,1,99],[28,1,107,5,108],[30,5,120,1,121],[28,3,113,4,114],[28,3,107,5,108]],
    M: [[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],
        [22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44],[30,1,50,4,51],[22,6,36,2,37],[22,8,37,1,38],[24,4,40,5,41],
        [24,5,41,5,42],[28,7,45,3,46],[28,10,46,1,47],[26,9,43,4,44],[26,3,44,11,45],[26,3,41,13,42]],
    Q: [[13,1,13,0,0],[22,1,22,0,0],[18,2,17,0,0],[26,2,24,0,0],[18,2,15,2,16],[24,4,19,0,0],[18,2,14,4,15],
        [22,4,18,2,19],[20,4,16,4,17],[24,6,19,2,20],[28,4,22,4,23],[26,4,20,6,21],[24,8,20,4,21],[20,11,16,5,17],
        [30,5,24,7,25],[24,15,19,2,20],[28,1,22,15,23],[28,17,22,1,23],[26,17,21,4,22],[30,15,24,5,25]],
    H: [[17,1,9,0,0],[28,1,16,0,0],[22,2,13,0,0],[16,4,9,0,0],[22,2,11,2,12],[28,4,15,0,0],[26,4,13,1,14],
        [26,4,14,2,15],[24,4,12,4,13],[28,6,15,2,16],[24,3,12,8,13],[28,7,14,4,15],[22,12,11,4,12],[24,11,12,5,13],
        [24,11,12,7,13],[30,3,15,13,16],[28,2,14,17,15],[28,2,14,19,15],[26,9,13,16,14],[28,15,15,10,16]]
  };

  var ALIGN = [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],
    [6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90]];

  // GF(256)
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenPoly(n) {
    var p = [1];
    for (var i = 0; i < n; i++) {
      var np = new Array(p.length + 1).fill(0);
      for (var j = 0; j < p.length; j++) {
        np[j] ^= gmul(p[j], 1);
        np[j + 1] ^= gmul(p[j], EXP[i]);
      }
      p = np;
    }
    return p;
  }

  function rsEncode(data, ecLen) {
    var gen = rsGenPoly(ecLen);
    var res = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift(); res.push(0);
      if (factor !== 0) for (var j = 0; j < gen.length - 1; j++) res[j] ^= gmul(gen[j + 1], factor);
    }
    return res;
  }

  function utf8Bytes(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
  }

  function bchFormat(fmt) {
    var d = fmt << 10;
    for (var i = 14; i >= 10; i--) if (d & (1 << i)) d ^= 0x537 << (i - 10);
    return ((fmt << 10) | d) ^ 0x5412;
  }
  function bchVersion(ver) {
    var d = ver << 12;
    for (var i = 17; i >= 12; i--) if (d & (1 << i)) d ^= 0x1f25 << (i - 12);
    return (ver << 12) | d;
  }

  var ECBITS = { L: 1, M: 0, Q: 3, H: 2 };

  function build(text, ecLevel) {
    ecLevel = ecLevel || 'M';
    var bytes = utf8Bytes(text);
    var table = RS[ecLevel];
    var ver = -1, cap = 0, spec = null;
    for (var v = 1; v <= 20; v++) {
      var sp = table[v - 1];
      var c0 = sp[1] * sp[2] + sp[3] * sp[4];
      var lb = v <= 9 ? 8 : 16;
      if (4 + lb + bytes.length * 8 <= c0 * 8) { ver = v; spec = sp; cap = c0; break; }
    }
    if (ver < 0) throw new Error('데이터가 너무 깁니다 (QR 용량 초과)');

    var ecLen = spec[0], g1n = spec[1], g1d = spec[2], g2n = spec[3], g2d = spec[4];
    var lenBits = ver <= 9 ? 8 : 16;

    // bit stream
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    put(4, 4);
    put(bytes.length, lenBits);
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    var total = cap * 8;
    for (i = 0; i < 4 && bits.length < total; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var pad = [0xec, 0x11], pi = 0;
    while (bits.length < total) { put(pad[pi++ % 2], 8); }

    var dataCw = [];
    for (i = 0; i < bits.length; i += 8) {
      var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
      dataCw.push(b);
    }

    // split into blocks
    var blocks = [], ecBlocks = [], off = 0, n;
    for (n = 0; n < g1n; n++) { var d = dataCw.slice(off, off + g1d); off += g1d; blocks.push(d); ecBlocks.push(rsEncode(d, ecLen)); }
    for (n = 0; n < g2n; n++) { var d2 = dataCw.slice(off, off + g2d); off += g2d; blocks.push(d2); ecBlocks.push(rsEncode(d2, ecLen)); }

    var interleaved = [];
    var maxD = Math.max(g1d, g2d || 0);
    for (i = 0; i < maxD; i++) for (n = 0; n < blocks.length; n++) if (i < blocks[n].length) interleaved.push(blocks[n][i]);
    for (i = 0; i < ecLen; i++) for (n = 0; n < ecBlocks.length; n++) interleaved.push(ecBlocks[n][i]);

    // matrix
    var size = ver * 4 + 17;
    var m = [], fn = [];
    for (i = 0; i < size; i++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(0)); }

    function setFinder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) || (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                 (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        m[rr][cc] = on ? 1 : 0; fn[rr][cc] = 1;
      }
    }
    setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

    // timing
    for (i = 8; i < size - 8; i++) { m[6][i] = m[i][6] = (i % 2 === 0) ? 1 : 0; fn[6][i] = fn[i][6] = 1; }

    // alignment
    var ap = ALIGN[ver - 1];
    for (var a = 0; a < ap.length; a++) for (var b2 = 0; b2 < ap.length; b2++) {
      var last = ap.length - 1;
      if ((a === 0 && b2 === 0) || (a === 0 && b2 === last) || (a === last && b2 === 0)) continue;
      var ar = ap[a], ac = ap[b2];
      for (var dr2 = -2; dr2 <= 2; dr2++) for (var dc2 = -2; dc2 <= 2; dc2++) {
        m[ar + dr2][ac + dc2] = (Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1) ? 1 : 0;
        fn[ar + dr2][ac + dc2] = 1;
      }
    }

    // reserve format areas
    for (i = 0; i < 9; i++) { if (!fn[8][i]) { fn[8][i] = 1; m[8][i] = 0; } if (!fn[i][8]) { fn[i][8] = 1; m[i][8] = 0; } }
    for (i = 0; i < 8; i++) { fn[8][size - 1 - i] = 1; fn[size - 1 - i][8] = 1; }
    m[size - 8][8] = 1; fn[size - 8][8] = 1; // dark module

    // version info
    if (ver >= 7) {
      var vb = bchVersion(ver);
      for (i = 0; i < 18; i++) {
        var bit = (vb >> i) & 1;
        var r1 = Math.floor(i / 3), c1 = size - 11 + (i % 3);
        m[r1][c1] = bit; fn[r1][c1] = 1;
        m[c1][r1] = bit; fn[c1][r1] = 1;
      }
    }

    // place data
    var dbits = [];
    for (i = 0; i < interleaved.length; i++) for (k = 7; k >= 0; k--) dbits.push((interleaved[i] >> k) & 1);
    var idx = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var rowi = 0; rowi < size; rowi++) {
        var row = up ? size - 1 - rowi : rowi;
        for (var s = 0; s < 2; s++) {
          var cc2 = col - s;
          if (fn[row][cc2]) continue;
          m[row][cc2] = idx < dbits.length ? dbits[idx] : 0;
          idx++;
        }
      }
      up = !up;
    }

    function maskFn(k, r, c) {
      switch (k) {
        case 0: return (r + c) % 2 === 0;
        case 1: return r % 2 === 0;
        case 2: return c % 3 === 0;
        case 3: return (r + c) % 3 === 0;
        case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
        case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
        case 7: return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
      }
    }

    function applyFormat(mat, mask) {
      var f = bchFormat((ECBITS[ecLevel] << 3) | mask);
      for (var i2 = 0; i2 < 15; i2++) {
        var b3 = (f >> i2) & 1;
        // vertical strip (column 8)
        if (i2 < 6) mat[i2][8] = b3;
        else if (i2 < 8) mat[i2 + 1][8] = b3;
        else mat[size - 15 + i2][8] = b3;
        // horizontal strip (row 8)
        if (i2 < 8) mat[8][size - i2 - 1] = b3;
        else if (i2 === 8) mat[8][7] = b3;
        else mat[8][14 - i2] = b3;
      }
      mat[size - 8][8] = 1;
    }

    function penalty(mat) {
      var p = 0, i2, j2, run, dark = 0;
      for (i2 = 0; i2 < size; i2++) {
        run = 1;
        for (j2 = 1; j2 < size; j2++) {
          if (mat[i2][j2] === mat[i2][j2 - 1]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
        for (j2 = 1; j2 < size; j2++) {
          if (mat[j2][i2] === mat[j2 - 1][i2]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) p += 3 + (run - 5);
      }
      for (i2 = 0; i2 < size - 1; i2++) for (j2 = 0; j2 < size - 1; j2++) {
        var v2 = mat[i2][j2];
        if (v2 === mat[i2][j2 + 1] && v2 === mat[i2 + 1][j2] && v2 === mat[i2 + 1][j2 + 1]) p += 3;
      }
      var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
      function match(get, n2) {
        var c3 = 0;
        for (var s2 = 0; s2 + 11 <= n2; s2++) {
          var ok1 = true, ok2 = true;
          for (var t = 0; t < 11; t++) { var vv = get(s2 + t); if (vv !== pat1[t]) ok1 = false; if (vv !== pat2[t]) ok2 = false; }
          if (ok1 || ok2) c3++;
        }
        return c3;
      }
      for (i2 = 0; i2 < size; i2++) {
        (function (r2) { p += 40 * match(function (x) { return mat[r2][x]; }, size); })(i2);
        (function (c4) { p += 40 * match(function (x) { return mat[x][c4]; }, size); })(i2);
      }
      for (i2 = 0; i2 < size; i2++) for (j2 = 0; j2 < size; j2++) if (mat[i2][j2]) dark++;
      var pct = dark * 100 / (size * size);
      p += Math.floor(Math.abs(pct - 50) / 5) * 10;
      return p;
    }

    var best = null, bestP = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      var cand = m.map(function (r) { return r.slice(); });
      for (i = 0; i < size; i++) for (k = 0; k < size; k++) if (!fn[i][k] && maskFn(mk, i, k)) cand[i][k] ^= 1;
      applyFormat(cand, mk);
      var pv = penalty(cand);
      if (pv < bestP) { bestP = pv; best = cand; }
    }
    return { size: size, version: ver, modules: best };
  }

  function toCanvas(canvas, text, opts) {
    opts = opts || {};
    var qr = build(text, opts.ec || 'M');
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var n = qr.size + quiet * 2;
    var scale = Math.max(1, Math.floor((opts.size || 320) / n));
    var px = n * scale;
    canvas.width = px; canvas.height = px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.dark || '#000000';
    for (var r = 0; r < qr.size; r++) for (var c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return qr;
  }

  global.QRLite = { build: build, toCanvas: toCanvas };
})(typeof window !== 'undefined' ? window : globalThis);
