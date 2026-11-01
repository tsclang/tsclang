// Pre-codegen semantic checks (#208).
//
// Runs after parsing and import resolution, before codegen. Catches classes
// of errors that must not leak to the C compiler:
//   E121 unknown type name           — annotations referencing undeclared types
//   E122 undeclared identifier       — value uses with no visible declaration
//   E123 duplicate declaration       — same-scope name collisions (TS rules)
//   E124 type mismatch in initializer — literal vs primitive annotation
//
// Model: two namespaces.
//   Type space (a file-level Set of names) is position-insensitive — types are
//   hoisted, forward and mutual references are legal (cf. recursive type
//   aliases). Value space is a scope chain with positions: let/const obey the
//   temporal dead zone within one execution context, while uses inside a
//   nested function body are deferred and never position-checked (TS
//   semantics — the function may run after the declaration).
//
// The pass is deliberately conservative: constructs it cannot model precisely
// (Match patterns, `declare module` bodies, raw C) are skipped rather than
// guessed at — a false positive here would reject valid TS-style code (П2).

import type {
  Program, Stmt, Expression, TypeAnn, Param, Block, ClassMember, MatchCase,
} from '@tsclang/ast';
import { TscError } from './error.js';
import { DIAGNOSTICS, substituteParams } from './diagnostics.js';
import { isPrimitive } from './types.js';
import { LANGUAGE_BUILTINS } from './stdlib-registry.js';

const MAX_ERRORS = 10;

// Type names the compiler resolves natively besides primitives
// (see codegen/types/resolve.ts). Kept in sync manually — resolve.ts is the
// authority; a name missing here would produce a false E121.
const BUILTIN_TYPE_NAMES = new Set([
  'null', 'undefined', 'number', 'bool', 'String', 'this',
  'Arc', 'Weak', 'Ref', 'Mut', 'Array', 'ReadonlyArray', 'Map',
  'Scalar', 'Date', 'AbortController', 'AbortSignal', 'AsyncMutex',
  'Generator', 'Readonly', 'Atomic', 'Channel', 'Signal', 'Promise',
  'volatile', 'Volatile', 'Slice', 'MutSlice', 'Partial', 'Pick', 'Omit',
  // TS utility types resolved by the compiler (types/ utilities).
  'Awaited', 'Record', 'Required', 'NonNullable', 'Parameters',
  'ReturnType', 'Exclude', 'Extract',
  // Global value types usable in annotations (Error instances, generators).
  'Error', 'AsyncGenerator',
  // Decorator protocol types (compiler-provided, no import needed).
  'MethodDesc', 'FunctionDesc', 'PropertyDescriptor',
  // Concurrency: AtomicArray type + memory-ordering enums.
  'AtomicArray',
]);

const INT_TYPES = new Set(['i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'usize', 'isize']);

// Compiler-native constructors usable without import (`new Arc<T>(…)`,
// `new Channel<T>(…)`). Mirror of BUILTIN_TYPE_NAMES for the value space —
// LANGUAGE_BUILTINS (stdlib-registry) covers the non-generic globals.
// Numeric type names double as parsing namespaces (`i32.parse`, `d8.parse`).
const BUILTIN_VALUE_NAMES = new Set([
  'Arc', 'Weak', 'Ref', 'Mut', 'Channel', 'Signal', 'Scalar', 'Generator',
  'AbortController', 'AbortSignal', 'AsyncMutex',
  'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64',
  'f32', 'f64', 'd8', 'd16', 'd32', 'd64', 'usize', 'isize',
  // Concurrency natives: AtomicArray ctor + memory-ordering enum namespaces.
  'AtomicArray', 'LoadOrdering', 'StoreOrdering', 'RmwOrdering',
  // Readonly wrapper ctor, select() primitive, Thread namespace, Buffer/Blob natives.
  'Readonly', 'select', 'Thread', 'Buffer', 'Blob',
]);

interface Pos { line?: number; col?: number }

interface DeclEntry {
  kind: string;       // VarDecl varKind | 'FuncDecl' | 'FuncOverload' | 'ClassDecl' | …
  line: number;
  col: number;
  hoisted: boolean;   // functions, `var`, imports — usable before their position
}

interface Scope {
  parent: Scope | null;
  vars: Map<string, DeclEntry>;
  isFunction: boolean; // function body / module root — `var` and TDZ boundary
}

interface DecoratorLike { name: string; args?: Expression[] }
interface SigLike { params?: Param[]; returnType?: TypeAnn | null }

/** One destructuring binding item — obj form `{name, alias?, defaultVal?}`,
 *  array form `{name?, rest?, defaultVal?}`, holes arrive as null. */
interface PatternItem {
  name?: string;
  alias?: string;
  defaultVal?: Expression | null;
  default?: Expression;
  rest?: boolean;
  pattern?: unknown;
}

/** Import names arrive as plain strings (simple imports) or {name, alias?}. */
function importLocalName(n: string | { name: string; alias?: string }): string {
  return typeof n === 'string' ? n : (n.alias ?? n.name);
}

/** True for numeric literal text that denotes a float ("2.0", "1e3", ".5"). */
function isFloatLiteralText(value: string): boolean {
  const t = value.trim();
  if (/^0[xX]/.test(t) || /^0[bB]/.test(t) || /^0[oO]/.test(t)) return false;
  return /[.eE]/.test(t);
}

/**
 * Run pre-codegen semantic checks over a parsed program.
 * Throws `{ isTscErrorBag: true, errors: TscError[] }` on failure — the same
 * protocol as the parse-error bag, consumed by the CLI reporter and the test
 * engine without special-casing.
 */
export function checkSemantics(ast: Program, filename: string, src: string, opts?: { strict?: string[] | null }): void {
  const checker = new SemanticChecker(filename, src, new Set(opts?.strict ?? []));
  checker.run(ast);
  if (checker.errors.length > 0) {
    throw { isTscErrorBag: true, errors: checker.errors };
  }
}

class SemanticChecker {
  errors: TscError[] = [];
  private typeNames = new Set<string>();        // file-level type space
  private root: Scope;
  private scope: Scope;
  private typeParams = new Set<string>();       // active generic params

  constructor(private filename: string, private src: string, private strictRules: Set<string> = new Set()) {
    this.root = { parent: null, vars: new Map(), isFunction: true };
    this.scope = this.root;
    // safe-math injects MathError as the overflow error type.
    if (this.strictRules.has('safe-math')) this.typeNames.add('MathError');
  }

  run(ast: Program): void {
    this.collectTypeNames(ast);
    for (const s of ast.body ?? []) this.stmt(s);
  }

  // ── Type space ────────────────────────────────────────────────────────────

  private collectTypeNames(ast: Program): void {
    for (const s of ast.body ?? []) this.collectTypeName(s);
  }

  private collectTypeName(s: Stmt): void {
    switch (s.kind) {
      case 'ClassDecl': case 'Interface': case 'Enum': case 'TypeAlias':
      case 'DeclareConst':
        this.typeNames.add(s.name);
        return;
      case 'Import':
        for (const n of s.names ?? []) this.typeNames.add(importLocalName(n));
        return;
      case 'Export':
        return this.collectTypeName(s.decl);
      default:
        return; // DeclareModule bodies are opaque — skipped
    }
  }

  private isKnownTypeName(name: string): boolean {
    return isPrimitive(name) || BUILTIN_TYPE_NAMES.has(name)
      || this.typeNames.has(name) || this.typeParams.has(name);
  }

  private type(t: TypeAnn | null | undefined): void {
    if (!t) return;
    switch (t.kind) {
      case 'TypeRef':
        if (!this.isKnownTypeName(t.name)) this.error('E121', t, { name: t.name });
        for (const a of t.typeArgs ?? []) this.type(a);
        return;
      case 'TypeUnion':
        for (const m of t.types ?? []) this.type(m);
        return;
      case 'TypeFunc':
        for (const p of t.params ?? []) this.type(p);
        this.type(t.ret);
        for (const x of t.throwsTypes ?? []) this.type(x);
        return;
      case 'TypeArray':
        return this.type(t.element);
      case 'TypePointer':
        return this.type(t.pointee);
      case 'TypeLiteral':
        return;
      case 'TypeTuple':
        for (const e of t.elements ?? []) this.type(e.type);
        return;
      case 'TypeObject':
        for (const f of t.fields ?? []) this.type(f.typeAnn);
        return;
      case 'TypeKeyOf':
        return this.type(t.target);
      case 'TypeTypeof':
        // `typeof x` names a value binding; resolve without position (types
        // are lazily evaluated, the value may be declared later).
        if (!this.isDeclaredAnywhere(t.name) && !LANGUAGE_BUILTINS.has(t.name)) {
          this.error('E121', t, { name: t.name });
        }
        return;
      case 'TypeFixedArray':
        return this.type(t.element);
      default:
        return;
    }
  }

  // ── Value space ───────────────────────────────────────────────────────────

  private pushScope(isFunction: boolean): Scope {
    this.scope = { parent: this.scope, vars: new Map(), isFunction };
    return this.scope;
  }

  private popScope(): void {
    this.scope = this.scope.parent ?? this.root;
  }

  private declare(name: string, kind: string, node: Pos, hoisted = false, hoistFnScope = false): void {
    if (!name || name === '*') return;
    let target = this.scope;
    if (hoistFnScope) {
      // `var` binds to the nearest function/module scope (TS hoisting).
      while (!target.isFunction && target.parent) target = target.parent;
    }
    const existing = target.vars.get(name);
    if (existing && !this.isLegalRedeclare(existing.kind, kind)) {
      this.error('E123', node, { name });
      return; // first binding wins — avoid cascading E123 on the same name
    }
    target.vars.set(name, { kind, line: node?.line ?? 0, col: node?.col ?? 0, hoisted });
  }

  private isLegalRedeclare(oldKind: string, newKind: string): boolean {
    // Bodyless overload signatures pair freely with each other and with the
    // implementation; two full FuncDecls also form a legal overload set —
    // overload resolution (and E119 on ambiguity) is codegen's job.
    if (oldKind === 'FuncOverload' || newKind === 'FuncOverload') return true;
    if (oldKind === 'FuncDecl' && newKind === 'FuncDecl') return true;
    // TS declaration merging: interfaces merge with interfaces and classes.
    if (oldKind === 'Interface' && (newKind === 'Interface' || newKind === 'ClassDecl')) return true;
    if (oldKind === 'ClassDecl' && newKind === 'Interface') return true;
    return false;
  }

  /** ok | undeclared | tdz (used before declaration in the same context). */
  private resolveIdent(name: string, node: Pos): 'ok' | 'undeclared' | 'tdz' {
    let sc: Scope | null = this.scope;
    let crossedFn = false;
    while (sc) {
      const e = sc.vars.get(name);
      if (e) {
        // Deferred execution (inside a nested function body): the binding may
        // be initialized later at runtime — not a compile error in TS.
        if (e.hoisted || crossedFn) return 'ok';
        const l = node?.line ?? 0;
        const c = node?.col ?? 0;
        return (e.line < l || (e.line === l && e.col <= c)) ? 'ok' : 'tdz';
      }
      if (sc.isFunction) crossedFn = true;
      sc = sc.parent;
    }
    if (LANGUAGE_BUILTINS.has(name) || BUILTIN_VALUE_NAMES.has(name) || name === 'this') return 'ok';
    return 'undeclared';
  }

  private isDeclaredAnywhere(name: string): boolean {
    let sc: Scope | null = this.scope;
    while (sc) {
      if (sc.vars.has(name)) return true;
      sc = sc.parent;
    }
    return false;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  private error(code: 'E121' | 'E122' | 'E123' | 'E124', node: Pos, params: Record<string, string>): void {
    if (this.errors.length >= MAX_ERRORS) return;
    const d = DIAGNOSTICS[code];
    this.errors.push(new TscError(substituteParams(d.message, params), {
      filename: this.filename,
      line: node?.line ?? 0,
      col: node?.col ?? 0,
      src: this.src,
      code: d.code,
      title: d.title,
      help: d.help?.map((h) => substituteParams(h, params)),
      kind: 'error',
    }));
  }

  // ── Statements ────────────────────────────────────────────────────────────

  private stmts(list: Stmt[] | null | undefined): void {
    for (const s of list ?? []) this.stmt(s);
  }

  /** Visit a statement in its own scope (if/loop bodies, labeled targets). */
  private scopedStmt(st: Stmt | null | undefined): void {
    if (!st) return;
    this.pushScope(false);
    this.stmt(st);
    this.popScope();
  }

  private stmt(s: Stmt | null | undefined): void {
    if (!s || typeof s !== 'object') return;
    switch (s.kind) {
      case 'Import':
        for (const n of s.names ?? []) this.declare(importLocalName(n), 'import', s, true);
        return;
      case 'Export':
        return this.stmt(s.decl);
      case 'ExportFrom':
        for (const n of s.names ?? []) this.declare(importLocalName(n), 'import', s, true);
        return;
      case 'VarDecls':
        for (const d of s.decls ?? []) this.stmt(d);
        return;
      case 'VarDecl':
        this.decorators(s.decorators);
        this.type(s.typeAnn);
        this.declare(s.name, s.varKind, s, false, s.varKind === 'var');
        this.expr(s.init);
        this.checkInitMismatch(s, s.name, s.typeAnn, s.init);
        return;
      case 'VarDestructObj': case 'VarDestructArr': {
        this.decorators((s as { decorators?: DecoratorLike[] }).decorators);
        this.type(s.typeAnn);
        // Parser emits `pattern` as a flat array of binding items — obj form
        // uses {name, alias?, defaultVal?}, array form {name?, rest?, defaultVal?} | null.
        this.declarePatternItems(s.pattern as unknown as PatternItem[]);
        this.expr(s.init);
        return;
      }
      case 'FuncDecl': {
        this.decorators(s.decorators);
        this.declare(s.name, 'FuncDecl', s, true);
        const savedTp = this.typeParams;
        this.typeParams = new Set([...savedTp, ...(s.typeParams ?? []).map((p) => p.name)]);
        this.pushScope(true);
        this.declareParams(s.params);
        this.type(s.returnType);
        for (const x of s.throwsTypes ?? []) this.type(x);
        if (s.body) this.stmts(s.body.body);
        this.popScope();
        this.typeParams = savedTp;
        return;
      }
      case 'FuncOverload':
        this.declare(s.name, 'FuncOverload', s, true);
        for (const p of s.params ?? []) this.type(p.typeAnn);
        this.type(s.returnType);
        return;
      case 'ExtensionFunc': {
        this.pushScope(true);
        this.type(s.thisType);
        this.declareParams(s.params);
        this.type(s.returnType);
        this.stmts(s.body?.body);
        this.popScope();
        return;
      }
      case 'ClassDecl': {
        this.decorators(s.decorators);
        this.declare(s.name, 'ClassDecl', s, true);
        this.typeNames.add(s.name);
        const savedTp = this.typeParams;
        this.typeParams = new Set(s.typeParams ?? []);
        if (s.superClass && this.resolveIdent(s.superClass, s) === 'undeclared') {
          this.error('E122', s, { name: s.superClass });
        }
        for (const i of s.implements_ ?? []) this.type(i);
        // Members behave like deferred function contexts: field initializers
        // run in constructors, so outer bindings are not position-checked.
        this.pushScope(true);
        for (const m of s.members ?? []) this.classMember(m);
        this.popScope();
        this.typeParams = savedTp;
        return;
      }
      case 'Interface': {
        this.typeNames.add(s.name);
        const savedTp = this.typeParams;
        this.typeParams = new Set([...savedTp, ...(s.typeParams ?? [])]);
        for (const i of s.extends_ ?? []) this.type(i);
        for (const m of s.members ?? []) {
          const sig = m as unknown as SigLike;
          for (const p of sig.params ?? []) this.type(p.typeAnn);
          this.type(sig.returnType);
          this.type((m as unknown as { typeAnn?: TypeAnn | null }).typeAnn);
        }
        this.typeParams = savedTp;
        return;
      }
      case 'Enum': {
        this.declare(s.name, 'Enum', s, true);
        for (const m of s.members ?? []) this.expr(m.value);
        return;
      }
      case 'TypeAlias': {
        this.typeNames.add(s.name);
        const savedTp = this.typeParams;
        this.typeParams = new Set([...savedTp, ...(s.typeParams ?? [])]);
        this.type(s.typeAnn);
        this.typeParams = savedTp;
        return;
      }
      case 'DeclareConst':
        this.declare(s.name, 'DeclareConst', s, true);
        this.type(s.typeAnn);
        this.expr(s.init);
        return;
      case 'DeclareFunction':
        this.declare(s.name, 'DeclareFunction', s, true);
        for (const p of s.params ?? []) this.type(p.typeAnn);
        this.type(s.returnType);
        return;
      case 'DeclareModule': case 'DeclarePlatform': case 'Native':
        return; // opaque / raw C — skipped
      case 'Return':
        return this.expr(s.value);
      case 'If':
        this.expr(s.test);
        this.scopedStmt(s.consequent);
        this.scopedStmt(s.alternate ?? null);
        return;
      case 'For': {
        this.pushScope(false);
        this.stmt(s.init);
        this.expr(s.test);
        this.expr(s.update);
        this.scopedStmt(s.body);
        this.popScope();
        return;
      }
      case 'ForOf': case 'ForIn': {
        this.pushScope(false);
        this.forOfBinding(s.binding, s.varKind, s);
        this.expr(s.iterable);
        this.scopedStmt(s.body);
        this.popScope();
        return;
      }
      case 'While':
        this.expr(s.test);
        return this.scopedStmt(s.body);
      case 'DoWhile':
        this.expr(s.test);
        return this.scopedStmt(s.body);
      case 'Throw':
        return this.expr(s.value);
      case 'TryCatch': {
        this.pushScope(false);
        this.stmts(s.body?.body);
        this.popScope();
        for (const c of s.catches ?? []) {
          this.pushScope(false);
          this.type(c.typeAnn);
          if (c.param) this.declare(c.param, 'catch', {}, false);
          this.stmts(c.body?.body);
          this.popScope();
        }
        if (s.finally) {
          this.pushScope(false);
          this.stmts(s.finally.body);
          this.popScope();
        }
        return;
      }
      case 'Switch': {
        this.expr(s.discriminant);
        this.pushScope(false); // all cases share one block scope (TS)
        for (const c of s.cases ?? []) {
          this.expr(c.test);
          this.stmts(c.body);
        }
        this.popScope();
        return;
      }
      case 'Unsafe':
        this.pushScope(false);
        this.stmts(s.body?.body);
        this.popScope();
        return;
      case 'Spawn':
        for (const t of s.throwsTypes ?? []) this.type(t);
        this.pushScope(true);
        this.stmts(s.body?.body);
        this.popScope();
        return;
      case 'Block':
        this.pushScope(false);
        this.stmts(s.body);
        this.popScope();
        return;
      case 'ExprStmt': {
        // `const k = keyof User` recovers into init=Ident('keyof') plus a
        // stray `User;` statement — a type name as a bare statement is never
        // a value use; codegen reports the keyof misuse itself (E414).
        if (s.expr?.kind === 'Ident' && this.typeNames.has((s.expr as { name: string }).name)) return;
        return this.expr(s.expr);
      }
      case 'Break': case 'Continue': case 'Noop':
        return;
      case 'Labeled':
        return this.scopedStmt(s.body);
      case 'Match':
        return this.match(s);
      default:
        return;
    }
  }

  private classMember(m: ClassMember | null | undefined): void {
    if (!m) return;
    if (m.kind === 'Field') {
      this.decorators(m.decorators);
      this.type(m.typeAnn);
      this.expr(m.init);
      if (typeof m.name === 'string') this.checkInitMismatch(m, m.name, m.typeAnn, m.init);
      return;
    }
    if (m.kind === 'Method') {
      this.decorators(m.decorators);
      const savedTp = this.typeParams;
      this.typeParams = new Set([...savedTp, ...(m.typeParams ?? [])]);
      this.pushScope(true);
      this.declareParams(m.params);
      this.type(m.returnType);
      for (const x of m.throwsTypes ?? []) this.type(x);
      if (m.body) this.stmts(m.body.body);
      this.popScope();
      this.typeParams = savedTp;
      return;
    }
  }

  private declareParams(ps: Param[] | null | undefined): void {
    if (!ps) return;
    for (const p of ps) {
      this.type(p.typeAnn);
      // declarePatternItems declares the binding names and visits defaults.
      this.declarePatternItems(p.destructObj as unknown as PatternItem[]);
      this.declarePatternItems(p.destructArr as unknown as PatternItem[]);
    }
    // Declare all params before visiting defaults: `f(a = 1, b = a)` is legal.
    for (const p of ps) {
      if (p.name) this.declare(p.name, 'param', {}, true);
    }
    for (const p of ps) this.expr(p.defaultVal ?? p.default);
  }

  /** Declare binding names from any destructuring pattern shape (obj or array). */
  private declarePatternItems(items: unknown): void {
    if (!items) return;
    // `for (const {a} of xs)` wraps the same items under kind:'ObjPattern'.props
    // / kind:'ArrayPattern'.elems; `let {a} = o` passes the flat array directly.
    const list = Array.isArray(items)
      ? (items as (PatternItem | null)[])
      : ((items as { props?: unknown[]; elems?: unknown[] }).props
        ?? (items as { elems?: unknown[] }).elems
        ?? []) as (PatternItem | null)[];
    for (const it of list) {
      if (!it || typeof it !== 'object') continue; // array holes (`let [x, , y]`)
      const local = it.alias ?? it.name;
      if (local) this.declare(local, 'let', {}, false);
      this.expr(it.defaultVal ?? it.default);
      if (it.pattern && typeof it.pattern === 'object') this.declarePatternItems(it.pattern);
    }
  }

  private forOfBinding(b: unknown, varKind: string, node: Pos): void {
    const binding = b as { kind?: string; name?: string; typeAnn?: TypeAnn | null } | null | undefined;
    if (!binding) return;
    if (binding.kind === 'Ident') {
      this.type(binding.typeAnn);
      this.declare(binding.name ?? '', varKind, node, false);
    } else {
      // ObjPattern/ArrayPattern wrappers and flat arrays share one shape handler.
      this.declarePatternItems(b);
    }
  }

  private decorators(ds: DecoratorLike[] | null | undefined): void {
    for (const d of ds ?? []) for (const a of d.args ?? []) this.expr(a);
  }

  // ── Expressions ───────────────────────────────────────────────────────────

  private fnBody(body: Block | Expression | null | undefined): void {
    if (!body) return;
    if (body.kind === 'Block') {
      this.pushScope(false);
      this.stmts(body.body);
      this.popScope();
    } else {
      this.expr(body);
    }
  }

  private match(m: { discriminant: Expression; cases: MatchCase[] | null }): void {
    this.expr(m.discriminant);
    for (const c of m.cases ?? []) {
      // Each case is its own scope; pattern bindings (MatchObjLit.fields,
      // MatchClass.fields, MatchIdent in tuples) are declared there.
      this.pushScope(false);
      this.declareMatchPattern(c.pattern);
      this.expr(c.guard);
      // Case bodies arrive as Block nodes smuggled through the Expression union.
      if (c.body && (c.body as unknown as { kind?: string }).kind === 'Block') {
        this.fnBody(c.body as unknown as Block);
      } else {
        this.expr(c.body);
      }
      this.popScope();
    }
  }

  /** Declare names introduced by a match pattern into the current case scope. */
  private declareMatchPattern(p: unknown): void {
    if (!p || typeof p !== 'object') return;
    const pat = p as { kind?: string; name?: string; fields?: unknown[]; elements?: unknown[]; patterns?: unknown[] };
    if (Array.isArray(pat.fields)) {
      for (const f of pat.fields) if (typeof f === 'string') this.declare(f, 'match-binding', {}, true);
    }
    if (pat.kind === 'MatchIdent' && typeof pat.name === 'string') {
      this.declare(pat.name, 'match-binding', {}, true);
    }
    for (const key of ['elements', 'patterns'] as const) {
      if (Array.isArray(pat[key])) for (const sub of pat[key]) this.declareMatchPattern(sub);
    }
  }

  private expr(e: Expression | null | undefined): void {
    if (!e || typeof e !== 'object') return;
    switch (e.kind) {
      case 'Literal':
        return;
      case 'TemplateLit':
        // Parts are strings and expressions; unknown shapes are ignored.
        for (const p of e.parts ?? []) {
          if (p && typeof p === 'object' && typeof (p as { kind?: string }).kind === 'string') {
            this.expr(p as unknown as Expression);
          }
        }
        return;
      case 'Ident':
        // `keyof T` in value position is reported by codegen (E414); its
        // argument is a type name, not a value reference.
        if (e.name === 'keyof') return;
        if (this.resolveIdent(e.name, e) !== 'ok') this.error('E122', e, { name: e.name });
        return;
      case 'Member': case 'OptChain':
        return this.expr(e.object);
      case 'Call':
        if (e.callee?.kind === 'Ident' && (e.callee as { name: string }).name === 'keyof') return;
        this.expr(e.callee);
        for (const a of e.args ?? []) this.expr(a?.expr);
        for (const t of e.typeArgs ?? []) this.type(t);
        return;
      case 'New':
        if (e.name && this.resolveIdent(e.name, e) === 'undeclared') this.error('E122', e, { name: e.name });
        if (e.callee) this.expr(e.callee);
        for (const a of e.args ?? []) this.expr(a?.expr);
        for (const t of e.typeArgs ?? []) this.type(t);
        return;
      case 'Index':
        this.expr(e.object);
        this.expr(e.index);
        return;
      case 'RangeIndex':
        this.expr(e.object);
        this.expr(e.start);
        this.expr(e.end);
        return;
      case 'Binary':
        this.expr(e.left);
        this.expr(e.right);
        return;
      case 'Unary':
        return this.expr(e.expr);
      case 'Ternary':
        this.expr(e.cond);
        this.expr(e.yes);
        this.expr(e.no);
        return;
      case 'Assign':
        this.expr(e.left);
        this.expr(e.right);
        return;
      case 'Cast':
        this.expr(e.expr);
        this.type(e.castType);
        return;
      case 'ArrayLit':
        for (const el of e.elems ?? []) this.expr(el?.expr);
        return;
      case 'ObjLit':
        for (const p of e.props ?? []) {
          if (p.key && typeof p.key === 'object') this.expr(p.key as Expression);
          this.expr(p.value);
          this.expr(p.expr);
        }
        return;
      case 'NonNull': case 'Propagate': case 'Typeof': case 'Await': case 'Drop':
        return this.expr((e as unknown as { expr: Expression }).expr);
      case 'Yield':
        return this.expr((e as unknown as { value?: Expression }).value);
      case 'Arrow': {
        this.pushScope(true);
        this.declareParams(e.params);
        this.type(e.returnType);
        this.fnBody(e.body);
        this.popScope();
        return;
      }
      case 'FuncExpr': {
        this.pushScope(true);
        if (e.name) this.declare(e.name, 'FuncExpr', e, true);
        this.declareParams(e.params);
        this.type(e.returnType);
        this.stmts(e.body?.body);
        this.popScope();
        return;
      }
      case 'Match':
        return this.match(e);
      case 'Spawn':
        for (const t of e.throwsTypes ?? []) this.type(t);
        this.pushScope(true);
        this.stmts(e.body?.body);
        this.popScope();
        return;
      case 'RawC':
        return;
      default:
        return;
    }
  }

  // ── E124: literal vs annotation ───────────────────────────────────────────

  /**
   * Check a Literal initializer against a primitive TypeRef annotation.
   * Only the cases the old pipeline let leak to gcc: kind mismatches
   * (number↔boolean↔string), float literals into integer types, char range
   * and multi-character strings. Range checks like `i8 = 256` stay in E101.
   */
  private checkInitMismatch(node: Pos, name: string, typeAnn: TypeAnn | null | undefined, init: Expression | null | undefined): void {
    if (!typeAnn || typeAnn.kind !== 'TypeRef' || !init) return;
    const target = typeAnn.name;
    // 'number' is not in PRIMITIVE_MAP (it resolves via defaultNumber), but
    // it is still a primitive target: 'let x: number = true' must be E124
    // (TS2322 parity), not fall through to codegen as `double x = true`
    if (target !== 'number' && !isPrimitive(target)) return;
    // any/unknown accept every literal kind by design.
    if (target === 'any' || target === 'unknown') return;

    let lit = init;
    if (init.kind === 'Unary' && init.op === '-') {
      const inner = init.expr;
      if (inner && inner.kind === 'Literal' && (inner.litType === 'number' || inner.litType === 'int' || inner.litType === 'bigint')) lit = inner;
      else return;
    }
    if (lit.kind !== 'Literal') return;

    const err = (literal: string) => this.error('E124', node, { name, type: target, literal });
    switch (lit.litType) {
      case 'bigint':
        // n-suffixed literals are only meaningful for the 64-bit integer types
        return target === 'i64' || target === 'u64' ? undefined : err('bigint');
      case 'number': case 'int': {
        if (target === 'boolean' || target === 'string') return err('number');
        if (target === 'char') {
          if (isFloatLiteralText(lit.value)) return err('float');
          const n = Number(lit.value);
          if (!Number.isInteger(n) || n < 0 || n > 255) return err('out-of-range number');
          return;
        }
        // Integer-valued float text ("2.0", "1e3") has no E100 (fractional)
        // counterpart — E124 owns it. Truly fractional values stay with E100.
        if (INT_TYPES.has(target) && isFloatLiteralText(lit.value) && Number.isInteger(Number(lit.value))) {
          return err('float');
        }
        return;
      }
      case 'bool': case 'boolean':
        return target === 'boolean' ? undefined : err('boolean');
      case 'string': {
        if (target === 'string') return;
        // char/u8 accept single-character strings; multi-char and empty are
        // owned by E102 (codegen) which reports richer context.
        if (target === 'char' || target === 'u8') return;
        return err('string');
      }
      case 'char':
        // A char literal also initializes u8 (unsigned char) — same width.
        return target === 'char' || target === 'u8' ? undefined : err('char');
      default:
        return; // 'null' etc. — owned by other checks (E116 and friends)
    }
  }
}
