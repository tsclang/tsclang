## Классы

**Наследования нет** — только композиция. `extends` запрещён, **кроме одного исключения**: `class MyError extends Error` — прямой наследник `Error`. Цепочки запрещены: `class TimeoutError extends NetworkError` — ошибка компилятора. Полиморфизм — только через `interface` + `implements`.

Для логической группировки ошибок — интерфейс:
```typescript
interface INetworkError { code: i32 }

class NetworkError extends Error implements INetworkError { code: i32 }
class TimeoutError extends Error implements INetworkError {
    code: i32
    constructor(msg: string) { super(msg); this.code = 408 }
}

// группировка через интерфейс:
function handleNetworkError(e: INetworkError): void { ... }
```

Это сохраняет flat C-структуры без type_id и делает catch статически типизированным.

```typescript
// вместо наследования — композиция
class Animal {
    name: string;
    mut speak(): string { ... }
}

class Dog {
    animal: Animal;  // композиция
    breed: string;
}
```

`mut` определяет семантику `this`. Модификаторы методов и полей:

| Модификатор | Описание |
|-------------|----------|
| `public` | виден везде (по умолчанию) |
| `private` | виден только внутри класса |
| `static` | метод на классе, нет `this` |
| `mut` | `this` — `Mut<Self>`, иначе `Ref<Self>` |
| `move` | `this` — `Self` (owned), объект перемещается в метод при вызове |

```typescript
class Counter {
    private value: i32 = 0;

    public get(): i32 {                  // this — Ref<Counter>
        return this.value;
    }

    public mut increment(): void {       // this — Mut<Counter>
        this.value++;
    }

    private mut reset(): void {          // private mutable
        this.value = 0;
    }

    static create(): Counter {           // static — нет this
        return new Counter();
    }

    private static default(): Counter {  // private static
        return new Counter();
    }
}

const c = new Counter();
c.get();        // ok
c.increment();  // ошибка: нельзя вызвать mut метод на const

let c2 = new Counter();
c2.increment(); // ok
```

- `static` + `mut` — недопустимо, ошибка компилятора (нет `this`)
- `protected` — отсутствует (нет наследования)

## Семантика `this` и доступ к полям
