## Extension Methods

╨Ф╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╡ ╨╝╨╡╤В╨╛╨┤╨╛╨▓ ╨║ ╤Б╤Г╤Й╨╡╤Б╤В╨▓╤Г╤О╤Й╨╕╨╝ ╤В╨╕╨┐╨░╨╝ ╨▒╨╡╨╖ ╨╕╨╖╨╝╨╡╨╜╨╡╨╜╨╕╤П ╨╕╤Е ╨╛╨┐╤А╨╡╨┤╨╡╨╗╨╡╨╜╨╕╤П. ╨Ш╨╝╨┐╨╛╤А╤В╨╕╤А╤Г╤О╤В╤Б╤П ╤П╨▓╨╜╨╛ тАФ ╨╜╨╡ ╨╖╨░╨│╤А╤П╨╖╨╜╤П╤О╤В ╤В╨╕╨┐ ╨│╨╗╨╛╨▒╨░╨╗╤М╨╜╨╛.

```typescript
// std/string.tsc тАФ ╨╛╨▒╤К╤П╨▓╨╗╨╡╨╜╨╕╨╡ extension
export extension function charCount(this: string): number {
    // ... ╨┐╨╛╨┤╤Б╤З╤С╤В codepoints
}

export extension function chars(this: string): Iterator<number> {
    // ... ╨╕╤В╨╡╤А╨░╤В╨╛╤А ╨┐╨╛ codepoints
}
```

```typescript
// main.tsc тАФ ╨╕╤Б╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╨╜╨╕╨╡
import { charCount, chars } from "std/string"

const s = "╨┐╤А╨╕╨▓╨╡╤В"
s.charCount()   // тЬЕ тАФ extension ╨┤╨╛╤Б╤В╤Г╨┐╨╡╨╜ ╨┐╨╛╤Б╨╗╨╡ ╨╕╨╝╨┐╨╛╤А╤В╨░
s.chars()       // тЬЕ

// ╨▓ ╨┤╤А╤Г╨│╨╛╨╝ ╤Д╨░╨╣╨╗╨╡ ╨▒╨╡╨╖ ╨╕╨╝╨┐╨╛╤А╤В╨░:
s.charCount()   // тЭМ ╨╛╤И╨╕╨▒╨║╨░ ╨║╨╛╨╝╨┐╨╕╨╗╤П╤В╨╛╤А╨░: method charCount not found on string
                //    hint: import { charCount } from "std/string"
```

**╨Я╤А╨░╨▓╨╕╨╗╨░:**
- `this` тАФ ╨┐╨╡╤А╨▓╤Л╨╣ ╨┐╨░╤А╨░╨╝╨╡╤В╤А, ╤Г╨║╨░╨╖╤Л╨▓╨░╨╡╤В ╤А╨░╤Б╤И╨╕╤А╤П╨╡╨╝╤Л╨╣ ╤В╨╕╨┐; ╨╜╨╡ ╨┐╨╡╤А╨╡╨┤╨░╤С╤В╤Б╤П ╤П╨▓╨╜╨╛ ╨┐╤А╨╕ ╨▓╤Л╨╖╨╛╨▓╨╡
- ╨Ь╨╡╤В╨╛╨┤╤Л ╤В╨╕╨┐╨░ ╨╕╨╝╨╡╤О╤В **╨┐╤А╨╕╨╛╤А╨╕╤В╨╡╤В** ╨╜╨░╨┤ extension тАФ ╨┐╨╡╤А╨╡╨╛╨┐╤А╨╡╨┤╨╡╨╗╨╕╤В╤М ╤Б╤Г╤Й╨╡╤Б╤В╨▓╤Г╤О╤Й╨╕╨╣ ╨╝╨╡╤В╨╛╨┤ ╨╜╨╡╨▓╨╛╨╖╨╝╨╛╨╢╨╡╨╜ (╨╛╤И╨╕╨▒╨║╨░ ╨║╨╛╨╝╨┐╨╕╨╗╤П╤В╨╛╤А╨░). ╨а╨░╤Б╨┐╤А╨╛╤Б╤В╤А╨░╨╜╤П╨╡╤В╤Б╤П ╨╜╨░: ╨╝╨╡╤В╨╛╨┤╤Л ╨║╨╗╨░╤Б╤Б╨╛╨▓, ╨╝╨╡╤В╨╛╨┤╤Л ╨╖╨░╨┤╨╡╨║╨╗╨░╤А╨╕╤А╨╛╨▓╨░╨╜╨╜╤Л╨╡ ╨▓ `.d.tsc` (`declare function`)
  ```typescript
  class User {
      format(): string { return "class" }
  }
  export extension function format(this: User): string { return "ext" }
  // тЭМ error: extension 'format' conflicts with existing method on User
  //    hint: rename extension or use different method name
  ```
- Extension ╨▓╨╕╨┤╨╡╨╜ ╤В╨╛╨╗╤М╨║╨╛ ╨▓ ╤Д╨░╨╣╨╗╨░╤Е ╨│╨┤╨╡ ╨╛╨╜ ╨╕╨╝╨┐╨╛╤А╤В╨╕╤А╨╛╨▓╨░╨╜ тАФ **╨╜╨╡╤В ╨│╨╗╨╛╨▒╨░╨╗╤М╨╜╨╛╨│╨╛ ╨╖╨░╨│╤А╤П╨╖╨╜╨╡╨╜╨╕╤П**
- ╨а╨░╨▒╨╛╤В╨░╨╡╤В ╨┤╨╗╤П ╨╗╤О╨▒╨╛╨│╨╛ ╤В╨╕╨┐╨░: `string`, `i32`, ╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤М╤Б╨║╨╕╤Е `type`/`interface`/`class`

**╨Я╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤М╤Б╨║╨╕╨╡ extensions:**
```typescript
// my_ext.tsc
export extension function toJson(this: User): string {
    return `{"name":"${this.name}","age":${this.age}}`
}
```

```typescript
import { toJson } from "./my_ext"
user.toJson()   // тЬЕ
```

**C-output** тАФ ╤Б╤В╨░╤В╨╕╤З╨╡╤Б╨║╨╕╨╣ ╨▓╤Л╨╖╨╛╨▓, zero overhead:
```c
// import { charCount } from "std/string"  тЖТ
int32_t n = _ext_string_charCount(s);   // ╤Б╤В╨░╤В╨╕╤З╨╡╤Б╨║╨╕╨╣ ╨▓╤Л╨╖╨╛╨▓, ╨╜╨╡╤В vtable
```

**╨Ъ╨╛╨╜╤Д╨╗╨╕╨║╤В ╨┤╨▓╤Г╤Е extensions ╤Б ╨╛╨┤╨╕╨╜╨░╨║╨╛╨▓╤Л╨╝ ╨╕╨╝╨╡╨╜╨╡╨╝:**

╨Х╤Б╨╗╨╕ ╨┤╨▓╨░ ╤А╨░╨╖╨╜╤Л╤Е ╨╝╨╛╨┤╤Г╨╗╤П ╤Н╨║╤Б╨┐╨╛╤А╤В╨╕╤А╤Г╤О╤В extension ╤Б ╨╛╨┤╨╕╨╜╨░╨║╨╛╨▓╤Л╨╝ ╨╕╨╝╨╡╨╜╨╡╨╝ ╨┤╨╗╤П ╨╛╨┤╨╜╨╛╨│╨╛ ╤В╨╕╨┐╨░ тАФ ╤Н╤В╨╛ ╨╛╤И╨╕╨▒╨║╨░ ╨║╨╛╨╝╨┐╨╕╨╗╤П╤В╨╛╤А╨░ ╨┐╤А╨╕ ╨┐╨╛╨┐╤Л╤В╨║╨╡ ╨╕╤Б╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╤М ╨╛╨▒╨░ ╨╛╨┤╨╜╨╛╨▓╤А╨╡╨╝╨╡╨╜╨╜╨╛:

```typescript
// module-a.tsc
export extension function format(this: string): string { ... }

// module-b.tsc
export extension function format(this: string): string { ... }

// main.tsc
import { format } from "./module-a"
import { format } from "./module-b"   // тЭМ ╨╛╤И╨╕╨▒╨║╨░: ambiguous extension 'format' for type 'string'
                                      //    hint: use 'import { format as fmtA } from "./module-a"'
```

╨а╨░╨╖╤А╨╡╤И╨╡╨╜╨╕╨╡ тАФ ╨┐╨╡╤А╨╡╨╕╨╝╨╡╨╜╨╛╨▓╨░╤В╤М ╨┐╤А╨╕ ╨╕╨╝╨┐╨╛╤А╤В╨╡ ╤З╨╡╤А╨╡╨╖ `as`:

```typescript
import { format as fmtA } from "./module-a"
import { format as fmtB } from "./module-b"

"hello".fmtA()   // тЬЕ ╤П╨▓╨╜╨╛ ╨╝╨╛╨┤╤Г╨╗╤М-a
"hello".fmtB()   // тЬЕ ╤П╨▓╨╜╨╛ ╨╝╨╛╨┤╤Г╨╗╤М-b
```

╨Ш╨╝╨┐╨╛╤А╤В╨╕╤А╨╛╨▓╨░╤В╤М ╨╛╨┤╨╜╨╛ ╨╕╨╝╤П (╨▓╤В╨╛╤А╨╛╨╣ ╨╜╨╡ ╨╕╨╝╨┐╨╛╤А╤В╨╕╤А╨╛╨▓╨░╨╜) тАФ ╨╛╤И╨╕╨▒╨║╨╕ ╨╜╨╡╤В:

```typescript
import { format } from "./module-a"   // тЬЕ тАФ ╤В╨╛╨╗╤М╨║╨╛ ╨╛╨┤╨╕╨╜, ╨╜╨╡╤В ╨║╨╛╨╜╤Д╨╗╨╕╨║╤В╨░
"hello".format()
```

