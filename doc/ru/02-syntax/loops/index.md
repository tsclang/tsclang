# Циклы

[← Вверх](../index.md) | [Следующий →](./for.md)

---

TSClang поддерживает четыре вида циклов и механизмы управления итерациями.

## Обзор

| Конструкция | Описание |
|-------------|----------|
| [`for`](./for.md) | Классический цикл с инициализацией, условием и шагом |
| [`for-of`](./for-of.md) | Итерация по массивам, строкам, Map, Set и другим коллекциям |
| [`while` / `do-while`](./while.md) | Циклы с предусловием и постусловием |
| [`break` / `continue`](./break-continue.md) | Управление итерациями, в том числе метки (`label:`) |

## Поддерживаемые конструкции

### `for`

Классический C-подобный цикл. Инициализация, условие, шаг:

```typescript
for (let i = 0; i < 10; i++) {
    console.log(i);
}
```

### `for-of`

Итерация по элементам коллекции. Поддерживает массивы, строки, Map, Set и пользовательские `Iterable<T>`:

```typescript
const arr = [1, 2, 3];
for (const item of arr) {
    console.log(item);
}
```

### `while` / `do-while`

Циклы с проверкой условия:

```typescript
while (condition) { /* ... */ }
do { /* ... */ } while (condition);
```

### `break` / `continue`

Выход из цикла или переход к следующей итерации. Поддерживают метки для вложенных циклов:

```typescript
outer: while (true) {
    while (true) {
        if (done) break outer;
        if (skip) continue outer;
    }
}
```

## Неподдерживаемые конструкции

| Конструкция | Альтернатива |
|-------------|--------------|
| `for-in` | `for-of` — итерация по ключам объекта не поддерживается |

```typescript
// error: 'for-in' loops are not supported; use 'for-of' instead
for (const key in obj) { }
```

## Async и циклы

`await` внутри `while` / `for` выполняется **последовательно** — каждая итерация дожидается завершения предыдущей. Для параллельного выполнения используйте `Promise.all`.

```typescript
// sequential — each iteration waits
while (hasMore()) {
    const data = await fetchData();
    process(data);
}

// parallel — all requests at once
const results = await Promise.all(urls.map(u => fetch(u)));
```

Асинхронные циклы компилируются в state machine с `goto`-переходами между состояниями.

## См. также

- [Массивы](../../03-types/arrays.md) — итерация по массивам
- [Строки](../../03-types/strings.md) — итерация по символам и code points
- [Map / Set](../../03-types/maps-sets.md) — итерация по коллекциям
- [Async](../../07-async/index.md) — генераторы и `for await`
