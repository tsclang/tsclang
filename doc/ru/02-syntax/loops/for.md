# Цикл for

[← Вверх](./index.md) | [Следующий →](./for-of.md)

---

Классический цикл `for` с инициализацией, условием продолжения и шагом. Синтаксис совпадает с TypeScript/JavaScript.

## Синтаксис

```typescript
for (init; condition; update) {
    // body
}
```

- **init** — объявление переменной (`let i = 0`) или выражение
- **condition** — выражение, приводимое к `bool`; пустое — бесконечный цикл
- **update** — выражение, выполняемое после каждой итерации (обычно `i++`)

Все три секции опциональны: `for (;;)` — бесконечный цикл (аналог `while (true)`).

## Пример

```typescript
for (let i: i32 = 0; i < 3; i++) {
    console.log(i);
}
```

### C-output

```c
for (int32_t i = 0; i < 3; i++) {
    printf("%d\n", i);
}
```

## Бесконечный цикл

```typescript
for (;;) {
    // break required somewhere
}
// equivalent to:
while (true) {
    // ...
}
```

Обе формы компилируются в `while (true) { ... }` на C.

## Инициализация

В секции `init` можно объявить одну переменную с выводом типа или явной аннотацией:

```typescript
for (let i = 0; i < 10; i++) { }      // i: i32 (inferred)
for (let i: i32 = 0; i < 10; i++) { }  // i: i32 (explicit)
```

Также можно использовать выражение (без объявления):

```typescript
let i = 0;
for (i = 0; i < 10; i++) { }  // reassigns existing i
```

## Область видимости

Переменная, объявленная в `init`, видна только внутри тела цикла. После выхода из цикля она недоступна — как в TypeScript.

```typescript
for (let i = 0; i < 3; i++) {
    console.log(i);  // ok
}
// console.log(i);   // error: i is not defined
```

## Вложенные циклы

```typescript
for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
        console.log(i, j);
    }
}
```

### C-output

```c
for (int32_t i = 0; i < 3; i++) {
    for (int32_t j = 0; j < 3; j++) {
        printf("%d %d\n", i, j);
    }
}
```

## Тип счётчика

Если тип не указан явно, выводится `i32`. Для индексов массивов (`size_t`) используйте `for-of` или `for (let i: usize = 0; ...)`.

## См. также

- [for-of](./for-of.md) — итерация по коллекциям
- [while](./while.md) — циклы с условием
- [break / continue](./break-continue.md) — управление итерациями
