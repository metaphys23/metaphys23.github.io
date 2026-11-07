# metaphys23.github.io — Тезаурус

Сайт материалов (GitHub Pages, ветка main, корень). Движки тестов и тренажёры — репозиторий `tezaurus` (до 07.11.2026 назывался `fizika-trenazhery`; адрес `/tezaurus/`), домен общий.

## Как устроено
- `data/catalog.json` — **все материалы, по одной записи**: тип (pdf, trenazher, t1–t3, dz, konspekt, lab), раздел (uchebnik, praktikum, eksperiment, inzheneriya), тема из `data/temy.json` (копия `hub/темы.yaml`), классы, адрес, статус (`otkryto` — в оглавлении, `klass` — только классу и в «Задано», `proba` — только по ссылке), уровень (база/★).
- `data/zadano.json` — группы (`LC10FM` → 10 ФМ) и что задано: материал, даты, примечание.
- `assets/site.js` + `assets/site.css` — шапка, меню, вход по коду, все страницы-каталоги. Дизайн меняется только в `site.css`.
- Страницы — пустые каркасы: `/`, `/klass/7…11/`, `/temy/`, `/ekzameny/`, `/uchebnik/`, `/praktikum/`, `/eksperiment/`, `/inzheneriya/`, `/karta/`, `/voiti/`, `/zadano/`.

## Добавить материал
1. Файл — в папку по теме (или тест/тренажёр — в `tezaurus`).
2. Запись в `data/catalog.json`; задать группе — запись в `data/zadano.json`.
3. `python3 tools/build.py` — проверка данных (id, темы, файлы) и пересборка каркасов; ошибки — код возврата 1.

## Код ученика
`<ГРУППА>-XXXX`, например `LC10FM-K7P3`: школа + класс + группа, дефис, 4 знака без O/0/I/1. Хранится только на устройстве ученика; пока сервер коды не проверяет — проверяется формат и наличие группы. «Код → ФИО» — только у учителя.

## 07.11.2026
- Презентация «Вращательное движение» — `klass/10/kinematika/okruzhnost/prezentaciya-vrashchatelnoe-dvizhenie.html` (в каталоге — 9 и 10 класс, вид `prez`), листки ДЗ — `klass/9/kinematika/okruzhnost/dz-vrashchatelnoe-dvizhenie-9fm.pdf`, `klass/10/kinematika/okruzhnost/dz-vrashchatelnoe-dvizhenie-10m1.pdf`.
- Новый вид материала `prez` («Презентация») — в `tools/build.py`, `assets/site.js`, `assets/site.css`.
