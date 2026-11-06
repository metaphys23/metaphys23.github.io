// Админка владельца сайта: обзор, учителя, классы (с владельцем), коды, ученики, сдачи, «Задано», материалы, файлы репозитория,
// редактор теории и материалов, замечания хабу (v3), модерация библиотеки, журнал действий, безопасность (2FA, отзыв сессий, режимы), данные (выгрузка, хранение, удаление). v2 — handlers/admin.js.
(function () {
  'use strict';
  var M = window.MF, esc = M.esc, $ = function (s, r) { return (r || document).querySelector(s); }, app = $('#app');
  var TABS = [['overview', 'Обзор'], ['teachers', 'Учителя'], ['classes', 'Классы'], ['codes', 'Коды'], ['students', 'Ученики'], ['subs', 'Сдачи'], ['zadano', 'Задано'], ['catalog', 'Материалы'], ['files', 'Редактор'], ['pravki', 'Замечания'], ['moder', 'Модерация'], ['audit', 'Журнал'], ['security', 'Безопасность'], ['data', 'Данные']];
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
      $('#who').innerHTML = 'владелец · <a href="/uchitel/">кабинет учителя</a>'; $('#logout').hidden = false; if (window.Pravki) window.Pravki.boot();
      $('#tabs').innerHTML = TABS.map(function (t) { return '<a data-tab="' + t[0] + '">' + t[1] + '</a>'; }).join('');
      show(location.hash.slice(1) || 'overview');
    });
  }
  $('#logout').addEventListener('click', function (e) { e.preventDefault(); M.setToken(null); location.reload(); });
  $('#tabs').addEventListener('click', function (e) { var a = e.target.closest('a[data-tab]'); if (a) { location.hash = a.dataset.tab; show(a.dataset.tab); } });
  var ARGS = new URLSearchParams(''), SHOWN = null; // параметры вкладки из адреса: #files?path=…&find=…
  // ссылки вида #files?path=… (например «Исправить сам» в «Замечаниях») открывают вкладку без перезагрузки
  window.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (h && h !== SHOWN && M.token()) show(h); });
  function show(tab) {
    SHOWN = tab;
    var qi = tab.indexOf('?'); ARGS = new URLSearchParams(qi < 0 ? '' : tab.slice(qi + 1)); tab = qi < 0 ? tab : tab.slice(0, qi);
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

  // ---------- редактор: теория учебника (.md — предпросмотр с формулами и проверка выводов), страницы, данные сайта; замена PDF, картинки
  // Адрес с параметрами: #files?path=<файл>&find=<текст>&block=<номер>&remark=<id> — так открывает «Исправить сам» из окна замечаний.
  var GROUPS = [['uchebnik/', 'Учебник — теория'], ['data/', 'Данные сайта'], ['klass/', 'Классы'], ['assets/', 'Стили и код'], ['', 'Остальное']];
  var MAX_UP = 2400 * 1024; // сервер принимает до ~3,3 МБ base64 (лимит запроса Cloud Functions 3,5 МБ)
  function grp(p) { for (var i = 0; i < GROUPS.length - 1; i++) if (p.indexOf(GROUPS[i][0]) === 0) return i; return GROUPS.length - 1; }
  function siteUrl(p) { if (/\.md$/.test(p) || /(^|\/)index\.html$/.test(p)) return '/' + p.replace(/[^/]*$/, ''); if (/\.(html|pdf|png|jpe?g|webp|json)$/.test(p)) return '/' + p; return ''; }
  function nextNum(src) {
    var re = /^>\s*\[![A-Za-z]+\]\s*(\d+)\.(\d+)/gm, m, top = null, max = {};
    while ((m = re.exec(src))) { if (top === null) top = m[1]; max[m[1]] = Math.max(max[m[1]] || 0, +m[2]); }
    return top === null ? '1.1' : top + '.' + (max[top] + 1);
  }
  function tpl(code, num) {
    if (code === 'Deriv') return ['> [!Deriv] ' + num + ' Вывод: …', '> Исходное: какие определения и законы (номера блоков).', '>', '> **Стандартный вывод** подстановка уравнений',
      '> $$… \\qquad (1)$$', '> $$… \\qquad (2)$$', '> Подставляем (1) в (2):', '> $$…$$', '> Проверка размерности: …', '>', '> **Дифференциальный вывод** через производную', '> $$…$$'].join('\n');
    var body = {Law: 'Формулировка, $…$, границы применимости. Вывод: [[#…]] (или Опыт: [[#…]]).', Eq: '$$…$$\n> Смысл и единицы каждой буквы. Вывод: [[#…]].', Thm: 'Условие → утверждение. Вывод: [[#…]].',
      Cor: 'Из какого закона и как получено. Вывод: [[#…]].', Q: 'Вопрос? Ответ — в блоке [[#…]].'}[code] || '…';
    return '> [!' + code + '] ' + num + ' Название\n> ' + body;
  }
  function pageTpl(v) {
    return '---\ntitle: ' + v.title + '\ntopic: ' + v.topic + '\nclasses: [' + v.classes.join(', ') + ']\n---\n\n' + tpl('Def', '1.1') + '\n\n' +
      tpl('Eq', '1.2').replace('[[#…]]', '[[#1.3]]') + '\n\n' + tpl('Deriv', '1.3') + '\n\n' + tpl('Q', '1.4').replace('[[#…]]', '[[#1.2]]') + '\n';
  }
  function shell(title) {
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>' + esc(title) + ' · Учебник</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/katex/katex.min.css">\n' +
      '</head><body><main data-page="teoriya" data-src="index.md"><p class="sub">Загружаю…</p></main>\n<noscript><p style="padding:20px">Для учебника нужен JavaScript. Текст страницы: <a href="index.md">index.md</a>.</p></noscript>\n' +
      '<script src="/assets/katex/katex.min.js" defer></script><script src="/assets/md.js" defer></script><script src="/assets/site.js" defer></script></body></html>\n';
  }
  function b64(file) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = no; r.readAsDataURL(file); }); }
  function upload(path, file, replace) {
    if (file.size > MAX_UP) return Promise.reject(new Error('Файл ' + Math.round(file.size / 1024) + ' КБ — больше 2,4 МБ. Сожмите PDF или картинку.'));
    return b64(file).then(function (c) { return M.api('PUT', '/api/admin/content/file', {path: path, content_b64: c, replace: !!replace, message: (replace ? 'admin: заменить ' : 'admin: загрузить ') + path}).then(need); });
  }
  VIEWS.files = function () {
    return Promise.all([M.api('GET', '/api/admin/content/tree').then(need), fetch('/data/catalog.json', {cache: 'no-cache'}).then(function (r) { return r.json(); }), fetch('/data/temy.json').then(function (r) { return r.json(); })]).then(function (d) {
      var tree = d[0], cat = d[1], temy = d[2].sections, cur = ARGS.get('path') || sessionStorage.getItem('mf:adm:file') || '', remark = ARGS.get('remark') || '';
      var pdfs = cat.items.filter(function (x) { return /^\/[^?#]+\.(pdf|png|jpe?g|webp)$/i.test(x.url); });
      var opts = GROUPS.map(function (g, gi) { var fs = tree.filter(function (f) { return grp(f.path) === gi; }).sort(function (a, b) { return (/\.md$/.test(b.path) - /\.md$/.test(a.path)) || a.path.localeCompare(b.path); });
        return fs.length ? '<optgroup label="' + esc(g[1]) + '">' + fs.map(function (f) { return '<option value="' + esc(f.path) + '"' + (f.path === cur ? ' selected' : '') + '>' + esc(f.path) + '</option>'; }).join('') + '</optgroup>' : ''; }).join('');
      app.innerHTML = '<h2>Редактор</h2><p class="sub">Теория учебника, страницы и данные сайта. «Сохранить» = коммит в <code>main</code>, сайт обновится через ~1 мин. Сборка: <span id="pst">…</span></p>' +
        (remark ? '<div class="msg" id="rmk">Правка по замечанию <b>' + esc(remark) + '</b>. После сохранения: <button class="btn sm" id="rdone" disabled>Закрыть замечание — исправил сам</button></div>' : '') +
        '<div class="row" style="align-items:end"><div class="field" style="flex:1;min-width:240px"><label>Файл</label><select name="file"><option value="">— выберите файл —</option>' + opts + '</select></div>' +
        '<button class="btn ghost" id="np">Новая страница теории</button></div><div class="msg" id="m" hidden></div>' +
        '<form class="card" id="npf" hidden><h3>Новая страница учебника</h3><div class="row">' + inp('slug', '', 'Адрес (латиница): /uchebnik/…/') + inp('title', '', 'Название') + '</div><div class="row">' +
        sel('topic', temy.reduce(function (a, s) { return a.concat(s.topics.map(function (t) { return [t.id, s.title + ' · ' + t.title]; })); }, []), '', 'Тема') + inp('sub', '', 'Подтема') + inp('classes', '10', 'Классы через запятую') + '</div>' +
        '<p class="sub">Создаст <code>index.md</code> с блоками Def → Eq → Deriv (две формы) → Q, каркас страницы и запись в каталоге со статусом «только по ссылке».</p><div class="row"><button class="btn">Создать</button></div></form>' +
        '<details class="card" id="upd"><summary><b>Заменить PDF или загрузить картинку</b></summary><p class="sub">PDF правят в исходнике (Word, LaTeX) на ПК — сюда загружают новый файл того же адреса. До 2,4 МБ. Картинка для теории ложится в <code>img/</code> рядом с открытым <code>.md</code> и вставляется в текст.</p>' +
        '<div class="row" style="align-items:end">' + sel('rp', [['', '— материал —']].concat(pdfs.map(function (x) { return [x.url.slice(1), x.title + ' · ' + x.url.split('/').pop()]; })), '', 'Заменить файл материала') +
        '<div class="field"><label>Новый файл</label><input type="file" id="rf" accept=".pdf,.png,.jpg,.jpeg,.webp"></div><button class="btn ghost" id="rgo">Заменить</button></div>' +
        '<div class="row" style="align-items:end"><div class="field"><label>Картинка в теорию (откройте .md)</label><input type="file" id="if" accept=".png,.jpg,.jpeg,.webp"></div><button class="btn ghost" id="igo">Загрузить и вставить</button></div></details>' +
        '<div id="ed"></div>';
      M.api('GET', '/api/admin/content/status').then(function (r) { $('#pst').textContent = r.body && r.body.ok ? r.body.data.status + (r.body.data.updated_at ? ' · ' + fmt(r.body.data.updated_at) : '') : '?'; });
      $('select[name=file]').addEventListener('change', function () { sessionStorage.setItem('mf:adm:file', this.value); location.hash = 'files?path=' + encodeURIComponent(this.value); show('files?path=' + encodeURIComponent(this.value)); });
      $('#np').addEventListener('click', function () { $('#npf').hidden = !$('#npf').hidden; });
      $('#npf').addEventListener('submit', function (e) {
        e.preventDefault(); var v = formData(this); v.slug = v.slug.trim().toLowerCase(); v.title = v.title.trim();
        v.classes = String(v.classes).split(/[,\s]+/).map(Number).filter(function (k) { return k >= 5 && k <= 11; });
        if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(v.slug)) return flash($('#m'), 'Адрес: латинские буквы, цифры и дефис, например dvizhenie-po-okruzhnosti', 'bad');
        if (!v.title || !v.classes.length) return flash($('#m'), 'Нужны название и хотя бы один класс', 'bad');
        var base = 'uchebnik/' + v.slug + '/', id = 'u' + v.classes[0] + '-' + v.slug;
        if (tree.some(function (f) { return f.path.indexOf(base) === 0; }) || cat.items.some(function (x) { return x.id === id; })) return flash($('#m'), 'Такая страница уже есть', 'bad');
        var b = this.querySelector('button'); b.disabled = true;
        saveFile(base + 'index.md', pageTpl(v), 'admin: новая страница теории ' + base).then(function () { return saveFile(base + 'index.html', shell(v.title), 'admin: каркас ' + base); })
          .then(function () { return loadFile('data/catalog.json', true); }).then(function (f) { var c = JSON.parse(f.content); c.items.push({id: id, title: v.title, kind: 'konspekt', section: 'uchebnik', topic: v.topic, sub: v.sub || '', classes: v.classes, url: '/' + base, desc: '', status: 'proba', level: 'baza', added: new Date().toISOString().slice(0, 10)}); return saveJson('data/catalog.json', c, 'admin: каталог + ' + id); })
          .then(function () { sessionStorage.setItem('mf:adm:file', base + 'index.md'); location.hash = 'files?path=' + encodeURIComponent(base + 'index.md'); show('files?path=' + encodeURIComponent(base + 'index.md')); })
          .catch(function (er) { b.disabled = false; flash($('#m'), er.message, 'bad'); });
      });
      $('#rgo').addEventListener('click', function () {
        var p = $('select[name=rp]').value, f = $('#rf').files[0]; if (!p || !f) return flash($('#m'), 'Выберите материал и новый файл', 'bad');
        if (p.split('.').pop().toLowerCase() !== f.name.split('.').pop().toLowerCase()) return flash($('#m'), 'Тип файла другой: заменяем ' + p.split('.').pop() + ' на ' + f.name.split('.').pop(), 'bad');
        var b = this; b.disabled = true; upload(p, f, true).then(function () { flash($('#m'), 'Заменено: ' + p + '. На сайте — через ~1 мин', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }).then(function () { b.disabled = false; });
      });
      $('#igo').addEventListener('click', function () {
        var f = $('#if').files[0], ta = $('#ta'); if (!f || !/\.md$/.test(cur) || !ta) return flash($('#m'), 'Откройте страницу теории (.md) и выберите картинку', 'bad');
        var name = f.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, ''), p = cur.replace(/[^/]*$/, '') + 'img/' + name, b = this; b.disabled = true;
        upload(p, f, tree.some(function (x) { return x.path === p; })).then(function () { ins(ta, '\n![Подпись](img/' + name + ')\n'); flash($('#m'), 'Загружено: ' + p + ' — ссылка вставлена в текст', 'ok'); }).catch(function (er) { flash($('#m'), er.message, 'bad'); }).then(function () { b.disabled = false; });
      });
      if (!cur) return;
      var isMd = /\.md$/.test(cur), isJson = /\.json$/.test(cur), url = siteUrl(cur);
      return loadFile(cur, true).then(function (f) {
        $('#ed').innerHTML = (isMd ? '<div class="row tb">' + sel('blk', [['', '+ блок Карты']].concat(Object.keys(MD.blocks).map(function (k) { var z = MD.blocks[k]; return [z[1], z[0] + ' ' + z[1]]; })), '', 'Вставить') +
          '<button class="btn ghost sm" data-ins="Deriv">↓ Вывод в двух формах</button><button class="btn ghost sm" data-ins="$$">$$ формула</button><button class="btn ghost sm" data-ins="$">$ в строке</button>' +
          '<button class="btn ghost sm" id="lint">Проверить выводы</button><button class="btn ghost sm" id="rem">✎ Замечание хабу</button></div>' : '') +
          '<div class="' + (isMd ? 'split' : '') + '"><textarea class="editor" id="ta" spellcheck="' + isMd + '"></textarea>' + (isMd ? '<div class="teo pvw" id="pv"></div>' : '') + '</div>' +
          (isMd ? '<ul class="lint" id="ln"></ul>' : '') +
          '<div class="row"><input id="cm" placeholder="что изменено (сообщение коммита)" style="flex:1;font:15px var(--body);padding:8px 10px;border:1px solid var(--rule);border-radius:8px"><button class="btn" id="save">Сохранить</button>' +
          (url ? '<a class="btn ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Открыть на сайте</a>' : '') + '</div>';
        var ta = $('#ta'); ta.value = f.content;
        var t = null, draw = function () {
          if (!isMd) return; var R = MD.render(ta.value, {base: '/' + cur.replace(/[^/]*$/, '')}); $('#pv').innerHTML = R.html; MD.bind($('#pv'));
          var L = MD.lint(ta.value), cls = {err: 'bad', warn: 'warn', hint: 'muted'};
          $('#ln').innerHTML = L.length ? L.map(function (x) { return '<li class="' + cls[x.level] + '" data-num="' + esc(x.num) + '">' + (x.level === 'err' ? '✗ ' : x.level === 'warn' ? '! ' : '· ') + esc(x.text) + '</li>'; }).join('') : '<li class="ok">✓ Выводы на месте: у каждой формулы есть Deriv или Exp, выводы в двух формах.</li>';
          return L;
        };
        if (isMd) {
          draw(); ta.addEventListener('input', function () { clearTimeout(t); t = setTimeout(draw, 300); });
          $('#ed').addEventListener('change', function (e) { if (e.target.name === 'blk' && e.target.value) { ins(ta, '\n\n' + tpl(e.target.value, nextNum(ta.value)) + '\n\n'); e.target.value = ''; draw(); } });
          $('#ed').addEventListener('click', function (e) {
            var b = e.target.closest('[data-ins]'); if (b) { var k = b.dataset.ins; ins(ta, k === 'Deriv' ? '\n\n' + tpl('Deriv', nextNum(ta.value)) + '\n\n' : k === '$$' ? '\n$$  $$\n' : '$  $'); draw(); }
            var li = e.target.closest('#ln li[data-num]'); if (li && li.dataset.num) { var el = document.getElementById(li.dataset.num); if (el) el.scrollIntoView({block: 'center'}); seek(ta, '] ' + li.dataset.num); }
          });
          $('#lint').addEventListener('click', function () { var L = draw(); flash($('#m'), L.filter(function (x) { return x.level !== 'hint'; }).length ? 'Есть что поправить — список под текстом' : 'Выводы на месте', L.some(function (x) { return x.level === 'err'; }) ? 'bad' : 'ok'); });
          $('#rem').addEventListener('click', function () { if (window.Pravki) window.Pravki.open(window.Pravki.context()); });
          if (ARGS.get('block')) { var el = document.getElementById(ARGS.get('block')); if (el) el.scrollIntoView({block: 'start'}); }
        }
        if (ARGS.get('find')) seek(ta, ARGS.get('find')); else if (ARGS.get('block')) seek(ta, '] ' + ARGS.get('block'));
        // окно замечаний в админке берёт файл, выделение и блок из редактора
        if (window.Pravki) window.Pravki.context = function () {
          if (!document.body.contains(ta)) return {};
          var q = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim(), bl = null, re = /^>\s*\[![A-Za-z]+\]\s*(\d+\.\d+)/gm, m, before = ta.value.slice(0, ta.selectionStart);
          while ((m = re.exec(before))) bl = m[1];
          return {file: cur, quote: q.slice(0, 4000), block: bl || '', page: (url || '/' + cur) + (bl ? '#' + bl : '')};
        };
        $('#save').addEventListener('click', function () {
          var b = this, text = ta.value;
          if (isJson) { try { JSON.parse(text); } catch (er) { return flash($('#m'), 'JSON с ошибкой, не сохраняю: ' + er.message, 'bad'); } }
          if (isMd) { var bad = MD.lint(text).filter(function (x) { return x.level === 'err'; }); if (bad.length && !confirm('Формул без вывода или ошибок нумерации: ' + bad.length + '. Сохранить как черновик всё равно?')) return; }
          b.disabled = true;
          saveFile(cur, text, $('#cm').value || ('admin: ' + cur + (remark ? ' (замечание ' + remark + ')' : ''))).then(function (r) {
            flash($('#m'), 'Сохранено' + (r.commit ? ' · коммит ' + String(r.commit).slice(0, 7) : '') + ', сайт обновится через ~1 мин', 'ok');
            if ($('#rdone')) { $('#rdone').disabled = false; $('#rdone').dataset.commit = r.commit || r.sha || ''; }
          }).catch(function (er) { flash($('#m'), er.message, 'bad'); }).then(function () { b.disabled = false; });
        });
        if ($('#rdone')) $('#rdone').addEventListener('click', function () { var b = this; b.disabled = true; api2('PATCH', '/api/admin/remarks/' + encodeURIComponent(remark), {status: 'gotovo', answer: 'Исправил сам в редакторе: ' + cur + (b.dataset.commit ? ', коммит ' + b.dataset.commit.slice(0, 7) : '') + '.'}).then(function () { flash($('#rmk'), 'Замечание закрыто', 'ok'); }).catch(function (er) { b.disabled = false; flash($('#m'), er.message, 'bad'); }); });
      });
    });
  };
  function ins(ta, text) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1;
    if (/^>/.test(v.slice(ls, s)) && !/^\n*>/.test(text)) text = text.replace(/\n/g, '\n> ');
    ta.value = v.slice(0, s) + text + v.slice(e); ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus(); ta.dispatchEvent(new Event('input'));
  }
  function seek(ta, find) {
    var v = ta.value, i = v.indexOf(find), n = find.length;
    if (i < 0) { var w = find.replace(/\s+/g, ' ').trim().slice(0, 40); i = v.replace(/\s/g, ' ').indexOf(w); n = w.length; }
    if (i < 0) return false;
    ta.focus(); ta.setSelectionRange(i, i + n); ta.scrollTop = Math.max(0, (v.slice(0, i).split('\n').length - 4) * 20); return true;
  }

  // ---------- замечания: папка в приватном репозитории = статус (novye → хаб → gotovo | vopros | otkloneno)
  var RST = [['novye', 'Новые'], ['vopros', 'Вопросы хаба'], ['gotovo', 'Готово'], ['otkloneno', 'Отклонено']];
  var RKIND = {ispravit: 'исправить', vstavka: 'вставка', vyvod: 'нет вывода', opechatka: 'опечатка', ideya: 'идея'};
  VIEWS.pravki = function () {
    var st = ARGS.get('status') || 'novye', month = ARGS.get('month') || new Date().toISOString().slice(0, 7);
    return api2('GET', '/api/admin/remarks?status=' + st + (/^(gotovo|otkloneno)$/.test(st) ? '&month=' + month : '')).then(function (list) {
      app.innerHTML = '<h2>Замечания</h2><p class="sub">Окно «✎ Замечание» на любой странице сайта (видно только вам) кладёт файл в приватный репозиторий замечаний; хаб разбирает «Новые», исправляет и отвечает здесь. Исправить можно и самому — кнопкой «Исправить сам».</p>' +
        '<div class="row">' + RST.map(function (s) { return '<a class="chip" href="#pravki?status=' + s[0] + '" data-tab="pravki?status=' + s[0] + '"' + (s[0] === st ? ' aria-pressed="true"' : '') + '>' + s[1] + '</a>'; }).join('') +
        (/^(gotovo|otkloneno)$/.test(st) ? '<input type="month" id="mon" value="' + esc(month) + '" style="font:15px var(--body);padding:6px 8px;border:1px solid var(--rule);border-radius:8px">' : '') +
        '<button class="btn sm" id="new">+ Замечание</button></div><div class="msg" id="m" hidden></div>' +
        (list.length ? list.map(function (r) {
          var edit = window.Pravki ? window.Pravki.editHref({file: r.file, quote: r.quote, block: r.block, remark: r.id}) : '#files';
          return '<div class="card" data-id="' + esc(r.id) + '"><div class="row" style="justify-content:space-between"><b>' + esc(RKIND[r.kind] || r.kind) + (r.block ? ' · блок ' + esc(r.block) : '') + '</b><span class="muted">' + fmt(r.created) + ' · <code>' + esc(r.path) + '</code></span></div>' +
            '<p class="sub">' + (r.page ? '<a href="' + esc(r.page) + '" target="_blank" rel="noopener">' + esc(r.page) + '</a>' : '') + (r.file ? ' · <code>' + esc(r.file) + '</code>' : '') + '</p>' +
            (r.quote ? '<blockquote style="margin:6px 0;padding:6px 10px;border-left:3px solid var(--rule);white-space:pre-wrap">' + esc(r.quote) + '</blockquote>' : '') +
            '<p style="white-space:pre-wrap">' + esc(r.text) + '</p>' +
            (r.answers || []).map(function (a) { return '<div class="msg ' + (a.who === 'хаба' ? 'ok' : '') + '" style="white-space:pre-wrap;margin:6px 0"><b>Ответ ' + esc(a.who) + '</b> <span class="muted">' + esc(a.at) + '</span>\n' + esc(a.text) + '</div>'; }).join('') +
            '<div class="row">' + (r.file && !/^fizika-trenazhery:/.test(r.file) ? '<a class="btn ghost sm" href="' + esc(edit) + '">Исправить сам</a>' : '') +
            (st === 'vopros' ? '<textarea data-ans placeholder="Ответ хабу" style="flex:1;min-height:60px;font:15px var(--body);padding:8px;border:1px solid var(--rule);border-radius:8px"></textarea><button class="btn sm" data-st="novye">Ответить хабу</button>' : '') +
            (st === 'novye' || st === 'vopros' ? '<button class="btn ghost sm" data-st="gotovo">Готово — исправил сам</button><button class="btn ghost sm" data-st="otkloneno">Отклонить</button>' : '<button class="btn ghost sm" data-st="novye">Вернуть хабу</button>') + '</div></div>';
        }).join('') : '<p class="empty">' + (st === 'novye' ? 'Новых замечаний нет.' : 'Пусто.') + '</p>');
      $('#new').addEventListener('click', function () { if (window.Pravki) window.Pravki.open({page: '/', blocks: [], materials: []}); else flash($('#m'), 'Окно замечаний не загрузилось — обновите страницу', 'bad'); });
      if ($('#mon')) $('#mon').addEventListener('change', function () { location.hash = 'pravki?status=' + st + '&month=' + this.value; show(location.hash.slice(1)); });
      app.onclick = function (e) {
        var b = e.target.closest('button[data-st]'); if (!b) return; var card = b.closest('[data-id]'), ta = card.querySelector('[data-ans]'), body = {status: b.dataset.st};
        if (ta) { if (b.dataset.st === 'novye' && !ta.value.trim()) return flash($('#m'), 'Напишите ответ хабу', 'bad'); if (ta.value.trim()) body.answer = ta.value.trim(); }
        if (b.dataset.st === 'gotovo' && !body.answer) body.answer = 'Исправил сам.';
        b.disabled = true; api2('PATCH', '/api/admin/remarks/' + encodeURIComponent(card.dataset.id), body).then(function () { card.remove(); flash($('#m'), 'Перенесено: ' + (RST.filter(function (s) { return s[0] === body.status; })[0] || [0, body.status])[1], 'ok'); }).catch(function (er) { b.disabled = false; flash($('#m'), er.message, 'bad'); });
      };
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
