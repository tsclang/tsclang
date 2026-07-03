## Extension Methods

Добавление методов к существующим типам без изменения их определения. Импортируются явно — не загрязняют тип глобально.

```typescript
// std/string.tsc — объявление extension
export extension function charCount(this: string): number {
    // ... подсчёт codepoints
}

export extension function chars(this: string): Iterator<number> {
    // ... итератор по codepoints
}
```

```typescript
// main.tsc — использование
import { charCount, chars } from "std/string"

const s = "привет"
s.charCount()   // ✅ — extension доступен после импорта
s.chars()       // ✅

// в другом файле без импорта:
s.charCount()   // ❌ ошибка компилятора: method charCount not found on string
                //    hint: import { charCount } from "std/string"
```

**Правила:**
- `this` — первый параметр, указывает расширяемый тип; не передаётся явно при вызове
- Методы типа имеют **приоритет** над extension — переопределить существующий метод невозможен (ошибка компилятора). Распространяется на: методы классов, методы задекларированные в `.d.tsc` (`declare function`)
  ```typescript
  class User {
      format(): string { return "class" }
  }
  export extension function format(this: User): string { return "ext" }
  // ❌ error: extension 'format' conflicts with existing method on User
  //    hint: rename extension or use different method name
  ```
- Extension виден только в файлах где он импортирован — **нет глобального загрязнения**
- Работает для любого типа: `string`, `i32`, пользовательских `type`/`interface`/`class`

**Пользовательские extensions:**
```typescript
// my_ext.tsc
export extension function toJson(this: User): string {
    return `{"name":"${this.name}","age":${this.age}}`
}
```

```typescript
import { toJson } from "./my_ext"
user.toJson()   // ✅
```

**C-output** — статический вызов, zero overhead:
```c
// import { charCount } from "std/string"  →
int32_t n = _ext_string_charCount(s);   // статический вызов, нет vtable
```

**Конфликт двух extensions с одинаковым именем:**

Если два разных модуля экспортируют extension с одинаковым именем для одного типа — это ошибка компилятора при попытке использовать оба одновременно:

```typescript
// module-a.tsc
export extension function format(this: string): string { ... }

// module-b.tsc
export extension function format(this: string): string { ... }

// main.tsc
import { format } from "./module-a"
import { format } from "./module-b"   // ❌ ошибка: ambiguous extension 'format' for type 'string'
                                      //    hint: use 'import { format as fmtA } from "./module-a"'
```

Разрешение — переименовать при импорте через `as`:

```typescript
import { format as fmtA } from "./module-a"
import { format as fmtB } from "./module-b"

"hello".fmtA()   // ✅ явно модуль-a
"hello".fmtB()   // ✅ явно модуль-b
```

Импортировать одно имя (второй не импортирован) — ошибки нет:

```typescript
import { format } from "./module-a"   // ✅ — только один, нет конфликта
"hello".format()
```
