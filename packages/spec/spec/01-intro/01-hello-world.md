# Hello World

> Spec status: verified @ 4ad8489d · 2026-10-31 · #205

```typescript
console.log("Hello, TSClang!")
```

Компиляция и запуск:

```bash
tsclang build hello.tsc --outDir out/
cmake -B out/build out/ && cmake --build out/build
./out/build/hello
# → Hello, TSClang!
```

`tsclang build` генерирует `.c` + `CMakeLists.txt`, но не запускает cmake — configure нужно выполнить вручную (на Windows с Visual Studio бинарник окажется в `out/build/Debug/`, см. ниже).

Упрощённый вариант (одна команда):

```bash
tsclang run hello.tsc
# → Hello, TSClang!
```

## Для разработчиков

Запуск из исходников (без установки):

```bash
pnpm build
node packages/cli/dist/index.js run hello.tsc
```

Глобальная установка:

```bash
pnpm link --global
tsclang run hello.tsc
```

### Windows: сборка через cmake

Требуется gcc в PATH (например, из MSYS2: `C:/msys64/mingw64/bin`).

```bash
node packages/cli/dist/index.js build hello.tsc --outDir out/
cmake -G "MinGW Makefiles" -DCMAKE_C_COMPILER="C:/msys64/mingw64/bin/gcc.exe" -B out/build out/
cmake --build out/build
```

### Windows: сборка через cmake (Visual Studio)

cmake автоматически находит Visual Studio:

```bash
node packages/cli/dist/index.js build hello.tsc --outDir out/
cmake -B out/build out/
```

Сборка в режиме Debug (по-умолчанию):

```bash
cmake --build out/build
```

Бинарник: out/build/Debug/hello.exe

Сборка в режиме Release:

```bash
cmake --build out/build --config Release
```

Бинарник: out/build/Release/hello.exe
