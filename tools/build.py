#!/usr/bin/env python3
"""Каркасы страниц Тезауруса и проверка данных.

python3 tools/build.py          — проверить data/*.json и пересобрать каркасы страниц
python3 tools/build.py --check  — только проверка (код возврата 1 при ошибке)

Каркас — пустой <main data-page="…">: шапку, меню и списки строит assets/site.js из data/*.json.
Новый материал = одна запись в data/catalog.json; задать классу — строка в data/zadano.json.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TREN = os.path.join(os.path.dirname(ROOT), 'tezaurus')  # клон соседнего репозитория tezaurus (бывший fizika-trenazhery; необязателен)
KINDS = {'pdf', 'trenazher', 't1', 't2', 't3', 'dz', 'konspekt', 'lab'}
SECTIONS = {'uchebnik', 'praktikum', 'eksperiment', 'inzheneriya'}
STATUS = {'otkryto', 'klass', 'proba'}
CODE_GROUP = re.compile(r'^[A-Z]{2,3}\d{1,2}[A-Z]{0,3}$')

PAGES = [  # путь, page, атрибуты, заголовок вкладки
    ('index.html', 'home', {}, 'Тезаурус'),
    ('klass/index.html', 'klass', {}, 'Классы · Тезаурус'),
    *[(f'klass/{k}/index.html', 'klass', {'class': str(k)}, f'{k} класс · Тезаурус') for k in (7, 8, 9, 10, 11)],
    ('temy/index.html', 'temy', {}, 'Темы · Тезаурус'),
    ('ekzameny/index.html', 'ekzameny', {}, 'Экзамены · Тезаурус'),
    ('uchebnik/index.html', 'section', {'section': 'uchebnik'}, 'Учебник · Тезаурус'),
    ('praktikum/index.html', 'section', {'section': 'praktikum'}, 'Практикум · Тезаурус'),
    ('eksperiment/index.html', 'section', {'section': 'eksperiment'}, 'Эксперимент · Тезаурус'),
    ('inzheneriya/index.html', 'section', {'section': 'inzheneriya'}, 'Инженерия · Тезаурус'),
    ('karta/index.html', 'karta', {}, 'Карта · Тезаурус'),
    ('voiti/index.html', 'voiti', {}, 'Вход для ученика · Тезаурус'),
    ('zadano/index.html', 'zadano', {}, 'Задано мне · Тезаурус'),
]
SHELL = '''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/site.css">
</head><body><main data-page="{page}"{attrs}><p class="sub">Загружаю…</p></main>
<noscript><p style="padding:20px">Для каталога нужен JavaScript.</p></noscript>
<script src="/assets/site.js" defer></script></body></html>
'''


def load(name):
    with open(os.path.join(ROOT, 'data', name), encoding='utf-8') as f:
        return json.load(f)


def check():
    err = []
    cat, temy, z = load('catalog.json'), load('temy.json'), load('zadano.json')
    topics = {t['id'] for s in temy['sections'] for t in s['topics']}
    ids = set()
    for x in cat['items']:
        i = x.get('id', '?')
        if i in ids: err.append(f'{i}: повтор id')
        ids.add(i)
        for k in ('title', 'kind', 'section', 'topic', 'classes', 'url', 'status'):
            if not x.get(k): err.append(f'{i}: нет поля {k}')
        if x.get('kind') not in KINDS: err.append(f'{i}: kind {x.get("kind")}')
        if x.get('section') not in SECTIONS: err.append(f'{i}: section {x.get("section")}')
        if x.get('status') not in STATUS: err.append(f'{i}: status {x.get("status")}')
        if x.get('topic') not in topics: err.append(f'{i}: темы «{x.get("topic")}» нет в temy.json (сначала hub/темы.yaml)')
        if x.get('kind') in ('t1', 't2', 't3', 'dz') and not x.get('test'): err.append(f'{i}: тесту нужно поле test')
        u = x.get('url', '')
        if u.startswith('/tezaurus/'):
            p = os.path.join(TREN, u[len('/tezaurus/'):].split('?')[0])
            if x.get('test'): p = os.path.join(TREN, 'tests', x['test'] + '.json')
            if os.path.isdir(TREN) and not os.path.exists(p): err.append(f'{i}: нет файла {p}')
        elif u.startswith('/'):
            p = os.path.join(ROOT, u.lstrip('/').split('?')[0])
            if p.endswith('/'): p += 'index.html'
            if not os.path.exists(p): err.append(f'{i}: нет файла {u}')
    for g in z['groups']:
        if not CODE_GROUP.match(g): err.append(f'группа {g}: не подходит под формат кода')
    for a in z['assigned']:
        if a['group'] not in z['groups']: err.append(f'задано: нет группы {a["group"]}')
        if a['material'] not in ids: err.append(f'задано: нет материала {a["material"]}')
        for d in ('given', 'due'):
            if a.get(d) and not re.match(r'^\d{4}-\d{2}-\d{2}$', a[d]): err.append(f'задано {a["material"]}: дата {d}')
    return err, len(cat['items']), len(z['assigned'])


def build():
    for path, page, attrs, title in PAGES:
        p = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        a = ''.join(f' data-{k}="{v}"' for k, v in attrs.items())
        with open(p, 'w', encoding='utf-8') as f:
            f.write(SHELL.format(title=title, page=page, attrs=a))
    return len(PAGES)


if __name__ == '__main__':
    e, n, na = check()
    for x in e: print('ОШИБКА', x)
    print(f'каталог: {n} материалов, задано: {na}, ошибок: {len(e)}')
    if e: sys.exit(1)
    if '--check' not in sys.argv: print('каркасов:', build())
