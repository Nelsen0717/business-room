/* 脈絡地圖：經營室首頁的峰值。樣張與產品共用。
   ContextMap.render(root, model, {onSay}) 依 model 畫出八塊；缺的那塊顯示「還在問」，所以訪談中途也畫得出來。
   動態只負責帶眼睛：客人沿六格流動、在洞掉下去；數字跳到位；地圖雷達掃一圈、公司落點。系統設定「減少動態」時全部靜止。 */
(function (global) {
  'use strict';
  var NODES = ['找客', '迎客', '成交', '口碑', '養客', '回客'];
  var P29 = {
    '找客': ['主動觸及・名單生成', '訪客 × 詢問率 × 漏接% × 客單'],
    '迎客': ['即時接待', '離峰漏接 × 轉換率 × 客單'],
    '成交': ['報價自動化', '報價數 × 每份工時 × 完全成本'],
    '口碑': ['評價蒐集・轉介紹', '滿意客 × 開口率 × 成交率'],
    '養客': ['名單自動培育', '名單 × 升溫率 × 成交率 × 客單'],
    '回客': ['沉睡名單喚回', '未回訪數 × 喚回率 × 客單年值']
  };
  var SRC = { said: '你說的', data: '你的資料', web: '查到的', est: '估的', calc: '算的', youest: '你估的' };
  var STEPS = ['S', 'C', 'A', 'L', 'E'];
  var STEP_NAME = { S: '掃描', C: '算', A: '評估做法', L: '開一格', E: '越用越厚' };
  var reduced = function () { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dot(src) { return src ? '<span class="cm-dot ' + esc(src) + '" title="' + esc(SRC[src] || '') + '" aria-label="' + esc(SRC[src] || '') + '"></span>' : ''; }
  function src(key) { return key ? ' role="button" tabindex="0" data-src="' + esc(key) + '"' : ''; }
  function cls(base, key) { return ' class="' + base + (key ? ' cm-tap' : '') + '"'; }
  function head(i, label, headline, say) {
    return '<header class="cm-h"><div class="i">' + i + '<em>' + esc(label) + '</em></div><h2>' + esc(headline) + '</h2>' +
      (say ? '<button class="cm-say" type="button" data-say="' + esc(say) + '">跟助手說</button>' : '') + '</header>';
  }
  function waiting(i, label, text) {
    return '<section class="cm-sec is-wait" data-sec="' + esc(label) + '">' + head(i, label, text || '還在問，等一下補上', null).replace('<h2>', '<h2 class="cm-wait"><i><b></b><b></b><b></b></i>') + '</section>';
  }

  /* 頂端：店名、SCALE 閉環、出處圖例 */
  function top(m) {
    var sc = m.scale || { step: 'S', loop: 1 };
    var idx = Math.max(0, STEPS.indexOf(sc.step));
    var arcs = '';
    for (var i = 0; i < 5; i++) {
      var a0 = (-90 + i * 72 + 5) * Math.PI / 180, a1 = (-90 + (i + 1) * 72 - 5) * Math.PI / 180, r = 17;
      var x0 = 22 + r * Math.cos(a0), y0 = 22 + r * Math.sin(a0), x1 = 22 + r * Math.cos(a1), y1 = 22 + r * Math.sin(a1);
      arcs += '<path class="arc' + (i < idx ? ' done' : i === idx ? ' now' : '') + '" d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A17 17 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + '"/>';
    }
    var ring = '<svg viewBox="0 0 44 44" aria-hidden="true">' + arcs +
      '<g class="spin"><circle cx="22" cy="5" r="2.4" fill="var(--cm-accent)"/></g>' +
      '<text x="22" y="25.5" text-anchor="middle" style="font-size:10px;font-weight:700;fill:var(--cm-ink)">' + STEPS[idx] + '</text></svg>';
    return '<div class="cm-top"><div class="cm-store"><b>' + esc((m.store || {}).name || '') + '</b><span>' + esc((m.store || {}).meta || '') + '</span></div>' +
      '<div class="cm-scale" title="SCALE：掃描 → 算 → 評估做法 → 開一格 → 越用越厚，做完一圈再開下一格">' + ring +
      '<div class="t"><b>' + esc(sc.label || (STEPS[idx] + '・' + STEP_NAME[STEPS[idx]])) + '</b><span>SCALE 第 ' + (sc.loop || 1) + ' 圈</span></div></div>' +
      '<div class="cm-legend" aria-label="出處">' + ['said', 'data', 'web', 'est'].map(function (k) { return '<span>' + dot(k) + SRC[k] + '</span>'; }).join('') + '</div></div>';
  }

  /* 01 我理解的你＋最重要的一個數字 */
  function hero(m) {
    var w = m.who || {};
    var facts = (w.facts || []).map(function (f, i) {
      return '<span' + cls('cm-fact cm-in', f.key) + ' style="animation-delay:' + (0.25 + i * 0.08).toFixed(2) + 's"' + src(f.key) + '>' + dot(f.src) + esc(f.t) + '</span>';
    }).join('');
    var fix = w.fix ? '<div class="cm-fix cm-in" style="animation-delay:.5s">' + dot(w.fix.src) + '你改過：<q>' + esc(w.fix.q) + '</q></div>' : '';
    var k = m.key, keyHtml;
    if (k) {
      keyHtml = '<div' + cls('cm-key' + (k.kind === 'win' ? ' win' : '') + ' cm-in', k.key) + ' style="animation-delay:.35s"' + src(k.key) + '>' +
        '<div class="k">' + dot(k.src) + esc(k.label) + '</div>' +
        '<div class="v cm-num"><span data-count="' + esc(k.count != null ? k.count : '') + '" data-dec="' + (k.dec || 0) + '">' + esc(k.value) + '</span><small>' + esc(k.unit || '') + '</small></div>' +
        '<div class="u"></div><div class="s">' + esc(k.sub || '') + '</div></div>';
    } else {
      keyHtml = '<div class="cm-key"><div class="k">最痛的那一格</div><div class="cm-wait" style="margin-top:12px"><i><b></b><b></b><b></b></i>第③站會算出來</div></div>';
    }
    return '<section class="cm-sec" data-sec="who"><div class="cm-hero"><div>' +
      '<div class="cm-h" style="margin-bottom:10px"><div class="i">01<em>我理解的你</em></div><span style="flex:1"></span><button class="cm-say" type="button" data-say="who">跟助手說</button></div>' +
      '<p class="line cm-in">' + esc(w.line || '') + (w.soft ? '<span class="soft">' + esc(w.soft) + '</span>' : '') + '</p>' +
      '<div class="cm-facts">' + facts + '</div>' + fix + '</div>' + keyHtml + '</div></section>';
  }

  /* 02 客人怎麼走 */
  var FX = [90, 246, 402, 558, 714, 870], FY = 92;
  function flow(m) {
    var f = m.flow;
    if (!f) return waiting('02', '客人怎麼走', '六格還在問：只問跟你有關的，做得好的先不做');
    var svg = '<svg viewBox="0 0 960 190" role="img" aria-label="客人沿著六格走：' + NODES.map(function (n) { return n + (f.nodes[n] && f.nodes[n].s ? '（' + f.nodes[n].s + '）' : ''); }).join('、') + '">' +
      '<path class="rail" d="M24 ' + FY + ' H948"/><path d="M940 ' + (FY - 5) + ' L948 ' + FY + ' L940 ' + (FY + 5) + '" fill="none" stroke="var(--cm-line2)" stroke-width="2"/>' +
      '<text class="end" x="950" y="' + (FY + 26) + '" text-anchor="end">營業額</text><g class="dots"></g>';
    NODES.forEach(function (n, i) {
      var st = (f.nodes[n] || {}).st || 'unknown', s = (f.nodes[n] || {}).s || (st === 'unknown' ? '還不知道' : '');
      svg += '<g class="node ' + st + '" tabindex="0" role="button" data-node="' + n + '" aria-label="' + n + '：' + esc(s) + '">' +
        (st === 'leak' || st === 'hole' ? '<circle class="pulse" cx="' + FX[i] + '" cy="' + FY + '" r="34"/>' : '') +
        '<circle class="b" cx="' + FX[i] + '" cy="' + FY + '" r="34"/><text class="n" x="' + FX[i] + '" y="' + (FY + 6) + '">' + n + '</text>' +
        '<text class="s" x="' + FX[i] + '" y="' + (FY + 64) + '">' + esc(s) + '</text></g>';
    });
    svg += '</svg>';
    var eq = '';
    if (f.eq) {
      eq = '<div class="cm-eq">' + f.eq.inputs.map(function (x, i) { return (i ? '<span class="op">×</span>' : '') + '<div class="f cm-in" style="animation-delay:' + (0.1 + i * 0.1).toFixed(2) + 's"><span class="l">' + esc(x[0]) + '</span><span class="x">' + esc(x[1]) + '</span></div>'; }).join('') +
        '<span class="op">＝</span><div' + cls('f res cm-in', f.eq.key) + ' style="animation-delay:.55s"' + src(f.eq.key) + '><span class="l">' + dot('est') + ' 估的</span><span class="x">' + esc(f.eq.res) + '</span></div></div>';
    }
    var fun = '';
    if (f.funnel) {
      var max = Math.max.apply(null, f.funnel.rows.map(function (r) { return r[1]; }));
      fun = '<div' + cls('cm-funnel', f.funnel.key) + src(f.funnel.key) + '>' + f.funnel.rows.map(function (r, i) {
        return '<div class="c"><span class="n cm-num" data-count="' + r[1] + '">' + r[1] + '</span><div class="bar" style="height:' + Math.round(10 + 70 * r[1] / max) + 'px;animation-delay:' + (i * 0.12).toFixed(2) + 's"></div><span class="l">' + esc(r[0]) + '</span></div>';
      }).join('') + '</div>';
    }
    return '<section class="cm-sec" data-sec="flow">' + head('02', '客人怎麼走', f.headline, 'flow') + '<div class="cm-flow">' + svg + '</div>' + eq + fun + '</section>';
  }

  /* 03 成功公式 */
  var ICONS = {
    who: '<svg class="ic" viewBox="0 0 34 34"><rect x="6" y="8" width="14" height="20" rx="1.5"/><rect x="20" y="14" width="8" height="14" rx="1"/><path d="M10 13h2M14 13h2M10 18h2M14 18h2M10 23h2M14 23h2"/></svg>',
    from: '<svg class="ic" viewBox="0 0 34 34"><path d="M9 7c1.5-1 3.5-1 4.3.6l1.6 3.4c.5 1-.1 2.2-1 2.8l-1.4.9c1 2.6 3.2 4.8 5.8 5.8l.9-1.4c.6-.9 1.8-1.5 2.8-1l3.4 1.6c1.6.8 1.6 2.8.6 4.3-1.5 2.2-4.4 3-6.9 1.9C13.6 24.4 9.6 20.4 7.1 14c-1.1-2.5-.3-5.4 1.9-7z"/></svg>',
    why: '<svg class="ic" viewBox="0 0 34 34"><circle cx="17" cy="17" r="11"/><path d="M11.5 17.5l3.8 3.8 7.2-7.6"/></svg>',
    val: '<svg class="ic" viewBox="0 0 34 34"><path d="M6 26l7-7 5 4 10-11"/><path d="M22 12h6v6"/></svg>'
  };
  function success(m) {
    var s = m.success;
    if (!s) return waiting('03', '成功公式', '你的成功故事還沒講，第②站會問');
    var ks = ['who', 'from', 'why', 'val'];
    var terms = s.terms.map(function (t, i) {
      var val = i === s.terms.length - 1;
      return '<div class="cm-term' + (val ? ' val' : '') + ' cm-in" style="animation-delay:' + (i * 0.18).toFixed(2) + 's">' +
        (i ? '<svg class="arr" viewBox="0 0 22 14"><path d="M1 7h18M14 2l5 5-5 5" style="animation-delay:' + (i * 0.18 + 0.1).toFixed(2) + 's"/></svg>' : '') +
        ICONS[ks[i] || 'why'] + '<span class="k">' + esc(t.k) + '</span><span' + cls('v', val && t.key) + (val ? src(t.key) : '') + '>' + (val ? dot(t.src) + ' ' : '') + esc(t.v) + '</span></div>';
    }).join('');
    var q = s.quote ? '<div class="cm-quote"><button class="cm-say" type="button" data-src="__quote">聽他原本怎麼說 ▸</button></div>' : '';
    return '<section class="cm-sec" data-sec="success">' + head('03', '成功公式', s.headline, 'success') + '<div class="cm-formula">' + terms + '</div>' + q + '</section>';
  }

  /* 04 時間花在哪 */
  function time(m) {
    var t = m.time;
    if (!t) return waiting('04', '時間花在哪', '一週的時間還沒問，第②站會問');
    var total = t.week.reduce(function (a, b) { return a + b.h; }, 0);
    var bar = t.week.filter(function (w) { return w.h > 0; }).map(function (w, i) {
      var wide = w.h / total > 0.12;
      return '<div class="sg ' + (w.cls || '') + '" style="flex:' + w.h + ';animation-delay:' + (i * 0.12).toFixed(2) + 's"' + src(w.key) + ' title="' + esc(w.n + ' ' + w.h + ' 小時') + '">' + (wide ? esc(w.n) + ' ' + w.h : '') + '</div>';
    }).join('');
    var d = t.day, span = d.end - d.start, pct = function (h) { return ((h - d.start) / span * 100).toFixed(2) + '%'; };
    var day = '<div class="cm-day"><div class="track">' + d.busy.map(function (b) { return '<div class="blk" style="left:' + pct(b[0]) + ';width:' + ((b[1] - b[0]) / span * 100).toFixed(2) + '%"></div>'; }).join('') +
      '<div class="free" style="left:' + pct(t.free.from) + ';width:' + ((t.free.to - t.free.from) / span * 100).toFixed(2) + '%"></div></div>' +
      '<div class="ticks">' + d.ticks.map(function (h) { return '<span>' + String(h).padStart(2, '0') + '</span>'; }).join('') + '</div>' +
      '<div' + cls('cap', t.free.key) + src(t.free.key) + '>' + dot(t.free.src) + esc(t.free.label) + '</div></div>';
    return '<section class="cm-sec" data-sec="time">' + head('04', '時間花在哪', t.headline, 'time') +
      '<div class="cm-week" aria-label="一週 ' + total + ' 小時">' + bar + '</div>' +
      '<div class="cm-time"><div' + cls('cm-big', t.handoff.key) + src(t.handoff.key) + '><span class="v acc cm-num"><span data-count="' + t.handoff.v + '" data-dec="1">' + t.handoff.v + '</span> 小時</span><span class="l">' + dot(t.handoff.src) + ' 一週可以交給助手・一週一共 ' + total + ' 小時</span></div>' + day + '</div></section>';
  }

  /* 05 三個機會：目標 → 手段 → 脈絡 */
  function opps(m) {
    var o = m.opps;
    if (!o) return waiting('05', '三個機會', '洞找到之後，這裡會長出三個機會');
    var n = o.items.length, links = '';
    o.items.forEach(function (it, i) {
      var x = (i + 0.5) / n * 300;
      links += '<path vector-effect="non-scaling-stroke" d="M150 0 C150 24 ' + x.toFixed(1) + ' 20 ' + x.toFixed(1) + ' 46" style="animation-delay:' + (0.2 + i * 0.15).toFixed(2) + 's"/>';
    });
    var items = o.items.map(function (it, i) {
      return '<div class="cm-br" style="animation-delay:' + (0.5 + i * 0.15).toFixed(2) + 's"><div class="kind"><b>' + esc(it.kind) + '</b><span>' + esc(it.node || '') + '</span></div>' +
        '<div class="t">' + esc(it.t) + '</div><div' + cls('v ' + (it.vcls || '') + ' cm-num', it.key) + src(it.key) + '>' + esc(it.v) + '</div>' +
        '<div class="ctx">' + (it.ctx || []).map(function (c) { return '<span>' + dot(c[1]) + esc(c[0]) + '</span>'; }).join('') + '</div></div>';
    }).join('');
    var learned = o.learned ? '<div class="cm-learned">' + o.learned.map(function (l) { return '<div><b>' + esc(l[0]) + '</b><span>' + esc(l[1]) + '</span></div>'; }).join('') + '</div>' : '';
    return '<section class="cm-sec" data-sec="opps">' + head('05', '三個機會', o.headline, 'opps') + '<div class="cm-tree">' +
      '<div class="cm-goal cm-in"><div class="k">目標</div><div class="v">' + esc(o.goal) + '</div>' + (o.bounds ? '<div class="b">' + esc(o.bounds) + '</div>' : '') + '</div>' +
      '<svg class="cm-links" viewBox="0 0 300 46" preserveAspectRatio="none" aria-hidden="true">' + links + '</svg>' +
      '<div class="cm-branches">' + items + '</div></div>' + learned + '</section>';
  }

  /* 06 附近的公司 */
  function mapSec(m, ctx) {
    var mp = m.map;
    if (!mp) return waiting('06', '附近的公司', '找客的名單，會在地圖上長出來');
    var k = mp.px_per_m || 0.34, c = mp.center;
    var pos = function (p) { return [300 + (p.lng - c.lng) * 100530 * k, 220 - (p.lat - c.lat) * 111000 * k]; };
    var r1 = 400 * k, r2 = 800 * k;
    var svg = '<svg viewBox="0 0 600 440" role="img" aria-label="店的步行圈與附近的公司">' +
      '<circle class="ring" cx="300" cy="220" r="' + r2 + '"/><circle class="ring" cx="300" cy="220" r="' + r1 + '"/>' +
      '<circle class="wave" cx="300" cy="220" r="' + r2 + '"/><circle class="wave" cx="300" cy="220" r="' + r2 + '" style="animation-delay:1.6s"/>' +
      '<g class="sweep"><path d="M300 220 L300 ' + (220 - r2) + '" stroke="var(--cm-accent)" stroke-width="1.5" opacity=".5"/></g>' +
      '<text class="meta" x="36" y="214">步行 10 分</text><text class="meta" x="36" y="229">800 m</text>' +
      '<text class="meta" x="300" y="' + (220 + r1 + 16) + '" text-anchor="middle">5 分 · 400 m</text>' +
      '<g><line x1="521" y1="410" x2="' + (521 + 100 * k) + '" y2="410" stroke="var(--cm-ink3)"/><text class="meta" x="' + (521 + 50 * k) + '" y="402" text-anchor="middle">100 m</text><text class="meta" x="566" y="34" text-anchor="middle">N</text><line x1="566" y1="40" x2="566" y2="58" stroke="var(--cm-ink3)"/></g>' +
      '<rect x="291" y="211" width="18" height="18" fill="var(--cm-ink)"/><text x="286" y="248" text-anchor="end" style="font-weight:650">' + esc((m.store || {}).name || '你的店') + '</text>';
    mp.pins.forEach(function (p, i) {
      var xy = pos(p), x = xy[0], y = xy[1], right = x >= 300, on = ctx.selPin === i;
      var stroke = p.st === 'todo' ? 'var(--cm-ink3)' : p.st === 'past' ? 'var(--cm-leak)' : 'var(--cm-accent)';
      var fill = p.st === 'won' ? 'var(--cm-accent)' : p.st === 'going' ? 'var(--cm-tint)' : p.st === 'past' ? 'var(--cm-leak-tint)' : 'var(--cm-paper)';
      var mk = p.st === 'past' ? '<rect class="mk" x="' + (x - 7) + '" y="' + (y - 7) + '" width="14" height="14" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.8"/>' : '<circle class="mk" cx="' + x + '" cy="' + y + '" r="7.5" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.8"/>';
      svg += '<g class="pin' + (on ? ' sel' : '') + '" tabindex="0" role="button" data-pin="' + i + '" aria-label="' + esc(p.n + '：' + p.chip) + '"><g class="drop" style="animation-delay:' + (0.6 + i * 0.12).toFixed(2) + 's">' +
        '<circle class="halo" cx="' + x + '" cy="' + y + '" r="14" fill="none" stroke="var(--cm-ink)"/>' + mk +
        '<text x="' + (right ? x + 14 : x - 14) + '" y="' + (y + 4) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + esc(p.n) + '</text></g></g>';
    });
    svg += '</svg>';
    var list = mp.pins.map(function (p, i) {
      return '<button type="button" data-pin="' + i + '"' + (ctx.selPin === i ? ' aria-current="true"' : '') + '><span class="nm">' + esc(p.n) + '</span><span class="cm-chip ' + esc(p.st) + '">' + esc(p.chip) + '</span></button>';
    }).join('');
    return '<section class="cm-sec" data-sec="map">' + head('06', '附近的公司', mp.headline, 'map') +
      '<div class="cm-mapgrid"><div class="cm-map">' + svg + '</div><div>' + (mp.cond ? '<div class="cm-cond">' + dot(mp.cond_src || 'web') + ' ' + esc(mp.cond) + '</div>' : '') + '<div class="cm-pins">' + list + '</div></div></div></section>';
  }

  /* 07 資料 */
  function data(m) {
    var d = m.data;
    if (!d) return waiting('07', '資料', '你手上有哪些資料，第①站會一起看');
    var lanes = d.lanes.map(function (l, li) {
      return '<div class="cm-lane ' + esc(l.cls) + '"><h3><span class="sym"></span>' + esc(l.title) + '<span class="c">' + l.items.length + '</span></h3><ul>' +
        (l.items.length ? l.items.map(function (it, i) { return '<li style="animation-delay:' + (li * 0.1 + i * 0.07).toFixed(2) + 's">' + esc(it[0]) + '</li>'; }).join('') : '<li class="empty">還沒問到</li>') + '</ul></div>';
    }).join('');
    return '<section class="cm-sec" data-sec="data">' + head('07', '資料', d.headline, 'data') + '<div class="cm-data">' + lanes + '</div></section>';
  }

  /* 08 下一步 */
  function next(m) {
    var n = m.next;
    if (!n) return waiting('08', '下一步', '訪談結束前，我們一起定第一件事');
    var days = ['一', '二', '三', '四', '五', '六', '日'];
    var strip = '<div class="cm-weekstrip">' + days.map(function (d, i) { return '<div class="' + ((n.rhythm.on || []).indexOf(i) >= 0 ? 'on' : '') + '"><span>週' + d + '</span><i></i></div>'; }).join('') + '</div>';
    return '<section class="cm-sec" data-sec="next">' + head('08', '下一步', n.headline, 'next') +
      '<div class="cm-next"><div class="cm-task cm-in"><div class="k">' + esc(n.task.k) + '</div><div class="t">' + esc(n.task.t) + '</div>' +
      (n.task.draft ? '<div class="cm-bubble"><div class="to"><span>' + esc(n.task.to) + '</span><span>你確認了才送</span></div>' + esc(n.task.draft) + '</div><div class="cm-acts"><span class="pri">確認送出</span><span>在對話裡改</span></div>' : '') +
      '</div><div class="cm-rhythm">' + strip + '<div class="cap">' + esc(n.rhythm.cap) + '</div>' + (n.rhythm.rc ? '<div class="rc">' + esc(n.rhythm.rc) + '</div>' : '') + '</div></div></section>';
  }

  /* 動態：客人沿六格流動，在洞掉下去 */
  function startFlow(root, m, ctx) {
    var g = root.querySelector('.cm-flow .dots');
    if (!g || !m.flow) return;
    var drop = {};
    NODES.forEach(function (n, i) {
      var st = (m.flow.nodes[n] || {}).st;
      drop[i] = st === 'leak' ? 0.55 : st === 'hole' ? 0.32 : 0;
    });
    var NS = 'http://www.w3.org/2000/svg';
    if (reduced()) {
      [60, 150, 200, 330, 470, 520, 640, 800, 900].forEach(function (x, i) {
        var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', FY); c.setAttribute('r', 4); c.setAttribute('class', 'dot'); g.appendChild(c);
      });
      NODES.forEach(function (n, i) {
        if (!drop[i]) return;
        [[10, 44], [-8, 58]].forEach(function (o) {
          var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', FX[i] + o[0]); c.setAttribute('cy', FY + o[1]); c.setAttribute('r', 4); c.setAttribute('class', 'dot fall'); c.setAttribute('opacity', '.6'); g.appendChild(c);
        });
      });
      return;
    }
    var dots = [], last = 0, spawnEvery = 520, speed = 118, visible = true, raf = 0, prev = 0;
    function spawn(x) {
      var c = document.createElementNS(NS, 'circle'); c.setAttribute('r', 4); c.setAttribute('class', 'dot'); g.appendChild(c);
      var d = { el: c, x: x || 20, y: FY, vy: 0, a: 1, fall: false, passed: -1, jitter: (Math.random() - 0.5) * 30 };
      for (var k = 0; k < 6 && FX[k] < d.x; k++) d.passed = k;
      c.setAttribute('cx', d.x); c.setAttribute('cy', d.y);
      dots.push(d);
    }
    [48, 150, 205, 320, 470, 525, 640, 790, 905].forEach(function (x) { spawn(x); });
    function step(t) {
      raf = global.requestAnimationFrame(step);
      if (!visible || document.hidden) { prev = t; return; }
      var dt = Math.min(0.05, prev ? (t - prev) / 1000 : 0); prev = t;
      if (t - last > spawnEvery) { last = t; spawn(); }
      for (var i = dots.length - 1; i >= 0; i--) {
        var d = dots[i];
        if (d.fall) {
          d.vy += 420 * dt; d.y += d.vy * dt; d.x += 18 * dt; d.a -= 1.1 * dt;
        } else {
          d.x += speed * dt;
          for (var k = d.passed + 1; k < 6; k++) {
            if (d.x >= FX[k] + d.jitter * 0.2) {
              d.passed = k;
              if (drop[k] && Math.random() < drop[k]) { d.fall = true; d.el.setAttribute('class', 'dot fall'); }
              break;
            }
          }
          if (d.x > 925) d.a -= 3 * dt;
        }
        if (d.a <= 0 || d.y > 190) { d.el.remove(); dots.splice(i, 1); continue; }
        d.el.setAttribute('cx', d.x.toFixed(1)); d.el.setAttribute('cy', d.y.toFixed(1)); d.el.setAttribute('opacity', Math.max(0, d.a).toFixed(2));
      }
    }
    raf = global.requestAnimationFrame(step);
    var io = null;
    if ('IntersectionObserver' in global) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0 });
      io.observe(g.ownerSVGElement || g);
    }
    ctx.stops.push(function () { global.cancelAnimationFrame(raf); if (io) io.disconnect(); });
  }

  /* 動態：數字跳到位（最後停在原本的字） */
  function countUp(root, ctx) {
    if (reduced() || !ctx.enter) return;
    root.querySelectorAll('[data-count]').forEach(function (el, i) {
      var target = parseFloat(el.getAttribute('data-count'));
      if (!isFinite(target)) return;
      var final = el.textContent, dec = parseInt(el.getAttribute('data-dec') || '0', 10), t0 = 0, dur = 1100, delay = 250 + i * 60, raf = 0;
      function frame(t) {
        if (!t0) { t0 = t; el.textContent = (0).toFixed(dec); }
        var p = Math.min(1, Math.max(0, (t - t0 - delay) / dur)), e = 1 - Math.pow(1 - p, 3);
        el.textContent = p >= 1 ? final : (target * e).toFixed(dec);
        if (p < 1) raf = global.requestAnimationFrame(frame);
      }
      raf = global.requestAnimationFrame(frame);
      ctx.stops.push(function () { global.cancelAnimationFrame(raf); el.textContent = final; });
    });
  }

  function drawer(root, s) {
    var old = root.querySelector('.cm-drawer'); if (old) old.remove();
    if (!s) return;
    var d = document.createElement('div');
    d.className = 'cm-drawer'; d.setAttribute('role', 'dialog');
    d.innerHTML = '<div class="dh"><b>' + esc(s.title) + '</b><button type="button" data-close="1">關閉</button></div>' +
      (s.value ? '<div class="dv cm-num">' + esc(s.value) + '</div>' : '') + '<div class="db"></div>' +
      (s.src ? '<div class="ds">' + dot(s.src) + '出處：' + esc(SRC[s.src] || s.src) + '</div>' : '');
    d.querySelector('.db').textContent = s.body || '';
    root.appendChild(d);
    d.querySelector('[data-close]').focus({ preventScroll: true });
  }
  function toast(root, text) {
    var t = root.querySelector('.cm-toast'); if (!t) { t = document.createElement('div'); t.className = 'cm-toast'; root.appendChild(t); }
    t.textContent = text; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function nodeSource(m, n) {
    var f = m.flow || {}, nd = (f.nodes || {})[n] || {}, p = P29[n];
    var body = (nd.why ? nd.why + '\n\n' : '') + '這一格：' + p[0] + '\n算式（簡報 P29）：' + p[1];
    if (nd.more) body += '\n\n' + nd.more;
    var tac = (m.tactics || {})[n];
    if (tac && tac.length) body += '\n\n做法（課程包）：\n' + tac.slice(0, 3).map(function (x, i) { return (i + 1) + '. ' + x.name + '：' + (x.what || ''); }).join('\n') + (tac.length > 3 ? '\n……還有 ' + (tac.length - 3) + ' 條，跟助手說「這一格有哪些做法」' : '');
    else if (m.packed === false) body += '\n\n這一格有哪些做法：輸入課程碼、裝好課程包就會出現。';
    var label = { leak: '最大的洞', hole: '也在漏', rel: '有關', later: '先不做', unknown: '還不知道' }[nd.st || 'unknown'];
    return { title: n + '・' + label, value: nd.value || '', src: nd.src || (nd.st === 'leak' ? 'est' : 'said'), body: body };
  }

  function render(root, model, opts) {
    opts = opts || {};
    if (root._cm) root._cm.destroy();
    var ctx = { stops: [], selPin: null, enter: !!opts.enter && !reduced() };
    root.classList.add('cm');
    root.classList.toggle('cm-enter', ctx.enter);
    if (model.success && model.success.quote) { model.sources = model.sources || {}; model.sources.__quote = { title: '他原本怎麼說', src: 'said', body: model.success.quote }; }
    function paint() {
      ctx.stops.forEach(function (f) { f(); }); ctx.stops = [];
      root.innerHTML = top(model) + hero(model) + flow(model) + success(model) + time(model) + opps(model) + mapSec(model, ctx) + data(model) + next(model);
      startFlow(root, model, ctx); countUp(root, ctx);
    }
    function onClick(e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      var close = t.closest('[data-close]'); if (close) { drawer(root, null); return; }
      var say = t.closest('[data-say]');
      if (say) {
        var key = say.getAttribute('data-say'), text = (model.say || {})[key] || ('【脈絡地圖】' + key + '：');
        if (opts.onSay) { opts.onSay(text, key); return; }
        var ok = function () { toast(root, '已複製，貼到對話裡接著說'); }, fail = function () { toast(root, '複製不了，直接在對話裡說：' + text); };
        try { navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).then(ok, fail) : fail(); } catch (x) { fail(); }
        return;
      }
      var node = t.closest('[data-node]');
      if (node) { drawer(root, nodeSource(model, node.getAttribute('data-node'))); return; }
      var pin = t.closest('[data-pin]');
      if (pin) {
        var i = +pin.getAttribute('data-pin'), p = model.map.pins[i];
        ctx.selPin = ctx.selPin === i ? null : i;
        root.querySelectorAll('[data-sec="map"] [data-pin]').forEach(function (el) {
          var mine = +el.getAttribute('data-pin') === ctx.selPin;
          if (el.tagName === 'BUTTON') { if (mine) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); }
          else el.classList.toggle('sel', mine);
        });
        if (ctx.selPin !== null) drawer(root, { title: p.n, value: p.chip, src: p.src || 'web', body: p.note || '' }); else drawer(root, null);
        return;
      }
      var hit = t.closest('[data-src]');
      if (hit) drawer(root, (model.sources || {})[hit.getAttribute('data-src')]);
    }
    function onKey(e) {
      if (e.key === 'Escape') { drawer(root, null); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-src],[data-node],[data-pin]') && e.target.tagName !== 'BUTTON') { e.preventDefault(); onClick({ target: e.target }); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    paint();
    root._cm = { destroy: function () { ctx.stops.forEach(function (f) { f(); }); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root._cm = null; }, repaint: paint };
    return root._cm;
  }

  global.ContextMap = { render: render, NODES: NODES, P29: P29 };
})(typeof window !== 'undefined' ? window : this);
