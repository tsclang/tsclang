# Модель памяти

[← Вверх](../index.md) | [Следующий →](./ownership-types.md)

---

TSClang использует **гибридную модель управления памятью**: статический ownership/borrow checker + опциональный ARC. Нет GC, нет ручного `free`.

## Принцип

Компилятор статически отслеживает владельца каждого значения. Освобождение памяти — детерминированное, в конце scope владельца. Для случаев где статический анализ недостаточен (графы, циклы) — `Shared<T>` с atomic refcount (ARC).

## Типы владения

| Тип | Семантика | Описание |
|-----|-----------|----------|
| `T` | **Owner** | Полное владение, move при передаче |
| `Ref<T>` | **Immutable borrow** | Только чтение, без изменения и удаления |
| `Mut<T>` | **Mutable borrow** | Чтение и запись, только один `Mut` одновременно |
| `Shared<T>` | **ARC** | Strong ref, увеличивает refcount, только desktop |
| `Weak<T>` | **Weak ref** | Не увеличивает refcount, разрывает циклы |
| `Slice<T>` | **Borrowed array view** | Zero-copy sub-range, pointer + length |

## Базовые правила

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **копируются**, borrow checker не применяется
- **Сложные типы** (массивы, объекты, строки, классы) — управляются ownership системой
- `string` — heap-allocated Owner, передаётся как `Ref<string>`, копируется через `clone()`
- **Borrow из массива** — `arr[i]` для сложных типов только через `Ref<T>`; move запрещён (E009)
- **Borrow полей объектов** — не поддерживается; передавайте весь объект как `Ref<T>`

## Borrow checker

Правило **aliasing XOR mutability**: нельзя два `Mut` одновременно, нельзя `Mut` + `Ref`, но можно несколько `Ref` одновременно.

```typescript
let a = [1, 2, 3];
let r1: Ref<i32[]> = a;
let r2: Ref<i32[]> = a;   // ok — несколько Ref разрешены
```

```typescript
let a = [1, 2, 3];
let r1: Mut<i32[]> = a;
let r2: Mut<i32[]> = a;   // error: уже есть активный Mut
```

## Автоматический Drop

Компилятор вставляет `free()` в конце scope владельца. При множественных `return` и `throw` — единая точка очистки через `goto cleanup`:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... работа ...
cleanup:
    if (u) User_free(u);
}
```

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Типы владения](./ownership-types.md) | Обзор всех ownership-типов и их C-представлений |
| [Owner (T)](./owner.md) | Полное владение, move при присвоении и передаче |
| [Ref\<T\>](./ref.md) | Immutable borrow, view-паттерны |
| [Mut\<T\>](./mut.md) | Mutable borrow, правила эксклюзивности |
| [Shared\<T\> и Weak\<T\>](./shared.md) | ARC и weak-ссылки для графов и циклов |
| [Slice\<T\>](./slice.md) | Zero-copy view на часть массива или строки |
| [Borrow checker](./borrow-checker.md) | Правила aliasing, lifetime, scope constraints |
| [Drop и cleanup](./drop.md) | Автоматическое освобождение, `goto cleanup` |
| [Деструктуризация](./destructuring.md) | Borrow vs move при деструктуризации полей |
| [Замыкания](./closures.md) | Правила захвата: copy, Ref, Mut, move |
| [Руководство по borrow](./borrow-guide.md) | Практические примеры, ошибки и исправления |
| [Итераторы](./iterators.md) | `Iterable<T>`, pull-based итераторы на стеке |

## C-output

```typescript
let user = new User();
user.name = "Alice";
// конец scope — User_free вызывается автоматически
```

```c
User user = {0};
user.name = STR_LIT("Alice");
// ... использование ...
User_free(&user);   // вставлено компилятором
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `use of moved value: "x"` | Обращение к переменной после move |
| `already borrowed as Mut` | Второй `Mut` или `Ref` при активном `Mut` |
| `already borrowed as Ref` | `Mut` при активном `Ref` |
| `Ref<T> not allowed in class field` | Попытка хранить borrow в поле класса |
| `cannot move out of array by index` | `arr[i]` для owned-типа без `.remove()` |
| `Cannot return borrow to array element from function` | Возврат `Ref<T>`/`Mut<T>` на `arr[i]` из функции |
| `Cannot borrow a class field` | `Ref<T>`/`Mut<T>` от поля объекта (`obj.field`) |
| `Cannot return mutable borrow to local variable` | Возврат `Mut<T>` на локальную переменную из функции |

## См. также

- [Переменные: let / const](../02-syntax/variables/index.md) — влияние `let`/`const` на `Mut<T>` / `Ref<T>`
- [Функции](../02-syntax/functions/declaration.md) — правила передачи аргументов
- [Классы](../04-classes/index.md) — `mut`-методы и `readonly`-поля
- [Ошибки](../06-errors/index.md) — `goto cleanup` при `throw` / `?`
