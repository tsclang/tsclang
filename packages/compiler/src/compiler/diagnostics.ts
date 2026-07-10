// TSClang central diagnostic registry.
// Single source of truth for all diagnostic codes (errors + warnings).
//
// Each entry: code → { severity, title, message, help, body }
//   - code:     stable identifier (E0xx ownership, E1xx types, E4xx runtime, W0xx/W8xx warnings)
//   - severity: 'error' | 'warning'
//   - title:    canonical short description (stable, assertable in tests)
//   - message:  instance detail template with {name} placeholders (ICU-compatible, i18n-ready)
//   - help:     optional default help lines (also templates)
//   - body:     long-form explanation for `tsclang explain <CODE>`
//
// Used by:
//   - ctx.errorCode() / ctx.warnCode() → resolve message+help from registry
//   - ctx.error() / ctx.warn()         → look up title by code (legacy)
//   - `tsclang explain <CODE>`         → render body
//   - test engine                      → assert code + title

export type Severity = 'error' | 'warning';

export interface DiagnosticEntry {
  code: string;
  severity: Severity;
  title: string;
  message: string;
  help?: string[];
  body: string;
}

export const DIAGNOSTICS: Record<string, DiagnosticEntry> = {
  // ── E0xx: Ownership ──────────────────────────────────────────────────────
  E001: {
    code: 'E001',
    severity: 'error',
    title: 'cannot assign to `const` variable',
    message: `cannot assign to 'const' variable '{name}'`,
    help: ['change `const` to `let` if this variable needs to be mutable'],
    body: `
Variables declared with \`const\` are immutable — they can only be assigned once
at the point of declaration and cannot be reassigned afterwards.

  const x: i32 = 1;
  x = 2;           // error[E001]

Fix: if the variable needs to change, declare it with \`let\`:

  let x: i32 = 1;
  x = 2;           // ok
`,
  },

  E002: {
    code: 'E002',
    severity: 'error',
    title: 'use of moved value',
    message: `use of moved value: "{name}"`,
    help: ['use the new binding instead', 'clone: const b = a.clone()', 'use Ref<T> to borrow instead of move'],
    body: `
TSClang uses ownership semantics: when you assign a struct or string to a new
variable, the value is *moved* — ownership transfers to the new binding. The
original variable is no longer valid and cannot be used.

  const a = new Point(1, 2);
  const b = a;    // 'a' is moved into 'b'
  console.log(a); // error[E002]: a was moved

Fix options:
  1. Use the new binding (b) instead.
  2. Clone the value before moving: \`const b = a.clone();\`
  3. Use \`Ref<T>\` to borrow instead of move.
`,
  },

  E003: {
    code: 'E003',
    severity: 'error',
    title: 'cannot move out of `const` binding',
    message: `cannot move out of "const" binding`,
    help: ['declare the source variable with `let` if you intend to move it'],
    body: `
Moving a value transfers ownership to a new variable. Moving out of a \`const\`
binding is not allowed because it would leave the const variable in an invalid
(partially-moved) state.

  const s: string = "hello";
  const t = s;   // error[E003]: cannot move out of const binding

Fix: declare the source variable with \`let\` if you intend to move it:

  let s: string = "hello";
  const t = s;   // ok — s is now moved
`,
  },

  E004: {
    code: 'E004',
    severity: 'error',
    title: 'cannot move out of `Ref<T>` borrow',
    message: `cannot move out of "Ref<T>" borrow`,
    help: ['clone the value: const p = r.deref().clone()'],
    body: `
A \`Ref<T>\` is a borrowed reference — it does not own the underlying value.
Moving (transferring ownership) out of a borrow is not allowed, because the
original owner must remain intact for the lifetime of the borrow.

  function take(r: Ref<Point>): void {
    const p = r; // error[E004]: cannot move out of Ref<T>
  }

Fix: if you need an owned copy, clone the value:

  const p = r.deref().clone();  // ok
`,
  },

  E005: {
    code: 'E005',
    severity: 'error',
    title: 'implicit fallthrough in switch',
    message: `implicit fallthrough`,
    help: ['each case must end with `break`, `return`, or `continue`'],
    body: `
In TSClang, \`switch\` cases must not fall through to the next case without an
explicit \`break\`, \`return\`, or \`continue\`. Implicit fallthrough is a common
source of bugs in C-style languages and is therefore a compile error here.

  switch (x) {
    case 1:
      doA();    // error[E005]: implicit fallthrough — missing break
    case 2:
      doB();
      break;
  }

Fix: add \`break;\` (or \`return\`) at the end of each case:

  case 1:
    doA();
    break;   // ok
`,
  },

  E006: {
    code: 'E006',
    severity: 'error',
    title: 'use of moved field value',
    message: `use of moved value: '{field}'`,
    help: ['use the new owner instead of the moved field'],
    body: `
When a struct field of an owned type (string, array, or struct) is moved into
a new variable, that field is no longer accessible on the original struct.

  const h = new Header("name");
  const d = h.data;      // h.data is moved
  console.log(h.data);   // error[E006]: h.data was moved

Fix: use \`d\` (the new owner) instead of \`h.data\`, or restructure to avoid
moving the field.
`,
  },

  E009: {
    code: 'E009',
    severity: 'error',
    title: 'cannot move out of array by index',
    message: `cannot move out of array by index`,
    help: ['use .remove(i) to take ownership'],
    body: `
Arrays in TSClang own their elements. Assigning an element to a new variable
by index would move it out of the array, leaving a gap — this is not allowed
for owned types (structs, arrays).

  const arr = [new Point(1, 2)];
  const p = arr[0];   // error[E009]: cannot move out of array

Fix: use \`.remove(i)\` to take ownership — it removes the element and
shifts the rest:

  const p = arr.remove(0);   // ok — p owns the Point
`,
  },

  // ── E4xx: Runtime panics ─────────────────────────────────────────────────
  E401: {
    code: 'E401',
    severity: 'error',
    title: 'division by zero',
    message: `division by zero`,
    help: ['check the divisor before dividing', 'use safe-math mode with try/catch to recover'],
    body: `
Integer division or modulo by zero is undefined behaviour in C and causes a
hardware trap (SIGFPE) on most platforms. TSClang inserts a runtime guard
that panics with a clear message instead.

  let x: i32 = 10;
  let y: i32 = 0;
  let z = x / y;   // panic[E401]: division by zero

Fix: check the divisor before dividing:

  if (y != 0) { let z = x / y; }

Or use safe-math mode with try/catch to recover:

  try { let z = x / y; } catch (e) { /* handle */ }
`,
  },

  E402: {
    code: 'E402',
    severity: 'error',
    title: 'integer overflow in division',
    message: `integer overflow`,
    help: ['check for this edge case explicitly', 'use safe-math mode with try/catch'],
    body: `
Dividing INT_MIN by -1 overflows: the mathematical result (INT_MAX + 1) cannot
be represented in a signed integer of the same width. In C this is undefined
behaviour. TSClang inserts a runtime guard for int32_t and int64_t types.

  let x: i32 = -2147483648;   // INT32_MIN
  let z = x / -1;             // panic[E402]: integer overflow

Fix: check for this edge case explicitly, or use safe-math mode with try/catch.
`,
  },

  E403: {
    code: 'E403',
    severity: 'error',
    title: 'out of memory',
    message: `out of memory`,
    help: ['increase memory budget', 'check for memory leaks or unbounded allocations'],
    body: `
A memory allocation (malloc/realloc) returned NULL. This means the system ran
out of available memory.

On embedded targets with a fixed pool allocator, this means the pool is full.
On desktop, it means the OS refused to allocate more memory.

Fix: reduce the number of live allocations, or increase the pool size / memory
budget for the target.
`,
  },

  E404: {
    code: 'E404',
    severity: 'error',
    title: 'null cast to non-null',
    message: `null cast to non-null`,
    help: ['check for null before casting', 'use optional chaining ?. instead of as'],
    body: `
Casting an optional (opt_T) value to its non-optional type (T) via \`as\`
asserts the value is present. If the optional is empty (null), this is a
runtime panic.

  const opt: opt_i32 = null;
  const v: i32 = opt as i32;   // panic[E404]: null cast to non-null

Fix: check for presence before casting:

  if (opt.has_value) { const v: i32 = opt.value; }
`,
  },

  E405: {
    code: 'E405',
    severity: 'error',
    title: 'array index out of bounds',
    message: `array index {index} out of bounds (length {length})`,
    help: ['check array length before accessing', 'use .get(i) for safe access'],
    body: `
Accessing an array element by index beyond the array's length is undefined
behaviour in C. TSClang inserts a runtime bounds check when the index is
known at compile time to be potentially out of bounds.

  const arr = [1, 2, 3];
  const x = arr[5];   // panic[E405]: array index 5 out of bounds (length 3)

Fix: check the array length before accessing:

  if (i < arr.length) { const x = arr[i]; }
`,
  },

  E406: {
    code: 'E406',
    severity: 'error',
    title: 'parse failure',
    message: `parse error: '{input}' is not a valid {type}`,
    help: ['use tryParse() for safe parsing without panic'],
    body: `
Parsing a string into a number failed because the string does not represent
a valid value of the target type.

  const x = i32.parse("abc");   // panic[E406]: parse error: 'abc' is not a valid integer

Fix: use the \`tryParse()\` variant which returns an optional instead of
panicking:

  const x = i32.tryParse("abc");   // opt_i32 — none
  if (x.has_value) { ... }
`,
  },

  E407: {
    code: 'E407',
    severity: 'error',
    title: 'Math.min/max on empty array',
    message: `Math.{func}: empty array`,
    help: ['check array length before calling Math.min/max'],
    body: `
Calling \`Math.min()\` or \`Math.max()\` with an empty array (or spread of an
empty array) has no defined result. TSClang panics at runtime.

  const arr: i32[] = [];
  const m = Math.min(...arr);   // panic[E407]: Math.min: empty array

Fix: check the array length first:

  if (arr.length > 0) { const m = Math.min(...arr); }
`,
  },

  E408: {
    code: 'E408',
    severity: 'error',
    title: 'pool exhausted',
    message: `pool exhausted: {name}`,
    help: ['increase pool size', 'reduce number of live allocations'],
    body: `
A pool-allocated class's alloc() returned no slot — the fixed-size pool is
full. All slots are in use and no more instances can be created until some
are freed.

  const pool = new Pool(Foo, 4);
  const a = new Foo();  // ok — slot 1
  // ... 4 more allocations
  const f = new Foo();  // panic[E408]: pool exhausted: Foo

Fix: increase the pool size, or free unused instances before allocating new ones.
`,
  },

  E409: {
    code: 'E409',
    severity: 'error',
    title: 'unwrap of failed Result',
    message: `unwrap of failed Result`,
    help: ['handle the error case with try/catch', 'use ?. instead of ! to propagate'],
    body: `
The \`!\` operator unwraps a Result, asserting success. If the function
returned an error, this is a runtime panic.

  function risky(): throws Error { ... }
  const v = risky()!;   // panic[E409] if risky() throws

Fix: handle the error with try/catch, or propagate with \`?\`:

  try { const v = risky(); } catch (e) { /* handle */ }
`,
  },

  E410: {
    code: 'E410',
    severity: 'error',
    title: 'heap not available on this platform',
    message: `heap not available on this platform`,
    help: ['use stack allocation', 'configure an allocator for this target'],
    body: `
The target platform does not have a heap allocator (e.g. NES, retro targets
with allocator: "none"). Any operation that requires dynamic allocation will
panic.

  const arr = new Array<i32>(10);   // panic[E410]: heap not available on NES

Fix: use stack-allocated arrays or a static pool, or configure an allocator
for the target.
`,
  },

  E411: {
    code: 'E411',
    severity: 'error',
    title: 'uncaught throw',
    message: `uncaught throw`,
    help: ['declare the function as throws', 'wrap the call in try/catch'],
    body: `
A \`throw\` statement was executed in a function that does not declare
\`throws\`, and the throw was not caught by a try/catch. This is a runtime
panic — the error cannot be propagated.

  function f(): void {
    throw new Error("boom");   // panic[E411]: uncaught throw
  }

Fix: declare the function as \`throws\`, or wrap the call in try/catch:

  function f(): throws Error {
    throw new Error("boom");   // ok — propagates to caller
  }
`,
  },

  // ── W0xx: Warnings ───────────────────────────────────────────────────────
  W001: {
    code: 'W001',
    severity: 'warning',
    title: 'condition is always true',
    message: `condition is always true`,
    help: ['the condition will always evaluate to true'],
    body: `
A class, Array, Map, or Set used as a boolean condition is always truthy.
This may indicate a logic error — the condition will never be false.

  const arr = [1, 2, 3];
  if (arr) { ... }   // warning[W001]: condition is always true
`,
  },

  W002: {
    code: 'W002',
    severity: 'warning',
    title: 'condition is always false',
    message: `condition is always false`,
    help: ['the condition will always evaluate to false', 'the branch is dead code'],
    body: `
A condition that can never be true produces dead code. This may indicate a
logic error or an impossible check after a previous assertion.

  const s: string = "hello";
  if (s == null) { ... }   // warning[W002]: condition is always false
`,
  },

  W003: {
    code: 'W003',
    severity: 'warning',
    title: 'switch on enum is not exhaustive',
    message: `switch on enum '{name}' is not exhaustive`,
    help: ['add a default case', 'handle all enum variants'],
    body: `
A switch on an enum type does not cover all variants and has no default case.
If a new variant is added later, the switch will silently skip it.

  switch (color) {
    case Color.Red:   ...; break;
    case Color.Green: ...; break;
    // missing Color.Blue — warning[W003]
  }

Fix: add a default case or handle all variants explicitly.
`,
  },

  W004: {
    code: 'W004',
    severity: 'warning',
    title: 'native block used',
    message: `native block used`,
    help: ['native blocks contain platform-specific C code', 'ensure the C code is correct and portable'],
    body: `
A \`native\` block embeds raw C code directly. This bypasses TSClang's type
system and ownership rules. Review the embedded C carefully.

  native<int> {
    return some_c_function();
  }
`,
  },

  W005: {
    code: 'W005',
    severity: 'warning',
    title: 'unsafe block used',
    message: `unsafe block used`,
    help: ['unsafe blocks bypass ownership and type checks', 'review carefully for memory safety'],
    body: `
An \`unsafe\` block disables certain compile-time checks (ownership, borrow,
type narrowing). This is intended for low-level interop but should be used
sparingly.

  unsafe {
    // raw pointer manipulation, etc.
  }
`,
  },

  W006: {
    code: 'W006',
    severity: 'warning',
    title: 'async recursion requires heap allocation',
    message: `async function '{name}' recurses; heap allocation required for state machine`,
    help: ['consider an iterative approach to avoid heap allocation'],
    body: `
An async function that calls itself (directly or indirectly) requires heap
allocation for the state machine, because each recursion level needs its own
state. On heapless targets, this is not possible.

  async function recurse(n: i32): Promise<void> {
    if (n > 0) await recurse(n - 1);   // warning[W006]
  }

Fix: rewrite as an iterative loop if possible.
`,
  },

  W007: {
    code: 'W007',
    severity: 'warning',
    title: 'struct field padding inefficiency',
    message: `struct '{name}' has inefficient field padding ({bytes} bytes wasted)`,
    help: ['reorder fields by decreasing alignment to reduce padding', 'use @packed to eliminate padding'],
    body: `
Struct fields are laid out in declaration order with C alignment rules.
Suboptimal ordering wastes memory on padding between fields.

  class Bad { a: u8; b: i64; c: u8; }   // 24 bytes, 14 wasted
  class Good { b: i64; a: u8; c: u8; }  // 16 bytes, 6 wasted

Fix: order fields by decreasing alignment (largest first).
`,
  },

  W008: {
    code: 'W008',
    severity: 'warning',
    title: 'move from const binding in strict mode',
    message: `cannot move from const binding '{name}' in strict mode`,
    help: ['declare the variable with let if you intend to move it'],
    body: `
In strict mode, moving a value out of a \`const\` binding produces a warning
(in non-strict mode this is allowed). Moving from const leaves the binding
in an invalid state.

  const s: string = "hello";
  const t = s;   // warning[W008]: move from const in strict mode

Fix: declare the source variable with \`let\`.
`,
  },

  W009: {
    code: 'W009',
    severity: 'warning',
    title: 'readonly class with mut method',
    message: `class '{name}' has all readonly fields but contains mut method '{method}'`,
    help: ['consider making the method non-mut', 'or add mutable fields if mutation is intended'],
    body: `
A class where all fields are \`readonly\` has a \`mut\` method. Since the method
cannot modify any fields, the \`mut\` qualifier is likely unnecessary and
prevents calling the method on const bindings.

  class Counter {
    readonly count: i32;
    mut inc(): void { ... }   // warning[W009]: no mutable fields
  }

Fix: remove \`mut\` from the method, or add mutable fields.
`,
  },

  W010: {
    code: 'W010',
    severity: 'warning',
    title: 'blocking Mutex.lock() in async context',
    message: `Mutex.lock() in async function '{name}' blocks the event loop`,
    help: ['use Mutex.tryLock() for non-blocking acquisition'],
    body: `
Calling \`Mutex.lock()\` inside an async function blocks the event loop until
the lock is acquired. This can cause deadlocks or stall other async tasks.

  async function work(m: Mutex): Promise<void> {
    m.lock();   // warning[W010]: blocks event loop
    // ...
    m.unlock();
  }

Fix: use \`tryLock()\` and yield if the lock is not available.
`,
  },

  W011: {
    code: 'W011',
    severity: 'warning',
    title: 'expensive type on 8-bit target',
    message: `{type} is expensive on 8-bit target`,
    help: ['consider using i32 or fixed-point decimal instead'],
    body: `
On 8-bit targets (AVR, etc.), 64-bit integer and float operations are
emulated in software and are very slow. The compiler warns when these types
are used.

  let x: i64 = 0;   // warning[W011]: i64 on 8-bit target

Fix: use \`i32\` or \`u32\` if the range suffices, or use fixed-point
decimal types (d8, d16) for fractional values.
`,
  },
};

// Look up a diagnostic entry by code (case-insensitive).
// Returns null if the code is not registered.
export function lookupDiagnostic(code: string): DiagnosticEntry | null {
  return DIAGNOSTICS[code.toUpperCase()] ?? null;
}

// Format a diagnostic entry for `tsclang explain <CODE>`.
// Returns null if the code is unknown.
export function explainError(code: string): string | null {
  const entry = lookupDiagnostic(code);
  if (!entry) return null;
  return `${entry.code}: ${entry.title}\n${entry.body.trimEnd()}\n`;
}

// Substitute {name} placeholders in a template string with actual values.
// ICU MessageFormat-compatible: {name} → params[name].
// Unknown placeholders are left as-is.
export function substituteParams(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = params[key];
    return val !== undefined ? String(val) : match;
  });
}
