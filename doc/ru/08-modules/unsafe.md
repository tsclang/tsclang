# unsafe {} — отключение проверок

[← Вверх](./index.md) | [Следующий →](./callbacks.md) | [Предыдущий ←](./native.md)

---

`unsafe {}` отключает borrow checker и ownership checks для блока TSClang-кода. Используется когда система типов мешает, но inline C не нужен.

## Синтаксис

```typescript
unsafe {
    const x = doRiskyThing()
    const y = value as Ref<u8[]>
    const z = ptr
}
```

Внутри `unsafe {}`:
- **Borrow checker** — отключён
- **Type checker** — отключён
- **Ownership checks** — отключены

## Когда использовать

### Опасный каст типов

```typescript
let raw: u8[] = getBuffer()
unsafe {
    const view = raw as Ref<u8[]>    // unchecked reinterpret
    processBytes(view)
}
```

### Обход move-after-use

```typescript
let ptr = getPointer()
unsafe {
    const a = ptr          // move
    const b = ptr          // ещё один move — без ошибки
    process(a, b)
}
```

### Взаимодействие с native

```typescript
unsafe {
    const handle = native `get_handle()` as Ref<Handle>
    useHandle(handle)
}
```

## Предупреждение компилятора

```
warning: unsafe block — ownership and type checks disabled
```

Подавление в `tsc.package.json`:

```json
{ "allowUnsafe": true }
```

## Различие между native и unsafe

| | `native` | `unsafe {}` |
|---|---|---|
| Код внутри | C (verbatim) | TSClang |
| Назначение | Вызов C кода, макросы, asm | Обход borrow checker |
| Borrow checker | Отключён (C не знает о нём) | Отключён явно |
| Type checker | Отключён | Отключён |
| Предупреждение | ✅ | ✅ |
| Подавить | `allowNative` | `allowUnsafe` |

**Правило:** если код можно написать на TSClang — используйте `unsafe {}`. Если нужен C — используйте `native`.

## C-output

Код внутри `unsafe {}` компилируется как обычный TSClang, но без проверок:

```typescript
let data = getBuffer()
unsafe {
    const view = data as Ref<u8[]>
    processBytes(view)
}
```

```c
Array_u8 data = getBuffer();
const Array_u8 *view = (const Array_u8*)&data;
processBytes_ref_Array_u8(view);
```

## Ошибки

| Ошибка / предупреждение | Причина | Решение |
|-------------------------|---------|---------|
| `warning: unsafe block` | Предупреждение на каждый блок | Подавите через `"allowUnsafe": true` |
| Некорректный C-output | Неверный каст или use-after-free внутри unsafe | Проверяйте код вручную — проверки отключены |

## См. также

- [native — inline C](./native.md) — вербатимная вставка C-кода
- [Borrow checker](../05-memory/borrow-rules.md) — правила, которые отключает `unsafe`
- [Ref\<T\> / Mut\<T\>](../05-memory/ref.md) — система владения
- [@platform — условная компиляция](./platform.md) — платформозависимые unsafe-блоки
