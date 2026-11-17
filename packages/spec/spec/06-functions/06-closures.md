# TSClang — Замыкания: capture model, семантика, ограничения

> Spec status: unverified · #205

> **СТАТУС: РЕШЕНО.**
>
> **Ключевое решение:** capture model — **гибридная**. Примитивы и строки = shared cell (общая ячейка с enclosing-блоком, #295 v2c) либо copy (snapshot на документированных границах). Class/array = reference (pointer). Source **всегда жив** после capture. Нет move capture, нет E002 для implicit capture.
>
> **Связь с for-of/spread:** for-of (см. [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md)) использует **borrow** (pointer) для complex-типов. Spread/destructuring (см. [08-spread-destructuring.md](../08-collections/08-spread-destructuring.md)) использует **copy**. Closure capture = **reference** (pointer) для class/array — mutations видны снаружи, TS-совместимое поведение.
>
> **Обоснование:** П1 (кроссплатформенность) — env выделяется через `tsc_malloc` (профиль-зависимый аллокатор: heap на desktop, статический пул на embedded — #290), pointer capture = C-compatible. П2 (TS compat) — class/array = reference как в TS. П3 (better than all) — проще Rust (нет Fn/FnMut/FnOnce), безопаснее C (env переживает scope создания), нет скрытого GC как TS.
>
> Опирается на: [04-primitives.md](../04-ownership/04-primitives.md) (владение), [04-ownership.md](../04-ownership/04-ownership.md) (модель памяти).

---

## 1. Зафиксированные решения

### D1: Capture model — гибридная (copy + reference)

**Решение:** тип захваченной переменной определяет способ capture:

| Тип | Capture | Обоснование |
|-----|---------|-------------|
| Примитив | Shared cell в функциях; copy (snapshot) на границах D2 | TS-истинная семантика где нужно; копия дёшево на границах |
| string | Shared cell в функциях; retain-copy на границах D3 | Value type, ARC |
| Class/Array | Reference (pointer) | TS compat, mutations visible |

**Альтернативы отклонены:**
- Всё по значению (copy + move) — ломает closure semantics (source dead, нельзя использовать arr после capture)
- Всё по ссылке — примитивы по ссылке бессмысленны и добавляют overhead
- GC для env — нарушает П1 (embedded) и П3 (нет скрытого GC)

**Статус: ✅ Решено. Реализовано.**

### D2: Примитивы — shared cell в функциях, snapshot на границах (#295 v2c)

**Решение:** внутри тела функции arrow-замыкание с implicit capture делит ячейку с enclosing-блоком — как в TS. Переменная (прямой `let`/`const`-ребёнок блока или параметр enclosing-функции, cellable-типа: целые, `float`/`double`, `bool`, `char`, `string`) живёт в env-ячейке блока; env стрелки получает один указатель `_outer` на block env; чтение/запись идут через `env->_outer->x`. Мутации видны с обеих сторон.

```typescript
function main(): void {
  let x: i32 = 1;
  const fn = (): i32 => x;
  x = 2;
  console.log(fn());   // 2 — общая ячейка, как в TS
}
```

**Циклы (#295 v2c-2, #298 s3):** `for (let i...)` / `for (let/const x of ...)` с захватом body-стрелками — per-iteration cells (свежий env на итерацию: copy-in на входе, copy-out для C-style `for` на cleanup-пути, release если замыкания не удержали). Мутация в теле видна same-iteration стрелкам; copy-out идёт до header-update, поэтому update работает со «свежим» значением — ровно как TS создаёт новую per-iteration среду до update. Замыкания разных итераций держат разные значения — семантика TS, см. [05-for-of.md](../05-control-flow/05-for-of.md). Механизм работает на верхнем уровне (тело `main`), в функциях и в телах замыканий (#298 s4).

**`var`-циклы на верхнем уровне (#298 s3):** `for (var i...)` / `for (var x of ...)` с захватом стрелкой — единый биндинг, как в TS: имя hoist'ится в module scope, поэтому компилятор продвигает его в static global (по механизму стадии 2 — упоминание в стрелке триггерит продвижение). Инициализация цикла и привязка for-of становятся присваиваниями глобала; замыкания ссылаются на него напрямую и видят последнее значение. Продвижение требует статически выводимого типа (аннотация на биндинге, literal-инициализация, типизированный итерируемый `Array<T>`/`T[]`/literal); иначе биндинг остаётся snapshot (документированное ограничение). Чтение до цикла даёт zero-init (вместо TS `undefined`). `var`-циклы внутри функций/методов/стрелок — ограничение: компилятор не hoist'ит `var` в scope функции, биндинг ведёт себя как `let` (per-iteration cell); отклонение от TS hoisting, документировано. Специальные итерируемые for-of (`set`, `entries()`, `codePoints()`…) — snapshot (снимается #298 s5).

**Snapshot-границы** (захват копией, как до v2c; документированное отклонение от TS):

| Позиция стрелки/переменной | Capture | Причина |
|---------------------------|---------|---------|
| Стрелка/метод над top-level переменной (любой читатель: тело функции, стрелка в любой позиции, метод класса, reactive-callback, library mode, `@static`) | **Прямая ссылка, без захвата** (#298 s1–s2) | Глобал = static storage duration, одна ячейка на программу (TS module-scope). Компилятор продвигает переменную при первом читателе и эмитит tentative forward-declaration до кода, ссылающегося раньше определения (лямбды, методы). Signal-переменные не продвигаются — reactive env держит их по указателю |
| `var`-биндинг top-level цикла (`for (var i…)`, `for (var x of …)`) со статически выводимым типом | **Прямая ссылка на продвинутый static global** (#298 s3) | TS hoist'ит `var` в module scope — единая ячейка; все замыкания видят последнее значение |
| `var`-биндинг top-level цикла с невыводимым типом (итерируемый-выражение без аннотации и т.п.) | Copy (snapshot) | Тип global'а нельзя вывести без визита тела; ограничение стадии |
| Переменная без type-аннотации и без literal-инициализации (в блоках внутри функций) | Copy (snapshot) | Тип ячейки неизвестен без аннотации |
| Спец-итерируемый for-of (`set`, `entries()`, `codePoints()`…) | Copy (snapshot) | Снимается #298 s5 |

Границы «внешний блок» и «тело замыкания», бывшие snapshot-границами до #298 s4, сняты — см. «Env-иерархия» ниже.

**Env-иерархия (#298 s4):** блок-pre-scan распространён на тела замыканий (hoistClosure-путь): блок тела стрелки получает собственный env с ячейками для своих локалей, захваченных вложенными стрелками; вложенная стрелка получает `_outer`-ссылку на него. Блочные env образуют цепочку: env-параметр C-функции (тело замыкания или именованной вложенной функции) — корень; каждый блок со захваченными локалями добавляет env-структуру с полем `<parent> *_outer` (при затенении имени локалка переименовывается в `_blk_envN`). Аллокация блочного env делает `tsc_env_retain` родителя; destroy fn — парный `tsc_env_release(_outer)` — escaping-замыкание удерживает всю цепочку (ARC). Чтения из глубины идут по хопам: `env->_outer->_outer->x`. Покрытые позиции:

- стрелка внутри тела другого замыкания — общий доступ к ячейкам внешнего тела через `_outer`-цепочку;
- захват из внешнего блока (не непосредственного родителя) внутри функций и тел замыканий;
- циклы в телах замыканий — per-iteration cells (как на верхнем уровне и в функциях);
- ранний `return` из тела замыкания — cleanup-изоляция сохраняется: LIFO-release env до выхода, escape-копии в массивах удерживают env (push делает `tsc_env_retain`, free-макрос массива — release по элементам).

Остающиеся snapshot-расхождения: явные `Ref<T>`/`Mut<T>`-позиции (#292 → s6: станут E-ошибкой на примитивах), спец-итерируемые for-of (s5), `var`-hoisting внутри функций, невыводимые типы. Именованная функция, объявленная в теле замыкания, — E020 (документированная граница s4).

Также читателями-по-прямой-ссылке (без env-захвата) являются таймерные колбэки (`setTimeout`/`setInterval`) и read-only тела `spawn`-блоков: продвинутый глобал виден им напрямую. Запись module-scope переменной из `spawn`-блока — ошибка E021 (data race; использовать `Atomic<T>`).

Class/array захватываются pointer'ом всегда (D4) — расхождения с TS нет ни в одной позиции.

> **История:** до #295 v2b примитивы всегда захватывались копией (snapshot) — расхождение с TS диагностировалось `W013` (#294). В v2c стрелки переведены на shared cell в pre-scan'имых блоках, W013 удалён (см. [16-compiler.md](../16-tooling/16-compiler.md)); snapshot остаётся только на перечисленных границах.

**Статус: ✅ Решено. Реализовано (#295 v2c).**

### D3: String — shared cell в функциях, retain-copy на границах

**Решение:** в shared-cell позициях (D2) `string` живёт в env-ячейке блока как value; destroy fn block env делает `tsc_string_release` по строковым ячейкам. На snapshot-границах — shallow copy struct + `tsc_string_retain` в env стрелки (как до v2c). Source жив.

Обоснование: String = ARC-managed value type; в общей ячейке переприсваивание (`msg = "ok"`) отпускает старое значение обычным путём присваивания, финальный release — destroy fn env. O(1) на всех платформах (no-op retain на embedded).

**Статус: ✅ Решено. Реализовано (#295 v2c).**

### D4: Class/Array — reference (pointer)

**Решение:** class и array захватываются как pointer (`User *u`, `Array_i32 *arr`). Mutations внутри closure видны снаружи. Source жив.

Совпадает с поведением TS (reference capture). `arr[0] = 9` внутри closure видно как `arr[0] == 9` снаружи.

Обоснование: П2 (TS compat) — основное использование closures = shared mutable state. Без reference capture closures бесполезны для class/array.

**Статус: ✅ Решено. Реализовано.**

### D5: Explicit capture syntax — только Ref/Mut

**Решение:** explicit capture list `[...]` принимает только `Ref<T>` и `Mut<T>`:

```typescript
const fn = [arr: Mut<Array<i32>>](): void => { arr[0] = 9; };  // OK
const fn = [arr: Ref<Array<i32>>](): i32 => arr[0];             // OK
const fn = [arr](): void => { ... };                             // Error: requires a type annotation: Ref<T> or Mut<T>
```

Обоснование: убрали move `[x: T]` (D6). Остались только Ref/Mut — explicit borrow semantics.

**Статус: ✅ Решено. Реализовано.**

### D6: `[x: T]` move capture — убран

**Решение:** explicit move capture `[arr: Array<i32>]` убран. Compile error: «requires a type annotation: Ref<T> or Mut<T>».

Обоснование:
- П2 (TS compat) — в TS нет move-замыканий. Концепция чуждая для TS-разработчика.
- Нет реальных use cases — в практике TS/JS closures всегда shared mutable state.
- Ownership transfer в closure = концепция из Rust (`move ||`), не из TS.

**Статус: ✅ Решено. Убрано из компилятора.**

### D7: Escaping scope — heap env + ARC env

**Решение:** env struct выделяется через `tsc_malloc` и переживает scope создания — фабрики (`makeCounter`) и возврат замыканий из функций работают корректно.

**Compile error для ref/mut capture:** если closure с явным `[x: Ref<T>]` или `[x: Mut<T>]` захватом возвращается из функции — компилятор выдаёт E020: захваченный стек-кадр умер бы раньше замыкания. Value capture (примитивы по значению, String через retain) разрешён.

**ARC env (#290, реализовано):** замыкание = ARC-значение. Каждый compiler-generated env struct начинается с заголовка `tsc_env_hdr { int _refcount; void (*_destroy)(void *); }`. Создание — refcount 1; копирование из Ident (`const g = f`) — `tsc_env_retain`; результат фабричного вызова (`const f = makeCounter()`) — move без retain; пере-присваивание — release старого env (после записи нового + retain при копировании из Ident); scope-exit — `tsc_env_release`. Refcount → 0: destroy (release захваченных строк) + dealloc. Параметры-замыкания — строгий borrow (без retain/release). Escape через копию и пере-присваивание безопасны.

Альтернативы отклонены:
- Stack-allocated env — dangling pointer для фабрик, ломает базовые TS-паттерны.
- Borrow checker (как Rust) — слишком сложно, нарушает П2 (TS compat).
- GC — нарушает П1 (embedded).

**Статус: ✅ E020 реализован. Heap env реализован. ARC env реализован (#290, фаза 2). Embedded static pool реализован (#290, фаза 3).**

---

## 2. Capture model — подробно

### Сводная таблица

| Тип переменной | Capture | C-representation в env | Source жив? | TS compat | Cleanup |
|---------------|---------|----------------------|-------------|-----------|---------|
| `i32`, `boolean`, `f64` и т.д. | Shared cell (в функциях, #295 v2c) | block env: `int32_t x;`, env стрелки: `_outer` ptr | ✅ Да | ✅ Общая ячейка | destroy fn block env |
| `i32` и др. на snapshot-границах D2 | Copy (snapshot) | `int32_t x;` в env стрелки | ✅ Да | ⚠️ Snapshot | Нет |
| `string` (в функциях) | Shared cell | block env: `String s;` + `_outer` | ✅ Да | ✅ Общая ячейка | `tsc_string_release` (destroy block env) |
| `string` на границах D3 | Retain (ARC copy) | `String s;` | ✅ Да | ⚠️ Snapshot | `tsc_string_release` |
| Class (`User`) | Reference (pointer) | `User *u;` | ✅ Да | ✅ Mutations visible | Нет (source владеет) |
| Array (`Array<T>`) | Reference (pointer) | `Array_i32 *arr;` | ✅ Да | ✅ Mutations visible | Нет (source владеет) |
| `Ref<T>` (explicit) | Const pointer | `const User *u;` | ✅ Да | ✅ | Нет |
| `Mut<T>` (explicit) | Mutable pointer | `User *m;` | ✅ Да | ✅ | Нет |
| Object literal (`{n:1}`, без аннотации) | Reference (pointer) | `_anon_N *o;` | ✅ Да | ✅ Mutations visible | Нет (source владеет) |

### Ключевые свойства

1. **Source всегда жив.** Нет E002 для implicit capture. Переменная доступна после создания closure.
2. **Env не владеет class/array.** Env содержит pointer, не copy. Source владеет данными → source cleanup освобождает ресурсы.
3. **Env владеет string copies.** Env содержит retained copy → destroy fn делает release при обнулении refcount env.
4. **Heap-allocated env.** Env struct выделяется через `tsc_malloc` (профиль-зависимый аллокатор) и переживает scope создания — возврат замыкания из функции безопасен.
5. **Env = ARC-значение.** Заголовок `tsc_env_hdr` (refcount + destroy fn); копирование binding'а — retain, scope-exit/reassign — release. Несколько копий одного замыкания безопасны.

### Конвенция вызова: env-forwarding

Любой указатель, хранящийся в `tsc_closure.fn`, имеет сигнатуру `ret fn(void *env, params...)` — вызов всегда передаёт `.env` первым аргументом (конвенция в стиле qsort):

```c
// захватывающее замыкание: env — указатель на env-структуру
static double _closure_0_fn(_closure_0_env *env) { return env->n; }

// не-захватывающая лямбда: тот же прототип, env игнорируется
static double _lambda_0_f64(void *_env, double x) { return x * 2; }

// вызов — всегда с env
((double (*)(void *))f.fn)(f.env);
```

Plain-функция, попавшая в `tsc_closure` (`apply(inc, 41)`, `const g = inc`, `[square]`), оборачивается компилятором в статический adapter той же конвенции: прототип эмитится в lambda-секции, тело — в late-секции после всех пользовательских функций.

Внешние C-API рантайма (libuv-таймеры, `fs.watch`, `ws.onMessage`, array-хелперы) остаются на своей исходной конвенции без env — компилятор оборачивает env-лямбды в `_adapter`-функции старой сигнатуры.

---

## 3. Примеры

### 3.1 Примитив — copy, source жив

```typescript
let x: number = 42;
const fn = (): number => x + 1;
x = 99;
console.log(fn());   // 43 — x скопирован при создании closure
console.log(x);      // 99 — source жив, изменение видно
```

```c
typedef struct { tsc_env_hdr _hdr; double x; } _closure_0_env;

static double _closure_0_fn(_closure_0_env *env) {
    return env->x + 1;
}

// main:
double x = 42.0;
_closure_0_env *fn_env = tsc_malloc(sizeof(_closure_0_env));
*fn_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .x = x};  // copy
tsc_closure fn = {.env = fn_env, .fn = (void*)_closure_0_fn};
x = 99.0;
printf("%g\n", ((double (*)(void *))fn.fn)(fn.env));  // 43
printf("%g\n", (double)(x));                             // 99
// cleanup: tsc_env_release(fn_env);
```

**Пояснение:** `x` скопирован в env при создании closure. Изменение `x = 99` не влияет на `env->x`. Source `x` жив и доступен. В TS результат был бы `100` (reference capture).

### 3.2 Строка — retain, source жив

```typescript
const prefix: string = "Hello";
const greet = (name: string): string => {
    return prefix + ", " + name;
};
console.log(greet("World"));   // Hello, World
```

```c
typedef struct { tsc_env_hdr _hdr; String prefix; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->prefix);
}

static String _closure_0_fn(_closure_0_env *env, String name) {
    return tsc_string_concat(tsc_string_concat(env->prefix, STR_LIT(", ")), name);
}

// main:
const String prefix = STR_LIT("Hello");
tsc_string_retain(prefix);                          // retain
_closure_0_env *greet_env = tsc_malloc(sizeof(_closure_0_env));
*greet_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .prefix = prefix};  // ARC copy
tsc_closure greet = {.env = greet_env, .fn = (void*)_closure_0_fn};
// cleanup: tsc_env_release(greet_env);   // refcount→0 → destroy → tsc_string_release(prefix-копия) + dealloc
// cleanup: tsc_string_release(prefix);
```

**Пояснение:** string захватывается как ARC copy (`tsc_string_retain`). Source жив. `tsc_env_release` при refcount→0 вызывает destroy fn (release захваченных строк) и освобождает env. Destroy fn генерируется всегда (указана в `_hdr._destroy`); release строк внутри — только при наличии string captures.

### 3.3 Массив — reference, mutations visible

```typescript
let arr: number[] = [1, 2, 3];
const fn = (): void => {
    arr[0] = 9;
};
fn();
console.log(arr[0]);   // 9 — mutation видна!
console.log(arr[1]);   // 2
console.log(arr[2]);   // 3
```

```c
typedef struct { Array_f64 *arr; } _closure_0_env;   // pointer!

static void _closure_0_fn(_closure_0_env *env) {
    env->arr->data[0] = 9.0;                          // mutation через pointer
}

// main:
Array_f64 arr = {.data = _arr_data_0, .length = 3, .capacity = 3};
_closure_0_env fn_env = {.arr = &arr};                // address-of source
tsc_closure fn = {.env = &fn_env, .fn = ...};
((void (*)(void *))fn.fn)(fn.env);
printf("%g\n", (double)(arr.data[0]));                // 9 — mutation видна
```

**Пояснение:** Массив захватывается как pointer (`Array_f64 *arr`). Env содержит `&arr` (address-of source). Mutation `env->arr->data[0] = 9.0` меняет source напрямую. Source жив, mutations видны. Полная TS-совместимость.

### 3.4 Класс — reference, mutations visible

```typescript
class Counter {
    count: number;
}
let c = new Counter();
c.count = 0;
const inc = (): void => {
    c.count += 1;
};
inc();
inc();
inc();
console.log(c.count);   // 3 — все mutations видны
```

```c
typedef struct { double count; } Counter;

typedef struct { Counter *c; } _closure_0_env;       // pointer!

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;                               // mutation через pointer
}

// main:
Counter c = {0};
c.count = 0;
_closure_0_env inc_env = {.c = &c};                   // address-of source
tsc_closure inc = {.env = &inc_env, .fn = ...};
((void (*)(void *))inc.fn)(inc.env);   // c.count = 1
((void (*)(void *))inc.fn)(inc.env);   // c.count = 2
((void (*)(void *))inc.fn)(inc.env);   // c.count = 3
printf("%g\n", (double)c.count);                       // 3
```

**Пояснение:** Класс захватывается как pointer (`Counter *c`). Каждый вызов `inc()` мутирует `c.count` через pointer. Source `c` жив, значение `c.count = 3` видно после всех вызовов.

### 3.5 «Жизненный» пример — closure как анонимная функция

```typescript
let arr: number[] = [1, 2, 3];
arr.push(4);

const fn = (): void => {
    arr[0] = 9;
    console.log(arr.length);
};

fn();                   // arr[0] = 9, prints 4
let a = arr[0];         // 9 — mutation видна
a++;
console.log(a);         // 10
```

**Пояснение:** Типичный паттерн TS/JS — closure мутирует внешнюю переменную, код после closure видит изменения. Работает благодаря reference capture для class/array.

### 3.6 Nested closures — pointer chain

```typescript
class Counter {
    count: number;
}
let c = new Counter();
c.count = 0;
const outer = (): void => {
    c.count += 1;
    const inner = (): void => {
        c.count += 10;
    };
    inner();
};
outer();
console.log(c.count);   // 11 (1 + 10)
```

```c
typedef struct { Counter *c; } _closure_0_env;       // outer env
typedef struct { Counter *c; } _closure_1_env;       // inner env

static void _closure_1_fn(_closure_1_env *env) {
    env->c->count += 10;
}

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;
    _closure_1_env inner_env = {.c = env->c};        // pointer copy!
    tsc_closure inner = {.env = &inner_env, .fn = ...};
    ((void (*)(void *))inner.fn)(inner.env);
}

// main:
_closure_0_env outer_env = {.c = &c};                // → main's c
// inner:             inner_env = {.c = env->c}       // → outer's env->c → main's c
```

**Пояснение:** Outer closure захватывает `c` как `Counter *c = &c` (pointer на main's `c`). Inner closure захватывает `c` из outer scope — `_findFreeVars` находит sym с `ctype: 'Counter *'` и `_closureEnvVar: 'c'`. Inner env: `Counter *c = env->c` (копия pointer'а из outer env). Оба pointer'а указывают на один `c` в main. Chain: inner → outer → main. Mutations из обоих closures видны.

### 3.7 Transitive capture (closure из функции)

```typescript
function makeAdder(n: number): () => number {
    return (): number => n + 1;
}

const add5 = makeAdder(5);
const add10 = makeAdder(10);
console.log(add5());    // 6
console.log(add10());   // 11
```

```c
typedef struct { double n; } _closure_0_env;

static double _closure_0_fn(_closure_0_env *env) {
    return env->n + 1;
}

tsc_closure makeAdder_f64(double n) {
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){.n = n};        // copy (примитив)
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}
```

**Пояснение:** Closure возвращается из функции. Параметр `n` — примитив, захватывается как copy. Env выделяется через `tsc_malloc` — замыкание безопасно переживает возврат (см. D7).

### 3.8 Multi-capture (несколько переменных)

```typescript
let x: number = 10;
let arr: number[] = [1, 2, 3];
const fn = (): number => x + arr.length;
console.log(fn());   // 13
```

```c
typedef struct { double x; Array_f64 *arr; } _closure_0_env;

// main:
_closure_0_env *fn_env = tsc_malloc(sizeof(_closure_0_env));
*fn_env = (_closure_0_env){.x = x, .arr = &arr};      // x = copy, arr = pointer
```

**Пояснение:** Env struct содержит все захваченные переменные. Каждая — по своим правилам: `x` (примитив) = copy, `arr` (array) = pointer.

---

## 4. Explicit capture syntax

### 4.1 `[x: Ref<T>]` — const pointer (read-only)

```typescript
class Box {
    value: number;
}
let b = new Box();
b.value = 42;
const fn = [b: Ref<Box>]: () => number => b.value;
console.log(fn());   // 42
```

```c
typedef struct { const Box *b; } _closure_0_env;     // const pointer

static double _closure_0_fn(_closure_0_env *env) {
    return env->b->value;                              // read-only access
}

// main:
_closure_0_env fn_env = {.b = &b};                    // address-of
```

**Семантика:** `Ref<T>` = `const T *` в env. Read-only доступ к захваченной переменной. Попытка мутации — compile error.

### 4.2 `[x: Mut<T>]` — mutable pointer (explicit borrow)

```typescript
class Counter {
    count: number;
}
let c = new Counter();
c.count = 0;
const inc = [c: Mut<Counter>]: () => number => {
    c.count += 1;
    return c.count;
};
console.log(inc());   // 1
console.log(inc());   // 2
```

```c
typedef struct { Counter *c; } _closure_0_env;       // mutable pointer

static double _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;                               // mutation OK
    return env->c->count;
}

// main:
_closure_0_env inc_env = {.c = &c};                   // address-of
```

**Семантика:** `Mut<T>` = `T *` в env. Mutable доступ. Borrow tracking: source quarantine пока closure alive.

### 4.3 `[x]` без type — ошибка компиляции

```typescript
const fn = [arr](): void => { arr[0] = 9; };
// Error: requires a type annotation: Ref<T> or Mut<T>
```

**Обоснование:** без type annotation компилятор не может определить capture semantics. Ref = read-only, Mut = mutable. Явное указание — deliberate choice.

### 4.4 `[x: T]` (move) — убрано

```typescript
const fn = [arr: Array<i32>](): i32 => arr.length;
// Error: requires a type annotation: Ref<T> or Mut<T>
```

**Rationale (D6):** Move capture был концепцией из Rust (`move ||`). В TS нет аналога. Реальных use cases не найдено. Убрано для простоты и П2-совместимости.

---

## 5. C-representation (как компилятор генерирует)

### 5.1 Env struct — генерация полей

Компилятор генерирует typedef для env struct в `hoistClosure()`:

```c
// Примитив: value
typedef struct { int32_t x; } _closure_0_env;

// String: value (retained)
typedef struct { String s; } _closure_1_env;

// Class: pointer
typedef struct { User *u; } _closure_2_env;

// Array: pointer
typedef struct { Array_i32 *arr; } _closure_3_env;

// Mixed
typedef struct { double x; String s; User *u; Array_i32 *arr; } _closure_4_env;
```

Логика (`closures.ts`, `_isComplexCtype`):
- `SIMPLE_CTYPES` (intXX_t, double, float, bool, String, etc.) → value field
- Всё остальное (class, Array_T, tuple) → pointer field
- Pointer types (`T *`) → pointer field (для nested closures)

### 5.2 Env init — инициализация

```c
// Примитив: copy
_closure_0_env fn_env = {.x = x};

// String: retain + copy
tsc_string_retain(s);
_closure_1_env fn_env = {.s = s};

// Class/Array (из main scope): address-of
_closure_2_env fn_env = {.u = &u};
_closure_3_env fn_env = {.arr = &arr};

// Class/Array (из outer closure scope): pointer copy
_closure_4_env inner_env = {.u = env->u};   // env->u уже pointer
```

Логика:
- Примитив: `.{nm} = ${nm}` (copy)
- String: `tsc_string_retain(nm)` перед init, `.{nm} = ${nm}` (copy)
- Class/Array из main scope: `.{nm} = &${nm}` (address-of)
- Class/Array из closure scope (`_closureEnvVar`): `.{nm} = env->${nm}` (pointer copy)

### 5.3 Access внутри closure

```c
// Примитив (value): env->x
return env->x + 1;

// String (value): env->s
return tsc_string_concat(env->s, STR_LIT("..."));

// Class (pointer): env->u->field
env->u->name = STR_LIT("Alice");
return env->u->value;

// Array (pointer): env->arr->data[i]
env->arr->data[0] = 9;
return env->arr->length;
```

Логика: для pointer captures (`isPointer: true`), `exprToC` генерирует `->` вместо `.` для member access.

### 5.4 Cleanup

| Захваченный тип | Env cleanup | Source cleanup |
|----------------|-------------|----------------|
| Примитив | Нет | Нет |
| string | `tsc_string_release(env->s)` | `tsc_string_release(s)` |
| Class (pointer) | **Нет** (env не владеет) | `User_free(&u)` (string fields) |
| Array (pointer) | **Нет** (env не владеет) | `tsc_array_free_i32(&arr)` |

**Ключевое правило:** source владеет данными. Env содержит pointer — cleanup не нужен. Env cleanup делается только для string (retained copy).

Destroy function генерируется всегда (её адрес хранится в `_hdr._destroy`); внутри — release строк для string captures. Dealloc выполняет `tsc_env_release`, не destroy:
```c
static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->s);
}
// tsc_env_release(env): --_refcount == 0 → _destroy(env) + tsc_free(env)
```

> **Примечание:** cleanup регистрируется через `_registerCleanup` и вызывается на выходе из scope, где создан closure: `tsc_env_release(env_var)` — refcount→0 → destroy (release строк) + dealloc.

---

## 6. Ограничения и UB

### 6.1 ARC env — правила retain/release (#290, реализовано)

Env выделяется на heap, переживает scope создания и живёт, пока refcount > 0. Правила:

| Ситуация | Генерация |
|----------|-----------|
| Создание замыкания (arrow literal → binding) | `tsc_malloc` + init с `._refcount = 1`; cleanup scope: `tsc_env_release` |
| Копирование из Ident (`const g = f`) | `tsc_env_retain(g.env)`; cleanup своего binding'а: release |
| Результат фабричного вызова (`const f = make()`) | move: без retain (refcount уже учтён); cleanup: release |
| Пере-присваивание (`f = g` / `f = make()`) | сохранить старый env → записать новый (+ retain если RHS — Ident) → mirror `f_env = f.env` → `tsc_env_release(old)` |
| Параметр-замыкание | строгий borrow: без retain у caller'а, без release у callee (владение остаётся у caller'а) |
| `return f` (owned Ident) | move: cleanup подавляется, env уезжает с возвращаемым значением |
| `return g` (param / заимствованное) | borrow: `tsc_env_retain` перед возвратом |
| Элемент array literal (`[f, make()]`) | Ident-элемент — retain; call-элемент — move; cleanup массива: release по элементам |

```typescript
let fn: () => number = null;
{
    const n: number = 1;
    const c = (): number => n + 1;
    fn = c;        // copy: retain → refcount 2
}                 // scope-exit: release c → refcount 1
console.log(fn());   // 2 — безопасно, env жив
```

```c
// refcount trace: create 1 → copy retain 2 → block release 1 → main release 0 → destroy + dealloc
```

**Остаточные keep-alive утечки (осознанное ограничение):** env не освобождается (но и не dangling — leaks only, не UB) для: staged env компиляторных callback-adapter'ов (`_tsc_cb_env_N` в promise.then/catch/finally, таймерах setTimeout/setInterval), временных замыканий в argument position и отброшенных результатов фабричных вызовов. Причина: adapter'ы асинхронных C-API вызываются после смерти statement — release на post-stmt дал бы use-after-free. Плановое решение — интеграция с lifecycle промисов/таймеров.

**Compile error для ref/mut capture в escaping closure:** если closure с `[x: Ref<T>]` или `[x: Mut<T>]` захватом возвращается из функции — компилятор блокирует:

```typescript
function bad(): () => i32 {
    let x: i32 = 0;
    return [x: Mut<i32>](): i32 => x;  // error: Cannot capture 'x' by reference in an escaping closure
}
```

Value captures (примитивы, String через retain) разрешены в escaping closures.

### 6.2 Heap env и embedded static pool (#290, фаза 3 — реализовано)

**П1 (cross-platform):** embedded платформы без heap получают **static env pool** — free-list поверх статического байтового массива в `runtime.h` (ветка `#ifdef TSC_EMBEDDED`). Это НЕ кольцевой буфер (как строковый): освобождённые блоки переиспользуются, живые никогда не затираются.

| Аспект | Поведение |
|--------|-----------|
| Аллокация env | `tsc_env_alloc(sizeof(env))` на `allocator: "static"`; `tsc_malloc` на `allocator: "heap"` (desktop, avr-heap) |
| Дефолтный размер пула | Кодген суммирует оценки всех env-структур программы (заголовок ARC + поля + slack) и эмитит `#ifndef TSC_ENV_POOL_SIZE / #define TSC_ENV_POOL_SIZE <2×суммы, min 64> / #endif` перед `#include` |
| Оверрайд пользователя | `-DTSC_ENV_POOL_SIZE=<байты>` при компиляции C (побеждает через `#ifndef`) |
| Алгоритм | First-fit free-list со сплитом крупных блоков и коалесценгом соседних при освобождении |
| Исчерпание | Паника `panic[E403]: env pool exhausted: need N bytes, M in use, pool K bytes; raise TSC_ENV_POOL_SIZE` + abort — не тихая порча |
| `tsc_env_release` → dealloc | refcount 0 → destroy fn → `tsc_env_dealloc` (пул на embedded, `free` на heap) |
| Потоки | Контракт однопоточный (как весь runtime); ISR-безопасность не гарантируется |

Дефолтный размер рассчитан на типичную нагрузку (замыкания, живущие одновременно); фабрика в цикле, создающая много живых env одновременно, может исчерпать пул — паника назовёт точные числа, размер увеличивается `-D`-флагом без изменения кода.

### 6.3 Почему нет move capture

**П2 (TS compat):** в TS нет `move ||`. Концепция чуждая для TS-разработчика.

**Практика:** реальных use cases для move capture не найдено. Основной сценарий — shared mutable state (reference capture). Ownership transfer в closure — концепция из Rust, не из TS.

**Escaping scope** (единственный сценарий где move имеет смысл) решается heap-env + ARC (#290); move не нужен.

---

## 7. Отличия от TypeScript

### 7.1 Примитивы: общая ячейка в функциях, snapshot на верхнем уровне

```typescript
// Внутри функции — общая ячейка, идентично TypeScript (#295 v2c):
function demo(): void {
  let x: i32 = 1;
  const fn = (): i32 => x;
  x = 2;
  console.log(fn());   // 2 в TS и в TSClang
}
```

```typescript
// Верхний уровень программы — snapshot (стадийная граница v2c):
let x: number = 1;
const fn = (): number => x;
x = 2;
console.log(fn());   // TS: 2 (reference); TSClang: 1 (snapshot)
```

**Причина границы:** блок верхнего уровня (main-wrapper) не проходит block pre-scan — ячейки создаются только для блоков тел функций. Верхнеуровневые стрелки, мутирующие глобалы, продолжают работать через static-продвижение (`func-ref-vars.ts`) там, где это возможно.

### 7.2 Строки: общая ячейка в функциях, snapshot на верхнем уровне

```typescript
function demo(): void {
  let s: string = "hello";
  const fn = (): string => s;
  s = "world";
  console.log(fn());   // "world" в TS и в TSClang
}
```

На верхнем уровне — snapshot/retain (как 7.1). **Причина:** String = value type (ARC struct); в функциях ячейка живёт в block env (destroy fn делает release), на границах — retained copy в env стрелки.

### 7.3 Class/Array: идентично (reference/mutation)

```typescript
// TypeScript и TSClang — одинаково:
let arr: number[] = [1, 2, 3];
const fn = () => { arr[0] = 9; };
fn();
console.log(arr[0]);   // 9 в обоих случаях
```

**Это главное достижение:** для class/array поведение идентично TS. Mutations visible, source жив.

### 7.4 Нет GC → ARC-замыкания

TS: closures могут переживать scope (GC держит данные живыми).
TSClang: env = ARC-значение на heap (`tsc_malloc`) — замыкание переживает scope, копии/пере-присваивания безопасны (retain/release), детерминированный dealloc без GC.

**Trade-off:** +8 байт на env (refcount + destroy fn) и явные retain/release в выводе; взамен П1 (embedded — пул вместо GC) и предсказуемость.

---

## 8. Обоснование (П1–П3)

### П1: Кроссплатформенность (desktop + embedded)

- Env через профиль-зависимый аллокатор: `tsc_malloc` на heap-профилях, static free-list pool (`TSC_ENV_POOL_SIZE`) на `allocator: "static"` (#290 фаза 3)
- Pointer capture — C-compatible, zero-cost
- ARC env (refcount в заголовке) — без GC, детерминированный dealloc
- string retain — no-op на embedded (single-ownership)

### П2: Максимальная совместимость с TS

- Class/Array = reference capture (идентично TS)
- Mutations visible (идентично TS)
- Source жив после capture (идентично TS)
- Примитивы/string в функциях и телах замыканий = shared cell (идентично TS, #295 v2c, #298 s4); на верхнем уровне = прямая ссылка на продвинутый static global (#298 s1–s2, идентично TS module-scope); оставшиеся границы (explicit-capture #292, спец-итерируемые for-of #298 s5, `var`-hoisting внутри функций) = snapshot (отклонения, документированы)
- Нет `move ||` (нет аналога в TS)

### П3: Лучше чем TS/C/C++/Rust

- **Проще Rust:** нет Fn/FnMut/FnOnce, нет lifetime annotations
- **Безопаснее C:** нет dangling для same-scope (reference = pointer на живой stack var)
- **Предсказуемее TS:** нет hidden GC, ownership явный
- **Проще C++:** нет `std::function`, нет heap allocation, нет copy/move constructors

---

## 9. Тесты

| Тест | Что проверяет |
|------|--------------|
| `capture-primitive` | Примитив = copy, source жив |
| `capture-string-ref` | string = retain, destroy function, cleanup |
| `capture-ref` | Implicit class capture = reference (pointer) |
| `capture-move` | Implicit class capture = reference (pointer) |
| `capture-ref-explicit` | `[x: Ref<T>]` = const pointer |
| `capture-mut-explicit` | `[x: Mut<T>]` = mutable pointer |
| `capture-move-explicit` | `[x: Mut<T>]` = mutable pointer (переименован из move) |
| `capture-class-reference` | Source жив после implicit class capture |
| `closure-capture-array-reference` | Array reference, mutation видна снаружи |
| `closure-capture-class-mutation` | Class mutation через closure, count = 3 |
| `nested-closures` | Outer + inner, pointer chain, mutations видны |
| `transitive-capture` | Closure из функции, примитив capture |
| `closure-multi-capture` | Несколько переменных разных типов |
| `closure-scope-cleanup` | Cleanup при выходе из scope |
| `closure-return-from-fn` | Closure + несколько captures (примитивы) |
| `closure-pass-to-fn` | Передача closure как аргумент |
| `c-output` | Фрагмент C-output для closure |
| `arc-copy-outlives-scope` | Копия замыкания переживает scope (retain + churn — нет UB) |
| `arc-reassign-release` | Пере-присваивание освобождает старый env |
| `arc-return-copy` | Цепочка копий + return (move) без утечек/UB |
| `arc-param-return` | Возврат param-замыкания (borrow + retain) |
| `arc-factory-cleanup` | Фабрика: env освобождается после release результата |
| `arc-array-elems` | Замыкания в array literal: retain Ident / move call |
| `env-pool-avr` | Static env pool на AVR (avr-gcc + simavr): цикл create/retain/release, переиспользование блоков без исчерпания |
| `shared-cell-arrow` | Arrow в функции читает захваченный примитив через общую ячейку (v2c) |
| `shared-cell-arrow-mutate` | Мутация захваченного примитива из arrow видна снаружи |
| `shared-cell-arrow-factory` | Фабрика: arrow + `_outer` retain, вызовы после выхода из функции |
| `shared-cell-for-capture` | `for (let i...)`: escaping-стрелки держат значения своих итераций (0,1) |
| `shared-cell-for-mutate` | Мутация `i` в теле видна same-iteration стрелке + copy-out в header (v2c-2) |
| `shared-cell-forof-capture` | `for (const x of ...)`: escaping-стрелки держат значения итераций (10,20) |
| `shared-cell-forof-mutate` | `for (let x of ...)`: мутация `x` в теле видна same-iteration стрелке (v2c-2) |
| `toplevel-let-per-iteration` | Top-level `for (let i...)` + push стрелки: замыкания держат значения своих итераций (0,1,2) (#298 s3) |
| `toplevel-let-mutate-copyout` | Top-level `for (let i...)` + мутация после захвата: same-iteration видимость + copy-out до header-update (1,3) |
| `toplevel-var-single-binding` | Top-level `for (var i...)`: продвижение в static global, все замыкания видят последнее значение (3,3,3) |
| `toplevel-forof-per-iteration` | Top-level `for (const x of ...)`: per-iteration ячейки + вызов for-of-биндинга замыкания (10,20,30) |
| `nested-arrow-shared-cell` | Стрелка в теле замыкания делит ячейку с внешним телом через `_outer` (#298 s4, ожидает 3) |
| `outer-block-shared-cell` | Захват локали внешнего (не родительского) блока через env-цепочку (#298 s4, ожидает 3) |
| `deep-nesting-chain` | Трёхуровневая цепочка `_outer->_outer->_outer` — общая ячейка (#298 s4, ожидает 3) |
| `nested-blocks-two-envs` | Два последовательных блока с собственными env + захват из обоих (#298 s4, ожидает 203) |
| `named-fn-body-arrow-cell` | Стрелка в теле именованной вложенной функции — env-параметр как корень цепочки (#298 s4, ожидает 2) |
| `closure-body-let-loop-mutate` | `for (let...)` в теле замыкания: per-iteration cell + copy-out (#298 s4, ожидает 10) |
| `closure-body-early-return-escape` | Ранний `return` из тела замыкания: cleanup env до выхода, escape-копия в массиве удерживает env (push = retain) (#298 s4, ожидает 1) |
| `closure-body-string-cell` | string-ячейка в теле замыкания: destroy-release цепочки (#298 s4, ожидает abb) |
| `closure-body-forof-cell` | `for (const x of ...)` в теле замыкания: per-iteration ячейки (#298 s4, ожидает 6) |
| `err-capture-move-use` | `[x]` без type = compile error |
| `nested-fn/*` (13 кейсов) | Именованные вложенные функции — раздел 10: shared-cell capture, рекурсия, мутуальная рекурсия, фабрика, границы E020 |

---

## 10. Именованные вложенные функции — shared-cell env (#295, стадия v2b)

`function`-декларация, вложенная непосредственно в тело другой функции (не на top level), — hoisted замыкание с **shared-cell** захватом. С v2c arrow-замыкания в тех же блоках используют ту же модель (D2/D3): блок с вложенными `function` И/ИЛИ захватывающими arrow получает один env; env стрелки достигает ячеек через `_outer`-ссылку на block env, nested-функции — напрямую первым параметром.

### 10.1 Семантика

```typescript
function makeCounter(): () => i32 {
  let count: i32 = 0;                      // cell: живёт В env
  function inc(): i32 { count = count + 1; return count; }
  return inc;                               // замыкание уезжает, cell живёт в heap-env
}
const c = makeCounter();
console.log(c());   // 1
console.log(c());   // 2
```

Правила:

1. **Hoisting внутри блока.** Вложенная функция видна с начала блока — вызов до декларации работает (`hoisted-call`). Порядок объявлений свободен, как в TS.
2. **Shared cell.** Каждая захваченная переменная (прямой `let`/`const`-ребёнок блока ИЛИ параметр enclosing-функции, если блок — тело функции) получает ячейку в env. Enclosing-блок и все вложенные функции читают/пишут **одну** ячейку: `count = 10` после декларации видна внутри (`capture-after-write`), мутация изнутри видна снаружи при последующих вызовах. Это TS-истинное поведение — snapshot-границы D2 сюда не применяются.
3. **Один env на блок.** Если хоть одной вложенной функции нужны ячейки — блок получает один env-структур (`tsc_malloc`, refcount 1, ARC-заголовок), все вложенные функции блока принимают её первым параметром. Ячейки без потребности env не создаётся — функции получают `void *_env`.
4. **String-ячейки** — value в env; destroy fn env делает `tsc_string_release` по всем строковым ячейкам. Переприсваивание строковой ячейки (`msg = "ok"`) безопасно: старое значение отпускается обычным путём присваивания, финальный release — destroy fn.
5. **ARC lifecycle.** Env живёт до конца блока (release на cleanup блока), либо уезжает с возвращённым замыканием (`return inc` → retain, caller владеет). Копии binding'ов — retain по общим правилам 6.1.
6. **Рекурсия и мутуальная рекурсия.** Тело функции реконструирует локальные binding'и siblings/себя (`tsc_closure fact = {.env=..., .fn=...}` в топе тела); для перекрёстных ссылок компилятор эмитит forward-прототипы всех nested-функций блока.

### 10.2 C-конвенция

```c
typedef struct { tsc_env_hdr _hdr; int32_t count; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) { /* release string cells */ }

static int32_t _nested_1_inc(_nested_0_env *env) {
    env->count = env->count + 1;
    return env->count;
}

tsc_closure makeCounter(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    tsc_closure inc = {.env = env, .fn = (void*)_nested_1_inc};
    env->count = 0;                    // let count: i32 = 0 → запись в ячейку
    tsc_env_retain((inc).env);         // return inc: caller владеет
    tsc_closure _ret_0 = inc;
    tsc_env_release(env);              // release локальной ссылки блока
    return _ret_0;
}
```

- Декларация `let count` в блоке компилируется в `env->count = <init>` (хранение — в ячейке, не в C-локали).
- Блок без ячеек: функции блока получают `void *_env` (конвенция env-forwarding едина для всего, что хранится в `tsc_closure.fn`).
- Имена: `_nested_<N>_<fnName>` (N — счётчик замыканий модуля), env-тип `_nested_<M>_env`.

### 10.3 Границы стадии (E020)

| Конструкция | Ошибка |
|-------------|--------|
| Захват переменной из внешнего блока (не непосредственный родитель — тело функции с nested fn) | `error[E020]: invalid closure capture: nested function 'f' captures 'x' declared in an outer block` |
| Захват переменной без type-аннотации и без literal-инициализации | `error[E020]: invalid closure capture: captured variable 'x' needs a type annotation ...` |
| Именованная function внутри тела arrow-замыкания | `error[E020]: invalid closure capture: nested function declarations inside closures are not supported yet (planned for shared-cell closures)` |
| Дублирующиеся имена nested-функций в блоке | `error[E123]` |

Глобальные имена (scope 0) захватываются прямой ссылкой без ячеек. Статус v2c: arrow-захват в pre-scan'имых блоках переведён на общие ячейки (same-block locals + параметры enclosing-функции + loop-binding'и `for`/`for-of` с per-iteration env, v2c-2); первые два ограничения (захват из внешнего блока, захват без аннотации) остаются E020 до стадии общего env-chain.

### 10.4 Тесты

| Кейс | Проверяет |
|------|-----------|
| `nested-fn/basic` | Вложенная fn без захвата, вызов из блока |
| `nested-fn/capture-read` | Чтение cell внутри fn |
| `nested-fn/counter` | Фабрика makeCounter — мутация cell через вызовы |
| `nested-fn/hoisted-call` | Вызов до декларации (hoisting) |
| `nested-fn/recursion` | Саморекурсия (реконструкция собственного binding'а) |
| `nested-fn/mutual` | Мутуальная рекурсия + forward-прототипы |
| `nested-fn/callback` | Передача nested fn как аргумента higher-order функции |
| `nested-fn/param-capture` | Захват параметра enclosing-функции |
| `nested-fn/capture-after-write` | Запись в cell после декларации видна fn |
| `nested-fn/string-cell` | String-ячейка: destroy fn, переприсваивание |
| `nested-fn/err-in-closure` | E020: nested fn внутри arrow |
| `nested-fn/err-outer-capture` | E020: захват из внешнего блока |
| `nested-fn/err-untyped-capture` | E020: захват без аннотации |

---

## 11. Trampoline adapter для capturing callbacks

Runtime-макросы (например, `Array.map`, `Array.filter`, `Array.forEach`, `Set.forEach`) ожидают callback вида `void (*fn)(elem)` — без env-параметра. Когда callback является capturing closure (env struct ≠ пустой), компилятор генерирует **trampoline adapter**:

```c
// capturing closure: env содержит captured variable (+ ARC-заголовок)
typedef struct {
    tsc_env_hdr _hdr;
    String prefix;
} _closure_0_env;

static _closure_0_env *_tsc_cb_env_0;  // file-scope staging global

static String _closure_0_adapter(String elem) {
    return _closure_0_fn(_tsc_cb_env_0, elem);  // env-forwarding вызов
}

// использование в макросе:
tsc_string_retain(prefix);
_closure_0_env *_cb_env_0 = tsc_malloc(sizeof(_closure_0_env));
*_cb_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .prefix = prefix};
_tsc_cb_env_0 = _cb_env_0;
Array_String result = tsc_array_map_String(arr, _closure_0_adapter);
```

**Ограничения:**
- File-scope static pointer — **не реентрантно**. Вложенные capturing callbacks не поддерживаются.
- Приемлемо для TSClang: JS однопоточный, macros синхронные, вложенные capturing callbacks — редкий паттерн.
- Если captures = 0 (bare lambda), adapter вызывает лямбду с `NULL` env; передаётся adapter всегда (конвенция env-forwarding).
- Staged env (`_tsc_cb_env_0`) не release'ится после statement — keep-alive до конца программы (см. 6.1): асинхронные adapter'ы вызываются после смерти statement, release дал бы use-after-free.

### Тип замыкания с Mut-захватом

Замыкание с `Mut<T>` захватом имеет тип `() => T` — как и любое другое замыкание. Mutation видна в capture list, а не в типе функции.

```typescript
const inc = [c: Mut<Counter>](): void => c.increment()
// тип: () => void — одинаков с немутирующим замыканием

arr.forEach(item => log(item))       // () => void
arr.forEach(item => counter.inc())   // () => void — тот же тип, просто мутирует
```

> **Дизайн-решение: нет `mut () => T`.** Рассматривался вариант с отдельным типом `mut () => T` для замыканий с `Mut<T>` захватом — аналог `FnMut` в Rust. Отклонён по причине вирусности: каждая higher-order функция (`map`, `filter`, `forEach`, `sort`) потребовала бы `mut`-перегрузку, а generic callbacks — дополнительной аннотации. При этом mutation в TSClang уже явна: capture list `[c: Mut<Counter>]` нельзя написать случайно — она видна в коде. Дополнительная гарантия на уровне типа функции даёт малый выигрыш при высокой стоимости сложности.

### Mut-closure через await — запрещено

Closure с `[x: Mut<T>]` захватом удерживает mutable pointer на source. Если closure жива через `await` — ошибка компилятора:

```typescript
async function bad() {
    let arr: number[] = [1, 2, 3]
    const fn = [arr: Mut<number[]>]() => arr.push(1)  // arr captured by pointer
    await something()  // ← fn жива через await — ошибка
    fn()
}
// error: closure with Mut<T> capture cannot live across await
//   --> main.tsc:4:5
//    |
//  4 |     await something()
//    |     ^^^^^ closure 'fn' with Mut<number[]> capture still alive
//    |
//    = hint: complete closure before await or create after await
```

Два паттерна решения:

```typescript
// ✅ Вариант 1: вызвать closure до await
async function ok1() {
    let arr: number[] = [1, 2, 3]
    const fn = [arr: Mut<number[]>]() => arr.push(1)
    fn()               // вызвали — borrow освобождён
    await something()
}

// ✅ Вариант 2: создать closure после await
async function ok2() {
    let arr: number[] = [1, 2, 3]
    await something()
    const fn = [arr: Mut<number[]>]() => arr.push(1)  // свежий borrow после await
    fn()
}
```

---

## 12. Связь с другими спеками

| Спека | Связь |
|-------|-------|
| [04-primitives.md](../04-ownership/04-primitives.md) | Присваивание и владение. Closure capture = reference для class/array (не move). |
| [04-ownership.md](../04-ownership/04-ownership.md) | Модель памяти, borrow checker. Rule 5 (замыкания) — см. closures. |
| [05-for-of-iteration.md](../05-control-flow/05-for-of-iteration.md) | For-of = borrow (pointer) для complex. Closure = reference (pointer). Разные операции, похожий механизм. |
| [08-spread-destructuring.md](../08-collections/08-spread-destructuring.md) | Spread/destructuring = copy для всех. Closure = reference для class/array. Разные операции = разная семантика. |
| [06-functions.md](06-functions.md) | Синтаксис arrow functions и capture lists. |
| [03-types.md](../03-types/03-typing.md) | Типы: string, Array\<T\>, class types. |
