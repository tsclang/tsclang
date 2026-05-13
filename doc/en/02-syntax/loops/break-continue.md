# break / continue

[← Up](./index.md) | [Previous ←](./while.md)

---

The `break` and `continue` statements control the flow of execution inside loops. TSClang also supports **labels** for controlling nested loops — similar to JavaScript.

## break

Immediately exits the current loop:

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

Proceeds to the next iteration (skips the rest of the body):

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

## for-of: break and continue

`break` and `continue` work in `for-of` the same way as in `while` and `for`:

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

## Labeled break and continue

Labels allow exiting an outer loop or proceeding to the next iteration of an outer loop. Syntax: `label:` before the loop, then `break label` or `continue label`.

### break with a label

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

The compiler translates labeled `break` into `goto`:

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

### continue with a label

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

Labeled `continue` becomes a `goto` to a label at the end of the outer loop body:

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

## How labels compile

| TSClang | C |
|---------|---|
| `break label;` | `goto label_break;` |
| `continue label;` | `goto label_continue;` |
| `label: while (...) { ... }` | `while (...) { ... label_continue:; }` `label_break:;` |

The `_continue` label is placed at the end of the loop body (before `}`), `_break` after the closing brace. If a label is used only with `break` (or only with `continue`), the unused label is not generated.

## Limitations

- `break` and `continue` are only valid inside loops (`for`, `for-of`, `while`, `do-while`).
- A label must be bound to a loop. `break label` outside a loop is a compilation error.
- `break` inside `switch` (without a label) exits the `switch`, not the outer loop — same as in C.

## See also

- [for](./for.md) — classic loop
- [for-of](./for-of.md) — iteration over collections
- [while](./while.md) — condition-based loops
- [switch](../match/switch.md) — `break` in switch
