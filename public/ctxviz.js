/* 經營室的畫：星圖、膠囊眼睛、數字滾動、點陣、六格流動、圓環、客人星系。
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
  /* ── 字不疊：r＝[x, y, w, h]。gapOf＞0 是兩塊之間還空多少，≤0 就是疊到了。
     fadeIn：離最近的字還有幾 px——貼近的那 6px 裡慢慢淡掉、碰到之前就消失（同一個 t 永遠同一格，不需要記狀態） ── */
  function gapOf(r, q) { return Math.max(q[0] - (r[0] + r[2]), r[0] - (q[0] + q[2]), q[1] - (r[1] + r[3]), r[1] - (q[1] + q[3])); }
  function roomFor(r, placed) { var g = 1e9; for (var i = 0; i < placed.length; i++) g = Math.min(g, gapOf(r, placed[i])); return g; }
  function fadeIn(r, placed, pad) { return clamp((roomFor(r, placed) - (pad == null ? 2 : pad)) / 6); }
  /* 字太長就收成「…」，量得進 maxW */
  function fitText(ctx, s, maxW) { s = String(s || ''); if (ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
  /* 小的時候：圖上只留點與臉，標籤收成底下的一行字。回傳那一行的範圍（沒畫就回 null） */
  function captionLine(ctx, x, y, w, h, text, ink, bg) {
    if (!text) return null;
    ctx.save(); ctx.font = '500 11px ' + FONT; var s = fitText(ctx, text, w - 24), tw = ctx.measureText(s).width, X = x + w / 2, Y = y + h - 11;
    ctx.globalAlpha = .92; ctx.fillStyle = bg; rr(ctx, X - tw / 2 - 7, Y - 8.5, tw + 14, 17, 8.5); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, X, Y + .5);
    ctx.restore(); return [X - tw / 2 - 7, Y - 8.5, tw + 14, 17];
  }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }   // 千分位：163,643
  /* 打散得更均勻的雜湊（連號的字串不會排成一條線）；客人星系的散點用 */
  function hash2(s) { var h = Math.round(hash(s) * 4294967295) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; }

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
    // 靜止時看向一邊（右上），不是置中的兩條直線；32px 以下的直膠囊改圓豆，縮小了也還是眼睛
    eyes(ctx, x + size / 2, y + size * .5, size * .36, t, { col: o.col || '#FFFFFF', state: o.state, look: o.look || [.62, -.34], seed: o.seed, style: size < 32 && (!o.style || o.style === 'capsule') ? 'round' : o.style });
    ctx.restore();
  }

  /* ── 星圖（你的星圖）：小二知道的每一件事是一顆點 ──
     o.stats：右上角的點數與轉角、右下角的 SCALE（英文儀表，產品畫面不放；影片要用就開）
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
  /* o（v13.2 加的）：rotT＝轉動用的時鐘（滑鼠停在球上時產品讓它停下；不給就用 t）、frontHot＝六格不繞，有洞的那幾格固定在前面、
     face(ctx, cx, cy, size, t, look)＝中間畫小二的臉（不給就畫眼睛）、flash＝{di, at}：剛記下的那一件事，在點旁邊寫 1.2 秒 */
  function constellation(ctx, x, y, w, h, t, g, o) {
    o = o || {}; var S = o.accent ? Object.assign({}, THEME.stage, { accent: o.accent }) : THEME.stage, R = Math.min(w, h) * (o.radius || .31), cx = x + w * (o.cx || .5), cy = y + h * (o.cy || .5);
    var rt = o.rotT == null ? t : o.rotT, ang = (o.rot0 || 0) + rt * (o.rot == null ? 7 : o.rot) * Math.PI / 180, tilt = (o.tilt == null ? -16 : o.tilt) * Math.PI / 180, f = 3.6;
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
    var slotOf = NODES.map(function (n, i) { return i; });
    if (o.frontHot) {   // 六格固定不繞：有洞的格坐在最前面的位置（看得清楚、點得到），其他照順序坐剩下的
      var pos = NODES.map(function (n, i) { return i; }).sort(function (a, b) { return Math.sin(b / 6 * TAU + (o.orbit0 || 0)) - Math.sin(a / 6 * TAU + (o.orbit0 || 0)); });
      var hotFirst = NODES.map(function (n, i) { return i; }).sort(function (a, b) { var ha = /leak|hole/.test(((g.hubs || {})[NODES[a]] || {}).st || '') ? 0 : 1, hb2 = /leak|hole/.test(((g.hubs || {})[NODES[b]] || {}).st || '') ? 0 : 1; return ha - hb2 || a - b; });
      hotFirst.forEach(function (ni, k) { slotOf[ni] = pos[k]; });
    }
    var hubs = NODES.map(function (name, i) {
      var a = slotOf[i] / 6 * TAU + (o.frontHot ? 0 : rt * (o.orbit == null ? .07 : o.orbit)) + (o.orbit0 || 0), pt = orbitPt(a);
      return { name: name, st: ((g.hubs || {})[name] || {}).st || 'unknown', at: ((g.hubs || {})[name] || {}).at, pt: pt, a: a };
    });
    /* 照尺寸分三層（R＝球的半徑，px）：
       full（R≥95）六格是一顆顆膠囊、角落寫圖例；mid（52–95）六格只寫字、不包膠囊，圖例收成「N 件事」；
       mini（＜52）六格只剩點（有洞的是強調色），圖上不寫字，標籤收成底下一行。o.lod 可以指定。
       不管哪一層，字都先排好位置：跟臉、角落的字、別的格的字太近就淡掉、碰到之前就收成點 */
    var tier = o.lod || (R >= 95 ? 'full' : R >= 52 ? 'mid' : 'mini'), narrow = w < 600, m = 18;
    var hotOf = function (hb) { return hb.st === 'leak' || hb.st === 'hole'; };
    var dots = g.dots || [], cnt = { said: 0, data: 0, web: 0, est: 0 };
    dots.forEach(function (d) { if (t >= (d.born == null ? -99 : d.born)) { var kk = d.src === 'calc' || d.src === 'youest' ? 'est' : d.src; if (cnt[kk] != null) cnt[kk]++; } });
    var total = cnt.said + cnt.data + cnt.web + cnt.est, deg = ((ang * 180 / Math.PI) % 360 + 360) % 360;
    var fsz = R * .46 * (o.eyeScale || 1), faceR = fsz * .36, placed = [], hud = null;
    var room = function (r) { var nx = clamp(cx, r[0], r[0] + r[2]), ny = clamp(cy, r[1], r[1] + r[3]); return Math.min(fadeIn(r, placed), clamp((Math.hypot(nx - cx, ny - cy) - faceR - 1) / 6)); };   // 臉是圓的：量到圓邊
    if (o.hud !== false && tier !== 'mini') {
      ctx.font = '500 10.5px ' + MONO; hud = { title: (g.title || '你的星圖') + (g.sign && g.sign.name ? '  ・  ' + g.sign.name : ''), legend: [] };
      hud.tx = x + m + 22; hud.ty = y + m + 11; placed.push([hud.tx - 2, hud.ty - 11, ctx.measureText(hud.title).width + 4, 14]);
      if (o.stats) { hud.stat = 'N ' + String(total).padStart(3, '0') + (narrow ? '' : '   ↻ ' + deg.toFixed(1) + '°'); var sw = ctx.measureText(hud.stat).width; placed.push([x + w - m - 22 - sw - 2, hud.ty - 11, sw + 4, 14]); }
      var lx = x + m + (narrow ? 4 : 22), ly = y + h - m - (narrow ? 22 : 4), items = tier === 'full' ? [['said', '你說的'], ['data', '你的資料'], ['web', '查到的'], ['est', '估的']] : [];
      var lw0 = items.reduce(function (a, k) { return a + 12 + ctx.measureText(k[1] + ' ' + cnt[k[0]]).width + (narrow ? 10 : 16); }, 0);
      if (!items.length || lx + lw0 > x + w - m - 4) { items = []; hud.legend.push({ s: total + ' 件事', x: lx, y: ly }); placed.push([lx - 2, ly - 11, ctx.measureText(total + ' 件事').width + 4, 14]); }   // 放不下四種：只寫總數
      items.forEach(function (k) { var s = k[1] + ' ' + cnt[k[0]], sw2 = 12 + ctx.measureText(s).width; hud.legend.push({ k: k[0], s: s, x: lx, y: ly }); placed.push([lx - 2, ly - 11, sw2 + 4, 14]); lx += sw2 + (narrow ? 10 : 16); });
      if (!narrow && o.stats) { hud.scale = 'SCALE ' + (g.loop || 1) + ' · ' + (g.step || 'S'); var scw = ctx.measureText(hud.scale).width; placed.push([x + w - m - 22 - scw - 2, y + h - m - 15, scw + 4, 14]); }
    }
    // 六格的字：有洞的先排、越前面的越先排
    hubs.slice().sort(function (a, b) { return (hotOf(b) - hotOf(a)) || (Math.sin(b.a) - Math.sin(a.a)); }).forEach(function (hb) {
      hb.la = 0; if (tier === 'mini' || (tier === 'mid' && !hb.pt.front && !hotOf(hb))) return;   // mid：球後面的格只留點（字會被球上的點蓋住）
      var r;
      if (tier === 'full') { hb.kind = 'pill'; hb.hs = (o.hubScale || 1) * (hb.pt.front ? 1 : .88); ctx.font = '600 ' + Math.round(14 * hb.hs) + 'px ' + FONT; var pw = ctx.measureText(hb.name).width + 26 * hb.hs, ph = 28 * hb.hs; r = [hb.pt.x - pw / 2, hb.pt.y - ph / 2, pw, ph]; }
      else { hb.kind = 'text'; ctx.font = '600 11px ' + FONT; var tw = ctx.measureText(hb.name).width; r = [hb.pt.x - tw / 2 - 5, hb.pt.y - 8, tw + 10, 16]; }
      var edge = Math.min(r[0] - x, x + w - r[0] - r[2], r[1] - y, y + h - r[1] - r[3]);   // 跑出畫布的字也收起來
      hb.la = Math.min(room(r), clamp((edge - 2) / 6)); if (o.frontHot && hb.la > 0) hb.la = 1;   // 六格不轉時位置固定：寫或不寫，不停在半透明
      if (hb.la > 0) placed.push(r);
    });
    function drawHub(hb) {
      var isHot = hotOf(hb), later = hb.st === 'later' || hb.st === 'unknown', depthA = hb.pt.front ? 1 : .55, pop = 1, X = hb.pt.x, Y = hb.pt.y, ring = (t * .75 + (hb.name === '找客' ? 0 : .5)) % 1;
      if (hb.at != null && t >= hb.at) pop = 1 + .32 * (1 - spring(t, hb.at, { w: 11, z: .42 }));
      ctx.save(); var base = depthA * (later ? .7 : 1);
      if (hb.la < 1) {   // 字收起來（或正在淡掉）的時候，那一格是軌道上的一顆點
        var dr = (tier === 'mini' ? 2.6 : 3.2) * pop; ctx.globalAlpha = base * (1 - hb.la);
        if (isHot) { ctx.strokeStyle = S.accent; ctx.lineWidth = 1; ctx.globalAlpha = base * (1 - hb.la) * (1 - ring) * .85; ctx.beginPath(); ctx.arc(X, Y, dr + ring * 8, 0, TAU); ctx.stroke(); ctx.globalAlpha = base * (1 - hb.la); }
        ctx.beginPath(); ctx.arc(X, Y, dr, 0, TAU); ctx.fillStyle = isHot ? S.accent : S.bg; ctx.fill();
        if (!isHot) { ctx.lineWidth = 1.2; ctx.strokeStyle = later ? S.ink3 : S.ink2; ctx.stroke(); }
      }
      if (hb.la > 0 && hb.kind === 'pill') {
        var hs = hb.hs * pop; ctx.globalAlpha = base * hb.la; ctx.font = '600 ' + Math.round(14 * hs) + 'px ' + FONT;
        var tw = ctx.measureText(hb.name).width, pw = tw + 26 * hs, ph = 28 * hs;
        if (isHot) { ctx.strokeStyle = S.accent; ctx.lineWidth = 1; ctx.globalAlpha = depthA * hb.la * (1 - ring) * .85; rr(ctx, X - pw / 2 - ring * 12, Y - ph / 2 - ring * 12, pw + ring * 24, ph + ring * 24, ph); ctx.stroke(); ctx.globalAlpha = depthA * hb.la; }
        rr(ctx, X - pw / 2, Y - ph / 2, pw, ph, ph / 2); ctx.fillStyle = isHot ? S.accent : S.bg; ctx.fill();
        if (!isHot) { ctx.lineWidth = 1; ctx.strokeStyle = later ? S.ink3 : S.ink2; ctx.stroke(); }
        ctx.fillStyle = isHot ? '#0C0C0D' : later ? S.ink2 : S.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hb.name, X, Y + .5);
      } else if (hb.la > 0) {   // mid：只寫字，底下墊一塊舞台色，軌道線不穿過字
        ctx.font = '600 11px ' + FONT; var tw2 = ctx.measureText(hb.name).width;
        ctx.globalAlpha = hb.la * .9; ctx.fillStyle = S.bg; rr(ctx, X - tw2 / 2 - 5, Y - 8, tw2 + 10, 16, 8); ctx.fill();
        ctx.globalAlpha = base * hb.la; ctx.fillStyle = isHot ? S.accent : later ? S.ink2 : S.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hb.name, X, Y + .5);
      }
      ctx.restore();
    }
    hubs.filter(function (hb) { return !hb.pt.front; }).forEach(drawHub);
    // 球：結構點＋坐在上面的資料點。結構點跟著件數長（一開始約 60 點，每多一件事多 6 點，最多 560），看得出球在長大。
    // 每一點的位置由它的 id 決定、先來的先坐，新的點進來時舊的點不會移動
    var dots = g.dots || [], n = dots.length, M = Math.max(o.shell != null ? o.shell : Math.min(560, 60 + n * 6), n * 3), shell = fib(M), slot = {}, pts = [];
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
      var lk = o.look || null; if (hoverXY) lk = [clamp((hoverXY[0] - cx) / R, -1, 1), clamp((hoverXY[1] - cy) / R, -1, 1)];
      ctx.save(); ctx.globalAlpha = 1;
      if (o.face) o.face(ctx, cx, cy, R * .46 * (o.eyeScale || 1), t, lk);
      else eyes(ctx, cx, cy, R * .24 * (o.eyeScale || 1), t, { col: S.ink, state: o.state || 'idle', look: lk || [.6, -.34], seed: 3, style: o.eyeStyle });
      ctx.restore();
    }
    var drawn = [];
    pts.forEach(function (it) {
      if (it.p.z > .05) drawEyes();
      var X = cx + it.p.x * R, Y = cy + it.p.y * R, depth = clamp((it.p.z + 1) / 2);
      if (!it.d) {   // 結構點：明寫是結構（很淡、方形小點），資料點才有樣子
        var nearC = Math.hypot(X - cx, Y - cy) / R, fade = it.p.z > 0 ? clamp(nearC * 1.8 - .25, .12, 1) : 1;
        ctx.globalAlpha = (.05 + .22 * depth) * fade; ctx.fillStyle = S.ink; var sz = .8 + .9 * depth; ctx.fillRect(X - sz / 2, Y - sz / 2, sz, sz); return;
      }
      if (it.k <= .001) { ctx.globalAlpha = (.1 + .5 * depth) * .8; ctx.fillStyle = S.ink; ctx.fillRect(X - .6, Y - .6, 1.2, 1.2); return; }
      var src = it.d.src, r = (2.4 + 2.6 * depth) * it.p.s * (o.dotScale || 1) * clamp(R / 120, .5, 1) * (.3 + .7 * it.k), a = (.38 + .62 * depth) * clamp(it.k * 1.4);
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
        if (g.sign.name && sk > .6 && tier === 'full') {   // 星座的名字：右上、左上兩個位置挑一個不壓到字的；都會壓到就不寫（角落的標題已經寫了）
          ctx.font = '600 12.5px ' + FONT; var snw = ctx.measureText(g.sign.name).width, sr = null, sa = 0;
          [[lead.X + 10, lead.Y - 22], [lead.X - 10 - snw, lead.Y - 22], [lead.X + 10, lead.Y + 8]].forEach(function (c) { var r = [c[0] - 2, c[1] - 1, snw + 4, 16], a = room(r); if (a > sa) { sa = a; sr = r; } });
          if (sr) { placed.push(sr); ctx.globalAlpha = clamp((sk - .6) * 2.5) * sa; ctx.fillStyle = S.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(g.sign.name, sr[0] + 2, sr[1] + 8.5); }
        }
        ctx.restore();
      }
    }
    // 滑到某一格：拉線到它的點
    var hh = o.hoverHub ? hubs.filter(function (hb) { return hb.name === o.hoverHub; })[0] : null;
    if (hh) { ctx.strokeStyle = S.accent; ctx.lineWidth = 1; drawn.forEach(function (dd) { if (dd.hub !== hh.name || dd.z < -0.1) return; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(dd.X, dd.Y); ctx.lineTo(hh.pt.x, hh.pt.y); ctx.stroke(); }); ctx.globalAlpha = 1; }
    hubs.filter(function (hb) { return hb.pt.front; }).forEach(drawHub);
    // 小衛星
    var sa = rt * .9, sat = { x: cx + Math.cos(sa) * R * 1.26, y: cy + Math.sin(sa) * R * 1.26 * .78 }, c5 = Math.cos(.5), s5 = Math.sin(.5);
    var sxs = cx + (sat.x - cx) * c5 - (sat.y - cy) * s5, sys = cy + (sat.x - cx) * s5 + (sat.y - cy) * c5; ctx.fillStyle = S.ink2; ctx.beginPath(); ctx.arc(sxs, sys, 3, 0, TAU); ctx.fill();   // 衛星用米灰：橘色的點只代表「估的」
    // 剛記下的那一件事：在點旁邊寫 1.2 秒（淡入、停住、淡出），看得到剛剛被記下的是哪一句
    if (tier !== 'mini' && o.flash && o.flash.at != null && t >= o.flash.at && t - o.flash.at < 1.4) {
      var fd = drawn.filter(function (dd) { return dd.di === o.flash.di; })[0], fdot = dots[o.flash.di];
      if (fd && fdot) {
        var fl = t - o.flash.at, fa = fl < .3 ? fl / .3 : fl > 1.05 ? Math.max(0, (1.4 - fl) / .35) : 1, txt = String(fdot.label); if (txt.length > 20) txt = txt.slice(0, 19) + '…';
        ctx.save(); ctx.globalAlpha = fa; ctx.font = '500 12px ' + FONT; var fw = ctx.measureText(txt).width + 18, fx = clamp(fd.X + 12, x + 8, x + w - fw - 8), fy = clamp(fd.Y - 30 - (1 - fa) * 4, y + 8, y + h - 30);
        if (roomFor([fx, fy, fw, 24], placed) < 2) { var fy2 = clamp(fd.Y + 10, y + 8, y + h - 30); if (roomFor([fx, fy2, fw, 24], placed) > roomFor([fx, fy, fw, 24], placed)) fy = fy2; }   // 上面壓到六格的字就改寫在點的下面
        ctx.fillStyle = '#FFFFFF'; rr(ctx, fx, fy, fw, 24, 12); ctx.fill(); ctx.fillStyle = '#0B0B0C'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, fx + 9, fy + 12.5);
        ctx.restore();
      }
    }
    if (hoverXY) {
      ctx.strokeStyle = S.ink; ctx.lineWidth = 1; ctx.globalAlpha = .9;
      [[-15, 0, -7, 0], [7, 0, 15, 0], [0, -15, 0, -7], [0, 7, 0, 15]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(hoverXY[0] + l[0], hoverXY[1] + l[1]); ctx.lineTo(hoverXY[0] + l[2], hoverXY[1] + l[3]); ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    if (o.hud !== false && tier !== 'mini') {
      var L = 14; ctx.globalAlpha = 1; ctx.strokeStyle = S.ink2; ctx.lineWidth = 1.2;
      [[x + m, y + m, 1, 1], [x + w - m, y + m, -1, 1], [x + m, y + h - m, 1, -1], [x + w - m, y + h - m, -1, -1]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0], c[1] + c[3] * L); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + c[2] * L, c[1]); ctx.stroke(); });
      ctx.font = '500 10.5px ' + MONO; ctx.fillStyle = S.ink2; ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left'; ctx.fillText(hud.title, hud.tx, hud.ty);
      if (hud.stat) { ctx.textAlign = 'right'; ctx.fillText(hud.stat, x + w - m - 22, hud.ty); }
      ctx.textAlign = 'left';
      hud.legend.forEach(function (lg) {
        ctx.globalAlpha = 1; if (lg.k) { glyph(ctx, lg.k, lg.x + 3.5, lg.y - 3.6, 3.1, S); ctx.fillStyle = S.ink2; ctx.fillText(lg.s, lg.x + 12, lg.y); } else { ctx.fillStyle = S.ink2; ctx.fillText(lg.s, lg.x, lg.y); }
      });
      if (hud.scale) { ctx.textAlign = 'right'; ctx.fillText(hud.scale, x + w - m - 22, y + h - m - 4); }
    }
    // mini：圖上不寫字，收成底下一行（幾件事・最卡的是哪一格）
    var hotNames = hubs.filter(function (hb) { return hb.st === 'leak'; }).map(function (hb) { return hb.name; }), caption = null;
    if (tier === 'mini') {
      caption = total + ' 件事' + (hotNames.length ? '・最卡：' + hotNames.join('、') : '');
      if (o.caption !== false) captionLine(ctx, x, y, w, h, caption, S.ink2, S.bg);
    }
    ctx.restore();
    return { cx: cx, cy: cy, R: R, lod: tier, caption: caption, hoverXY: hoverXY, dots: drawn, hubs: hubs.map(function (hb) { return { name: hb.name, x: hb.pt.x, y: hb.pt.y }; }), pick: function (px, py) {
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
    /* only：只畫這幾格（第幾格，照六格的順序）；沒給就六格都畫。訪談中只畫已經知道的格，沒問過、先不做的不放上路 */
    var ks = o.only && o.only.length ? o.only.slice().sort(function (a, b) { return a - b; }) : [0, 1, 2, 3, 4, 5], nK = ks.length;
    var a0 = vert ? y + h * .08 : x + w * .075, a1 = vert ? y + h * .92 : x + w * .925, gap = nK > 1 ? (a1 - a0) / (nK - 1) : 0;
    if (nK === 1) { a0 = a1 = vert ? y + h / 2 : x + w / 2; gap = vert ? h * .84 : w * .85; }
    var axis = vert ? x + Math.min(w * .22, 70) : y + h * .4, R = vert ? Math.min(gap * .34, 25) : Math.min(h * .2, gap * .3, o.maxR || 31);
    var start = vert ? y : x, len = vert ? h : w, from = o.from || [];   // from[k]：這一格從哪個時間開始漏（影片用；產品不給＝一直都是）
    function at(al, ac) { return vert ? [axis + ac, al] : [al, axis + ac]; }
    ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = P.line2; ctx.beginPath();
    var e0 = at(start, 0), e1 = at(start + len, 0); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.stroke();
    // 客人：固定間隔出發、速度固定；經過洞口時照機率掉出去（同一個 t 永遠同一個畫面）
    var speed = len * (vert ? .13 : .16), every = .34, t0 = o.t0 == null ? -30 : o.t0, nn = Math.floor((t - t0) / every) + 1;
    for (var i = Math.max(0, nn - 70); i < nn; i++) {
      var s = t0 + i * every, age = t - s, al = start + age * speed, ac = 0, a = 1, fell = false;
      for (var j = 0; j < nK; j++) {
        var k = ks[j], st = states[k] || 'unknown', p = st === 'leak' ? .5 : st === 'hole' ? .3 : 0, hx = a0 + j * gap, th = s + (hx - start) / speed;
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
      var pos = ks.indexOf(k);
      var shown = pos < 0 ? 0 : o.show && o.show[k] != null ? spring(t, o.show[k], { w: 12, z: .62 }) : 1;   // show[k]：這一格什麼時候冒出來（影片用）
      if (shown <= .001) { hits.push({ x: 0, y: 0, r: 0 }); continue; }
      var live = from[k] == null || t >= from[k], st2 = live ? states[k] || 'unknown' : 'unknown', c = at(a0 + pos * gap, 0), hot = st2 === 'leak' || st2 === 'hole', dim = st2 === 'later' || st2 === 'unknown', on = o.hover === k;
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

  /* ── 圓環：離目標多遠（Apple 健康那種「一圈＝做到」）。
     value 0..1，可以超過 1（超過的那一段用深一點的顏色再畫一圈）；from → value 用彈簧從 t0 走過去（不給 t0 就直接停在 value）。
     segments：一格一個實體（目標 4 家就切 4 段，60 段以內），做到幾家就亮幾段。
     tick：這一期時間過了多少（0..1），在圈外標一個小刻度，看得出「照時間該到哪裡」。
     nextMark：還沒做到的下一格描強調色外框；pending：按了、等打烊確認的格數（強調色空心段）；paper：卡片底色（外框挖空用）。回傳 true＝還在動。 ── */
  function ring(ctx, cx, cy, r, t, o) {
    o = o || {}; if (!(r > 1)) return false;   // 看不到（寬度是 0）就不畫
    var P = withAccent(THEME[o.theme || 'light'], o), lw = o.width || Math.max(5, r * .15), v = o.value || 0, from = o.from == null ? 0 : o.from;
    var k = o.t0 == null ? 1 : spring(t, o.t0, { w: o.w || 6.2, z: o.z == null ? .86 : o.z }), p = from + (v - from) * k, a0 = -Math.PI / 2;
    var col = o.color || P.ink, track = o.track || P.line, n = o.segments | 0;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = lw;
    var done = clamp(p);
    if (n >= 2 && n <= 60) {
      // 一格一個實體（4 家就是 4 格）：連續的細軌＋每一格一個刻度，做到幾家就畫到哪裡；
      // 還是 0 的時候，下一格用強調色描外框（「下一家」）；pending＝按了成交、還等打烊確認的幾格，畫成強調色空心段
      var seg = TAU / n, thin = Math.max(1.5, lw * .34), fillTo = done;
      ctx.lineWidth = thin; ctx.strokeStyle = track; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      if (fillTo > .002) { ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + TAU * fillTo); ctx.stroke(); }
      var pend = Math.max(0, Math.min(n - Math.round(done * n), o.pending | 0)), k0 = Math.round(done * n);
      for (var q = 0; q < pend; q++) {
        var ps0 = a0 + (k0 + q) * seg + .03, ps1 = a0 + (k0 + q + 1) * seg - .03;
        ctx.lineWidth = lw; ctx.strokeStyle = P.accent; ctx.beginPath(); ctx.arc(cx, cy, r, ps0, ps1); ctx.stroke();
        ctx.lineWidth = Math.max(1, lw - 3.2); ctx.strokeStyle = o.paper || P.surface; ctx.beginPath(); ctx.arc(cx, cy, r, ps0 + .01, ps1 - .01); ctx.stroke();
      }
      if (o.nextMark && done < .999 && !pend) {
        var ns0 = a0 + k0 * seg + .03, ns1 = a0 + (k0 + 1) * seg - .03;
        ctx.lineWidth = lw; ctx.strokeStyle = P.accent; ctx.beginPath(); ctx.arc(cx, cy, r, ns0, ns1); ctx.stroke();
        ctx.lineWidth = Math.max(1, lw - 3.2); ctx.strokeStyle = o.paper || P.surface; ctx.beginPath(); ctx.arc(cx, cy, r, ns0 + .01, ns1 - .01); ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.lineWidth = 1.4;
      for (var k = 0; k < n; k++) {   // 刻度：一格一條，跨過細軌
        var ta0 = a0 + k * seg, ri = r - lw / 2 - 1, ro = r + lw / 2 + 1;
        ctx.strokeStyle = k / n < fillTo - .001 ? (o.paper || P.surface) : P.line2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ta0) * ri, cy + Math.sin(ta0) * ri); ctx.lineTo(cx + Math.cos(ta0) * ro, cy + Math.sin(ta0) * ro); ctx.stroke();
      }
      ctx.lineCap = 'round'; ctx.lineWidth = lw;
    } else {
      ctx.strokeStyle = track; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      if (done > .002) { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + TAU * done); ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(cx, cy - r, lw * .32, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }   // 還是 0：在起點留一顆小點，看得出從哪裡開始
    }
    if (p > 1.002) { ctx.strokeStyle = o.over || P.accentText; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + TAU * Math.min(1, p - 1)); ctx.stroke(); }
    if (o.tick != null && o.tick > 0 && o.tick < 1) {
      var ta = a0 + TAU * o.tick, r1 = r + lw / 2 + 3, r2 = r1 + Math.max(5, lw * .5);
      ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.strokeStyle = o.tickColor || P.ink3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ta) * r1, cy + Math.sin(ta) * r1); ctx.lineTo(cx + Math.cos(ta) * r2, cy + Math.sin(ta) * r2); ctx.stroke();
    }
    ctx.restore();
    return o.t0 != null && (t < o.t0 || Math.abs(p - v) > .0008);
  }

  /* ── 客人星系：中心是店（小二的眼睛），三圈照多久沒來排開——平常會回來 in／開始變少 slip／很久沒來 out；圈外淡淡的是還沒認識的新客。
     每一種客人一個扇區，一點一位；一種客人太多、扇區放不下時，那一種改成一點代表 k 位（回傳 k，畫面要標出來）。
     data = { types:[{name, lane:new|return|exist, n, bands:{in,slip,out}, since:{in:[t,前一次幾點]…}}], start:'new'|'return' }
     o = { theme, accent, t0（第一次看到的時間，點從裡往外一圈一圈長出來）, hover（第幾種）, eyeStyle, look }
     點的位置只跟「第幾種、哪一圈、第幾位」有關，人數變多時舊的點不動，新的點長出來。 ── */
  var BANDS = ['in', 'slip', 'out', 'new'];
  function orbitGeom(w, h, data, o) {
    o = o || {}; var types = data.types || [], nT = Math.max(1, types.length);
    var gap = nT > 1 ? .13 : 0, span = (TAU - gap * nT) / nT, a00 = (nT === 2 ? Math.PI : -Math.PI / 2) - span / 2;   // 兩種客人左右各一半，空隙在正上下，三圈的名字寫在正下方
    var sectors = types.map(function (ty, i) { var a0 = a00 + i * (span + gap); return { i: i, a0: a0, a1: a0 + span, mid: a0 + span / 2 }; });
    // 每一種客人的名字標在扇區外面：先量出名字要佔多少位置，球才不會把字擠出畫布
    var compact = w < 520, labW = 104, top = 6, bot = 6, rMax = Math.min(w, h) / 2 - 4;
    if (!compact) sectors.forEach(function (sc) { var sn = Math.sin(sc.mid), cs = Math.abs(Math.cos(sc.mid)); if (sn < -.7) top = 62; if (sn > .7) bot = 62; if (cs > .3) rMax = Math.min(rMax, (w / 2 - 6 - labW) / cs - 12); });   // 窄的畫面：名字改成貼在扇區外緣的小牌子，球可以大一點
    var R = Math.max(40, Math.min(rMax, (h - top - bot) / 2)), cx = w / 2, cy = top + R + (h - top - bot - 2 * R) / 2;
    var rad = { core: R * .15, in: [R * .19, R * .45], slip: [R * .45, R * .625], out: [R * .625, R * .78], new: [R * .84, R * 1.0] };
    if (o.newOnly) rad.new = [R * .3, R * 1.0];   // 還沒有名單：只有「還沒認識」這一圈，從店外面一路散到邊上，不留三圈空位
    function counts(ty) {
      var c = { in: 0, slip: 0, out: 0, new: 0 }, b = ty.bands;
      if (b) { c.in = b.in || 0; c.slip = b.slip || 0; c.out = b.out || 0; }
      else if (ty.n != null) { c[ty.lane === 'new' ? 'new' : ty.lane === 'return' ? 'out' : 'in'] = ty.n; }
      return c;
    }
    function slots(r0, r1, a0, a1, s, scatter, seed) {
      var out = [], mid = (a0 + a1) / 2, rows = [], r;
      if (r1 - r0 < s * 1.2) rows.push((r0 + r1) / 2); else for (r = r0 + s * .62; r <= r1 - s * .5; r += s) rows.push(r);
      rows.forEach(function (rr0, ri) {   // 一圈一圈從裡往外排，每一圈從扇區中間往兩邊；還沒認識的新客散開像星星
        var m = Math.floor((a1 - a0) * rr0 / s); if (m < 1) return; var da = (a1 - a0) / m;
        for (var j = 0; j < m; j++) {
          var a = a0 + da * (j + .5), rr = rr0;
          if (scatter) { a += (hash(seed + 'a' + ri + ':' + j) - .5) * da * .8; rr += (hash(seed + 'r' + ri + ':' + j) - .5) * s * .7; }
          out.push({ a: a, r: rr, k: scatter ? hash(seed + ':' + ri + ':' + j) : ri * 1000 + Math.abs(a - mid) });
        }
      });
      out.sort(function (p, q) { return p.k - q.k; });
      return out;
    }
    // 還沒認識的新客：在圈外隨機散開（位置只看第幾位，人多了舊的點不動）
    function stars(r0, r1, a0, a1, s, seed) {
      var cap = Math.floor((a1 - a0) / 2 * (r1 * r1 - r0 * r0) / (s * s * 1.5)), out = [];
      for (var j = 0; j < cap; j++) { var u = hash2(seed + 'u' + j), v = hash2(seed + 'v' + j); out.push({ a: a0 + v * (a1 - a0), r: Math.sqrt(r0 * r0 + u * (r1 * r1 - r0 * r0)) }); }
      return out;
    }
    var s0 = clamp(R * .072, 7, 13), sMin = 5.2, need = 1, s = s0, regions = [];
    function plan(sp) {
      var worst = 1; regions = [];
      types.forEach(function (ty, i) {
        var c = counts(ty), sc = sectors[i], ang = sc.a1 - sc.a0, inset = Math.min(.05, ang * .04);
        BANDS.forEach(function (b) { if (!c[b]) return; var rr = rad[b], sl = b === 'new' ? stars(rr[0], rr[1], sc.a0 + inset, sc.a1 - inset, sp, ty.name) : slots(rr[0], rr[1], sc.a0 + inset, sc.a1 - inset, sp, false, ty.name + b); regions.push({ ti: i, band: b, n: c[b], slots: sl }); worst = Math.max(worst, c[b] / Math.max(1, sl.length)); });
      });
      return worst;
    }
    need = plan(s);
    for (var it = 0; it < 6 && need > 1 && s > sMin; it++) { s = Math.max(sMin, s / Math.sqrt(need) * .97); need = plan(s); }   // 先把點縮小擠得下；真的擠不下才一點代表好幾位
    var per = types.map(function () { return 1; });
    regions.forEach(function (rg) { per[rg.ti] = Math.max(per[rg.ti], Math.ceil(rg.n / Math.max(1, rg.slots.length))); });
    var dots = [];
    regions.forEach(function (rg) {
      var k = per[rg.ti], m = Math.min(rg.slots.length, Math.max(1, Math.round(rg.n / k))), ty = types[rg.ti], since = (ty.since || {})[rg.band];
      for (var j = 0; j < m; j++) {
        var sl = rg.slots[j], ring = BANDS.indexOf(rg.band);
        dots.push({ ti: rg.ti, band: rg.band, j: j, x: cx + Math.cos(sl.a) * sl.r, y: cy + Math.sin(sl.a) * sl.r, a: sl.a, r: sl.r, order: ring * 40 + j * (rg.band === 'new' ? .35 : 1), since: since && j >= Math.round(since[1] / k) ? since[0] : null });
      }
    });
    return { cx: cx, cy: cy, R: R, rad: rad, sectors: sectors, per: per, s: s, dots: dots, counts: types.map(counts), compact: compact, newOnly: !!o.newOnly };
  }
  function orbit(ctx, x, y, w, h, t, data, o) {
    o = o || {}; var P = withAccent(THEME[o.theme || 'light'], o), types = data.types || [];
    var key = w + 'x' + h + (o.newOnly ? '|new' : '') + '|' + JSON.stringify(types.map(function (ty) { return [ty.name, ty.lane, ty.n, ty.bands, ty.since]; }));
    /* 照尺寸分三層：full（寬 ≥ 520）名字寫在扇區外面、三圈各寫圈名；mid（窄、R≥90）名字收成小牌子「名字・人數」，圈名放得下才寫；
       mini（R＜90）圖上只留點與臉，名字與人數收成底下一行。o.lod 可以指定 */
    var G = o.cache && o.cache.key === key + '|' + (o.lod || '') ? o.cache.g : null;
    if (!G) { G = orbitGeom(w, h, data, o); var tr = o.lod || (!G.compact ? 'full' : G.R >= 90 ? 'mid' : 'mini'); if (tr === 'mini' && o.caption !== false) G = orbitGeom(w, h - 26, data, o); G.tier = tr; }
    if (o.cache) { o.cache.key = key + '|' + (o.lod || ''); o.cache.g = G; }
    var tier = G.tier;
    var cx = x + G.cx, cy = y + G.cy, R = G.R, hov = o.hover == null ? -1 : o.hover, start = data.start, busy = false;
    ctx.save();
    // 三圈：平常會回來那一圈最實，越往外越淡；最外圈是虛線，再出去就是還沒認識的人
    // newOnly（還沒有名單）：三圈都是空的，不畫；只留一條虛線當「還沒認識」的邊
    if (!G.newOnly) {
      ctx.fillStyle = P.canvas; ctx.globalAlpha = .55; ctx.beginPath(); ctx.arc(cx, cy, G.rad.in[1], 0, TAU); ctx.fill();
      ctx.globalAlpha = .28; ctx.beginPath(); ctx.arc(cx, cy, G.rad.slip[1], 0, TAU); ctx.arc(cx, cy, G.rad.in[1], 0, TAU, true); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1; ctx.strokeStyle = P.line2;
    (G.newOnly ? [R] : [G.rad.in[1], G.rad.slip[1], G.rad.out[1]]).forEach(function (rr, i) { if (i === 2 || G.newOnly) ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); ctx.setLineDash([]); });
    // 扇區之間的分隔：從店往外一條淡線
    if (G.sectors.length > 1) { ctx.strokeStyle = P.line; G.sectors.forEach(function (sc) { var a = sc.a0 - (TAU - (sc.a1 - sc.a0) * G.sectors.length) / G.sectors.length / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * G.rad.core * 1.25, cy + Math.sin(a) * G.rad.core * 1.25); ctx.lineTo(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02); ctx.stroke(); }); }
    // 點：一點一位。平常會回來＝實心墨色，開始變少＝淡一點，很久沒來＝快要看不見；起點那一群用強調色
    var t0 = o.t0 == null ? -99 : o.t0, dr = G.s * .31;
    G.dots.forEach(function (d) {
      var born = Math.max(t0 + d.order * .006 + (d.band === 'new' ? .25 : 0), d.since == null ? -99 : d.since + (d.j % 24) * .025);
      var k = spring(t, born, { w: 11, z: .72 }); if (k <= .002) { busy = true; return; } if (k < .999) busy = true;
      var hot = (start === 'return' && d.band === 'out') || (start === 'new' && d.band === 'new'), a, col, rr = dr;
      if (d.band === 'in') { a = 1; col = P.ink; }
      else if (d.band === 'slip') { a = .5; col = P.ink; }
      else if (d.band === 'out') { a = hot ? 1 : .24; col = hot ? P.accent : P.ink; }
      else { rr = dr * (.62 + .3 * hash2('sz' + d.ti + d.j)); a = hot ? .78 : .45; col = hot ? P.accent : P.ink3; a *= .74 + .26 * Math.sin(t * 1.1 + hash2('tw' + d.ti + d.j) * TAU); }
      if (hov >= 0 && d.ti !== hov) a *= .22;
      ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(d.x + x, d.y + y, rr * (.35 + .65 * k), 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // 中間是店：墨色圓、白色眼睛（眼睛看著滑到的那一種客人）
    var core = G.rad.core, lk = o.look || [0, 0];
    if (hov >= 0 && G.sectors[hov]) lk = [Math.cos(G.sectors[hov].mid) * .9, Math.sin(G.sectors[hov].mid) * .9];
    if (o.face) o.face(ctx, cx, cy, core * 2.3, t, hov >= 0 ? lk : null);   // 中間是小二（他訂製的那一隻）
    else { ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(cx, cy, core, 0, TAU); ctx.fill(); eyes(ctx, cx, cy, core * .62, t, { col: P.surface, state: o.state || 'idle', look: hov >= 0 ? lk : [.6, -.34], seed: 5, style: o.eyeStyle }); }
    // 先排每一種客人的名字（小牌子或扇區外的三行字），再排三圈的圈名：圈名碰到名字、碰到臉、圈太窄放不下，就不寫
    var placed = [[cx - core * 1.05, cy - core * 1.05, core * 2.1, core * 2.1]], typeLabs = [], caption = null;
    var countOf = function (ty) { return ty.n != null ? ty.n : ty.bands ? (ty.bands.in || 0) + (ty.bands.slip || 0) + (ty.bands.out || 0) : null; };
    if (tier !== 'mini') G.sectors.forEach(function (sc, i) {
      var ty = types[i], c = Math.cos(sc.mid), sn = Math.sin(sc.mid), lr = R + (Math.abs(sn) > .7 ? 16 : 12), X = cx + c * lr, Y = cy + sn * lr, cn = countOf(ty), u = ty.unit || '位';
      if (G.compact) {   // 小牌子：附近的公司・80 家（一點不只一位時，第二行寫出來）
        var nm2 = String(ty.name || ''); if (nm2.length > 6) nm2 = nm2.slice(0, 6);
        var l1 = cn == null ? nm2 : nm2 + '・' + num(cn) + ' ' + u, l2 = G.per[i] > 1 ? '一點＝' + num(G.per[i]) + ' ' + u : '';
        ctx.font = '650 12px ' + FONT; var tw = Math.max(ctx.measureText(l1).width, l2 ? (ctx.font = '500 10px ' + MONO, ctx.measureText(l2).width) : 0) + 16, th = l2 ? 34 : 22;
        var PX = cx + c * R * .9, PY = cy + sn * R * .9;
        PX = Math.max(x + tw / 2 + 2, Math.min(x + w - tw / 2 - 2, PX)); PY = Math.max(y + th / 2 + 2, Math.min(y + h - th / 2 - 2, PY));
        var rc = [PX - tw / 2, PY - th / 2, tw, th], la = fadeIn(rc, placed, 1); if (la > 0) placed.push(rc);
        typeLabs.push(function () {
          if (la <= 0) return;
          ctx.globalAlpha = (hov >= 0 && hov !== i ? .4 : 1) * la; ctx.fillStyle = P.surface; rr(ctx, rc[0], rc[1], tw, th, 11); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = P.line2; ctx.stroke();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.ink; ctx.font = '650 12px ' + FONT; ctx.fillText(l1, PX, PY + (l2 ? -6 : .5));
          if (l2) { ctx.font = '500 10px ' + MONO; ctx.fillStyle = P.ink3; ctx.fillText(l2, PX, PY + 9); }
        });
        return;
      }
      var al = c > .3 ? 'left' : c < -.3 ? 'right' : 'center', dy = sn < -.7 ? -9 : sn > .7 ? 9 : 0;
      // 名字前面的編號跟旁邊小卡同一套（01／02／03，小方塊裡的等寬數字），不用英文字母
      var no = (i < 9 ? '0' : '') + (i + 1), NB = 18, NG = 7;
      var lines = [[String(ty.name || ''), '650 13.5px ' + FONT, P.ink]]; if (cn != null) lines.push([num(cn) + ' ' + u, '500 11px ' + MONO, P.ink3]);   // 人數不知道就只寫名字
      if (G.per[i] > 1) lines.push(['一點＝' + num(G.per[i]) + ' ' + u, '500 11px ' + MONO, P.ink3]);
      var lw2 = 0; lines.forEach(function (l, k) { ctx.font = l[1]; lw2 = Math.max(lw2, ctx.measureText(l[0]).width + (k ? 0 : NB + NG)); });
      var X2 = al === 'left' ? Math.min(X, x + w - 4 - lw2) : al === 'right' ? Math.max(X, x + 4 + lw2) : Math.max(x + 4 + lw2 / 2, Math.min(x + w - 4 - lw2 / 2, X));   // 字不出畫布
      var y0 = Y + dy - 8 - (lines.length > 2 && sn < -.7 ? 16 : 0);
      var rf = [al === 'left' ? X2 : al === 'right' ? X2 - lw2 : X2 - lw2 / 2, y0 - NB / 2, lw2, NB / 2 + (lines.length > 1 ? 17 + (lines.length - 2) * 15 + 7 : NB / 2)];
      placed.push(rf);
      typeLabs.push(function () {
        ctx.globalAlpha = hov >= 0 && hov !== i ? .35 : 1; ctx.textAlign = al; ctx.textBaseline = 'middle';
        lines.forEach(function (l, k) {
          var ly = y0 + (k ? 17 + (k - 1) * 15 : 0);
          ctx.font = l[1]; ctx.fillStyle = l[2];
          if (k) { ctx.fillText(l[0], X2, ly); return; }
          var tw1 = ctx.measureText(l[0]).width, all = NB + NG + tw1, sx = al === 'left' ? X2 : al === 'right' ? X2 - all : X2 - all / 2;
          ctx.save();
          ctx.fillStyle = P.canvas; rr(ctx, sx, ly - NB / 2, NB, NB, 5); ctx.fill();
          ctx.textAlign = 'center'; ctx.fillStyle = P.ink2; ctx.font = '600 10.5px ' + MONO; ctx.fillText(no, sx + NB / 2, ly + .5);
          ctx.textAlign = 'left'; ctx.fillStyle = l[2]; ctx.font = l[1]; ctx.fillText(l[0], sx + NB + NG, ly);
          ctx.restore();
        });
      });
    });
    // 三圈的名字寫在扇區之間的空隙（沒有空隙就寫在正下方），底下墊一塊紙色，線不會穿過字
    if (tier !== 'mini') {
      var ga = Math.PI / 2;
      if (G.sectors.length > 1) { var best = 9; G.sectors.forEach(function (sc) { var a = sc.a1 + (TAU - (sc.a1 - sc.a0) * G.sectors.length) / G.sectors.length / 2, d = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))); if (d < best) { best = d; ga = a; } }); }
      ctx.font = '500 ' + (G.compact ? 10 : 11) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      (G.newOnly ? [['還沒認識', R * .62, R]] : [['平常會回來', G.rad.in[0], G.rad.in[1]], ['開始變少', G.rad.slip[0], G.rad.slip[1]], ['很久沒來', G.rad.out[0], G.rad.out[1]], ['還沒認識', G.rad.new[0], G.rad.new[1]]]).forEach(function (lb) {
        if (lb[2] - lb[1] < 13) return;   // 這一圈比字還窄：不寫
        var rad = (lb[1] + lb[2]) / 2, X = cx + Math.cos(ga) * rad, Y = cy + Math.sin(ga) * rad, tw = ctx.measureText(lb[0]).width + 10, r = [X - tw / 2, Y - 8, tw, 16], a = fadeIn(r, placed, 1);
        if (a <= 0) return; placed.push(r);
        ctx.globalAlpha = a; ctx.fillStyle = P.surface; rr(ctx, r[0], r[1], tw, 16, 8); ctx.fill();
        ctx.fillStyle = P.ink3; ctx.fillText(lb[0], X, Y + .5);
      });
    }
    typeLabs.forEach(function (f) { f(); });
    if (tier === 'mini') {   // 底下一行：附近的公司 80・訂過的公司 18（放不下就寫先從哪一群開始，再放不下就只寫幾種客人）
      ctx.font = '500 11px ' + FONT; caption = types.map(function (ty) { var cn = countOf(ty); return String(ty.name || '') + (cn == null ? '' : ' ' + num(cn)); }).join('・');
      var st0 = types.filter(function (ty) { return start && ty.lane === start; })[0];
      if (ctx.measureText(caption).width > w - 24 && st0) { var c0 = countOf(st0); caption = '先從' + st0.name + (c0 == null ? '' : '・' + num(c0) + ' ' + (st0.unit || '位')) + (types.length > 1 ? '・另 ' + (types.length - 1) + ' 種' : ''); }   // 放不下全部：寫先從哪一群開始
      if (ctx.measureText(caption).width > w - 24) { var tot = types.reduce(function (a, ty) { return a + (countOf(ty) || 0); }, 0); var u0 = (types[0] || {}).unit || '位', same = types.every(function (ty) { return (ty.unit || '位') === u0; }); caption = types.length + ' 種客人' + (same ? '・' + num(tot) + ' ' + u0 : ''); }
      if (o.caption !== false) captionLine(ctx, x, y, w, h, caption, P.ink2, P.surface);
    }
    ctx.globalAlpha = 1; ctx.restore();
    return { busy: busy, cx: cx, cy: cy, R: R, lod: tier, caption: caption, per: G.per, sectors: G.sectors, pick: function (px, py) {
      var dx = px - cx, dy = py - cy, dd = Math.hypot(dx, dy); if (dd < G.rad.core || dd > R * 1.25) return -1;
      var a = Math.atan2(dy, dx); for (var i = 0; i < G.sectors.length; i++) { var sc = G.sectors[i], aa = a; while (aa < sc.a0) aa += TAU; while (aa > sc.a0 + TAU) aa -= TAU; if (aa <= sc.a1 + .06) return i; } return -1;
    } };
  }

  /* ── 小二的臉：有 companion.js 就畫他訂製的那一隻（臉型、本命色、眼睛），沒有就退回本命色方塊＋看向一邊的眼睛。
     cx, cy＝臉的中心；size＝邊長；o = { cfg（XiaoerCompanion 的外觀，先 normalize 好）, keys（表情的時間表）, look, expr, theme, reduce } ── */
  function face(ctx, cx, cy, size, t, o) {
    o = o || {}; var X = global.XiaoerCompanion;
    if (X && X.frame) {
      var keys = o.keys || [[-99, { expr: o.expr || 'idle', look: o.look || undefined }]];
      X.frame(ctx, o.cfg || {}, t, { px: size, x: cx - size / 2, y: cy - size * 26 / 48, theme: o.theme || 'stage', keys: keys, reduce: !!o.reduce });
      return;
    }
    var H = hue((o.cfg || {}).hue); ctx.save(); rr(ctx, cx - size * .36, cy - size * .36, size * .72, size * .72, size * .24); ctx.fillStyle = H.accent; ctx.fill();
    eyes(ctx, cx, cy, size * .25, t, { col: H.on, state: o.expr === 'happy' ? 'happy' : 'idle', look: o.look || [.62, -.34], seed: 3, style: (o.cfg || {}).eyes });
    ctx.restore();
  }

  /* ── 要複製的成功（日常第一屏的主體）：中間是小二（點陣的腦＋他訂製的臉），往外三圈是像那一型客人的真實對象。
     由內往外：座位（這一期要多的那幾家，虛線＝還空著）→ 訂過的（右邊一段弧，照多久沒來由實到淡）→ 附近的（一點一家）。
     每一點是真的一家（地圖、名單、目標讀得到的）；沒有名字的點是「有這麼多家」的計數，圖例會明寫。做了一件事，那一點就往內亮起來。
     G = { near:[{id, name, short, keys:[[秒, 等級]…]}]（等級 0 附近的、1 先挑的、2 聯絡過、3 拿到窗口、4 成了）,
           past:[{id, band:'in'|'slip'|'out', name, keys}], seats:[{lane, angle（度）, fill:{from, ring, idx, t}|null, label, pend}],
           seatGroups:[{idx:[…], label}], brain:{dots, sign}, contactTarget, contactTargetLabel, pastLabel, nearLabel }
     o = { built（第一次畫出來的秒數）, gaze:{ids:[{ring, i}], at, look0, label, sub}, hover:{ring, i}, happyAt, rotT, accent,
           face(ctx, cx, cy, size, t, look, happy)（中間的臉；不給就畫眼睛） }
     回傳 { hits:[{kind, i, x, y, r}], g（幾何）, look（臉現在看的方向） }。 ── */
  function lerp(a, b, k) { return a + (b - a) * k; }
  function portraitGeom(w, h, G) {
    var R = Math.min(w, h) / 2 - 4, cx = w / 2, cy = h / 2;
    var g = { cx: cx, cy: cy, R: R, rc: R * .29, rs: R * .445, rr: R * .63, rn: R * .885, compact: w < 440 };
    var a0 = 120 / 180 * Math.PI, span = 300 / 180 * Math.PI, N = Math.max(1, G.near.length);
    g.a0 = a0; g.span = span;
    g.near = function (i) { var a = a0 + (i + .5) / N * span; return { a: a, x: cx + Math.cos(a) * g.rn, y: cy + Math.sin(a) * g.rn }; };
    var P = G.past.length, dA = Math.min((g.compact ? 12.5 : 15) / g.rr, (106 / 180 * Math.PI) / Math.max(1, P));
    g.pastA = function (j) { return -((P - 1) / 2) * dA + j * dA; };
    g.past = function (j) { var a = g.pastA(j); return { a: a, x: cx + Math.cos(a) * g.rr, y: cy + Math.sin(a) * g.rr }; };
    g.seat = function (k) { var a = (G.seats[k] || {}).angle / 180 * Math.PI || 0; return { a: a, x: cx + Math.cos(a) * g.rs, y: cy + Math.sin(a) * g.rs }; };
    g.tick = function (i) { return a0 + i / N * span; };
    return g;
  }
  function companyDot(ctx, X, Y, L, S, o) {
    o = o || {}; var A = o.alpha == null ? 1 : o.alpha, k1 = clamp(L), k2 = clamp(L - 1), k3 = clamp(L - 2), sc = o.scale || 1;
    if (k1 < .99) { ctx.globalAlpha = A * .5 * (1 - k1); ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(X, Y, 1.75 * sc, 0, TAU); ctx.fill(); }
    if (k1 > .01) { ctx.globalAlpha = A * k1; ctx.strokeStyle = S.ink; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(X, Y, 3.6 * sc * (.55 + .45 * k1), 0, TAU); ctx.stroke(); }
    if (k2 > .01) { ctx.globalAlpha = A * k2; ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(X, Y, 3.9 * sc * (.5 + .5 * k2), 0, TAU); ctx.fill(); }
    if (k3 > .01) { ctx.globalAlpha = A * .6 * k3; ctx.strokeStyle = S.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X, Y, 7.2 * sc * (.7 + .3 * k3), 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function pulseRing(ctx, X, Y, t, t0, col, r0) {
    var p = (t - t0) / .95; if (p < 0 || p > 1) return;
    ctx.globalAlpha = (1 - p) * .7; ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(X, Y, (r0 || 4) + p * 15, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function levelAt(keys, t) { return keys && keys.length ? springTo(t, keys, { w: 8.5, z: .9 }) : 0; }
  function lastRise(keys, t) { var at = -99; for (var i = 1; i < (keys || []).length; i++) if (keys[i][0] <= t && keys[i][1] > keys[i - 1][1]) at = keys[i][0]; return at; }
  function hudCorners(ctx, X, Y, s, k, col) {
    var o = s + 3 * (1 - k), L = 3.6; ctx.globalAlpha = k; ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(X + c[0] * o, Y + c[1] * (o - L)); ctx.lineTo(X + c[0] * o, Y + c[1] * o); ctx.lineTo(X + c[0] * (o - L), Y + c[1] * o); ctx.stroke(); });
    ctx.globalAlpha = 1;
  }
  /* 字的位置：每一條字給幾個候選位置，照優先順序放；跟已經放好的撞到就試下一個，都撞到又不是必要的就不畫。字底下墊一塊舞台色，線不會穿過字 */
  function placeLabels(ctx, list, w, h, obstacles, bg) {
    var placed = obstacles.slice(), pad = 3, dropped = [];
    function hit(a, b) { return a[0] < b[0] + b[2] + pad && a[0] + a[2] + pad > b[0] && a[1] < b[1] + b[3] + pad && a[1] + a[3] + pad > b[1]; }
    list.sort(function (a, b) { return a.pri - b.pri; }).forEach(function (lb) {
      if (!(lb.alpha > .01)) return;
      var ws = lb.lines.map(function (l) { ctx.font = l.font; return ctx.measureText(l.text).width; }), bw = Math.max.apply(null, ws) + 10, bh = lb.lines.length * 19 - 1, rect = null, al = 'left';
      for (var i = 0; i < lb.cands.length && !rect; i++) {
        var c = lb.cands[i], x0 = c.align === 'right' ? c.x - bw + 5 : c.align === 'center' ? c.x - bw / 2 : c.x - 5;
        x0 = Math.max(4, Math.min(w - bw - 4, x0)); var y0 = Math.max(2, Math.min(h - bh - 2, c.y - bh / 2)), r = [x0, y0, bw, bh];
        if (!placed.some(function (q) { return hit(q, r); })) { rect = r; al = c.align; }
      }
      if (!rect && lb.must) {   // 必要的字：在每個候選位置上下各挪 14、28px 再試一次；還是會壓到別的字就不畫（交給底下那一行），字不疊
        [14, -14, 28, -28, 42, -42].forEach(function (dy) { for (var j = 0; j < lb.cands.length && !rect; j++) { var c = lb.cands[j], x0 = c.align === 'right' ? c.x - bw + 5 : c.align === 'center' ? c.x - bw / 2 : c.x - 5; x0 = Math.max(4, Math.min(w - bw - 4, x0)); var r2 = [x0, Math.max(2, Math.min(h - bh - 2, c.y + dy - bh / 2)), bw, bh]; if (!placed.some(function (q) { return hit(q, r2); })) { rect = r2; al = c.align; } } });
      }
      if (!rect) { dropped.push(lb); return; }
      placed.push(rect);
      ctx.save();
      lb.lines.forEach(function (l, k) {
        var tw = ws[k], yy = rect[1] + 9 + k * 19, tx = al === 'right' ? rect[0] + rect[2] - 5 - tw : al === 'center' ? rect[0] + (rect[2] - tw) / 2 : rect[0] + 5;
        ctx.fillStyle = bg; ctx.globalAlpha = lb.alpha * .9; rr(ctx, tx - 5, yy - 9, tw + 10, 18, 9); ctx.fill();
        ctx.globalAlpha = lb.alpha; ctx.font = l.font; ctx.fillStyle = l.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(l.text, tx, yy + .5);
      });
      ctx.restore();
    });
    return dropped;
  }
  function radial(g, a, r, align) { return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r, align: align || (Math.cos(a) < -.35 ? 'right' : Math.cos(a) > .35 ? 'left' : 'center') }; }
  /* 小二的腦：點陣球。有樣子的點＝小二知道的一件事（照出處），極小的方點是球的結構；臉在球的中間（前半球靠近臉的點讓開）；本命星座用強調色連起來 */
  function brainBall(ctx, cx, cy, r, t, g, o) {
    o = o || {}; var S = o.S || THEME.stage, rt = o.rotT == null ? t : o.rotT, ang = rt * 8 * Math.PI / 180 + .6, tilt = -18 * Math.PI / 180, f = 3.4;
    var dots = g.dots || [], n = dots.length, M = Math.max(o.shell || Math.min(320, 60 + n * 4), n * 3), shell = fib(M), slot = {}, pts = [], i;
    dots.map(function (d, k) { return { i: k, h: hash(d.id || k) }; }).sort(function (a, b) { return a.h - b.h; })
      .forEach(function (e) { var s = Math.floor(e.h * M) % M; while (slot[s] != null) s = (s + 1) % M; slot[s] = e.i; });
    for (i = 0; i < M; i++) pts.push({ p: project(shell[i], ang, tilt, f), di: slot[i] });
    pts.sort(function (a, b) { return a.p.z - b.p.z; });
    var drawn = [], faceDone = false;
    function drawFace() {
      if (faceDone) return; faceDone = true; ctx.save(); ctx.globalAlpha = 1;
      if (o.face) o.face(ctx, cx, cy, r * 1.08, t, o.look, o.happy);
      else eyes(ctx, cx, cy, r * .5, t, { col: S.ink, state: o.happy ? 'happy' : 'idle', look: o.look || [.62, -.34], seed: 3, style: o.eyeStyle });
      ctx.restore();
    }
    pts.forEach(function (it) {
      if (it.p.z > .05) drawFace();
      var X = cx + it.p.x * r, Y = cy + it.p.y * r, depth = clamp((it.p.z + 1) / 2), nearC = Math.hypot(X - cx, Y - cy) / r;
      var fade = it.p.z > 0 ? clamp(nearC * 2.4 - .9, .02, 1) : 1;
      if (it.di == null) { ctx.globalAlpha = (.05 + .3 * depth) * fade; ctx.fillStyle = S.ink; var sz = .7 + .8 * depth; ctx.fillRect(X - sz / 2, Y - sz / 2, sz, sz); return; }
      var d = dots[it.di], rad = (1.2 + 1.5 * depth) * it.p.s * clamp(r / 55, .6, 1);   // 腦小的時候點也小，不糊成一團
      ctx.globalAlpha = (.28 + .72 * depth) * fade; glyph(ctx, d.src, X, Y, rad, S);
      drawn.push({ X: X, Y: Y, z: it.p.z, di: it.di });
    });
    drawFace(); ctx.globalAlpha = 1;
    if (g.sign && g.sign.stars && g.sign.stars.length > 1) {
      var by = {}; drawn.forEach(function (d) { by[d.di] = d; });
      var st = g.sign.stars.map(function (k) { return by[k]; }).filter(Boolean), sk = g.sign.at == null ? 1 : clamp((t - g.sign.at) / 1.4), upto = sk * (st.length - 1);
      ctx.save(); ctx.strokeStyle = S.accent; ctx.lineWidth = .95; ctx.lineCap = 'round';
      for (i = 0; i < st.length - 1 && i < upto; i++) { var A = st[i], B = st[i + 1], f2 = Math.min(1, upto - i); ctx.globalAlpha = (A.z + B.z) / 2 > 0 ? .62 : .2; ctx.beginPath(); ctx.moveTo(A.X, A.Y); ctx.lineTo(A.X + (B.X - A.X) * f2, A.Y + (B.Y - A.Y) * f2); ctx.stroke(); }
      st.forEach(function (d, k) { if (k > upto + .01) return; ctx.globalAlpha = d.z > 0 ? 1 : .35; ctx.beginPath(); ctx.arc(d.X, d.Y, 3.4, 0, TAU); ctx.stroke(); });
      if (g.sign.name && o.signOut && sk > .6) {   // 名字交給外面排（排在球外、不壓到別的字）
        var ld = st.reduce(function (a, b) { return b.z > a.z ? b : a; }, st[0]);
        drawn.sign = { name: g.sign.name, a: Math.atan2(ld.Y - cy, ld.X - cx), alpha: clamp((ld.z + .2) * 3) * clamp((sk - .6) * 2.5) };
      } else if (g.sign.name && !o.compact && !o.noSign && sk > .6) {
        var lead = st.reduce(function (a, b) { return b.z > a.z ? b : a; }, st[0]);
        ctx.globalAlpha = clamp((lead.z + .2) * 3) * clamp((sk - .6) * 2.5); ctx.font = '600 11.5px ' + FONT; ctx.fillStyle = S.accent; ctx.textAlign = lead.X > cx ? 'left' : 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(g.sign.name, lead.X + (lead.X > cx ? 9 : -9), lead.Y - 8);
      }
      ctx.restore();
    }
    return drawn;
  }
  function portrait(ctx, x, y, w, h, t, G, o) {
    /* 照尺寸分三層（R＝外圈半徑，px）：full（R≥150）每一條字都寫；mid（92–150）只留數字與圈名（附近的、訂過的、座位那幾組），
       今天要碰的那一家收成底下一行；mini（＜92）只留點與小二的臉，字全部收成底下一行。o.lod 可以指定 */
    o = o || {}; var S = o.accent ? Object.assign({}, THEME.stage, { accent: o.accent }) : THEME.stage, g = portraitGeom(w, h, G), hits = [], p, L, labels = [];
    var tier = o.lod || (g.R >= 150 ? 'full' : g.R >= 92 ? 'mid' : 'mini');
    if (tier !== 'full' && o.caption !== false) { g = portraitGeom(w, h - 26, G); g.compact = true; }   // 底下留一行的位置
    var cmp = g.compact;
    var fs = function (n) { return cmp ? Math.max(9.5, n - 1) : n; };
    ctx.save(); ctx.translate(x, y);
    var built = o.built == null ? -99 : o.built, grow = function (d) { return spring(t, built + d, { w: 9, z: .86 }); };
    // 三圈的軌道（座位那圈是虛線）
    ctx.lineWidth = 1; ctx.strokeStyle = S.ink3;
    ctx.globalAlpha = .55 * grow(0); ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rn, 0, TAU); ctx.stroke();
    if (G.past.length) { ctx.globalAlpha = .36 * grow(.05); ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rr, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = .6 * grow(.1); ctx.setLineDash([1.5, 4.5]); ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rs, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    // 這一期要聯絡幾家：外圈上一根刻度
    if (G.contactTarget && G.contactTarget < G.near.length) {
      var ta = g.tick(G.contactTarget), r1 = g.rn + 7, r2 = g.rn + 15;
      ctx.globalAlpha = grow(.2); ctx.strokeStyle = S.ink2; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(ta) * r1, g.cy + Math.sin(ta) * r1); ctx.lineTo(g.cx + Math.cos(ta) * r2, g.cy + Math.sin(ta) * r2); ctx.stroke();
      ctx.globalAlpha = 1; var inA = Math.cos(ta) < -.3 ? 'left' : Math.cos(ta) > .3 ? 'right' : 'center';
      if (G.contactTargetLabel) labels.push({ pri: 4, alpha: grow(.2), lines: [{ text: G.contactTargetLabel, font: '500 ' + fs(10.5) + 'px ' + MONO, fg: S.ink2 }], cands: [radial(g, ta, g.rn - 18, inA), radial(g, ta - .09, g.rn - 18, inA), radial(g, ta + .09, g.rn - 18, inA), radial(g, ta, g.rn - 36, inA)] });
    }
    var seatOf = {}; G.seats.forEach(function (s, k) { if (s.fill && s.fill.from) seatOf[s.fill.from] = { k: k, t: s.fill.t }; });
    // 附近的：一點一家
    G.near.forEach(function (d, i2) {
      p = g.near(i2); L = levelAt(d.keys, t); var a = grow(.08 + i2 * .006); if (a <= .002) return;
      var sf = seatOf[d.id];
      if (sf && t >= sf.t) { ctx.globalAlpha = .5 * a; ctx.strokeStyle = S.ink2; ctx.setLineDash([1.2, 2.2]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      else companyDot(ctx, p.x, p.y, L, S, { alpha: a, scale: cmp ? .85 : 1 });
      pulseRing(ctx, p.x, p.y, t, lastRise(d.keys, t), S.ink, 4);
      hits.push({ kind: 'near', i: i2, x: p.x, y: p.y, r: 8 });
    });
    // 訂過的：右邊一段弧（平常會回來＝實心、開始變少＝淡、很久沒來＝虛線圈；問過了就填起來）
    G.past.forEach(function (d, j) {
      p = g.past(j); var a2 = grow(.12 + j * .012); if (a2 <= .002) return; L = levelAt(d.keys, t);
      var sf2 = seatOf[d.id]; if (sf2 && t >= sf2.t) { ctx.globalAlpha = .5 * a2; ctx.strokeStyle = S.ink2; ctx.setLineDash([1.2, 2.2]); ctx.beginPath(); ctx.arc(p.x, p.y, 3.3, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; hits.push({ kind: 'past', i: j, x: p.x, y: p.y, r: 8 }); return; }
      var asked = clamp(L - 1), rad = cmp ? 2.9 : 3.3;
      if (d.band === 'in' || d.band === 'slip') { ctx.globalAlpha = a2 * (d.band === 'in' ? .92 : .42); ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.fill(); }
      else {
        ctx.globalAlpha = a2 * (.6 + .4 * asked); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.2; ctx.setLineDash(asked > .5 ? [] : [1.6, 1.9]); ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (asked > .01) { ctx.globalAlpha = a2 * asked; ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(p.x, p.y, rad * asked, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1; pulseRing(ctx, p.x, p.y, t, lastRise(d.keys, t), S.ink, 4);
      hits.push({ kind: 'past', i: j, x: p.x, y: p.y, r: 8 });
    });
    if (G.past.length && G.pastLabel) {
      var aTop = g.pastA(0) - (cmp ? .2 : .17), aBot = g.pastA(G.past.length - 1) + (cmp ? .2 : .17);
      labels.push({ pri: 3, alpha: grow(.3), lines: [{ text: G.pastLabel, font: '500 ' + fs(10.5) + 'px ' + MONO, fg: S.ink2 }], cands: [radial(g, aTop, g.rr, 'center'), radial(g, aBot, g.rr, 'center'), radial(g, 0, g.rr + 18, 'left')] });
    }
    // 座位：這一期要多的幾家；成了的點從原來的位置飛進來，變強調色；按了成交、還沒打烊確認的畫強調色虛線圈
    (G.seatGroups || []).forEach(function (sg, gi) {
      if (sg.idx.length < 1) return; var aa = sg.idx.map(function (k) { return G.seats[k].angle / 180 * Math.PI; }), lo = Math.min.apply(null, aa) - .17, hi = Math.max.apply(null, aa) + .17;
      ctx.globalAlpha = .7 * grow(.15 + gi * .05); ctx.strokeStyle = S.ink3; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.rs, lo, hi); ctx.stroke(); ctx.globalAlpha = 1;
    });
    G.seats.forEach(function (s, k) {
      var q = g.seat(k), a3 = grow(.18 + k * .04), sr = cmp ? 8.5 : 10; if (a3 <= .002) return;
      ctx.globalAlpha = a3; ctx.fillStyle = S.bg; ctx.beginPath(); ctx.arc(q.x, q.y, sr, 0, TAU); ctx.fill(); ctx.globalAlpha = a3 * .85; ctx.strokeStyle = s.pend ? S.accent : S.ink2; ctx.lineWidth = s.pend ? 1.5 : 1.1; ctx.setLineDash([2, 2.4]); ctx.beginPath(); ctx.arc(q.x, q.y, sr, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (s.pend) {
        var pk = s.pend.t == null ? 1 : spring(t, s.pend.t, { w: 9, z: .8 });
        ctx.globalAlpha = a3 * pk; ctx.strokeStyle = S.accent; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q.x, q.y, (cmp ? 5 : 5.8) * pk, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        if (s.label) labels.push({ pri: 1, must: true, name: s.label + '・待打烊確認', alpha: a3 * pk, lines: [{ text: s.label, font: '600 ' + fs(11.5) + 'px ' + FONT, fg: S.ink }, { text: '待打烊確認', font: '500 ' + fs(10) + 'px ' + MONO, fg: S.accent }], cands: [radial(g, q.a, g.rs + (cmp ? 22 : 26)), radial(g, q.a - .25, g.rs + 26), radial(g, q.a + .25, g.rs + 26)] });
      } else if (s.fill && t >= s.fill.t - .001) {
        var from = s.fill.from ? (s.fill.ring === 'past' ? g.past(s.fill.idx) : g.near(s.fill.idx)) : q, kf = s.fill.from ? spring(t, s.fill.t, { w: 6.5, z: .84 }) : 1;
        var X = lerp(from.x, q.x, kf), Y = lerp(from.y, q.y, kf);
        if (kf < .995 && s.fill.from) { ctx.globalAlpha = .35 * (1 - kf); ctx.strokeStyle = S.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(X, Y); ctx.stroke(); }
        ctx.globalAlpha = a3; ctx.fillStyle = S.accent; ctx.beginPath(); ctx.arc(X, Y, cmp ? 5.6 : 6.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        if (kf > .9) pulseRing(ctx, q.x, q.y, t, s.fill.t + .55, S.accent, 7);
        if (s.label && kf > .6) labels.push({ pri: 1, must: true, name: s.label, alpha: clamp((kf - .6) * 2.5), lines: [{ text: s.label, font: '600 ' + fs(11.5) + 'px ' + FONT, fg: S.ink }], cands: [radial(g, q.a, g.rs + (cmp ? 15 : 17)), radial(g, q.a - .22, g.rs + 17), radial(g, q.a + .22, g.rs + 17), radial(g, q.a, g.rs + 33)] });
      }
      hits.push({ kind: 'seat', i: k, x: q.x, y: q.y, r: 11 });
    });
    (G.seatGroups || []).forEach(function (sg) {
      var ks = sg.idx.map(function (k) { return g.seat(k); }); if (!ks.length || !sg.label) return;
      var am = Math.atan2(ks.reduce(function (a, q) { return a + Math.sin(q.a); }, 0), ks.reduce(function (a, q) { return a + Math.cos(q.a); }, 0)), lr = g.rs + (cmp ? 19 : 22);
      labels.push({ pri: 2, alpha: grow(.35), lines: [{ text: sg.label, font: '500 ' + fs(10.5) + 'px ' + MONO, fg: S.ink2 }], cands: [radial(g, am, lr, 'center'), radial(g, am, lr + 15, 'center'), radial(g, am - .25, lr, 'center'), radial(g, am + .25, lr, 'center')] });
    });
    // 視線：從臉拉一條細線到今天要碰的那幾家，四角取景框框住；名字寫在圈內側
    var gz = o.gaze || null, look = null;
    function posOf(ref) {
      if (!ref) return null;
      if (ref.ring === 'near' && G.near[ref.i]) { var sf3 = seatOf[G.near[ref.i].id]; if (sf3 && t >= sf3.t) return Object.assign({ seat: true }, g.seat(sf3.k)); return g.near(ref.i); }
      if (ref.ring === 'past' && G.past[ref.i]) { var sf4 = seatOf[G.past[ref.i].id]; if (sf4 && t >= sf4.t) return Object.assign({ seat: true }, g.seat(sf4.k)); return g.past(ref.i); }
      if (ref.ring === 'seat' && G.seats[ref.i]) return Object.assign({ seat: true }, g.seat(ref.i));
      return null;
    }
    if (gz && gz.ids && gz.ids.length) {
      var pts = gz.ids.map(posOf).filter(Boolean), kk = spring(t, gz.at + .08, { w: 8, z: 1 });
      if (pts.length) {
        var mx = 0, my = 0; pts.forEach(function (q2) { mx += q2.x; my += q2.y; }); mx /= pts.length; my /= pts.length;
        var lk = [clamp((mx - g.cx) / (g.R * .8), -1, 1), clamp((my - g.cy) / (g.R * .8), -1, 1)], l0 = gz.look0 || [.62, -.34], ks = spring(t, gz.at, { w: 9, z: .82 });
        look = [lerp(l0[0], lk[0], ks), lerp(l0[1], lk[1], ks)];
        pts.forEach(function (q2) {
          var dx = q2.x - g.cx, dy = q2.y - g.cy, dd = Math.hypot(dx, dy) || 1, ux = dx / dd, uy = dy / dd;
          var sx = g.cx + ux * g.rc * 1.06, sy = g.cy + uy * g.rc * 1.06, ex = q2.x - ux * 11, ey = q2.y - uy * 11;
          ctx.globalAlpha = .55; ctx.strokeStyle = S.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lerp(sx, ex, kk), lerp(sy, ey, kk)); ctx.stroke(); ctx.globalAlpha = 1;
          hudCorners(ctx, q2.x, q2.y, 10, kk, S.ink);
        });
        if (gz.label && kk > .3 && !pts[0].seat) {
          var am2 = Math.atan2(my - g.cy, mx - g.cx), dm = Math.hypot(mx - g.cx, my - g.cy), al = Math.cos(am2) < -.2 ? 'left' : Math.cos(am2) > .2 ? 'right' : 'center', lines = [{ text: gz.label, font: '600 ' + fs(12.5) + 'px ' + FONT, fg: S.ink }];
          if (gz.sub) lines.push({ text: gz.sub, font: '500 ' + fs(10.5) + 'px ' + MONO, fg: S.ink2 });
          labels.push({ pri: 0, must: true, name: gz.label + (gz.sub ? '  ' + gz.sub : ''), alpha: clamp((kk - .3) * 2), lines: lines, cands: [radial(g, am2, dm - (cmp ? 32 : 40), al), radial(g, am2 + .16, dm - (cmp ? 34 : 44), al), radial(g, am2 - .16, dm - (cmp ? 34 : 44), al), radial(g, am2, dm - (cmp ? 54 : 64), al), radial(g, am2, dm + 26)] });
        }
      }
    }
    if (o.hover) { var hp = posOf(o.hover); if (hp) { look = [clamp((hp.x - g.cx) / (g.R * .8), -1, 1), clamp((hp.y - g.cy) / (g.R * .8), -1, 1)]; hudCorners(ctx, hp.x, hp.y, 11, 1, S.accent); } }
    if (G.nearLabel) labels.push({ pri: 2, must: true, alpha: grow(.25), lines: [{ text: G.nearLabel, font: '500 ' + fs(10.5) + 'px ' + MONO, fg: S.ink2 }], cands: [{ x: g.cx, y: g.cy + g.rn, align: 'center' }] });
    var happy = o.happyAt != null && t - o.happyAt >= 0 && t - o.happyAt < 1.6;
    var bd = brainBall(ctx, g.cx, g.cy, g.rc, t, G.brain || {}, { S: S, look: look, happy: happy, face: o.face, compact: cmp, noSign: true, signOut: tier === 'full', rotT: o.rotT, shell: tier === 'mini' ? 140 : cmp ? 220 : null });
    bd.forEach(function (d) { if (d.z > -.1) hits.push({ kind: 'fact', i: d.di, x: d.X, y: d.Y, r: 5 }); });
    var rb = g.rc * 1.08;
    if (bd.sign && bd.sign.alpha > .01) { var sa = bd.sign.a; labels.push({ pri: 5, alpha: bd.sign.alpha, lines: [{ text: bd.sign.name, font: '600 ' + fs(11.5) + 'px ' + FONT, fg: S.accent }], cands: [radial(g, sa, rb + 16), radial(g, sa - .35, rb + 16), radial(g, sa + .35, rb + 16)] }); }   // 星座的名字寫在腦的外面
    // 字：full 全寫；mid 只留數字與圈名；mini 不寫。收起來的那一家（今天要碰的、剛成的）寫在底下一行
    var named = labels.filter(function (lb) { return lb.name && lb.alpha > .01; }).sort(function (a, b) { return a.pri - b.pri; }), caption = null;
    if (tier === 'mid') labels = labels.filter(function (lb) { return !lb.name; }); else if (tier === 'mini') labels = [];
    var dropped = placeLabels(ctx, labels, w, h, [[g.cx - rb, g.cy - rb, rb * 2, rb * 2]], S.bg);
    if (tier !== 'full') caption = named.length ? named[0].name : tier === 'mini' ? G.nearLabel || null : null;
    else { var lost = dropped.filter(function (lb) { return lb.name; })[0]; if (lost) caption = lost.name; }
    if (caption && o.caption !== false && tier !== 'full') captionLine(ctx, 0, 0, w, h, caption, S.ink, S.bg);   // full 沒留那一行的位置：排不下的名字只回傳給外面
    ctx.restore();
    return { hits: hits, g: g, look: look, lod: tier, caption: caption };
  }

  /* ── 一天的時間軸：開門 → 01 02 03 → 打烊，標出現在的位置。
     D = { from, to（幾點到幾點）, open:{at, sub}, close:{at, sub}（at 是小時，例如 8.5）, items:[{at, n:'01', st:'todo'|'done'|'skip', next}],
           now（小時，可省）, nowLabel, free:[從, 到]（有空的時段，可省）, freeLabel }
     o = { stage（深色舞台上）, accent, theme }。回傳每一件的位置 [{i, x, y, r}]（點了捲到那一張卡）。 ── */
  function dayline(ctx, x, y, w, h, t, D, o) {
    o = o || {}; var T = o.stage ? THEME.stage : THEME[o.theme || 'light'], P = { ink: T.ink, ink2: T.ink2, ink3: T.ink3, line: o.stage ? T.line : T.line2, bg: o.stage ? T.bg : T.surface, accent: o.accent || T.accent };
    var narrow = w < 480, padL = narrow ? 20 : 30, padR = narrow ? 20 : 30, x0 = x + padL, x1 = x + w - padR, span = Math.max(1, D.to - D.from);
    var X = function (hh) { return x0 + clamp((hh - D.from) / span) * (x1 - x0); }, ty = y + Math.round(Math.max(54, h * .56)), hits = [];
    ctx.save(); ctx.textBaseline = 'middle';
    if (D.free && D.free[1] > D.free[0]) {   // 有空的時段：一段淡底
      var fx0 = X(D.free[0]), fx1 = X(D.free[1]); ctx.fillStyle = P.ink; ctx.globalAlpha = o.stage ? .09 : .05; rr(ctx, fx0, ty - 15, fx1 - fx0, 30, 15); ctx.fill(); ctx.globalAlpha = 1;
    }
    var nx = D.now != null && D.now >= D.from && D.now <= D.to ? X(D.now) : null;
    ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    if (nx != null) { ctx.strokeStyle = P.ink2; ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(nx, ty); ctx.stroke(); }
    ctx.strokeStyle = P.ink3; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(nx != null ? nx : x0, ty); ctx.lineTo(x1, ty); ctx.stroke(); ctx.setLineDash([]);
    // 小時刻度
    ctx.lineWidth = 1; ctx.strokeStyle = P.ink3;
    for (var hh = Math.ceil(D.from); hh <= Math.floor(D.to); hh++) { var tx = X(hh); ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(tx, ty - 3); ctx.lineTo(tx, ty + 3); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // 現在：一根細線＋時間
    if (nx != null && D.nowLabel) {
      ctx.font = '600 ' + (narrow ? 10.5 : 11) + 'px ' + MONO; var nw = ctx.measureText(D.nowLabel).width + 14, nyy = y + 2, npx = clamp(nx - nw / 2, x + 2, x + w - nw - 2);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(nx, nyy + 18); ctx.lineTo(nx, ty - 9); ctx.stroke();
      ctx.fillStyle = P.ink; rr(ctx, npx, nyy, nw, 18, 9); ctx.fill(); ctx.fillStyle = P.bg; ctx.textAlign = 'center'; ctx.fillText(D.nowLabel, npx + nw / 2, nyy + 9.5);
    }
    // 記號：開門、每一件、打烊。字往上（名字／編號）、往下（時間、小字），撞到就往旁邊推
    var marks = [];
    if (D.open) marks.push({ kind: 'run', at: D.open.at, top: D.open.label || '開門', time: D.open.time, sub: D.open.sub });
    (D.items || []).forEach(function (it, i) { if (it.at != null) marks.push({ kind: 'item', i: i, at: it.at, top: it.n, time: it.time, st: it.st, next: it.next }); });
    if (D.close) marks.push({ kind: 'run', at: D.close.at, top: D.close.label || '打烊', time: D.close.time, sub: D.close.sub });
    marks.sort(function (a, b) { return a.at - b.at; });
    var fTop = '600 ' + (narrow ? 11.5 : 12.5) + 'px ', fTime = '500 ' + (narrow ? 10 : 11) + 'px ' + MONO;
    marks.forEach(function (m) {
      m.x = X(m.at); ctx.font = (m.kind === 'item' ? fTop + MONO : fTop + FONT); m.tw = ctx.measureText(m.top || '').width; ctx.font = fTime; m.bw = Math.max(ctx.measureText(m.time || '').width, m.sub ? ctx.measureText(m.sub).width : 0); m.lw = Math.max(m.tw, m.bw) + (narrow ? 6 : 10);
    });
    function spread(key) {   // 標籤的中心：照時間排，太近就往右推，超出右邊再整串往左
      var c = marks.map(function (m) { return m.x; });
      for (var i = 1; i < marks.length; i++) { var need = (marks[i - 1][key] + marks[i][key]) / 2; if (c[i] - c[i - 1] < need) c[i] = c[i - 1] + need; }
      var over = c.length ? c[c.length - 1] + marks[marks.length - 1][key] / 2 - (x + w - 4) : 0;
      if (over > 0) for (var j = c.length - 1; j >= 0; j--) { c[j] -= over; if (j && c[j] - c[j - 1] >= (marks[j - 1][key] + marks[j][key]) / 2) break; over = j ? Math.max(0, (marks[j - 1][key] + marks[j][key]) / 2 - (c[j] - c[j - 1])) : 0; }
      for (var k = 0; k < c.length; k++) c[k] = Math.max(x + 4 + marks[k][key] / 2, c[k]);
      return c;
    }
    var cTop = spread('lw'), cBot = cTop;
    marks.forEach(function (m, k) {
      var X0 = m.x, lx = cTop[k], next = m.kind === 'item' && m.next, done = m.st === 'done', skip = m.st === 'skip';
      if (m.kind === 'run') { ctx.fillStyle = P.bg; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X0, ty, 6, 0, TAU); ctx.fill(); ctx.stroke(); }
      else {
        if (next) { var ph = (t * .8) % 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.globalAlpha = (1 - ph) * .85; ctx.beginPath(); ctx.arc(X0, ty, 8 + ph * 10, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.beginPath(); ctx.arc(X0, ty, 7.5, 0, TAU); ctx.fillStyle = done ? P.ink : P.bg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = next ? P.accent : skip ? P.ink3 : P.ink; ctx.stroke();
        if (next) { ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(X0, ty, 3.4, 0, TAU); ctx.fill(); }
        if (done) { ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X0 - 3.2, ty + .2); ctx.lineTo(X0 - .8, ty + 2.6); ctx.lineTo(X0 + 3.4, ty - 2.4); ctx.stroke(); }
        if (skip) { ctx.strokeStyle = P.ink3; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X0 - 4, ty + 4); ctx.lineTo(X0 + 4, ty - 4); ctx.stroke(); }
        hits.push({ i: m.i, x: X0, y: ty, r: 14 });
      }
      if (Math.abs(lx - X0) > 2) { ctx.strokeStyle = P.ink3; ctx.lineWidth = 1; ctx.globalAlpha = .6; ctx.beginPath(); ctx.moveTo(X0, ty - 9); ctx.lineTo(lx, ty - 16); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.textAlign = 'center';
      ctx.font = m.kind === 'item' ? fTop + MONO : fTop + FONT; var tw2 = ctx.measureText(m.top || '').width; ctx.fillStyle = P.bg; ctx.fillRect(lx - tw2 / 2 - 3, ty - 32, tw2 + 6, 16);
      ctx.fillStyle = next ? P.accent : m.kind === 'item' && skip ? P.ink3 : P.ink; ctx.fillText(m.top || '', lx, ty - 24);
      ctx.font = fTime; ctx.fillStyle = P.ink2; if (m.time) ctx.fillText(m.time, cBot[k], ty + 20);
      if (m.sub) { ctx.fillStyle = P.ink3; ctx.fillText(m.sub, cBot[k], ty + 35); }
    });
    ctx.restore();
    return hits;
  }

  /* 產品端：把畫布接上真實時間（看不到就不畫；系統要求減少動態就只畫一格）。onSeen：第一次進到畫面時通知。
     lazy：畫完回傳 false（不在動）就先停，等 wake() 或尺寸改變再畫——圓環這種會停下來的東西不用每一格都畫 */
  function animate(canvas, draw, opt) {
    opt = opt || {};
    var ctx = canvas.getContext('2d'), raf = 0, visible = true, seen = false, t0 = performance.now(), io = null, ro = null, rect;
    function size() { var r = canvas.getBoundingClientRect(), d = Math.min(2, global.devicePixelRatio || 1); canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d)); ctx.setTransform(d, 0, 0, d, 0, 0); return r; }
    var reduced = false; try { reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    function paint(t) { ctx.clearRect(0, 0, rect.width, rect.height); return draw(ctx, rect.width, rect.height, t); }
    function frame(now) {
      raf = 0; if (!visible || document.hidden) { raf = global.requestAnimationFrame(frame); return; }
      var busy = paint((now - t0) / 1000);
      if (!opt.lazy || busy) raf = global.requestAnimationFrame(frame);
    }
    function wake() { if (!reduced && !raf) raf = global.requestAnimationFrame(frame); }
    rect = size(); paint(reduced ? 4 : 0);   // 先畫一格：靜止時也是完整的畫面
    if (!reduced) raf = global.requestAnimationFrame(frame);
    if ('IntersectionObserver' in global) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) wake(); if (visible && !seen) { seen = true; if (opt.onSeen && !reduced) { opt.onSeen((performance.now() - t0) / 1000); wake(); } } }, { threshold: opt.threshold || 0 });
      io.observe(canvas);
    }
    var onResize = function () { var r = canvas.getBoundingClientRect(); if (Math.abs(r.width - rect.width) < .5 && Math.abs(r.height - rect.height) < .5) return; rect = size(); paint(reduced ? 4 : (performance.now() - t0) / 1000); wake(); };
    if ('ResizeObserver' in global) { ro = new ResizeObserver(onResize); ro.observe(canvas); } else global.addEventListener('resize', onResize);
    return { stop: function () { global.cancelAnimationFrame(raf); raf = -1; if (io) io.disconnect(); if (ro) ro.disconnect(); else global.removeEventListener('resize', onResize); }, redraw: function () { paint(reduced ? 4 : (performance.now() - t0) / 1000); }, wake: function () { if (raf !== -1) wake(); }, now: function () { return (performance.now() - t0) / 1000; } };
  }

  global.CtxViz = { THEME: THEME, HUES: HUES, hue: hue, FONT: FONT, MONO: MONO, NODES: NODES, spring: spring, springTo: springTo, clamp: clamp, rr: rr, hash: hash, hash2: hash2, glyph: glyph, eyes: eyes, appIcon: appIcon, constellation: constellation, odometer: odometer, odoWidth: odoWidth, dotMatrix: dotMatrix, dotRows: dotRows, pipeline: pipeline, ring: ring, orbit: orbit, orbitGeom: orbitGeom, animate: animate, face: face, portrait: portrait, portraitGeom: portraitGeom, companyDot: companyDot, dayline: dayline };
})(typeof window !== 'undefined' ? window : this);
