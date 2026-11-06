#!/usr/bin/env python3
"""Экспорт банка задач в раздел «Задачник» сайта и проверка.

  python3 tools/zadachnik.py newkey  KEYFILE
  ZADACHNIK_TEACHER_PASS=… python3 tools/zadachnik.py export --bank DIR --knigi YAML --out data/zadachnik --key KEYFILE
  python3 tools/zadachnik.py check   --bank DIR --knigi YAML --out data/zadachnik --key KEYFILE

Вход: bank/**/*.md (схема hub/схема_задачи.md; status: retired пропускается) и словарь полки (книги, параграфы,
сквозные подтемы — hub/подтемы.yaml на ПК; демо — tools/zadachnik_demo/knigi.yaml).
Выход: knigi.json (полка, оглавления, подтемы), <книга>/<параграф>.json — открытые книги, .enc — закрытые
(AES-GCM-256, IV детерминированный: та же задача — тот же шифр, git не пухнет), fig/<книга>/…, keys.json.
Ключ данных (32 байта) лежит только на ПК в KEYFILE; в репозиторий — никогда. Пароль учителя — только из
переменной окружения; в keys.json — ключ, завёрнутый паролем (PBKDF2-SHA256). Сервер кабинетов отдаёт тот же
ключ вошедшим (GET /api/zadachnik/key, секрет ZADACHNIK_KEY = base64 KEYFILE).
Уровень d (1,0–5,0) — hub/задачники_на_сайте.md § 5: якорь книги + шаги решения + тяжёлая математика + поправки.
"""
import argparse, base64, hashlib, hmac, io, json, math, os, re, subprocess, sys, tempfile
from collections import Counter, defaultdict

import yaml
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 310_000
CHECK_PLAIN = b'metaphys-zadachnik'
RASTER = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}
FIG_EXT = RASTER | {'.svg'}
HEAVY = [('тригонометрия', re.compile(r'\\(sin|cos|tg|tan|ctg|cot|arcsin|arccos|arctg|arctan)\b')),
         ('векторы', re.compile(r'\\(vec|overrightarrow)\b')),
         ('система', re.compile(r'\\begin\{cases\}|\\left\\\{')),
         ('производная', re.compile(r"\\frac\{d|\\dot\{|\\dot |[a-z]'\(t\)"))]
b64 = lambda b: base64.b64encode(b).decode()


# ---------- банк
def parse_md(path):
    s = open(path, encoding='utf-8').read()
    if not s.startswith('---'):
        return None
    _, head, body = s.split('---', 2)
    meta = yaml.safe_load(head) or {}
    sec, cur = {}, None
    for line in body.splitlines():
        m = re.match(r'^##\s+(.+?)\s*$', line)
        if m:
            cur = m.group(1).strip(); sec[cur] = []
        elif cur:
            sec[cur].append(line)
    meta['_sec'] = {k: '\n'.join(v).strip() for k, v in sec.items()}
    meta['_dir'] = os.path.dirname(path)
    meta['_path'] = path
    return meta


def load_bank(root):
    out = []
    for dp, _, fs in os.walk(root):
        for f in sorted(fs):
            if f.endswith('.md') and not f.startswith('_'):
                t = parse_md(os.path.join(dp, f))
                if t and t.get('status') != 'retired':
                    out.append(t)
    return out


def natkey(n):
    return [(0, int(p), '') if p.isdigit() else (1, 0, p) for p in re.split(r'(\d+)', str(n)) if p != '']


# ---------- уровень
def steps_of(t):
    rel = (t.get('skeleton') or {}).get('relation')
    if isinstance(rel, list):
        n = sum(1 for r in rel if '=' in str(r))
        return n or None
    if isinstance(rel, str) and rel.strip():
        n = sum(1 for r in re.split(r'[;\n]', rel) if '=' in r)
        return n or None
    sol = t['_sec'].get('Решение', '')
    n = sum(1 for line in sol.splitlines() if '=' in line and '$' in line)
    return n or None


def step_scale(n):
    return 1.5 if n <= 1 else 2.5 if n == 2 else 3.0 if n <= 4 else 3.5 if n <= 6 else 4.5


def difficulty(t, book, part, pos):
    """pos — доля места в параграфе (0…1). Возвращает (d, lvl, src)."""
    if t.get('difficulty') is not None:                       # правка учителя сильнее всех слоёв
        d = float(t['difficulty']); src = 'teacher'
    else:
        src = []
        if t.get('level'):
            anchor = float(t['level']); src.append('book')
        else:
            anchor = float(book.get('level_default', 3)); src.append('default')
            sh = float(book.get('position_shift', 0))
            if sh:
                anchor += (pos - 0.5) * 2 * sh; src.append('pos')
        n = steps_of(t)
        d = anchor if n is None else 0.5 * anchor + 0.5 * step_scale(n)
        if n is not None:
            src.append('steps')
        text = t['_sec'].get('Условие', '') + '\n' + t['_sec'].get('Решение', '') + '\n' + str((t.get('skeleton') or {}).get('relation') or '')
        heavy = sum(1 for _, rx in HEAVY if rx.search(text))
        if heavy:
            d += min(0.5, 0.25 * heavy); src.append('math')
        d += float(book.get('shift', 0)) + float(part.get('shift', 0))
        src = '+'.join(src)
    d = round(min(5.0, max(1.0, d)), 1)
    return d, int(min(5, max(1, math.floor(d + 0.5)))), src


# ---------- шифр
def load_key(path):
    k = base64.b64decode(open(path).read().strip())
    if len(k) != 32:
        sys.exit('ключ должен быть 32 байта (base64)')
    return k


def det_iv(key, name, plain):
    return hmac.new(key, b'iv|' + name.encode() + b'|' + hashlib.sha256(plain).digest(), hashlib.sha256).digest()[:12]


def seal(key, name, plain):
    iv = det_iv(key, name, plain)
    return iv + AESGCM(key).encrypt(iv, plain, None)


def wrap(key, password):
    salt = os.urandom(16)
    kek = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode())
    iv = os.urandom(12)
    return {'salt': b64(salt), 'iv': b64(iv), 'ct': b64(AESGCM(kek).encrypt(iv, key, None))}


def keys_json(key, old):
    chk_iv = det_iv(key, 'check', CHECK_PLAIN)
    check = {'iv': b64(chk_iv), 'ct': b64(AESGCM(key).encrypt(chk_iv, CHECK_PLAIN, None))}
    wraps = old.get('wraps', []) if old.get('check') == check else []     # ключ сменился → старые обёртки негодны
    pw = os.environ.get('ZADACHNIK_TEACHER_PASS')
    if pw:
        if len(pw) < 10:
            sys.exit('пароль учителя — не короче 10 знаков')
        wraps = [w for w in wraps if w.get('role') != 'teacher'] + [dict(role='teacher', **wrap(key, pw))]
    return {'v': 1, 'alg': 'AES-GCM-256', 'kdf': 'PBKDF2-SHA256', 'iter': ITER, 'check': check, 'wraps': wraps}


# ---------- сборка
def build(args):
    K = yaml.safe_load(open(args.knigi, encoding='utf-8'))
    podtemy, knigi = K.get('podtemy') or {}, K.get('knigi') or []
    bank = load_bank(args.bank)
    src2book = {s: b for b in knigi for s in b.get('sources', [])}
    rep = {'errors': [], 'warnings': [], 'off_shelf': Counter(), 'multi': 0}
    parts_tasks = defaultdict(list)
    for t in bank:
        b = src2book.get((t.get('source') or {}).get('book'))
        if not b:
            rep['off_shelf'][(t.get('source') or {}).get('book')] += 1
            continue
        num = str((t.get('source') or {}).get('number', ''))
        hits = [p for p in b['parts'] if match(p.get('match') or {}, num, t)]
        if not hits:
            rep['errors'].append(f"{t['id']}: {b['id']} № {num} не попал ни в один параграф")
            continue
        rep['multi'] += len(hits) > 1
        parts_tasks[(b['id'], hits[0]['id'])].append(t)

    refs = {}
    for (bid, pid), ts in parts_tasks.items():
        for t in ts:
            r = f"{bid}:{t['source']['number']}"
            if r in refs:
                rep['errors'].append(f'повтор ссылки {r}: {refs[r]} и {t["id"]}')
            refs[r] = t['id']
    rewr = defaultdict(list)                       # исходная ссылка → переписанные
    for (bid, pid), ts in parts_tasks.items():
        for t in ts:
            if t.get('based_on'):
                rewr[str(t['based_on'])].append(f"{bid}:{t['source']['number']}")
                if str(t['based_on']) not in refs:
                    rep['warnings'].append(f"{t['id']}: based_on {t['based_on']} — такой задачи на полке нет")
    return K, podtemy, knigi, parts_tasks, rewr, rep


def match(m, num, t):
    if m.get('all'):
        return True
    if 'prefix' in m and num.startswith(str(m['prefix'])):
        return True
    if 'range' in m and re.fullmatch(r'\d+', num) and m['range'][0] <= int(num) <= m['range'][1]:
        return True
    if 'subtopic' in m and t.get('subtopic') == m['subtopic']:
        return True
    return False


def figure(t, book, out, key, files):
    f = t.get('figure')
    if not f:
        return []
    src = os.path.normpath(os.path.join(t['_dir'], f))
    ext = os.path.splitext(src)[1].lower()
    if ext not in FIG_EXT or not os.path.exists(src):
        return None                                # нет файла или исходник (.tex) без рендера
    data, oext = open(src, 'rb').read(), ext
    if ext in RASTER:
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(data))
            if im.width > 1200 or len(data) > 150_000:
                im.thumbnail((1200, 1200)); buf = io.BytesIO()
                im.convert('RGB').save(buf, 'WEBP', quality=80); data, oext = buf.getvalue(), '.webp'
        except ImportError:
            pass
    safe = re.sub(r'[^0-9A-Za-zА-Яа-яЁё._-]', '_', str(t['source']['number']))
    name = f"fig/{book['id']}/{safe}-1{oext}" + ('.enc' if book.get('closed') else '')
    files[name] = seal(key, name, data) if book.get('closed') else data
    return [name]


def export(args):
    key = load_key(args.key)
    K, podtemy, knigi, parts_tasks, rewr, rep = build(args)
    files, shelf, subs = {}, [], defaultdict(list)
    for b in knigi:
        bl, bparts = [0] * 5, []
        for p in b['parts']:
            ts = sorted(parts_tasks.get((b['id'], p['id']), []), key=lambda t: natkey(t['source']['number']))
            for s in p.get('subs', []):
                if s not in podtemy:
                    rep['errors'].append(f"{b['id']}/{p['id']}: подтемы {s} нет в podtemy")
            if not p.get('subs'):
                rep['errors'].append(f"{b['id']}/{p['id']}: у параграфа нет подтемы")
            tasks, pl = [], [0] * 5
            for i, t in enumerate(ts):
                d, lvl, dsrc = difficulty(t, b, p, i / max(1, len(ts) - 1))
                pl[lvl - 1] += 1
                ref = f"{b['id']}:{t['source']['number']}"
                fig = figure(t, b, args.out, key, files)
                if fig is None:
                    rep['errors'].append(f"{t['id']}: рисунок {t.get('figure')} не найден или без рендера")
                    fig = []
                tasks.append({'id': t['id'], 'ref': ref, 'n': str(t['source']['number']), 'text': t['_sec'].get('Условие', ''),
                              'fig': fig, 'd': d, 'lvl': lvl, 'src': dsrc, 'ans': str(t.get('answer') or ''),
                              'ver': t.get('verification') or '', 'sub': [t['subtopic']] if t.get('subtopic') else p.get('subs', []),
                              'rewr': rewr.get(ref, []), 'based': t.get('based_on')})
            if not tasks:
                rep['warnings'].append(f"{b['id']}/{p['id']}: пустой параграф")
            body = json.dumps({'book': b['id'], 'part': p['id'], 'tasks': tasks}, ensure_ascii=False, separators=(',', ':')).encode()
            name = f"{b['id']}/{p['id']}.json" + ('.enc' if b.get('closed') else '')
            files[name] = seal(key, name, body) if b.get('closed') else body
            bl = [x + y for x, y in zip(bl, pl)]
            bparts.append({'id': p['id'], 'n': p.get('n', ''), 'title': p['title'], 'subs': p.get('subs', []), 'count': len(tasks),
                           'levels': pl, 'file': name, 'nums': [x['n'] for x in tasks]})
            for s in p.get('subs', []):
                subs[s].append([b['id'], p['id'], len(tasks)])
        shelf.append({'id': b['id'], 'short': b['short'], 'title': b['title'], 'author': b.get('author', ''),
                      'classes': b.get('classes', []), 'closed': bool(b.get('closed')), 'note': b.get('note', ''),
                      'aliases': b.get('aliases', []), 'count': sum(x['count'] for x in bparts), 'levels': bl, 'parts': bparts})
    index = {'v': 1, 'books': shelf,
             'subs': {s: dict(podtemy[s], parts=subs.get(s, [])) for s in podtemy}}
    files['knigi.json'] = json.dumps(index, ensure_ascii=False, indent=1).encode()
    old = {}
    kp = os.path.join(args.out, 'keys.json')
    if os.path.exists(kp):
        old = json.load(open(kp, encoding='utf-8'))
    files['keys.json'] = json.dumps(keys_json(key, old), ensure_ascii=False, indent=1).encode()

    if args.cmd == 'export':
        for name, data in files.items():
            p = os.path.join(args.out, name)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            if not (os.path.exists(p) and open(p, 'rb').read() == data):
                open(p, 'wb').write(data)
        have = {os.path.relpath(os.path.join(dp, f), args.out).replace(os.sep, '/') for dp, _, fs in os.walk(args.out) for f in fs}
        stale = sorted(have - set(files))
        if stale:
            rep['warnings'].append('лишние файлы в выходе (не удалены): ' + ', '.join(stale[:10]))
    return index, parts_tasks, rep, files


def katex_errors(texts):
    """Все формулы $…$ и $$…$$ через KaTeX сайта (node). Возвращает список ошибок."""
    kjs = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'katex', 'katex.min.js')
    if not os.path.exists(kjs):
        return ['нет assets/katex/katex.min.js — проверка формул пропущена']
    rx = re.compile(r'\$\$(.+?)\$\$|\$(.+?)\$', re.S)
    items = [(where, m.group(1) or m.group(2), bool(m.group(1))) for where, s in texts for m in rx.finditer(s)]
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False)
    js = ("const k=require(process.argv[1]);const it=require(process.argv[2]);const e=[];"
          "for(const [w,s,d] of it){try{k.renderToString(s,{throwOnError:true,displayMode:d,strict:'ignore'})}catch(x){e.push(w+': '+x.message.split('\\n')[0])}}"
          "console.log(JSON.stringify(e))")
    r = subprocess.run(['node', '-e', js, os.path.abspath(kjs), f.name], capture_output=True, text=True)
    os.unlink(f.name)
    if r.returncode:
        return ['node: ' + r.stderr.strip()[:300]]
    return json.loads(r.stdout)


def check(args):
    index, parts_tasks, rep, files = export(args)
    texts = [(t['id'], t['_sec'].get('Условие', '') + ' ' + str(t.get('answer') or '')) for ts in parts_tasks.values() for t in ts]
    rep['errors'] += [f'KaTeX {e}' for e in katex_errors(texts)]
    # закрытые тексты не должны лежать в выходе открытыми
    closed = {b['id'] for b in index['books'] if b['closed']}
    blobs = [open(os.path.join(dp, f), 'rb').read() for dp, _, fs in os.walk(args.out) for f in fs] if os.path.isdir(args.out) else []
    sample, leaks = [], 0
    for (bid, _), ts in parts_tasks.items():
        if bid in closed:
            sample += [re.sub(r'\$[^$]*\$', ' ', t['_sec'].get('Условие', '')).split('.')[0].strip()[:24] for t in ts[:5]]
    for s in [x for x in sample if len(x) >= 12][:20]:
        leaks += any(s.encode() in b for b in blobs)
    if leaks:
        rep['errors'].append(f'открытый текст закрытых книг в выходе: {leaks} из {len(sample[:20])}')
    # файлы в выходе совпадают с тем, что дал бы экспорт сейчас
    stale = [n for n, d in files.items() if n != 'keys.json' and (not os.path.exists(os.path.join(args.out, n)) or open(os.path.join(args.out, n), 'rb').read() != d)]
    if stale:
        rep['errors'].append(f'выход устарел — запустите export: {len(stale)} файлов, например {stale[0]}')
    # ключ сайта и ключ на ПК совпадают
    kp = os.path.join(args.out, 'keys.json')
    if os.path.exists(kp) and json.load(open(kp, encoding='utf-8')).get('check') != json.loads(files['keys.json'])['check']:
        rep['errors'].append('keys.json сделан другим ключом')
    return index, rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['newkey', 'export', 'check'])
    ap.add_argument('keyfile', nargs='?')
    ap.add_argument('--bank'); ap.add_argument('--knigi'); ap.add_argument('--out'); ap.add_argument('--key')
    a = ap.parse_args()
    if a.cmd == 'newkey':
        if not a.keyfile or os.path.exists(a.keyfile):
            sys.exit('укажите новый файл ключа (существующий не перезаписываю)')
        open(a.keyfile, 'w').write(b64(os.urandom(32)) + '\n'); print('ключ:', a.keyfile); return
    if not (a.bank and a.knigi and a.out and a.key):
        sys.exit('нужны --bank --knigi --out --key')
    if a.cmd == 'export':
        index, _, rep, _ = export(a)
    else:
        index, rep = check(a)
    for b in index['books']:
        print(f"{b['short']}: {b['count']} задач, уровни {b['levels']}, " + ', '.join(f"{p['n'] or p['id']}={p['count']}" for p in b['parts']))
    if rep['off_shelf']:
        print('вне полки (нет книги в словаре):', dict(rep['off_shelf']))
    if rep['multi']:
        print('задач подходят под несколько параграфов (взят первый):', rep['multi'])
    for w in rep['warnings']:
        print('предупреждение:', w)
    for e in rep['errors'][:50]:
        print('ОШИБКА:', e)
    print('ошибок:', len(rep['errors']))
    sys.exit(1 if rep['errors'] else 0)


if __name__ == '__main__':
    main()
