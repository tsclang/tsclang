import type { CodeGenContext } from '../../codegen.js';
import type { TemplateLit, Arrow, FuncExpr, Expression, Param, TypeAnn, Block } from '@tsclang/ast';

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
        } else if (t === 'double')   { fmt += '%s'; fmtArgs.push(`tsc_dtoa(${c})`); }
        else if (t === 'float')    { fmt += '%s'; fmtArgs.push(`tsc_dtoa((double)${c})`); }
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
          if (sym) { seen.add(nm); captured.set(nm, sym); }
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
    const paramNames = (arrowNode.params ?? []).map((p: Param) => p.name);
    let captured;
    let explicitCaptures: ExplicitCapture[] | null = null;
    if (((arrowNode as Arrow).captures?.length ?? 0) > 0) {
      captured = new Map();
      explicitCaptures = [];
      for (const cap of (arrowNode as Arrow).captures as unknown as CaptureInfo[]) {
        const sym = ctx.lookup(cap.name);
        if (!sym) throw ctx.error(`Cannot capture '${cap.name}' — not in scope`, arrowNode);
        captured.set(cap.name, sym);
        let mode: string | null = null;
        if (cap.typeAnn?.kind === 'TypeRef') {
          if (cap.typeAnn.name === 'Ref') mode = 'ref';
          else if (cap.typeAnn.name === 'Mut') mode = 'mut';
        }
        if (!mode) throw ctx.error(`Explicit capture '[${cap.name}]' requires a type annotation: Ref<${cap.name}> or Mut<${cap.name}>`, arrowNode);
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

    if (ctx._inReturnContext && ctx._curFuncName) {
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
    for (const [nm, sym] of captured) {
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
    const hasStringCapture = capturedStringFields.length > 0;
    ctx.addLambda(`typedef struct { ${envFields.join(' ')} } ${envName};`);
    ctx.addLambda('');

    const destroyFnName = `${closureName}_destroy`;
    {
      ctx.addLambda(`static void ${destroyFnName}(void *_env) {`);
      ctx.addLambda(`    ${envName} *env = (${envName} *)_env;`);
      for (const nm of capturedStringFields) {
        ctx.addLambda(`    tsc_string_release(env->${nm});`);
      }
      ctx.addLambda('    free(env);');
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
        ctx.define(nm, { ctype: `${innerCt} *`, isPointer: true, derefType: innerCt, _closureEnvVar: nm });
      } else {
        const ct = sym.ctype ?? 'void *';
        if (_isComplexCtype(ct) && !ct.endsWith(' *')) {
          ctx.define(nm, { ctype: `${ct} *`, isPointer: true, derefType: ct, _closureEnvVar: nm });
        } else {
          ctx.define(nm, { ...sym, _closureEnvVar: nm });
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
    ctx.popScope();

    ctx.addLambda(`static ${ret} ${fnName}(${paramStrs.join(', ')}) {`);
    for (const l of bodyLines) ctx.addLambda('    ' + l);
    ctx.addLambda('}');
    ctx.addLambda('');

    const retainLines: string[] = [];
    for (const nm of capturedStringFields) {
      const sym = captured.get(nm);
      const src = sym?._closureEnvVar ? `env->${nm}` : nm;
      retainLines.push(`tsc_string_retain(${src});`);
    }
    const envInit = '{' + [...captured.entries()].map(([nm, sym]) => {
      const src = sym._closureEnvVar ? `env->${nm}` : nm;
      const capInfo = explicitCaptures?.find((c: ExplicitCapture) => c.name === nm);
      if (capInfo && (capInfo.mode === 'ref' || capInfo.mode === 'mut')) {
        if (sym.ctype?.endsWith(' *')) return `.${nm} = ${nm}`;
        return `.${nm} = &${nm}`;
      }
      const ct = sym.ctype ?? 'void *';
      if (_isComplexCtype(ct) && !sym._closureEnvVar && !ct.endsWith(' *')) {
        return `.${nm} = &${nm}`;
      }
      return `.${nm} = ${src}`;
    }).join(', ') + '}';

    const captureModes = explicitCaptures
      ? new Map(explicitCaptures.map((c: ExplicitCapture) => [c.name, c.mode]))
      : null;

    return { closureName, fnName, envInit, ret, ctype: 'tsc_closure', capturedVars: captured,
             retainLines, hasStringCapture, destroyFnName, capturedStringFields, envName, captureModes };
}

  // Special codegen for iter() method of Iterable<T> class.
  // Generates: ClassName_iter_t struct + ClassName_iter_next + ClassName_iter factory.
  // Returns true if the pattern was recognized and emitted.
