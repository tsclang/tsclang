// program.ts
import { DEFAULT_TARGET } from '@tsclang/shared';
import type { Program } from '@tsclang/ast';
export default {
  visitProgram(this: any, ast: Program) {
    // Pre-scan: find variables exclusively consumed by Object.fromEntries(varName)
    this._fromEntriesConsumed = new Map();
    for (const node of ast.body) {
      const stmt: any = node.kind === 'Export' ? node.decl : node;
      if (stmt?.kind === 'VarDecl' &&
          stmt.init?.kind === 'Call' &&
          stmt.init.callee?.kind === 'Member' &&
          stmt.init.callee?.object?.name === 'Object' &&
          stmt.init.callee?.prop === 'fromEntries' &&
          stmt.init.args?.[0]?.expr?.kind === 'Ident') {
        this._fromEntriesConsumed.set(stmt.init.args[0].expr.name, null);
      }
    }

    // Pre-scan: find Arc<T> and Weak<T> usage to know which classes need _refcount/_weakcount
    this._arcClasses = new Map();
    const _scanArc = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_scanArc); return; }
      if (n.kind === 'New' && (n.name === 'Arc' || n.name === 'Weak')) {
        const tArg = n.typeArgs?.[0];
        if (tArg?.kind === 'TypeRef') {
          const info = this._arcClasses.get(tArg.name) ?? {};
          if (n.name === 'Arc') { info.arc = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          if (n.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          this._arcClasses.set(tArg.name, info);
        }
      }
      if (n.kind === 'VarDecl') {
        const _checkTypeAnn = (ta: any) => {
          if (!ta) return;
          if (ta.kind === 'TypeRef' && (ta.name === 'Arc' || ta.name === 'Weak')) {
            const tArg = ta.typeArgs?.[0];
            if (tArg?.kind === 'TypeRef') {
              const info = this._arcClasses.get(tArg.name) ?? {};
              if (ta.name === 'Arc') { info.arc = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
              if (ta.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
              this._arcClasses.set(tArg.name, info);
            }
          }
        };
        _checkTypeAnn(n.typeAnn);
      }
      // Also scan TypeRef fields for Weak<T>
      if (n.kind === 'TypeRef' && n.name === 'Weak') {
        const tArg = n.typeArgs?.[0];
        if (tArg?.kind === 'TypeRef') {
          const info = this._arcClasses.get(tArg.name) ?? {};
          info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true;
          this._arcClasses.set(tArg.name, info);
        }
      }
      for (const key of Object.keys(n)) {
        const child = n[key];
        if (child && typeof child === 'object') _scanArc(child);
      }
    };
    for (const node of ast.body) _scanArc(node);

    // Pre-scan: only Error inheritance is allowed
    {
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl' && n.superClass && n.superClass !== 'Error') {
          throw this.error(`TypeError: class '${n.name}' cannot extend '${n.superClass}'; inheritance is only allowed from 'Error'`);
        }
      }
    }

    // Pre-scan: detect inheritance chains > 1 level
    {
      const classDecls: any = {};
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl' && !n.typeParams?.length) classDecls[n.name] = n;
      }
      for (const [name, n] of Object.entries(classDecls) as [string, any][]) {
        if (!n.superClass) continue;
        const parent = classDecls[n.superClass];
        if (parent?.superClass) {
          throw this.error(`TypeError: Inheritance chains longer than one level are not supported; '${name}' cannot extend '${n.superClass}' which already extends '${parent.superClass}'`);
        }
      }
    }

    // Pre-scan: detect target and allocator from opts or defaults
    // Priority: opts > default
    this._targetName = this._optsTarget || DEFAULT_TARGET;
    this._allocatorName = this._optsAllocator || this._cap('allocator') || 'default';
    this._asyncName = this._optsAsync || null;
    this._ramSize = this._optsRamSize || null;
    this._stackSize = this._optsStackSize || null;
    this._funcStackInfo = new Map();

    // Default number type: opts > profile capability > DESKTOP_CAPABILITIES fallback
    this._defaultNumber = this._optsDefaultNumber || this._cap('defaultNumber');

    // Pre-scan: capability-based restrictions
    const noFloat = !this._cap('fpu');
    const noAsync = this._cap('async') === 'none';
    if (noFloat || noAsync) {
      const _walkForRestrictions = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(_walkForRestrictions); return; }
        if (noFloat && n.kind === 'TypeRef' && (n.name === 'f32' || n.name === 'f64')) {
          throw this.error(`TypeError: float types (${n.name}) are not supported (fpu: false)`);
        }
        if (noFloat && n.kind === 'Literal' && n.litType === 'number') {
          const v = n.value.replace(/_/g, '');
          const isHex = /^0[xX]/.test(v);
          if (!isHex && (v.includes('.') || /[eE]/.test(v))) {
            throw this.error(`TypeError: float literal ${n.value} is not supported (fpu: false)`);
          }
        }
        if (noAsync && n.kind === 'FuncDecl' && n.async) {
          throw this.error(`TypeError: async functions are not supported (async: "none")`);
        }
        for (const k of Object.keys(n)) {
          if (k !== 'parent') { const v = n[k]; if (v && typeof v === 'object') _walkForRestrictions(v); }
        }
      };
      for (const node of ast.body) _walkForRestrictions(node);
    }

    // Pre-scan: wasm bare restrictions
    if (this._isWasmBare()) {
      const _walkWasm = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(_walkWasm); return; }
        if (n.kind === 'FuncDecl' && n.async) {
          throw this.error(`TypeError: async functions are not supported on wasm target`);
        }
        for (const k of Object.keys(n)) {
          if (k !== 'parent') { const v = n[k]; if (v && typeof v === 'object') _walkWasm(v); }
        }
      };
      for (const node of ast.body) _walkWasm(node);
    }

    // Pre-scan: recursion detection when no-recursion strict rule is set
    if (this._strictRules?.has('no-recursion')) {
      // Build call graph: funcName → Set of called top-level funcNames
      const callGraph = new Map();
      const _collectCalls = (nd: any, result: any) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach((x: any) => _collectCalls(x, result)); return; }
        if (nd.kind === 'Call' && nd.callee?.kind === 'Ident') result.add(nd.callee.name);
        // Don't recurse into nested function bodies
        if (nd.kind === 'FuncDecl' || nd.kind === 'ArrowFunc') return;
        for (const v of Object.values(nd)) {
          if (v && typeof v === 'object') _collectCalls(v, result);
        }
      };
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'FuncDecl' && n.body) {
          const calls = new Set();
          _collectCalls(n.body, calls);
          callGraph.set(n.name, calls);
        }
      }
      // Detect cycles via DFS
      const visited = new Set();
      const inStack = new Map(); // funcName → index in path
      const path: any[] = [];
      const _dfs = (fn: any) => {
        if (inStack.has(fn)) {
          const cycleStart = inStack.get(fn);
          const cycle = path.slice(cycleStart);
          if (cycle.length === 1) {
            throw this.error(`TypeError: Direct recursion detected in '${fn}()': recursion is forbidden by strict rule 'no-recursion'`);
          } else {
            const cycleStr = [...cycle, fn].join(' → ');
            throw this.error(`TypeError: Mutual recursion detected: ${cycleStr}; recursion is forbidden by strict rule 'no-recursion'`);
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
    this._throwsClasses = new Map(); // className → { hasMessage, hasStack, needsNew }
    const _throwsUnions: any[] = []; // each element = array of class names from one throws clause
    // Flatten throwsTypes array (handles both TypeRef and TypeUnion elements)
    const _flattenThrowsNames = (throwsTypes: any) => {
      const names: any[] = [];
      for (const t of throwsTypes ?? []) {
        if (t.kind === 'TypeRef') names.push(t.name);
        else if (t.kind === 'TypeUnion') {
          for (const inner of t.types) { if (inner.kind === 'TypeRef') names.push(inner.name); }
        }
      }
      return names;
    };
    const _collectThrows = (throwsTypes: any) => {
      if (!throwsTypes?.length) return;
      const names = _flattenThrowsNames(throwsTypes);
      for (const n of names) {
        if (!this._throwsClasses.has(n)) this._throwsClasses.set(n, { hasMessage: false, hasStack: false, needsNew: false });
      }
      if (names.length > 0) _throwsUnions.push(names);
    };
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'FuncDecl') _collectThrows(n.throwsTypes);
      if (n?.kind === 'ClassDecl') {
        for (const m of (n.members ?? [])) {
          if (m.kind === 'Method') _collectThrows(m.throwsTypes);
        }
      }
    }
    // Determine hasMessage/hasStack for each throws class; also check all classes for embedded stack
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'ClassDecl') {
        const fields = (n.members ?? []).filter((m: any) => m.kind === 'Field');
        const hasStack = fields.some((f: any) => f.name === 'stack');
        if (hasStack && this._cap('os') === false) {
          throw this.error(`TypeError: Error stack traces are not supported on embedded targets (${this._targetName})`);
        }
        const info = this._throwsClasses.get(n.name);
        if (info) {
          info.hasMessage = fields.some((f: any) => f.name === 'message');
          info.hasStack = hasStack;
        }
      }
    }
    // Determine needsNew: walk AST for throw new X() nodes
    const _thrownClasses = new Set();
    const _walkThrows = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_walkThrows); return; }
      if (n.kind === 'Throw' && n.value?.kind === 'New') _thrownClasses.add(n.value.name);
      for (const k of Object.keys(n)) {
        if (k !== 'parent') { const v = n[k]; if (v && typeof v === 'object') _walkThrows(v); }
      }
    };
    for (const node of ast.body) _walkThrows(node);
    // For each union: if any member thrown → all get needsNew
    for (const union of _throwsUnions) {
      if (union.some((name: any) => _thrownClasses.has(name))) {
        for (const name of union) {
          const info = this._throwsClasses.get(name);
          if (info) info.needsNew = true;
        }
      }
    }

    // Pre-scan: collect names used as decorators (so we can suppress C emission for those functions)
    this._decoratorFns = new Map();   // name → FuncDecl AST
    this._decoratorNames = new Set(); // all names used with @
    this._platformSkipped = new Map(); // name → allowed platforms (for error reporting)
    {
      const scanDecs = (decs: any) => { for (const d of (decs ?? [])) this._decoratorNames.add(d.name); };
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
    this._hmCapViolations = new Map(); // varName → { count, cap }
    {
      const _hmDecls = new Map(); // varName → capacityNum
      for (const node of ast.body) {
        const n: any = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'VarDecl' && n.init?.kind === 'New' && n.init.name === 'HashMap') {
          const capLit = n.init.args?.[0]?.expr;
          const capNum = capLit?.litType === 'number' ? parseInt(capLit.value) : 0;
          if (capNum > 0) _hmDecls.set(n.name, { count: 0, cap: capNum });
        }
        if (n?.kind === 'ExprStmt' && n.expr?.kind === 'Call') {
          const callee = n.expr.callee;
          if (callee?.kind === 'Member' && callee.prop === 'set' && callee.object?.kind === 'Ident') {
            const info = _hmDecls.get(callee.object.name);
            if (info) {
              info.count++;
              if (info.count > info.cap && !this._hmCapViolations.has(callee.object.name)) {
                this._hmCapViolations.set(callee.object.name, { count: info.count, cap: info.cap });
              }
            }
          }
        }
      }
    }

    // Pre-scan: collect variable names referenced by top-level functions
    // These must become static globals (accessible from function scope)
    this._funcRefVars = new Set();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if ((n?.kind === 'FuncDecl' || n?.kind === 'ExtensionFunc') && n.body) {
        // Exclude parameter names — they shadow globals and must not trigger promotion
        const localNames = new Set();
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
        const _collect = (nd: any, outerLocals: any) => {
          if (!nd || typeof nd !== 'object') return;
          if (Array.isArray(nd)) { nd.forEach((x: any) => _collect(x, outerLocals)); return; }
          if (nd.kind === 'Ident') {
            if (!outerLocals.has(nd.name)) this._funcRefVars.add(nd.name);
            return;
          }
          // Nested function: collect with its own param scope merged
          if (nd.kind === 'FuncDecl' || nd.kind === 'ArrowFunc') {
            const inner = new Set(outerLocals);
            for (const p of (nd.params ?? [])) {
              if (p?.name) inner.add(p.name);
            }
            if (nd.body) _collect(nd.body, inner);
            return;
          }
          // VarDecl: add declared name to local scope for subsequent siblings
          // (we don't track declaration order here — just collect all idents)
          for (const v of Object.values(nd)) {
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
            const arrowParams = new Set((arrow.params ?? []).map((p: any) => p.name));
            const _collectArrow = (nd: any) => {
              if (!nd || typeof nd !== 'object') return;
              if (Array.isArray(nd)) { nd.forEach(_collectArrow); return; }
              if (nd.kind === 'Ident' && !arrowParams.has(nd.name) && !_signalVarNames.has(nd.name)) {
                this._funcRefVars.add(nd.name);
              }
              for (const v of Object.values(nd)) {
                if (v && typeof v === 'object') _collectArrow(v);
              }
            };
            _collectArrow(arrow.body);
          }
        }
      }
    }

    for (const node of ast.body) {
      try {
        this.visitTopLevel(node);
      } catch (e) {
        if ((e as any)?.isTscError) {
          this._errors.push(e);
          if (this._errors.length >= this._maxErrors) break;
        } else {
          throw e;
        }
      }
    }
    if (this._errors.length > 0) {
      const bag: any = new Error('compilation failed');
      bag.isTscErrorBag = true;
      bag.errors = this._errors;
      throw bag;
    }

    if (this._stackSize != null && this._funcStackInfo.size > 0) {
      const _worstCase = new Map();
      const _visiting = new Set();
      const _computeWorst = (astName: any, path: any) => {
        if (_worstCase.has(astName)) return _worstCase.get(astName);
        const info = this._funcStackInfo.get(astName);
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
      for (const [cname, info] of this._funcStackInfo) {
        if (_checked.has(info.name)) continue;
        _checked.add(info.name);
        const worst = _computeWorst(info.name, []);
        if (worst > this._stackSize) {
          throw this.error(`Warning: Worst-case stack depth (${worst} bytes) exceeds stack_size (${this._stackSize} bytes) in '${info.name}()'`);
        }
      }
    }
  },
};
