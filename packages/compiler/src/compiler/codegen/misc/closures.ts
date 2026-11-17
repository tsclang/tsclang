import type { CodeGenContext } from '../../codegen.js';
import type { TemplateLit, Arrow, FuncExpr, Expression, Param, TypeAnn, Block, SymbolInfo } from '@tsclang/ast';
import type { ActiveEnv } from './nested-fns.js';

interface TemplatePart { kind: string; value?: string; src?: string; }
interface CompiledStrPart { kind: 'str'; value: string; }
interface CompiledExprPart { kind: 'expr'; t: string; c: string; }
type CompiledPart = CompiledStrPart | CompiledExprPart;
interface CaptureInfo { name: string; typeAnn?: TypeAnn | null; }
interface ExplicitCapture { name: string; mode: string; typeAnn: TypeAnn; }

// closures.ts

const SIMPLE_CTYPES = new Set([
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  'float', 'double', 'bool', 'char', 'size_t', 'ptrdiff_t',
  'String', 'void *', 'tsc_unknown',
]);

function _isComplexCtype(ct: string | null | undefined) {
  if (!ct) return false;
  if (SIMPLE_CTYPES.has(ct)) return false;
  if (ct.endsWith(' *')) return false;
  if (ct.startsWith('opt_')) return false;
  return true;
}

export function _templateToC(ctx: CodeGenContext, node: TemplateLit, lines: string[], depth: number) {
    const parts = node.parts as unknown as TemplatePart[]; // [{kind:'str',value:'...'} | {kind:'expr',src:'...'}]
    const hasSubs = parts.some((p: TemplatePart) => p.kind === 'expr');
    if (!hasSubs) {
      // Plain string, no substitutions
      const text = parts.map((p: TemplatePart) => p.value ?? '').join('');
      return `STR_LIT("${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
    }

    // Parse and compile each expression part
    const compiled = parts.map((p: TemplatePart): CompiledPart => {
      if (p.kind === 'str') return { kind: 'str', value: p.value ?? '' };
      // Re-parse the expression source
      const toks = ctx._lex(p.src!, ctx.filename);
      const { ast } = ctx._parse(toks);
      const exprNode = ((ast.body[0] as unknown as { expr?: Expression })?.expr ?? ast.body[0]) as Expression;
      ctx._checkNoBareThrows(exprNode);
      let t = ctx.inferType(exprNode);
      let c = ctx.exprToC(exprNode, lines, depth);
      // TscBlob in template → tsc_blob_to_string
      if (t === 'TscBlob' || (exprNode.kind === 'Ident' && ctx.lookup(exprNode.name)?._isTscBlob)) {
        const n = ctx._blobStrN = (ctx._blobStrN ?? 0); ctx._blobStrN++;
        const tmp = `_blob_str_${n}`;
        const I = ' '.repeat(ctx.indent * depth);
        lines.push(`${I}String ${tmp} = tsc_blob_to_string(&${c});`);
        ctx._pushPostStmtCleanup(`${I}tsc_string_release(${tmp});`);
        t = 'String'; c = tmp;
      }
      return { kind: 'expr', t, c };
    });

    // If all expressions are strings → use tsc_string_concat / tsc_string_concat_n
    const allStrings = compiled.every((p: CompiledPart) => p.kind === 'str' || p.t === 'String' || p.t === 'String *');
    if (allStrings) {
      const pieces: string[] = [];
      for (const p of compiled) {
        if (p.kind === 'str') { if (p.value) pieces.push(`STR_LIT("${p.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`); }
        else if (p.t === 'String *') pieces.push(`(*${p.c})`);
        else pieces.push(p.c);
      }
      if (pieces.length === 0) return 'STR_LIT("")';
      if (pieces.length === 1) return pieces[0];
      if (pieces.length === 2) return `tsc_string_concat(${pieces[0]}, ${pieces[1]})`;
      return `tsc_string_concat_n((String[]){ ${pieces.join(', ')} }, ${pieces.length})`;
    }

    // Mixed types → use tsc_string_format
    let fmt = '';
    const fmtArgs: string[] = [];
    const isEmb = ctx._cap('bits') < 32;
    for (const p of compiled) {
      if (p.kind === 'str') {
        fmt += p.value.replace(/%/g, '%%');
      } else {
        const t = p.t, c = p.c;
        if (t === 'int32_t') { if (isEmb) { fmt += '%ld'; fmtArgs.push(`(long)${c}`); } else { fmt += '%d'; fmtArgs.push(c); } }
        else if (t === 'int16_t' || t === 'int8_t') { fmt += '%d'; fmtArgs.push(c); }
        else if (t === 'uint32_t') { if (isEmb) { fmt += '%lu'; fmtArgs.push(`(unsigned long)${c}`); } else { fmt += '%u'; fmtArgs.push(c); } }
        else if (t === 'uint16_t' || t === 'uint8_t') { fmt += '%u'; fmtArgs.push(c); }
        else if (t === 'int64_t') {
          if (isEmb) { const s = `_tsf_${ctx.tempCount++}`; lines.push(`${' '.repeat(ctx.indent * depth)}String ${s} = tsc_i64_to_string(${c});`); fmt += '%s'; fmtArgs.push(`${s}.data`); }
          else { fmt += '%lld'; fmtArgs.push(`(long long)${c}`); }
        } else if (t === 'uint64_t') {
          if (isEmb) { const s = `_tsf_${ctx.tempCount++}`; lines.push(`${' '.repeat(ctx.indent * depth)}String ${s} = tsc_u64_to_string(${c});`); fmt += '%s'; fmtArgs.push(`${s}.data`); }
          else { fmt += '%llu'; fmtArgs.push(`(unsigned long long)${c}`); }
        }         else if (t === 'double')   { fmt += '%s'; fmtArgs.push(`tsc_dtoa(${c})`); }
        else if (t === 'float')    { fmt += '%s'; fmtArgs.push(`tsc_dtoa((double)${c})`); }
        else if (t === 'd8_t' || t === 'd16_t' || t === 'd32_t' || t === 'd64_t') {
          const decScalesT: Record<string, [number, number]> = { 'd8_t':[100,2], 'd16_t':[100,2], 'd32_t':[10000,4], 'd64_t':[100000000,8] };
          const [sc, dp] = decScalesT[t];
          fmt += '%s'; fmtArgs.push(`tsc_dec_dtoa((int64_t)(${c}), ${sc}, ${dp})`);
        }
        else if (t === 'bool')     { fmt += '%s'; fmtArgs.push(`(${c}) ? "true" : "false"`); }
        else if (t === 'String') {
          if (isEmb) { fmt += '%s'; fmtArgs.push(`_tsc_str_to_ram(${c}).data`); }
          else { fmt += '%.*s'; fmtArgs.push(`(int)${c}.length, ${c}.data`); }
        } else if (t === 'String *') {
          if (isEmb) { fmt += '%s'; fmtArgs.push(`_tsc_str_to_ram(*${c}).data`); }
          else { fmt += '%.*s'; fmtArgs.push(`(int)(*${c}).length, (*${c}).data`); }
        } else                       { fmt += '%d'; fmtArgs.push(c); }
      }
    }
    return `tsc_string_format("${fmt}", ${fmtArgs.join(', ')})`;
}

  // ----------------------------------------------------------------
  // Closure helpers
  // ----------------------------------------------------------------

  // Walk an AST node and collect all Ident references that are free variables
  // (defined in outer scope, not in params or locally defined within the body).
export function _findFreeVars(ctx: CodeGenContext, body: Expression | Block | null, paramNames: string[], selfName: string | null) {
    const params = new Set(paramNames);
    const builtins = new Set(['true','false','null','undefined','this','self','console','Math','Object','Array','String','Number','Boolean','NaN','Infinity']);
    const captured = new Map(); // name → symInfo
    const seen = new Set();

    const walk = (n: unknown, localDefs: Set<string>) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, localDefs)); return; }
      const nd = n as Record<string, unknown>;
      if (nd.kind === 'Ident') {
        const nm = nd.name as string;
        if (selfName && nm === selfName) return;
        if (!params.has(nm) && !localDefs.has(nm) && !builtins.has(nm) && !seen.has(nm)) {
          const sym = ctx.lookup(nm);
          // #298 s1: promoted static globals are NOT captured — the closure
          // body references the file-scope global directly (TS module-scope
          // semantics: one shared cell, no snapshot copy in the env).
          if (sym && !sym._promotedGlobal) { seen.add(nm); captured.set(nm, sym); }
        }
        return;
      }
      if (nd.kind === 'TemplateLit') {
        for (const part of ((nd.parts as unknown[]) ?? [])) {
          const p = part as Record<string, unknown>;
          if (p.kind === 'expr' && p.src) {
            try {
              const toks = ctx._lex(p.src as string, ctx.filename);
              const { ast } = ctx._parse(toks);
      const exprNode = ((ast.body[0] as unknown as { expr?: Expression })?.expr ?? ast.body[0]) as Expression;
              if (exprNode) walk(exprNode, localDefs);
            } catch (_) { /* ignore parse errors in template parts */ }
          }
        }
        return;
      }
      const inner = new Set(localDefs);
      if (nd.kind === 'VarDecl') inner.add(nd.name as string);
      for (const key of Object.keys(nd)) {
        if (key === 'kind') continue;
        const child = nd[key];
        if (child && typeof child === 'object') walk(child, inner);
      }
    };
    walk(body, new Set());
    return captured;
}

  // Generate closure structs and fn for an Arrow, returning closure metadata.
  // Returns null if no captures (use regular hoistArrow).
export function hoistClosure(ctx: CodeGenContext, arrowNode: Arrow | FuncExpr, varName: string | null) {
    // Memoized per node (#298 s3): some call paths evaluate one argument
    // expression twice (array `push` rebuilds the element from a second
    // pass). A second hoist would emit a duplicate env/fn pair and split the
    // declaration/use numbering (env declared as _N, used as _N+1) — reuse
    // the first hoist so both evaluations agree. Entries stored by the
    // hoistArrow memo ({arrowKey, name} shape) are skipped — a node is hoisted
    // through exactly one of the two paths.
    const memoized = ctx._closureMemo.get(arrowNode);
    if (memoized && (memoized as Record<string, unknown>).fnName) return memoized as ReturnType<typeof _hoistClosureImpl>;
    const result = _hoistClosureImpl(ctx, arrowNode, varName);
    if (result) ctx._closureMemo.set(arrowNode, result);
    return result;
}

// #298 s4: field hops from this arrow's env param to the env holding the
// captured cell. The cell's env is located in the active env chain either by
// its C local name (block cells) or as the chain root (cells already behind
// `_outerCell` hops — their path base is the current fn's `env` param).
function _cellPathFor(ctx: CodeGenContext, sym: SymbolInfo): string {
  const hopsTo = (match: (e: ActiveEnv) => boolean): number => {
    let e = ctx._activeEnv;
    let h = 0;
    while (e) { if (match(e)) return h; e = e.parent; h++; }
    return -1;
  };
  const h = sym._outerCell
    ? hopsTo((e) => e.parent === null)
    : hopsTo((e) => e.localName === (sym._closureEnvLocal ?? 'env'));
  const count = h < 0 ? 0 : h; // defensive: unreachable cell — treat as innermost
  return Array.from({ length: count + 1 }, () => '_outer').join('->');
}

function _hoistClosureImpl(ctx: CodeGenContext, arrowNode: Arrow | FuncExpr, varName: string | null) {
    const paramNames = (arrowNode.params ?? []).map((p: Param) => p.name);
    let captured;
    let explicitCaptures: ExplicitCapture[] | null = null;
    if (((arrowNode as Arrow).captures?.length ?? 0) > 0) {
      captured = new Map();
      explicitCaptures = [];
      for (const cap of (arrowNode as Arrow).captures as unknown as CaptureInfo[]) {
        const sym = ctx.lookup(cap.name);
        if (!sym) throw ctx.errorCode('E419', arrowNode, { detail: `Cannot capture '${cap.name}' — not in scope` });
        captured.set(cap.name, sym);
        let mode: string | null = null;
        if (cap.typeAnn?.kind === 'TypeRef') {
          if (cap.typeAnn.name === 'Ref') mode = 'ref';
          else if (cap.typeAnn.name === 'Mut') mode = 'mut';
        }
        if (!mode) throw ctx.errorCode('E020', arrowNode, { detail: `explicit capture '[${cap.name}]' requires a type annotation: Ref<${cap.name}> or Mut<${cap.name}>` });
        explicitCaptures.push({ name: cap.name, mode, typeAnn: cap.typeAnn as TypeAnn });
        if (mode === 'mut') {
          ctx._trackMutQuarantine(sym, varName);
        }
        if (mode === 'ref') {
          ctx._trackRefBorrow(sym);
        }
      }
    } else {
      captured = ctx._findFreeVars(arrowNode.body, paramNames, varName);
    }
    if (captured.size === 0) return null;

    // Materialize deferred anon structs captured by this closure: envInit takes
    // the address of the variable (`&name`), so the C declaration must be
    // emitted before the env allocation at the closure creation site.
    const preLines: string[] = [];
    for (const [nm, sym] of captured) {
      if (!sym.deferredAnon || !ctx._deferredAnons?.has(nm)) continue;
      const { fields, init: _init } = ctx._deferredAnons.get(nm)!;
      const ctype = sym.ctype!;
      const fieldDecls = fields.map((f: { name: string; _ctype: string }) => `${f._ctype} ${f.name};`).join(' ');
      ctx.addTop(`typedef struct { ${fieldDecls} } ${ctype};`);
      ctx.addTop('');
      const initParts = ((_init as unknown as { props?: { key: string; value: Expression }[] } | null)?.props ?? []).map((pr: { key: string; value: Expression }) => `.${pr.key} = ${ctx.exprToC(pr.value, preLines, 0)}`);
      preLines.push(`${ctype} ${nm} = { ${initParts.join(', ')} };`);
      sym.deferredAnon = false;
      ctx._deferredAnons.delete(nm);
    }

    if (ctx._inReturnContext) {
      for (const [nm, sym] of captured) {
        const capInfo = explicitCaptures?.find((c: ExplicitCapture) => c.name === nm);
        const isRefMut = capInfo && (capInfo.mode === 'ref' || capInfo.mode === 'mut');
        const ct = sym.ctype ?? 'void *';
        const isComplexPtr = !capInfo && _isComplexCtype(ct) && !ct.endsWith(' *') && !sym._closureEnvVar;
        if (isRefMut || isComplexPtr) {
          throw ctx.errorCode('E020', arrowNode, { detail: `cannot capture '${nm}' by reference in an escaping closure: the captured value would outlive its stack frame. Use a value capture instead.` });
        }
      }
    }

    // Mark the enclosing function as producing a closure value: consulted at
    // call sites to type the result var as a real closure (vs a plain fn
    // pointer with env = NULL). Any capturing closure created inside counts —
    // the flag is only read where the call result is closure-typed.
    if (ctx._curFuncName) {
      const fnSym = ctx.lookup(ctx._curFuncName);
      if (fnSym) fnSym._returnsCapturingClosure = true;
    }

    const n = ctx.closureCount++;
    const _pfx = ctx._modulePrefix ?? '';
    const closureName = `${_pfx}_closure_${n}`;
    const envName = `${closureName}_env`;
    const fnName = `${closureName}_fn`;

    let ret = arrowNode.returnType ? ctx.resolveType(arrowNode.returnType) : ctx.inferArrowReturn(arrowNode);

    const envFields: string[] = [];
    const capturedStringFields: string[] = [];
    // #295 v2c / #298 s4 shared-cell capture: a captured binding whose
    // storage lives in an env of the enclosing chain — a block cell
    // (`_cellVar` symbol from the block pre-scan) or a cell already reached
    // through `_outer` hops (`_outerCell` symbol, e.g. inside another
    // closure's body) — is NOT copied into this env. The env gets a single
    // `_outer` link to the innermost env in scope and the body reads/writes
    // the cell through the hop chain. TS-true semantics: mutations are
    // shared both ways, across any nesting depth.
    const cellCaptures: string[] = [];
    const isCellCapture = (nm: string, sym?: SymbolInfo | null): boolean => {
      if (explicitCaptures?.some((c: ExplicitCapture) => c.name === nm)) return false;
      return !!(sym?._cellVar || sym?._outerCell);
    };
    let hasOuterLink = false;
    for (const [nm, sym] of captured) {
      if (isCellCapture(nm, sym)) {
        if (!cellCaptures.includes(nm)) cellCaptures.push(nm);
        hasOuterLink = true;
        continue;
      }
      const ct = sym.ctype ?? 'void *';
      const capInfo = explicitCaptures?.find((c: ExplicitCapture) => c.name === nm);
      if (capInfo) {
        if (capInfo.mode === 'ref') {
          const innerCt = ct.endsWith(' *') ? ct.slice(0, -2) : ct;
          envFields.push(`const ${innerCt} *${nm};`);
        } else if (capInfo.mode === 'mut') {
          const innerCt = ct.endsWith(' *') ? ct.slice(0, -2) : ct;
          envFields.push(`${innerCt} *${nm};`);
        } else {
          envFields.push(`${ct} ${nm};`);
          if (ct === 'String') capturedStringFields.push(nm);
        }
      } else {
        if (ct.endsWith(' *')) envFields.push(`${ct.slice(0,-2)} *${nm};`);
        else if (_isComplexCtype(ct)) envFields.push(`${ct} *${nm};`);
        else envFields.push(`${ct} ${nm};`);
        if (ct === 'String') capturedStringFields.push(nm);
      }
    }
    // #298 s4: `_outer` binds the innermost env in C scope at the creation
    // site — an enclosing block env local, or this fn's own `env` param.
    let outerLocal = 'env';
    if (hasOuterLink) {
      const outerEnv = ctx._activeEnv
        ?? (ctx._envParamType ? { typeName: ctx._envParamType, localName: 'env' } : null);
      if (!outerEnv) throw ctx.errorCode('E417', arrowNode, { detail: `internal: cell capture without an active block env for '${cellCaptures[0]}'` });
      outerLocal = outerEnv.localName;
      envFields.push(`${outerEnv.typeName} *_outer;`);
    }
    const hasStringCapture = capturedStringFields.length > 0;
    // Env structs start with the ARC header: copies of the closure retain the
    // env, scope exit releases it, refcount 0 runs the destroy fn (the env
    // block itself is freed by tsc_env_release, not by the destroy fn).
    envFields.unshift('tsc_env_hdr _hdr;');
    // Feed the static env pool default estimate (only consulted on
    // allocator:"static" targets): ARC header + captured fields + slack.
    if (captured.size > 0) {
      let est = ctx._ptrBytes() * 2;  // tsc_env_hdr: refcount + destroy fn
      for (const [, sym] of captured) est += ctx._stackSizeOf(sym.ctype ?? 'void *');
      ctx._envPoolBytes = (ctx._envPoolBytes ?? 0) + est + 8;
    }
    ctx.addLambda(`typedef struct { ${envFields.join(' ')} } ${envName};`);
    ctx.addLambda('');

    const destroyFnName = `${closureName}_destroy`;
    {
      ctx.addLambda(`static void ${destroyFnName}(void *_env) {`);
      ctx.addLambda(`    ${envName} *env = (${envName} *)_env;`);
      for (const nm of capturedStringFields) {
        ctx.addLambda(`    tsc_string_release(env->${nm});`);
      }
      // The `_outer` block env was retained at closure creation — release it
      // when the last copy of this closure dies (ARC, #290 rules).
      if (hasOuterLink) ctx.addLambda(`    tsc_env_release(env->_outer);`);
      ctx.addLambda('}');
      ctx.addLambda('');
    }

    const paramStrs = [`${envName} *env`];
    for (let i = 0; i < (arrowNode.params ?? []).length; i++) {
      const p = arrowNode.params[i];
      const hinted = ctx._lambdaParamHint?.[i];
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : (hinted ?? 'void *');
      paramStrs.push(ct === 'String *' ? `${ct}${p.name}` : `${ct} ${p.name}`);
    }

    ctx.pushScope();
    for (const [nm, sym] of captured) {
      const capInfo = explicitCaptures?.find((c: ExplicitCapture) => c.name === nm);
      if (capInfo && (capInfo.mode === 'ref' || capInfo.mode === 'mut')) {
        const ct = sym.ctype ?? 'void *';
        const innerCt = ct.endsWith(' *') ? ct.slice(0, -2) : ct;
        ctx.define(nm, { ctype: `${innerCt} *`, isPointer: true, derefType: innerCt, _closureEnvVar: nm, _closureEnvLocal: 'env' });
      } else if (isCellCapture(nm, sym)) {
        // Shared cell: reads/writes go through the env-chain hops. The path
        // grows by one `_outer` for the env levels between this arrow and
        // the base of the captured symbol's existing access.
        const path = sym._outerCell
          ? `${_cellPathFor(ctx, sym)}->${sym._cellPath ?? '_outer'}`
          : _cellPathFor(ctx, sym);
        ctx.define(nm, { ctype: sym.ctype ?? 'void *', _outerCell: nm, _cellPath: path });
      } else {
        const ct = sym.ctype ?? 'void *';
        if (_isComplexCtype(ct) && !ct.endsWith(' *')) {
          ctx.define(nm, { ctype: `${ct} *`, isPointer: true, derefType: ct, _closureEnvVar: nm, _closureEnvLocal: 'env', _cellVar: true });
        } else {
          const { _cellVar: _drop, _outerCell: _drop2, _cellPath: _drop3, _closureEnvLocal: _drop4, ...rest } = sym as Record<string, unknown>;
          // A copied field is still shared storage for deeper arrows nesting
          // inside this body (`_cellVar`) — TS-true within the body.
          ctx.define(nm, { ...rest, _closureEnvVar: nm, _closureEnvLocal: 'env', _cellVar: true } as object);
        }
      }
    }
    for (let i = 0; i < (arrowNode.params ?? []).length; i++) {
      const p = arrowNode.params[i];
      const hinted = ctx._lambdaParamHint?.[i];
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : (hinted ?? 'void *');
      const symInfo: Record<string, unknown> = { ctype: ct };
      if (ct === 'String *') {
        symInfo.isPointer = true;
        symInfo.isRefParam = true;
        symInfo.derefType = 'String';
      }
      ctx.define(p.name, symInfo);
    }
    const bodyLines: string[] = [];
    // #295 v2c: isolate the cleanup machinery — the closure body is a separate
    // C function; its Returns must not flush (and consume) the enclosing
    // block's cleanup frames (e.g. the block env release registered by the
    // pre-scan before the statements run).
    const prevCleanupStack = ctx._blockCleanupStack;
    const prevLoopCleanups = ctx._loopBodyCleanups;
    ctx._blockCleanupStack = [{ list: [], set: new Set() }];
    ctx._loopBodyCleanups = null;
    // #298 s4: the body is its own C fn — its `env` param is the root of a
    // fresh env chain. Sub-blocks allocate their own envs (renamed locals)
    // and chain to this one via `_outer`; the pre-block chain is not in C
    // scope here.
    const prevActive = ctx._activeEnv;
    const prevEnvParamType = ctx._envParamType;
    ctx._activeEnv = { typeName: envName, localName: 'env', parent: null, fields: new Set(captured.keys()) };
    ctx._envParamType = envName;
    // #295 v2b boundary: nested named functions inside closures are not
    // supported yet — the pre-scan throws E020 instead of silently miscompiling.
    const _prevBuildingClosure = ctx._buildingClosureBody;
    ctx._buildingClosureBody = true;
    try {
      if (arrowNode.body.kind === 'Block') {
        ctx.visitBlock(arrowNode.body, bodyLines, 0);
      } else {
        const c = ctx.exprToC(arrowNode.body, bodyLines, 0);
        if (ret === 'void') {
          bodyLines.push(`${c};`);
        } else {
          const bodySym = arrowNode.body.kind === 'Ident' ? ctx.lookup(arrowNode.body.name) : null;
          bodyLines.push(`return ${ctx._derefStrPtr(bodySym, c)};`);
        }
      }
    } finally {
      ctx._buildingClosureBody = _prevBuildingClosure;
      ctx._activeEnv = prevActive;
      ctx._envParamType = prevEnvParamType;
      ctx._blockCleanupStack = prevCleanupStack;
      ctx._loopBodyCleanups = prevLoopCleanups;
    }
    ctx.popScope();

    ctx.addLambda(`static ${ret} ${fnName}(${paramStrs.join(', ')}) {`);
    for (const l of bodyLines) ctx.addLambda('    ' + l);
    ctx.addLambda('}');
    ctx.addLambda('');

    const retainLines: string[] = [];
    for (const nm of capturedStringFields) {
      const sym = captured.get(nm);
      const src = sym?._closureEnvVar ? `${sym._closureEnvLocal ?? 'env'}->${nm}` : sym?._outerCell ? `env->${sym._cellPath ?? '_outer'}->${nm}` : nm;
      retainLines.push(`tsc_string_retain(${src});`);
    }
    // The block env outlives this scope as long as the closure lives (ARC).
    if (hasOuterLink) retainLines.push(`tsc_env_retain(${outerLocal});`);
    const initParts: string[] = [];
    for (const [nm, sym] of captured) {
      if (isCellCapture(nm, sym)) continue; // shared cell — via _outer hops, no copy
      const src = sym._closureEnvVar ? `${(sym as SymbolInfo)._closureEnvLocal ?? 'env'}->${nm}` : sym._outerCell ? `env->${sym._cellPath ?? '_outer'}->${nm}` : nm;
      const capInfo = explicitCaptures?.find((c: ExplicitCapture) => c.name === nm);
      if (capInfo && (capInfo.mode === 'ref' || capInfo.mode === 'mut')) {
        if (sym.ctype?.endsWith(' *')) initParts.push(`.${nm} = ${nm}`);
        else initParts.push(`.${nm} = &${nm}`);
        continue;
      }
      const ct = sym.ctype ?? 'void *';
      if (_isComplexCtype(ct) && !sym._closureEnvVar && !sym._outerCell && !ct.endsWith(' *')) {
        initParts.push(`.${nm} = &${nm}`);
        continue;
      }
      initParts.push(`.${nm} = ${src}`);
    }
    if (hasOuterLink) initParts.push(`._outer = ${outerLocal}`);
    const envInit = '{._hdr = {._refcount = 1, ._destroy = ' + destroyFnName + '}' + (initParts.length > 0 ? ', ' + initParts.join(', ') : '') + '}';

    const captureModes = explicitCaptures
      ? new Map(explicitCaptures.map((c: ExplicitCapture) => [c.name, c.mode]))
      : null;

    return { closureName, fnName, envInit, ret, ctype: 'tsc_closure', capturedVars: captured,
             retainLines, preLines, hasStringCapture, destroyFnName, capturedStringFields, envName, captureModes };
}

// Wrap a plain function into a tsc_closure value under the env-forwarding
// call convention: every fn stored in tsc_closure.fn takes `void *env` as
// its first parameter, so a plain function needs a small static adapter.
export function plainFnToClosure(ctx: CodeGenContext, sym: SymbolInfo): string | null {
    const funcName = sym.funcName;
    if (!funcName) return null;
    const cached = ctx._fnAdapters.get(funcName);
    if (cached) return `(tsc_closure){.env = NULL, .fn = (void*)${cached}}`;
    const ret = sym.ctype ?? 'void';
    const paramCts = (sym.params ?? []).map((p: Param) => (p as { typeAnn?: TypeAnn }).typeAnn ? ctx.resolveType((p as { typeAnn: TypeAnn }).typeAnn) : 'int32_t');
    const adName = `_fn_adapter_${ctx._fnAdapters.size}_${funcName}`;
    const paramsC = paramCts.map((ct: string, i: number) => `${ct} _a${i}`).join(', ');
    const argsC = paramCts.map((_ct: string, i: number) => `_a${i}`).join(', ');
    // Prototype early (usable from user functions), body after all user
    // functions — the wrapped function is defined in topLevel
    ctx.addLambda(`static ${ret} ${adName}(void *_env${paramsC ? ', ' + paramsC : ''});`);
    ctx.addLate(`static ${ret} ${adName}(void *_env${paramsC ? ', ' + paramsC : ''}) {`);
    if (ret === 'void') {
        ctx.addLate(`    ${funcName}(${argsC});`);
    } else {
        ctx.addLate(`    return ${funcName}(${argsC});`);
    }
    ctx.addLate('}');
    ctx.addLate('');
    ctx._fnAdapters.set(funcName, adName);
    return `(tsc_closure){.env = NULL, .fn = (void*)${adName}}`;
}

// Wrap an env-signature function (hoisted lambda / closure fn) into a
// plain-convention adapter for C-API callbacks (runtime keeps void(*)(T) etc.)
export function envFnToPlainAdapter(ctx: CodeGenContext, fnName: string, ret: string, paramCts: string[]): string {
    const adName = `${fnName}_adapter`;
    const paramsC = paramCts.map((ct: string, i: number) => `${ct} _p${i}`).join(', ');
    const argsC = paramCts.map((_ct: string, i: number) => `_p${i}`).join(', ');
    ctx.addLambda(`static ${ret} ${adName}(${paramsC || 'void'}) {`);
    if (ret === 'void') {
        ctx.addLambda(`    ${fnName}(((void *)0)${argsC ? ', ' + argsC : ''});`);
    } else {
        ctx.addLambda(`    return ${fnName}(((void *)0)${argsC ? ', ' + argsC : ''});`);
    }
    ctx.addLambda('}');
    ctx.addLambda('');
    return adName;
}

  // Special codegen for iter() method of Iterable<T> class.
  // Generates: ClassName_iter_t struct + ClassName_iter_next + ClassName_iter factory.
  // Returns true if the pattern was recognized and emitted.
