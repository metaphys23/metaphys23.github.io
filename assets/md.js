// Теория сайта: Markdown в стиле Obsidian → HTML. Один рендер для страницы учебника и предпросмотра в редакторе админки.
// Выноски Карты мышления (hub/КАРТА_МЫШЛЕНИЯ.md):  > [!Law] 3.4 Закон Гука   — номер блока = адрес #3.4.
// Формулы: $…$ и $$…$$ (KaTeX, если подключён). Вики-ссылка на блок: [[#3.3]] или [[#3.3|опыт]].
// Вывод в двух формах (правило учителя 06.11.2026): внутри [!Deriv] строки **Стандартный вывод** и **Дифференциальный вывод**
// делят вывод на вкладки «Стандартный» (подстановка уравнений) и «Дифференциальный ★»; выбор ученика помнится на устройстве.
// MD.render(src) → {html, meta, blocks}; MD.lint(src) → [{level: err|warn|hint, num, text}]; MD.bind(root) — вкладки выводов.
(function () {
  'use strict';
  // код → [знак, Код, шаг мышления 1–6]
  var B = {def: ['≡', 'Def', 1], qty: ['[ ]', 'Qty', 1], model: ['◇', 'Model', 1], law: ['!', 'Law', 2], eq: ['ƒ', 'Eq', 2], thm: ['△', 'Thm', 2], prop: ['○', 'Prop', 2],
    cor: ['∴', 'Cor', 2], princ: ['☆', 'Princ', 2], deriv: ['↓', 'Deriv', 3], exp: ['✱', 'Exp', 3], device: ['□', 'Device', 4], mech: ['⚙', 'Mech', 4], app: ['↗', 'App', 4],
    hist: ['⧖', 'Hist', 4], cp: ['▷', 'Cp', 5], meth: ['#', 'Meth', 5], ex: ['✓', 'Ex', 5], err: ['✗', 'Err', 5], est: ['≈', 'Est', 5], q: ['?', 'Q', 6]};
  var NEED_DERIV = {law: 1, eq: 1, thm: 1, cor: 1};
  var CALL = /^\[!([A-Za-z]+)\]\s*(\d+\.\d+)?\s*(.*)$/;
  var IMG = ''; // render(src, {base: '/uchebnik/тема/'}) — относительные картинки в предпросмотре админки
  var PART = /^\*\*(Стандартный|Дифференциальный) вывод\*\*\s*(.*)$/;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function tex(s, display) {
    if (window.katex) { try { return window.katex.renderToString(s, {displayMode: display, throwOnError: false, strict: 'ignore', output: 'html'}); } catch (e) {} }
    return '<span class="tex">' + esc(display ? '$$' + s + '$$' : '$' + s + '$') + '</span>';
  }
  function safeUrl(u) { u = String(u || '').replace(/&amp;/g, '&').trim(); return /^(https?:\/\/|\/|#|\.{0,2}\/|[\w%.-]+(\/|$|\.))/i.test(u) && !/^javascript:/i.test(u) ? u : '#'; }

  // ---------- строка: сначала формулы в «карман», потом разметка, потом формулы обратно
  function inline(s) {
    var keep = [];
    s = s.replace(/`([^`]+)`/g, function (m, c) { keep.push('<code>' + esc(c) + '</code>'); return '\u0000' + (keep.length - 1) + '\u0000'; });
    s = s.replace(/\$\$([\s\S]+?)\$\$|\$((?:\\\$|[^$\n])+?)\$/g, function (m, d, i) { keep.push(d != null ? tex(d, true) : tex(i, false)); return '\u0000' + (keep.length - 1) + '\u0000'; });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, a, u) { u = safeUrl(u); if (IMG && !/^(https?:|\/|#)/i.test(u)) u = IMG + u.replace(/^\.\//, ''); return '<img src="' + esc(u) + '" alt="' + a + '" loading="lazy">'; })
      .replace(/\[\[#(\d+\.\d+)(?:\|([^\]]+))?\]\]/g, function (m, n, t) { return '<a class="ref" href="#' + n + '">' + (t || n) + '</a>'; })
      .replace(/\[\[([^\]|#]+)#(\d+\.\d+)(?:\|([^\]]+))?\]\]/g, function (m, p, n, t) { return '<span class="ref">' + (t || p + ' ' + n) + '</span>'; })
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (m, p, t) { return t || p; })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) { return '<a href="' + esc(safeUrl(u)) + '">' + t + '</a>'; })
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return keep[+i]; });
  }

  // ---------- блоки
  function parse(lines, ctx) {
    var out = [], i = 0, para = [];
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    while (i < lines.length) {
      var L = lines[i], t = L.trim(), m;
      if (!t) { flush(); i++; continue; }
      if (/^```/.test(t)) { flush(); var code = []; i++; while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]); i++; out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); continue; }
      if (t === '$$' || (/^\$\$/.test(t) && !/\$\$$/.test(t.slice(2)))) { flush(); var f = [t.slice(2)]; i++; while (i < lines.length && lines[i].trim().slice(-2) !== '$$') f.push(lines[i++]); if (i < lines.length) f.push(lines[i++].trim().slice(0, -2)); out.push('<div class="mathb">' + tex(f.join('\n').trim(), true) + '</div>'); continue; }
      if (/^\$\$[\s\S]+\$\$$/.test(t)) { flush(); out.push('<div class="mathb">' + tex(t.slice(2, -2), true) + '</div>'); i++; continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) { flush(); var h = Math.min(m[1].length + 1, 5); out.push('<h' + h + '>' + inline(m[2]) + '</h' + h + '>'); i++; continue; }
      if (/^>/.test(t)) {
        flush(); var q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*> ?/, ''));
        var c = CALL.exec((q[0] || '').trim());
        out.push(c ? callout(c, q.slice(1), ctx) : '<blockquote>' + parse(q, ctx) + '</blockquote>'); continue;
      }
      if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        flush(); var row = function (r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (x) { return x.trim(); }); };
        var head = row(t), body = []; i += 2; while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) body.push(row(lines[i++]));
        out.push('<div class="tw"><table><thead><tr>' + head.map(function (x) { return '<th>' + inline(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + inline(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'); continue;
      }
      if ((m = /^([-*]|\d+[.)])\s+/.exec(t))) {
        flush(); var ol = /\d/.test(m[1]), items = [];
        while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) { var it = [lines[i++].trim().replace(/^([-*]|\d+[.)])\s+/, '')]; while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) it.push(lines[i++].trim()); items.push(it.join(' ')); }
        out.push('<' + (ol ? 'ol' : 'ul') + '>' + items.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</' + (ol ? 'ol' : 'ul') + '>'); continue;
      }
      para.push(t); i++;
    }
    flush(); return out.join('\n');
  }
  function callout(c, body, ctx) {
    var k = c[1].toLowerCase(), b = B[k], num = c[2] || '', title = c[3] || '';
    if (ctx.depth === 0) ctx.blocks.push({code: b ? b[1] : c[1], key: k, num: num, title: title, body: body.join('\n')});
    var inner, sub = {blocks: ctx.blocks, depth: ctx.depth + 1};
    if (k === 'deriv') inner = deriv(body, sub); else inner = parse(body, sub);
    if (!b) return '<div class="blk unk"><div class="blk-h"><b>' + esc(c[1]) + '</b> ' + inline(title) + '</div><div class="blk-b">' + inner + '</div></div>';
    return '<section class="blk s' + b[2] + '" data-code="' + b[1] + '"' + (num ? ' id="' + num + '"' : '') + '><div class="blk-h">' +
      (num ? '<a class="blk-n" href="#' + num + '">' + num + '</a>' : '') + '<span class="blk-z" aria-hidden="true">' + esc(b[0]) + '</span><span class="blk-c">' + b[1] + '</span>' +
      (title ? '<span class="blk-t">' + inline(title) + '</span>' : '') + '</div><div class="blk-b">' + inner + '</div></section>';
  }
  function deriv(body, ctx) {
    var parts = {pre: []}, cur = 'pre', notes = {};
    body.forEach(function (l) { var m = PART.exec(l.trim()); if (m) { cur = m[1] === 'Стандартный' ? 'std' : 'dif'; parts[cur] = []; notes[cur] = m[2]; } else parts[cur].push(l); });
    var pre = parse(parts.pre, ctx);
    if (!parts.std && !parts.dif) return pre;
    var tabs = [['std', 'Стандартный', 'подстановка уравнений'], ['dif', 'Дифференциальный ★', 'через производную']].filter(function (x) { return parts[x[0]]; });
    return pre + '<div class="dv" data-dv-root>' + (tabs.length > 1 ? '<div class="dv-tabs" role="tablist">' + tabs.map(function (x, j) { return '<button type="button" role="tab" data-dv="' + x[0] + '" aria-selected="' + (j === 0) + '" title="' + x[2] + '">' + x[1] + '</button>'; }).join('') + '</div>' : '') +
      tabs.map(function (x, j) { return '<div class="dv-p" data-dv="' + x[0] + '"' + (j ? ' hidden' : '') + '><p class="dv-cap">' + x[1] + (notes[x[0]] ? ' · ' + inline(notes[x[0]]) : ' · ' + x[2]) + '</p>' + parse(parts[x[0]], ctx) + '</div>'; }).join('') + '</div>';
  }
  function front(src) {
    var meta = {}, m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
    if (!m) return [meta, src];
    m[1].split(/\r?\n/).forEach(function (l) { var p = /^([\w-]+):\s*(.*)$/.exec(l); if (!p) return; var v = p[2].trim(); if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(function (x) { x = x.trim().replace(/^["']|["']$/g, ''); return /^\d+$/.test(x) ? +x : x; }).filter(function (x) { return x !== ''; }); else v = v.replace(/^["']|["']$/g, ''); meta[p[1]] = v; });
    return [meta, src.slice(m[0].length)];
  }
  function render(src, opt) {
    var f = front(String(src || '')), ctx = {blocks: [], depth: 0}; IMG = (opt && opt.base) || '';
    var html = parse(f[1].split(/\r?\n/), ctx); IMG = '';
    return {meta: f[0], html: html, blocks: ctx.blocks};
  }

  // ---------- проверка: формула без вывода не идёт в материалы (Карта, «Правила»); вывод — в двух формах (учитель 06.11.2026)
  function lint(src) {
    var r = render(src), out = [], seen = {}, has = {};
    r.blocks.forEach(function (b) { if (b.num) { if (seen[b.num]) out.push({level: 'err', num: b.num, text: 'номер ' + b.num + ' повторяется'}); seen[b.num] = b; } });
    r.blocks.forEach(function (b) { if (b.key === 'deriv' || b.key === 'exp') has[b.num] = b.key; });
    r.blocks.forEach(function (b) {
      var name = (b.num ? b.num + ' ' : '') + b.code + (b.title ? ' «' + b.title + '»' : '');
      if (!B[b.key]) { out.push({level: 'warn', num: b.num, text: name + ': такого блока нет в Карте мышления'}); return; }
      if (!b.num) out.push({level: 'warn', num: '', text: name + ': нет номера «тема.порядковый»'});
      if (NEED_DERIV[b.key]) {
        var refs = [], re = /\[\[([^\]#|]*)#(\d+\.\d+)[^\]]*\]\]|(?:Вывод|Опыт|Deriv|Exp)\s*:?\s*(\d+\.\d+)/gi, m;
        while ((m = re.exec(b.body))) refs.push({ext: !!m[1], num: m[2] || m[3]});
        var ok = refs.some(function (x) { return x.ext || has[x.num]; });
        if (!ok) out.push({level: 'err', num: b.num, text: name + ': нет ссылки на вывод (Deriv) или опыт (Exp) — например «Вывод: [[#' + (b.num ? b.num.split('.')[0] + '.N' : 'N.M') + ']]»'});
      }
      if (b.key === 'deriv') {
        var std = /^\s*\*\*Стандартный вывод\*\*/m.test(b.body), dif = /^\s*\*\*Дифференциальный вывод\*\*/m.test(b.body);
        if (!std) out.push({level: 'warn', num: b.num, text: name + ': нет части «**Стандартный вывод**» (подстановка уравнений — для всех)'});
        if (!dif) out.push({level: 'hint', num: b.num, text: name + ': желательно «**Дифференциальный вывод**» — для сильных'});
      }
    });
    return out;
  }

  // ---------- вкладки выводов: выбор помнится на устройстве (mf:dv) и действует на всех страницах
  function pref() { try { return localStorage.getItem('mf:dv') || 'std'; } catch (e) { return 'std'; } }
  function pick(root, v) {
    root.querySelectorAll('[data-dv-root]').forEach(function (d) {
      if (!d.querySelector('.dv-p[data-dv="' + v + '"]')) return;
      d.querySelectorAll('.dv-tabs [data-dv]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.dv === v); });
      d.querySelectorAll('.dv-p').forEach(function (p) { p.hidden = p.dataset.dv !== v; });
    });
  }
  function bind(root) {
    pick(root, pref());
    if (root.__mdBound) return; root.__mdBound = true;
    root.addEventListener('click', function (e) { var b = e.target.closest('.dv-tabs [data-dv]'); if (!b) return; try { localStorage.setItem('mf:dv', b.dataset.dv); } catch (x) {} pick(root, b.dataset.dv); });
  }
  window.MD = {render: render, lint: lint, bind: bind, blocks: B, esc: esc};
})();
