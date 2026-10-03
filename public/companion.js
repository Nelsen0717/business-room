/* companion.js：你的小二（畫法、掛載、調整器）v2，2026-10-02 17:00 簡化
   ──────────────────────────────────────────────────────────────────────────
   給畫面代理與外殼代理：載入順序 ctxviz.js → companion.js；樣式 companion.css。
   本命色只讀 CtxViz.HUES（accent＝臉、on＝眼睛），這裡不另存一份。
   數字照 docs/brand/小二/小二的樣子.md（參考實作 docs/brand/小二/xiaoer.js；tests/companion.test.mjs 逐項對過）。
   小二不戴配件（10/2 17:00 拿掉 acc、art）：長相只有本命色、臉型、眼睛。

   名詞：「外觀」（look）＝一個物件，欄位直接對 companion_view：
     { name, call, tone, voice, hello, hue, eyes, face, follow, blink, rev, by, seed }
     也收地圖的樣子 { persona: {hue, eyes}, companion: {...} }。缺的、不合格的欄位一律換成預設；舊格式的 acc、art 不看。
   「視線」（gaze）＝ [x, y]，−1…1，右、下為正。「表情」（expr）＝ idle 平常｜you 看你｜name 看名字｜
     listen 在聽｜think 在想｜happy 開心（眨眼是事件，用 blink()／taps）。
   靜止的畫面（減少動態、paint）一律照品牌規範往右上看：不管傳了什麼視線，都換回「平常」的眼神與歪頭（settle；開心的彎眼除外），
     所以任何靜止畫面都不會是置中、等高、平行的兩條膠囊。

   ── 純函數（影片、測試、伺服器端截圖都能直接呼叫；同一個 t 永遠畫出同一格；隨機只用固定種子的整數雜湊）──
   XiaoerCompanion.normalize(look)                 → 外觀（cfg）。名字 1–6 字、稱呼 1–8 字…，不合格換預設
   XiaoerCompanion.pose(cfg, t, keys, reduce, taps)→ {lx, ly, sy, wide, roll, happy, blink, breath, nod, drift}
       keys＝[[秒數, {expr, look?}], …] 照時間排好；taps＝手動眨眼的時間點；reduce＝減少動態（停在最後一個 key 的終點）
   XiaoerCompanion.settle(P)                       → 靜止用的姿勢：眼神與歪頭換回「平常」往右上看（開心的彎眼不動）
   XiaoerCompanion.draw(ctx, cfg, P, {px, x, y})   畫一格：px＝邊長（像素）
   XiaoerCompanion.frame(ctx, look, t, {px, x, y, keys, taps, reduce, gaze, expr})
       上面兩個合在一起。沒給 keys 時：expr（預設 idle）＋gaze（有給才用）當唯一的 key。reduce 時先過 settle。
       影片：每一格呼叫 frame(ctx, look, 影格秒數, {px:640, keys})。
   XiaoerCompanion.paint(canvas, look, {size, expr, gaze, t})  靜態畫進一個 <canvas>（處理高解析螢幕；一律過 settle）
   XiaoerCompanion.lookToward(rect, px, py)        → {look, weight} 或 null（游標太遠）
   XiaoerCompanion.prune(keys, t)                  丟掉已經走完的 key，結果不變
   XiaoerCompanion.LOOKS                           調整器的六個樣子：[{face, eyes, name}]，臉型 × 眼睛挑好看的六個
   XiaoerCompanion.lookIndex(look)                 → 這個外觀是六個樣子的第幾個，不在裡面回 −1
   XiaoerCompanion.SAY                             調整器下方三句「直接跟它說」的話
   ── v14 照片樣子（skin: photo）：小二那一格換成他家的狗。照片裁進圓框、外圈一圈本命色細邊；動態照同一組時間函數
     （呼吸、跟著看、點頭、飄、開心＝輕跳一下＋外圈變粗），照片眨不了眼就不眨；靜止與減少動態時整張歪 −6 度。
     照片從 GET /api/asset?f=<作品/…> 讀（photoBase 可換）；讀不到（不見、檔頭不對、被擋）就自己畫回原本的小二。
   XiaoerCompanion.photoStatus(file)               → 'none'｜'loading'｜'ok'｜'bad'
   XiaoerCompanion.onPhoto(fn)                     照片讀好或讀不到時通知（回傳取消用的函式）
   XiaoerCompanion.usePhoto(file, image|null)      直接交一張圖（影片、測試用）；null＝當作讀不到
   XiaoerCompanion.photoGeom(cfg, P)               照片樣子的幾何（48 格）：圓框、外圈、整顆頭與照片各挪多少
   XiaoerCompanion.sayText(name, line)             → 要複製到對話的那一句（「阿福，叫我老闆就好。」）
   XiaoerCompanion.tunerPayload(saved, cur)        → 存檔要送的 {companion:{…, by:'owner', rev}, hue?, eyes?}；沒改回 null

   ── 掛載（產品畫面用）──
   var x = XiaoerCompanion.mount(el, look, { size?, expr?:'idle', seed?, label?, reduce? })
     在 el 裡放一個 <canvas>（大小＝size，沒給就跟 el 的寬一樣、ResizeObserver 跟著變）。
     預設表情是「平常」（往右上看）。會眨眼、呼吸；滑鼠靠近轉頭看（look.follow 為 true 時）；點一下小二＝看你＋眨一下。
     同一頁好幾隻共用一個動畫迴圈；分頁看不見、捲出畫面時不畫；系統「減少動態」時靜止（照 settle），資訊不少。
     x.update(look)           換外觀（立刻畫）
     x.expr(name, holdSec?)   換表情；給 holdSec 就演那麼久再回原本的表情（例：x.expr('happy', 1.6)）
     x.blink()                眨一下（剛轉頭的 0.3 秒內不排，往後挪）
     x.pose()                 現在這一格的數字（除錯、測試用）
     x.destroy()              拆掉 canvas、退出迴圈
     x.canvas                 那個 <canvas>（aria-label＝小二的名字）

   ── 調整器（經營室裡唯一開放輸入的地方）只有四樣：大預覽、名字、本命色八色、一排六個樣子 ──
   var t = XiaoerCompanion.customizer(el, init, { onSave, onCancel?, onSay?, onSaved?, proposal? })
     init＝現在存著的 companion_view（含 hue、eyes、rev）。
     onSave(payload) 收到 tunerPayload() 的結果（只帶改了的欄位；hue、eyes 有改才帶），要回一個 Promise：
         成功 → resolve(伺服器回的 JSON，有 companion 就用它當新的存檔版)
         rev 對不上 → reject({status:409, companion:伺服器回的 companion})：調整器換成最新那一版
         其他失敗 → reject(Error('白話原因'))：選項回到上一次存好的樣子
     onCancel()：按「先不改」（選項先回到存好的樣子）；沒改就按「就這樣」也走這裡。
     onSay(text, name)：按了下方三句之一，text＝要貼進對話的那一句，name＝名字格裡現在的名字（可能還沒存）。
       由外殼複製，回一個 Promise：複製好了 true（調整器在那三句上面寫「複製好了，貼到跟{名字}的對話送出。」）、
       複製不了 false（外殼自己把那一句攤出來）。沒給 onSay 就自己複製到剪貼簿，提示一樣寫在那一行（複製不了就把那一句寫出來）。
       提示一律寫在調整器裡，不浮在畫面上，所以不會蓋住面板的標題。
     onSaved(look)：存好之後，帶新的外觀。
     proposal：「小二提的那一版」；有給、而且跟現在不一樣時，才出現「回到{名字}提的那一版」。
     每改一次，el 上會發一個 'xe-change' 事件（detail＝現在畫面上的外觀），外殼要跟著即時換什麼都可以接它（面板標題不放名字）。
     t.value() 現在畫面上的外觀（存著的欄位＋改了的名字、顏色、樣子）；t.set(look) 從外面換一版；t.destroy()
   ────────────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';
  var CV = root.CtxViz || (typeof require === 'function' ? require('./ctxviz.js').CtxViz : null);
  var G = 48;

  /* ── 顏色：本命色只從 CtxViz.HUES 讀 ── */
  var HUE_KEYS = ['orange', 'coral', 'berry', 'violet', 'indigo', 'teal', 'green', 'mustard'];
  function hues() { return (CV && CV.HUES) || {}; }
  function hueOf(k) {
    var H = hues(), h = H[k] || H.orange;
    if (!h) return { face: '#FF5A1F', eye: '#FFFFFF', name: '橘', soft: '#FFE7DC' };
    return { face: h.accent, eye: h.on, name: h.name, soft: h.soft || '#FFE7DC' };
  }

  /* ── 臉：臉框 x 7–41、y 9–43（34×34），中心 (24, 26) ── */
  function f2(v) { var s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; }
  function squircle(x, y, w, h, R, sm) {
    var budget = Math.min(w, h) / 2; R = Math.min(R, budget);
    var p = Math.min((1 + sm) * R, budget); sm = Math.min(sm, budget / R - 1);
    var am = 90 * (1 - sm), rad = Math.PI / 180;
    var al = Math.sin(am / 2 * rad) * R * Math.SQRT2, alpha = (90 - am) / 2;
    var p34 = R * Math.tan(alpha / 2 * rad), beta = 45 * sm;
    var c = p34 * Math.cos(beta * rad), d = c * Math.tan(beta * rad), b = (p - al - c - d) / 3, a = 2 * b, F = f2;
    return 'M' + F(x + w - p) + ' ' + F(y) +
      'c' + F(a) + ' 0 ' + F(a + b) + ' 0 ' + F(a + b + c) + ' ' + F(d) + 'a' + F(R) + ' ' + F(R) + ' 0 0 1 ' + F(al) + ' ' + F(al) +
      'c' + F(d) + ' ' + F(c) + ' ' + F(d) + ' ' + F(b + c) + ' ' + F(d) + ' ' + F(a + b + c) + 'L' + F(x + w) + ' ' + F(y + h - p) +
      'c0 ' + F(a) + ' 0 ' + F(a + b) + ' ' + F(-d) + ' ' + F(a + b + c) + 'a' + F(R) + ' ' + F(R) + ' 0 0 1 ' + F(-al) + ' ' + F(al) +
      'c' + F(-c) + ' ' + F(d) + ' ' + F(-(b + c)) + ' ' + F(d) + ' ' + F(-(a + b + c)) + ' ' + F(d) + 'L' + F(x + p) + ' ' + F(y + h) +
      'c' + F(-a) + ' 0 ' + F(-(a + b)) + ' 0 ' + F(-(a + b + c)) + ' ' + F(-d) + 'a' + F(R) + ' ' + F(R) + ' 0 0 1 ' + F(-al) + ' ' + F(-al) +
      'c' + F(-d) + ' ' + F(-c) + ' ' + F(-d) + ' ' + F(-(b + c)) + ' ' + F(-d) + ' ' + F(-(a + b + c)) + 'L' + F(x) + ' ' + F(y + p) +
      'c0 ' + F(-a) + ' 0 ' + F(-(a + b)) + ' ' + F(d) + ' ' + F(-(a + b + c)) + 'a' + F(R) + ' ' + F(R) + ' 0 0 1 ' + F(al) + ' ' + F(-al) +
      'c' + F(c) + ' ' + F(-d) + ' ' + F(b + c) + ' ' + F(-d) + ' ' + F(a + b + c) + ' ' + F(-d) + 'Z';
  }
  function smoothClosed(pts) {
    var n = pts.length, s = 'M' + f2(pts[0][0]) + ' ' + f2(pts[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      s += 'C' + f2(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f2(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f2(p2[0]) + ' ' + f2(p2[1]);
    }
    return s + 'Z';
  }
  function beanPath() {
    var pts = [], N = 40, n = 2.25, a = 18.5, b = 15, cx = 24, cy = 26.6;
    for (var i = 0; i < N; i++) {
      var th = i / N * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      var x = a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n), y = b * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n);
      x *= 0.92 + 0.08 * s;
      pts.push([cx + x, cy + y]);
    }
    return smoothClosed(pts);
  }
  var FACES = {
    round: { name: '圓', d: 'M24 9a17 17 0 1 1 0 34a17 17 0 1 1 0-34Z', bottom: 43 },
    bean: { name: '豆子', d: beanPath(), bottom: 42 },
    soft: { name: '方圓', d: squircle(7, 9, 34, 34, 9.5, 0.6), bottom: 43 }
  };
  var FACE_KEYS = ['round', 'bean', 'soft'];

  /* ── 眼睛 ── */
  var EYES = {
    capsule: { name: '直膠囊', w: 5.0, h: 9.0, gap: 9.8 },
    round: { name: '圓豆', w: 6.0, h: 6.0, gap: 10.4 },
    sleepy: { name: '瞇瞇', w: 6.8, h: 3.0, gap: 10.8 }
  };
  var EYE_KEYS = ['capsule', 'round', 'sleepy'];
  var EYE_Y = 25.5;

  /* ── 表情 ── */
  var EXPR = {
    idle: { name: '平常', look: [0.62, -0.34], sy: 1, wide: 1, roll: -6, happy: 0, nod: 0, drift: 0 },
    you: { name: '看你', look: [0, -0.05], sy: 1.06, wide: 1.06, roll: -7, happy: 0, nod: 0, drift: 0 },
    name: { name: '看名字', look: [1, 0.12], sy: 1, wide: 1, roll: 0, happy: 0, nod: 0, drift: 0 },
    listen: { name: '在聽', look: [-0.18, 0.16], sy: 0.74, wide: 1.08, roll: 6, happy: 0, nod: 0.16, drift: 0 },
    think: { name: '在想', look: [-0.52, -0.78], sy: 0.92, wide: 1, roll: -4, happy: 0, nod: 0, drift: 0.22 },
    happy: { name: '開心', look: [0.18, -0.2], sy: 1, wide: 1, roll: -5, happy: 1, nod: 0, drift: 0 }
  };

  /* ── 動態常數（骨架，不開放改）── */
  var MOTION = {
    eyeTravel: [5.6, 5.0], faceTravel: [1.0, 1.2],
    far: { w: 0.34, h: 0.12 }, near: { w: 0.04 }, gapShrink: 0.14,
    spring: { w: 11, z: 0.82 }, lookSpring: { w: 13, z: 0.86 },
    breath: { amp: 0.012, period: 4.6 },
    blinkDur: 0.15, blinkClose: 0.9, doubleGap: 0.24,
    nodPeriod: 1.6, driftPeriod: 3.4,
    follow: { rangeK: 6, rangeMin: 240, rangeMax: 640, fullAt: 0.5, fadeFrom: 0.75, returnAfter: 2.2, returnDelay: 0.15, minStep: 0.04 },
    tapGuard: 0.3,
    hop: { h: 1.6, dur: 0.42 },                      // 開心：整顆頭輕跳一下（48 格的單位、秒）
    photo: { edge: 17, ring: 1.6, ringPx: [1.5, 4], ringHappy: 1.2, happyPx: [1, 3], shift: [1.8, 1.5] }   // 外圈外緣＝圓臉的半徑 17；外圈 1.6 格、換成像素夾在 1.5–4（細邊），開心再粗 1.2 格（1–3 像素）；照片跟著看多挪多少
  };
  var RHYTHM = {
    slow: { name: '慢', P: 6.4, J: 2.0, dbl: 0.10 },
    normal: { name: '平常', P: 4.4, J: 1.6, dbl: 0.22 },
    lively: { name: '活潑', P: 2.9, J: 1.0, dbl: 0.35 }
  };
  var TONES = { warm: '溫暖', brisk: '俐落', playful: '逗趣', steady: '沉穩' };

  /* ── 樣子：臉型 × 眼睛挑六個好看的組合（每種臉、每種眼睛各出現兩次）；第一個是預設 ── */
  var LOOKS = [
    { face: 'round', eyes: 'capsule' },
    { face: 'round', eyes: 'sleepy' },
    { face: 'bean', eyes: 'round' },
    { face: 'bean', eyes: 'capsule' },
    { face: 'soft', eyes: 'round' },
    { face: 'soft', eyes: 'sleepy' }
  ].map(function (x) { x.name = FACES[x.face].name + '臉・' + EYES[x.eyes].name + '眼'; return x; });
  function lookIndex(c) {
    for (var i = 0; i < LOOKS.length; i++) if (c && LOOKS[i].face === c.face && LOOKS[i].eyes === c.eyes) return i;
    return -1;
  }

  /* ── 說話的方式不在調整器裡改：下方三句一按就複製，貼進對話送出 ── */
  var SAY = ['叫我老闆就好', '講話再短一點', '早上先講最重要的一件'];
  function sayText(name, line) { return (name || '小二') + '，' + line + '。'; }

  /* ── 小工具 ── */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function spring(t, t0, o) {
    o = o || MOTION.spring; var dt = t - t0; if (dt <= 0) return 0;
    var w = o.w, z = o.z;
    if (z >= 1) return 1 - (1 + w * dt) * Math.exp(-w * dt);
    var wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + (z * w / wd) * Math.sin(wd * dt));
  }
  function hash(n) { var h = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
  function smooth(a, b, x) { var u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
  function chars(s) { return Array.from(s); }

  /* ── 外觀正規化 ── */
  var DEFAULT = { name: '小二', call: '掌櫃的', tone: 'warm', voice: '', hello: '', hue: 'orange', eyes: 'capsule', face: 'round', follow: true, blink: 'normal', rev: 0, by: 'xiaoer', seed: 0, skin: 'drawn', photo: null };
  /* 照片（地圖格式.md「v14 新加的」）：file 在「作品/」底下、不以 / 開頭、沒有 ..；是不是 png、jpg、webp 由伺服器看檔頭決定（副檔名不算數），
     讀不到就畫回原本的小二。x、y 是臉的中心（以照片寬、高為 1），r 是臉的半徑（以照片較短的一邊為 1，大於 0、最多 1） */
  function photoOk(p) {
    if (!p || typeof p !== 'object' || typeof p.file !== 'string') return false;
    var f = p.file;
    if (f.length > 300 || f.indexOf('作品/') !== 0 || f === '作品/' || /(^|\/)\.\.(\/|$)|\\|[\u0000-\u001f]/.test(f)) return false;
    var n = function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1; };
    return n(p.x) && n(p.y) && n(p.r) && p.r > 0;
  }
  var LIMIT = { name: 6, call: 8, voice: 40, hello: 30 };
  function textOk(v, max, required) {
    if (v == null) return !required;
    if (typeof v !== 'string') return false;
    var s = v.trim();
    if (required && !s) return false;
    return chars(s).length <= max && !/[<>]/.test(s);
  }
  function nameError(v) {                      // 調整器的名字格：白話原因，合格回空字串
    var s = typeof v === 'string' ? v.trim() : '';
    if (!s) return '名字不能空著。';
    if (chars(s).length > LIMIT.name) return '名字最多 ' + LIMIT.name + ' 個字。';
    if (/[<>]/.test(s)) return '名字只收文字，不收 < > 這種符號。';
    return '';
  }
  function normalize(o) {
    o = o || {};
    if (o.companion && typeof o.companion === 'object') {
      var per = o.persona || {};
      o = Object.assign({}, o.companion, { hue: o.companion.hue || per.hue, eyes: o.companion.eyes || per.eyes });
    }
    var c = {};
    c.name = textOk(o.name, LIMIT.name, true) ? o.name.trim() : DEFAULT.name;
    c.call = textOk(o.call, LIMIT.call, true) ? o.call.trim() : DEFAULT.call;
    c.tone = TONES[o.tone] ? o.tone : DEFAULT.tone;
    c.voice = textOk(o.voice, LIMIT.voice, false) && o.voice ? o.voice.trim() : '';
    c.hello = textOk(o.hello, LIMIT.hello, false) && o.hello ? o.hello.trim() : '';
    c.hue = HUE_KEYS.indexOf(o.hue) >= 0 ? o.hue : DEFAULT.hue;
    c.eyes = EYES[o.eyes] ? o.eyes : DEFAULT.eyes;
    c.face = FACES[o.face] ? o.face : DEFAULT.face;
    c.follow = o.follow !== false;
    c.blink = RHYTHM[o.blink] ? o.blink : DEFAULT.blink;
    c.rev = (typeof o.rev === 'number' && o.rev >= 0 && Math.floor(o.rev) === o.rev) ? o.rev : 0;
    c.by = ({ xiaoer: 1, owner: 1, agent: 1 })[o.by] ? o.by : DEFAULT.by;
    c.seed = typeof o.seed === 'number' && isFinite(o.seed) ? Math.floor(o.seed) : 0;
    c.skin = o.skin === 'photo' ? 'photo' : 'drawn';
    c.photo = photoOk(o.photo) ? { file: o.photo.file, x: o.photo.x, y: o.photo.y, r: o.photo.r } : null;
    return c;
  }
  function helloOf(c) { return c.hello || ('早，' + c.call + '。'); }

  /* 存檔要送的：只帶調整器改得到的四樣裡改了的（名字、臉型在 companion；本命色、眼睛寫回 persona）。沒改回 null */
  function tunerPayload(saved, cur) {
    var s = normalize(saved), c = normalize(cur), comp = {}, out = { companion: comp }, changed = false;
    if (c.name !== s.name) { comp.name = c.name; changed = true; }
    if (c.face !== s.face) { comp.face = c.face; changed = true; }
    if (c.hue !== s.hue) { out.hue = c.hue; changed = true; }
    if (c.eyes !== s.eyes) { out.eyes = c.eyes; changed = true; }
    if (c.skin !== s.skin) { comp.skin = c.skin; changed = true; }
    if (!changed) return null;
    comp.by = 'owner'; comp.rev = s.rev;
    return out;
  }

  /* ── 時間的純函數 ── */
  function blinkAt(t, rhythm, seed) {
    var R = RHYTHM[rhythm] || RHYTHM.normal, k = Math.floor(t / R.P), b = 0, D = MOTION.blinkDur;
    seed = seed || 0;
    for (var j = k - 1; j <= k; j++) {
      if (j < 0) continue;
      var tb = j * R.P + 0.6 + hash(j * 7 + seed * 131) * R.J;
      var times = [tb]; if (hash(j * 13 + seed * 977 + 5) < R.dbl) times.push(tb + MOTION.doubleGap);
      for (var i = 0; i < times.length; i++) { var d = t - times[i]; if (d > 0 && d < D) b = Math.max(b, Math.sin(Math.PI * d / D)); }
    }
    return b;
  }
  function blinkTimes(rhythm, seed, upTo) {          // 驗算用：列出 0…upTo 秒內每一次眨眼開始的時間
    var R = RHYTHM[rhythm] || RHYTHM.normal, out = [];
    for (var j = 0; j * R.P < upTo; j++) {
      var tb = j * R.P + 0.6 + hash(j * 7 + (seed || 0) * 131) * R.J; out.push(tb);
      if (hash(j * 13 + (seed || 0) * 977 + 5) < R.dbl) out.push(tb + MOTION.doubleGap);
    }
    return out;
  }
  function lookToward(rect, px, py) {
    var F = MOTION.follow, size = Math.max(rect.w, rect.h);
    var R = clamp(size * F.rangeK, F.rangeMin, F.rangeMax);
    var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d > R) return null;
    return { look: [clamp(dx / (F.fullAt * R), -1, 1), clamp(dy / (F.fullAt * R), -1, 1)], weight: 1 - smooth(F.fadeFrom * R, R, d) };
  }
  var CH = ['lx', 'ly', 'sy', 'wide', 'roll', 'happy', 'nod', 'drift'];
  function stateOf(k) {
    var e = EXPR[k.expr] || EXPR.idle;
    return { lx: k.look ? k.look[0] : e.look[0], ly: k.look ? k.look[1] : e.look[1], sy: e.sy, wide: e.wide, roll: e.roll, happy: e.happy, nod: e.nod, drift: e.drift };
  }
  function pose(c, t, keys, reduce, taps) {
    keys = keys && keys.length ? keys : [[0, { expr: 'idle' }]];
    var S = keys.map(function (k) { return stateOf(k[1]); }), P = {};
    CH.forEach(function (ch) {
      var o = (ch === 'lx' || ch === 'ly') ? MOTION.lookSpring : MOTION.spring, v = S[0][ch];
      if (!reduce) for (var i = 1; i < keys.length; i++) v += (S[i][ch] - S[i - 1][ch]) * spring(t, keys[i][0], o);
      else v = S[S.length - 1][ch];
      P[ch] = v;
    });
    if (!reduce) {
      P.ly += P.nod * Math.sin(2 * Math.PI * t / MOTION.nodPeriod);
      P.lx += P.drift * Math.sin(2 * Math.PI * t / MOTION.driftPeriod);
      P.blink = blinkAt(t, c.blink, c.seed);
      if (taps) for (var q = 0; q < taps.length; q++) { var dq = t - taps[q]; if (dq > 0 && dq < MOTION.blinkDur) P.blink = Math.max(P.blink, Math.sin(Math.PI * dq / MOTION.blinkDur)); }
      P.breath = Math.sin(2 * Math.PI * t / MOTION.breath.period) * MOTION.breath.amp;
      P.hop = 0;   // 每次切進「開心」那一刻，0.42 秒的半個正弦（時間的純函數；走完就是 0，prune 前後一樣）
      for (var hk = 1; hk < keys.length; hk++) if ((keys[hk][1] || {}).expr === 'happy' && (keys[hk - 1][1] || {}).expr !== 'happy') {
        var dh = t - keys[hk][0]; if (dh > 0 && dh < MOTION.hop.dur) P.hop += MOTION.hop.h * Math.sin(Math.PI * dh / MOTION.hop.dur);
      }
    } else { P.blink = 0; P.breath = 0; P.hop = 0; }
    P.lx = clamp(P.lx, -1.2, 1.2); P.ly = clamp(P.ly, -1.2, 1.2);
    return P;
  }
  function prune(keys, t) {
    var i = 0; while (i + 1 < keys.length && t - keys[i + 1][0] > 3) i++;
    return i ? keys.slice(i) : keys;
  }

  /* 靜止用的姿勢：眼神與歪頭一律換回「平常」往右上看（品牌規範：靜止時一律往右上看）；開心的彎眼不動 */
  function settle(P) {
    if (!P || P.happy >= 0.5) return P;
    var I = EXPR.idle;
    return Object.assign({}, P, { lx: I.look[0], ly: I.look[1], roll: I.roll });
  }

  /* ── 幾何（48 格）：給畫法用，也給測試拿去跟參考實作的 SVG 對 ── */
  function eyeShapes(eyesKey, P) {
    var E = EYES[eyesKey] || EYES.capsule, ax = Math.abs(P.lx), M = MOTION;
    var gap = E.gap * (1 - M.gapShrink * ax);
    var ox = 24 + P.lx * M.eyeTravel[0], oy = EYE_Y + P.ly * M.eyeTravel[1];
    var close = 1 - M.blinkClose * P.blink;
    var hap = P.happy, squash = hap < 0.5 ? 1 - hap * 1.7 : 0, out = [];
    for (var s = -1; s <= 1; s += 2) {
      var far = ax > 0.01 && ((s > 0) === (P.lx > 0));
      var w = E.w * P.wide * (far ? 1 - M.far.w * ax : 1 + M.near.w * ax);
      var h = E.h * P.sy * (far ? 1 - M.far.h * ax : 1) * close * Math.max(squash, 0);
      out.push({ x: ox + s * gap / 2, y: oy, w: w, h: h, far: far, happy: hap >= 0.5 ? (hap - 0.5) * 2 : 0, ew: E.w });
    }
    return out;
  }
  function geometry(c, P, px) {
    px = px || 96;
    var eyesKey = (px < 32 && c.eyes === 'capsule') ? 'round' : c.eyes;
    var eyes = eyeShapes(eyesKey, P).map(function (e) {
      if (e.happy > 0) return e;
      var h = Math.max(e.h, Math.min(e.w, 0.9) * 0.55);
      return Object.assign({}, e, { h: h, r: Math.min(e.w, h) / 2 });
    });
    return {
      eyes: eyes, eyesKey: eyesKey,
      head: { dx: P.lx * MOTION.faceTravel[0], dy: P.ly * MOTION.faceTravel[1], bottom: (FACES[c.face] || FACES.round).bottom, sy: 1 + P.breath },
      eyeCenter: [(eyes[0].x + eyes[1].x) / 2, eyes[0].y], roll: P.roll
    };
  }

  /* ── 畫（canvas 2D）：臉一塊本命色、眼睛一組；不描邊、不加陰影、不戴配件 ── */
  var PATHS = typeof Map === 'function' ? new Map() : null;
  function path2d(d) {
    var P2 = typeof Path2D !== 'undefined' ? Path2D : null;
    if (!P2) return null;
    if (PATHS && PATHS.has(d)) return PATHS.get(d);
    var p = new P2(d);
    if (PATHS) { if (PATHS.size > 400) PATHS.clear(); PATHS.set(d, p); }
    return p;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function drawEye(ctx, e, col) {
    if (e.happy > 0) {
      var r = e.ew * 0.62, k = e.happy, cy = e.y + r * 0.5 - 0.6 * k, sp = Math.PI * 0.34 * Math.max(k, 0.15);
      ctx.beginPath(); ctx.arc(e.x, cy, r, Math.PI * 1.5 - sp, Math.PI * 1.5 + sp, false);
      ctx.lineWidth = e.ew * 0.58; ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.stroke();
      return;
    }
    roundRect(ctx, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, e.r);
    ctx.fillStyle = col; ctx.fill();
  }
  /* ── 照片樣子（v14）：照片從伺服器讀一次、縮成短邊最多 640 像素放著，每一格只畫縮好的那一張 ── */
  var PHOTO = {}, PHOTO_FNS = [];
  function photoURL(file) { return (api.photoBase || '/api/asset?f=') + encodeURIComponent(file); }
  function photoStatus(file) { var e = PHOTO[file]; return e ? e.st : 'none'; }
  function photoNotify() {
    LOOP.list.forEach(function (i) { i.dirty = true; if (i.redraw) i.redraw(); });
    schedule();
    PHOTO_FNS.slice().forEach(function (fn) { try { fn(); } catch (e) { } });
  }
  function onPhoto(fn) { PHOTO_FNS.push(fn); return function () { PHOTO_FNS = PHOTO_FNS.filter(function (f) { return f !== fn; }); }; }
  function shrink(img) {
    var W = img.naturalWidth, H = img.naturalHeight, k = Math.min(1, 640 / Math.min(W, H));
    if (k >= 1 || !HAS_DOM) return img;
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k));
    var cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }
  function ensurePhoto(file) {
    var e = PHOTO[file]; if (e) return e;
    e = PHOTO[file] = { st: 'loading', src: null };
    var Img = HAS_DOM ? root.Image : null;
    if (!Img) { e.st = 'bad'; return e; }   // 沒有瀏覽器（測試、伺服器端截圖）：當作讀不到，畫回原本的小二
    var img = new Img(), done = false;
    var fail = function () { if (done) return; done = true; e.st = 'bad'; photoNotify(); };
    img.onload = function () { if (done) return; if (!(img.naturalWidth > 0)) { fail(); return; } done = true; try { e.src = shrink(img); } catch (x) { e.src = img; } e.st = 'ok'; photoNotify(); };
    img.onerror = fail;
    img.decoding = 'async';
    img.src = photoURL(file);
    return e;
  }
  function usePhoto(file, src) { PHOTO[file] = src ? { st: 'ok', src: src } : { st: 'bad', src: null }; photoNotify(); }
  /* 幾何（48 格）：圓框跟圓臉同一個位置（中心 24, 26）；外圈本命色細邊，開心時變粗；整顆頭照第 1 節挪、呼吸從下緣縮放；
     照片在框裡再往同一個方向挪一點（像轉頭看你），歪頭改成整張照片轉 */
  function photoGeom(c, P, px) {
    var M = MOTION.photo, k = (px || 96) / G, hap = clamp(P.happy || 0, 0, 1.2);
    var base = clamp(M.ring * k, M.ringPx[0], M.ringPx[1]) / k, more = clamp(M.ringHappy * k, M.happyPx[0], M.happyPx[1]) / k * hap, r = M.edge - base;
    return { cx: 24, cy: 26, r: r, ringR: r + (base + more) / 2, ringW: base + more, dx: P.lx * MOTION.faceTravel[0], dy: P.ly * MOTION.faceTravel[1] - (P.hop || 0),
      bottom: 43, breath: 1 + (P.breath || 0), shiftX: P.lx * M.shift[0], shiftY: P.ly * M.shift[1], roll: P.roll };
  }
  function fit(v, reach, size) { return reach * 2 >= size ? size / 2 : Math.max(reach, Math.min(size - reach, v)); }
  function drawPhoto(ctx, c, P, o, src) {
    var px = o.px || 96, k = px / G, H = hueOf(c.hue), g = photoGeom(c, P, px), ph = c.photo;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0); ctx.scale(k, k);
    ctx.translate(g.dx, g.dy);
    ctx.translate(0, g.bottom); ctx.scale(1, g.breath); ctx.translate(0, -g.bottom);
    ctx.save();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.fillStyle = H.soft; ctx.fillRect(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
    if (src) {
      var W = src.naturalWidth || src.width, Hh = src.naturalHeight || src.height, S = Math.min(W, Hh), s = g.r / Math.max(1, ph.r * S);
      var reach = (g.r + Math.hypot(MOTION.photo.shift[0], MOTION.photo.shift[1]) * 1.25) / s;   // 框住的範圍不跑出照片邊
      ctx.translate(g.cx + g.shiftX, g.cy + g.shiftY); ctx.rotate(g.roll * Math.PI / 180); ctx.scale(s, s);
      ctx.drawImage(src, -fit(ph.x * W, reach, W), -fit(ph.y * Hh, reach, Hh), W, Hh);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.ringR, 0, Math.PI * 2); ctx.closePath();
    ctx.lineWidth = g.ringW; ctx.strokeStyle = H.face; ctx.stroke();
    ctx.restore();
  }
  function draw(ctx, c, P, o) {
    o = o || {};
    if (c.skin === 'photo' && c.photo) {   // 照片樣子：讀好了畫照片；還在路上先畫圓框；讀不到就畫回原本的小二
      var ph = ensurePhoto(c.photo.file);
      if (ph.st === 'ok') return drawPhoto(ctx, c, P, o, ph.src);
      if (ph.st === 'loading') return drawPhoto(ctx, c, P, o, null);
    }
    var px = o.px || 96, H = hueOf(c.hue), g = geometry(c, P, px), F = FACES[c.face] || FACES.round, k = px / G;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0); ctx.scale(k, k);
    ctx.translate(g.head.dx, g.head.dy);
    ctx.translate(0, g.head.bottom); ctx.scale(1, g.head.sy); ctx.translate(0, -g.head.bottom);
    var face = path2d(F.d); if (face) { ctx.fillStyle = H.face; ctx.fill(face); }
    ctx.save();
    ctx.translate(g.eyeCenter[0], g.eyeCenter[1]); ctx.rotate(g.roll * Math.PI / 180); ctx.translate(-g.eyeCenter[0], -g.eyeCenter[1]);
    g.eyes.forEach(function (e) { drawEye(ctx, e, H.eye); });
    ctx.restore();
    ctx.restore();
  }
  function frame(ctx, look, t, o) {
    o = o || {};
    var c = look && look.__xe ? look : normalize(look);
    var keys = o.keys || [[0, { expr: o.expr || 'idle', look: o.gaze || undefined }]];
    var P = pose(c, t, keys, !!o.reduce, o.taps);
    if (o.reduce) P = settle(P);
    draw(ctx, c, P, o);
    return P;
  }

  /* ── 瀏覽器：高解析畫布 ── */
  var HAS_DOM = typeof document !== 'undefined' && typeof root.addEventListener === 'function';
  function fitCanvas(cvs, size) {
    var dpr = Math.min(3, root.devicePixelRatio || 1), W = Math.max(1, Math.round(size * dpr));
    if (cvs.width !== W || cvs.height !== W) { cvs.width = W; cvs.height = W; }
    cvs.style.width = size + 'px'; cvs.style.height = size + 'px';
    var ctx = cvs.getContext('2d'); ctx.setTransform(W / size, 0, 0, W / size, 0, 0); ctx.clearRect(0, 0, size, size);
    return ctx;
  }
  function paint(cvs, look, o) {
    o = o || {};
    var size = o.size || 40, ctx = fitCanvas(cvs, size);
    return frame(ctx, look, o.t || 0, { px: size, expr: o.expr, gaze: o.gaze, reduce: true });
  }
  function reducedMotion() { return !!(HAS_DOM && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ── 掛載：共用一個動畫迴圈 ── */
  var LOOP = { list: [], raf: 0, wired: false };
  var PTR = { x: 0, y: 0, at: 0, inside: false };
  function nowMs() { return root.performance ? root.performance.now() : Date.now(); }
  function schedule() {
    if (LOOP.raf || !HAS_DOM || document.hidden) return;
    if (!LOOP.list.some(function (i) { return i.live(); })) return;
    LOOP.raf = root.requestAnimationFrame(function (ms) { LOOP.raf = 0; LOOP.list.slice().forEach(function (i) { i.tick(ms); }); schedule(); });
  }
  function wire() {
    if (LOOP.wired || !HAS_DOM) return; LOOP.wired = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (LOOP.raf) root.cancelAnimationFrame(LOOP.raf); LOOP.raf = 0; } else schedule();
    });
    root.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;      // 觸控沒有游標：不轉頭
      PTR.x = e.clientX; PTR.y = e.clientY; PTR.at = nowMs(); PTR.inside = true; schedule();
    }, { passive: true });
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) { PTR.inside = false; schedule(); } });
    root.addEventListener('blur', function () { PTR.inside = false; schedule(); });
    if (root.matchMedia) {
      var mq = root.matchMedia('(prefers-reduced-motion: reduce)'), on = function () { LOOP.list.forEach(function (i) { i.dirty = true; i.tick(nowMs()); }); schedule(); };
      if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    }
  }

  function mount(el, look, opts) {
    if (!HAS_DOM) throw new Error('mount 要在瀏覽器裡用；影片與測試請用 frame()');
    opts = opts || {}; wire();
    var cvs = document.createElement('canvas');
    cvs.className = 'xe-canvas'; cvs.setAttribute('role', 'img');
    el.appendChild(cvs);
    var inst = {
      c: null, t0: nowMs(), base: EXPR[opts.expr] ? opts.expr : 'idle', keys: null, taps: [],
      following: false, lastL: null, holdUntil: -1, size: 0, visible: true, dirty: true, dead: false, timers: []
    };
    inst.keys = [[0, { expr: inst.base }]];
    function t() { return (nowMs() - inst.t0) / 1000; }
    function setLook(lk) {
      inst.c = normalize(lk); if (typeof opts.seed === 'number') inst.c.seed = opts.seed;
      cvs.setAttribute('aria-label', opts.label || inst.c.name);
    }
    setLook(look);
    function measure() {
      var s = opts.size || Math.floor(Math.min(el.clientWidth || 0, el.clientHeight || el.clientWidth || 0)) || 96;
      if (s !== inst.size) { inst.size = s; inst.dirty = true; }
    }
    function reduce() { return opts.reduce != null ? !!opts.reduce : reducedMotion(); }
    function push(at, st) {                       // 加一個 key：還沒開始的 key 先拿掉（它們此刻的貢獻是 0，拿掉畫面不跳）
      inst.keys = inst.keys.filter(function (k, i) { return i === 0 || k[0] <= at; });
      inst.keys.push([at, st]); inst.dirty = true;
    }
    function render(now) {
      if (inst.dead) return;
      measure();
      var tt = (now - inst.t0) / 1000, red = reduce();
      var keys = red ? inst.keys.filter(function (k, i) { return i === 0 || k[0] <= tt; }) : inst.keys;
      var ctx = fitCanvas(cvs, inst.size);
      inst.P = pose(inst.c, tt, keys, red, inst.taps);
      if (red) inst.P = settle(inst.P);           // 靜止時照品牌規範往右上看
      draw(ctx, inst.c, inst.P, { px: inst.size });
      inst.dirty = false;
    }
    function follow(tt, now) {
      if (tt < inst.holdUntil) return;
      var F = MOTION.follow, r = null;
      if (inst.c.follow && PTR.inside && PTR.at && (now - PTR.at) / 1000 < F.returnAfter) {
        var b = cvs.getBoundingClientRect();
        if (b.width) r = lookToward({ x: b.left, y: b.top, w: b.width, h: b.height }, PTR.x, PTR.y);
      }
      if (r) {
        var base = EXPR[inst.base].look, L = [base[0] + (r.look[0] - base[0]) * r.weight, base[1] + (r.look[1] - base[1]) * r.weight];
        if (!inst.following || Math.hypot(L[0] - inst.lastL[0], L[1] - inst.lastL[1]) > F.minStep) {
          push(tt, { expr: 'you', look: L }); inst.lastL = L; inst.following = true;
        }
      } else if (inst.following) {
        push(tt + F.returnDelay, { expr: inst.base }); inst.following = false;
      }
    }
    inst.live = function () { return !inst.dead && inst.visible && !reduce(); };
    inst.redraw = function () { if (!inst.dead && inst.visible) render(nowMs()); };
    inst.tick = function (now) {
      if (inst.dead || !inst.visible) return;
      var tt = (now - inst.t0) / 1000;
      if (reduce()) { if (inst.dirty) render(now); return; }
      follow(tt, now);
      inst.keys = prune(inst.keys, tt);
      inst.taps = inst.taps.filter(function (x) { return tt - x < 1; });
      render(now);
    };
    function blink() {                           // 剛轉頭（最近一個已經開始的 key）的 0.3 秒內不排，往後挪
      var tt = t(), last = -9;
      for (var i = 1; i < inst.keys.length; i++) if (inst.keys[i][0] <= tt) last = Math.max(last, inst.keys[i][0]);
      var at = tt - last < MOTION.tapGuard ? last + MOTION.tapGuard : tt;
      inst.taps.push(at); inst.dirty = true;
      if (reduce()) return; schedule();
    }
    function expr(name, hold) {
      if (name === 'blink') return blink();
      if (!EXPR[name]) return;
      var tt = t();
      inst.following = false;
      if (hold > 0) {
        push(tt, { expr: name }); push(tt + hold, { expr: inst.base }); inst.holdUntil = tt + hold;
        if (reduce()) inst.timers.push(setTimeout(function () { inst.dirty = true; render(nowMs()); }, hold * 1000 + 20));
      } else { inst.base = name; inst.holdUntil = -1; push(tt, { expr: name }); }
      if (reduce()) render(nowMs()); else schedule();
    }
    cvs.addEventListener('pointerdown', function () {    // 點一下（觸控也一樣）：看你＋眨一下
      if (reduce()) return;
      var tt = t(); inst.following = false;
      push(tt, { expr: 'you' }); blink(); push(tt + 1.4, { expr: inst.base }); inst.holdUntil = tt + 1.4;
    });
    var ro = root.ResizeObserver ? new root.ResizeObserver(function () { inst.dirty = true; if (reduce()) render(nowMs()); else schedule(); }) : null;
    if (ro) ro.observe(el);
    var io = root.IntersectionObserver ? new root.IntersectionObserver(function (es) {
      inst.visible = es[es.length - 1].isIntersecting; inst.dirty = true;
      if (inst.visible) { if (reduce()) render(nowMs()); schedule(); }
    }) : null;
    if (io) io.observe(cvs);
    LOOP.list.push(inst);
    render(nowMs()); schedule();
    return {
      canvas: cvs,
      update: function (lk) { setLook(lk); inst.dirty = true; if (!inst.c.follow && inst.following) { push(t(), { expr: inst.base }); inst.following = false; } render(nowMs()); schedule(); },
      expr: expr,
      blink: blink,
      pose: function () { return Object.assign({ expr: inst.following ? 'you' : inst.base, following: inst.following }, inst.P || {}); },
      following: function () { return inst.following; },
      destroy: function () {
        inst.dead = true; inst.timers.forEach(clearTimeout);
        if (ro) ro.disconnect(); if (io) io.disconnect();
        LOOP.list = LOOP.list.filter(function (i) { return i !== inst; });
        if (cvs.parentNode) cvs.parentNode.removeChild(cvs);
      }
    };
  }

  /* ── 調整器：大預覽、名字、本命色八色、一排六個樣子；按「就這樣」存 ── */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  var EDIT = ['name', 'hue', 'eyes', 'face', 'skin'];
  function same(a, b) { return EDIT.every(function (k) { return a[k] === b[k]; }); }
  function copyText(text) {                   // 複製到剪貼簿：先用新的寫法，不行再退回選取＋複製；都不行回 false
    function legacy() {
      try {
        var ta = h('textarea', { readonly: true, 'aria-hidden': 'true' });
        ta.value = text; ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta); return !!ok;
      } catch (e) { return false; }
    }
    try {
      if (root.navigator && navigator.clipboard && navigator.clipboard.writeText && root.isSecureContext !== false) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
      }
    } catch (e) { }
    return Promise.resolve(legacy());
  }
  var uid = 0;

  function customizer(el, init, opts) {
    if (!HAS_DOM) throw new Error('customizer 要在瀏覽器裡用');
    opts = opts || {}; uid++;
    var saved = normalize(init), proposal = opts.proposal ? normalize(opts.proposal) : null;
    var cur = Object.assign({}, saved), nameErr = '', busy = false, echoMsg = '', echoKind = '';
    var refs = {}, id = 'xe' + uid;
    var isTouch = !!(root.matchMedia && root.matchMedia('(hover: none)').matches);

    /* 大預覽：只有小二和下面一行提示（名字只在名字格出現一次，不在預覽、標題再寫一遍） */
    refs.stage = h('div', { class: 'xe-pv-stage' });
    refs.hint = h('p', { class: 'xe-pv-hint' });
    var preview = h('section', { class: 'xe-card xe-pv', 'aria-label': '預覽' }, [refs.stage, refs.hint]);

    /* 名字 */
    refs.name = h('input', { id: id + '-name', class: 'xe-input', type: 'text', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-describedby': id + '-name-err' });
    refs.count = h('span', { class: 'xe-count', 'aria-hidden': 'true' });
    refs.nameErr = h('p', { id: id + '-name-err', class: 'xe-err' });
    refs.name.addEventListener('input', function () {
      var v = refs.name.value, n = chars(v.trim()).length;
      refs.count.textContent = n + '／' + LIMIT.name; refs.count.classList.toggle('over', n > LIMIT.name);
      nameErr = nameError(v);
      if (!nameErr) cur.name = v.trim();
      refs.nameErr.textContent = nameErr; refs.name.setAttribute('aria-invalid', nameErr ? 'true' : 'false');
      refresh();
    });
    refs.name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });

    /* 單選的一排（色票、樣子）：方向鍵移動並選取 */
    function radios(cls, items, label, pick) {
      var g = h('div', { class: 'xe-opts ' + cls, role: 'radiogroup', 'aria-label': label });
      var btns = items.map(function (it, i) {
        var b = h('button', {
          type: 'button', role: 'radio', class: it.cls, 'aria-label': it.label,
          onclick: function () { pick(i); },
          onkeydown: function (e) {
            var d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 })[e.key];
            if (e.key === 'Home') d = -i; if (e.key === 'End') d = items.length - 1 - i;
            if (d == null) return;
            e.preventDefault(); var j = (i + d + items.length) % items.length; pick(j); btns[j].focus();
          }
        }, it.kids);
        g.appendChild(b); return b;
      });
      return { group: g, btns: btns };
    }
    refs.hue = radios('xe-swatches', HUE_KEYS.map(function (k) {
      return { cls: 'xe-sw', label: hueOf(k).name, kids: [h('span', { class: 'xe-sw-in', 'aria-hidden': 'true', style: '--sw:' + hueOf(k).face })] };
    }), '本命色', function (i) { cur.hue = HUE_KEYS[i]; refresh(); });
    /* 樣子：六個畫的小二；交過照片（companion.photo）的人，後面多一格「照片」（點它＝skin: photo，點回前六個＝換回畫的，照片留著不刪） */
    var hasPhoto = !!saved.photo, PI = LOOKS.length;
    var lookItems = LOOKS.map(function (L) { return { cls: 'xe-look', label: L.name, kids: [h('canvas', { class: 'xe-mini', 'aria-hidden': 'true' })] }; });
    if (hasPhoto) lookItems.push({ cls: 'xe-look xe-look-photo', label: '照片', kids: [h('canvas', { class: 'xe-mini', 'aria-hidden': 'true' })] });
    refs.looks = radios('xe-looks', lookItems, '樣子', function (i) {
      if (hasPhoto && i === PI) { if (photoStatus(cur.photo.file) === 'bad') return; cur.skin = 'photo'; }
      else { cur.skin = 'drawn'; cur.face = LOOKS[i].face; cur.eyes = LOOKS[i].eyes; }
      refresh();
    });
    refs.looks.group.style.setProperty('--n', lookItems.length);
    refs.photoNote = h('p', { class: 'xe-err xe-photo-note', role: 'status' });

    function group(label, forId, control) {
      return h('div', { class: 'xe-grp' }, [h(forId ? 'label' : 'p', { class: 'xe-lab', for: forId || null, text: label }), control]);
    }
    var form = h('div', { class: 'xe-form' }, [
      group('名字', id + '-name', h('div', { class: 'xe-field' }, [h('div', { class: 'xe-inwrap' }, [refs.name, refs.count]), refs.nameErr])),
      group('本命色', null, refs.hue.group),
      group('樣子', null, h('div', { class: 'xe-looks-wrap' }, [refs.looks.group, refs.photoNote]))
    ]);

    /* 存檔列：放在面板最底、不浮在內容上 */
    refs.save = h('button', { type: 'button', class: 'xe-save', text: '就這樣', onclick: save });
    refs.cancel = h('button', { type: 'button', class: 'xe-link', text: '先不改', onclick: cancel });
    refs.reset = proposal ? h('button', { type: 'button', class: 'xe-link', onclick: function () { load(proposal); echo('', ''); } }) : null;
    refs.echo = h('p', { class: 'xe-echo', role: 'status', 'aria-live': 'polite' });
    var bar = h('div', { class: 'xe-bar' }, [refs.save, refs.cancel, refs.reset, refs.echo]);
    var panel = h('section', { class: 'xe-card xe-panel', 'aria-label': '調整你的小二' }, [form, bar]);

    /* 下方一行：說話的方式在對話裡改。按了複製，「複製好了」寫在同一行的位置（不浮在畫面上、不蓋標題、面板也不會被撐高） */
    refs.sayLead = h('p', { class: 'xe-say-lead' });
    refs.sayEcho = h('p', { class: 'xe-say-echo', role: 'status', 'aria-live': 'polite' });
    refs.sayTop = h('div', { class: 'xe-say-top' }, [refs.sayLead, refs.sayEcho]);
    var sayBtns = SAY.map(function (line) {
      return h('button', { type: 'button', class: 'xe-say-b', onclick: function () { say(line); } }, [h('span', { text: '「' + line + '」' })]);
    });
    var sayRow = h('div', { class: 'xe-say' }, [refs.sayTop, h('div', { class: 'xe-say-row' }, sayBtns)]);

    var rootEl = h('div', { class: 'xe-wrap' }, [h('div', { class: 'xe-tuner' }, [preview, panel]), sayRow]);
    el.appendChild(rootEl);

    var live = mount(refs.stage, cur, {});
    refs.stage.addEventListener('pointerdown', function () { if (isTouch) setHint(); });

    /* 複製那一句：用名字格裡現在的名字（複製的話、提示都是同一個名字） */
    var saySeq = 0, sayName = '', sayTimer = null;
    function sayEcho(msg, ok) {
      clearTimeout(sayTimer);
      refs.sayEcho.textContent = msg; refs.sayEcho.className = 'xe-say-echo' + (ok ? ' ok' : '');
      refs.sayTop.classList.toggle('on', !!msg);
      if (msg && ok) sayTimer = setTimeout(function () { sayEcho('', false); }, 4200);
    }
    function say(line) {
      var nm = cur.name, text = sayText(nm, line), my = ++saySeq, p;
      sayEcho('', false); sayName = nm;
      try { p = opts.onSay ? opts.onSay(text, nm) : copyText(text); } catch (e) { p = false; }
      Promise.resolve(p).then(function (ok) {
        if (my !== saySeq || !refs.sayEcho.isConnected) return;
        if (ok === true) sayEcho('複製好了，貼到跟' + nm + '的對話送出。', true);
        else if (ok === false && !opts.onSay) sayEcho('複製不了，請自己選這一句貼到對話：' + text, false);
      }, function () { });
    }
    function setHint() {
      var nm = cur.name, t = reducedMotion() ? '已減少動態，' + nm + '停在平常的樣子' :
        !cur.follow ? nm + '只眨眼和呼吸' : live.following() ? nm + '看著你' : isTouch ? '點一下' + nm : '把滑鼠移過來';
      if (refs.hint.textContent !== t) refs.hint.textContent = t;
    }
    function echo(msg, kind) { echoMsg = msg; echoKind = kind; paintEcho(); }
    function paintEcho() {
      var msg = echoMsg || nameErr || (!same(cur, saved) ? '還沒存' : '');
      refs.echo.textContent = msg;
      refs.echo.className = 'xe-echo' + (echoMsg ? ' ' + echoKind : nameErr ? ' bad' : '');
    }
    function load(c) {
      var n = normalize(c);
      EDIT.forEach(function (k) { cur[k] = n[k]; });
      if (n.photo) cur.photo = n.photo;
      nameErr = '';
      refs.name.value = cur.name; refs.nameErr.textContent = ''; refs.name.setAttribute('aria-invalid', 'false');
      refs.count.textContent = chars(cur.name).length + '／' + LIMIT.name; refs.count.classList.remove('over');
      refresh();
    }
    var lastMini = '';
    function refresh() {
      if (!busy) echoMsg = '';
      var nm = cur.name;
      live.update(cur);
      rootEl.style.setProperty('--xe-hue', hueOf(cur.hue).face);
      refs.sayLead.textContent = '想改' + nm + '怎麼叫你、怎麼說話？直接跟' + nm + '說。';
      if (sayName && sayName !== nm && refs.sayEcho.textContent) sayEcho('', false);   // 名字改了，剛剛那句提示的名字就舊了
      refs.cancel.setAttribute('aria-label', '先不改，' + nm + '維持存好的樣子');
      if (refs.reset) { refs.reset.textContent = '回到' + nm + '提的那一版'; refs.reset.hidden = same(cur, proposal); }
      var hi = HUE_KEYS.indexOf(cur.hue), li = hasPhoto && cur.skin === 'photo' ? PI : lookIndex(cur);
      refs.hue.btns.forEach(function (b, i) { b.setAttribute('aria-checked', i === hi ? 'true' : 'false'); b.tabIndex = i === hi ? 0 : -1; });
      refs.looks.btns.forEach(function (b, i) { b.setAttribute('aria-checked', i === li ? 'true' : 'false'); b.tabIndex = i === li || (li < 0 && i === 0) ? 0 : -1; });
      if (lastMini !== cur.hue) {
        lastMini = cur.hue;
        refs.looks.btns.forEach(function (b, i) { if (i < PI) paint(b.firstChild, { hue: cur.hue, face: LOOKS[i].face, eyes: LOOKS[i].eyes }, { size: 56 }); });
        paintPhotoCell();
      }
      photoCell();
      refs.save.disabled = busy || !!nameErr;
      setHint(); paintEcho();
      try { el.dispatchEvent(new CustomEvent('xe-change', { bubbles: true, detail: value() })); } catch (e) { }
    }
    function value() { return Object.assign({}, saved, { name: cur.name, hue: cur.hue, eyes: cur.eyes, face: cur.face, skin: cur.skin }); }
    /* 照片那一格：照片讀好了畫照片；讀不到就不能選，下面講一句白話 */
    function paintPhotoCell() { if (hasPhoto) paint(refs.looks.btns[PI].firstChild, { hue: cur.hue, skin: 'photo', photo: cur.photo || saved.photo }, { size: 56 }); }
    function photoCell() {
      if (!hasPhoto) return;
      var bad = photoStatus((cur.photo || saved.photo).file) === 'bad', b = refs.looks.btns[PI];
      b.setAttribute('aria-disabled', bad ? 'true' : 'false'); b.title = bad ? '照片讀不到' : '照片';
      refs.photoNote.textContent = bad ? '照片讀不到，先用畫的樣子；跟' + cur.name + '說「照片再放一次」就好。' : '';
    }
    var offPhoto = hasPhoto ? onPhoto(function () { paintPhotoCell(); photoCell(); }) : null;
    function cancel() {
      load(saved); echo('', '');
      if (opts.onCancel) opts.onCancel();
    }
    function save() {
      if (busy) return;
      if (nameErr) { paintEcho(); refs.name.focus(); return; }
      var payload = tunerPayload(saved, value());
      if (!payload) { if (opts.onCancel) opts.onCancel(); else echo(cur.name + '還是原本的樣子。', 'ok'); return; }
      var before = value();
      busy = true; refs.save.disabled = true; refs.save.textContent = '存檔中';
      var done = function () { busy = false; refs.save.textContent = '就這樣'; };
      var p;
      try { p = Promise.resolve(opts.onSave ? opts.onSave(payload) : null); }
      catch (e) { p = Promise.reject(e); }
      p.then(function (res) {
        done();
        saved = normalize(res && res.companion ? res.companion : Object.assign({}, before, { rev: saved.rev + 1, by: 'owner' }));
        load(saved);
        echo(saved.name + '換好了。', 'ok');
        live.expr('happy', 1.6);
        if (opts.onSaved) opts.onSaved(saved);
      }, function (err) {
        done();
        if (err && err.status === 409) {
          if (err.companion) saved = normalize(err.companion);
          load(saved);
          echo('剛有人改過你的' + saved.name + '，已經換成最新的那一版，再改一次就好。', 'warn');
        } else {
          load(saved);
          var why = err && typeof err.message === 'string' && /[一-鿿]/.test(err.message) ? err.message.replace(/[。.]$/, '') : '連不上經營室';
          echo('沒存成：' + why + '。先回到上一次存好的樣子。', 'bad');
        }
      });
    }
    var hintTimer = setInterval(function () { if (!busy) setHint(); }, 250);
    load(saved);
    return {
      el: rootEl,
      value: value,
      set: function (lk) { saved = normalize(lk); load(saved); echo('', ''); },
      destroy: function () { clearInterval(hintTimer); clearTimeout(sayTimer); if (offPhoto) offPhoto(); live.destroy(); if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl); }
    };
  }

  var api = {
    GRID: G, FACES: FACES, EYES: EYES, EXPR: EXPR, MOTION: MOTION, RHYTHM: RHYTHM, TONES: TONES, LOOKS: LOOKS, SAY: SAY,
    HUE_KEYS: HUE_KEYS, EYE_KEYS: EYE_KEYS, FACE_KEYS: FACE_KEYS, DEFAULT: DEFAULT,
    hueOf: hueOf, normalize: normalize, helloOf: helloOf, nameError: nameError, lookIndex: lookIndex, sayText: sayText, tunerPayload: tunerPayload,
    spring: spring, hash: hash, blinkAt: blinkAt, blinkTimes: blinkTimes,
    pose: pose, settle: settle, prune: prune, lookToward: lookToward, geometry: geometry, eyeShapes: eyeShapes,
    draw: draw, frame: frame, paint: paint, mount: mount, customizer: customizer,
    photoOk: photoOk, photoStatus: photoStatus, onPhoto: onPhoto, usePhoto: usePhoto, photoGeom: photoGeom, photoURL: photoURL, photoBase: ''
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XiaoerCompanion = api;
})(typeof window !== 'undefined' ? window : this);
