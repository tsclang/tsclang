## switch / case

Синтаксис как в JS/TS. **Implicit fallthrough запрещён** — забытый `break` или `return` это ошибка компилятора.

```typescript
switch (status) {
    case 200:
        handleOk();
        break;
    case 404:
        handleNotFound();
        break;
    case 500:
    case 503:           // группировка case — ok (оба ведут к одному телу)
        handleError();
        break;
    default:
        handleUnknown();
}
```

- `break` или `return` обязательны в каждом `case` — иначе ошибка компилятора
- Группировка пустых `case` (`case 500: case 503:`) разрешена
- `default` необязателен, но компилятор выдаёт warning если не покрыты все значения enum
- Switch работает на: числовых типах, `string`, `boolean`, enum
- Внутри `async`-функции `switch` транслируется в `if/else if` (см. [10-async: switch внутри async](../10-async/10-async.md))

