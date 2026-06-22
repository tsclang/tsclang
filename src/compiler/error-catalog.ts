// TSClang error code catalog.
// Each entry: code → { title, body }
// Used by `tsclang explain <CODE>`.

export const ERROR_CATALOG = {
  E001: {
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
};

export function explainError(code) {
  const entry = ERROR_CATALOG[code.toUpperCase()];
  if (!entry) return null;
  return `${code.toUpperCase()}: ${entry.title}\n${entry.body.trimEnd()}\n`;
}
