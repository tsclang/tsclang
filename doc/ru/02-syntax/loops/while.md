# while / do-while

[← Вверх](./index.md) | [Следующий →](./break-continue.md) | [Предыдущий ←](./for-of.md)

---

Циклы `while` (с предусловием) и `do-while` (с постусловием). Синтаксис совпадает с TypeScript/JavaScript.

## while

Проверяет условие **до** выполнения тела. Если условие изначально `false`, тело не выполнится ни разу.

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

### Условие false — тело пропускается

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

Проверяет условие **после** выполнения тела. Тело выполняется **минимум один раз**, даже если условие `false`.

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

### Выполнение один раз при false

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

## Вложенные циклы

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

## Бесконечный цикл

```typescript
while (true) {
    // break required somewhere
}
```

Эквивалентно `for (;;) { }`. Обе формы компилируются в `while (true) { }`.

## async/await в циклах

`await` внутри `while` выполняется **последовательно** — каждая итерация дожидается завершения предыдущей. Для параллельного выполнения используйте `Promise.all`.

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

Асинхронный `while` компилируется в state machine: условие проверяется в `case 1`, `await` — в `case 2`, затем `goto case_1` для повторной проверки условия.

### Параллельное выполнение

```typescript
// sequential — one by one
while (hasMore()) {
    const data = await fetchData();
    process(data);
}

// parallel — all at once
const results = await Promise.all(urls.map(u => fetch(u)));
```

## См. также

- [for](./for.md) — классический цикл
- [for-of](./for-of.md) — итерация по коллекциям
- [break / continue](./break-continue.md) — управление итерациями
- [Async](../../07-async/index.md) — async/await и state machines
