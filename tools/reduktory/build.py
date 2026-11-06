#!/usr/bin/env python3
"""Тренажёры «Редукторы» (Инженерия): сборка страниц сайта.

python3 tools/reduktory/build.py
  src/*.html  + ядро src/core.css, src/core.js + лесенка  →  inzheneriya/reduktory/*.html
  ext/vptk_exov9.html (тренажёр ВПТК из проекта экзоскелета, как есть) + лесенка → inzheneriya/reduktory/vptk.html
Каждая страница самодостаточна: открывается и с сайта, и файлом (Telegram). Числа задач — chisla.py.
"""
import os, re
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, '..', '..', 'inzheneriya', 'reduktory')
SITE = 'https://metaphys23.github.io'
LAD = [('Передачи вращения', SITE + '/fizika-trenazhery/trenazhery/peredachi.html'),
       ('1 · Зачем редуктор', 'zachem-reduktor.html'),
       ('2 · Многоступенчатый', 'mnogostupenchatyy.html'),
       ('3 · Червячный', 'chervyachnyy.html'),
       ('4 · Планетарный', 'planetarnyy.html'),
       ('5 · ВПТК изнутри', 'vptk.html')]
LAD_CSS = ('.ladder{display:flex;flex-wrap:wrap;gap:6px;font-size:13px}'
           '.ladder a,.ladder span{padding:5px 10px;border-radius:999px;border:1px solid var(--rule);text-decoration:none;color:var(--ink);background:var(--sheet)}'
           '.ladder span{background:var(--ink);color:var(--paper);border-color:var(--ink)}')


def ladder(n):
    out = []
    for k, (t, u) in enumerate(LAD):
        url = u if u.startswith('http') else SITE + '/inzheneriya/reduktory/' + u
        out.append(f'<span aria-current="page">{t}</span>' if k == n else f'<a href="{url}">{t}</a>')
    return '<nav class="ladder" aria-label="Редукторы: от простого к сложному">' + ''.join(out) + '</nav>'


def main():
    os.makedirs(OUT, exist_ok=True)
    css = open(os.path.join(H, 'src', 'core.css'), encoding='utf-8').read()
    js = open(os.path.join(H, 'src', 'core.js'), encoding='utf-8').read()
    for f in sorted(os.listdir(os.path.join(H, 'src'))):
        if not f.endswith('.html'): continue
        s = open(os.path.join(H, 'src', f), encoding='utf-8').read()
        s = s.replace('/*@CORE_CSS@*/', css).replace('/*@CORE_JS@*/', js)
        s = re.sub(r'<!--@LADDER:(\d)@-->', lambda m: ladder(int(m.group(1))), s)
        assert '@CORE' not in s and '@LADDER' not in s, f
        open(os.path.join(OUT, f), 'w', encoding='utf-8').write(s)
        print(f, len(s.encode()))
    v = open(os.path.join(H, 'ext', 'vptk_exov9.html'), encoding='utf-8').read()
    assert v.count('</header>') == 1
    v = v.replace('</header>', '</header>\n  <style>' + LAD_CSS + '</style>' + ladder(5), 1)
    open(os.path.join(OUT, 'vptk.html'), 'w', encoding='utf-8').write(v)
    print('vptk.html', len(v.encode()))


if __name__ == '__main__':
    main()
