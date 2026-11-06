/* Ядро тренажёров «Редукторы»: холст с учётом плотности пикселей, цвета из CSS, числа по-русски,
   ползунки, вкладки, лесенка подсказок, зубчатые колёса (внешние и с внутренними зубьями). Без зависимостей. */
(function(){
  'use strict';
  const RC = {};
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  RC.css = css;
  RC.col = () => ({ink: css('--ink'), ink2: css('--ink-2'), rule: css('--rule'), grid: css('--grid'), gridM: css('--grid-major'),
    paper: css('--paper'), sheet: css('--sheet'), f1: css('--f1'), f2: css('--f2'), f3: css('--f3'), res: css('--res'),
    ok: css('--ok'), bad: css('--bad'), warn: css('--warn'), steel: css('--steel'), bronze: css('--bronze'), body: css('--body'), mono: css('--mono')});
  RC.$ = s => document.querySelector(s);
  RC.prep = function(cv){
    const W = cv.clientWidth, H = cv.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(W * d), h = Math.round(H * d);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = css('--sheet'); ctx.fillRect(0, 0, W, H);
    return {ctx, W, H};
  };
  RC.text = function(ctx, s, x, y, o){
    o = o || {}; ctx.save(); ctx.fillStyle = o.color || css('--ink');
    ctx.font = (o.italic ? 'italic ' : '') + (o.weight || 500) + ' ' + (o.size || 13) + 'px ' + (o.mono ? css('--mono') : css('--body'));
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle'; ctx.fillText(s, x, y); ctx.restore();
  };
  RC.arrow = function(ctx, x1, y1, x2, y2, color, lw){
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L < 2) return;
    lw = lw || 2; const h = Math.min(9 + lw, L * 0.45), ux = dx / L, uy = dy / L;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * h * 0.7, y2 - uy * h * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * h - uy * h * 0.42, y2 - uy * h + ux * h * 0.42);
    ctx.lineTo(x2 - ux * h + uy * h * 0.42, y2 - uy * h - ux * h * 0.42); ctx.closePath(); ctx.fill(); ctx.restore();
  };
  // число по-русски: десятичная запятая, неразрывный пробел в тысячах, минус «−»
  RC.fmt = function(x, d){
    if (x == null || !isFinite(x)) return '—';
    d = d == null ? 2 : d; let s = x.toFixed(d).replace('.', ',');
    s = s.replace(/^(-?\d+)/, m => m.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
    return s.replace('-', '−');
  };
  RC.sig = function(x, n){             // n значащих цифр, без хвостовых нулей
    if (!isFinite(x)) return '—'; if (x === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x))));
    let s = RC.fmt(x, Math.min(d, 6)); if (s.includes(',')) s = s.replace(/0+$/, '').replace(/,$/, ''); return s;
  };
  RC.num = function(s){                // «0,16», «−2», «4/3», «1 200»
    s = String(s).trim().replace(/\s| /g, '').replace(/,/g, '.').replace(/[−–]/g, '-');
    if (!s) return NaN;
    const m = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/); if (m) return +m[1] / +m[2];
    return /^-?\d*\.?\d+(e-?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
  };
  RC.near = (a, b, rel, abs) => Math.abs(a - b) <= Math.max((rel || 0) * Math.abs(b), abs || 0);
  RC.slider = function(id, fmt, on){
    const el = document.getElementById(id), out = document.getElementById(id + 'O');
    const upd = () => { if (out) out.textContent = fmt ? fmt(+el.value) : el.value; on && on(); };
    if (out) out.textContent = fmt ? fmt(+el.value) : el.value;
    el.addEventListener('input', upd); RC._sl.push(upd); return {el, get: () => +el.value, set: v => { el.value = v; upd(); }, upd};
  };
  RC._sl = []; RC.refresh = () => RC._sl.forEach(f => f());
  RC.seg = function(root, attr, on){   // группа кнопок aria-pressed; возвращает {get,set}
    const bs = [...root.querySelectorAll('button[data-' + attr + ']')];
    let cur = (bs.find(b => b.getAttribute('aria-pressed') === 'true') || bs[0]).dataset[attr];
    const set = k => { cur = k; bs.forEach(b => b.setAttribute('aria-pressed', b.dataset[attr] === k)); on && on(k); };
    bs.forEach(b => b.addEventListener('click', () => set(b.dataset[attr]))); return {get: () => cur, set};
  };
  // вкладки: .tab[data-mode] (id t-ex/t-task/t-game), панели section[data-pane]
  RC.tabs = function(onShow){
    const tabs = [...document.querySelectorAll('.tab[data-mode]')], panes = [...document.querySelectorAll('[data-pane]')];
    let cur = null;
    const show = k => { cur = k; tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.mode === k));
      panes.forEach(p => p.hidden = p.dataset.pane !== k); onShow && onShow(k);
      try { history.replaceState(null, '', '#' + k); } catch (e) {} };
    tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.mode)));
    const h = (location.hash || '').slice(1); show(tabs.some(t => t.dataset.mode === h) ? h : tabs[0].dataset.mode);
    return {get: () => cur, show};
  };
  RC.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // общий цикл анимации: draw(dt); при reduce — один кадр по запросу
  RC.loop = function(draw){
    let last = 0, raf = 0, playing = !RC.reduce;
    const tick = t => { const dt = last ? Math.min((t - last) / 1000, 0.05) : 0; last = t; draw(playing ? dt : 0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', () => draw(0));
    return {playing: () => playing, set: p => { playing = p; last = 0; }, redraw: () => draw(0)};
  };
  RC.playBtn = function(btn, loop){
    const lab = () => { btn.textContent = loop.playing() ? '❚❚ Пауза' : '▶ Пуск'; btn.setAttribute('aria-pressed', loop.playing()); };
    btn.addEventListener('click', () => { loop.set(!loop.playing()); lab(); }); lab();
  };
  // лесенка подсказок: кнопка «Подсказка (k/n)», блок с выданными подсказками
  RC.hints = function(btn, box){
    let list = [], k = 0;
    const lab = () => { btn.textContent = 'Подсказка (' + k + '/' + list.length + ')'; btn.disabled = k >= list.length; };
    btn.addEventListener('click', () => { if (k < list.length) { const d = document.createElement('div'); d.className = 'hint'; d.innerHTML = list[k++]; box.appendChild(d); lab(); } });
    return {reset: l => { list = l; k = 0; box.innerHTML = ''; lab(); }, used: () => k};
  };
  RC.msg = function(el, cls, html){ el.className = 'msg ' + cls; el.innerHTML = html; el.hidden = !html; };
  RC.rnd = (a, b) => a + Math.random() * (b - a);
  RC.pick = a => a[Math.floor(Math.random() * a.length)];
  // ---------- зубчатые колёса ----------
  // внешнее колесо: делительный радиус r (px), z зубьев, th — угол центра зуба № 0
  RC.gear = function(ctx, cx, cy, z, r, th, fill, stroke, o){
    o = o || {}; const m = 2 * r / z, ra = r + m, rf = r - 1.25 * m, step = 2 * Math.PI / z;
    ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.beginPath();
    for (let k = 0; k < z; k++) {
      const c = th + k * step, a = [c - step * 0.5, c - step * 0.27, c - step * 0.14, c + step * 0.14, c + step * 0.27, c + step * 0.5], R = [rf, rf, ra, ra, rf, rf];
      for (let j = 0; j < 6; j++) { const x = cx + R[j] * Math.cos(a[j]), y = cy + R[j] * Math.sin(a[j]); (k === 0 && j === 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = o.lw || 1.2; ctx.strokeStyle = stroke; ctx.stroke();
    if (o.pitch) { ctx.setLineDash([3, 4]); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    if (!o.noHub) {
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(3.5, Math.min(8, rf * 0.18)), 0, 2 * Math.PI); ctx.fillStyle = stroke; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + rf * 0.82 * Math.cos(th), cy + rf * 0.82 * Math.sin(th)); ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.restore();
  };
  // колесо с внутренними зубьями (корона): зуб № 0 смотрит к центру по углу th; R — наружный радиус обода
  RC.ring = function(ctx, cx, cy, z, r, th, fill, stroke, R, o){
    o = o || {}; const m = 2 * r / z, rt = r - m, rr = r + 1.25 * m, step = 2 * Math.PI / z;
    ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI, false);
    for (let k = z - 1; k >= 0; k--) {
      const c = th + k * step, a = [c + step * 0.5, c + step * 0.27, c + step * 0.14, c - step * 0.14, c - step * 0.27, c - step * 0.5], Rr = [rr, rr, rt, rt, rr, rr];
      for (let j = 0; j < 6; j++) { const x = cx + Rr[j] * Math.cos(a[j]), y = cy + Rr[j] * Math.sin(a[j]); (k === z - 1 && j === 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill('evenodd'); ctx.lineWidth = 1.2; ctx.strokeStyle = stroke; ctx.stroke();
    ctx.restore();
  };
  // угол второго колеса, чтобы зубья входили во впадины: колесо 2 стоит от колеса 1 по направлению alpha
  RC.meshExt = (th1, z1, z2, alpha) => alpha + Math.PI - (Math.PI - (alpha - th1) * z1) / z2;
  // сателлит внутри короны: центр сателлита в направлении beta от центра короны
  RC.meshInt = (thR, zR, zp, beta) => beta - (2 * Math.PI / zp) * ((beta - thR) * zR / (2 * Math.PI) + 0.5);
  RC.rotArrow = function(ctx, cx, cy, r, dir, color){   // dir: +1 — по часовой на экране, −1 — против
    if (!dir) return; ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    const a0 = -Math.PI * 0.8, a1 = -Math.PI * 0.2; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    const ae = dir > 0 ? a1 : a0, s = dir > 0 ? 1 : -1, x = cx + r * Math.cos(ae), y = cy + r * Math.sin(ae);
    const tx = -Math.sin(ae) * s, ty = Math.cos(ae) * s, h = 9;
    ctx.beginPath(); ctx.moveTo(x + tx * h, y + ty * h); ctx.lineTo(x - ty * h * 0.5, y + tx * h * 0.5); ctx.lineTo(x + ty * h * 0.5, y - tx * h * 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  RC.rrect = function(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  // счёт в игре
  RC.score = function(el){
    let ok = 0, all = 0, ser = 0, best = 0;
    const draw = () => { el.innerHTML = '<span>верно <b>' + ok + '</b> из ' + all + '</span><span>серия <b>' + ser + '</b></span><span>рекорд <b>' + best + '</b></span>'; };
    draw(); return {add: good => { all++; if (good) { ok++; ser++; best = Math.max(best, ser); } else ser = 0; draw(); }};
  };
  window.RC = RC;
})();
