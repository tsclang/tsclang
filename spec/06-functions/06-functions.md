## Функции

- Ключевое слово: `function`
  ```typescript
  function add(a: i32, b: i32): i32 {
    return a + b;
  }
  ```
- **Стрелочные функции** — сокращённый синтаксис, тип выводится:
  ```typescript
  const add = (a: i32, b: i32): i32 => a + b; // expression body
  const add = (a: i32, b: i32): i32 => {
    return a + b;
  }; // block body
  ```
- **Анонимные функции** — `function` без имени, присваивается переменной или передаётся аргументом:

  ```typescript
  const add = function (a: i32, b: i32): i32 {
    return a + b;
  };

  array.sort(function (a: i32, b: i32): i32 {
    return a - b;
  });
  ```

- **IIFE** — немедленный вызов функции:
  ```typescript
  // стрелочная функция
  ((a: i32, b: i32) => a + b)(1, 2); // => 3

  // блочное тело
  ((a: i32, b: i32): i32 => {
    return a + b;
  })(1, 2); // => 3

  // анонимная функция
  (function (a: i32, b: i32): i32 {
    return a + b;
  })(1, 2); // => 3
  ```
- **Async функции** — возвращают `Promise<T>`, могут содержать `await`:
  ```typescript
  async function fetchUser(id: i32): Promise<User> throws NetworkError {
      return await http.get(`/users/${id}`)
  }
  ```
- **Async стрелочные функции** — тип выводится как `async () => Promise<T>`:
  ```typescript
  const fetchUser = async (id: i32): Promise<User> => await http.get(`/users/${id}`)

  // без явной аннотации
  const fn = async () => await fetchData()               // () => Promise<Data>
  arr.map(async item => await process(item))             // (item: T) => Promise<U>

  // async IIFE
  const result = await (async () => {
      const data = await fetchData()
      return data.value
  })()
  ```
  Async лямбда везде где допустима обычная лямбда — в `map`, `filter`, `Promise.all` и т.д.

## Модификаторы функций

### `@static function` — статическая функция

Декоратор `@static` на функции делает её **статической** (видимость ограничена translation unit). В C это `static <return_type> <name>(...)`.

#### Синтаксис

```typescript
@static
function helper(x: i32): i32 {
    return x * 2;
}
```

#### C-вывод

```c
static int32_t helper(int32_t x) {
    return x * 2;
}
```

#### Когда использовать

- Вспомогательные функции, которые не должны быть видны за пределами модуля
- Оптимизация компоновщика (compiler может инлайнить или удалить)
- На `allocator: "static"` для `@static async function*` — обязателен (один экземпляр генератора в BSS)

#### Связанные контексты `@static`

- `@static let/const` → [04-borrow.md](../04-ownership/04-borrow.md) (мутабельное глобальное состояние)
- `@static class field` → [07-classes-ownership.md](../07-classes/07-classes-ownership.md) (одно поле на класс в BSS)
- `@static async function*` → [10-async.md](../10-async/10-async.md) (генератор в BSS, cooperative scheduler)
- `@static function` (этот раздел) — статическая функция в C

---

### `@inline function` — принудительный inline

Декоратор `@inline` на функции форсирует **static inline** — компилятор C обязан попытаться встроить тело функции в место вызова. Используется для критичных по производительности маленьких функций на embedded.

#### Синтаксис

```typescript
@inline
function setBit(reg: Mut<u8>, bit: u8): void {
    reg |= (1 << bit);
}
```

#### C-вывод

```c
static inline void setBit(uint8_t *reg, uint8_t bit) {
    *reg |= (1 << bit);
}
```

#### Когда использовать

- Маленькие функции (1-3 строки), вызываемые в hot path
- HAL-функции на embedded (set/clear бит в регистре)
- Helper-функции, где overhead вызова важнее размера кода

#### Ограничения

- **Только для функций** — не применяется к классам, методам, переменным
- **Не гарантирует inline** — `static inline` в C это рекомендация, не требование. Компилятор C может проигнорировать, если функция слишком большая
- **На desktop обычно не нужен** — компилятор C сам хорошо оптимизирует

#### Связанные декораторы

- Полный индекс встроенных декораторов: [15-decorators.md](../15-decorators/15-decorators.md#встроенные-декораторы)

---

- **Замыкания** — стрелочные функции захватывают переменные из внешнего скопа:
  ```typescript
  let multiplier = 3;
  const triple = (x: i32) => x * multiplier; // захватывает multiplier
  ```
  - Захват **по значению** для примитивов (копируется в момент создания замыкания); `T | null` где T — примитив, тоже захватывается по значению (copy), несмотря на struct-представление в C:
    ```typescript
    let x: i32 | null = 5;
    const fn = () => console.log(x);
    x = null;
    fn();  // 5 — захвачена копия на момент создания
    ```
  - Захват **по значению** (copy) для всех типов — по умолчанию. Struct copy для классов/массивов, value copy для примитивов. Для borrow-захвата — explicit capture list `[x: Ref<T>]` / `[x: Mut<T>]`
  - Явный список захвата — те же типы что везде: `T`, `Ref<T>`, `Mut<T>`, `Arc<T>`:
    ```typescript
    const fn = [data: Data]() => process(data);          // T — move (Owner)
    const fn = [data: Ref<Data>]() => data.length;       // Ref — immutable borrow
    const fn = [data: Mut<Data>]() => { data.push(1); }; // Mut — mutable borrow
    ```
  - Список захвата нужен когда компилятор не может вывести тип или нужен move
  - В C компилируется в struct с захваченными переменными + функцию принимающую этот struct

