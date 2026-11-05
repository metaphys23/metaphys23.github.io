// Тезаурус: шапка, вход по коду, все страницы-каталоги. Данные — /data/*.json (один источник правды).
// Страница — это пустой каркас <main data-page="…">; разметку строит этот файл. Каркасы делает tools/build.py.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var main = $('main'), PAGE = main.dataset.page;
  var MENU = [['/klass/', 'Классы', 'klass'], ['/temy/', 'Темы', 'temy'], ['/ekzameny/', 'Экзамены', 'ekzameny'], ['/uchebnik/', 'Учебник', 'uchebnik'],
    ['/praktikum/', 'Практикум', 'praktikum'], ['/eksperiment/', 'Эксперимент', 'eksperiment'], ['/inzheneriya/', 'Инженерия', 'inzheneriya'], ['/karta/', 'Карта', 'karta']];
  var SECTIONS = {uchebnik: ['Учебник', 'Теория по шести шагам Карты мышления: понятия → закономерности → обоснование → устройство мира → действие → проверка.', 'var(--s1)'],
    praktikum: ['Практикум', 'Тренажёры, тесты Т1–Т3, листки и ДЗ — по темам и номерам ОГЭ/ЕГЭ.', 'var(--s5)'],
    eksperiment: ['Экспериментальная физика', 'Лабораторные, опыты, самодельные приборы.', 'var(--s4)'],
    inzheneriya: ['Инженерия и робототехника', '3D-моделирование и печать, Arduino и ESP32, электроника, механизмы.', 'var(--s3)']};
  var KIND = {pdf: 'PDF', trenazher: 'Тренажёр', t1: 'Т1', t2: 'Т2', t3: 'Т3', dz: 'ДЗ', konspekt: 'Учебник', lab: 'Лаба'};
  var CLASSES = [7, 8, 9, 10, 11];

  // ---------- ученик: код <ГРУППА>-XXXX, хранится только на этом устройстве
  var CODE_RE = /^([A-Z]{2,3}\d{1,2}[A-Z]{0,3})-([A-HJ-NP-Z2-9]{4})$/;
  function student() { try { return JSON.parse(localStorage.getItem('mf:student') || 'null'); } catch (e) { return null; } }
  function setStudent(s) { try { s ? localStorage.setItem('mf:student', JSON.stringify(s)) : localStorage.removeItem('mf:student'); } catch (e) {} }
  function normCode(s) { return String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[–—_]/g, '-').replace(/^([A-Z]{2,3}\d{1,2}[A-Z]{0,3})([A-Z0-9]{4})$/, '$1-$2'); }

  // ---------- шапка
  var me = student();
  var cur = PAGE === 'section' ? main.dataset.section : PAGE;
  document.body.insertAdjacentHTML('afterbegin',
    '<header class="top"><div class="in"><a class="logo" href="/">Тезаурус</a>' +
    '<button class="btn ghost sm burger" aria-expanded="false" aria-controls="menu" aria-label="Меню">≡</button>' +
    '<nav class="menu" id="menu" aria-label="Разделы">' + MENU.map(function (m) { return '<a href="' + m[0] + '"' + (cur === m[2] ? ' aria-current="page"' : '') + '>' + m[1] + '</a>'; }).join('') + '</nav>' +
    '<div class="who">' + (me ? '<a class="btn sm" href="/zadano/">Задано мне</a><span title="код на этом устройстве">' + esc(me.title || me.group) + ' · ••' + esc(me.code.slice(-2)) + '</span><a href="#" id="logout">выйти</a>'
      : '<a class="btn sm" href="/voiti/">Войти как ученик</a>') + '</div></div></header>');
  $('.burger').addEventListener('click', function () { var m = $('#menu'), o = m.classList.toggle('open'); this.setAttribute('aria-expanded', o); });
  var lo = $('#logout'); if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); if (confirm('Выйти? Код забудется на этом устройстве, ответы в тестах останутся.')) { setStudent(null); location.href = '/'; } });
  document.body.insertAdjacentHTML('beforeend', '<footer>Тезаурус · физика, математика, инженерия. Задания ФИПИ — из открытого банка ФГБНУ «ФИПИ» с указанием номера. Ошибка на странице — напишите учителю.</footer>');

  // ---------- данные
  function get(u) { return fetch(u, {cache: 'no-cache'}).then(function (r) { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); }); }
  Promise.all([get('/data/catalog.json'), get('/data/temy.json'), get('/data/zadano.json')]).then(function (d) {
    var C = d[0].items, TEMY = d[1].sections, Z = d[2];
    var topicTitle = {}, topicSection = {};
    TEMY.forEach(function (s) { s.topics.forEach(function (t) { topicTitle[t.id] = t.title; topicSection[t.id] = s.id; }); });
    var byId = {}; C.forEach(function (x) { byId[x.id] = x; });
    var visible = function (x) { return x.status === 'otkryto'; };
    var forClass = function (k) { return C.filter(function (x) { return x.classes.indexOf(k) >= 0 && (x.status === 'otkryto' || (x.status === 'klass' && me && Z.groups[me.group] && Z.groups[me.group]['class'] === k)); }); };

    function item(x, extra) {
      return '<li><a href="' + esc(x.url) + '" data-id="' + esc(x.id) + '"><span class="badge k-' + x.kind + '">' + (KIND[x.kind] || x.kind) + '</span><b>' + esc(x.title) + '</b>' +
        (extra || '<span class="lvl">' + (x.level === 'star' ? '★' : '') + '</span>') + (x.desc ? '<small>' + esc(x.desc) + '</small>' : '') + '</a></li>';
    }
    function list(xs) { return xs.length ? '<ul class="mat">' + xs.map(function (x) { return item(x); }).join('') + '</ul>' : '<p class="empty">Пока пусто — материалы появятся по ходу курса.</p>'; }
    // материалы по темам: тема → подтема → список; open — раскрыть
    function byTopic(xs, open) {
      var order = [], g = {};
      TEMY.forEach(function (s) { s.topics.forEach(function (t) { order.push(t.id); }); });
      xs.forEach(function (x) { (g[x.topic] = g[x.topic] || []).push(x); });
      var keys = order.filter(function (k) { return g[k]; }).concat(Object.keys(g).filter(function (k) { return order.indexOf(k) < 0; }));
      if (!keys.length) return '<p class="empty">Пока пусто — материалы появятся по ходу курса.</p>';
      return keys.map(function (k) {
        var subs = [], gs = {}; g[k].forEach(function (x) { var s = x.sub || ''; if (!(s in gs)) { gs[s] = []; subs.push(s); } gs[s].push(x); });
        return '<details class="topic"' + (open ? ' open' : '') + '><summary>' + esc(topicTitle[k] || k) + '<span class="lvl">' + g[k].length + '</span></summary><div>' +
          subs.map(function (s) { return (s ? '<h3>' + esc(s) + '</h3>' : '') + list(gs[s]); }).join('') + '</div></details>';
      }).join('');
    }
    function filterBar(id) {
      return '<div class="row" id="' + id + '" role="group" aria-label="Фильтр"><button class="chip" aria-pressed="true" data-f="">Все</button>' +
        Object.keys(SECTIONS).map(function (k) { return '<button class="chip" aria-pressed="false" data-f="' + k + '">' + SECTIONS[k][0].split(' ')[0] + '</button>'; }).join('') + '</div>';
    }
    function bindFilter(id, xs, target, open) {
      var bar = $('#' + id), draw = function (f) { $(target).innerHTML = byTopic(xs.filter(function (x) { return !f || x.section === f; }), open); };
      bar.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; bar.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b); }); draw(b.dataset.f); });
      draw('');
    }

    // ---------- статус задания из того, что лежит на устройстве (движок тестов пишет exam:<id>:v<версия>)
    function examState(test) {
      var best = null;
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('exam:' + test + ':v') === 0) { try { best = JSON.parse(localStorage.getItem(k)); } catch (e) {} } }
      return best;
    }
    function status(a) {
      var x = byId[a.material]; if (!x) return ['st-late', 'нет материала'];
      var today = new Date().toISOString().slice(0, 10), late = a.due && a.due < today;
      var done = false, work = false;
      if (x.test) { var s = examState(x.test); if (s) { done = !!(s.sentOk || (s.sent && s.sent.length)); work = Object.keys(s.a || {}).some(function (k) { return String(s.a[k]).trim(); }); } }
      else { try { work = !!localStorage.getItem('mf:seen:' + x.id); } catch (e) {} }
      if (done) return ['st-done', x.kind === 'dz' && x.test ? 'сдано · часть 2 на проверке' : 'сдано'];
      if (late) return ['st-late', 'просрочено — сдать всё равно'];
      if (work) return ['st-work', x.test ? 'в работе' : 'открыт'];
      return ['st-new', 'не начато'];
    }
    function fmtDate(s) { if (!s) return ''; var p = s.split('-'); return p[2] + '.' + p[1]; }
    function zadanoList(group) {
      var xs = Z.assigned.filter(function (a) { return a.group === group; }).sort(function (a, b) { return (a.due || '').localeCompare(b.due || ''); });
      if (!xs.length) return '<p class="empty">Сейчас ничего не задано.</p>';
      return '<ul class="mat">' + xs.map(function (a) {
        var x = byId[a.material]; if (!x) return ''; var s = status(a);
        return '<li><a href="' + esc(x.url) + '" data-id="' + esc(x.id) + '"><span class="badge k-' + x.kind + '">' + (KIND[x.kind] || x.kind) + '</span><b>' + esc(x.title) + '</b><span class="st ' + s[0] + '">' + s[1] + '</span>' +
          '<small>' + (a.due ? 'до ' + fmtDate(a.due) + ' · ' : '') + esc(a.note || x.desc || '') + '</small></a></li>';
      }).join('') + '</ul>';
    }
    document.addEventListener('click', function (e) { var a = e.target.closest('a[data-id]'); if (a) try { localStorage.setItem('mf:seen:' + a.dataset.id, Date.now()); } catch (er) {} });

    // ---------- страницы
    var H = '';
    if (PAGE === 'home') {
      var fresh = C.filter(visible).slice().sort(function (a, b) { return (b.added || '').localeCompare(a.added || ''); }).slice(0, 5);
      H = '<h1>Тезаурус</h1><p class="sub">Физика, математика и инженерия: теория, тренажёры, тесты и домашние задания. Всё читается без входа; код ученика нужен, чтобы видеть свои задания и отправлять работы.</p>' +
        (me ? '<div class="card"><b>' + esc(me.title || me.group) + '</b> — <a href="/zadano/">задано мне →</a></div>' : '<div class="row"><a class="btn" href="/voiti/">Войти как ученик</a></div>') +
        '<h2>Классы</h2><div class="row">' + CLASSES.map(function (k) { return '<a class="chip" href="/klass/' + k + '/">' + k + ' класс</a>'; }).join('') + '</div>' +
        '<h2>Разделы</h2><div class="tiles">' + Object.keys(SECTIONS).map(function (k) { return '<a class="tile" style="--c:' + SECTIONS[k][2] + '" href="/' + k + '/"><b>' + SECTIONS[k][0] + '</b><span>' + SECTIONS[k][1] + '</span></a>'; }).join('') +
        '<a class="tile" style="--c:var(--s2)" href="/ekzameny/"><b>Экзамены</b><span>ОГЭ и ЕГЭ: задания по номерам, тренажёры и пробники.</span></a>' +
        '<a class="tile" style="--c:var(--s6)" href="/karta/"><b>Карта</b><span>Как читать материалы: 21 блок, знаки и шесть шагов мышления.</span></a></div>' +
        '<h2>Новое</h2>' + list(fresh);
    } else if (PAGE === 'klass') {
      var k = +main.dataset['class'];
      if (!k) { H = '<h1>Классы</h1><div class="tiles">' + CLASSES.map(function (c) { var n = forClass(c).length; return '<a class="tile" href="/klass/' + c + '/"><b>' + c + ' класс</b><span>' + (n ? n + ' материалов' : 'скоро') + '</span></a>'; }).join('') + '</div>'; }
      else {
        var mine = me && Z.groups[me.group] && Z.groups[me.group]['class'] === k;
        H = '<p class="crumbs"><a href="/klass/">Классы</a> / ' + k + ' класс</p><h1>' + k + ' класс</h1>' +
          '<div class="row">' + CLASSES.map(function (c) { return '<a class="chip" href="/klass/' + c + '/"' + (c === k ? ' aria-current="page"' : '') + '>' + c + '</a>'; }).join('') + '</div>' +
          (mine ? '<h2>Задано мне</h2>' + zadanoList(me.group) : '') + '<h2>Материалы по темам</h2>' + filterBar('f') + '<div id="tree"></div>';
      }
    } else if (PAGE === 'temy') {
      H = '<h1>Темы</h1><p class="sub">Один материал — в одном месте; к нему ведут класс, тема и номер экзамена.</p>' + TEMY.map(function (s) {
        return '<h2>' + esc(s.title) + '</h2>' + s.topics.map(function (t) {
          var xs = C.filter(function (x) { return visible(x) && x.topic === t.id; });
          return '<details class="topic"><summary>' + esc(t.title) + '<span class="lvl">' + (t.classes.length ? t.classes.join(', ') + ' кл · ' : '') + xs.length + '</span></summary><div>' + list(xs) + '</div></details>';
        }).join('');
      }).join('');
    } else if (PAGE === 'ekzameny') {
      var ex = function (e) { return C.filter(function (x) { return visible(x) && x.exam && x.exam[e]; }); };
      H = '<h1>Экзамены</h1><p class="sub">Т1 — тренажёр по темам, Т2 — тест по разделу, Т3 — пробник. Номера заданий ФИПИ появятся у материалов при разметке банка.</p>' +
        '<h2>ОГЭ</h2>' + list(ex('oge')) + '<h2>ЕГЭ</h2>' + list(ex('ege'));
    } else if (PAGE === 'section') {
      var sk = main.dataset.section, S = SECTIONS[sk], xs = C.filter(function (x) { return visible(x) && x.section === sk; });
      H = '<h1>' + S[0] + '</h1><p class="sub">' + S[1] + '</p><div class="row" id="cf" role="group" aria-label="Класс"><button class="chip" aria-pressed="true" data-k="">Все классы</button>' +
        CLASSES.map(function (c) { return '<button class="chip" aria-pressed="false" data-k="' + c + '">' + c + '</button>'; }).join('') + '</div><div id="tree"></div>';
      main.innerHTML = H; H = null;
      var drawS = function (c) { $('#tree').innerHTML = byTopic(xs.filter(function (x) { return !c || x.classes.indexOf(+c) >= 0; }), true); };
      $('#cf').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; this.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b); }); drawS(b.dataset.k); });
      drawS('');
    } else if (PAGE === 'karta') {
      var steps = [['Понятия', 'что это?', 1], ['Закономерности', 'как связано?', 2], ['Обоснование', 'почему так?', 3], ['Устройство мира', 'где это?', 4], ['Действие', 'как решать?', 5], ['Проверка', 'понял ли?', 6]];
      H = '<h1>Карта: как читать материалы</h1><p class="sub">Каждый материал собран из блоков 21 типа. Номер блока — «тема.порядковый» (3.4 — тема 3, блок 4): учитель говорит «откройте 3.4», и все смотрят в одно место — в тетради, на слайде и здесь.</p>' +
        '<div class="steps">' + steps.map(function (s) { return '<div style="background:var(--s' + s[2] + ')">' + s[2] + '. ' + s[0] + '<small>' + s[1] + '</small></div>'; }).join('') + '</div>' +
        '<p class="empty" style="margin-top:16px">Плакат с 21 блоком и знаками — следующая версия этой страницы; интерактивный граф понятий — позже.</p>';
    } else if (PAGE === 'voiti') {
      H = '<h1>Вход для ученика</h1><p class="sub">Код выдаёт учитель на бумажке, например <b>LC10FM-K7P3</b>. Код помнит этот телефон или компьютер; пароль не нужен.</p>' +
        '<form class="card" id="lf" novalidate><div class="field"><label for="code">Код ученика</label><input id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="LC10FM-K7P3" inputmode="text"></div>' +
        '<div class="field"><label for="nm">Фамилия и имя <span class="lvl">(пока нужны для отправки работ; хранятся только на этом устройстве)</span></label><input id="nm" class="plain" autocomplete="name" placeholder="Иванов Пётр"></div>' +
        '<div class="row"><button class="btn" type="submit">Войти</button></div><div class="msg" id="lm" role="status" aria-live="polite" hidden></div></form>';
      main.innerHTML = H; H = null;
      $('#lf').addEventListener('submit', function (e) {
        e.preventDefault(); var c = normCode($('#code').value), m = $('#lm'), mt = CODE_RE.exec(c); m.hidden = false; m.className = 'msg bad';
        if (!mt) { m.textContent = 'Код не похож на настоящий: сначала буквы школы, класс и группа, потом дефис и 4 знака (без букв O, I и цифр 0, 1).'; return; }
        var g = Z.groups[mt[1]]; if (!g) { m.textContent = 'Группы ' + mt[1] + ' нет на сайте. Проверьте код или спросите учителя.'; return; }
        var nm = $('#nm').value.trim().replace(/\s+/g, ' ');
        setStudent({code: c, group: mt[1], title: g.title, 'class': g['class'], name: nm, at: Date.now()});
        location.href = '/zadano/';
      });
      $('#code').addEventListener('blur', function () { this.value = normCode(this.value); });
    } else if (PAGE === 'zadano') {
      if (!me) { H = '<h1>Задано мне</h1><p class="empty">Сначала <a href="/voiti/">войдите по коду</a> — тогда здесь появятся задания вашего класса.</p>'; }
      else { var g = Z.groups[me.group] || {};
        H = '<p class="crumbs"><a href="/klass/' + (g['class'] || '') + '/">' + esc(g['class'] || '') + ' класс</a> / задано</p><h1>Задано мне</h1><p class="sub">' + esc(me.title || me.group) + ' · код ••' + esc(me.code.slice(-2)) +
          '. Статус «сдано» виден на этом устройстве; баллы части 2 ставит учитель. Сдавать можно и после срока.</p>' + zadanoList(me.group); }
    }
    if (H !== null) main.innerHTML = H;
    if (PAGE === 'klass' && $('#f')) bindFilter('f', forClass(+main.dataset['class']), '#tree', true);
  }).catch(function (e) { main.innerHTML = '<p class="empty">Не удалось загрузить каталог (' + esc(e.message) + '). Обновите страницу.</p>'; });
})();
