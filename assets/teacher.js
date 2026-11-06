// Кабинет учителя: классы и коды, тесты (редактор, импорт JSON), курсы, «Задать», работы и проверка, журнал, библиотека, профиль.
// Сервер — /api/t/* (metaphys-api v2). Владелец сайта может работать здесь своим токеном админки (его классы — без owner_id).
(function () {
  'use strict';
  var M = window.MF, esc = M.esc, $ = function (s, r) { return (r || document).querySelector(s); }, app = $('#app');
  var TABS = [['classes', 'Классы'], ['tests', 'Тесты'], ['courses', 'Курсы'], ['assign', 'Задать'], ['works', 'Работы'], ['journal', 'Журнал'], ['library', 'Библиотека'], ['profile', 'Профиль']];
  var TYPES = [['num', 'число'], ['one', 'один вариант'], ['many', 'несколько цифр'], ['text', 'слово'], ['photo', 'фото решения']];
  var KINDS = [['t1', 'Т1 · тренировка'], ['t2', 'Т2 · тест по разделу'], ['t3', 'Т3 · пробник'], ['dz', 'ДЗ']];
  var SHOW = [['after_due', 'после срока'], ['after_submit', 'сразу после сдачи'], ['never', 'никогда']];
  var STATUS = {new: ['ждёт проверки', 'st-work'], auto: ['проверено автоматически', 'st-done'], checked: ['проверено', 'st-done'], returned: ['на доработке', 'st-late'], submitted: ['ждёт проверки', 'st-work']};
  var me = null, owner = false, CLS = null;

  function fmt(s, d) { if (!s) return ''; var x = new Date(s); return isNaN(x) ? s : x.toLocaleString('ru-RU', d ? {day: '2-digit', month: '2-digit'} : {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}); }
  function flash(el, text, cls) { if (!el) return; el.hidden = false; el.className = 'msg ' + (cls || ''); el.textContent = text; }
  function need(r) { if (!r.body || !r.body.ok) throw new Error(M.message(r)); return r.body.data; }
  function api(m, p, b) { return M.api(m, p, b).then(need); }
  function opt(list, cur) { return list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur == null ? '' : cur) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(''); }
  function sel(name, list, cur, label, attrs) { return '<div class="field"><label>' + label + '</label><select name="' + name + '" ' + (attrs || '') + '>' + opt(list, cur) + '</select></div>'; }
  function inp(name, cur, label, type, attrs) { return '<div class="field"><label>' + label + '</label><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(cur == null ? '' : cur) + '" ' + (attrs || '') + '></div>'; }
  function formData(f) { var o = {}; Array.prototype.forEach.call(f.elements, function (e) { if (e.name) o[e.name] = e.type === 'checkbox' ? e.checked : e.value; }); return o; }
  function csv(rows) { return rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';'); }).join('\r\n'); }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([type ? text : '﻿' + text], {type: type || 'text/csv;charset=utf-8'})); a.download = name; a.click(); }
  function math(el) { try { if (window.renderMathInElement) window.renderMathInElement(el || app, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false}); } catch (e) {} }
  function classes(fresh) { if (CLS && !fresh) return Promise.resolve(CLS); return api('GET', '/api/t/classes').then(function (l) { CLS = l; return l; }); }
  function curClass(list) { var c = sessionStorage.getItem('mf:t:class'); return list.some(function (x) { return x.id === c; }) ? c : (list[0] ? list[0].id : ''); }
  function classSel(list, cur, all) { return sel('class', (all ? [['', 'все классы']] : []).concat(list.filter(function (c) { return !c.archived || c.id === cur; }).map(function (c) { return [c.id, (c.title || c.id) + ' · ' + c.id]; })), cur, 'Класс', 'data-class'); }
  function onClassChange(view) { var s = $('select[data-class]'); if (s) s.addEventListener('change', function () { sessionStorage.setItem('mf:t:class', this.value); show(view); }); }
  var catalog = null; function cat() { return catalog ? Promise.resolve(catalog) : fetch('/data/catalog.json', {cache: 'no-cache'}).then(function (r) { return r.json(); }).then(function (d) { catalog = d.items || []; return catalog; }).catch(function () { return []; }); }

  // ---------- вход
  if (!M.configured) { app.innerHTML = '<p class="empty">Сервер кабинетов не подключён (<code>window.API_BASE</code> пуст в <code>/config.js</code>).</p>'; return; }
  if (M.as || !M.token()) { try { if (localStorage.getItem('mf:admin_token')) { M.useKey('mf:admin_token'); owner = true; } } catch (e) {} }
  function myId() { return owner && !M.as ? 'admin' : me.id; }
  function loginView(tab, msg) {
    tab = tab || 'login';
    app.innerHTML = '<div class="row" role="tablist"><button class="chip" data-t="login" aria-pressed="' + (tab === 'login') + '">Войти</button><button class="chip" data-t="act" aria-pressed="' + (tab === 'act') + '">Первый вход по приглашению</button></div>' +
      '<form class="card" id="lf" style="max-width:440px"><div class="field"><label for="lg">Логин</label><input id="lg" class="plain" autocomplete="username" autocapitalize="none" spellcheck="false"></div>' +
      (tab === 'act' ? '<div class="field"><label for="iv">Код приглашения</label><input id="iv" autocomplete="one-time-code" placeholder="XXXX-XXXX-XXXX"></div>' : '') +
      '<div class="field"><label for="pw">' + (tab === 'act' ? 'Придумайте пароль (не короче 10 знаков)' : 'Пароль') + '</label><input id="pw" class="plain" type="password" autocomplete="' + (tab === 'act' ? 'new-password' : 'current-password') + '"></div>' +
      (tab === 'act' ? '<div class="field"><label for="pw2">Пароль ещё раз</label><input id="pw2" class="plain" type="password" autocomplete="new-password"></div>' : '') +
      '<div class="row"><button class="btn" type="submit">' + (tab === 'act' ? 'Активировать и войти' : 'Войти') + '</button></div><div class="msg" id="m" role="status" hidden></div>' +
      '<p class="cmt muted">Логин и приглашение выдаёт владелец сайта. Забыли пароль — попросите новое приглашение. Владелец сайта входит через <a href="/admin/">админку</a> и потом открывает эту страницу.</p></form>';
    if (msg) flash($('#m'), msg, 'bad');
    app.querySelector('[role=tablist]').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) loginView(b.dataset.t); });
    $('#lf').addEventListener('submit', function (e) {
      e.preventDefault(); var m = $('#m'), body = {login: $('#lg').value.trim().toLowerCase(), password: $('#pw').value};
      if (tab === 'act') { if ($('#pw').value !== $('#pw2').value) return flash(m, 'Пароли не совпадают', 'bad'); body.invite = $('#iv').value; }
      flash(m, 'Проверяю…'); M.useKey('mf:teacher_token'); owner = false;
      M.api('POST', tab === 'act' ? '/api/auth/teacher/activate' : '/api/auth/teacher', body).then(function (r) { if (!r.body || !r.body.ok) return flash(m, M.message(r), 'bad'); M.setToken(r.body.data.token); start(); });
    });
  }
  function start() {
    if (!M.token()) return loginView();
    M.api('GET', '/api/me').then(function (r) {
      var d = r.body && r.body.ok && r.body.data;
      if (!d || (d.role !== 'teacher' && d.role !== 'admin')) { M.setToken(null); $('#tabs').innerHTML = ''; $('#logout').hidden = true; return loginView('login', r.status === 403 ? M.message(r) : ''); }
      owner = d.role === 'admin'; me = owner ? {display_name: 'владелец сайта', prefix: ''} : d.teacher;
      if (owner && M.as) return M.api('GET', '/api/admin/teachers').then(function (r2) {
        var t = (r2.body && r2.body.ok ? r2.body.data : []).find(function (x) { return x.id === M.as; }) || {id: M.as, display_name: M.as, prefix: ''};
        me = t; $('#who').textContent = 'просмотр: ' + t.display_name; $('#logout').hidden = true;
        document.querySelector('main').insertAdjacentHTML('afterbegin', '<p class="msg">Вы смотрите кабинет учителя <b>' + esc(t.display_name) + '</b> глазами владельца — только чтение, кнопки сохранения не сработают.</p>');
        $('#tabs').innerHTML = TABS.filter(function (x) { return x[0] !== 'profile'; }).map(function (x) { return '<a data-tab="' + x[0] + '">' + x[1] + '</a>'; }).join(''); route();
      });
      $('#who').textContent = me.display_name + (owner ? '' : ' · ' + me.prefix); $('#logout').hidden = false; $('#logout').textContent = owner ? 'войти учителем' : 'выйти';
      $('#tabs').innerHTML = TABS.filter(function (t) { return !(owner && t[0] === 'profile'); }).map(function (t) { return '<a data-tab="' + t[0] + '">' + t[1] + '</a>'; }).join('');
      route();
    });
  }
  // владелец здесь работает токеном админки: «выйти» не трогает его вход в админку, а предлагает войти учителем
  $('#logout').addEventListener('click', function (e) { e.preventDefault(); if (owner) { M.useKey('mf:teacher_token'); owner = false; me = null; $('#tabs').innerHTML = ''; $('#who').textContent = ''; this.hidden = true; return loginView(); } M.setToken(null); location.hash = ''; location.reload(); });
  $('#tabs').addEventListener('click', function (e) { var a = e.target.closest('a[data-tab]'); if (a) location.hash = a.dataset.tab; });
  window.addEventListener('hashchange', function () { if (me) route(); });
  function route() { var h = location.hash.slice(1).split('/'); show(h[0] || 'works', h[1]); }
  function show(tab, arg) {
    document.querySelectorAll('#tabs a').forEach(function (a) { a.toggleAttribute('aria-current', a.dataset.tab === tab); });
    app.innerHTML = '<p class="sub">Загружаю…</p>'; app.onclick = null; app.onchange = null; app.oninput = null;
    Promise.resolve().then(function () { return (VIEWS[tab] || VIEWS.works)(arg); }).catch(function (e) { app.innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; });
  }
  var VIEWS = {};

  // ================= КЛАССЫ
  VIEWS.classes = function (id) {
    if (id) return classView(id);
    return classes(true).then(function (list) {
      app.innerHTML = '<h2>Мои классы</h2>' + (list.length ? '<table class="w"><tr><th>Группа</th><th>Название</th><th>Класс</th><th class="right">Учеников</th><th class="right">Свободных кодов</th><th></th></tr>' + list.map(function (c) {
        return '<tr' + (c.archived ? ' class="muted"' : '') + '><td class="code">' + esc(c.id) + '</td><td>' + esc(c.title) + (c.archived ? ' <span class="pill">архив</span>' : '') + '</td><td>' + esc(c.klass) + '</td><td class="num">' + c.n_students + '</td><td class="num">' + c.n_free + '</td><td class="right"><a class="btn sm ghost" href="#classes/' + esc(c.id) + '">коды и ученики</a> <button class="btn sm ghost" data-arch="' + esc(c.id) + '" data-v="' + (c.archived ? '' : '1') + '">' + (c.archived ? 'вернуть' : 'в архив') + '</button></td></tr>';
      }).join('') + '</table>' : '<p class="empty">Классов пока нет — заведите первый.</p>') +
        '<form class="card" id="cf"><h3>Новый класс</h3><div class="grid">' + (owner ? inp('id', '', 'Группа (LC10FM)') : '') + inp('klass', '', 'Класс (число)', 'number', 'min="1" max="11" required') + (owner ? '' : inp('suffix', '', 'Буква латиницей (B, FM)', 'text', 'maxlength="3"')) + inp('title', '', 'Название (8 Б)') + inp('year', '2026/27', 'Учебный год') + '</div>' +
        (owner ? '' : '<p class="sub">Группа получится <b class="code" id="gid">' + esc(me.prefix) + '…</b> — это начало кодов учеников (<span class="code">' + esc(me.prefix) + '8B-K7P3</span>).</p>') + '<div class="row"><button class="btn">Создать</button></div><div class="msg" id="m" hidden></div></form>';
      var f = $('#cf');
      f.addEventListener('input', function () { if ($('#gid')) $('#gid').textContent = me.prefix + (f.klass.value || '…') + (f.suffix.value || '').toUpperCase(); });
      f.addEventListener('submit', function (e) { e.preventDefault(); api('POST', '/api/t/classes', formData(f)).then(function (c) { location.hash = 'classes/' + c.id; }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
      app.onclick = function (e) { var b = e.target.closest('button[data-arch]'); if (!b) return; api('PATCH', '/api/t/classes/' + b.dataset.arch, {archived: !!b.dataset.v}).then(function () { show('classes'); }).catch(function (er) { alert(er.message); }); };
    });
  }
  function classView(id) {
    return Promise.all([classes(true), api('GET', '/api/t/classes/' + id + '/codes'), api('GET', '/api/t/students?class_id=' + encodeURIComponent(id))]).then(function (d) {
      var c = d[0].find(function (x) { return x.id === id; }) || {id: id}, codes = d[1], st = d[2], byCode = {}; st.forEach(function (s) { byCode[s.code] = s; });
      var free = codes.filter(function (x) { return x.status === 'new'; });
      app.innerHTML = '<p class="crumbs no-print"><a href="#classes">← классы</a></p><h2 class="no-print">' + esc(c.title || id) + ' <span class="code muted">' + esc(id) + '</span></h2>' +
        '<form id="gen" class="row no-print" style="align-items:end">' + inp('count', 5, 'Сколько кодов', 'number', 'min="1" max="60"') + inp('note', '', 'Пометка (номер в журнале, без ФИО)') + '<button class="btn">Создать коды</button></form>' +
        '<p class="sub no-print">Свободных ' + free.length + ' · <a href="#" id="print">печать карточек</a> · <a href="#" id="csv">CSV</a>. Пометка — ваш ключ к ФИО; на сайт ФИО не попадает.</p><div class="msg no-print" id="m" hidden></div>' +
        '<table class="w no-print"><tr><th>Код</th><th>Ученик (имя на сайте)</th><th>Статус</th><th>Пометка</th><th>Был</th><th></th></tr>' + codes.map(function (k) {
          var s = byCode[k.code];
          return '<tr><td class="code">' + esc(k.code) + '</td><td>' + (s ? '<input data-name="' + esc(s.id) + '" value="' + esc(s.display_name) + '">' : '<span class="muted">—</span>') + '</td><td>' + ({new: 'свободен', used: s && s.status === 'blocked' ? 'заблокирован' : 'занят', revoked: 'отозван'}[k.status] || k.status) + '</td>' +
            '<td><input data-note="' + esc(k.code) + '" value="' + esc(k.note) + '" placeholder="№"></td><td class="muted">' + fmt(s && s.last_seen) + '</td><td class="right">' +
            (s ? '<button class="btn sm ghost" data-act="reset" data-code="' + esc(k.code) + '">сбросить пароль</button> <button class="btn sm ghost" data-block="' + esc(s.id) + '" data-v="' + (s.status === 'blocked' ? 'active' : 'blocked') + '">' + (s.status === 'blocked' ? 'разблокировать' : 'заблокировать') + '</button> ' : '') +
            (k.status !== 'revoked' ? '<button class="btn sm ghost" data-act="revoke" data-code="' + esc(k.code) + '">отозвать</button>' : '') + '</td></tr>';
        }).join('') + '</table>' +
        '<div class="cards">' + free.map(function (k) { return '<div class="cardp"><div>Тезаурус · ' + esc(c.title || id) + '</div><b>' + esc(k.code) + '</b><div>' + esc(location.host) + '/me/ → «Регистрация по коду»: имя для сайта + пароль. Код и пароль никому не показывать.</div>' + (k.note ? '<div style="font-size:11px;color:#777">' + esc(k.note) + '</div>' : '') + '</div>'; }).join('') + '</div>';
      $('#gen').addEventListener('submit', function (e) { e.preventDefault(); var v = formData(this); api('POST', '/api/t/classes/' + id + '/codes', {count: +v.count, note: v.note}).then(function () { show('classes', id); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
      $('#print').addEventListener('click', function (e) { e.preventDefault(); window.print(); });
      $('#csv').addEventListener('click', function (e) { e.preventDefault(); download('коды-' + id + '.csv', csv([['код', 'статус', 'пометка', 'имя на сайте']].concat(codes.map(function (k) { return [k.code, k.status, k.note, byCode[k.code] ? byCode[k.code].display_name : '']; })))); });
      app.onclick = function (e) {
        var b = e.target.closest('button[data-act]'), bl = e.target.closest('button[data-block]');
        if (b) { if (!confirm(b.dataset.act === 'reset' ? 'Сбросить пароль ' + b.dataset.code + '? Ученик зарегистрируется заново тем же кодом.' : 'Отозвать код ' + b.dataset.code + '? Ученик потеряет доступ.')) return; api('POST', '/api/t/codes/' + b.dataset.code + '/' + b.dataset.act, {}).then(function () { show('classes', id); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); }
        if (bl) api('PATCH', '/api/t/students/' + bl.dataset.block, {status: bl.dataset.v}).then(function () { show('classes', id); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      };
      app.onchange = function (e) {
        var n = e.target.closest('input[data-note]'), nm = e.target.closest('input[data-name]');
        if (n) api('POST', '/api/t/codes/' + n.dataset.note + '/note', {note: n.value}).catch(function (er) { flash($('#m'), er.message, 'bad'); });
        if (nm) api('PATCH', '/api/t/students/' + nm.dataset.name, {display_name: nm.value}).then(function () { flash($('#m'), 'Сохранено', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      };
    });
  }

  // ================= ТЕСТЫ
  var BLANK_TASK = function (type, n) { var t = {n: String(n), type: type, text: '', pts: 1, hint: '', solution: '', photo: false}; if (type === 'num') { t.key = ''; t.tol = ''; t.unit = ''; } if (type === 'one') { t.choices = ['', '']; t.key = 1; } if (type === 'many') { t.choices = []; t.key = ''; t.ordered = false; t.partial = true; t.pts = 2; } if (type === 'text') t.accept = []; if (type === 'photo') t.pts = 3; return t; };
  var cur = null; // редактируемый тест
  VIEWS.tests = function (id) {
    if (id) return testEditor(id);
    return api('GET', '/api/t/tests').then(function (list) {
      app.innerHTML = '<h2>Мои тесты</h2><div class="row"><a class="btn" href="#tests/new">Новый тест</a><button class="btn ghost" id="imp">Импорт JSON</button><a class="btn ghost" href="#library">Взять из библиотеки</a></div>' +
        (list.length ? '<table class="w"><tr><th>Название</th><th>Тип</th><th>Кл.</th><th class="right">Заданий / баллов</th><th>Статус</th><th>Обновлён</th><th></th></tr>' + list.map(function (t) {
          return '<tr' + (t.status === 'archived' ? ' class="muted"' : '') + '><td><a href="#tests/' + esc(t.id) + '">' + esc(t.title) + '</a>' + (t.origin ? ' <span class="pill">из библиотеки</span>' : '') + '</td><td>' + esc(t.kind.toUpperCase()) + '</td><td>' + esc(t.klass || '') + '</td><td class="num">' + t.ntasks + ' / ' + t.max + '</td><td>' + ({draft: 'черновик', published: 'опубликован', archived: 'архив'}[t.status] || t.status) +
            ({pending: ' · <span class="pill">на модерации</span>', approved: ' · <span class="pill ok">в библиотеке</span>', rejected: ' · <span class="pill bad">отклонён</span>'}[t.share_status] || '') + '</td><td class="muted">' + fmt(t.updated_at) + '</td><td class="right"><button class="btn sm ghost" data-copy="' + esc(t.id) + '">копия</button> <a class="btn sm ghost" href="#assign" data-asg="' + esc(t.id) + '">задать</a></td></tr>';
        }).join('') + '</table>' : '<p class="empty">Тестов пока нет. Начните с «Новый тест» или импортируйте JSON (формат — как у кнопки «Экспорт JSON» в редакторе).</p>') +
        '<div class="card" id="impbox" hidden><h3>Импорт теста из JSON</h3><p class="sub">Вставьте JSON теста (например, выгрузку хаба из банка задач). Ключи и баллы сервер проверит при сохранении.</p><textarea class="editor" id="impjson" style="min-height:30vh" spellcheck="false"></textarea><div class="row"><button class="btn" id="impgo">Создать тест</button></div><div class="msg" id="im" hidden></div></div>';
      $('#imp').addEventListener('click', function () { $('#impbox').hidden = !$('#impbox').hidden; });
      $('#impgo').addEventListener('click', function () { var o; try { o = JSON.parse($('#impjson').value); } catch (e) { return flash($('#im'), 'Это не JSON: ' + e.message, 'bad'); } api('POST', '/api/t/tests', o).then(function (t) { location.hash = 'tests/' + t.id; }).catch(function (er) { flash($('#im'), er.message, 'bad'); }); });
      app.onclick = function (e) {
        var c = e.target.closest('button[data-copy]'), a = e.target.closest('a[data-asg]');
        if (c) api('POST', '/api/t/tests/' + c.dataset.copy + '/copy', {}).then(function (t) { location.hash = 'tests/' + t.id; }).catch(function (er) { alert(er.message); });
        if (a) sessionStorage.setItem('mf:t:asg', JSON.stringify({kind: 'test', ref: a.dataset.asg}));
      };
    });
  };
  function testEditor(id) {
    var p = id === 'new' ? Promise.resolve({title: '', kind: 't2', klass: '', attempts: 2, check_mode: 'end', show_answers: 'after_due', time_limit_min: 0, intro: '', blocks: [{title: 'Часть 1', tasks: [BLANK_TASK('num', 1)]}], status: 'draft'}) : api('GET', '/api/t/tests/' + id);
    return p.then(function (t) { cur = t; drawTest(id, false); });
  }
  function taskFields(t, bi, ti) {
    var k = 'data-b="' + bi + '" data-t="' + ti + '"', f = function (name, val, label, type, attrs) { return '<div class="field"><label>' + label + '</label><input ' + k + ' data-f="' + name + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || '') + '></div>'; };
    var h = '<div class="task"><div class="head"><b>№</b><input ' + k + ' data-f="n" value="' + esc(t.n) + '" style="width:70px"><select ' + k + ' data-f="type">' + opt(TYPES, t.type) + '</select><span class="pill">' + t.pts + ' б.</span><span style="flex:1"></span>' +
      '<button type="button" class="btn sm ghost" data-mv="-1" ' + k + ' title="выше">↑</button><button type="button" class="btn sm ghost" data-mv="1" ' + k + ' title="ниже">↓</button><button type="button" class="btn sm ghost" data-del ' + k + ' title="удалить">✕</button></div>' +
      '<div class="field"><label>Условие (формулы в $…$)</label><textarea ' + k + ' data-f="text" rows="3">' + esc(t.text) + '</textarea></div><div class="grid">' + f('pts', t.pts, 'Баллы', 'number', 'min="0" max="20"');
    if (t.type === 'num') h += f('key', Array.isArray(t.key) ? t.key.join('; ') : t.key, 'Ответ (несколько — через ;)') + f('tol', t.tol, 'Допуск: 0.05 или 2%') + f('unit', t.unit, 'Единица у поля (м/с)');
    if (t.type === 'one') h += f('key', t.key, 'Верный вариант (номер)', 'number', 'min="1"');
    if (t.type === 'many') h += f('key', t.key, 'Ответ — цифры (213)') + '<label class="chk"><input type="checkbox" ' + k + ' data-f="ordered"' + (t.ordered ? ' checked' : '') + '> порядок важен</label><label class="chk"><input type="checkbox" ' + k + ' data-f="partial"' + (t.partial ? ' checked' : '') + '> одна ошибка — минус балл</label>';
    if (t.type === 'text') h += f('accept', (t.accept || []).join('|'), 'Допустимые ответы через |');
    h += f('img', t.img, 'Рисунок (адрес /… или https://)') + '</div>';
    if (t.type === 'one' || t.type === 'many') h += '<div class="field"><label>Варианты — по одному в строке</label><textarea ' + k + ' data-f="choices" rows="3">' + esc((t.choices || []).join('\n')) + '</textarea></div>';
    h += '<div class="grid"><div class="field"><label>Подсказка (видна ученику)</label><input ' + k + ' data-f="hint" value="' + esc(t.hint) + '"></div><div class="field"><label>Решение (после сдачи, по настройке теста)</label><input ' + k + ' data-f="solution" value="' + esc(t.solution) + '"></div></div>' +
      (t.type !== 'photo' ? '<label class="chk"><input type="checkbox" ' + k + ' data-f="photo"' + (t.photo ? ' checked' : '') + '> попросить фото решения (балл учителя важнее авто)</label>' : '') + '</div>';
    return h;
  }
  function preview(t) {
    var n = 0;
    return '<div class="card"><h3>' + esc(t.title || 'Без названия') + '</h3>' + (t.intro ? '<p>' + esc(t.intro) + '</p>' : '') + (t.blocks || []).map(function (b) {
      return '<div class="block"><h3>' + esc(b.title || '') + '</h3>' + (b.tasks || []).map(function (x) { n++;
        return '<div class="task"><div class="head"><b>' + esc(x.n) + '</b><span class="pill">' + x.pts + ' б.</span></div><div>' + esc(x.text) + '</div>' + (x.img ? '<img class="photo" src="' + esc(x.img) + '" alt="">' : '') +
          ((x.type === 'one' || x.type === 'many') ? '<ol>' + (x.choices || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' : '') +
          '<p class="muted">Ключ: <b>' + esc(x.type === 'text' ? (x.accept || []).join(' | ') : x.type === 'photo' ? 'проверяет учитель' : (Array.isArray(x.key) ? x.key.join('; ') : x.key)) + '</b>' + (x.tol ? ' ± ' + esc(x.tol) : '') + (x.unit ? ' ' + esc(x.unit) : '') + (x.photo ? ' · нужно фото' : '') + '</p></div>';
      }).join('') + '</div>';
    }).join('') + '<p class="muted">Заданий ' + n + ' · баллов ' + (t.blocks || []).reduce(function (s, b) { return s + (b.tasks || []).reduce(function (q, x) { return q + (+x.pts || 0); }, 0); }, 0) + '</p></div>';
  }
  function drawTest(id, pv) {
    var t = cur, isNew = id === 'new', mine = isNew || !t.owner_id || t.owner_id === myId();
    app.innerHTML = '<p class="crumbs"><a href="#tests">← тесты</a></p><h2>' + (isNew ? 'Новый тест' : esc(t.title)) + '</h2>' +
      (!mine ? '<p class="msg">Это тест из библиотеки. Чтобы править или задать — сделайте копию себе. <button class="btn sm" id="cp">Копию себе</button></p>' : '') +
      '<div class="row"><button class="btn ghost" id="pv">' + (pv ? 'Редактор' : 'Предпросмотр с ключами') + '</button><button class="btn ghost" id="ex">Экспорт JSON</button>' +
      (!isNew && mine ? '<button class="btn ghost" id="st" data-v="' + (t.status === 'archived' ? 'draft' : 'archived') + '">' + (t.status === 'archived' ? 'Вернуть из архива' : 'В архив') + '</button><button class="btn ghost" id="sh">' + (t.share_status === 'approved' ? 'В библиотеке ✓' : t.share_status === 'pending' ? 'На модерации…' : 'Поделиться в библиотеку') + '</button><button class="btn ghost" id="rg" title="после исправления ключа">Пересчитать сдачи</button>' : '') + '</div>' +
      (pv ? preview(t) : '<form id="tf"><div class="card"><div class="grid">' + inp('title', t.title, 'Название') + sel('kind', KINDS, t.kind, 'Тип') + inp('klass', t.klass, 'Класс', 'number', 'min="1" max="11"') + inp('attempts', t.attempts, 'Попыток (0 — без лимита)', 'number', 'min="0" max="20"') +
        sel('check_mode', [['end', 'после сдачи'], ['each', 'после каждого задания (только Т1)']], t.check_mode, 'Проверка') + sel('show_answers', SHOW, t.show_answers, 'Показать ответы') + inp('time_limit_min', t.time_limit_min, 'Мягкий таймер, мин (0 — нет)', 'number', 'min="0"') + '</div>' +
        '<div class="field"><label>Вступление (видно ученику)</label><textarea name="intro" rows="2">' + esc(t.intro) + '</textarea></div></div>' +
        (t.blocks || []).map(function (b, bi) { return '<div class="block"><div class="row" style="align-items:end"><div class="field" style="flex:1;margin:0"><label>Блок ' + (bi + 1) + '</label><input data-b="' + bi + '" data-f="_btitle" value="' + esc(b.title) + '"></div><button type="button" class="btn sm ghost" data-delb="' + bi + '">удалить блок</button></div>' +
          (b.tasks || []).map(function (x, ti) { return taskFields(x, bi, ti); }).join('') + '<div class="row"><select data-addtype="' + bi + '">' + opt(TYPES, 'num') + '</select><button type="button" class="btn sm" data-add="' + bi + '">+ задание</button></div></div>'; }).join('') +
        '<div class="row"><button type="button" class="btn ghost" id="addb">+ блок</button></div>' +
        (mine ? '<div class="row" style="position:sticky;bottom:0;background:var(--paper);padding:10px 0"><button class="btn">Сохранить</button><span class="muted" id="dirty"></span></div>' : '') + '</form>') + '<div class="msg" id="m" hidden></div>';
    if (pv) math();
    var f = $('#tf'), m = $('#m');
    function nums(task) { return task; }
    function setF(el) {
      var bi = +el.dataset.b, ti = el.dataset.t, k = el.dataset.f, v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === '_btitle') { t.blocks[bi].title = v; return; }
      var task = t.blocks[bi].tasks[+ti];
      if (k === 'choices') v = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (k === 'accept') v = v.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      if (k === 'key' && task.type === 'num' && /;/.test(v)) v = v.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      if (k === 'pts') v = +v;
      if (k === 'type') { var nt = BLANK_TASK(v, task.n); nt.text = task.text; t.blocks[bi].tasks[+ti] = nt; drawTest(id, false); return; }
      task[k] = v; if ($('#dirty')) $('#dirty').textContent = 'есть несохранённые изменения';
    }
    if (f) {
      f.addEventListener('input', function (e) { if (e.target.dataset.f && e.target.tagName !== 'SELECT') setF(e.target); else if (e.target.name) { t[e.target.name] = e.target.value; } });
      f.addEventListener('change', function (e) { if (e.target.dataset.f && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox')) setF(e.target); else if (e.target.name) t[e.target.name] = e.target.value; });
      f.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.type === 'submit') return;
        var bi = +b.dataset.b, ti = +b.dataset.t;
        if (b.dataset.add != null) { var bl = t.blocks[+b.dataset.add], all = t.blocks.reduce(function (s, x) { return s + x.tasks.length; }, 0); bl.tasks.push(BLANK_TASK($('select[data-addtype="' + b.dataset.add + '"]').value, all + 1)); drawTest(id, false); }
        else if (b.dataset.del != null) { if (confirm('Удалить задание?')) { t.blocks[bi].tasks.splice(ti, 1); drawTest(id, false); } }
        else if (b.dataset.mv) { var arr = t.blocks[bi].tasks, j = ti + +b.dataset.mv; if (j >= 0 && j < arr.length) { var x = arr[ti]; arr[ti] = arr[j]; arr[j] = x; drawTest(id, false); } }
        else if (b.dataset.delb != null) { if (confirm('Удалить блок со всеми заданиями?')) { t.blocks.splice(+b.dataset.delb, 1); drawTest(id, false); } }
        else if (b.id === 'addb') { t.blocks.push({title: 'Часть ' + (t.blocks.length + 1), tasks: []}); drawTest(id, false); }
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = formData(f); ['title', 'kind', 'klass', 'attempts', 'check_mode', 'show_answers', 'time_limit_min', 'intro'].forEach(function (k) { t[k] = v[k]; });
        flash(m, 'Сохраняю…'); api(isNew ? 'POST' : 'PUT', isNew ? '/api/t/tests' : '/api/t/tests/' + id, t).then(function (r) {
          cur = r; if (isNew) { location.hash = 'tests/' + r.id; return; } drawTest(id, false); flash($('#m'), 'Сохранено (версия ' + r.version + ')' + (r.used_by_submissions ? '. Уже есть сдач: ' + r.used_by_submissions + ' — если меняли ключи, нажмите «Пересчитать сдачи».' : ''), 'ok');
        }).catch(function (er) { flash(m, er.message, 'bad'); });
      });
    }
    $('#pv').addEventListener('click', function () { if (f) { var v = formData(f); ['title', 'kind', 'klass', 'attempts', 'check_mode', 'show_answers', 'time_limit_min', 'intro'].forEach(function (k) { t[k] = v[k]; }); } drawTest(id, !pv); });
    $('#ex').addEventListener('click', function () { var o = JSON.parse(JSON.stringify(t)); ['id', 'owner_id', 'created_at', 'updated_at', 'version', 'share_status', 'share_note', 'status', 'origin', 'used_by_submissions'].forEach(function (k) { delete o[k]; }); download((t.title || 'тест') + '.json', JSON.stringify(o, null, 1), 'application/json'); });
    if ($('#cp')) $('#cp').addEventListener('click', function () { api('POST', '/api/t/tests/' + id + '/copy', {}).then(function (x) { location.hash = 'tests/' + x.id; }).catch(function (er) { flash(m, er.message, 'bad'); }); });
    if ($('#st')) $('#st').addEventListener('click', function () { api('POST', '/api/t/tests/' + id + '/status', {status: this.dataset.v}).then(function () { testEditor(id); }).catch(function (er) { flash(m, er.message, 'bad'); }); });
    if ($('#sh')) $('#sh').addEventListener('click', function () { if (t.share_status === 'approved' || t.share_status === 'pending') return; var note = prompt('Пара слов для коллег: для кого тест, что проверяет', ''); if (note == null) return; api('POST', '/api/t/tests/' + id + '/share', {note: note}).then(function () { testEditor(id); }).catch(function (er) { flash(m, er.message, 'bad'); }); });
    if ($('#rg')) $('#rg').addEventListener('click', function () { if (!confirm('Пересчитать автобаллы всех сдач этого теста по текущим ключам? Баллы, поставленные вручную, сохранятся.')) return; api('POST', '/api/t/tests/' + id + '/regrade', {}).then(function (r) { flash(m, 'Пересчитано сдач: ' + r.regraded, 'ok'); }).catch(function (er) { flash(m, er.message, 'bad'); }); });
  }

  // ================= КУРСЫ
  var curC = null;
  VIEWS.courses = function (id) {
    if (id) return courseEditor(id);
    return api('GET', '/api/t/courses').then(function (list) {
      app.innerHTML = '<h2>Мои курсы</h2><p class="sub">Курс — модули по порядку; в модуле — тексты, материалы сайта, ссылки и тесты. Модуль можно открыть с даты. Задаётся классу целиком, журнал ведётся по каждому тесту.</p><div class="row"><a class="btn" href="#courses/new">Новый курс</a></div>' +
        (list.length ? '<table class="w"><tr><th>Название</th><th>Кл.</th><th class="right">Модулей / пунктов</th><th>Статус</th><th>Обновлён</th><th></th></tr>' + list.map(function (c) { return '<tr><td><a href="#courses/' + esc(c.id) + '">' + esc(c.title) + '</a></td><td>' + esc(c.klass || '') + '</td><td class="num">' + c.nmodules + ' / ' + c.nitems + '</td><td>' + esc(c.status) + (c.share_status === 'approved' ? ' · <span class="pill ok">в библиотеке</span>' : c.share_status === 'pending' ? ' · <span class="pill">на модерации</span>' : '') + '</td><td class="muted">' + fmt(c.updated_at) + '</td><td class="right"><a class="btn sm ghost" href="#assign" data-asg="' + esc(c.id) + '">задать</a></td></tr>'; }).join('') + '</table>' : '<p class="empty">Курсов пока нет.</p>');
      app.onclick = function (e) { var a = e.target.closest('a[data-asg]'); if (a) sessionStorage.setItem('mf:t:asg', JSON.stringify({kind: 'course', ref: a.dataset.asg})); };
    });
  };
  function courseEditor(id) {
    return Promise.all([id === 'new' ? {title: '', klass: '', description: '', modules: [{title: 'Модуль 1', opens: '', items: []}]} : api('GET', '/api/t/courses/' + id), api('GET', '/api/t/tests'), api('GET', '/api/t/library').catch(function () { return {tests: []}; }), cat()]).then(function (d) {
      curC = d[0]; var tests = d[1].filter(function (t) { return t.status !== 'archived'; }).map(function (t) { return [t.id, t.title + ' · ' + t.kind.toUpperCase()]; }).concat(d[2].tests.filter(function (t) { return t.owner_id !== myId(); }).map(function (t) { return [t.id, '📚 ' + t.title]; }));
      var mats = d[3].map(function (x) { return [x.id, x.title]; });
      drawCourse(id, tests, mats);
    });
  }
  function drawCourse(id, tests, mats) {
    var c = curC, isNew = id === 'new', IT = [['text', 'текст'], ['material', 'материал сайта'], ['test', 'тест'], ['link', 'ссылка']];
    app.innerHTML = '<p class="crumbs"><a href="#courses">← курсы</a></p><h2>' + (isNew ? 'Новый курс' : esc(c.title)) + '</h2><form id="cf"><div class="card"><div class="grid">' + inp('title', c.title, 'Название') + inp('klass', c.klass, 'Класс', 'number', 'min="1" max="11"') + '</div><div class="field"><label>Описание</label><textarea name="description" rows="2">' + esc(c.description) + '</textarea></div></div>' +
      c.modules.map(function (mo, mi) {
        return '<div class="block"><div class="grid"><div class="field"><label>Модуль ' + (mi + 1) + '</label><input data-m="' + mi + '" data-f="title" value="' + esc(mo.title) + '"></div><div class="field"><label>Открыть с (пусто — сразу)</label><input type="date" data-m="' + mi + '" data-f="opens" value="' + esc(mo.opens || '') + '"></div></div>' +
          mo.items.map(function (it, ii) {
            var k = 'data-m="' + mi + '" data-i="' + ii + '"', refField = it.type === 'test' ? '<select ' + k + ' data-f="ref">' + opt([['', '— тест —']].concat(tests), it.ref) + '</select>' : it.type === 'material' ? '<select ' + k + ' data-f="ref">' + opt([['', '— материал —']].concat(mats), it.ref) + '</select>' : it.type === 'link' ? '<input ' + k + ' data-f="ref" value="' + esc(it.ref) + '" placeholder="https://…">' : '';
            return '<div class="task"><div class="head"><select ' + k + ' data-f="type">' + opt(IT, it.type) + '</select>' + refField + '<input ' + k + ' data-f="title" value="' + esc(it.title) + '" placeholder="заголовок" style="flex:1"><button type="button" class="btn sm ghost" data-mv="-1" ' + k + '>↑</button><button type="button" class="btn sm ghost" data-mv="1" ' + k + '>↓</button><button type="button" class="btn sm ghost" data-del ' + k + '>✕</button></div>' +
              '<div class="field"><label>' + (it.type === 'text' ? 'Текст для ученика' : 'Пояснение') + '</label><textarea ' + k + ' data-f="note" rows="2">' + esc(it.note) + '</textarea></div></div>';
          }).join('') + '<div class="row"><button type="button" class="btn sm" data-addi="' + mi + '">+ пункт</button><button type="button" class="btn sm ghost" data-delm="' + mi + '">удалить модуль</button></div></div>';
      }).join('') + '<div class="row"><button type="button" class="btn ghost" id="addm">+ модуль</button></div><div class="row" style="position:sticky;bottom:0;background:var(--paper);padding:10px 0"><button class="btn">Сохранить</button>' + (!isNew ? '<button type="button" class="btn ghost" id="sh">' + (c.share_status === 'approved' ? 'В библиотеке ✓' : c.share_status === 'pending' ? 'На модерации…' : 'Поделиться в библиотеку') + '</button>' : '') + '</div></form><div class="msg" id="m" hidden></div>';
    var f = $('#cf'), m = $('#m');
    function setF(el) { var mi = +el.dataset.m, k = el.dataset.f, v = el.value; if (el.dataset.i == null) { c.modules[mi][k] = v; return; } var it = c.modules[mi].items[+el.dataset.i]; it[k] = v; if (k === 'type') { it.ref = ''; drawCourse(id, tests, mats); } if (k === 'ref' && !it.title) { var o = (it.type === 'test' ? tests : mats).find(function (x) { return x[0] === v; }); if (o) { it.title = o[1].replace(/^📚 /, '').replace(/ · T\d$|· ДЗ$/, ''); drawCourse(id, tests, mats); } } }
    f.addEventListener('input', function (e) { if (e.target.dataset.f && e.target.tagName !== 'SELECT') setF(e.target); else if (e.target.name) c[e.target.name] = e.target.value; });
    f.addEventListener('change', function (e) { if (e.target.dataset.f && e.target.tagName === 'SELECT') setF(e.target); });
    f.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.type === 'submit') return; var mi = +b.dataset.m, ii = +b.dataset.i;
      if (b.dataset.addi != null) { c.modules[+b.dataset.addi].items.push({type: 'text', ref: '', title: '', note: ''}); }
      else if (b.dataset.del != null) c.modules[mi].items.splice(ii, 1);
      else if (b.dataset.mv) { var a = c.modules[mi].items, j = ii + +b.dataset.mv; if (j >= 0 && j < a.length) { var x = a[ii]; a[ii] = a[j]; a[j] = x; } }
      else if (b.dataset.delm != null) { if (!confirm('Удалить модуль?')) return; c.modules.splice(+b.dataset.delm, 1); }
      else if (b.id === 'addm') c.modules.push({title: 'Модуль ' + (c.modules.length + 1), opens: '', items: []});
      else if (b.id === 'sh') { if (c.share_status === 'approved' || c.share_status === 'pending') return; api('POST', '/api/t/courses/' + id + '/share', {note: ''}).then(function () { courseEditor(id); }).catch(function (er) { flash(m, er.message, 'bad'); }); return; }
      else return;
      drawCourse(id, tests, mats);
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var v = formData(f); c.title = v.title; c.klass = v.klass; c.description = v.description;
      api(isNew ? 'POST' : 'PUT', isNew ? '/api/t/courses' : '/api/t/courses/' + id, c).then(function (r) { curC = r; if (isNew) location.hash = 'courses/' + r.id; else flash(m, 'Сохранено', 'ok'); }).catch(function (er) { flash(m, er.message, 'bad'); });
    });
  }

  // ================= ЗАДАТЬ
  VIEWS.assign = function () {
    return classes().then(function (list) {
      if (!list.length) { app.innerHTML = '<p class="empty">Сначала заведите класс во вкладке «Классы».</p>'; return; }
      var cid = curClass(list), pre = JSON.parse(sessionStorage.getItem('mf:t:asg') || 'null'); sessionStorage.removeItem('mf:t:asg');
      return Promise.all([api('GET', '/api/t/assignments?class_id=' + encodeURIComponent(cid)), api('GET', '/api/t/tests'), api('GET', '/api/t/courses'), cat(), api('GET', '/api/t/submissions?class_id=' + encodeURIComponent(cid))]).then(function (d) {
        var asg = d[0], tests = d[1].filter(function (t) { return t.status !== 'archived'; }), courses = d[2], mats = d[3], subs = d[4], cnt = {};
        subs.forEach(function (s) { cnt[s.assignment_id] = (cnt[s.assignment_id] || 0) + 1; });
        var refs = {test: tests.map(function (t) { return [t.id, t.title + ' · ' + t.kind.toUpperCase() + ' · ' + t.ntasks + ' зад.']; }), course: courses.map(function (c) { return [c.id, c.title]; }), material: mats.map(function (x) { return [x.id, x.title]; })};
        var kind = (pre && pre.kind) || 'test';
        app.innerHTML = '<h2>Задать классу</h2><div class="row">' + classSel(list, cid) + '</div>' +
          '<form class="card" id="af"><div class="grid">' + sel('kind', [['test', 'тест'], ['course', 'курс'], ['material', 'материал сайта']], kind, 'Что') + '<div class="field" id="refbox"></div>' + inp('given', new Date().toISOString().slice(0, 10), 'Выдано', 'date') + inp('due', '', 'Срок (23:59 МСК)', 'date') + inp('attempts', '', 'Попыток (пусто — как в тесте)', 'number', 'min="0" max="20"') + '</div>' +
          '<div class="field"><label>Комментарий ученикам</label><input name="note"></div><label class="chk"><input type="checkbox" name="lock_after_due"> после срока сдать нельзя</label><div class="row"><button class="btn">Задать</button></div><div class="msg" id="m" hidden></div></form>' +
          '<h3>Уже задано</h3>' + (asg.length ? '<table class="w"><tr><th>Что</th><th>Выдано</th><th>Срок</th><th class="right">Сдач</th><th>Статус</th><th></th></tr>' + asg.map(function (a) {
            return '<tr data-id="' + esc(a.id) + '"' + (a.status === 'closed' ? ' class="muted"' : '') + '><td><span class="pill">' + ({test: 'тест', course: 'курс', material: 'материал'}[a.kind]) + '</span> ' + esc(a.title) + (a.note ? '<div class="muted">' + esc(a.note) + '</div>' : '') + '</td><td>' + fmt(a.given, 1) + '</td><td><input type="date" data-due value="' + esc(a.due || '') + '" style="width:150px"></td><td class="num">' + (cnt[a.id] || 0) + '</td><td>' + (a.status === 'closed' ? 'закрыто' : 'открыто') + (a.lock_after_due ? ' · после срока нельзя' : '') + '</td>' +
              '<td class="right"><a class="btn sm ghost" href="#works" data-works="' + esc(a.id) + '">работы</a> <button class="btn sm ghost" data-st="' + (a.status === 'closed' ? 'active' : 'closed') + '">' + (a.status === 'closed' ? 'открыть' : 'закрыть') + '</button></td></tr>';
          }).join('') + '</table>' : '<p class="empty">Этому классу пока ничего не задано.</p>');
        onClassChange('assign');
        var f = $('#af');
        function refs_() { var k = f.kind.value, l = refs[k]; $('#refbox').innerHTML = '<label>' + ({test: 'Тест', course: 'Курс', material: 'Материал (data/catalog.json)'}[k]) + '</label><select name="ref">' + opt(l.length ? l : [['', '— пусто: сначала создайте —']], pre && pre.kind === k ? pre.ref : '') + '</select>'; }
        refs_(); f.kind.addEventListener('change', refs_);
        f.addEventListener('submit', function (e) {
          e.preventDefault(); var v = formData(f); v.class_id = cid; if (v.kind === 'material') { var x = mats.find(function (q) { return q.id === v.ref; }); v.title = x ? x.title : v.ref; }
          api('POST', '/api/t/assignments', v).then(function () { show('assign'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
        });
        app.onchange = function (e) { var i = e.target.closest('input[data-due]'); if (i) api('PATCH', '/api/t/assignments/' + i.closest('tr').dataset.id, {due: i.value || null}).catch(function (er) { alert(er.message); }); };
        app.onclick = function (e) { var b = e.target.closest('button[data-st]'), w = e.target.closest('a[data-works]'); if (w) sessionStorage.setItem('mf:t:wa', w.dataset.works); if (b) api('PATCH', '/api/t/assignments/' + b.closest('tr').dataset.id, {status: b.dataset.st}).then(function () { show('assign'); }).catch(function (er) { alert(er.message); }); };
      });
    });
  };

  // ================= РАБОТЫ И ПРОВЕРКА
  VIEWS.works = function () {
    return classes().then(function (list) {
      if (!list.length) { app.innerHTML = '<p class="empty">Классов пока нет. Начните с вкладки <a href="#classes">«Классы»</a>.</p>'; return; }
      var cid = sessionStorage.getItem('mf:t:wclass') != null ? sessionStorage.getItem('mf:t:wclass') : curClass(list), wa = sessionStorage.getItem('mf:t:wa') || '', ws = sessionStorage.getItem('mf:t:ws') || 'todo';
      return Promise.all([api('GET', '/api/t/submissions' + (cid ? '?class_id=' + encodeURIComponent(cid) : '')), api('GET', '/api/t/assignments' + (cid ? '?class_id=' + encodeURIComponent(cid) : ''))]).then(function (d) {
        var all = d[0], A = {}; d[1].forEach(function (a) { A[a.id] = a; });
        var lst = all.filter(function (s) { return (!wa || s.assignment_id === wa) && (ws === 'all' || (ws === 'todo' ? (s.status === 'new' || s.status === 'submitted') : s.status === ws)); }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
        var todo = all.filter(function (s) { return s.status === 'new' || s.status === 'submitted'; }).length;
        app.innerHTML = '<h2>Работы' + (todo ? ' <span class="pill warn">ждут проверки: ' + todo + '</span>' : '') + '</h2><div class="row"><div class="field"><label>Класс</label><select id="wc">' + opt([['', 'все классы']].concat(list.map(function (c) { return [c.id, c.title || c.id]; })), cid) + '</select></div>' +
          '<div class="field"><label>Задание</label><select id="wa">' + opt([['', 'все задания']].concat(d[1].map(function (a) { return [a.id, a.title]; })), wa) + '</select></div>' +
          '<div class="field"><label>Показать</label><select id="ws">' + opt([['todo', 'ждут проверки'], ['auto', 'проверены автоматически'], ['checked', 'проверены'], ['returned', 'на доработке'], ['all', 'все']], ws) + '</select></div></div>' +
          '<p class="sub">' + lst.length + ' · <a href="#" id="csv">CSV</a>' + (wa ? ' · <a href="#" id="ia">разбор по заданиям</a>' : '') + '</p><div id="iabox"></div>' +
          '<div class="split"><div>' + (lst.length ? '<table class="w" id="wl"><tr><th>Когда</th><th>Кто</th><th>Что</th><th class="right">Авто</th><th class="right">Уч.</th></tr>' + lst.map(function (s) {
            return '<tr data-open="' + esc(s.id) + '" style="cursor:pointer"><td>' + fmt(s.created_at) + (s.late ? '<br><span class="st st-late">просрочено</span>' : '') + '</td><td>' + esc(s.student ? s.student.display_name : '?') + '<br><span class="code muted">' + esc(s.student ? s.student.code : '') + '</span></td><td>' + esc(A[s.assignment_id] ? A[s.assignment_id].title : s.assignment_id) + ' <span class="muted">· попытка ' + s.attempt + '</span><br><span class="st ' + (STATUS[s.status] || ['', ''])[1] + '">' + esc((STATUS[s.status] || [s.status])[0]) + '</span></td><td class="num">' + (s.score_auto != null ? s.score_auto : '—') + (s.score_max ? '/' + s.score_max : '') + '</td><td class="num">' + (s.score_teacher != null ? s.score_teacher : '—') + '</td></tr>';
          }).join('') + '</table>' : '<p class="empty">Здесь пусто' + (ws === 'todo' ? ' — всё проверено' : '') + '.</p>') + '</div><div id="card"><p class="empty">Выберите работу слева.</p></div></div>';
        $('#wc').addEventListener('change', function () { sessionStorage.setItem('mf:t:wclass', this.value); sessionStorage.removeItem('mf:t:wa'); show('works'); });
        $('#wa').addEventListener('change', function () { sessionStorage.setItem('mf:t:wa', this.value); show('works'); });
        $('#ws').addEventListener('change', function () { sessionStorage.setItem('mf:t:ws', this.value); show('works'); });
        $('#csv').addEventListener('click', function (e) { e.preventDefault(); download('работы.csv', csv([['когда', 'код', 'имя', 'класс', 'задание', 'попытка', 'просрочено', 'авто', 'макс', 'учитель', 'статус', 'комментарий']].concat(lst.map(function (s) { return [s.created_at, s.student && s.student.code, s.student && s.student.display_name, s.class_id, A[s.assignment_id] ? A[s.assignment_id].title : s.assignment_id, s.attempt, s.late, s.score_auto, s.score_max, s.score_teacher, s.status, s.comment]; })))); });
        if ($('#ia')) $('#ia').addEventListener('click', function (e) { e.preventDefault(); itemAnalysis(all.filter(function (s) { return s.assignment_id === wa; })); });
        var ids = lst.map(function (s) { return s.id; });
        if ($('#wl')) $('#wl').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-open]'); if (tr) openWork(tr.dataset.open, ids); });
      });
    });
  };
  // доля верных по каждому заданию — по последней попытке каждого ученика
  function itemAnalysis(subs) {
    var last = {}; subs.forEach(function (s) { if (!last[s.student_id] || last[s.student_id].created_at < s.created_at) last[s.student_id] = s; });
    var L = Object.keys(last).map(function (k) { return last[k]; }), agg = {};
    L.forEach(function (s) { Object.keys(s.detail || {}).forEach(function (n) { var x = s.detail[n], a = agg[n] = agg[n] || {n: n, ok: 0, all: 0, pts: 0, max: x.max}; if (x.ok == null) return; a.all++; if (x.ok) a.ok++; a.pts += x.pts || 0; }); });
    var rows = Object.keys(agg).sort(function (a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b); }).map(function (n) { return agg[n]; });
    $('#iabox').innerHTML = '<div class="card"><h3>Разбор по заданиям · учеников ' + L.length + '</h3>' + (rows.length ? '<table class="w"><tr><th>№</th><th style="width:50%">Верно</th><th class="right">%</th><th class="right">Средний балл</th></tr>' + rows.map(function (a) { var p = a.all ? Math.round(100 * a.ok / a.all) : null; return '<tr><td class="code">' + esc(a.n) + '</td><td>' + (p == null ? '<span class="muted">проверяет учитель</span>' : '<div class="bar"><i style="width:' + p + '%;background:' + (p < 40 ? 'var(--bad)' : p < 70 ? 'var(--warn)' : 'var(--ok)') + '"></i></div>') + '</td><td class="num">' + (p == null ? '—' : p) + '</td><td class="num">' + (a.all ? (a.pts / a.all).toFixed(1) + '/' + a.max : '—') + '</td></tr>'; }).join('') + '</table><p class="muted">Красное — задание, которое стоит разобрать с классом.</p>' : '<p class="empty">У этих работ нет автопроверки по заданиям.</p>') + '</div>';
  }
  function openWork(id, ids) {
    var box = $('#card'); box.innerHTML = '<p class="sub">Загружаю…</p>';
    document.querySelectorAll('#wl tr').forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.open === id); });
    api('GET', '/api/t/submissions/' + id).then(function (s) {
      var t = s.test, tasks = []; if (t) t.blocks.forEach(function (b) { b.tasks.forEach(function (x) { tasks.push(x); }); });
      else Object.keys(s.answers || {}).concat(Object.keys(s.photo_urls || {})).filter(function (n, i, a) { return a.indexOf(n) === i; }).forEach(function (n) { tasks.push({n: n, pts: null, text: ''}); });
      var st = s.scores_teacher || {}, det = s.detail || {}, i = ids.indexOf(id);
      box.innerHTML = '<div class="card"><h3>' + esc(s.student ? s.student.display_name : '') + ' <span class="code muted">' + esc(s.student ? s.student.code : '') + '</span></h3><p class="muted">' + fmt(s.created_at) + ' · попытка ' + s.attempt + (s.late ? ' · <span class="bad">просрочено</span>' : '') + (s.duration_s ? ' · ' + Math.round(s.duration_s / 60) + ' мин' : '') + ' · авто <b>' + (s.score_auto != null ? s.score_auto : '—') + (s.score_max ? '/' + s.score_max : '') + '</b></p>' +
        '<form id="gr">' + tasks.map(function (x) {
          var d = det[x.n] || {}, ans = s.answers && s.answers[x.n], ph = (s.photo_urls || {})[x.n] || [];
          var key = x.type === 'num' ? (Array.isArray(x.key) ? x.key.join('; ') : x.key) + (x.unit ? ' ' + x.unit : '') : x.type === 'text' ? (x.accept || []).join(' | ') : x.type === 'photo' ? '' : x.key;
          return '<div class="task"><div class="head"><b>№' + esc(x.n) + '</b>' + (d.ok === true ? '<span class="ok">✓ верно</span>' : d.ok === false ? '<span class="bad">✗ ' + (ans == null || ans === '' ? 'нет ответа' : 'неверно') + '</span>' : '<span class="warn">проверяете вы</span>') + '<span style="flex:1"></span>' +
            (x.pts != null ? '<input name="s_' + esc(x.n) + '" type="number" min="0" max="' + x.pts + '" step="0.5" value="' + esc(st[x.n] != null ? st[x.n] : d.pts != null ? d.pts : '') + '" style="width:70px"> / ' + x.pts : '') + '</div>' +
            (x.text ? '<div class="muted" style="font-size:14px">' + esc(x.text.length > 220 ? x.text.slice(0, 220) + '…' : x.text) + '</div>' : '') +
            '<div>Ответ: <b>' + esc(ans == null || ans === '' ? '—' : ans) + '</b>' + (key !== '' && key != null ? ' · ключ: ' + esc(key) : '') + '</div>' +
            ph.map(function (u) { return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img class="photo" src="' + esc(u) + '" alt="фото решения" loading="lazy"></a>' : '<span class="muted">фото не сохранено</span>'; }).join('') + '</div>';
        }).join('') +
        '<div class="field"><label>Комментарий ученику</label><textarea name="comment" rows="3">' + esc(s.comment) + '</textarea></div>' +
        '<div class="row"><button class="btn" name="go" value="checked">Проверено</button><button class="btn ghost" name="go" value="returned" title="ученик получит ещё одну попытку">Вернуть на доработку</button>' + (i >= 0 && i < ids.length - 1 ? '<button type="button" class="btn ghost" id="next">Следующая →</button>' : '') + '</div><div class="msg" id="gm" hidden></div></form></div>';
      math(box);
      var f = $('#gr'), go = 'checked';
      f.addEventListener('click', function (e) { var b = e.target.closest('button[name=go]'); if (b) go = b.value; });
      if ($('#next')) $('#next').addEventListener('click', function () { openWork(ids[i + 1], ids); });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = formData(f), scores = {}; Object.keys(v).forEach(function (k) { if (k.indexOf('s_') === 0 && v[k] !== '') scores[k.slice(2)] = +v[k]; });
        var body = {comment: v.comment, status: go}; if (t) body.scores = scores; else { var sum = Object.keys(scores).reduce(function (a, k) { return a + scores[k]; }, 0); body.score_teacher = Object.keys(scores).length ? sum : null; }
        api('PATCH', '/api/t/submissions/' + id, body).then(function (r) {
          flash($('#gm'), (go === 'returned' ? 'Возвращено на доработку' : 'Сохранено') + ' · итог ' + (r.score_teacher != null ? r.score_teacher : '—'), 'ok');
          var tr = document.querySelector('#wl tr[data-open="' + id + '"]'); if (tr) tr.cells[4].textContent = r.score_teacher != null ? r.score_teacher : '—';
          if (go === 'checked' && i >= 0 && i < ids.length - 1) setTimeout(function () { openWork(ids[i + 1], ids); }, 400);
        }).catch(function (er) { flash($('#gm'), er.message, 'bad'); });
      });
    }).catch(function (e) { box.innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; });
  }

  // ================= ЖУРНАЛ
  VIEWS.journal = function () {
    return classes().then(function (list) {
      if (!list.length) { app.innerHTML = '<p class="empty">Классов пока нет.</p>'; return; }
      var cid = curClass(list);
      return api('GET', '/api/t/gradebook?class_id=' + encodeURIComponent(cid)).then(function (g) {
        var cols = g.columns, st = g.students.slice().sort(function (a, b) { return a.display_name.localeCompare(b.display_name, 'ru'); });
        function cell(s, c) { var x = (g.cells[s.id] || {})[c.key]; if (!x) return '<td class="c muted">·</td>'; var pct = c.max ? x.best / c.max : null; return '<td class="c" title="попыток ' + x.n + (x.late ? ', просрочено' : '') + '" style="' + (pct == null ? '' : 'color:' + (pct < 0.4 ? 'var(--bad)' : pct < 0.7 ? 'var(--warn)' : 'var(--ok)')) + '">' + (x.best != null ? x.best : '?') + (x.status === 'new' ? '<sup>•</sup>' : '') + (x.late ? '<sup>п</sup>' : '') + '</td>'; }
        app.innerHTML = '<h2>Журнал</h2><div class="row">' + classSel(list, cid) + '</div><p class="sub">Лучший балл по каждому заданию; <sup>•</sup> — ждёт проверки, <sup>п</sup> — просрочено. · <a href="#" id="csv">CSV</a></p>' +
          (cols.length && st.length ? '<div class="matrix"><table class="w"><tr><th>Ученик</th>' + cols.map(function (c) { return '<th title="' + esc(c.title) + '">' + esc(c.title.length > 22 ? c.title.slice(0, 22) + '…' : c.title) + (c.max ? '<br><span class="muted">из ' + c.max + '</span>' : '') + '</th>'; }).join('') + '</tr>' +
            st.map(function (s) { return '<tr><td>' + esc(s.display_name) + ' <span class="code muted">' + esc(s.code.slice(-4)) + '</span></td>' + cols.map(function (c) { return cell(s, c); }).join('') + '</tr>'; }).join('') + '</table></div>' : '<p class="empty">Пока нечего показать: нужны ученики и задания.</p>');
        onClassChange('journal');
        $('#csv').addEventListener('click', function (e) { e.preventDefault(); download('журнал-' + cid + '.csv', csv([['ученик', 'код'].concat(cols.map(function (c) { return c.title + (c.max ? ' (из ' + c.max + ')' : ''); }))].concat(st.map(function (s) { return [s.display_name, s.code].concat(cols.map(function (c) { var x = (g.cells[s.id] || {})[c.key]; return x ? x.best : ''; })); })))); });
      });
    });
  };

  // ================= БИБЛИОТЕКА
  VIEWS.library = function () {
    return api('GET', '/api/t/library').then(function (L) {
      app.innerHTML = '<h2>Общая библиотека</h2><p class="sub">Тесты и курсы, которыми поделились учителя (их одобряет владелец сайта). Копия становится вашей: правьте и задавайте.</p>' +
        '<h3>Тесты</h3>' + (L.tests.length ? '<table class="w"><tr><th>Название</th><th>Тип</th><th>Кл.</th><th class="right">Заданий</th><th></th></tr>' + L.tests.map(function (t) { return '<tr><td><a href="#tests/' + esc(t.id) + '">' + esc(t.title) + '</a></td><td>' + esc(t.kind.toUpperCase()) + '</td><td>' + esc(t.klass || '') + '</td><td class="num">' + t.ntasks + '</td><td class="right"><button class="btn sm" data-copy="tests/' + esc(t.id) + '">копию себе</button></td></tr>'; }).join('') + '</table>' : '<p class="empty">Пока пусто.</p>') +
        '<h3>Курсы</h3>' + (L.courses.length ? '<table class="w"><tr><th>Название</th><th>Кл.</th><th class="right">Модулей</th><th></th></tr>' + L.courses.map(function (c) { return '<tr><td>' + esc(c.title) + '</td><td>' + esc(c.klass || '') + '</td><td class="num">' + c.nmodules + '</td><td class="right"><button class="btn sm" data-copy="courses/' + esc(c.id) + '">копию себе</button></td></tr>'; }).join('') + '</table>' : '<p class="empty">Пока пусто.</p>');
      app.onclick = function (e) { var b = e.target.closest('button[data-copy]'); if (!b) return; api('POST', '/api/t/' + b.dataset.copy + '/copy', {}).then(function (x) { location.hash = b.dataset.copy.split('/')[0] + '/' + x.id; }).catch(function (er) { alert(er.message + (/курс|course/.test(b.dataset.copy) ? '' : '')); }); };
    });
  };

  // ================= ПРОФИЛЬ
  VIEWS.profile = function () {
    app.innerHTML = '<h2>Профиль</h2><form class="card" id="pf" style="max-width:520px"><div class="grid">' + inp('display_name', me.display_name, 'Имя для коллег и учеников') + '</div><p class="muted">Логин <b>' + esc(me.login) + '</b> · префикс групп <b class="code">' + esc(me.prefix) + '</b> · лимит классов ' + esc(me.max_classes) + ', учеников ' + esc(me.max_students) + '</p><div class="row"><button class="btn">Сохранить имя</button></div></form>' +
      '<form class="card" id="pw" style="max-width:520px"><h3>Сменить пароль</h3>' + inp('password_old', '', 'Текущий пароль', 'password', 'autocomplete="current-password"') + inp('password_new', '', 'Новый пароль (≥ 10 знаков)', 'password', 'autocomplete="new-password"') + '<div class="row"><button class="btn">Сменить</button></div></form>' +
      '<div class="card" style="max-width:520px"><h3>Безопасность</h3><p class="sub">Вошли на чужом компьютере и не вышли? Кнопка завершит вход везде, кроме нового входа.</p><button class="btn ghost" id="la">Выйти на всех устройствах</button></div><div class="msg" id="m" hidden></div>';
    $('#pf').addEventListener('submit', function (e) { e.preventDefault(); api('PATCH', '/api/t/profile', formData(this)).then(function (t) { me = t; $('#who').textContent = t.display_name + ' · ' + t.prefix; flash($('#m'), 'Сохранено', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
    $('#pw').addEventListener('submit', function (e) { e.preventDefault(); var f = this; api('PATCH', '/api/t/profile', formData(f)).then(function () { f.reset(); flash($('#m'), 'Пароль изменён', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
    $('#la').addEventListener('click', function () { if (!confirm('Завершить вход на всех устройствах? Здесь тоже придётся войти заново.')) return; api('POST', '/api/auth/logout-all', {}).then(function () { M.setToken(null); location.reload(); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
    return Promise.resolve();
  };

  start();
})();
