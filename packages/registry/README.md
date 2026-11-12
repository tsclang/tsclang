# packages/registry — реестр платформ v1

JSON-каталог (спека `13-build.md` → «Реестр»). CLI забирает его с
`raw.githubusercontent.com/tsclang/tsclang/develop/packages/registry/catalog.json`
(`DEFAULT_CATALOG_URL` в `packages/pm/src/platform-registry.ts`; живёт в
`develop`, пока не налажен релизный поток в `main`); архивы
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

Записи становятся доступны «чистым машинам», когда `develop` получает коммит
(каталог и архивы едут в одну ветку; после запуска релизного потока в `main`
каталог переезжает туда вместе с `DEFAULT_CATALOG_URL`).

## Бандлы тулчейнов (#278)

Эталонные платформы (`@tsclang/desktop`, `@tsclang/avr`, `@tsclang/wasm`)
поставляют тулчейны комплектом: `platform.toolchains.<name>.downloads`
в манифесте пакета указывает на бандлы в GitHub-релизах профильных репо
(`github.com/tsclang/platform-{desktop,avr,wasm}/releases/download/toolchains-v1/…`),
CLI качает их по sha256 в `~/.tsclang/platforms/…` (#270).

Матрица v1: `win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`.
`darwin-x64` (Intel-маки) — неполный: LLVM не публикует x64-macOS-бинари
(desktop → системный clang из Xcode CLT), avr-gcc собирается только под
arm64 (нет бесплатного x64-раннера) → brew-инструкция.

- **Сборка**: `node packages/registry/scripts/build-bundles.mjs [--only <тулчейн>] [--target <os-arch>]`
  — скачивает официальные дистрибутивы в `.tsclang-tmp/bundles/src/`,
  переупаковывает в наш layout (`bin/` верхним уровнем или плоский корень),
  кладёт `TSC_BUNDLE_NOTICE.txt` (источник + лицензия), пишет архив + sha256
  в `.tsclang-tmp/bundles/out/`. Posix-таргеты собираются CI профильных репо:
  exec-биты и симлинки живут в метаданных tar — виндовый tar их не создаёт,
  зато кросс-архитектурная упаковка возможна (бинари не исполняются), поэтому
  одного arm64-раннера хватает на оба darwin-таргета.
- **Заливка**: релизы профильных репо (`gh release upload toolchains-v1 …`),
  файлы >100MB gh грузит через API сам; ассеты лимит 2GB (поэтому
  LLVM-таргеты пакуются в `.tar.xz`, остальные — `.tar.gz`; системный tar
  читает оба по суффиксу).
- **Обновление версии тулчейна**: поднять версии в `BUNDLES` скрипта,
  пересобрать, залить новым тегом (`toolchains-v2`, …), обновить
  `toolchains.downloads` в манифестах платформ и переопубликовать `.tspkg`.
  Перезаписывать ассеты существующего тега нельзя — sha256 у потребителей
  уже зафиксирован.
- **Источники и лицензии** — закреплены в `BUNDLES` скрипта (WinLibs GCC,
  LLVM/Clang, Zak's avr-gcc, avrdude, emsdk wasm-binaries + emsdk python/node).
  Перед добавлением нового источника проверять право редистрибуции
  (GPL+exception ок; при сомнении — режим «инструкция», не бандл).
- **desktop posix = LLVM/Clang**: upstream GCC не публикует портативные
  linux/macOS-бинари, LLVM — публикует (статически слинкованные); `bin/gcc`,
  `bin/g++`, `bin/cc` — симлинки на `clang`/`clang++`, имя тулчейна `gcc`
  сохраняется на всех платформах.
- **emcc-бандл композитный**: голой wasm-binaries недостаточно (win-екшничке
  pylauncher нужен python на PATH, конфигу — node), поэтому бандл включает
  portable-python (win/mac; на linux upstream-подход — системный python3) и
  node из deps-бакета emsdk, relocatable `.emscripten` (пути через `__file__`)
  и shim: win — `bin/emcc.exe`+`bin/emcc.py` (runpy на настоящий `emcc.py`,
  чьи `tools.*`-импорты относительные), posix — wrapper-скрипт `bin/emcc`,
  предпочитающий бандловый python.
- **Сборки из исходников** (нет upstream-бинарей): darwin-arm64 avr-gcc
  (binutils+gcc+avr-libc, C-only) и darwin-arm64 avrdude — CI репо
  `platform-avr` (скрипты в нём же); их версии зафиксированы в скриптах,
  а не в `BUNDLES` здесь.
