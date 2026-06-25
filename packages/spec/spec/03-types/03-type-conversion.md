## Конвертация типов

### Число → строка

Три способа:

```typescript
const age: i32 = 30;
const pi: f64 = 3.14159;

// 1. .toString() — явный метод на любом числовом типе
const s1 = age.toString();   // "30"
const s2 = pi.toString();    // "3.14159"

// 2. Template literal — автоматически
const s3 = `Age: ${age}`;    // "Age: 30"
const s4 = `Pi = ${pi}`;     // "Pi = 3.14159"

// 3. Конкатенация со строкой
const s5 = "Age: " + age;    // "Age: 30"

// as — НЕ работает для конвертации в строку:
const bad = age as string;   // ошибка компилятора

// 4. Форматированный вывод числа с плавающей точкой
const s6 = pi.toFixed(2);      // "3.14"   — фиксированное количество знаков после запятой
const s7 = pi.toPrecision(4);  // "3.142"  — полное количество значимых цифр
```

`toFixed` и `toPrecision` — только для `f32` и `f64`. Аргумент — числовой литерал в compile-time (не переменная).

### Строка → число

Явный парсинг — возвращает результат или ошибку:

```typescript
// parse — бросает ParseError если строка не число
const age = i32.parse("30");      // i32
const pi  = f64.parse("3.14");    // f64
const bad = i32.parse("abc");     // throws ParseError

// tryParse — возвращает T | null, без throws
const age = i32.tryParse("30");   // 30
const bad = i32.tryParse("abc");  // null

// использование с обработкой ошибок:
function getAge(raw: string): i32 throws ParseError {
    return i32.parse(raw)?;         // propagate ParseError
}

// использование с дефолтом:
const age = i32.tryParse(raw) ?? 0;  // 0 если не распарсилось

// as — НЕ работает для парсинга строк:
const bad = "30" as i32;  // ошибка компилятора: используй i32.parse()
```

Доступно для числовых типов: `i32.parse`, `i64.parse`, `f64.parse`. Другие числовые типы (`i8`, `i16`, `u8`, `u16`, `u32`, `u64`, `f32`) — runtime поддержка ограничена.

### JS-совместимые глобальные функции

Синонимы для привычного JS-синтаксиса:

```typescript
// parseFloat(a) — синоним f64.tryParse(a) → number | null
parseFloat("3.14")   // 3.14
parseFloat("abc")    // null

// parseInt(a) — парсит как f64, затем обрезает дробную часть → number | null
parseInt("3.14")     // 3
parseInt("42")       // 42
parseInt("abc")      // null
parseInt("-7.9")     // -7  (truncate, не floor: к нулю)

// Number(a) — синоним parseFloat(a) → number | null
Number("3.14")       // 3.14
Number("abc")        // null

// String(a) — синоним a.toString() → string (всегда успешно)
String(42)           // "42"
String(3.14)         // "3.14"
String(true)         // "true"
String(null)         // "null"
```

Отличия от JS: `parseInt`/`parseFloat`/`Number` возвращают `T | null` вместо `NaN` — в TSC нет `NaN`.

#### Поддержка числовых префиксов в строках

Все три функции понимают строки с префиксами `0x` (hex), `0b` (binary), `0o` (octal):

```typescript
// parseInt
parseInt("0xFF")     // 255
parseInt("0b1010")   // 10
parseInt("0o77")     // 63

// parseFloat — возвращает целое как f64
parseFloat("0xFF")   // 255.0
parseFloat("0b1010") // 10.0
parseFloat("0o77")   // 63.0

// Number — то же что parseFloat
Number("0xFF")       // 255.0
Number("0b1010")     // 10.0
Number("0o77")       // 63.0
```

Отличие от стандартного JS: в JS `parseFloat("0xFF")` возвращает `NaN` и `parseInt("0b1010")` возвращает `0`. TSClang намеренно расширяет поддержку — все форматы, принятые в числовых литералах языка, принимаются и при парсинге строк.

