// Кабинет ученика: вход по коду и паролю, регистрация по пригласительному коду, «Задано мне» со статусами, «Мои работы».
(function () {
  'use strict';
  var M = window.MF, $ = function (s) { return document.querySelector(s); }, esc = M.esc, app = $('#app');
  var ST = {new: ['Не сдано', 'st-new'], late: ['Просрочено', 'st-late'], done: ['Сдано', 'st-work'], checked: ['Проверено', 'st-done']};
  function fmt(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit'}); }
  function get(u) { return fetch(u, {cache: 'no-cache'}).then(function (r) { return r.json(); }); }

  if (!M.configured) { app.innerHTML = '<p class="empty">Кабинет ещё не подключён к серверу. Пока можно <a href="/voiti/">войти по коду без пароля</a> — задания видны, отправка работает по-старому.</p>'; return; }

  function loginView(tab) {
    tab = tab || 'login';
    app.innerHTML = '<p class="sub">Код выдаёт учитель на бумажке, например <b>LC10FM-K7P3</b>. Первый раз — «Регистрация»: придумайте имя для сайта и пароль. Потом с любого устройства — «Войти».</p>' +
      '<div class="tabs" role="tablist"><button role="tab" data-t="login" aria-selected="' + (tab === 'login') + '">Войти</button><button role="tab" data-t="reg" aria-selected="' + (tab === 'reg') + '">Регистрация по коду</button></div>' +
      '<form class="card" id="f" novalidate><div class="field"><label for="code">Код ученика</label><input id="code" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="LC10FM-K7P3"></div>' +
      (tab === 'reg' ? '<div class="field"><label for="nm">Имя для сайта <span class="lvl">(как вас показывать; фамилия не нужна)</span></label><input id="nm" class="plain" autocomplete="nickname" placeholder="Петя"></div>' : '') +
      '<div class="field"><label for="pw">Пароль' + (tab === 'reg' ? ' <span class="lvl">(не короче 6 знаков — запомните его)</span>' : '') + '</label><input id="pw" class="plain" type="password" autocomplete="' + (tab === 'reg' ? 'new-password' : 'current-password') + '"></div>' +
      '<div class="row"><button class="btn" type="submit">' + (tab === 'reg' ? 'Зарегистрироваться' : 'Войти') + '</button></div><div class="msg" id="m" role="status" aria-live="polite" hidden></div>' +
      (tab === 'login' ? '<p class="cmt">Забыли пароль — скажите учителю, он сбросит, и вы зарегистрируетесь заново тем же кодом.</p>' : '') + '</form>';
    app.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) loginView(b.dataset.t); });
    $('#f').addEventListener('submit', function (e) {
      e.preventDefault(); var m = $('#m'); m.hidden = false; m.className = 'msg'; m.textContent = 'Проверяю…';
      var body = {code: $('#code').value, password: $('#pw').value}; if (tab === 'reg') body.name = $('#nm').value;
      M.api('POST', tab === 'reg' ? '/api/auth/register' : '/api/auth/login', body).then(function (r) {
        if (!r.body || !r.body.ok) { m.className = 'msg bad'; m.textContent = M.message(r); return; }
        var s = r.body.data.student; M.setToken(r.body.data.token);
        M.setStudent({code: s.code, group: s.class_id, title: s.class ? s.class.title : s.class_id, 'class': s.class ? s.class.klass : null, name: s.display_name, at: Date.now()});
        location.reload();
      });
    });
  }

  function cabinet(me) {
    Promise.all([get('/data/catalog.json'), get('/data/zadano.json'), M.api('GET', '/api/me/submissions'), M.api('GET', '/api/s/assignments')]).then(function (d) {
      var C = {}, Z = d[1], subs = d[2].body && d[2].body.ok ? d[2].body.data : [], TA = d[3].body && d[3].body.ok ? d[3].body.data : [], TT = {};
      TA.forEach(function (a) { TT[a.id] = a; });
      d[0].items.forEach(function (x) { C[x.id] = x; });
      var byA = {}; subs.forEach(function (s) { (byA[s.assignment_id] = byA[s.assignment_id] || []).push(s); });
      var tasks = (Z.assigned || []).filter(function (a) { return a.group === me.class_id; }).sort(function (a, b) { return (b.due || '').localeCompare(a.due || ''); });
      var today = new Date().toISOString().slice(0, 10);
      var zad = tasks.length ? '<ul class="mat">' + tasks.map(function (a) {
        var x = C[a.material] || {title: a.material, url: '#', kind: ''}, ss = byA[a.material] || [], last = ss[ss.length - 1];
        var st = last ? (last.status === 'checked' ? 'checked' : 'done') : (a.due && a.due < today ? 'late' : 'new');
        return '<li><a href="' + esc(x.url) + '" data-id="' + esc(x.id) + '"><span class="badge k-' + esc(x.kind) + '">' + esc((x.kind || '').toUpperCase()) + '</span><b>' + esc(x.title) + '</b><span class="st ' + ST[st][1] + '">' + ST[st][0] + (last && last.score_teacher != null ? ' · ' + last.score_teacher : '') + '</span>' +
          '<small>' + (a.due ? 'срок ' + fmt(a.due) + ' · ' : '') + (a.note ? esc(a.note) : '') + (last ? ' · попыток: ' + ss.length : '') + '</small></a></li>';
      }).join('') + '</ul>' : '<p class="empty">Пока ничего не задано.</p>';
      var tst = function (a, x) { var u = '#test/' + a.id + '/' + x.test_id, st = x.last_status === 'returned' ? ['На доработке', 'st-late'] : x.used ? (x.last_status === 'new' ? ['На проверке', 'st-work'] : ['Сдано', 'st-done']) : (a.due && a.due < today ? ['Просрочено', 'st-late'] : ['Не начато', 'st-new']);
        return '<li><a href="' + u + '"><span class="badge k-' + esc(x.kind) + '">' + esc((x.kind || 'тест').toUpperCase()) + '</span><b>' + esc(x.title) + '</b><span class="st ' + st[1] + '">' + st[0] + (x.best != null ? ' · ' + x.best + '/' + x.max : '') + '</span><small>' + x.ntasks + ' зад. · попыток ' + x.used + (x.attempts ? ' из ' + x.attempts : '') + (a.due ? ' · срок ' + fmt(a.due) : '') + (a.note ? ' · ' + esc(a.note) : '') + '</small></a></li>'; };
      var fromT = TA.length ? '<ul class="mat">' + TA.filter(function (a) { return a.status === 'active' || a.kind !== 'material'; }).map(function (a) {
        if (a.kind === 'test' && a.test) return tst(a, a.test);
        if (a.kind === 'material') { var x = C[a.ref] || {title: a.title, url: '#', kind: ''}; return '<li><a href="' + esc(x.url) + '"><span class="badge k-' + esc(x.kind) + '">' + esc((x.kind || '').toUpperCase()) + '</span><b>' + esc(a.title) + '</b><span class="st st-new">' + (a.due ? 'срок ' + fmt(a.due) : 'материал') + '</span><small>' + esc(a.note || '') + '</small></a></li>'; }
        if (a.kind === 'course' && a.course) return '<li><details class="topic" open><summary>Курс: ' + esc(a.title) + '</summary><div>' + (a.course.description ? '<p class="cmt">' + esc(a.course.description) + '</p>' : '') + a.course.modules.map(function (mo) {
          return '<h3>' + esc(mo.title) + (mo.open ? '' : ' <span class="lvl">· откроется ' + fmt(mo.opens) + '</span>') + '</h3>' + (mo.open ? '<ul class="mat">' + mo.items.map(function (it) {
            if (it.type === 'test' && it.test) return tst(a, it.test);
            if (it.type === 'material') { var x = C[it.ref] || {title: it.title, url: '#', kind: ''}; return '<li><a href="' + esc(x.url) + '"><span class="badge k-' + esc(x.kind) + '">' + esc((x.kind || '').toUpperCase()) + '</span><b>' + esc(it.title || x.title) + '</b><span></span><small>' + esc(it.note || '') + '</small></a></li>'; }
            if (it.type === 'link') return '<li><a href="' + esc(it.ref) + '" target="_blank" rel="noopener"><span class="badge">ССЫЛКА</span><b>' + esc(it.title || it.ref) + '</b><span></span><small>' + esc(it.note || '') + '</small></a></li>';
            return '<li class="card" style="margin:0">' + (it.title ? '<b>' + esc(it.title) + '</b><br>' : '') + esc(it.note) + '</li>';
          }).join('') + '</ul>' : '');
        }).join('') + '</div></details></li>';
        return '';
      }).join('') + '</ul>' : '';
      var works = subs.length ? '<table class="w"><tr><th>Дата</th><th>Работа</th><th>Попытка</th><th>Авто</th><th>Учитель</th><th>Статус</th></tr>' + subs.slice().reverse().map(function (s) {
        var x = s.test_id ? {title: (TT[s.assignment_id] ? TT[s.assignment_id].title : 'тест'), url: '#review/' + s.id} : (C[s.assignment_id] || {title: s.assignment_id});
        return '<tr><td>' + fmt(s.created_at) + '</td><td><a href="' + esc(x.url || '#') + '">' + esc(x.title) + '</a>' + (s.comment ? '<div class="cmt">' + esc(s.comment) + '</div>' : '') + '</td><td>' + s.attempt + (s.final ? ' (финал)' : '') + (s.late ? ' · просрочено' : '') + '</td>' +
          '<td class="score">' + (s.score_auto != null ? s.score_auto + (s.score_max ? '/' + s.score_max : '') : '—') + '</td><td class="score">' + (s.score_teacher != null ? s.score_teacher : '—') + '</td><td><span class="st ' + ({checked: 'st-done', auto: 'st-done', returned: 'st-late'}[s.status] || 'st-work') + '">' + ({checked: 'Проверено', auto: 'Проверено', returned: 'На доработке'}[s.status] || 'На проверке') + '</span></td></tr>';
      }).join('') + '</table>' : '<p class="empty">Сданных работ пока нет.</p>';
      app.innerHTML = '<p class="sub"><b>' + esc(me.display_name) + '</b> · ' + esc(me.class ? me.class.title : me.class_id) + ' · код ••' + esc(me.code.slice(-2)) + ' · <a href="#" id="out">выйти</a></p>' +
        '<h2>Задано мне</h2>' + fromT + (TA.length && !tasks.length ? '' : zad) + '<h2>Мои работы</h2>' + works +
        '<p class="cmt">Баллы части 2 и комментарии ставит учитель. Фото решений видит только учитель.</p>';
      $('#out').addEventListener('click', function (e) { e.preventDefault(); M.setToken(null); M.setStudent(null); location.href = '/'; });
    }).catch(function (e) { app.innerHTML = '<p class="empty">Не удалось загрузить: ' + esc(e.message) + '</p>'; });
  }

  var ME = null;
  function route() {
    var h = location.hash.slice(1).split('/');
    if (h[0] === 'test' && window.MFRunner) return window.MFRunner.open(app, h[1], h[2]);
    if (h[0] === 'review' && window.MFRunner) return window.MFRunner.review(app, h[1]);
    app.oninput = app.onchange = app.onclick = null; cabinet(ME);
  }
  window.addEventListener('hashchange', function () { if (ME) route(); });
  if (!M.token()) { loginView(); return; }
  M.api('GET', '/api/me').then(function (r) {
    if (!r.body || !r.body.ok || r.body.data.role !== 'student') { M.setToken(null); loginView(); if (r.status === 403) { $('#m').hidden = false; $('#m').className = 'msg bad'; $('#m').textContent = M.message(r); } return; }
    ME = r.body.data; route();
  });
})();
