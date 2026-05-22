# TINOLI — There Is No Other Like It

> Премиальное портфолио мастера авторских украшений ручной работы.  
> Тёмный дизайн. Золотые акценты. Чистый HTML/CSS/JS. Полная переносимость.

**Сайт:** [tinoli.ru](https://tinoli.ru)  
**Репозиторий:** [github.com/SergioTheFirst/TINOLI](https://github.com/SergioTheFirst/TINOLI)  
**Деплой:** GitHub Pages (автоматически при пуше в `main`)

---

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Технологии](#технологии)
- [Архитектура](#архитектура)
- [Каталог работ](#каталог-работ)
- [Админ-панель](#админ-панель)
- [Публикация на GitHub](#публикация-на-github)
- [Дизайн-система](#дизайн-система)
- [Безопасность](#безопасность)
- [Troubleshooting](#troubleshooting)
- [Лицензия](#лицензия)

---

## Быстрый старт

### 1. Клонирование

```bash
git clone https://github.com/SergioTheFirst/TINOLI.git
cd TINOLI
```

### 2. Запуск локального сервера

```bash
python server.py
```

Сервер поднимается на `http://localhost:8000`.  
Админ-панель — `http://localhost:8000/admin.html`.

**Требования:** Python 3.8+. Никаких зависимостей — только стандартная библиотека.

### 3. Открой сайт в браузере

- **Главная:** `http://localhost:8000` — галерея с бесконечной прокруткой
- **Админка:** `http://localhost:8000/admin.html` — добавление, редактирование и публикация работ

---

## Технологии

| Компонент | Технология |
|-----------|-----------|
| Язык | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Сервер (локально) | Python 3.8+, `http.server` (stdlib) |
| Хостинг (production) | GitHub Pages (статический) |
| Шрифты | Google Fonts: Playfair Display, DM Sans, Cinzel |
| Анимации | CSS transitions + IntersectionObserver |
| Изображения | JPEG/PNG/WebP, client-side Canvas compression |
| Конфигурация | JSON-файлы (`config.json`, `works/works.json`) |

**Что НЕ используется:** React, Vue, npm, Webpack, базы данных, Docker, CMS.

---

## Архитектура

### Структура проекта

```
TINOLI/
├── index.html              # Главная: герой, infinite-scroll галерея
├── gallery.html            # Отдельная страница галереи (legacy)
├── about.html              # «О мастере»
├── contact.html            # Контакты: Telegram, WhatsApp, Instagram, VK
├── admin.html              # Админ-панель (только локально, gitignored)
├── server.py               # Python-сервер (stdlib, без pip, gitignored)
├── config.json             # Все тексты, контакты, SEO, аналитика
├── works/
│   ├── works.json          # Каталог работ (id, title, category, files)
│   └── images/             # Фотографии: основная + hover-вариант
├── css/
│   └── style.css           # Полный дизайн: тёмно-фиолетовая палитра
├── js/
│   ├── main.js             # Галерея, infinite scroll, фильтры, лайтбокс
│   └── admin-edit.js       # Логика модального окна редактирования работ
├── robots.txt              # SEO: разрешить всё, закрыть /admin.html
├── CNAME                   # Кастомный домен tinoli.ru
└── favicon.svg             # Логотип-иконка
```

### Жизненный цикл запроса (локальный сервер)

```
Браузер → GET /index.html → Python http.server → читает файл с диска
Браузер → GET /works/works.json → сервер → JSON с каталогом
Браузер → GET /works/images/xxx.jpg → сервер → бинарный файл
Браузер → POST /upload (admin) → сервер → сохраняет фото, обновляет works.json
Браузер → POST /git-push (admin) → сервер → GitHub API → публикация в main
```

### Поток данных

```
[Админ-панель] → загрузка фото → client-side Canvas compression
                                    ↓
[server.py] → сохраняет в works/images/ + обновляет works.json
                                    ↓
[GitHub API] → публикует все файлы в репозиторий → GitHub Pages
                                    ↓
[Пользователь] → открывает tinoli.ru → CDN отдаёт статику
                                    ↓
[main.js] → fetch(works.json) → рендерит карточки через IntersectionObserver
```

### Ключевые компоненты

**Infinite Scroll (`js/main.js`)**
- `IntersectionObserver` на sentinel-элементе внизу страницы
- Загрузка партиями по 12 работ
- Фильтрация по категориям (brooch, ring, earrings, bracelet, necklace, other)
- Состояние фильтра сохраняется в URL (`?category=brooch`)
- Scroll-to-top FAB появляется после 800px прокрутки

**Image Compression (client-side)**
- Canvas API: ресайз до 1500px по ширине
- JPEG quality 0.85
- Максимальный выход 3MB
- Hover-фото обрабатывается аналогично

**Админ-панель (`admin.html` + `js/admin-edit.js`)**
- 3 вкладки: «Добавить работу», «Все работы», «Публикация»
- Drag-and-drop или выбор файла
- Модальное окно редактирования: title, category, description
- Client-side валидация и preview
- Публикация на GitHub через API (без git CLI)

**SEO и метаданные (`config.json`)**
- `seo.title`, `seo.description`, `seo.keywords`
- `analytics.yandex_metrika_id`
- `analytics.cloudflare_token`
- Автогенерация `sitemap.xml` и `robots.txt` сервером

---

## Каталог работ

Каждая работа — объект в `works/works.json`:

```json
{
  "id": "20260405_172914",
  "filename": "20260405_172914.jpg",
  "title": "«Париж в кристаллах» — Эйфелева башня",
  "description": "Брошь ручной работы в форме Эйфелевой башни...",
  "category": "brooch",
  "date": "2026-04-05",
  "filename_hover": "20260405_172914_hover.jpg"
}
```

| Поле | Описание |
|------|----------|
| `id` | Timestamp `YYYYMMDD_HHMMSS` — уникальный идентификатор |
| `filename` | Основное фото в `works/images/` |
| `filename_hover` | Фото при наведении (опционально) |
| `title` | Название работы |
| `description` | Полное описание, материалы, размер |
| `category` | `brooch`, `ring`, `bracelet`, `earrings`, `necklace`, `other` |
| `date` | Дата создания |

---

## Админ-панель

### Добавление работы

1. Запусти `python server.py`
2. Открой `http://localhost:8000/admin.html`
3. Вкладка **«Добавить работу»**
4. Перетащи фото (или нажми «Выбрать файл»)
5. Заполни: название, категория, описание
6. Опционально: второе фото для эффекта hover
7. Нажми **«Опубликовать»**
8. Работа мгновенно появляется на `localhost:8000`

### Редактирование работы

1. Вкладка **«Все работы»**
2. Найди работу в списке
3. Нажми **«Редактировать»**
4. Измени название, категорию или описание
5. Нажми **«Сохранить»**
6. Изменения записываются в `works.json` без перезагрузки страницы

### Удаление работы

1. Вкладка **«Все работы»**
2. Нажми **«Удалить»** → подтверждение
3. Сервер удаляет запись из `works.json` и файлы из `works/images/`

---

## Публикация на GitHub

Публикация происходит **без git CLI** — сервер напрямую использует GitHub API.

### 1. Получение GitHub Token

1. Открой [github.com/settings/tokens](https://github.com/settings/tokens)
2. **Developer settings → Personal access tokens → Tokens (classic)**
3. **Generate new token**
4. Поставь галочку **repo** (полный доступ к репозиторию)
5. Скопируй токен (он показывается только один раз)

### 2. Сохранение токена

1. Админ-панель → вкладка **«Публикация»**
2. Вставь токен в поле **«GitHub токен»**
3. Нажми **«Сохранить токен»**
4. Токен сохраняется в `secrets.json` (не коммитится, в `.gitignore`)

### 3. Публикация

1. Нажми **«Опубликовать на GitHub»**
2. Сервер загружает все файлы в репозиторий через GitHub API
3. GitHub Pages автоматически обновляет сайт (~30–60 сек)

### Что происходит под капотом

```python
# server.py handle_git_push() — 6 шагов:
1. GET /repos/{owner}/{repo}/git/ref/heads/main   → получаем SHA последнего коммита
2. GET /repos/{owner}/{repo}/git/commits/{sha}    → получаем SHA дерева
3. POST /repos/{owner}/{repo}/git/blobs           → загружаем каждый файл (base64)
4. POST /repos/{owner}/{repo}/git/trees           → создаём новое дерево файлов
5. POST /repos/{owner}/{repo}/git/commits         → создаём коммит
6. PATCH /repos/{owner}/{repo}/git/refs/heads/main → обновляем ветку
```

**Важно:** перед публикацией сервер автоматически удаляет токен из `config.json`, если он там оказался, и переносит его в `secrets.json`.

---

## Дизайн-система

| Элемент | Значение |
|---------|----------|
| Фон страницы | `#09040f` (тёмный пурпурно-чёрный) |
| Фон карточек | `#1a0c2e` (глубокий пурпур) |
| Акцент | `#d4a84b` (золото) |
| Текст заголовков | `#ffffff` (белый) |
| Текст основной | `#c0aee0` (приглушённый фиолетовый) |
| Шрифт логотипа / навигации | Cinzel (serif, uppercase) |
| Шрифт заголовков | Playfair Display (serif) |
| Шрифт текста | DM Sans (sans-serif) |
| Базовый размер шрифта | 18px |
| Радиус скругления | 6px |
| Тень карточек | `0 8px 32px rgba(0,0,0,0.4)` |

### Анимации

- **Появление карточек:** `opacity 0→1`, `translateY(20px)→0`, 0.5s ease-out
- **Hover на карточке:** фото меняется на `filename_hover`, scale 1.02
- **Focus-visible:** золотая обводка `#d4a84b` для keyboard navigation
- **Spinner загрузки:** CSS-анимация вращения, золотой цвет
- **Scroll-to-top FAB:** плавное появление/исчезновение, `transform: translateY`

### Accessibility

- `:focus-visible` — видимый фокус только при keyboard navigation
- `prefers-reduced-motion` — отключает анимации для пользователей с предпочтениями
- `aria-live` на состояниях загрузки
- Контраст текст/фон соответствует WCAG AA

---

## Безопасность

### Локальный сервер (`server.py`)

| Мера | Реализация |
|------|-----------|
| API доступ | Только с `127.0.0.1` и `::1` (localhost) |
| Блокировка файлов | `.py`, `.pyc`, `.bat`, `secrets.json` → 404 |
| GitHub токен | Только в `secrets.json`, никогда в `config.json` |
| `secrets.json` | В `.gitignore`, не попадает в GitHub |

### GitHub Pages (production)

| Мера | Реализация |
|------|-----------|
| Админ-панель | `admin.html` не в репозитории (`.gitignore`) |
| Python-сервер | `server.py` не в репозитории (`.gitignore`) |
| `.bat` файлы | Исключены из репозитория |
| `robots.txt` | `Disallow: /admin.html` (на всякий случай) |

---

## Troubleshooting

### Сервер не запускается

**Ошибка:** `SyntaxError` или `ImportError`

**Решение:**
- Убедись, что Python 3.8+: `python --version`
- На Windows используй `python server.py` (не `python3`)
- Проверь, что файл `server.py` не повреждён — сравни с оригиналом в репозитории

### Админ-панель не открывается

**Ошибка:** 404 при открытии `http://localhost:8000/admin.html`

**Решение:**
- Файл `admin.html` есть только локально, он в `.gitignore`
- Если ты склонировал репозиторий с GitHub — создай `admin.html` заново или скопируй с бэкапа
- `admin.html` и `server.py` — локальные dev-файлы, не хранятся в публичном репо

### Публикация на GitHub падает с ошибкой токена

**Ошибка:** `GitHub токен не указан`

**Решение:**
1. Открой админку → «Публикация»
2. Вставь токен → «Сохранить токен»
3. Убедись, что токен имеет право `repo`
4. Проверь, что `github.owner` и `github.repo` в `config.json` заполнены

### Изображения не отображаются на сайте

**Решение:**
- Проверь, что файлы есть в `works/images/`
- Проверь `works/works.json` — поле `filename` должно совпадать с именем файла
- Открой DevTools → Network → убедись, что запросы к `/works/images/` возвращают 200

### После публикации сайт не обновился

**Решение:**
- GitHub Pages обновляется с задержкой 30–60 секунд
- Проверь статус Pages в Settings → Pages репозитория
- Убедись, что ветка `main` выбрана как источник
- Проверь консоль браузера на ошибки 404

### Работы не фильтруются по категории

**Решение:**
- Категория в `works.json` должна быть одной из: `brooch`, `ring`, `bracelet`, `earrings`, `necklace`, `other`
- URL-параметр: `?category=brooch` (английские названия)
- Нажми «Сбросить фильтр» в админке или удали `?category=...` из URL

---

## Лицензия

Частный проект. © 2026 TINOLI. Все права защищены.
