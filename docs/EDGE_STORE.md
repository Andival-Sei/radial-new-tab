# Публикация в Microsoft Edge Add-ons

## Перед отправкой

1. Поднять версию одновременно в `package.json` и `public/manifest.json` (для первой публикации `0.1.0` допустима).
2. Выполнить `pnpm package` и проверить ZIP загрузкой распакованной папки `dist` в Edge.
3. Использовать публичную privacy policy URL: `https://github.com/Andival-Sei/radial-new-tab/blob/main/PRIVACY.md`.
4. Загрузить логотип 1:1: текущая `public/icons/icon-128.png` соответствует минимальному размеру 128×128; для карточки рекомендуется версия 300×300.
5. Добавить реальные скриншоты интерфейса 1280×800 или 640×480 (необязательно, но рекомендуется; `docs/design-concept.png` не является готовым скриншотом карточки).
6. Готовые материалы карточки находятся в [`docs/edge-store/`](edge-store/): маленькая плитка 440×280, большая плитка 1400×560 и три скриншота 1280×800 в тёмной теме.
7. Опубликованная страница расширения: <https://microsoftedge.microsoft.com/addons/detail/radial-new-tab/khdibmeighcpgjlabojeidnhjflkdpkm>.

## Текст карточки

**Название:** Radial New Tab

**Краткое описание:** Любимые сайты на персональной орбите — с быстрым поиском, адаптивной темой и спокойным интерфейсом.

**Описание:** Radial New Tab заменяет стандартную стартовую страницу Edge на лёгкое персональное пространство. Ссылки располагаются вокруг часов и поиска, легко перетаскиваются и остаются доступными с клавиатуры. Интерфейс автоматически следует системной светлой или тёмной теме и выбирает русский или английский язык браузера. Доступны коллекции ссылок и умный импорт выбранной папки закладок с распределением по вложенным папкам, Bing, Google и DuckDuckGo, импорт и экспорт, режим фокуса и ручная настройка внешнего вида.

Короткие описания манифеста находятся в `public/_locales/en/messages.json` и `public/_locales/ru/messages.json`; каждое укладывается в фактический лимит Partner Center до 132 символов. Развёрнутые описания для полей карточки — ниже.

**English description:** Radial New Tab is a calm, adaptive Microsoft Edge new tab that puts favorite websites around a personal clock and search. Add, edit, reorder, import, and export shortcuts; organize them into optional collections; import a selected Edge bookmarks folder with nested collections; and optionally add sites from Edge’s top sites list after permission. Choose a search provider, use Orbit or Smart Tiles, switch light and dark themes, and use Focus mode, keyboard navigation, and a local background image. Links and settings stay in Edge storage; Radial uses no analytics or own servers.

**Категория:** Productivity

## Разрешения

- `storage` — сохраняет и синхронизирует ссылки и настройки;
- `favicon` — показывает значки добавленных пользователем сайтов;
- `search` — передаёт поисковый запрос выбранному провайдеру через API браузера;
- `topSites` (опционально) — добавляет часто посещаемые сайты только после отдельного включения функции;
- `bookmarks` (опционально) — читает выбранную пользователем папку закладок для импорта ссылок и структуры коллекций; разрешение запрашивается только при запуске импорта.

Расширение не запрашивает доступ к истории, содержимому страниц или вкладкам.

## Данные в Partner Center

- **Single purpose:** персональная новая вкладка Edge для управления часто используемыми ссылками и поиском.
- **Remote code:** No. Весь исполняемый код входит в ZIP; удалённые скрипты не загружаются и не выполняются.
- **Permission justifications:** `storage` — сохранение ссылок и настроек; `favicon` — отображение иконок сайтов; `search` — поиск через провайдера Edge; `topSites` — только включаемое автодобавление популярных сайтов; `bookmarks` — только выбранный пользователем импорт папки закладок.
- **Data usage:** не используем аналитику, рекламу, трекинг, собственные серверы или продажу данных; поисковый текст передаётся только выбранному поисковому провайдеру, а favicon-запросы могут обращаться к сайту ссылки и Google S2.
- **Privacy policy URL:** `https://github.com/Andival-Sei/radial-new-tab/blob/main/PRIVACY.md`.
- **Published Edge Store URL:** `https://microsoftedge.microsoft.com/addons/detail/radial-new-tab/khdibmeighcpgjlabojeidnhjflkdpkm`.

## Notes for certification

1. Установить ZIP и открыть новую вкладку Edge.
2. Проверить добавление, редактирование, удаление, перетаскивание и поиск ссылок.
3. В Settings проверить светлую/тёмную тему, язык, Orbit/Smart tiles, фоновое изображение, экспорт/импорт и Focus mode.
4. Для проверки `topSites`: включить **Add frequently visited sites**, разрешить доступ и убедиться, что сайты добавились; функция выключена по умолчанию.
5. Для проверки `bookmarks`: включить **Use collections**, нажать **Choose bookmark folder**, разрешить доступ, выбрать папку и проверить импорт вложенных папок как коллекций; функция выключена по умолчанию.
6. У расширения нет аккаунтов, серверной части и тестовых учётных данных.
