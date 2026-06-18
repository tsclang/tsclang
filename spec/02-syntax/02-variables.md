## Переменные

- `let` — мутабельная переменная: можно переприсвоить, можно вызывать `mut` методы, можно передавать как `Mut<T>`
- `const` — иммутабельная: нельзя переприсвоить, нельзя вызывать `mut` методы, нельзя передавать как `Mut<T>`
- `var` — синоним `let` (для совместимости с TypeScript; не рекомендуется)

### Инициализация по умолчанию

Переменная без инициализатора получает **zero-value** — безопасное начальное значение, гарантирующее корректность cleanup и отсутствие undefined behavior в C.

| Категория типов | Zero-value | C-output |
|----------------|-----------|----------|
| Целые числа (`i8`..`i64`, `u8`..`u64`, `usize`, `isize`, `char`) | `0` | `= 0;` |
| Дробные (`f32`, `f64`) | `0.0` | `= 0.0;` |
| `boolean` | `false` | `= false;` |
| `string` | `""` (пустая строка) | `= STR_LIT("");` |
| Класс, интерфейс, tuple, type alias (struct) | `{0}` (все поля нулевые) | `= {0};` |
| Массив (`Array<T>`), Map, Set | Пустой контейнер | `= {0};` |
| Специальные (Date, Buffer, Promise, ...) | `{0}` | `= {0};` |
| Указатели (`Arc<T>`, `Weak<T>`, closure) | `NULL` | `= NULL;` или `= {0};` |
| `opt_T` / `T \| null` / `T?` | `null` | `= {false, 0};` |
| `enum` | **Compile error** | — |

**Enum — единственный тип, требующий явной инициализации:**

```typescript
let x: Color;              // compile error: enum must be explicitly initialized
let x: Color = Color.Red;  // OK
let x?: Color;             // OK — sugar for Color | null, default null
```

Обоснование:
- В TypeScript неинициализированная enum-переменная = `undefined`. Авто-init первым членом был бы неожиданным для TS-разработчика.
- Explicit-value enum с дырками (`enum E { A=5, B=10 }`) делает `= 0` невалидным значением.
- Честнее требовать явное присвоение или `?`, чем молча подставлять значение.

**Правило присваивания `null`:**

- `x = null` для **non-nullable** типа → compile error
- `x = null` для `opt_T` → `x = (opt_T){false, 0}`
- `x = null` для указателя (`Arc<T>`, `Weak<T>`) → допустимо (pointer = NULL)

```typescript
let x: i32 = 5;
x = null;            // compile error: cannot assign null to non-nullable type

let y: i32 | null = 5;
y = null;            // OK

let s: string = "hi";
s = null;            // compile error: string is non-nullable

let w: Weak<Foo>;
w = null;            // OK — pointer type
```

### Множественное объявление

В одном `let`/`const` можно объявить несколько переменных через запятую. Каждый declarator независимо имеет type annotation и/или initializer:

```typescript
let a = 1, b = 2, c = 3;              // три переменные без type annotation
let x: i32 = 1, y: string = "hi";     // разные типы
let p = 1, q: f64, r = "three";       // смешанный: с типом и без, с init и без
const PI = 3.14, E = 2.71;            // const тоже поддерживается
```

**Правила:**
- Каждый declarатор независим: может иметь или не иметь type annotation и initializer
- `let`/`const`/`var` applies ко всем declarators в группе
- Decorators apply только к первому declarator
- Destructuring (`let {a, b} = obj`) не поддерживает comma — только один pattern

```typescript
// ❌ destructuring + comma — не поддерживается
let {a, b} = obj, c = 5;             // error

// ✅ раздельно
let {a, b} = obj;
let c = 5;
```
