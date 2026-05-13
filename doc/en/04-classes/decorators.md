# Decorators

[← Up](./index.md) | [Previous ←](./generics.md)

---

Decorators are a language primitive for compile-time AST transformation. They execute between parsing and type checking, do not end up in runtime code. Three basic constructs (`decorator function`, Descriptor API, `meta`) provide enough expressiveness to build any frameworks.

## Philosophy

Decorators are not a framework, but a primitive. Explicitness: a decorator locally transforms code, connection between components is via explicit bootstrap, not global registration.

```
Language (primitives)
  └── decorator function + descriptor API + meta
        └── User-defined decorators
              └── Libraries / frameworks
```

## Application syntax

Decorators apply to the construct that follows them. Formatting does not matter:

```typescript
@one @two @three method() { ... }

@one
@two
@three
method() { ... }
```

### Application sites

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

The signature determines what the decorator can be applied to:

| Application | Signature |
|-----------|-----------|
| Class | `(cls: ClassDesc): ClassDesc` |
| Method | `(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc` |
| Property | `(cls: ClassDesc, key: string, desc: PropDesc): void` |
| Parameter | `(cls: ClassDesc, key: string, param: ParamDesc): void` |
| Standalone function | `(desc: FunctionDesc): FunctionDesc` |

Applying to the wrong site — compiler error.

## Defining a decorator

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

// Factory — returns a decorator
decorator function minLength(min: number) {
    return (cls: ClassDesc, key: string, desc: PropDesc): void => {
        desc.addValidation((value) => {
            if (value.length < min)
                throw new RangeError(`${key} must be >= ${min} chars`);
        });
    };
}
```

## Execution model

`decorator function` executes **exclusively at compile time**:

- Not compiled to C, not placed in flash, zero runtime overhead
- Each decorator inlines code at every application — consider on flash-constrained platforms
- `throw` inside a decorator → compile-time error with the specified message
- Circular dependency between decorators → compilation error

### Variable capture in before() / after()

The callback in `before()`/`after()` is a code template, inlined into the method body. Only comptime values can be captured:

```typescript
decorator function log(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
    const tag = `[${key}]`;       // ok — comptime string
    const logger = new Logger();  // error — runtime object

    desc.before((ctx) => {
        console.log(tag, ctx.args);  // ok
        logger.log(ctx.args);       // error: cannot capture runtime value
    });
    return desc;
}
```

## Application order

User-defined decorators — evaluated top to bottom, applied bottom to top:

```typescript
@A   // evaluated first, applied second
@B   // evaluated second, applied first
method() {}
// result: A(B(method))
```

Built-in decorators (`@static`, `@readonly`) are processed in the last phase, regardless of position.

## Built-in comptime types

Available without import, exist only at compile time:

`ClassDesc`, `MethodDesc`, `PropDesc`, `ParamDesc`, `MetaStore`, `MethodCtx`, `FunctionDesc`, `FunctionCtx`, `SelfRef`

## Descriptor API

### MethodDesc

```typescript
interface MethodCtx<Params extends any[] = any[], Return = any> {
    self:   SelfRef;
    args:   Params;
    result: Return;   // only in after()
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

Methods added via `addMethod()` are full-fledged class methods, can satisfy interface requirements.

### SelfRef

```typescript
interface SelfRef {
    field<T>(name: string): T;   // name — comptime string → self->field_name in C
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

Exists only at compile time. Not available at runtime.

## Comptime metadata

`meta` — arbitrary data on descriptors at compile time. Example — routing:

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

## Decorators on async methods

`before()` and `after()` work with the logical lifecycle: `before()` on first call, `after()` on completion. Variables from `before()` are visible in `after()` — the compiler promotes them into the SM struct automatically:

```typescript
decorator function timing(cls: ClassDesc, key: string, desc: MethodDesc): MethodDesc {
    desc.before((_ctx) => {
        const start = performance.now();   // promoted to SM struct
    });
    desc.after((_ctx) => {
        console.log(`[${key}] took ${performance.now() - start}ms`);
    });
    return desc;
}
```

## Export and import

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

## Patterns

| Pattern | Implementation |
|---------|---------------|
| Guard | `before()` + condition |
| Interceptor | `before()` + `after()` |
| Validator | parameter decorator + `addCheck` / `addTransform` |
| Middleware | class decorator, applies `before()` to all methods |
| Routing | `meta.set('route', ...)` |
| DI | `meta.set('inject', ...)` |
| Memoization | `cls.addField()` + `before()`/`after()` |

## Built-in decorators

### @packed

Packs the structure without padding. C-output: `__attribute__((packed))`.

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

On platforms with `unaligned_access: false` (AVR, Cortex-M0) access to multi-byte fields goes through `tsc_read_unaligned_u16`/`tsc_read_unaligned_u32`.

### @align(N)

Aligns the structure on N bytes (power of two). C-output: `__attribute__((aligned(N)))`.

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

`@packed` and `@align(N)` on the same structure — compiler error.

### @static

Places the object in BSS (static lifetime). Several `Mut<T>` are allowed.

### @embedded.*

Embedded-specific decorators:

| Decorator | Description |
|-----------|-------------|
| `@embedded.inline` | Value type without heap and vtable, copied as C struct |
| `@embedded.pool(N)` | Static pool of N slots in BSS; `Cls.alloc()` → `Cls \| null` |
| `@embedded.singleton` | Single instance in BSS; `Cls.instance()` → `Mut<Cls>` |
| `@embedded.stack(name, N)` | Static stack for async recursion: N frame slots |
| `@embedded.isr` | Interrupt handler; forbids alloc, throw, await |
| `@embedded.noHeap` | Forbids heap allocations in a function |

### @signal

Reactive signal decorator. See [std/reactive](../../spec/10-stdlib.md).

### @platform

Conditional compilation — platform-dependent implementations of a single function/class:

```typescript
@platform("avr")
function readPin(pin: u8): u8 { ... }

@platform("desktop")
function readPin(pin: u8): u8 { ... }
```

## Code generation model

Each decorator generates a separate C-wrapper around the method body. Multiple decorators form a call chain:

```typescript
@timing   // outer
@guard    // middle
@log      // inner
greet(name: string): string { ... }
```

```c
// Original body
static char* MyService_greet__body(MyService* self, const char* name) {
    return tsc_sprintf("Hello %s", name);
}

// Inner: @log
static char* MyService_greet__log(MyService* self, const char* name) {
    printf("[greet] called\n");
    char* _r = MyService_greet__body(self, name);
    printf("[greet] done\n");
    return _r;
}

// Middle: @guard
static char* MyService_greet__guard(MyService* self, const char* name) {
    if (!authorized()) return NULL;
    return MyService_greet__log(self, name);
}

// Outer: @timing
char* MyService_greet(MyService* self, const char* name) {
    double _start = tsc_performance_now();
    char* _r = MyService_greet__guard(self, name);
    printf("[greet] took %.2fms\n", tsc_performance_now() - _start);
    return _r;
}
```

### Function naming

| Function | Pattern |
|---------|---------|
| Original body | `ClassName_method__body` |
| Decorator wrapper | `ClassName_method__decoratorName` |
| Public entry point | `ClassName_method` (last wrapper) |

## C-output

### @log on a method

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

### @minLength(3) on a property

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

### @timing on an async method

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
    double   start;    // promoted to SM struct
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

## Padding diagnostics

In `debug` mode the compiler warns about inefficient structures:

```typescript
class Inefficient {
    a: u8;   // 1 byte + 3 bytes padding
    b: u32;  // 4 bytes
    c: u8;   // 1 byte + 3 bytes padding
    d: u32;  // 4 bytes
}
// warning: struct 'Inefficient' has 6 bytes of avoidable padding; consider reordering fields
```

In `embedded` mode with `allocator: "none"` — the warning becomes an error.

## Errors

| Error | Cause |
|-------|-------|
| `@packed and @align are incompatible` | Both decorators on the same structure |
| `@methodOnly expects a class method, not a standalone function` | Wrong application site |
| `cannot capture runtime value 'logger' in desc.before()` | Capturing a runtime object in comptime context |
| `@readonly can only be applied to properties` | Built-in decorator on wrong construct |
| `const enum has no runtime table` | Utilities on `const enum` |
| `struct has N bytes of avoidable padding` | Inefficient field layout (debug) |

## See also

- [Classes](./classes.md) — `@packed`, `@align` on structures
- [Generics](./generics.md) — generic constraints in decorators
- [Concurrency](../07-concurrency/index.md) — `@embedded.*`, `@signal`
- [Modules](../08-modules/index.md) — `@platform`, conditional compilation
- [Specification: Decorators](../../spec/13-decorators.md) — full description
