# Управление Edge Add-ons через API и MCP

## Что можно автоматизировать

Пакет расширения, отправка на сертификацию и чтение состояния операций доступны через Microsoft Publish API. Они запускаются из GitHub Actions; `EDGE_API_KEY` остаётся в GitHub Secrets. Для описаний, скриншотов и рекламных плиток у Microsoft нет публичного Publish API: для них используется браузерный MCP и авторизованный Edge в Partner Center.

Маршрут для следующих задач зафиксирован в корневом `AGENTS.md`. Если подключённый GitHub MCP не умеет dispatch или создание релиза, авторизованный `gh` обращается к тем же GitHub REST endpoints.

## Проверка доступа и чтение статуса

Без загрузки пакета и без изменения текущей отправки:

```powershell
gh workflow run edge-api-check.yml --ref main
gh run list --workflow edge-api-check.yml --limit 1
gh run view RUN_ID
```

Статус известной операции отправки:

```powershell
gh workflow run edge-api-check.yml --ref main -f operation_id=UUID -f stage=submission
```

Для операции загрузки ZIP используйте `-f stage=upload`. Результат хранится в artifact `edge-api-check`, файл `edge-api-check.json`. Проверка выполняет только документированный GET и не создаёт новых отправок. Состояние операции `Succeeded` подтверждает завершение операции отправки, а не одобрение магазина.

По умолчанию используется `EDGE_PROBE_OPERATION_ID` — ID заведомо существующей операции. При 404 проверьте ID и при необходимости замените его ID из последнего успешного artifact `edge-publication-status`: удалённая старая операция не означает, что ключ истёк.

## Новый выпуск

1. Обновить версии `package.json` и `public/manifest.json`, описание выпуска и актуальные материалы карточки.
2. Проверить доступ командой выше. При ожидающих изменениях карточки обновить её через браузерный MCP до отправки.
3. Пройти проверки проекта, закоммитить и отправить изменения.
4. Создать тег `v` + версия и обычный GitHub Release. Предрелизы не публикуются в Edge.
5. `.github/workflows/release.yml` проверяет код и расширение на Windows, собирает ZIP, проверяет доступ API, прикрепляет ZIP к GitHub Release и отправляет пакет на сертификацию.
6. Проверить jobs и artifact `edge-publication-status`. Не завершать работу только по факту запуска workflow.

Примечания тестировщику берутся из `docs/edge-store/certification-notes.txt`; `{{version}}` заменяется версией package.json. Их нужно обновлять вместе с поведением расширения. Новые описания и изображения хранятся рядом.

## Ключ и конфигурация

В GitHub используются:

- secret `EDGE_API_KEY`;
- variables `EDGE_CLIENT_ID`, `EDGE_PRODUCT_ID`, `EDGE_PROBE_OPERATION_ID`;
- variable `EDGE_API_KEY_EXPIRES_AT` в формате YYYY-MM-DD для раннего предупреждения об истечении.

Истёкший ключ обновляется в `https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi`. Английская страница предпочтительна: в русской локализации замечен пустой диалог Renew. Смена учётных данных требует ручного подтверждения владельца по правилам браузерного инструмента. После обновления ключ показывается только один раз.

Скопировать новый ключ кнопкой страницы и сохранить его в существующий GitHub secret без аргумента командной строки и без файла:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-edge-api-key.ps1 -ExpiresAt YYYY-MM-DD
```

Скрипт читает ключ из буфера обмена, передаёт его `gh secret set` через stdin и очищает буфер. Он не печатает ключ и не записывает его в репозиторий или локальный файл. Не вставлять ключ в чат, issue, release notes или `.env`. После обновления выполнить read-only workflow проверки.

API-ключи Microsoft имеют срок действия; бессрочный доступ не гарантируется. Проверка перед выпуском предупреждает за 14 дней и останавливает отправку при известном истечении или отказе API.

## Ошибки и безопасное продолжение

- 401: проверить срок ключа и обновить GitHub secret после продления.
- 403: проверить Client ID и доступ к продукту.
- 404 при GET: проверить product/operation ID и доступность старой операции.
- Таймаут, сетевой сбой или неизвестный результат POST: сначала проверить записанный operation ID либо кабинет. POST автоматически не повторяется.

При любой ошибке CLI сохраняет контролируемую диагностику в JSON, включая HTTP-код, без ключа, заголовков и необработанных тел ошибок. Artifact создаётся и для отказа авторизации до загрузки ZIP.

## Выпуск 0.3.1

16 ноября 2026 года пакет прошёл Windows CI, но автоматическая загрузка получила 401. В Partner Center подтверждено истечение `Key_1` в этот день. Пакет и обновлённые карточки отправлены через кабинет; статус «Проверяется». Этот выпуск повторно не отправлять. Для проверки заменённого ключа использовать `edge-api-check.yml`.

Источники: [Microsoft Publish API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api), [справочник API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference), [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
