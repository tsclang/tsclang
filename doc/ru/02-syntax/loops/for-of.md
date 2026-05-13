# Цикл for-of

[← Вверх](./index.md) | [Следующий →](./while.md) | [Предыдущий ←](./for.md)

---

Цикл `for-of` итерирует по элементам коллекции: массивам, строкам, Map, Set и пользовательским `Iterable<T>`. Тип loop-переменной определяется её объявлением (`const`/`let`), а не источником.

## Синтаксис

```typescript
for (const item of iterable) { /* ... */ }
for (let item of iterable) { /* ... */ }
```

## Базовый пример: массив примитивов

```typescript
const arr: i32[] = [1, 2, 3];
for (const item of arr) {
    console.log(item);
}
```

### C-output

```c
int32_t _lit_0[] = {1, 2, 3};
const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
    const int32_t item = arr.data[_i_0];
    printf("%d\n", item);
}
```

`for-of` по массиву компилируется в индексный цикл `for (size_t _i = 0; _i < arr.length; _i++)`.

## let / const и ownership

Поведение loop-переменной зависит от `const`/`let` и типа элементов:

| Объявление | Примитивы | Сложные типы |
|------------|-----------|--------------|
| `for (const item of ...)` | Copy | `Ref<T>` (только чтение) |
| `for (let item of ...)` | Copy (мутабельная) | `Mut<T>`, только если источник `let` |

### const — Ref для сложных типов

```typescript
const arr = [obj1, obj2, obj3];
for (const item of arr) {    // ok — item: Ref<Obj>
    item.doSomething();       // ok — read-only method
    item.mutMethod();         // error — item is Ref, cannot call mut methods
}
```

`const`-переменная даёт `Ref<T>`: можно читать, но нельзя вызывать `mut`-методы или передавать как `Mut<T>`.

### let — Mut для сложных типов (только если источник let)

```typescript
let arr = [obj1, obj2, obj3];
for (let item of arr) {      // ok — item: Mut<Obj>
    item.mutMethod();         // ok — changes affect arr[i]
    arr.push(obj4);           // error — arr is borrowed during iteration
}
```

`let`-переменная даёт `Mut<T>`, но **только если источник тоже `let`**. Итерация заимствует (`borrow`) массив на время цикла — модификация массива внутри тела запрещена.

### let из const — ошибка

```typescript
const arr = [obj1, obj2, obj3];
for (let item of arr) { }    // error: cannot create Mut<T> from const source
```

Нельзя получить `Mut<T>` из `const`-источника — это нарушило бы guarantee иммутабельности.

### Примитивы всегда копируются

Для примитивных типов (`i32`, `f64`, `bool`, …) `const`/`let` влияет только на возможность переприсвоения loop-переменной, но не на ownership:

```typescript
let arr: i32[] = [10, 20, 30];
for (let item of arr) {
    item = item + 1;       // ok — item is a mutable copy
    console.log(item);
}
```

### C-output (примитивы)

```c
Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
    int32_t item = arr.data[_i_0];
    item = item + 1;
    printf("%d\n", item);
}
```

## Переприсвоение loop-переменной

Переприсвоение `item` в `for-of` для сложных типов — всегда ошибка (loop-переменная — это ссылка на элемент массива):

```typescript
for (const item of arr) {
    item = otherObj;    // error: cannot reassign for-of variable
}
```

Для примитивов `let` позволяет переприсвоить локальную копию (не влияет на массив).

## Итерация по строке

`for-of` по строке итерирует по **байтам** (char). Для code points и graphemes используйте `.codePoints()` и `.graphemes()`.

```typescript
const s: string = "hello";
for (const ch of s) {
    console.log(ch);
}
```

### C-output

```c
const String s = STR_LIT("hello");
for (size_t _i_0 = 0; _i_0 < s.length; _i_0++) {
    const char ch = s.data[_i_0];
    printf("%c\n", ch);
}
```

## Деструктуризация: Map.entries()

```typescript
let m = new Map<string, i32>();
m.set("x", 10);
m.set("y", 20);
for (const [k, v] of m.entries()) {
    console.log(k);
    console.log(v);
}
```

### C-output

```c
Array_MapEntry_string_i32 _entries_0 = tsc_map_entries_string_i32(&m);
for (size_t _i_0 = 0; _i_0 < _entries_0.length; _i_0++) {
    const String k = _entries_0.data[_i_0].key;
    const int32_t v = _entries_0.data[_i_0].value;
    printf("%s\n", k.data);
    printf("%d\n", v);
}
```

Компилятор создаёт структуру `MapEntry<K, V>` и разворачивает поля `.key` / `.value` в отдельные переменные.

## Итерация по Set

```typescript
let s = new Set<i32>();
s.add(10);
s.add(20);
for (const v of s) {
    console.log(v);
}
```

### C-output

```c
for (size_t _i_0 = 0; _i_0 < s.size; _i_0++) {
    const int32_t v = s._vals[_i_0];
    printf("%d\n", v);
}
```

## for await (генераторы)

Асинхронная итерация по генераторам с помощью `for await`:

```typescript
function* nums(): Generator<i32> {
    yield 10;
    yield 20;
    yield 30;
}

async function main(): void {
    for await (const n of nums()) {
        console.log(n);
    }
}
```

Компилируется в state machine: вызов `_next()` на каждой итерации с проверкой `.done`.

## Iterable\<T\> — пользовательские итераторы

Классы, реализующие `Iterable<T>` через декоратор, компилируются в структуру-итератор с функциями `_iter()` / `_iter_next()`:

```typescript
// for-of over Iterable<T> compiles to:
// IterStruct iter = ClassName_iter(&obj);
// while ((elem = ClassName_iter_next(&iter)).has_value) { ... }
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `'for-in' loops are not supported` | Использован `for-in` вместо `for-of` |
| `cannot create Mut from const source` | `for (let item of constArr)` для сложных типов |
| `arr is borrowed during iteration` | Попытка модифицировать массив внутри `for-of` |
| `cannot reassign for-of variable` | Переприсвоение loop-переменной сложного типа |

## См. также

- [for](./for.md) — классический цикл
- [while](./while.md) — циклы с условием
- [break / continue](./break-continue.md) — управление итерациями
- [Переменные](../variables/index.md) — `let`/`const` и ownership
- [Map / Set](../../03-types/maps-sets.md) — коллекции
- [Async](../../07-async/index.md) — `for await` и генераторы
