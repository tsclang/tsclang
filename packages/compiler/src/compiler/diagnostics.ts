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

export const DIAGNOSTICS = {
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

  // ── E1x: Borrow checking ──────────────────────────────────────────────────
  E010: {
    code: 'E010',
    severity: 'error',
    title: 'cannot mutate while borrowed',
    message: `cannot mutate '{name}' while a borrow is active`,
    help: ['wait for the borrow to go out of scope before mutating', 'use Ref<T> instead of Mut<T> if you only need read access'],
    body: `
TSClang's borrow checker prevents mutating a value while it is borrowed,
to avoid dangling references.

  const r = Mut<T>(x);
  x.field = 1;   // error[E010]: x is borrowed by r
  r.release();

Fix: release the borrow before mutating, or restructure to avoid the overlap.
`,
  },

  E011: {
    code: 'E011',
    severity: 'error',
    title: 'cannot access while mutably borrowed',
    message: `cannot access '{name}' while a mutable borrow is active`,
    help: ['wait for the Mut<T> borrow to go out of scope', 'use Ref<T> for shared read access instead of Mut<T>'],
    body: `
While a value is mutably borrowed (Mut<T>), no other access is allowed —
not even a read. This prevents data races.

  const m = Mut<T>(x);
  console.log(x);   // error[E011]: x is mutably borrowed
  m.release();

Fix: release the mutable borrow first, or use Ref<T> for shared access.
`,
  },

  E012: {
    code: 'E012',
    severity: 'error',
    title: 'two simultaneous mutable borrows',
    message: `cannot create two simultaneous mutable borrows of '{name}'`,
    help: ['only one Mut<T> may exist at a time', 'use Ref<T> for shared access if multiple readers are needed'],
    body: `
TSClang follows Rust's aliasing rule: at most one mutable borrow (Mut<T>)
may be active at a time.

  const m1 = Mut<T>(x);
  const m2 = Mut<T>(x);   // error[E012]: x already mutably borrowed

Fix: release the first borrow before creating a second, or use Ref<T>.
`,
  },

  E013: {
    code: 'E013',
    severity: 'error',
    title: 'cannot borrow const as mutable',
    message: `cannot borrow '{name}' as mutable: it is a const binding`,
    help: ['change const to let if mutability is needed', 'use Ref<T> for read-only borrows of const values'],
    body: `
A const binding cannot be mutably borrowed because Mut<T> requires
exclusive write access, which const forbids.

  const x = new Foo();
  const m = Mut<T>(x);   // error[E013]: x is const

Fix: declare x as \`let\` if you need a mutable borrow, or use Ref<T>.
`,
  },

  E014: {
    code: 'E014',
    severity: 'error',
    title: 'mutable borrow while immutable borrow active',
    message: `cannot create mutable borrow of '{name}' while immutable borrow is active`,
    help: ['release all Ref<T> borrows before creating a Mut<T>', 'use Ref<T> if you only need read access'],
    body: `
You cannot create a mutable borrow (Mut<T>) while an immutable borrow
(Ref<T>) is still active — readers would see torn data.

  const r = Ref<T>(x);
  const m = Mut<T>(x);   // error[E014]: x is immutably borrowed

Fix: release the Ref<T> first, or use Ref<T> for the second borrow too.
`,
  },

  E015: {
    code: 'E015',
    severity: 'error',
    title: 'incompatible borrow conversion',
    message: `{detail}`,
    help: ['check the expected parameter type vs the argument type', 'see the ownership and borrowing section of the docs'],
    body: `
The borrow types Ref<T>, Mut<T>, and Arc<T> are not freely convertible.
The compiler rejects conversions that would violate borrow rules:

  - Ref<T> cannot become Mut<T> (immutable → mutable)
  - Mut<T> cannot become Arc<T> (exclusive → shared)
  - Ref<T> cannot become Arc<T> (incompatible reference kinds)
  - Arc<T> cannot be mutably borrowed (no exclusive access)

Fix: use the borrow type expected by the function signature, or restructure.
`,
  },

  E016: {
    code: 'E016',
    severity: 'error',
    title: 'cannot pass borrow as owned parameter',
    message: `cannot pass {borrow_type} '{name}' as owned parameter`,
    help: ['pass an owned value instead of a borrow', 'clone the value: const owned = borrowed.clone()'],
    body: `
Borrow types (Ref<T>, Mut<T>, Arc<T>) are non-owning references and cannot
be passed where an owned value is expected — that would consume the borrow.

  function take(p: Point) { ... }
  const r = Ref<T>(p);
  take(r);   // error[E016]: cannot pass Ref<T> as owned

Fix: pass the owned value directly, or clone the borrow.
`,
  },

  E017: {
    code: 'E017',
    severity: 'error',
    title: 'cannot return reference to local',
    message: `cannot return {detail} from function`,
    help: ['return an owned value instead of a reference', 'take the data as a parameter if the caller owns it'],
    body: `
A function cannot return a reference (Ref<T> or Mut<T>) to a local variable
or array element — the local is destroyed when the function returns,
leaving a dangling reference.

  function f(): Ref<T> {
    const x = new Foo();
    return Ref<T>(x);   // error[E017]: x does not outlive f
  }

Fix: return an owned value, or accept the data as a parameter.
`,
  },

  E018: {
    code: 'E018',
    severity: 'error',
    title: 'cannot borrow a class field',
    message: `cannot borrow a class field; pass the entire object as {type}<T> instead`,
    help: ['borrow the whole object, then access the field through the borrow'],
    body: `
TSClang does not allow borrowing individual struct fields — only the
whole object can be borrowed. This simplifies the borrow checker.

  const h = new Header("name");
  const r = Ref<T>(h.data);   // error[E018]

Fix: borrow the entire object:

  const r = Ref<T>(h);   // ok — access h.data through r
`,
  },

  E019: {
    code: 'E019',
    severity: 'error',
    title: 'cannot hold borrow across await',
    message: `{name} cannot live across 'await'; use '.clone()' to make an owned copy`,
    help: ['clone the value before the await to create an owned copy', 'restructure to release the borrow before awaiting'],
    body: `
Borrows (Ref<T>, Mut<T>) cannot be held across an \`await\` point — the
borrowed value may change or be destroyed while the async task is
suspended, causing a dangling reference.

  const r = Ref<T>(x);
  await something();   // error[E019]: r is still alive
  r.release();

Fix: clone the value before awaiting, or release the borrow first.
`,
  },

  E020: {
    code: 'E020',
    severity: 'error',
    title: 'invalid closure capture',
    message: `invalid closure capture: {detail}`,
    help: ['see the closures section of the docs for capture rules'],
    body: `
Closures in TSClang can capture variables by value or by reference, but
there are restrictions:

  - Explicit captures [var] need a type annotation: Ref<T> or Mut<T>
  - Escaping closures (returned or stored) cannot capture by reference
    — the captured stack frame would be destroyed

Fix: use a value capture, or wrap the captured data in Arc<T> for
shared ownership.
`,
  },

  E021: {
    code: 'E021',
    severity: 'error',
    title: 'invalid spawn capture',
    message: `invalid spawn capture: {detail}`,
    help: ['use Arc<T> for shared ownership across threads', 'use Atomic<T> for primitive types'],
    body: `
Spawn blocks (threads/async tasks) have stricter capture rules because
captured values may outlive the current stack frame:

  - Ref<T> cannot be captured (not Send)
  - Owned values must be wrapped in Arc<T> for shared ownership
  - Mutable variables cannot be captured by reference — use Arc<T> or Atomic<T>

Fix: wrap the value in Arc<T>, or use Atomic<T> for primitives.
`,
  },

  E022: {
    code: 'E022',
    severity: 'error',
    title: 'cannot dereference Weak<T>',
    message: `cannot dereference '{name}' (Weak<T>); use '{name}.upgrade()' and check for null`,
    help: ['call .upgrade() which returns a nullable Arc<T>'],
    body: `
Weak<T> is a non-owning weak reference that does not keep the value alive.
It cannot be dereferenced directly — the value may have been freed.

  const w = Weak<T>(arc);
  w.field;   // error[E022]: cannot dereference Weak<T>

Fix: call .upgrade(), which returns Arc<T> or null:

  const arc = w.upgrade();
  if (arc) { arc.field; }   // ok
`,
  },

  E023: {
    code: 'E023',
    severity: 'error',
    title: 'cannot cast ownership types',
    message: `cannot use 'as' for ownership types`,
    help: ['use the appropriate constructor: Ref<T>(x), Mut<T>(x), or Arc<T>(x)'],
    body: `
The \`as\` cast operator cannot convert between ownership types (T, Ref<T>,
Mut<T>, Arc<T>). These have different memory layouts and semantics.

  const r = Ref<T>(x);
  const a = r as Arc<T>;   // error[E023]

Fix: use the appropriate constructor for the target type.
`,
  },

  E024: {
    code: 'E024',
    severity: 'error',
    title: 'cannot pass const as Mut<Interface>',
    message: `cannot pass const variable '{name}' as Mut<{iface}>`,
    help: ['change const to let if the variable needs to be mutable', 'pass a mutable binding instead'],
    body: `
A const variable cannot be passed where Mut<Interface> is expected —
Mut<T> requires exclusive mutable access, which const forbids.

  const x = new Foo();
  takesMut(x);   // error[E024]: x is const, Mut<FooIFace> expected

Fix: declare x as \`let\`, or pass a mutable binding.
`,
  },

  // ── E1xx: Type errors ──────────────────────────────────────────────────────
  E100: {
    code: 'E100',
    severity: 'error',
    title: 'type conversion error',
    message: `{detail}`,
    help: ['use an explicit cast: value as TargetType', 'check that the types are compatible'],
    body: `
TSClang does not allow implicit type conversions that could lose data or
change semantics. Use an explicit cast (\`as\`) when you intentionally
convert between types.

  let x: i32 = 10;
  let y: u32 = x;          // error[E100]: cannot implicitly convert i32 to u32
  let y: u32 = x as u32;   // ok

Common cases: signed/unsigned mismatch, float-to-integer assignment,
mixing i32 and u32 in arithmetic.
`,
  },

  E101: {
    code: 'E101',
    severity: 'error',
    title: 'literal overflow',
    message: `{detail}`,
    help: ['use a wider type', 'check the value range for the target type'],
    body: `
A numeric literal exceeds the representable range of its target type.

  const x: u8 = 300;   // error[E101]: 300 overflows u8 (0..255)

Fix: use a wider type, or adjust the value to fit.
`,
  },

  E102: {
    code: 'E102',
    severity: 'error',
    title: 'invalid char/u8 literal',
    message: `{detail}`,
    help: ['use double quotes for multi-byte strings', 'use a single ASCII character for char/u8'],
    body: `
Single-quoted literals in TSC are strings (like TypeScript), not chars.
A \`char\` or \`u8\` must be a single ASCII character or escape sequence.

  const c: char = 'ab';     // error[E102]: multi-character string
  const c: char = 'a';      // ok
  const s: string = 'ab';   // ok — string
`,
  },

  E103: {
    code: 'E103',
    severity: 'error',
    title: 'invalid instanceof',
    message: `{detail}`,
    help: ['use an interface name on the right-hand side of instanceof'],
    body: `
\`instanceof\` checks whether a value implements an interface. The
right-hand side must be an interface type name.

  if (x instanceof Shape) { ... }   // ok
  if (x instanceof 42) { ... }      // error[E103]
`,
  },

  E104: {
    code: 'E104',
    severity: 'error',
    title: 'invalid cast',
    message: `{detail}`,
    help: ['use the appropriate conversion method', 'see the type conversion docs'],
    body: `
The \`as\` operator cannot perform this conversion. Some types require
an explicit method call instead.

  const s = num as string;       // error[E104]: use .toString()
  const s = num.toString();      // ok
`,
  },

  E105: {
    code: 'E105',
    severity: 'error',
    title: 'type narrowing error',
    message: `{detail}`,
    help: ['use "as Array<T>" or "as ClassName" to narrow the type first'],
    body: `
After a \`typeof\` check, the variable has type \`unknown\` and must be
narrowed with an \`as\` cast before accessing properties or indexing.

  if (typeof x === "array") {
    x.length;                  // error[E105]: x is still unknown
    (x as Array<i32>).length;  // ok
  }
`,
  },

  E106: {
    code: 'E106',
    severity: 'error',
    title: 'invalid type usage',
    message: `{detail}`,
    help: ['check the type system rules in the docs'],
    body: `
Certain types have restrictions on where they can appear:

  - \`never\` cannot be used as a variable or field type
  - \`void\` can only be a return type
  - \`Ref<T>\` / \`Mut<T>\` / \`Arc<T>\` cannot be stored in class fields
  - \`any\` is only allowed in declare/unsafe context

Fix: use the appropriate type for the context.
`,
  },

  E107: {
    code: 'E107',
    severity: 'error',
    title: 'recursive type by value',
    message: `type '{name}' recursively references itself by value; use Ref<{name}> or a pointer`,
    help: ['use Ref<T> or a pointer for recursive types'],
    body: `
A type cannot contain itself by value — that would have infinite size.
Use a reference type (Ref<T>) or a pointer for recursive references.

  type Node { next: Node }       // error[E107]: infinite size
  type Node { next: Ref<Node> }  // ok — pointer-sized
`,
  },

  E108: {
    code: 'E108',
    severity: 'error',
    title: 'member does not exist',
    message: `{detail}`,
    help: ['check the type definition for available members'],
    body: `
The referenced field or method does not exist on the specified type.
Check the type definition and spelling.
`,
  },

  E109: {
    code: 'E109',
    severity: 'error',
    title: 'type composition error',
    message: `{detail}`,
    help: ['see the type system docs for Record, keyof, and ReturnType rules'],
    body: `
Errors with type-level utilities: Record, keyof, ReturnType, and
string literal unions.

Fix: follow the constraints for each utility as described in the docs.
`,
  },

  E110: {
    code: 'E110',
    severity: 'error',
    title: 'non-exhaustive match',
    message: `non-exhaustive match on enum '{name}': missing cases {missing}`,
    help: ['add cases for all missing enum variants', 'add a default case'],
    body: `
When matching an enum, all variants must be handled (or a default case
must be provided).

  enum Color { Red, Green, Blue }
  match (c) {
    case Color.Red: ...
    // error[E110]: missing Green, Blue
  }

Fix: add the missing cases, or add a \`default\` branch.
`,
  },

  E111: {
    code: 'E111',
    severity: 'error',
    title: 'catch clause requires explicit error type',
    message: `catch clause requires explicit error type`,
    help: ['specify the error type: catch (e: MyError)'],
    body: `
TSClang requires catch clauses to declare the error type explicitly,
unlike TypeScript which infers \`any\` or \`unknown\`.

  try { ... }
  catch (e) { ... }               // error[E111]
  catch (e: MyError) { ... }      // ok
`,
  },

  E112: {
    code: 'E112',
    severity: 'error',
    title: 'await on non-Promise',
    message: `{detail}`,
    help: ['ensure the expression is a Promise<T>'],
    body: `
\`await\` can only be applied to \`Promise<T>\` values.

  const x = await 42;   // error[E112]: 42 is not a Promise
`,
  },

  E113: {
    code: 'E113',
    severity: 'error',
    title: 'array/tuple size mismatch',
    message: `{detail}`,
    help: ['adjust the number of elements to match the declared size'],
    body: `
A fixed-size array or tuple literal must have exactly the declared
number of elements.
`,
  },

  E114: {
    code: 'E114',
    severity: 'error',
    title: 'invalid enum value',
    message: `"{value}" is not a valid value for type {type}`,
    help: ['check the enum definition for valid values'],
    body: `
A string literal assigned to an enum type must be one of the enum's
defined values.

  type Direction = "north" | "south" | "east" | "west";
  const d: Direction = "up";   // error[E114]
`,
  },

  E115: {
    code: 'E115',
    severity: 'error',
    title: 'mixed enum values',
    message: `mixed string and number values in enum "{name}" are not allowed`,
    help: ['use all-string or all-number values in an enum'],
    body: `
An enum must have either all string values or all number values —
mixing is not allowed.
`,
  },

  E116: {
    code: 'E116',
    severity: 'error',
    title: 'null assignment to non-nullable',
    message: `cannot assign null to non-nullable type`,
    help: ['declare the type as nullable: T | null', 'remove the null assignment'],
    body: `
A non-nullable type cannot be assigned null.

  let x: Point = null;   // error[E116]
  let x: Point | null = null;   // ok
`,
  },

  E117: {
    code: 'E117',
    severity: 'error',
    title: 'function with return type "never" must not return',
    message: `function with return type "never" must not return`,
    help: ['remove the return statement', 'change the return type if the function can return'],
    body: `
A function declared as returning \`never\` must not contain a \`return\`
statement — \`never\` means the function never completes normally.
`,
  },

  E118: {
    code: 'E118',
    severity: 'error',
    title: 'missing interface implementation',
    message: `{detail}`,
    help: ['implement all methods required by the interface'],
    body: `
A class that declares \`implements\` must provide all methods required
by the interface.
`,
  },

  E119: {
    code: 'E119',
    severity: 'error',
    title: 'ambiguous overload',
    message: `{detail}`,
    help: ['make overload signatures unambiguous', 'remove duplicate signatures'],
    body: `
Two overloads match the call arguments equally well, and the compiler
cannot choose between them. Make the signatures more specific.
`,
  },

  E120: {
    code: 'E120',
    severity: 'error',
    title: 'type error',
    message: `{detail}`,
    help: ['see the compiler error message for details', 'check the type system documentation'],
    body: `
A type-system error that doesn't fit a more specific category. The
message provides the specific details.
`,
  },

  // ── E2xx: Strict-mode rules ──────────────────────────────────────────────────
  E200: {
    code: 'E200',
    severity: 'error',
    title: 'closures forbidden (no-closures)',
    message: `closures are forbidden in strict mode (no-closures); use named functions or inline the logic`,
    help: ['define a named function instead of an arrow/lambda', 'remove the closure and inline the logic'],
    body: `
When the \`no-closures\` strict rule is active, arrow functions and
closures are forbidden because they require heap allocation.

Fix: replace the closure with a named function, or inline the logic.
`,
  },

  E201: {
    code: 'E201',
    severity: 'error',
    title: 'i64/u64 printing forbidden (no-i64-print)',
    message: `i64/u64 values cannot be printed (no-i64-print)`,
    help: ['cast to i32 for printing: value as i32', 'use a custom formatter'],
    body: `
When the \`no-i64-print\` strict rule is active, printing i64/u64 values
is forbidden because many embedded platforms lack 64-bit printf support.

Fix: cast to i32 for printing (if the value fits), or use a custom
formatter.
`,
  },

  E202: {
    code: 'E202',
    severity: 'error',
    title: 'Array.sort() with comparator forbidden (no-sort)',
    message: `Array.sort() with comparator is forbidden in strict mode (no-sort)`,
    help: ['use a named sort function', 'implement the sort manually'],
    body: `
When the \`no-sort\` strict rule is active, \`Array.sort()\` with a
comparator callback is forbidden because it requires dynamic dispatch
and heap allocation for the closure.

Fix: use a named sort function or implement the sort manually.
`,
  },

  E203: {
    code: 'E203',
    severity: 'error',
    title: 'unguarded integer arithmetic (safe-math)',
    message: `{detail}`,
    help: ['wrap in try/catch to handle overflow', 'declare the function as throws MathError'],
    body: `
When safe-math mode is active, integer arithmetic that could overflow
must be wrapped in a try/catch block or the function must declare
\`throws MathError\`.

  try {
    let z = x + y;
  } catch (e) { /* handle overflow */ }
`,
  },

  E204: {
    code: 'E204',
    severity: 'error',
    title: 'lossy cast forbidden (no-lossy-cast)',
    message: `lossy cast from {from} to {to} is forbidden (no-lossy-cast)`,
    help: ["remove 'no-lossy-cast' from strict rules", 'use a safe widening path'],
    body: `
When the \`no-lossy-cast\` strict rule is active, type conversions that
could lose data (e.g. i32 → i8, f64 → i32) are forbidden.

Fix: use a safe widening path, or remove the strict rule if lossy
casts are intentional.
`,
  },

  E205: {
    code: 'E205',
    severity: 'error',
    title: 'threads forbidden (no-threads)',
    message: `threads are forbidden in strict mode (no-threads)`,
    help: ['remove the no-threads strict rule', 'use a single-threaded alternative'],
    body: `
When the \`no-threads\` strict rule is active, \`spawn\` blocks and
thread creation are forbidden.

Fix: use a single-threaded alternative, or remove the strict rule.
`,
  },

  E206: {
    code: 'E206',
    severity: 'error',
    title: 'dynamic allocation forbidden (no-dynamic-alloc)',
    message: `dynamic allocation is forbidden in strict mode (no-dynamic-alloc); {detail}`,
    help: ['use a fixed-size buffer or compile-time constant', 'remove the no-dynamic-alloc strict rule'],
    body: `
When the \`no-dynamic-alloc\` strict rule is active, heap allocation
(new Map, new Array, new Set, etc.) is forbidden.

Fix: use fixed-size data structures or compile-time constants.
`,
  },

  E207: {
    code: 'E207',
    severity: 'error',
    title: 'native C blocks forbidden (no-native)',
    message: `native C blocks are forbidden in strict mode (no-native)`,
    help: ['use TSClang constructs instead of inline C', 'remove the no-native strict rule'],
    body: `
When the \`no-native\` strict rule is active, inline C blocks
(\`native { ... }\`\u200b) are forbidden.

Fix: use TSClang language constructs, or remove the strict rule.
`,
  },

  E208: {
    code: 'E208',
    severity: 'error',
    title: 'unsafe blocks forbidden (no-unsafe)',
    message: `unsafe blocks are forbidden in strict mode (no-unsafe)`,
    help: ['use safe TSClang constructs', 'remove the no-unsafe strict rule'],
    body: `
When the \`no-unsafe\` strict rule is active, \`unsafe { ... }\` blocks
are forbidden.

Fix: use safe TSClang constructs, or remove the strict rule.
`,
  },

  E209: {
    code: 'E209',
    severity: 'error',
    title: 'recursion forbidden (no-recursion)',
    message: `{detail}`,
    help: ['refactor to an iterative solution', 'remove the no-recursion strict rule'],
    body: `
When the \`no-recursion\` strict rule is active, direct and mutual
recursion are forbidden because they make stack usage unbounded.

Fix: refactor to an iterative solution, or remove the strict rule.
`,
  },

  E210: {
    code: 'E210',
    severity: 'error',
    title: 'interfaces with methods forbidden (no-interfaces)',
    message: `interfaces with methods are forbidden in strict mode (no-interfaces)`,
    help: ['use a struct type instead', 'remove the no-interfaces strict rule'],
    body: `
When the \`no-interfaces\` strict rule is active, interfaces that
declare methods are forbidden because they require vtable dispatch.

Fix: use a struct type, or remove the strict rule.
`,
  },

  E211: {
    code: 'E211',
    severity: 'error',
    title: 'any/unknown forbidden (no-any)',
    message: `"{name}" is forbidden in strict mode (no-any); use a concrete type`,
    help: ['use a concrete type instead of any/unknown', 'remove the no-any strict rule'],
    body: `
When the \`no-any\` strict rule is active, \`any\` and \`unknown\` types
are forbidden because they bypass the type system.

Fix: use a concrete type, or remove the strict rule.
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
} satisfies Record<string, DiagnosticEntry>;

// Derive a union of all valid codes from the registry.
// Usage: function foo(code: DiagnosticCode) — catches typos at compile time.
export type DiagnosticCode = keyof typeof DIAGNOSTICS;

// Look up a diagnostic entry by code (case-insensitive).
// Returns null if the code is not registered.
export function lookupDiagnostic(code: string): DiagnosticEntry | null {
  return (DIAGNOSTICS as Record<string, DiagnosticEntry>)[code.toUpperCase()] ?? null;
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
