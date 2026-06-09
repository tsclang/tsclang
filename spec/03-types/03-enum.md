## Enum

### ╨з╨╕╤Б╨╗╨╛╨▓╨╛╨╣ enum

```typescript
enum Direction { North, South, East, West }   // 0, 1, 2, 3
enum Color { Red = 1, Green = 2, Blue = 4 }   // ╤П╨▓╨╜╤Л╨╡ ╨╖╨╜╨░╤З╨╡╨╜╨╕╤П (╨▒╨╕╤В╨╛╨▓╤Л╨╡ ╤Д╨╗╨░╨│╨╕)
```

C-output:
```c
typedef enum { Direction_North = 0, Direction_South = 1, Direction_East = 2, Direction_West = 3 } Direction;
static const Direction Direction_values[] = { Direction_North, Direction_South, Direction_East, Direction_West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

### ╨б╤В╤А╨╛╨║╨╛╨▓╤Л╨╣ enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

C-output:
```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

### const enum

╨в╨╛╨╗╤М╨║╨╛ C enum, ╨▒╨╡╨╖ runtime ╤В╨░╨▒╨╗╨╕╤Ж. ╨Ш╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╤В╤Б╤П ╨║╨╛╨│╨┤╨░ ╨▓╨░╨╢╨╡╨╜ ╤А╨░╨╖╨╝╨╡╤А ╨▒╨╕╨╜╨░╤А╤П (embedded).

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

C-output:
```c
typedef enum { Pin_PA0 = 0, Pin_PA1 = 1, Pin_PB0 = 8, Pin_PB1 = 9 } Pin;
// ╨▒╨╛╨╗╤М╤И╨╡ ╨╜╨╕╤З╨╡╨│╨╛ тАФ ╨╜╨╡╤В ╤В╨░╨▒╨╗╨╕╤Ж
```

╨г╤В╨╕╨╗╨╕╤В╤Л ╨╜╨░ `const enum` ╨╜╨╡╨┤╨╛╤Б╤В╤Г╨┐╨╜╤Л тАФ ╨╛╤И╨╕╨▒╨║╨░ ╨║╨╛╨╝╨┐╨╕╨╗╤П╤В╨╛╤А╨░:
```typescript
Pin.values()         // error: const enum has no runtime table
Pin.fromValue(0)       // error: const enum has no runtime table
Pin.PA0.toString()   // error: const enum has no runtime table
```

### ╨г╤В╨╕╨╗╨╕╤В╤Л enum (╤В╨╛╨╗╤М╨║╨╛ ╨╛╨▒╤Л╤З╨╜╤Л╨╣ enum)

```typescript
enum Direction { North, South, East, West }

Direction.values()           // Direction[] тАФ ╨▓╤Б╨╡ ╨╖╨╜╨░╤З╨╡╨╜╨╕╤П: [North, South, East, West]
Direction.fromValue(2)         // Direction | null тАФ Direction.East | null ╨╡╤Б╨╗╨╕ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜╨╛
Direction.North.toString()   // string тАФ "North"

// ╨╕╤Б╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╨╜╨╕╨╡
for (const d of Direction.values()) {
    console.log(d.toString());
}

const d = Direction.fromValue(userInput);
if (d != null) {
    console.log(d.toString());
}
```

### enum ╨▓ switch / match

```typescript
// switch тАФ ╨║╨╛╨╝╨┐╨╕╨╗╤П╤В╨╛╤А ╨▓╤Л╨┤╨░╤С╤В warning ╨╡╤Б╨╗╨╕ ╨╜╨╡ ╨▓╤Б╨╡ ╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨┐╨╛╨║╤А╤Л╤В╤Л
switch (dir) {
    case Direction.North: ...; break;
    case Direction.South: ...; break;
    case Direction.East:  ...; break;
    case Direction.West:  ...; break;
}

// match тАФ ╨╛╤И╨╕╨▒╨║╨░ ╨║╨╛╨╝╨┐╨╕╨╗╤П╤В╨╛╤А╨░ ╨╡╤Б╨╗╨╕ ╨╜╨╡ ╨▓╤Б╨╡ ╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨┐╨╛╨║╤А╤Л╤В╤Л (exhaustiveness)
const label = match (dir) {
    Direction.North => "╨▓╨▓╨╡╤А╤Е",
    Direction.South => "╨▓╨╜╨╕╨╖",
    Direction.East  => "╨▓╨┐╤А╨░╨▓╨╛",
    Direction.West  => "╨▓╨╗╨╡╨▓╨╛",
    // _ ╨╜╨╡ ╨╜╤Г╨╢╨╡╨╜ тАФ ╨▓╤Б╨╡ ╤Б╨╗╤Г╤З╨░╨╕ ╨┐╨╛╨║╤А╤Л╤В╤Л
};
```

### enum vs const enum

| | `enum` | `const enum` |
|---|---|---|
| C-output | `typedef enum` + ╤В╨░╨▒╨╗╨╕╤Ж╤Л | ╤В╨╛╨╗╤М╨║╨╛ `typedef enum` |
| `.values()` | тЬЕ | тЭМ |
| `.fromValue()` | тЬЕ | тЭМ |
| `.toString()` | тЬЕ | тЭМ |
| ╨а╨░╨╖╨╝╨╡╤А ╨▒╨╕╨╜╨░╤А╤П | ╨▒╨╛╨╗╤М╤И╨╡ | ╨╝╨╕╨╜╨╕╨╝╨░╨╗╤М╨╜╤Л╨╣ |
| ╨Я╤А╨╕╨╝╨╡╨╜╨╡╨╜╨╕╨╡ | ╨╛╨▒╤Й╨╕╨╣ ╤Б╨╗╤Г╤З╨░╨╣ | embedded, ╤Д╨╗╨░╨│╨╕, ╨║╨╛╨╜╤Б╤В╨░╨╜╤В╤Л |

### Инициализация переменных enum

Enum — единственный тип в TSClang, требующий явной инициализации. В отличие от TypeScript (где неинициализированная enum-переменная = `undefined`), TSClang требует явного значения или nullable-аннотации.

```typescript
let c: Color;              // compile error: variable of enum type must be initialized
let c: Color = Color.Red;  // OK
let c?: Color;             // OK — sugar for Color | null, default null
let c: Color | null;       // OK — opt_Color, default null
```

Обоснование:
- Авто-init первым членом был бы неожиданным для TS-разработчика (в TS = `undefined`).
- Explicit-value enum с дырками (`enum E { A=5, B=10 }`) делает `= 0` невалидным значением.
- Честнее требовать явное присвоение или `?`, чем молча подставлять значение.
- Nullable enum (`Color | null`) компилируется в `opt_Color` с `has_value` флагом.