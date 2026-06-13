# 04 — Присваивание и владение: обзор

Семантика присваивания (`let b = a`, `const b = a`, `b = a`) зависит от типа `a` и от типа-аннотации `b`. Ниже — полная таблица по всем комбинациям.

## Обозначения

| Термин | Значение |
|--------|----------|
| **Copy** | Побитовое копирование. Оригинал не затронут, никаких retain/release |
| **Move** | Ownership transfer. Оригинал обнуляется (`{0}`), доступ к нему — ошибка компиляции |
| **ARC Copy** | Копирование struct-by-value + `tsc_string_retain` нового владельца + `tsc_string_release` в cleanup |
| **Borrow** | Pointer (`&a`) без transfer ownership. Владение остаётся у оригинала |
| **ARC Retain** | `tsc_arc_retain()` — increment refcount, shared ownership |

## Файлы

| Файл | Тема |
|------|------|
| `04-primitives.md` | Этот файл — обзор + примитивы |
| `07-classes-ownership.md` | Классы: move, borrow, spread, destructuring |
| `08-arrays-ownership.md` | Массивы: move, borrow, spread, destructuring, capacity |
| `08-tuples-ownership.md` | Кортежи: move, borrow, spread, destructuring, optional, rest |
| `04-arc-weak.md` | Arc\<T\> и Weak\<T\>: ARC ownership, cycles |
| `10-async-ownership.md` | Ownership в async: retain-on-capture, cleanup, generators |

---

## 1. a — примитив

**Типы:** `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `f32`, `f64`, `boolean`, `usize`, `isize`

Примитивы — всегда **copy by value**. Никакого ownership management, никаких retain/release.

### Обычные переменные

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `let b = a` | Copy, mutable | `int32_t b = a;` |
| `const b = a` | Copy, immutable | `const int32_t b = a;` |
| `b = a` (reassign) | Copy | `b = a;` (только если `b` объявлен как `let`) |

### Ref\<T\> / Mut\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Ref<i32> = a` | Borrow pointer | `const int32_t *b = &a;` |
| `const b: Mut<i32> = a` | Mutable borrow pointer | `int32_t *b = &a;` |

`Ref<primitive>` и `Mut<primitive>` допустимы — они нужны для **array element borrows** (`arr[i]` → `Ref<i32>`). Для отдельной переменной это технически работает, но практически бессмысленно: указатель на стековую переменную, которая и так доступна по имени.

### Arc\<T\> / Weak\<T\>

| Паттерн | Семантика | C-вывод |
|---------|-----------|---------|
| `const b: Arc<i32> = a` | **Ошибка компиляции** | `TypeError: Arc<T> requires a non-primitive type, got i32` |
| `const b: Weak<boolean> = a` | **Ошибка компиляции** | `TypeError: Weak<T> requires a non-primitive type, got boolean` |

Arc ownership и weak references для copy-типов бессмысленны — нет смысла делать refcount для значения, которое и так копируется.

### Очистка памяти

Для примитивов нет явного `drop`, `free` или деструктора. Переменная — это байты на стеке. Память освобождается автоматически:

| Случай | Что происходит |
|--------|---------------|
| Выход из блока `{}` | Стековый указатель сдвигается, переменная перестаёт существовать |
| Выход из функции (`return`) | Все локальные переменные и параметры уничтожаются |
| Конец `main()` | Все переменные очищаются при завершении программы |
| Reassign (`b = newValue`) | Старое значение перезаписывается, переменная жива |

C-компилятор не генерирует инструкций на «очистку» — просто сдвигает стековый указатель. Zero overhead.

Это верно **для любого вида функций**:

- **`void` vs не-`void`** — `return` без значения и падение на `}` раскручивают стек одинаково
- **Стрелочная функция** (`const fn = (x: i32) => x + 1`) — обычная C-функция, параметры уничтожаются при возврате
- **Замыкание** — примитив **копируется** в stack-allocated env struct при создании замыкания. Замыкание — C struct на стеке, возвращается по значению. Heap используется только при `TSC_CLOSURE_BOX` (C interop, `native {}` блоки)

### Поведение внутри функций

**Обычные функции** — параметры и локальные переменные на стеке, cleanup = сдвиг стека:

```typescript
function add(x: i32, y: i32): i32 {
    let sum = x + y;
    return sum;
}
```

```c
int32_t add_i32_i32(int32_t x, int32_t y) {
    int32_t sum = x + y;
    return sum;
}  // x, y, sum — на стеке, уничтожены при возврате
```

**Стрелочные функции** — компилируются в обычные C-функции, идентично:

```typescript
const add = (x: i32, y: i32): i32 => x + y;
```

```c
int32_t _lambda_0_i32(int32_t x, int32_t y) { return x + y; }
```

**Замыкания с capture** — env struct на стеке, примитив **копируется** по значению:

```typescript
let base = 10;
const add = (x: number): number => base + x;
console.log(add(5));
```

```c
typedef struct { double base; } _closure_0_env;
typedef struct { _closure_0_env env; double (*fn)(_closure_0_env *, double); } _closure_0;

static double _closure_0_fn(_closure_0_env *env, double x) { return env->base + x; }

int main(void) {
    double base = 10;
    _closure_0 add = {.env = {.base = base}, .fn = _closure_0_fn};
    printf("%g\n", add.fn(&add.env, 5));  // 15
}
```

`base` скопирован в env struct. Оригинал `base` живёт на стеке дальше. Env struct уничтожается со стеком при выходе из scope. Нет `malloc`, нет `free`.

### Desktop vs Embedded

| Аспект | Desktop | Embedded |
|--------|---------|----------|
| `i32` | `int32_t` (4 байта) | `int32_t` (4 байта, avr-gcc — цепочка инструкций) |
| `f64` | `double` (8 байт) | `double` (8 байт). `float` — только при `number` (= f32 на embedded) |
| `usize` | `size_t` (4/8 байт) | `uint16_t` на 16-bit (nes, spectrum) |
| Retain/release | Нет (примитивы — copy) | Нет (примитивы — copy) |
| Замыкания | Stack-allocated struct | Stack-allocated struct (идентично) |
| `new` (классы) | Stack value type: `T var = {0}` | Статический аллокатор или stack |

Примитивы — **одинаковы** на всех платформах. Zero overhead везде. Никаких различий в поведении.

### Почему так

Copy-типам не нужен ownership management — значение копируется при присваивании, оригинал не теряется. Borrow допустим (pointer), но не имеет практического смысла для отдельной переменной. Arc/Weak запрещены — refcount для числа бессмысленен.
