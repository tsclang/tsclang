# packages/registry — реестр платформ v1

JSON-каталог (спека `13-build.md` → «Реестр»). CLI забирает его с
`raw.githubusercontent.com/tsclang/tsclang/main/packages/registry/catalog.json`
(`DEFAULT_CATALOG_URL` в `packages/pm/src/platform-registry.ts`); архивы
пакетов лежат рядом в `archives/`.

## Как добавить/обновить платформу

1. Поправить пакет в `packages/platforms/<имя>/` (манифест + `index.d.tsc`).
2. Опубликовать архив publish-механикой и положить его в `archives/`:
   ```bash
   cd packages/platforms/<имя>
   node ../../cli/dist/index.js publish
   mv "@tsclang-<имя>-<версия>.tspkg" ../../registry/archives/
   ```
3. Пересчитать sha256 (той же кодировкой, что проверяет CLI — utf8-текст):
   ```bash
   node -e "const{createHash}=require('crypto');const fs=require('fs');\
   console.log(createHash('sha256').update(fs.readFileSync(\
   'packages/registry/archives/@tsclang-<имя>-<версия>.tspkg','utf8'),'utf8').digest('hex'))"
   ```
4. Обновить запись в `catalog.json` (version + sha256) тем же коммитом.
   Тест `reference-platform.test.ts` (сьют 13-build/platform) держит
   каталог и архив в синхроне: sha, состав архива, совпадение с исходником.

Записи становятся доступны «чистым машинам», когда `main` получает коммит
(каталог и архивы едут в одну ветку).
