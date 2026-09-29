/* 脈絡地圖 v3：經營室首頁的峰值（樣張與產品共用同一份）。
   ContextMap.render(root, model, {onSay, mood}) —— 八塊依資料出現；缺的那塊顯示「還在問」，所以訪談中途也畫得出來。
   畫的部分在 ctxviz.js（時間的純函數，影片也用同一份）；這裡只管版面、點擊，還有新資料進來時怎麼長出來：
   新的事實變成星圖上的一顆點飛進去、改過的那一塊從模糊變清楚。靜止時所有內容都看得到。
   視覺語言：docs/design/視覺語言-v3.md */
(function (global) {
  'use strict';
  var V = global.CtxViz, NODES = V.NODES;
  var SRC = { said: '你說的', data: '你的資料', web: '查到的', est: '估的', calc: '算的', youest: '你估的' };
  var STEPS = ['S', 'C', 'A', 'L', 'E'];
  var STEP_NAME = { S: '看清楚你的店', C: '算出最痛的一格', A: '挑一個做法', L: '開一格做兩週', E: '越用越厚' };
  var ST_LABEL = { leak: '最大的洞', hole: '也在漏', rel: '有關', later: '先不做', unknown: '還不知道' };
  var P29 = {
    '找客': ['主動觸及・名單生成', '訪客 × 詢問率 × 漏接% × 客單'],
    '迎客': ['即時接待', '離峰漏接 × 轉換率 × 客單'],
    '成交': ['報價自動化', '報價數 × 每份工時 × 完全成本'],
    '口碑': ['評價蒐集・轉介紹', '滿意客 × 開口率 × 成交率'],
    '養客': ['名單自動培育', '名單 × 升溫率 × 成交率 × 客單'],
    '回客': ['沉睡名單喚回', '未回訪數 × 喚回率 × 客單年值']
  };
  var reduced = function () { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var now = function () { return global.performance ? global.performance.now() : Date.now(); };
  var CLOCK0 = now(), REG = {};
  function clock() { return (now() - CLOCK0) / 1000; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fam(src) { return src === 'calc' || src === 'youest' ? 'est' : src; }
  function g(src) { return src ? '<i class="c3-g ' + esc(fam(src)) + '" title="' + esc(SRC[src] || '') + '"></i>' : ''; }
  function tap(key) { return key ? ' role="button" tabindex="0" data-src="' + esc(key) + '"' : ''; }
  var SAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7.2H7.4L4.6 13v-2.3H2.5z"/></svg>';
  function say(key, dark) { return key ? '<button class="c3-say' + (dark ? ' dark' : '') + '" type="button" data-say="' + esc(key) + '">' + SAY_ICON + '<span>跟助手說</span></button>' : ''; }
  function eyebrow(n, label) { return '<div class="c3-eyebrow"><b>' + n + '</b><span>' + esc(label) + '</span></div>'; }
  function head(n, label, line, key) { return '<header class="c3-head">' + eyebrow(n, label) + '<div class="c3-head-row"><h2>' + esc(line) + '</h2>' + say(key) + '</div></header>'; }
  function wait(n, label, line, name) {
    return '<section class="c3-sec is-wait" data-sec="' + name + '"><header class="c3-head">' + eyebrow(n, label) +
      '<div class="c3-head-row"><h2 class="c3-wait"><span class="c3-dots" aria-hidden="true"><i></i><i></i><i></i></span>' + esc(line) + '</h2></div></header></section>';
  }
  function bracket(s) { return '<div class="c3-bracket"><b>[</b><span>' + esc(s) + '</span><b>]</b></div>'; }
  /* 數字滾動：每一位數是一條 0–9 的直條，靜止時停在正確的數字；第一次看到時才轉一圈到位 */
  function odo(text) {
    text = String(text == null ? '' : text);
    return '<span class="c3-odo"><span class="c3-sr">' + esc(text) + '</span><span class="c3-odo-in" aria-hidden="true">' + text.split('').map(function (ch) {
      if (/\d/.test(ch)) { var col = ''; for (var k = 0; k < 20; k++) col += '<i>' + (k % 10) + '</i>'; return '<span class="c3-dg" data-d="' + ch + '"><span class="ph">0</span><span class="c3-strip" style="transform:translateY(-' + (+ch + 10) + 'em)">' + col + '</span></span>'; }
      if (ch === ' ') return '<span class="c3-sp"></span>';
      var cjk = /[\u3000-\u9fff\uff00-\uffef]/.test(ch), pos = text.search(/\d/);
      return '<span class="c3-ch' + (cjk ? ' cjk ' + (pos < 0 || text.indexOf(ch) < pos ? 'pre' : 'suf') : '') + '">' + esc(ch) + '</span>';
    }).join('') + '</span></span>';
  }
  function leakNode(m) { var ns = (m.flow || {}).nodes || {}; for (var i = 0; i < NODES.length; i++) if ((ns[NODES[i]] || {}).st === 'leak') return NODES[i]; return null; }
  function states(m) { var ns = (m.flow || {}).nodes || {}; return NODES.map(function (n) { return (ns[n] || {}).st || 'unknown'; }); }
  function wonCount(m) { return ((m.map || {}).pins || []).filter(function (p) { return p.st === 'won'; }).length; }

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
    if (k) P('key') && add('key:' + k.label, k.src || 'est', k.kind === 'leak' ? leak : null, k.label + '：' + k.value + (k.unit || ''), k.key);
    var s = m.success; if (s) (s.terms || []).forEach(function (tm, i) { var last = i === s.terms.length - 1; P('success.terms.' + i) && add('succ:' + tm.k, last ? (tm.src || 'calc') : 'said', null, tm.k + '：' + tm.v, last ? tm.key : null); });
    var ti = m.time;
    if (ti) {
      (ti.week || []).forEach(function (x, i) { P('time.week.' + i) && add('time:' + x.n, srcOf(x.key, 'youest'), null, x.n + '：一週 ' + x.h + ' 小時', x.key); });
      if (ti.free) P('time.free') && add('free', ti.free.src, null, ti.free.label, ti.free.key);
      if (ti.handoff) P('time.handoff') && add('hand', ti.handoff.src, null, '一週約 ' + ti.handoff.v + ' 小時可以交給助手', ti.handoff.key);
    }
    NODES.forEach(function (n) { var x = ns[n]; if (x && x.why) P('flow.nodes.' + n) && add('why:' + n, 'said', n, n + '：' + x.why); });
    if (fl && fl.eq) (fl.eq.inputs || []).forEach(function (x, i) { P('flow.eq.inputs.' + i) && add('eq:' + x[0], 'est', leak, x[0] + ' ' + x[1], fl.eq.key); });
    if (fl && fl.funnel) (fl.funnel.rows || []).forEach(function (r, i) { P('flow.funnel.rows.' + i) && add('fun:' + r[0], srcOf(fl.funnel.key, 'data'), leak, r[0] + ' ' + r[1], fl.funnel.key); });
    var o = m.opps;
    if (o) (o.items || []).forEach(function (it, i) {
      var hub = NODES.indexOf(it.node) >= 0 ? it.node : null;
      P('opps.items.' + i) && add('opp:' + it.t, srcOf(it.key, 'est'), hub, it.kind + '：' + it.t, it.key);
      (it.ctx || []).forEach(function (c, j) { P('opps.items.' + i + '.ctx.' + j) && add('ctx:' + c[0], c[1], hub, c[0]); });
    });
    var mp = m.map; if (mp) (mp.pins || []).forEach(function (p, i) { P('map.pins.' + i) && add('pin:' + p.n, p.src || 'web', '找客', p.n + '・' + p.chip, null, i); });
    var da = m.data; if (da) (da.lanes || []).forEach(function (l, li) { (l.items || []).forEach(function (it, j) { P('data.lanes.' + li + '.items.' + j) && add('data:' + it[0], l.cls === 'on' ? 'data' : 'said', null, it[0]); }); });
    var hubs = {}; NODES.forEach(function (n) { hubs[n] = { st: (ns[n] || {}).st || 'unknown' }; });
    var sg = (m.persona || {}).sign, sign = null;   // 本命星座：挑出來的那幾顆星（指不到的就略過）
    if (sg && sg.stars) { var idx = []; sg.stars.forEach(function (p) { var i = at[p]; if (i != null && idx.indexOf(i) < 0) idx.push(i); }); if (idx.length > 1) sign = { name: sg.name, line: sg.line, stars: idx }; }
    return { dots: dots, hubs: hubs, sign: sign, title: '脈絡星圖 / ' + ((m.store || {}).name || ''), loop: (m.scale || {}).loop || 1, step: (m.scale || {}).step || 'S' };
  }

  /* ── 八塊 ── */
  function top(m, opts) {
    var sc = m.scale || {}, step = STEPS.indexOf(sc.step) < 0 ? 'S' : sc.step, idx = STEPS.indexOf(step), st = m.store || {}, brand = opts.brand !== false;
    return '<div class="c3-top' + (brand ? '' : ' nobrand') + '">' + (brand ? '<div class="c3-brand"><canvas class="c3-icon" aria-hidden="true"></canvas><span class="c3-word">經營室</span>' +
      '<span class="c3-store"><b>' + esc(st.name || '你的店') + '</b>' + (st.meta ? '<small>' + esc(st.meta) + '</small>' : '') + '</span></div>' : '') +
      '<div class="c3-scale" title="SCALE：掃描 → 算 → 評估做法 → 開一格 → 越用越厚，做完一圈再轉下一圈"><div class="c3-seg5" role="img" aria-label="SCALE 第 ' + (sc.loop || 1) + ' 圈，現在在 ' + step + '">' +
      STEPS.map(function (k, i) { return '<span class="' + (i < idx ? 'done' : i === idx ? 'on' : '') + '">' + k + '</span>'; }).join('') + '</div>' +
      '<small>' + esc(sc.label || (step + '・' + STEP_NAME[step])) + '<em>第 ' + (sc.loop || 1) + ' 圈</em></small></div>' +
      '<div class="c3-legend" aria-label="點的出處">' + ['said', 'data', 'web', 'est'].map(function (k) { return '<span>' + g(k) + SRC[k] + '</span>'; }).join('') + '</div></div>';
  }

  function hero(m, n) {
    var w = m.who || {}, sign = ((m.persona || {}).sign) || null;
    var facts = (w.facts || []).map(function (f) { return '<span class="c3-chip' + (f.key ? ' tap' : '') + '"' + tap(f.key) + '>' + g(f.src) + esc(f.t) + '</span>'; }).join('');
    return '<section class="c3-sec c3-hero" data-sec="who"><canvas class="c3-star" role="img" aria-label="脈絡星圖：助手知道的 ' + n + ' 件事，每一件是一顆點，點的樣子照出處"></canvas>' +
      '<div class="c3-hero-copy">' + eyebrow('01', '我理解的你') +
      '<h1 class="c3-line">' + esc(w.line || '助手正在認識你的店。') + (w.soft ? '<span class="soft">' + esc(w.soft) + '</span>' : '') + '</h1>' +
      (facts ? '<div class="c3-chips">' + facts + '</div>' : '') +
      (w.fix ? '<div class="c3-fix">' + g(w.fix.src || 'said') + '<span>你改過</span><q>' + esc(w.fix.q) + '</q></div>' : '') +
      (sign ? '<div class="c3-sign"><span class="k"><i></i>本命星座</span><b>' + esc(sign.name) + '</b><span class="l">' + esc(sign.line) + '</span></div>' : '') +
      '<div class="c3-hero-act">' + say('who', true) + '</div></div><div class="c3-tip" hidden></div></section>';
  }

  function flowSec(m) {
    var f = m.flow, k = m.key, st = states(m);
    if (!f) return wait('02', '最大的洞', '第③站會一格一格問，算出最痛的那一格', 'flow');
    var pipeLabel = '客人沿著六格走：' + NODES.map(function (n, i) { return n + '（' + (((f.nodes || {})[n] || {}).s || ST_LABEL[st[i]]) + '）'; }).join('、');
    var pipe = '<canvas class="c3-pipe" role="img" aria-label="' + esc(pipeLabel) + '"></canvas>';
    if (!k) return '<section class="c3-sec" data-sec="flow">' + head('02', '客人怎麼走', f.headline || '六格還在問', 'flow') + '<div class="c3-card c3-pipe-card">' + pipe + '</div></section>';
    var win = k.kind === 'win';
    var kpi = '<div class="c3-kpi' + (k.key ? ' tap' : '') + '"' + tap(k.key) + '>' + bracket(k.label) +
      '<div class="c3-big' + (win ? '' : ' hot') + '">' + odo(k.value) + (k.unit ? '<small>' + esc(k.unit) + '</small>' : '') + '</div>' +
      (k.sub ? '<div class="c3-sub">' + g(k.src) + '<span>' + esc(k.sub) + '</span></div>' : '') + '</div>';
    var fun = f.funnel, vis;
    if (fun) vis = '<div class="c3-vis' + (fun.key ? ' tap' : '') + '"' + tap(fun.key) + '><canvas class="c3-rows" role="img" aria-label="' + esc(fun.rows.map(function (r) { return r[0] + ' ' + r[1]; }).join('，')) + '"></canvas></div>';
    else vis = '<div class="c3-vis">' + pipe + '</div>';
    var html = '<section class="c3-sec" data-sec="flow">' + head('02', win ? '成果' : '最大的洞', f.headline, 'flow') + '<div class="c3-card c3-leak' + (fun ? ' has-rows' : '') + '">' + kpi + vis + '</div>';
    if (fun) html += '<div class="c3-card c3-pipe-card">' + pipe + '</div>';
    if (f.eq) html += '<div class="c3-eq">' + f.eq.inputs.map(function (x, i) { return (i ? '<i class="op" aria-hidden="true">×</i>' : '') + '<div class="c3-factor"><small>' + esc(x[0]) + '</small><b>' + esc(x[1]) + '</b></div>'; }).join('') +
      '<i class="op" aria-hidden="true">＝</i><div class="c3-factor res' + (f.eq.key ? ' tap' : '') + '"' + tap(f.eq.key) + '><small>' + g('est') + '估的</small><b>' + esc(f.eq.res) + '</b></div></div>';
    return html + '</section>';
  }

  var ICON = {
    who: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="10" height="16.5" rx="1.5"/><rect x="13.5" y="9" width="7" height="11.5" rx="1"/><path d="M6.5 8h4M6.5 12h4M6.5 16h4"/></svg>',
    from: '<svg viewBox="0 0 24 24"><path d="M6.6 3.5c1-.7 2.4-.6 2.9.4l1.1 2.4c.4.8-.1 1.6-.7 2l-1 .6c.7 1.8 2.2 3.3 4 4l.6-1c.4-.6 1.2-1 2-.7l2.4 1.1c1 .5 1.1 1.9.4 2.9-1 1.5-3 2.1-4.8 1.3-4-1.8-6.8-4.6-8.6-8.6-.8-1.8-.2-3.8 1.3-4.8z"/></svg>',
    why: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.2l2.8 2.8 5.2-5.6"/></svg>',
    val: '<svg viewBox="0 0 24 24"><path d="M3.5 17.5l6-6 4 3.5 7-8"/><path d="M15.5 7h5v5"/></svg>'
  };
  var ARROW = '<span class="c3-arrow" aria-hidden="true"><svg viewBox="0 0 24 12"><path d="M1 6h20M16 1.5 21 6l-5 4.5"/></svg></span>';
  function success(m) {
    var s = m.success; if (!s) return wait('03', '成功公式', '你的成功故事還沒講，第②站會問', 'success');
    var keys = ['who', 'from', 'why', 'val'];
    return '<section class="c3-sec" data-sec="success">' + head('03', '成功公式', s.headline, 'success') + '<div class="c3-formula">' + (s.terms || []).map(function (tm, i) {
      var val = i === s.terms.length - 1;
      return (i ? ARROW : '') + '<div class="c3-term' + (val ? ' val' : '') + (val && tm.key ? ' tap' : '') + '"' + (val ? tap(tm.key) : '') + '><span class="ic">' + ICON[keys[i] || 'why'] + '</span><small>' + esc(tm.k) + '</small><b>' + esc(tm.v) + '</b>' +
        (val && tm.src ? '<span class="c3-srcline">' + g(tm.src) + esc(SRC[tm.src] || '') + '</span>' : '') + '</div>';
    }).join('') + '</div>' + (s.quote ? '<button class="c3-quote" type="button" data-src="__quote"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5c0-3 1.4-4.8 3.6-5.5M9.5 9.5c0-3 1.4-4.8 3.6-5.5M3 9.5h3v3.5H3zM9.5 9.5h3v3.5h-3z"/></svg>聽他原本怎麼說</button>' : '') + '</section>';
  }

  function time(m) {
    var t = m.time; if (!t) return wait('04', '時間花在哪', '一週的時間還沒問，第②站會問', 'time');
    var week = (t.week || []).filter(function (w) { return w.h > 0; }), total = week.reduce(function (a, b) { return a + b.h; }, 0) || 1, d = t.day || { start: 7, end: 20, busy: [], ticks: [] }, span = (d.end - d.start) || 1;
    var pct = function (h) { return ((h - d.start) / span * 100).toFixed(2) + '%'; };
    var bar = '<div class="c3-weekbar" role="img" aria-label="一週 ' + total + ' 小時：' + esc(week.map(function (w) { return w.n + ' ' + w.h; }).join('、')) + '">' + week.map(function (w) {
      return '<span class="c3-seg ' + esc(w.cls || '') + (w.key ? ' tap' : '') + '" style="flex:' + w.h + '"' + tap(w.key) + ' title="' + esc(w.n + ' ' + w.h + ' 小時') + '">' + (w.h / total >= .14 ? '<b>' + esc(w.n) + '</b><span>' + w.h + '</span>' : '') + '</span>';
    }).join('') + '</div><div class="c3-wlegend">' + week.map(function (w) { return '<span class="' + esc(w.cls || '') + '"><i></i>' + esc(w.n) + '<em>' + w.h + '</em></span>'; }).join('') + '</div>';
    var day = t.free ? '<div class="c3-day"><div class="c3-track">' + (d.busy || []).map(function (b) { return '<i style="left:' + pct(b[0]) + ';width:' + ((b[1] - b[0]) / span * 100).toFixed(2) + '%"></i>'; }).join('') +
      '<em style="left:' + pct(t.free.from) + ';width:' + ((t.free.to - t.free.from) / span * 100).toFixed(2) + '%"></em></div>' +
      '<div class="c3-ticks">' + (d.ticks || []).map(function (h) { return '<span style="left:' + pct(h) + '">' + String(h).padStart(2, '0') + '</span>'; }).join('') + '</div>' +
      '<div class="c3-cap' + (t.free.key ? ' tap' : '') + '"' + tap(t.free.key) + '>' + g(t.free.src) + '<span>' + esc(t.free.label) + '</span></div></div>' : '';
    var h = t.handoff || {};
    return '<section class="c3-sec" data-sec="time">' + head('04', '時間花在哪', t.headline, 'time') + '<div class="c3-card c3-time">' +
      '<div class="c3-kpi' + (h.key ? ' tap' : '') + '"' + tap(h.key) + '>' + bracket('一週可以交給助手') + '<div class="c3-big mid">' + odo(h.v) + '<small>小時</small></div><div class="c3-sub">' + g(h.src) + '<span>一週一共 ' + total + ' 小時</span></div></div>' +
      '<div class="c3-timevis">' + bar + day + '</div></div></section>';
  }

  function opps(m) {
    var o = m.opps; if (!o) return wait('05', '三個機會', '洞找到之後，這裡會長出三個機會', 'opps');
    return '<section class="c3-sec" data-sec="opps">' + head('05', '三個機會', o.headline, 'opps') +
      '<div class="c3-goal"><span class="c3-pill">目標</span><b>' + esc(o.goal) + '</b>' + (o.bounds ? '<small>' + esc(o.bounds) + '</small>' : '') + '</div>' +
      '<div class="c3-opps">' + (o.items || []).map(function (it, i) {
        return '<article class="c3-card c3-opp' + (it.vcls === 'leak' ? ' hot' : '') + '"><header><span class="c3-kind">' + esc(it.kind) + '</span><span class="c3-node">' + esc(it.node || '') + '</span><span class="c3-idx">0' + (i + 1) + '</span></header>' +
          '<p>' + esc(it.t) + '</p><div class="c3-val' + (it.key ? ' tap' : '') + '"' + tap(it.key) + '>' + esc(it.v) + '</div>' +
          ((it.ctx || []).length ? '<ul>' + it.ctx.map(function (c) { return '<li>' + g(c[1]) + '<span>' + esc(c[0]) + '</span></li>'; }).join('') + '</ul>' : '') + '</article>';
      }).join('') + '</div>' +
      (o.learned ? '<div class="c3-learned"><div class="c3-eyebrow"><span>這一圈學到的</span></div><ol>' + o.learned.map(function (l, i) { return '<li><b>' + String(i + 1).padStart(2, '0') + '</b><div><strong>' + esc(l[0]) + '</strong><span>' + esc(l[1]) + '</span></div></li>'; }).join('') + '</ol></div>' : '') + '</section>';
  }

  function mapSec(m) {
    var mp = m.map; if (!mp) return wait('06', '附近', '找客的名單，會在地圖上長出來', 'map');
    return '<section class="c3-sec" data-sec="map">' + head('06', '附近', mp.headline, 'map') + '<div class="c3-card c3-map"><div class="c3-mapbox"><canvas class="c3-radar" role="img" aria-label="' + esc('店的步行圈與附近的 ' + mp.pins.length + ' 個對象') + '"></canvas></div>' +
      '<div class="c3-pins">' + (mp.cond ? '<p class="c3-cond">' + g(mp.cond_src || 'web') + '<span>' + esc(mp.cond) + '</span></p>' : '') + '<div class="c3-pinlist">' +
      mp.pins.map(function (p, i) { return '<button type="button" data-pin="' + i + '"><i class="c3-pm ' + esc(p.st) + '"></i><span>' + esc(p.n) + '</span><em class="c3-state ' + esc(p.st) + '">' + esc(p.chip) + '</em></button>'; }).join('') + '</div></div></div></section>';
  }

  function data(m) {
    var d = m.data; if (!d) return wait('07', '資料', '你手上有哪些資料，第①站會一起看', 'data');
    return '<section class="c3-sec" data-sec="data">' + head('07', '資料', d.headline, 'data') + '<div class="c3-lanes">' + (d.lanes || []).map(function (l) {
      return '<div class="c3-card c3-lane ' + esc(l.cls) + '"><h3><i></i>' + esc(l.title) + '<span>' + l.items.length + '</span></h3>' + (l.items.length ? '<div class="c3-items">' + l.items.map(function (it) { return '<span>' + esc(it[0]) + '</span>'; }).join('') + '</div>' : '<p class="c3-empty">還沒問到</p>') + '</div>';
    }).join('') + '</div></section>';
  }

  function rcState(rc) { if (!rc || /還沒/.test(rc)) return ['todo', '還沒排']; if (/示意/.test(rc)) return ['demo', '示意']; return ['on', '排好了']; }
  function next(m) {
    var n = m.next; if (!n) return wait('08', '這一週', '訪談結束前，我們一起定第一件事', 'next');
    var days = ['一', '二', '三', '四', '五', '六', '日'], r = n.rhythm || {}, on = r.on || [], rs = rcState(r.rc);
    return '<section class="c3-sec" data-sec="next">' + head('08', '這一週', n.headline, 'next') + '<div class="c3-next">' +
      '<div class="c3-card c3-cal"><div class="c3-days" style="--cols:' + days.map(function (dn, i) { return on.indexOf(i) >= 0 ? 'minmax(0,2.6fr)' : 'minmax(0,1fr)'; }).join(' ') + '">' + days.map(function (dn, i) {
        var hit = on.indexOf(i) >= 0;
        return '<div class="c3-daycol' + (hit ? ' on' : '') + '"><span class="dn">週' + dn + '</span>' + (hit ? '<div class="c3-evt"><small>每週</small><b>' + esc(r.cap || '') + '</b><em class="c3-state ' + rs[0] + '">' + rs[1] + '</em></div>' : '') + '</div>';
      }).join('') + '</div>' + (r.rc ? '<p class="c3-rc">' + esc(r.rc) + '</p>' : '') + '</div>' +
      '<div class="c3-card c3-task"><small>' + esc((n.task || {}).k) + '</small><b>' + esc((n.task || {}).t) + '</b>' +
      ((n.task || {}).draft ? '<div class="c3-bubble"><div class="to">' + esc(n.task.to || '') + '</div><p>' + esc(n.task.draft) + '</p></div><p class="c3-hint">草稿。你在對話裡說「可以送」，它才會送出。</p>' : '') + '</div></div></section>';
  }

  /* 地圖：黑白步行圈；公司是圓點、訂過的是方塊、成交的是橘色；中間的黑方塊是你的店 */
  function radar(ctx, w, h, t, m, sel, theme, accent) {
    var mp = m.map, P = Object.assign({}, V.THEME[theme || 'light'], accent ? { accent: accent } : {}), cx = w / 2, cy = h / 2, far = 400;
    (mp.pins || []).forEach(function (p) { far = Math.max(far, Math.hypot((p.lng - mp.center.lng) * 100530, (p.lat - mp.center.lat) * 111000)); });
    var k = Math.min(w, h) / 2 * .84 / far;   // 比例尺跟著最遠的那一家走；步行圈照真實距離畫，畫不下的那圈只露出一段
    ctx.fillStyle = P.line; for (var gx = 12; gx < w; gx += 20) for (var gy = 12; gy < h; gy += 20) ctx.fillRect(gx, gy, 1.2, 1.2);
    ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.strokeStyle = P.ink3;
    [400, 800].forEach(function (mm) { ctx.beginPath(); ctx.arc(cx, cy, mm * k, 0, Math.PI * 2); ctx.stroke(); });
    ctx.setLineDash([]); ctx.font = '500 10.5px ' + V.MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [[400, '5 分・400 m'], [800, '10 分・800 m']].forEach(function (r) { if (cy - r[0] * k < 10) return; var y = cy - r[0] * k, tw = ctx.measureText(r[1]).width + 12; ctx.fillStyle = P.surface; V.rr(ctx, cx - tw / 2, y - 8, tw, 16, 8); ctx.fill(); ctx.fillStyle = P.ink3; ctx.fillText(r[1], cx, y + .5); });
    ctx.textBaseline = 'alphabetic';
    var ph = (t % 3.6) / 3.6; ctx.strokeStyle = P.ink; ctx.globalAlpha = (1 - ph) * .28; ctx.beginPath(); ctx.arc(cx, cy, 800 * k * ph, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = P.ink; V.rr(ctx, cx - 8, cy - 8, 16, 16, 4); ctx.fill();
    ctx.font = '600 12.5px ' + V.FONT; ctx.textAlign = 'center'; ctx.fillText((m.store || {}).name || '你的店', cx, cy + 27);
    (mp.pins || []).forEach(function (p, i) {
      var X = cx + (p.lng - mp.center.lng) * 100530 * k, Y = cy - (p.lat - mp.center.lat) * 111000 * k, on = sel === i;
      ctx.lineWidth = 1.6;
      if (p.st === 'past') { ctx.fillStyle = P.surface; ctx.strokeStyle = P.ink; ctx.fillRect(X - 5.5, Y - 5.5, 11, 11); ctx.strokeRect(X - 5.5, Y - 5.5, 11, 11); }
      else {
        if (p.st === 'won') { var q = ((t * .6) % 1 + 1) % 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.globalAlpha = (1 - q) * .8; ctx.beginPath(); ctx.arc(X, Y, 7 + q * 14, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.6; }
        ctx.beginPath(); ctx.arc(X, Y, 6, 0, Math.PI * 2); ctx.fillStyle = p.st === 'won' ? P.accent : p.st === 'going' ? P.ink : P.surface; ctx.fill();
        ctx.strokeStyle = p.st === 'won' ? P.accent : p.st === 'todo' ? P.ink3 : P.ink; ctx.stroke();
      }
      if (on) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X, Y, 13, 0, Math.PI * 2); ctx.stroke(); }
      ctx.font = (on ? '600 ' : '500 ') + '12px ' + V.FONT; ctx.fillStyle = p.st === 'todo' && !on ? P.ink2 : P.ink; ctx.textAlign = X >= cx ? 'left' : 'right'; ctx.fillText(p.n, X + (X >= cx ? 12 : -12), Y + 4);
    });
  }

  function drawer(root, s) {
    var old = root.querySelector('.c3-drawer'); if (old) old.remove(); if (!s) return;
    var d = document.createElement('div'); d.className = 'c3-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', s.title || '出處');
    d.innerHTML = '<div class="dh"><b></b><button type="button" data-close="1" aria-label="關閉"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' + (s.value ? '<div class="dv"></div>' : '') + '<div class="db"></div>' + (s.src ? '<div class="ds">' + g(s.src) + '出處：' + esc(SRC[s.src] || s.src) + '</div>' : '');
    d.querySelector('.dh b').textContent = s.title || ''; if (s.value) d.querySelector('.dv').textContent = s.value; d.querySelector('.db').textContent = s.body || '';
    root.appendChild(d); d.querySelector('[data-close]').focus({ preventScroll: true });
  }
  function toast(root, text) { var t = root.querySelector('.c3-toast'); if (!t) { t = document.createElement('div'); t.className = 'c3-toast'; t.setAttribute('role', 'status'); root.appendChild(t); } t.textContent = text; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 2400); }
  function nodeSource(m, n) {
    var nd = ((m.flow || {}).nodes || {})[n] || {}, p = P29[n];
    var body = (nd.why ? nd.why + '\n\n' : '') + '這一格：' + p[0] + '\n算式（簡報 P29）：' + p[1] + (nd.more ? '\n\n' + nd.more : '');
    var tac = (m.tactics || {})[n];
    if (tac && tac.length) body += '\n\n做法（課程包）：\n' + tac.slice(0, 3).map(function (x, i) { return (i + 1) + '. ' + x.name + '：' + (x.what || ''); }).join('\n') + (tac.length > 3 ? '\n……還有 ' + (tac.length - 3) + ' 條，跟助手說「這一格有哪些做法」' : '');
    else if (m.packed === false) body += '\n\n這一格有哪些做法：輸入課程碼、裝好課程包就會出現。';
    return { title: n + '・' + ST_LABEL[nd.st || 'unknown'], value: nd.value || '', src: nd.src || (nd.st === 'leak' ? 'est' : 'said'), body: body };
  }

  function render(root, model, opts) {
    opts = opts || {};
    if (root._cm) root._cm.destroy();
    var storeName = (model.store || {}).name || '', reg = REG[storeName] || (REG[storeName] = { born: {}, sig: {}, painted: false, winAt: null });
    var first = !reg.painted, t = clock(), live = !first && !reduced();
    if (model.success && model.success.quote) { model.sources = model.sources || {}; model.sources.__quote = { title: '他原本怎麼說', src: 'said', body: model.success.quote }; }
    // 星圖的點：新的事實記下出生時間，一顆一顆飛進去；已經不在的點從紀錄拿掉，回來時再飛一次
    var gr = graphOf(model), fresh = 0, keep = {};
    gr.dots.forEach(function (d) { keep[d.id] = 1; if (reg.born[d.id] == null) reg.born[d.id] = first ? -99 : t + .3 + (fresh++) * .05; d.born = reg.born[d.id]; });
    Object.keys(reg.born).forEach(function (id) { if (!keep[id]) delete reg.born[id]; });
    var freshTo = t + .3 + fresh * .05 + .8;
    if (model.key && model.key.kind === 'win') { if (reg.winAt == null) reg.winAt = first ? -99 : t + .5; } else reg.winAt = null;
    root.classList.add('c3');
    var theme = 'light', mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
    var readTheme = function () { try { theme = global.getComputedStyle(root).getPropertyValue('--c3-mode').trim() === 'dark' ? 'dark' : 'light'; } catch (e) { theme = 'light'; } };
    var per = model.persona || {}, H = V.hue(per.hue);
    var paint = function () { root.style.setProperty('--c3-accent', H.accent); root.style.setProperty('--c3-accent-ink', theme === 'dark' ? H.darkText : H.text); root.style.setProperty('--c3-accent-soft', theme === 'dark' ? H.darkSoft : H.soft); root.style.setProperty('--c3-accent-strong', H.text); root.style.setProperty('--c3-on-accent', H.on); };
    var onTheme = function () { readTheme(); paint(); };
    onTheme(); if (mq && mq.addEventListener) mq.addEventListener('change', onTheme);
    var acc = function () { return { accent: H.accent, accentText: theme === 'dark' ? H.darkText : H.text, onAccent: H.on }; };
    root.innerHTML = top(model, opts) + '<div class="c3-body">' + hero(model, gr.dots.length) + flowSec(model) + success(model) + time(model) + opps(model) + mapSec(model) + data(model) + next(model) + '</div>';
    // 改過的那一塊：從模糊變清楚
    ['who', 'flow', 'success', 'time', 'opps', 'map', 'data', 'next'].forEach(function (k) {
      var sig = JSON.stringify(k === 'flow' ? [model.flow || null, model.key || null] : model[k] || null);
      if (live && reg.sig[k] != null && reg.sig[k] !== sig) { var el = root.querySelector('[data-sec="' + k + '"]'); if (el) el.classList.add('c3-swap'); }
      reg.sig[k] = sig;
    });
    reg.painted = true;
    function mood(tt) {
      if (opts.mood) return opts.mood;
      if (reg.winAt != null && tt >= reg.winAt && tt - reg.winAt < 3.2) return 'happy';
      if (fresh && tt >= t + .3 && tt < freshTo) return 'wow';
      return model.key ? 'idle' : 'listen';
    }
    var loops = [], ios = [], sel = { pin: null };
    var icon = root.querySelector('.c3-icon');
    if (icon) loops.push(V.animate(icon, function (ctx, w, h) { V.appIcon(ctx, 0, 0, Math.min(w, h), clock(), { seed: 2, state: mood(clock()) === 'listen' ? 'listen' : 'idle', bg: H.accent, col: H.on, style: per.eyes }); }));
    // 星圖：滑到哪一顆點，眼睛就看哪裡；滑到哪一格，那一格的點亮起來
    var heroEl = root.querySelector('.c3-hero'), star = root.querySelector('.c3-star'), tip = root.querySelector('.c3-tip'), hover = -1, hoverHub = null, api = null;
    if (star) {
      var lay = { w: 0, h: 0, right: 0 };
      var copyRight = function (w, h) {
        if (lay.w === w && lay.h === h) return lay.right;
        var hr = heroEl.getBoundingClientRect(), right = 0, rg = document.createRange();
        [].forEach.call(heroEl.querySelectorAll('.c3-hero-copy .c3-eyebrow, .c3-line, .c3-chip, .c3-fix, .c3-say'), function (el) {
          var r; if (el.classList.contains('c3-line')) { rg.selectNodeContents(el); r = rg.getBoundingClientRect(); } else r = el.getBoundingClientRect();
          if (r.width) right = Math.max(right, r.right - hr.left);
        });
        lay = { w: w, h: h, right: right }; return right;
      };
      loops.push(V.animate(star, function (ctx, w, h) {
        var side = w >= 900 && w / h > 1.4, narrow = w < 460, orx = side ? 1.42 : narrow ? 1.32 : 1.55, cx, cy, R;
        if (side) { var L = copyRight(w, h) + 40, Rt = w - 44; R = Math.max(h * .2, Math.min(h * .31, (Rt - L - 72) / (2 * orx))); cx = (L + Rt) / 2 / w; cy = .5; }
        else { var area = Math.min(h, 420); R = Math.min(w, area) * .3; cx = .5; cy = (area / 2) / h; }
        api = V.constellation(ctx, 0, 0, w, h, clock(), gr, { frame: false, cx: cx, cy: cy, radius: R / Math.min(w, h), orbitRx: orx, eyeScale: 1.25, eyeStyle: per.eyes, accent: H.stage, hover: hover, hoverHub: hoverHub, state: mood(clock()), hubScale: narrow ? .86 : 1 });
      }));
      var place = function (px, py) { var r = heroEl.getBoundingClientRect(); tip.style.left = Math.max(12, Math.min(r.width - 284, px + 18)) + 'px'; tip.style.top = Math.max(12, py - 70) + 'px'; };
      var move = function (e) {
        if (!api) return;
        var r = star.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, i = api.pick(px, py), hb = i < 0 ? api.pickHub(px, py) : null;
        hover = i; hoverHub = hb; star.style.cursor = i >= 0 || hb ? 'pointer' : '';
        if (i >= 0) { var d = gr.dots[i]; tip.innerHTML = '<div class="k">' + g(d.src) + esc(SRC[d.src] || '') + (d.hub ? '<em>' + esc(d.hub) + '</em>' : '') + '</div><div class="v"></div>'; tip.querySelector('.v').textContent = d.label; tip.hidden = false; place(px, py); }
        else if (hb) { var nd = ((model.flow || {}).nodes || {})[hb] || {}; tip.innerHTML = '<div class="k"><b>' + esc(hb) + '</b><em>' + esc(ST_LABEL[nd.st || 'unknown']) + '</em></div><div class="v"></div>'; tip.querySelector('.v').textContent = nd.why || '還不知道，訪談會問到'; tip.hidden = false; place(px, py); }
        else tip.hidden = true;
      };
      star.addEventListener('pointermove', move); star.addEventListener('pointerdown', move);
      star.addEventListener('pointerleave', function () { hover = -1; hoverHub = null; tip.hidden = true; });
      star.addEventListener('click', function (e) {
        move(e);
        if (hoverHub) { drawer(root, nodeSource(model, hoverHub)); return; }
        if (hover >= 0) { var d = gr.dots[hover]; if (d.pin != null) openPin(d.pin); else if (d.key && (model.sources || {})[d.key]) drawer(root, model.sources[d.key]); }
      });
    }
    // 六格：客人一直在走；點一格看那一格的算式與做法
    var st = states(model), labels = {};
    NODES.forEach(function (n, i) { labels[n] = (((model.flow || {}).nodes || {})[n] || {}).s || (model.key ? '' : ST_LABEL[st[i]]); });
    [].forEach.call(root.querySelectorAll('.c3-pipe'), function (cv) {
      var hits = [], hov = -1;
      loops.push(V.animate(cv, function (ctx, w, h) { hits = V.pipeline(ctx, 0, 0, w, h, clock(), st, Object.assign({ labels: labels, vertical: h > w * .7, hover: hov, theme: theme }, acc())) || []; }));
      var which = function (e) { var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = -1, bd = 1e9; hits.forEach(function (hh, i) { var dd = Math.hypot(hh.x - x, hh.y - y); if (dd < hh.r + 12 && dd < bd) { bd = dd; best = i; } }); return best; };
      cv.addEventListener('pointermove', function (e) { hov = which(e); cv.style.cursor = hov >= 0 ? 'pointer' : ''; });
      cv.addEventListener('pointerleave', function () { hov = -1; });
      cv.addEventListener('click', function (e) { var i = which(e); if (i >= 0) drawer(root, nodeSource(model, NODES[i])); });
    });
    // 點陣漏斗：第一次看到時從頭排一次，靜止時是完整的每一步
    var rowsCv = root.querySelector('.c3-rows'), fun = (model.flow || {}).funnel;
    if (rowsCv && fun) { var playAt = null, won = wonCount(model); loops.push(V.animate(rowsCv, function (ctx, w, h, lt) { V.dotRows(ctx, 0, 0, w, h, lt, fun.rows, Object.assign({ won: won, t0: playAt == null ? -99 : playAt, cell: 20, theme: theme }, acc())); }, { onSeen: function (lt) { playAt = lt + .35; } })); }
    var rd = root.querySelector('.c3-radar');
    if (rd && model.map) loops.push(V.animate(rd, function (ctx, w, h) { radar(ctx, w, h, clock(), model, sel.pin, theme, H.accent); }));
    // 數字：第一次進到畫面時才轉到位（要確定畫面真的在動，才把數字歸零再轉，靜止的環境永遠看到正確的數字）
    if (!reduced() && 'IntersectionObserver' in global) {
      global.requestAnimationFrame(function () {
        var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; io.unobserve(e.target); roll(e.target); }); }, { threshold: .6 });
        [].forEach.call(root.querySelectorAll('.c3-odo'), function (el) { io.observe(el); }); ios.push(io);
      });
    }
    function roll(el) {
      [].forEach.call(el.querySelectorAll('.c3-strip'), function (s, i) {
        var d = +s.parentNode.getAttribute('data-d'); s.style.transition = 'none'; s.style.transform = 'translateY(0)'; void s.offsetHeight;
        s.style.transition = 'transform ' + (1.1 + i * .16).toFixed(2) + 's cubic-bezier(.16,.84,.24,1) ' + (i * .07).toFixed(2) + 's'; s.style.transform = 'translateY(-' + (d + 10) + 'em)';
      });
    }
    function openPin(i) {
      var p = model.map.pins[i]; sel.pin = sel.pin === i ? null : i;
      [].forEach.call(root.querySelectorAll('[data-pin]'), function (b) { b.classList.toggle('on', +b.getAttribute('data-pin') === sel.pin); });
      drawer(root, sel.pin === null ? null : { title: p.n, value: p.chip, src: p.src || 'web', body: p.note || '' });
    }
    function onClick(e) {
      var el = e.target; if (!el || !el.closest) return;
      if (el.closest('[data-close]')) { drawer(root, null); return; }
      var sy = el.closest('[data-say]');
      if (sy) {
        var key = sy.getAttribute('data-say'), text = (model.say || {})[key] || ('【脈絡地圖】' + key + '：');
        if (opts.onSay) { opts.onSay(text, key); return; }
        var ok = function () { toast(root, '已複製，貼到對話裡接著說'); }, fail = function () { toast(root, '直接在對話裡說：' + text); };
        try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fail); else fail(); } catch (x) { fail(); }
        return;
      }
      var pin = el.closest('[data-pin]'); if (pin) { openPin(+pin.getAttribute('data-pin')); return; }
      var hit = el.closest('[data-src]'); if (hit) drawer(root, (model.sources || {})[hit.getAttribute('data-src')]);
    }
    function onKey(e) {
      if (e.key === 'Escape') { drawer(root, null); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-src]') && e.target.tagName !== 'BUTTON') { e.preventDefault(); onClick({ target: e.target }); }
    }
    root.addEventListener('click', onClick); root.addEventListener('keydown', onKey);
    root._cm = { destroy: function () { if (mq && mq.removeEventListener) mq.removeEventListener('change', onTheme); loops.forEach(function (l) { l.stop(); }); ios.forEach(function (io) { io.disconnect(); }); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root._cm = null; } };
    return root._cm;
  }

  global.ContextMap = { render: render, graphOf: graphOf, NODES: NODES, P29: P29 };
})(typeof window !== 'undefined' ? window : this);
