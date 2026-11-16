// nested-fns.ts — #295 v2b: nested named `function` declarations.
//
// A FuncDecl that is a direct child of a block desugars to a hoisted closure
// binding plus a shared-cell env allocated at scope entry:
//   - captured primitives live IN the env struct; both the enclosing block
//     and the nested function read/write them through `env->name`
//     (`_closureEnvVar` marker) — mutation is shared, TS-true;
//   - classes/arrays/pointers keep their natural pointer representation in
//     the env (shared by construction);
//   - the closure value is a plain `tsc_closure{env, fn}` riding the ARC env
//     machinery from #290 (retain on copy/return, release at scope exit).
//
// Boundaries (v2b, errors below): no nested functions inside closures; a
// nested function may capture only same-block variables and the enclosing
// function's parameters; captured vars need a type annotation or a literal
// initializer. Wider capture graphs arrive with v2c shared-cell arrows.

import type { CodeGenContext } from '../../codegen.js';
import type { Block, FuncDecl, Param, Stmt, VarDecl } from '@tsclang/ast';

// Env created by an enclosing block with nested functions: nested blocks and
// nested function bodies capture through this env instead of allocating
// their own (`ctx._activeEnv`).
export interface ActiveEnv {
  typeName: string;    // C typedef name of the env struct
  fields: Set<string>; // cell names living in this env
}

const _BUILTIN_IDENTS = new Set(['true','false','null','undefined','this','self',
  'console','Math','Object','Array','String','Number','Boolean','NaN','Infinity']);

// Binding-aware free-name scan: Idents not bound by params or any nested
// declaration. Unlike `_findFreeVars`, no symbol lookup — same-block locals
// that are declared later (after the nested function) are still reported,
// which is exactly the hoisting semantics we implement.
function _collectFreeNames(body: unknown, paramNames: string[], out: Set<string>): void {
  const walk = (n: unknown, localDefs: Set<string>) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x, localDefs); return; }
    const nd = n as Record<string, unknown>;
    if (nd.kind === 'Ident') {
      const nm = nd.name as string;
      if (!paramNames.includes(nm) && !localDefs.has(nm) && !_BUILTIN_IDENTS.has(nm)) out.add(nm);
      return;
    }
    if (nd.kind === 'TemplateLit') return; // raw-source exprs — out of scope for this scan
    const inner = new Set(localDefs);
    if ((nd.kind === 'VarDecl' || nd.kind === 'FuncDecl') && typeof nd.name === 'string') inner.add(nd.name);
    if (nd.kind === 'Arrow' || nd.kind === 'FuncExpr') {
      for (const pp of ((nd.params as { name?: string }[] | null) ?? [])) {
        if (pp.name) inner.add(pp.name);
      }
    }
    for (const key of Object.keys(nd)) {
      if (key === 'kind') continue;
      const child = nd[key];
      if (child && typeof child === 'object') walk(child, inner);
    }
  };
  walk(body, new Set());
}

interface CellInfo { ctype: string; varKind: 'let' | 'const' | 'var'; fromParam: boolean; }

export function preScanNestedFns(ctx: CodeGenContext, block: Block, lines: string[], depth: number): (() => void) | null {
  const fns = block.body.filter((s: Stmt) => s.kind === 'FuncDecl') as FuncDecl[];
  if (fns.length === 0) return null;
  if (ctx._buildingClosureBody) {
    throw ctx.errorCode('E020', fns[0], { detail: 'nested function declarations inside closures are not supported yet (planned for shared-cell closures)' });
  }
  const I = ' '.repeat(ctx.indent * depth);

  // Duplicate names: two `function f` in one block is not a legal overload set here.
  const seen = new Set<string>();
  for (const fn of fns) {
    if (seen.has(fn.name)) {
      throw ctx.errorCode('E123', fn, { detail: `'${fn.name}' is already declared in this scope` });
    }
    seen.add(fn.name);
  }

  // Block-local VarDecls (direct children) and enclosing-function params are
  // eligible cells. Params are visible only when this block IS the function
  // body block (emitFuncBody marks it before calling visitBlock).
  const blockLocals = new Map<string, VarDecl>();
  for (const s of block.body) {
    if (s.kind === 'VarDecl' && s.name) blockLocals.set(s.name, s);
  }
  const fnParams = ctx._fnBodyParamsForCells;
  const isFnBodyBlock = !!fnParams;
  const paramNames = new Set((fnParams ?? []).map((p: Param) => p.name));

  const activeSaved = ctx._activeEnv;
  const newCells = new Map<string, CellInfo>();
  const allFnNames = new Set(fns.map((f: FuncDecl) => f.name));
  const _scopeIndexOf = (name: string): number => {
    for (let i = ctx.scopes.length - 1; i >= 0; i--) {
      if (ctx.scopes[i].has(name)) return i;
    }
    return -1;
  };
  const _resolveCellType = (vd: VarDecl): string => {
    if (vd.typeAnn) return ctx.resolveType(vd.typeAnn);
    if (vd.init?.kind === 'Literal') return ctx.inferType(vd.init);
    throw ctx.errorCode('E020', vd, { detail: `captured variable '${vd.name}' needs a type annotation to be captured by a nested function` });
  };

  for (const fn of fns) {
    const free = new Set<string>();
    _collectFreeNames(fn.body, (fn.params ?? []).map((p: Param) => p.name), free);
    for (const nm of free) {
      if (allFnNames.has(nm)) continue; // sibling/own binding — reconstructed in the body
      if (activeSaved?.fields.has(nm)) continue; // outer cell — the same env covers it
      if (newCells.has(nm)) continue;
      if (blockLocals.has(nm)) {
        const vd = blockLocals.get(nm)!;
        newCells.set(nm, { ctype: _resolveCellType(vd), varKind: vd.varKind ?? 'let', fromParam: false });
        continue;
      }
      if (isFnBodyBlock && paramNames.has(nm)) {
        const p = fnParams!.find((q: Param) => q.name === nm)!;
        if (!p.typeAnn) {
          throw ctx.errorCode('E020', fn, { detail: `captured parameter '${nm}' needs a type annotation to be captured by a nested function` });
        }
        newCells.set(nm, { ctype: ctx.resolveType(p.typeAnn), varKind: 'let', fromParam: true });
        continue;
      }
      const si = _scopeIndexOf(nm);
      if (si === 0) continue; // global — plain reference, no cell
      if (si < 0) continue;   // unresolved (builtin object props etc.) — semantics already reported real errors
      throw ctx.errorCode('E020', fn, { detail: `nested function '${fn.name}' captures '${nm}' declared in an outer block — only same-block variables and function parameters can be captured` });
    }
  }

  // Env: allocated iff any nested fn needs new cells. All fns of the block
  // share one env (uniform binding/reconstruction shape below).
  const n = ctx.closureCount++;
  const _pfx = ctx._modulePrefix ?? '';
  const envName = `${_pfx}_nested_${n}_env`;
  if (newCells.size > 0) {
    const envFields: string[] = ['tsc_env_hdr _hdr;'];
    const stringCells: string[] = [];
    for (const [nm, cell] of newCells) {
      const ct = cell.ctype;
      if (ct === 'String') { envFields.push(`String ${nm};`); stringCells.push(nm); }
      else if (ct.endsWith(' *')) envFields.push(`${ct}${nm};`);
      else envFields.push(`${ct} ${nm};`);
    }
    ctx.addLambda(`typedef struct { ${envFields.join(' ')} } ${envName};`);
    ctx.addLambda('');
    const destroyFn = `${envName}_destroy`;
    ctx.addLambda(`static void ${destroyFn}(void *_env) {`);
    ctx.addLambda(`    ${envName} *env = (${envName} *)_env;`);
    for (const nm of stringCells) ctx.addLambda(`    tsc_string_release(env->${nm});`);
    ctx.addLambda('}');
    ctx.addLambda('');
    // Feed the static env pool estimate (allocator:"static" targets, П1).
    let est = ctx._ptrBytes() * 2;
    for (const [, cell] of newCells) est += ctx._stackSizeOf(cell.ctype);
    ctx._envPoolBytes = (ctx._envPoolBytes ?? 0) + est + 8;

    // Scope-entry allocation. The compound literal zero-fills cells — a
    // hoisted call before the declaration line reads zero (documented TDZ
    // divergence, same policy as promoted globals).
    lines.push(`${I}${envName} *env = tsc_malloc(sizeof(${envName}));`);
    lines.push(`${I}*env = (${envName}){._hdr = {._refcount = 1, ._destroy = ${destroyFn}}};`);
    for (const [nm, cell] of newCells) {
      if (cell.fromParam) lines.push(`${I}env->${nm} = ${nm};`);
    }
    ctx._registerCleanup(`tsc_env_release(env)`);
  }

  // The env this block's nested fns (and their bodies) capture through.
  const envTypeName = newCells.size > 0 ? envName : activeSaved?.typeName ?? null;
  if (newCells.size > 0) {
    ctx._activeEnv = { typeName: envName, fields: new Set(newCells.keys()) };
  }

  // Cell symbols go in BEFORE statements run: reads, writes, and later
  // closures capturing the same var all resolve through the env cell.
  for (const [nm, cell] of newCells) {
    const extra = cell.fromParam ? {} : { varKind: cell.varKind };
    ctx.define(nm, { ctype: cell.ctype, _closureEnvVar: nm, _cellVar: true, ...extra });
  }

  // Bindings (C locals at scope entry — declarations are hoisted) and symbols.
  const fnCNames = new Map<string, string>();
  for (const fn of fns) fnCNames.set(fn.name, `${_pfx}_nested_${ctx.closureCount++}_${fn.name}`);
  const envExpr = envTypeName ? 'env' : 'NULL';
  const retOf = (fn: FuncDecl): string => (fn.returnType ? ctx.resolveType(fn.returnType) : ctx.inferArrowReturn(fn as never));
  for (const fn of fns) {
    lines.push(`${I}tsc_closure ${fn.name} = {.env = ${envExpr}, .fn = (void*)${fnCNames.get(fn.name)}};`);
  }
  for (const fn of fns) {
    const ret = retOf(fn);
    ctx.define(fn.name, {
      ctype: 'tsc_closure', funcPtr: true,
      closureRetType: ret,
      closureParamTypes: (fn.params ?? []).map((p: Param) => (p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t')),
    });
  }

  // Function bodies are built DEFERRED — after the block's statements and
  // cleanup frames are done. Reason: Return lowering flushes the whole
  // _blockCleanupStack; building a nested body while the enclosing block's
  // frame is open would steal its cleanups into the nested C function.
  const _emitBodies = () => {
    // Precompute signatures; mutual/sibling recursion needs forward prototypes
    // (a body referencing a sibling defined later in this block).
    const sigs = new Map<string, { cName: string; proto: string }>();
    let needProtos = false;
    for (const fn of fns) {
      const cName = fnCNames.get(fn.name)!;
      const paramStrs: string[] = [];
      if (envTypeName) paramStrs.push(`${envTypeName} *env`);
      else paramStrs.push('void *_env');
      for (const p of fn.params ?? []) {
        const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t';
        paramStrs.push(ct === 'String *' ? `${ct}${p.name}` : `${ct} ${p.name}`);
      }
      const ret = retOf(fn);
      sigs.set(fn.name, { cName, proto: `static ${ret === 'void' ? 'void' : ret} ${cName}(${paramStrs.join(', ')})` });
      const free = new Set<string>();
      _collectFreeNames(fn.body, (fn.params ?? []).map((p: Param) => p.name), free);
      for (const sib of allFnNames) if (free.has(sib)) needProtos = true;
    }
    if (needProtos) {
      for (const fn of fns) ctx.addLambda(`${sigs.get(fn.name)!.proto};`);
      ctx.addLambda('');
    }
    for (const fn of fns) {
      const sig = sigs.get(fn.name)!;

      // Isolate the cleanup machinery: this body is a separate C function —
      // its Returns must not flush frames of whatever function is being
      // built around the deferred call site.
      const prevCleanupStack = ctx._blockCleanupStack;
      const prevLoopCleanups = ctx._loopBodyCleanups;
      ctx._blockCleanupStack = [{ list: [], set: new Set() }];
      ctx._loopBodyCleanups = null;

      ctx.pushScope();
      // The fn body sees the same env; deeper nested fns capture through it.
      const prevActive = ctx._activeEnv;
      const prevFnParams = ctx._fnBodyParamsForCells;
      if (envTypeName) ctx._activeEnv = { typeName: envTypeName, fields: newCells.size > 0 ? new Set(newCells.keys()) : prevActive!.fields };
      ctx._fnBodyParamsForCells = fn.params ?? [];

      for (const [nm, cell] of newCells) {
        ctx.define(nm, { ctype: cell.ctype, _closureEnvVar: nm });
      }
      // Binding-aware sibling/self detection (names not shadowed in this body).
      const free = new Set<string>();
      _collectFreeNames(fn.body, (fn.params ?? []).map((p: Param) => p.name), free);
      const bodyLines: string[] = [];
      for (const sib of allFnNames) {
        if (!free.has(sib)) continue;
        const sibDecl = fns.find((f: FuncDecl) => f.name === sib)!;
        bodyLines.push(`tsc_closure ${sib} = {.env = ${envExpr}, .fn = (void*)${fnCNames.get(sib)}};`);
        ctx.define(sib, {
          ctype: 'tsc_closure', funcPtr: true,
          closureRetType: retOf(sibDecl),
          closureParamTypes: (sibDecl.params ?? []).map((p: Param) => (p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t')),
        });
      }
      for (const p of fn.params ?? []) {
        const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t';
        const symInfo: Record<string, unknown> = { ctype: ct };
        if (ct === 'String *') { symInfo.isPointer = true; symInfo.isRefParam = true; symInfo.derefType = 'String'; }
        ctx.define(p.name, symInfo as object);
      }
      if (fn.body) ctx.visitBlock(fn.body, bodyLines, 0);
      ctx._fnBodyParamsForCells = prevFnParams;
      ctx._activeEnv = prevActive;
      ctx.popScope();

      ctx._blockCleanupStack = prevCleanupStack;
      ctx._loopBodyCleanups = prevLoopCleanups;

      ctx.addLambda(`${sig.proto} {`);
      for (const l of bodyLines) ctx.addLambda('    ' + l);
      ctx.addLambda('}');
      ctx.addLambda('');
    }
  };
  return _emitBodies;
}
