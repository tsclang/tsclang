import type { CodeGenContext } from '../../codegen.js';
import type { Stmt, Expression, Param, Block, FuncDecl, TypeAnn, Arrow } from '@tsclang/ast';

export interface IterMethod { body?: { body?: Stmt[]; stmts?: Stmt[] } | null; }
interface LocalVar { name: string; ctype: string; initC: string; isConst: boolean; }
export interface FreeVar { name: string; ctype: string; }
interface EnvField { ctype: string; name: string; }

// emit-helpers.ts
export function _emitIterableImpl(ctx: CodeGenContext, className: string, iterMethod: IterMethod, elemCType: string) {
    const stmts: Stmt[] = iterMethod.body?.body ?? iterMethod.body?.stmts ?? [];

    // Find pre-return VarDecl stmts and the returned arrow
    const preStmts: Stmt[] = [];
    let returnedArrow: Arrow | null = null;
    for (const s of stmts) {
      if (s.kind === 'Return' && s.value?.kind === 'Arrow') { returnedArrow = s.value; break; }
      preStmts.push(s);
    }
    if (!returnedArrow) return false;

    const elemIdent = ctx.cTypeToIdent(elemCType);
    const iterStructName = `${className}_iter_t`;
    const _isComplex = !ctx._isSimpleCType(elemCType);
    const optType = _isComplex ? `iter_opt_${elemIdent}` : `opt_${elemIdent}`;

    // Ensure opt_T struct is defined
    // Primitive: { bool has_value; T value; } — shared with _ensureOptStruct
    // Complex:   { bool has_value; T *value; } — iterator-specific, separate name
    if (!ctx._emittedOptStructs.has(optType)) {
      ctx._emittedOptStructs.add(optType);
      const valField = _isComplex ? `${elemCType} *value` : `${elemCType} value`;
      ctx.addTop(`typedef struct { bool has_value; ${valField}; } ${optType};`);
      ctx.addTop('');
    }

    // === Process pre-stmts to collect local vars ===
    ctx.pushScope();
    ctx.define('this', { ctype: `${className} *`, _cAlias: '_self', isPointer: true });

    const localVars: LocalVar[] = [];
    const factoryLines: string[] = [];
    for (const s of preStmts) {
      if (s.kind !== 'VarDecl') continue;
      const tmpLines: string[] = [];
      const initC = s.init ? ctx.exprToC(s.init, tmpLines, 1) : '0';
      const ct = s.typeAnn ? ctx.resolveType(s.typeAnn)
                           : (s.init ? ctx.inferType(s.init) : null) ?? 'int32_t';
      const isConst = s.varKind === 'const';
      localVars.push({ name: s.name, ctype: ct, initC, isConst });
      ctx.define(s.name, { ctype: ct, varKind: s.varKind });
      for (const l of tmpLines) factoryLines.push(l);
      factoryLines.push(`    ${isConst ? 'const ' : ''}${ct} ${s.name} = ${initC};`);
    }
    ctx.popScope();

    // === Emit iterator struct ===
    const structFields = localVars.map(v => `${v.ctype} ${v.name};`).join(' ');
    ctx.addTop(`typedef struct { ${structFields} } ${iterStructName};`);
    ctx.addTop('');

    // === Emit next function ===
    ctx.pushScope();
    for (const v of localVars) {
      ctx.define(v.name, { ctype: v.ctype, _cAlias: `_self->${v.name}`, varKind: v.isConst ? 'const' : 'let' });
    }
    ctx._inIterNextBody = true;
    ctx._iterNextElemType = elemCType;
    ctx._iterNextOptType = optType;
    ctx._iterNextIsComplex = _isComplex;

    const nextBodyLines: string[] = [];
    if (returnedArrow.body?.kind === 'Block') {
      ctx.visitBlock(returnedArrow.body, nextBodyLines, 0);
    } else {
      ctx._inReturnContext = true;
      const c = ctx.exprToC(returnedArrow.body, nextBodyLines, 0);
      ctx._inReturnContext = false;
      const retVal = _isComplex ? `&(${c})` : c;
      nextBodyLines.push(`return (${optType}){true, ${retVal}};`);
    }

    ctx._inIterNextBody = false;
    ctx.popScope();

    ctx.addTop(`static ${optType} ${className}_iter_next(${iterStructName} *_self) {`);
    for (const l of nextBodyLines) ctx.addTop('    ' + l);
    ctx.addTop('}');
    ctx.addTop('');

    // === Emit factory function ===
    const returnFields = localVars.map(v => `.${v.name} = ${v.name}`).join(', ');
    ctx.addTop(`static ${iterStructName} ${className}_iter(const ${className} *_self) {`);
    for (const l of factoryLines) ctx.addTop(l);
    ctx.addTop(`    return (${iterStructName}){${returnFields}};`);
    ctx.addTop('}');
    ctx.addTop('');

    // Record that iterable impl was generated (used by ForOf)
    const classInfo = ctx.classes.get(className);
    if (classInfo) classInfo._iterStructName = iterStructName;
    return true;
}

  // Emit `typedef struct {...} Promise_T;` once per type
export function _emitPromiseTypedef(ctx: CodeGenContext, promiseType: string, innerType: string) {

    if (ctx._emittedPromiseTypes.has(promiseType)) return;
    ctx._emittedPromiseTypes.add(promiseType);
    ctx._topBlank();
    ctx.topLevel.push(`typedef struct { bool _done; ${innerType} _result; bool _ok; ${innerType} _error; } ${promiseType};`);
}

  // Emit a spawn block: generate env struct, fn, and call site code
  // Returns the C variable name of the thread handle
export function _emitSpawnBlock(ctx: CodeGenContext, varName: string | null, body: Stmt | Expression, throwsTypes: TypeAnn[] | null, lines: string[], depth: number) {
    if (ctx._strictRules?.has('no-threads')) {
      throw ctx.error('threads are forbidden in strict mode (no-threads)', body);
    }
    // Collect free (captured) vars from body
    const syntheticLambda = { params: [] as Param[], body: (body.kind === 'Block' ? body : { kind: 'Block', body: [body] }) as Block };
    const freeVars = ctx._collectFreeVars(syntheticLambda);

    // Collect variables that are WRITTEN in the spawn body (to detect mutable capture)
    const writtenVars = new Set();
    const findWrites = (stmts: unknown) => {
      for (const s of (Array.isArray(stmts) ? stmts : [])) {
        const nd = s as Record<string, unknown>;
        if (nd.kind === 'ExprStmt' && (nd.expr as Record<string, unknown>)?.kind === 'Assign') {
          const lhs = nd.expr as Record<string, unknown>;
          if (lhs?.kind === 'Ident') writtenVars.add(lhs.name);
          if (lhs?.kind === 'Member') {
            const obj = lhs.object as Record<string, unknown>;
            if (obj?.kind === 'Ident') writtenVars.add(obj.name);
          }
        }
        findWrites((nd.body as Record<string, unknown>)?.body ?? []);
        if (nd.kind === 'If') { findWrites([nd.consequent]); if (nd.alternate) findWrites([nd.alternate]); }
      }
    };
    const bodyStmts = body.kind === 'Block' ? body.body : [body];
    findWrites(bodyStmts);

    // Validate captures
    const _sendSafeTypes = new Set(['int8_t','int16_t','int32_t','int64_t',
      'uint8_t','uint16_t','uint32_t','uint64_t','float','double','bool','size_t','String']);
    const _checkSend = (ctype: string, seen: Set<string> = new Set()): boolean => {
      if (_sendSafeTypes.has(ctype) || ctype.startsWith('Atomic') || ctype.startsWith('Readonly')) return true;
      if (ctype.startsWith('Array_') || ctype.startsWith('TscSet_') || ctype.startsWith('Map_') ||
          ctype.startsWith('TscMap_') || ctype.startsWith('opt_')) return false;
      const cls = ctx.classes.get(ctype);
      if (!cls?.fields) return true;
      if (seen.has(ctype)) return false;
      seen.add(ctype);
      for (const f of cls.fields) {
        const ft = f._ctype || (f.typeAnn ? ctx.resolveType(f.typeAnn) : null);
        if (ft && !_checkSend(ft, seen)) return false;
      }
      return true;
    };
    for (const fv of freeVars) {
      const sym = ctx.lookup(fv.name);
      if (fv.ctype.endsWith(' *') && fv.ctype.includes('const ')) {
        throw ctx.error(`thread closure cannot capture "Ref<T>": not Send`);
      }
      if (sym?.isArc) {
        throw ctx.error(`thread closure cannot capture "Arc<T>": use Atomic<T> for thread-safe shared state`);
      }
      if (sym?._isStaticArray || sym?._isStaticMap) {
        throw ctx.error(`TypeError: Cannot capture @static variable '${fv.name}' in spawn block; use Atomic<T> for thread-safe access`);
      }
      if (writtenVars.has(fv.name) && sym?.varKind === 'let') {
        const classDef = ctx.classes.get(fv.ctype);
        if (classDef?.fields) {
          throw ctx.error(`TypeError: Cannot capture '${fv.ctype}' by move into spawn block; use Arc<${fv.ctype}> for shared ownership across threads`);
        } else {
          throw ctx.error(`TypeError: Cannot capture mutable variable '${fv.name}' by reference in a spawn block; use Arc<T> or Atomic<T>`);
        }
      }
      if (!_checkSend(fv.ctype)) {
        throw ctx.error(`TypeError: Type '${fv.ctype}' is not Send — cannot be safely shared across threads; use Arc<T> or Atomic<T>`);
      }
    }

    const idx = ctx._spawnCount ?? 0;
    ctx._spawnCount = idx + 1;
    const envType = `_spawn_${idx}_env`;
    const fnName = `_spawn_${idx}_fn`;
    const envVar = `_env_${idx}`;
    const threadVar = varName ?? `_t_${idx}`;

    const hasThrows = !!throwsTypes && throwsTypes.length > 0;
    let resultType: string | null = null;
    let throwsTypeName: string | null = null;
    if (hasThrows && throwsTypes) {
      throwsTypeName = (throwsTypes[0] as { name?: string } | undefined)?.name ?? (throwsTypes[0] as unknown as string);
      resultType = `Result_void_${throwsTypeName}`;

      if (throwsTypeName && !ctx._emittedResultErrKeys.has(throwsTypeName)) {
        ctx._emittedResultErrKeys.add(throwsTypeName);
        ctx.addTop(`typedef struct { bool ok; union { int _dummy; ${throwsTypeName} error; }; } ${resultType};`);
        ctx.addTop('');
      }
    }

    // Build env struct fields: [result if throws] + [captured vars]
    const envFields: EnvField[] = [];
    if (hasThrows && resultType) envFields.push({ ctype: resultType, name: 'result' });
    for (const fv of freeVars) envFields.push(fv);

    const fieldDecls = envFields.map(f => `${f.ctype} ${f.name};`).join(' ');
    // Ensure blank line before spawn env typedef only when not following throws-related typedefs
    if (!hasThrows && ctx.typedefs.length > 0 && ctx.typedefs[ctx.typedefs.length - 1] !== '') {
      ctx.typedefs.push('');
    }
    ctx._lastAddedToTypedefs = false; // allow the typedef to go through (not absorbed as companion)
    ctx.addTop(`typedef struct { ${fieldDecls} } ${envType};`);
    ctx.addTop('');

    // Build spawn function
    const fnLines: string[] = [];
    fnLines.push(`static void *${fnName}(void *_arg) {`);
    fnLines.push(`    ${envType} *env = (${envType} *)_arg;`);

    ctx.pushScope();
    for (const fv of freeVars) {
      ctx.define(fv.name, { ctype: fv.ctype, varKind: 'const', _cAlias: `env->${fv.name}` });
    }

    if (hasThrows && throwsTypeName) {
      for (const s of bodyStmts) {
        if (s.kind === 'Throw') {
          const errC = ctx.exprToC(s.value);
          fnLines.push(`    env->result = (${resultType}){.ok = false, .error = ${errC}};`);
        } else {
          const sl: string[] = [];
          ctx.visitStmt(s, sl, 1);
          for (const l of sl) fnLines.push(l);
        }
      }
    } else {
      const bodyLines2: string[] = [];
      ctx.visitBlock(body.kind === 'Block' ? body : { kind: 'Block', body: bodyStmts }, bodyLines2, 1);
      for (const l of bodyLines2) fnLines.push(l);
      fnLines.push(`    free(env);`);
    }

    ctx.popScope();
    fnLines.push(`    return NULL;`);
    fnLines.push(`}`);
    fnLines.push('');
    for (const l of fnLines) ctx.addTop(l);

    // Emit call site: alloc env, init captured fields, spawn thread
    const I2 = ' '.repeat(ctx.indent * depth);
    lines.push(`${I2}${envType} *${envVar} = malloc(sizeof(${envType}));`);
    for (const fv of freeVars) {
      lines.push(`${I2}${envVar}->${fv.name} = ${fv.name};`);
    }
    lines.push(`${I2}tsc_thread_t ${threadVar} = tsc_thread_spawn(${fnName}, ${envVar});`);

    return threadVar;
}

  // Collect free (outer-scope) variables referenced in a lambda body
export function _collectFreeVars(ctx: CodeGenContext, lambda: { params: Param[]; body: Block | Expression | null }) {
    const paramNames = new Set((lambda.params || []).map((p: Param) => p.name));
    const free: FreeVar[] = [];
    const seen = new Set(paramNames);
    const walkE = (e: unknown) => {
      if (!e || typeof e !== 'object') return;
      const nd = e as Record<string, unknown>;
      if (nd.kind === 'Ident' && !seen.has(nd.name as string)) {
        const sym = ctx.lookup(nd.name as string);
        if (sym?.ctype) { seen.add(nd.name as string); free.push({ name: nd.name as string, ctype: sym.ctype }); }
      }
      if (nd.callee) walkE(nd.callee);
      if (nd.object) walkE(nd.object);
      if (nd.left) walkE(nd.left);
      if (nd.right) walkE(nd.right);
      if (nd.test) walkE(nd.test);
      if (nd.args) for (const a of (nd.args as unknown[]) || []) walkE((a as Record<string, unknown>)?.expr);
      if (nd.elems) for (const a of (nd.elems as unknown[]) || []) walkE((a as Record<string, unknown>)?.expr);
      if (nd.props) for (const p of (nd.props as unknown[]) || []) walkE((p as Record<string, unknown>)?.value);
    };
    const walkS = (s: unknown) => {
      if (!s || typeof s !== 'object') return;
      const nd = s as Record<string, unknown>;
      if (nd.kind === 'ExprStmt') walkE(nd.expr);
      if (nd.kind === 'VarDecl') walkE(nd.init);
      if (nd.kind === 'Return') walkE(nd.value);
      if (nd.kind === 'Block') for (const st of ((nd.body as unknown[]) || [])) walkS(st);
      if (nd.kind === 'If') { walkS(nd.consequent); if (nd.alternate) walkS(nd.alternate); }
    };
    if (lambda.body?.kind === 'Block') for (const s of lambda.body.body || []) walkS(s);
    else if (lambda.body) walkE(lambda.body);
    return free;
}

export function _avrSleepModeToC(ctx: CodeGenContext, node: Expression) {
    // SleepMode.Idle → SLEEP_MODE_IDLE, etc.
    if (node.kind === 'Member' && node.object.kind === 'Ident' && node.object.name === 'SleepMode') {
      const map = {
        Idle: 'SLEEP_MODE_IDLE', ADC: 'SLEEP_MODE_ADC',
        PowerDown: 'SLEEP_MODE_PWR_DOWN', PowerSave: 'SLEEP_MODE_PWR_SAVE',
        Standby: 'SLEEP_MODE_STANDBY', ExtStandby: 'SLEEP_MODE_EXT_STANDBY',
      };
      return (map as Record<string, string>)[node.prop] ?? `SLEEP_MODE_${node.prop.toUpperCase()}`;
    }
    return ctx.exprToC(node, [], 0);
}
