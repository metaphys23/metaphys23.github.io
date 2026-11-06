// Задачник: полка книг, оглавления, параграфы, сквозные подтемы, «Смешать», корзина и сборщик ДЗ.
// Данные — /data/zadachnik/ (делает tools/zadachnik.py из банка). Закрытые книги — .enc (AES-GCM):
// ключ даёт сервер кабинетов вошедшим (GET /api/zadachnik/key) или пароль учителя (обёртка в keys.json).
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const main = $('main'), VIEW = main.dataset.view, Q = new URLSearchParams(location.search);
  const BASE = '/data/zadachnik/';
  const LVN = ['', 'устная', 'одношаговая', 'стандарт', 'олимп. школа', 'олимп. регион+'];
  const LS_KEY = 'mf:zkey', LS_BASKET = 'mf:dz:basket';
  const ls = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }};
  let IDX, KEYS, KEY = null, ROLE = '';
  const NUM = {}, BOOK = {}, cache = {};

  // ---------- общие
  const getJSON = u => fetch(u, {cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); });
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const b64e = a => btoa(String.fromCharCode.apply(null, a));
  const url = p => location.pathname.replace(/dz\/$/, '') + (p ? '?' + new URLSearchParams(p) : '');
  const ZURL = '/zadachnik/';
  const math = el => { try { if (window.renderMathInElement) window.renderMathInElement(el, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false}); } catch (e) {} };
  const dots = (lvl, d) => `<span class="dots lv${lvl}" title="уровень ${lvl} — ${LVN[lvl]}${d ? ' (d = ' + String(d).replace('.', ',') + ')' : ''}">${'●'.repeat(lvl)}${'○'.repeat(5 - lvl)}</span>`;
  const lvbar = ls5 => { const n = ls5.reduce((a, b) => a + b, 0) || 1;
    return `<span class="lvbar" title="уровни 1–5: ${ls5.join(' · ')}">${ls5.map((c, i) => c ? `<i class="lv${i + 1}" style="flex:${c / n}"></i>` : '').join('')}</span>`; };
  const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;
  const zad = n => n + ' ' + plural(n, 'задача', 'задачи', 'задач');
  const partLabel = p => (p.n ? p.n + ' ' : '') + p.title;
  const label = (b, n) => b.short + ' ' + n;

  // ---------- ключ закрытых книг
  const importRaw = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  async function verify(k) {
    try { const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(KEYS.check.iv)}, k, b64d(KEYS.check.ct)); return new TextDecoder().decode(pt) === 'metaphys-zadachnik'; }
    catch (e) { return false; }
  }
  async function accept(raw, role) {
    const k = await importRaw(raw);
    if (!(await verify(k))) return false;
    KEY = k; ROLE = role; ls.set(LS_KEY, JSON.stringify({k: b64e(raw), role}));
    return true;
  }
  async function restore() {
    try { const o = JSON.parse(ls.get(LS_KEY) || 'null'); if (o && await accept(b64d(o.k), o.role)) return true; } catch (e) {}
    ls.set(LS_KEY, null); return false;
  }
  async function fromServer() {
    const base = (window.API_BASE || '').replace(/\/$/, '');
    if (!base) return false;
    for (const [lsk, role] of [['mf:admin_token', 'teacher'], ['mf:teacher_token', 'teacher'], ['mf:token', 'student']]) {
      const t = ls.get(lsk); if (!t) continue;
      try {
        const r = await fetch(base + '/api/zadachnik/key', {headers: {Authorization: 'Bearer ' + t}});
        if (!r.ok) continue;
        const b = await r.json();
        if (b && b.ok && await accept(b64d(b.data.key), role)) return true;
      } catch (e) {}
    }
    return false;
  }
  async function fromPassword(pw) {
    for (const w of KEYS.wraps.filter(x => x.role === 'teacher')) {
      try {
        const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
        const kek = await crypto.subtle.deriveKey({name: 'PBKDF2', salt: b64d(w.salt), iterations: KEYS.iter, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
        const raw = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(w.iv)}, kek, b64d(w.ct)));
        if (await accept(raw, 'teacher')) return true;
      } catch (e) {}
    }
    return false;
  }
  const teacher = () => ROLE === 'teacher';
  const anyClosed = () => IDX.books.some(b => b.closed);

  // ---------- данные
  async function open(buf) {
    const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12)}, KEY, new Uint8Array(buf, 12));
    return pt;
  }
  async function loadPart(b, p) {
    const id = b.id + '/' + p.id;
    if (cache[id]) return cache[id];
    if (b.closed && !KEY) return null;
    let data;
    if (b.closed) {
      const r = await fetch(BASE + p.file, {cache: 'no-cache'}); if (!r.ok) throw new Error(p.file + ': ' + r.status);
      data = JSON.parse(new TextDecoder().decode(await open(await r.arrayBuffer())));
    } else data = await getJSON(BASE + p.file);
    data.tasks.forEach(t => { t.book = b; t.part = p; });
    return (cache[id] = data);
  }
  const MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml'};
  async function figSrc(b, name) {
    if (!b.closed) return BASE + name;
    const r = await fetch(BASE + name); if (!r.ok) return '';
    const ext = name.replace(/\.enc$/, '').split('.').pop().toLowerCase();
    return URL.createObjectURL(new Blob([await open(await r.arrayBuffer())], {type: MIME[ext] || 'application/octet-stream'}));
  }
  async function fillFigs(root) {
    for (const im of root.querySelectorAll('img[data-fig]')) {
      const t = im.closest('[data-ref]'); const b = BOOK[t.dataset.ref.split(':')[0]];
      im.src = await figSrc(b, im.dataset.fig); im.removeAttribute('data-fig');
    }
  }
  function resolve(ref) {           // 'demo:2.1' → {b, p, n} | null
    const i = ref.indexOf(':'); if (i < 0) return null;
    const b = BOOK[ref.slice(0, i)], n = ref.slice(i + 1);
    const pid = b && NUM[b.id][n];
    return pid == null ? null : {b, p: b.parts.find(x => x.id === pid), n};
  }
  async function getTask(ref) {
    const r = resolve(ref); if (!r) return null;
    const d = await loadPart(r.b, r.p);
    return d ? d.tasks.find(t => t.n === r.n) : {locked: true, ref, n: r.n, book: r.b, part: r.p};
  }

  // ---------- корзина ДЗ (учитель)
  const basket = () => { try { return JSON.parse(ls.get(LS_BASKET) || '[]'); } catch (e) { return []; } };
  const setBasket = a => { ls.set(LS_BASKET, JSON.stringify(a)); drawBar(); };
  function drawBar() {
    let bar = $('#zbar');
    if (!teacher() || VIEW === 'dz') { if (bar) bar.remove(); return; }
    const n = basket().length;
    if (!bar) { document.body.insertAdjacentHTML('beforeend', '<div id="zbar" class="zbar" role="status"></div>'); bar = $('#zbar'); }
    bar.innerHTML = n ? `<span>В ДЗ: <b>${zad(n)}</b></span><a class="btn sm" href="${ZURL}dz/">Собрать ДЗ</a>` : '<span>Режим учителя: «+ в ДЗ» у каждой задачи</span>';
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('.zadd'); if (!a) return;
    const ref = a.closest('[data-ref]').dataset.ref, cur = basket(), i = cur.indexOf(ref);
    i >= 0 ? cur.splice(i, 1) : cur.push(ref); setBasket(cur);
    a.setAttribute('aria-pressed', i < 0); a.textContent = i < 0 ? '✓ в ДЗ' : '+ в ДЗ';
  });

  // ---------- карточка задачи
  const paras = s => esc(s).split(/\n\s*\n/).map(x => '<p>' + x.replace(/\n/g, ' ') + '</p>').join('');
  function card(t, o) {
    o = o || {};
    const b = t.book, inB = b.parts ? b : BOOK[b];
    if (t.locked) return `<article class="zt locked" data-ref="${esc(t.ref)}" id="z-${esc(o.num ? t.ref : t.n)}"><header>${o.num ? `<b class="zn">${o.num}</b>` : ''}<span class="zsrc">${esc(label(inB, t.n))}</span></header><p class="zl">🔒 Текст откроется после входа в кабинет.</p></article>`;
    const inBasket = basket().indexOf(t.ref) >= 0;
    const links = [];
    (t.rewr || []).forEach(r => { const x = resolve(r); if (x) links.push(`Переписанная: <a href="${url({b: x.b.id, p: x.p.id})}#z-${esc(x.n)}">${esc(label(x.b, x.n))}</a>`); });
    if (t.based) { const x = resolve(t.based); if (x) links.push(`По мотивам: <a href="${url({b: x.b.id, p: x.p.id})}#z-${esc(x.n)}">${esc(label(x.b, x.n))}</a>`); }
    const ans = o.answers === false || !KEY ? '' :   // ответы — всем, кто вошёл (слово учителя 06.11)
      (t.ans ? `<details class="zans"${o.openAns ? ' open' : ''}><summary>Ответ</summary><div>${esc(t.ans)}</div></details>` : '');
    return `<article class="zt" data-ref="${esc(t.ref)}" id="z-${esc(o.num || o.src ? t.ref : t.n)}"><header>` +
      (o.num ? `<b class="zn">${o.num}</b>` : o.src ? '' : `<a class="zn" href="#z-${esc(t.n)}">${esc(t.n)}</a>`) + dots(t.lvl, t.d) +
      (o.src || o.num ? `<a class="zsrc" href="${url({b: inB.id, p: t.part.id})}#z-${esc(t.n)}">${esc(label(inB, t.n))}</a>` : '') +
      (t.ver === 'approved_auto' || t.ver === 'approved' ? '<span class="zok" title="ответ сверен по двум источникам">✓</span>' : '') +
      (teacher() && !o.num ? `<button class="zadd chip" aria-pressed="${inBasket}">${inBasket ? '✓ в ДЗ' : '+ в ДЗ'}</button>` : '') +
      `</header><div class="zq">${paras(t.text)}</div>` +
      (t.fig || []).map(f => `<figure><img data-fig="${esc(f)}" alt="Рисунок к задаче ${esc(t.n)}" loading="lazy"></figure>`).join('') +
      ans + (links.length ? `<p class="zlinks">${links.join(' · ')}</p>` : '') + '</article>';
  }
  async function showList(el, ts, o) {
    el.innerHTML = ts.length ? ts.map((t, i) => card(t, Object.assign({}, o, o && o.numbered ? {num: i + 1} : {}))).join('') : '<p class="empty">Нет задач с такими условиями.</p>';
    math(el); await fillFigs(el);
  }

  // ---------- замок
  function lockBox() {
    if (KEY) return `<p class="zkey">Тексты книг открыты на этом устройстве${teacher() ? ' · режим учителя' : ''}. <a href="#" id="zforget">Забыть ключ</a></p>`;
    const cab = window.API_BASE ? '<a class="btn sm" href="/me/">Войти в кабинет</a>' : '<span class="sub">Вход учеников откроется вместе с личными кабинетами.</span>';
    return `<section class="zlock" aria-label="Доступ к текстам"><p><b>🔒 Тексты задачников — после входа в личный кабинет.</b> Оглавления, уровни, задачи «Метафизики» и ФИПИ открыты всем.</p>
      <div class="row">${cab}<button class="btn sm ghost" id="zt-open" aria-expanded="false">Я учитель</button></div>
      <form id="zpw" hidden><label class="field"><span>Пароль учителя</span><input class="plain" type="password" id="zpass" autocomplete="current-password" required minlength="10"></label>
      <button class="btn sm">Открыть</button> <span class="msg bad" id="zpm" hidden></span></form></section>`;
  }
  function bindLock(rerender) {
    const f = $('#zforget'); if (f) f.addEventListener('click', e => { e.preventDefault(); ls.set(LS_KEY, null); location.reload(); });
    const o = $('#zt-open'); if (o) o.addEventListener('click', () => { const p = $('#zpw'); p.hidden = !p.hidden; o.setAttribute('aria-expanded', !p.hidden); if (!p.hidden) $('#zpass').focus(); });
    const pw = $('#zpw'); if (pw) pw.addEventListener('submit', async e => {
      e.preventDefault(); const m = $('#zpm'); m.hidden = true; const btn = pw.querySelector('button'); btn.disabled = true; btn.textContent = 'Проверяю…';
      const ok = await fromPassword($('#zpass').value);
      btn.disabled = false; btn.textContent = 'Открыть';
      if (!ok) { m.textContent = 'Пароль не подошёл.'; m.hidden = false; return; }
      drawBar(); rerender();
    });
  }

  // ---------- страницы
  function crumbs(xs) { return '<p class="crumbs">' + xs.map(x => x[1] ? `<a href="${x[1]}">${esc(x[0])}</a>` : esc(x[0])).join(' / ') + '</p>'; }
  function subLinks(subs, except) {          // «эта подтема ещё: …»
    const out = [];
    subs.forEach(s => (IDX.subs[s] ? IDX.subs[s].parts : []).forEach(([bid, pid, n]) => {
      if (except && bid === except[0] && pid === except[1]) return;
      const b = BOOK[bid], p = b.parts.find(x => x.id === pid);
      out.push(`<a href="${url({b: bid, p: pid})}">${esc(b.short)}${p.n ? ' ' + esc(p.n) : ''}</a> <small>(${n})</small>`);
    }));
    return out;
  }

  function viewShelf() {
    const bySec = {};
    Object.keys(IDX.subs).forEach(s => { const x = IDX.subs[s]; if (!x.parts.length) return; (bySec[x.topic] = bySec[x.topic] || []).push(s); });
    main.innerHTML = '<h1>Задачник</h1><p class="sub">Задачи из задачников и свои — по книгам и по сквозным подтемам. Уровень ●●●○○ общий для всех книг: задачи можно смешивать.</p>' + lockBox() +
      '<h2>Книги</h2><div class="tiles">' + IDX.books.map(b => `<a class="tile" href="${url({b: b.id})}"><b>${esc(b.short)}${b.closed ? ' <span title="тексты после входа">🔒</span>' : ''}</b>` +
        `<span>${esc(b.title)}${b.author ? ' · ' + esc(b.author) : ''}</span><span>${b.classes.length ? esc(b.classes.join(', ')) + ' кл. · ' : ''}${zad(b.count)}</span>${lvbar(b.levels)}</a>`).join('') + '</div>' +
      '<h2>Подтемы — одна тема во всех книгах</h2>' + Object.keys(bySec).map(tp => `<h3>${esc(tp)}</h3><ul class="mat">` + bySec[tp].map(s => {
        const x = IDX.subs[s], n = x.parts.reduce((a, p) => a + p[2], 0), books = new Set(x.parts.map(p => p[0])).size;
        return `<li><a href="${url({s})}"><span class="badge">${books} ${plural(books, 'книга', 'книги', 'книг')}</span><b>${esc(x.title)}</b><span class="lvl">${n}</span></a></li>`;
      }).join('') + '</ul>').join('');
    bindLock(viewShelf); drawBar();
  }

  function viewBook(b) {
    main.innerHTML = crumbs([['Задачник', url()], [b.short]]) + `<h1>${esc(b.title)}</h1><p class="sub">${esc(b.author)}${b.classes.length ? ' · ' + esc(b.classes.join(', ')) + ' класс' : ''} · ${zad(b.count)}${b.note ? ' · ' + esc(b.note) : ''}</p>` +
      (b.closed ? lockBox() : '') + '<h2>Оглавление</h2><ol class="ztoc">' + b.parts.map(p => {
        const more = subLinks(p.subs, [b.id, p.id]);
        return `<li><a href="${url({b: b.id, p: p.id})}"><b>${esc(partLabel(p))}</b><span class="lvl">${zad(p.count)}</span>${lvbar(p.levels)}</a>` +
          (more.length ? `<p class="zmore">Эта подтема ещё: ${more.join(' · ')} · <a href="${url({s: p.subs[0]})}">смешать</a></p>` : '') + '</li>';
      }).join('') + '</ol>';
    bindLock(() => viewBook(b)); drawBar();
  }

  async function viewPart(b, p) {
    const i = b.parts.indexOf(p), prev = b.parts[i - 1], next = b.parts[i + 1], more = subLinks(p.subs, [b.id, p.id]);
    main.innerHTML = crumbs([['Задачник', url()], [b.short, url({b: b.id})], [p.n || p.title]]) + `<h1>${esc(partLabel(p))}</h1>` +
      `<p class="sub">${esc(b.short)} · ${zad(p.count)} · подтема ${p.subs.map(s => `<a href="${url({s})}">${esc(IDX.subs[s] ? IDX.subs[s].title : s)}</a>`).join(', ')}</p>` +
      (more.length ? `<p class="zmore">Эта подтема ещё: ${more.join(' · ')}</p>` : '') + (b.closed ? lockBox() : '') +
      levelChips() + '<div id="zl"><p class="sub">Загружаю…</p></div>' +
      `<nav class="row zpn">${prev ? `<a class="btn sm ghost" href="${url({b: b.id, p: prev.id})}">← ${esc(prev.n || prev.title)}</a>` : ''}${next ? `<a class="btn sm ghost" href="${url({b: b.id, p: next.id})}">${esc(next.n || next.title)} →</a>` : ''}</nav>`;
    bindLock(() => viewPart(b, p)); drawBar();
    const d = await loadPart(b, p);
    if (!d) { $('#zl').innerHTML = `<p class="empty">Номера: ${esc(p.nums.join(', '))}. Тексты — после входа.</p>`; return; }
    const draw = lv => showList($('#zl'), d.tasks.filter(t => !lv || t.lvl === lv), {});
    bindChips(draw); await draw(0); jump();
  }

  function levelChips() {
    return '<div class="row" id="zlv" role="group" aria-label="Уровень"><button class="chip" aria-pressed="true" data-l="0">Все</button>' +
      [1, 2, 3, 4, 5].map(l => `<button class="chip" aria-pressed="false" data-l="${l}" title="${LVN[l]}">${dots(l)}</button>`).join('') + '</div>';
  }
  function bindChips(draw) {
    $('#zlv').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return;
      $('#zlv').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === c)); draw(+c.dataset.l); });
  }
  function jump() {
    if (!location.hash) return; const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) { document.querySelectorAll('.zt.hl').forEach(x => x.classList.remove('hl')); el.classList.add('hl'); el.scrollIntoView({block: 'center'}); }
  }
  window.addEventListener('hashchange', jump);

  // смешать: по уровню, внутри уровня книги чередуются (каждая — по возрастанию d)
  function mix(ts) {
    const out = [];
    for (let l = 1; l <= 5; l++) {
      const g = {}; ts.filter(t => t.lvl === l).sort((a, b) => a.d - b.d).forEach(t => (g[t.book.id] = g[t.book.id] || []).push(t));
      const qs = Object.values(g);
      while (qs.some(q => q.length)) qs.forEach(q => { if (q.length) out.push(q.shift()); });
    }
    return out;
  }
  async function subTasks(s) {
    const all = [], locked = [];
    for (const [bid, pid] of IDX.subs[s].parts) {
      const b = BOOK[bid], p = b.parts.find(x => x.id === pid), d = await loadPart(b, p);
      d ? d.tasks.forEach(t => all.push(t)) : locked.push([b, p]);
    }
    return {all, locked};
  }
  async function viewSub(s) {
    const x = IDX.subs[s];
    main.innerHTML = crumbs([['Задачник', url()], ['Подтемы', url()], [x.title]]) + `<h1>${esc(x.title)}</h1>` +
      `<p class="sub">${esc(x.topic)}${x.classes && x.classes.length ? ' · ' + esc(x.classes.join(', ')) + ' класс' : ''} · ${zad(x.parts.reduce((a, p) => a + p[2], 0))} в ${x.parts.length} ${plural(x.parts.length, 'разделе', 'разделах', 'разделах')}</p>` +
      (x.parts.some(p => BOOK[p[0]].closed) ? lockBox() : '') +
      '<div class="row" id="ztabs" role="tablist"><button class="chip" role="tab" aria-pressed="true" data-t="">Смешать</button>' +
      x.parts.map(([bid, pid, n]) => { const b = BOOK[bid], p = b.parts.find(y => y.id === pid); return `<button class="chip" role="tab" aria-pressed="false" data-t="${esc(bid + '/' + pid)}">${esc(b.short)}${p.n ? ' ' + esc(p.n) : ''}  · ${n}</button>`; }).join('') +
      '</div>' + levelChips() + '<p class="sub" id="zinfo"></p><div id="zl"><p class="sub">Загружаю…</p></div>';
    bindLock(() => viewSub(s)); drawBar();
    const {all, locked} = await subTasks(s);
    let tab = '', lv = 0;
    const draw = async () => {
      const ts = tab ? all.filter(t => t.book.id + '/' + t.part.id === tab) : mix(all);
      $('#zinfo').textContent = !tab && locked.length ? `Без входа не показаны: ${locked.map(([b, p]) => b.short + (p.n ? ' ' + p.n : '') + ' (' + p.count + ')').join(', ')}.` : (tab ? '' : 'По возрастанию уровня; книги чередуются.');
      await showList($('#zl'), ts.filter(t => !lv || t.lvl === lv), {src: true});
    };
    $('#ztabs').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return;
      $('#ztabs').querySelectorAll('.chip').forEach(y => y.setAttribute('aria-pressed', y === c)); tab = c.dataset.t; draw(); });
    bindChips(l => { lv = l; return draw(); });
    await draw();
  }

  // ---------- ДЗ: разбор списка «Замятин 3.12, 3.15; Мф okr-1» и ссылок 'zam9:3.12'
  function aliasList() {
    const a = [];
    IDX.books.forEach(b => [b.id, b.short, b.short.split(/\s+/)[0]].concat(b.aliases || []).forEach(x => x && a.push([x.toLowerCase(), b.id])));
    return a.sort((x, y) => y[0].length - x[0].length);
  }
  function parseRefs(text) {
    const AL = aliasList(), ok = [], bad = [];
    let cur = null;
    text.split(/[;\n]+/).forEach(chunk => chunk.split(',').forEach(tok => {
      tok = tok.trim().replace(/\s+/g, ' '); if (!tok) return;
      let num = tok;
      const c = tok.match(/^([A-Za-z0-9_-]+):(.+)$/);
      if (c && BOOK[c[1]]) { cur = c[1]; num = c[2]; }
      else { const low = tok.toLowerCase(); const hit = AL.find(([al]) => low.startsWith(al) && /^[\s:№]/.test(tok.slice(al.length) || ' ')); if (hit) { cur = hit[1]; num = tok.slice(hit[0].length); } }
      num = num.replace(/^[\s:№]+/, '').trim();
      const ref = cur + ':' + num;
      cur && num && resolve(ref) ? ok.push(ref) : bad.push(tok);
    }));
    return {ok, bad};
  }
  const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);   // МСК

  async function viewDz() {
    const z = Q.get('z');
    if (z) return viewDzOut(z.split(',').filter(Boolean));
    let refs = basket();
    main.innerHTML = crumbs([['Задачник', ZURL], ['Сборщик ДЗ']]) + '<h1>Сборщик ДЗ</h1><p class="sub">Задачи из любых книг и «Метафизики». Добавляйте кнопкой «+ в ДЗ» на страницах задачника или списком.</p>' + lockBox() +
      `<div class="two"><label class="field"><span>Название</span><input class="plain" id="dzt" value="ДЗ ${today().split('-').reverse().slice(0, 2).join('.')}"></label>` +
      `<label class="field"><span>Срок сдачи</span><input class="plain" type="date" id="dzd"></label></div>` +
      '<label class="field"><span>Вставить списком — книга и номера через запятую, книги через «;»</span><textarea class="plain" id="dzp" rows="2" placeholder="Замятин 3.12, 3.15; Турчина 125; Мф okr-1"></textarea></label>' +
      '<div class="row"><button class="btn sm" id="dzadd">Добавить</button><span class="msg bad" id="dzm" hidden></span></div>' +
      '<details class="zladder"><summary>Добить лесенкой из подтемы</summary><div class="row"><select id="dls">' +
      Object.keys(IDX.subs).filter(s => IDX.subs[s].parts.length).map(s => `<option value="${esc(s)}">${esc(IDX.subs[s].title)}</option>`).join('') + '</select>' +
      '<label>уровни <select id="dl1">' + [1, 2, 3, 4, 5].map(l => `<option${l === 2 ? ' selected' : ''}>${l}</option>`).join('') + '</select>–<select id="dl2">' + [1, 2, 3, 4, 5].map(l => `<option${l === 4 ? ' selected' : ''}>${l}</option>`).join('') + '</select></label>' +
      '<label>задач <input type="number" id="dln" min="1" max="30" value="5" class="num"></label><button class="btn sm ghost" id="dlgo">Добить</button></div></details>' +
      '<h2 id="dzh"></h2><ol class="dzlist" id="dzl"></ol><div id="dzout"></div>';
    bindLock(viewDz);
    const draw = async () => {
      setBasket(refs);
      $('#dzh').textContent = refs.length ? 'В ДЗ: ' + zad(refs.length) : 'Пока пусто';
      const items = await Promise.all(refs.map(getTask));
      $('#dzl').innerHTML = refs.map((r, i) => { const t = items[i], x = resolve(r);
        const prev = t && !t.locked ? esc(t.text.replace(/\$[^$]*\$/g, '…').slice(0, 110)) + (t.text.length > 110 ? '…' : '') : (t ? '🔒 текст после входа' : 'нет такой задачи');
        return `<li data-i="${i}"><b>${esc(x ? label(x.b, x.n) : r)}</b>${t && !t.locked ? dots(t.lvl, t.d) : ''}<small>${prev}</small>` +
          `<span class="dzb"><button class="chip" data-a="up" aria-label="выше" ${i ? '' : 'disabled'}>↑</button><button class="chip" data-a="down" aria-label="ниже" ${i < refs.length - 1 ? '' : 'disabled'}>↓</button><button class="chip" data-a="del" aria-label="убрать">✕</button></span></li>`; }).join('');
      out();
    };
    const out = () => {
      if (!refs.length) { $('#dzout').innerHTML = ''; return; }
      const t = $('#dzt').value.trim() || 'ДЗ', due = $('#dzd').value;
      const link = location.origin + ZURL + 'dz/?' + new URLSearchParams(Object.assign({z: refs.join(','), t}, due ? {d: due} : {})).toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
      const first = resolve(refs[0]), sub = first && first.p.subs[0], st = sub && IDX.subs[sub];
      const id = 'dz-' + today() + '-' + refs.length;
      const cat = {id, title: t, kind: 'dz', section: 'praktikum', topic: st ? st.topic : '', sub: st ? st.title : '', classes: st ? st.classes : [], url: link.replace(location.origin, ''), desc: refs.map(r => { const x = resolve(r); return x ? label(x.b, x.n) : r; }).join(', '), status: 'klass', level: 'baza', added: today()};
      const zd = {group: 'ГРУППА', material: id, given: today(), due: due || '', note: ''};
      $('#dzout').innerHTML = `<h2>Готово</h2><label class="field"><span>Ссылка для класса</span><input class="plain" id="dzlink" readonly value="${esc(link)}"></label>` +
        `<div class="row"><button class="btn sm" id="dzcopy">Скопировать ссылку</button><a class="btn sm ghost" href="${esc(link)}" target="_blank" rel="noopener">Открыть как ученик</a><a class="btn sm ghost" href="${esc(link)}&print=1" target="_blank" rel="noopener">Печать</a></div>` +
        `<details><summary>Записи для «Задано мне» (data/catalog.json и data/zadano.json)</summary><pre class="code" id="dzjson">${esc(JSON.stringify(cat, null, 1))},\n\n${esc(JSON.stringify(zd, null, 1))}</pre><p class="sub">ГРУППА — код группы из zadano.json (например LC10FM). После запуска кабинетов — кнопка «Задать классу».</p></details>`;
      $('#dzcopy').addEventListener('click', () => { const i = $('#dzlink'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).catch(() => document.execCommand('copy')); $('#dzcopy').textContent = 'Скопировано'; });
    };
    $('#dzl').addEventListener('click', e => { const c = e.target.closest('button[data-a]'); if (!c) return; const i = +c.closest('li').dataset.i, a = c.dataset.a;
      if (a === 'del') refs.splice(i, 1); else { const j = a === 'up' ? i - 1 : i + 1; [refs[i], refs[j]] = [refs[j], refs[i]]; } draw(); });
    $('#dzadd').addEventListener('click', () => { const r = parseRefs($('#dzp').value), m = $('#dzm');
      r.ok.forEach(x => { if (refs.indexOf(x) < 0) refs.push(x); });
      m.hidden = !r.bad.length; m.textContent = r.bad.length ? 'Не нашёл: ' + r.bad.join(', ') : '';
      if (!r.bad.length) $('#dzp').value = ''; draw(); });
    $('#dlgo').addEventListener('click', async () => {
      const s = $('#dls').value, l1 = +$('#dl1').value, l2 = +$('#dl2').value, n = +$('#dln').value || 5;
      const {all} = await subTasks(s);
      const pool = mix(all.filter(t => t.lvl >= Math.min(l1, l2) && t.lvl <= Math.max(l1, l2) && refs.indexOf(t.ref) < 0)).sort((a, b) => a.d - b.d);
      const pick = n >= pool.length ? pool : Array.from({length: n}, (_, i) => pool[Math.round(i * (pool.length - 1) / Math.max(1, n - 1))]);
      pick.forEach(t => { if (refs.indexOf(t.ref) < 0) refs.push(t.ref); });
      const m = $('#dzm'); m.hidden = pick.length >= n; m.textContent = pick.length < n ? `В подтеме нашлось только ${zad(pick.length)} этих уровней${KEY ? '' : ' (закрытые книги — после входа)'}.` : ''; draw();
    });
    $('#dzt').addEventListener('input', out); $('#dzd').addEventListener('input', out);
    await draw();
  }

  async function viewDzOut(refs) {
    const t = Q.get('t') || 'Домашнее задание', due = Q.get('d');
    document.title = t + ' · Задачник';
    main.innerHTML = `<h1>${esc(t)}</h1><p class="sub">${zad(refs.length)}${due ? ' · сдать до ' + due.split('-').reverse().join('.') : ''}</p>` +
      (refs.some(r => { const x = resolve(r); return x && x.b.closed; }) && !KEY ? lockBox() : '') +
      (teacher() ? '<div class="row noprint"><button class="chip" id="dzans" aria-pressed="false">Ответы (учителю)</button><button class="chip" id="dzpr">Печать</button></div>' : '<div class="row noprint"><button class="chip" id="dzpr">Печать</button></div>') +
      '<div id="zl"><p class="sub">Загружаю…</p></div>';
    bindLock(viewDz);
    const ts = (await Promise.all(refs.map(getTask))).filter(Boolean);
    let showAns = false;
    const draw = () => showList($('#zl'), ts, {numbered: true, answers: showAns, openAns: showAns});
    await draw();
    const a = $('#dzans'); if (a) a.addEventListener('click', () => { showAns = !showAns; a.setAttribute('aria-pressed', showAns); draw(); });
    $('#dzpr').addEventListener('click', () => window.print());
    if (Q.get('print')) setTimeout(() => window.print(), 600);
  }

  // ---------- старт
  (async () => {
    try {
      [IDX, KEYS] = await Promise.all([getJSON(BASE + 'knigi.json'), getJSON(BASE + 'keys.json')]);
      IDX.books.forEach(b => { BOOK[b.id] = b; NUM[b.id] = {}; b.parts.forEach(p => p.nums.forEach(n => { NUM[b.id][n] = p.id; })); });
      if (anyClosed()) { if (!(await restore())) await fromServer(); }
      if (VIEW === 'dz') return await viewDz();
      const s = Q.get('s'), b = BOOK[Q.get('b')], p = b && b.parts.find(x => x.id === Q.get('p'));
      if (s && IDX.subs[s]) await viewSub(s);
      else if (p) await viewPart(b, p);
      else if (b) viewBook(b);
      else viewShelf();
    } catch (e) {
      main.innerHTML = '<p class="empty">Не удалось открыть задачник (' + esc(e.message) + '). Обновите страницу.</p>';
    }
  })();
})();
