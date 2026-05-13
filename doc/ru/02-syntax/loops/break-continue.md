# break / continue

[← Вверх](./index.md) | [Предыдущий ←](./while.md)

---

Операторы `break` и `continue` управляют потоком выполнения внутри циклов. TSClang также поддерживает **метки** (labels) для управления вложенными циклами — аналогично JavaScript.

## break

Немедленно выходит из текущего цикла:

```typescript
let i: i32 = 0;
while (true) {
    if (i == 2) {
        break;
    }
    console.log(i);
    i++;
}
```

### C-output

```c
int32_t i = 0;
while (true) {
    if (i == 2) {
        break;
    }
    printf("%d\n", i);
    i++;
}
```

## continue

Переходит к следующей итерации (пропускает остаток тела):

```typescript
let i: i32 = 0;
while (i < 4) {
    i++;
    if (i == 2) {
        continue;
    }
    console.log(i);
}
```

### C-output

```c
int32_t i = 0;
while (i < 4) {
    i++;
    if (i == 2) {
        continue;
    }
    printf("%d\n", i);
}
```

## for-of: break и continue

`break` и `continue` работают в `for-of` так же, как в `while` и `for`:

```typescript
const arr: i32[] = [1, 2, 3, 4, 5];
for (const item of arr) {
    if (item == 3) continue;
    if (item == 5) break;
    console.log(item);
}
// output: 1, 2, 4
```

### C-output

```c
for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
    const int32_t item = arr.data[_i_0];
    if (item == 3) continue;
    if (item == 5) break;
    printf("%d\n", item);
}
```

## Помеченные (labeled) break и continue

Метки позволяют выйти из внешнего цикла или перейти к следующей итерации внешнего цикла. Синтаксис: `label:` перед циклом, затем `break label` или `continue label`.

### break с меткой

```typescript
let found: bool = false;
let i: i32 = 0;
outer: while (i < 3) {
    let j: i32 = 0;
    while (j < 3) {
        if (i == 1 && j == 1) {
            found = true;
            break outer;
        }
        j++;
    }
    i++;
}
console.log(found);  // true
```

### C-output

Компилятор транслирует помеченный `break` в `goto`:

```c
bool found = false;
int32_t i = 0;
while (i < 3) {
    int32_t j = 0;
    while (j < 3) {
        if (i == 1 && j == 1) {
            found = true;
            goto outer_break;
        }
        j++;
    }
    i++;
}
outer_break:;
printf("%s\n", (found) ? "true" : "false");
```

### continue с меткой

```typescript
let sum: i32 = 0;
let i: i32 = 0;
outer: while (i < 3) {
    i++;
    let j: i32 = 0;
    while (j < 3) {
        j++;
        if (j == 2) { continue outer; }
        sum += 1;
    }
}
console.log(sum);  // 3
```

### C-output

Помеченный `continue` становится `goto` к метке в конце тела внешнего цикла:

```c
int32_t sum = 0;
int32_t i = 0;
while (i < 3) {
    i++;
    int32_t j = 0;
    while (j < 3) {
        j++;
        if (j == 2) {
            goto outer_continue;
        }
        sum += 1;
    }
    outer_continue:;
}
printf("%d\n", sum);
```

## Как компилируются метки

| TSClang | C |
|---------|---|
| `break label;` | `goto label_break;` |
| `continue label;` | `goto label_continue;` |
| `label: while (...) { ... }` | `while (...) { ... label_continue:; }` `label_break:;` |

Метка `_continue` размещается в конце тела цикла (перед `}`), `_break` — после закрывающей скобки. Если метка используется только с `break` (или только с `continue`), неиспользуемая метка не генерируется.

## Ограничения

- `break` и `continue` допустимы только внутри циклов (`for`, `for-of`, `while`, `do-while`).
- Метка должна быть привязана к циклу. `break label` вне цикла — ошибка компиляции.
- `break` внутри `switch` (без метки) выходит из `switch`, а не из внешнего цикла — как в C.

## См. также

- [for](./for.md) — классический цикл
- [for-of](./for-of.md) — итерация по коллекциям
- [while](./while.md) — циклы с условием
- [switch](../match/switch.md) — `break` в switch
