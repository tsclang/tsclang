## Truthy / Falsy

Как в JS, без `undefined` и `NaN`:

| Тип | Falsy | Truthy |
|-----|-------|--------|
| `boolean` | `false` | `true` |
| числовые (`i8`..`f64`) | `0` | любое ненулевое |
| `string` | `""` (пустая строка) | любая непустая |
| `T | null` (сложный тип) | `null` | не null |
| `T | null` (примитив) | `null` или falsy значение | не null и truthy |
| class / type / interface | никогда (всегда truthy) | всегда |
| array / Set / Map | никогда (всегда truthy, даже пустые) | всегда |

```typescript
if ("")    { }  // falsy
if ("hi")  { }  // truthy
if (0)     { }  // falsy
if (42)    { }  // truthy
if (null)  { }  // falsy

// string | null — truthy если не null И не ""
let s: string | null = getValue();
if (s) {
    // s: string (не null и не пустая)
}

// i32 | null — truthy если не null И не 0
let n: i32 | null = getValue();
if (n) {
    // n: i32 (не null и не 0)
}

// class — всегда truthy (non-null по определению)
let u = new User("Alice");
if (u) { }  // всегда truthy — компилятор выдаёт warning: условие всегда true

// array / Set / Map — всегда truthy, даже пустые
let arr: i32[] = [];
if (arr) { }  // truthy — warning: условие всегда true
              // для проверки на пустоту используй arr.length === 0

let m = new Map<string, i32>();
if (m) { }  // truthy — warning: условие всегда true
            // для проверки на пустоту используй m.size === 0
```

Narrowing через truthy/falsy:
```typescript
let s: string | null = getValue();
if (s) {
    console.log(s.length);  // s: string — не null, не ""
} else {
    // s: string | null, но точно null или ""
}
```

C-output для truthy check:
```c
// string | null (opt_string struct)
if (s.has_value && s.value.length > 0) { ... }

// i32 | null (struct)
if (x.has_value && x.value != 0) { ... }

// string (non-nullable)
if (s.length > 0) { ... }
```

- Синтаксис nullable типа: `T | null` — для любых типов, компилятор выбирает реализацию:
  - Примитивы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) → `struct { bool has_value; T value; }` в C
  - `string` → `struct { bool has_value; String value; }` в C (inline struct, ARC copy)
  - Сложные типы (массивы, объекты, Map, Set) → `T* = NULL` в C (бесплатно)

  > **Overhead:** `i32 | null` занимает 8 байт вместо 4 из-за alignment в C (`bool` добавляет padding). Массив из 1 000 000 элементов `i32 | null` займёт 8 МБ вместо 4 МБ. Для горячих путей с большими nullable-массивами примитивов — используй sentinel-значения вручную (`-1`, `INT32_MIN`) и обычный `i32`.
- Компилятор сужает тип после проверки (type narrowing):
  ```typescript
  function findIndex(arr: i32[], val: i32): i32 | null {
      for (let i = 0; i < arr.length; i++) {
          if (arr[i] == val) return i;
      }
      return null;
  }

  const idx = findIndex(arr, 42);
  if (idx != null) {
      // здесь idx — просто i32
  }
  ```
- **Синтаксис `?`** — сахар для `T | null`, работает везде:
  ```typescript
  // переменные
  let x?: i32;        // то же что let x: i32 | null = null;
  let s?: string;     // то же что let s: string | null = null;

  // параметры функции
  function foo(x: i32, y?: i32) { ... }  // y: i32 | null
  foo(1);     // y = null
  foo(1, 5);  // y = 5

  // поля класса/структуры
  class User {
      name: string;
      age?: i32;      // то же что age: i32 | null
  }
  ```

- **Optional chaining `?.`** — обращение к полю/методу только если значение не null; возвращает `T | null`:
  ```typescript
  const name = user?.profile?.name;   // null если user или profile = null
  const len  = user?.tags?.length;    // i32 | null

  // методы
  const upper = user?.getName()?.toUpperCase();

  // C-output (opt_String с has_value)
  // opt_String name = user.has_value && user.value.profile.has_value
  //     ? (opt_String){true, user.value.profile} : (opt_String){false, {0}};
  ```
  Тип результата `?.` всегда nullable: `T | null`.

- **Nullish coalescing `??`** — дефолтное значение если `null`:
  ```typescript
  const name = user.name ?? "Anonymous";   // string
  const age  = user.age ?? 0;              // i32

  // цепочка с ?.
  const city = user?.address?.city ?? "Unknown";
  ```
  Правая часть `??` должна быть того же типа что `T` в `T | null` — ошибка компилятора иначе.

  **Borrow checker:** после `lhs ?? rhs` тип `lhs` сужается до `null` — либо он был null изначально, либо был moved в результат. Использование `lhs` после `??` как non-null значения — ошибка компилятора. Для цепочек `a ?? b ?? c` все левые операнды сужаются до `null`.

  ```typescript
  let s: string | null = getString()
  const result = s ?? "default"
  // после: s — null, result: string (owned)

  s.length          // ошибка: s is null
  if (s != null) {} // компилятор предупреждает: всегда false

  // если нужно переиспользовать — явный clone перед ??:
  const result = s.clone() ?? "default"
  // s жива, result — отдельная копия
  ```

  C-output зависит от типа:
  ```c
  // Примитив (struct { bool has_value; T value; }):
  // const x: i32 | null = getSomething(); const y = x ?? 0;
  int32_t y = x.has_value ? x.value : 0;

  // Сложный тип (opt_String) — move: извлекаем value и обнуляем s:
  // let s: string | null = getString(); const result = s ?? "default";
  // s: opt_String (string | null → struct с has_value), result: String (string → value)
  String result = s.has_value ? s.value : (String){ "default", 7, 0 };
  s = (opt_String){false, {0}};  // s обнуляется после move
  ```

