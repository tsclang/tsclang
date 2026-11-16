import type { CodeGenContext } from '../../codegen.js';
import type { TscError } from '../../error.js';
// program.ts
import { DEFAULT_TARGET } from '@tsclang/shared';
import type { Program, ClassDecl, ClassMember, TypeAnn, Decorator, Field, Stmt } from '@tsclang/ast';
import { collectFuncRefVars } from '../../func-ref-vars.js';
export function visitProgram(ctx: CodeGenContext, ast: Program) {
    // Pre-scan: find variables exclusively consumed by Object.fromEntries(varName)
    ctx._fromEntriesConsumed = new Map();
    for (const node of ast.body) {
      const stmt = node.kind === 'Export' ? node.decl : node;
      if (stmt?.kind === 'VarDecl' &&
          stmt.init?.kind === 'Call' &&
          stmt.init.callee?.kind === 'Member' &&
          stmt.init.callee?.object?.kind === 'Ident' &&
          stmt.init.callee?.object?.name === 'Object' &&
          stmt.init.callee?.prop === 'fromEntries' &&
          stmt.init.args?.[0]?.expr?.kind === 'Ident') {
        ctx._fromEntriesConsumed.set(stmt.init.args[0].expr.name, null);
      }
    }

    // Pre-scan: find Arc<T> and Weak<T> usage to know which classes need _refcount/_weakcount
    ctx._arcClasses = new Map();
    const _scanArc = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_scanArc); return; }
      const nd = n as Record<string, unknown>;
      if (nd.kind === 'New' && (nd.name === 'Arc' || nd.name === 'Weak')) {
        const tArg = (nd.typeArgs as Record<string, unknown>[] | undefined)?.[0];
        if (tArg?.kind === 'TypeRef') {
          const tName = tArg.name as string;
          const info = ctx._arcClasses.get(tName) ?? {};
          if (nd.name === 'Arc') { info.arc = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          if (nd.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          ctx._arcClasses.set(tName, info);
        }
      }
      if (nd.kind === 'VarDecl') {
        const _checkTypeAnn = (ta: TypeAnn | null | undefined) => {
          if (!ta) return;
          if (ta.kind === 'TypeRef' && (ta.name === 'Arc' || ta.name === 'Weak')) {
            const tArg = ta.typeArgs?.[0];
            if (tArg?.kind === 'TypeRef') {
              const info = ctx._arcClasses.get(tArg.name) ?? {};
              if (ta.name === 'Arc') { info.arc = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
              if (ta.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
              ctx._arcClasses.set(tArg.name, info);
            }
          }
        };
        _checkTypeAnn(nd.typeAnn as TypeAnn | null | undefined);
      }
      // Also scan TypeRef fields for Weak<T>
      if (nd.kind === 'TypeRef' && nd.name === 'Weak') {
        const tArg = (nd.typeArgs as Record<string, unknown>[] | undefined)?.[0];
        if (tArg?.kind === 'TypeRef') {
          const tName = tArg.name as string;
          const info = ctx._arcClasses.get(tName) ?? {};
          info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true;
          ctx._arcClasses.set(tName, info);
        }
      }
      for (const key of Object.keys(nd)) {
        const child = nd[key];
        if (child && typeof child === 'object') _scanArc(child);
      }
    };
    for (const node of ast.body) _scanArc(node);

    // Pre-scan: only Error inheritance is allowed
    {
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl' && n.superClass && n.superClass !== 'Error') {
          throw ctx.errorCode('E416', null, { detail: `TypeError: class '${n.name}' cannot extend '${n.superClass}'; inheritance is only allowed from 'Error'` });
        }
      }
    }

    // Pre-scan: detect inheritance chains > 1 level
    {
      const classDecls: Record<string, ClassDecl> = {};
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl' && !n.typeParams?.length) classDecls[n.name] = n;
      }
      for (const [name, n] of Object.entries(classDecls)) {
        if (!n.superClass) continue;
        const parent = classDecls[n.superClass];
        if (parent?.superClass) {
          throw ctx.errorCode('E416', null, { detail: `TypeError: Inheritance chains longer than one level are not supported; '${name}' cannot extend '${n.superClass}' which already extends '${parent.superClass}'` });
        }
      }
    }

    // Pre-scan: detect target and allocator from opts or defaults
    // Priority: opts > default
    ctx._targetName = ctx._optsTarget || DEFAULT_TARGET;
    ctx._allocatorName = ctx._optsAllocator || ctx._cap('allocator') || 'default';
    ctx._asyncName = ctx._optsAsync || null;
    ctx._ramSize = ctx._optsRamSize || null;
    ctx._stackSize = ctx._optsStackSize || null;
    ctx._funcStackInfo = new Map();

    // Default number type: opts > profile capability > DESKTOP_CAPABILITIES fallback
    ctx._defaultNumber = ctx._optsDefaultNumber || ctx._cap('defaultNumber');

    // Pre-scan: capability-based restrictions
    const noFloat = !ctx._cap('fpu');
    const noAsync = ctx._cap('async') === 'none';
    const DECIMAL_TYPES = new Set(['d8', 'd16', 'd32', 'd64']);
    if (noFloat || noAsync) {
      const _walkForRestrictions = (n: unknown, skipFloatLiterals: boolean = false) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(item => _walkForRestrictions(item, skipFloatLiterals)); return; }
        const nd = n as Record<string, unknown>;
        if (noFloat && nd.kind === 'TypeRef' && (nd.name === 'f32' || nd.name === 'f64')) {
          throw ctx.errorCode('E302', null, { detail: `float types (${nd.name as string}) are not supported (fpu: false)` });
        }
        if (noFloat && !skipFloatLiterals && nd.kind === 'Literal' && nd.litType === 'number') {
          const v = String(nd.value).replace(/_/g, '');
          const isHex = /^0[xX]/.test(v);
          if (!isHex && (v.includes('.') || /[eE]/.test(v))) {
            throw ctx.errorCode('E302', null, { detail: `float literal ${nd.value as string} is not supported (fpu: false)` });
          }
        }
        if (noAsync && nd.kind === 'FuncDecl' && nd.async) {
          throw ctx.errorCode('E303', null, { detail: 'async functions are not supported (async: "none")' });
        }
        // Propagate skipFloatLiterals to children if inside a decimal-typed VarDecl
        let childSkip = skipFloatLiterals;
        if ((nd.kind === 'VarDecl' || nd.kind === 'ConstDecl') && nd.typeAnn) {
          const ta = nd.typeAnn as { kind?: string; name?: string };
          if (ta.kind === 'TypeRef' && DECIMAL_TYPES.has(ta.name ?? '')) {
            childSkip = true;
          }
        }
        for (const k of Object.keys(nd)) {
          if (k !== 'parent') { const v = nd[k]; if (v && typeof v === 'object') _walkForRestrictions(v, childSkip); }
        }
      };
      for (const node of ast.body) _walkForRestrictions(node);
    }

    // Pre-scan: wasm bare restrictions
    if (ctx._isWasmBare()) {
      const _walkWasm = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(_walkWasm); return; }
        const nd = n as Record<string, unknown>;
        if (nd.kind === 'FuncDecl' && nd.async) {
          throw ctx.errorCode('E303', null, { detail: 'async functions are not supported on wasm target' });
        }
        for (const k of Object.keys(nd)) {
          if (k !== 'parent') { const v = nd[k]; if (v && typeof v === 'object') _walkWasm(v); }
        }
      };
      for (const node of ast.body) _walkWasm(node);
    }

    // Pre-scan: async await-recursion — a cycle of `await` calls between async
    // functions cannot be lowered to by-value nested state structs. The spec'd
    // heap-allocated state machines are not implemented yet (see the issue in
    // the E307 diagnostic), so cycles are a hard error instead of invalid C.
    {
      const awaitGraph = new Map<string, Set<string>>();
      const _collectAwaits = (nd: unknown, result: Set<string>) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach((x: unknown) => _collectAwaits(x, result)); return; }
        const n = nd as Record<string, unknown>;
        // Don't recurse into nested function bodies
        if (n.kind === 'FuncDecl' || n.kind === 'ArrowFunc') return;
        if (n.kind === 'Await') {
          const call = n.expr as Record<string, unknown> | undefined;
          const callee = call?.callee as Record<string, unknown> | undefined;
          if (call?.kind === 'Call' && callee?.kind === 'Ident') result.add(callee.name as string);
        }
        for (const v of Object.values(n)) {
          if (v && typeof v === 'object') _collectAwaits(v, result);
        }
      };
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'FuncDecl' && n.async && n.body) {
          const awaits = new Set<string>();
          _collectAwaits(n.body, awaits);
          awaitGraph.set(n.name, awaits);
        }
      }
      const visitedAsync = new Set<string>();
      const inStackAsync = new Map<string, number>();
      const pathAsync: string[] = [];
      const _dfsAsync = (fn: string) => {
        if (inStackAsync.has(fn)) {
          const cycle = pathAsync.slice(inStackAsync.get(fn));
          const cycleStr = cycle.length === 1
            ? `async function '${fn}()' awaits itself`
            : [...cycle, fn].join(' → ');
          throw ctx.errorCode('E307', null, { detail: `${cycleStr}: recursive async requires a heap-allocated state machine, which is not supported yet — rewrite iteratively or with an explicit stack` });
        }
        if (visitedAsync.has(fn)) return;
        inStackAsync.set(fn, pathAsync.length);
        pathAsync.push(fn);
        for (const callee of (awaitGraph.get(fn) ?? [])) {
          if (awaitGraph.has(callee)) _dfsAsync(callee);
        }
        pathAsync.pop();
        inStackAsync.delete(fn);
        visitedAsync.add(fn);
      };
      for (const fn of awaitGraph.keys()) {
        try {
          _dfsAsync(fn);
        } catch (e) {
          // Pre-scan throws outside Phase B — bag it the same way so the
          // rendered output keeps the `error[E307]:` header (runner contract)
          if ((e as Record<string, unknown>)?.isTscError) {
            const bag = new Error('compilation failed') as Error & { isTscErrorBag: boolean; errors: unknown[] };
            bag.isTscErrorBag = true;
            bag.errors = [e];
            throw bag;
          }
          throw e;
        }
      }
    }

    // Pre-scan: recursion detection when no-recursion strict rule is set
    if (ctx._strictRules?.has('no-recursion')) {
      // Build call graph: funcName → Set of called top-level funcNames
      const callGraph = new Map();
      const _collectCalls = (nd: unknown, result: Set<string>) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach((x: unknown) => _collectCalls(x, result)); return; }
        const n = nd as Record<string, unknown>;
        const callee = n.callee as Record<string, unknown> | undefined;
        if (n.kind === 'Call' && callee?.kind === 'Ident') result.add(callee.name as string);
        // Don't recurse into nested function bodies
        if (n.kind === 'FuncDecl' || n.kind === 'ArrowFunc') return;
        for (const v of Object.values(n)) {
          if (v && typeof v === 'object') _collectCalls(v, result);
        }
      };
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'FuncDecl' && n.body) {
          const calls = new Set<string>();
          _collectCalls(n.body, calls);
          callGraph.set(n.name, calls);
        }
      }
      // Detect cycles via DFS
      const visited = new Set();
      const inStack = new Map(); // funcName → index in path
      const path: string[] = [];
      const _dfs = (fn: string) => {
        if (inStack.has(fn)) {
          const cycleStart = inStack.get(fn);
          const cycle = path.slice(cycleStart);
          if (cycle.length === 1) {
            throw ctx.errorCode('E209', null, { detail: `direct recursion detected in '${fn}()': recursion is forbidden by strict rule 'no-recursion'` });
          } else {
            const cycleStr = [...cycle, fn].join(' → ');
            throw ctx.errorCode('E209', null, { detail: `mutual recursion detected: ${cycleStr}; recursion is forbidden by strict rule 'no-recursion'` });
          }
        }
        if (visited.has(fn)) return;
        inStack.set(fn, path.length);
        path.push(fn);
        for (const callee of (callGraph.get(fn) ?? [])) {
          if (callGraph.has(callee)) _dfs(callee);
        }
        path.pop();
        inStack.delete(fn);
        visited.add(fn);
      };
      for (const fn of callGraph.keys()) _dfs(fn);
    }

    // Pre-scan: collect all classes used in throws clauses → _throwsClasses
    // Also collect union groups for _new determination
    ctx._throwsClasses = new Map(); // className → { hasMessage, hasStack, needsNew }
    const _throwsUnions: string[][] = []; // each element = array of class names from one throws clause
    // Flatten throwsTypes array (handles both TypeRef and TypeUnion elements)
    const _flattenThrowsNames = (throwsTypes: TypeAnn[]) => {
      const names: string[] = [];
      for (const t of throwsTypes ?? []) {
        if (t.kind === 'TypeRef') names.push(t.name);
        else if (t.kind === 'TypeUnion') {
          for (const inner of t.types) { if (inner.kind === 'TypeRef') names.push(inner.name); }
        }
      }
      return names;
    };
    const _collectThrows = (throwsTypes: TypeAnn[]) => {
      if (!throwsTypes?.length) return;
      const names = _flattenThrowsNames(throwsTypes);
      for (const n of names) {
        if (!ctx._throwsClasses.has(n)) ctx._throwsClasses.set(n, { hasMessage: false, hasStack: false, needsNew: false });
      }
      if (names.length > 0) _throwsUnions.push(names);
    };
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'FuncDecl') _collectThrows(n.throwsTypes ?? []);
      if (n?.kind === 'ClassDecl') {
        for (const m of (n.members ?? [])) {
          if (m.kind === 'Method') _collectThrows(m.throwsTypes ?? []);
        }
      }
    }
    // Determine hasMessage/hasStack for each throws class; also check all classes for embedded stack
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'ClassDecl') {
        const fields = (n.members ?? []).filter((m: { kind: string }) => m.kind === 'Field');
        const hasStack = fields.some((f: ClassMember): f is Field => f.kind === 'Field' && f.name === 'stack');
        if (hasStack && ctx._cap('os') === false) {
          throw ctx.errorCode('E304', null, { detail: `Error stack traces are not supported on embedded targets (${ctx._targetName})` });
        }
        const info = ctx._throwsClasses.get(n.name);
        if (info) {
          info.hasMessage = fields.some((f: ClassMember): f is Field => f.kind === 'Field' && f.name === 'message');
          info.hasStack = hasStack;
        }
      }
    }
    // Determine needsNew: walk AST for throw new X() nodes
    const _thrownClasses = new Set<string>();
    const _walkThrows = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_walkThrows); return; }
      const nd = n as Record<string, unknown>;
      const val = nd.value as Record<string, unknown> | undefined;
      if (nd.kind === 'Throw' && val?.kind === 'New') _thrownClasses.add(val.name as string);
      for (const k of Object.keys(nd)) {
        if (k !== 'parent') { const v = nd[k]; if (v && typeof v === 'object') _walkThrows(v); }
      }
    };
    for (const node of ast.body) _walkThrows(node);
    // For each union: if any member thrown → all get needsNew
    for (const union of _throwsUnions) {
      if (union.some((name: string) => _thrownClasses.has(name))) {
        for (const name of union) {
          const info = ctx._throwsClasses.get(name);
          if (info) info.needsNew = true;
        }
      }
    }

    // Pre-scan: collect names used as decorators (so we can suppress C emission for those functions)
    ctx._decoratorFns = new Map();   // name → FuncDecl AST
    ctx._decoratorNames = new Set(); // all names used with @
    ctx._platformSkipped = new Map(); // name → allowed platforms (for error reporting)
    {
      const scanDecs = (decs: Decorator[] | undefined) => { for (const d of (decs ?? [])) ctx._decoratorNames.add(d.name); };
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl') {
          scanDecs(n.decorators);
          for (const m of (n.members ?? [])) scanDecs(m.decorators);
        }
        if (n?.kind === 'FuncDecl') scanDecs(n.decorators);
      }
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'FuncDecl' && n.name && (n.isDecorator || ctx._decoratorNames.has(n.name))) {
          ctx._decoratorFns.set(n.name, n);
        }
      }
    }

    // Pre-scan: detect HashMap capacity violations (capacity overflow takes priority over platform error)
    ctx._hmCapViolations = new Map(); // varName → { count, cap }
    {
      const _hmDecls = new Map(); // varName → capacityNum
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'VarDecl' && n.init?.kind === 'New' && n.init.name === 'HashMap') {
          const capLit = n.init.args?.[0]?.expr;
          const capNum = capLit?.kind === 'Literal' && capLit.litType === 'number' ? parseInt(capLit.value) : 0;
          if (capNum > 0) _hmDecls.set(n.name, { count: 0, cap: capNum });
        }
        if (n?.kind === 'ExprStmt' && n.expr?.kind === 'Call') {
          const callee = n.expr.callee;
          if (callee?.kind === 'Member' && callee.prop === 'set' && callee.object?.kind === 'Ident') {
            const info = _hmDecls.get(callee.object.name);
            if (info) {
              info.count++;
              if (info.count > info.cap && !ctx._hmCapViolations.has(callee.object.name)) {
                ctx._hmCapViolations.set(callee.object.name, { count: info.count, cap: info.cap });
              }
            }
          }
        }
      }
    }

    // Pre-scan: collect variable names referenced by top-level functions
    // These must become static globals (accessible from function scope).
    // Shared with semantics.ts (W013) — see func-ref-vars.ts for the rules.
    ctx._funcRefVars = collectFuncRefVars(ast);

    // Hoisting (#295 v2a): index not-yet-processed top-level functions by
    // name. Built before ANY emission phase can run exprToC (Phase A.0 static
    // splits may reference later functions) so forward pulls always resolve.
    ctx._pendingFuncs = new Map();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if ((n?.kind === 'FuncDecl' || n?.kind === 'FuncOverload') && n.name) {
        const group = ctx._pendingFuncs.get(n.name) ?? [];
        group.push(node);
        ctx._pendingFuncs.set(n.name, group);
      }
    }

    // Pre-scan: register function signatures referenced by ReturnType<typeof fn> / Parameters<typeof fn>
    //   TypeAliases in Phase A need these symbols. Only register functions actually referenced
    //   by utility-type TypeAliases to avoid interfering with normal function codegen.
    {
      const _collectTypeofNames = (n: unknown, acc: Set<string>) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach((x: unknown) => _collectTypeofNames(x, acc)); return; }
        const nd = n as Record<string, unknown>;
        if (nd.kind === 'TypeTypeof' && typeof nd.name === 'string') acc.add(nd.name);
        for (const k of Object.keys(nd)) {
          if (k === 'parent') continue;
          const v = nd[k];
          if (v && typeof v === 'object') _collectTypeofNames(v, acc);
        }
      };
      const typeofNames = new Set<string>();
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'TypeAlias') {
          const ut = n.typeAnn;
          if (ut?.kind === 'TypeRef' && (ut.name === 'ReturnType' || ut.name === 'Parameters')) {
            _collectTypeofNames(ut, typeofNames);
          }
        }
      }
      if (typeofNames.size > 0) {
        for (const node of ast.body) {
          const n = node.kind === 'Export' ? node.decl : node;
          if (n?.kind === 'FuncDecl' && n.name && typeofNames.has(n.name)) {
            const existing = ctx.lookup(n.name);
            if (!existing) {
              ctx.define(n.name, {
                ctype: n.returnType ? ctx.resolveType(n.returnType) : 'void',
                funcName: n.name,
                params: n.params ?? [],
                returnType: n.returnType ?? null,
              });
            }
          }
        }
      }
    }

    // Pre-scan: collect all struct-emitting type names for mutual recursion support.
    //   When type A references type B via pointer and B hasn't been emitted yet,
    //   we forward-declare B so the C compiler knows the type exists.
    ctx._allStructNames = new Set();
    ctx._forwardDeclared = new Set();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (!n) continue;
      const prefix = ctx._modulePrefix ?? '';
      if (n.kind === 'ClassDecl') {
        ctx._allStructNames.add(prefix + n.name);
      } else if (n.kind === 'Interface') {
        const hasMethods = (n.members ?? []).some((m: { kind: string }) => m.kind === 'MethodSig');
        if (!hasMethods) ctx._allStructNames.add(prefix + n.name);
      } else if (n.kind === 'TypeAlias' && n.typeAnn?.kind === 'TypeObject') {
        const hasMethod = n.typeAnn.fields.some((f: { isMethod?: boolean }) => f.isMethod);
        if (!hasMethod) ctx._allStructNames.add(prefix + n.name);
      }
    }

    // Phase A: Process type declarations (classes, interfaces, type aliases, enums)
    //   Ensures all type metadata is registered before any function body codegen,
    //   enabling forward references and a future monomorphization pre-pass.
    const _isTypeDecl = (node: typeof ast.body[number]): boolean => {
      const decl = node.kind === 'Export' ? node.decl : node;
      if (!decl) return false;
      return decl.kind === 'ClassDecl' || decl.kind === 'Interface' ||
             decl.kind === 'TypeAlias' || decl.kind === 'Enum';
    };

    // Phase A.0: Process funcRef VarDecls that decorator wrappers may reference.
    //   These static globals must be emitted before class methods (C: declaration before use).
    //   Only process VarDecls in _funcRefVars — others stay in source order (Phase B).
    //   Runtime split-init assignments are DEFERRED to the node's source position
    //   (hoisting #295 v2a: a use before the declaration line must observe the
    //   zero-init value, not an early assignment).
    //   EXCEPT class-instance `new` initializers (#298 s2): their folding needs
    //   the classes registry (field defaults, monomorphization), which the type
    //   phase below populates. Emit those at their source position in Phase B;
    //   the fwd-declaration section covers methods that reference them earlier.
    const _classNewNames = new Set<string>();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'ClassDecl') _classNewNames.add(n.name);
    }
    const _processedVarDecls = new Set<unknown>();
    ctx._processedVarDecls = _processedVarDecls as Set<Stmt>;
    ctx._deferredStaticInits = new Map();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'VarDecl' && n.name && ctx._funcRefVars?.has(n.name)
          && !(n.init?.kind === 'New' && _classNewNames.has(n.init.name))) {
        _processedVarDecls.add(node);
        if (n !== node) _processedVarDecls.add(n); // dispatch sees the unwrapped decl
        try {
          ctx.visitTopLevel(node);
        } catch (e) {
          if ((e as Record<string, unknown>)?.isTscError) {
            ctx._errors.push(e as TscError);
            if (ctx._errors.length >= ctx._maxErrors) break;
          } else {
            throw e;
          }
        }
      }
    }

    for (const node of ast.body) {
      if (!_isTypeDecl(node)) continue;
      try {
        ctx.visitTopLevel(node);
      } catch (e) {
        if ((e as Record<string, unknown>)?.isTscError) {
          ctx._errors.push(e as TscError);
          if (ctx._errors.length >= ctx._maxErrors) break;
        } else {
          throw e;
        }
      }
    }

    // Monomorphization pre-pass: Walk the AST to find explicit generic class
    // demands (TypeRef + New) and emit mono classes before function codegen.
    // Skips generic class/function bodies (they're templates, not concrete code).
    // Nested demands (e.g., Wrapper<U> contains Box<U>) are handled recursively
    // by emitMonoClass → resolveType → ensureMonoClass.
    {
      const _scanMono = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(_scanMono); return; }
        const nd = n as Record<string, unknown>;
        // Skip generic declarations — their bodies are templates, not concrete code
        if (nd.kind === 'ClassDecl' && (nd.typeParams as unknown[])?.length) return;
        if (nd.kind === 'FuncDecl' && (nd.typeParams as unknown[])?.length) return;
        // Collect demands from non-generic code
        if (nd.kind === 'TypeRef' && typeof nd.name === 'string' && ctx._genericClasses?.has(nd.name)) {
          const typeArgs = (nd.typeArgs as TypeAnn[]) ?? [];
          if (typeArgs.length > 0) ctx.ensureMonoClass(nd.name, typeArgs);
        }
        if (nd.kind === 'New' && typeof nd.name === 'string' && ctx._genericClasses?.has(nd.name)) {
          const typeArgs = (nd.typeArgs as TypeAnn[]) ?? [];
          ctx.ensureMonoClass(nd.name, typeArgs);
        }
        // Recurse (skip parent to avoid cycles)
        for (const key of Object.keys(nd)) {
          if (key === 'parent') continue;
          const child = nd[key];
          if (child && typeof child === 'object') _scanMono(child);
        }
      };
      for (const node of ast.body) _scanMono(node);
    }

    // Phase B: Process functions, imports, and everything else.
    // Hoisting support (#295 v2a): forward references pull pending functions
    // on demand (ctx.tryPullPendingFunc); the main loop skips what a pull
    // already emitted. (_pendingFuncs is built before Phase A.0.)
    for (const node of ast.body) {
      if (_isTypeDecl(node)) continue;
      if (_processedVarDecls.has(node)) {
        // Hoisting (#295 v2a): flush the deferred runtime init of a static
        // global at its source position (Phase A.0 emitted only the zero-init).
        const _n2 = (node.kind === 'Export' ? node.decl : node) as Stmt | undefined;
        const _deferred = _n2 ? ctx._deferredStaticInits.get(_n2) : undefined;
        if (_deferred !== undefined) {
          ctx._deferredStaticInits.delete(_n2!);
          (ctx._libraryMode ? ctx._libInitStmts : ctx.mainStmts).push(_deferred);
        }
        continue;
      }
      if (ctx._processedTopLevel.has(node)) continue;
      ctx._processedTopLevel.add(node);
      try {
        ctx.visitTopLevel(node);
      } catch (e) {
        if ((e as Record<string, unknown>)?.isTscError) {
          ctx._errors.push(e as TscError);
          if (ctx._errors.length >= ctx._maxErrors) break;
        } else {
          throw e;
        }
      }
    }
    if (ctx._errors.length > 0) {
      const bag = new Error('compilation failed') as Error & { isTscErrorBag: boolean; errors: unknown[] };
      bag.isTscErrorBag = true;
      bag.errors = ctx._errors;
      throw bag;
    }

    if (ctx._stackSize != null && ctx._funcStackInfo.size > 0) {
      const _worstCase = new Map();
      const _visiting = new Set();
      const _computeWorst = (astName: string, path: string[]) => {
        if (_worstCase.has(astName)) return _worstCase.get(astName);
        const info = ctx._funcStackInfo.get(astName);
        if (!info) return 0;
        if (_visiting.has(astName)) return 0;
        _visiting.add(astName);
        let calleeMax = 0;
        for (const callee of info.callees) {
          const calleeWorst = _computeWorst(callee, [...path, astName]);
          if (calleeWorst > calleeMax) calleeMax = calleeWorst;
        }
        _visiting.delete(astName);
        const total = info.ownBytes + calleeMax;
        _worstCase.set(astName, total);
        return total;
      };
      const _checked = new Set();
      for (const [cname, info] of ctx._funcStackInfo) {
        if (_checked.has(info.name)) continue;
        _checked.add(info.name);
        const worst = _computeWorst(info.name, []);
        if (worst > ctx._stackSize) {
          throw ctx.errorCode('E305', null, { detail: `worst-case stack depth (${worst} bytes) exceeds stack_size (${ctx._stackSize} bytes) in '${info.name}()'` });
        }
      }
    }
}
