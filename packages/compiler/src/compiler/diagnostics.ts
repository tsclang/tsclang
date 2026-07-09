// TSClang central diagnostic registry.
// Single source of truth for all diagnostic codes (errors + warnings).
//
// Each entry: code → { severity, title, body }
//   - code:     stable identifier (E0xx ownership, E1xx types, E4xx runtime, W0xx/W8xx warnings)
//   - severity: 'error' | 'warning'
//   - title:    canonical short description (stable, assertable in tests)
//   - body:     long-form explanation for `tsclang explain <CODE>`
//
// Used by:
//   - ctx.error() / ctx.warn()  → look up title by code
//   - `tsclang explain <CODE>`  → render body
//   - test engine               → assert code + title

export type Severity = 'error' | 'warning';

export interface DiagnosticEntry {
  code: string;
  severity: Severity;
  title: string;
  body: string;
}

export const DIAGNOSTICS: Record<string, DiagnosticEntry> = {
  // ── E0xx: Ownership ──────────────────────────────────────────────────────
  E001: {
    code: 'E001',
    severity: 'error',
    title: 'cannot assign to `const` variable',
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
    body: `
Dividing INT_MIN by -1 overflows: the mathematical result (INT_MAX + 1) cannot
be represented in a signed integer of the same width. In C this is undefined
behaviour. TSClang inserts a runtime guard for int32_t and int64_t types.

  let x: i32 = -2147483648;   // INT32_MIN
  let z = x / -1;             // panic[E402]: integer overflow

Fix: check for this edge case explicitly, or use safe-math mode with try/catch.
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
