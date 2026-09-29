/* 經營室的畫：脈絡星圖、膠囊眼睛、數字滾動、點陣、六格流動。
   每一個函式都是「時間的純函數」：同一個 t 永遠畫出同一格。產品用真實時間驅動，影片用影格時間驅動，兩邊長得一樣。
   視覺語言見 docs/design/視覺語言-v3.md：黑白＋一個橘色、彈簧、不發光、不漸層。 */
(function (global) {
  'use strict';
  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.max(a, Math.min(b, v)); };
  var NODES = ['找客', '迎客', '成交', '口碑', '養客', '回客'];

  var THEME = {
    light: { canvas: '#EEEDEA', surface: '#FFFFFF', ink: '#0B0B0C', ink2: '#57575A', ink3: '#8E8E93', line: '#E3E2DE', line2: '#D4D3CE', accent: '#FF5A1F', accentText: '#E8480F', accentSoft: '#FFE9E0' },
    dark: { canvas: '#0E0E0F', surface: '#17171A', ink: '#F2F2F0', ink2: '#A5A5A8', ink3: '#6E6E73', line: '#2A2A2E', line2: '#3A3A3F', accent: '#FF5A1F', accentText: '#FF6A33', accentSoft: '#3A1D12' },
    stage: { bg: '#0C0C0D', ink: '#EDE6DA', ink2: '#8C877F', ink3: '#4A4743', line: '#2A2826', accent: '#FF5A1F' }
  };
  /* 本命色：每一間經營室可以從這八個挑一個（預設橘）。每個顏色都調過：白底上的字、深色舞台上的點、淡底色都看得清楚 */
  var HUES = {
    orange: { name: '橘', accent: '#FF5A1F', on: '#FFFFFF', text: '#E8480F', soft: '#FFE7DC', stage: '#FF5A1F', darkText: '#FF6A33', darkSoft: '#3A1D12' },
    coral: { name: '珊瑚', accent: '#F2464B', on: '#FFFFFF', text: '#D12F37', soft: '#FFE3E2', stage: '#FF5F64', darkText: '#FF6F73', darkSoft: '#3B1618' },
    berry: { name: '莓果', accent: '#E0457B', on: '#FFFFFF', text: '#C22E63', soft: '#FCE2EC', stage: '#F0588C', darkText: '#F36B98', darkSoft: '#381423' },
    violet: { name: '紫藤', accent: '#7B61FF', on: '#FFFFFF', text: '#5E43EE', soft: '#ECE8FF', stage: '#8E78FF', darkText: '#A08EFF', darkSoft: '#211A45' },
    indigo: { name: '靛藍', accent: '#3D6BFF', on: '#FFFFFF', text: '#2A55E6', soft: '#E3EAFF', stage: '#5A84FF', darkText: '#7394FF', darkSoft: '#14203F' },
    teal: { name: '海青', accent: '#0FA3A3', on: '#FFFFFF', text: '#0A8282', soft: '#DAF3F1', stage: '#22C2C0', darkText: '#3CC9C7', darkSoft: '#0E2B2B' },
    green: { name: '茶綠', accent: '#4E9F3D', on: '#FFFFFF', text: '#3B7F2E', soft: '#E2F1DC', stage: '#66BC52', darkText: '#7ACB67', darkSoft: '#17291A' },
    mustard: { name: '芥黃', accent: '#E9A100', on: '#0B0B0C', text: '#A87300', soft: '#FFF0C9', stage: '#F7B51E', darkText: '#F7C04A', darkSoft: '#3A2C08' }
  };
  function hue(k) { return HUES[k] || HUES.orange; }
  var FONT = '"Geist", -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  var MONO = '"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  /* ── 彈簧：封閉式的步階響應（t0 開始從 0 走到 1）。z<1 會有一點點回彈 ── */
  function spring(t, t0, o) {
    o = o || {}; var dt = t - t0; if (dt <= 0) return 0;
    var w = o.w || 11, z = o.z == null ? .82 : o.z;
    if (z >= 1) return 1 - (1 + w * dt) * Math.exp(-w * dt);
    var wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + (z * w / wd) * Math.sin(wd * dt));
  }
  /* 目標改了好幾次的值＝每次改動各一個彈簧加總，所以仍然是時間的純函數 */
  function springTo(t, keys, o) { var v = keys[0][1]; for (var i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t, keys[i][0], o); return v; }

  function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

  /* ── 膠囊眼睛：助手的臉。state：idle／listen／think／happy／wow；look：[-1..1, -1..1] ── */
  function eyes(ctx, cx, cy, size, t, o) {
    o = o || {}; var col = o.col || '#0B0B0C', st = o.state || 'idle', sty = o.style || 'capsule';   // 眼睛：capsule 直膠囊、round 圓豆、sleepy 瞇瞇
    var ew = size * (sty === 'round' ? .6 : sty === 'sleepy' ? .6 : .42), eh = size * (sty === 'round' ? .6 : sty === 'sleepy' ? .3 : 1), gap = size * (sty === 'capsule' ? .7 : .84);
    var per = 3.6 + (o.seed || 0) % 2.2, ph = (t + (o.seed || 0) * 1.37) % per, cyc = Math.floor((t + (o.seed || 0) * 1.37) / per);
    var blink = ph < .15 ? Math.sin(ph / .15 * Math.PI) : 0;
    if (cyc % 3 === 2 && ph > .22 && ph < .37) blink = Math.max(blink, Math.sin((ph - .22) / .15 * Math.PI));
    var sy = 1 - .9 * blink;
    if (st === 'listen') sy *= .72;
    if (st === 'wow') sy *= 1.12;
    var look = o.look || [0, 0], lx = look[0] * size * .26, ly = look[1] * size * .18;
    if (st === 'think') { lx = Math.sin(t * 1.7) * size * .24; ly = -size * .1; }
    ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col;
    for (var s = -1; s <= 1; s += 2) {
      var x = cx + s * gap / 2 + lx, y = cy + ly;
      if (st === 'happy') {
        ctx.lineWidth = ew * .52; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.arc(x, y + eh * .12, ew * .62, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      } else {
        var w = st === 'wow' ? ew * 1.08 : ew, h = Math.max(w * .5, eh * sy);
        rr(ctx, x - w / 2, y - h / 2, w, h, w / 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  /* App 圖示：橘色圓角方塊＋一雙白色膠囊眼睛 */
  function appIcon(ctx, x, y, size, t, o) {
    o = o || {}; ctx.save(); rr(ctx, x, y, size, size, size * .28); ctx.fillStyle = o.bg || THEME.light.accent; ctx.fill();
    eyes(ctx, x + size / 2, y + size * .5, size * .36, t, { col: o.col || '#FFFFFF', state: o.state, look: o.look, seed: o.seed, style: o.style });
    ctx.restore();
  }

  /* ── 脈絡星圖 ──
     g = { dots:[{id, src, hub, label, born}], hubs:{找客:{st}}, title, meta, loop, step }
     點的樣子照出處：said 米白實心、data 白色實心、web 米白空心、est/calc/youest 橘色。 */
  function fib(n) { var pts = [], ga = Math.PI * (3 - Math.sqrt(5)); for (var i = 0; i < n; i++) { var y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), th = ga * i; pts.push([Math.cos(th) * r, y, Math.sin(th) * r]); } return pts; }
  function project(p, ang, tilt, f) {
    var x = p[0] * Math.cos(ang) + p[2] * Math.sin(ang), z = -p[0] * Math.sin(ang) + p[2] * Math.cos(ang), y = p[1];
    var y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
    var s = f / (f - z2); return { x: x * s, y: y2 * s, z: z2, s: s };
  }
  /* 出處的記號：你說的＝實心圓、你的資料＝實心方塊、查到的＝空心圈、估的＝橘色圓（產品的圖例用同一套） */
  function glyph(ctx, src, X, Y, r, S) {
    var hot = src === 'est' || src === 'calc' || src === 'youest';
    if (src === 'web') { ctx.lineWidth = Math.max(1, r * .38); ctx.strokeStyle = S.ink; ctx.beginPath(); ctx.arc(X, Y, r * 1.02, 0, TAU); ctx.stroke(); return; }
    ctx.fillStyle = hot ? S.accent : S.ink;
    if (src === 'data') { var q = r * 1.72; ctx.fillRect(X - q / 2, Y - q / 2, q, q); return; }
    ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
  }
  function constellation(ctx, x, y, w, h, t, g, o) {
    o = o || {}; var S = o.accent ? Object.assign({}, THEME.stage, { accent: o.accent }) : THEME.stage, R = Math.min(w, h) * (o.radius || .31), cx = x + w * (o.cx || .5), cy = y + h * (o.cy || .5);
    var ang = (o.rot0 || 0) + t * (o.rot == null ? 7 : o.rot) * Math.PI / 180, tilt = (o.tilt == null ? -16 : o.tilt) * Math.PI / 180, f = 3.6;
    ctx.save();
    if (o.frame !== false) { rr(ctx, x, y, w, h, o.r == null ? 28 : o.r); ctx.fillStyle = S.bg; ctx.fill(); rr(ctx, x, y, w, h, o.r == null ? 28 : o.r); ctx.clip(); }
    ctx.fillStyle = S.ink3; ctx.globalAlpha = .22;
    for (var gx = x + 16; gx < x + w; gx += 24) for (var gy = y + 16; gy < y + h; gy += 24) ctx.fillRect(gx, gy, 1, 1);
    ctx.globalAlpha = 1;
    var OB = { rx: R * (o.orbitRx || 1.62), ry: R * (o.orbitRy || .42), rot: -.16 };
    function orbitPath() { ctx.save(); ctx.translate(cx, cy); ctx.rotate(OB.rot); ctx.beginPath(); ctx.ellipse(0, 0, OB.rx, OB.ry, 0, 0, TAU); ctx.restore(); }
    function orbitPt(a) { var ex = Math.cos(a) * OB.rx, ey = Math.sin(a) * OB.ry, c = Math.cos(OB.rot), s2 = Math.sin(OB.rot); return { x: cx + ex * c - ey * s2, y: cy + ex * s2 + ey * c, front: Math.sin(a) > 0 }; }
    // 軌道（後半段先畫）
    ctx.lineWidth = 1; ctx.strokeStyle = S.ink3; ctx.globalAlpha = .7; orbitPath(); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(.5); ctx.beginPath(); ctx.ellipse(0, 0, R * 1.26, R * 1.26 * .78, 0, 0, TAU); ctx.restore(); ctx.strokeStyle = S.ink3; ctx.globalAlpha = .35; ctx.stroke(); ctx.globalAlpha = 1;
    // 六格像行星一樣繞著軌道
    var hubs = NODES.map(function (name, i) {
      var a = i / 6 * TAU + t * (o.orbit == null ? .07 : o.orbit) + (o.orbit0 || 0), pt = orbitPt(a);
      return { name: name, st: ((g.hubs || {})[name] || {}).st || 'unknown', at: ((g.hubs || {})[name] || {}).at, pt: pt, a: a };
    });
    function drawHub(hb) {
      var isHot = hb.st === 'leak' || hb.st === 'hole', later = hb.st === 'later' || hb.st === 'unknown', depthA = hb.pt.front ? 1 : .55, hs = (o.hubScale || 1) * (hb.pt.front ? 1 : .88);
      if (hb.at != null && t >= hb.at) hs *= 1 + .32 * (1 - spring(t, hb.at, { w: 11, z: .42 }));
      ctx.save(); ctx.globalAlpha = depthA * (later ? .7 : 1);
      ctx.font = '600 ' + Math.round(14 * hs) + 'px ' + FONT;
      var tw = ctx.measureText(hb.name).width, pw = tw + 26 * hs, ph = 28 * hs, X = hb.pt.x, Y = hb.pt.y;
      if (isHot) { var ring = (t * .75 + (hb.name === '找客' ? 0 : .5)) % 1; ctx.strokeStyle = S.accent; ctx.lineWidth = 1; ctx.globalAlpha = depthA * (1 - ring) * .85; rr(ctx, X - pw / 2 - ring * 12, Y - ph / 2 - ring * 12, pw + ring * 24, ph + ring * 24, ph); ctx.stroke(); ctx.globalAlpha = depthA; }
      rr(ctx, X - pw / 2, Y - ph / 2, pw, ph, ph / 2); ctx.fillStyle = isHot ? S.accent : S.bg; ctx.fill();
      if (!isHot) { ctx.lineWidth = 1; ctx.strokeStyle = later ? S.ink3 : S.ink2; ctx.stroke(); }
      ctx.fillStyle = isHot ? '#0C0C0D' : later ? S.ink2 : S.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hb.name, X, Y + .5);
      ctx.restore();
    }
    hubs.filter(function (hb) { return !hb.pt.front; }).forEach(drawHub);
    // 球：幾百個結構點＋坐在上面的資料點。每一點的位置由它的 id 決定、先來的先坐，新的點進來時舊的點不會移動
    var dots = g.dots || [], n = dots.length, M = Math.max(o.shell || 560, n * 3), shell = fib(M), slot = {}, pts = [];
    dots.map(function (d, i) { return { i: i, b: d.born == null ? -99 : d.born, h: hash(d.id || i) }; })
      .sort(function (a, b) { return a.b - b.b || a.h - b.h; })
      .forEach(function (e) { var s = Math.floor(e.h * M) % M; while (slot[s] != null) s = (s + 1) % M; slot[s] = e.i; });
    for (var si = 0; si < M; si++) {
      var p = project(shell[si], ang, tilt, f), di = slot[si], d = di == null ? null : dots[di], k = 1;
      if (d) { k = spring(t, d.born == null ? -99 : d.born, { w: 9, z: .7 }); }
      pts.push({ p: p, d: d, di: di, k: k });
    }
    pts.sort(function (a, b) { return a.p.z - b.p.z; });
    var hover = o.hover == null ? -1 : o.hover, hoverXY = null, eyesDrawn = false;
    function drawEyes() {
      if (eyesDrawn || o.eyes === false) return; eyesDrawn = true;
      var lk = o.look || [0, 0]; if (hoverXY) lk = [clamp((hoverXY[0] - cx) / R, -1, 1), clamp((hoverXY[1] - cy) / R, -1, 1)];
      ctx.save(); ctx.globalAlpha = 1; eyes(ctx, cx, cy, R * .24 * (o.eyeScale || 1), t, { col: S.ink, state: o.state || 'idle', look: lk, seed: 3, style: o.eyeStyle }); ctx.restore();
    }
    var drawn = [];
    pts.forEach(function (it) {
      if (it.p.z > .05) drawEyes();
      var X = cx + it.p.x * R, Y = cy + it.p.y * R, depth = clamp((it.p.z + 1) / 2);
      if (!it.d) {
        var nearC = Math.hypot(X - cx, Y - cy) / R, fade = it.p.z > 0 ? clamp(nearC * 1.8 - .25, .12, 1) : 1;
        ctx.globalAlpha = (.1 + .5 * depth) * fade; ctx.fillStyle = S.ink; var sz = .9 + 1.1 * depth; ctx.fillRect(X - sz / 2, Y - sz / 2, sz, sz); return;
      }
      if (it.k <= .001) { ctx.globalAlpha = (.1 + .5 * depth) * .8; ctx.fillStyle = S.ink; ctx.fillRect(X - .6, Y - .6, 1.2, 1.2); return; }
      var src = it.d.src, r = (2.4 + 2.6 * depth) * it.p.s * (o.dotScale || 1) * (.3 + .7 * it.k), a = (.38 + .62 * depth) * clamp(it.k * 1.4);
      if (o.hoverHub) { if (it.d.hub === o.hoverHub) { r *= 1.35; a = Math.max(a, .95); } else a *= .3; }
      if (it.di === hover) { hoverXY = [X, Y]; r *= 1.8; a = 1; }
      ctx.globalAlpha = a;
      glyph(ctx, src, X, Y, r, S);
      drawn.push({ X: X, Y: Y, z: it.p.z, di: it.di, hub: it.d.hub });
    });
    drawEyes(); ctx.globalAlpha = 1;
    // 軌道前半段壓在球前面
    ctx.save(); ctx.beginPath(); ctx.rect(x, cy, w, h); ctx.clip(); ctx.lineWidth = 1; ctx.strokeStyle = S.ink2; ctx.globalAlpha = .6; orbitPath(); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
    // 本命星座：挑出來的那幾顆星連成一個星座，跟著球一起轉；名字標在最靠前的那顆旁邊
    if (g.sign && g.sign.stars && g.sign.stars.length > 1) {
      var sk = g.sign.at == null ? 1 : clamp((t - g.sign.at) / 1.2), byDi = {}; drawn.forEach(function (dd) { byDi[dd.di] = dd; });
      var st3 = g.sign.stars.map(function (di) { return byDi[di]; }).filter(Boolean);
      if (sk > 0 && st3.length > 1) {
        ctx.save(); ctx.lineWidth = 1.4; ctx.strokeStyle = S.accent; ctx.lineCap = 'round';
        var segs = st3.length - 1, upto = sk * segs;
        for (var q = 0; q < segs && q < upto; q++) {
          var A = st3[q], B = st3[q + 1], f2 = Math.min(1, upto - q), za = (A.z + B.z) / 2;
          ctx.globalAlpha = (za > 0 ? .95 : .35) * (o.hoverHub ? .4 : 1);
          ctx.beginPath(); ctx.moveTo(A.X, A.Y); ctx.lineTo(A.X + (B.X - A.X) * f2, A.Y + (B.Y - A.Y) * f2); ctx.stroke();
        }
        st3.forEach(function (dd, k2) { if (k2 > upto + .01) return; ctx.globalAlpha = dd.z > 0 ? 1 : .45; ctx.beginPath(); ctx.arc(dd.X, dd.Y, 5.2, 0, TAU); ctx.stroke(); });
        var lead = st3.reduce(function (a, b) { return b.z > a.z ? b : a; }, st3[0]);
        if (g.sign.name && sk > .6) { ctx.globalAlpha = clamp((sk - .6) * 2.5); ctx.font = '600 12.5px ' + FONT; ctx.fillStyle = S.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(g.sign.name, lead.X + 10, lead.Y - 10); }
        ctx.restore();
      }
    }
    // 滑到某一格：拉線到它的點
    var hh = o.hoverHub ? hubs.filter(function (hb) { return hb.name === o.hoverHub; })[0] : null;
    if (hh) { ctx.strokeStyle = S.accent; ctx.lineWidth = 1; drawn.forEach(function (dd) { if (dd.hub !== hh.name || dd.z < -0.1) return; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(dd.X, dd.Y); ctx.lineTo(hh.pt.x, hh.pt.y); ctx.stroke(); }); ctx.globalAlpha = 1; }
    hubs.filter(function (hb) { return hb.pt.front; }).forEach(drawHub);
    // 小衛星
    var sa = t * .9, sat = { x: cx + Math.cos(sa) * R * 1.26, y: cy + Math.sin(sa) * R * 1.26 * .78 }, c5 = Math.cos(.5), s5 = Math.sin(.5);
    var sxs = cx + (sat.x - cx) * c5 - (sat.y - cy) * s5, sys = cy + (sat.x - cx) * s5 + (sat.y - cy) * c5; ctx.fillStyle = S.accent; ctx.beginPath(); ctx.arc(sxs, sys, 3.4, 0, TAU); ctx.fill();
    if (hoverXY) {
      ctx.strokeStyle = S.ink; ctx.lineWidth = 1; ctx.globalAlpha = .9;
      [[-15, 0, -7, 0], [7, 0, 15, 0], [0, -15, 0, -7], [0, 7, 0, 15]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(hoverXY[0] + l[0], hoverXY[1] + l[1]); ctx.lineTo(hoverXY[0] + l[2], hoverXY[1] + l[3]); ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    if (o.hud !== false) {
      var m = 18, L = 14; ctx.strokeStyle = S.ink2; ctx.lineWidth = 1.2;
      [[x + m, y + m, 1, 1], [x + w - m, y + m, -1, 1], [x + m, y + h - m, 1, -1], [x + w - m, y + h - m, -1, -1]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0], c[1] + c[3] * L); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + c[2] * L, c[1]); ctx.stroke(); });
      ctx.font = '500 10.5px ' + MONO; ctx.fillStyle = S.ink2; ctx.textBaseline = 'alphabetic';
      var cnt = { said: 0, data: 0, web: 0, est: 0 }; dots.forEach(function (d) { if (t >= (d.born == null ? -99 : d.born)) { var kk = d.src === 'calc' || d.src === 'youest' ? 'est' : d.src; if (cnt[kk] != null) cnt[kk]++; } });
      var total = cnt.said + cnt.data + cnt.web + cnt.est, deg = ((ang * 180 / Math.PI) % 360 + 360) % 360;
      ctx.textAlign = 'left'; ctx.fillText((g.title || '脈絡星圖') + (g.sign && g.sign.name ? '  ・  ' + g.sign.name : ''), x + m + 22, y + m + 11);
      var narrow = w < 600;
      ctx.textAlign = 'right'; ctx.fillText('N ' + String(total).padStart(3, '0') + (narrow ? '' : '   ROT ' + deg.toFixed(1) + '°'), x + w - m - 22, y + m + 11);
      ctx.textAlign = 'left'; var lx = x + m + (narrow ? 4 : 22), ly = y + h - m - (narrow ? 22 : 4);
      [['said', '你說的'], ['data', '你的資料'], ['web', '查到的'], ['est', '估的']].forEach(function (k) {
        ctx.globalAlpha = 1; glyph(ctx, k[0], lx + 3.5, ly - 3.6, 3.1, S); ctx.fillStyle = S.ink2;
        var s = k[1] + ' ' + cnt[k[0]]; ctx.fillText(s, lx + 12, ly); lx += 12 + ctx.measureText(s).width + (narrow ? 10 : 16);
      });
      if (!narrow) { ctx.textAlign = 'right'; ctx.fillText('SCALE ' + (g.loop || 1) + ' · ' + (g.step || 'S'), x + w - m - 22, y + h - m - 4); }
    }
    ctx.restore();
    return { cx: cx, cy: cy, R: R, hoverXY: hoverXY, dots: drawn, hubs: hubs.map(function (hb) { return { name: hb.name, x: hb.pt.x, y: hb.pt.y }; }), pick: function (px, py) {
      var best = -1, bd = 16 * 16; drawn.forEach(function (dd) { if (dd.z < -0.15) return; var dx = dd.X - px, dy = dd.Y - py, q = dx * dx + dy * dy; if (q < bd) { bd = q; best = dd.di; } }); return best;
    }, pickHub: function (px, py) { var best = null, bd = 30 * 30; hubs.forEach(function (hb) { var dx = hb.pt.x - px, dy = hb.pt.y - py, q = dx * dx + dy * dy; if (q < bd) { bd = q; best = hb.name; } }); return best; } };
  }

  /* ── 數字滾動（里程表）：每一位數各自轉到位；非數字的字不動 ── */
  function odometer(ctx, text, x, y, size, t, t0, o) {
    o = o || {}; ctx.save(); ctx.font = (o.wt || 700) + ' ' + size + 'px ' + FONT; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = o.col || '#0B0B0C';
    var cx = o.align === 'center' ? x - measure(ctx, text, size, o) / 2 : o.align === 'right' ? x - measure(ctx, text, size, o) : x, di = 0, lh = size * 1.02;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], cw = ctx.measureText(/\d/.test(ch) ? '0' : ch).width + (o.track || 0);
      if (/\d/.test(ch)) {
        var d = +ch, p = spring(t, t0 + di * (o.stagger == null ? .07 : o.stagger), { w: o.w || 9, z: o.z == null ? .9 : o.z }), turns = (o.spins == null ? 1 : o.spins) + (d === 0 ? 1 : 0), pos = (d + 10 * turns) * p;
        ctx.save(); ctx.beginPath(); ctx.rect(cx - 2, y - size * .78, cw + 4, size * .84); ctx.clip();   // 窗口就是數字本身的高度
        for (var k = Math.floor(pos) - 1; k <= Math.floor(pos) + 1; k++) {
          var off = (k - pos) * lh, a = 1 - Math.min(1, Math.abs(off) / lh);
          ctx.globalAlpha = a; ctx.fillText(String(((k % 10) + 10) % 10), cx, y + off);
        }
        ctx.restore(); di++;
      } else { ctx.fillText(ch, cx, y); }
      cx += cw;
    }
    ctx.restore();
  }
  function odoWidth(ctx, text, size, o) { o = o || {}; ctx.save(); ctx.font = (o.wt || 700) + ' ' + size + 'px ' + FONT; var w = measure(ctx, text, size, o); ctx.restore(); return w; }
  function measure(ctx, text, size, o) { var w = 0; for (var i = 0; i < text.length; i++) w += ctx.measureText(/\d/.test(text[i]) ? '0' : text[i]).width + (o.track || 0); return w; }

  /* ── 點陣：一點一個實體。stages：[{t, keep}] 逐步只留下前 keep 個；won：{t, count} 最後幾個變橘色 ── */
  function dotMatrix(ctx, x, y, w, h, t, o) {
    var n = o.n || 80, cols = o.cols || 16, rows = Math.ceil(n / cols), gx = w / cols, gy = h / rows, r = Math.min(gx, gy) * (o.r || .26);
    var order = [], i; for (i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) { return hash('m' + a + (o.seed || '')) - hash('m' + b + (o.seed || '')); });
    var rank = []; order.forEach(function (idx, k) { rank[idx] = k; });
    var keep = springTo(t, [[-1, n]].concat((o.stages || []).map(function (s) { return [s.t, s.keep]; })), { w: 7, z: 1 });
    var ink = o.ink || '#0B0B0C', faint = o.faint || '#D4D3CE', accent = o.accent || '#FF5A1F';
    for (i = 0; i < n; i++) {
      var c = i % cols, rw = Math.floor(i / cols), X = x + gx * (c + .5), Y = y + gy * (rw + .5), rk = rank[i];
      var alive = clamp(keep - rk + .5), born = o.born == null ? 1 : spring(t, o.born + (rk % 20) * .012 + Math.floor(rk / 20) * .04, { w: 12, z: .75 });
      if (born <= .001) continue;
      var won = o.won && rk < o.won.count ? spring(t, o.won.t + rk * .1, { w: 10, z: .7 }) : 0;
      ctx.globalAlpha = 1; ctx.fillStyle = faint; ctx.beginPath(); ctx.arc(X, Y, r * born, 0, TAU); ctx.fill();
      if (alive > 0) { ctx.globalAlpha = alive; ctx.fillStyle = won > .01 ? accent : ink; ctx.beginPath(); ctx.arc(X, Y, r * born * (1 + won * .25), 0, TAU); ctx.fill(); }
      if (won > .01) { ctx.globalAlpha = (1 - clamp(won - .6) * 2.5) * .9; ctx.strokeStyle = accent; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X, Y, r * (1.6 + won * 1.4), 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  function withAccent(P, o) { return o && o.accent ? Object.assign({}, P, { accent: o.accent, accentText: o.accentText || o.accent, onAccent: o.onAccent || '#FFFFFF' }) : P; }
  /* ── 六格流動：客人沿著六格走，在洞口掉下去。states 每格：leak／hole／rel／later／unknown。vertical：手機直立版 ── */
  function pipeline(ctx, x, y, w, h, t, states, o) {
    o = o || {}; var P = withAccent(THEME[o.theme || 'light'], o), vert = !!o.vertical;
    var a0 = vert ? y + h * .08 : x + w * .075, a1 = vert ? y + h * .92 : x + w * .925, gap = (a1 - a0) / 5;
    var axis = vert ? x + Math.min(w * .22, 70) : y + h * .4, R = vert ? Math.min(gap * .34, 25) : Math.min(h * .2, gap * .3, o.maxR || 31);
    var start = vert ? y : x, len = vert ? h : w, from = o.from || [];   // from[k]：這一格從哪個時間開始漏（影片用；產品不給＝一直都是）
    function at(al, ac) { return vert ? [axis + ac, al] : [al, axis + ac]; }
    ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = P.line2; ctx.beginPath();
    var e0 = at(start, 0), e1 = at(start + len, 0); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.stroke();
    // 客人：固定間隔出發、速度固定；經過洞口時照機率掉出去（同一個 t 永遠同一個畫面）
    var speed = len * (vert ? .13 : .16), every = .34, t0 = o.t0 == null ? -30 : o.t0, nn = Math.floor((t - t0) / every) + 1;
    for (var i = Math.max(0, nn - 70); i < nn; i++) {
      var s = t0 + i * every, age = t - s, al = start + age * speed, ac = 0, a = 1, fell = false;
      for (var k = 0; k < 6; k++) {
        var st = states[k] || 'unknown', p = st === 'leak' ? .5 : st === 'hole' ? .3 : 0, hx = a0 + k * gap, th = s + (hx - start) / speed;
        if (p && t >= th && th >= (from[k] == null ? -1e9 : from[k]) && hash('p' + i + '_' + k) < p) {
          var dt = t - th; if (vert) { al = hx + dt * 20; ac = -(dt * 26 + .5 * 240 * dt * dt); } else { al = hx + dt * 12; ac = .5 * h * 2.4 * dt * dt; }
          a = 1 - dt * 1.6; fell = true; break;
        }
      }
      if ((!fell && al > start + len) || a <= 0) continue;
      var q = at(al, ac), dr = (o.dot || 3.6); ctx.globalAlpha = a * clamp((al - start) / 30); ctx.fillStyle = fell ? P.accent : P.ink;
      ctx.beginPath(); ctx.arc(q[0], q[1], fell ? dr * 1.12 : dr, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; var hits = [];
    for (k = 0; k < 6; k++) {
      var shown = o.show && o.show[k] != null ? spring(t, o.show[k], { w: 12, z: .62 }) : 1;   // show[k]：這一格什麼時候冒出來（影片用）
      if (shown <= .001) { hits.push({ x: 0, y: 0, r: 0 }); continue; }
      var live = from[k] == null || t >= from[k], st2 = live ? states[k] || 'unknown' : 'unknown', c = at(a0 + k * gap, 0), hot = st2 === 'leak' || st2 === 'hole', dim = st2 === 'later' || st2 === 'unknown', on = o.hover === k;
      var popR = R * shown * (from[k] != null && live ? 1 + .26 * (1 - spring(t, from[k], { w: 10, z: .42 })) : 1);
      if (from[k] != null && live && t - from[k] < .7) { var q2 = (t - from[k]) / .7; ctx.strokeStyle = hot ? P.accent : P.line2; ctx.lineWidth = hot ? 2 : 1.2; ctx.globalAlpha = 1 - q2; ctx.beginPath(); ctx.arc(c[0], c[1], R * (1 + q2 * 1.4), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      if (hot) { var ph = (t * .8 + k * .13) % 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1; ctx.globalAlpha = (1 - ph) * .8; ctx.beginPath(); ctx.arc(c[0], c[1], R * (1 + ph * .55), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(c[0], c[1], popR * (on ? 1.08 : 1), 0, TAU); ctx.fillStyle = hot ? P.accent : P.surface; ctx.fill();
      if (!hot) { ctx.lineWidth = st2 === 'rel' || on ? 2 : 1.2; ctx.strokeStyle = st2 === 'rel' || on ? P.ink : P.line2; ctx.stroke(); }
      ctx.globalAlpha = clamp(shown * 1.4); ctx.font = '600 ' + Math.round(Math.max(11, Math.min(o.maxFont || 15, R * .5))) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = hot ? (P.onAccent || '#FFFFFF') : dim ? P.ink3 : P.ink; ctx.fillText(NODES[k], c[0], c[1] + 1);
      var lab = (o.labels || {})[NODES[k]];
      if (lab) {
        ctx.font = (hot ? '650 ' : '500 ') + (vert ? 14 : Math.round(Math.max(11.5, Math.min(o.maxLabel || 13.5, R * .44)))) + 'px ' + FONT; ctx.fillStyle = hot ? P.accentText : dim ? P.ink3 : P.ink2;
        if (vert) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, c[0] + R + 16, c[1] + 1); }
        else { ctx.textBaseline = 'alphabetic'; ctx.fillText(lab, c[0], c[1] + R + (o.labelGap || 24)); }
      }
      ctx.globalAlpha = 1; hits.push({ x: c[0], y: c[1], r: R });
    }
    ctx.restore(); return hits;
  }

  /* ── 點陣漏斗：一列一個步驟、一點一家（一個實體）。沒走到這一步的留一個淡圈，看得出掉了多少。won：最後一列前幾點變橘色 ── */
  function dotRows(ctx, x, y, w, h, t, rows, o) {
    o = o || {}; var P = withAccent(THEME[o.theme || 'light'], o), n = rows.length, rh = h / n, labW = o.labelW == null ? Math.min(118, w * .28) : o.labelW, numW = o.numW == null ? 56 : o.numW;
    var maxN = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1])), cell = Math.min(o.cell || 22, (w - labW - numW) / maxN), r = cell * .31, t0 = o.t0 == null ? -99 : o.t0, step = o.step || .42;
    ctx.save();
    rows.forEach(function (row, k) {
      var cy = y + rh * (k + .5), tk = t0 + k * step, prev = k ? rows[k - 1][1] : row[1], j;
      ctx.globalAlpha = clamp((t - tk + .3) * 4); ctx.font = '500 12px ' + MONO; ctx.fillStyle = P.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(row[0], x, cy + .5);
      for (j = row[1]; j < prev; j++) { ctx.globalAlpha = clamp((t - tk) * 2.5); ctx.strokeStyle = P.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + labW + cell * (j + .5), cy, r * .72, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
      for (j = 0; j < row[1]; j++) {
        var b = spring(t, tk + j * .016, { w: 14, z: .72 }); if (b <= .001) continue;
        var X = x + labW + cell * (j + .5), wt0 = t0 + n * step + .25 + j * .12, won = k === n - 1 && o.won && j < o.won ? spring(t, wt0, { w: 10, z: .7 }) : 0;
        ctx.fillStyle = won > .5 ? P.accent : P.ink; ctx.beginPath(); ctx.arc(X, cy, r * b * (1 + won * .22), 0, TAU); ctx.fill();
        if (won > .01) { var ph = ((t - wt0) * .55 % 1 + 1) % 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.globalAlpha = (1 - ph) * .8 * clamp(won); ctx.beginPath(); ctx.arc(X, cy, r * (1.5 + ph * 1.8), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      }
      odometer(ctx, String(row[1]), x + w, cy + 8, 22, t, tk, { wt: 650, align: 'right', col: k === n - 1 && o.won ? P.accentText : P.ink });
    });
    ctx.restore();
  }

  /* 產品端：把畫布接上真實時間（看不到就不畫；系統要求減少動態就只畫一格）。onSeen：第一次進到畫面時通知 */
  function animate(canvas, draw, opt) {
    opt = opt || {};
    var ctx = canvas.getContext('2d'), raf = 0, visible = true, seen = false, t0 = performance.now(), io = null, ro = null, rect;
    function size() { var r = canvas.getBoundingClientRect(), d = Math.min(2, global.devicePixelRatio || 1); canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d)); ctx.setTransform(d, 0, 0, d, 0, 0); return r; }
    var reduced = false; try { reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    function paint(t) { ctx.clearRect(0, 0, rect.width, rect.height); draw(ctx, rect.width, rect.height, t); }
    function frame(now) { raf = global.requestAnimationFrame(frame); if (!visible || document.hidden) return; paint((now - t0) / 1000); }
    rect = size(); paint(4);   // 先畫一格：靜止時也是完整的畫面
    if (!reduced) raf = global.requestAnimationFrame(frame);
    if ('IntersectionObserver' in global) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && !seen) { seen = true; if (opt.onSeen && !reduced) opt.onSeen((performance.now() - t0) / 1000); } }, { threshold: opt.threshold || 0 });
      io.observe(canvas);
    }
    var onResize = function () { var r = canvas.getBoundingClientRect(); if (Math.abs(r.width - rect.width) < .5 && Math.abs(r.height - rect.height) < .5) return; rect = size(); paint(reduced ? 4 : (performance.now() - t0) / 1000); };
    if ('ResizeObserver' in global) { ro = new ResizeObserver(onResize); ro.observe(canvas); } else global.addEventListener('resize', onResize);
    return { stop: function () { global.cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); else global.removeEventListener('resize', onResize); }, redraw: function () { paint(reduced ? 4 : (performance.now() - t0) / 1000); }, now: function () { return (performance.now() - t0) / 1000; } };
  }

  global.CtxViz = { THEME: THEME, HUES: HUES, hue: hue, FONT: FONT, MONO: MONO, NODES: NODES, spring: spring, springTo: springTo, clamp: clamp, rr: rr, hash: hash, glyph: glyph, eyes: eyes, appIcon: appIcon, constellation: constellation, odometer: odometer, odoWidth: odoWidth, dotMatrix: dotMatrix, dotRows: dotRows, pipeline: pipeline, animate: animate };
})(typeof window !== 'undefined' ? window : this);
