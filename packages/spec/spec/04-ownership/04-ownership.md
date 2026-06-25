# Ownership и Borrow Checker

**Гибридная модель:** статический ownership/borrow checker + опциональный ARC. Нет GC, нет ручного `free`.

## Типы владения

| Тип | Семантика |
|-----|-----------|
| `T` | **Owner** — владеет объектом, move при передаче (кроме `string`) |
| `string` | **Immutable + ARC** — copy + retain при присвоении, release при выходе из scope |
| `Ref<T>` | **Immutable borrow** — только чтение |
| `Mut<T>` | **Mutable borrow** — чтение и запись |
| `Arc<T>` | **ARC** — strong ref, увеличивает refcount |
| `Weak<T>` | **Weak ref** — не увеличивает refcount, разрывает циклы |
| `Slice<T>` | **Borrowed array view** — zero-copy sub-range, pointer + length |

`Ref<T>`, `Mut<T>`, `Arc<T>`, `Weak<T>` — **режимы хранения**, каждый имеет конкретное C-представление:

| Тип | C-представление | Примечание |
|-----|----------------|-----------|
| `T` (owned) | `T value` / `T* ptr` | move = не вызываем free на источнике |
| `string` | `String` struct + ARC | immutable, copy + retain на присвоении, release при выходе из scope |
| `Ref<T>` | `const T* ptr` | read-only pointer |
| `Mut<T>` | `T* ptr` | read-write pointer |
| `Arc<T>` | `int32_t _refcount; int32_t _weakcount;` встроены в struct T | ARC |
| `Weak<T>` | Тот же struct что Arc; `tsc_weak_create` = инкремент `_weakcount` | не удерживает объект |

> **`Move<T>` не существует** — move это операция передачи ownership, а не режим хранения. В C нет нового типа: `Move<T>` = `T`. Bare `T` в параметрах и возвращаемых типах уже означает move.

## Базовые правила

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **копируются**, borrow checker не применяется; `T | null` компилируется в struct с флагом
- **Сложные типы** (массивы, объекты, классы) — управляются ownership системой (move при присвоении)
  - **Строки (`string`)** — **immutable + ARC**. Подробности: ARC-семантика, retain/release, Desktop vs Embedded — см. [03-strings.md](../03-types/03-strings.md) и [03-strings-ownership.md](../03-types/03-strings-ownership.md).

## Файлы этого раздела

| Тема | Файл |
|------|------|
| Примитивы: copy, cleanup, функции, closures | `04-primitives.md` |
| Ref\<T\>, Mut\<T\>, Borrow Checker, передача аргументов, Scope Constraint, @static let | `04-borrow.md` |
| Arc\<T\>/Weak\<T\>: ARC, циклы, upgrade | `04-arc-weak.md` |
| Clone: интерфейс, structuredClone, auto-impl | `04-clone.md` |
| const vs let: мутация, move, Mut\<T\> | `04-const-vs-let.md` |

## Ownership в контексте других разделов

| Тема | Раздел |
|------|--------|
| Классы: move, borrow полей, return borrow из метода | [07-classes/](../07-classes/) |
| Массивы: move, borrow, capacity, срезы | [08-collections/](../08-collections/) |
| Кортежи: move, borrow, spread | [08-collections/](../08-collections/) |
| For-of: borrow vs copy при итерации | [05-control-flow/](../05-control-flow/) |
| Замыкания: capture model, env struct | [06-functions/](../06-functions/) |
| Async ownership: retain-on-capture, cleanup | [10-async/](../10-async/) |
| Cleanup стратегия: goto cleanup, Result+ARC | [09-errors/](../09-errors/) |
| Spread, destructuring: copy-семантика | [08-collections/](../08-collections/) |
