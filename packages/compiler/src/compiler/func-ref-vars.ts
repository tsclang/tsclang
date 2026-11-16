// Shared pre-scan: top-level variable names that codegen promotes from
// main-locals to static globals. Promotion happens when the name is referenced
// from a top-level function body (C functions cannot see main locals), from a
// reactive callback (effect/computed/batch arrow arg), or when the file is in
// library mode / has a @static decorator (checked by the callers).
//
// Consumed by codegen/top-level/program.ts (emission) and semantics.ts
// (a promoted variable is a single shared cell — closure mutation is
// visible outside, same as TS).
import type { Program } from '@tsclang/ast';

export function collectFuncRefVars(ast: Program): Set<string> {    const funcRefVars = new Set<string>();
    // Top-level Signal var names — captured by pointer into reactive env
    // structs, never promoted to static globals.
    const _signalVarNames = new Set<string>();
    for (const sn of ast.body) {
      const sd = sn.kind === 'Export' ? sn.decl : sn;
      if (sd?.kind === 'VarDecl' && sd.init?.kind === 'New' && sd.init.name === 'Signal') {
        _signalVarNames.add(sd.name);
      }
    }
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
            if (!outerLocals.has(n.name as string)) funcRefVars.add(n.name as string);
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
            const arrowParams = new Set((arrow.params ?? []).map((p: { name?: string }) => p.name));
            const _collectArrow = (nd: unknown) => {
              if (!nd || typeof nd !== 'object') return;
              if (Array.isArray(nd)) { nd.forEach(_collectArrow); return; }
              const n = nd as Record<string, unknown>;
              if (n.kind === 'Ident' && !arrowParams.has(n.name as string) && !_signalVarNames.has(n.name as string)) {
                funcRefVars.add(n.name as string);
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

    // #298 s2: top-level arrows (any expression position — decl inits, call
    // args, array literals, …) and class methods are readers of top-level
    // variables too. Promote their free names so the s1 capture filter can
    // emit direct global references (TS module-scope semantics). Statement
    // code that runs inside main needs no promotion. Binding-aware: names
    // shadowed by an enclosing block, arrow params, explicit capture lists
    // (`[a: Mut<T>]`, see #292) or fn-body locals never promote; only actual
    // top-level VarDecl names are candidates.
    const _topLevelVarNames = new Set<string>();
    for (const sn of ast.body) {
      const sd = sn.kind === 'Export' ? sn.decl : sn;
      if (sd?.kind === 'VarDecl' && sd.name) _topLevelVarNames.add(sd.name);
      if (sd?.kind === 'VarDecls') for (const d of (sd.decls ?? []) as { name?: string }[]) if (d?.name) _topLevelVarNames.add(d.name);
    }
    const _paramScope = (params: unknown): Set<string> => {
      const out = new Set<string>();
      for (const p of ((params ?? []) as Record<string, unknown>[])) {
        if (p?.name) out.add(p.name as string);
        if (p?.destructObj) for (const k of Object.keys(p.destructObj as object)) out.add(k);
        if (p?.destructArr) for (const s of (p.destructArr as Record<string, unknown>[])) if (s?.name) out.add(s.name as string);
      }
      return out;
    };
    const _captureScope = (nd: Record<string, unknown>, out: Set<string>) => {
      for (const c of (nd.captures as Record<string, unknown>[] | undefined) ?? []) if (c?.name) out.add(c.name as string);
    };
    // Free-name scan inside a function-like body (arrow / method), binding-aware
    // against the arrow's own params/locals/nested scopes. Signal vars are
    // never promotable in any position: the reactive emission captures them
    // by pointer into the env (_capturedSignalMap), not as static globals.
    const _scanFnScope = (body: unknown, locals: Set<string>) => {
      const walk = (nd: unknown, scope: Set<string>) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach((x: unknown) => walk(x, scope)); return; }
        const n = nd as Record<string, unknown>;
        if (n.kind === 'Ident') {
          const nm = n.name as string;
          if (!scope.has(nm) && _topLevelVarNames.has(nm) && !_signalVarNames.has(nm)) funcRefVars.add(nm);
          return;
        }
        if (n.kind === 'TemplateLit') return; // raw-source exprs — opaque to a structural scan
        // Block-scoped statement sequences: declarations shadow later siblings
        if (n.kind === 'Block') {
          const blk = new Set(scope);
          for (const st of (n.body as unknown[] | undefined) ?? []) {
            walk(st, blk);
            const sd = st as Record<string, unknown> | null;
            if ((sd?.kind === 'VarDecl' || sd?.kind === 'FuncDecl') && typeof sd.name === 'string') blk.add(sd.name);
          }
          return;
        }
        // Loop bindings shadow the loop body only
        if (n.kind === 'For' || n.kind === 'ForOf') {
          const loop = new Set(scope);
          const init = (n.init ?? n.binding) as Record<string, unknown> | null | undefined;
          if (init?.kind === 'VarDecl' && typeof init.name === 'string') loop.add(init.name);
          if (n.kind === 'ForOf' && (n.binding as Record<string, unknown> | undefined)?.kind === 'Ident') {
            loop.add((n.binding as { name?: string }).name as string);
          }
          for (const [k, v] of Object.entries(n)) {
            if (k === 'kind' || k === 'init' || k === 'binding') continue;
            if (v && typeof v === 'object') walk(v, loop);
          }
          return;
        }
        const inner = new Set(scope);
        if ((n.kind === 'VarDecl' || n.kind === 'FuncDecl') && typeof n.name === 'string') inner.add(n.name);
        if (n.kind === 'Arrow' || n.kind === 'FuncExpr' || n.kind === 'FuncDecl' || n.kind === 'Method') {
          for (const nm of _paramScope(n.params)) inner.add(nm);
          _captureScope(n, inner);
        }
        for (const v of Object.values(n)) {
          if (v && typeof v === 'object') walk(v, inner);
        }
      };
      walk(body, locals);
    };
    // Statement-tree walk accumulating shadow scopes; arrows become scan roots.
    const _walkStmtTree = (nd: unknown, shadows: Set<string>) => {
      if (!nd || typeof nd !== 'object') return;
      if (Array.isArray(nd)) { nd.forEach((x: unknown) => _walkStmtTree(x, shadows)); return; }
      const n = nd as Record<string, unknown>;
      if (n.kind === 'Arrow' || n.kind === 'FuncExpr') {
        const scope = new Set(shadows);
        for (const nm of _paramScope(n.params)) scope.add(nm);
        _captureScope(n, scope);
        _scanFnScope(n.body, scope);
        return; // nested arrows are scoped by _scanFnScope itself
      }
      // Function and class declarations are covered by the dedicated loops above/below
      if (n.kind === 'FuncDecl' || n.kind === 'ExtensionFunc' || n.kind === 'ClassDecl') return;
      if (n.kind === 'TemplateLit') return;
      // Reactive callback (effect/computed/batch first arg): inlined into a
      // static fn — Signal names stay pointer-captured, never promoted.
      if (n.kind === 'ExprStmt') {
        const e = n.expr as Record<string, unknown> | null | undefined;
        if (e?.kind === 'Call' && (e.callee as Record<string, unknown> | undefined)?.kind === 'Ident'
            && ['effect', 'computed', 'batch'].includes(((e.callee as { name?: string }).name) ?? '')) {
          const a0 = (((e.args as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined)?.expr
            ?? (e.args as unknown[] | undefined)?.[0]) as Record<string, unknown> | undefined;
          if (a0?.kind === 'Arrow' && a0.body) {
            const scope = new Set(shadows);
            for (const nm of _paramScope(a0.params)) scope.add(nm);
            _captureScope(a0, scope);
            _scanFnScope(a0.body, scope);
            return;
          }
        }
      }
      // Block-scoped statement sequences: declarations shadow later siblings
      if (n.kind === 'Block') {
        const blk = new Set(shadows);
        for (const st of (n.body as unknown[] | undefined) ?? []) {
          _walkStmtTree(st, blk);
          const sd = st as Record<string, unknown> | null;
          if ((sd?.kind === 'VarDecl' || sd?.kind === 'FuncDecl') && typeof sd.name === 'string') blk.add(sd.name);
        }
        return;
      }
      // Loop bindings shadow the loop body only (var promotion for loop cells
      // is stage 3 — the binding itself is never a top-level VarDecl)
      if (n.kind === 'For' || n.kind === 'ForOf') {
        const loop = new Set(shadows);
        const init = (n.init ?? n.binding) as Record<string, unknown> | null | undefined;
        if (init?.kind === 'VarDecl' && typeof init.name === 'string') loop.add(init.name);
        if (n.kind === 'ForOf' && (n.binding as Record<string, unknown> | undefined)?.kind === 'Ident') {
          loop.add((n.binding as { name?: string }).name as string);
        }
        for (const [k, v] of Object.entries(n)) {
          if (k === 'kind' || k === 'init' || k === 'binding') continue;
          if (v && typeof v === 'object') _walkStmtTree(v, loop);
        }
        return;
      }
      const inner = new Set(shadows);
      if ((n.kind === 'VarDecl' || n.kind === 'FuncDecl') && typeof n.name === 'string') inner.add(n.name);
      for (const v of Object.values(n)) {
        if (v && typeof v === 'object') _walkStmtTree(v, inner);
      }
    };
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (!n) continue;
      // Class methods are C functions — they cannot see main locals (#298 s2
      // also fixes the pre-existing invalid-C gap where a method referencing
      // a top-level var emitted an undeclared identifier). Field initializers
      // run at the construction site (inside main) and are NOT scanned.
      if (n.kind === 'ClassDecl') {
        for (const m of (n.members ?? []) as unknown as Record<string, unknown>[]) {
          if (m?.kind !== 'Method' || !m.body) continue;
          const scope = new Set(['this']);
          for (const nm of _paramScope(m.params)) scope.add(nm);
          _scanFnScope(m.body, scope);
        }
        continue;
      }
      if (n.kind === 'FuncDecl' || n.kind === 'ExtensionFunc') continue; // dedicated loop above
      _walkStmtTree(n, new Set());
    }
    return funcRefVars;
}

/**
 * Arrow nodes passed as the first argument to a top-level effect/computed/batch
 * call (ExprStmt form). Codegen emits these through a dedicated reactive path:
 * the body is inlined into a static function and non-Signal free variables are
 * promoted to static globals referenced directly — a shared cell, TS semantics.
 * Semantics (W013) uses this to exempt such references from the snapshot-
 * capture divergence warning. Arrows nested deeper inside are NOT exempt: they
 * are ordinary closures that env-capture a snapshot copy like any other arrow.
 */
export function collectReactiveArrows(ast: Program): Set<object> {
    const reactiveArrows = new Set<object>();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'ExprStmt' && n.expr?.kind === 'Call') {
        const callee = n.expr.callee;
        if (callee?.kind === 'Ident' && ['effect', 'computed', 'batch'].includes(callee.name)) {
          const arrow = n.expr.args?.[0]?.expr;
          if (arrow?.kind === 'Arrow') reactiveArrows.add(arrow);
        }
      }
    }
    return reactiveArrows;
}
