# Объявление функций

[← Вверх](./index.md) | [Следующий →](./arrow.md)

---

## Именованные функции

Объявление функции начинается с ключевого слова `function`. Возвращаемый тип указывается после `:`; если опущен — компилятор выводит его из тела.

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

Имя в C формируется по схеме name mangling: `<имя>_<тип1>_<тип2>`. Подробности — в разделе [Перегрузка](./overload.md).

---

## Анонимные функции

`function` без имени — присваивается переменной или передаётся аргументом:

```typescript
const add = function (a: i32, b: i32): i32 {
    return a + b;
};

array.sort(function (a: i32, b: i32): i32 {
    return a - b;
});
```

---

## IIFE (немедленный вызов)

Стрелочная или анонимная функция, обёрнутая в `()` и вызываемая сразу:

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

Компилятор инлайнит IIFE в вызов сгенерированной статической функции.

---

## Замыкания

Стрелочные и анонимные функции захватывают переменные из внешнего скоупа.

### Захват по значению (примитивы)

Примитивы (`i8`..`f64`, `bool`) копируются в момент создания замыкания:

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

Замыкание компилируется в struct с захваченными переменными (`env`) + указатель на функцию.

### Захват по ссылке (сложные типы)

Для сложных типов (объекты, строки, массивы) действует borrow checker — по умолчанию `Ref<T>`:

```typescript
const prefix: string = "Hello";
const greet = (name: string): string => {
    return prefix + ", " + name;
};
console.log(greet("World"));
```

### Явный список захвата

Когда компилятор не может вывести тип или нужен move, используется явный capture list:

```typescript
const fn = [data: Data]() => process(data);          // T — move (Owner)
const fn = [data: Ref<Data>]() => data.length;       // Ref — immutable borrow
const fn = [data: Mut<Data>]() => { data.push(1); }; // Mut — mutable borrow
```

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `missing return in function with return type` | Функция с не-void типом не возвращает значение на всех путях |
| `cannot move out of const` | Попытка передать `const` переменную как owned аргумент |
| `cannot capture const as Mut<T>` | Захват `const` переменной с mutable borrow |

---

## См. также

- [Стрелочные функции](./arrow.md) — сокращённый синтаксис `=>`
- [Перегрузка функций](./overload.md) — несколько функций с одним именем
- [Модель памяти: Замыкания](../../05-memory/index.md) — правила захвата и borrow checker
- [Обработка ошибок](../../06-errors/index.md) — `throws`, `try/catch`
