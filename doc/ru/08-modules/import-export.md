# Импорт / экспорт

[← Вверх](./index.md) | [Следующий →](./d-tsc.md) | [Предыдущий ←](./index.md)

---

Модульная система TSClang совместима с TypeScript по синтаксису. Только именованные экспорты, два вида импорта, автоматическая генерация `#include` и forward declarations.

## Named export

Все экспортируемые сущности помечаются `export`:

```typescript
export class User {
    name: string
    constructor(name: string) { this.name = name }
}

export interface Drawable { draw(): void }
export type UserId = i32
export type Nullable<T> = T | null
export function helper(): void { /* ... */ }
export const MAX: i32 = 100
```

### Реэкспорт

```typescript
export { User, helper } from "./user"
```

### Запрет export default

`export default` **запрещён** — осознанный разрыв с TypeScript. Причина: C требует явного имени для каждого символа, анонимные и default-экспорты не имеют имени для кодогенерации.

```typescript
export default class UserService { }    // ❌ — default запрещён
export default { x: 1, y: 2 }          // ❌ — нет имени для C-символа
export default function() { /* ... */ } // ❌ — анонимная функция без имени
```

## Named import

Импорт конкретных символов из модуля:

```typescript
import { User, createUser } from "./user"
```

### Namespace import

Весь модуль как объект — аналог `import * as X` из TypeScript:

```typescript
import User from "./user"    // все экспорты доступны через User.X

const u = new User.UserService()
User.getUser()
```

> **Осознанный разрыв с TS:** в TypeScript `import X from "./module"` означает default-импорт. В TSClang это namespace-импорт всего модуля. Default-экспортов нет, поэтому переопределение семантики не создаёт конфликта.

### import type

Только compile-time, генерирует forward declaration в C вместо полного `#include`:

```typescript
import type { UserId, Drawable } from "./user"
```

Позволяет избежать лишних `#include` в C-output:

```c
// import { User } → #include "user.h"
// import type { UserId } → typedef int32_t UserId;  // или forward declaration
```

## Порядок инициализации модулей

Каждый модуль с module-level переменными получает функцию `_init()`. Порядок вызовов определяется **топологической сортировкой** графа импортов:

```c
static void tsc_init_all() {
    a_type_init();  // нет зависимостей — первый
    bar_init();     // зависит от a_type
    foo_init();     // зависит от a_type и bar
}

int main() {
    tsc_init_all();
    // ... код пользователя
}
```

## Циклические импорты

Два случая:

| Ситуация | Результат |
|----------|-----------|
| Цикл через типы и функции | ✅ Разрешён — компилятор генерирует forward declarations в `.h` |
| Цикл через module-level переменные | ❌ Ошибка — физически неразрешимо |

```typescript
// a.tsc
const aVal = bFunc()   // нужен b

// b.tsc
const bVal = aFunc()   // нужен a — кто инициализируется первым?
```

```
error: circular initialization dependency detected
  src/a.tsc:2  aValue depends on bValue
  src/b.tsc:2  bValue depends on aValue
hint: move one of these values into a function
```

## Module-level переменные

Переменные вне функций и классов — module-level. Компилируются в статическую память C.

```typescript
const MAX_CONNECTIONS: i32 = 100      // compile-time constant
let requestCount: i32 = 0             // mutable global
const defaultUser = new User("guest") // owned, инициализация при старте
```

| TSClang | C | Инициализация |
|---------|---|---------------|
| `const x: i32 = 5` | `static const int32_t x = 5` | compile-time |
| `let x: i32 = 0` | `static int32_t x = 0` | compile-time |
| `const arr: i32[4] = [...]` | `static int32_t arr[4] = {...}` | compile-time |
| `const x = new Foo()` | `static Foo* x = NULL` | в `_init()` при старте |

### Thread safety

Мутабельный `let` на уровне модуля небезопасен для многопоточного доступа — ошибка компилятора если `Thread.spawn` захватывает такую переменную:

```typescript
let counter = 0                     // ❌ ошибка если Thread.spawn захватывает
const counter = new Atomic<i32>(0)  // ✅ thread-safe
```

### heap: false платформы

Module-level owned объекты (`new`, `Shared<T>`) запрещены — нет heap:

```typescript
// AVR (heap: false)
const config = new Config()         // ❌ heap allocation запрещён
const config: Config = { ... }      // ✅ value type — статическая память
const buf: u8[256] = [0, ...]       // ✅ фиксированный массив — статическая память
```

## Path Aliases

Короткие имена для путей вместо `../../..`:

```typescript
// Без aliases
import { utils } from "../../../shared/utils"

// С aliases
import { utils } from "#shared/utils"
```

### Символы для aliases

`@` зарезервирован для scopes пакетного реестра. Для aliases используются `#` или `~`:

| Символ | Назначение | Пример |
|--------|------------|--------|
| `@` | Scopes реестра | `@mycompany/mylib`, `@tsc/sqlite3` |
| `#` | Path aliases (рекомендуется) | `#/components/Button`, `#shared/utils` |
| `~` | Path aliases (альтернатива) | `~/components/Button` |

### Конфигурация

В `tsc.package.json`, поле `paths`:

```json
{
    "paths": {
        "#/*": ["./src/*"],
        "#shared/*": ["./src/shared/*"],
        "#ui/*": ["./src/components/ui/*"]
    }
}
```

### Wildcard `*`

`*` в ключе заменяется на совпавшую часть в значении (только один `*` на alias):

```typescript
import { Button } from "#components/Button"      // → ./src/components/Button
import { Input } from "#components/forms/Input"   // → ./src/components/forms/Input
```

### Предупреждение о прямых aliases

Прямые aliases без префикса могут конфликтовать со stdlib:

```json
{
    "paths": {
        "io/*": ["./src/io/*"]
    }
}
```

При прямом alias `io/*` импорт `import ... from "io"` резолвится в alias, а не в `std/io`. При прямых aliases всегда используйте явный `std/` для stdlib.

## Точка входа

Определяется полем `"main"` в `tsc.package.json`:

```json
{ "name": "myapp", "main": "src/main.tsc" }
```

Несколько точек входа — через `builds`:

```json
{
    "builds": {
        "server": { "main": "src/server.tsc" },
        "cli":    { "main": "src/cli.tsc" }
    }
}
```

`index.tsc`, `main.tsc` и др. **не являются** специальными именами.

## Библиотеки

```json
{ "name": "mylib", "type": "library" }
```

Поле `"type": "library"` — компилятор генерирует `.h`-файлы и `.a`/`.so` без `main()`. Рекомендуется размещать декларации в корне: `index.d.tsc`.

## C-output

```typescript
import { User } from "./user"
const u = new User("Alice")
console.log(u.name)
```

```c
#include "user.h"

int main(void) {
    tsc_init_all();
    User u = {0};
    User_init(&u, STR_LIT("Alice"));
    printf("%s\n", u.name.data);
    User_free(&u);
    return 0;
}
```

`import type` не генерирует `#include`, только forward declaration:

```typescript
import type { UserId } from "./user"
export function get(id: UserId): void { /* ... */ }
```

```c
typedef int32_t UserId;
void get(UserId id) { /* ... */ }
```

## Ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `export default is not allowed` | Default-экспорт запрещён | Используйте named export |
| `cannot determine entry point` | Нет поля `"main"` | Добавьте `"main": "src/main.tsc"` |
| `main file not found` | Файл не существует | Проверьте путь |
| `circular initialization dependency detected` | Цикл module-level переменных | Перенесите одну в функцию |
| `User не является Scalar` | Нескалярный тип в variadic C-функции | Оберните или используйте другой тип |

## См. также

- [.d.tsc файлы](./d-tsc.md) — декларации для C interop
- [native — inline C](./native.md) — вербатимная вставка C-кода
- [@platform — условная компиляция](./platform.md) — платформозависимые реализации
- [Переменные: let / const](../02-syntax/variables/index.md) — module-level переменные
- [Конкурентность](../07-concurrency/index.md) — thread-safety для глобальных переменных
