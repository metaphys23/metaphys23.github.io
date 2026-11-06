// Клиент API кабинетов: токен в localStorage (mf:token), запросы к window.API_BASE + /api/…
// Ученик в шапке (site.js) читает mf:student — пишем его в том же виде {code, group, title, class, name}.
(function () {
  'use strict';
  var BASE = (window.API_BASE || '').replace(/\/$/, '');
  // владелец, учитель и ученик — разные токены: все три кабинета работают в одном браузере; владелец в /uchitel/ работает своим токеном
  var PAGE = document.querySelector('main') && document.querySelector('main').dataset.page;
  var KEY = PAGE === 'admin' ? 'mf:admin_token' : PAGE === 'uchitel' ? 'mf:teacher_token' : 'mf:token';
  function useKey(k) { KEY = k; }
  // владелец смотрит кабинет учителя: /uchitel/?as=<id учителя> — к каждому запросу добавляется as (сервер пускает только чтение)
  var AS = PAGE === 'uchitel' ? new URLSearchParams(location.search).get('as') : null;
  function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) {} }
  function student() { try { return JSON.parse(localStorage.getItem('mf:student') || 'null'); } catch (e) { return null; } }
  function setStudent(s) { try { s ? localStorage.setItem('mf:student', JSON.stringify(s)) : localStorage.removeItem('mf:student'); } catch (e) {} }
  var ERR = {bad_password: 'Неверный пароль.', code_unknown: 'Такого кода нет. Проверьте бумажку или спросите учителя.', code_revoked: 'Код отозван учителем.', already_registered: 'По этому коду уже зарегистрировались. Войдите с паролем; забыли — попросите учителя сбросить.',
    needs_register: 'Пароль сброшен — зарегистрируйтесь заново с этим кодом.', bad_code: 'Код не похож на настоящий: буквы группы, дефис и 4 знака.', bad_name: 'Имя — не короче 2 знаков.', short_password: 'Пароль — не короче 6 знаков.',
    too_many_attempts: 'Слишком много попыток. Подождите 15 минут.', needs_activation: 'Учётная запись ещё не активирована: войдите по приглашению.', bad_invite: 'Приглашение неверное или устарело — попросите новое.',
    registration_closed: 'Регистрация временно закрыта.', read_only: 'Сайт в режиме «только чтение» — изменения временно недоступны.', view_only: 'Режим просмотра: изменения недоступны.', bad_otp: 'Неверный код из приложения.',
    not_open: 'Модуль ещё не открыт.', closed: 'Задание закрыто.', quota: 'Достигнут лимит — попросите владельца сайта.', class_exists: 'Такая группа уже есть.', login_exists: 'Такой логин уже есть.', prefix_exists: 'Такой префикс уже занят.', network: 'Нет связи с сервером.', unauthorized: 'Нужно войти.', forbidden: 'Нет доступа.', blocked: 'Доступ закрыт учителем.', limit: 'Попытки закончились.', not_found: 'Не найдено.',
    github_409: 'Файл изменился, пока вы его правили. Откройте заново и повторите.', github_404: 'Файла нет в репозитории.', github_not_configured: 'GitHub не подключён к серверу.', admin_not_configured: 'Пароль учителя не задан на сервере.', jwt_not_configured: 'Сервер не настроен.'};
  // текст сервера (по-русски, с подробностями) важнее общего: «Пароль учителя — не короче 10 знаков», список ошибок теста
  function message(r) { var b = r && r.body; if (!b) return 'Ошибка ' + (r && r.status); if (b.error === 'network') return ERR.network; return b.message || ERR[b.error] || b.error || ('Ошибка ' + r.status); }
  // api('GET', '/api/me') → {status, body}; body = {ok, data|error}
  function api(method, path, body) {
    if (!BASE) return Promise.resolve({status: 0, body: {ok: false, error: 'jwt_not_configured'}});
    var h = {'Content-Type': 'application/json'}; var t = token(); if (t) h.Authorization = 'Bearer ' + t;
    if (AS && KEY === 'mf:admin_token') path += (path.indexOf('?') >= 0 ? '&' : '?') + 'as=' + encodeURIComponent(AS);
    return fetch(BASE + path, {method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)})
      .then(function (r) { return r.text().then(function (x) { var b = null; try { b = x ? JSON.parse(x) : null; } catch (e) { b = {ok: false, error: 'bad_response'}; } return {status: r.status, body: b}; }); })
      .catch(function (e) { return {status: 0, body: {ok: false, error: 'network', message: e.message}}; });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  window.MF = {BASE: BASE, api: api, token: token, useKey: useKey, page: PAGE, as: AS, setToken: setToken, student: student, setStudent: setStudent, message: message, esc: esc, configured: !!BASE};
})();
