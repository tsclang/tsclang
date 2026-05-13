# Debug info

[← Вверх](./index.md) | [Следующий →](./optimization.md) | [Предыдущий ←](./name-mangling.md)

---

Отладка TSClang-приложений: от базовых `#line` директив до DAP-сервера с деманглингом.

## Механизм: `#line` директивы

TSClang компилирует `.tsc` → `.c`, затем C-компилятор генерирует бинарь с DWARF. Чтобы DWARF ссылался на исходные `.tsc` файлы, компилятор вставляет `#line` директивы:

```c
/* сгенерированный C — debug профиль */
#line 42 "src/main.tsc"
int32_t result = myapp_src_main_foo_i32(x);

#line 43 "src/main.tsc"
myapp_src_main_bar_string(msg);
```

C-компилятор видит `#line` → записывает в DWARF `src/main.tsc:42` вместо `main.c:17`. GDB, LLDB, OpenOCD читают DWARF и показывают `.tsc` строки. Работает на всех таргетах включая avr-gcc.

### Профили

`#line` эмитируется **только в debug** профиле:

```json
{ "profile": "debug" }    // #line включены
{ "profile": "release" }  // #line отсутствуют, -O2/-O3
```

## Конфигурация путей

`#line` содержит путь к `.tsc` файлу. Debugger должен его найти. Конфигурируется в `tsc.package.json`:

```json
{ "debugSourceRoot": "relative" }        // по умолчанию — относительно project root
{ "debugSourceRoot": "absolute" }        // абсолютный путь — для remote debugging
{ "debugSourceRoot": "/custom/path" }    // явный базовый путь
```

- `relative` — портабельные пути, подходит для desktop
- `absolute` — для embedded, где GDB-сервер (OpenOCD) на другой машине

## Что видит разработчик в debugger

Файл и строка — `.tsc`. Имена переменных и типы — C (DWARF описывает сгенерированный C):

```
(gdb) backtrace
#0  myapp_src_user_loadUsers () at src/user.tsc:15   ← .tsc строка ✅
#1  myapp_src_main_main ()       at src/main.tsc:8

(gdb) info locals
users = 0x20001234                                   ← C pointer
first = {name = {data = 0x20001250, len = 5}, age = 30}  ← C struct layout
```

### Closure

```
_Closure_42 = {ctx = {id = 1, name = ...}}
```

### Async state machine

```
_FetchUser_state = {_state = 1, id = 42, resp = ...}
// _state = 1 означает «после первого await»
```

### Mangled names

Функции видны с C-именами. Деманглер встроен в `tsclang debug --dap`.

## Embedded (OpenOCD / SWD)

OpenOCD использует GDB-протокол → читает DWARF → `#line` работает без дополнительной настройки. Рекомендуется `"debugSourceRoot": "absolute"` для embedded проектов.

## `tsclang debug --dap` — улучшенный debugging

DAP-сервер (Debug Adapter Protocol) сидит между IDE и GDB/OpenOCD и трансформирует ответы:

```
IDE (VS Code / любая DAP-совместимая)
    ↕  DAP protocol
tsclang debug --dap          ← TSClang DAP server
    ↕  GDB MI protocol
GDB / LLDB / OpenOCD
```

### Сравнение

| Без DAP-сервера | С `tsclang debug --dap` |
|-----------------|------------------------|
| `myapp_src_user_User_getName` | `User.getName()` |
| `_Closure_42 = {ctx = ...}` | `[ctx](x) => ... = {ctx = ...}` |
| `_FetchUser_state._state = 1` | `fetchUser — после первого await` |
| C struct layout | TSClang типы с оригинальными именами полей |

### Запуск

```bash
tsclang debug --dap --port 4711             # desktop: GDB под капотом
tsclang debug --dap --openocd --port 4711   # embedded: OpenOCD под капотом
```

VS Code подключается к порту 4711 через стандартный DAP. Отдельного расширения не нужно.

## Ограничения

| Что | Статус |
|-----|--------|
| Файл и строка в debugger | ✅ через `#line` |
| TSClang имена с DAP-сервером | ✅ через `tsclang debug --dap` |
| Колонки | ❌ `#line` не поддерживает |
| TSClang типы без DAP-сервера | ❌ видны C-типы |
| Embedded (avr-gcc + OpenOCD) | ✅ работает |

## C-output

Debug-профиль:

```c
// build/desktop/c/main.c
#include <stdint.h>
#include "runtime.h"

#line 5 "src/main.tsc"
int32_t myapp_src_main_add_i32_i32(int32_t a, int32_t b) {
#line 6 "src/main.tsc"
    return a + b;
}
```

Release-профиль — `#line` отсутствуют:

```c
int32_t myapp_src_main_add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `source file not found: src/main.tsc` | Debugger не может найти `.tsc` файл по пути из `#line` |
| `DAP connection refused` | DAP-сервер не запущен или порт занят |

## См. также

- [Name mangling](./name-mangling.md) — схема кодирования, деманглинг
- [Оптимизация](./optimization.md) — уровни debug/release
- [Embedded-сборка](../09-build/embedded.md) — AVR, OpenOCD, SWD
- [Конфигурация](../09-build/config.md) — `debugSourceRoot`, профили
