# Декораторы

[← Вверх](./index.md) | [Предыдущий ←](./generics.md)

---

Декораторы — языковой примитив compile-time трансформации AST. Выполняются между парсингом и проверкой типов, не попадают в рантайм-код. Три базовые конструкции (`decorator function`, Descriptor API, `meta`) дают достаточно выразительности для построения любых фреймворков.

## Философия

Декораторы — не фреймворк, а примитив. Явность: декоратор локально трансформирует код, связь между компонентами — через explicit bootstrap, не через глобальную регистрацию.

```
Язык (primitives)
  └── decorator function + descriptor API + meta
        └── Пользовательские декораторы
              └── Библиотеки / фреймворки
```

## Синтаксис применения

Декораторы применяются к следующей за ними конструкции. Форматирование не важно:

```typescript
@one @two @three method() { ... }

@one
@two
@three
method() { ... }
```

### Места применения

```typescript
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

Сигнатура определяет, к чему применим декоратор:

| Применение | Сигнатура |
|-----------|-----------|
| Класс | `(cls: ClassDesc): ClassDesc` |
| Метод | `(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc` |
| Свойство | `(cls: ClassDesc, key: string, desc: PropDesc): void` |
| Параметр | `(cls: ClassDesc, key: string, param: ParamDesc): void` |
| Standalone-функция | `(desc: FunctionDesc): FunctionDesc` |

Применение не туда — ошибка компилятора.

## Определение декоратора

```typescript
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
    desc.before((ctx) => {
        console.log(`[${key}] called`, ctx.args);
    });
    desc.after((ctx) => {
        console.log(`[${key}] done`, ctx.result);
    });
    return desc;
}

// Фабрика — возвращает декоратор
decorator function minLength(min: number) {
    return (cls: ClassDesc, key: string, desc: PropDesc): void => {
        desc.addValidation((value) => {
            if (value.length < min)
                throw new RangeError(`${key} must be >= ${min} chars`);
        });
    };
}
```

## Модель выполнения

`decorator function` выполняется **исключительно в compile time**:

- Не компилируется в C, не попадает во flash, нулевой рантайм-оверхед
- Каждый декоратор инлайнит код на каждое применение — учитывайте на flash-ограниченных платформах
- `throw` внутри декоратора → compile-time ошибка с указанным сообщением
- Circular dependency между декораторами → ошибка компиляции

### Захват переменных в before() / after()

Callback в `before()`/`after()` — шаблон кода, инлайнится в тело метода. Можно захватывать только comptime-значения:

```typescript
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
    const tag = `[${key}]`;       // ok — comptime-строка
    const logger = new Logger();  // ошибка — рантайм-объект

    desc.before((ctx) => {
        console.log(tag, ctx.args);  // ok
        logger.log(ctx.args);       // ошибка: cannot capture runtime value
    });
    return desc;
}
```

## Порядок применения

Пользовательские декораторы — вычисляются сверху вниз, применяются снизу вверх:

```typescript
@A   // вычислен первым, применён вторым
@B   // вычислен вторым, применён первым
method() {}
// результат: A(B(method))
```

Встроенные декораторы (`@static`, `@readonly`) обрабатываются в последней фазе, независимо от позиции.

## Встроенные comptime-типы

Доступны без импорта, существуют только в compile time:

`ClassDesc`, `MethodDesc`, `PropDesc`, `ParamDesc`, `MetaStore`, `MethodCtx`, `FunctionDesc`, `FunctionCtx`, `SelfRef`

## Дескрипторный API

### MethodDesc

```typescript
interface MethodCtx<Params extends any[] = any[], Return = any> {
    self:   SelfRef;
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

### PropDesc

```typescript
interface PropDesc {
    name: string;
    type: string;
    addValidation<T = unknown>(fn: (value: T) => void): void;
    makeAccessor<T = unknown>(get: () => T, set: (v: T) => void): void;
    meta: MetaStore;
}
```

### ParamDesc

```typescript
interface ParamDesc {
    name:  string;
    type:  string;
    index: number;
    addTransform<T = unknown>(fn: (value: T) => T): void;
    addCheck<T = unknown>(fn: (value: T) => void): void;
}
```

### ClassDesc

```typescript
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
    addMethod(name: string, impl: (...args: any[]) => any): void;
    meta: MetaStore;
}
```

Методы, добавленные через `addMethod()`, — полноправные методы класса, могут выполнять требования интерфейсов.

### SelfRef

```typescript
interface SelfRef {
    field<T>(name: string): T;   // name — comptime-строка → self->field_name в C
}
```

### MetaStore

```typescript
interface MetaStore {
    set<T = any>(key: string, value: T): void;
    get<T = any>(key: string): T | undefined;
    has(key: string): boolean;
}
```

Существует только в compile time. В рантайме недоступна.

## Comptime-метаданные

`meta` — произвольные данные на дескрипторах в compile time. Пример — роутинг:

```typescript
export interface RouteInfo { method: string; path: string; }

export decorator function Get(path: string) {
    return (cls: ClassDesc, key: string, desc: MethodDesc): void => {
        desc.meta.set<RouteInfo>('route', { method: 'GET', path });
    };
}

class UsersController {
    @Get('/users/:id')
    getUser(id: string): User { ... }
}
```

## Декораторы на async-методах

`before()` и `after()` работают с логическим lifecycle: `before()` при первом вызове, `after()` при завершении. Переменные из `before()` видны в `after()` — компилятор продвигает их в SM struct автоматически:

```typescript
decorator function timing(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
    desc.before((_ctx) => {
        const start = performance.now();   // продвигается в SM struct
    });
    desc.after((_ctx) => {
        console.log(`[${key}] took ${performance.now() - start}ms`);
    });
    return desc;
}
```

## Экспорт и импорт

```typescript
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

## Паттерны

| Паттерн | Реализация |
|---------|-----------|
| Guard | `before()` + условие |
| Interceptor | `before()` + `after()` |
| Validator | параметр-декоратор + `addCheck` / `addTransform` |
| Middleware | класс-декоратор, применяет `before()` ко всем методам |
| Routing | `meta.set('route', ...)` |
| DI | `meta.set('inject', ...)` |
| Memoization | `cls.addField()` + `before()`/`after()` |

## Встроенные декораторы

### @packed

Упаковывает структуру без padding. C-output: `__attribute__((packed))`.

```typescript
@packed
class Packet {
    type: u8;
    length: u16;
    checksum: u32;
}
```

```c
typedef struct __attribute__((packed)) {
    uint8_t type; uint16_t length; uint32_t checksum;
} Packet;
```

На платформах с `unaligned_access: false` (AVR, Cortex-M0) доступ к многобайтовым полям через `tsc_read_unaligned_u16`/`tsc_read_unaligned_u32`.

### @align(N)

Выравнивание структуры на N байт (степень двойки). C-output: `__attribute__((aligned(N)))`.

```typescript
@align(16)
class SimdVector {
    x: f32; y: f32; z: f32; w: f32;
}
```

```c
typedef struct __attribute__((aligned(16))) {
    float x; float y; float z; float w;
} SimdVector;
```

`@packed` и `@align(N)` на одной структуре — ошибка компилятора.

### @static

Размещает объект в BSS (static lifetime). Несколько `Mut<T>` разрешены.

### @embedded.*

Embedded-специфичные декораторы:

| Декоратор | Описание |
|-----------|----------|
| `@embedded.inline` | Value type без heap и vtable, копируется как C struct |
| `@embedded.pool(N)` | Статический пул N слотов в BSS; `Cls.alloc()` → `Cls \| null` |
| `@embedded.singleton` | Единственный экземпляр в BSS; `Cls.instance()` → `Mut<Cls>` |
| `@embedded.stack(name, N)` | Статический стек для async-рекурсии: N frame slots |
| `@embedded.isr` | Обработчик прерываний; запрет alloc, throw, await |
| `@embedded.noHeap` | Запрещает heap-аллокации в функции |

### @signal

Декоратор реактивного сигнала. См. [std/reactive](../../spec/10-stdlib.md).

### @platform

Условная компиляция — платформо-зависимые реализации одной функции/класса:

```typescript
@platform("avr")
function readPin(pin: u8): u8 { ... }

@platform("desktop")
function readPin(pin: u8): u8 { ... }
```

## Модель кодогенерации

Каждый декоратор генерирует отдельный C-wrapper вокруг тела метода. Несколько декораторов образуют цепочку вызовов:

```typescript
@timing   // внешний
@guard    // средний
@log      // внутренний
greet(name: string): string { ... }
```

```c
// Оригинальное тело
static char* MyService_greet__body(MyService* self, const char* name) {
    return tsc_sprintf("Hello %s", name);
}

// Внутренний: @log
static char* MyService_greet__log(MyService* self, const char* name) {
    printf("[greet] called\n");
    char* _r = MyService_greet__body(self, name);
    printf("[greet] done\n");
    return _r;
}

// Средний: @guard
static char* MyService_greet__guard(MyService* self, const char* name) {
    if (!authorized()) return NULL;
    return MyService_greet__log(self, name);
}

// Внешний: @timing
char* MyService_greet(MyService* self, const char* name) {
    double _start = tsc_performance_now();
    char* _r = MyService_greet__guard(self, name);
    printf("[greet] took %.2fms\n", tsc_performance_now() - _start);
    return _r;
}
```

### Именование функций

| Функция | Паттерн |
|---------|---------|
| Оригинальное тело | `ClassName_method__body` |
| Wrapper декоратора | `ClassName_method__decoratorName` |
| Публичная точка входа | `ClassName_method` (последний wrapper) |

## C-output

### @log на методе

```typescript
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

### @minLength(3) на свойстве

```typescript
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

### @timing на async-методе

```typescript
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
    double   start;    // продвинуто в SM struct
    TscFetch fetch_op;
    char*    result;
} DataService_fetchData_SM;

int DataService_fetchData_tick(DataService_fetchData_SM* sm, const char* url) {
    switch (sm->state) {
        case 0:
            sm->start = tsc_performance_now();
            tsc_fetch_start(&sm->fetch_op, url);
            sm->state = 1;
            return TSC_PENDING;
        case 1:
            sm->result = tsc_fetch_text(&sm->fetch_op);
            sm->state = 2;
        case 2:
            printf("[fetchData] took %.2fms\n", tsc_performance_now() - sm->start);
            return TSC_DONE;
    }
}
```

## Диагностика padding

В режиме `debug` компилятор предупреждает о неэффективных структурах:

```typescript
class Inefficient {
    a: u8;   // 1 байт + 3 байта padding
    b: u32;  // 4 байта
    c: u8;   // 1 байт + 3 байта padding
    d: u32;  // 4 байта
}
// warning: struct 'Inefficient' has 6 bytes of avoidable padding; consider reordering fields
```

В режиме `embedded` с `allocator: "none"` — предупреждение становится ошибкой.

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `@packed and @align are incompatible` | Оба декоратора на одной структуре |
| `@methodOnly expects a class method, not a standalone function` | Неверное место применения |
| `cannot capture runtime value 'logger' in desc.before()` | Захват рантайм-объекта в comptime-контекст |
| `@readonly can only be applied to properties` | Встроенный декоратор на неверной конструкции |
| `const enum has no runtime table` | Утилиты на `const enum` |
| `struct has N bytes of avoidable padding` | Неэффективная раскладка полей (debug) |

## См. также

- [Классы](./classes.md) — `@packed`, `@align` на структурах
- [Generics](./generics.md) — generic constraints в декораторах
- [Конкурентность](../07-concurrency/index.md) — `@embedded.*`, `@signal`
- [Модули](../08-modules/index.md) — `@platform`, условная компиляция
- [Спецификация: Декораторы](../../spec/13-decorators.md) — полное описание
