/* 小二 by N・經營室的外殼 v13.2（2026-10-02 整份重寫，舊外殼不留）
   ──────────────────────────────────────────────────────────────────────────
   只做五件事，其他都交給別的檔：
     1. 頂欄：字標「小二. by N」｜他的小二（XiaoerCompanion.mount 的小頭像，會跟滑鼠轉頭）＋名字｜店名
        （10/2 晚拿掉「免費版／課程包」標籤：付費狀態一句話就能叫小二改，畫面也不知道看的人付過錢沒有；
         裝沒裝課程包由小二自己讀，真的用到時在對話裡講一次）
     2. 主畫面：還沒訪談 → 第一個畫面；有地圖 → 經營室（訪談中與日常同一頁，ContextMap.render 畫）
     3. 「你的小二」調整器：點頂欄的小二，或經營室裡帶 data-xe-open 的入口（也接 opts.onCompanion）
        → 面板裡放 XiaoerCompanion.customizer；存檔 POST /api/companion，409 重讀再提示
     4. 今天的按鈕寫回 POST /api/map/act；要貼回對話的那幾句（草稿、「這不對」、回答「想問你」）複製到剪貼簿（複製不了就攤開原文讓他自己選）。
        10/3：經營室各塊的「跟小二說」拿掉了，只留真的要複製的地方。
        調整器裡那三句也走這裡，提示由調整器寫在那三句上面、用名字格裡現在的名字；不浮出回音，免得蓋住面板的標題
     5. 載入中、錯誤、連線斷了的畫面；每秒讀一次 /api/state，有變才換
   只用到的伺服器入口：/api/session、/api/state、/api/map/act、/api/companion（GET／POST）；
   v14 做成你的形狀（介面約定 /Users/nelsen/wip/v14-work-20261003/介面約定.md 第 4 節）再加：/api/layout（點組名收合）、
   /api/module/act｜revert｜pause（模組卡的按鈕）、/api/integrity/restore（程式被改過時還原）；照片由 companion.js 從 /api/asset 讀。
   新路由還沒有（404）或連不上時畫面照常，經營室講一句白話。網址帶 ?safe=1 是安全模式：只畫內建的塊、小二畫回原本的樣子（純前端判斷）。
   寫入一律帶 X-Workbench: 1。
   鑰匙（10/2 晚改）：網址上的 #token= 留著、也記在這個網址自己的瀏覽器儲存裡。側邊瀏覽器被重建、cookie 不見時，
   用它自己重換一次，不會變成「過期」；伺服器重開沿用同一個埠與同一把鑰匙，所以同一個網址一直能用。
   真的換不回來才請他回對話說「打開我的經營室」，並給一顆複製鍵。
   畫面上的字：台灣繁中白話；指小二的地方一律用他取的名字（companion.name）。
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var XC = window.XiaoerCompanion, CM = window.ContextMap, V = window.CtxViz;
  var POLL_MS = 1000;
  var WORDMARK = '<svg xmlns="http://www.w3.org/2000/svg" class="tb-wm" aria-hidden="true" focusable="false" viewBox="0 0 3238.75 923"><path class="wm-ink" d="M639 248Q742 296 805 351.5Q868 407 898.5 461Q929 515 933 560Q937 605 922 633.5Q907 662 878.5 666Q850 670 815 642Q808 593 789 541.5Q770 490 744.5 439Q719 388 689 341.5Q659 295 628 254ZM196 235 360 299Q357 307 349 312Q341 317 322 317Q293 380 249 449.5Q205 519 145.5 583.5Q86 648 8 696L0 687Q39 640 70.5 583Q102 526 126.5 465Q151 404 168.5 345Q186 286 196 235ZM423 0 584 16Q582 26 574 33.5Q566 41 547 44V774Q547 817 535 847.5Q523 878 486 897Q449 916 372 923Q368 892 361 870.5Q354 849 337 834Q321 820 295 809.5Q269 799 219 790V777Q219 777 234.5 778Q250 779 273.5 780Q297 781 322.5 782.5Q348 784 368.5 785Q389 786 397 786Q413 786 418 781Q423 776 423 765ZM1097 742H1808L1884 641Q1884 641 1898 652Q1912 663 1933 680.5Q1954 698 1978 718Q2002 738 2021 755Q2017 771 1992 771H1106ZM1195 179H1712L1786 81Q1786 81 1799.5 91.5Q1813 102 1834 119.5Q1855 137 1877.5 156Q1900 175 1919 191Q1915 207 1890 207H1203Z"/><circle class="wm-dot" cx="2196" cy="740" r="95"/><g><path class="wm-by" d="M2561.45 839.11Q2546.51 839.11 2534.58 833.82Q2522.64 828.54 2514.38 819.02Q2506.11 809.5 2501.99 797.11L2506.77 790.91L2504.89 835H2471.5V592.08H2507.3V694.48L2503.81 687.05Q2506.73 677.1 2514.68 668.39Q2522.64 659.69 2534.7 654.22Q2546.76 648.74 2561.45 648.74Q2584.66 648.74 2601.7 660.25Q2618.74 671.76 2627.99 693.06Q2637.23 714.35 2637.23 743.92Q2637.23 773.5 2627.99 794.79Q2618.74 816.09 2601.7 827.6Q2584.66 839.11 2561.45 839.11ZM2555.06 806.32Q2576.34 806.32 2588.12 789.74Q2599.9 773.17 2599.9 743.92Q2599.9 714.42 2588.12 697.97Q2576.34 681.53 2555.58 681.53Q2540.62 681.53 2529.76 688.87Q2518.89 696.22 2513.1 710.16Q2507.3 724.11 2507.3 743.92Q2507.3 763.22 2513.14 777.25Q2518.97 791.29 2529.67 798.8Q2540.36 806.32 2555.06 806.32ZM2692.85 886.32V856.4H2715.28Q2724.61 856.4 2729.35 853.62Q2734.1 850.83 2736.49 844.09L2742.42 828.29H2730.61L2664.44 652.85H2702.65L2753.71 794.55L2801.18 652.85H2839.39L2767.06 855.21Q2761.36 871.65 2749.78 878.98Q2738.2 886.32 2718.84 886.32Z"/><path class="wm-ink" d="M2921.43 812.23L2921.02 815.07 2920.98 817.95 2921.32 820.8 2922.03 823.59 2923.09 826.26 2924.5 828.76 2926.22 831.07 2928.22 833.12 2930.48 834.9 2932.95 836.37 2935.59 837.51 2938.35 838.29 2941.2 838.7 2944.07 838.74 2946.92 838.4 2949.71 837.69 2952.38 836.63 2954.89 835.22 2957.19 833.5 2959.25 831.5 2961.02 829.24 2962.49 826.77 2963.63 824.13 2964.41 821.37 3009.35 609.91 3102.7 818.71 3104.47 822.13 3106.07 824.58 3108.54 827.63 3110.61 829.71 3112.06 830.97 3114.39 832.71 3117.73 834.72 3119.38 835.54 3122 836.61 3125.69 837.73 3127.35 838.09 3130.05 838.51 3133.84 838.76 3138.03 838.58 3141.75 838.04 3145.63 837.08 3148.05 836.27 3150.4 835.32 3153.75 833.66 3155.92 832.38 3158.01 830.98 3160.98 828.66 3162.83 826.98 3164.59 825.19 3166.25 823.31 3167.79 821.32 3169.22 819.24 3170.54 817.06 3171.72 814.8 3172.77 812.45 3173.67 810.02 3174.42 807.51 3184.94 759.25 3193.67 720.55 3202.69 681.82 3215.78 627.41 3217.61 618.91 3222.29 594.93 3225.13 579.09 3227.84 563.09 3232.88 531.31 3238.65 491.64 3238.75 490.46 3238.7 489.27 3238.51 488.1 3238.18 486.95 3237.71 485.86 3237.12 484.83 3236.4 483.88 3235.58 483.02 3234.66 482.26 3233.66 481.63 3232.59 481.11 3231.46 480.73 3230.3 480.49 3229.11 480.39 3227.92 480.43 3226.75 480.61 3225.6 480.94 3224.51 481.39 3223.47 481.98 3222.52 482.69 3221.65 483.51 3220.89 484.42 3220.25 485.42 3216.67 493.87 3210.63 508.8 3201.83 531.44 3193.42 554.25 3185.48 577.18 3180.44 592.71 3177.95 600.77 3173.41 616.43 3171.23 624.92 3161.79 663.89 3152.64 702.93 3143.79 741.91 3134.81 782.89 3021.94 530.42 3020.6 527.88 3018.59 525.11 3016.59 523.06 3014.33 521.28 3011.86 519.81 3009.22 518.67 3006.98 518.01 3004.15 517.53 3001.28 517.42 2998.42 517.69 2995.1 518.49 2992.43 519.55 2989.92 520.96 2988.04 522.33 2985.93 524.28 2983.78 526.94 2982.31 529.41 2981.18 532.05 2980.4 534.81Z"/></g></svg>';
  var LOOK_KEYS = ['name', 'call', 'tone', 'voice', 'hello', 'hue', 'eyes', 'face', 'follow', 'blink', 'skin', 'photo'];
  var SAFE = /(?:^\?|&)safe=1(?:&|$)/.test(location.search);   // 安全模式：只畫內建的塊，小二畫回原本的樣子

  var S = {
    state: null, pack: null, look: null, lookSig: '', view: '', fails: 0, polling: null, inflight: false, dead: false, retryT: null,
    cm: null, avatar: null, hero: null, sheet: null, tuner: null, tunerSaved: null, justSaved: null, toastT: null, closeT: null
  };

  /* ── 小工具 ── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k]; if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;            // 只給這一份檔裡寫死的字與圖，不放任何資料
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function nameOf() { return (S.look && S.look.name) || '小二'; }
  function sig(look) { var o = {}; LOOK_KEYS.forEach(function (k) { o[k] = look ? look[k] : null; }); return JSON.stringify(o); }
  function lookFrom(map) {
    var m = map || {}, c = Object.assign({}, m.companion || {}), p = m.persona || {};
    c.hue = p.hue || c.hue || 'orange'; c.eyes = p.eyes || c.eyes || 'capsule';
    if (SAFE) { c.skin = 'drawn'; c.photo = null; }
    return XC ? XC.normalize(c) : { name: c.name || '小二', hue: c.hue };
  }
  var ICON = {
    caret: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
  };

  /* ── 跟伺服器說話：錯誤帶 status 與伺服器回的內容，白話原因放 message ── */
  function api(route, data, extra) {
    var opt = { credentials: 'same-origin', headers: Object.assign({ 'X-Workbench': '1' }, extra || {}) };
    if (data !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    return fetch(route, opt).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (res.ok && body) return body;
        var e = new Error((body && body.error) || (res.ok ? '經營室回的資料不完整。' : '這次沒有完成，再試一次。'));
        e.status = res.status; e.body = body; throw e;
      });
    }, function () { var e = new Error('連不上經營室。'); e.status = 0; throw e; });
  }

  /* ── 本命色：外殼只用在字標的點、頭像 ── */
  function paintAccent(hue) {
    var H = V && V.hue ? V.hue(hue) : null; if (!H) return;
    var r = document.documentElement.style;
    r.setProperty('--accent', H.accent); r.setProperty('--accent-ink', H.text); r.setProperty('--accent-ink-dark', H.darkText || H.text);
    r.setProperty('--on-accent', H.on); r.setProperty('--accent-soft', H.soft); r.setProperty('--accent-soft-dark', H.darkSoft || H.soft);
  }

  /* ════ 頂欄 ════ */
  function buildTopbar() {
    var bar = el('header', { class: 'tb', id: 'tb' }, [
      el('div', { class: 'tb-in' }, [
        el('span', { class: 'tb-brand', role: 'img', 'aria-label': '小二 by N', html: WORDMARK }),
        el('span', { class: 'tb-sep', 'aria-hidden': 'true' }),
        el('button', { type: 'button', class: 'tb-me', id: 'tb-me', 'aria-haspopup': 'dialog', onclick: function () { openTuner(); } }, [
          el('span', { class: 'tb-face', id: 'tb-face' }),
          el('span', { class: 'tb-name', id: 'tb-name', text: '小二' }),
          el('span', { class: 'tb-caret', html: ICON.caret })
        ]),
        el('span', { class: 'tb-fill' }),
        el('span', { class: 'tb-store', id: 'tb-store' })
      ])
    ]);
    return bar;
  }
  function paintTopbar() {
    var look = S.look, name = nameOf();
    $('#tb-name').textContent = name;
    $('#tb-me').setAttribute('aria-label', name + '，按一下幫' + name + '換個樣子');
    $('#tb-me').title = '幫' + name + '換個樣子';
    if (XC && look) {
      if (!S.avatar) S.avatar = XC.mount($('#tb-face'), look, { size: 28, expr: 'idle', label: name });
      else S.avatar.update(look);
    }
    var store = S.state && S.state.map && S.state.map.store, sn = store && store.name;
    $('#tb-store').textContent = sn || '';
    document.title = sn ? sn + '・經營室' : '經營室・小二';
  }

  /* ════ 主畫面 ════ */
  function shell() {
    var app = $('#app'); app.textContent = '';
    app.appendChild(buildTopbar());
    app.appendChild(el('div', { class: 'xs-net', id: 'net', role: 'status', hidden: true }, [
      el('i', { 'aria-hidden': 'true' }), el('span', { id: 'net-t' }),
      el('button', { type: 'button', class: 'xs-btn xs-sm', id: 'net-b', hidden: true, onclick: function () { sayOpen(); } }, ['複製這句'])
    ]));
    app.appendChild(el('main', { id: 'main', class: 'xs-main', tabindex: '-1' }));
    window.addEventListener('scroll', function () { $('#tb').classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
  }
  function setView(view, build) {
    var main = $('#main');
    if (S.view === view) return false;
    if (S.cm) { S.cm.destroy(); S.cm = null; }
    if (S.hero) { S.hero.destroy(); S.hero = null; }
    main.textContent = ''; main.className = 'xs-main v-' + view;
    build(main);
    if (S.view && !reduced()) { main.classList.add('xs-swap'); main.addEventListener('animationend', function () { main.classList.remove('xs-swap'); }, { once: true }); }
    S.view = view;
    return true;
  }

  /* 載入中（index.html 先放一份一樣的，程式接手後換成這一份） */
  function viewLoading() {
    setView('loading', function (main) {
      main.appendChild(el('section', { class: 'xs-screen', 'aria-busy': 'true' }, [
        el('div', { class: 'xs-screen-face', id: 'hero-face' }),
        el('p', { class: 'xs-screen-lead', text: '正在打開經營室…' })
      ]));
      if (XC) S.hero = XC.mount($('#hero-face'), S.look || {}, { size: 72, expr: 'think', label: nameOf() });
    });
  }

  /* 錯誤：一行白話＋下一步。連不上時每幾秒自己再試，接上了就回到經營室，不用他按 */
  var OPEN_LINE = '打開我的經營室';
  function sayOpen() {
    var name = nameOf();
    copy(OPEN_LINE, function () { toast('複製好了，貼到跟' + name + '的對話送出。'); }, function () { copySheet(OPEN_LINE, name); });
  }
  function viewError(err) {
    var name = nameOf(), gone = err && err.status === 401, closed = err && err.status === 0;
    var title = gone ? '這一頁要重新打開' : closed ? '經營室沒有開著' : '經營室打不開';
    var why = gone ? '這個分頁沒帶到經營室的鑰匙。回到對話跟' + name + '說「' + OPEN_LINE + '」，右邊就會換成能用的那一頁。'
      : closed ? '放經營室的小程式停了，或電腦剛睡醒。跟' + name + '說「' + OPEN_LINE + '」；接上了，這一頁會自己回來。'
        : (err && err.message) || '這次沒有讀到你的經營室。';
    S.view = ''; stopPolling();
    setView('error', function (main) {
      main.appendChild(el('section', { class: 'xs-screen', role: 'alert' }, [
        el('div', { class: 'xs-screen-face', id: 'hero-face' }),
        el('h1', { class: 'xs-screen-title', id: 'err-title' }, [title, el('i', { class: 'xs-dot', 'aria-hidden': 'true' })]),
        el('p', { class: 'xs-screen-lead', id: 'err-lead', text: why }),
        el('div', { class: 'xs-screen-acts', id: 'err-acts' }, [
          gone || closed ? el('button', { type: 'button', class: 'xs-btn', onclick: sayOpen }, ['複製「' + OPEN_LINE + '」']) : null,
          gone || closed ? null : el('button', { type: 'button', class: 'xs-btn', onclick: function () { viewLoading(); start(); } }, ['再試一次'])
        ])
      ]));
      if (XC) { try { S.hero = XC.mount($('#hero-face'), S.look || {}, { size: 96, expr: 'think', label: name }); } catch (e) { S.hero = null; } }
    });
    if (gone || closed) retrySoon(); else fixHelp();
  }
  /* 畫面打不開、而且是程式被改過（pack.integrity）：錯誤畫面自己給「還原成原版」。
     這一段只用這一份檔裡的小工具（不靠可能就是被改壞的 contextmap.js、companion.js）；連 app.js 都壞了，index.html 裡有一段最小的救援。
     讀狀態走 load()：沒有 cookie 的瀏覽器（companion.js、ctxviz.js 壞了，一開機就到這裡，還沒換過鑰匙）先用網址或這個網址記著的鑰匙換一次 */
  function fixHelp() {
    load().then(function (r) {
      var it = r && r.pack && r.pack.integrity, name = nameOf();
      if (!it || it.ok !== false || it.checked === false || S.view !== 'error') return;
      var title = $('#err-title'), lead = $('#err-lead'), acts = $('#err-acts'); if (!lead || !acts) return;
      title.firstChild.textContent = '經營室的程式被改過';
      acts.textContent = '';
      if (it.can_restore === false) { lead.textContent = '這一份還原不了：跟' + name + '說「重新安裝經營室」。你的經營資料不會動。'; return; }
      lead.textContent = '畫面才打不開。按一下換回安裝時的樣子；你的經營資料不會動。';
      acts.appendChild(el('button', { type: 'button', class: 'xs-btn', 'data-restore': '', onclick: function (e) { fixNow(e.currentTarget); } }, ['還原成原版']));
    }, function () { });
  }
  function fixNow(btn) {
    var lead = $('#err-lead'), name = nameOf();
    btn.disabled = true; lead.textContent = '正在還原…';
    api('/api/integrity/restore', {}).then(function (r) {
      if (r.failed && r.failed.length) { lead.textContent = '有 ' + r.failed.length + ' 個檔還原不了；跟' + name + '說「重新安裝經營室」。你的經營資料沒有動。'; return; }
      lead.textContent = r.restarting ? '還原好了，經營室重開一下，幾秒內自己接回來。' : '還原好了，馬上重新整理。';
      setTimeout(function () { comeBack(20); }, r.restarting ? 1500 : 300);
    }, function (e) { btn.disabled = false; lead.textContent = '這次沒有還原：' + e.message; });
  }
  /* 還原之後重新整理（換回來的 js 要重新讀）；經營室在重開就等它回來 */
  function comeBack(n) {
    api('/api/state').then(function () { location.reload(); }, function () { if (n > 0) setTimeout(function () { comeBack(n - 1); }, 1000); else location.reload(); });
  }
  /* 錯誤畫面上安靜地再試：伺服器重開沿用同一個埠與鑰匙，接上就換回經營室 */
  function retrySoon() {
    clearTimeout(S.retryT);
    S.retryT = setTimeout(function () {
      if (S.view !== 'error') return;
      if (document.hidden) { retrySoon(); return; }
      load().then(function (r) { S.fails = 0; accept(r); startPolling(); }, function () { retrySoon(); });
    }, 3000);
  }

  /* 還沒訪談：小二在等你回到對話 */
  function viewFirst() {
    var name = nameOf();
    var built = setView('first', function (main) {
      main.appendChild(el('section', { class: 'xs-first', 'aria-labelledby': 'first-title' }, [
        el('div', { class: 'xs-first-face', id: 'hero-face' }),
        el('h1', { class: 'xs-first-title', id: 'first-title' }, [el('span', { id: 'first-name' }), el('i', { class: 'xs-dot', 'aria-hidden': 'true' })]),
        el('p', { class: 'xs-first-lead', id: 'first-lead' }),
        el('ol', { class: 'xs-first-steps', 'aria-label': '接下來會長出來的' }, [
          step('01', '聊你的店', '你賣什麼、客人是誰、哪一位最讓你滿意。'),
          step('02', '看見要複製的成功', '那一型客人從哪來、為什麼留下、附近還有幾家像他。'),
          step('03', '每天三件事', '開門前排好，做了按一下，打烊時看結果。')
        ]),
        el('p', { class: 'xs-first-tag', text: '讓客人來，也讓客人回' })
      ]));
      if (XC) S.hero = XC.mount($('#hero-face'), S.look, { size: 176, expr: 'listen', label: name });
    });
    if (!built && S.hero) S.hero.update(S.look);
    $('#first-name').textContent = name === '小二' ? '我是你的小二' : '我是' + name + '，你的小二';
    $('#first-lead').textContent = '回到對話，回答' + (name === '小二' ? '我' : name) + '的問題就好。每答兩、三題，這裡就多長一點；第一張圖大約一分鐘後出現。';
  }
  function step(no, t, d) { return el('li', {}, [el('b', { text: no }), el('strong', { text: t }), el('span', { text: d })]); }

  /* 經營室：ContextMap 畫；之後每次只換有變的塊 */
  function viewRoom() {
    if (!CM) { viewError(new Error('經營室的畫面沒有載入完整，重新整理一次。')); return; }
    setView('room', function (main) { main.appendChild(el('section', { id: 'cm-root', class: 'xs-room', 'aria-label': '經營室' })); });
    var host = $('#cm-root');
    try {
      S.cm = CM.render(host, mapModel(), {
        brand: false, onSay: say, onAct: act, onCompanion: function () { openTuner(); },
        companion: S.look, pack: S.pack, safe: SAFE,
        onLayout: saveLayout, onModule: moduleCall, onRestore: restoreIntegrity
      });
    } catch (e) { S.cm = null; viewError(new Error('經營室的畫面畫不出來，重新整理一次。')); }
  }
  function mapModel() {
    var m = JSON.parse(JSON.stringify(S.state.map));
    delete m.revision; delete m.updated;
    m.tactics = S.pack ? S.pack.tactics || null : null;
    if (S.pack && S.pack.installed) m.packed = true;   // 沒裝就不帶 packed（v14 起 pack 一定在，課程包裝了沒看 pack.installed）
    if (!m.store) m.store = { name: '你的店', meta: '' };
    return m;
  }

  /* 收到一份新的狀態：顏色、頂欄、主畫面 */
  function accept(r) {
    S.state = r.state; S.pack = r.pack || null;
    var look = lookFrom(S.state.map), s = sig(look), changed = s !== S.lookSig;
    S.look = look; S.lookSig = s;
    if (changed) paintAccent(look.hue);
    paintTopbar();
    if (S.state.map) viewRoom(); else viewFirst();
  }

  /* ════ 鑰匙：網址上的 #token= 留著，也記一份在這個網址的瀏覽器儲存；cookie 不見就自己重換 ════ */
  var KEY = 'xiaoer.key';
  function keys() {
    var out = [], m = location.hash.match(/(?:^#|&)token=([^&]+)/);
    if (m) { try { out.push(decodeURIComponent(m[1])); } catch (e) { } }
    try { var k = window.localStorage.getItem(KEY); if (k && out.indexOf(k) < 0) out.push(k); } catch (e) { }
    return out;
  }
  function remember(k) { try { window.localStorage.setItem(KEY, k); } catch (e) { } }
  function session() {
    var list = keys();
    var tryOne = function (i) {
      if (i >= list.length) { var e = new Error('這一頁沒帶到鑰匙。'); e.status = 401; return Promise.reject(e); }
      return api('/api/session', {}, { Authorization: 'Bearer ' + list[i] }).then(function (r) { remember(list[i]); return r; },
        function (e) { return e.status === 401 ? tryOne(i + 1) : Promise.reject(e); });
    };
    return tryOne(0);
  }
  /* 讀一次狀態；cookie 認不得（側邊瀏覽器重建過）就用鑰匙重換一次再讀 */
  function load() {
    return api('/api/state').catch(function (e) {
      if (e.status !== 401) throw e;
      return session().then(function () { return api('/api/state'); });
    });
  }

  /* ════ 每秒讀一次；連不上三次才說，接回來自己收起 ════ */
  function start() {
    var first = /(?:^#|&)token=/.test(location.hash) ? session().catch(function () { }) : Promise.resolve();
    return first.then(load).then(function (r) {
      S.fails = 0; S.dead = false; accept(r); startPolling();
    }).catch(viewError);
  }
  function startPolling() {
    stopPolling();
    S.polling = setInterval(tick, POLL_MS);
  }
  function stopPolling() { if (S.polling) clearInterval(S.polling); S.polling = null; }
  function tick() {
    if (document.hidden || S.inflight) return;
    if (S.dead && Date.now() < S.dead) return;          // 鑰匙換不回來：每 5 秒再試一次，不要每秒打
    S.inflight = true;
    load().then(function (r) {
      S.inflight = false; S.dead = false;
      if (S.fails) { S.fails = 0; net(null); }
      var newPack = JSON.stringify(r.pack || null) !== JSON.stringify(S.pack);
      if (!S.state || r.state.revision !== S.state.revision || newPack) accept(r);
    }, function (e) {
      S.inflight = false;
      var name = nameOf();
      if (e.status === 401) {
        S.dead = Date.now() + 5000; S.fails++;
        net('這一頁要重新打開。跟' + name + '說「' + OPEN_LINE + '」。', true, true); return;
      }
      S.fails++;
      if (S.fails >= 8) net('經營室沒有回應。跟' + name + '說「' + OPEN_LINE + '」，接上了會自己更新。', true, true);
      else if (S.fails >= 3) net('跟經營室的連線斷了。畫面停在剛剛的樣子，接回來會自己更新。');
    });
  }
  function net(text, stuck, withCopy) {
    var n = $('#net'); if (!n) return;
    if (!text) { n.hidden = true; return; }
    $('#net-t').textContent = text; n.classList.toggle('xs-stuck', !!stuck);
    $('#net-b').hidden = !withCopy;
    if (n.hidden) { n.hidden = false; n.classList.remove('in'); void n.offsetWidth; n.classList.add('in'); }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.polling) tick(); });

  /* ════ 今天的按鈕：寫回資料夾；回來的 today 先放進 state，輪詢再把整份換新 ════ */
  function act(body) {
    return api('/api/map/act', body).then(function (r) {
      if (S.state && S.state.map && r.today) S.state.map.today = r.today;
      return r;
    }, function (e) {
      throw new Error(e.status === 0 ? '連不上經營室，再按一次試試。' : e.message);
    });
  }

  /* ════ v14：版面、模組按鈕、還原。伺服器回了整份狀態就直接換上，沒回就重讀一次；
     路由還沒有（404）、連不上：錯誤帶 status 往回丟，經營室自己講一句白話（畫面不會壞） ════ */
  function took(r) {
    if (r && r.state && r.state.map) accept({ state: r.state, pack: 'pack' in r ? r.pack : S.pack });
    else refresh();
    return r;
  }
  function failed(e) {
    if (e.status === 409) refresh();
    var x = new Error(e.status === 0 ? '連不上經營室' : e.message); x.status = e.status; throw x;
  }
  function saveLayout(layout) { return api('/api/layout', { layout: layout }).then(took, failed); }
  function moduleCall(kind, body) {
    if (['act', 'revert', 'pause'].indexOf(kind) < 0) return Promise.reject(new Error('不認得的按鈕。'));
    return api('/api/module/' + kind, body).then(took, failed);
  }
  function restoreIntegrity() { return api('/api/integrity/restore', {}).then(took, failed); }

  /* ════ 「跟小二說」：複製一句話，貼回對話 ════ */
  function copy(text, ok, no) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) navigator.clipboard.writeText(text).then(ok, no);
      else no();
    } catch (e) { no(); }
  }
  /* 經營室裡要貼回對話的那一句（「這不對」、回答「想問你」）：複製好了，頂欄那裡浮一句回音 */
  function say(text) {
    var name = nameOf();
    copy(text, function () { toast('複製好了，貼到跟' + name + '的對話送出。'); }, function () { copySheet(text, name); });
  }
  /* 調整器下方那三句：name＝名字格裡現在的名字（可能還沒存），提示也用它。
     複製好了回 true，調整器把「複製好了」寫在那三句上面；複製不了就在面板頂端攤開那一句，回 false */
  function sayInTuner(text, name) {
    name = name || nameOf();
    return new Promise(function (done) {
      copy(text, function () { done(true); }, function () { tunerCopy(text, name); done(false); });
    });
  }
  function copySheet(text, name) {
    name = name || nameOf();
    var area = el('textarea', { class: 'xs-copy-area', readonly: true, rows: '4', 'aria-label': '要貼給' + name + '的話' });
    area.value = text;
    var card = el('div', { class: 'xs-sheet-card xs-sm' }, [
      el('header', { class: 'xs-sheet-head' }, [
        el('div', {}, [el('p', { class: 'xs-eyebrow', text: '跟' + name + '說' }), el('h2', { id: 'sheet-title' }, ['自己複製這一句', el('i', { class: 'xs-dot', 'aria-hidden': 'true' })])]),
        el('button', { type: 'button', class: 'xs-icon-btn', 'aria-label': '關上', html: ICON.close, onclick: closeSheet })
      ]),
      el('div', { class: 'xs-sheet-pad' }, [
        el('p', { class: 'xs-muted', text: '這台電腦不讓網頁自動複製。字已經選好了，按複製鍵，再貼到跟' + name + '的對話裡。' }),
        area,
        el('div', { class: 'xs-row' }, [el('button', { type: 'button', class: 'xs-btn', onclick: closeSheet }, ['好了'])])
      ])
    ]);
    openSheet(card, { onClose: null });
    setTimeout(function () { area.focus(); area.select(); }, 30);
  }

  /* 調整器開著時複製不了：不關面板，在面板頂端攤開那一句讓他自己選 */
  function tunerCopy(text, name) {
    var card = S.sheet && S.sheet.card; if (!card) return;
    var old = card.querySelector('.xs-tn-copy'); if (old) old.remove();
    name = name || nameOf();
    var area = el('textarea', { class: 'xs-copy-area', readonly: true, rows: '2', 'aria-label': '要貼給' + name + '的話' });
    area.value = text;
    var box = el('div', { class: 'xs-tn-copy', role: 'status' }, [
      el('p', { class: 'xs-muted', text: '這台電腦不讓網頁自動複製。字已經選好了，按複製鍵，再貼到跟' + name + '的對話送出。' }), area,
      el('button', { type: 'button', class: 'xs-btn xs-sm xs-ghost', onclick: function () { box.remove(); } }, ['好了'])
    ]);
    var body = card.querySelector('.xs-sheet-body'); body.insertBefore(box, body.firstChild); body.scrollTop = 0;
    setTimeout(function () { area.focus(); area.select(); }, 30);
  }

  /* ════ 面板（調整器、複製）：鎖住後面的畫面、焦點不跑出去、Esc 關上 ════ */
  function openSheet(card, o) {
    closeSheet(true);
    var last = document.activeElement;
    var back = el('div', { class: 'xs-sheet-back', onclick: function () { requestClose(); } });
    var wrap = el('div', { class: 'xs-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' }, [back, card]);
    $('#layer').appendChild(wrap);
    $('#app').inert = true; document.documentElement.classList.add('xs-locked');
    $('#toast').classList.remove('show');
    S.sheet = { wrap: wrap, card: card, last: last, onClose: o && o.onClose, guard: o && o.guard, kind: (o && o.kind) || '' };
    document.addEventListener('keydown', trap, true);
    if (!reduced()) wrap.classList.add('in');
    return S.sheet;
  }
  function requestClose() {
    var sh = S.sheet; if (!sh) return;
    if (sh.guard && sh.guard()) return;
    closeSheet();
  }
  function closeSheet(instant) {
    var sh = S.sheet; if (!sh) return;
    S.sheet = null;
    document.removeEventListener('keydown', trap, true);
    if (sh.onClose) sh.onClose();
    $('#app').inert = false; document.documentElement.classList.remove('xs-locked');
    var done = function () { sh.wrap.remove(); };
    if (instant === true || reduced()) done();
    else { sh.wrap.classList.remove('in'); sh.wrap.classList.add('out'); setTimeout(done, 220); }
    if (sh.last && sh.last.focus && document.contains(sh.last)) sh.last.focus({ preventScroll: true });
  }
  function trap(e) {
    if (!S.sheet) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
    if (e.key !== 'Tab' || !S.sheet) return;
    var f = [].filter.call(S.sheet.card.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (!S.sheet.card.contains(document.activeElement)) { e.preventDefault(); a.focus(); return; }
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }

  /* ════ 你的小二：調整器 ════ */
  function openTuner() {
    if (!XC || !S.state) return;
    if (S.sheet && S.sheet.kind === 'tuner') return;   // 已經開著（頂欄、經營室裡的入口連按也只開一次）
    var name = nameOf();
    var title = el('h2', { id: 'sheet-title' }, [el('span', { text: '換個樣子' }), el('i', { class: 'xs-dot', 'aria-hidden': 'true' })]);   // 名字只在名字格出現一次
    var ask = el('div', { class: 'xs-tn-ask', id: 'tn-ask', hidden: true, role: 'alert' }, [
      el('span', { text: '剛改的還沒存。' }),
      el('button', { type: 'button', class: 'xs-btn xs-sm', onclick: function () { S.tunerSaved = null; closeSheet(); } }, ['不存了']),
      el('button', { type: 'button', class: 'xs-btn xs-sm xs-ghost', onclick: function () { $('#tn-ask').hidden = true; } }, ['繼續改'])
    ]);
    var host = el('div', { class: 'xs-tn-host' }, [el('p', { class: 'xs-tn-wait', text: '正在讀' + name + '現在的樣子…' })]);
    var card = el('div', { class: 'xs-sheet-card xs-lg' }, [
      el('header', { class: 'xs-sheet-head' }, [
        el('div', {}, [el('p', { class: 'xs-eyebrow', text: '你的小二' }), title]),
        ask,
        el('button', { type: 'button', class: 'xs-icon-btn', 'aria-label': '關上', html: ICON.close, onclick: requestClose })
      ]),
      el('div', { class: 'xs-sheet-body' }, [host])
    ]);
    openSheet(card, {
      onClose: function () {
        clearTimeout(S.closeT);
        if (S.tuner) { S.tuner.destroy(); S.tuner = null; } S.tunerSaved = null;
        if (S.justSaved) {
          var nm = nameOf(); S.justSaved = null;
          setTimeout(function () { if (S.avatar) S.avatar.expr('happy', 1.6); toast(nm + '換好了，記在你的經營資料夾。'); }, 240);
        }
      },
      guard: function () { if (!dirty()) return false; var a = $('#tn-ask'); a.hidden = false; a.querySelector('button').focus(); return true; },
      kind: 'tuner'
    });
    var go = function (init) {
      if (!S.sheet || S.sheet.card !== card) return;
      host.textContent = '';
      S.tunerSaved = XC.normalize(init);
      S.tuner = XC.customizer(host, init, {
        onSave: saveCompanion, onCancel: function () { closeSheet(); },
        onSay: sayInTuner,                                   // 下方三句：走外殼的複製；提示寫在調整器裡
        onSaved: function () { closeSoon(card); }            // 存好了，看完「換好了」就自己關上
      });
      var first = host.querySelector('input,button'); if (first) first.focus({ preventScroll: true });
    };
    var mapComp = (S.state.map && S.state.map.companion) || {};
    var safe = function (c) { if (SAFE) { c.skin = 'drawn'; c.photo = null; } return c; };
    api('/api/companion').then(function (r) { go(safe(Object.assign({ skin: mapComp.skin, photo: mapComp.photo }, r.companion))); },
      function () { go(safe(Object.assign({}, mapComp, { hue: S.look.hue, eyes: S.look.eyes }))); });
  }
  /* 存好了：面板裡先看到「換好了」、小二開心一下（約 1.6 秒），面板自己關上，經營室接著說存在哪。
     這段時間裡他又改了東西，或面板已經關了、換成別的面板，就不關 */
  function closeSoon(card) {
    clearTimeout(S.closeT);
    S.closeT = setTimeout(function () {
      if (S.sheet && S.sheet.card === card && S.sheet.kind === 'tuner' && !dirty()) closeSheet();
    }, 1600);
  }
  function dirty() {
    if (!S.tuner || !S.tunerSaved) return false;
    return sig(XC.normalize(S.tuner.value())) !== sig(S.tunerSaved);
  }
  function saveCompanion(payload) {
    return api('/api/companion', payload).then(function (r) {
      if (r.companion) S.tunerSaved = XC.normalize(r.companion);
      if (r.state) accept({ state: r.state, pack: S.pack });
      var name = nameOf();
      if (S.avatar) S.avatar.expr('happy', 1.6);
      S.justSaved = name;   // 面板裡已經有「換好了」；關上面板時頂欄的小二再笑一次、底下說存在哪
      return r;
    }, function (e) {
      if (e.status === 409) {
        var c = e.body && e.body.companion;
        if (c) S.tunerSaved = XC.normalize(c);
        refresh();
        var x = new Error(e.message); x.status = 409; x.companion = c; throw x;
      }
      throw new Error(e.status === 0 ? '連不上經營室，剛剛的改動沒有存。' : e.message);
    });
  }
  function refresh() { return api('/api/state').then(accept, function () { }); }

  /* 經營室裡任何帶 data-xe-open 的東西，都打開調整器 */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-xe-open]');
    if (t && $('#app').contains(t)) { e.preventDefault(); openTuner(); }
  });

  /* ════ 回音 ════ */
  function toast(text) {
    var t = $('#toast');
    t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(S.toastT); S.toastT = setTimeout(function () { t.classList.remove('show'); }, 4200);
  }

  /* ── 開始 ── */
  function boot() {
    shell();
    S.look = lookFrom(null);
    paintAccent(S.look.hue); paintTopbar();
    if (!XC || !V) { viewError(new Error('經營室的畫面沒有載入完整，重新整理一次。')); return; }
    viewLoading();
    start();
  }
  window.XiaoerShell = { openTuner: openTuner, state: function () { return S; } };   // 給經營室的入口與測試用
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
