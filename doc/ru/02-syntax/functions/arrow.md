# Стрелочные функции

[← Вверх](./index.md) | [Следующий →](./overload.md) | [Предыдущий ←](./declaration.md)

---

Стрелочные функции — сокращённый синтаксис для объявлений функций. Поддерживаются два вида тела: expression и block.

## Expression body

Одно выражение после `=>` — результат автоматически возвращается:

```typescript
const square = (x: i32): i32 => x * x;
```

```c
static int32_t _lambda_0_i32(int32_t x) {
    return x * x;
}

int32_t (*square)(int32_t) = _lambda_0_i32;
```

## Block body

Тело в фигурных скобках — нужен явный `return`:

```typescript
const abs = (x: i32): i32 => {
    if (x < 0) { return -x; }
    return x;
};
```

```c
static int32_t _lambda_0_i32(int32_t x) {
    if (x < 0) {
        return -x;
    }
    return x;
}
```

## Скобки вокруг параметров

- **С аннотациями типов** — скобки обязательны: `(x: i32) => ...`
- **Без аннотаций** — скобки опциональны: `x => ...` или `(x) => ...`

```typescript
const f = (x: i32): i32 => x + 1;   // аннотации → скобки обязательны
const g = x => x + 1;               // без аннотаций → скобки опциональны
const h = (x) => x + 1;             // тоже допустимо
```

## Async стрелочные функции

`async` стрелочная функция возвращает `Promise<T>`:

```typescript
const fetchUser = async (id: i32): Promise<User> => await http.get(`/users/${id}`);

// без явной аннотации — тип выводится
const fn = async () => await fetchData();              // () => Promise<Data>
arr.map(async item => await process(item));            // (item: T) => Promise<U>
```

Async IIFE:

```typescript
const result = await (async () => {
    const data = await fetchData();
    return data.value;
})();
```

Async лямбды допустимы везде, где обычные: в `map`, `filter`, `Promise.all` и т.д.

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `parentheses required when type annotations present` | `(x: i32) => ...` без скобок вокруг параметра |
| `await is only valid in async function` | `await` внутри не-async стрелочной функции |

---

## См. также

- [Объявление функций](./declaration.md) — `function`, анонимные функции, замыкания
- [Перегрузка функций](./overload.md) — несколько функций с одним именем
- [Async/await](../../07-concurrency/index.md) — детали работы с async
