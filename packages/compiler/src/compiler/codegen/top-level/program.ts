import type { CodeGenContext } from '../../codegen.js';
import type { TscError } from '../../error.js';
// program.ts
import { DEFAULT_TARGET } from '@tsclang/shared';
import type { Program, ClassDecl, ClassMember, TypeAnn, Decorator, Field, Stmt } from '@tsclang/ast';
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
          throw ctx.error(`TypeError: class '${n.name}' cannot extend '${n.superClass}'; inheritance is only allowed from 'Error'`);
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
          throw ctx.error(`TypeError: Inheritance chains longer than one level are not supported; '${name}' cannot extend '${n.superClass}' which already extends '${parent.superClass}'`);
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
    if (noFloat || noAsync) {
      const _walkForRestrictions = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(_walkForRestrictions); return; }
        const nd = n as Record<string, unknown>;
        if (noFloat && nd.kind === 'TypeRef' && (nd.name === 'f32' || nd.name === 'f64')) {
          throw ctx.error(`TypeError: float types (${nd.name as string}) are not supported (fpu: false)`);
        }
        if (noFloat && nd.kind === 'Literal' && nd.litType === 'number') {
          const v = String(nd.value).replace(/_/g, '');
          const isHex = /^0[xX]/.test(v);
          if (!isHex && (v.includes('.') || /[eE]/.test(v))) {
            throw ctx.error(`TypeError: float literal ${nd.value as string} is not supported (fpu: false)`);
          }
        }
        if (noAsync && nd.kind === 'FuncDecl' && nd.async) {
          throw ctx.error(`TypeError: async functions are not supported (async: "none")`);
        }
        for (const k of Object.keys(nd)) {
          if (k !== 'parent') { const v = nd[k]; if (v && typeof v === 'object') _walkForRestrictions(v); }
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
          throw ctx.error(`TypeError: async functions are not supported on wasm target`);
        }
        for (const k of Object.keys(nd)) {
          if (k !== 'parent') { const v = nd[k]; if (v && typeof v === 'object') _walkWasm(v); }
        }
      };
      for (const node of ast.body) _walkWasm(node);
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
            throw ctx.error(`TypeError: Direct recursion detected in '${fn}()': recursion is forbidden by strict rule 'no-recursion'`);
          } else {
            const cycleStr = [...cycle, fn].join(' → ');
            throw ctx.error(`TypeError: Mutual recursion detected: ${cycleStr}; recursion is forbidden by strict rule 'no-recursion'`);
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
          throw ctx.error(`TypeError: Error stack traces are not supported on embedded targets (${ctx._targetName})`);
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
    // These must become static globals (accessible from function scope)
    ctx._funcRefVars = new Set();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if ((n?.kind === 'FuncDecl' || n?.kind === 'ExtensionFunc') && n.body) {
        // Exclude parameter names — they shadow globals and must not trigger promotion
        const localNames = new Set<string>();
        const srcParams = n.kind === 'ExtensionFunc'
          ? [{ name: 'this' }, ...(n.params ?? [])]
          : (n.params ?? []);
        for (const p of srcParams) {
          if (p?.name) localNames.add(p.name);
          if (p?.destructObj) for (const k of Object.keys(p.destructObj)) localNames.add(k);
          if (p?.destructArr) for (const s of p.destructArr) if (s?.name) localNames.add(s.name);
        }
        // Collect idents from body, skipping shadowed param names
        // Also skip nested function bodies (they have their own scopes)
        const _collect = (nd: unknown, outerLocals: Set<string>) => {
          if (!nd || typeof nd !== 'object') return;
          if (Array.isArray(nd)) { nd.forEach((x: unknown) => _collect(x, outerLocals)); return; }
          const n = nd as Record<string, unknown>;
          if (n.kind === 'Ident') {
            if (!outerLocals.has(n.name as string)) ctx._funcRefVars.add(n.name as string);
            return;
          }
          // Nested function: collect with its own param scope merged
          if (n.kind === 'FuncDecl' || n.kind === 'ArrowFunc') {
            const inner = new Set(outerLocals);
            for (const p of (n.params as Record<string, unknown>[] | undefined) ?? []) {
              if (p?.name) inner.add(p.name as string);
            }
            if (n.body) _collect(n.body, inner);
            return;
          }
          // VarDecl: add declared name to local scope for subsequent siblings
          // (we don't track declaration order here — just collect all idents)
          for (const v of Object.values(n)) {
            if (v && typeof v === 'object') _collect(v, outerLocals);
          }
        };
        _collect(n.body, localNames);
      }
      // Also scan reactive callbacks (effect/computed/batch arrow args) for non-Signal free vars
      // Signal vars are captured by pointer into the env struct, not promoted to static globals
      if (n?.kind === 'ExprStmt' && n.expr?.kind === 'Call') {
        const _callee = n.expr.callee;
        const _isReactive = _callee?.kind === 'Ident' && ['effect', 'computed', 'batch'].includes(_callee.name);
        if (_isReactive) {
          const arrow = n.expr.args?.[0]?.expr;
          if (arrow?.kind === 'Arrow') {
            // Collect top-level Signal var names (to exclude from promotion)
            const _signalVarNames = new Set();
            for (const sn of ast.body) {
              const sd = sn.kind === 'Export' ? sn.decl : sn;
              if (sd?.kind === 'VarDecl' && sd.init?.kind === 'New' && sd.init.name === 'Signal') {
                _signalVarNames.add(sd.name);
              }
            }
            const arrowParams = new Set((arrow.params ?? []).map((p: { name?: string }) => p.name));
            const _collectArrow = (nd: unknown) => {
              if (!nd || typeof nd !== 'object') return;
              if (Array.isArray(nd)) { nd.forEach(_collectArrow); return; }
              const n = nd as Record<string, unknown>;
              if (n.kind === 'Ident' && !arrowParams.has(n.name as string) && !_signalVarNames.has(n.name as string)) {
                ctx._funcRefVars.add(n.name as string);
              }
              for (const v of Object.values(n)) {
                if (v && typeof v === 'object') _collectArrow(v);
              }
            };
            _collectArrow(arrow.body);
          }
        }
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

    // Phase B: Process functions, variables, imports, and everything else
    for (const node of ast.body) {
      if (_isTypeDecl(node)) continue;
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
          throw ctx.error(`Warning: Worst-case stack depth (${worst} bytes) exceeds stack_size (${ctx._stackSize} bytes) in '${info.name}()'`);
        }
      }
    }
}
