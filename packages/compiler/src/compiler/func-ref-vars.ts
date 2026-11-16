// Shared pre-scan: top-level variable names that codegen promotes from
// main-locals to static globals. Promotion happens when the name is referenced
// from a top-level function body (C functions cannot see main locals), from a
// reactive callback (effect/computed/batch arrow arg), or when the file is in
// library mode / has a @static decorator (checked by the callers).
//
// Consumed by codegen/top-level/program.ts (emission) and semantics.ts (W013:
// a promoted variable is a single shared cell — closure mutation is visible
// outside, same as TS — so no snapshot divergence warning applies).
import type { Program } from '@tsclang/ast';

export function collectFuncRefVars(ast: Program): Set<string> {    const funcRefVars = new Set<string>();
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
