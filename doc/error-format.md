# TSClang Error Format v2 — Rustc-style

## Целевой вид

**Простая ошибка:**
```
error: cannot assign to 'const' variable 'x'
 --> input.tsc:2:3
  |
1 | const x: i32 = 42;
2 | x = 1;
  |   ^ cannot assign here
  |
  = help: use `let` instead of `const`
aborting due to 1 error
```

**Borrow-checker с двумя локациями:**
```
error[E012]: use of moved value: "o"
 --> input.tsc:8:13
  |
6 | const p = o;
  |           - value moved here
  |
8 | console.log(o.x);
  |             ^ use of moved value
  |
  = help: consider a Ref<T> borrow instead
  = note: "o" has no implicit copy
```

## Цветовая схема

| Элемент | Функция |
|---------|---------|
| `error[E001]:` | `boldRed` |
| текст сообщения | `bold` |
| ` --> file:line:col` | `cyan` |
| `N \|` номер + гейтер | `cyan` |
| `  \|` пустой гейтер | `cyan` |
| `^` primary caret + label | `boldRed` |
| `-` secondary span + label | `yellow` |
| `= help:` + текст | `green` |
| `= note:` + текст | `cyan` |
| `...` разрыв | `dim` |

## Архитектура

### `src/compiler/colors.js` (новый файл)

```js
let _enabled = process.stderr.isTTY
  && process.env.NO_COLOR === undefined
  && process.env.TERM !== 'dumb';

export const setColorEnabled = (b) => { _enabled = b; };
export const isColorEnabled  = ()  => _enabled;

const style = (...codes) => (s) =>
  _enabled ? `\x1b[${codes.join(';')}m${s}\x1b[0m` : s;

export const bold    = style(1);
export const boldRed = style(1, 31);   // error header, primary ^
export const yellow  = style(1, 33);   // secondary span -, warnings
export const green   = style(1, 32);   // = help:
export const cyan    = style(36);      // -->, |, line numbers, = note:
export const dim     = style(2);       // ... (gap marker)
```

Композиция: `boldRed('x') === '\x1b[1;31mx\x1b[0m'`. Вложенность не нужна.

### Расширение `TscError`

```js
// Новые поля в конструкторе:
this.label   = opts.label   ?? null;   // текст после primary ^ e.g. "value moved here"
this.spans   = opts.spans   ?? [];     // вторичные спаны (см. ниже)
this.help    = opts.help    ?? [];     // string[] → "= help:" строки
// this.notes — уже есть → "= note:" строки
// this.code  — уже есть → "[E001]" в заголовке
```

**Формат вторичного спана:**
```js
{
  line:   Number,   // 1-based
  col:    Number,   // 1-based
  endCol: Number,   // exclusive
  char:   '-',      // символ подчёркивания ('-', '~', etc.)
  label:  String,   // текст после символов, null = без текста
}
```

### Алгоритм `renderDiagnostic`

```
1. Header:
   boldRed(`error${code ? '['+code+']' : ''}:`) + ' ' + bold(message)

2. Location:
   cyan(' --> ') + `${file}:${line}:${col}`

3. Collect affected lines:
   anchors = Set { diag.line, ...diag.spans.map(s => s.line) }
   Expand each anchor ±contextLines (default 1)
   Merge → sorted deduplicated list
   Gap: '...' (dim) только когда соседние строки отличаются > 1
   → спаны на 6 и 8, contextLines=1 → {5,6,7,8,9} — без разрыва

4. Render lines:
   Перед первым блоком: cyan(`${pad}  |`)  — пустой гейтер сверху
   Для каждой строки ln:
     a. Если gap: emit dim('...')
     b. Expand tabs в исходной строке (TAB_WIDTH=4)
     c. Emit: cyan(lineNum) + cyan(' | ') + expandedContent
     d. Collect spans для этой строки (primary first, secondary after)
     e. Для каждого спана:
        vStart = visualCol(rawLine, span.col)
        vEnd   = visualCol(rawLine, span.endCol)  ← оба через visualCol (tabs!)
        spanLen = max(1, vEnd - vStart)
        Emit: cyan('  | ') + ' '.repeat(vStart) + color(char.repeat(spanLen) + ' ' + label)
        primary → boldRed; secondary → yellow
   После последнего блока: cyan(`${pad}  |`) — пустой гейтер снизу

5. help: green('  = help:') + ' ' + text
6. note: cyan('  = note:') + ' ' + text
```

### Tab-aware визуальная колонка

```js
const TAB_WIDTH = 4;

function expandTabs(s) {
  let result = '', vcol = 0;
  for (const ch of s) {
    if (ch === '\t') {
      const n = TAB_WIDTH - (vcol % TAB_WIDTH);
      result += ' '.repeat(n); vcol += n;
    } else {
      result += ch; vcol++;
    }
  }
  return result;
}

// Visual position of source col (1-based) in expanded line
function visualCol(srcLine, col1based) {
  return expandTabs(srcLine.slice(0, col1based - 1)).length;
}
```

Оба конца спана (`col`, `endCol`) вычисляются через `visualCol()` — каретка не съедет.

### `bin/index.js` изменения

```js
import { setColorEnabled } from '../src/compiler/colors.js';

// До любого вывода:
if (args.includes('--no-color')) setColorEnabled(false);

// В catch:
if (e?.isTscError) {
  process.stderr.write(renderDiagnostic(e, { contextLines: 1 }) + '\n');
} else {
  process.stderr.write(`${filename}: ${e.message}\n`);
}
process.stderr.write('aborting due to 1 error\n');
```

## Нюансы реализации

- **Порядок меток на одной строке:** primary (`^`) первым, secondary (`-`) после. Каждый на отдельной строке гейтера. Объединение в одну строку — Phase B.
- **Длинные лейблы:** текст справа без переноса. Проверка на перекрытие — Phase B.
- **`...` разрыв:** только если gap > 1 строки между соседними показываемыми строками.
- **`boldRed`** уже содержит bold — отдельный `bold()` для текста сообщения.

## Codegen API расширение (Phase B)

```js
// Текущий метод:
error(msg, node, notes = [])

// После Phase B:
error(msg, node, opts = {}) {
  // opts: { label, spans, help, notes, code }
}
```

Первые кандидаты на вторичные спаны: `err-use-after-move`, `err-use-after-field-move`.

## Phase B (отложено)

- DiagnosticBag — несколько ошибок за проход
- `--explain <CODE>` — каталог кодов ошибок
- Parser `err()` → TscError (сниппет для parse errors)
- `warnings` счётчик в итоговой строке
- `--all-errors` для обрезки при > 10 ошибок
- Объединение не-пересекающихся меток в одну строку гейтера
