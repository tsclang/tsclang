// generator.js
export default {
  // ─── emitGeneratorFunc ────────────────────────────────────────────────────
  emitGeneratorFunc(node) {
    this._initAsync();
    const { name, params, returnType, body, throwsTypes } = node;

    // Determine yield type
    let yieldType = 'int32_t';
    if (returnType?.kind === 'TypeRef') {
      if (returnType.name === 'Generator') {
        yieldType = this.resolveType(returnType.typeArgs?.[0]) || 'int32_t';
      } else {
        yieldType = this.resolveType(returnType) || 'int32_t';
      }
    }

    const throwsNames = [];
    for (const t of (throwsTypes || [])) {
      if (t.kind === 'TypeRef') throwsNames.push(t.name);
    }
    const hasThrows = throwsNames.length > 0;
    const errKey = hasThrows ? throwsNames[0] : null;
    const resultCt = hasThrows
      ? `Result_${this.cTypeToIdent(yieldType)}_${errKey}` : null;

    const stateType = `${name}_state`;
    const resultType = `${name}_result`;
    const nextFn = `${name}_next`;

    // Scan let vars (promoted to struct)
    const letFields = [];
    const seenLets = new Set();
    const walkLets = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl' && s.varKind === 'let' && !seenLets.has(s.name)) {
          seenLets.add(s.name);
          const ct = s.typeAnn ? this.resolveType(s.typeAnn)
                   : s.init ? (this.inferType(s.init) || 'int32_t') : 'int32_t';
          letFields.push({ name: s.name, ctype: ct });
        }
        if (s.kind === 'Block') walkLets(s.body);
        if (s.kind === 'While') walkLets(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        if (s.kind === 'For') walkLets(s.body?.kind === 'Block' ? s.body.body : [s.body]);
      }
    };
    walkLets(body?.kind === 'Block' ? body.body : []);

    const stringFields = [];
    const classFreeFields = [];
    for (const f of letFields) {
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

    // Emit Result_T_E typedef if needed (before state struct references it)
    if (hasThrows) {
      this._topBlank();
      this.topLevel.push(`typedef struct { bool ok; union { ${yieldType} value; ${errKey} error; }; } ${resultCt};`);
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
    if (!hasThrows) this._topBlank();
    this.topLevel.push(`typedef struct { ${stateFields.join('; ')}; } ${stateType};`);

    // Result struct (compact, no blank before — same block)
    const resValueType = hasThrows ? resultCt : yieldType;
    const resultField = isVoidYield ? 'int _dummy' : `${resValueType} value`;
    this.topLevel.push(`typedef struct { ${resultField}; bool done; } ${resultType};`);

    // Register result struct in class registry for inferType to resolve .value type
    this.classes.set(resultType, {
      isStruct: true,
      fields: isVoidYield
        ? [{ name: '_dummy', ctype: 'int' }, { name: 'done', ctype: 'bool' }]
        : [{ name: 'value', ctype: resValueType }, { name: 'done', ctype: 'bool' }],
    });

    // Register
    this._generatorFuncs.set(name, { stateType, resultType, nextFn, valueType: yieldType, params, letFields });
    this.define(name, {
      ctype: stateType, funcName: name, _isGenerator: true,
      _stateType: stateType, _resultType: resultType, _nextFn: nextFn,
      _valueType: yieldType, params,
    });

    if (!body) return;

    // Build next function signature
    const paramStrs = (params || []).map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return `${ct} ${p.name}`;
    });
    const fnSig = `static ${resultType} ${nextFn}(${stateType} *self${paramStrs.length ? ', ' + paramStrs.join(', ') : ''})`;

    // Set up generator self context (let vars promoted)
    const genPromoted = new Set(letFields.map(f => f.name));
    this._selfCtx = { promoted: genPromoted, inlined: new Map(), stringFields, classFreeFields, hasCleanup };

    const nextLines = this._buildGenNext(body, yieldType, resultType, hasThrows, resultCt);

    this._selfCtx = null;

    this._emitTopFn(fnSig, nextLines);

    // @static / @embedded.singleton generator: emit static instance in BSS
    const _hasStaticDecGen = (node.decorators ?? []).some(d =>
      d.name === 'static' || d.name === 'embedded.singleton');
    if (_hasStaticDecGen) {
      this.topLevel.push('');
      this.topLevel.push(`static ${stateType} _${name}_instance;`);
    }
  },

  _buildGenNext(body, yieldType, resultType, hasThrows, resultCt) {
    const stmts = body?.kind === 'Block' ? body.body : [];
    const lines = [];
    const ctx = { caseNum: 0, loopLabels: [], needTerminal: true };

    const zeroVal = yieldType === 'String' ? '(String){0}'
                  : yieldType === 'bool' ? 'false' : '0';
    const doneRet = hasThrows
      ? `return (${resultType}){(${resultCt}){.ok = false}, true};`
      : `return (${resultType}){${zeroVal}, true};`;

    lines.push('    switch (self->_state) {');
    lines.push('        case 0:');

    this._emitGenStmtList(stmts, lines, ctx, '            ', yieldType, resultType, hasThrows, resultCt, zeroVal);

    if (ctx.needTerminal) {
      if (this._selfCtx?.hasCleanup) {
        lines.push(`            goto _cleanup;`);
      } else {
        lines.push(`            self->_done = true;`);
        lines.push(`            ${doneRet}`);
      }
    }

    if (this._selfCtx?.hasCleanup) {
      lines.push('        _cleanup:');
      for (const name of this._selfCtx.stringFields) {
        lines.push(`            tsc_string_release(self->${name});`);
      }
      for (const { name, freeFn } of this._selfCtx.classFreeFields) {
        lines.push(`            ${freeFn}(&self->${name});`);
      }
      lines.push('            self->_done = true;');
      lines.push(`            ${doneRet}`);
    }

    lines.push('    }');
    lines.push(`    ${doneRet}`);

    return lines;
  },

  _emitGenStmtList(stmts, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal) {
    for (const s of stmts || []) {
      this._emitGenStmt(s, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal);
    }
  },

  _emitGenStmt(s, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal) {
    if (!s) return;

    // Unwrap ExprStmt(Yield(...))
    if (s.kind === 'ExprStmt' && s.expr?.kind === 'Yield') {
      this._emitGenStmt(s.expr, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal);
      return;
    }

    if (s.kind === 'Yield') {
      const val = s.value ? this._selfE(s.value) : zeroVal;
      if (hasThrows) {
        lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
        lines.push(`${I}return (${resultType}){(${resultCt}){.ok = true, .value = ${val}}, false};`);
      } else {
        lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
        lines.push(`${I}return (${resultType}){${val}, false};`);
      }
      ctx.caseNum++;
      lines.push(`        case ${ctx.caseNum}:`);
      ctx.needTerminal = true;
      return;
    }

    if (s.kind === 'While') {
      // case for loop condition (falls through from previous case)
      const loopCase = ctx.caseNum + 1;
      lines.push(`case_${loopCase}:`);
      lines.push(`        case ${loopCase}:`);
      ctx.caseNum = loopCase;
      ctx.needTerminal = false;
      const condC = this._selfE(s.test ?? s.cond);
      const doneRet = hasThrows
        ? `return (${resultType}){(${resultCt}){.ok = false}, true};`
        : `return (${resultType}){${zeroVal}, true};`;
      if (this._selfCtx?.hasCleanup) {
        lines.push(`${I}if (!(${condC})) { goto _cleanup; }`);
      } else {
        lines.push(`${I}if (!(${condC})) { self->_done = true; ${doneRet} }`);
      }

      const whileBody = s.body?.kind === 'Block' ? s.body.body : [s.body];
      let postYieldStmts = [];
      let yieldFound = false;

      for (const ws of whileBody) {
        if (!ws) continue;
        const wsYield = ws.kind === 'Yield' ? ws : (ws.kind === 'ExprStmt' && ws.expr?.kind === 'Yield' ? ws.expr : null);
        if (wsYield) {
          yieldFound = true;
          const val = wsYield.value ? this._selfE(wsYield.value) : zeroVal;
          if (!hasThrows) {
            lines.push(`${I}self->_value = ${val};`);
            lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
            lines.push(`${I}return (${resultType}){self->_value, false};`);
          } else {
            lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
            lines.push(`${I}return (${resultType}){(${resultCt}){.ok = true, .value = ${val}}, false};`);
          }
          ctx.caseNum++;
          lines.push(`        case ${ctx.caseNum}:`);
        } else {
          if (yieldFound) postYieldStmts.push(ws);
          else {
            // pre-yield while body (before first yield)
            this._emitGenRegStmt(ws, lines, I);
          }
        }
      }
      for (const ps of postYieldStmts) this._emitGenRegStmt(ps, lines, I);

      // Loop back
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
      return;
    }

    if (s.kind === 'Return') {
      if (!s.value) {
        if (this._selfCtx?.hasCleanup) {
          lines.push(`${I}goto _cleanup;`);
        } else {
          lines.push(`${I}self->_done = true;`);
          const doneRet = hasThrows
            ? `(${resultType}){(${resultCt}){.ok = false}, true}`
            : `(${resultType}){${zeroVal}, true}`;
          lines.push(`${I}return ${doneRet};`);
        }
      }
      ctx.needTerminal = false;
      return;
    }

    if (s.kind === 'Throw') {
      if (hasThrows) {
        const errC = this._selfE(s.value);
        if (this._selfCtx?.hasCleanup) {
          for (const name of this._selfCtx.stringFields) lines.push(`${I}tsc_string_release(self->${name});`);
          for (const { name, freeFn } of this._selfCtx.classFreeFields) lines.push(`${I}${freeFn}(&self->${name});`);
        }
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return (${resultType}){(${resultCt}){.ok = false, .error = ${errC}}, true};`);
      }
      ctx.needTerminal = false;
      return;
    }

    this._emitGenRegStmt(s, lines, I);
  },

  _emitGenRegStmt(stmt, lines, I) {
    if (!stmt) return;
    if (stmt.kind === 'VarDecl') {
      const { varKind, name, typeAnn, init } = stmt;
      if (varKind === 'let' && this._selfCtx?.promoted.has(name)) {
        if (init) {
          let initC = this._selfE(init);
          const ct = typeAnn ? this.resolveType(typeAnn)
                   : (init ? (this.inferType(init) || null) : null);
          if (initC === '{0}' && ct) initC = `(${ct}){0}`;
          lines.push(`${I}self->${name} = ${initC};`);
          if (this._selfCtx.stringFields.includes(name) &&
              (init.kind === 'Ident' || init.kind === 'Member' || init.kind === 'Index')) {
            lines.push(`${I}tsc_string_retain(self->${name});`);
          }
        }
      } else {
        const ct = typeAnn ? this.resolveType(typeAnn)
                 : init ? (this.inferType(init) || 'int32_t') : 'int32_t';
        const initC = init ? this._selfE(init) : null;
        lines.push(initC ? `${I}${ct} ${name} = ${initC};` : `${I}${ct} ${name};`);
      }
    } else {
      const tmp = [];
      this.visitStmt(stmt, tmp, 0);
      for (const l of tmp) lines.push(I + l.trim());
    }
  },
};
