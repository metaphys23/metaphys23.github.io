// Прохождение теста учителя в кабинете ученика (/me/#test/<задание>/<тест>) и разбор своей работы (/me/#review/<сдача>).
// Ключей в браузере нет: проверяет сервер (/api/s/submit, /api/s/check для Т1). Ответы сохраняются на устройстве до сдачи; фото — только в памяти страницы.
(function () {
  'use strict';
  var M = window.MF, esc = M.esc, $ = function (s, r) { return (r || document).querySelector(s); };
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function math(el) { try { if (window.renderMathInElement) window.renderMathInElement(el, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false}); } catch (e) {} }
  function fmt(s) { var d = new Date(s); return isNaN(d) ? (s || '') : d.toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}); }
  function cid() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  // фото: уменьшить до 1600 px по большей стороне, JPEG 0.82 — сервер принимает ≤ 1,5 МБ
  function shrink(file) {
    return new Promise(function (ok, bad) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error('Не получилось открыть фото')); }; img.src = url;
    });
  }
  function tasksOf(t) { var r = []; (t.blocks || []).forEach(function (b) { (b.tasks || []).forEach(function (x) { r.push(x); }); }); return r; }

  function field(x, val) {
    var n = esc(x.n);
    if (x.type === 'num') return '<div class="row" style="align-items:center"><input class="ans" data-n="' + n + '" inputmode="decimal" autocomplete="off" value="' + esc(val || '') + '" style="max-width:220px;font:600 18px var(--mono);padding:8px 10px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--ink)">' + (x.unit ? '<span>' + esc(x.unit) + '</span>' : '') + '</div>';
    if (x.type === 'one') return '<div>' + (x.choices || []).map(function (c, i) { return '<label class="chk"><input type="radio" name="r' + n + '" class="ans" data-n="' + n + '" value="' + (i + 1) + '"' + (String(val) === String(i + 1) ? ' checked' : '') + '> <span><b>' + (i + 1) + '.</b> ' + esc(c) + '</span></label>'; }).join('') + '</div>';
    if (x.type === 'many' && (x.choices || []).length && !x.ordered) return '<div>' + x.choices.map(function (c, i) { return '<label class="chk"><input type="checkbox" class="ansm" data-n="' + n + '" value="' + (i + 1) + '"' + (String(val || '').indexOf(String(i + 1)) >= 0 ? ' checked' : '') + '> <span><b>' + (i + 1) + '.</b> ' + esc(c) + '</span></label>'; }).join('') + '</div>';
    if (x.type === 'many') return ((x.choices || []).length ? '<ol>' + x.choices.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' : '') + '<input class="ans" data-n="' + n + '" inputmode="numeric" placeholder="цифры подряд" value="' + esc(val || '') + '" style="max-width:220px;font:600 18px var(--mono);padding:8px 10px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--ink)">';
    if (x.type === 'text') return '<input class="ans" data-n="' + n + '" autocomplete="off" value="' + esc(val || '') + '" style="max-width:360px;font:16px var(--body);padding:8px 10px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--ink)">';
    return '';
  }

  function open(app, asg, testId) {
    app.innerHTML = '<p class="sub">Загружаю тест…</p>';
    M.api('GET', '/api/s/test?assignment_id=' + encodeURIComponent(asg) + (testId ? '&test_id=' + encodeURIComponent(testId) : '')).then(function (r) {
      if (!r.body || !r.body.ok) { app.innerHTML = '<p class="msg bad">' + esc(M.message(r)) + '</p><p><a href="#">← в кабинет</a></p>'; return; }
      var d = r.body.data, t = d.test, K = 'mf:ans:' + asg + ':' + t.id, A = store(K) || {}, photos = {}, started = Date.now(), list = tasksOf(t);
      var tl = t.time_limit_min ? t.time_limit_min * 60 : 0;
      app.innerHTML = '<p class="crumbs"><a href="#">← в кабинет</a></p><h2>' + esc(t.title) + '</h2><p class="sub">' + esc(d.assignment.title !== t.title ? d.assignment.title + ' · ' : '') + (d.assignment.due ? 'срок ' + esc(d.assignment.due.split('-').reverse().join('.')) + ' · ' : '') + 'попыток ' + d.used + (d.attempts ? ' из ' + d.attempts : '') + (t.check_mode === 'each' ? ' · проверка сразу после каждого ответа' : ' · проверка после сдачи') + '</p>' +
        (t.intro ? '<div class="card">' + esc(t.intro) + '</div>' : '') + (d.can_submit ? '' : '<p class="msg bad">Сдать нельзя: ' + (d.assignment.status !== 'active' ? 'задание закрыто' : d.attempts && d.used >= d.attempts ? 'попытки закончились' : 'срок прошёл') + '.</p>') +
        (t.blocks || []).map(function (b) {
          return '<div class="block">' + (b.title ? '<h3>' + esc(b.title) + '</h3>' : '') + (b.tasks || []).map(function (x) {
            return '<div class="task" id="t' + esc(x.n) + '"><div class="head"><b>' + esc(x.n) + '</b><span class="pill">' + x.pts + ' б.</span><span class="res" data-n="' + esc(x.n) + '"></span></div><div class="q">' + esc(x.text) + '</div>' + (x.img ? '<img class="photo" src="' + esc(x.img) + '" alt="рисунок к заданию" loading="lazy">' : '') +
              field(x, A[x.n]) + (x.type === 'photo' || x.photo ? '<div class="field"><label>Фото решения' + (x.type === 'photo' ? '' : ' (если просит учитель)') + '</label><input type="file" accept="image/*" multiple class="ph" data-n="' + esc(x.n) + '"><div class="thumbs" data-n="' + esc(x.n) + '"></div></div>' : '') +
              (x.hint ? '<details><summary class="muted">Подсказка</summary>' + esc(x.hint) + '</details>' : '') + (t.check_mode === 'each' && x.type !== 'photo' ? '<div class="row"><button type="button" class="btn sm ghost" data-check="' + esc(x.n) + '">Проверить</button></div>' : '') + '</div>';
          }).join('') + '</div>';
        }).join('') +
        '<div class="row" style="position:sticky;bottom:0;background:var(--paper);padding:10px 0;align-items:center"><button class="btn" id="go"' + (d.can_submit ? '' : ' disabled') + '>Сдать работу</button><span class="muted" id="cnt"></span><span class="muted" id="tm"></span></div><div class="msg" id="m" role="status" hidden></div>';
      math(app);
      function count() { var n = list.filter(function (x) { return x.type === 'photo' ? (photos[x.n] || []).length : String(A[x.n] || '').trim(); }).length; $('#cnt').textContent = 'отвечено ' + n + ' из ' + list.length; return n; }
      count();
      var timer = tl ? setInterval(function () { var left = tl - Math.round((Date.now() - started) / 1000), el = $('#tm'); if (!el) return clearInterval(timer); el.textContent = left > 0 ? ' · осталось ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : ' · время вышло — сдать ещё можно, учитель увидит время'; el.className = left > 0 ? 'muted' : 'warn'; }, 1000) : null;
      app.oninput = app.onchange = function (e) {
        var el = e.target;
        if (el.classList.contains('ans')) { A[el.dataset.n] = el.value; store(K, A); count(); }
        if (el.classList.contains('ansm')) { A[el.dataset.n] = Array.prototype.filter.call(app.querySelectorAll('.ansm[data-n="' + el.dataset.n + '"]'), function (c) { return c.checked; }).map(function (c) { return c.value; }).join(''); store(K, A); count(); }
        if (el.classList.contains('ph') && e.type === 'change') {
          var n = el.dataset.n; Promise.all(Array.prototype.slice.call(el.files, 0, 4).map(shrink)).then(function (urls) { photos[n] = urls; $('.thumbs[data-n="' + n + '"]').innerHTML = urls.map(function (u) { return '<img src="' + u + '" alt="" style="max-height:110px;margin:4px;border-radius:6px;border:1px solid var(--rule)">'; }).join(''); count(); }).catch(function (er) { alert(er.message); });
        }
      };
      app.onclick = function (e) {
        var b = e.target.closest('button[data-check]'); if (!b) return; var n = b.dataset.check, res = $('.res[data-n="' + n + '"]');
        M.api('POST', '/api/s/check', {assignment_id: asg, test_id: t.id, n: n, answer: A[n] || ''}).then(function (r) { if (!r.body || !r.body.ok) { res.textContent = M.message(r); res.className = 'res bad'; return; } res.textContent = r.body.data.ok ? '✓ верно' : '✗ пока нет'; res.className = 'res ' + (r.body.data.ok ? 'ok' : 'bad'); });
      };
      $('#go').addEventListener('click', function () {
        var left = list.length - count(); if (!confirm(left ? 'Без ответа ' + left + ' из ' + list.length + '. Всё равно сдать?' : 'Сдать работу? Изменить ответы потом будет нельзя.')) return;
        var CK = 'mf:cid:' + asg + ':' + t.id, c = store(CK) || cid(); store(CK, c);   // тот же id при повторе после сбоя сети — попытка не тратится
        var btn = this; btn.disabled = true; var m = $('#m'); m.hidden = false; m.className = 'msg'; m.textContent = 'Отправляю…';
        M.api('POST', '/api/s/submit', {assignment_id: asg, test_id: t.id, client_id: c, answers: A, photos: photos, duration_s: Math.round((Date.now() - started) / 1000)}).then(function (r) {
          if (!r.body || !r.body.ok) { btn.disabled = false; m.className = 'msg bad'; m.textContent = M.message(r) + (r.status === 0 ? ' Ответы сохранены на этом устройстве — попробуйте ещё раз.' : ''); return; }
          if (timer) clearInterval(timer); store(K, null); store(CK, null); result(app, r.body.data, t);
        });
      });
    });
  }
  function result(app, s, t) {
    var det = s.detail, list = tasksOf(t);
    app.innerHTML = '<h2>Работа сдана</h2><div class="card"><p>Автоматически: <b class="score">' + (s.score_auto != null ? s.score_auto : '—') + (s.score_max ? ' из ' + s.score_max : '') + '</b>' + (s.status === 'new' ? ' · часть заданий проверит учитель' : '') + (s.late ? ' · <span class="bad">после срока</span>' : '') + '</p>' +
      (det ? '<p>' + list.map(function (x) { var d = det[x.n] || {}; return '<span class="pill ' + (d.ok === true ? 'ok' : d.ok === false ? 'bad' : '') + '">' + esc(x.n) + (d.ok === true ? ' ✓' : d.ok === false ? ' ✗' : ' …') + '</span>'; }).join(' ') + '</p>' : '<p class="muted">Что верно, а что нет — покажут после срока.</p>') +
      '<div class="row"><a class="btn" href="#review/' + esc(s.id) + '">Разбор</a><a class="btn ghost" href="#">В кабинет</a></div></div>';
  }
  function review(app, id) {
    app.innerHTML = '<p class="sub">Загружаю…</p>';
    M.api('GET', '/api/s/review/' + encodeURIComponent(id)).then(function (r) {
      if (!r.body || !r.body.ok) { app.innerHTML = '<p class="msg bad">' + esc(M.message(r)) + '</p><p><a href="#">← в кабинет</a></p>'; return; }
      var s = r.body.data.submission, t = r.body.data.test, det = s.detail || {}, st = s.scores_teacher || {};
      app.innerHTML = '<p class="crumbs"><a href="#">← в кабинет</a></p><h2>Разбор: ' + esc(t.title) + '</h2><p class="sub">' + fmt(s.created_at) + ' · попытка ' + s.attempt + ' · авто ' + (s.score_auto != null ? s.score_auto : '—') + (s.score_max ? ' из ' + s.score_max : '') + (s.score_teacher != null ? ' · <b>учитель: ' + s.score_teacher + '</b>' : '') + '</p>' +
        (s.comment ? '<div class="card"><b>Комментарий учителя:</b> ' + esc(s.comment) + '</div>' : '') + (s.status === 'returned' ? '<p class="msg">Работа возвращена на доработку — можно сдать ещё раз.</p>' : '') +
        (r.body.data.reveal ? '' : '<p class="muted">Верные ответы откроются ' + (t.show_answers === 'never' ? 'не будут показаны' : 'после срока') + '.</p>') +
        tasksOf(t).map(function (x) {
          var d = det[x.n] || {}, a = (s.answers || {})[x.n], key = x.key != null ? (Array.isArray(x.key) ? x.key.join(' или ') : x.key) : x.accept ? x.accept.join(' / ') : null;
          return '<div class="task"><div class="head"><b>' + esc(x.n) + '</b>' + (d.ok === true ? '<span class="ok">✓</span>' : d.ok === false ? '<span class="bad">✗</span>' : '') + (st[x.n] != null ? '<span class="pill">учитель: ' + st[x.n] + ' из ' + x.pts + '</span>' : d.pts != null ? '<span class="pill">' + d.pts + ' из ' + x.pts + '</span>' : '') + '</div><div class="q">' + esc(x.text) + '</div>' +
            '<p>Ваш ответ: <b>' + esc(a == null || a === '' ? '—' : a) + '</b>' + (key != null && x.type !== 'photo' ? ' · верный: <b>' + esc(key) + (x.unit ? ' ' + esc(x.unit) : '') + '</b>' : '') + '</p>' + (x.solution ? '<details><summary>Решение</summary><div class="q">' + esc(x.solution) + '</div></details>' : '') + '</div>';
        }).join('');
      math(app);
    });
  }
  window.MFRunner = {open: open, review: review};
})();
