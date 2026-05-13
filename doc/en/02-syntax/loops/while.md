# while / do-while

[← Up](./index.md) | [Next →](./break-continue.md) | [Previous ←](./for-of.md)

---

`while` (pre-test) and `do-while` (post-test) loops. Syntax matches TypeScript/JavaScript.

## while

Checks the condition **before** executing the body. If the condition is initially `false`, the body never runs.

```typescript
let i: i32 = 0;
while (i < 3) {
    console.log(i);
    i++;
}
```

### C-output

```c
int32_t i = 0;
while (i < 3) {
    printf("%d\n", i);
    i++;
}
```

### Condition false — body skipped

```typescript
while (false) {
    console.log("never");
}
```

```c
while (false) {
    printf("never\n");
}
```

## do-while

Checks the condition **after** executing the body. The body runs **at least once**, even if the condition is `false`.

```typescript
let i: i32 = 0;
do {
    console.log(i);
    i++;
} while (i < 3);
```

### C-output

```c
int32_t i = 0;
do {
    printf("%d\n", i);
    i++;
} while (i < 3);
```

### Runs once when false

```typescript
let x: i32 = 0;
do {
    console.log("ran");
    x++;
} while (false);
```

```c
int32_t x = 0;
do {
    printf("ran\n");
    x++;
} while (false);
```

## Nested loops

```typescript
let i: i32 = 0;
while (i < 2) {
    let j: i32 = 0;
    while (j < 2) {
        console.log(i, j);
        j++;
    }
    i++;
}
```

### C-output

```c
int32_t i = 0;
while (i < 2) {
    int32_t j = 0;
    while (j < 2) {
        printf("%d %d\n", i, j);
        j++;
    }
    i++;
}
```

## Infinite loop

```typescript
while (true) {
    // break required somewhere
}
```

Equivalent to `for (;;) { }`. Both forms compile to `while (true) { }`.

## async/await in loops

`await` inside `while` executes **sequentially** — each iteration waits for the previous one to complete. For parallel execution, use `Promise.all`.

```typescript
async function tick(): i32 {
    return 1;
}

async function run(n: i32): i32 {
    let count: i32 = 0;
    while (count < n) {
        const v = await tick();
        count = count + v;
    }
    return count;
}
```

### C-output (state machine)

```c
typedef struct {
    int32_t _state; int32_t _result; bool _done;
    int32_t n;
    int32_t count;
    int32_t v;
    tick_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->count = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(self->count < self->n)) {
                self->_result = self->count;
                self->_done = true;
                return;
            }
            self->_await_0 = (tick_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            tick_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->v = self->_await_0._result;
            self->count = self->count + self->v;
            self->_state = 1;
            goto case_1;
    }
}
```

Asynchronous `while` compiles to a state machine: the condition is checked in `case 1`, `await` in `case 2`, then `goto case_1` to re-check the condition.

### Parallel execution

```typescript
// sequential — one by one
while (hasMore()) {
    const data = await fetchData();
    process(data);
}

// parallel — all at once
const results = await Promise.all(urls.map(u => fetch(u)));
```

## See also

- [for](./for.md) — classic loop
- [for-of](./for-of.md) — iteration over collections
- [break / continue](./break-continue.md) — iteration control
- [Async](../../07-async/index.md) — async/await and state machines
