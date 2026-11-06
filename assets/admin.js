// Админка владельца сайта: обзор, учителя, классы (с владельцем), коды, ученики, сдачи, «Задано», материалы, файлы репозитория,
// модерация библиотеки, журнал действий, безопасность (2FA, отзыв сессий, режимы), данные (выгрузка, хранение, удаление). v2 — handlers/admin.js.
(function () {
  'use strict';
  var M = window.MF, esc = M.esc, $ = function (s, r) { return (r || document).querySelector(s); }, app = $('#app');
  var TABS = [['overview', 'Обзор'], ['teachers', 'Учителя'], ['classes', 'Классы'], ['codes', 'Коды'], ['students', 'Ученики'], ['subs', 'Сдачи'], ['zadano', 'Задано'], ['catalog', 'Материалы'], ['files', 'Файлы'], ['moder', 'Модерация'], ['audit', 'Журнал'], ['security', 'Безопасность'], ['data', 'Данные']];
  var KINDS = ['pdf', 'trenazher', 't1', 't2', 't3', 'dz', 'konspekt', 'lab'], SECTIONS = ['uchebnik', 'praktikum', 'eksperiment', 'inzheneriya'], STATUSES = ['otkryto', 'klass', 'proba'];
  var cache = {}; // файлы репозитория: path → {content, sha}
  function fmt(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}); }
  function flash(el, text, cls) { el.hidden = false; el.className = 'msg ' + (cls || ''); el.textContent = text; }
  function need(r) { if (!r.body || !r.body.ok) throw new Error(M.message(r)); return r.body.data; }
  function sel(name, opts, cur, label) { return '<div class="field"><label>' + label + '</label><select name="' + name + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>'; }
  function inp(name, cur, label, type) { return '<div class="field"><label>' + label + '</label><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(cur == null ? '' : cur) + '"></div>'; }
  function formData(f) { var o = {}; Array.prototype.forEach.call(f.elements, function (e) { if (e.name) o[e.name] = e.type === 'checkbox' ? e.checked : e.value; }); return o; }
  function csv(rows) { return rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';'); }).join('\r\n'); }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], {type: 'text/csv;charset=utf-8'})); a.download = name; a.click(); }

  // ---------- файлы репозитория через API (с кэшем sha)
  function loadFile(path, fresh) { if (cache[path] && !fresh) return Promise.resolve(cache[path]); return M.api('GET', '/api/admin/content/file?path=' + encodeURIComponent(path)).then(need).then(function (d) { cache[path] = d; return d; }); }
  function saveFile(path, content, message) {
    var sha = cache[path] ? cache[path].sha : null;
    return M.api('PUT', '/api/admin/content/file', {path: path, content: content, sha: sha, message: message}).then(need).then(function (d) { cache[path] = {path: path, sha: d.sha, content: content}; return d; });
  }
  function saveJson(path, obj, message) { return saveFile(path, JSON.stringify(obj, null, 1) + '\n', message); }

  // ---------- вход
  if (!M.configured) { app.innerHTML = '<p class="empty">API не настроен: пустой <code>window.API_BASE</code> в <code>/config.js</code>. См. <code>site/api/DEPLOY.md</code>.</p>'; return; }
  function loginView(msg) {
    app.innerHTML = '<form class="card" id="lf" style="max-width:420px"><div class="field"><label for="pw">Пароль владельца</label><input id="pw" type="password" autocomplete="current-password"></div><div class="field"><label for="otp">Код из приложения (если включена 2FA)</label><input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div><div class="row"><button class="btn" type="submit">Войти</button></div><div class="msg" id="m" hidden></div></form>';
    if (msg) flash($('#m'), msg, 'bad');
    $('#lf').addEventListener('submit', function (e) { e.preventDefault(); M.api('POST', '/api/auth/admin', {password: $('#pw').value, otp: $('#otp').value}).then(function (r) { if (!r.body || !r.body.ok) return flash($('#m'), M.message(r), 'bad'); M.setToken(r.body.data.token); start(); }); });
  }
  function start() {
    if (!M.token()) return loginView();
    M.api('GET', '/api/me').then(function (r) {
      if (!r.body || !r.body.ok || r.body.data.role !== 'admin') { M.setToken(null); $('#tabs').innerHTML = ''; $('#logout').hidden = true; return loginView(r.status === 429 ? M.message(r) : ''); }
      $('#who').innerHTML = 'владелец · <a href="/uchitel/">кабинет учителя</a>'; $('#logout').hidden = false;
      $('#tabs').innerHTML = TABS.map(function (t) { return '<a data-tab="' + t[0] + '">' + t[1] + '</a>'; }).join('');
      show(location.hash.slice(1) || 'overview');
    });
  }
  $('#logout').addEventListener('click', function (e) { e.preventDefault(); M.setToken(null); location.reload(); });
  $('#tabs').addEventListener('click', function (e) { var a = e.target.closest('a[data-tab]'); if (a) { location.hash = a.dataset.tab; show(a.dataset.tab); } });
  function show(tab) {
    document.querySelectorAll('#tabs a').forEach(function (a) { a.toggleAttribute('aria-current', a.dataset.tab === tab); });
    app.innerHTML = '<p class="sub">Загружаю…</p>'; app.onclick = null; app.onchange = null;
    (VIEWS[tab] || VIEWS.codes)().catch(function (e) { app.innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; });
  }

  var VIEWS = {};
  // ---------- классы
  VIEWS.classes = function () {
    return Promise.all([M.api('GET', '/api/admin/classes').then(need), M.api('GET', '/api/admin/teachers').then(need).catch(function () { return []; })]).then(function (dd) {
      var list = dd[0], TCH = dd[1], owners = [['admin', 'я (владелец)']].concat(TCH.map(function (t) { return [t.id, t.display_name + ' · ' + t.prefix]; }));
      app.innerHTML = '<h2>Классы (группы кодов)</h2><p class="sub">Группа — префикс кода ученика (<b>LC10FM</b>). Коды и ученики привязаны к группе. Публичный список групп для сайта — в <code>data/zadano.json</code> (кнопка «Взять из zadano.json» заводит их здесь).</p>' +
        '<table class="w"><tr><th>Группа</th><th>Название</th><th>Класс</th><th>Год</th><th>Ведёт</th><th></th></tr>' + list.map(function (c) { return '<tr><td class="code">' + esc(c.id) + '</td><td>' + esc(c.title) + (c.archived ? ' <span class="muted">(архив)</span>' : '') + '</td><td>' + esc(c.klass) + '</td><td>' + esc(c.year) + '</td><td><select data-owner="' + esc(c.id) + '">' + owners.map(function (o) { return '<option value="' + esc(o[0]) + '"' + ((c.owner_id || 'admin') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td><td><a href="#codes" data-tab="codes" data-class="' + esc(c.id) + '">коды →</a></td></tr>'; }).join('') + '</table>' +
        '<form class="card" id="cf"><h3>Добавить / изменить</h3><div class="grid">' + inp('id', '', 'Группа (LC10FM)') + inp('title', '', 'Название (10 ФМ)') + inp('klass', '', 'Класс', 'number') + inp('year', '', 'Учебный год') + '</div><div class="row"><button class="btn" type="submit">Сохранить</button><button class="btn ghost" type="button" id="fromZ">Взять из zadano.json</button></div><div class="msg" id="m" hidden></div></form>';
      app.onchange = function (e) { var o = e.target.closest('select[data-owner]'); if (!o) return; if (!confirm('Передать класс ' + o.dataset.owner + '? Вместе с ним уйдут его задания и работы.')) return show('classes'); M.api('POST', '/api/admin/classes/' + o.dataset.owner + '/owner', {owner_id: o.value}).then(need).then(function () { show('classes'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); };
      $('#cf').addEventListener('submit', function (e) { e.preventDefault(); M.api('POST', '/api/admin/classes', formData(this)).then(need).then(function () { show('classes'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
      $('#fromZ').addEventListener('click', function () {
        loadFile('data/zadano.json', true).then(function (f) { var z = JSON.parse(f.content), gs = Object.keys(z.groups || {});
          return Promise.all(gs.map(function (g) { return M.api('POST', '/api/admin/classes', {id: g, title: z.groups[g].title, klass: z.groups[g]['class']}).then(need); })); }).then(function () { show('classes'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      });
    });
  };

  // ---------- коды
  VIEWS.codes = function () {
    return Promise.all([M.api('GET', '/api/admin/classes').then(need), M.api('GET', '/api/admin/codes').then(need)]).then(function (d) {
      var classes = d[0], all = d[1], cur = sessionStorage.getItem('mf:adm:class') || (classes[0] && classes[0].id) || '';
      var list = all.filter(function (c) { return !cur || c.class_id === cur; });
      var byStatus = {new: 0, used: 0, revoked: 0}; list.forEach(function (c) { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
      app.innerHTML = '<h2>Коды учеников</h2><div class="row no-print">' + sel('class', classes.map(function (c) { return [c.id, c.title + ' (' + c.id + ')']; }).concat(classes.length ? [] : [['', '— сначала заведите класс —']]), cur, 'Группа') +
        '<form id="gen" class="row" style="align-items:end;margin:0">' + inp('count', 5, 'Сколько', 'number') + inp('note', '', 'Пометка (без ФИО)') + '<button class="btn" type="submit"' + (cur ? '' : ' disabled') + '>Создать коды</button></form></div>' +
        '<p class="sub no-print">Свободных: ' + byStatus.new + ' · занято: ' + byStatus.used + ' · отозвано: ' + (byStatus.revoked || 0) + '. <a href="#" id="print">Печать свободных кодов</a> · <a href="#" id="csv">CSV</a>. Пометка — ваш ключ к ФИО (номер в журнале); ФИО на сайт не попадает.</p>' +
        '<div class="msg no-print" id="m" hidden></div>' +
        '<table class="w no-print"><tr><th>Код</th><th>Статус</th><th>Пометка</th><th>Выдан</th><th>Занят</th><th></th></tr>' + list.map(function (c) {
          return '<tr><td class="code">' + esc(c.code) + '</td><td>' + ({new: 'свободен', used: 'занят', revoked: 'отозван'}[c.status] || c.status) + '</td><td><input value="' + esc(c.note) + '" data-note="' + esc(c.code) + '" placeholder="№ в журнале"></td><td class="muted">' + fmt(c.created_at) + '</td><td class="muted">' + fmt(c.used_at) + '</td>' +
            '<td class="right">' + (c.status === 'used' ? '<button class="btn sm ghost" data-reset="' + esc(c.code) + '">сбросить пароль</button> ' : '') + (c.status !== 'revoked' ? '<button class="btn sm ghost" data-revoke="' + esc(c.code) + '">отозвать</button>' : '') + '</td></tr>'; }).join('') + '</table>' +
        '<div class="cards">' + list.filter(function (c) { return c.status === 'new'; }).map(function (c) { var k = classes.find(function (x) { return x.id === c.class_id; }); return '<div class="cardp"><div>Тезаурус · ' + esc(k ? k.title : c.class_id) + '</div><b>' + esc(c.code) + '</b><div>metaphys23.github.io/me/ → «Регистрация по коду»: имя для сайта + пароль. Код и пароль никому не показывать.</div>' + (c.note ? '<div style="font-size:11px;color:#777">' + esc(c.note) + '</div>' : '') + '</div>'; }).join('') + '</div>';
      $('select[name=class]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:class', this.value); show('codes'); });
      $('#gen').addEventListener('submit', function (e) { e.preventDefault(); var f = formData(this); M.api('POST', '/api/admin/codes', {class_id: cur, count: f.count, note: f.note}).then(need).then(function () { show('codes'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
      $('#print').addEventListener('click', function (e) { e.preventDefault(); window.print(); });
      $('#csv').addEventListener('click', function (e) { e.preventDefault(); download('коды-' + cur + '.csv', csv([['код', 'статус', 'пометка', 'выдан', 'занят']].concat(list.map(function (c) { return [c.code, c.status, c.note, c.created_at, c.used_at]; })))); });
      app.onclick = function (e) {
        var b = e.target.closest('button[data-revoke],button[data-reset]'); if (!b) return;
        var code = b.dataset.revoke || b.dataset.reset, act = b.dataset.revoke ? 'revoke' : 'reset';
        if (!confirm(act === 'revoke' ? 'Отозвать код ' + code + '? Ученик потеряет доступ.' : 'Сбросить пароль ' + code + '? Ученик зарегистрируется заново тем же кодом.')) return;
        M.api('POST', '/api/admin/codes/' + code + '/' + act, {}).then(need).then(function () { show('codes'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      };
      app.onchange = function (e) { var i = e.target.closest('input[data-note]'); if (i) M.api('POST', '/api/admin/codes/' + i.dataset.note + '/note', {note: i.value}).then(need).catch(function (er) { flash($('#m'), er.message, 'bad'); }); };
    });
  };

  // ---------- ученики
  VIEWS.students = function () {
    return Promise.all([M.api('GET', '/api/admin/classes').then(need), M.api('GET', '/api/admin/students').then(need)]).then(function (d) {
      var classes = d[0], list = d[1], cur = sessionStorage.getItem('mf:adm:class') || '';
      list = list.filter(function (s) { return !cur || s.class_id === cur; });
      app.innerHTML = '<h2>Ученики</h2><div class="row">' + sel('class', [['', 'все группы']].concat(classes.map(function (c) { return [c.id, c.title]; })), cur, 'Группа') + '</div><div class="msg" id="m" hidden></div>' +
        '<table class="w"><tr><th>Имя на сайте</th><th>Код</th><th>Группа</th><th>Был</th><th>Статус</th><th></th></tr>' + list.map(function (s) {
          return '<tr data-id="' + esc(s.id) + '"><td><input data-f="display_name" value="' + esc(s.display_name) + '"></td><td class="code">' + esc(s.code) + '</td><td><select data-f="class_id">' + classes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === s.class_id ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('') + '</select></td>' +
            '<td class="muted">' + fmt(s.last_seen) + '</td><td>' + (s.status === 'blocked' ? 'заблокирован' : (s.registered ? 'активен' : 'ждёт регистрации')) + '</td><td class="right"><button class="btn sm ghost" data-toggle="' + (s.status === 'blocked' ? 'active' : 'blocked') + '">' + (s.status === 'blocked' ? 'разблокировать' : 'заблокировать') + '</button></td></tr>'; }).join('') + '</table>' +
        (list.length ? '' : '<p class="empty">Пока никто не зарегистрировался.</p>');
      $('select[name=class]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:class', this.value); show('students'); });
      app.onchange = function (e) { var el = e.target.closest('[data-f]'); if (!el) return; var id = el.closest('tr').dataset.id, p = {}; p[el.dataset.f] = el.value; M.api('PATCH', '/api/admin/students/' + id, p).then(need).then(function () { flash($('#m'), 'Сохранено', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); };
      app.onclick = function (e) { var b = e.target.closest('button[data-toggle]'); if (!b) return; M.api('PATCH', '/api/admin/students/' + b.closest('tr').dataset.id, {status: b.dataset.toggle}).then(need).then(function () { show('students'); }); };
    });
  };

  // ---------- сдачи и проверка
  VIEWS.subs = function () {
    return Promise.all([M.api('GET', '/api/admin/classes').then(need), fetch('/data/catalog.json').then(function (r) { return r.json(); })]).then(function (d) {
      var classes = d[0], C = {}; d[1].items.forEach(function (x) { C[x.id] = x; });
      var cur = sessionStorage.getItem('mf:adm:class') || '', asg = sessionStorage.getItem('mf:adm:asg') || '';
      return M.api('GET', '/api/admin/submissions?' + (cur ? 'class_id=' + encodeURIComponent(cur) + '&' : '') + (asg ? 'assignment_id=' + encodeURIComponent(asg) : '')).then(need).then(function (list) {
        var asgs = {}; list.forEach(function (s) { asgs[s.assignment_id] = 1; });
        app.innerHTML = '<h2>Сдачи</h2><div class="row">' + sel('class', [['', 'все группы']].concat(classes.map(function (c) { return [c.id, c.title]; })), cur, 'Группа') + sel('asg', [['', 'все работы']].concat(Object.keys(asgs).map(function (a) { return [a, C[a] ? C[a].title : a]; })), asg, 'Работа') + '</div>' +
          '<p class="sub"><a href="#" id="csv">CSV</a> · ' + list.length + ' сдач' + (list.filter(function (s) { return s.status !== 'checked'; }).length ? ', непроверенных: ' + list.filter(function (s) { return s.status !== 'checked'; }).length : '') + '</p><div class="msg" id="m" hidden></div>' +
          '<div class="split"><div><table class="w"><tr><th>Когда</th><th>Кто</th><th>Работа</th><th>Поп.</th><th>Авто</th><th>Уч.</th><th></th></tr>' + list.map(function (s) {
            return '<tr' + (s.status === 'checked' ? ' class="muted"' : '') + '><td>' + fmt(s.created_at) + (s.late ? '<br><span class="st st-late">просрочено</span>' : '') + '</td><td>' + esc(s.student ? s.student.display_name : '?') + '<br><span class="code muted">' + esc(s.student ? s.student.code : s.student_id) + '</span></td><td>' + esc(C[s.assignment_id] ? C[s.assignment_id].title : s.assignment_id) + '</td><td>' + s.attempt + (s.final ? '★' : '') + '</td><td>' + (s.score_auto != null ? s.score_auto : '—') + '</td><td>' + (s.score_teacher != null ? s.score_teacher : '—') + '</td><td><button class="btn sm ghost" data-open="' + esc(s.id) + '">открыть</button></td></tr>'; }).join('') + '</table></div><div id="card"><p class="empty">Выберите сдачу.</p></div></div>';
        $('select[name=class]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:class', this.value); show('subs'); });
        $('select[name=asg]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:asg', this.value); show('subs'); });
        $('#csv').addEventListener('click', function (e) { e.preventDefault(); download('сдачи.csv', csv([['когда', 'код', 'имя', 'группа', 'работа', 'попытка', 'финал', 'просрочено', 'авто', 'предв', 'учитель', 'комментарий', 'статус']].concat(list.map(function (s) { return [s.created_at, s.student && s.student.code, s.student && s.student.display_name, s.class_id, s.assignment_id, s.attempt, s.final, s.late, s.score_auto, s.score_prelim, s.score_teacher, s.comment, s.status]; })))); });
        app.onclick = function (e) { var b = e.target.closest('button[data-open]'); if (b) openCard(b.dataset.open, C); };
      });
    });
  };
  function openCard(id, C) {
    var box = $('#card'); box.innerHTML = '<p class="sub">Загружаю…</p>';
    M.api('GET', '/api/admin/submissions/' + id).then(need).then(function (s) {
      var ans = Object.keys(s.answers || {}).sort(function (a, b) { return a - b; });
      var tasks = ans.concat(Object.keys(s.photo_urls || {}).filter(function (n) { return ans.indexOf(n) < 0; }));
      box.innerHTML = '<div class="card"><h3>' + esc(s.student ? s.student.display_name : '') + ' <span class="code muted">' + esc(s.student ? s.student.code : '') + '</span> · ' + esc(C[s.assignment_id] ? C[s.assignment_id].title : s.assignment_id) + '</h3><p class="muted">' + fmt(s.created_at) + ' · попытка ' + s.attempt + (s.final ? ' (финальная)' : '') + (s.late ? ' · просрочено' : '') + ' · авто ' + (s.score_auto != null ? s.score_auto : '—') + ' · предв. ' + (s.score_prelim != null ? s.score_prelim : '—') + '</p>' +
        tasks.map(function (n) { return '<div><b>№' + esc(n) + '</b>: ' + esc(s.answers && s.answers[n] != null ? s.answers[n] : '—') + (s.rno && s.rno[n] ? ' <span class="st st-done">РНО ✓</span>' : '') + ((s.photo_urls || {})[n] || []).map(function (u) { return u ? '<br><a href="' + esc(u) + '" target="_blank"><img class="photo" src="' + esc(u) + '" alt="фото"></a>' : '<br><span class="muted">фото не сохранено (нет хранилища)</span>'; }).join('') + '</div>'; }).join('') +
        '<form id="gr"><div class="grid">' + inp('score_teacher', s.score_teacher, 'Баллы учителя', 'number') + '</div><div class="field"><label>Комментарий ученику</label><textarea name="comment">' + esc(s.comment) + '</textarea></div><div class="row"><button class="btn" type="submit">Сохранить и отметить проверенной</button></div><div class="msg" id="gm" hidden></div></form></div>';
      $('#gr').addEventListener('submit', function (e) { e.preventDefault(); var f = formData(this); M.api('PATCH', '/api/admin/submissions/' + id, {score_teacher: f.score_teacher === '' ? null : f.score_teacher, comment: f.comment, status: 'checked'}).then(need).then(function () { flash($('#gm'), 'Сохранено', 'ok'); }).catch(function (er) { flash($('#gm'), er.message, 'bad'); }); });
    }).catch(function (e) { box.innerHTML = '<p class="msg bad">' + esc(e.message) + '</p>'; });
  }

  // ---------- «Задано» (data/zadano.json)
  VIEWS.zadano = function () {
    return Promise.all([loadFile('data/zadano.json', true), loadFile('data/catalog.json', true)]).then(function (d) {
      var Z = JSON.parse(d[0].content), C = JSON.parse(d[1].content).items, groups = Object.keys(Z.groups || {});
      var cur = sessionStorage.getItem('mf:adm:class') || groups[0] || '';
      var rows = (Z.assigned || []).map(function (a, i) { a._i = i; return a; }).filter(function (a) { return !cur || a.group === cur; });
      var mats = C.slice().sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); }).map(function (x) { return [x.id, x.title + ' · ' + x.id]; });
      app.innerHTML = '<h2>Задано</h2><p class="sub">Файл <code>data/zadano.json</code>: что задано группе, сроки. Сохранение — коммит в репозиторий, сайт обновится через ~1 мин.</p><div class="row">' + sel('class', groups.map(function (g) { return [g, Z.groups[g].title + ' (' + g + ')']; }), cur, 'Группа') + '</div><div class="msg" id="m" hidden></div>' +
        '<table class="w"><tr><th>Материал</th><th>Выдано</th><th>Срок</th><th>Примечание</th><th></th></tr>' + rows.map(function (a) { var x = C.find(function (c) { return c.id === a.material; }); return '<tr><td>' + esc(x ? x.title : a.material) + '<br><span class="code muted">' + esc(a.material) + '</span></td><td>' + esc(a.given) + '</td><td>' + esc(a.due) + '</td><td>' + esc(a.note) + '</td><td class="right"><button class="btn sm ghost" data-edit="' + a._i + '">изменить</button> <button class="btn sm ghost" data-del="' + a._i + '">убрать</button></td></tr>'; }).join('') + '</table>' +
        '<form class="card" id="zf"><h3 id="zt">Задать группе ' + esc(cur) + '</h3><input type="hidden" name="_i" value=""><div class="grid">' + sel('material', mats, '', 'Материал') + inp('given', new Date().toISOString().slice(0, 10), 'Выдано', 'date') + inp('due', '', 'Срок', 'date') + inp('note', '', 'Примечание') + '</div><div class="row"><button class="btn" type="submit">Сохранить в zadano.json</button><button class="btn ghost" type="button" id="zcancel" hidden>Отмена</button></div></form>';
      $('select[name=class]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:class', this.value); show('zadano'); });
      var f = $('#zf');
      app.onclick = function (e) {
        var ed = e.target.closest('button[data-edit]'), del = e.target.closest('button[data-del]');
        if (ed) { var a = Z.assigned[+ed.dataset.edit]; f._i.value = ed.dataset.edit; f.material.value = a.material; f.given.value = a.given || ''; f.due.value = a.due || ''; f.note.value = a.note || ''; $('#zt').textContent = 'Изменить задание'; $('#zcancel').hidden = false; f.scrollIntoView({behavior: 'smooth'}); }
        if (del && confirm('Убрать задание из списка группы?')) { Z.assigned.splice(+del.dataset.del, 1); saveJson('data/zadano.json', Z, 'задано: убрано').then(function () { show('zadano'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); }
      };
      $('#zcancel').addEventListener('click', function () { show('zadano'); });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = formData(f), a = {group: cur, material: v.material, given: v.given, due: v.due, note: v.note};
        if (v._i !== '') Z.assigned[+v._i] = a; else Z.assigned.push(a);
        saveJson('data/zadano.json', Z, 'задано: ' + cur + ' ' + v.material).then(function () { show('zadano'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      });
    });
  };

  // ---------- материалы (data/catalog.json)
  VIEWS.catalog = function () {
    return Promise.all([loadFile('data/catalog.json', true), loadFile('data/temy.json', true)]).then(function (d) {
      var Cat = JSON.parse(d[0].content), T = JSON.parse(d[1].content), topics = [];
      (T.sections || []).forEach(function (s) { (s.topics || []).forEach(function (t) { topics.push([t.id, s.title + ' · ' + t.title]); }); });
      var q = sessionStorage.getItem('mf:adm:q') || '';
      var items = Cat.items.map(function (x, i) { x._i = i; return x; }).filter(function (x) { return !q || (x.title + ' ' + x.id + ' ' + x.topic).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      function form(x) {
        x = x || {classes: [], status: 'otkryto', level: 'baza', kind: 'pdf', section: 'praktikum', added: new Date().toISOString().slice(0, 10)};
        return '<input type="hidden" name="_i" value="' + (x._i == null ? '' : x._i) + '"><div class="grid">' + inp('id', x.id, 'id (латиница, уникальный)') + inp('title', x.title, 'Название') + sel('kind', KINDS, x.kind, 'Тип') + sel('section', SECTIONS, x.section, 'Раздел') +
          (topics.length ? sel('topic', topics, x.topic, 'Тема') : inp('topic', x.topic, 'Тема (id из temy.json)')) + inp('sub', x.sub, 'Подтема') + inp('classes', (x.classes || []).join(','), 'Классы через запятую') + inp('url', x.url, 'Адрес (/klass/10/…) или внешний') +
          sel('status', STATUSES, x.status, 'Статус') + sel('level', [['baza', 'база'], ['star', '★']], x.level, 'Уровень') + inp('added', x.added, 'Добавлен', 'date') + inp('test', x.test, 'id теста (для Т1–Т3)') + '</div><div class="field"><label>Описание</label><textarea name="desc" style="min-height:60px">' + esc(x.desc) + '</textarea></div>';
      }
      app.innerHTML = '<h2>Материалы</h2><p class="sub">Файл <code>data/catalog.json</code> — одна запись на материал; сам файл (PDF, HTML) должен лежать в репозитории по адресу. Поиск: <input id="q" value="' + esc(q) + '" placeholder="название, id, тема" style="font:15px var(--body);padding:6px 10px;border:1px solid var(--rule);border-radius:8px"></p><div class="msg" id="m" hidden></div>' +
        '<table class="w"><tr><th>Название</th><th>Тип</th><th>Раздел / тема</th><th>Кл.</th><th>Статус</th><th></th></tr>' + items.map(function (x) { return '<tr><td>' + esc(x.title) + '<br><span class="code muted">' + esc(x.id) + '</span></td><td>' + esc(x.kind) + '</td><td>' + esc(x.section) + ' / ' + esc(x.topic) + (x.sub ? ' / ' + esc(x.sub) : '') + '</td><td>' + esc((x.classes || []).join(',')) + '</td><td>' + esc(x.status) + '</td><td class="right"><button class="btn sm ghost" data-edit="' + x._i + '">изменить</button></td></tr>'; }).join('') + '</table>' +
        '<form class="card" id="cf"><h3 id="ct">Новый материал</h3>' + form() + '<div class="row"><button class="btn" type="submit">Сохранить в catalog.json</button><button class="btn ghost" type="button" id="ccancel" hidden>Отмена</button></div></form>';
      $('#q').addEventListener('change', function () { sessionStorage.setItem('mf:adm:q', this.value); show('catalog'); });
      app.onclick = function (e) { var b = e.target.closest('button[data-edit]'); if (!b) return; var f = $('#cf'); f.querySelector('h3').textContent = 'Изменить материал'; f.innerHTML = '<h3>Изменить материал</h3>' + form(Cat.items[+b.dataset.edit]) + '<div class="row"><button class="btn" type="submit">Сохранить в catalog.json</button><button class="btn ghost" type="button" id="ccancel">Отмена</button></div>'; $('#ccancel').addEventListener('click', function () { show('catalog'); }); f.scrollIntoView({behavior: 'smooth'}); };
      $('#ccancel').addEventListener('click', function () { show('catalog'); });
      $('#cf').addEventListener('submit', function (e) {
        e.preventDefault(); var v = formData(this);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(v.id)) return flash($('#m'), 'id — латиница, цифры и дефис', 'bad');
        var x = {id: v.id, title: v.title.trim(), kind: v.kind, section: v.section, topic: v.topic, sub: v.sub, classes: v.classes.split(/[,\s]+/).filter(Boolean).map(Number), url: v.url.trim(), desc: v.desc, status: v.status, level: v.level, added: v.added};
        if (v.test) x.test = v.test;
        if (!x.title || !x.url) return flash($('#m'), 'Нужны название и адрес', 'bad');
        var dup = Cat.items.findIndex(function (y, i) { return y.id === x.id && String(i) !== v._i; }); if (dup >= 0) return flash($('#m'), 'id уже занят: ' + x.id, 'bad');
        if (v._i !== '') Cat.items[+v._i] = Object.assign({}, Cat.items[+v._i], x); else Cat.items.push(x);
        saveJson('data/catalog.json', Cat, 'материал: ' + x.id).then(function () { show('catalog'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      });
    });
  };

  // ---------- любой текстовый файл репозитория
  VIEWS.files = function () {
    return M.api('GET', '/api/admin/content/tree').then(need).then(function (tree) {
      var cur = sessionStorage.getItem('mf:adm:file') || '';
      app.innerHTML = '<h2>Файлы сайта</h2><p class="sub">Любой текстовый файл репозитория: страницы разделов, стили, данные. «Сохранить» = коммит в <code>main</code>; если файл изменили параллельно — сервер откажет, откройте заново. Статус сборки: <span id="pst">…</span></p>' +
        '<div class="row">' + sel('file', [['', '— выберите файл —']].concat(tree.map(function (f) { return [f.path, f.path + ' (' + f.size + ' Б)']; })), cur, 'Файл') + '</div><div class="msg" id="m" hidden></div>' +
        '<div id="ed"></div>';
      M.api('GET', '/api/admin/content/status').then(function (r) { $('#pst').textContent = r.body && r.body.ok ? r.body.data.status + (r.body.data.updated_at ? ' · ' + fmt(r.body.data.updated_at) : '') : '?'; });
      $('select[name=file]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:file', this.value); show('files'); });
      if (!cur) return;
      loadFile(cur, true).then(function (f) {
        $('#ed').innerHTML = '<textarea class="editor" id="ta" spellcheck="false"></textarea><div class="row"><input id="cm" placeholder="сообщение коммита" style="flex:1;font:15px var(--body);padding:8px 10px;border:1px solid var(--rule);border-radius:8px"><button class="btn" id="save">Сохранить</button></div>';
        $('#ta').value = f.content;
        $('#save').addEventListener('click', function () { var b = this; b.disabled = true; saveFile(cur, $('#ta').value, $('#cm').value || ('admin: ' + cur)).then(function () { flash($('#m'), 'Сохранено, сайт обновится через ~1 мин', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }).then(function () { b.disabled = false; }); });
      });
    });
  };

  // ================= v2: обзор, учителя, модерация, журнал, безопасность, данные
  function api2(m, p, b) { return M.api(m, p, b).then(need); }
  function dl(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: type})); a.download = name; a.click(); }
  VIEWS.overview = function () {
    return Promise.all([api2('GET', '/api/admin/stats'), api2('GET', '/api/admin/settings')]).then(function (d) {
      var s = d[0], S = d[1], k = function (v, l, href) { return '<div>' + (href ? '<a href="' + href + '" data-tab="' + href.slice(1) + '" style="text-decoration:none;color:inherit">' : '') + '<b>' + v + '</b><span>' + l + '</span>' + (href ? '</a>' : '') + '</div>'; };
      var warn = [];
      if (s.submissions.unchecked) warn.push('Ждут проверки: <b>' + s.submissions.unchecked + '</b> — <a href="#subs" data-tab="subs">сдачи</a>, у учителей — в их кабинетах.');
      if (s.pending) warn.push('На модерации: <b>' + s.pending + '</b> — <a href="#moder" data-tab="moder">модерация</a>.');
      if (s.failed_logins_24h >= 10) warn.push('Неудачных входов учителей и 2FA за сутки: <b>' + s.failed_logins_24h + '</b> — <a href="#security" data-tab="security">безопасность</a>.');
      if (!S.admin_totp) warn.push('Второй фактор для входа владельца выключен — <a href="#security" data-tab="security">включить</a>.');
      if (S.read_only) warn.push('<b>Сайт в режиме «только чтение»</b> — изменения у учителей и учеников отключены.');
      if (S.registration_open === false) warn.push('Регистрация учеников закрыта.');
      if (s.teachers.invited) warn.push('Не активировали приглашение учителей: ' + s.teachers.invited + '.');
      app.innerHTML = '<h2>Обзор</h2><div class="kpi">' + k(s.teachers.active, 'учителей активны', '#teachers') + k(s.classes.total - s.classes.archived, 'классов', '#classes') + k(s.students.total, 'учеников') + k(s.students.active7, 'заходили за 7 дней') + k(s.submissions.week, 'сдач за неделю', '#subs') + k(s.submissions.unchecked, 'ждут проверки') + k(s.tests, 'тестов') + k(s.courses, 'курсов') + k(s.submissions.photos, 'фото в хранилище', '#data') + '</div>' +
        (warn.length ? '<div class="card"><h3>Требует внимания</h3><ul>' + warn.map(function (w) { return '<li>' + w + '</li>'; }).join('') + '</ul></div>' : '<p class="empty">Всё спокойно.</p>');
    });
  };
  VIEWS.teachers = function () {
    return api2('GET', '/api/admin/teachers').then(function (list) {
      var ST = {invited: 'ждёт активации', active: 'активен', blocked: 'заблокирован'};
      app.innerHTML = '<h2>Учителя</h2><p class="sub">Учитель входит на <a href="/uchitel/">/uchitel/</a> логином и паролем; первый вход — по коду приглашения (7 дней). Префикс — начало групп и кодов его учеников: <span class="code">IV</span> → <span class="code">IV8B-K7P3</span>. Учитель видит только свои классы.</p><div class="msg" id="m" hidden></div><div id="inv"></div>' +
        (list.length ? '<table class="w"><tr><th>Учитель</th><th>Префикс</th><th>Статус</th><th class="right">Классов / учеников</th><th>Лимиты (классы / ученики)</th><th>Был</th><th></th></tr>' + list.map(function (t) {
          return '<tr data-id="' + esc(t.id) + '"><td><b>' + esc(t.display_name) + '</b><br><span class="code muted">' + esc(t.login) + '</span>' + (t.school ? '<br><span class="muted">' + esc(t.school) + '</span>' : '') + '<input data-f="note" value="' + esc(t.note) + '" placeholder="заметка" style="margin-top:4px"></td><td class="code">' + esc(t.prefix) + '</td><td>' + (ST[t.status] || t.status) + (t.status === 'invited' && t.invite_expires ? '<br><span class="muted">до ' + fmt(t.invite_expires) + '</span>' : '') + '</td>' +
            '<td class="num">' + t.n_classes + ' / ' + t.n_students + '</td><td><input data-f="max_classes" type="number" value="' + t.max_classes + '" style="width:70px"> <input data-f="max_students" type="number" value="' + t.max_students + '" style="width:80px"></td><td class="muted">' + fmt(t.last_seen) + '</td>' +
            '<td class="right"><a class="btn sm ghost" href="/uchitel/?as=' + esc(t.id) + '" target="_blank" title="только чтение">глазами учителя</a> <button class="btn sm ghost" data-inv>' + (t.status === 'invited' ? 'новое приглашение' : 'сбросить пароль') + '</button> <button class="btn sm ghost" data-out>выйти везде</button> <button class="btn sm ghost" data-st="' + (t.status === 'blocked' ? 'active' : 'blocked') + '">' + (t.status === 'blocked' ? 'разблокировать' : 'заблокировать') + '</button></td></tr>';
        }).join('') + '</table>' : '<p class="empty">Учителей пока нет.</p>') +
        '<form class="card" id="tf"><h3>Пригласить учителя</h3><div class="grid">' + inp('display_name', '', 'Имя (Ирина Викторовна)') + inp('login', '', 'Логин (латиница: ivanova)') + inp('prefix', '', 'Префикс групп (2–3 буквы: IV)') + inp('school', '', 'Школа') + inp('max_classes', 8, 'Лимит классов', 'number') + inp('max_students', 200, 'Лимит учеников', 'number') + '</div>' + inp('note', '', 'Заметка (для себя)') + '<div class="row"><button class="btn">Создать и получить приглашение</button></div></form>';
      function showInv(d, name) {
        $('#inv').innerHTML = '<div class="card"><h3>Приглашение для ' + esc(name) + '</h3><p>Передайте лично или в мессенджере — код действует до ' + fmt(d.invite_expires) + ' и показывается один раз.</p><div class="secret" id="invtxt">Страница: ' + esc(location.origin) + '/uchitel/ → «Первый вход по приглашению»\nЛогин: ' + esc(d.login) + '\nКод приглашения: ' + esc(d.invite) + '</div><div class="row"><button class="btn sm" id="cpy">Скопировать</button></div></div>';
        $('#invtxt').style.whiteSpace = 'pre-wrap'; $('#cpy').addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText($('#invtxt').textContent).then(function () { flash($('#m'), 'Скопировано', 'ok'); }); });
      }
      $('#tf').addEventListener('submit', function (e) { e.preventDefault(); var v = formData(this); api2('POST', '/api/admin/teachers', v).then(function (d) { show('teachers'); setTimeout(function () { showInv(d, d.display_name); }, 300); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
      app.onchange = function (e) { var el = e.target.closest('input[data-f]'); if (!el) return; var p = {}; p[el.dataset.f] = el.value; api2('PATCH', '/api/admin/teachers/' + el.closest('tr').dataset.id, p).then(function () { flash($('#m'), 'Сохранено', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); };
      app.onclick = function (e) {
        var b = e.target.closest('button'); if (!b || !b.closest('tr')) return; var tr = b.closest('tr'), id = tr.dataset.id, t = list.find(function (x) { return x.id === id; });
        if (b.dataset.inv != null) { if (!confirm('Выдать новое приглашение ' + t.display_name + '? Старый пароль и все входы перестанут работать.')) return; api2('POST', '/api/admin/teachers/' + id + '/invite', {}).then(function (d) { showInv(d, t.display_name); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); }
        if (b.dataset.out != null) api2('POST', '/api/admin/teachers/' + id + '/logout-all', {}).then(function () { flash($('#m'), 'Все входы ' + t.display_name + ' завершены', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
        if (b.dataset.st) { if (b.dataset.st === 'blocked' && !confirm('Заблокировать ' + t.display_name + '? Ученики сохранят доступ к своим работам.')) return; api2('PATCH', '/api/admin/teachers/' + id, {status: b.dataset.st}).then(function () { show('teachers'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); }
      };
    });
  };
  VIEWS.moder = function () {
    return api2('GET', '/api/admin/moderation').then(function (d) {
      function test(t) { var n = 0; return '<div class="card" data-k="test" data-id="' + esc(t.id) + '"><h3>Тест: ' + esc(t.title) + ' <span class="pill">' + esc(t.kind.toUpperCase()) + (t.klass ? ' · ' + t.klass + ' кл.' : '') + '</span></h3>' + (t.share_note ? '<p>«' + esc(t.share_note) + '»</p>' : '') + '<details><summary>Задания и ключи</summary>' + t.blocks.map(function (b) { return b.tasks.map(function (x) { n++; return '<div class="task"><b>' + esc(x.n) + '</b> · ' + esc(x.type) + ' · ' + x.pts + ' б.<div>' + esc(x.text) + '</div><div class="muted">ключ: ' + esc(x.type === 'text' ? (x.accept || []).join(' | ') : x.key) + '</div></div>'; }).join(''); }).join('') + '</details>' + btns() + '</div>'; }
      function course(c) { return '<div class="card" data-k="course" data-id="' + esc(c.id) + '"><h3>Курс: ' + esc(c.title) + '</h3><ol>' + c.modules.map(function (m) { return '<li>' + esc(m.title) + ' — ' + m.items.length + ' пунктов</li>'; }).join('') + '</ol>' + btns() + '</div>'; }
      function btns() { return '<div class="row"><button class="btn sm" data-dec="approve">Одобрить в библиотеку</button><button class="btn sm ghost" data-dec="reject">Отклонить</button></div>'; }
      app.innerHTML = '<h2>Модерация общей библиотеки</h2><p class="sub">Учителя предлагают тесты и курсы для всех. Одобренное видят все учителя и могут скопировать себе. Проверьте ключи — ошибку размножат копии.</p><div class="msg" id="m" hidden></div>' + (d.tests.length + d.courses.length ? d.tests.map(test).join('') + d.courses.map(course).join('') : '<p class="empty">Нечего проверять.</p>');
      app.onclick = function (e) { var b = e.target.closest('button[data-dec]'); if (!b) return; var c = b.closest('[data-k]'), note = b.dataset.dec === 'reject' ? prompt('Почему отклонено (увидит учитель):', '') : ''; if (note === null) return; api2('POST', '/api/admin/moderation/' + c.dataset.k + '/' + c.dataset.id, {decision: b.dataset.dec, note: note}).then(function () { show('moder'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); };
    });
  };
  VIEWS.audit = function () {
    var q = JSON.parse(sessionStorage.getItem('mf:adm:aq') || '{}');
    return Promise.all([api2('GET', '/api/admin/audit?limit=500' + (q.actor ? '&actor_id=' + encodeURIComponent(q.actor) : '') + (q.action ? '&action=' + encodeURIComponent(q.action) : '') + (q.from ? '&from=' + q.from : '')), api2('GET', '/api/admin/teachers')]).then(function (d) {
      var L = d[0], names = {admin: 'владелец'}; d[1].forEach(function (t) { names[t.id] = t.display_name; });
      app.innerHTML = '<h2>Журнал действий</h2><p class="sub">Кто, что и когда менял: входы учителей, коды, тесты, оценки, настройки, выгрузки. Хранится год.</p><form class="row" id="af" style="align-items:end">' + sel('actor', [['', 'все']].concat(Object.keys(names).map(function (k) { return [k, names[k]]; })), q.actor, 'Кто') + inp('action', q.action, 'Действие начинается с (test, submission, code…)') + inp('from', q.from, 'С даты', 'date') + '<button class="btn">Показать</button></form>' +
        '<p class="sub">' + L.length + ' · <a href="#" id="csv">CSV</a></p><table class="w"><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>IP</th><th>Подробности</th></tr>' + L.map(function (a) { return '<tr><td class="muted">' + fmt(a.at) + '</td><td>' + esc(names[a.actor_id] || a.actor_id || a.actor_role) + '</td><td class="code">' + esc(a.action) + '</td><td class="code">' + esc(a.target) + '</td><td class="muted">' + esc(a.ip) + '</td><td class="muted" style="font-size:12.5px">' + esc(a.meta ? JSON.stringify(a.meta) : '') + '</td></tr>'; }).join('') + '</table>';
      $('#af').addEventListener('submit', function (e) { e.preventDefault(); var v = formData(this); sessionStorage.setItem('mf:adm:aq', JSON.stringify(v)); show('audit'); });
      $('#csv').addEventListener('click', function (e) { e.preventDefault(); download('журнал.csv', csv([['когда', 'кто', 'действие', 'объект', 'ip', 'подробности']].concat(L.map(function (a) { return [a.at, names[a.actor_id] || a.actor_id, a.action, a.target, a.ip, a.meta ? JSON.stringify(a.meta) : '']; })))); });
    });
  };
  VIEWS.security = function () {
    return api2('GET', '/api/admin/security').then(function (s) {
      app.innerHTML = '<h2>Безопасность</h2><div class="msg" id="m" hidden></div>' +
        '<div class="card"><h3>Вход владельца: второй фактор</h3>' + (s.admin_totp ? '<p class="ok">Включён: при входе нужен 6-значный код из приложения.</p>' : '<p class="warn">Выключен. Админка может менять весь сайт — включите код из приложения (Яндекс Ключ, Google Authenticator, любое TOTP).</p><button class="btn" id="ts">Подготовить 2FA</button><div id="tsb"></div>') + '</div>' +
        '<div class="card"><h3>Режимы</h3><label class="chk"><input type="checkbox" id="ro"' + (s.read_only ? ' checked' : '') + '> «Только чтение» — учителя и ученики ничего не меняют (на время утечки, переезда, проверки)</label><label class="chk"><input type="checkbox" id="rg"' + (s.registration_open ? ' checked' : '') + '> Регистрация учеников по кодам открыта</label></div>' +
        '<div class="card"><h3>Сессии владельца</h3><p class="sub">Последний отзыв: ' + (s.admin_revoked_before ? fmt(s.admin_revoked_before) : 'не было') + '. Потеряли телефон или вошли на чужом компьютере — завершите все входы в админку (здесь тоже придётся войти).</p><button class="btn ghost" id="la">Выйти из админки везде</button></div>' +
        '<div class="card"><h3>Неудачные входы за сутки</h3>' + (s.failed_24h.length ? '<table class="w"><tr><th>Что</th><th>IP</th><th class="right">Раз</th><th>Последний</th></tr>' + s.failed_24h.map(function (f) { return '<tr><td>' + esc({login_fail_teacher: 'вход учителя', otp_fail: 'код 2FA'}[f.kind] || f.kind) + '</td><td class="code">' + esc(f.ip) + '</td><td class="num">' + f.n + '</td><td class="muted">' + fmt(f.last) + '</td></tr>'; }).join('') + '</table><p class="muted">После 5 ошибок за 15 минут с одного IP вход закрывается на 15 минут. Массовые попытки — повод включить Smart Web Security на шлюзе.</p>' : '<p class="empty">Не было.</p>') + '</div>';
      function set(p) { api2('PUT', '/api/admin/settings', p).then(function () { flash($('#m'), 'Сохранено', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); }
      $('#ro').addEventListener('change', function () { if (this.checked && !confirm('Включить «только чтение»? Учителя не смогут проверять работы, ученики — сдавать.')) { this.checked = false; return; } set({read_only: this.checked}); });
      $('#rg').addEventListener('change', function () { set({registration_open: this.checked}); });
      $('#la').addEventListener('click', function () { if (!confirm('Завершить все входы в админку?')) return; api2('POST', '/api/auth/logout-all', {}).then(function () { M.setToken(null); location.reload(); }); });
      if ($('#ts')) $('#ts').addEventListener('click', function () {
        api2('POST', '/api/admin/security/totp-setup', {}).then(function (d) {
          $('#tsb').innerHTML = '<ol><li>В приложении-аутентификаторе: «добавить вручную», ключ:<div class="secret">' + esc(d.secret) + '</div><span class="muted">или ссылка для телефона: <a href="' + esc(d.otpauth) + '">otpauth://…</a></span></li><li>Введите код из приложения: <input id="tc" inputmode="numeric" maxlength="6" style="width:120px;font:600 18px var(--mono)"> <button class="btn sm" id="tv">Проверить</button></li><li id="t3" hidden>Код верный. Последний шаг — на ПК: положить ключ в секрет функции (переменная <code>ADMIN_TOTP_SECRET</code>, через Lockbox) — это строка в задании Codex. Ключ не пересылайте в чатах; после записи этот экран не показывает его снова.</li></ol>';
          $('#tv').addEventListener('click', function () { api2('POST', '/api/admin/security/totp-check', {secret: d.secret, otp: $('#tc').value}).then(function (r) { if (r.ok) $('#t3').hidden = false; else flash($('#m'), 'Код не подошёл: проверьте время на телефоне', 'bad'); }); });
        }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
      });
    });
  };
  VIEWS.data = function () {
    return Promise.all([api2('GET', '/api/admin/classes'), api2('GET', '/api/admin/students')]).then(function (d) {
      var arch = d[0].filter(function (c) { return c.archived; });
      app.innerHTML = '<h2>Данные</h2><div class="msg" id="m" hidden></div>' +
        '<div class="card"><h3>Резервная копия</h3><p class="sub">Все таблицы базы одним JSON (без хешей паролей и приглашений; фото — ссылками-ключами). Храните на D: рядом с бэкапом банка, не в репозитории сайта.</p><button class="btn" id="ex">Скачать выгрузку</button></div>' +
        '<div class="card"><h3>Срок хранения фото решений</h3><p class="sub">Фото — самое «личное» в базе. Удаляйте старые после выставления оценок.</p><form class="row" id="ph" style="align-items:end">' + inp('days', 120, 'Старше, дней', 'number', 'min="1"') + '<button class="btn ghost" data-a="0">Посчитать</button><button class="btn danger" data-a="1">Удалить</button></form></div>' +
        '<div class="card"><h3>Обезличить класс после выпуска</h3><p class="sub">Только для архивных классов: имена → «ученик N», пароли и фото удаляются, коды отзываются; баллы остаются для статистики.</p><form class="row" id="an" style="align-items:end">' + sel('class_id', arch.length ? arch.map(function (c) { return [c.id, c.title + ' · ' + c.id]; }) : [['', '— нет архивных классов —']], '', 'Класс') + '<button class="btn ghost" data-a="0">Посчитать</button><button class="btn danger" data-a="1">Обезличить</button></form></div>' +
        '<div class="card"><h3>Удалить ученика полностью</h3><p class="sub">По просьбе ученика или родителей: запись, все сдачи и фото; код отзывается.</p><form class="row" id="ds" style="align-items:end">' + inp('code', '', 'Код ученика') + '<button class="btn ghost" data-a="0">Посчитать</button><button class="btn danger" data-a="1">Удалить</button></form></div>';
      $('#ex').addEventListener('click', function () { api2('GET', '/api/admin/export').then(function (x) { dl('metafizika-backup-' + x.exported_at.slice(0, 10) + '.json', JSON.stringify(x, null, 1), 'application/json'); flash($('#m'), 'Выгружено: ' + Object.keys(x.counts).map(function (k) { return k + ' ' + x.counts[k]; }).join(', '), 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }); });
      function run(form, body) {
        var go = '0'; form.addEventListener('click', function (e) { var b = e.target.closest('button[data-a]'); if (b) go = b.dataset.a; });
        form.addEventListener('submit', function (e) {
          e.preventDefault(); var b = body(formData(form)); if (!b) return; if (go === '1') { var c = prompt('Это необратимо. Напишите УДАЛИТЬ:', ''); if (c !== 'УДАЛИТЬ') return; b.apply = true; b.confirm = c; }
          api2('POST', '/api/admin/retention', b).then(function (r) { flash($('#m'), (r.apply ? 'Готово: ' : 'Затронет: ') + 'учеников ' + r.students + ', сдач ' + r.submissions + ', фото ' + r.photos + ', кодов ' + r.codes, r.apply ? 'ok' : ''); }).catch(function (er) { flash($('#m'), er.message, 'bad'); });
        });
      }
      run($('#ph'), function (v) { return {action: 'photos_older', days: +v.days}; });
      run($('#an'), function (v) { return v.class_id ? {action: 'anonymize_class', class_id: v.class_id} : null; });
      run($('#ds'), function (v) { var code = String(v.code || '').trim().toUpperCase(), st = d[1].find(function (s) { return s.code === code; }); if (!st) { flash($('#m'), 'Ученика с кодом ' + code + ' нет', 'bad'); return null; } return {action: 'delete_student', student_id: st.id}; });
    });
  };
  app.addEventListener('click', function (e) { var a = e.target.closest('a[data-tab]'); if (a && a.getAttribute('href') === '#' + a.dataset.tab) { e.preventDefault(); location.hash = a.dataset.tab; show(a.dataset.tab); } });

  start();
})();
