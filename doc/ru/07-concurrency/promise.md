# Promise\<T\> — результат async-операции

[← Вверх](./index.md) | [Следующий →](./threads.md) | [Предыдущий ←](./async.md)

---

`Promise<T>` — тип возвращаемого значения `async`-функций. Инкапсулирует результат или ошибку асинхронной операции.

## Создание

### Из async-функции (автоматически)

```typescript
async function fetchUser(id: i32): User throws NetworkError {
    const conn = await connect("https://api.example.com");
    const data = await conn.get(`/users/${id}`);
    return User.parse(data);
}
// fetchUser(42) возвращает Promise<User>
```

### Вручную (обёртка callback-based API)

```typescript
function delay(ms: i32): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), ms);
    });
}

function readFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!fileExists(path)) reject(new IOError("not found"));
        else resolve(fs.readSync(path));
    });
}
```

- `resolve(value)` — завершает Promise успехом
- `reject(error)` — завершает ошибкой; тип ошибки должен совпадать с `throws`
- Повторный вызов `resolve` или `reject` — no-op

## .then / .catch / .finally

Методы для inline-трансформации результата без `await`:

### .then\<U\>

```typescript
const upper = fetchName().then(name => name.toUpperCase())   // Promise<string>
```

- Вызывается только при успехе
- Возвращает `Promise<U>`
- Если `fn` бросает — Promise переходит в ошибку

### .catch\<E\>

```typescript
const safe = readFile(path).catch((e: IOError) => "")       // Promise<string>
```

- Вызывается только при ошибке совпадающего типа
- Неперехваченные ошибки пробрасываются дальше

### .finally

```typescript
const result = fetchData(url).finally(() => closeConnection())
```

- Вызывается всегда (и при успехе, и при ошибке)
- Не меняет тип и значение Promise
- `await` внутри `fn` — ошибка компилятора

### Цепочки

```typescript
const data = fetchRaw(url)
    .then(raw => parse(raw))
    .catch((e: ParseError) => defaultData)
    .finally(() => log("done"))
```

Все три метода — сахар над `async/await`:

```typescript
p.then(fn)  →  async () => fn(await p)
p.catch(fn) →  async () => { try { return await p } catch (e: E) { return fn(e) } }
```

## Promise.all

Запуск нескольких async-задач параллельно. Ждёт **всех**, при ошибке — fail-fast:

```typescript
const [users, posts] = await Promise.all([
    fetchUsers(),   // Promise<User[]>
    fetchPosts(),   // Promise<Post[]>
]);
```

- Все задачи запускаются одновременно
- Первая ошибка побеждает, остальные отменяются через AbortSignal
- Типы элементов выводятся компилятором

### Throws-union

Если промисы бросают разные типы ошибок — компилятор выводит union:

```typescript
async function a(): void throws IOError { ... }
async function b(): void throws NetworkError { ... }

// компилятор выводит: throws IOError | NetworkError
await Promise.all([a(), b()])

try {
    await Promise.all([a(), b()])
} catch (e: IOError) {
    console.log("io error:", e.message);
} catch (e: NetworkError) {
    console.log("network error:", e.message);
}
```

Если все промисы бросают одно и то же — union схлопывается.

### Порядок при одновременном падении

На однопоточном event loop порядок детерминирован: первым обрабатывается индекс с меньшим номером. Остальные ошибки теряются. Для сбора всех ошибок — `Promise.allSettled`.

## Promise.any

Ждёт **первого успешного** результата:

```typescript
const data = await Promise.any([
    fetchFromMirror1(url),
    fetchFromMirror2(url),
    fetchFromMirror3(url),
])
```

- Тип результата: `T` (общий тип всех Promise)
- Хотя бы одна задача успешна → остальные отменяются
- Все задачи бросили → `Promise.any` бросает ошибку последней

## Promise.race

Ждёт **первого завершившегося** (успех или ошибка):

```typescript
async function withTimeout(ms: i32): never throws TimeoutError {
    await sleep(ms)
    throw new TimeoutError()
}

const result = await Promise.race([
    fetchData(url),
    withTimeout(5000),
])
```

- Возвращает результат первой завершившейся задачи
- Остальные задачи отменяются
- Тип результата: общий тип всех Promise

Взаимодействие с AbortController:

```typescript
const ctrl = new AbortController()

const result = await Promise.race([
    fetchFromA(url, { signal: ctrl.signal }),
    fetchFromB(url, { signal: ctrl.signal }),
])

ctrl.abort()   // проигравший прекратит работу при следующей await
```

## Promise.allSettled

Ждёт **всех**, собирает все результаты включая ошибки — **никогда не бросает**:

```typescript
type SettledResult<T, E extends Error> =
    | { status: "fulfilled"; value: T }
    | { status: "rejected";  error: E }
```

Возвращает **кортеж** — каждый элемент типизирован по своему промису:

```typescript
async function fetchUser(id: i32): User throws NetworkError { ... }
async function validateForm(data: FormData): void throws ValidationError { ... }

const [r1, r2] = await Promise.allSettled([fetchUser(1), validateForm(data)])
// r1: SettledResult<User, NetworkError>
// r2: SettledResult<void, ValidationError>

match (r1) {
    { status: "fulfilled", value } => console.log(value.name)
    { status: "rejected",  error } => console.log(error.message)
}
```

- Порядок результатов соответствует порядку задач
- Используйте когда нужен результат каждой задачи независимо от других

## Сравнительная таблица

| Метод | Ждёт | При ошибке | Результат |
|-------|------|------------|-----------|
| `Promise.all` | всех | бросает сразу | `T[]` (или кортеж) |
| `Promise.any` | первого успешного | бросает если все упали | `T` |
| `Promise.race` | первого (любого) | бросает если первый упал | `T` |
| `Promise.allSettled` | всех | не бросает | `SettledResult<T>[]` |

## C-output

```typescript
async function fetch(url: string): string throws NetworkError {
    return new Promise((resolve, reject) => {
        httpGet(url, (err, data) => {
            if (err) reject(new NetworkError(err));
            else resolve(data);
        });
    });
}
```

```c
// State machine для async-функции с Promise
typedef struct {
    int _state;
    String* url;
    String* result;
    bool _ok;
    union {
        String* _value;
        NetworkError* _error;
    };
} FetchTask;

bool FetchTask_poll(FetchTask* t) {
    switch (t->_state) {
    case 0:
        httpGet(t->url, fetch_callback, t);
        t->_state = 1;
        return false;
    case 1:
        // результат получен через callback
        return t->_ok;
    }
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot await i32, expected Promise<T>` | `await` на не-Promise значении |
| `await outside async function` | `await` в синхронной функции |
| `Promise.all unavailable on embedded` | `Promise.all` требует heap |
| `type mismatch in resolve` | Несовпадение типа в `resolve(value)` |

## См. также

- [Async/Await](./async.md) — async-функции, state machines, правила await
- [Каналы и select](./channels.md) — связь async с потоками через каналы
- [Ошибки](../06-errors/index.md) — throws, try/catch
