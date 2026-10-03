/* 經營室 v13 的畫面（樣張與產品共用同一份）。
   ContextMap.render(root, model, opts)：第一次畫整頁；之後再呼叫（產品每秒輪詢一次）只換有變的那幾塊——
   沒變的塊一個字都不動，數字不重轉、圓環不重畫、焦點不跑掉；有變的那一塊從模糊變清楚，新長出來的那一塊升上來。
   opts：brand（顯示字標）、onSay(text, key)（複製一句話給小二）、onAct(body) → Promise<{today, revision}>（今天的按鈕寫回；
         沒給就是樣張，只記在這一頁）、date（當作今天的日期，樣張用）、mood（眼睛的表情）。
   版面：訪談中（stage.live）照七站的順序長；訪談後「今天」放最上面。畫的部分在 ctxviz.js（時間的純函數，影片也用同一份）。
   視覺語言：docs/design/視覺語言-v3.md；設計：docs/設計-v13-經營室.md */
(function (global) {
  'use strict';
  var V = global.CtxViz, NODES = V.NODES;
  var SRC = { said: '你說的', data: '你的資料', web: '查到的', est: '估的', calc: '算的', youest: '你估的', screen: '你在畫面上改的' };
  var ST_LABEL = { leak: '最卡的一格', hole: '也卡住', rel: '也有影響', later: '先不做', unknown: '還不知道' };
  var P29 = {
    '找客': ['主動觸及・名單生成', '訪客 × 詢問率 × 沒接住% × 客單'],
    '迎客': ['即時接待', '離峰沒接到 × 轉換率 × 客單'],
    '成交': ['報價自動化', '報價數 × 每份工時 × 完全成本'],
    '口碑': ['評價蒐集・轉介紹', '滿意客 × 開口率 × 成交率'],
    '養客': ['名單自動培育', '名單 × 升溫率 × 成交率 × 客單'],
    '回客': ['沉睡名單喚回', '未回訪數 × 喚回率 × 客單年值']
  };
  var LANE = { new: '新客', return: '回頭客', exist: '熟客', paid: '付費', other: '其他' };
  var LANE_TIP = { new: '還沒來過、要去找的人', return: '來過、後來變少或很久沒來，要叫回來的人', exist: '平常就會回來的人', paid: '花錢買來的客人（廣告等）', other: '其他' };
  var RESULT = [['replied', '回了'], ['booked', '約了'], ['won', '成交'], ['none', '沒回']];
  var RESULT_LABEL = { replied: '回了', booked: '約了', won: '成交', none: '沒回', later: '晚點再說' };
  var RUN = { open: '開門', close: '打烊', week: '盤點' };
  var RUN_ST = { set: '排好了', todo: '還沒排', manual: '你叫了才做' };
  var HOW = { folder: '丟進收件匣', connector: '連上帳號', said: '用說的', photo: '拍照' };
  var CAD = { daily: '每天', weekly: '每週', manual: '你叫了才做' };
  var LOGK = { open: '開門', close: '打烊', week: '盤點', note: '紀錄' };
  var DAYS = ['一', '二', '三', '四', '五', '六', '日'];
  var CN = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];
  var CIRC = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  var STATIONS = ['你的店', '你為什麼做', '你的客人', '六格現在怎麼做', '目標與起點', '講回去', '約好節奏'];
  /* 每一塊：標題、屬於第幾站；now＝訪談正問到這一塊、還沒有資料時那一句（只畫正在問的那一塊，後面的站不預告）；
     舊版地圖沒有 stage，用 old 那一句 */
  var SEC = {
    asks: { label: '想問你' },
    today: { label: '今天', st: 7, now: '正在排：明天的三件事' },
    who: { label: '我理解的你', st: 1 },
    offer: { label: '你的招牌', st: 1, now: '正在問：你賣什麼、你特別在哪' },
    data: { label: '資料', st: 1, old: '你手上有哪些資料，第①站會一起看' },
    aim: { label: '目的與目標', st: 2, now: '正在問：你做這門生意，現在是為了什麼' },
    people: { label: '你的客人', st: 3, now: '正在問：你的客人是誰、從哪來' },
    assets: { label: '存下來的', st: 5 },
    success: { label: '成功公式', st: 3, old: '你的成功故事還沒講，第②站會問' },
    flow: { label: '六格', st: 4, now: '正在問：每一格你現在怎麼做', old: '第③站會一格一格問，算出最卡的那一格' },
    opps: { label: '三個機會', st: 6, now: '正在整理：先補哪一格、放大哪一個成功', old: '找到最卡的一格之後，這裡會長出三個機會' },
    map: { label: '附近', st: 6, old: '找客的名單，會在地圖上長出來' },
    time: { label: '時間花在哪', st: 7, old: '一週的時間還沒問，第②站會問' },
    rhythm: { label: '節奏', st: 7, now: '正在約：開門、打烊的時間' },
    mods: { label: '模組', st: 7 },
    next: { label: '這一週', old: '訪談結束前，我們一起定第一件事' }
  };
  var ORDER_LIVE = ['asks', 'who', 'offer', 'data', 'aim', 'people', 'success', 'flow', 'assets', 'opps', 'map', 'time', 'rhythm', 'mods', 'today'];
  /* 日常：第一屏一定是今天（要複製的成功＋三件事）；「想問你」畫在今天那一塊裡、緊接在三件事下面（room），不把第一屏往下推 */
  /* 「時間花在哪」只在訪談中畫：用來算可以交出去幾小時，每天用不到（那幾件事在星圖裡點得到） */
  var ORDER_DAY = ['today', 'asks', 'mods', 'who', 'offer', 'people', 'aim', 'assets', 'flow', 'success', 'opps', 'map', 'data', 'rhythm', 'next'];
  var ORDER_OLD = ['asks', 'today', 'mods', 'who', 'offer', 'people', 'aim', 'assets', 'flow', 'success', 'time', 'opps', 'map', 'data', 'rhythm', 'next'];
  /* ── v14 做成你的形狀（介面約定：/Users/nelsen/wip/v14-work-20261003/介面約定.md 第 3 節）──
     第一屏（今天，想問你、一行提醒都在今天那一塊裡）固定；以下分成五組，收著的組只佔標題一行加一句現況。
     有地圖的 layout 就照它排（組名、順序、哪幾塊、開或收）；沒有就用這張預設表。訪談中不分組（照 foldLive）。 */
  var GROUP_DEF = [
    { id: 'running', label: '在跑的做法', secs: ['mods'], open: false },   // 10/3 Q：預設也收著，今天三件已經在第一屏
    { id: 'biz', label: '你的生意', secs: ['who', 'offer', 'people', 'aim', 'assets'], open: false },
    { id: 'find', label: '找客人', secs: ['flow', 'success', 'opps', 'map'], open: false },
    { id: 'rhythm', label: '節奏與資料', secs: ['rhythm', 'data', 'next'], open: false },
    { id: 'yours', label: '你加的', tools: true, open: false }
  ];
  var FIRST = { today: 1, asks: 1, alert: 1 };   // 第一屏的東西：layout 搬不出來，也搬不進去
  var EVT = { open: '開門', close: '打烊', week: '盤點', day: '換天' };
  var VSTATE = { ok: '夠', low: '快不夠', out: '不夠', check: '先對一下數字' };   // 狀態只照 pack.views 算好的 state，前端不重算
  var MACT = { done: '做了', skip: '先不做', pick: '選了', revert: '回到上一版', pause: '先收起來' };
  var UNDO_S = 5;   // 模組按鈕：按一下定案，5 秒內可以收回，之後才寫進經營資料夾
  var STATION_NOW = { 1: 'offer', 2: 'aim', 3: 'people', 4: 'flow', 5: 'aim', 6: 'opps', 7: 'rhythm' };
  var STATION_GO = { 1: ['who'], 2: ['aim'], 3: ['people', 'success'], 4: ['flow'], 5: ['aim', 'assets'], 6: ['opps', 'map', 'who'], 7: ['today', 'mods', 'rhythm', 'time'] };
  /* 存下來的四種（SCALE 的 E，越用越厚）；今天的事存進哪一種 */
  var ASSET = { list: '自己的名單', site: '官網與商家頁', search: '被搜得到', flow: '不用人工的流程' };
  var GROWS = { list: '做完名單多一筆', site: '做完官網多一筆', search: '做完搜尋多一筆', flow: '做完流程多一步' };
  var PLACE = { group: '社團', hub: '聚點', list: '名錄', event: '活動' };
  var ASSET_ICON = {
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M2.8 19c.6-3 2.7-4.8 5.2-4.8s4.6 1.8 5.2 4.8"/><path d="M15 7h6M15 11h6M16.5 15H21"/></svg>',
    site: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18"/><circle cx="6.2" cy="6.8" r=".5"/><circle cx="8.4" cy="6.8" r=".5"/><path d="M7 13h6M7 16h4"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/><path d="M8 10.5h5"/></svg>',
    flow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h11.5l-3-3"/><path d="M20 15.5H8.5l3 3"/><circle cx="18.5" cy="8.5" r="1.6"/><circle cx="5.5" cy="15.5" r="1.6"/></svg>'
  };

  var reduced = function () { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var now = function () { return global.performance ? global.performance.now() : Date.now(); };
  var CLOCK0 = now(), REG = {}, NM = '小二';   // NM：他的小二叫什麼（companion.name），畫面上指小二的字都用它
  function clock() { return (now() - CLOCK0) / 1000; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* 標題斷行：照詞切開，每個詞包成不會被拆開的一段（「想做」「巷子裡」不會斷在中間）；沒有切詞功能的瀏覽器照原本的樣子 */
  var SEG = null; try { SEG = new Intl.Segmenter('zh-Hant', { granularity: 'word' }); } catch (e) { SEG = null; }
  function wb(text) {
    text = String(text == null ? '' : text); if (!SEG) return esc(text);
    var toks = [];   // 標點黏在前一個詞後面（不讓「；」「。」跑到行首）
    try { for (var it = SEG.segment(text)[Symbol.iterator](), r = it.next(); !r.done; r = it.next()) { var w = r.value.segment; if (toks.length && /^[，。、；：！？」）』…]+$/.test(w)) toks[toks.length - 1] += w; else toks.push(w); } } catch (e) { return esc(text); }
    return toks.map(function (w) { return /^\s+$/.test(w) || Array.from(w).length < 2 ? esc(w) : '<span class="c3-w">' + esc(w) + '</span>'; }).join('');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmt(n) { if (n == null || isNaN(n)) return ''; var r = Math.round(n * 10) / 10; return r.toLocaleString('en-US', { maximumFractionDigits: 1 }); }
  function cn(n) { return n >= 0 && n <= 10 ? CN[n] : String(n); }
  /* 機會的種類「交給小二」是資料值；畫面上換成他取的名字（交給阿福） */
  function kindName(k) { return String(k || '').replace(/小二/g, NM); }
  function fam(src) { return src === 'calc' || src === 'youest' ? 'est' : src; }
  function g(src) { return src ? '<i class="c3-g ' + esc(fam(src)) + '" title="' + esc(SRC[src] || '') + '"></i>' : ''; }
  function tap(key) { return key ? ' role="button" tabindex="0" data-src="' + esc(key) + '"' : ''; }
  var SAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7.2H7.4L4.6 13v-2.3H2.5z"/></svg>';
  var WRONG_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 12.8 3.6 10l6.9-6.9a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2L6 12.4z"/><path d="M9.6 4l2.4 2.4"/></svg>';
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-6.8"/></svg>';
  var COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V3.6c0-.6-.5-1.1-1.1-1.1H3.6c-.6 0-1.1.5-1.1 1.1v5.8c0 .6.5 1.1 1.1 1.1h1.9"/></svg>';
  var CLOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M8 5v3.2l2.1 1.4"/></svg>';
  var PIN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2s4.6-4.1 4.6-7.6a4.6 4.6 0 0 0-9.2 0c0 3.5 4.6 7.6 4.6 7.6z"/><circle cx="8" cy="6.6" r="1.6"/></svg>';
  var HOW_ICON = {
    photo: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4.2" width="12" height="9" rx="2"/><circle cx="8" cy="8.7" r="2.3"/><path d="M5.6 4.2l.9-1.6h3l.9 1.6"/></svg>',
    folder: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.4c0-.6.4-1 1-1h3.2l1.4 1.5H13c.6 0 1 .4 1 1v6.4c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/></svg>',
    connector: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.7 9.3l2.6-2.6"/><path d="M8.6 4.4l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1"/><path d="M7.4 11.6l-1 1a2.6 2.6 0 0 1-3.7-3.7l1-1"/></svg>',
    said: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7.2H7.4L4.6 13v-2.3H2.5z"/></svg>'
  };
  /* 這不對：安靜的一顆，按了複製一句帶位置的話，貼回對話就好（畫面上不讓他填東西） */
  function wrong(name, line, dark) {
    var s = SEC[name] || { label: name }, where = (s.st ? '第' + CIRC[s.st] + '站・' : '') + s.label;
    return '<button class="c3-wrong' + (dark ? ' dark' : '') + '" type="button" data-wrong="' + esc(where) + '" data-line="' + esc(line || '') + '">' + WRONG_ICON + '<span>這不對</span></button>';
  }
  /* 10/3：複製鍵只留真的要貼回對話的地方——訪談中的「這不對」、草稿、「想問你」（調整器那三句在 companion.js）。
     日常各塊不再放「跟小二說」：想改什麼，直接在對話裡說就好 */
  function actBtn(C, name, line, dark) { return C.live ? wrong(name, line, dark) : ''; }
  function eyebrow(label, extra) { return '<div class="c3-eyebrow"><b class="c3-n"></b><span>' + esc(label) + '</span>' + (extra || '') + '</div>'; }
  function head(C, name, line, extra, btnLine) { return '<header class="c3-head">' + eyebrow(SEC[name] ? SEC[name].label : name, extra) + '<div class="c3-head-row"><h2>' + wb(line) + '</h2>' + actBtn(C, name, btnLine == null ? line : btnLine) + '</div></header>'; }
  function waitSec(name, C) {
    var s = SEC[name], line = C.old ? s.old : s.now;
    return '<section class="c3-sec is-wait' + (name === 'offer' ? ' c3-offer' : '') + '" data-sec="' + name + '"><header class="c3-head">' + eyebrow(s.label) +
      '<div class="c3-head-row"><h2 class="c3-wait"><span class="c3-dots" aria-hidden="true"><i></i><i></i><i></i></span>' + esc(line) + '</h2></div></header></section>';
  }
  function softLine(text) { return '<p class="c3-soft"><span class="c3-dots" aria-hidden="true"><i></i><i></i><i></i></span>' + esc(text) + '</p>'; }
  function bracket(s) { return '<div class="c3-bracket"><b>[</b><span>' + esc(s) + '</span><b>]</b></div>'; }
  /* 數字滾動：每一位數是一條 0–9 的直條，靜止時停在正確的數字；第一次看到、或數字真的變了，才轉到位（oid＝這個數字是誰） */
  function odo(text, oid) {
    text = String(text == null ? '' : text);
    return '<span class="c3-odo"' + (oid ? ' data-oid="' + esc(oid) + '" data-v="' + esc(text) + '"' : '') + '><span class="c3-sr">' + esc(text) + '</span><span class="c3-odo-in" aria-hidden="true">' + text.split('').map(function (ch) {
      if (/\d/.test(ch)) { var col = ''; for (var k = 0; k < 20; k++) col += '<i>' + (k % 10) + '</i>'; return '<span class="c3-dg" data-d="' + ch + '"><span class="ph">0</span><span class="c3-strip" style="transform:translateY(-' + (+ch + 10) + 'em)">' + col + '</span></span>'; }
      if (ch === ' ') return '<span class="c3-sp"></span>';
      var cjk = /[　-鿿＀-￯]/.test(ch), pos = text.search(/\d/);
      return '<span class="c3-ch' + (cjk ? ' cjk ' + (pos < 0 || text.indexOf(ch) < pos ? 'pre' : 'suf') : '') + '">' + esc(ch) + '</span>';
    }).join('') + '</span></span>';
  }

  /* ── v14：伺服器算好的東西（/api/state 的 pack）與模組的兩種 ──
     前端畫積木只讀 pack.views（狀態、還能用幾天、差額都是伺服器算的）；安全模式（?safe=1）一律當沒有 view、沒有提醒。 */
  function packOf(C) { var p = C.pack !== undefined ? C.pack : (C.R && C.R.opts ? C.R.opts.pack : null); return p && typeof p === 'object' ? p : null; }
  function viewsOf(C) { var p = packOf(C); return !C.safe && p && p.views && typeof p.views === 'object' ? p.views : {}; }
  function viewOf(C, id) { var v = viewsOf(C)[id]; return v && typeof v === 'object' && Array.isArray(v.blocks) ? v : null; }
  function halted(C, id) { var v = viewsOf(C)[id]; return !!(v && v.halted === true); }
  /* 這個模組真的還有幾份上一版（pack.back，伺服器數「模組/.舊版/」裡的檔）：有才放「回到上一版」。不看 rev（舊版可能已經被回到上一版用掉了） */
  function backs(C, id) { var p = packOf(C), b = p && p.back && typeof p.back === 'object' ? p.back[id] : 0; return num(b) && b > 0 ? b : 0; }
  function isTool(x) { return !!x && x.kind === 'tool'; }
  function isMine(x) { return !!x && (x.from === 'mine' || /^my-/.test(String(x.id || ''))); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function modsOf(m) { var it = (((m || {}).mods || {}).items); return Array.isArray(it) ? it.filter(isObj) : []; }
  /* 存著的某一塊被直接改壞（例如 mods.items、today.items、people.types 寫成物件；伺服器讀檔時沒有舊版可以比，照原樣交來）：
     那一塊修成畫得出來的樣子（清單壞了當作空的、整塊不是一份資料就拿掉）、記下名字，頂上講一句；其他塊照畫，整頁不會因為它打不開 */
  var MAP_SECS = ['store', 'scale', 'who', 'key', 'flow', 'success', 'time', 'opps', 'map', 'data', 'next', 'persona', 'stage', 'purpose', 'people', 'goals', 'today', 'log', 'rhythm', 'offer', 'assets', 'asks', 'mods', 'companion', 'layout'];
  var SEC_WORD = { store: '店名', scale: 'SCALE', who: '我理解的你', key: '最重要的數字', flow: '六格', success: '成功公式', time: '時間花在哪', opps: '三個機會', map: '附近', data: '資料', next: '這一週', persona: '本命', stage: '訪談進度', purpose: '目的', people: '你的客人', goals: '目標', today: '今天', log: '紀錄', rhythm: '節奏', offer: '你的招牌', assets: '存下來的', asks: '想問你', mods: '模組', companion: '小二', layout: '版面' };
  var SEC_LISTS = { today: ['items'], asks: ['items'], mods: ['items'], people: ['types'], goals: ['items', 'lead'], assets: ['items'], opps: ['items'], map: ['pins'], data: ['lanes'], who: ['facts'], offer: ['items', 'special'], log: ['items'], rhythm: ['runs', 'intake'], time: ['week'], success: ['terms'] };
  function tidyModel(model) {
    var m = isObj(model) ? Object.assign({}, model) : {}, bad = [];
    MAP_SECS.forEach(function (k) {
      if (m[k] == null) return;
      if (!isObj(m[k])) { delete m[k]; bad.push(k); return; }
      var sec = null;
      (SEC_LISTS[k] || []).forEach(function (f) {
        var v = m[k][f]; if (v == null) return;
        var ok = Array.isArray(v) ? v.filter(isObj) : [];
        if (!Array.isArray(v) || ok.length !== v.length) { sec = sec || Object.assign({}, m[k]); sec[f] = ok; }
      });
      if (k === 'flow' && m.flow.nodes != null && !isObj(m.flow.nodes)) { sec = sec || Object.assign({}, m.flow); sec.nodes = {}; }
      if (k === 'persona' && m.persona.sign != null && !(isObj(m.persona.sign) && Array.isArray(m.persona.sign.stars))) { sec = sec || Object.assign({}, m.persona); delete sec.sign; }
      if (sec) { m[k] = sec; bad.push(k); }
    });
    return { m: m, bad: bad };
  }
  /* 一塊畫不出來（形狀整理也沒接住的那種）：只換掉那一塊，講一句 */
  function brokenSec(name) {
    return '<section class="c3-sec c3-broken" data-sec="' + esc(name) + '"><p class="c3-vnote">' + esc((SEC_WORD[name] || '這一塊') + '畫不出來，先跳過；跟' + NM + '說一聲，請' + NM + '把這一塊重交一次。') + '</p></section>';
  }
  function modById(m, id) { return modsOf(m).filter(function (x) { return x.id === id; })[0] || null; }
  function running(x) { return x.st === 'try' || x.st === 'on'; }
  /* 第一屏的一行提醒：伺服器只從名單列的「快不夠」「不夠」算，對不上先停的模組不算；這裡再擋一次（停了、收起來的模組不亮），字一律跳脫 */
  function alertsOf(m, C) {
    var p = packOf(C); if (C.safe || !p || !Array.isArray(p.alerts)) return [];
    return p.alerts.filter(function (a) {
      if (!a || typeof a.text !== 'string' || !a.text) return false;
      if (a.mod != null && halted(C, a.mod)) return false;
      var x = a.mod != null ? modById(m, a.mod) : null;
      return !x || running(x);
    });
  }
  /* 小二換成照片、照片讀不到（檔不見、檔頭不對、伺服器擋下）：companion.js 自己畫回原本的小二，第一屏多講一句 */
  function photoBad(C) {
    var cfg = (C.R || {}).cfg, X = global.XiaoerCompanion;
    return !C.safe && !!cfg && cfg.skin === 'photo' && !!cfg.photo && !!(X && X.photoStatus) && X.photoStatus(cfg.photo.file) === 'bad';
  }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function signed(n) { return n > 0 ? '+' + fmt(n) : n < 0 ? '−' + fmt(-n) : '0'; }

  /* ── 日期 ── */
  function parseD(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function localDate() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dayDiff(a, b) { var A = parseD(a), B = parseD(b); return A && B ? Math.round((A - B) / 86400000) : 0; }
  function md(s) { var d = parseD(s); return d ? (d.getMonth() + 1) + '/' + d.getDate() : ''; }
  function wd(s) { var d = parseD(s); return d ? (d.getDay() + 6) % 7 : 0; }
  function daysText(on) {
    on = (on || []).slice().sort(); var k = on.join(',');
    if (k === '0,1,2,3,4,5,6') return '每天'; if (k === '0,1,2,3,4') return '週一到週五'; if (k === '0,1,2,3,4,5') return '週一到週六'; if (k === '5,6') return '週末';
    return '週' + on.map(function (i) { return DAYS[i]; }).join('、');
  }

  /* ── 達成率＝（現在－起點）÷（目標－起點）；畫面上的那一句照 goal-gradient：未滿一半寫已經做到的，過半寫還差的 ── */
  function rate(x) { return (x.now - x.base) / (x.target - x.base); }
  function moved(x) { var dir = x.target >= x.base ? 1 : -1; return { done: Math.max(0, (x.now - x.base) * dir), left: Math.max(0, (x.target - x.now) * dir) }; }
  function gradientLine(r, parts) {
    if (r >= 1) return '達成了';
    var key = r < .5 ? 'done' : 'left', units = {}, order = [];
    parts.forEach(function (p) { var u = p.unit || ''; if (!(u in units)) { units[u] = 0; order.push(u); } units[u] += p[key]; });
    return (r < .5 ? '已完成 ' : '還差 ') + order.map(function (u) { return fmt(units[u]) + (u ? ' ' + u : ''); }).join('、');
  }
  /* 整體：單位都一樣（例如都是「家」）就用加總套同一條算式——已完成 2 家／目標 6 家＝33%，跟圓環下那一句對得上；
     單位不一樣（家、元）加總沒有意義，才用每個目標達成率的平均（每個最多算 100%） */
  function overall(gl) {
    var items = (gl && gl.items) || []; if (!items.length) return null;
    var parts = items.map(function (x) { var mv = moved(x); return { done: mv.done, left: mv.left, unit: x.unit, span: Math.abs(x.target - x.base) }; });
    var same = parts.every(function (q) { return q.unit === parts[0].unit; }), r, total = 0;
    if (same) { var d = 0; parts.forEach(function (q) { d += Math.min(q.done, q.span); total += q.span; }); r = total ? d / total : 0; }
    else r = items.map(function (x) { return Math.max(0, Math.min(1, rate(x))); }).reduce(function (a, b) { return a + b; }, 0) / items.length;
    return { r: r, parts: parts, same: same, total: same ? total : null, unit: same ? parts[0].unit : null };
  }
  function period(gl, date) {
    if (!gl) return null; var span = dayDiff(gl.to, gl.from), gone = dayDiff(date, gl.from), left = dayDiff(gl.to, date);
    return { from: md(gl.from), to: md(gl.to), left: left, frac: span > 0 ? Math.max(0, Math.min(1, gone / span)) : null, txt: left > 0 ? '還有 ' + left + ' 天' : left === 0 ? '今天到期' : '已經到期' };
  }

  function leakNode(m) { var ns = (m.flow || {}).nodes || {}; for (var i = 0; i < NODES.length; i++) if ((ns[NODES[i]] || {}).st === 'leak') return NODES[i]; return null; }
  function states(m) { var ns = (m.flow || {}).nodes || {}; return NODES.map(function (n) { return (ns[n] || {}).st || 'unknown'; }); }
  function wonCount(m) { return ((m.map || {}).pins || []).filter(function (p) { return p.st === 'won'; }).length; }
  function unitOf(ty) { return ty.unit || (/公司|行號|店家|一家/.test((ty.name || '') + (ty.who || '') + (ty.value || '')) ? '家' : '位'); }   // 有寫 unit 就用它；沒寫才從名字猜

  /* 星圖上的點：畫面上每一件事一顆點，點的樣子照出處；同一句話只算一顆 */
  function graphOf(m) {
    var dots = [], seen = {}, at = {}, srcs = m.sources || {}, path = '';
    function srcOf(key, fb) { return ((srcs[key] || {}).src) || fb; }
    function add(id, src, hub, label, key, pin) {   // path：這顆點對應地圖上的哪一件事（本命星座用它指星）
      if (!src || !label) return; var norm = String(label).replace(/\s+/g, '');
      if (seen[norm] != null) { at[path] = seen[norm]; return; }
      seen[norm] = at[path] = dots.length;
      dots.push({ id: id, src: src, hub: hub || null, label: label, key: key || null, pin: pin == null ? null : pin, path: path });
    }
    function P(p) { path = p; return true; }
    var w = m.who || {}, fl = m.flow || null, ns = (fl && fl.nodes) || {}, leak = leakNode(m), k = m.key;
    (w.facts || []).forEach(function (f, i) { P('who.facts.' + i) && add('fact:' + f.t, f.src, null, f.t, f.key); });
    if (w.fix) P('who.fix') && add('fix:' + w.fix.q, w.fix.src || 'said', null, '你改過：' + w.fix.q);
    if (m.purpose) P('purpose') && add('purpose', m.purpose.src || 'said', null, '目的：' + m.purpose.line, m.purpose.key);
    var of = m.offer;
    if (of) {
      P('offer') && add('offer', 'said', null, '你賣的：' + of.line);
      (of.items || []).forEach(function (x, i) { P('offer.items.' + i) && add('oitem:' + x.t, srcOf(x.key, 'said'), null, x.t + (x.price ? '・' + x.price : ''), x.key); });
      (of.special || []).forEach(function (x, i) { P('offer.special.' + i) && add('osp:' + x.t, x.src, null, x.t + '：' + x.proof, x.key); });
    }
    var as = m.assets; if (as) (as.items || []).forEach(function (x, i) { P('assets.items.' + i) && add('asset:' + x.kind, x.src, null, (ASSET[x.kind] || '') + '：' + x.t + (x.now != null ? ' ' + x.now + ' ' + x.unit : ''), x.key); });
    var pp = m.people;
    if (pp) {
      (pp.types || []).forEach(function (ty, i) { P('people.types.' + i) && add('ptype:' + ty.name, ty.src, ty.lane === 'new' ? '找客' : ty.lane === 'return' ? '回客' : null, ty.name + '：' + ty.who, ty.key); });
      if (pp.cycle) P('people.cycle') && add('cycle', pp.cycle.src, '回客', '平常 ' + pp.cycle.days + ' 天回來一次', pp.cycle.key);
      if (pp.rule) P('people.rule') && add('rule', srcOf(pp.rule.key, 'said'), '回客', '很久沒來 ' + pp.rule.dormant + '／' + pp.rule.total, pp.rule.key);
    }
    if (k) P('key') && add('key:' + k.label, k.src || 'est', k.kind === 'leak' ? leak : null, k.label + '：' + k.value + (k.unit || ''), k.key);
    var s = m.success; if (s) (s.terms || []).forEach(function (tm, i) { var last = i === s.terms.length - 1; P('success.terms.' + i) && add('succ:' + tm.k, last ? (tm.src || 'calc') : 'said', null, tm.k + '：' + tm.v, last ? tm.key : null); });
    var gl = m.goals; if (gl) (gl.items || []).forEach(function (x, i) { P('goals.items.' + i) && add('goal:' + x.t, srcOf(x.key, 'said'), x.lane === 'new' ? '找客' : x.lane === 'return' ? '回客' : null, x.t + '：' + fmt(x.target) + ' ' + x.unit, x.key); });
    var ti = m.time;
    if (ti) {
      (ti.week || []).forEach(function (x, i) { P('time.week.' + i) && add('time:' + x.n, srcOf(x.key, 'youest'), null, x.n + '：一週 ' + x.h + ' 小時', x.key); });
      if (ti.free) P('time.free') && add('free', ti.free.src, null, ti.free.label, ti.free.key);
      if (ti.handoff) P('time.handoff') && add('hand', ti.handoff.src, null, '一週約 ' + ti.handoff.v + ' 小時可以交給' + NM, ti.handoff.key);
    }
    NODES.forEach(function (n) { var x = ns[n]; if (x && x.why) P('flow.nodes.' + n) && add('why:' + n, 'said', n, n + '：' + x.why); });
    NODES.forEach(function (n) { var x = ns[n]; if (x && x.now) P('flow.nodes.' + n + '.now') && add('now:' + n, 'said', n, n + '現在：' + x.now); });
    if (fl && fl.eq) (fl.eq.inputs || []).forEach(function (x, i) { P('flow.eq.inputs.' + i) && add('eq:' + x[0], 'est', leak, x[0] + ' ' + x[1], fl.eq.key); });
    if (fl && fl.funnel) (fl.funnel.rows || []).forEach(function (r, i) { P('flow.funnel.rows.' + i) && add('fun:' + r[0], srcOf(fl.funnel.key, 'data'), leak, r[0] + ' ' + r[1], fl.funnel.key); });
    var o = m.opps;
    if (o) (o.items || []).forEach(function (it, i) {
      var hub = NODES.indexOf(it.node) >= 0 ? it.node : null;
      P('opps.items.' + i) && add('opp:' + it.t, srcOf(it.key, 'est'), hub, kindName(it.kind) + '：' + it.t, it.key);
      (it.ctx || []).forEach(function (c, j) { P('opps.items.' + i + '.ctx.' + j) && add('ctx:' + c[0], c[1], hub, c[0]); });
    });
    var mp = m.map; if (mp) (mp.pins || []).forEach(function (p, i) { P('map.pins.' + i) && add('pin:' + p.n, p.src || 'web', '找客', p.n + '・' + p.chip, null, i); });
    var da = m.data; if (da) (da.lanes || []).forEach(function (l, li) { (l.items || []).forEach(function (it, j) { P('data.lanes.' + li + '.items.' + j) && add('data:' + it[0], l.cls === 'on' ? 'data' : 'said', null, it[0]); }); });
    var hubs = {}; NODES.forEach(function (n) { hubs[n] = { st: (ns[n] || {}).st || 'unknown' }; });
    var sg = (m.persona || {}).sign, sign = null;   // 本命星座：挑出來的那幾顆星（指不到的就略過）
    if (sg && sg.stars) { var idx = []; sg.stars.forEach(function (p) { var i = at[p]; if (i != null && idx.indexOf(i) < 0) idx.push(i); }); if (idx.length > 1) sign = { name: sg.name, line: sg.line, stars: idx }; }
    return { dots: dots, hubs: hubs, sign: sign, title: '你的星圖 / ' + ((m.store || {}).name || ''), loop: (m.scale || {}).loop || 1, step: (m.scale || {}).step || 'S' };
  }

  /* ── 頂端：字標、店、圖例。
     10/3：拿掉頂上那條五步框架進度（第幾圈、第幾步）——訪談中跟站數條重複成兩條，日常學員也用不到；
     五步只留在資料裡（graphOf 的 loop／step），小二盤點時在對話裡講 ── */
  function top(m, C) {
    var st = m.store || {}, brand = C.brand;
    return '<div class="c3-top' + (brand ? '' : ' nobrand') + '">' + (brand ? '<div class="c3-brand"><span class="c3-icon" data-face="icon" aria-hidden="true"></span><span class="c3-word" title="小二・讓客人來，也讓客人回">小二</span>' + (NM !== '小二' ? '<span class="c3-nm">' + esc(NM) + '</span>' : '') +
      '<span class="c3-store"><b>' + esc(st.name || '你的店') + '</b>' + (st.meta ? '<small>' + esc(st.meta) + '</small>' : '') + '</span></div>' : '') +
      '<div class="c3-legend" aria-label="點的出處">' + ['said', 'data', 'web', 'est'].map(function (k) { return '<span>' + g(k) + SRC[k] + '</span>'; }).join('') + '</div>' + notes(C) + '</div>';
  }
  /* v14：頂上的三種一行告示（都由這裡寫字，伺服器只給事實）：安全模式、程式被改過、這次先用上一份合格的地圖 */
  function notes(C) {
    var p = packOf(C) || {}, it = p.integrity, fb = p.fallback, out = '';
    if (C.safe) out += '<div class="c3-note is-safe" role="status"><b>安全模式</b><span>' + esc('只畫內建的塊；' + NM + '自己長的先不畫，' + NM + '也先用畫的樣子。') + '</span><button type="button" class="c3-notebtn" data-safe-exit>回到平常的樣子</button></div>';
    if (it && it.ok === false && it.checked !== false) {
      var n = Array.isArray(it.changed) ? it.changed.length : 0, can = it.can_restore !== false;
      out += '<div class="c3-note is-warn" role="alert"><b>經營室的程式被改過</b><span>' + esc((n ? n + ' 個檔' : '有檔案') + '跟安裝時不一樣。' + (can ? '還原成原版就好，你的經營資料不會動。' : '這一次沒辦法從畫面還原；跟' + NM + '說「重新安裝經營室」，你的經營資料不會動。')) + '</span>' +
        (can ? '<button type="button" class="c3-notebtn" data-restore>還原成原版</button>' : '') + '</div>';
    }
    // 原因（reason）是伺服器寫給他看的一句白話；detail、檔名是給小二看的，畫面不放
    var bad = ((C.R || {}).bad || []).filter(function (k) { return SEC_WORD[k]; });
    if (bad.length) { var bw = bad.map(function (k) { return SEC_WORD[k]; }).join('、'); out += '<div class="c3-note" role="status"><b>有幾塊先空著</b><span>' + esc(bw + '的資料格式不對，先空著；跟' + NM + '說「' + bw + '重交一次」，其他照常。') + '</span></div>'; }
    if (fb && fb.used) out += '<div class="c3-note" role="status"><b>這次先用上一份</b><span>' + esc((typeof fb.reason === 'string' && fb.reason ? fb.reason.replace(/[。.]$/, '') + '。' : '經營資料有一塊沒過檢查，先畫上一份合格的。') + NM + '照原因改好再交，這一條就會收起來。') + '</span></div>';
    return out ? '<div class="c3-notes">' + out + '</div>' : '';
  }

  /* ── 訪談進度：七站，現在在第幾站；按一站就捲到那一塊 ── */
  function stations(m, C) {
    var st = m.stage || {}, at = st.at || 1, of = st.of || 7, list = [];
    for (var i = 1; i <= of; i++) list.push(of === 7 ? STATIONS[i - 1] : (i === at && st.label ? st.label : '第 ' + i + ' 站'));
    var cur = of === 7 ? STATIONS[at - 1] : (st.label || '');
    return '<nav class="c3-stations" aria-label="訪談進度"><div class="c3-st-now"><span class="k">訪談中</span><b>第 ' + at + ' 站<em>／' + of + '</em></b><span class="l">' + esc(cur) + '</span></div>' +
      '<ol style="--n:' + of + '">' + list.map(function (name, i) {
        var n = i + 1, cls = n < at ? 'done' : n === at ? 'on' : '';
        return '<li class="' + cls + '"' + (n === at ? ' aria-current="step"' : '') + '><button type="button" data-go="' + n + '" aria-label="第 ' + n + ' 站：' + esc(name) + (n < at ? '（問過了）' : n === at ? '（現在）' : '') + '"><i>' + (n < at ? CHECK : n) + '</i><span>' + esc(name) + '</span></button></li>';
      }).join('') + '</ol><div class="c3-st-new" hidden></div></nav>';
  }

  /* ── 想問你：排程跑的時候他不在，小二留下要問的事（最多三則）。不放輸入框，回到對話說就好；按一下複製題目 ── */
  function asksInner(m) {
    var items = ((m.asks || {}).items) || []; if (!items.length) return '';
    return '<header class="c3-askhead"><b>想問你</b><span>回到對話跟' + esc(NM) + '說就好</span></header><ul class="c3-asklist">' + items.map(function (x) {
      return '<li><button type="button" class="c3-card c3-askcard" data-ask="' + esc('【經營室・想問你】「' + x.q + '」我的回答是：') + '"><span class="ic" aria-hidden="true">' + SAY_ICON + '</span><span class="q"><b>' + esc(x.q) + '</b>' + (x.why ? '<small>' + esc(x.why) + '</small>' : '') + '</span><em>' + esc(md(x.date)) + '</em></button></li>';
    }).join('') + '</ul>';
  }
  /* 訪談中自己一塊；訪談完「想問你」放進今天那一塊、緊接在三件事下面（room 畫），不排在要複製的成功那張大卡後面 */
  function asks(m, C) {
    if (!C.live && m.today) return null;
    var inner = asksInner(m); return inner ? '<section class="c3-sec c3-asks" data-sec="asks">' + inner + '</section>' : null;
  }

  /* ── 今天 ──
     訪談中（第⑦站之後）：今天的事一張一張排（卡片同一種）。
     日常（訪談完）：第一屏是「要複製的成功」——左邊那一型客人的畫像與離目標多遠，中間小二（他訂製的那一隻）在一圈圈像這一型的公司中間，
     上面是開門那一句與小二現在在做什麼，下面是一天的時間軸，右邊是今天的事（01／02／03 對到時間軸）。
     這一塊分成幾個小部分（data-part）：按鈕只換有變的那幾個，圓圈與時間軸的畫布不重建、不重轉。 */
  function today(m, C) {
    var td = m.today; if (!td) return null;
    return C.live ? todayLive(m, C) : room(m, C);
  }
  function todayInfo(m, C) {
    var td = m.today, items = orderToday(C, td), all = td.items || [];
    var rel = dayDiff(td.date, C.date), num = {}; all.forEach(function (x, i) { num[x.id] = i; });
    var nDone = items.filter(function (x) { return x.status === 'done'; }).length, nOpen = items.filter(function (x) { return (x.status || 'todo') === 'todo'; }).length;
    var runs = ((m.rhythm || {}).runs) || [], open = runs.filter(function (r) { return r.kind === 'open'; })[0], close = runs.filter(function (r) { return r.kind === 'close'; })[0];
    var next = all.filter(function (x) { return (x.status || 'todo') === 'todo'; })[0] || null;
    return { td: td, items: items, all: all, rel: rel, num: num, nDone: nDone, nOpen: nOpen, open: open, close: close, next: next };
  }
  function jobsHead(I, C, big) {
    var items = I.items, rel = I.rel, title = (rel === 0 ? '今天' : rel === 1 ? '明天' : rel === -1 ? '昨天' : md(I.td.date) + ' 的') + cn(items.length) + '件事';
    if (!items.length) title = (rel === 0 ? '今天' : rel === 1 ? '明天' : rel === -1 ? '昨天' : md(I.td.date) + ' ') + '的事先空著';   // 只有存著的清單壞了（先空著）才會是 0 件
    var dots = '<span class="c3-tdots" aria-hidden="true">' + I.all.map(function (x) { return '<i class="d-' + (x.status || 'todo') + '"></i>'; }).join('') + '</span>';
    var prog = !items.length ? '' : I.nDone && !I.nOpen ? '<span class="c3-alldone">' + CHECK + '都處理好了' + dots + '</span>' : '<span class="c3-tprog">做了 <b>' + I.nDone + '</b>／' + items.length + dots + '</span>';
    var stale = '';   // 過期時日期只寫一次（眉標「上一次的清單・9/2 週三」），今天還沒排的事寫在晨報
    return '<header class="c3-head c3-jhead">' + eyebrow(rel === 0 ? '今天' : rel === 1 ? '明天' : rel < 0 ? '上一次的清單' : '之後', '<em class="c3-date">' + esc(md(I.td.date)) + ' 週' + DAYS[wd(I.td.date)] + '</em>' + stale) +
      '<div class="c3-head-row"><h2>' + (big ? '<span class="c3-tt">' + esc(title) + '<i class="c3-stop" aria-hidden="true"></i></span>' : esc(title)) + prog + '</h2>' +
      actBtn(C, 'today', title) + '</div></header>';
  }
  function echoHTML(C) { return C.echo ? '<div class="c3-echo' + (C.echo.err ? ' err' : '') + '" role="status"><b>' + esc(C.echo.lines[0]) + '</b>' + (C.echo.lines[1] ? '<span>' + esc(C.echo.lines[1]) + '</span>' : '') + '</div>' : '<div class="c3-echo is-empty" role="status"></div>'; }
  function todayLive(m, C) {
    var I = todayInfo(m, C);
    return '<section class="c3-sec c3-today" data-sec="today">' + jobsHead(I, C) + '<ol class="c3-jobs">' + I.items.map(function (x) { return job(x, I.num[x.id], C, m); }).join('') + '</ol>' + echoHTML(C) + '</section>';
  }

  /* 時間：「14:00 收完午餐」→ 14；「08:30」→ 8.5 */
  function hoursOf(s) { var mm = /(\d{1,2})[:：](\d{2})/.exec(String(s || '')); return mm ? +mm[1] + +mm[2] / 60 : null; }
  function hhmm(s) { var mm = /(\d{1,2})[:：](\d{2})/.exec(String(s || '')); return mm ? pad2(+mm[1]) + ':' + mm[2] : ''; }
  function nowHours(C) { if (C.now) { var h = hoursOf(C.now); if (h != null) return h; } var d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  function nowText(C) { if (C.now) return hhmm(C.now); var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function norm(s) { return String(s || '').replace(/\s+/g, ''); }
  function same(a, b) { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0 || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4))); }
  function targetsOf(it) { return String(it.to || '').split(/[、,，]/).map(function (s) { return s.trim().split(/\s+/)[0]; }).filter(Boolean); }
  function laneType(m, k) { return (((m.people || {}).types) || []).filter(function (x) { return x.lane === k; })[0] || null; }
  function goalOf(m, k) { return ((((m.goals || {}).items) || []).filter(function (x) { return x.lane === k; }))[0] || null; }
  /* 那一型客人叫什麼：成功公式的標題「張小姐那家，就是…」取「張小姐」＋「型」；讀不出來就用新客那一種的名字 */
  function personOf(m) {
    var s = m.success || {}, h = String(s.headline || '').split(/[，,。：:]/)[0].trim(), base = h.replace(/(那一家|那家|那間|那位|那種|這種|這一型|那一型|型)$/, '').trim();
    if (base && base !== h && Array.from(base).length <= 6) return { base: base, name: base + '型' };
    var ty = laneType(m, 'new'); return { base: '', name: ty ? ty.name : '你要複製的客人' };
  }
  function termOf(m, k) { return (((m.success || {}).terms) || []).filter(function (x) { return x.k === k; })[0] || null; }
  /* 今天按了成交、還沒打烊確認的：只畫成「待打烊確認」，不算進目標 */
  function pendingWins(m, lane) { return (((m.today || {}).items) || []).filter(function (x) { return x.status === 'done' && x.result === 'won' && (!lane || x.lane === lane); }); }

  /* 要複製的成功：圈圈的資料（每一點都是真的一家，或明寫是計數） */
  function successModel(m, C, R) {
    var reg = R.reg, t = clock(), first = !reg.gal, red = reduced();
    var gs = reg.gal || (reg.gal = { built: first && !red ? t + .1 : -99, keys: {}, seatT: {}, signAt: null });
    var pins = ((m.map || {}).pins) || [], tdItems = ((m.today || {}).items) || [], P = personOf(m);
    var tNew = laneType(m, 'new'), tRet = laneType(m, 'return'), gNew = goalOf(m, 'new'), gRet = goalOf(m, 'return'), leads = ((m.goals || {}).lead) || [];
    var orig = pins.filter(function (p) { return p.st === 'past' && P.base && ((p.chip || '') + (p.note || '')).indexOf(P.base) >= 0; })[0] || null;
    // 附近的：今天要碰的先排，地圖上有名字的接著，其他是計數（一點一家；太多就一點代表好幾家）
    var named = [];
    function addNamed(name, extra) { if (!name || (orig && same(name, orig.n))) return; if (named.some(function (x) { return same(x.name, name); })) return; named.push(Object.assign({ name: name }, extra || {})); }
    tdItems.forEach(function (it) { if (it.lane !== 'new') return; targetsOf(it).forEach(function (nm2) { var pin = pins.filter(function (p) { return same(p.n, nm2); })[0]; addNamed(pin ? pin.n : nm2, { short: nm2, pin: pin || null }); }); });
    pins.forEach(function (p) { if (p.st !== 'past') addNamed(p.n, { short: p.n, pin: p }); });
    var total = tNew && tNew.n != null ? Math.max(tNew.n, named.length) : named.length, per = total > 120 ? Math.ceil(total / 120) : 1, nDots = Math.max(named.length, Math.ceil(total / per));
    var near = [], i;
    for (i = 0; i < nDots; i++) {
      var nmd = named[i] || null, pin = nmd && nmd.pin, lv = nmd ? (pin ? (pin.st === 'won' ? 4 : pin.st === 'going' ? 2 : 1) : 1) : 0;
      near.push({ id: nmd ? 'n:' + norm(nmd.name) : 'n#' + i, name: nmd ? nmd.name : null, short: nmd ? nmd.short : null, pin: pin || null, lv: lv });
    }
    // 沒有名字的點：照「這一期要做的量」的數字亮起來（聯絡過幾家、拿到窗口幾家）；數字是真的，哪一點是結構
    var c2 = leads[0] ? leads[0].done : 0, c3 = leads[1] && leads[1].done <= c2 ? leads[1].done : 0;
    var cnt = function (min) { return near.filter(function (d) { return d.lv >= min; }).length; };
    var need3 = Math.max(0, c3 - cnt(3)), need2 = Math.max(0, c2 - cnt(2) - need3);
    near.forEach(function (d) { if (d.lv >= 2) return; if (need3 > 0) { d.lv = 3; need3--; } else if (need2 > 0) { d.lv = 2; need2--; } });
    // 今天按的：做了＝聯絡過，回了／約了＝拿到窗口，成交＝待打烊確認（點先亮到窗口那一級）
    var bump = function (d, it) { var r = it.result, lv = /replied|booked|won/.test(r || '') ? 3 : 2; d.lv = Math.max(d.lv, lv); };
    tdItems.forEach(function (it) { if (it.status !== 'done') return; var tg = targetsOf(it); tg.forEach(function (nm2) { near.forEach(function (d) { if (d.name && same(d.name, nm2)) bump(d, it); }); }); });
    // 訂過的：照三圈的家數（平常會回來 → 開始變少 → 很久沒來）；今天要叫回的、地圖上訂過的，寫上名字
    var past = [], bands = (tRet && tRet.bands) || null;
    if (bands) ['in', 'slip', 'out'].forEach(function (b) { for (var j = 0; j < (bands[b] || 0); j++) past.push({ id: 'p:' + b + j, band: b, name: null, lv: 1 }); });
    var nameOut = function (nm2, full) { if (near.some(function (d) { return d.name && same(d.name, nm2); })) return; var slot = past.filter(function (d) { return d.band === 'out' && !d.name; })[0] || past.filter(function (d) { return !d.name; })[0]; if (slot) { slot.name = nm2; slot.full = full || nm2; } };
    tdItems.forEach(function (it) { if (it.lane === 'return') targetsOf(it).forEach(function (nm2) { nameOut(nm2, it.to); }); });
    pins.forEach(function (p) { if (p.st === 'past' && p !== orig) nameOut(p.n, p.n); });
    tdItems.forEach(function (it) { if (it.status === 'done') targetsOf(it).forEach(function (nm2) { past.forEach(function (d) { if (d.name && same(d.name, nm2)) d.lv = 2; }); }); });
    // 座位：這一期要多的幾家（新客一組、回頭客一組）；成了的坐進去；按了成交還沒確認的畫虛線
    var seats = [], nN = gNew ? Math.max(0, Math.min(12, Math.round(gNew.target - gNew.base))) : 0, nR = gRet ? Math.max(0, Math.min(12, Math.round(gRet.target - gRet.base))) : 0;
    var stepN = nN > 1 ? Math.min(24, 150 / (nN - 1)) : 0, stepR = nR > 1 ? Math.min(24, 80 / (nR - 1)) : 0;
    for (i = 0; i < nN; i++) seats.push({ lane: 'new', angle: -114 - (nN - 1) * stepN / 2 + i * stepN, fill: null, label: '', pend: null });
    for (i = 0; i < nR; i++) seats.push({ lane: 'return', angle: -(nR - 1) * stepR / 2 + i * stepR, fill: null, label: '', pend: null });
    var free = function (lane) { return seats.filter(function (s) { return s.lane === lane && !s.fill && !s.pend; })[0]; };
    var wonN = gNew ? Math.max(0, Math.round(gNew.now - gNew.base)) : 0, wonR = gRet ? Math.max(0, Math.round(gRet.now - gRet.base)) : 0;
    near.forEach(function (d, k) { if (d.lv >= 4 && wonN > 0) { var s = free('new'); if (s) { s.fill = { from: d.id, ring: 'near', idx: k, t: -99 }; s.label = d.short || d.name; wonN--; } } });
    while (wonN-- > 0) { var s2 = free('new'); if (s2) s2.fill = { from: null, t: -99 }; }
    while (wonR-- > 0) { var s3 = free('return'); if (s3) s3.fill = { from: null, t: -99 }; }
    pendingWins(m).forEach(function (it) {
      var s4 = free(it.lane === 'return' ? 'return' : 'new'); if (!s4) return;
      var key = 'pend:' + it.id; if (gs.seatT[key] == null) gs.seatT[key] = first || red ? null : t;
      s4.pend = { id: it.id, t: gs.seatT[key] }; s4.label = targetsOf(it)[0] || it.t;
    });
    Object.keys(gs.seatT).forEach(function (k) { if (!pendingWins(m).some(function (it) { return 'pend:' + it.id === k; })) delete gs.seatT[k]; });
    // 等級的時間表：第一次一顆一顆亮起來；之後變了才從這一刻彈過去（滑鼠、輪詢都不會讓它重來）
    function keysFor(id, lv, k) {
      var ks = gs.keys[id];
      if (!ks) ks = gs.keys[id] = lv ? [[-99, 0], [gs.built < 0 ? -99 : gs.built + .55 + k * .045, lv]] : [[-99, 0]];
      else if (ks[ks.length - 1][1] !== lv) ks.push([red ? -99 : t, lv]);
      if (ks.length > 6) ks.splice(1, ks.length - 6);
      return ks;
    }
    near.forEach(function (d, k) { d.keys = keysFor(d.id, d.lv, k); });
    past.forEach(function (d, k) { d.keys = keysFor(d.id, d.lv, k); });
    var gr = R.gr || { dots: [], sign: null };
    if (gr.sign && gs.signAt == null) gs.signAt = first && !red && reg.justDone ? t + 1 : -99;
    var iN = [], iR = []; seats.forEach(function (s, k) { (s.lane === 'new' ? iN : iR).push(k); });
    var sub = function (x, word) { return x ? word + ' ' + Math.round(x.target - x.base) : ''; };
    var lead0 = leads[0], unit = tNew ? unitOf(tNew) : (gNew && gNew.unit) || '家';   // 量詞照資料（美甲是「位」），不寫死「家」
    return {
      person: P, orig: orig, tNew: tNew, tRet: tRet, gNew: gNew, gRet: gRet, per: per, total: total, namedN: named.length,
      near: near, past: past, seats: seats, seatAngles: seats.map(function (s) { return s.angle; }),
      seatGroups: [{ idx: iN, label: sub(gNew, '第一次來') }, { idx: iR, label: sub(gRet, '又回來') }],
      brain: { dots: gr.dots, sign: gr.sign ? Object.assign({}, gr.sign, { at: gs.signAt }) : null },
      contactTarget: lead0 && lead0.target ? Math.round(lead0.target / per) : 0, contactTargetLabel: lead0 && lead0.target ? '這一期聯絡 ' + fmt(lead0.target) + ' ' + (lead0.unit || unit) : '',
      pastLabel: past.length ? (tRet ? tRet.name : '訂過的') + ' ' + past.length : '', nearLabel: (tNew ? tNew.name : '附近的') + ' ' + fmt(total) + (per > 1 ? '・一點＝' + per + ' ' + unit : ''),
      built: gs.built, unit: unit, uNew: (gNew && gNew.unit) || unit, uRet: (gRet && gRet.unit) || (tRet ? unitOf(tRet) : unit)
    };
  }

  /* 晨報旁的小二：外殼接得住（有 onCompanion）就做成按鈕，點了打開「你的小二」調整器 */
  function capFace(C) {
    if (C.R && C.R.opts && C.R.opts.onCompanion) return '<button type="button" class="c3-capface is-btn" data-face="cap" data-xe-open aria-label="幫' + esc(NM) + '換個樣子" title="幫' + esc(NM) + '換個樣子"></button>';
    return '<span class="c3-capface" data-face="cap" aria-hidden="true"></span>';
  }
  function partOf(parts, k, tag, cls, inner, attrs) { parts[k] = inner; return '<' + tag + ' class="' + cls + '" data-part="' + k + '"' + (attrs || '') + '>\u0001' + k + '\u0001</' + tag + '>'; }
  function room(m, C) {
    var I = todayInfo(m, C), G = C.R.G, P = G.person, parts = {}, rel = I.rel;
    var who = termOf(m, '誰'), from = termOf(m, '從哪來'), why = termOf(m, '為什麼留下'), worth = termOf(m, '值多少'), srcs = m.sources || {};
    // ── 左：那一型客人的畫像 ──
    var titleH = '<h2 class="c3-ptitle tap" role="button" tabindex="0" data-src="__quote" title="聽你原本怎麼說">' + wb(P.name) + '<i class="c3-stop" aria-hidden="true"></i></h2>';
    var gl = m.goals, per = gl ? period(gl, C.date) : null, goalH = '';
    if (gl && (gl.items || []).length) {
      var ov = overall(gl), pct = Math.round(ov.r * 100), pendAll = pendingWins(m).length;
      var nums = gl.items.map(function (x, gi) {
        var mv = moved(x), span = Math.round(Math.abs(x.target - x.base)), done = Math.min(span, Math.round(mv.done)), pend = Math.min(span - done, pendingWins(m, x.lane).length), dots = '';
        if (span > 0 && span <= 12) { for (var k = 0; k < span; k++) dots += '<i class="' + (k < done ? 'on' : k < done + pend ? 'pend' : k === done + pend ? 'next' : '') + '"></i>'; dots = '<span class="c3-gdots" aria-hidden="true">' + dots + (done + pend < span ? '<em>下一' + esc(x.unit || G.unit) + '</em>' : '') + '</span>'; }
        return '<div class="c3-gn tap" role="button" tabindex="0" data-calc="g' + gi + '" title="點開看怎麼算的"><span class="c3-lk ' + esc(x.lane) + '">' + esc(LANE[x.lane] || '') + '</span>' +
          '<b>' + odo(fmt(x.now), 'gn:' + gi) + '<small>／' + fmt(x.target) + ' ' + esc(x.unit) + '</small></b>' + (pend ? '<span class="c3-pendtx">+' + pend + ' 待打烊確認</span>' : '') +
          '<span class="t">' + esc(String(x.t).replace(/的公司$|的客人$/, '')) + '</span>' + dots + '</div>';
      }).join('');
      var judge = per.frac != null && per.frac >= .12 ? (ov.r + .001 >= per.frac ? '・跟得上時間' : ov.r + .15 >= per.frac ? '・比時間慢一點' : '・比時間慢') : '';
      goalH = '<div class="c3-goalx"><p class="c3-gx-k"><b>離目標</b><span>' + esc(per.from + ' → ' + per.to) + '</span><em>' + esc(per.txt) + '</em></p><div class="c3-gnums">' + nums + '</div>' +
        (per.frac != null ? '<div class="c3-pace2 tap" role="button" tabindex="0" data-calc="all" style="--p:' + Math.min(1, ov.r).toFixed(3) + ';--d:' + per.frac.toFixed(3) + '" aria-label="時間過了 ' + Math.round(per.frac * 100) + '%，做到 ' + pct + '%"><i></i><b></b></div>' +
          '<p class="c3-pacetx"><span>做到 <b>' + pct + '%</b>' + esc(judge) + (pendAll ? '<em>（另有 ' + pendAll + ' ' + esc(ov.unit || G.uNew) + '等打烊確認）</em>' : '') + '</span><span>時間過了 <b>' + Math.round(per.frac * 100) + '%</b></span></p>' : '') + '</div>';
    }
    var calc = worth && srcs[worth.key] ? (String(srcs[worth.key].body || '').split('\n').filter(function (l) { return /[×x＊*]/.test(l); })[0] || '').replace(/[。.]$/, '') : '';
    var traits = '<dl class="c3-traits">' + (from ? '<div><dt>從哪來</dt><dd>' + esc(from.v) + g('said') + '</dd></div>' : '') + (why ? '<div><dt>為什麼留下</dt><dd><span>' + String(why.v).split(/[、・]/).map(function (x) { return '<span class="c3-w">' + esc(x.trim()) + '</span>'; }).join('・') + '</span>' + g('said') + '</dd></div>' : '') +
      (worth ? '<div class="worth' + (worth.key ? ' tap' : '') + '"' + tap(worth.key) + '><dt>值多少</dt><dd><span><b>' + esc(worth.v) + '</b>' + g(worth.src || 'calc') + (calc ? '<small class="calc">' + esc(calc) + '</small>' : '') + '</span></dd></div>' : '') + '</dl>';
    var twins = [], qs = String((m.success || {}).quote || '').split('。').map(function (s) { return s.trim(); }).filter(Boolean);
    if (qs.length) twins.push('<li class="orig"><i></i><div><b>' + esc(P.base ? P.base + (G.orig ? '・' + G.orig.n : '那' + G.unit) : '原本那一' + G.unit) + '<em>原版</em></b><small>「' + esc(qs.length >= 3 ? qs[0] + '。' + qs[qs.length - 1] + '。' : qs.join('。') + '。') + '」' + g('said') + '</small></div></li>');
    (((m.map || {}).pins) || []).filter(function (p) { return p.st === 'won'; }).forEach(function (p) { twins.push('<li class="won"><i></i><div><b>' + esc(p.n) + '</b><small>' + esc(p.note || p.chip || '') + g(p.src || 'data') + '</small></div></li>'); });
    pendingWins(m).forEach(function (it) { twins.push('<li class="pend"><i></i><div><b>' + esc(targetsOf(it)[0] || it.t) + '</b><small>今天按了成交，打烊時確認了才算進目標</small></div></li>'); });
    var twinsH = twins.length ? '<div class="c3-twins"><h3><span>像這一型的</span><em>' + twins.length + ' ' + esc(G.unit) + '</em></h3><ul>' + twins.join('') + '</ul></div>' : '';
    var por = '<div class="c3-pk">' + bracket('要複製的成功') + '</div>' + titleH + (who ? '<p class="c3-pwho">' + esc(who.v) + g('said') + '</p>' : '') + goalH + traits + twinsH;
    var pmini = '<div class="c3-pk">' + bracket('要複製的成功') + '</div><p class="c3-pmini"><b>' + esc(P.name) + '<i class="c3-stop" aria-hidden="true"></i></b>' + (who ? '<span>' + esc(who.v) + '</span>' : '') + '</p>' +
      (gl && (gl.items || []).length ? '<p class="c3-pmgoal tap" role="button" tabindex="0" data-calc="all" title="點開看怎麼算的"><span>離目標</span>' + gl.items.map(function (x) { var pn = pendingWins(m, x.lane).length; return '<b>' + esc(LANE[x.lane] || '') + ' ' + fmt(x.now) + '／' + fmt(x.target) + (pn ? '<small>+' + pn + ' 待確認</small>' : '') + '</b>'; }).join('') + '<em>' + esc(per.txt) + '</em></p>' : '');
    // ── 中上：開門那一句（晨報大標）＋小二現在 ──
    var whenOf = function (x) { return hhmm(x.when); }, status;
    /* 還沒做的那幾件，時間都過了：不再寫「等你做第 1 件」，改成問做了沒（做了就按，沒做現在做也行） */
    var todo = I.all.filter(function (x) { return (x.status || 'todo') === 'todo'; }), nowH = rel === 0 ? nowHours(C) : null;
    var allPast = todo.length && nowH != null && todo.every(function (x) { var h = hoursOf(x.when); return h != null && h < nowH; });
    if (rel === 0 && allPast) status = NM + '想問・' + (todo.length === 1 ? '第 ' + (I.num[todo[0].id] + 1) + ' 件的時間過了，做了嗎？做了就按一下「做了」'
      : (todo.length === I.all.length ? cn(todo.length) + '件的時間都過了' : '還沒按的' + cn(todo.length) + '件，時間都過了') + '，做了嗎？做了的按一下「做了」');
    else if (rel === 0) status = I.next ? NM + '現在・等你做第 ' + (I.num[I.next.id] + 1) + ' 件' + (whenOf(I.next) ? '・' + whenOf(I.next) : '') : NM + '現在・今天的都處理好了' + (I.close ? '・' + I.close.at + ' 打烊時記一筆' : '');
    else if (rel === 1) status = NM + '・明天' + (I.open ? ' ' + I.open.at : '') + ' 開門・' + cn(I.all.length) + '件事先排好了';
    else if (rel < 0) status = NM + '現在・等你叫我「開門」';
    else status = NM + '・' + md(I.td.date) + ' 的事先排好了';
    if (!I.all.length && rel >= 0) status = NM + '現在・這一份清單先空著，重交了就會排上';   // 存著的清單壞了：不說「都處理好了」
    var mods = modsOf(m).filter(function (x) { return running(x) && !isTool(x); }), rev = mods.filter(function (x) { return x.st === 'try' && x.review; }).map(function (x) { return x.review; }).sort()[0];
    var drafts = I.all.filter(function (x) { return x.draft && (x.status || 'todo') === 'todo'; }).length;
    // v14：一行提醒（他加的模組算出來的，只放第一則；點了打開那一組）＋照片讀不到時的一句白話
    var al = alertsOf(m, C)[0], alMod = al && al.mod != null ? modById(m, al.mod) : null;
    var alertH = al ? '<button type="button" class="c3-alert" data-alert="0"><i class="c3-adot' + (al.state === 'low' ? ' low' : '') + '" aria-hidden="true"></i><span class="t">' + esc(al.text) + '</span>' +
      '<span class="w">' + esc(alMod ? alMod.name || '' : '') + '</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>' : '';
    var pb = photoBad(C);
    var cap = '<div class="c3-capk"><span class="c3-live" aria-hidden="true"></span><span>' + esc(NM) + '・' + (rel === 0 ? '今天' : rel === 1 ? '明天開門的一句' : rel < 0 ? '上一次' : md(I.td.date)) + '</span><em>' + esc(md(I.td.date)) + ' 週' + DAYS[wd(I.td.date)] + '</em><span class="c3-know">知道這家店 <b>' + odo(String(C.R.gr.dots.length), 'know') + '</b> 件事</span></div>' +
      '<div class="c3-caprow">' + capFace(C) + '<h2 class="c3-say1">' + wb(rel < 0 ? '今天的還沒排。叫我「開門」，我就排。' : I.td.note || (rel === 0 ? '今天的事排好了。' : '明天的事排好了。')) + '</h2></div>' +
      (rel < 0 && I.td.note ? '<p class="c3-was"><span>' + esc(md(I.td.date)) + ' 那天</span>' + esc(I.td.note) + '</p>' : '') +
      '<p class="c3-now">' + esc(status) + '</p>' + alertH +
      (pb ? '<p class="c3-photobad" role="status">' + esc(NM + '的照片讀不到，先用畫的樣子。跟' + NM + '說「照片再放一次」就好。') + '</p>' : '') +
      (mods.length ? '<p class="c3-running"><span>正在跑</span>' + mods.map(function (x) { return '<button type="button" class="c3-modchip' + (x.st === 'on' ? ' on' : '') + '" data-jump="mods" title="' + esc(x.why || '') + '">' + esc(x.name) + '</button>'; }).join('') + (rev ? '<em>試到 ' + esc(md(rev)) + '，再一起看留不留</em>' : '') + '</p>' : '') +
      (drafts && rel >= 0 ? '<p class="c3-drafts">草稿寫好 <b>' + drafts + '</b> 份，在每一件的「看草稿」裡；你自己複製、自己送</p>' : '');
    // ── 中：圈圈（畫布不重建）＋圖例 ──
    var gal = '<canvas class="c3-galcv" role="img" aria-label="' + esc(NM + '在中間；外面一圈圈是像' + P.name + '的對象：這一期要多的座位、' + (G.pastLabel || '訂過的') + '、' + G.nearLabel) + '"></canvas><div class="c3-galtip" role="status"></div>';
    var leads = ((m.goals || {}).lead) || [], picked = G.near.filter(function (d) { return d.name; }).length, pendN = I.all.filter(function (x) { return x.status === 'done' && x.lane === 'new'; }).length;
    var leg = '<span><i class="c3-k0"></i>一點一' + esc(G.unit) + (G.per > 1 ? '（一點＝' + G.per + ' ' + esc(G.unit) + '）' : '') + '</span>' + (picked ? '<span><i class="c3-k1"></i>有名字的 <b>' + picked + '</b><small>在地圖上</small></span>' : '') +
      leads.slice(0, 2).map(function (x, k) { return '<span class="tap"' + tap(x.key) + '><i class="c3-k' + (k + 2) + '"></i>' + esc(String(x.t).replace(/^這一期/, '').replace(/的公司$|的$/, '')) + ' <b>' + odo(fmt(x.done), 'lead' + k) + '</b><small>／' + fmt(x.target) + (k === 0 && pendN ? '・今天 +' + pendN + ' 等打烊' : '') + '</small></span>'; }).join('') +
      '<span><i class="c3-k4"></i>成了</span>';
    // ── 時間軸 ──
    var line = '<canvas class="c3-daycv" role="img" aria-label="一天的時間軸"></canvas><ol class="c3-sr">' + (I.open ? '<li>開門 ' + esc(I.open.at) + '</li>' : '') + I.all.map(function (x, k) { return '<li>' + pad2(k + 1) + ' ' + esc(whenOf(x)) + ' ' + esc(x.t) + '</li>'; }).join('') + (I.close ? '<li>打烊 ' + esc(I.close.at) + '</li>' : '') + '</ol>';
    // ── 右：今天的事 ──
    var foot = I.close ? '<p class="c3-tfoot"><i></i><span>晚上 <b>' + esc(I.close.at) + '</b> 打烊：' + esc(NM) + '看今天按了什麼、記一筆、排明天' + (I.close.st === 'set' ? '' : '（排程還沒排）') + '</span></p>' : '';
    var ask = asksInner(m);
    var jobs = jobsHead(I, C, true) + '<ol class="c3-jobs">' + I.items.map(function (x) { return job(x, I.num[x.id], C, m); }).join('') + '</ol>' + echoHTML(C) + foot +
      (ask ? '<div class="c3-rasks" data-sec="asks">' + ask + '</div>' : '');
    var skel = '<section class="c3-sec c3-today c3-room' + (rel === 1 ? ' is-eve' : rel < 0 ? ' is-stale' : '') + '" data-sec="today" aria-label="今天">' +
      '<div class="c3-rbg a" aria-hidden="true"><i class="c3-corner tl"></i><i class="c3-corner tr"></i><i class="c3-corner bl"></i><i class="c3-corner br"></i></div><div class="c3-rbg b" aria-hidden="true"></div>' +
      partOf(parts, 'pmini', 'div', 'c3-r-pmini', pmini) + partOf(parts, 'por', 'div', 'c3-r-por', por) + partOf(parts, 'cap', 'div', 'c3-r-cap', cap) +
      partOf(parts, 'gal', 'div', 'c3-r-gal', gal) + partOf(parts, 'leg', 'p', 'c3-r-leg', leg) + partOf(parts, 'line', 'div', 'c3-r-line', line) + partOf(parts, 'jobs', 'div', 'c3-r-jobs', jobs) + '</section>';
    return { skel: skel, parts: parts, html: skel.replace(/\u0001(\w+)\u0001/g, function (_, k) { return parts[k]; }) };
  }

  /* ── 模組：<小二的名字>正在幫你跑的。在跑的一個一張卡（名字、狀態、為什麼、數字從起點到現在、下一步）；暫停與收工的收成一行。
     還沒開成模組的機會不列（盤點時小二會提），沒有模組就不放這一塊 ── */
  var MOD_ST = { try: '試做中', on: '開著', paused: '暫停', done: '收工' };
  /* v14：模組卡的按鈕（地圖格式.md「v14 新加的：做成你的形狀」）。
     模組在 view.acts 宣告過的才畫：done 做了、skip 先不做、pick 選一個（選項照 view.pick，2–4 個）；按過的照 pressed 標出來。
     按過的只在今天亮（pressed.date 是今天）；不是今天按的，按鈕不亮，下面那一行照寫哪天按了什麼。
     卡片角落「回到上一版」（伺服器說真的還有上一版才放：pack.back）、「先收起來」。都只改這個模組自己那一塊（POST /api/module/act｜revert｜pause），
     按一下就定案，5 秒內可以收回，之後才寫進去。訪談中不放。 */
  function modBtns(R, x, kind, C, v) {
    if (C.live) return '';
    var id = esc(x.id), p = (R.mpend || {})[x.id], e = (R.mecho || {})[x.id];
    if (p) {   // 按了還沒送：「收回」只出現在按的那個位置，其他按鈕先收著（不會一次按兩件）
      var slot = p.kind === 'revert' || p.kind === 'pause' ? 'foot' : 'acts';
      return slot !== kind ? '' : '<div class="c3-mundo" role="status"><span>' + esc(p.label) + '・' + UNDO_S + ' 秒後記進經營資料夾</span><button type="button" class="c3-undo" data-mundo="' + id + '" data-fk="mundo:' + id + '">收回</button></div>';
    }
    var out = '';
    if (kind === 'acts') {
      var acts = (v && Array.isArray(v.acts) ? v.acts : []).filter(function (a, i, all) { return MACT[a] && a !== 'revert' && a !== 'pause' && all.indexOf(a) === i; });
      var picks = v && Array.isArray(v.pick) ? v.pick.filter(function (q) { return typeof q === 'string' && q; }).slice(0, 4) : [];
      var pr = v && v.pressed && typeof v.pressed === 'object' ? v.pressed : null, today = !!pr && pr.date === C.date;
      if (acts.indexOf('pick') >= 0 && !picks.length) acts = acts.filter(function (a) { return a !== 'pick'; });
      if (!acts.length) return '';
      var btn = function (act, val) {
        var on = today && pr.act === act && (act !== 'pick' || pr.value === val), fk = 'mact:' + id + ':' + act + (act === 'pick' ? ':' + esc(val) : '');
        return '<button type="button" class="' + (act === 'done' ? 'c3-do sm' : act === 'skip' ? 'c3-skip' : 'c3-rchip') + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-mact="' + act + '"' +
          (act === 'pick' ? ' data-val="' + esc(val) + '"' : '') + ' data-mod="' + id + '" data-fk="' + fk + '">' + (act === 'done' ? CHECK + '<span>做了</span>' : act === 'skip' ? '先不做' : esc(val)) + '</button>';
      };
      out = '<div class="c3-mact">' + (acts.indexOf('done') >= 0 ? btn('done') : '') + (acts.indexOf('skip') >= 0 ? btn('skip') : '') +
        (acts.indexOf('pick') >= 0 ? '<span class="c3-mpick" role="group" aria-label="選一個"><span class="b">' + picks.map(function (q) { return btn('pick', q); }).join('') + '</span></span>' : '') + '</div>' +
        (pr && MACT[pr.act] ? '<p class="c3-mpressed">' + esc((today ? '今天' : md(pr.date) ? md(pr.date) + ' ' : '') + '按了「' + (pr.act === 'pick' ? String(pr.value || '') : MACT[pr.act]) + '」') + '</p>' : '');
    } else if (kind === 'foot') out = '<footer class="c3-mfoot">' + (backs(C, x.id) ? '<button type="button" class="c3-mlink" data-mact="revert" data-mod="' + id + '" data-fk="mact:' + id + ':revert">回到上一版</button>' : '') +
      '<button type="button" class="c3-mlink" data-mact="pause" data-mod="' + id + '" data-fk="mact:' + id + ':pause">先收起來</button></footer>';
    if (kind === 'foot' && e) out += '<p class="c3-mecho' + (e.err ? ' err' : '') + '" role="status">' + esc(e.text) + '</p>';
    return out;
  }
  /* 模組帶了 view（日常工具一定有；獲客做法可以有）：積木照 pack.views 畫，寬的時候分兩欄 */
  function viewBody(m, C, x, v, stop) {
    if (C.safe) return x.view ? '<p class="c3-vnote">安全模式：這一塊的內容先不畫。</p>' : '';
    if (!v) return x.view ? '<p class="c3-vnote">數字還在算；經營室算好就會畫出來。</p>' : '';
    if (v.bad) return '<p class="c3-vnote">這一塊的資料格式不對，先不畫；跟' + esc(NM) + '說一聲，照〈做成你的形狀〉重交就好。</p>';
    if (!v.blocks.length) return '';
    var bl = v.blocks.map(function (b, i) { var h = vblock(m, C, x, b, i, stop); return h ? h.replace(/^<(div|p) class="/, '<$1 style="order:' + i + '" class="') : ''; });
    return bl.length > 1 ? '<div class="c3-view is-2"><div class="c3-vcol">' + bl.filter(function (h, i) { return i % 2 === 0; }).join('') + '</div><div class="c3-vcol">' + bl.filter(function (h, i) { return i % 2 === 1; }).join('') + '</div></div>'
      : '<div class="c3-view">' + bl.join('') + '</div>';
  }
  /* 一張獲客做法（kind: way）的卡：名字、狀態、為什麼、數字從起點到現在、下一步；日常多了按鈕 */
  function wayCard(m, C, x, tdn, fromOf) {
    var R = C.R || {}, left = x.review ? dayDiff(x.review, C.date) : null, st;
    if (x.st === 'try') st = left == null ? '試做中' : left > 0 ? '試做中・還有 ' + left + ' 天看結果' : left === 0 ? '試做中・今天看結果' : '試做中・該看結果了';
    else st = '開著';
    var mets = (x.metrics || []).map(function (q, k) {
      var has = q.now != null && q.target != null, b = q.base != null ? q.base : 0, r = has && q.target !== b ? Math.max(0, Math.min(1, (q.now - b) / (q.target - b))) : 0;
      return '<li' + (q.key ? ' class="tap"' + tap(q.key) : '') + '><span class="t">' + esc(q.t) + '</span><span class="v">' + (q.base != null ? '<small>起點</small>' + fmt(q.base) + '<i aria-hidden="true">→</i>' : '') + '<small>現在</small><b>' + odo(fmt(q.now), 'mod:' + x.id + ':' + k) + '</b>' + (q.target != null ? '<i aria-hidden="true">→</i><small>要做到</small>' + fmt(q.target) : '') + '<em>' + esc(q.unit || '') + '</em></span>' +
        (has ? '<span class="c3-mbar" aria-hidden="true"><i style="width:' + (r * 100).toFixed(1) + '%"></i></span>' : '') + '</li>';
    }).join('');
    var from = (fromOf || {})[x.id], v = viewOf(C, x.id), stop = halted(C, x.id) && !C.safe;
    return '<article class="c3-card c3-mod is-' + esc(x.st) + '" data-mod="' + esc(x.id) + '"><header><span class="c3-mst">' + (x.st === 'try' ? '<i class="try"></i>' : '<i class="on"></i>') + esc(st) + '</span><span class="c3-mnode">' + esc(x.node || '') + '・' + esc(LANE[x.lane] || '') + '</span>' +
      (isMine(x) ? '<span class="c3-mine" title="' + esc(NM) + '照你的需要自己寫的">' + esc(NM) + '自己長的</span>' : '') + '</header>' +
      '<h3>' + esc(x.name) + (tdn && tdn[x.id] ? '<em>今天 ' + tdn[x.id] + ' 件</em>' : '') + '</h3><p class="c3-mwhy' + (x.key ? ' tap' : '') + '"' + tap(x.key) + '><small>為什麼</small><span>' + esc(x.why) + '</span></p>' +
      (mets ? '<ul class="c3-mets">' + mets + '</ul>' : '') + viewBody(m, C, x, v, stop) + (x.next ? '<p class="c3-mnext"><small>下一步</small><span>' + esc(x.next) + '</span></p>' : '') +
      modBtns(R, x, 'acts', C, v) +
      (from && !C.live ? '<p class="c3-mfrom' + (from.key ? ' tap' : '') + '"' + tap(from.key) + '><small>來自機會</small><span><b>' + esc(kindName(from.kind)) + '</b>' + esc(from.v ? '・' + from.v : '') + '</span></p>' : '') +
      modBtns(R, x, 'foot', C) + '</article>';
  }
  /* 暫停、收工的收成一行（點不開；要再開跟小二說） */
  function restRow(x) { return '<li><span class="c3-mst"><i class="' + esc(x.st) + '"></i>' + esc(MOD_ST[x.st] || '') + '</span><b>' + esc(x.name) + '</b><span>' + esc(x.result || (isTool(x) ? x.for : '') || x.why) + '</span></li>'; }
  function modsSec(m, C) {
    var place = (C.L && C.L.placed) || {};   // layout 把某個模組單獨放到別組：這裡就不再畫一次
    var items = modsOf(m).filter(function (x) { return !isTool(x) && !place[x.id]; }); if (!items.length) return null;
    var run = items.filter(function (x) { return x.st === 'try' || x.st === 'on'; }), rest = items.filter(function (x) { return x.st === 'paused' || x.st === 'done'; });
    var tdn = todayByMod(m), fromOf = oppFrom(m);
    var restH = rest.length ? '<ul class="c3-mrest">' + rest.map(restRow).join('') + '</ul>' : '';
    // 日常分組裡，組名「在跑的做法」已經講了這一塊是什麼：不再放一次大標（訪談中、舊地圖照舊）
    var head = C.L ? '' : '<header class="c3-head">' + eyebrow('模組', '<em class="c3-cad">一次最多三個在跑</em>') + '<div class="c3-head-row"><h2 class="c3-modh">' + wb(NM + '正在幫你跑的') + '<i class="c3-stop" aria-hidden="true"></i></h2>' + actBtn(C, 'mods', NM + '正在幫你跑的') + '</div></header>';
    if (!run.length && !rest.length) return null;
    return '<section class="c3-sec c3-mods" data-sec="mods">' + head + (run.length ? '<div class="c3-modgrid" style="--n:' + run.length + '">' + run.map(function (x) { return wayCard(m, C, x, tdn, fromOf); }).join('') + '</div>' : '') + restH + '</section>';
  }
  function todayByMod(m) { var tdn = {}; (((m.today || {}).items) || []).forEach(function (x) { if (x.mod) tdn[x.mod] = (tdn[x.mod] || 0) + 1; }); return tdn; }
  /* 第⑥站的三個機會併進來：每個模組寫它來自哪一個機會（照六格對）；還沒開成模組的機會收成一行 */
  function oppFrom(m) {
    var oppItems = ((m.opps || {}).items) || [], used = {}, fromOf = {};
    modsOf(m).filter(function (x) { return !isTool(x); }).forEach(function (x) { for (var k = 0; k < oppItems.length; k++) if (!used[k] && oppItems[k].node && oppItems[k].node === x.node) { used[k] = 1; fromOf[x.id] = oppItems[k]; break; } });
    return fromOf;
  }
  /* layout 把一個獲客做法單獨放到某一組：那一張卡自己一塊 */
  function wayBlock(m, C, x) {
    var body = running(x) ? '<div class="c3-modgrid" style="--n:1">' + wayCard(m, C, x, todayByMod(m), oppFrom(m)) + '</div>' : '<ul class="c3-mrest">' + restRow(x) + '</ul>';
    return '<section class="c3-sec c3-mods c3-mone" data-sec="mod:' + esc(x.id) + '">' + body + '</section>';
  }

  /* ── v14：他加的日常工具（kind: tool）。一塊一張卡：外框、標題列、出處點、「自己長的」小標都由這裡畫，小二只交內容；
     身體用三種積木（bignum 大數字、listrow 名單列、verify 驗算），數字照 pack.views（伺服器算好的），前端不重算。
     對不上（halted）：整塊標「對不上，先停」，名單列一律「先對一下數字」，不亮任何提醒。
     一塊畫不出來只壞這一塊：換成一張安靜的卡，回到上一版、先收起來照樣按得到。 ── */
  function toolBlock(m, C, x) {
    var html;
    try { html = toolCard(m, C, x); }
    catch (e) { html = '<article class="c3-card c3-mod c3-tool is-broken" data-mod="' + esc(x.id) + '"><h3>' + esc(x.name || '') + '</h3><p class="c3-vnote">這一塊畫不出來，先收著；跟' + esc(NM) + '說一聲，' + esc(NM) + '會再看一次。</p>' + modBtns(C.R || {}, x, 'foot', C) + '</article>'; }
    return '<section class="c3-sec c3-toolsec" data-sec="mod:' + esc(x.id) + '">' + html + '</section>';
  }
  function toolCard(m, C, x) {
    if (!running(x)) return '<ul class="c3-mrest">' + restRow(x) + '</ul>';
    var R = C.R || {}, v = viewOf(C, x.id), stop = halted(C, x.id) && !C.safe, ev = (x.on || []).filter(function (k) { return EVT[k]; }).map(function (k) { return EVT[k]; });
    var fr = x.frees && num(x.frees.hours) ? '<em>一週省下' + (x.frees.est ? '約 ' : ' ') + fmt(x.frees.hours) + ' 小時' + (x.frees.est ? g('est') : '') + '</em>' : '';
    var body = viewBody(m, C, x, v, stop);
    return '<article class="c3-card c3-mod c3-tool is-' + esc(x.st) + (stop ? ' is-halted' : '') + '" data-mod="' + esc(x.id) + '"' + (x.why ? ' title="' + esc(x.why) + '"' : '') + '>' +
      '<header><span class="c3-mst"><i class="on"></i>日常工具</span>' + (ev.length ? '<span class="c3-mnode">' + esc(ev.join('・')) + '時更新</span>' : '') +
      (stop ? '<span class="c3-halt-k">對不上，先停</span>' : '') + (isMine(x) ? '<span class="c3-mine" title="' + esc(NM) + '照你的需要自己寫的">' + esc(NM) + '自己長的</span>' : '') + '</header>' +
      '<h3>' + esc(x.name) + '</h3>' +
      (stop ? '<p class="c3-halt" role="status"><b>數字對不上，先停</b><span>上次盤點加進貨，跟用掉加實點的對不起來。提醒先不亮，免得照錯的數字叫貨；跟' + esc(NM) + '對一下數字就好。</span></p>' : '') +
      (x.for ? '<p class="c3-mwhy"><small>為了</small><span>' + esc(x.for) + fr + '</span></p>' : '') + body +
      (x.next ? '<p class="c3-mnext"><small>下一步</small><span>' + esc(x.next) + '</span></p>' : '') +
      (C.safe ? '' : modBtns(R, x, 'acts', C, v)) + modBtns(R, x, 'foot', C) + '</article>';
  }
  /* 三種積木。字一律 esc；數字照 views 給的（型別不對就畫「—」，不自己補算） */
  function nv(v) { return num(v) ? fmt(v) : '—'; }
  function vblock(m, C, x, b, i, stop) {
    if (!b || typeof b !== 'object') return '';
    try {
      if (b.type === 'bignum') return vBig(m, C, x, b, i);
      if (b.type === 'listrow') return vList(b, stop);
      if (b.type === 'verify') return vVerify(b);
    } catch (e) { }
    return '<p class="c3-vnote">這一小塊畫不出來，先跳過。</p>';
  }
  function vBig(m, C, x, b, i) {
    var now = b.now || {}, base = b.base || {}, key = now.key && (m.sources || {})[now.key] ? now.key : null, d = b.delta;
    var bl = esc(base.label || '之前'), dl = num(d) ? (d === 0 ? '跟' + bl + '一樣' : '比' + bl + ' <b>' + signed(d) + '</b>' + (now.unit ? ' ' + esc(now.unit) : '')) : '';
    return '<div class="c3-vb c3-vbig"><p class="c3-vk">' + esc(b.label) + '</p>' +
      '<p class="c3-vnum' + (key ? ' tap' : '') + '"' + tap(key) + '><b>' + (num(now.v) ? odo(fmt(now.v), 'v:' + x.id + ':' + i) : '—') + '</b>' + (now.unit ? '<span class="u">' + esc(now.unit) + '</span>' : '') + g(now.src) + '</p>' +
      (dl ? '<p class="c3-vdelta">' + dl + (num(base.v) ? '<small>' + bl + ' ' + fmt(base.v) + '</small>' : '') + '</p>' : '') + '</div>';
  }
  function vList(b, stop) {
    var rows = Array.isArray(b.rows) ? b.rows : [];
    return '<div class="c3-vb c3-vlist">' + (b.title ? '<p class="c3-vk">' + esc(b.title) + '</p>' : '') + '<ul class="c3-vrows">' + rows.map(function (r) {
      var st = stop ? 'check' : (VSTATE[r.state] ? r.state : ''), u = r.unit ? ' ' + esc(r.unit) : '';
      return '<li class="c3-vrow' + (st ? ' st-' + st : '') + '"><b class="n">' + esc(r.name) + g(r.src) + '</b>' +
        '<span class="nums"><span class="q">剩 <b>' + nv(r.have) + '</b>' + u + '</span><span class="s">安全量 ' + nv(r.safe) + u + '</span>' +
        '<span class="d">' + (num(r.days) && r.days > 0 ? '約 ' + fmt(r.days) + ' 天' : '') + '</span></span>' +
        (st ? '<span class="c3-vst st-' + st + '">' + (st === 'ok' ? CHECK : '<i aria-hidden="true"></i>') + esc(VSTATE[st]) + '</span>' : '<span class="c3-vst"></span>') + '</li>';
    }).join('') + '</ul></div>';
  }
  function vVerify(b) {
    var ok = b.ok === true, bad = b.ok === false, has = num(b.lhs) && num(b.rhs);
    var res = !has || (!ok && !bad) ? '<p class="c3-vres">等經營室算好</p>'
      : ok ? '<p class="c3-vres is-ok">' + CHECK + '<span>' + (num(b.diff) && b.diff !== 0 ? '差 ' + fmt(Math.abs(b.diff)) + '，可以差 ' + fmt(b.tol) + '，算對得上' : '對得上') + '</span></p>'
        : '<p class="c3-vres is-bad"><i aria-hidden="true"></i><span>差 ' + nv(num(b.diff) ? Math.abs(b.diff) : null) + '・對不上，先停</span></p>';
    var term = function (k, v) { return '<span class="c3-vt"><small>' + k + '</small><b>' + nv(v) + '</b></span>'; };
    return '<div class="c3-vb c3-vver' + (ok ? ' is-ok' : bad ? ' is-bad' : '') + '">' + (b.title ? '<p class="c3-vk">' + esc(b.title) + '</p>' : '') +
      '<div class="c3-veq">' + term('上次盤點', b.prev) + '<i aria-hidden="true">+</i>' + term('這週進貨', b.in) + '<i aria-hidden="true">=</i><b class="c3-vsum">' + (has ? fmt(b.lhs) : '—') + '</b></div>' +
      '<div class="c3-veq">' + term('這週用掉', b.used) + '<i aria-hidden="true">+</i>' + term('這次實點', b.now) + '<i aria-hidden="true">=</i><b class="c3-vsum">' + (has ? fmt(b.rhs) : '—') + '</b></div>' + res + '</div>';
  }
  /* 打開的時候「還沒做的」排前面；這一次打開期間按了也不換位置（不跳），重新打開才重排 */
  function orderToday(C, td) {
    var R = C.R, items = (td.items || []).slice(), rank = { todo: 0, done: 1, skip: 2 };
    if (!R) return items;
    if (!R.todayOrder || R.todayOrder.date !== td.date) R.todayOrder = { date: td.date, ids: items.slice().sort(function (a, b) { return (rank[a.status || 'todo'] - rank[b.status || 'todo']) || (td.items.indexOf(a) - td.items.indexOf(b)); }).map(function (x) { return x.id; }) };
    var ids = R.todayOrder.ids; items.forEach(function (x) { if (ids.indexOf(x.id) < 0) ids.push(x.id); });
    return items.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
  }
  /* 一件事：編號（對到時間軸）、時間、標題、對象；草稿預設收成一行「看草稿」，點開才展開（複製也在裡面） */
  function job(x, i, C, m) {
    var st = x.status || 'todo', id = esc(x.id), err = C.errs[x.id], R = C.R, open = !!(R.openDraft || {})[x.id];
    var mod = x.mod ? ((((m || {}).mods || {}).items) || []).filter(function (y) { return y.id === x.mod; })[0] : null;
    var tags = '<span class="c3-lk ' + esc(x.lane) + '" title="' + esc(LANE_TIP[x.lane] || '') + '">' + esc(LANE[x.lane] || '') + '</span>' +
      (mod ? '<button type="button" class="c3-jmod" data-jump="mods" title="從「' + esc(mod.name) + '」這個模組來">' + esc(mod.name) + '</button>' : '') +
      (x.try ? '<span class="c3-try" title="每天留一格試新的管道，其他做現在最有效的">今天試新方法</span>' : '') +
      (x.grows && !mod && !x.try ? '<span class="c3-grows" title="做完會多存下一筆：' + esc(ASSET[x.grows] || '') + '">' + esc(GROWS[x.grows] || '') + '</span>' : '');
    var tm = hhmm(x.when), rest = String(x.when || '').replace(/^\s*\d{1,2}[:：]\d{2}\s*/, '');
    var top = '<div class="c3-jtop"><span class="c3-jno">' + pad2(i + 1) + '</span>' + (tm ? '<b class="c3-jtime">' + esc(tm) + '</b>' : '') + (rest ? '<span class="c3-jrest">' + esc(rest) + '</span>' : '') + '<span class="c3-jtags">' + tags + '</span></div>';
    var body = '<h3 class="c3-jt">' + esc(x.t) + '</h3>' + (x.to ? '<p class="c3-jto"><span>對象</span>' + esc(x.to) + '</p>' : '');
    var dbtn = x.draft && st === 'todo' ? '<button type="button" class="c3-dbtn" data-draft="' + id + '" aria-expanded="' + open + '" data-fk="draft:' + id + '">' + (open ? '收起草稿' : '看草稿') + '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.2l4 4 4-4"/></svg></button>' : '';
    var draft = x.draft && st === 'todo' && open ? '<div class="c3-jdraft"><p>' + esc(x.draft) + '</p><div class="c3-jdraft-act"><button type="button" class="c3-copy" data-copy="' + id + '" data-fk="copy:' + id + '">' + COPY_ICON + '<span>複製草稿</span></button><small>' + esc(NM) + '寫好的；你自己複製、自己送</small></div></div>' : '';
    var acts;
    if (st === 'done') {
      var res = RESULT.slice(); if (x.result === 'later') res.push(['later', '晚點再說']);
      acts = '<div class="c3-jact is-done"><span class="c3-mark">' + CHECK + '做了</span><div class="c3-res" role="group" aria-label="結果是">' + res.map(function (r) {
        var on = x.result === r[0];
        return '<button type="button" class="c3-rchip' + (on ? ' on ' + r[0] : '') + '" aria-pressed="' + on + '" data-act="result" data-res="' + r[0] + '" data-id="' + id + '" data-fk="res:' + id + ':' + r[0] + '">' + r[1] + '</button>';
      }).join('') + '</div><button type="button" class="c3-undo" data-act="todo" data-id="' + id + '" data-fk="undo:' + id + '">改回沒做</button></div>' +
        (x.result === 'won' ? '<p class="c3-jpend">記下了；打烊時' + esc(NM) + '確認，才算進目標</p>' : '');
    } else if (st === 'skip') {
      acts = '<div class="c3-jact is-skip"><span class="c3-mark">先不做</span><button type="button" class="c3-undo" data-act="todo" data-id="' + id + '" data-fk="undo:' + id + '">改回來</button></div>';
    } else {
      acts = '<div class="c3-jact"><button type="button" class="c3-do" data-act="done" data-id="' + id + '" data-fk="do:' + id + '">' + CHECK + '<span>做了</span></button><button type="button" class="c3-skip" data-act="skip" data-id="' + id + '" data-fk="skip:' + id + '">先不做</button>' + dbtn + '</div>';
    }
    return '<li class="c3-card c3-job is-' + st + (x.try ? ' is-try' : '') + '" data-job="' + id + '">' + top + body + acts + draft +
      (err ? '<p class="c3-jerr" role="alert">' + esc(err) + '</p>' : '') + '</li>';
  }

  /* ── 01 我理解的你：星圖舞台 ── */
  function hero(m, C) {
    var w = m.who || {}, sign = ((m.persona || {}).sign) || null, nk = ((C.R.gr || {}).dots || []).length;
    var facts = (w.facts || []).map(function (f) { return '<span class="c3-chip' + (f.key ? ' tap' : '') + '"' + tap(f.key) + '>' + g(f.src) + esc(f.t) + '</span>'; }).join('');
    /* 星圖只在第 ① 站當主角（大舞台）；第 ⑥ 站講回去、走過之後點開、日常，星圖縮小，整頁才放得進三個螢幕 */
    var small = C.day || (C.live && C.at > 1);
    return '<section class="c3-sec c3-hero' + (small ? ' is-day' : '') + (small && C.live ? ' is-recap' : '') + '" data-sec="who"><canvas class="c3-star" role="img"></canvas>' +
      '<div class="c3-hero-copy">' + eyebrow('我理解的你') + '<p class="c3-know2"><b>' + odo(String(nk), 'facts') + '</b><span>件事・' + esc(NM) + '記下的</span></p>' +
      '<h1 class="c3-line">' + wb(w.line || NM + '正在認識你的店。') + (w.soft ? '<span class="soft">' + esc(w.soft) + '</span>' : '') + '</h1>' +
      (facts ? '<div class="c3-chips">' + facts + '</div>' : '') +
      (w.fix ? '<div class="c3-fix">' + g(w.fix.src || 'said') + '<span>你改過</span><q>' + esc(w.fix.q) + '</q></div>' : '') +
      (sign ? '<div class="c3-sign"><span class="k"><i></i>本命星座</span><b>' + esc(sign.name) + '</b><span class="l">' + esc(sign.line) + '</span></div>' : '') +
      (C.live ? '<div class="c3-hero-act">' + actBtn(C, 'who', w.line, true) + '</div>' : '') + '</div><div class="c3-tip" hidden></div></section>';
  }

  /* ── 你的客人：客人星系＋三種客人的小卡＋333 起點卡 ── */
  /* 有沒有名單上的人（平常會回來／開始變少／很久沒來三圈有沒有東西可畫）；沒有就只畫「還沒認識」那一圈 */
  function hasList(types) { return (types || []).some(function (ty) { return ty.bands || (ty.lane !== 'new' && ty.n != null); }); }
  function people(m, C) {
    var pp = m.people; if (!pp) return null;
    var types = pp.types || [], cyc = pp.cycle, rule = pp.rule;
    var aria = '客人星系：' + types.map(function (ty) { var b = ty.bands; return ty.name + '（' + LANE[ty.lane] + (ty.n != null ? '，' + ty.n + ' ' + unitOf(ty) : '') + (b ? '：平常會回來 ' + b.in + '、開始變少 ' + b.slip + '、很久沒來 ' + b.out : '') + '）'; }).join('、');
    // 圖例只寫畫面上真的有的：還沒有名單（沒有三圈的數字）就不列三圈
    var hasBands = hasList(types), hasNew = types.some(function (ty) { return ty.lane === 'new'; });
    var legend = '<ul class="c3-glegend">' + (hasBands ? '<li><i class="b-in"></i><span>平常會回來</span><small>未滿一個週期</small></li><li><i class="b-slip"></i><span>開始變少</span><small>一到三個週期</small></li>' +
      '<li><i class="b-out"></i><span>很久沒來</span><small>超過三個週期</small></li>' : '') + (hasNew ? '<li><i class="b-new"></i><span>還沒認識的新客</span></li>' : '') + (rule ? '<li><i class="b-hot"></i><span>先從這一群開始</span><small>' + (rule.list === 'none' ? '還沒有自己的名單' : rule.dormant * 3 > rule.total ? '很久沒來的超過三分之一' : '很久沒來的不到三分之一') + '</small></li>' : '') + '</ul>' +
      (!hasBands && rule && rule.list === 'none' ? '<p class="c3-cycle c3-nolist"><span>還沒有自己的名單，這裡先只畫還沒認識的新客。</span></p>' : '') +
      (hasBands || cyc ? '<p class="c3-cycle' + (cyc && cyc.key ? ' tap' : '') + '"' + (cyc ? tap(cyc.key) : '') + '>' + (cyc ? g(cyc.src) : '') + '<span>週期＝那位客人平常多久回來一次' + (cyc ? '；不知道就用 ' + cyc.days + ' 天' : '') + '</span></p>' : '');
    var start = rule ? rule.start : null;
    var cards = types.map(function (ty, i) {
      var u = unitOf(ty), b = ty.bands, hot = start && ((start === 'new' && ty.lane === 'new') || (start === 'return' && (ty.lane === 'return' || (b && b.out))));
      var nums = (ty.n != null ? '<div class="c3-pnum' + (ty.key ? ' tap' : '') + '"' + tap(ty.key) + '><small>多少</small><b>' + odo(fmt(ty.n), 'pn:' + ty.name) + '<span class="u">' + u + '</span></b></div>' : '') +
        (ty.value ? '<div class="c3-pval' + (ty.key ? ' tap' : '') + '"' + tap(ty.key) + '><small>值多少</small><b>' + esc(ty.value) + '</b></div>' : '');
      var placesH = (ty.places || []).length ? '<ul class="c3-places">' + ty.places.map(function (pl) {
          var name = pl.url ? '<a href="' + esc(pl.url) + '" target="_blank" rel="noopener noreferrer">' + esc(pl.n) + '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3H13v3.5M13 3 7.5 8.5M11 9.5V13H3V5h3.5"/></svg></a>' : '<b>' + esc(pl.n) + '</b>';
          return '<li><em>' + esc(PLACE[pl.kind] || '') + '</em>' + name + (pl.size != null ? '<span' + (pl.key ? ' class="tap"' + tap(pl.key) : '') + '>' + fmt(pl.size) + ' 人</span>' : '') + (pl.checked ? '<small>' + esc(md(pl.checked)) + ' 查過</small>' : '') + '</li>';
        }).join('') + '</ul>' : '';
      var whyH = '<div><dt>為什麼來</dt><dd>' + esc(ty.why) + '</dd></div>', pathH = ty.path ? '<p class="c3-path"><small>實際怎麼來的</small><span>' + esc(ty.path) + '</span></p>' : '';
      var whereH = '<div class="c3-where' + (ty.path ? ' from-path' : '') + '">' + PIN_ICON + '<div><small>' + (ty.path ? '照這條路，去哪找更多' : '去哪找') + '</small><b>' + esc(ty.where) + '</b></div></div>';
      /* 日常：每天看的是「是誰、去哪找、有多少」；為什麼來、實際怎麼來的、點得開的入口訪談時講過了，收成一行 */
      var bandsH = b ? '<p class="c3-bands"><span><i class="b-in"></i>平常 ' + b.in + '</span><span><i class="b-slip"></i>變少 ' + b.slip + '</span><span><i class="b-out"></i>很久 ' + b.out + '</span></p>' : '';
      var hd = '<header><span class="c3-pmark" aria-hidden="true">' + pad2(i + 1) + '</span><b>' + esc(ty.name) + '</b><span class="c3-lk ' + esc(ty.lane) + '">' + esc(LANE[ty.lane]) + '</span>' + g(ty.src) +
        (C.day && ty.n != null ? '<span class="c3-pn' + (ty.key ? ' tap' : '') + '"' + tap(ty.key) + '><b>' + odo(fmt(ty.n), 'pn:' + ty.name) + '</b>' + esc(u) + '</span>' : '') + '</header>';
      if (C.day) {
        /* 日常：每天看的是「是誰、去哪找、有多少」；為什麼來、實際怎麼來的、值多少、三圈、點得開的入口，訪談時講過了，收成一行 */
        var more = '<dl>' + whyH + (ty.value ? '<div><dt>值多少</dt><dd' + (ty.key ? ' class="tap"' + tap(ty.key) : '') + '>' + esc(ty.value) + '</dd></div>' : '') + '</dl>' + pathH + bandsH + placesH;
        return '<article class="c3-card c3-ptype is-day' + (hot ? ' is-start' : '') + '" data-type="' + i + '" tabindex="-1">' + hd + '<p class="c3-pwho2">' + esc(ty.who) + '</p>' + whereH +
          '<details class="c3-fold c3-placefold"><summary><span>為什麼來、值多少' + (placesH ? '、入口' : '') + '</span>' + (placesH ? '<em>' + cn(ty.places.length) + '個入口</em>' : '') + '</summary>' + more + '</details></article>';
      }
      return '<article class="c3-card c3-ptype' + (hot ? ' is-start' : '') + '" data-type="' + i + '" tabindex="-1">' + hd +
        '<dl><div><dt>是誰</dt><dd>' + esc(ty.who) + '</dd></div>' + whyH + '</dl>' + pathH + whereH + placesH + (nums ? '<div class="c3-pfoot">' + nums + '</div>' : '') + bandsH + '</article>';
    }).join('');
    var ruleCard, word0 = { new: '新客', return: '回頭客' };
    if (rule && C.day) {
      /* 日常：333 的結論一行就好（圖例也標了先從哪一群開始）；點開看怎麼算的 */
      var over0 = rule.list !== 'none' && rule.dormant * 3 > rule.total, auto0 = rule.list === 'none' ? 'new' : rule.auto || (over0 ? 'return' : 'new');
      ruleCard = '<p class="c3-card c3-rule is-line' + (rule.key ? ' tap' : '') + '"' + tap(rule.key) + '><span class="k">333 法則</span>' +
        (rule.list === 'none' ? '<span>還沒有自己的名單</span>' : '<span><b>' + rule.dormant + '／' + rule.total + '</b> 很久沒來・' + (over0 ? '超過' : '不到') + '三分之一</span>') +
        '<span class="v">先從<b>' + word0[rule.start] + '</b>開始' + (rule.start !== auto0 ? '（你選的）' : '') + '</span></p>';
    } else if (rule && rule.list === 'none') {
      ruleCard = '<div class="c3-card c3-rule is-none"><div class="c3-rule-k' + (rule.key ? ' tap' : '') + '"' + tap(rule.key) + '>' + bracket('333 法則・先從新客還是回頭客開始') + '<p class="c3-rule-none">還沒有自己的名單，先從新客開始</p></div>' +
        (rule.why && norm(rule.why) !== '還沒有自己的名單，先從新客開始' && norm(rule.why).indexOf('還沒有自己的名單') < 0 ? '<p class="c3-rule-why">' + esc(rule.why) + '</p>' : '') + '<p class="c3-rule-def">等名單有了（買過、做過、訂過的人），再用 333 算一次。</p></div>';
    } else if (rule) {
      var pct = Math.round(rule.dormant * 100 / rule.total), over = rule.dormant * 3 > rule.total, auto = rule.auto || (over ? 'return' : 'new'), word = { new: '新客', return: '回頭客' };
      var strip = '';
      if (rule.total <= 60) { for (var i = 0; i < rule.total; i++) strip += '<i' + (i < rule.dormant ? ' class="on"' : '') + '></i>'; strip = '<div class="c3-rstrip" style="--n:' + rule.total + '" aria-hidden="true">' + strip + '<span class="third" style="left:' + (100 / 3).toFixed(3) + '%"><em>三分之一</em></span></div>'; }
      else strip = '<div class="c3-rbar" aria-hidden="true"><i style="width:' + pct + '%"></i><span class="third" style="left:33.333%"><em>三分之一</em></span></div>';
      ruleCard = '<div class="c3-card c3-rule' + (start === 'return' ? ' is-return' : '') + '"><div class="c3-rule-k' + (rule.key ? ' tap' : '') + '"' + tap(rule.key) + '>' + bracket('333 法則・先從新客還是回頭客開始') +
        '<div class="c3-rule-big"><b>' + odo(String(rule.dormant), 'rule:d') + '</b><span class="u">／' + rule.total + '</span><small>很久沒來</small></div>' +
        '<p class="c3-rule-pct">' + pct + '%・' + (over ? '超過三分之一' : '不到三分之一') + (rule.list === 'borrowed' ? '<em class="c3-borrow">借來的名單</em>' : '') + '</p></div>' + strip +
        '<div class="c3-rule-v"><span>所以先從</span><b>' + word[rule.start] + '</b><span>開始</span>' + (rule.start !== auto ? '<p class="c3-rule-why">333 算出來是' + word[auto] + '；你選' + word[rule.start] + '：' + esc(rule.why || '') + '</p>' : '') + '</div>' +
        '<p class="c3-rule-def">很久沒來＝超過三個週期沒回來；超過名單的三分之一，就先叫回頭客回來。</p></div>';
    } else ruleCard = C.live && C.at === 3 ? softLine('正在問：名單一共幾位、很久沒來幾位') : '';
    return '<section class="c3-sec c3-people" data-sec="people">' + head(C, 'people', pp.headline) +
      '<div class="c3-pgrid"><div class="c3-card c3-galaxy"><canvas class="c3-orbit" role="img" aria-label="' + esc(aria) + '"></canvas>' + legend + '</div>' +
      '<div class="c3-ptypes">' + cards + (C.live && C.at === 3 && types.length < 3 ? softLine('正在問：還有沒有別種客人') : '') + '</div></div>' + ruleCard + '</section>';
  }

  /* ── 目的與目標：目的一句話 → 拆成每個目標（訪談中一個目標一個圓環）→ 這一期要做的量。
     日常（訪談完）：「離目標」只在第一屏出現一次；這裡只留目的與這一期要做的量 ── */
  function aim(m, C) {
    var p = m.purpose, gl = m.goals, daily = !C.live && !!m.today; if (!p && (!gl || daily)) return null;
    var hd = '<header class="c3-head c3-eyerow">' + eyebrow(daily ? '目的' : '目的與目標') + actBtn(C, 'aim', p ? p.line : gl.headline) + '</header>';
    var pur = p ? '<div class="c3-purpose"><small class="c3-k">' + g(p.src || 'said') + '目的</small><h2 class="c3-pline' + (p.key ? ' tap' : '') + '"' + tap(p.key) + '>' + wb(p.line) + '</h2>' +
      (p.why ? '<p class="c3-pwhy">' + esc(p.why) + '</p>' : '') + (p.quote ? '<button class="c3-quote" type="button" data-src="__purpose"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5c0-3 1.4-4.8 3.6-5.5M9.5 9.5c0-3 1.4-4.8 3.6-5.5M3 9.5h3v3.5H3zM9.5 9.5h3v3.5h-3z"/></svg>聽你原本怎麼說</button>' : '') + '</div>'
      : '';
    var leads = gl && (gl.lead || []).length ? '<div class="c3-card c3-leads">' + gl.lead.map(function (x) {
      var strip, pct = Math.round(Math.min(1, x.done / x.target) * 100);
      if (x.target <= 60) { strip = ''; for (var i = 0; i < x.target; i++) strip += '<i' + (i < x.done ? ' class="on"' : '') + '></i>'; strip = '<span class="c3-ldots" style="--n:' + x.target + '" aria-hidden="true">' + strip + '</span>'; }
      else strip = '<span class="c3-lbar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>';
      return '<div class="c3-lead' + (x.key ? ' tap' : '') + '"' + tap(x.key) + '><div class="c3-lhead"><small title="做多少由你決定">這一期要做的量</small><b>' + esc(x.t) + '</b><em>' + odo(fmt(x.done), 'lead:' + x.t) + '<span class="u">／' + fmt(x.target) + ' ' + esc(x.unit) + '</span></em></div>' + strip + '</div>';
    }).join('') + '</div>' : '';
    var goals = '';
    if (gl && !daily) {
      var per = period(gl, C.date);
      goals = '<div class="c3-goalwrap' + (p ? ' has-root' : '') + '"><div class="c3-ghead"><small class="c3-k">拆成目標</small><h3>' + wb(gl.headline) + '</h3><span class="c3-gperiod">' + esc(per.from + ' → ' + per.to) + '・' + esc(per.txt) + (per.frac != null ? '・時間過了 ' + Math.round(per.frac * 100) + '%' : '') + '</span></div>' +
        '<div class="c3-goals" style="--n:' + gl.items.length + '">' + gl.items.map(function (x, i) {
          var r = rate(x), mv = moved(x), pct = Math.round(Math.max(0, r) * 100), learn = x.phase === 'learn', ln = learn && x.learn, res = gradientLine(Math.max(0, r), [{ done: mv.done, left: mv.left, unit: x.unit }]);
          var vis;
          if (ln) {   // 先試哪種有效：試過的開場一顆一顆點（圓環只用來畫「家」）
            var dd = ''; for (var k = 0; k < Math.min(12, ln.of); k++) dd += '<i class="' + (k < ln.done ? 'on' : k === ln.done ? 'next' : '') + '"></i>';
            vis = '<div class="c3-gtry tap" role="button" tabindex="0" data-calc="g' + i + '" title="點開看怎麼算的"><span class="c3-gtdots" aria-hidden="true">' + dd + '</span><b>' + odo(ln.done + '／' + ln.of, 'ring:g' + i) + '</b><span>' + esc(ln.t) + '</span></div>';
          } else vis = '<div class="c3-gring tap" role="button" tabindex="0" data-calc="g' + i + '" title="點開看怎麼算的"><canvas class="c3-gringcv" data-ring="g' + i + '" role="img" aria-label="' + esc(x.t + '達成 ' + pct + '%') + '"></canvas><div class="c3-gmid"><b>' + odo(pct + '%', 'ring:g' + i) + '</b><span>' + esc(res) + '</span></div></div>';
          return '<article class="c3-card c3-goal2' + (ln ? ' is-learn' : '') + '">' + vis +
            '<div class="c3-gbody"><div class="c3-gtags"><span class="c3-lk ' + esc(x.lane) + '">' + esc(LANE[x.lane]) + '</span><span class="c3-phase ' + (learn ? 'learn' : 'push') + '">' + (learn ? '先試哪種有效' : '追結果') + '</span><span class="c3-gdue">到 ' + esc(per.to) + '</span></div>' +
            '<h4>' + esc(x.t) + '</h4><div class="c3-gnums"><span' + tap(x.key) + ' class="tap"><small>起點</small><b>' + fmt(x.base) + '</b></span><i aria-hidden="true">→</i><span' + tap(x.now_key || x.key) + ' class="tap now"><small>現在</small><b>' + fmt(x.now) + '</b></span><i aria-hidden="true">→</i><span' + tap(x.key) + ' class="tap"><small>目標</small><b>' + fmt(x.target) + '<em>' + esc(x.unit) + '</em></b></span></div>' +
            (ln ? '<p class="c3-gres">成果：' + esc(res) + '（' + pct + '%）</p>' : '') +
            (x.how ? '<p class="c3-how"><small>怎麼做到</small><span>' + esc(x.how) + '</span></p>' : '') + '</div></article>';
        }).join('') + '</div>' + leads + '</div>';
    } else if (gl && daily) goals = '';   // 這一期要做的量：第一屏圈圈下的圖例、模組卡的數字已經有了，日常不再畫第三次
    else if (C.live && C.at === 5) goals = softLine('正在拆成目標：新客幾位、回頭客叫回幾位、到哪一天');
    return '<section class="c3-sec c3-aim" data-sec="aim">' + hd + pur + goals + '</section>';
  }

  /* ── 你的招牌（緊接在星圖後面）：賣什麼、主力與價格；你特別在哪，每一條都要有客人的證據與出處記號 ── */
  function offer(m, C) {
    var o = m.offer; if (!o) return null;
    var items = (o.items || []).map(function (x) { return '<span class="c3-oitem' + (x.key ? ' tap' : '') + '"' + tap(x.key) + '><b>' + esc(x.t) + '</b>' + (x.price ? '<em>' + esc(x.price) + '</em>' : '') + '</span>'; }).join('');
    var sp = (o.special || []).map(function (x, i) {
      return '<li' + (x.key ? ' class="tap"' + tap(x.key) : '') + '><span class="n">' + pad2(i + 1) + '</span><div><b>' + esc(x.t) + '</b><p>' + g(x.src) + '<span>' + esc(x.proof) + '</span></p></div></li>';
    }).join('');
    return '<section class="c3-sec c3-offer" data-sec="offer"><div class="c3-card c3-offercard"><div class="c3-offer-l"><div class="c3-offer-k"><span class="c3-k">你的招牌</span>' + actBtn(C, 'offer', o.line) + '</div>' +
      '<h2 class="c3-offer-line">' + esc(o.line) + '</h2>' + (items ? '<div class="c3-oitems">' + items + '</div>' : '') +
      (o.me ? '<p class="c3-ome"><small>你本人</small><span>' + esc(o.me) + '</span></p>' : '') +
      (o.quote ? '<button class="c3-quote" type="button" data-src="__offer"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5c0-3 1.4-4.8 3.6-5.5M9.5 9.5c0-3 1.4-4.8 3.6-5.5M3 9.5h3v3.5H3zM9.5 9.5h3v3.5h-3z"/></svg>聽你原本怎麼說</button>' : '') + '</div>' +
      (sp ? (C.day
        /* 日常：客人的證據訪談時講過了，收成一行，點開才看 */
        ? '<details class="c3-offer-r c3-fold"><summary><span>你特別在哪・客人的證據</span><em>' + cn(o.special.length) + '條</em></summary><ol class="c3-special">' + sp + '</ol></details>'
        : '<div class="c3-offer-r"><small class="c3-k">你特別在哪・客人的證據</small><ol class="c3-special">' + sp + '</ol></div>') : '') + '</div></section>';
  }

  /* ── 存下來的（SCALE 的 E）：名單、官網與商家頁、被搜得到、不用人工的流程。只畫他有的那幾種，沒有的不放空格 ── */
  function assets(m, C) {
    var a = m.assets; if (!a) return null;
    var by = {}; (a.items || []).forEach(function (x) { by[x.kind] = x; });
    var kinds = ['list', 'site', 'search', 'flow'].filter(function (k) { return by[k]; }); if (!kinds.length) return null;
    return '<section class="c3-sec c3-assetsec" data-sec="assets">' + head(C, 'assets', a.headline) + '<div class="c3-assets" style="--n:' + kinds.length + '">' + kinds.map(function (k) {
      var x = by[k];
      var grew = x.base != null && x.now != null && x.now > x.base;
      var num = x.now != null ? '<div class="c3-anum' + (x.key ? ' tap' : '') + '"' + tap(x.key) + '><b>' + odo(fmt(x.now), 'asset:' + k) + '</b><span class="u">' + esc(x.unit) + '</span>' + (grew ? '<em>訪談後 +' + fmt(x.now - x.base) + '</em>' : '') + '</div>' : '';
      return '<div class="c3-card c3-asset k-' + k + (grew ? ' grew' : '') + '"><header><span class="ic">' + ASSET_ICON[k] + '</span><small>' + ASSET[k] + '</small>' + g(x.src) + '</header><b class="t">' + esc(x.t) + '</b>' + num + (x.note ? '<p>' + esc(x.note) + '</p>' : '') + '</div>';
    }).join('') + '</div></section>';
  }

  /* ── 六格：客人怎麼走、最大的洞與算式；每格多一句「你現在怎麼做」與一句建議 ── */
  /* 已經知道的格：最卡的、也卡住的、有關的，或問過了還沒判斷的（跟下面攤開的格同一套）；先不做、沒問過的不算 */
  function knownNodes(m) { var ns = (m.flow || {}).nodes || {}; return NODES.map(function (n, i) { var x = ns[n]; return x && (/^(leak|hole|rel)$/.test(x.st) || (x.st === 'unknown' && x.now)) ? i : -1; }).filter(function (i) { return i >= 0; }); }
  function flowSec(m, C) {
    var f = m.flow, k = m.key, st = states(m), named = !C.old;
    if (!f) return null;
    /* 訪談中：那條路只畫已經知道的格；「先不做」只在下面收成一行講一次，沒問過的格不畫空圈 */
    var only = C.live ? knownNodes(m) : null, idx = only || [0, 1, 2, 3, 4, 5];
    var pipeLabel = '客人沿著' + (only ? '這幾格' : '六格') + '走：' + idx.map(function (i) { var n = NODES[i]; return n + '（' + (((f.nodes || {})[n] || {}).s || ST_LABEL[st[i]]) + '）'; }).join('、');
    var pipe = only && !only.length ? '' : '<canvas class="c3-pipe" role="img" style="--k:' + idx.length + '"' + (only ? ' data-only="' + only.join(',') + '"' : '') + ' aria-label="' + esc(pipeLabel) + '"></canvas>';
    var six = sixGrid(m);
    var label = named ? '六格' : !k ? '客人怎麼走' : k.kind === 'win' ? '成果' : '最卡的一格';
    if (!k) return '<section class="c3-sec" data-sec="flow">' + head(C, 'flow', f.headline || '六格還在問', '', f.headline).replace('<span>六格</span>', '<span>' + label + '</span>') + (pipe ? '<div class="c3-card c3-pipe-card">' + pipe + '</div>' : '') + six + '</section>';
    var win = k.kind === 'win', small = !!m.today, day = !C.live && !C.old && !!m.today;
    var kpi = '<div class="c3-kpi' + (k.key ? ' tap' : '') + '"' + tap(k.key) + '>' + bracket(k.label) +
      '<div class="c3-big' + (small ? ' sm' : '') + (win ? '' : ' hot') + '">' + odo(k.value, 'key') + (k.unit ? '<small>' + esc(k.unit) + '</small>' : '') + '</div>' +
      (k.sub ? '<div class="c3-sub">' + g(k.src) + '<span>' + esc(k.sub) + '</span></div>' : '') + '</div>';
    var fun = f.funnel, vis;
    if (fun) vis = '<div class="c3-vis' + (fun.key ? ' tap' : '') + '"' + tap(fun.key) + '><canvas class="c3-rows" role="img" aria-label="' + esc(fun.rows.map(function (r) { return r[0] + ' ' + r[1]; }).join('，')) + '"></canvas></div>';
    else vis = day || !pipe ? '' : '<div class="c3-vis">' + pipe + '</div>';
    /* 日常：六格那條路（一格一格往下走）訪談時看過了；每天只留最卡的那個數字、有關的幾格，先不做的收成一行 */
    var html = '<section class="c3-sec" data-sec="flow">' + head(C, 'flow', f.headline).replace('<span>六格</span>', '<span>' + label + '</span>') + '<div class="c3-card c3-leak' + (fun ? ' has-rows' : '') + (vis ? '' : ' is-solo') + '">' + kpi + vis + '</div>';
    if (fun && !day && pipe) html += '<div class="c3-card c3-pipe-card">' + pipe + '</div>';
    if (f.eq && (C.live || !m.today)) html += '<div class="c3-eq">' + f.eq.inputs.map(function (x, i) { return (i ? '<i class="op" aria-hidden="true">×</i>' : '') + '<div class="c3-factor"' + (i ? ' data-op="×"' : '') + '><small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('') +
      '<i class="op" aria-hidden="true">＝</i><div class="c3-factor res' + (f.eq.key ? ' tap' : '') + '" data-op="＝"' + tap(f.eq.key) + '><small>' + g('est') + '估的</small><b>' + esc(f.eq.res) + '</b></div></div>';
    return html + six + '</section>';
  }
  /* 六格：只把有關的格攤開（最卡的、也卡住的、有關的；訪談中問到了、還沒判斷的也算）；
     先不做的收成一行，點開才看；沒問過的不畫空格 */
  function sixGrid(m) {
    var ns = (m.flow || {}).nodes || {};
    if (!NODES.some(function (n) { return ns[n] && (ns[n].now || ns[n].tip); })) return '';
    var cell = function (n) {
      var x = ns[n] || {}, st = x.st || 'unknown', hot = st === 'leak' || st === 'hole';
      return '<button type="button" class="c3-sixc ' + esc(st) + '" data-node="' + esc(n) + '"><span class="h"><b>' + esc(n) + '</b><em class="' + (hot ? 'hot' : '') + '">' + esc(ST_LABEL[st]) + '</em></span>' +
        (x.now ? '<span class="now"><small>現在</small>' + esc(x.now) + '</span>' : '') +
        (x.tip ? '<span class="tip"><small>建議</small>' + esc(x.tip) + '</span>' : '') + '</button>';
    };
    var main = NODES.filter(function (n) { var x = ns[n]; return x && (/^(leak|hole|rel)$/.test(x.st) || (x.st === 'unknown' && x.now)); });
    var later = NODES.filter(function (n) { var x = ns[n]; return x && x.st === 'later'; });
    var fold = later.length ? '<details class="c3-sixfold"><summary><span>' + (main.length ? '另外' : '') + cn(later.length) + '格先不做</span><em>' + esc(later.join('、')) + '</em></summary>' +
      '<div class="c3-six">' + later.map(cell).join('') + '</div></details>' : '';
    return (main.length ? '<div class="c3-six" style="--n:' + main.length + '" aria-label="六格・有關的幾格">' + main.map(cell).join('') + '</div>' : '') + fold;
  }

  var ICON = {
    who: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="10" height="16.5" rx="1.5"/><rect x="13.5" y="9" width="7" height="11.5" rx="1"/><path d="M6.5 8h4M6.5 12h4M6.5 16h4"/></svg>',
    from: '<svg viewBox="0 0 24 24"><path d="M6.6 3.5c1-.7 2.4-.6 2.9.4l1.1 2.4c.4.8-.1 1.6-.7 2l-1 .6c.7 1.8 2.2 3.3 4 4l.6-1c.4-.6 1.2-1 2-.7l2.4 1.1c1 .5 1.1 1.9.4 2.9-1 1.5-3 2.1-4.8 1.3-4-1.8-6.8-4.6-8.6-8.6-.8-1.8-.2-3.8 1.3-4.8z"/></svg>',
    why: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.2l2.8 2.8 5.2-5.6"/></svg>',
    val: '<svg viewBox="0 0 24 24"><path d="M3.5 17.5l6-6 4 3.5 7-8"/><path d="M15.5 7h5v5"/></svg>'
  };
  var ARROW = '<span class="c3-arrow" aria-hidden="true"><svg viewBox="0 0 24 12"><path d="M1 6h20M16 1.5 21 6l-5 4.5"/></svg></span>';
  function success(m, C) {
    var s = m.success; if (!s) return null;
    var keys = ['who', 'from', 'why', 'val'];
    return '<section class="c3-sec" data-sec="success">' + head(C, 'success', s.headline) + '<div class="c3-formula">' + (s.terms || []).map(function (tm, i) {
      var val = i === s.terms.length - 1;
      return (i ? ARROW : '') + '<div class="c3-term' + (val ? ' val' : '') + (val && tm.key ? ' tap' : '') + '"' + (val ? tap(tm.key) : '') + '><span class="ic">' + ICON[keys[i] || 'why'] + '</span><small>' + esc(tm.k) + '</small><b>' + esc(tm.v) + '</b>' +
        (val && tm.src ? '<span class="c3-srcline">' + g(tm.src) + esc(SRC[tm.src] || '') + '</span>' : '') + '</div>';
    }).join('') + '</div>' + (s.quote ? '<button class="c3-quote" type="button" data-src="__quote"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5c0-3 1.4-4.8 3.6-5.5M9.5 9.5c0-3 1.4-4.8 3.6-5.5M3 9.5h3v3.5H3zM9.5 9.5h3v3.5h-3z"/></svg>聽你原本怎麼說</button>' : '') + '</section>';
  }

  function time(m, C) {
    var t = m.time; if (!t) return null;
    var week = (t.week || []).filter(function (w) { return w.h > 0; }), total = week.reduce(function (a, b) { return a + b.h; }, 0) || 1, d = t.day || null, span = d ? (d.end - d.start) || 1 : 1;
    var pct = function (h) { return ((h - (d ? d.start : 0)) / span * 100).toFixed(2) + '%'; };
    var bar = '<div class="c3-weekbar" role="img" aria-label="一週 ' + total + ' 小時：' + esc(week.map(function (w) { return w.n + ' ' + w.h; }).join('、')) + '">' + week.map(function (w) {
      return '<span class="c3-seg ' + esc(w.cls || '') + (w.key ? ' tap' : '') + '" style="flex:' + w.h + '"' + tap(w.key) + ' title="' + esc(w.n + ' ' + w.h + ' 小時') + '">' + (w.h / total >= .14 ? '<b>' + esc(w.n) + '</b><span>' + w.h + '</span>' : '') + '</span>';
    }).join('') + '</div><div class="c3-wlegend">' + week.map(function (w) { return '<span class="' + esc(w.cls || '') + '"><i></i>' + esc(w.n) + '<em>' + w.h + '</em></span>'; }).join('') + '</div>';
    var day = t.free && d ? '<div class="c3-day"><div class="c3-track">' + (d.busy || []).map(function (b) { return '<i style="left:' + pct(b[0]) + ';width:' + ((b[1] - b[0]) / span * 100).toFixed(2) + '%"></i>'; }).join('') +
      '<em style="left:' + pct(t.free.from) + ';width:' + ((t.free.to - t.free.from) / span * 100).toFixed(2) + '%"></em></div>' +
      '<div class="c3-ticks">' + (d.ticks || []).map(function (h) { return '<span style="left:' + pct(h) + '">' + String(h).padStart(2, '0') + '</span>'; }).join('') + '</div>' +
      '<div class="c3-cap' + (t.free.key ? ' tap' : '') + '"' + tap(t.free.key) + '>' + g(t.free.src) + '<span>' + esc(t.free.label) + '</span></div></div>' : t.free ? '<div class="c3-cap' + (t.free.key ? ' tap' : '') + '"' + tap(t.free.key) + '>' + g(t.free.src) + '<span>' + esc(t.free.label) + '</span></div>' : '';
    var h = t.handoff;
    var kpi = h ? '<div class="c3-kpi' + (h.key ? ' tap' : '') + '"' + tap(h.key) + '>' + bracket('一週可以交給' + NM) + '<div class="c3-big ' + (m.today ? 'sm' : 'mid') + '">' + odo(h.v, 'hand') + '<small>小時</small></div><div class="c3-sub">' + g(h.src) + '<span>一週一共 ' + total + ' 小時</span></div></div>'
      : '<div class="c3-kpi">' + bracket('一週的時間') + '<div class="c3-big ' + (m.today ? 'sm' : 'mid') + '">' + odo(fmt(total), 'hand') + '<small>小時</small></div></div>';
    return '<section class="c3-sec" data-sec="time">' + head(C, 'time', t.headline) + '<div class="c3-card c3-time">' + kpi +
      '<div class="c3-timevis">' + bar + day + '</div></div></section>';
  }

  function opps(m, C) {
    var o = m.opps; if (!o) return null;
    return '<section class="c3-sec" data-sec="opps">' + head(C, 'opps', o.headline) +
      '<div class="c3-goal"><span class="c3-pill">方向</span><b>' + esc(o.goal) + '</b>' + (o.bounds ? '<small>' + esc(o.bounds) + '</small>' : '') + '</div>' +
      '<div class="c3-opps">' + (o.items || []).map(function (it, i) {
        return '<article class="c3-card c3-opp' + (it.vcls === 'leak' ? ' hot' : '') + '"><header><span class="c3-kind">' + esc(kindName(it.kind)) + '</span><span class="c3-node">' + esc(it.node || '') + '</span><span class="c3-idx">0' + (i + 1) + '</span></header>' +
          '<p>' + esc(it.t) + '</p><div class="c3-val' + (it.key ? ' tap' : '') + '"' + tap(it.key) + '>' + esc(it.v) + '</div>' +
          ((it.ctx || []).length ? '<ul>' + it.ctx.map(function (c) { return '<li>' + g(c[1]) + '<span>' + esc(c[0]) + '</span></li>'; }).join('') + '</ul>' : '') + '</article>';
      }).join('') + '</div>' +
      (o.learned ? '<div class="c3-learned"><div class="c3-eyebrow"><span>這一圈學到的</span></div><ol>' + o.learned.map(function (l, i) { return '<li><b>' + String(i + 1).padStart(2, '0') + '</b><div><strong>' + esc(l[0]) + '</strong><span>' + esc(l[1]) + '</span></div></li>'; }).join('') + '</ol></div>' : '') + '</section>';
  }

  function mapSec(m, C) {
    var mp = m.map; if (!mp) return null;
    var area = mp.mode === 'area', hubs = (mp.pins || []).some(function (p) { return p.kind === 'hub'; });
    var legend = '<p class="c3-maplegend" aria-hidden="true"><span><i class="c3-pm todo"></i>還沒聯絡</span><span><i class="c3-pm going"></i>聯絡中</span><span><i class="c3-pm won"></i>成交</span><span><i class="c3-pm past"></i>訂過</span>' + (hubs ? '<span><i class="c3-pm hub"></i>聚點</span>' : '') + '</p>';
    return '<section class="c3-sec" data-sec="map">' + head(C, 'map', mp.headline) + '<div class="c3-card c3-map"><div class="c3-mapbox"><canvas class="c3-radar" role="img" aria-label="' + esc((area ? '這一區' : '店的步行圈與附近') + '的 ' + mp.pins.length + ' 個對象') + '"></canvas></div>' +
      '<div class="c3-pins">' + (mp.cond ? '<p class="c3-cond">' + g(mp.cond_src || 'web') + '<span>' + esc(mp.cond) + '</span></p>' : '') + legend + '<div class="c3-pinlist">' +
      pinList(mp.pins, C) + '</div></div></div></section>';
  }

  /* 附近的清單：一家一列，編號對到地圖。日常：聯絡中、成交、訂過的照列；還沒聯絡的超過三家，前三家照列、其餘收成一行（今天要碰的在第一屏） */
  function pinList(pins, C) {
    var row = function (p, i) { return '<button type="button" data-pin="' + i + '"><b class="c3-pno">' + (i + 1) + '</b><i class="c3-pm ' + esc(p.kind === 'hub' ? 'hub ' + p.st : p.st) + '"></i><span>' + esc(p.n) + '</span><em class="c3-state ' + esc(p.st) + '">' + esc(p.chip) + '</em></button>'; };
    var idx = pins.map(function (p, i) { return i; });
    if (!C.day) return idx.map(function (i) { return row(pins[i], i); }).join('');
    var todo = idx.filter(function (i) { return pins[i].st === 'todo'; }), show = idx.filter(function (i) { return pins[i].st !== 'todo'; });
    if (todo.length <= 3) return idx.map(function (i) { return row(pins[i], i); }).join('');
    show = show.concat(todo.slice(0, 3)).sort(function (a, b) { return a - b; });
    var rest = todo.slice(3);
    return show.map(function (i) { return row(pins[i], i); }).join('') +
      '<details class="c3-fold c3-pinfold"><summary><span>另外' + cn(rest.length) + '家還沒聯絡</span><em>' + esc(rest.map(function (i) { return pins[i].n; }).slice(0, 3).join('、') + (rest.length > 3 ? '…' : '')) + '</em></summary>' + rest.map(function (i) { return row(pins[i], i); }).join('') + '</details>';
  }

  /* 資料：只畫有東西的那幾欄。訪談後只留「已經連上」的；還沒接的交給小二在對話裡提，不在畫面上排一列「還沒接」 */
  function data(m, C) {
    var d = m.data; if (!d) return null;
    var lanes = (d.lanes || []).filter(function (l) { return (l.items || []).length && (C.live || C.old || l.cls === 'on'); });
    if (!lanes.length) return null;
    var hl = d.headline;   // 訪談完了：只剩已經連上的，標題照實寫
    if (!C.live && !C.old) hl = '已經連上的' + cn(lanes[0].items.length) + '樣';
    return '<section class="c3-sec" data-sec="data">' + head(C, 'data', hl) + '<div class="c3-lanes" style="--n:' + lanes.length + '">' + lanes.map(function (l) {
      return '<div class="c3-card c3-lane ' + esc(l.cls) + '"><h3><i></i>' + esc(l.title) + '<span>' + l.items.length + '</span></h3><div class="c3-items">' + l.items.map(function (it) { return '<span>' + esc(it[0]) + '</span>'; }).join('') + '</div></div>';
    }).join('') + '</div></section>';
  }

  /* ── 節奏（取代舊的「這一週」）：開門／打烊／盤點排在一週七欄裡，每一條寫清楚排好了沒；資料怎麼進來 ── */
  /* 排程寫在哪：學員看得到的字不放引擎的名字 */
  function toolWord(t) { return !t ? '' : /claude|codex|chatgpt|openai|gpt|gemini|api|cli|cron|launchd|自動化/i.test(t) ? '這台電腦的排程' : t; }
  /* 只畫有排的那幾種：一週只有一兩次就寫成一行一行，不畫七天的空格子；排程編號只留在資料裡，畫面不放；
     還沒接的資料來源、還沒排的那一班，交給小二在對話裡提，畫面上不放「請小二排好」 */
  function rhythm(m, C) {
    var r = m.rhythm; if (!r) return null;
    var runs = (r.runs || []).slice().sort(function (a, b) { return a.at < b.at ? -1 : 1; }), wk = wd(C.date);
    var slots = runs.reduce(function (a, x) { return a + (x.on || []).length; }, 0);
    var cols = DAYS.map(function (dn, i) {
      var on = runs.filter(function (x) { return (x.on || []).indexOf(i) >= 0; });
      return '<div class="c3-rday' + (i === wk ? ' is-today' : '') + (on.length ? ' has' : '') + '"><span class="dn">週' + dn + (i === wk ? '<em>今天</em>' : '') + '</span>' +
        on.map(function (x) { return '<span class="c3-run ' + esc(x.st) + ' k-' + esc(x.kind) + '"><b>' + esc(hhmm(x.at) || x.at) + '</b><span>' + esc(RUN[x.kind]) + '</span></span>'; }).join('') + '</div>';
    }).join('');
    var rows = runs.map(function (x) {
      var note = x.st === 'manual' ? '<small>你來找我時，我先補做</small>' : '';
      return '<li class="c3-runrow"><span class="c3-runk k-' + esc(x.kind) + '">' + esc(RUN[x.kind]) + '</span><span class="c3-runat"><b>' + esc(hhmm(x.at) || x.at) + '</b><span>' + esc(daysText(x.on)) + '</span></span>' +
        '<span class="c3-runtool">' + esc(x.tool && x.st === 'set' ? '在' + toolWord(x.tool) : '') + '</span><span class="c3-runst"><em class="c3-state ' + (x.st === 'set' ? 'on' : x.st) + '">' + (x.st === 'set' ? CHECK : '') + esc(RUN_ST[x.st]) + '</em>' + note + '</span></li>';
    }).join('');
    var on = (r.intake || []).filter(function (x) { return x.st === 'on'; });
    var intake = on.length ? '<div class="c3-card c3-intake"><h3>資料怎麼進來</h3><ul>' + on.map(function (x) {
      return '<li class="on"><span class="ic">' + (HOW_ICON[x.how] || '') + '</span><span class="t"><b>' + esc(x.t) + '</b><small>' + esc(HOW[x.how] || '') + '</small></span></li>';
    }).join('') + '</ul></div>' : '';
    var task = !m.today && m.next && m.next.task ? nextTask(m.next) : '';
    if (!runs.length && !intake && !task) return null;
    return '<section class="c3-sec c3-rhythm" data-sec="rhythm">' + head(C, 'rhythm', r.headline, '<em class="c3-cad">' + esc(CAD[r.cadence] || '') + '</em>') +
      (slots >= 3 ? '<div class="c3-card c3-rweek"><div class="c3-rdays">' + cols + '</div></div>' : '') +
      '<div class="c3-rgrid' + (intake ? '' : ' is-one') + '">' + (runs.length ? '<div class="c3-card c3-runs">' + (runs.length > 1 ? '<h3>' + cn(runs.length) + '種例行</h3>' : '') + '<ul>' + rows + '</ul></div>' : '') + intake + '</div>' + task + '</section>';
  }
  function nextTask(n) {
    var t = n.task || {};
    return '<div class="c3-card c3-task"><small>' + esc(t.k) + '</small><b>' + esc(t.t) + '</b>' +
      (t.draft ? '<div class="c3-bubble"><div class="to">' + esc(t.to || '') + '</div><p>' + esc(t.draft) + '</p></div><p class="c3-hint">草稿：你自己複製、自己送。</p>' : '') + '</div>';
  }
  /* 舊版的「這一週」（沒有 rhythm 的地圖） */
  function rcState(rc) { if (!rc || /還沒/.test(rc)) return ['todo', '還沒排']; if (/示意/.test(rc)) return ['demo', '示意']; return ['on', '排好了']; }
  function next(m, C) {
    var n = m.next; if (!n || m.rhythm) return null;
    var r = n.rhythm || {}, on = r.on || [], rs = rcState(r.rc);
    return '<section class="c3-sec" data-sec="next">' + head(C, 'next', n.headline) + '<div class="c3-next">' +
      '<div class="c3-card c3-cal"><div class="c3-days" style="--cols:' + DAYS.map(function (dn, i) { return on.indexOf(i) >= 0 ? 'minmax(0,2.6fr)' : 'minmax(0,1fr)'; }).join(' ') + '">' + DAYS.map(function (dn, i) {
        var hit = on.indexOf(i) >= 0;
        return '<div class="c3-daycol' + (hit ? ' on' : '') + '"><span class="dn">週' + dn + '</span>' + (hit ? '<div class="c3-evt"><small>每週</small><b>' + esc(r.cap || '') + '</b><em class="c3-state ' + rs[0] + '">' + rs[1] + '</em></div>' : '') + '</div>';
      }).join('') + '</div>' + (r.rc ? '<p class="c3-rc">' + esc(r.rc) + '</p>' : '') + '</div>' + nextTask(n) + '</div></section>';
  }

  var BUILD = { asks: asks, today: today, mods: modsSec, who: hero, offer: offer, people: people, aim: aim, assets: assets, flow: flowSec, success: success, time: time, opps: opps, map: mapSec, data: data, rhythm: rhythm, next: next };
  /* 這次要畫哪幾塊、照什麼順序：只畫真的有資料的塊。
     訪談中多畫一塊「正在問的那一塊」（這一站還沒有資料時），後面的站不預告，進度交給頂上的站數條；
     訪談後沒有的就不放。 */
  function plan(m, C) {
    var order = C.live ? ORDER_LIVE : C.old ? ORDER_OLD : ORDER_DAY, out = [];
    var day = !C.live && !C.old && !!m.today, hasMods = modsOf(m).some(function (x) { return !isTool(x); });
    var at = ((m.stage || {}).at) || 1, nowSec = C.live ? STATION_NOW[at] : null, have = {};
    C.L = day ? resolveLayout(m, C) : null;   // 日常：先決定分組（layout 單獨放出去的模組，模組那一塊就不再畫）
    order.forEach(function (name) {
      // 日常：成功公式就是第一屏左欄、三個機會併進模組，下面不再重複一次
      // 「資料」：訪談後只剩已經連上的，節奏那一塊的「資料怎麼進來」已經寫了，日常不再放一塊
      if (day && (name === 'success' || name === 'data' || (name === 'opps' && hasMods))) return;
      var empty = name === 'flow' && m.flow && !m.key && !Object.keys(m.flow.nodes || {}).length && !C.old;
      var got;
      try { got = empty ? null : BUILD[name](m, C); } catch (e) { got = brokenSec(name); }
      var html = got && typeof got === 'object' ? got.html : got;
      if (html) { have[name] = 1; out.push({ name: name, html: html, skel: got && got.skel, parts: got && got.parts }); }
      else if (C.live && name === nowSec) out.push({ name: name, html: waitSec(name, C), wait: true });
      else if (C.old && SEC[name].old && !(name === 'next' && m.rhythm)) out.push({ name: name, html: waitSec(name, C), wait: true });
    });
    // v14：他加的日常工具一塊一塊畫；layout 單獨放出去的獲客做法也自己一塊。訪談中、舊地圖接在模組那一塊後面
    var extra = [];
    modsOf(m).forEach(function (x) {
      if (isTool(x)) extra.push({ name: 'mod:' + x.id, html: toolBlock(m, C, x), mod: x.id });
      else if (C.L && C.L.placed[x.id]) extra.push({ name: 'mod:' + x.id, html: wayBlock(m, C, x), mod: x.id });
    });
    if (extra.length) { var mi = -1; out.forEach(function (x, i) { if (x.name === 'mods') mi = i; }); if (mi < 0) mi = out.length - 1; out.splice.apply(out, [mi + 1, 0].concat(extra)); }
    // 第③站成功公式、第⑦站的今天也算這一站有東西了：這一站已經長出別的塊，就不再放「正在問」那一行
    if (C.live && nowSec && !have[nowSec] && (STATION_GO[at] || []).some(function (n) { return have[n] && n !== 'who'; }))
      out = out.filter(function (x) { return !(x.wait && x.name === nowSec); });
    if (C.live) return foldLive(m, C, out);
    if (day) return groupDay(m, C, out);
    return out;
  }

  /* ── 收合（10/3，Nelsen：「不是讓產品越長越大、頁面越做越長」）──
     訪談中：走過的站收成一行（標題＋一句現況），點開才看全部；正在問的那一站攤開；後面的站不畫。
     日常（v14）：第一屏以下照 layout 分組（沒有就用 GROUP_DEF）；收著的組只佔標題一行加一句現況。
     點標題收合：畫面先換，再存進地圖的 layout（POST /api/layout）；存不進去就只記在這一頁，講一句白話。 */
  var CARET = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg>';
  function foldHTML(id, sec, label, line, open, inner, kind, count, dot) {
    var bid = 'c3g-' + id;
    return '<section class="c3-grp ' + kind + (open ? ' is-open' : ' is-closed') + '" data-sec="' + esc(sec) + '" data-grp="' + esc(id) + '"' + (count ? ' data-n="' + count + '"' : '') + '>' +
      '<button type="button" class="c3-grp-t" data-grp-t="' + esc(id) + '" data-fk="grp:' + esc(id) + '" aria-expanded="' + open + '"' + (open ? ' aria-controls="' + bid + '"' : '') + '>' +
      (kind === 'is-sec' ? '<b class="c3-n" aria-hidden="true"></b>' : '') + '<span class="k">' + esc(label) + (dot ? '<i class="c3-gdot" aria-hidden="true"></i><span class="c3-sr">（有提醒）</span>' : '') + '</span><span class="s">' + (kind === 'is-grp' ? wb(line) : esc(line)) + '</span><span class="c">' + (open ? '收起' : '打開') + CARET + '</span></button>' +
      (open ? '<div class="c3-grp-body" id="' + bid + '">' + inner + '</div>' : '') + '</section>';
  }
  function names(list, n) { list = list.filter(Boolean); return list.slice(0, n).join('、') + (list.length > n ? '等' : ''); }
  /* 走過的那一站，收起來時那一句：照他交的資料寫，沒有就只寫標題 */
  function secLine(m, C, name) {
    var x;
    switch (name) {
      case 'who': x = m.who || {}; return (x.line ? x.line + '・' : '') + NM + '記下 ' + ((C.R.gr || {}).dots || []).length + ' 件事';
      case 'offer': x = m.offer || {}; return (x.line || '') + ((x.special || []).length ? '・' + cn(x.special.length) + '條客人的證據' : '');
      case 'aim': return m.purpose ? '目的：' + m.purpose.line : ((m.goals || {}).headline || '');
      case 'people': x = (m.people || {}).types || []; return x.length ? cn(x.length) + '種客人：' + names(x.map(function (t) { return t.name; }), 3) : ((m.people || {}).headline || '');
      case 'flow': x = m.key; return x ? x.label + '：' + x.value + (x.unit || '') : ((m.flow || {}).headline || '');
      case 'mods': return names((((m.mods || {}).items) || []).filter(function (y) { return y.st === 'try' || y.st === 'on'; }).map(function (y) { return y.name; }), 3);
      case 'today': return ((m.today || {}).note) || '';
      default: return ((m[name === 'opps' ? 'opps' : name] || {}).headline) || '';
    }
  }
  /* 10/3 sec-r1：走過的站再併成一行「走過的 N 站」，點開才列出每一站那一行（再點一行才看全文）；
     這一行排在正在談的那一站上面，正在談的那一站永遠在首屏上半 */
  function foldLive(m, C, out) {
    var R = C.R, at = ((m.stage || {}).at) || 1, go = STATION_GO[at] || [], open = R.secOpen || (R.secOpen = {});
    var past = [], now = [];
    out.filter(function (x) {
      var st = (SEC[x.name] || {}).st;
      return x.wait || !st || st <= at || go.indexOf(x.name) >= 0;   // 後面的站不畫（交得早的也先放著，到那一站才長出來）
    }).forEach(function (x) {
      var st = (SEC[x.name] || {}).st;
      if (x.wait || !st || st === at || go.indexOf(x.name) >= 0) { now.push(x); return; }   // 正在問的那一站：攤開
      var on = !!open[x.name];
      past.push({ name: x.name, html: foldHTML('s-' + x.name, x.name, SEC[x.name].label, secLine(m, C, x.name), on, on ? x.html : '', 'is-sec') });
    });
    R.pastNames = past.map(function (x) { return x.name; });
    if (!past.length) return now;
    var pOn = !!R.pastOpen, n = Math.max(1, at - 1);
    var row = { name: 'past', html: foldHTML('past', 'past', '走過的 ' + n + ' 站', names(past.map(function (x) { return SEC[x.name].label; }), 3), pOn, pOn ? past.map(function (x) { return x.html; }).join('') : '', 'is-past', past.length) };
    var k = 0; while (k < now.length && now[k].name === 'asks') k++;   // 「想問你」要他回答，仍然排最上面
    return now.slice(0, k).concat([row], now.slice(k));
  }
  /* 日常各組，各一句現況（都從資料來，數不到就不寫那一段）。最常變、最有用的放前面；整句會換行，不切掉。
     預設的五組照組名寫；他自己改過的組，照組裡的塊各取一句 */
  function blockBits(m, C, name) {
    var x, bits = [];
    if (name.indexOf('mod:') === 0) {
      x = modById(m, name.slice(4)); if (!x) return bits;
      if (halted(C, x.id)) bits.push(x.name + '：對不上，先停');
      else { var a = alertsOf(m, C).filter(function (q) { return q.mod === x.id; })[0]; bits.push(a ? a.text : x.name); }
      return bits;
    }
    switch (name) {
      case 'mods':
        x = modsOf(m).filter(function (y) { return running(y) && !isTool(y) && !((C.L || {}).placed || {})[y.id]; });
        if (x.length) { var rv = x.filter(function (y) { return y.st === 'try' && y.review; }).map(function (y) { return y.review; }).sort()[0]; bits.push(names(x.map(function (y) { return y.name; }), 3)); if (rv) bits.push((dayDiff(rv, C.date) < 0 ? '試到 ' + md(rv) + '，該看結果了' : '試到 ' + md(rv))); }
        else if (m.opps) bits.push(m.opps.headline || '');
        break;
      case 'who': bits.push(NM + '記下 ' + ((C.R.gr || {}).dots || []).length + ' 件事'); break;
      case 'offer': if (m.offer && m.offer.line) bits.push(m.offer.line); break;
      case 'people': x = (m.people || {}).types || []; if (x.length) bits.push(names(x.map(function (t) { return t.name; }), 3)); break;
      case 'aim': if (m.purpose) bits.push('目的：' + m.purpose.line); break;
      case 'assets': if (m.assets && m.assets.headline) bits.push(m.assets.headline); break;
      case 'flow': x = leakNode(m); if (x) bits.push('最卡在' + x); break;
      case 'map':
        var pins = ((m.map || {}).pins) || [], going = pins.filter(function (p) { return p.st === 'going'; }).length, won = pins.filter(function (p) { return p.st === 'won'; }).length;
        if (pins.length) bits.push('地圖上 ' + pins.length + ' 個對象' + (going ? '，聯絡中 ' + going : '') + (won ? '，成交 ' + won : ''));
        break;
      case 'rhythm': bits = rhythmBits(m); break;
      default: x = m[name]; if (x && x.headline) bits.push(x.headline);
    }
    return bits;
  }
  function groupLine(m, C, g, mem) {
    var bits = [];
    if (g.id === 'yours' || g.tools) {   // 你加的：幾塊＋第一則提醒（例如「1 塊・白米剩 1 天」）
      var tools = mem.filter(function (x) { return x.mod; }), first = null;
      tools.forEach(function (x) { if (!first) { var a = alertsOf(m, C).filter(function (q) { return q.mod === x.mod; })[0]; if (a) first = a.text; } });
      var stopped = tools.filter(function (x) { return halted(C, x.mod); }).map(function (x) { return (modById(m, x.mod) || {}).name; });
      bits.push(tools.length + ' 塊');
      if (first) bits.push(first); else if (stopped.length) bits.push(stopped[0] + '：對不上，先停');
      else bits.push(names(tools.map(function (x) { return (modById(m, x.mod) || {}).name; }), 2));
      mem = mem.filter(function (x) { return !x.mod; });
    }
    var order = g.id === 'biz' ? ['offer', 'who', 'people', 'aim', 'assets'] : null;
    var list = mem.map(function (x) { return x.name; });
    if (order) list.sort(function (a, b) { return (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99; });
    list.forEach(function (n) { bits = bits.concat(blockBits(m, C, n)); });
    return bits.filter(Boolean).slice(0, 3).join('・');
  }
  /* 節奏那一句：開門、打烊同一組星期就寫在一起（週一到週五 08:30 開門、19:00 打烊），盤點另寫；還沒排的照實標 */
  function rhythmBits(m) {
    var runs = ((m.rhythm || {}).runs) || [], by = {}, out = [];
    runs.forEach(function (r) { by[r.kind] = r; });
    var one = function (r) { return (hhmm(r.at) || r.at) + ' ' + RUN[r.kind] + (r.st === 'set' ? '' : '（' + RUN_ST[r.st] + '）'); };
    var o = by.open, c = by.close;
    if (o && c && daysText(o.on) === daysText(c.on)) out.push(daysText(o.on) + ' ' + one(o) + '、' + one(c));
    else [o, c].forEach(function (r) { if (r) out.push(daysText(r.on) + ' ' + one(r)); });
    if (by.week) out.push(daysText(by.week.on) + ' ' + one(by.week));
    if (!runs.length && m.next && m.next.headline) out.push(m.next.headline);
    return out;
  }
  /* layout → 這一次的分組：[{id, name, blocks, open}]，再加 placed（單獨放出去的模組）。
     規矩（跟伺服器同一套，畫面再守一次）：第一屏的東西不收；不認得的塊不收；同一塊只放第一次出現的那一組；
     layout 沒寫到的塊回到預設的那一組（那一組不在就接在最後）；沒有內容的組不畫。安全模式一律用預設分組。 */
  function safeGid(s, i, seen) { var v = String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'g' + i; while (seen[v]) v += '_'; seen[v] = 1; return v; }
  /* 畫面上最多 MAXG 行組標題（地圖格式：最多 8 組，沒放進分組、補回來的預設組也算）。伺服器交進來時就擋；
     舊資料或新長的日常工具讓組數超過時，第 8 組起併成一組「其他」——點它收合存回去，存著的版面就回到 8 組內 */
  var MAXG = 8;
  /* 日常本來就不畫的塊：成功公式（第一屏左欄就是它）、資料（節奏那一塊寫了）、這一週（有節奏就不畫）、有獲客做法時的三個機會 */
  function hiddenDay(m) {
    return { success: 1, data: 1, next: !m.next || !!m.rhythm, opps: modsOf(m).some(function (x) { return !isTool(x); }) };
  }
  function capGroups(list, hid) {
    var full = list.filter(function (g) { return g.blocks.some(function (b) { return !hid[b]; }); });
    if (full.length <= MAXG) return list;
    var keep = full.slice(0, MAXG - 1), rest = full.slice(MAXG - 1), id = 'more', k = 2;
    while (keep.some(function (g) { return g.id === id; })) id = 'more-' + (k++);
    return keep.concat([{ id: id, name: '其他', blocks: rest.reduce(function (a, g) { return a.concat(g.blocks); }, []), open: rest.some(function (g) { return g.open; }), tools: rest.some(function (g) { return g.tools; }) }]);
  }
  function resolveLayout(m, C) {
    var R = C.R || {}, lay = !C.safe && m.layout && Array.isArray(m.layout.groups) ? m.layout : null, mods = modsOf(m), byId = {}, known = {}, seen = {}, used = {}, placed = {};
    mods.forEach(function (x) { byId[x.id] = x; });
    ORDER_DAY.forEach(function (n) { known[n] = 1; });
    var defOf = function (n) { if (n.indexOf('mod:') === 0) return isTool(byId[n.slice(4)]) ? 'yours' : 'running'; for (var i = 0; i < GROUP_DEF.length; i++) if ((GROUP_DEF[i].secs || []).indexOf(n) >= 0) return GROUP_DEF[i].id; return null; };
    var list = [];
    if (lay) lay.groups.forEach(function (g, i) {
      if (!g || typeof g !== 'object') return;
      var id = safeGid(g.id, i, seen), def = GROUP_DEF.filter(function (d) { return d.id === id; })[0], blocks = [];
      (Array.isArray(g.blocks) ? g.blocks : []).forEach(function (b) {
        if (typeof b !== 'string' || FIRST[b]) return;
        var n = known[b] ? b : byId[b] ? 'mod:' + b : null;
        if (!n || used[n]) return;
        used[n] = 1; blocks.push(n); if (n.indexOf('mod:') === 0 && !isTool(byId[b])) placed[b] = 1;
      });
      list.push({ id: id, name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : def ? def.label : '你的分組', blocks: blocks, open: typeof g.open === 'boolean' ? g.open : !!(def && def.open), tools: id === 'yours' });
    });
    // 沒寫到的：預設那一組（GROUP_DEF 的順序）
    var rest = [], hid = hiddenDay(m);
    GROUP_DEF.forEach(function (d) { (d.secs || []).forEach(function (n) { if (!used[n] && !hid[n]) rest.push(n); }); if (d.tools) mods.forEach(function (x) { if (isTool(x) && !used['mod:' + x.id]) rest.push('mod:' + x.id); }); });
    rest.forEach(function (n) {
      var gid = defOf(n), g = list.filter(function (q) { return q.id === gid; })[0];
      if (!g) { var d = GROUP_DEF.filter(function (q) { return q.id === gid; })[0]; g = { id: gid, name: d.label, blocks: [], open: d.open, tools: !!d.tools }; seen[gid] = 1; list.push(g); }
      g.blocks.push(n); used[n] = 1;
    });
    list = capGroups(list, hid);
    var loc = R.grpLocal || {};
    list.forEach(function (g) { if (typeof loc[g.id] === 'boolean') g.open = loc[g.id]; });
    return { list: list, placed: placed, rev: lay && num(lay.rev) ? lay.rev : 0, from: lay ? 'map' : 'default' };
  }
  function groupDay(m, C, out) {
    var by = {}, top = [], L = C.L || resolveLayout(m, C), alerted = {};
    out.forEach(function (x) { by[x.name] = x; if (FIRST[x.name]) top.push(x); });
    alertsOf(m, C).forEach(function (a) { if (a.mod != null) alerted['mod:' + a.mod] = 1; });
    var groups = L.list.map(function (g) {
      var mem = g.blocks.map(function (n) { return by[n]; }).filter(Boolean); if (!mem.length) return null;
      var dot = mem.some(function (x) { return alerted[x.name]; });
      return { name: 'grp-' + g.id, grp: g.id, html: foldHTML(g.id, 'grp-' + g.id, g.name, groupLine(m, C, g, mem), g.open, g.open ? mem.map(function (x) { return x.html; }).join('') : '', 'is-grp', 0, dot) };
    }).filter(Boolean);
    return top.concat(groups);
  }
  /* 收著的那一塊要看：先打開它在的那一組（或那一站），再捲過去 */
  function groupOf(R, name) {
    var L = (R.C && R.C.L) || null; if (!L) return null;
    return L.list.filter(function (g) { return g.blocks.indexOf(name) >= 0; })[0] || null;
  }
  function reveal(R, name) {
    var C = R.C || {}, changed = false;
    if (C.live && (R.pastNames || []).indexOf(name) >= 0) {   // 走過的那一站：先打開「走過的 N 站」，再打開那一站
      R.secOpen = R.secOpen || {};
      if (!R.pastOpen) { R.pastOpen = true; changed = true; }
      if (!R.secOpen[name]) { R.secOpen[name] = true; changed = true; }
      if (changed) R.quiet.past = true;
      if (changed) update(R);
      return;
    }
    if (C.day) { var g = groupOf(R, name); if (g && !g.open) setOpen(R, g.id, true); }
  }
  function toggleGroup(R, id) {
    var name;
    if (id === 'past') { name = 'past'; R.pastOpen = !R.pastOpen; }
    else if (id.indexOf('s-') === 0) { name = id.slice(2); R.secOpen = R.secOpen || {}; R.secOpen[name] = !R.secOpen[name]; R.quiet.past = true; }   // 走過的站在「走過的 N 站」裡面：換的是外面那一塊
    else { var g = ((R.C && R.C.L) || { list: [] }).list.filter(function (q) { return q.id === id; })[0]; setOpen(R, id, !(g && g.open)); unfold(R, id); return; }
    R.quiet[name] = true; update(R);
    unfold(R, id);
  }
  function unfold(R, id) {
    var el = R.root.querySelector('.c3-body [data-grp="' + id + '"]'), body = el && el.querySelector(':scope > .c3-grp-body');
    if (body && !reduced()) { body.classList.add('c3-unfold'); body.addEventListener('animationend', function () { body.classList.remove('c3-unfold'); }, { once: true }); }
  }
  /* 打開或收起一組：畫面先換（只記在這一頁），再交整份 layout 給伺服器；同時只送一份，送完有新的改動再送 */
  function setOpen(R, id, on) {
    R.grpLocal = R.grpLocal || {}; R.grpLocal[id] = on; R.quiet['grp-' + id] = true; update(R);
    sendLayout(R);
  }
  function layoutBody(R) {
    var C = R.C, m = R.model, L = resolveLayout(m, C);
    return { rev: Math.max(L.rev, R.layRev || 0), groups: L.list.filter(function (g) { return g.blocks.length; }).map(function (g) { return { id: g.id, name: g.name, blocks: g.blocks.map(function (n) { return n.indexOf('mod:') === 0 ? n.slice(4) : n; }), open: !!g.open }; }) };
  }
  function sendLayout(R) {
    if (!R.opts.onLayout || !R.C || !R.C.day || R.C.safe) return;   // 樣張、安全模式：只記在這一頁
    if (R.layBusy) { R.layDirty = true; return; }
    var body = layoutBody(R); R.layBusy = true; R.layDirty = false;
    Promise.resolve().then(function () { return R.opts.onLayout(body); }).then(function () {
      R.layBusy = false; if (!R.alive) return;
      R.layRev = body.rev + 1;
      if (R.layDirty) sendLayout(R); else { R.layDone = R.layRev; settleLayout(R); }
    }, function (err) {
      R.layBusy = false; if (!R.alive) return;
      if (err && err.status === 409) { R.grpLocal = {}; R.layRev = 0; toast(R.root, '剛有人改過版面，已經換成最新的；想收哪一組，再點一次就好。'); update(R); return; }
      if (!R.layWarned) { R.layWarned = true; toast(R.root, '這次收合沒存進經營資料夾，先記在這一頁；重新打開會回到原本的樣子。'); }
    });
  }
  /* 伺服器的 layout 追上這一頁的改動了：這一頁記的就不用了（以伺服器那一份為準） */
  function settleLayout(R) {
    var lay = R.base && R.base.layout;
    if (R.layDone && lay && num(lay.rev) && lay.rev >= R.layDone && !R.layBusy) { R.grpLocal = {}; R.layDone = 0; }
  }

  /* ── 地圖：黑白步行圈；公司是圓點、訂過的是方塊、成交的是橘色；中間的黑方塊是你的店 ── */
  /* 地圖：黑白；公司是圓點、訂過的是方塊、成交的是橘色、聚點是雙圈。有實體店（store）中間是你的店和走路 5、10 分鐘的圈；
     沒有實體店（area：課程、顧問、網店）只畫對象。名字互相壓住時，那一家只寫編號，名字看右邊清單 */
  function radar(ctx, w, h, t, m, sel, theme, accent) {
    var mp = m.map, P = Object.assign({}, V.THEME[theme || 'light'], accent ? { accent: accent } : {}), area = mp.mode === 'area', pins = mp.pins || [];
    var c0 = mp.center, cx = w / 2, cy = h / 2, far = area ? 1 : 400, k;
    if (area && pins.length) {   // 沒有店：用對象的範圍置中，比例尺讓最外面那一家剛好放得下
      var la = pins.map(function (p) { return p.lat; }), ln = pins.map(function (p) { return p.lng; });
      c0 = { lat: (Math.min.apply(null, la) + Math.max.apply(null, la)) / 2, lng: (Math.min.apply(null, ln) + Math.max.apply(null, ln)) / 2 };
      pins.forEach(function (p) { far = Math.max(far, Math.abs(p.lng - c0.lng) * 100530 / (w / 2 - 70), Math.abs(p.lat - c0.lat) * 111000 / (h / 2 - 30)); });
      k = 1 / far;
    } else {
      pins.forEach(function (p) { far = Math.max(far, Math.hypot((p.lng - c0.lng) * 100530, (p.lat - c0.lat) * 111000)); });
      k = Math.min(w, h) / 2 * .84 / far;   // 比例尺跟著最遠的那一家走；步行圈照真實距離畫，畫不下的那圈只露出一段
    }
    ctx.fillStyle = P.line; for (var gx = 12; gx < w; gx += 20) for (var gy = 12; gy < h; gy += 20) ctx.fillRect(gx, gy, 1.2, 1.2);
    var boxes = [];   // 已經佔用的位置（店名、記號），新的店名不壓上去
    if (!area) {
      ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.strokeStyle = P.ink3;
      [400, 800].forEach(function (mm) { ctx.beginPath(); ctx.arc(cx, cy, mm * k, 0, Math.PI * 2); ctx.stroke(); });
      ctx.setLineDash([]); ctx.font = '500 10.5px ' + V.MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [[400, '5 分・400 m'], [800, '10 分・800 m']].forEach(function (r) { if (cy - r[0] * k < 10) return; var y = cy - r[0] * k, tw = ctx.measureText(r[1]).width + 12; ctx.fillStyle = P.surface; V.rr(ctx, cx - tw / 2, y - 8, tw, 16, 8); ctx.fill(); ctx.fillStyle = P.ink3; ctx.fillText(r[1], cx, y + .5); boxes.push([cx - tw / 2, y - 8, tw, 16]); });
      ctx.textBaseline = 'alphabetic';
      var ph = (t % 3.6) / 3.6; ctx.strokeStyle = P.ink; ctx.globalAlpha = (1 - ph) * .28; ctx.beginPath(); ctx.arc(cx, cy, 800 * k * ph, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = P.ink; V.rr(ctx, cx - 8, cy - 8, 16, 16, 4); ctx.fill();
      ctx.font = '600 12.5px ' + V.FONT; ctx.textAlign = 'center'; var sn = (m.store || {}).name || '你的店'; ctx.fillText(sn, cx, cy + 27);
      var sw = ctx.measureText(sn).width; boxes.push([cx - 10, cy - 10, 20, 20], [cx - sw / 2, cy + 15, sw, 16]);
    }
    var pts = pins.map(function (p, i) { return { p: p, i: i, X: cx + (p.lng - c0.lng) * 100530 * k, Y: cy - (p.lat - c0.lat) * 111000 * k }; });
    pts.forEach(function (q) { boxes.push([q.X - 8, q.Y - 8, 16, 16]); });
    pts.forEach(function (q) {
      var p = q.p, X = q.X, Y = q.Y, on = sel === q.i;
      ctx.lineWidth = 1.6;
      if (p.kind === 'hub') {   // 聚點：大一點的雙圈（材料行、學校、社團、商圈協會）
        ctx.fillStyle = P.surface; ctx.strokeStyle = p.st === 'won' ? P.accent : P.ink; ctx.beginPath(); ctx.arc(X, Y, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(X, Y, 3.6, 0, Math.PI * 2); ctx.fillStyle = p.st === 'todo' ? P.surface : p.st === 'won' ? P.accent : P.ink; ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
      } else if (p.st === 'past') { ctx.fillStyle = P.surface; ctx.strokeStyle = P.ink; ctx.fillRect(X - 5.5, Y - 5.5, 11, 11); ctx.strokeRect(X - 5.5, Y - 5.5, 11, 11); }
      else {
        if (p.st === 'won') { var q2 = ((t * .6) % 1 + 1) % 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.globalAlpha = (1 - q2) * .8; ctx.beginPath(); ctx.arc(X, Y, 7 + q2 * 14, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.6; }
        ctx.beginPath(); ctx.arc(X, Y, 6, 0, Math.PI * 2); ctx.fillStyle = p.st === 'won' ? P.accent : p.st === 'going' ? P.ink : P.surface; ctx.fill();
        ctx.strokeStyle = p.st === 'won' ? P.accent : p.st === 'todo' ? P.ink3 : P.ink; ctx.stroke();
      }
      if (on) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X, Y, 14, 0, Math.PI * 2); ctx.stroke(); }
    });
    // 店名：選中的、成交的先放；右、左、上、下試一輪，都會壓到別的就只寫編號
    var order = pts.slice().sort(function (a, b) { var r = function (q) { return sel === q.i ? 0 : q.p.st === 'won' ? 1 : q.p.st === 'going' ? 2 : q.p.kind === 'hub' ? 3 : 4; }; return r(a) - r(b) || a.Y - b.Y; });
    var hit = function (b) { return b[0] < 2 || b[1] < 2 || b[0] + b[2] > w - 2 || b[1] + b[3] > h - 2 || boxes.some(function (o) { return b[0] < o[0] + o[2] && b[0] + b[2] > o[0] && b[1] < o[1] + o[3] && b[1] + b[3] > o[1]; }); };
    order.forEach(function (q) {
      var p = q.p, on = sel === q.i, X = q.X, Y = q.Y, own = [X - 8, Y - 8, 16, 16];
      boxes = boxes.filter(function (b) { return b !== own && !(b[0] === own[0] && b[1] === own[1] && b[2] === 16); });
      ctx.font = (on ? '600 ' : '500 ') + '12px ' + V.FONT; var tw = ctx.measureText(p.n).width, hh = 15, r = p.kind === 'hub' ? 14 : 12;
      var tries = [[X + r, Y - hh / 2, 'left'], [X - r - tw, Y - hh / 2, 'right'], [X - tw / 2, Y - r - hh - 1, 'center'], [X - tw / 2, Y + r + 1, 'center']], placed = null;
      for (var j = 0; j < tries.length && !placed; j++) { var b = [tries[j][0] - 2, tries[j][1], tw + 4, hh]; if (!hit(b)) placed = tries[j].concat([b]); }
      boxes.push(own);
      ctx.fillStyle = p.st === 'todo' && !on ? P.ink2 : P.ink; ctx.textBaseline = 'middle';
      if (placed) { boxes.push(placed[3]); ctx.textAlign = 'left'; ctx.fillText(p.n, placed[0], placed[1] + hh / 2 + .5); }
      else {   // 放不下名字：只寫編號，名字在右邊清單同一個編號
        ctx.font = '600 10.5px ' + V.MONO; var nt = String(q.i + 1), nw = ctx.measureText(nt).width + 8, nx = X + r - 2, ny = Y - 8;
        ctx.fillStyle = P.surface; V.rr(ctx, nx, ny, nw, 16, 8); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = P.line2; ctx.stroke();
        ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.fillText(nt, nx + nw / 2, ny + 8.5); boxes.push([nx, ny, nw, 16]);
      }
      ctx.textBaseline = 'alphabetic';
    });
  }

  function nodeSource(m, n) {
    var nd = ((m.flow || {}).nodes || {})[n] || {}, p = P29[n];
    var body = (nd.now ? '你現在怎麼做：' + nd.now + '\n' : '') + (nd.tip ? '建議：' + nd.tip + '\n' : '') + ((nd.now || nd.tip) ? '\n' : '') + (nd.why ? nd.why + '\n\n' : '') + '這一格：' + p[0] + '\n算式（簡報 P29）：' + p[1] + (nd.more ? '\n\n' + nd.more : '');
    var tac = (m.tactics || {})[n];
    if (tac && tac.length) body += '\n\n做法（課程包）：\n' + tac.slice(0, 3).map(function (x, i) { return (i + 1) + '. ' + x.name + '：' + (x.what || ''); }).join('\n') + (tac.length > 3 ? '\n……還有 ' + (tac.length - 3) + ' 條；想看全部，問' + NM + '這一格有哪些做法' : '');
    return { title: n + '・' + ST_LABEL[nd.st || 'unknown'], value: nd.value || '', src: nd.src || (nd.st === 'leak' ? 'est' : 'said'), body: body };
  }

  /* 圓環的數字點開：達成率是畫面算的，寫出算式和「現在」那個數字從哪來 */
  function calcSource(m, which) {
    var gl = m.goals || {}, items = gl.items || [], srcs = m.sources || {};
    var line = function (x) { var r = rate(x); return (LANE[x.lane] || '') + '・' + x.t + '\n（現在 ' + fmt(x.now) + ' － 起點 ' + fmt(x.base) + '）÷（目標 ' + fmt(x.target) + ' － 起點 ' + fmt(x.base) + '）＝ ' + Math.round(r * 100) + '%' + ((srcs[x.now_key] || srcs[x.key]) ? '\n現在的數字：' + (srcs[x.now_key] || srcs[x.key]).title + '（' + (SRC[(srcs[x.now_key] || srcs[x.key]).src] || '') + '）' : ''); };
    if (which === 'all') {
      var ov = overall(gl); if (!ov) return null;
      var how = ov.same ? '整體＝加起來算：已完成 ' + fmt(ov.parts.reduce(function (a, q) { return a + Math.min(q.done, q.span); }, 0)) + ' ' + ov.unit + ' ÷ 目標 ' + fmt(ov.total) + ' ' + ov.unit + '（每個目標超過的部分不算進來）。' : '整體＝每個目標達成率的平均（單位不一樣，不能加總；每個目標最多算到 100%）。';
      return { title: '這一期整體達成率', value: Math.round(ov.r * 100) + '%', src: 'calc', body: items.map(line).join('\n\n') + '\n\n' + how + '\n「現在」每天打烊時更新；按「做了」「成交」先記在今天，打烊時確認了才算進來。' };
    }
    var x = items[+String(which).replace(/\D/g, '')]; if (!x) return null;
    if (x.phase === 'learn' && x.learn) return { title: x.t + '・先試哪種有效', value: x.learn.done + '／' + x.learn.of, src: 'calc', body: '先看試了幾種：' + x.learn.t + ' ' + x.learn.done + '／' + x.learn.of + '。\n找出哪一種有效之前，先算試了幾種；成果寫在下面。\n\n成果：' + line(x) + (x.how ? '\n\n怎麼做到：' + x.how : '') };
    return { title: x.t + '・達成率', value: Math.round(rate(x) * 100) + '%', src: 'calc', body: line(x) + (x.how ? '\n\n怎麼做到：' + x.how : '') };
  }

  /* 今天的按鈕還沒存好之前，先照他按的畫（樂觀更新）；存好了以伺服器回來的為準，失敗就回到原本的樣子 */
  function overlay(base, pending) {
    if (!base || !base.today || !Object.keys(pending).length) return base;
    var m = Object.assign({}, base), td = Object.assign({}, base.today);
    td.items = (td.items || []).map(function (x) {
      var p = pending[x.id]; if (!p) return x;
      var y = Object.assign({}, x, { status: p.status });
      if (p.status !== 'done') delete y.result; else if (p.result) y.result = p.result;
      return y;
    });
    m.today = td; return m;
  }

  function drawer(R, s, key) {
    var root = R.root, old = root.querySelector('.c3-drawer'); if (old) old.remove(); if (!s) return;
    var d = document.createElement('div'); d.className = 'c3-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', s.title || '出處');
    d.innerHTML = '<div class="dh"><b></b><button type="button" data-close="1" aria-label="關閉"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' + (s.value ? '<div class="dv"></div>' : '') + '<div class="db"></div>' + (s.src ? '<div class="ds">' + g(s.src) + '出處：' + esc(SRC[s.src] || s.src) + '</div>' : '');
    d.querySelector('.dh b').textContent = s.title || ''; if (s.value) d.querySelector('.dv').textContent = s.value; d.querySelector('.db').textContent = s.body || '';
    root.appendChild(d); d.querySelector('[data-close]').focus({ preventScroll: true });
  }
  function toast(root, text) { var t = root.querySelector('.c3-toast'); if (!t) { t = document.createElement('div'); t.className = 'c3-toast'; t.setAttribute('role', 'status'); root.appendChild(t); } t.textContent = text; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 2800); }
  function copyText(R, text, ok, fail) {
    var done = function () { toast(R.root, ok); }, no = function () { toast(R.root, fail || ('直接在對話裡說：' + text)); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, no); else no(); } catch (x) { no(); }
  }
  function frag(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function inView(el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < (global.innerHeight || 800) && r.width > 0; }

  /* ── 畫面本體：第一次 mount，之後 update 只換有變的塊 ── */
  function mount(root, store) {
    var reg = REG[store] || (REG[store] = { born: {}, odo: {}, ring: {}, groups: {}, painted: false, winAt: null, orbitT0: null });
    var R = { root: root, store: store, reg: reg, alive: true, base: null, model: null, opts: {}, pending: {}, seq: 0, errs: {}, echo: null, quiet: {}, gr: null, theme: 'light', H: V.hue(), hoverType: -1, happyUntil: -99, happyAt: -99, fresh: 0, freshTo: -99, mq: null, faces: [], openDraft: {}, hoverJob: null, cfg: { name: '小二' }, cfgKey: '' };
    root._cm = R; root.classList.add('c3');
    root.innerHTML = '<div class="c3-topwrap"></div><div class="c3-stwrap"></div><div class="c3-body"></div>';
    var mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
    R.readTheme = function () { try { R.theme = global.getComputedStyle(root).getPropertyValue('--c3-mode').trim() === 'dark' ? 'dark' : 'light'; } catch (e) { R.theme = 'light'; } R.paint(); };
    R.paint = function () { var H = R.H, dk = R.theme === 'dark'; root.style.setProperty('--c3-accent', H.accent); root.style.setProperty('--c3-accent-ink', dk ? H.darkText : H.text); root.style.setProperty('--c3-accent-soft', dk ? H.darkSoft : H.soft); root.style.setProperty('--c3-accent-strong', H.text); root.style.setProperty('--c3-on-accent', H.on); };
    if (mq && mq.addEventListener) { mq.addEventListener('change', R.readTheme); R.mq = mq; }
    R.onClick = function (e) { onClick(R, e); };
    R.onKey = function (e) { onKey(R, e); };
    R.onOver = function (e) {
      var c = e.target.closest && e.target.closest('.c3-ptype'); setHoverType(R, c ? +c.getAttribute('data-type') : -1);
      var jc = e.target.closest && e.target.closest('.c3-room .c3-job'), was = R.hoverJob; R.hoverJob = jc ? jc.getAttribute('data-job') : null;   // 滑到哪一件，圈圈裡的臉就看哪一家
      if (was !== R.hoverJob && reduced() && R.galLoop) R.galLoop.redraw();
    };
    R.onFocus = function (e) { var jc = e.target.closest && e.target.closest('.c3-room .c3-job'); if (jc) R.hoverJob = jc.getAttribute('data-job'); };
    root.addEventListener('click', R.onClick); root.addEventListener('keydown', R.onKey); root.addEventListener('pointerover', R.onOver); root.addEventListener('focusin', R.onFocus);
    var XC0 = global.XiaoerCompanion;
    R.offPhoto = XC0 && XC0.onPhoto ? XC0.onPhoto(function () { if (R.alive && R.base) { R.quiet.today = true; update(R); } }) : null;
    R.handle = {
      destroy: function () { if (!R.alive) return; R.alive = false; if (R.mq && R.mq.removeEventListener) R.mq.removeEventListener('change', R.readTheme); [].forEach.call(root.querySelectorAll('.c3-topwrap > *, .c3-stwrap > *, .c3-body > *'), function (el) { unbind(el); }); root.removeEventListener('click', R.onClick); root.removeEventListener('keydown', R.onKey); root.removeEventListener('pointerover', R.onOver); root.removeEventListener('focusin', R.onFocus); if (R.offPhoto) R.offPhoto(); Object.keys(R.mpend || {}).forEach(function (k) { modSend(R, k); }); if (root._cm === R) root._cm = null; },
      update: function (model, opts) { update(R, model, opts); }
    };
    return R;
  }
  function setHoverType(R, i) {
    if (R.hoverType === i) return; R.hoverType = i;
    [].forEach.call(R.root.querySelectorAll('.c3-ptype'), function (c) { var k = +c.getAttribute('data-type'); c.classList.toggle('is-on', i >= 0 && k === i); c.classList.toggle('is-dim', i >= 0 && k !== i); });
  }

  /* 你的小二：名字、臉型、樣子（畫的或照片）照 companion；顏色、眼睛照本命（同一件事只存一處）。安全模式一律畫回原本的樣子 */
  function cfgOf(m, opts) {
    var XC = global.XiaoerCompanion, cp = m.companion || {}, per0 = m.persona || {}, look = Object.assign({}, cp, { hue: per0.hue, eyes: per0.eyes });
    if (opts && opts.safe) { look.skin = 'drawn'; look.photo = null; }
    var cfg = XC && XC.normalize ? XC.normalize(look) : { name: (cp.name && String(cp.name).trim()) || '小二', hue: per0.hue || 'orange', eyes: per0.eyes || 'capsule' };
    cfg.__xe = true; return cfg;
  }
  function update(R, model, opts) {
    if (opts) R.opts = opts;
    if (model) { var T = tidyModel(model); R.base = T.m; R.bad = T.bad; }
    var m = overlay(R.base, R.pending); R.model = m;
    var root = R.root, reg = R.reg, first = !reg.painted, t = clock(), anim = !first && !reduced();
    m.sources = Object.assign({}, m.sources || {});
    if (m.success && m.success.quote) m.sources.__quote = { title: '你原本怎麼說', src: 'said', body: m.success.quote };
    if (m.purpose && m.purpose.quote) m.sources.__purpose = { title: '目的・你原本怎麼說', src: 'said', body: m.purpose.quote };
    if (m.offer && m.offer.quote) m.sources.__offer = { title: '你的招牌・你原本怎麼說', src: 'said', body: m.offer.quote };
    R.H = V.hue((m.persona || {}).hue); R.readTheme();
    // 你的小二：名字、臉型照 companion；顏色、眼睛照本命（同一件事只存一處）
    var cfg = cfgOf(m, R.opts), cfgKey = JSON.stringify(cfg); if (cfgKey !== R.cfgKey) { R.cfgKey = cfgKey; R.cfg = cfg; (R.faces || []).forEach(function (f) { f.update(cfg); }); }
    NM = R.cfg.name || '小二';
    // 星圖的點：新的事實記下出生時間，一顆一顆飛進去；已經不在的點從紀錄拿掉，回來時再飛一次
    var gr, fresh = 0, keep = {}, newest = -1;
    try { gr = graphOf(m); } catch (e) { gr = graphOf({}); }
    gr.dots.forEach(function (d, i) { keep[d.id] = 1; if (reg.born[d.id] == null) { reg.born[d.id] = first ? -99 : t + .3 + (fresh++) * .05; newest = i; } d.born = reg.born[d.id]; });
    Object.keys(reg.born).forEach(function (id) { if (!keep[id]) delete reg.born[id]; });
    if (fresh) { R.fresh = fresh; R.freshFrom = t + .3; R.freshTo = t + .3 + fresh * .05 + .8; if (newest >= 0 && !reduced()) R.flash = { di: newest, at: gr.dots[newest].born + .5 }; }
    R.gr = gr;
    if (m.key && m.key.kind === 'win') { if (reg.winAt == null) reg.winAt = first ? -99 : t + .5; } else reg.winAt = null;
    // 客人星系：每一種客人每一圈幾位；變多了，多出來的那幾點從這一刻長出來
    ((m.people || {}).types || []).forEach(function (ty) {
      var c = ty.bands ? { in: ty.bands.in, slip: ty.bands.slip, out: ty.bands.out, new: 0 } : { in: 0, slip: 0, out: 0, new: 0 };
      if (!ty.bands && ty.n != null) c[ty.lane === 'new' ? 'new' : ty.lane === 'return' ? 'out' : 'in'] = ty.n;
      ['in', 'slip', 'out', 'new'].forEach(function (b) { var gk = ty.name + '|' + b, old = reg.groups[gk]; if (!old) reg.groups[gk] = { n: c[b], since: null }; else if (c[b] !== old.n) { if (c[b] > old.n && !first) old.since = [t + .25, old.n]; old.n = c[b]; } });
    });
    var C = { R: R, live: !!m.stage && m.stage.live !== false, old: !m.stage, day: !(!!m.stage && m.stage.live !== false) && !!m.stage && !!m.today, at: ((m.stage || {}).at) || 1, brand: R.opts.brand !== false, date: R.opts.date || localDate(), now: R.opts.now || null, errs: R.errs, echo: R.echo,
      pack: R.opts.pack || null, safe: !!R.opts.safe };
    R.C = C; settleLayout(R);
    if (reg.wasLive && !C.live) reg.justDone = true; reg.wasLive = C.live;   // 訪談剛結束的那一次：本命星座在第一屏畫一次
    try { R.G = !C.live && m.today ? successModel(m, C, R) : null; } catch (e) { R.G = null; }
    var activeKey = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('data-fk') : null;
    patchOne(R, root.querySelector('.c3-topwrap'), top(m, C), anim);
    patchOne(R, root.querySelector('.c3-stwrap'), C.live ? stations(m, C) : '', anim);
    var changed = patchBody(R, plan(m, C), anim);
    // 編號：攤開的塊與收起來的那一站一起數（日常的組不編號，組裡的塊也不編號）
    // 「走過的 N 站」收著時，裡面那幾站照樣算進編號（打開前後，正在談的那一站編號不變）
    var ix = 0; [].forEach.call(root.querySelectorAll('.c3-body > .c3-sec, .c3-body > .c3-grp.is-sec, .c3-body > .c3-grp.is-past, .c3-body > .c3-grp.is-past > .c3-grp-body > .c3-grp.is-sec'), function (el) {
      if (el.classList.contains('is-past')) { if (!el.classList.contains('is-open')) ix += +el.getAttribute('data-n') || 0; return; }
      var n = el.querySelector(el.classList.contains('c3-grp') ? '.c3-grp-t .c3-n' : '.c3-n'); if (n && !el.classList.contains('c3-offer') && !el.classList.contains('c3-asks') && !el.classList.contains('c3-today')) n.textContent = pad2(++ix);
    });   // 今天排在最上面（訪談中也是），不編號
    var star = root.querySelector('.c3-star'); if (star) star.setAttribute('aria-label', '你的星圖：' + NM + '知道的 ' + gr.dots.length + ' 件事，每一件是一顆點，點的樣子照出處');
    if (activeKey && (!document.activeElement || !root.contains(document.activeElement))) { var back = root.querySelector('[data-fk="' + activeKey + '"]'); if (back) back.focus({ preventScroll: true }); }
    if (C.live && anim && changed.length) newChip(R, changed);
    if (reduced()) { if (R.galLoop) R.galLoop.redraw(); if (R.dayLoop) R.dayLoop.redraw(); }   // 減少動態：畫布只畫一格，資料變了要自己重畫
    syncSeen(R);
    R.quiet = {}; reg.painted = true;
  }

  function patchOne(R, wrap, html, anim) {
    var el = wrap.firstElementChild;
    if (!html) { if (el) { unbind(el); el.remove(); } return; }
    if (el && el._html === html) return;
    var nu = frag(html); nu._html = html;
    if (el) { unbind(el); el.replaceWith(nu); } else wrap.appendChild(nu);
    bind(R, nu);
  }
  /* 換有變的塊；分成小部分（data-part）的塊，骨架沒變就只換有變的那幾個小部分（畫布、焦點、捲動都不動） */
  function patchBody(R, list, anim) {
    var body = R.root.querySelector('.c3-body'), have = {}, changed = [], prev = null;
    [].forEach.call(body.children, function (el) { have[el.getAttribute('data-sec')] = el; });
    list.forEach(function (s) {
      var el = have[s.name];
      if (el && el._html !== s.html && s.skel && el._skel === s.skel && el._parts) {
        Object.keys(s.parts).forEach(function (k) {
          if (el._parts[k] === s.parts[k]) return;
          var pe = el.querySelector('[data-part="' + k + '"]'); if (!pe) return;
          unbind(pe); pe.innerHTML = s.parts[k]; bind(R, pe);
          if (anim && !R.quiet[s.name]) { pe.classList.remove('c3-swap'); void pe.offsetWidth; pe.classList.add('c3-swap'); pe.addEventListener('animationend', function () { pe.classList.remove('c3-swap'); }, { once: true }); }
        });
        el._parts = s.parts; el._html = s.html;
        if (anim && !R.quiet[s.name]) changed.push(s.name);
      } else if (!el || el._html !== s.html) {
        var nu = frag(s.html); nu._html = s.html; nu._skel = s.skel || null; nu._parts = s.parts || null;
        var wasWait = el && el.classList.contains('is-wait');
        if (el) { unbind(el); el.replaceWith(nu); }
        else if (prev) prev.after(nu); else body.prepend(nu);
        bind(R, nu);
        if (anim && !R.quiet[s.name] && !s.wait) { nu.classList.add(!el || wasWait ? 'c3-grow' : 'c3-swap'); changed.push(s.name); nu.addEventListener('animationend', function () { nu.classList.remove('c3-grow', 'c3-swap'); }, { once: true }); }
        el = nu;
      }
      delete have[s.name];
      var want = prev ? prev.nextElementSibling : body.firstElementChild;
      if (want !== el) body.insertBefore(el, want);
      prev = el;
    });
    Object.keys(have).forEach(function (k) { unbind(have[k]); have[k].remove(); });
    return changed;
  }
  function newChip(R, changed) {
    var box = R.root.querySelector('.c3-st-new'); if (!box) return;
    changed = changed.filter(function (n) { return SEC[n]; }); if (!changed.length) return;   // 「走過的 N 站」那一行換了字，不算長出新東西
    var at = ((R.model || {}).stage || {}).at, here = changed.filter(function (n) { return (SEC[n] || {}).st === at; });
    var name = here[0] || changed[changed.length - 1], label = (SEC[name] || {}).label || name;
    box.innerHTML = '<span>剛長出來</span><button type="button" data-jump="' + esc(name) + '">' + esc(label) + '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v9.5M3.8 8.4 8 12.6l4.2-4.2"/></svg></button>';
    box.hidden = false; box.classList.remove('c3-pop'); void box.offsetWidth; box.classList.add('c3-pop');
    clearTimeout(R.chipT); R.chipT = setTimeout(function () { box.hidden = true; }, 8000);
  }

  function unbindOne(el) { (el._loops || []).forEach(function (l) { l.stop(); }); el._loops = []; (el._ios || []).forEach(function (io) { io.disconnect(); }); el._ios = []; }
  function unbind(el) { unbindOne(el); [].forEach.call(el.querySelectorAll ? el.querySelectorAll('[data-part]') : [], unbindOne); }
  /* 中間那張臉（星圖、客人星系、要複製的成功共用）：他訂製的那一隻，看著 look 那個方向；happy＝開心一下 */
  function faceFn(R) {
    return function (ctx, cx, cy, size, t, look, happy) {
      V.face(ctx, cx, cy, size, t, { cfg: R.cfg, theme: 'stage', reduce: reduced(), keys: [[-99, { expr: happy ? 'happy' : 'idle', look: happy || !look ? undefined : look }]] });
    };
  }
  /* 第一屏中間那隻：照品牌規範平常往右上看。輪到今天要碰的那一家時，看過去 2 秒再回到右上；
     滑鼠停在某一點或某一張卡上時才一直看著。減少動態時 companion.js 會換回右上（settle）。 */
  var GLANCE = 2, GAZE_EVERY = 6, IDLE_LOOK = [.62, -.34];   // 每 6 秒輪到下一家，看 2 秒，其餘 4 秒照品牌往右上
  function gazeFaceFn(R) {
    return function (ctx, cx, cy, size, t, look, happy) {
      var keys;
      if (happy) keys = [[-99, { expr: 'happy' }]];
      else if (look && (R.galHov || R.hoverJob)) keys = [[-99, { expr: 'listen', look: look }]];
      else if (look && R.gz && R.gz.at > -50) keys = [[-99, { expr: 'listen', look: look }], [R.gz.at + GLANCE, { expr: 'idle' }]];   // 看的時候眼睛矮一點、頭歪一邊（在聽），不會是等高平行的兩條
      else keys = [[-99, { expr: 'idle' }]];
      V.face(ctx, cx, cy, size, t, { cfg: R.cfg, theme: 'stage', reduce: reduced(), keys: keys });
    };
  }
  function bind(R, el) {
    el._loops = []; el._ios = [];
    var m = R.model, reg = R.reg;
    var own = function (node) { var o = node.closest ? node.closest('[data-part]') : null; if (!o || !el.contains(o)) o = el; o._loops = o._loops || []; return o._loops; };
    var acc = function () { var dk = R.theme === 'dark'; return { accent: R.H.accent, accentText: dk ? R.H.darkText : R.H.text, onAccent: R.H.on }; };
    var per = m.persona || {};
    function mood(tt) {
      if (R.opts.mood) return R.opts.mood;
      if (reg.winAt != null && tt >= reg.winAt && tt - reg.winAt < 3.2) return 'happy';
      if (R.fresh && tt >= R.freshFrom && tt < R.freshTo) return 'wow';
      return R.C.live || !m.key ? 'listen' : 'idle';
    }
    // 小二的臉：字標旁、晨報旁，都是他訂製的那一隻（會眨眼、滑鼠靠近會轉頭看；點一下看你）
    [].forEach.call(el.querySelectorAll('[data-face]'), function (fe) {
      var XC = global.XiaoerCompanion, kind = fe.getAttribute('data-face'), size = kind === 'icon' ? 30 : 44;
      if (XC && XC.mount) {
        var x = XC.mount(fe, R.cfg, { size: size, theme: kind === 'cap' ? 'stage' : 'auto', label: NM });
        R.faces.push(x); own(fe).push({ stop: function () { x.destroy(); R.faces = R.faces.filter(function (f) { return f !== x; }); } });
      } else {
        var cv = document.createElement('canvas'); cv.style.width = cv.style.height = size + 'px'; cv.style.display = 'block'; fe.appendChild(cv);
        own(fe).push(V.animate(cv, function (ctx, w, h) { V.face(ctx, w / 2, h / 2, Math.min(w, h), clock(), { cfg: R.cfg, theme: kind === 'cap' ? 'stage' : 'light' }); }));
      }
    });
    bindStar(R, el, mood);
    bindGalaxy(R, el, own);
    bindDay(R, el, own);
    // 六格：客人一直在走；點一格看那一格的算式與做法
    var st = states(m), labels = {};
    NODES.forEach(function (n, i) { labels[n] = (((m.flow || {}).nodes || {})[n] || {}).s || (m.key ? '' : ST_LABEL[st[i]]); });
    [].forEach.call(el.querySelectorAll('.c3-pipe'), function (cv) {
      var hits = [], hov = -1;
      var only = cv.getAttribute('data-only'); only = only ? only.split(',').map(Number) : null;
      own(cv).push(V.animate(cv, function (ctx, w, h) { hits = V.pipeline(ctx, 0, 0, w, h, clock(), st, Object.assign({ only: only, labels: labels, vertical: h > w * .7, hover: hov, theme: R.theme }, acc())) || []; }));
      var which = function (e) { var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = -1, bd = 1e9; hits.forEach(function (hh, i) { var dd = Math.hypot(hh.x - x, hh.y - y); if (dd < hh.r + 12 && dd < bd) { bd = dd; best = i; } }); return best; };
      cv.addEventListener('pointermove', function (e) { hov = which(e); cv.style.cursor = hov >= 0 ? 'pointer' : ''; });
      cv.addEventListener('pointerleave', function () { hov = -1; });
      cv.addEventListener('click', function (e) { var i = which(e); if (i >= 0) drawer(R, nodeSource(R.model, NODES[i])); });
    });
    // 點陣漏斗：第一次看到時從頭排一次，靜止時是完整的每一步
    var rowsCv = el.querySelector('.c3-rows'), fun = (m.flow || {}).funnel;
    if (rowsCv && fun) { var playAt = null, won = wonCount(m); own(rowsCv).push(V.animate(rowsCv, function (ctx, w, h, lt) { V.dotRows(ctx, 0, 0, w, h, lt, fun.rows, Object.assign({ won: won, t0: playAt == null ? -99 : playAt, cell: 20, theme: R.theme }, acc())); }, { onSeen: function (lt) { playAt = lt + .35; } })); }
    var rd = el.querySelector('.c3-radar');
    if (rd && m.map) own(rd).push(V.animate(rd, function (ctx, w, h) { radar(ctx, w, h, clock(), R.model, R.selPin, R.theme, R.H.accent); }));
    bindRings(R, el, acc);
    bindOrbit(R, el, acc, per);
    bindOdos(R, el);
  }

  /* 星圖：滑鼠一進到球上就在 0.3 秒內停下（點得到、讀得到六格），離開 1.5 秒後再轉；手機上第一次點＝停下＋選取 */
  function bindStar(R, el, mood) {
    var star = el.querySelector('.c3-star'); if (!star) return;
    var heroEl = el, tip = el.querySelector('.c3-tip'), hover = -1, hoverHub = null, api = null, lay = { w: 0, h: 0, right: 0 }, per = R.model.persona || {};
    var rot = { v: 0, speed: 1, last: clock(), inside: false, resume: 0 }, face = faceFn(R);
    var copyRight = function (w, h) {
      if (lay.w === w && lay.h === h) return lay.right;
      var hr = heroEl.getBoundingClientRect(), right = 0, rg = document.createRange();
      [].forEach.call(heroEl.querySelectorAll('.c3-hero-copy .c3-eyebrow, .c3-know2, .c3-line, .c3-chip, .c3-fix, .c3-say, .c3-wrong'), function (x) {
        var r; if (x.classList.contains('c3-line')) { rg.selectNodeContents(x); r = rg.getBoundingClientRect(); } else r = x.getBoundingClientRect();
        if (r.width) right = Math.max(right, r.right - hr.left);
      });
      lay = { w: w, h: h, right: right }; return right;
    };
    el._loops.push(V.animate(star, function (ctx, w, h) {
      var now1 = clock(), dt = Math.min(.1, Math.max(0, now1 - rot.last)); rot.last = now1;
      var want = rot.inside || now1 < rot.resume ? 0 : 1; rot.speed += (want - rot.speed) * Math.min(1, dt / .09); rot.v += dt * rot.speed;
      var side = w >= 900 && w / h > 1.4, narrow = w < 460, orx = side ? 1.42 : narrow ? 1.32 : 1.55, cx, cy, Rr;
      if (side) { var L = copyRight(w, h) + 40, Rt = w - 44; Rr = Math.max(h * .2, Math.min(h * .31, (Rt - L - 72) / (2 * orx))); cx = (L + Rt) / 2 / w; cy = .5; }
      else { var area = Math.min(h, heroEl.classList.contains('is-day') ? 300 : 420); Rr = Math.min(w, area) * .3; cx = .5; cy = (area / 2) / h; }
      api = V.constellation(ctx, 0, 0, w, h, reduced() ? 30 : now1, R.gr, { frame: false, cx: cx, cy: cy, radius: Rr / Math.min(w, h), orbitRx: orx, eyeScale: 1.25, eyeStyle: per.eyes, accent: R.H.stage, hover: hover, hoverHub: hoverHub, state: mood(now1), hubScale: narrow ? .86 : 1, rotT: reduced() ? 4 : rot.v, frontHot: true, orbit0: .35, face: face, flash: R.flash });
    }));
    var place = function (px, py) { var r = heroEl.getBoundingClientRect(); tip.style.left = Math.max(12, Math.min(r.width - 284, px + 18)) + 'px'; tip.style.top = Math.max(12, py - 70) + 'px'; };
    var move = function (e) {
      if (!api) return;
      var r = star.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, i = api.pick(px, py), hb = i < 0 ? api.pickHub(px, py) : null;
      rot.inside = Math.hypot(px - api.cx, py - api.cy) < api.R * 1.9;
      hover = i; hoverHub = hb; star.style.cursor = i >= 0 || hb ? 'pointer' : '';
      if (i >= 0) { var d = R.gr.dots[i]; if (!d) return; tip.innerHTML = '<div class="k">' + g(d.src) + esc(SRC[d.src] || '') + (d.hub ? '<em>' + esc(d.hub) + '</em>' : '') + '</div><div class="v"></div>'; tip.querySelector('.v').textContent = d.label; tip.hidden = false; place(px, py); }
      else if (hb) { var nd = ((R.model.flow || {}).nodes || {})[hb] || {}; tip.innerHTML = '<div class="k"><b>' + esc(hb) + '</b><em>' + esc(ST_LABEL[nd.st || 'unknown']) + '</em></div><div class="v"></div>'; tip.querySelector('.v').textContent = nd.now ? '現在：' + nd.now : nd.why || '還不知道，訪談會問到'; tip.hidden = false; place(px, py); }
      else tip.hidden = true;
    };
    var firstTouch = false;
    star.addEventListener('pointermove', move);
    star.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') { firstTouch = rot.speed > .3; rot.resume = clock() + 4; } move(e); });
    star.addEventListener('pointerleave', function () { hover = -1; hoverHub = null; tip.hidden = true; if (rot.inside) rot.resume = clock() + 1.5; rot.inside = false; });
    star.addEventListener('click', function (e) {
      move(e);
      if (firstTouch) { firstTouch = false; return; }   // 手機：還在轉時的第一下只停下＋選取
      if (hoverHub) { drawer(R, nodeSource(R.model, hoverHub)); return; }
      if (hover >= 0) {
        var d = R.gr.dots[hover]; if (!d) return;
        if (d.pin != null) openPin(R, d.pin);
        else if (d.key && (R.model.sources || {})[d.key]) drawer(R, R.model.sources[d.key]);
        else drawer(R, { title: SRC[d.src] || NM + '記下的', src: d.src, body: d.label + '\n\n這一點還沒有更細的出處；想補，回到對話跟' + NM + '說。' });
      }
    });
  }

  /* ── 要複製的成功：圈圈。資料在 R.G（update 算好），這裡只畫；滑到哪一點，臉就看哪一點，小卡寫出那一家 ── */
  function refsOf(R, it) {
    var G = R.G, out = []; if (!G) return out;
    targetsOf(it).forEach(function (nm2) {
      G.near.forEach(function (d, k) { if (d.name && same(d.name, nm2)) out.push({ ring: 'near', i: k }); });
      G.past.forEach(function (d, k) { if (d.name && same(d.name, nm2)) out.push({ ring: 'past', i: k }); });
    });
    return out;
  }
  function gazeTick(R, tt) {
    var items = (((R.model || {}).today || {}).items) || [], it = null;
    if (R.hoverJob) it = items.filter(function (x) { return x.id === R.hoverJob && refsOf(R, x).length; })[0] || null;
    if (!it) {
      var list = items.filter(function (x) { return refsOf(R, x).length && x.status !== 'skip'; }), open = list.filter(function (x) { return (x.status || 'todo') === 'todo'; });
      list = open.length ? open : list; if (R.gz0 == null) R.gz0 = tt + 1;
      if (list.length) it = list[reduced() ? 0 : Math.floor(Math.max(0, tt - R.gz0) / GAZE_EVERY) % list.length];
    }
    var id = it ? it.id : null;
    if (!R.gz || R.gz.id !== id) { R.gz = { id: id, at: reduced() ? -99 : tt, look0: R.hoverJob && R.gzLook ? R.gzLook : IDLE_LOOK }; syncSeen(R); }
    if (!it) return null;
    var names = targetsOf(it).map(function (nm2) { var d = R.G.near.filter(function (x) { return x.name && same(x.name, nm2); })[0]; return d ? (d.short || nm2) : nm2; });
    R.gz.ids = refsOf(R, it); R.gz.label = names.join('・'); R.gz.sub = hhmm(it.when) + (it.status === 'done' ? '・' + (it.result ? RESULT_LABEL[it.result] : '做了') : '');
    return R.gz;
  }
  function syncSeen(R) {
    var id = R.gz ? R.gz.id : null;
    [].forEach.call(R.root.querySelectorAll('.c3-room .c3-job'), function (c) { var on = c.getAttribute('data-job') === id; c.classList.toggle('is-seen', on); if (on) c.setAttribute('data-seen', NM + '在看'); });
  }
  var LV = ['附近的・還沒聯絡', '先挑的・還沒聯絡', '聯絡過', '拿到窗口', '成了'], BAND = { in: '平常會回來', slip: '開始變少', out: '很久沒來' };
  function bindGalaxy(R, el, own) {
    var cv = el.querySelector('.c3-galcv'); if (!cv) return;
    var tip = el.querySelector('.c3-galtip'), hits = [], hov = null, face = gazeFaceFn(R);
    var loop = V.animate(cv, function (ctx, w, h) {
      var G = R.G; if (!G || w < 40) return;
      var tt = reduced() ? 30 : clock(), gz = gazeTick(R, tt);
      var res = V.portrait(ctx, 0, 0, w, h, tt, G, { built: G.built, gaze: gz, hover: hov, happyAt: R.happyAt, accent: R.H.stage, face: face });
      hits = res.hits; R.gzLook = res.look;
    });
    R.galLoop = loop; own(cv).push({ stop: function () { loop.stop(); if (R.galLoop === loop) R.galLoop = null; } });
    var pick = function (e) { var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 1e9; hits.forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h; } }); return best; };
    var show = function (b) {
      var G = R.G, html = '';
      if (b.kind === 'near') { var d = G.near[b.i], L = Math.round(d.keys[d.keys.length - 1][1]), pin = d.pin; html = '<b>' + esc(d.name || (G.tNew ? G.tNew.name : '附近的')) + '</b><small>' + g(pin ? pin.src || 'web' : (G.tNew || {}).src || 'web') + esc(LV[L] || '') + (d.name ? '' : '・有這麼多' + G.unit + '（' + (SRC[(G.tNew || {}).src] || '查到的') + '），這一點是計數') + '</small>' + (pin && pin.note ? '<p>' + esc(pin.note) + '</p>' : ''); }
      else if (b.kind === 'past') { var p = G.past[b.i]; html = '<b>' + esc(p.full || p.name || (G.tRet ? G.tRet.name : '訂過的')) + '</b><small>' + g((G.tRet || {}).src || 'said') + esc(BAND[p.band] || '') + (p.name ? '・今天要問的' : '・名單上的一家') + '</small>'; }
      else if (b.kind === 'seat') { var s = G.seats[b.i]; html = s.pend ? '<b>' + esc(s.label) + '</b><small>今天按了成交，打烊時確認了才算進目標</small>' : s.fill ? '<b>' + esc(s.label || ('1 ' + (s.lane === 'new' ? G.uNew + '第一次來' : G.uRet + '又回來'))) + '</b><small>這一期多的' + (s.lane === 'new' ? '新客' : '回頭客') + '</small>' : '<b>還空著</b><small>這一期的目標：' + (s.lane === 'new' ? '再 1 ' + G.uNew + '第一次來' : '再叫回 1 ' + G.uRet) + '</small>'; }
      else if (b.kind === 'fact') { var f = R.gr.dots[b.i]; if (!f) return; html = '<b>' + esc(f.label) + '</b><small>' + g(f.src) + esc(SRC[f.src] || '') + '・' + esc(NM) + '知道的事</small>'; }
      tip.innerHTML = html; var W = cv.clientWidth; tip.style.left = Math.max(4, Math.min(W - 244, b.x + 14)) + 'px'; tip.style.top = Math.max(4, b.y + 12) + 'px'; tip.classList.add('on');
    };
    cv.addEventListener('pointermove', function (e) { var b = pick(e); hov = b && b.kind !== 'fact' ? { ring: b.kind, i: b.i } : null; R.galHov = !!hov; cv.style.cursor = b ? 'pointer' : ''; if (b) show(b); else tip.classList.remove('on'); if (reduced()) loop.redraw(); });
    cv.addEventListener('pointerleave', function () { hov = null; R.galHov = false; tip.classList.remove('on'); if (reduced()) loop.redraw(); });
    cv.addEventListener('click', function (e) {
      var b = pick(e); if (!b) return; var G = R.G;
      if (b.kind === 'near' && G.near[b.i].pin) { var pi = (((R.model.map || {}).pins) || []).indexOf(G.near[b.i].pin); if (pi >= 0) { openPin(R, pi); return; } }
      if (b.kind === 'fact') { var f = R.gr.dots[b.i]; if (f && f.key && (R.model.sources || {})[f.key]) drawer(R, R.model.sources[f.key]); else if (f) drawer(R, { title: SRC[f.src] || '', src: f.src, body: f.label }); return; }
      show(b);
    });
  }
  /* 一天的時間軸：資料每一格現算（現在幾點會走），畫布不重建 */
  function dayData(R) {
    var m = R.model, C = R.C, td = m && m.today; if (!td) return null;
    var runs = ((m.rhythm || {}).runs) || [], open = runs.filter(function (r) { return r.kind === 'open'; })[0], close = runs.filter(function (r) { return r.kind === 'close'; })[0];
    var rel = dayDiff(td.date, C.date), all = td.items || [], next = all.filter(function (x) { return (x.status || 'todo') === 'todo'; })[0];
    var items = all.map(function (x, i) { return { at: hoursOf(x.when), n: pad2(i + 1), time: hhmm(x.when), st: x.status || 'todo', next: rel === 0 && next === x }; });
    var hs = items.map(function (x) { return x.at; }).filter(function (v) { return v != null; });
    var oh = open ? hoursOf(open.at) : null, ch = close ? hoursOf(close.at) : null; if (oh != null) hs.push(oh); if (ch != null) hs.push(ch);
    if (!hs.length) return null;
    var fr = (m.time || {}).free, free = fr && fr.from != null && fr.to != null ? [fr.from, fr.to] : null;
    var nh = rel === 0 ? nowHours(C) : null, from = Math.floor(Math.min.apply(null, hs) - .6), to = Math.ceil(Math.max.apply(null, hs) + .6);
    if (nh != null && nh >= from - 1 && nh <= to + 1) { from = Math.min(from, Math.floor(nh)); to = Math.max(to, Math.ceil(nh)); }
    return { from: from, to: to, open: oh != null ? { at: oh, time: hhmm(open.at), sub: open.st === 'set' ? '' : '還沒排' } : null, close: ch != null ? { at: ch, time: hhmm(close.at), sub: close.st === 'set' ? '' : '還沒排' } : null,
      items: items, now: nh, nowLabel: nh != null ? '現在 ' + nowText(C) : '', free: free };
  }
  function bindDay(R, el, own) {
    var cv = el.querySelector('.c3-daycv'); if (!cv) return;
    var hits = [];
    var loop = V.animate(cv, function (ctx, w, h) { var D = dayData(R); if (!D) return; hits = V.dayline(ctx, 0, 0, w, h, reduced() ? 30 : clock(), D, { stage: true, accent: R.H.stage }) || []; });
    R.dayLoop = loop; own(cv).push({ stop: function () { loop.stop(); if (R.dayLoop === loop) R.dayLoop = null; } });
    var pick = function (e) { var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return hits.filter(function (h) { return Math.hypot(h.x - x, h.y - y) < h.r; })[0] || null; };
    cv.addEventListener('pointermove', function (e) { cv.style.cursor = pick(e) ? 'pointer' : ''; });
    cv.addEventListener('click', function (e) {
      var b = pick(e); if (!b) return; var it = ((R.model.today || {}).items || [])[b.i]; if (!it) return;
      var card = R.root.querySelector('.c3-job[data-job="' + it.id + '"]'); if (!card) return;
      card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); R.hoverJob = it.id; var f = card.querySelector('button'); if (f) f.focus({ preventScroll: true });
      clearTimeout(R.hjT); R.hjT = setTimeout(function () { R.hoverJob = null; }, 3000);
    });
  }

  /* 圓環：值記在 reg 裡（跟著店走），重畫這一塊不會重新轉一次；值真的變了才從舊的值彈到新的值 */
  function ringValue(R, id, v) {
    var reg = R.reg.ring, s = reg[id], t = clock();
    if (!s) s = reg[id] = { v: v, from: 0, t0: null, wait: !reduced() };
    else if (Math.abs(s.v - v) > 1e-6) { var cur = s.t0 == null ? s.v : s.from + (s.v - s.from) * V.spring(t, s.t0, { w: 6.2, z: .86 }); s.from = cur; s.v = v; s.t0 = reduced() ? null : t + .12; s.wait = false; }
    return s;
  }
  function bindRings(R, el, acc) {
    var m = R.model, items = ((m.goals || {}).items) || [], ov = overall(m.goals), per = period(m.goals, R.C.date);
    [].forEach.call(el.querySelectorAll('canvas[data-ring]'), function (cv) {
      var id = cv.getAttribute('data-ring'), val, big = id === 'all' || id === 'none', mini = id.indexOf('mini') === 0, x;
      if (id === 'all') val = ov ? ov.r : 0; else if (id === 'none') val = 0;
      else { x = items[+id.replace(/\D/g, '')]; val = !x ? 0 : x.phase === 'learn' && x.learn ? x.learn.done / x.learn.of : rate(x); }
      var s = ringValue(R, id, val);
      var start = function () { if (s.wait) { s.wait = false; s.from = 0; s.t0 = clock() + .15; } };
      var loop = V.animate(cv, function (ctx, w, h) {
        var size = Math.min(w, h); if (size < 8) return false;
        var lw = big ? Math.max(10, size * .085) : mini ? Math.max(2.6, size * .16) : Math.max(7, size * .095), r = size / 2 - lw / 2 - (big || !mini ? 9 : 1);
        var tt = clock(), col = id === 'all' ? R.H.accent : V.THEME[R.theme].ink;
        var lnx = x && x.phase === 'learn' && x.learn, span = x ? Math.abs(x.target - x.base) : 0;
        var segs = mini ? 0 : id === 'all' ? (ov && ov.same && ov.total <= 40 ? ov.total : 0) : lnx ? lnx.of : span <= 40 && span === Math.round(span) ? span : 0;
        return V.ring(ctx, w / 2, h / 2, r, tt, Object.assign({ value: s.v, from: s.from, t0: s.t0 == null ? null : s.t0, width: lw, theme: R.theme, color: col, track: id === 'none' ? V.THEME[R.theme].line : null, segments: segs, nextMark: !mini && segs > 0, tick: per ? per.frac : null, paper: V.THEME[R.theme].surface }, acc()));
      }, { lazy: true, onSeen: function () { start(); loop && loop.wake(); } });
      if (s.wait && inView(cv)) { start(); loop.wake(); }
      el._loops.push(loop);
    });
  }
  function bindOrbit(R, el, acc, per) {
    var cv = el.querySelector('.c3-orbit'); if (!cv) return;
    var reg = R.reg, cache = {}, api = null, face = faceFn(R);
    var data = function () {
      var pp = R.model.people || {};
      return { start: pp.rule ? pp.rule.start : null, newOnly: !hasList(pp.types), types: (pp.types || []).map(function (ty) { var since = {}; ['in', 'slip', 'out', 'new'].forEach(function (b) { var gk = reg.groups[ty.name + '|' + b]; if (gk && gk.since) since[b] = gk.since; }); return { name: ty.name, lane: ty.lane, n: ty.n, bands: ty.bands, unit: unitOf(ty), since: since }; }) };
    };
    var D = data();
    el._loops.push(V.animate(cv, function (ctx, w, h) {
      api = V.orbit(ctx, 0, 0, w, h, clock(), D, Object.assign({ newOnly: D.newOnly, theme: R.theme, t0: reg.orbitT0 == null ? -99 : reg.orbitT0, hover: R.hoverType, eyeStyle: per.eyes, cache: cache, face: face }, acc()));
    }, { onSeen: function () { if (reg.orbitT0 == null && !reduced()) reg.orbitT0 = clock() + .1; } }));
    if (reg.orbitT0 == null && !reduced() && inView(cv)) reg.orbitT0 = clock() + .1;
    var pick = function (e) { if (!api) return -1; var r = cv.getBoundingClientRect(); return api.pick(e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener('pointermove', function (e) { var i = pick(e); setHoverType(R, i); cv.style.cursor = i >= 0 ? 'pointer' : ''; });
    cv.addEventListener('pointerleave', function () { setHoverType(R, -1); });
    cv.addEventListener('click', function (e) { var i = pick(e); if (i < 0) return; var card = R.root.querySelector('.c3-ptype[data-type="' + i + '"]'); if (card) { card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); card.focus({ preventScroll: true }); setHoverType(R, i); } });
  }
  /* 數字：第一次進到畫面、或真的變了，才轉到位；同一個數字重畫不會再轉 */
  function bindOdos(R, el) {
    var odos = [].filter.call(el.querySelectorAll('.c3-odo'), function (o) {
      var id = o.getAttribute('data-oid'); if (!id) return false;
      var v = o.getAttribute('data-v'), old = R.reg.odo[id]; R.reg.odo[id] = v; return old !== v;
    });
    if (!odos.length || reduced() || !('IntersectionObserver' in global)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; io.unobserve(e.target); roll(e.target); }); }, { threshold: .6 });
    odos.forEach(function (o) { io.observe(o); }); el._ios.push(io);
  }
  function roll(el) {
    [].forEach.call(el.querySelectorAll('.c3-strip'), function (s, i) {
      var d = +s.parentNode.getAttribute('data-d'); s.style.transition = 'none'; s.style.transform = 'translateY(0)'; void s.offsetHeight;
      s.style.transition = 'transform ' + (1.1 + i * .16).toFixed(2) + 's cubic-bezier(.16,.84,.24,1) ' + (i * .07).toFixed(2) + 's'; s.style.transform = 'translateY(-' + (d + 10) + 'em)';
    });
  }
  function openPin(R, i) {
    var p = R.model.map.pins[i]; R.selPin = R.selPin === i ? null : i;
    [].forEach.call(R.root.querySelectorAll('[data-pin]'), function (b) { b.classList.toggle('on', +b.getAttribute('data-pin') === R.selPin); });
    drawer(R, R.selPin == null ? null : { title: (p.kind === 'hub' ? '聚點・' : '') + p.n, value: p.chip, src: p.src || 'web', body: p.note || '' });
  }
  function scrollToSec(R, name) {
    reveal(R, name);
    var el = R.root.querySelector('.c3-body [data-sec="' + name + '"]'); if (!el) return false;
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); return true;
  }

  /* ── v14 模組按鈕：按一下就定案、畫面先換；5 秒內可以收回，之後才寫進經營資料夾（POST /api/module/act｜revert｜pause）。
     只改這個模組自己那一塊；路由還沒有（404）或連不上：講一句白話，告訴他也可以直接跟小二說 ── */
  function quietMod(R, id) {
    var g = groupOf(R, 'mod:' + id) || groupOf(R, 'mods');
    if (g) R.quiet['grp-' + g.id] = true; R.quiet.mods = true; R.quiet['mod:' + id] = true;
  }
  function modLabel(kind, val) { return kind === 'pick' ? '選了「' + String(val || '') + '」' : kind === 'done' ? '按了「做了」' : kind === 'skip' ? '按了「先不做」' : MACT[kind] || ''; }
  function modPress(R, id, kind, val) {
    var x = modById(R.model, id); if (!x || !MACT[kind]) return;
    R.mpend = R.mpend || {}; R.mecho = R.mecho || {}; if (R.mpend[id]) return;
    delete R.mecho[id];
    R.mpend[id] = { kind: kind, val: kind === 'pick' ? val : null, label: modLabel(kind, val), name: x.name || '', rev: num(x.rev) ? x.rev : null, timer: setTimeout(function () { modSend(R, id); }, UNDO_S * 1000) };
    quietMod(R, id); update(R);
    var u = R.root.querySelector('[data-fk="mundo:' + id + '"]'); if (u) u.focus({ preventScroll: true });
  }
  function modUndo(R, id) {
    var p = (R.mpend || {})[id]; if (!p) return;
    clearTimeout(p.timer); delete R.mpend[id]; R.mecho[id] = { text: '收回了，什麼都沒改。' };
    quietMod(R, id); update(R);
    var f = R.root.querySelector('[data-mod="' + id + '"] [data-mact]'); if (f) f.focus({ preventScroll: true });
  }
  function modSend(R, id) {
    var p = (R.mpend || {})[id]; if (!p) return;
    clearTimeout(p.timer); delete R.mpend[id];
    var route = p.kind === 'revert' || p.kind === 'pause' ? p.kind : 'act';
    var body = route === 'act' ? { id: id, act: p.kind, value: p.val } : { id: id };
    if (p.rev != null) body.rev = p.rev;   // 小二剛改過這一塊：伺服器回 409，畫面重讀最新的
    if (!R.opts.onModule) { R.mecho[id] = { text: p.label + '・樣張只記在這一頁' }; if (R.alive) { quietMod(R, id); update(R); } return; }
    R.mecho[id] = { text: p.label + '・存檔中' }; if (R.alive) { quietMod(R, id); update(R); }
    Promise.resolve().then(function () { return R.opts.onModule(route, body); }).then(function () {
      if (!R.alive) return;
      R.mecho[id] = { text: '記下了：' + p.label + '。存在你電腦裡的經營資料夾。' };
      if (route !== 'act') toast(R.root, p.name + (route === 'pause' ? '先收起來了；要再打開，跟' + NM + '說一聲。' : '回到上一版了。'));
      quietMod(R, id); update(R);
    }, function (err) {
      if (!R.alive) return;
      var why = err && err.status === 404 ? '這一顆還接不上經營室，沒存到。直接跟' + NM + '說「' + p.name + '：' + p.label + '」也一樣。'
        : '沒存到：' + (err && typeof err.message === 'string' && /[一-鿿]/.test(err.message) ? err.message.replace(/[。.]$/, '') : '連不上經營室') + '。';
      R.mecho[id] = { text: why, err: true }; quietMod(R, id); update(R);
    });
  }
  /* 第一屏那一行提醒：打開它在的那一組，捲到那一塊 */
  function goAlert(R, i) {
    var a = alertsOf(R.model, R.C)[i]; if (!a) return;
    var name = a.mod != null && modById(R.model, a.mod) ? 'mod:' + a.mod : null, g = name ? groupOf(R, name) : null;
    if (!g && a.group) g = ((R.C.L || { list: [] }).list.filter(function (q) { return q.id === a.group; })[0]) || null;
    if (!g) return;
    if (!g.open) setOpen(R, g.id, true);
    var el = (name && R.root.querySelector('.c3-body [data-sec="' + name + '"]')) || R.root.querySelector('.c3-body [data-grp="' + g.id + '"]');
    if (el) { el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); var f = el.querySelector('button, [tabindex="0"]'); if (f) f.focus({ preventScroll: true }); }
  }
  function restore(R) {
    if (!R.opts.onRestore) { toast(R.root, '樣張沒有接上經營室。'); return; }
    Promise.resolve().then(function () { return R.opts.onRestore(); }).then(function (r) {
      if (!R.alive) return;
      var failed = r && Array.isArray(r.failed) ? r.failed.length : 0;
      toast(R.root, failed ? '有 ' + failed + ' 個檔還原不了；跟' + NM + '說「重新安裝經營室」。' : r && r.restarting ? '還原好了，經營室重開一下，幾秒內自己接回來。' : '還原好了，你的經營資料沒有動。');
    },
      function (err) { if (R.alive) toast(R.root, err && err.status === 404 ? '這一版還不能從畫面還原；跟' + NM + '說「把經營室的程式還原成原版」。' : '沒還原成：' + ((err && err.message) || '連不上經營室')); });
  }

  /* 今天的按鈕：做了／先不做／結果／改回來。先照他按的畫，再寫回；回音說兩件事：存到哪了、誰什麼時候處理 */
  function echoLines(R, body, x) {
    var runs = ((R.model.rhythm || {}).runs) || [], close = runs.filter(function (r) { return r.kind === 'close'; })[0], who;
    if (close && close.st === 'set') who = '今天 ' + close.at + ' 打烊時，我會看結果、排明天。';
    else if (close && close.st === 'todo') who = '你叫我「打烊」時，我會看結果、排明天（' + close.at + ' 那一班還沒排上）。';
    else who = '你叫我「打烊」時，我會看結果、排明天。';
    var what = body.status === 'done' ? (body.result ? (body.result === 'won' ? '成交！記下了' : '記下了：' + RESULT_LABEL[body.result]) : '記下了：做了') : body.status === 'skip' ? '記下了：先不做' : '改回來了';
    var where = R.opts.onAct ? '存在你電腦裡的經營資料夾' : '樣張只記在這一頁，重新整理就恢復';
    return [what + '・' + where, who];
  }
  function act(R, id, kind, res) {
    var td = R.model && R.model.today, x = td && (td.items || []).filter(function (y) { return y.id === id; })[0]; if (!x) return;
    var body = { id: id, status: kind === 'result' ? 'done' : kind };
    if (kind === 'result') { if (x.result === res) return; body.result = res; }
    var seq = ++R.seq; R.pending[id] = { status: body.status, result: body.result, seq: seq }; delete R.errs[id];
    R.quiet.today = true; R.echo = R.echo && !R.echo.err ? R.echo : null;
    update(R);
    var card = R.root.querySelector('.c3-job[data-job="' + id + '"]');
    if (card) {
      card.classList.add(kind === 'done' ? 'just-done' : kind === 'result' ? 'just-res' : 'just');
      var f = kind === 'done' ? card.querySelector('.c3-rchip') : kind === 'result' ? card.querySelector('.c3-rchip.on') : card.querySelector(kind === 'skip' ? '.c3-undo' : '.c3-do');
      if (f) f.focus({ preventScroll: true });
      if (res === 'won') { var on = card.querySelector('.c3-rchip.on'); if (on) on.classList.add('c3-burst'); }
    }
    var p = R.opts.onAct ? R.opts.onAct(body) : Promise.resolve(null);
    Promise.resolve(p).then(function (resp) {
      if (!R.alive) return;
      if (R.pending[id] && R.pending[id].seq === seq) delete R.pending[id];
      if (resp && resp.today && R.base) R.base = Object.assign({}, R.base, { today: resp.today });
      else if (!R.opts.onAct && R.base && R.base.today) { var y = overlay(R.base, (function () { var o = {}; o[id] = { status: body.status, result: body.result }; return o; })()); R.base = Object.assign({}, R.base, { today: y.today }); }
      if (body.status === 'done' && (kind === 'done' || res === 'won')) { R.happyUntil = clock() + 2.4; R.happyAt = clock(); R.faces.forEach(function (f) { f.expr('happy', 1.6); }); }   // 存好了才笑：只慶祝真的記下來的事
      R.echo = { lines: echoLines(R, body, x) }; R.quiet.today = true; update(R);
    }, function (err) {
      if (!R.alive) return;
      if (R.pending[id] && R.pending[id].seq === seq) delete R.pending[id];
      var msg = (err && err.message) || '連不上經營室，再按一次試試。';
      R.errs[id] = '沒存到，已經改回原本的樣子。' + msg;
      R.echo = null; R.quiet.today = true; update(R);
      var c2 = R.root.querySelector('.c3-job[data-job="' + id + '"]'); if (c2) c2.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      clearTimeout(R.errT); R.errT = setTimeout(function () { if (!R.alive) return; R.errs = {}; R.quiet.today = true; update(R); }, 15000);
    });
  }

  function onClick(R, e) {
    var el = e.target; if (!el || !el.closest) return;
    var m = R.model || {};
    if (el.closest('[data-close]')) { drawer(R, null); return; }
    var a = el.closest('[data-act]'); if (a) { act(R, a.getAttribute('data-id'), a.getAttribute('data-act'), a.getAttribute('data-res')); return; }
    var db = el.closest('[data-draft]'); if (db) { var did = db.getAttribute('data-draft'); R.openDraft[did] = !R.openDraft[did]; R.quiet.today = true; update(R); var nb = R.root.querySelector('[data-fk="draft:' + did + '"]'); if (nb) nb.focus({ preventScroll: true }); return; }
    var dp = el.closest('.c3-jdraft p'); if (dp) { dp.parentNode.classList.toggle('open'); return; }
    var cp = el.closest('[data-copy]');
    if (cp) { var it = ((m.today || {}).items || []).filter(function (y) { return y.id === cp.getAttribute('data-copy'); })[0]; if (it && it.draft) copyText(R, it.draft, '草稿複製好了：貼到 LINE 或信裡，你自己送', '複製不了：長按草稿自己選取'); return; }
    var gt = el.closest('[data-grp-t]'); if (gt) { toggleGroup(R, gt.getAttribute('data-grp-t')); return; }
    var ma = el.closest('[data-mact]'); if (ma) { modPress(R, ma.getAttribute('data-mod'), ma.getAttribute('data-mact'), ma.getAttribute('data-val')); return; }
    var mu = el.closest('[data-mundo]'); if (mu) { modUndo(R, mu.getAttribute('data-mundo')); return; }
    var al = el.closest('[data-alert]'); if (al) { goAlert(R, +al.getAttribute('data-alert') || 0); return; }
    if (el.closest('[data-restore]')) { restore(R); return; }
    if (el.closest('[data-safe-exit]')) { try { var u = new URL(global.location.href); u.searchParams.delete('safe'); global.location.href = u.toString(); } catch (x) { } return; }
    var go = el.closest('[data-go]');
    if (go) { var list = STATION_GO[+go.getAttribute('data-go')] || []; for (var i = 0; i < list.length; i++) if (scrollToSec(R, list[i])) break; return; }
    var jp = el.closest('[data-jump]'); if (jp) { scrollToSec(R, jp.getAttribute('data-jump')); var bx = jp.closest('.c3-st-new'); if (bx) bx.hidden = true; return; }
    var tj = el.closest('[data-type-jump]');
    if (tj) { var ti = +tj.getAttribute('data-type-jump'), card = R.root.querySelector('.c3-ptype[data-type="' + ti + '"]'); scrollToSec(R, 'people'); setHoverType(R, ti); if (card) setTimeout(function () { card.focus({ preventScroll: true }); }, reduced() ? 0 : 450); clearTimeout(R.hovT); R.hovT = setTimeout(function () { setHoverType(R, -1); }, 2600); return; }
    var ak = el.closest('[data-ask]');
    if (ak) { var tx = ak.getAttribute('data-ask'); if (R.opts.onSay) { R.opts.onSay(tx, 'ask'); return; } copyText(R, tx, '已複製，貼到跟' + NM + '的對話裡'); return; }
    var wr = el.closest('[data-wrong]');
    if (wr) {
      var line = wr.getAttribute('data-line'), text = '【經營室・' + wr.getAttribute('data-wrong') + '】' + (line ? '「' + line + '」' : '') + '這裡不對，應該是：';
      if (R.opts.onSay) { R.opts.onSay(text, 'wrong'); return; }
      copyText(R, text, '已複製，貼到跟' + NM + '的對話裡，說哪裡不對'); return;
    }
    var pin = el.closest('[data-pin]'); if (pin) { openPin(R, +pin.getAttribute('data-pin')); return; }
    var nd = el.closest('[data-node]'); if (nd) { drawer(R, nodeSource(m, nd.getAttribute('data-node'))); return; }
    var cc = el.closest('[data-calc]'); if (cc) { drawer(R, calcSource(m, cc.getAttribute('data-calc'))); return; }
    var hit = el.closest('[data-src]'); if (hit) drawer(R, (m.sources || {})[hit.getAttribute('data-src')]);
  }
  function onKey(R, e) {
    if (e.key === 'Escape') { drawer(R, null); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && (e.target.closest('[data-src]') || e.target.closest('[data-calc]') || e.target.closest('.c3-jdraft p')) && e.target.tagName !== 'BUTTON') { e.preventDefault(); onClick(R, { target: e.target }); }
  }

  function render(root, model, opts) {
    var store = (model.store || {}).name || '', R = root._cm;
    if (R && (!R.alive || R.store !== store)) { R.handle.destroy(); R = null; }
    if (!R) R = mount(root, store);
    update(R, model, opts || {});
    return R.handle;
  }

  global.ContextMap = { render: render, graphOf: graphOf, NODES: NODES, P29: P29, rate: rate, gradientLine: gradientLine, _plan: plan, _success: successModel, _layout: resolveLayout, _cfg: cfgOf, _alerts: alertsOf, _notes: notes, _tidy: tidyModel, GROUP_DEF: GROUP_DEF };   // _plan、_success、_layout、_cfg、_alerts、_notes：測試用
})(typeof window !== 'undefined' ? window : this);
