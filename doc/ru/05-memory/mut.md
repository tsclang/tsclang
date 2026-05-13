# Mut\<T\> — мутабельный заём

[← Вверх](./index.md) | [Следующий →](./shared.md) | [Предыдущий ←](./ref.md)

---

`Mut<T>` — **mutable borrow** (мутабельный заём). Позволяет читать и изменять данные без владения. Правило: **только один `Mut<T>` одновременно** на одни данные.

## Объявление в параметрах

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
let nums: i32[] = [1, 2, 3];
fill(nums);
console.log(nums[0]);   // 99 — данные изменены
```

`let`-переменная автоматически заимствуется как `Mut<T>` при передаче в функцию.

## Чтение и запись

`Mut<T>` позволяет и читать, и модифицировать:

```typescript
class Counter {
    value: i32;
}
function increment(c: Mut<Counter>): void {
    c.value += 1;        // ok — запись
}
function read(c: Ref<Counter>): i32 {
    return c.value;      // ok — чтение
}
let cnt = new Counter();
cnt.value = 0;
increment(cnt);
increment(cnt);
console.log(read(cnt));  // 2
```

`Mut<T>` неявно конвертируется в `Ref<T>` — данные можно передать в функцию, ожидающую `Ref<T>`:

```typescript
function read(c: Ref<Counter>): i32 { return c.value; }
let cnt = new Counter();
cnt.value = 5;
console.log(read(cnt));  // 5 — Mut→Ref ok
```

## Только один Mut одновременно

Компилятор гарантирует **алиасинг XOR мутабельность**: нельзя создать два `Mut<T>` на одни данные:

```typescript
class Box {
    x: i32;
}
let b = new Box();
b.x = 1;
function take(m: Mut<Box>): void { m.x = 2; }
function take2(m: Mut<Box>): void { m.x = 3; }
take(b);
take2(b);     // error: Cannot create two simultaneous mutable borrows of 'b'
```

> Ошибка возникает, когда предыдущий `Mut` ещё жив (не вышел из scope). В примере выше — если `take` и `take2` вызываются последовательно в одной точке без промежуточного использования, ошибка может не возникнуть. Всё зависит от borrow checker.

## Mut и const несовместимы

Нельзя создать `Mut<T>` из `const`-переменной:

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
const nums: i32[] = [1, 2, 3];
fill(nums);   // error: cannot borrow "nums" as mutable: it is a const binding
```

**Решение:** используйте `let` или передавайте как `Ref<T>`.

## Mut и Ref несовместимы

Нельзя создать `Mut<T>`, пока活跃ен `Ref<T>`:

```typescript
class Box { x: i32; }
let b = new Box();
b.x = 1;
function mutate(m: Mut<Box>): void { m.x = 2; }
function read(r: Ref<Box>): i32 { return r.x; }
const r = read(b);
mutate(b);    // error: Cannot create mutable borrow of 'b' while immutable borrow is active
console.log(r);
```

## Push и модификация массива

```typescript
function push(arr: Mut<i32[]>, val: i32): void {
    arr.push(val);
}
let data = [1, 2, 3];
push(data, 4);
console.log(data);   // [1, 2, 3, 4] — data жива, изменена
```

## C-output

`Mut<T>` компилируется в `T*` — указатель без `const`:

```typescript
function fill(arr: Mut<i32[]>): void {
    arr[0] = 99;
}
let nums: i32[] = [1, 2, 3];
fill(nums);
console.log(nums[0]);
```

```c
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

void fill_mut_Array_i32(Array_i32 *arr) {
    arr->data[0] = 99;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 nums = {.data = _lit_0, .length = 3, .capacity = 3};
    fill_mut_Array_i32(&nums);
    printf("%d\n", nums.data[0]);
    return 0;
}
```

Суффикс `_mut_` в имени функции указывает на mutable borrow. `Ref<T>` = `const T*`, `Mut<T>` = `T*`.

Сравнение `Ref<T>` и `Mut<T>` в C-output:

| TSClang | C |
|---------|---|
| `Ref<T>` | `const T*` |
| `Mut<T>` | `T*` |

## Ошибки компилятора

| Код | Ошибка | Решение |
|-----|--------|---------|
| `fill(const_var)` с параметром `Mut<T>` | `cannot borrow "x" as mutable: it is a const binding` | Используйте `let` |
| Два `Mut<T>` одновременно | `Cannot create two simultaneous mutable borrows of 'x'` | Ограничьте scope заёмов |
| `Mut` при активном `Ref` | `Cannot create mutable borrow of 'x' while immutable borrow is active` | Ограничьте scope `Ref` |
| `arr.push(x)` при активном заёме | `cannot mutate 'arr' while a borrow is active` | Завершите заём до мутации |

## См. также

- [Ref\<T\>](./ref.md) — неизменяемый заём
- [Shared\<T\>](./shared.md) — разделяемое владение (ARC)
- [Weak\<T\>](./weak.md) — слабая ссылка для разрыва циклов
- [let / const](../02-syntax/variables/index.md) — влияние `let`/`const` на borrow-семантику
- [Функции: передача аргументов](../02-syntax/functions/declaration.md) — правила передачи Ref/Mut/owned
