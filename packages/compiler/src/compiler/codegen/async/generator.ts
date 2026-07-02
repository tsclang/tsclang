import type { FuncDecl, Param, Decorator, Stmt, Block, Expression, Yield } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
// generator.ts

interface FieldInfo { name: string; ctype: string; }
export interface GenEmitCtx { caseNum: number; loopLabels: string[]; needTerminal: boolean; }
// Generator statement walkers handle both Stmt and bare Yield (recursed from ExprStmt)
export type GenNode = Stmt | Yield;

  // ─── emitGeneratorFunc ────────────────────────────────────────────────────
export function emitGeneratorFunc(ctx: CodeGenContext, node: FuncDecl) {
    ctx._initAsync();
    const { name, params, returnType, body, throwsTypes } = node;

    // Determine yield type
    let yieldType = 'int32_t';
    if (returnType?.kind === 'TypeRef') {
      if (returnType.name === 'Generator') {
        yieldType = ctx.resolveType(returnType.typeArgs?.[0]) || 'int32_t';
      } else {
        yieldType = ctx.resolveType(returnType) || 'int32_t';
      }
    }

    const throwsNames: string[] = [];
    for (const t of (throwsTypes || [])) {
      if (t.kind === 'TypeRef') throwsNames.push(t.name);
    }
    const hasThrows = throwsNames.length > 0;
    const errKey = hasThrows ? throwsNames[0] : null;
    const resultCt = hasThrows
      ? `Result_${ctx.cTypeToIdent(yieldType)}_${errKey}` : null;

    const stateType = `${name}_state`;
    const resultType = `${name}_result`;
    const nextFn = `${name}_next`;

    // Scan let vars (promoted to struct)
    const letFields: FieldInfo[] = [];
    const seenLets = new Set<string>();
    const walkLets = (stmts: Stmt[]) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl' && s.varKind === 'let' && !seenLets.has(s.name)) {
          seenLets.add(s.name);
          const ct = s.typeAnn ? ctx.resolveType(s.typeAnn)
                   : s.init ? (ctx.inferType(s.init) || 'int32_t') : 'int32_t';
          letFields.push({ name: s.name, ctype: ct });
        }
        if (s.kind === 'Block') walkLets(s.body);
        if (s.kind === 'While') walkLets(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        if (s.kind === 'For') walkLets(s.body?.kind === 'Block' ? s.body.body : [s.body]);
      }
    };
    walkLets(body?.kind === 'Block' ? body.body : []);

    if (letFields.length > 0) {
      const localVarNames = new Set(letFields.map((f: FieldInfo) => f.name));
      const needsPromotion = ctx._genLivenessScan(body, localVarNames);
      const safeLocal = new Set([
        'int32_t', 'int64_t', 'int8_t', 'int16_t',
        'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
        'float', 'double', 'size_t', 'bool', 'int', 'void',
      ]);
      const filtered = letFields.filter((f: FieldInfo) =>
        needsPromotion.has(f.name) || !safeLocal.has(f.ctype)
      );
      if (filtered.length < letFields.length) {
        letFields.length = 0;
        letFields.push(...filtered);
      }
    }

    const stringFields: string[] = [];
    const classFreeFields: { name: string; freeFn: string }[] = [];
    const arrayFields: { name: string; elemIdent: string }[] = [];
    for (const f of letFields) {
      if (f.ctype === 'String') {
        stringFields.push(f.name);
      } else if (f.ctype.startsWith('Array_')) {
        const elemIdent = f.ctype.slice(6);
        const etC = ctx._arrIdentToCType(elemIdent);
        ctx._ensureArrayFreeMacro(elemIdent, f.ctype, etC);
        arrayFields.push({ name: f.name, elemIdent });
      } else {
        const cls = ctx.classes.get(f.ctype);
        if (cls) {
          const sFields2 = ctx._getStringFields(f.ctype);
          if (sFields2.length > 0) {
            ctx._ensureClassFree(f.ctype);
            const freeFn = ctx.classes.get(f.ctype)?._classFreeFn;
            if (freeFn) classFreeFields.push({ name: f.name, freeFn });
          }
        }
      }
    }
    const hasCleanup = stringFields.length > 0 || classFreeFields.length > 0 || arrayFields.length > 0;

    // Emit Result_T_E typedef if needed (before state struct references it)
    if (hasThrows) {
      ctx._topBlank();
      ctx.topLevel.push(`typedef struct { bool ok; union { ${yieldType} value; ${errKey} error; }; } ${resultCt};`);
      // No blank before state struct — keep them together
    }

    // State struct (compact) — no blank before if we just emitted Result_T_E
    const isVoidYield = yieldType === 'void';
    const stateFields = ['int32_t _state'];
    for (const f of letFields) stateFields.push(`${f.ctype} ${f.name}`);
    stateFields.push('bool _done');
    if (hasThrows) {
      stateFields.push(`${resultCt} _result`);
    } else if (!isVoidYield) {
      stateFields.push(`${yieldType} _value`);
    }
    if (!hasThrows) ctx._topBlank();
    ctx.topLevel.push(`typedef struct { ${stateFields.join('; ')}; } ${stateType};`);

    // Result struct (compact, no blank before — same block)
    const resValueType = hasThrows ? resultCt : yieldType;
    const resultField = isVoidYield ? 'int _dummy' : `${resValueType} value`;
    ctx.topLevel.push(`typedef struct { ${resultField}; bool done; } ${resultType};`);

    // Register result struct in class registry for inferType to resolve .value type
    ctx.classes.set(resultType, {
      isStruct: true,
      fields: isVoidYield
        ? [{ name: '_dummy', ctype: 'int' }, { name: 'done', ctype: 'bool' }]
        : [{ name: 'value', ctype: resValueType ?? 'void' }, { name: 'done', ctype: 'bool' }],
    });

    // Register
    ctx._generatorFuncs.set(name, { stateType, resultType, nextFn, valueType: yieldType, params, letFields });
    ctx.define(name, {
      ctype: stateType, funcName: name, _isGenerator: true,
      _stateType: stateType, _resultType: resultType, _nextFn: nextFn,
      _valueType: yieldType, params,
    });

    if (!body) return;

    // Build next function signature
    const paramStrs = (params || []).map((p: Param) => {
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t';
      return `${ct} ${p.name}`;
    });
    const fnSig = `static ${resultType} ${nextFn}(${stateType} *self${paramStrs.length ? ', ' + paramStrs.join(', ') : ''})`;

    // Set up generator self context (let vars promoted)
    const genPromoted = new Set(letFields.map((f: FieldInfo) => f.name));
    ctx._selfCtx = { promoted: genPromoted, inlined: new Map(), stringFields, classFreeFields, hasCleanup };

    const nextLines = ctx._buildGenNext(body, yieldType, resultType, hasThrows, resultCt);

    ctx._selfCtx = null;

    ctx._emitTopFn(fnSig, nextLines);

    // @static generator: emit static instance in BSS
    const _hasStaticDecGen = (node.decorators ?? []).some((d: Decorator) =>
      d.name === 'static');
    if (_hasStaticDecGen) {
      ctx.topLevel.push('');
      ctx.topLevel.push(`static ${stateType} _${name}_instance;`);
    }
}

export function _buildGenNext(ctx: CodeGenContext, body: Block | null, yieldType: string, resultType: string, hasThrows: boolean, resultCt: string | null) {
    const stmts = body?.kind === 'Block' ? body.body : [];
    const lines: string[] = [];
    const gctx: GenEmitCtx = { caseNum: 0, loopLabels: [], needTerminal: true };

    const zeroVal = yieldType === 'String' ? '(String){0}'
                  : yieldType === 'bool' ? 'false' : '0';
    const doneRet = hasThrows
      ? `return (${resultType}){(${resultCt}){.ok = false}, true};`
      : `return (${resultType}){${zeroVal}, true};`;

    lines.push('    switch (self->_state) {');
    lines.push('        case 0:');

    ctx._emitGenStmtList(stmts, lines, gctx, '            ', yieldType, resultType, hasThrows, resultCt, zeroVal);

    if (gctx.needTerminal) {
      if (ctx._selfCtx?.hasCleanup) {
        lines.push(`            goto _cleanup;`);
      } else {
        lines.push(`            self->_done = true;`);
        lines.push(`            ${doneRet}`);
      }
    }

    if (ctx._selfCtx?.hasCleanup) {
      lines.push('        _cleanup:');
      for (const name of ctx._selfCtx.stringFields) {
        lines.push(`            tsc_string_release(self->${name});`);
      }
      for (const { name, freeFn } of ctx._selfCtx.classFreeFields) {
        lines.push(`            ${freeFn}(&self->${name});`);
      }
      lines.push('            self->_done = true;');
      lines.push(`            ${doneRet}`);
    }

    if (ctx._strictRules?.has('switch-default')) {
      lines.push('        default: break;');
    }

    lines.push('    }');
    lines.push(`    ${doneRet}`);

    return lines;
}

export function _emitGenStmtList(ctx: CodeGenContext, stmts: GenNode[], lines: string[], gctx: GenEmitCtx, I: string, yieldType: string, resultType: string, hasThrows: boolean, resultCt: string | null, zeroVal: string) {
    for (const s of stmts || []) {
      ctx._emitGenStmt(s, lines, gctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal);
    }
}

export function _emitGenStmt(ctx: CodeGenContext, s: GenNode, lines: string[], gctx: GenEmitCtx, I: string, yieldType: string, resultType: string, hasThrows: boolean, resultCt: string | null, zeroVal: string) {
    if (!s) return;

    // Unwrap ExprStmt(Yield(...))
    if (s.kind === 'ExprStmt' && s.expr?.kind === 'Yield') {
      ctx._emitGenStmt(s.expr, lines, gctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal);
      return;
    }

    if (s.kind === 'Yield') {
      const val = s.value ? ctx._selfE(s.value) : zeroVal;
      if (hasThrows) {
        lines.push(`${I}self->_state = ${gctx.caseNum + 1};`);
        lines.push(`${I}return (${resultType}){(${resultCt}){.ok = true, .value = ${val}}, false};`);
      } else {
        lines.push(`${I}self->_state = ${gctx.caseNum + 1};`);
        lines.push(`${I}return (${resultType}){${val}, false};`);
      }
      gctx.caseNum++;
      lines.push(`        case ${gctx.caseNum}:`);
      gctx.needTerminal = true;
      return;
    }

    if (s.kind === 'While') {
      // case for loop condition (falls through from previous case)
      const loopCase = gctx.caseNum + 1;
      lines.push(`case_${loopCase}:`);
      lines.push(`        case ${loopCase}:`);
      gctx.caseNum = loopCase;
      gctx.needTerminal = false;
      const condC = ctx._selfE(s.test ?? (s as { cond?: Expression }).cond);
      const doneRet = hasThrows
        ? `return (${resultType}){(${resultCt}){.ok = false}, true};`
        : `return (${resultType}){${zeroVal}, true};`;
      if (ctx._selfCtx?.hasCleanup) {
        lines.push(`${I}if (!(${condC})) { goto _cleanup; }`);
      } else {
        lines.push(`${I}if (!(${condC})) { self->_done = true; ${doneRet} }`);
      }

      const whileBody: GenNode[] = s.body?.kind === 'Block' ? s.body.body : [s.body];
      let postYieldStmts: GenNode[] = [];
      let yieldFound = false;

      for (const ws of whileBody) {
        if (!ws) continue;
        const wsYield = ws.kind === 'Yield' ? ws : (ws.kind === 'ExprStmt' && ws.expr?.kind === 'Yield' ? ws.expr : null);
        if (wsYield) {
          yieldFound = true;
          const val = wsYield.value ? ctx._selfE(wsYield.value) : zeroVal;
          if (!hasThrows) {
            lines.push(`${I}self->_value = ${val};`);
            lines.push(`${I}self->_state = ${gctx.caseNum + 1};`);
            lines.push(`${I}return (${resultType}){self->_value, false};`);
          } else {
            lines.push(`${I}self->_state = ${gctx.caseNum + 1};`);
            lines.push(`${I}return (${resultType}){(${resultCt}){.ok = true, .value = ${val}}, false};`);
          }
          gctx.caseNum++;
          lines.push(`        case ${gctx.caseNum}:`);
        } else {
          if (yieldFound) postYieldStmts.push(ws);
          else {
            // pre-yield while body (before first yield)
            ctx._emitGenRegStmt(ws, lines, I);
          }
        }
      }
      for (const ps of postYieldStmts) ctx._emitGenRegStmt(ps, lines, I);

      // Loop back
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
      return;
    }

    if (s.kind === 'Return') {
      if (!s.value) {
        if (ctx._selfCtx?.hasCleanup) {
          lines.push(`${I}goto _cleanup;`);
        } else {
          lines.push(`${I}self->_done = true;`);
          const doneRet = hasThrows
            ? `(${resultType}){(${resultCt}){.ok = false}, true}`
            : `(${resultType}){${zeroVal}, true}`;
          lines.push(`${I}return ${doneRet};`);
        }
      }
      gctx.needTerminal = false;
      return;
    }

    if (s.kind === 'Throw') {
      if (hasThrows) {
        const errC = ctx._selfE(s.value);
        if (ctx._selfCtx?.hasCleanup) {
          for (const name of ctx._selfCtx.stringFields) lines.push(`${I}tsc_string_release(self->${name});`);
          for (const { name, freeFn } of ctx._selfCtx.classFreeFields) lines.push(`${I}${freeFn}(&self->${name});`);
        }
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return (${resultType}){(${resultCt}){.ok = false, .error = ${errC}}, true};`);
      }
      gctx.needTerminal = false;
      return;
    }

    ctx._emitGenRegStmt(s, lines, I);
}

export function _emitGenRegStmt(ctx: CodeGenContext, stmt: GenNode, lines: string[], I: string) {
    if (!stmt) return;
    if (stmt.kind === 'VarDecl') {
      const { varKind, name, typeAnn, init } = stmt;
      if (varKind === 'let' && ctx._selfCtx?.promoted.has(name)) {
        if (init) {
          let initC = ctx._selfE(init);
          const ct = typeAnn ? ctx.resolveType(typeAnn)
                   : (init ? (ctx.inferType(init) || null) : null);
          if (initC === '{0}' && ct) initC = `(${ct}){0}`;
          lines.push(`${I}self->${name} = ${initC};`);
          if (ctx._selfCtx.stringFields.includes(name) &&
              (init.kind === 'Ident' || init.kind === 'Member' || init.kind === 'Index')) {
            lines.push(`${I}tsc_string_retain(self->${name});`);
          }
        }
      } else {
        const ct = typeAnn ? ctx.resolveType(typeAnn)
                 : init ? (ctx.inferType(init) || 'int32_t') : 'int32_t';
        const initC = init ? ctx._selfE(init) : null;
        lines.push(initC ? `${I}${ct} ${name} = ${initC};` : `${I}${ct} ${name} = {0};`);
      }
    } else {
      const tmp: string[] = [];
      ctx.visitStmt(stmt as Stmt, tmp, 0);
      for (const l of tmp) lines.push(I + l.trim());
    }
}
