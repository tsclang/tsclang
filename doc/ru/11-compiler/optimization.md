# Оптимизация

[← Вверх](./index.md) | [Предыдущий ←](./debug.md)

---

TSClang генерирует читаемый C и делегирует машинные оптимизации C-компилятору (gcc/clang/avr-gcc). Дублировать десятилетия работы C-компиляторов нет смысла.

## Оптимизации на уровне IR

Выполняются компилятором TSClang **независимо от уровня оптимизации**:

| Оптимизация | Описание |
|-------------|----------|
| **Dead code elimination** | Функции, типы и импорты, недостижимые из entry point, не эмитируются в C. Проверяется статически по графу вызовов |
| **Monomorphization deduplication** | Одна generic-инстанциация (`Map<string, i32>`) используется в N местах → одна C-функция, не N копий |

Других IR-уровневых оптимизаций нет — constant folding, inlining, loop unrolling — всё это задача C-компилятора.

## Уровни оптимизации

Уровень `optimize` передаётся как флаг C-компилятору. Не влияет на корректность генерируемого C.

| Уровень | Флаг | Когда использовать |
|---------|------|--------------------|
| `O0` | `-O0` | Debug — читаемый C, быстрая компиляция, нет оптимизаций |
| `O1` | `-O1` | Базовые оптимизации без увеличения размера бинаря |
| `O2` | `-O2` | Стандартный release — скорость без агрессивного увеличения размера |
| `O3` | `-O3` | Максимальная скорость — больший бинарь, возможен loop unroll/vectorize |
| `Os` | `-Os` | Минимальный размер — для embedded с ограниченным flash |

Дефолт: `O0` в debug, `O2` в release. Для AVR рекомендуется `Os`.

### Конфигурация

```json
// tsc.package.json
{
  "profiles": {
    "debug":   { "optimize": "O0" },
    "release": { "optimize": "O2" },
    "avr":     { "optimize": "Os" }
  }
}
```

### CLI

```bash
tsclang build --optimize Os     # переопределить уровень
tsclang build --clean           # полная пересборка
```

## Consumer-side monomorphization

Дженерики инстанцируются **у потребителя**, а не в библиотеке. Библиотека компилируется один раз в IR с «дырами» для типов.

### Как это работает

**Библиотека** (`@myco/collections`):

```typescript
// index.tsc
export function identity<T>(x: T): T {
    return x
}

export class Box<T> {
    constructor(public value: T) {}
}
```

**Кеш библиотеки** содержит IR, не конкретные типы:

```
~/.tsclang/cache/@myco/collections@1.0.0/
  source/
    index.tsc
  build/
    desktop/
      include/
        collections.h      // IR с type holes
      lib/
        libcollections.a   // скомпилированный IR
```

**Потребитель**:

```typescript
import { identity, Box } from "@myco/collections"

const a = identity(42)           // identity<i32>
const b = identity("hello")      // identity<string>
const box = new Box<User>({...}) // Box<User>
```

**При компиляции проекта:**

1. Загрузить IR библиотеки с type holes
2. Найти использования: `identity<i32>`, `identity<string>`, `Box<User>`
3. Инстанцировать код для каждого типа

### C-output

```c
// identity<i32>
int32_t  identity_i32(int32_t x)   { return x; }

// identity<string>
String*  identity_string(String* x) { return x; }

// Box<User>
typedef struct { User* value; } Box_User;
```

### Преимущества

- Библиотека компилируется один раз (не для каждого набора типов)
- Оптимальная производительность — inlining и специализация под конкретный тип
- В бинарь попадает только используемое

### metadata.json

Скомпилированная библиотека содержит `metadata.json` для consumer-side monomorphization:

```json
{
  "exports": {
    "foo": { "layout_hash": "abc123" },
    "Bar": { "layout_hash": "def456", "size": 16 }
  },
  "generics": {
    "identity": { "params": ["T"] },
    "Map": { "params": ["K", "V"] }
  }
}
```

- `exports` — конкретные (не generic) экспорты с хешом layout (инвалидация кеша при изменении структуры)
- `generics` — generic-экспорты с именами параметров

### Структура скомпилированной библиотеки

```
@myco/mylib@1.0.0/
  source/
    index.tsc
    src/
      utils.tsc
  build/
    desktop/
      include/
        mylib.h
      lib/
        libmylib.a
  metadata.json
```

## Incremental compilation *(roadmap)*

Без incremental compilation каждый ребилд повторяет все generic-инстанциации. Планируется три уровня кеширования:

### 1. Кеш generic-инстанциаций

Результат `Map<string, User>` → C-код сохраняется с ключом `(generic_ir_hash, type_args)`. Если IR и типы не изменились — C-код берётся из кеша.

### 2. File-level dependency tracking

Каждый `.tsc` файл компилируется независимо, если его зависимости не изменились. Граф строится из `import`. Изменение `utils.tsc` перекомпилирует только импортирующие файлы.

### 3. IR caching

Скомпилированный IR каждого модуля кешируется по хешу исходника. `tsclang build` проверяет хеши и пропускает неизменённые модули.

### Инвалидация кеша

Автоматическая при:
- изменении исходного `.tsc` файла
- изменении версии зависимости (через `layout_hash` в `metadata.json`)
- изменении версии компилятора

Явная очистка: `tsclang build --clean`.

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cache corrupted: layout_hash mismatch` | Кеш библиотеки устарел — нужен `tsclang build --clean` |
| `unknown optimization level 'O5'` | Неверное значение `optimize` — допустимы O0, O1, O2, O3, Os |

## См. также

- [Фазы компиляции](./phases.md) — IR, кодогенерация
- [Name mangling](./name-mangling.md) — кодирование generic-типов
- [Дженерики](../04-classes/generics.md) — синтаксис и семантика дженериков
- [CMake](../09-build/cmake.md) — профили debug/release, флаги оптимизации
- [Конфигурация](../09-build/config.md) — поле `optimize` в `tsc.package.json`
