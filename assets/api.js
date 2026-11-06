// Клиент API кабинетов: токен в localStorage (mf:token), запросы к window.API_BASE + /api/…
// Ученик в шапке (site.js) читает mf:student — пишем его в том же виде {code, group, title, class, name}.
(function () {
  'use strict';
  var BASE = (window.API_BASE || '').replace(/\/$/, '');
  var KEY = document.querySelector('main') && document.querySelector('main').dataset.page === 'admin' ? 'mf:admin_token' : 'mf:token'; // учитель и ученик — разные токены
  function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) {} }
  function student() { try { return JSON.parse(localStorage.getItem('mf:student') || 'null'); } catch (e) { return null; } }
  function setStudent(s) { try { s ? localStorage.setItem('mf:student', JSON.stringify(s)) : localStorage.removeItem('mf:student'); } catch (e) {} }
  var ERR = {bad_password: 'Неверный пароль.', code_unknown: 'Такого кода нет. Проверьте бумажку или спросите учителя.', code_revoked: 'Код отозван учителем.', already_registered: 'По этому коду уже зарегистрировались. Войдите с паролем; забыли — попросите учителя сбросить.',
    needs_register: 'Пароль сброшен — зарегистрируйтесь заново с этим кодом.', bad_code: 'Код не похож на настоящий: буквы группы, дефис и 4 знака.', bad_name: 'Имя — не короче 2 знаков.', short_password: 'Пароль — не короче 6 знаков.',
    too_many_attempts: 'Слишком много попыток. Подождите 15 минут.', unauthorized: 'Нужно войти.', forbidden: 'Нет доступа.', blocked: 'Доступ закрыт учителем.', limit: 'Попытки закончились.', not_found: 'Не найдено.',
    github_409: 'Файл изменился, пока вы его правили. Откройте заново и повторите.', github_404: 'Файла нет в репозитории.', github_not_configured: 'GitHub не подключён к серверу.', admin_not_configured: 'Пароль учителя не задан на сервере.', jwt_not_configured: 'Сервер не настроен.'};
  function message(r) { return (r && r.body && (ERR[r.body.error] || r.body.error + (r.body.message ? ': ' + r.body.message : ''))) || ('Ошибка ' + (r && r.status)); }
  // api('GET', '/api/me') → {status, body}; body = {ok, data|error}
  function api(method, path, body) {
    if (!BASE) return Promise.resolve({status: 0, body: {ok: false, error: 'jwt_not_configured'}});
    var h = {'Content-Type': 'application/json'}; var t = token(); if (t) h.Authorization = 'Bearer ' + t;
    return fetch(BASE + path, {method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)})
      .then(function (r) { return r.text().then(function (x) { var b = null; try { b = x ? JSON.parse(x) : null; } catch (e) { b = {ok: false, error: 'bad_response'}; } return {status: r.status, body: b}; }); })
      .catch(function (e) { return {status: 0, body: {ok: false, error: 'network', message: e.message}}; });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  window.MF = {BASE: BASE, api: api, token: token, setToken: setToken, student: student, setStudent: setStudent, message: message, esc: esc, configured: !!BASE};
})();
