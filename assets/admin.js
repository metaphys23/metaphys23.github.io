// Админка учителя: классы, коды (с печатью), ученики, сдачи и баллы, «Задано» и материалы (формы над data/*.json → коммит), файлы репозитория.
(function () {
  'use strict';
  var M = window.MF, esc = M.esc, $ = function (s, r) { return (r || document).querySelector(s); }, app = $('#app');
  var TABS = [['classes', 'Классы'], ['codes', 'Коды'], ['students', 'Ученики'], ['subs', 'Сдачи'], ['zadano', 'Задано'], ['catalog', 'Материалы'], ['files', 'Файлы']];
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
    app.innerHTML = '<form class="card" id="lf" style="max-width:420px"><div class="field"><label for="pw">Пароль учителя</label><input id="pw" type="password" autocomplete="current-password"></div><div class="row"><button class="btn" type="submit">Войти</button></div><div class="msg" id="m" hidden></div></form>';
    if (msg) flash($('#m'), msg, 'bad');
    $('#lf').addEventListener('submit', function (e) { e.preventDefault(); M.api('POST', '/api/auth/admin', {password: $('#pw').value}).then(function (r) { if (!r.body || !r.body.ok) return flash($('#m'), M.message(r), 'bad'); M.setToken(r.body.data.token); start(); }); });
  }
  function start() {
    if (!M.token()) return loginView();
    M.api('GET', '/api/me').then(function (r) {
      if (!r.body || !r.body.ok || r.body.data.role !== 'admin') { M.setToken(null); $('#tabs').innerHTML = ''; $('#logout').hidden = true; return loginView(r.status === 429 ? M.message(r) : ''); }
      $('#who').textContent = 'учитель'; $('#logout').hidden = false;
      $('#tabs').innerHTML = TABS.map(function (t) { return '<a data-tab="' + t[0] + '">' + t[1] + '</a>'; }).join('');
      show(location.hash.slice(1) || 'codes');
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
    return M.api('GET', '/api/admin/classes').then(need).then(function (list) {
      app.innerHTML = '<h2>Классы (группы кодов)</h2><p class="sub">Группа — префикс кода ученика (<b>LC10FM</b>). Коды и ученики привязаны к группе. Публичный список групп для сайта — в <code>data/zadano.json</code> (кнопка «Взять из zadano.json» заводит их здесь).</p>' +
        '<table class="w"><tr><th>Группа</th><th>Название</th><th>Класс</th><th>Год</th><th></th></tr>' + list.map(function (c) { return '<tr><td class="code">' + esc(c.id) + '</td><td>' + esc(c.title) + '</td><td>' + esc(c.klass) + '</td><td>' + esc(c.year) + '</td><td><a href="#codes" data-tab="codes" data-class="' + esc(c.id) + '">коды →</a></td></tr>'; }).join('') + '</table>' +
        '<form class="card" id="cf"><h3>Добавить / изменить</h3><div class="grid">' + inp('id', '', 'Группа (LC10FM)') + inp('title', '', 'Название (10 ФМ)') + inp('klass', '', 'Класс', 'number') + inp('year', '', 'Учебный год') + '</div><div class="row"><button class="btn" type="submit">Сохранить</button><button class="btn ghost" type="button" id="fromZ">Взять из zadano.json</button></div><div class="msg" id="m" hidden></div></form>';
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

  start();
})();
