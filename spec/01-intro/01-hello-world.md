# Hello World

```typescript
console.log("Hello, TSClang!")
```

Компиляция и запуск:

```bash
tsclang build hello.tsc --outDir out/
cd out && cmake --build . && ./hello
# → Hello, TSClang!
```

Упрощённый вариант (одна команда):

```bash
tsclang run hello.tsc
# → Hello, TSClang!
```

## Для разработчиков

Запуск из исходников (без установки):

```bash
npx tsx src/index.ts run hello.tsc
```

Сборка и запуск из dist:

```bash
node dist/index.js run hello.tsc
```

Глобальная установка (после `npm run build`):

```bash
npm link
tsclang run hello.tsc
```

### Windows: сборка через cmake

Требуется gcc в PATH (например, из MSYS2: `C:/msys64/mingw64/bin`).

```bash
node dist/index.js build hello.tsc --outDir out/
cmake -G "MinGW Makefiles" -DCMAKE_C_COMPILER="C:/msys64/mingw64/bin/gcc.exe" -B out/build out/
cmake --build out/build
```

### Windows: сборка через cmake (Visual Studio)

cmake автоматически находит Visual Studio:

```bash
node dist/index.js build hello.tsc --outDir out/
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
