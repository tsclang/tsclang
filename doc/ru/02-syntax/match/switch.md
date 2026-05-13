# switch

[← Вверх](./index.md) | [Следующий →](./syntax.md)

---

Оператор `switch` — ветвление по значению. Аналог JavaScript/TypeScript, но с ключевым отличием: **неявный fallthrough запрещён** — отсутствие `break` или `return` в непустом `case` вызывает ошибку компиляции.

## Синтаксис

```typescript
switch (выражение) {
    case значение1:
        // тело
        break;
    case значение2:
        // тело
        break;
    default:
        // тело
}
```

## Правила

- **`break` или `return` обязателен** в каждом непустом `case`-блоке.
- **Группировка пустых case** разрешена — несколько `case` подряд перед общим телом.
- **`default`** необязателен.
- Компилятор **предупреждает** (warning), если switch по enum не покрывает все значения.
- Работает с типами: **numeric** (`i8`..`i64`, `u8`..`u64`), **string**, **boolean**, **enum**.
- **Float запрещён** — `switch` по `f32`/`f64` вызывает ошибку компиляции.

## Примеры

### Базовый switch

```typescript
let x: i32 = 2;
switch (x) {
    case 1:
        console.log("one");
        break;
    case 2:
        console.log("two");
        break;
    case 3:
        console.log("three");
        break;
    default:
        console.log("other");
}
```

C-output:

```c
int32_t x = 2;
switch (x) {
    case 1:
        printf("one\n");
        break;
    case 2:
        printf("two\n");
        break;
    case 3:
        printf("three\n");
        break;
    default:
        printf("other\n");
}
```

Вывод: `two`

### Группировка case

Пустые `case` без тела группируются — это единственная разрешённая форма fallthrough:

```typescript
let x: i32 = 1;
switch (x) {
    case 1:
    case 2:
        console.log("one-or-two");
        break;
    default:
        console.log("other");
}
```

C-output:

```c
switch (x) {
    case 1:
    case 2:
        printf("one-or-two\n");
        break;
    default:
        printf("other\n");
}
```

Вывод: `one-or-two`

### Switch по enum

```typescript
enum Dir { North, South }
const d: Dir = Dir.South;
switch (d) {
    case Dir.North:
        console.log("N");
        break;
    case Dir.South:
        console.log("S");
        break;
}
```

C-output:

```c
typedef enum { Dir_North = 0, Dir_South = 1 } Dir;

Dir d = Dir_South;
switch (d) {
    case Dir_North:
        printf("N\n");
        break;
    case Dir_South:
        printf("S\n");
        break;
}
```

Вывод: `S`

Если enum покрыт полностью — предупреждения нет. Если не все значения перечислены — компилятор выдаёт **warning**.

### Switch по string literal union

```typescript
type Dir = "north" | "south";
const d: Dir = "south";
switch (d) {
    case "north":
        console.log("N");
        break;
    case "south":
        console.log("S");
        break;
}
```

C-output — string literal union компилируется в C-enum, switch по нему эффективен:

```c
typedef enum { Dir_north, Dir_south } Dir;

const Dir d = Dir_south;
switch (d) {
    case Dir_north:
        printf("N\n");
        break;
    case Dir_south:
        printf("S\n");
        break;
}
```

### Switch без default

Если `default` отсутствует и ни один `case` не совпал — выполнение продолжается после switch:

```typescript
let x: i32 = 99;
switch (x) {
    case 1:
        console.log("one");
        break;
}
// x == 99 — ничего не выведется
```

## Ошибки

### Implicit fallthrough

```typescript
let x: i32 = 1;
switch (x) {
    case 1:
        console.log("one");
        // ошибка: нет break
    case 2:
        console.log("two");
        break;
}
```

```
implicit fallthrough
input.tsc:4
```

### Switch по float

```typescript
let x: f64 = 1.0;
switch (x) {
    case 1.0:
        console.log("one");
        break;
}
```

```
cannot switch on type 'f64'
input.tsc:2
```

## См. также

- [match](./syntax.md) — выражение с pattern matching и exhaustiveness check
- [Enum](../../03-types/enum.md) — перечисления
- [break / continue](../loops/break-continue.md) — управление потоком в циклах и switch
