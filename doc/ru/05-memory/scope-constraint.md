# Scope Constraint

[← Вверх](./index.md) | [Следующий →](./auto-drop.md) | [Предыдущий ←](./argument-passing.md)

---

TSClang не имеет явных lifetime-аннотаций (как `'a` в Rust). Вместо них — набор **консервативных правил**, которые компилятор проверяет статически. Это упрощает синтаксис за счёт некоторых ограничений.

## Правило 1: Ref/Mut нельзя в глобал

`Ref<T>` и `Mut<T>` не могут храниться в глобальных переменных — borrow не может пережить функцию.

```typescript
let global: Ref<User>;  // ошибка

function foo(u: Ref<User>) {
    global = u;  // ошибка: borrow не может пережить функцию
}
```

### Альтернативы

```typescript
// Вариант 1: owned поле
let global: User;             // owned — ok

// Вариант 2: Shared<T> (desktop)
let global: Shared<User>;     // ARC — ok

// Вариант 3: @static let (глобальное мутабельное состояние)
@static let global: User;
```

## Правило 2: Нельзя вернуть ссылку на локал

Возвращаемый `Ref<T>` не может ссылаться на объект, созданный в теле функции — объект умрёт при выходе.

```typescript
function bad(): Ref<User> {
    const u = new User();    // u умрёт в конце функции
    return u;                // ошибка: u умрёт в конце функции
}
```

### Исправление: вернуть owned

```typescript
function ok(): User {
    const u = new User();
    return u;    // ok — move, caller получает ownership
}
```

## Правило 3: Возвращаемый Ref<T> привязан к источнику

Компилятор отслеживает, какой входной `Ref<T>` является источником возвращаемого значения.

### Один входной Ref

Возвращаемый `Ref<T>` привязан к единственному источнику:

```typescript
function first(a: Ref<string>, n: i32): Ref<string> {
    return a   // ok — результат привязан к a
}

const s = "hello"
const r = first(s, 42)
console.log(r)    // ok — r валиден пока жив s
```

### Несколько входных Ref

Результат привязан к **минимальному** lifetime из всех источников. Это консервативно — компилятор не знает, какой именно `Ref` вернётся в runtime:

```typescript
function getLonger(a: Ref<string>, b: Ref<string>): Ref<string> {
    return a.length > b.length ? a : b
}

const s1 = "hello"
const s2 = "world!"
const longer = getLonger(s1, s2)
// longer валиден пока живы и s1, и s2
console.log(longer)    // ok

// если s1 или s2 dropped раньше longer — ошибка компилятора
```

### Если результат должен пережить источники

```typescript
// clone — owned копия, не привязана к источникам
function getLongerOwned(a: Ref<string>, b: Ref<string>): string {
    return (a.length > b.length ? a : b).clone()
}
```

### Возврат borrow из метода

Возвращаемый `Ref<T>` из метода привязан к `this`:

```typescript
class Config {
    data: string[];

    getFirst(): Ref<string> {
        return this.data[0];    // привязан к this
    }
}

const config = new Config();
const s = config.getFirst();    // s привязан к config
console.log(s);                 // ok
```

Ошибка при dangling:

```typescript
let s: Ref<string>;
{
    const config = new Config();
    s = config.getFirst();    // borrow привязан к config
}                             // config умер
console.log(s);               // ошибка: config умер, s dangling
```

## Правило 4: Ref/Mut не могут пережить await

`Ref<T>` и `Mut<T>` не могут оставаться живыми через точку `await`. Причина: async state machine сохраняет состояние между suspension points, и источник borrow может быть invalidated пока coroutine приостановлена.

```typescript
async function bad(arr: Ref<i32[]>): Promise<void> {
    const x = arr[0];       // borrow из arr
    await sleep(10);        // "Ref<T>" cannot live across "await"
    console.log(x);         //   use ".clone()" to make an owned copy
}
```

### Решение 1: Clone перед await

Значения-примитивы (copy-типы) уже безопасны — они не являются borrow:

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    const val: i32 = arr[0];    // i32 — copy, не borrow
    await sleep(10);
    console.log(val);           // ok
}
```

Для сложных типов — `clone()`:

```typescript
async function ok(arr: Ref<User[]>): Promise<void> {
    const copy = arr[0].clone();    // owned copy
    await sleep(10);
    console.log(copy);
}
```

### Решение 2: Использовать borrow до await

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    console.log(arr[0]);       // borrow использован и отпущен
    await sleep(10);           // ok — нет живых borrow
    console.log(arr[0]);       // новый borrow после await
}
```

### Решение 3: Новый borrow после await

```typescript
async function ok(arr: Ref<i32[]>): Promise<void> {
    await sleep(10);
    console.log(arr[0]);       // свежий borrow, создан после await
}
```

### Owned значения через await — ok

Owned значения (`T`) захватываются в state machine struct и переживают `await`:

```typescript
async function fetch(): Data {
    let d = new Data();
    d.value = 42;
    return d;
}

async function run(): void {
    const d = await fetch();    // d — owned, захвачен в state machine
    console.log(d.value);       // ok
}
```

C-output показывает `d` как поле state machine struct:

```c
typedef struct {
    int32_t _state; int _result; bool _done;
    Data d;                        // owned — сохранён через suspension
    fetch_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (fetch_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->d = self->_await_0._result;   // move from awaited result
            printf("%d\n", self->d.value);
            self->_done = true;
            return;
    }
}
```

## Почему нет автоматического re-borrow

Технически компилятор мог бы молча дропать borrow на `await` и восстанавливать его после. Это **намеренно не сделано**:

1. **`await` — граница выполнения других задач.** Пользователь должен видеть, что borrow здесь прерывается.
2. **Скрытый re-borrow маскирует факт**, что `r` после `await` — уже другой borrow, не тот что до.
3. **Явный паттерн** (`arr[0]` после `await` вместо `r`) короче и понятнее.

## Ошибки

### Ref жив через await

```typescript
async function foo(arr: Ref<i32[]>): Promise<void> {
    const x = arr[0];
    await sleep(10);
    console.log(x);
}
// "Ref<T>" cannot live across "await"; use ".clone()" to make an owned copy
```

### Borrow привязан к умершему объекту

```typescript
let s: Ref<string>;
{
    const config = new Config();
    s = config.getFirst();
}
console.log(s);    // ошибка: borrow пережил свой источник
```

## См. также

- [Правила Borrow Checker](./borrow-rules.md) — одновременные borrow
- [Передача аргументов](./argument-passing.md) — Ref/Mut/owned в параметрах
- [Auto Drop](./auto-drop.md) — автоматическое освобождение
- [Замыкания](./closures.md) — Mut-closure через await
- [Async/Await](../07-concurrency/async-await.md) — асинхронные функции и state machines
