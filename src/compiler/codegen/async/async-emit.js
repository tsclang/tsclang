// async-emit.js
export default {
  // ─── emitAsyncFunc ────────────────────────────────────────────────────────
  emitAsyncFunc(node) {
    this._initAsync();
    const { name, params, returnType, body } = node;

    // AVR: max 8 async state machines
    if (this._targetName === 'avr') {
      this._asyncCount = (this._asyncCount || 0) + 1;
      if (this._asyncCount > 8) {
        throw this.error(
          `TypeError: Too many concurrent async state machines for AVR target: max 8, got ${this._asyncCount}`
        );
      }
    }

    // throws handling: async fn that throws → _result is Result_T_Err
    const throwsTypes = node.throwsTypes || [];
    const hasThrows = throwsTypes.length > 0;
    const throwsKey = hasThrows ? throwsTypes[0].name : null;

    const innerResultCType = this._asyncRetType(returnType);
    // isVoidReturn: return type is void (no meaningful return value)
    const isVoidReturn = !returnType
      || (returnType?.kind === 'TypeRef' && (returnType.name === 'void' || returnType.name === 'Promise'));
    let resultCType;
    if (hasThrows) {
      const innerIdent = isVoidReturn ? 'void' : this.cTypeToIdent(innerResultCType ?? 'int');
      resultCType = `Result_${innerIdent}_${throwsKey}`;
      // Emit Result typedef only once (deduplicate across functions sharing same Result type)
      if (!this._emittedResultTypes.has(resultCType)) {
        this._emittedResultTypes.add(resultCType);
        const innerDecl = isVoidReturn ? 'int _dummy' : `${innerResultCType} value`;
        this._topBlank();
        this.topLevel.push(`typedef struct { bool ok; union { ${innerDecl}; ${throwsKey} error; }; } ${resultCType};`);
      }
    } else {
      resultCType = innerResultCType;
    }

    const stateType = `${name}_state`;
    const pollFn = `${name}_poll`;

    // Ref<T> across await: check if any Ref param is used (Ref types can't cross await)
    const awaitStatesCount = this._collectAwaitStates(body).length;
    if (awaitStatesCount > 0) {
      for (const p of (params || [])) {
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'Ref') {
          throw this.error(`"Ref<T>" cannot live across "await"; use ".clone()" to make an owned copy`, node);
        }
      }
    }

    // Scan fields and collect sub-state fields (also pre-emits any spawn env/fn)
    const { paramFields, bodyFields, inlined, inlinedTypes, spawnInfos, extraPollParams } = this._scanAsyncBody(params, body);
    const awaitStates = this._collectAwaitStates(body);
    this._preScanTypes = null;

    // Propagate inner return type to body vars assigned from unknown awaits (default int32_t)
    if (innerResultCType && innerResultCType !== 'int32_t') {
      const returnedVars = new Set();
      const scanReturns = (stmts) => {
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
      // Ensure Array_u8 struct is emitted before the state struct that references it
      if (f.ctype === 'Array_u8') this._ensureArrayStruct('Array_u8', 'uint8_t');
    }
    for (const af of awaitStates) {
      if (!af.isUnknown) sFields.push(`${af.stateType} ${af.fieldName}`);
    }

    // Compact if no promoted body vars; multiline if any body vars exist
    const _hasStaticDec = (node.decorators ?? []).some(d => d.name === 'static');
    if (_hasStaticDec || bodyFields.length === 0) {
      this._emitStructCompact(stateType, sFields);
    } else {
      this._emitStructMultiline(stateType, sFields);
    }

    // Register
    this._asyncFuncs.set(name, { stateType, pollFn, resultCType, params });
    this.define(name, {
      ctype: resultCType ?? 'int', funcName: name,
      _isAsync: true, _stateType: stateType, _pollFn: pollFn, params,
    });

    if (!body) return;

    // Check for unknown await targets (no poll function available)
    const canEmitPoll = awaitStates.every(af => !af.isUnknown);
    if (!canEmitPoll) return;

    // Build promoted set
    const promoted = new Set();
    for (const f of paramFields) promoted.add(f.name);
    for (const f of bodyFields) promoted.add(f.name);

    // Build spawn alias map: userVar → threadVar (for await t.join() detection)
    const spawnVarAlias = new Map();
    for (const si of spawnInfos) spawnVarAlias.set(si.userVar, si.threadVar);

    const stringFields = [];
    const classFreeFields = [];
    for (const f of [...paramFields, ...bodyFields]) {
      if (f.ctype === 'String') {
        stringFields.push(f.name);
      } else {
        const cls = this.classes.get(f.ctype);
        if (cls) {
          const sFields2 = this._getStringFields(f.ctype);
          if (sFields2.length > 0) {
            this._ensureClassFree(f.ctype);
            const freeFn = this.classes.get(f.ctype)?._classFreeFn;
            if (freeFn) classFreeFields.push({ name: f.name, freeFn });
          }
        }
      }
    }
    const hasCleanup = stringFields.length > 0 || classFreeFields.length > 0;
    const paramStringFields = stringFields.filter(n => paramFields.some(f => f.name === n));

    this._selfCtx = { promoted, inlined, inlinedTypes, resultCType, hasThrows, throwsKey, spawnInfos, spawnVarAlias, extraPollParams, stringFields, classFreeFields, hasCleanup, paramStringFields };
    this._inAsyncFunc = true;

    const pollLines = this._buildAsyncPoll(body);

    this._inAsyncFunc = false;
    this._selfCtx = null;

    // Extra poll params from spawn free vars
    const extraParamsStr = extraPollParams.length > 0
      ? ', ' + extraPollParams.map(f => `${f.ctype} ${f.name}`).join(', ')
      : '';
    this._emitTopFn(`static void ${pollFn}(${stateType} *self${extraParamsStr})`, pollLines);

    // @static cooperative task: emit static instance, register for main scheduler
    const hasStaticDec = (node.decorators ?? []).some(d => d.name === 'static');
    if (hasStaticDec && this._schedulerName === 'cooperative') {
      this.topLevel.push('');
      this.topLevel.push(`static ${stateType} _${name}_instance;`);
      this._staticTasks.push({ name, stateType, pollFn });
      return;
    }

    // Async main handling
    if (name === 'main') {
      this._asyncMainPollFn = pollFn;
      this._asyncMainStateType = stateType;
      this._asyncMainIsDesktop = (resultCType === null); // Promise<void>
    }
  },

  _buildAsyncPoll(body) {
    const stmts = body?.kind === 'Block' ? body.body : [];
    const lines = [];
    const ctx = { awaitIdx: 0, genIdx: 0, nextCase: 1, loopLabels: [], terminated: false };
    const sc = this._selfCtx;

    lines.push('    switch (self->_state) {');
    lines.push('        case 0:');

    for (const name of sc.paramStringFields) {
      lines.push(`            tsc_string_retain(&self->${name});`);
    }

    this._emitAsyncStmtList(stmts, lines, ctx, '            ');

    // Implicit done at end of function (if not already terminated by explicit return)
    if (!ctx.terminated) {
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
        lines.push(`            tsc_string_release(&self->${name});`);
      }
      for (const { name, freeFn } of sc.classFreeFields) {
        lines.push(`            ${freeFn}(&self->${name});`);
      }
      lines.push('            self->_done = true;');
      lines.push('            return;');
    }

    lines.push('    }');

    return lines;
  },

  _emitAsyncStmtList(stmts, lines, ctx, I) {
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (s?.kind === 'While') {
        this._emitAsyncWhile(s, stmts.slice(i + 1), lines, ctx, I);
        return; // remaining stmts handled inside while emitter
      }
      this._emitAsyncStmt(s, lines, ctx, I);
    }
  },

  _emitAsyncWhile(s, remainingStmts, lines, ctx, I) {
    const loopCase = ctx.nextCase++;
    const condC = this._selfE(s.cond ?? s.test);
    const whileBody = s.body?.kind === 'Block' ? s.body.body : [s.body];

    // Transition to loop condition state
    lines.push(`${I}self->_state = ${loopCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`case_${loopCase}:`);
    lines.push(`        case ${loopCase}:`);

    // Condition check: on failure, inline remaining stmts (common: return x after while)
    if (remainingStmts.length === 0) {
      if (this._selfCtx.hasCleanup) {
        lines.push(`${I}if (!(${condC})) { goto _cleanup; }`);
      } else {
        lines.push(`${I}if (!(${condC})) { self->_done = true; return; }`);
      }
    } else {
      lines.push(`${I}if (!(${condC})) {`);
      const savedTerminated = ctx.terminated;
      ctx.terminated = false;
      for (const rs of remainingStmts) this._emitAsyncStmt(rs, lines, ctx, I + '    ');
      if (!ctx.terminated) {
        if (this._selfCtx.hasCleanup) {
          lines.push(`${I}    goto _cleanup;`);
        } else {
          lines.push(`${I}    self->_done = true;`);
          lines.push(`${I}    return;`);
        }
      }
      ctx.terminated = savedTerminated;
      lines.push(`${I}}`);
    }

    // Loop body
    this._emitAsyncStmtList(whileBody, lines, ctx, I);

    // Loop back
    if (!ctx.terminated) {
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
    }
    ctx.terminated = true;
  },

  // Emit: self->_state = N; /* fall through */ case N:
  _emitAsyncTransition(lines, ctx, I) {
    lines.push(`${I}self->_state = ${ctx.nextCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`        case ${ctx.nextCase}:`);
    ctx.nextCase++;
  },

  // Check for await on a non-async/non-callable expression and throw if found
  _checkAwaitTarget(awaitNode) {
    const expr = awaitNode?.expr;
    if (!expr) return;
    if (expr.kind === 'Ident') {
      // Check inlined consts (they're not async)
      const rawType = this._selfCtx?.inlinedTypes?.get(expr.name);
      if (rawType !== undefined) {
        throw this.error(`"await" can only be applied to Promise<T>, got ${rawType}`, awaitNode);
      }
      const sym = this.lookup(expr.name);
      if (sym && !sym._isAsync && sym.varKind) {
        throw this.error(
          `"await" can only be applied to Promise<T>, got ${sym.ctype ?? 'unknown'}`, awaitNode);
      }
    }
  },
};
