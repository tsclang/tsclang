## while / do-while

```typescript
// while — проверка условия до итерации
let i = 0;
while (i < 10) {
    console.log(i);
    i++;
}

// do-while — проверка условия после итерации (тело выполняется минимум 1 раз)
let input: string;
do {
    input = readLine();
} while (input === "");

// break и continue работают как в JS
while (true) {
    const line = readLine();
    if (line === "quit") break;
    if (line === "") continue;
    process(line);
}
```

- `break` — выход из цикла
- `continue` — переход к следующей итерации
- Labeled break/continue для вложенных циклов:

```typescript
outer: while (true) {
    while (true) {
        if (done) break outer;    // выход из внешнего цикла
        if (skip) continue outer; // следующая итерация внешнего цикла
    }
}
```

### async/await в циклах

`await` разрешён внутри любого цикла (`for`, `for-of`, `while`, `do-while`) при условии что функция `async`. Итерации выполняются **последовательно** — следующая итерация начинается только после завершения `await`.

```typescript
// for-of
async function processAll(ids: i32[]): void {
    for (const id of ids) {
        const user = await fetchUser(id);  // ждём каждый запрос по очереди
        console.log(user.name);
    }
}

// while
async function pollUntilReady(id: i32): Status {
    while (true) {
        const status = await checkStatus(id);
        if (status !== Status.Pending) return status;
        await delay(500);
    }
}

// для параллельного выполнения — Promise.all
async function processAllParallel(ids: i32[]): void {
    const users = await Promise.all(ids.map(id => fetchUser(id)));  // все запросы параллельно
}
```

