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

Эталонные платформы (`@tsclang/desktop`, `@tsclang/avr`, `@tsclang/wasm`,
`@tsclang/android`, `@tsclang/ios`)
поставляют тулчейны комплектом: `platform.toolchains.<name>.downloads`
в манифесте пакета указывает на бандлы в GitHub-релизах профильных репо
(`github.com/tsclang/platform-{desktop,avr,wasm,android,ios}/releases/download/<тег>/…`
— каждый пакет указывает в свою репу; mobile-ассет libuv задублирован
в platform-android и platform-ios — байты и sha идентичны),
CLI качает их по sha256 в `~/.tsclang/platforms/…` (#270). Тег = версия
матрицы бандлов: `toolchains-v1` (gcc/avr-gcc/avrdude/emcc 0.3.0 +
android ndk-clang 0.1.1 — полная матрица хостов), `toolchains-v2`
(desktop clang 0.4.0; + `libuv-1.53.0-mobile.tar.gz` #287 — один
хост-независимый mobile-ассет: `@tsclang/android` 0.2.0 берёт его из
platform-android `toolchains-v2`, `@tsclang/ios` 0.2.1 — из собственной
репы platform-ios `toolchains-v1`, те же байты).
Компилятор `@tsclang/ios` — по-прежнему Xcode CLT на macOS (Apple SDK не
редистрибутируем, #283); его бандл `libuv` нужен линковщику (`-luv` для
`--async libuv`), а не компилятору.

Матрица: `win32-x64`, `linux-x64`, `darwin-arm64` (+ `darwin-x64` у avrdude).
`darwin-x64` (Intel-маки) у clang/avr-gcc не покрыт: LLVM не публикует
x64-macOS-бинари (desktop → системный clang из Xcode CLT, #282 — единственное
честное исключение PATH-семантики), avr-gcc собирается только под arm64
(нет бесплатного x64-раннера) → brew-инструкция.

- **Сборка**: `node packages/registry/scripts/build-bundles.mjs [--only <тулчейн>] [--target <os-arch>]`
  — скачивает официальные дистрибутивы в `.tsclang-tmp/bundles/src/`,
  переупаковывает в наш layout (`bin/` верхним уровнем или плоский корень),
  кладёт `TSC_BUNDLE_NOTICE.txt` (источник + лицензия), пишет архив + sha256
  в `.tsclang-tmp/bundles/out/`. Posix-таргеты собираются CI профильных репо:
  exec-биты живут в метаданных tar — виндовый tar их не создаёт,
  зато кросс-архитектурная упаковка возможна (бинари не исполняются), поэтому
  одного arm64-раннера хватает на оба darwin-таргета.
- **Бандл из исходников (`--only libuv`, #287)** — первый бандл, который не
  переупаковывает чужие бинари: `buildLibuvMobile()` качает официальный
  `libuv-v1.53.0.tar.gz` + NDK r30 dmg и кросс-компилирует cmake (`Ninja`,
  `BUILD_SHARED_LIBS=OFF`) 5 слайсов — android arm64/x86_64
  (`ANDROID_PLATFORM=android-28` через toolchain-файл NDK; пол API 24→28 —
  bionic объявляет `posix_spawn` только с 28, а libuv v1.53 компилирует эти
  вызовы безусловно) и ios device/sim (только darwin-раннер: нужен Xcode).
  Layout без `bin/`: `include/` + `lib/<triple>/libuv.a`, где `<triple>` —
  ровно строки `--target`; плоский корень сам себе binDir
  (findIsolatedToolchain-контракт для бандлов без бинарей). Ассет заливается
  в ДВЕ репы: `toolchains-v2` platform-android и `toolchains-v1`
  platform-ios — один артефакт одной сборки, дублирование сознательное
  (каждый пакет указывает в свою репу; sha идентичны, обновление — обоими
  тегами одновременно).
- **Заливка**: релизы профильных репо (`gh release upload toolchains-v2 …`),
  файлы >100MB gh грузит через API сам; ассеты лимит 2GB (поэтому
  LLVM-таргеты пакуются в `.tar.xz`, остальные — `.tar.gz`; системный tar
  читает оба по суффиксу).
- **darwin NDK — `.dmg` готчи (#283)**: том монтируется `hdiutil attach` и
  копируется `cp -RL`. Симлинки внутри dmg (`bin/clang` → `…/bin/clang-21`
  и т.п.) АБСОЛЮТНЫЕ — указывают в точку монтирования, после `detach` они
  бы повисли. Node `cpSync({dereference:true})` такие ссылки НЕ
  разворачивает (проверено на CI darwin), BSD `cp -L` копирует цели как
  реальные файлы — бандл самодостаточен.
- **Обновление версии тулчейна**: поднять версии в `BUNDLES` скрипта,
  пересобрать, залить новым тегом (`toolchains-v2`, …), обновить
  `toolchains.downloads` в манифестах платформ и переопубликовать `.tspkg`.
  Перезаписывать ассеты существующего тега нельзя — sha256 у потребителей
  уже зафиксирован.
- **Источники и лицензии** — закреплены в `BUNDLES` скрипта (LLVM/Clang,
  llvm-mingw, Zak's avr-gcc, avrdude, emsdk wasm-binaries + emsdk python/node).
  Перед добавлением нового источника проверять право редистрибуции
  (GPL+exception ок; при сомнении — режим «инструкция», не бандл).
- **desktop = clang/LLVM (#282)**: единственный тулчейн платформы — `clang`,
  без gcc-алиасов. Posix — статически слинкованные портативные бинари
  upstream LLVM; win32 — llvm-mingw (Martin Storsjö build: LLVM + lld +
  mingw-w64 UCRT, единственный самодостаточный портативный Clang под
  Windows); версии совпадают по всем таргетам (LLVM 23.1.5).
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
