# Автопубликация Edge Add-ons

Публикация обычного GitHub Release с тегом `v` + версия package.json запускает `.github/workflows/release.yml`. Предрелизы пропускаются.

1. Windows runner устанавливает зависимости из lockfile, проверяет типы, lint, unit-тесты и браузерные сценарии.
2. `pnpm package` проверяет manifest и собирает ZIP. Проверенный ZIP прикрепляется к GitHub Release.
3. Publish API загружает ZIP в существующий продукт, ожидает завершения загрузки и отправляет обновление на сертификацию.
4. После одобрения Microsoft магазин распространяет обновление установленным из магазина копиям. Распакованные dev-копии так не обновляются.

В GitHub настроены secret `EDGE_API_KEY` и variables `EDGE_CLIENT_ID`, `EDGE_PRODUCT_ID`. Ключ никогда не должен попадать в репозиторий. При ротации обновите GitHub secret.

Результат API сохраняется в artifact `edge-publication-status`. Успешная отправка не равна одобрению магазина. При ошибке сначала проверьте Partner Center и записанный operation ID: повторный запуск может создать повторную попытку отправки. POST-запросы автоматически не повторяются.

Описание и изображения карточки не обновляются этим API: их редактируют отдельно в Partner Center.

Источники: [Microsoft Publish API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference), [настройка API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api).
