# TSClang — Декораторы

## Философия

Декораторы — языковой примитив, не фреймворк. Три базовые конструкции
дают достаточно выразительности, чтобы поверх них построить любой фреймворк
(роутинг, DI, валидация, guards, interceptors, middleware).

Главный принцип — **явность**: декоратор локально трансформирует код,
а связь между компонентами выстраивается через explicit bootstrap, не через
магическую глобальную регистрацию.

```
Язык (primitives)
  └── decorator function + descriptor API + meta
        └── Пользовательские декораторы
              └── Библиотеки / фреймворки
```

---

## Синтаксис применения

Декораторы применяются к следующей за ними синтаксической конструкции.
Форматирование не важно — в строку или многострочно, результат одинаков:

```ts
// Всё это эквивалентно
@one @two @three method() { ... }

@one
@two
@three
method() { ... }

@one @two
@three method() { ... }
```

Декоратором может быть любой callable с правильной сигнатурой.
`decorator function` — форма объявления именованного декоратора.

### Места применения

```ts
@classDecorator
class Foo {
  @propDecorator
  name: string;

  @methodDecorator
  greet(@paramDecorator msg: string): void { ... }
}

@functionDecorator
function standalone(x: number): number { ... }
```

Сигнатура декоратора определяет к чему он применяется:

| Применение | Сигнатура |
|-----------|-----------|
| Класс | `(cls: ClassDesc): ClassDesc` |
| Метод | `(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc` |
| Свойство | `(cls: ClassDesc, key: string, desc: PropDesc): void` |
| Параметр | `(cls: ClassDesc, key: string, param: ParamDesc): void` |
| Standalone-функция | `(desc: FunctionDesc): FunctionDesc` |

Применение не туда — ошибка компилятора:

```ts
decorator function methodOnly(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc { ... }

@methodOnly   // error: @methodOnly expects a class method, not a standalone function
function foo() { }
```

---

## Определение декоратора

Декоратор объявляется через `decorator function`. Выполняется во время компиляции,
получает дескриптор, возвращает (опционально) модифицированный дескриптор.

Тело декоратора — обычные TSClang-функции, не строки с кодом.
Comptime-значения (имя метода, аргументы фабрики) захватываются замыканием
и интерполируются при кодогенерации.

Декоратор, возвращающий `void` — корректен: означает "без изменений".

**Правило именования:**
- Именованный декоратор → `decorator function`
- Анонимный (возвращаемый из фабрики) → обычная стрелка, компилятор выводит по контексту

```ts
// Именованный метод-декоратор
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
  desc.before((ctx) => {
    console.log(`[${key}] called`, ctx.args);
  });
  desc.after((ctx) => {
    console.log(`[${key}] done`, ctx.result);
  });
  return desc;
}

// Фабрика — внешняя помечена, внутренняя стрелка выводится по контексту
decorator function minLength(min: number) {
  return (cls: ClassDesc, key: string, desc: PropDesc): void => {
    desc.addValidation((value) => {
      if (value.length < min)
        throw new RangeError(`${key} must be >= ${min} chars`);
    });
  };
}

// Параметр-декоратор
decorator function isUUID(cls: ClassDesc, key: string, param: ParamDesc): void {
  param.addCheck((value) => {
    if (!UUID_REGEX.test(value))
      throw new TypeError(`${param.name} must be a valid UUID`);
  });
}
```

---

## Модель выполнения

`decorator function` выполняется **исключительно в compile time**:
- Не компилируется в C, не попадает во flash, нулевой рантайм-оверхед
- Каждый декоратор инлайнит свой код на каждое применение — учитывай на flash-ограниченных платформах
- Бесконечный цикл → компилятор прерывает по лимиту итераций
- `throw` внутри декоратора → compile-time ошибка с указанным сообщением
- `decorator function` может вызывать обычные функции; runtime-операции → ошибка компилятора
- Circular dependency → если декоратор A при выполнении вызывает декоратор B,
который вызывает A — компилятор обнаруживает цикл и выдаёт ошибку компиляции

```ts
// throw для валидации применения:
decorator function requiresAsync(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
  if (!desc.isAsync)
    throw new Error(`@requiresAsync can only be applied to async methods`);
  return desc;
}
```

### Захват переменных в `before()` / `after()`

Callback, передаваемый в `before()` / `after()`, — это **шаблон кода**, который
инлайнится в тело метода. Это не обычное замыкание.

**Правило:** из внешней области можно захватить только comptime-значения.
Рантайм-объекты захватывать нельзя — ошибка компилятора.

```ts
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
  const tag = `[${key}]`;       // ✓ comptime-строка
  const logger = new Logger();  // ✗ рантайм-объект

  desc.before((ctx) => {
    console.log(tag, ctx.args); // ✓ tag — comptime, console.log — глобальная функция
    logger.log(ctx.args);       // ✗ error: cannot capture runtime value 'logger'
  });                           //          in desc.before() — only comptime values allowed
  return desc;
}
```

Можно захватить: comptime-значения (`key`, `cls.name`, аргументы фабрики),
глобальные функции и константы (`console.log`, регулярные выражения).

Ошибка захвата указывает на реализацию декоратора (не на место применения), потому что
проблема в самом декораторе.

Кейс мемоизации — решается через `cls.addField()` без захвата рантайм-объекта:

```ts
decorator function memoize(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
  const cacheName = `_cache_${key}`;           // comptime-строка
  cls.addField(cacheName, 'Map<string, any>'); // добавляет поле в класс

  desc.before((ctx) => {
    const hit = ctx.self.field<Map<string, any>>(cacheName).get(JSON.stringify(ctx.args));
    if (hit !== undefined) return hit;
  });
  desc.after((ctx) => {
    ctx.self.field<Map<string, any>>(cacheName).set(JSON.stringify(ctx.args), ctx.result);
  });
  return desc;
}
```

---

## Порядок применения

**Пользовательские декораторы** — вычисляются сверху вниз, применяются снизу вверх:

```ts
@A   // вычислен первым, применён вторым
@B   // вычислен вторым, применён первым
method() {}
// результат: A(B(method))
```

Для фабрик: `@A(1) @B(2)` → сначала вычисляются `A(1)` и `B(2)`, затем применяются `B`, потом `A`.

**Встроенные декораторы** (`@static`, `@readonly`) — всегда обрабатываются в последней фазе,
независимо от позиции. Неверная семантическая позиция — ошибка компилятора:

```ts
// Эквивалентно:
@log @static async function fetchData() { ... }
@static @log async function fetchData() { ... }

class Foo {
  @readonly          // error: @readonly can only be applied to properties
  greet(): void { ... }
}
```

Неверная семантическая позиция встроенного декоратора — **ошибка компилятора**:

```ts
class Foo {
  @readonly          // error: @readonly can only be applied to properties
  greet(): void { ... }
}

function foo(@static id: string) { ... }  // error: @static cannot be applied to parameters
```

---

## Встроенные comptime-типы

Доступны везде без импорта. Существуют только в compile time, в рантайме не представлены:

`ClassDesc`, `MethodDesc`, `PropDesc`, `ParamDesc`, `MetaStore`, `MethodCtx`,
`FunctionDesc`, `FunctionCtx`, `SelfRef`

`ClassType` — глобальный рантайм-тип (конструктор класса):

```ts
type ClassType<T = any> = new (...args: any[]) => T;
```

---

## Дескрипторный API

### MethodDesc

`MethodDesc` — generic по типам параметров и возвращаемому значению метода.
Компилятор инстанциирует его с конкретными типами при применении декоратора.
Generics в декораторе опциональны: без них `ctx.args: any[]`, с ними — полная типизация.

```ts
interface MethodCtx<Params extends any[] = any[], Return = any> {
  self:   SelfRef;  // доступ к полям экземпляра
  args:   Params;
  result: Return;   // только в after()
}

interface MethodDesc<Params extends any[] = any[], Return = any> {
  params:     ParamDesc[];
  returnType: string;
  isAsync:    boolean;

  before(fn: (ctx: MethodCtx<Params, Return>) => void): void;
  after(fn: (ctx: MethodCtx<Params, Return>) => void): void;

  meta: MetaStore;
}
```

Пример — декоратор без generics (простой случай):

```ts
// ctx.args: any[] — достаточно для @log, @timing и подобных
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
  desc.before((ctx) => { console.log(`[${key}] called`, ctx.args); });
  desc.after((ctx) => { console.log(`[${key}] done`, ctx.result); });
  return desc;
}
```

Пример — декоратор с generics (строгая типизация):

```ts
// ctx.args: P — компилятор выводит P и R из конкретного метода
decorator function validate<P extends any[], R>(
  cls: ClassDesc,
  key: string,
  desc: MethodDesc<P, R>
): MethodDesc<P, R> {
  desc.before((ctx) => {
    for (const arg of ctx.args) {  // ctx.args типизирован как P
      if (arg == null) throw new TypeError(`${key}: null argument`);
    }
  });
  return desc;
}
```

### PropDesc

```ts
interface PropDesc {
  name: string;
  type: string;

  addValidation<T = unknown>(fn: (value: T) => void): void;
  // T выводится из типа свойства при применении декоратора; превращает поле в accessor
  // Несколько addValidation() на одном свойстве — все добавляются в setter-цепочку,
  // порядок выполнения снизу вверх (как порядок применения декораторов)
  makeAccessor<T = unknown>(get: () => T, set: (v: T) => void): void;

  meta: MetaStore;
}
```

### ParamDesc

```ts
interface ParamDesc {
  name:  string;
  type:  string;
  index: number;

  addTransform<T = unknown>(fn: (value: T) => T): void;  // T выводится из типа параметра при применении
  addCheck<T = unknown>(fn: (value: T) => void): void;
}
```

### FunctionDesc

Для standalone-функций вне классов. Компилятор определяет применимость
декоратора по сигнатуре: принимает `FunctionDesc` → только для standalone-функций.

```ts
interface FunctionCtx<Params extends any[] = any[], Return = any> {
  args:   Params;
  result: Return;
}

interface FunctionDesc<Params extends any[] = any[], Return = any> {
  name:       string;
  params:     ParamDesc[];
  returnType: string;
  isAsync:    boolean;

  before(fn: (ctx: FunctionCtx<Params, Return>) => void): void;
  after(fn: (ctx: FunctionCtx<Params, Return>) => void): void;

  meta: MetaStore;
}
```

Один декоратор для обоих случаев — через перегрузку:

```ts
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc;
decorator function log(desc: FunctionDesc): FunctionDesc;
```

### ClassDesc

```ts
interface FieldOptions {
  readonly?:   boolean;
  static?:     boolean;
  visibility?: 'public' | 'protected' | 'private';
  init?:       any;
}

interface ClassDesc {
  name:            string;
  baseClass:       string | null;
  interfaces:      string[];
  instanceMethods: string[];
  staticMethods:   string[];
  constructor:     MethodDesc | null;

  implements(name: string): boolean;
  method(key: string): MethodDesc;
  addField(name: string, type: string, options?: FieldOptions): void;
  // Коллизия имён → ошибка компилятора
  addMethod(name: string, impl: (...args: any[]) => any): void;
  // Коллизия имён → ошибка компилятора

  meta: MetaStore;
}
```

Методы добавленные через `addMethod()` — полноправные методы класса,
могут выполнять требования интерфейсов. Декораторы применяются в препассе до type-check,
поэтому добавленные методы видны type-checker'у наравне с явно объявленными.

**Порядок видимости:** метод виден только декораторам, выполняемым позже (выше по позиции).
Это явное поведение, не баг:

```ts
@logAllMethods  // выполняется вторым — видит helper()  ✓
@addHelper      // выполняется первым — добавляет helper()
class Foo {}

@addHelper      // выполняется вторым
@logAllMethods  // выполняется первым — не видит helper()  ожидаемо
class Bar {}
```

**Декораторы на добавленных методах не поддерживаются.**
Если нужен декорированный метод — объявляй его в классе явно:

```ts
// Нельзя:
cls.addMethod('helper', `@log (x: number): number => x * 2`);

// Правильно:
class Foo {
  @log
  helper(x: number): number { return x * 2; }
}
```

**Сообщения об ошибках:**
- Ошибка в теле добавленного метода → указывает на `cls.addMethod()` в декораторе
- Добавленный метод не соответствует интерфейсу → указывает на `implements` +
  примечание: "метод добавлен декоратором `@addSerializer` (файл:строка)"

**Инкрементальная компиляция:** не является отдельной проблемой — декоратор всегда
импортируется, импорт создаёт зависимость в графе компилятора автоматически.

### SelfRef

```ts
interface SelfRef {
  field<T>(name: string): T;
  // name — comptime-строка → self->field_name в C
  // runtime-строка → ошибка компилятора
}
```

### MetaStore

```ts
interface MetaStore {
  set<T = any>(key: string, value: T): void;  // значения: примитивы, plain objects, массивы
  get<T = any>(key: string): T | undefined;
  has(key: string): boolean;
}
```

`MetaStore` существует только в compile time. В рантайме недоступна.
Если два декоратора пишут `meta.set` с одним ключом на одном таргете — побеждает тот, что выполнился позже (выше по порядку).

---

## Comptime-метаданные

`meta` — языковой примитив для хранения произвольных данных на дескрипторах в compile time.
Как фреймворк использует эти данные — его дело.

**Правила:**
- `meta.set` / `meta.get` доступны в любом `decorator function` и comptime-контексте
- Метаданные существуют только в compile time — в рантайме недоступны
- Типобезопасность через generic: `meta.set<RouteInfo>('route', {...})`

**Пример — пометить метод маршрутом (иллюстрация, не реализация фреймворка):**

```ts
// Определение в библиотеке
export interface RouteInfo { method: string; path: string; }

export decorator function Get(path: string) {
  return (cls: ClassDesc, key: string, desc: MethodDesc): void => {
    desc.meta.set<RouteInfo>('route', { method: 'GET', path });
  };
}

// Использование
class UsersController {
  @Get('/users/:id')
  getUser(id: string): User { ... }
}
```

Что фреймворк делает с этими метаданными — вне спеки языка.

---

## Декораторы на async-методах

`before()` и `after()` работают с **логическим lifecycle**:
- `before()` → выполняется при первом вызове (`STATE_INIT`)
- `after()` → выполняется при завершении (`STATE_DONE`)

`before()` и `after()` образуют единый инлайн-блок — переменные из `before()` видны в `after()`.
Через границу `await` компилятор продвигает их в SM struct автоматически:

```ts
// Это работает на async-методах без изменений
decorator function timing(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
  desc.before((_ctx) => {
    const start = performance.now();  // продвигается в SM struct автоматически
  });
  desc.after((_ctx) => {
    console.log(`[${key}] took ${performance.now() - start}ms`);
  });
  return desc;
}
```

---

## Дженерики и декораторы

Когда декоратор применяется к методу дженерик-класса, `desc.returnType` содержит
строковое имя параметра типа (`"T"`), не конкретный тип. Параметр типа не привязан.

Декораторы, не зависящие от конкретных типов (`@log`, `@timing`, `@guard`),
работают с дженерик-классами без изменений.

Декораторы, зависящие от конкретного типа, используют **generic-ограничение на декораторе** —
компилятор сам не даст применить его к несовместимому типу:

```ts
decorator function validatePositive<P extends any[], R extends number>(
  cls: ClassDesc, key: string, desc: MethodDesc<P, R>
): MethodDesc<P, R> {
  desc.after((ctx) => {
    if (ctx.result < 0) throw new RangeError(`${key} must return positive value`);
  });
  return desc;
}

class Container<T> {
  @validatePositive   // error: R=T does not satisfy constraint 'number'
  get(): T { ... }
}

class Counter {
  @validatePositive   // OK — R=number satisfies 'number'
  get(): number { ... }
}
```

`desc.returnType: string` — для сообщений об ошибках и кодогенерации. Структурное сравнение типов через generic-ограничения, не через инспекцию строки.

---

## Доступ к параметрам метода

Метод-декоратор работает с методом в целом, параметр-декоратор — с конкретным параметром.
Смешивать не нужно.

| Декоратор | Доступ |
|-----------|--------|
| Метод (`@log`, `@guard`) | `ctx.args` — все аргументы; `ctx.result` — результат |
| Параметр (`@isUUID`, `@minLength`) | `param.addCheck` / `param.addTransform` — знает свой параметр напрямую |

---

## Декоратор и платформа

Декоратор не знает целевую платформу заранее — и не должен.

Decorator-generated код подчиняется тем же платформенным ограничениям, что и любой другой код.
Ошибка указывает на **место применения декоратора**, не на его реализацию:

```
controllers/user.tsc:12 — @log requires console.log,
                          unavailable on platform "avr"
```

`addField()` с heap-типом на `allocator: "none"` — двойная ошибка:
на `addField()` в декораторе + примечание на месте применения.

---

## Экспорт и импорт

Декораторы экспортируются и импортируются как обычные функции:

```ts
// decorators.tsc
export decorator function log(...) { ... }
export decorator function minLength(min: number) { ... }

// user.tsc
import { log, minLength } from './decorators';

class User {
  @log
  @minLength(3)
  name: string;
}
```

---

## Паттерны

| Паттерн | Реализация |
|---------|-----------|
| Guard | `before()` + условие |
| Interceptor | `before()` + `after()` |
| Pipe / Validator | параметр-декоратор + `addCheck` / `addTransform` |
| Middleware | класс-декоратор, применяет `before()` ко всем методам |
| Routing | `meta.set('route', ...)` |
| DI | `meta.set('inject', ...)` |

---

## Фазы компилятора

Декораторы применяются строго между парсингом и проверкой типов.
См. [11-compiler.md](11-compiler.md) — фаза "Decorator pass".

---

## Модель кодогенерации

### Цепочка wrapper-функций

Каждый декоратор генерирует отдельный C-wrapper вокруг тела метода.
Несколько декораторов образуют цепочку вызовов — каждый уровень оборачивает предыдущий.

**Гарантия:** `after()` выполняется при любом выходе из метода — включая ранние `return`
из внутренних декораторов. Внешний декоратор всегда оборачивает всё.

**Оверхед:** N декораторов = N стек-фреймов. На embedded это осознанный выбор разработчика.
Компилятор не меняет семантику ради экономии памяти.

**Порядок:** декораторы применяются снизу вверх → внутренний wrapper генерируется первым,
внешний оборачивает его.

```ts
@timing   // внешний
@guard    // средний
@log      // внутренний
greet(name: string): string { ... }
```

```c
// Внутренний: @log
static char* MyService_greet__log(MyService* self, const char* name) {
    printf("[greet] called\n");
    char* _r = MyService_greet__body(self, name);
    printf("[greet] done\n");
    return _r;
}

// Средний: @guard
static char* MyService_greet__guard(MyService* self, const char* name) {
    if (!authorized()) return NULL;  // ранний выход — @log не вызовется
    return MyService_greet__log(self, name);
}

// Внешний: @timing — выполняется всегда независимо от guard
char* MyService_greet(MyService* self, const char* name) {
    double _start = tsc_performance_now();
    char* _r = MyService_greet__guard(self, name);
    printf("[greet] took %.2fms\n", tsc_performance_now() - _start);
    return _r;
}

// Оригинальное тело — вынесено в отдельную функцию
static char* MyService_greet__body(MyService* self, const char* name) {
    return tsc_sprintf("Hello %s", name);
}
```

### Именование функций

| Функция | Паттерн |
|---------|---------|
| Оригинальное тело | `ClassName_method__body` |
| Wrapper декоратора | `ClassName_method__decoratorName` |
| Публичная точка входа | `ClassName_method` (последний wrapper) |

### Компиляция `ctx.self.field<T>(name)`

`ctx.self.field<T>(name)` — доступ к полю экземпляра по comptime-строке.
Компилятор разрешает имя при компиляции и генерирует прямой C-доступ к полю.

```ts
ctx.self.field<Map<string, any>>('_cache_greet')
// → self->_cache_greet
```

**Правила:**

| Ситуация | Результат |
|----------|-----------|
| `name` — comptime-строка, поле существует, тип совпадает | `self->field_name` |
| `name` — comptime-строка, поле не существует | ошибка: unknown field '_cache_greet' |
| `name` — comptime-строка, тип `T` не совпадает | ошибка: field '_cache_greet' has type X, expected T |
| `name` — runtime-строка | ошибка: field name must be a compile-time string |

Поле должно быть объявлено в классе или добавлено через `cls.addField()` до обращения.

---

## C-вывод

### `@log` на обычном методе

```ts
class MyService {
  @log
  greet(name: string): string {
    return `Hello ${name}`;
  }
}
```

```c
char* MyService_greet(MyService* self, const char* name) {
    printf("[greet] called\n");

    char* _result = tsc_sprintf("Hello %s", name);

    printf("[greet] done\n");
    return _result;
}
```

### `@timing` на async-методе

```ts
class DataService {
  @timing
  async fetchData(url: string): Promise<string> {
    const res = await fetch(url);
    return res.text();
  }
}
```

```c
typedef struct {
    int      state;
    double   start;    // <-- продвинуто в SM struct компилятором
    TscFetch fetch_op;
    char*    result;
} DataService_fetchData_SM;

int DataService_fetchData_tick(DataService_fetchData_SM* sm, const char* url) {
    switch (sm->state) {
        case 0:  // STATE_INIT — before()
            sm->start = tsc_performance_now();
            tsc_fetch_start(&sm->fetch_op, url);
            sm->state = 1;
            return TSC_PENDING;
        case 1:  // STATE_AWAIT
            sm->result = tsc_fetch_text(&sm->fetch_op);
            sm->state = 2;
            // fall through
        case 2:  // STATE_DONE — after()
            printf("[fetchData] took %.2fms\n", tsc_performance_now() - sm->start);
            return TSC_DONE;
    }
}
```

### `@minLength(3)` на свойстве

```ts
class User {
  @minLength(3)
  name: string;
}
```

```c
void User_set_name(User* self, const char* value) {
    if (strlen(value) < 3)
        tsc_throw_range("name must be >= 3 chars");
    self->name = value;
}

const char* User_get_name(User* self) {
    return self->name;
}
```
