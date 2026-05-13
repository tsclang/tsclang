# Function Declarations

[← Up](./index.md) | [Next →](./arrow.md)

---

## Named Functions

A function declaration starts with the `function` keyword. The return type is specified after `:`; if omitted, the compiler infers it from the body.

```typescript
function add(a: i32, b: i32): i32 {
    return a + b;
}

function log(msg: string): void {
    console.log(msg);
}
```

**C-output:**

```c
int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}

void log_string(String msg) {
    printf("%s\n", msg.data);
}
```

The C name is formed according to the name mangling scheme: `<name>_<type1>_<type2>`. Details are in the [Overloading](./overload.md) section.

---

## Anonymous Functions

A `function` without a name — assigned to a variable or passed as an argument:

```typescript
const add = function (a: i32, b: i32): i32 {
    return a + b;
};

array.sort(function (a: i32, b: i32): i32 {
    return a - b;
});
```

---

## IIFE (Immediately Invoked Function Expression)

An arrow or anonymous function wrapped in `()` and called immediately:

```typescript
const result: i32 = ((x: i32) => x * 3)(7);  // => 21
```

```typescript
(function (a: i32, b: i32): i32 {
    return a + b;
})(1, 2);  // => 3
```

**C-output:**

```c
static int32_t _lambda_0_i32(int32_t x) {
    return x * 3;
}

const int32_t result = _lambda_0_i32(7);
```

The compiler inlines IIFE into a call to the generated static function.

---

## Closures

Arrow and anonymous functions capture variables from the outer scope.

### Capture by Value (Primitives)

Primitives (`i8`..`f64`, `bool`) are copied at the moment the closure is created:

```typescript
const factor: i32 = 3;
const mul = (x: i32) => factor * x;
console.log(mul(7));  // 21
```

```c
typedef struct { int32_t factor; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return env->factor * x;
}

typedef struct {
    _closure_0_env env;
    int32_t (*fn)(_closure_0_env *, int32_t);
} _closure_0;

_closure_0 mul = {.env = {.factor = factor}, .fn = _closure_0_fn};
printf("%d\n", mul.fn(&mul.env, 7));
```

The closure is compiled into a struct with captured variables (`env`) + a function pointer.

### Capture by Reference (Complex Types)

For complex types (objects, strings, arrays), the borrow checker applies — default is `Ref<T>`:

```typescript
const prefix: string = "Hello";
const greet = (name: string): string => {
    return prefix + ", " + name;
};
console.log(greet("World"));
```

### Explicit Capture List

When the compiler cannot infer the type or a move is needed, an explicit capture list is used:

```typescript
const fn = [data: Data]() => process(data);          // T — move (Owner)
const fn = [data: Ref<Data>]() => data.length;       // Ref — immutable borrow
const fn = [data: Mut<Data>]() => { data.push(1); }; // Mut — mutable borrow
```

---

## Errors

| Error | Cause |
|-------|-------|
| `missing return in function with return type` | A function with a non-void type does not return a value on all paths |
| `cannot move out of const` | Attempt to pass a `const` variable as an owned argument |
| `cannot capture const as Mut<T>` | Capturing a `const` variable with a mutable borrow |

---

## See Also

- [Arrow Functions](./arrow.md) — shorthand `=>` syntax
- [Function Overloading](./overload.md) — multiple functions with the same name
- [Memory Model: Closures](../../05-memory/index.md) — capture rules and borrow checker
- [Error Handling](../../06-errors/index.md) — `throws`, `try/catch`
