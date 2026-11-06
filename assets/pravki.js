// Окно «Замечание хабу» — видит только владелец сайта (вход в админку на этом устройстве или ссылка …/#pravki).
// Замечание = файл .md в приватном репозитории замечаний (сервер: POST /api/admin/remarks → novye/<id>.md);
// хаб разбирает novye/, исправляет и отвечает в том же файле. «Исправить сам» открывает исходник в админке, вкладка «Редактор».
// Нет сервера или связи — замечание ждёт на этом устройстве; «Скопировать для хаба» — текст для чата.
(function () {
  'use strict';
  if (window.Pravki && window.Pravki.open) return;
  var TK = 'mf:admin_token', QK = 'mf:pravki:queue';
  var KINDS = [['ispravit', 'Исправить по комментарию'], ['vstavka', 'Вставить мой текст'], ['vyvod', 'Нет вывода или он неполный'], ['opechatka', 'Опечатка'], ['ideya', 'Идея: добавить']];
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function base() { return String(window.API_BASE || '').replace(/\/$/, ''); }
  function ready() { return window.API_BASE !== undefined ? Promise.resolve() : new Promise(function (ok) { var s = document.createElement('script'); s.src = '/config.js'; s.onload = s.onerror = function () { ok(); }; document.head.appendChild(s); }); }
  function queue(v) { if (v === undefined) { try { return JSON.parse(ls(QK) || '[]'); } catch (e) { return []; } } ls(QK, v.length ? JSON.stringify(v) : null); }
  function post(r) {
    var t = ls(TK); if (!base() || !t) return Promise.resolve({ok: false, error: !base() ? 'no_api' : 'no_login'});
    return fetch(base() + '/api/admin/remarks', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + t}, body: JSON.stringify(r)})
      .then(function (x) { return x.json().catch(function () { return {ok: false, error: 'bad_response'}; }); }).catch(function () { return {ok: false, error: 'network'}; });
  }
  function asText(r) { return '#замечание ' + (r.kind || '') + '\nстраница: ' + (r.page || '') + (r.file ? '\nфайл: ' + r.file : '') + (r.block ? '\nблок: ' + r.block : '') + (r.material ? '\nматериал: ' + r.material : '') + (r.quote ? '\nфрагмент:\n> ' + r.quote.replace(/\n/g, '\n> ') : '') + '\n' + (r.text || ''); }

  // ---------- где замечание: страница, исходный файл, блок Карты, материал со страницы, выделенный текст
  function context() {
    var c = (window.Pravki && window.Pravki.context && window.Pravki.context()) || {};
    var main = $('main'), page = location.pathname, sel = window.getSelection ? String(window.getSelection()) : '';
    if (!c.file && main && main.dataset.page === 'teoriya') c.file = (page.replace(/^\//, '').replace(/[^/]*$/, '')) + (main.dataset.src || 'index.md');
    if (!c.quote && sel.trim()) c.quote = sel.trim().slice(0, 4000);
    if (!c.block && window.getSelection && window.getSelection().rangeCount) { var n = window.getSelection().getRangeAt(0).startContainer, el = n && (n.nodeType === 1 ? n : n.parentElement), b = el && el.closest && el.closest('.blk[id]'); if (b) c.block = b.id; }
    c.page = c.page || page + (c.block ? '#' + c.block : '');
    c.blocks = Array.prototype.map.call(document.querySelectorAll('.teo .blk[id]'), function (b) { return [b.id, b.id + ' ' + ($('.blk-c', b) || {}).textContent + ' ' + (($('.blk-t', b) || {}).textContent || '').slice(0, 40)]; });
    c.materials = Array.prototype.map.call(document.querySelectorAll('main a[data-id]'), function (a) { return [a.dataset.id + '|' + a.getAttribute('href'), ($('b', a) || a).textContent.slice(0, 60)]; });
    return c;
  }
  function editHref(c) { var q = []; if (c.file) q.push('path=' + encodeURIComponent(c.file)); if (c.quote) q.push('find=' + encodeURIComponent(c.quote.slice(0, 120))); if (c.block) q.push('block=' + encodeURIComponent(c.block)); if (c.remark) q.push('remark=' + encodeURIComponent(c.remark)); return '/admin/#files' + (q.length ? '?' + q.join('&') : ''); }
  function fileOf(material) { var u = String(material || '').split('|')[1] || ''; return /^\/fizika-trenazhery\//.test(u) ? 'fizika-trenazhery:' + u.slice(19) : u.replace(/^\//, '').split(/[?#]/)[0].replace(/\/$/, '/index.html'); }

  // ---------- окно
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pv-btn no-print'; btn.textContent = '✎ Замечание'; btn.title = 'Замечание хабу: что исправить на этой странице';
  var box = document.createElement('div'); box.className = 'pv no-print'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Замечание хабу');
  // кнопка появляется, только если на устройстве есть вход владельца или включено ссылкой #pravki; админка зовёт boot() после входа
  function boot() { if (btn.isConnected || (!ls(TK) && !ls('mf:pravki'))) return; document.body.appendChild(btn); document.body.appendChild(box); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
  // выделение теряется при нажатии на кнопку — запоминаем его заранее
  var last = null; btn.addEventListener('pointerdown', function () { last = context(); });
  btn.addEventListener('click', function () { if (!box.hidden) { box.hidden = true; return; } open(last || context()); last = null; });

  function open(c) {
    c = c || context();
    var q = queue();
    box.innerHTML = '<button type="button" class="x" aria-label="Закрыть">×</button><h3>Замечание хабу</h3><p class="pv-where">' + esc(c.page) + (c.file ? ' · <code>' + esc(c.file) + '</code>' : '') + '</p>' +
      (c.quote ? '<blockquote>' + esc(c.quote) + '</blockquote>' : '<p class="pv-where">Выделите текст на странице до нажатия — он попадёт в замечание.</p>') +
      (c.blocks && c.blocks.length ? '<label>Блок</label><select name="block"><option value="">— вся страница —</option>' + c.blocks.map(function (b) { return '<option value="' + esc(b[0]) + '"' + (b[0] === c.block ? ' selected' : '') + '>' + esc(b[1]) + '</option>'; }).join('') + '</select>' : '') +
      (c.materials && c.materials.length && !c.file ? '<label>Материал</label><select name="material"><option value="">— эта страница —</option>' + c.materials.map(function (m) { return '<option value="' + esc(m[0]) + '">' + esc(m[1]) + '</option>'; }).join('') + '</select>' : '') +
      '<label>Что сделать</label><select name="kind">' + KINDS.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('') + '</select>' +
      '<label>Комментарий или вставка <span class="muted">(без ФИО учеников)</span></label><textarea name="text" placeholder="Что не так и как надо. Можно вставить свой абзац или формулу в LaTeX — хаб перенесёт."></textarea>' +
      '<div class="row"><button type="button" class="btn" data-a="send">Отправить хабу</button><a class="btn ghost" data-a="edit" target="_blank" rel="noopener">Исправить сам</a></div>' +
      (q.length ? '<div class="row"><button type="button" class="btn ghost sm" data-a="flush">Отправить отложенные (' + q.length + ')</button><button type="button" class="btn ghost sm" data-a="copy">Скопировать для хаба</button></div>' : '') +
      '<div class="msg" hidden></div>';
    var f = function (n) { return $('[name=' + n + ']', box); };
    function cur() {
      var r = {page: c.page, file: c.file || '', block: f('block') ? f('block').value : (c.block || ''), material: f('material') ? f('material').value : '', quote: c.quote || '', kind: f('kind').value, text: f('text').value.trim()};
      if (r.material && !r.file) r.file = fileOf(r.material);
      if (r.block && r.page.indexOf('#') < 0) r.page += '#' + r.block;
      return r;
    }
    function say(t, cls) { var msg = $('.msg', box); msg.hidden = false; msg.className = 'msg ' + (cls || ''); msg.textContent = t; } // окно могло перерисоваться
    function upd() { var r = cur(); $('[data-a=edit]', box).href = editHref({file: r.file, quote: r.quote, block: r.block}); }
    box.oninput = box.onchange = upd; upd();
    box.onclick = function (e) {
      var a = e.target.closest('[data-a]'); if (e.target.closest('.x')) { box.hidden = true; return; } if (!a) return;
      if (a.dataset.a === 'send') {
        var r = cur(); if (!r.text && r.kind !== 'vyvod') { say('Напишите, что исправить.', 'bad'); return; }
        a.disabled = true; ready().then(function () { return post(r); }).then(function (res) {
          a.disabled = false;
          if (res.ok) { say('Записано: ' + res.data.path + '. Хаб разберёт и ответит в «Замечаниях» админки.', 'ok'); f('text').value = ''; return; }
          if (/^(no_api|no_login|network|bad_response)$/.test(res.error)) { var qq = queue(); r.at = new Date().toISOString(); qq.push(r); queue(qq); open(c); say((res.error === 'no_api' ? 'Сервер ещё не подключён' : res.error === 'no_login' ? 'Нет входа в админку на этом устройстве' : 'Нет связи') + ' — замечание сохранено здесь (' + qq.length + '). Отправьте позже или скопируйте для хаба.', ''); return; }
          say(res.message || res.error || 'Ошибка', 'bad');
        });
      }
      if (a.dataset.a === 'flush') { var qs = queue(); ready().then(function () { return qs.reduce(function (p, r) { return p.then(function (left) { return post(r).then(function (res) { if (!res.ok) left.push(r); return left; }); }); }, Promise.resolve([])); }).then(function (left) { queue(left); open(c); say(left.length ? 'Не ушло: ' + left.length : 'Все отложенные отправлены', left.length ? 'bad' : 'ok'); }); }
      if (a.dataset.a === 'copy') { var text = queue().map(asText).join('\n\n---\n\n'); (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { if (confirm('Скопировано. Вставьте в чат хаба. Удалить отложенные с этого устройства?')) { queue([]); open(c); } }).catch(function () { prompt('Скопируйте текст:', text); }); }
    };
    box.hidden = false; f('text').focus();
  }
  window.Pravki = window.Pravki || {};
  window.Pravki.open = function (c) { boot(); open(c); }; window.Pravki.editHref = editHref; window.Pravki.boot = boot;
})();
