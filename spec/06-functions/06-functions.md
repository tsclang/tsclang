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
  - Явный список захвата — те же типы что везде: `T`, `Ref<T>`, `Mut<T>`, `Shared<T>`:
    ```typescript
    const fn = [data: Data]() => process(data);          // T — move (Owner)
    const fn = [data: Ref<Data>]() => data.length;       // Ref — immutable borrow
    const fn = [data: Mut<Data>]() => { data.push(1); }; // Mut — mutable borrow
    ```
  - Список захвата нужен когда компилятор не может вывести тип или нужен move
  - В C компилируется в struct с захваченными переменными + функцию принимающую этот struct

