#!/usr/bin/env python3
"""Сквозная проверка раздела «Задачник» в Chrome на демо-данных (ДЕМО-ключ, пароль demo-uchitel-2026).

  python3 -I tools/zadachnik_demo/e2e.py [--shots DIR]      (из корня репозитория; нужен playwright и Chrome)

Сервер — http.server на localhost; кабинеты (GET /api/zadachnik/key) — мок через перехват запросов.
"""
import base64, json, os, re, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PASS = 'demo-uchitel-2026'
KEYFILE = os.environ.get('ZADACHNIK_KEY_FILE', '/home/claude/zkey-demo.b64')
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
ok = fail = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1; print('OK  ', name)
    else:
        fail += 1; print('FAIL', name, extra)


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


port = free_port()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
U = f'http://localhost:{port}'
RAW = open(KEYFILE).read().strip()
errors = []


def watch(page):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{page.url}: {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); page.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=True)


def wait_ready(page):
    page.wait_for_function("() => !document.querySelector('main').textContent.includes('Загружаю')", timeout=15000)


def no_hscroll(page):
    return page.evaluate('document.scrollingElement.scrollWidth <= window.innerWidth + 1')


try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        phone = dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)

        # ---------- учитель: полка → книга → параграф (замок → пароль)
        ctx = br.new_context(**phone); pg = ctx.new_page(); watch(pg)
        pg.goto(U + '/zadachnik/'); wait_ready(pg)
        check('полка: заголовок и 2 книги', pg.locator('h1').inner_text() == 'Задачник' and pg.locator('.tiles .tile').count() == 2)
        check('полка: подтема «Движение по окружности» в 2 книгах', '2 книги' in pg.locator('ul.mat li', has_text='Движение по окружности').inner_text())
        check('меню: пункт Задачник отмечен', pg.locator('#menu a[aria-current]').inner_text() == 'Задачник')
        check('полка: замок «после входа»', pg.locator('.zlock').count() == 1)
        check('телефон 390: полка без горизонтальной прокрутки', no_hscroll(pg))
        shot(pg, '1-polka')

        pg.goto(U + '/zadachnik/?b=demo'); wait_ready(pg)
        check('книга: 2 параграфа в оглавлении', pg.locator('ol.ztoc > li').count() == 2)
        check('книга: «эта подтема ещё — Метафизика»', 'Метафизика' in pg.locator('ol.ztoc > li').nth(1).inner_text())

        pg.goto(U + '/zadachnik/?b=demo&p=2'); wait_ready(pg); pg.wait_for_selector('#zl .empty')
        body = pg.content()
        check('параграф без ключа: только номера', 'Номера: 2.1, 2.2' in pg.locator('#zl').inner_text())
        check('параграф без ключа: текста задач нет в странице', 'Шкив радиусом' not in body and 'минутной стрелки' not in body)
        pg.click('#zt-open'); pg.fill('#zpass', 'неверный-пароль-123'); pg.click('#zpw button')
        pg.wait_for_selector('#zpm:not([hidden])')
        check('неверный пароль — отказ', 'не подошёл' in pg.locator('#zpm').inner_text())
        pg.fill('#zpass', PASS); pg.click('#zpw button'); pg.wait_for_selector('.zt')
        pg.wait_for_function("() => [...document.querySelectorAll('.zt img')].every(i => i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0)")
        check('пароль учителя: 6 задач параграфа', pg.locator('.zt').count() == 6)
        check('формулы KaTeX отрисованы', pg.locator('.zt .katex').count() >= 10)
        check('рисунок расшифрован (blob)', pg.locator('.zt img').count() == 1)
        check('ответы свёрнуты, есть у каждой', pg.locator('details.zans').count() == 6 and pg.locator('details.zans[open]').count() == 0)
        check('режим учителя: «+ в ДЗ» и панель', pg.locator('.zadd').count() == 6 and pg.locator('#zbar').count() == 1)
        check('ссылка на переписанную у 2.1', 'Переписанная: Метафизика okr-1' in pg.locator('#z-2\\.1').inner_text())
        check('телефон 390: параграф без горизонтальной прокрутки', no_hscroll(pg))
        shot(pg, '2-paragraf-uchitel')
        pg.click('#zlv .chip[data-l="4"]'); pg.wait_for_timeout(200)
        check('фильтр уровня 4: 2 задачи', pg.locator('.zt').count() == 2)
        pg.click('#zlv .chip[data-l="0"]'); pg.wait_for_timeout(200)
        pg.locator('#z-2\\.1 .zadd').click(); pg.locator('#z-2\\.5 .zadd').click()
        check('корзина: 2 задачи', '2 задачи' in pg.locator('#zbar').inner_text())

        pg.goto(U + '/zadachnik/?b=demo&p=2#z-2.4'); wait_ready(pg); pg.wait_for_selector('.zt')
        check('прямая ссылка на задачу подсвечена', 'hl' in (pg.get_attribute('#z-2\\.4', 'class') or ''))

        # ---------- подтема: смешать
        pg.goto(U + '/zadachnik/?s=' + 'движение-по-окружности'); wait_ready(pg); pg.wait_for_selector('.zt')
        lv = pg.eval_on_selector_all('#zl .zt .dots', 'xs => xs.map(x => x.textContent.split("●").length - 1)')
        check('смешать: 10 задач двух книг по возрастанию уровня', len(lv) == 10 and lv == sorted(lv), str(lv))
        srcs = pg.eval_on_selector_all('#zl .zt .zsrc', 'xs => xs.map(x => x.textContent.split(" ")[0])')
        check('смешать: книги чередуются внутри уровня', any(srcs[i] != srcs[i + 1] for i in range(len(srcs) - 1)))
        pg.locator('#ztabs .chip', has_text='Метафизика').click(); pg.wait_for_timeout(200)
        check('вкладка книги: 4 задачи Метафизики', pg.locator('.zt').count() == 4)
        shot(pg, '3-podtema')

        # ---------- сборщик ДЗ
        pg.goto(U + '/zadachnik/dz/'); wait_ready(pg); pg.wait_for_selector('#dzl li')
        check('сборщик: корзина перенесена (2)', pg.locator('#dzl li').count() == 2)
        pg.fill('#dzp', 'Мф okr-2, okr-3; Демо 1.3; Мф okr-99'); pg.click('#dzadd'); pg.wait_for_timeout(300)
        check('вставка списком: +3, неизвестная отмечена', pg.locator('#dzl li').count() == 5 and 'okr-99' in pg.locator('#dzm').inner_text())
        first = pg.locator('#dzl li b').first.inner_text()
        pg.locator('#dzl li').first.locator('button[data-a="down"]').click(); pg.wait_for_timeout(300)
        check('перестановка ↓', pg.locator('#dzl li b').nth(1).inner_text() == first)
        pg.click('.zladder summary'); pg.select_option('#dl1', '2'); pg.select_option('#dl2', '3'); pg.fill('#dln', '2'); pg.click('#dlgo'); pg.wait_for_timeout(500)
        check('добить лесенкой: +2 из подтемы', pg.locator('#dzl li').count() == 7)
        pg.fill('#dzt', 'ДЗ 10ФМ окружность'); pg.fill('#dzd', '2026-11-13')
        link = pg.input_value('#dzlink')
        check('ссылка ДЗ: 7 задач, срок, название', link.count(',') == 6 and 'd=2026-11-13' in link and '/zadachnik/dz/?z=' in link, link)
        cat = pg.locator('#dzjson').text_content()
        check('записи для «Задано»: kind dz и материал', '"kind": "dz"' in cat and '"material"' in cat)
        check('телефон 390: сборщик без горизонтальной прокрутки', no_hscroll(pg))
        shot(pg, '4-sborshchik')
        pg.goto(link); wait_ready(pg); pg.wait_for_selector('.zt')
        check('ДЗ у учителя: 7 задач, ответы скрыты до кнопки', pg.locator('.zt').count() == 7 and pg.locator('details.zans').count() == 0)
        pg.click('#dzans'); pg.wait_for_timeout(200)
        check('ДЗ у учителя: «Ответы (учителю)» показывает ответы', pg.locator('details.zans[open]').count() == 7)
        ctx.close()

        # ---------- ученик без входа
        ctx = br.new_context(**phone); pg = ctx.new_page(); watch(pg)
        pg.goto(link); wait_ready(pg); pg.wait_for_selector('.zt')
        locked = pg.locator('.zt.locked').count(); opened = pg.locator('.zt:not(.locked)').count()
        check('ДЗ без входа: закрытые под замком, «Метафизика» видна', locked >= 3 and opened >= 2 and locked + opened == 7, f'{locked}/{opened}')
        check('ДЗ без входа: ответов нет, кнопки учителя нет', pg.locator('details.zans').count() == 0 and pg.locator('#dzans').count() == 0)
        check('ДЗ без входа: замок с подсказкой', pg.locator('.zlock').count() == 1)
        shot(pg, '5-dz-bez-vhoda')
        pg.goto(U + '/zadachnik/?b=mf&p=okr'); wait_ready(pg); pg.wait_for_selector('.zt')
        check('открытая книга без входа: задачи видны, ответов нет', pg.locator('.zt').count() == 4 and pg.locator('details.zans').count() == 0)
        ctx.close()

        # ---------- ученик вошёл в кабинет (мок сервера)
        def with_token(token):
            c = br.new_context(**phone)
            c.add_init_script(f"try{{localStorage.setItem('mf:token', {json.dumps(token)})}}catch(e){{}}")
            c.route('**/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body='window.API_BASE="https://api.mock";'))
            def api(r):
                good = r.request.headers.get('authorization') == 'Bearer student-ok'
                r.fulfill(status=200 if good else 401, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                          body=json.dumps({'ok': True, 'data': {'key': RAW}} if good else {'ok': False, 'error': 'unauthorized'}))
            c.route('https://api.mock/**', api)
            return c
        ctx = with_token('student-ok'); pg = ctx.new_page(); watch(pg)
        pg.goto(link); wait_ready(pg); pg.wait_for_selector('.zt')
        pg.wait_for_function("() => [...document.querySelectorAll('.zt img')].every(i => i.src.startsWith('blob:'))")
        check('ученик в кабинете: все 7 задач ДЗ открыты', pg.locator('.zt.locked').count() == 0 and pg.locator('.zt').count() == 7)
        check('ученик: ответов в ДЗ нет, кнопки учителя нет', pg.locator('details.zans').count() == 0 and pg.locator('#dzans').count() == 0)
        shot(pg, '6-dz-uchenik')
        pg.goto(U + '/zadachnik/?b=demo&p=2'); wait_ready(pg); pg.wait_for_selector('.zt')
        check('ученик в задачнике: ответы есть, «+ в ДЗ» нет', pg.locator('details.zans').count() == 6 and pg.locator('.zadd').count() == 0 and pg.locator('#zbar').count() == 0)
        ctx.close()
        ctx = with_token('student-bad'); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'{pg.url}: {e}'))
        pg.goto(U + '/zadachnik/?b=demo&p=2'); wait_ready(pg); pg.wait_for_selector('#zl .empty')
        check('чужой/просроченный токен: замок остаётся', pg.locator('.zt').count() == 0 and pg.locator('.zlock').count() == 1)
        ctx.close()

        # ---------- компьютер
        ctx = br.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page(); watch(pg)
        pg.goto(U + '/zadachnik/?b=demo'); wait_ready(pg); shot(pg, '7-kniga-pk')
        ctx.close(); br.close()
finally:
    srv.terminate()

# закрытые тексты не лежат в данных открытыми
leak = subprocess.run(['grep', '-rl', 'Шкив радиусом', os.path.join(ROOT, 'data')], capture_output=True, text=True).stdout.strip()
check('в data/ нет открытого текста закрытой книги', leak == '', leak)
check('консоль без ошибок', not errors, '\n'.join(errors[:8]))
print(f'\n{ok} OK, {fail} FAIL')
sys.exit(1 if fail else 0)
