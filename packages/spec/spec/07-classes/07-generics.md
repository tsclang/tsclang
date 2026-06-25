## Generics

- **Монорфизация** — компилятор генерирует отдельный код для каждого конкретного типа:
  - `identity<i32>` → `identity_i32` в C
  - `identity<User>` → `identity_User` в C
- **Синтаксис** — TypeScript-стиль `<T>`:
  ```typescript
  function identity<T>(x: T): T { return x; }
  function map<T, U>(arr: Ref<T[]>, f: (x: Ref<T>) => U): U[] { ... }

  class Stack<T> {
      items: T[];
      mut push(item: T): void { ... }
      mut pop(): T { ... }
  }
  ```
- **Bounds** — ограничение типового параметра через `implements` или `extends` (синонимы):
  ```typescript
  // оба синтаксиса эквивалентны — компилятор принимает оба
  function sort<T implements Comparable<T>>(arr: Mut<T[]>): void { ... }
  function sort<T extends  Comparable<T>>(arr: Mut<T[]>): void { ... }

  // несколько bounds
  function process<T implements Comparable<T> & Serializable>(val: T): void { ... }

  // структурный bound (по полям, без interface)
  function findById<T implements { id: i32 }>(arr: T[], id: i32): T | null { ... }

  // несколько параметров с bounds
  function zip<A implements Clone, B implements Clone>(a: A[], b: B[]): [A, B][] { ... }
  ```
  > **Линтер:** может предупредить, что предпочтительнее использовать `implements` над `extends`, но это ломает совместимость с TS. В generic-позиции — `extends` семантически означает наследование, которого в TSClang нет. `extends` допустим для совместимости с привычками TS-разработчиков.

- Без bounds — проверка при инстанцировании. Правила ownership применяются в момент подстановки конкретного типа:
  ```typescript
  first<i32>(arr);   // ok — примитив, копируется
  first<User>(arr);  // ошибка в точке вызова: User — сложный тип, нельзя вернуть T из Ref<T[]>
  ```
- **Ownership с generics** — `Ref<T>`, `Mut<T>`, `Arc<T>`, `Weak<T>` работают как обычно:
  ```typescript
  function first<T>(arr: Ref<T[]>): Ref<T> { ... }  // borrow элемента
  function pop<T>(arr: Mut<T[]>): T { ... }          // move с удалением
  function process<T>(graph: Arc<T>) { ... }      // ARC
  ```

## Extension Methods
