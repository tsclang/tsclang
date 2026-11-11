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

## Бандлы тулчейнов (#278)

Эталонные платформы (`@tsclang/desktop`, `@tsclang/avr`, `@tsclang/wasm`)
поставляют тулчейны комплектом: `platform.toolchains.<name>.downloads`
в манифесте пакета указывает на бандлы в GitHub-релизах нашего репо
(`https://github.com/tsclang/tsclang/releases/download/toolchains-v1/…`),
CLI качает их по sha256 в `~/.tsclang/platforms/…` (#270).

- **Сборка**: `node packages/registry/scripts/build-bundles.mjs [--only <тулчейн>]` —
  скачивает официальные дистрибутивы в `.tsclang-tmp/bundles/src/`, переупаковывает
  в наш layout (`bin/` верхним уровнем или плоский корень), кладёт
  `TSC_BUNDLE_NOTICE.txt` (источник + лицензия), пишет `.tar.gz` + sha256
  в `.tsclang-tmp/bundles/out/`.
- **Заливка**: `gh release create toolchains-v1 … .tsclang-tmp/bundles/out/*.tar.gz`
  (файлы >100MB грузятся через API — gh делает это сам; ассеты лимит 2GB).
- **Обновление версии тулчейна**: поднять версии в `BUNDLES` скрипта,
  пересобрать, залить новым тегом (`toolchains-v2`, …), обновить
  `toolchains.downloads` в манифестах платформ и переопубликовать `.tspkg`.
  Перезаписывать ассеты существующего тега нельзя — sha256 у потребителей
  уже зафиксирован.
- **Источники и лицензии** — закреплены в `BUNDLES` скрипта (WinLibs GCC,
  Zak's avr-gcc, avrdude, emsdk wasm-binaries + emsdk python/node).
  Перед добавлением нового источника проверять право редистрибуции
  (GPL+exception ок; при сомнении — режим «инструкция», не бандл).
- **emcc-бандл композитный**: голый `wasm-binaries.zip` несамодостаточен
  (pylauncher-екшничку нужен python на PATH, конфигу — node), поэтому бандл
  включает portable-python и node из deps-бакета emsdk, relocatable
  `.emscripten` (пути через `__file__`) и shim `bin/emcc.py` (runpy на
  настоящий `emcc.py`, чьи `tools.*`-импорты относительные).
- **v1 — только win32-x64**; posix-платформы получают инструкцию по
  системным пакетным менеджерам (`decideToolchain` → `instruct`).

