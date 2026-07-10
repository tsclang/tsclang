import type { FuncDecl, Decorator, Block, Stmt, While, DoWhile, For, ForOf, Expression, TypeRef } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
// async-emit.ts

export interface AsyncEmitCtx {
  awaitIdx: number;
  genIdx: number;
  nextCase: number;
  loopLabels: string[];
  terminated: boolean;
}
interface FieldInfo { name: string; ctype: string; }

  // ─── emitAsyncFunc ────────────────────────────────────────────────────────
export function emitAsyncFunc(ctx: CodeGenContext, node: FuncDecl) {
    ctx._initAsync();
    const { name, params, returnType, body } = node;

    // AVR: max 8 async state machines
    if (ctx._targetName === 'avr') {
      ctx._asyncCount = (ctx._asyncCount || 0) + 1;
      if (ctx._asyncCount > 8) {
        throw ctx.errorCode('E305', null, { detail: `Too many concurrent async state machines for AVR target: max 8, got ${ctx._asyncCount}` });
      }
    }

    // throws handling: async fn that throws → _result is Result_T_Err
    const throwsTypes = node.throwsTypes || [];
    const hasThrows = throwsTypes.length > 0;
    const throwsKey = hasThrows ? ((throwsTypes[0] as TypeRef).name === 'Error' ? 'TscError' : (throwsTypes[0] as TypeRef).name) : null;

    const innerResultCType = ctx._asyncRetType(returnType ?? null);
    // isVoidReturn: return type is void (no meaningful return value)
    const isVoidReturn = !returnType
      || (returnType?.kind === 'TypeRef' && (returnType.name === 'void' || returnType.name === 'Promise'));
    let resultCType;
    if (hasThrows) {
      const innerIdent = isVoidReturn ? 'void' : ctx.cTypeToIdent(innerResultCType ?? 'int');
      resultCType = `Result_${innerIdent}_${throwsKey}`;
      // Emit Result typedef only once (deduplicate across functions sharing same Result type)

      if (!ctx._emittedResultTypes.has(resultCType)) {
        ctx._emittedResultTypes.add(resultCType);
        const innerDecl = isVoidReturn ? 'int _dummy' : `${innerResultCType} value`;
        ctx._topBlank();
        ctx.topLevel.push(`typedef struct { bool ok; union { ${innerDecl}; ${throwsKey} error; }; } ${resultCType};`);
      }
    } else {
      resultCType = innerResultCType;
    }

    const stateType = `${name}_state`;
    const pollFn = `${name}_poll`;

    // Ref<T>/Mut<T> across await: borrow types can't cross await
    const awaitStatesCount = ctx._collectAwaitStates(body).length;
    if (awaitStatesCount > 0) {
      for (const p of (params || [])) {
        if (p.typeAnn?.kind === 'TypeRef' && (p.typeAnn.name === 'Ref' || p.typeAnn.name === 'Mut')) {
          throw ctx.errorCode('E019', node, { name: `${p.typeAnn.name}<T>` });
        }
      }
    }

    // Scan fields and collect sub-state fields (also pre-emits any spawn env/fn)
    const { paramFields, bodyFields, inlined, inlinedTypes, spawnInfos, extraPollParams } = ctx._scanAsyncBody(params, body);
    const awaitStates = ctx._collectAwaitStates(body);
    ctx._preScanTypes = null;

    // Propagate inner return type to body vars assigned from unknown awaits (default int32_t)
    if (innerResultCType && innerResultCType !== 'int32_t') {
      const returnedVars = new Set();
      const scanReturns = (stmts: Stmt[]): void => {
        for (const s of stmts || []) {
          if (s.kind === 'Return' && s.value?.kind === 'Ident') returnedVars.add(s.value.name);
          if (s.kind === 'Block') scanReturns(s.body);
          if (s.kind === 'If') { scanReturns([s.consequent]); if (s.alternate) scanReturns([s.alternate]); }
          if (s.kind === 'TryCatch') scanReturns(s.body?.body || []);
        }
      };
      scanReturns(body?.kind === 'Block' ? body.body : []);
      for (const f of bodyFields) {
        if (f.ctype === 'int32_t' && returnedVars.has(f.name)) f.ctype = innerResultCType;
      }
    }

    // Build struct field strings
    const sFields = ['int32_t _state'];
    if (resultCType !== null) sFields.push(`${resultCType} _result`);
    sFields.push('bool _done');
    for (const f of paramFields) sFields.push(`${f.ctype} ${f.name}`);
    for (const f of bodyFields) {
      sFields.push(`${f.ctype} ${f.name}`);
      if (f.ctype.startsWith('Array_')) {
        const elemIdent = f.ctype.slice(6);
        const etC = ctx._arrIdentToCType(elemIdent);
        ctx._ensureArrayStruct(f.ctype, etC);
      }
    }
    for (const af of awaitStates) {
      if (!af.isUnknown) sFields.push(`${af.stateType} ${af.fieldName}`);
    }

    // Compact if no promoted body vars; multiline if any body vars exist
    const _hasStaticDec = (node.decorators ?? []).some((d: Decorator) => d.name === 'static');
    if (_hasStaticDec || bodyFields.length === 0) {
      ctx._emitStructCompact(stateType, sFields);
    } else {
      ctx._emitStructMultiline(stateType, sFields);
    }

    // Register
    ctx._asyncFuncs.set(name, { stateType, pollFn, resultCType, innerResultCType: innerResultCType ?? undefined, params });
    ctx.define(name, {
      ctype: resultCType ?? 'int', funcName: name,
      _isAsync: true, _stateType: stateType, _pollFn: pollFn, params,
    });

    if (!body) return;

    // Check for unknown await targets (no poll function available)
    const canEmitPoll = awaitStates.every((af: { isUnknown?: boolean }) => !af.isUnknown);
    if (!canEmitPoll) return;

    // Build promoted set
    const promoted = new Set<string>();
    for (const f of paramFields) promoted.add(f.name);
    for (const f of bodyFields) promoted.add(f.name);

    // Build spawn alias map: userVar → threadVar (for await t.join() detection)
    const spawnVarAlias = new Map<string, string>();
    for (const si of spawnInfos) spawnVarAlias.set(si.userVar, si.threadVar);

    const stringFields: string[] = [];
    const classFreeFields: { name: string; freeFn: string }[] = [];
    const arrayFields: { name: string; elemIdent: string }[] = [];
    for (const f of [...paramFields, ...bodyFields]) {
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
    const paramStringFields = stringFields.filter((n: string) => paramFields.some((f: FieldInfo) => f.name === n));

    ctx._selfCtx = { promoted, inlined, inlinedTypes, resultCType, hasThrows, throwsKey, spawnInfos, spawnVarAlias, extraPollParams, stringFields, classFreeFields, arrayFields, hasCleanup, paramStringFields };
    ctx._inAsyncFunc = true;

    const pollLines = ctx._buildAsyncPoll(body);

    ctx._inAsyncFunc = false;
    ctx._selfCtx = null;

    // Extra poll params from spawn free vars
    const extraParamsStr = extraPollParams.length > 0
      ? ', ' + extraPollParams.map((f: FieldInfo) => `${f.ctype} ${f.name}`).join(', ')
      : '';
    ctx._emitTopFn(`static void ${pollFn}(${stateType} *self${extraParamsStr})`, pollLines);

    // @static cooperative task: emit static instance, register for main scheduler
    const hasStaticDec = (node.decorators ?? []).some((d: Decorator) => d.name === 'static');
    if (hasStaticDec && ctx._asyncName === 'state_machine') {
      ctx.topLevel.push('');
      ctx.topLevel.push(`static ${stateType} _${name}_instance;`);

      ctx._staticTasks.push({ name, stateType, pollFn });
      return;
    }

    // Async main handling
    if (name === 'main') {
      ctx._asyncMainPollFn = pollFn;
      ctx._asyncMainStateType = stateType;
      ctx._asyncMainIsDesktop = (resultCType === null); // Promise<void>
    }
}

export function _buildAsyncPoll(ctx: CodeGenContext, body: Block | null) {
    const stmts = body?.kind === 'Block' ? body.body : [];
    const lines: string[] = [];
    const actx: AsyncEmitCtx = { awaitIdx: 0, genIdx: 0, nextCase: 1, loopLabels: [], terminated: false };
    const sc = ctx._selfCtx!;

    lines.push('    switch (self->_state) {');
    lines.push('        case 0:');

    for (const name of (sc.paramStringFields ?? [])) {
      lines.push(`            tsc_string_retain(self->${name});`);
    }

    ctx._emitAsyncStmtList(stmts, lines, actx, '            ');

    // Implicit done at end of function (if not already terminated by explicit return)
    if (!actx.terminated) {
      if (sc.hasCleanup) {
        lines.push('            goto _cleanup;');
      } else {
        lines.push('            self->_done = true;');
        lines.push('            return;');
      }
    }

    if (sc.hasCleanup) {
      lines.push('        _cleanup:');
      for (const name of sc.stringFields) {
        lines.push(`            tsc_string_release(self->${name});`);
      }
      for (const { name, freeFn } of sc.classFreeFields) {
        lines.push(`            ${freeFn}(&self->${name});`);
      }
      for (const { name, elemIdent } of (sc.arrayFields ?? [])) {
        lines.push(`            tsc_array_free_${elemIdent}(&self->${name});`);
      }
      lines.push('            self->_done = true;');
      lines.push('            return;');
    }

    if (ctx._strictRules?.has('switch-default')) {
      lines.push('        default: break;');
    }

    lines.push('    }');

    return lines;
}

export function _emitAsyncStmtList(ctx: CodeGenContext, stmts: Stmt[], lines: string[], actx: AsyncEmitCtx, I: string) {
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (s?.kind === 'While') {
        ctx._emitAsyncWhile(s, stmts.slice(i + 1), lines, actx, I);
        return;
      }
      if (s?.kind === 'DoWhile') {
        ctx._emitAsyncDoWhile(s, stmts.slice(i + 1), lines, actx, I);
        return;
      }
      if (s?.kind === 'For') {
        ctx._emitAsyncFor(s, stmts.slice(i + 1), lines, actx, I);
        return;
      }
      if (s?.kind === 'ForOf' && !s.await) {
        ctx._emitAsyncForOf(s, stmts.slice(i + 1), lines, actx, I);
        return;
      }
      ctx._emitAsyncStmt(s, lines, actx, I);
    }
}

export function _emitAsyncWhile(ctx: CodeGenContext, s: While, remainingStmts: Stmt[], lines: string[], actx: AsyncEmitCtx, I: string) {
    const loopCase = actx.nextCase++;
    const condC = ctx._selfE((s as { cond?: Expression }).cond ?? s.test);
    const whileBody = s.body?.kind === 'Block' ? s.body.body : [s.body];
    const endLabel = `while_${loopCase}_end`;

    lines.push(`${I}self->_state = ${loopCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`case_${loopCase}:`);
    lines.push(`        case ${loopCase}:`);

    lines.push(`${I}if (!(${condC})) { goto ${endLabel}; }`);

    ctx._asyncBreakStack = ctx._asyncBreakStack || [];
    ctx._asyncContinueStack = ctx._asyncContinueStack || [];
    ctx._asyncBreakStack.push(endLabel);
    ctx._asyncContinueStack.push(`case_${loopCase}`);
    const savedTerminated = actx.terminated;
    actx.terminated = false;
    ctx._emitAsyncStmtList(whileBody, lines, actx, I);
    ctx._asyncBreakStack.pop();
    ctx._asyncContinueStack.pop();
    const isNested = ctx._asyncBreakStack?.length > 0;

    if (!actx.terminated) {
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
    }

    lines.push(`${endLabel}:`);
    actx.terminated = false;
    for (const rs of remainingStmts) ctx._emitAsyncStmt(rs, lines, actx, I);
    if (!actx.terminated && !isNested) {
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
    }
    if (!isNested) actx.terminated = true;
}

export function _emitAsyncDoWhile(ctx: CodeGenContext, s: DoWhile, remainingStmts: Stmt[], lines: string[], actx: AsyncEmitCtx, I: string) {
    const loopCase = actx.nextCase++;
    const condC = ctx._selfE((s as { cond?: Expression }).cond ?? s.test);
    const doBody = s.body?.kind === 'Block' ? s.body.body : [s.body];
    const endLabel = `dowhile_${loopCase}_end`;
    const contLabel = `dowhile_${loopCase}_cont`;

    lines.push(`${I}self->_state = ${loopCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`case_${loopCase}:`);
    lines.push(`        case ${loopCase}:`);

    ctx._asyncBreakStack = ctx._asyncBreakStack || [];
    ctx._asyncContinueStack = ctx._asyncContinueStack || [];
    ctx._asyncBreakStack.push(endLabel);
    ctx._asyncContinueStack.push(contLabel);
    const savedTerminated = actx.terminated;
    actx.terminated = false;
    ctx._emitAsyncStmtList(doBody, lines, actx, I);
    ctx._asyncBreakStack.pop();
    ctx._asyncContinueStack.pop();
    const isNested = ctx._asyncBreakStack?.length > 0;

    if (!actx.terminated) {
      lines.push(`${contLabel}:`);
      lines.push(`${I}if (${condC}) {`);
      lines.push(`${I}    self->_state = ${loopCase};`);
      lines.push(`${I}    goto case_${loopCase};`);
      lines.push(`${I}}`);
    }

    lines.push(`${endLabel}:`);
    actx.terminated = false;
    for (const rs of remainingStmts) ctx._emitAsyncStmt(rs, lines, actx, I);
    if (!actx.terminated && !isNested) {
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
    }
    if (!isNested) actx.terminated = true;
}

export function _emitAsyncFor(ctx: CodeGenContext, s: For, remainingStmts: Stmt[], lines: string[], actx: AsyncEmitCtx, I: string) {
    const loopCase = actx.nextCase++;
    const forBody = s.body?.kind === 'Block' ? s.body.body : [s.body];
    const endLabel = `for_${loopCase}_end`;
    const contLabel = `for_${loopCase}_cont`;

    // Emit init before state transition
    if (s.init) {
      if (s.init.kind === 'VarDecl') {
        const { varKind, name, typeAnn, init } = s.init;
        const ct = typeAnn ? ctx.resolveType(typeAnn) : (init ? ctx.inferType(init) : 'int32_t');
        const initC = init ? ctx._selfE(init) : '0';
        lines.push(`${I}${ct} ${name} = ${initC};`);
        ctx.define(name, { ctype: ct, varKind });
      } else if (s.init.kind === 'ExprStmt') {
        lines.push(`${I}${ctx._selfE(s.init.expr)};`);
      }
    }

    // Transition to loop state
    lines.push(`${I}self->_state = ${loopCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`case_${loopCase}:`);
    lines.push(`        case ${loopCase}:`);

    // Condition check
    const testC = s.test ? ctx._selfE(s.test) : null;
    if (testC) {
      lines.push(`${I}if (!(${testC})) { goto ${endLabel}; }`);
    }

    // Push async loop context
    ctx._asyncBreakStack = ctx._asyncBreakStack || [];
    ctx._asyncContinueStack = ctx._asyncContinueStack || [];
    ctx._asyncBreakStack.push(endLabel);
    ctx._asyncContinueStack.push(contLabel);
    const savedTerminated = actx.terminated;
    actx.terminated = false;
    ctx._emitAsyncStmtList(forBody, lines, actx, I);
    ctx._asyncBreakStack.pop();
    ctx._asyncContinueStack.pop();
    const isNested = ctx._asyncBreakStack?.length > 0;

    // Continue target: update + condition + loop-back
    if (!actx.terminated) {
      lines.push(`${contLabel}:`);
      if (s.update) {
        lines.push(`${I}${ctx._selfE(s.update)};`);
      }
      if (testC) {
        lines.push(`${I}if (!(${testC})) { goto ${endLabel}; }`);
      }
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
    }

    // End label + remaining stmts
    lines.push(`${endLabel}:`);
    actx.terminated = false;
    for (const rs of remainingStmts) ctx._emitAsyncStmt(rs, lines, actx, I);
    if (!actx.terminated && !isNested) {
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
    }
    if (!isNested) actx.terminated = true;
}

export function _emitAsyncForOf(ctx: CodeGenContext, s: ForOf, remainingStmts: Stmt[], lines: string[], actx: AsyncEmitCtx, I: string) {
    const loopCase = actx.nextCase++;
    const forBody = s.body?.kind === 'Block' ? s.body.body : [s.body];
    const endLabel = `forof_${loopCase}_end`;
    const contLabel = `forof_${loopCase}_cont`;

    const forOfIdx = ctx._forOfEmitCount ?? 0;
    ctx._forOfEmitCount = forOfIdx + 1;
    const idxName = `_forof_idx_${forOfIdx}`;

    const iterC = ctx._selfE(s.iterable);
    const iterSym = s.iterable?.kind === 'Ident' ? ctx.lookup(s.iterable.name) : null;
    const arrType = iterSym?.ctype;
    let elemType = 'int32_t';
    if (iterSym?.arrElemCType) {
      elemType = iterSym.arrElemCType;
    } else if (arrType?.startsWith('Array_')) {
      elemType = ctx._arrIdentToCType(arrType.slice(6));
    }

    const isPromoted = ctx._selfCtx!.promoted.has(idxName);
    const idxAccess = isPromoted ? `self->${idxName}` : idxName;

    // Init index
    if (isPromoted) {
      lines.push(`${I}self->${idxName} = 0;`);
    } else {
      lines.push(`${I}size_t ${idxName} = 0;`);
    }

    // Transition to loop state
    lines.push(`${I}self->_state = ${loopCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`case_${loopCase}:`);
    lines.push(`        case ${loopCase}:`);

    // Condition check
    lines.push(`${I}if (!(${idxAccess} < ${iterC}.length)) { goto ${endLabel}; }`);

    // Binding
    const qual = s.varKind === 'const' ? 'const ' : '';
    const bindName = (s.binding as { kind: string; name?: string }).kind === 'Ident' ? (s.binding as { name?: string }).name : null;
    if (bindName) {
      const isComplex = !ctx._isSimpleCType(elemType);
      if (isComplex) {
        const ptrQual = s.varKind === 'const' ? 'const ' : '';
        lines.push(`${I}${ptrQual}${elemType} *${bindName} = &${iterC}.data[${idxAccess}];`);
        ctx.define(bindName, { ctype: `${elemType} *`, varKind: s.varKind });
      } else {
        const bindPromoted = ctx._selfCtx!.promoted.has(bindName);
        if (bindPromoted) {
          lines.push(`${I}self->${bindName} = ${iterC}.data[${idxAccess}];`);
        } else {
          lines.push(`${I}${qual}${elemType} ${bindName} = ${iterC}.data[${idxAccess}];`);
        }
        ctx.define(bindName, { ctype: elemType, varKind: s.varKind });
      }
    }

    // Push async loop context
    ctx._asyncBreakStack = ctx._asyncBreakStack || [];
    ctx._asyncContinueStack = ctx._asyncContinueStack || [];
    ctx._asyncBreakStack.push(endLabel);
    ctx._asyncContinueStack.push(contLabel);
    const savedTerminated = actx.terminated;
    actx.terminated = false;
    ctx._emitAsyncStmtList(forBody, lines, actx, I);
    ctx._asyncBreakStack.pop();
    ctx._asyncContinueStack.pop();
    const isNested = ctx._asyncBreakStack?.length > 0;

    // Continue target: increment + condition + loop-back
    if (!actx.terminated) {
      lines.push(`${contLabel}:`);
      if (isPromoted) {
        lines.push(`${I}self->${idxName}++;`);
      } else {
        lines.push(`${I}${idxName}++;`);
      }
      lines.push(`${I}if (!(${idxAccess} < ${iterC}.length)) { goto ${endLabel}; }`);
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
    }

    // End label + remaining stmts
    lines.push(`${endLabel}:`);
    actx.terminated = false;
    for (const rs of remainingStmts) ctx._emitAsyncStmt(rs, lines, actx, I);
    if (!actx.terminated && !isNested) {
      if (ctx._selfCtx!.hasCleanup) {
        lines.push(`${I}goto _cleanup;`);
      } else {
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      }
    }
    if (!isNested) actx.terminated = true;
}

  // Emit: self->_state = N; /* fall through */ case N:
export function _emitAsyncTransition(ctx: CodeGenContext, lines: string[], actx: AsyncEmitCtx, I: string) {
    lines.push(`${I}self->_state = ${actx.nextCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`        case ${actx.nextCase}:`);
    actx.nextCase++;
}

  // Check for await on a non-async/non-callable expression and throw if found
export function _checkAwaitTarget(ctx: CodeGenContext, awaitNode: { expr?: Expression } | null | undefined) {
    const expr = awaitNode?.expr;
    if (!expr) return;
    if (expr.kind === 'Ident') {
      // Check inlined consts (they're not async)
      const rawType = ctx._selfCtx?.inlinedTypes?.get(expr.name);
      if (rawType !== undefined) {
        throw ctx.errorCode('E112', awaitNode, { detail: `"await" can only be applied to Promise<T>, got ${rawType}` });
      }
      const sym = ctx.lookup(expr.name);
      if (sym && !sym._isAsync && sym.varKind) {
        throw ctx.errorCode('E112', awaitNode, { detail: `"await" can only be applied to Promise<T>, got ${sym.ctype ?? 'unknown'}` });
      }
    }
}
