export default {
  emitMatchVarDecl(node, lines, depth) {
    const { varKind, name, typeAnn, init } = node;
    const { discriminant, cases, hasParens } = init;
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);

    // Determine discriminant C expression and type
    const discC = this.exprToC(discriminant, lines, depth);
    const discType = this.inferType(discriminant);

    // Determine result type from first arm body
    const resultType = typeAnn
      ? this.resolveType(typeAnn)
      : (cases.length > 0 ? this.inferType(cases[0].body) : 'int32_t');
    const qualifier = (varKind === 'const') ? '' : '';  // match result var is never const
    p(`${resultType} ${name};`);
    this.define(name, { ctype: resultType, varKind: 'let' });

    // Check if discriminant is an enum type
    const enumDef = this.classes.get(discType);
    const isEnum = enumDef?.isEnum && !enumDef?.isConst && !enumDef?.isStringLiteralUnion;

    // For enum discriminants: check exhaustiveness
    if (isEnum) {
      const allValues = (enumDef.members ?? []).map(m => m.name);
      const coveredEnumCases = new Set();
      let hasWild = false;
      for (const c of cases) {
        if (c.pattern.kind === 'MatchWild') hasWild = true;
        if (c.pattern.kind === 'MatchEnum') coveredEnumCases.add(c.pattern.caseName);
      }
      if (!hasWild) {
        const missing = allValues.filter(v => !coveredEnumCases.has(v));
        if (missing.length > 0) {
          throw this.error(`TypeError: Non-exhaustive match on enum '${discType}': missing cases ${missing.map(v => `'${v}'`).join(', ')}`);
        }
      }
    }

    // Emit match as switch (enum, non-parens) or if/else chain
    if (isEnum && !hasParens) {
      // Switch/case form
      p(`switch (${discC}) {`);
      for (const c of cases) {
        const bodyC = this.exprToC(c.body, lines, depth);
        if (c.pattern.kind === 'MatchEnum') {
          p(`    case ${c.pattern.enumName}_${c.pattern.caseName}: ${name} = ${bodyC}; break;`);
        } else if (c.pattern.kind === 'MatchWild') {
          p(`    default: ${name} = ${bodyC}; break;`);
        }
      }
      p('}');
    } else {
      // if/else chain form
      let discUse = discC;
      if (!['Ident', 'Literal'].includes(discriminant.kind)) {
        const discTmp = `_tsc_disc_${this.tempCount++}`;
        p(`${discType} ${discTmp} = ${discC};`);
        discUse = discTmp;
      }
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const isLast = i === cases.length - 1;
        const prefix = i === 0 ? 'if' : 'else if';
        const needsBindings = c.pattern.kind === 'MatchClass' || c.pattern.kind === 'MatchObjLit';

        if (isLast && (c.pattern.kind === 'MatchWild' || (isEnum && c.pattern.kind === 'MatchEnum'))) {
          const bodyC = this.exprToC(c.body, lines, depth);
          p(`else { ${name} = ${bodyC}; }`);
        } else {
          const cond = this._matchPatternCond(c.pattern, discUse, discType, enumDef);
          if (needsBindings) {
            const armLines = [];
            const armI = ' '.repeat(this.indent * (depth + 1));
            this.pushScope();
            const bindings = this._matchPatternBindings(c.pattern, discUse, discType);
            for (const b of bindings) armLines.push(armI + b);
            const bodyC = this.exprToC(c.body, armLines, depth + 1);
            armLines.push(`${armI}${name} = ${bodyC};`);
            this.popScope();
            if (cond === null) {
              p(`else {`);
            } else {
              p(`${prefix} (${cond}) {`);
            }
            lines.push(...armLines);
            p('}');
          } else if (cond === null) {
            const bodyC = this.exprToC(c.body, lines, depth);
            p(`else { ${name} = ${bodyC}; }`);
          } else {
            const bodyC = this.exprToC(c.body, lines, depth);
            p(`${prefix} (${cond}) { ${name} = ${bodyC}; }`);
          }
        }
      }
    }
  },

  // -----------------------------------------------------------------------
  // Result-based TryCatch emission
  // -----------------------------------------------------------------------
  _emitTryCatchResult(node, tryStmts, callStmt, lines, depth) {
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);
    const II = ' '.repeat(this.indent * (depth + 1));

    // Require explicit type annotation in catch clauses
    for (const c of node.catches ?? []) {
      if (c.param && !c.typeAnn) {
        throw this.error(`TypeError: catch clause requires explicit error type`, c);
      }
    }

    // Determine if this is a void ExprStmt call or a VarDecl call
    const isVoidCall = callStmt.kind === 'ExprStmt';
    const callExpr = isVoidCall ? callStmt.expr : callStmt.init;
    const varName = isVoidCall ? null : callStmt.name;
    const varKind = isVoidCall ? null : callStmt.varKind;

    // Get callee symbol for result type info
    const callee = callExpr.callee;
    const calleeSym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
    const resultType = calleeSym?._resultType ?? 'int';
    const isResultVoid = calleeSym?._resultIsVoid ?? true;

    // Emit: ResultType _res_N = call();
    const resName = `_res_${this.tempCount++}`;
    const callC = this.exprToC(callExpr, lines, depth);
    p(`${resultType} ${resName} = ${callC};`);

    const catches = node.catches ?? [];
    const isUnionError = (calleeSym?._resultErrTypes?.length ?? 0) > 1;

    if (isVoidCall || isResultVoid) {
      // Simple: if (!ok) { catch }
      p(`if (!${resName}.ok) {`);
      this._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
      p('}');
    } else {
      // Non-void: value is used; check if there are subsequent statements
      const callIdx = tryStmts.indexOf(callStmt);
      const restStmts = tryStmts.slice(callIdx + 1);
      if (restStmts.length === 0) {
        // No rest stmts: if (!ok) { catch }
        p(`if (!${resName}.ok) {`);
        this._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
        p('}');
      } else {
        // Rest stmts: if (ok) { var = value; rest... } else { catch }
        p(`if (${resName}.ok) {`);
        const valType = calleeSym?._resultValueType ?? 'int32_t';
        const qualifier = (varKind === 'const' && valType !== 'String') ? 'const ' : '';
        lines.push(`${II}${qualifier}${valType} ${varName} = ${resName}.value;`);
        this.pushScope();
        this.define(varName, { ctype: valType, varKind });
        for (const s of restStmts) this.visitStmt(s, lines, depth + 1);
        this.popScope();
        p('} else {');
        this._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
        p('}');
      }
    }

    // Finally block (always emitted, never inside if)
    if (node.finally) {
      this._inFinallyBlock = true;
      this.visitBlock(node.finally, lines, depth);
      this._inFinallyBlock = false;
    }
  },

  _emitCatchBodies(catches, resName, calleeSym, lines, depth) {
    const I = ' '.repeat(this.indent * depth);
    const II = ' '.repeat(this.indent * (depth + 1));
    const isUnion = (calleeSym?._resultErrTypes?.length ?? 0) > 1;

    if (catches.length === 0) return;

    if (catches.length === 1) {
      const c = catches[0];
      // Union catch clause: catch (e: ErrA | ErrB) — no binding, just body
      const isUnionCatch = c.typeAnn?.kind === 'TypeUnion';
      if (isUnionCatch) {
        this.pushScope();
        this.visitBlock(c.body, lines, depth);
        this.popScope();
      } else {
        const errClass = c.typeAnn?.name ?? 'void';
        const errExpr = isUnion
          ? `${resName}.error._${calleeSym?._resultErrTypes?.indexOf(errClass) ?? 0}`
          : `${resName}.error`;
        lines.push(`${I}${errClass} ${c.param} = ${errExpr};`);
        // Suppress unused-variable warning if param not referenced in body
        const bodyStr = JSON.stringify(c.body);
        if (!bodyStr.includes(`"name":"${c.param}"`)) lines.push(`${I}(void)${c.param};`);
        this.pushScope();
        this.define(c.param, { ctype: errClass });
        this.visitBlock(c.body, lines, depth);
        this.popScope();
      }
    } else {
      // Multiple catch clauses → union tag dispatch (if/else if chain)
      for (let i = 0; i < catches.length; i++) {
        const c = catches[i];
        const errClass = c.typeAnn?.name ?? 'void';
        if (i === 0) {
          lines.push(`${I}if (${resName}.error.tag == _Err_${errClass}) {`);
        } else {
          lines.push(`${I}} else if (${resName}.error.tag == _Err_${errClass}) {`);
        }
        lines.push(`${II}${errClass} ${c.param} = ${resName}.error._${i};`);
        this.pushScope();
        this.define(c.param, { ctype: errClass });
        this.visitBlock(c.body, lines, depth + 1);
        this.popScope();
      }
      lines.push(`${I}}`);
    }
  },

  // -----------------------------------------------------------------------
  // Propagate/NonNull VarDecl: const x = throwsFunc()?  or  !
  // -----------------------------------------------------------------------
  emitPropagateVarDecl(node, lines, depth) {
    const { varKind, name, typeAnn, init } = node;
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);

    const isProp = init.kind === 'Propagate';
    const innerExpr = init.expr; // the inner Call (or other) expression

    // Get callee symbol
    const callee = innerExpr?.callee;
    const calleeSym = (callee?.kind === 'Ident') ? this.lookup(callee.name) : null;

    if (!calleeSym?._isThrowsFunc) {
      if (isProp) {
        const calleeName = callee?.kind === 'Ident' ? callee.name : '?';
        throw this.error(`TypeError: Cannot use '?' on '${calleeName}()': function does not throw`);
      }
      // NonNull on non-throws: just emit normally
      const c = this.exprToC(innerExpr, lines, depth);
      const ctype = typeAnn ? this.resolveType(typeAnn) : this.inferType(innerExpr);
      const qualifier = (varKind === 'const' && ctype !== 'String') ? 'const ' : '';
      p(`${qualifier}${ctype} ${name} = ${c};`);
      this.define(name, { ctype, varKind });
      return;
    }

    // Throws function: emit Result-based propagation
    const resultType = calleeSym._resultType;
    const resName = `_res_${this.tempCount++}`;
    const callC = this.exprToC(innerExpr, lines, depth);
    p(`${resultType} ${resName} = ${callC};`);

    if (this._throwsCtx) {
      if (this._usesGotoCleanup) {
        const _hasBlock = this._hasPendingCleanups();
        if (_hasBlock) {
          p(`if (!${resName}.ok) {`);
          this._emitFuncCleanup(lines, I + ' '.repeat(this.indent));
          p(`    _result = (${this._throwsCtx.resultType}){.ok = false, .error = ${resName}.error};`);
          p(`    goto cleanup;`);
          p(`}`);
        } else {
          p(`if (!${resName}.ok) { _result = (${this._throwsCtx.resultType}){.ok = false, .error = ${resName}.error}; goto cleanup; }`);
        }
      } else if (this._hasPendingCleanups()) {
        p(`if (!${resName}.ok) {`);
        this._emitFuncCleanup(lines, I + ' '.repeat(this.indent));
        p(`    return (${this._throwsCtx.resultType}){.ok = false, .error = ${resName}.error};`);
        p(`}`);
      } else {
        p(`if (!${resName}.ok) { return (${this._throwsCtx.resultType}){.ok = false, .error = ${resName}.error}; }`);
      }
    } else {
      // Outside throws function: panic on error (!), error on ? (already caught above)
      p(`if (!${resName}.ok) { tsc_panic(${resName}.error._base.message); }`);
    }

    // Bind the value
    const valueType = calleeSym._resultValueType ?? 'int32_t';
    const qualifier = (varKind === 'const' && valueType !== 'String') ? 'const ' : '';
    p(`${qualifier}${valueType} ${name} = ${resName}.value;`);
    this.define(name, { ctype: valueType, varKind });
  },

  // Generate field binding declarations for patterns that destructure (MatchClass, MatchObjLit)
  // Returns array of C declaration strings, or empty array if no bindings needed
  _matchPatternBindings(pattern, discC, discType) {
    if (pattern.kind === 'MatchClass') {
      const fields = pattern.fields ?? [];
      if (fields.length === 0) return [];
      const className = pattern.className;
      const ifaceDef = this.interfaces?.get(discType) ?? null;
      const classDef = this.classes.get(className);
      return fields.map(f => {
        const fieldDef = classDef?.fields?.find(fd => fd.name === f);
        const ctype = fieldDef?.ctype ?? (fieldDef?.typeAnn ? this.resolveType(fieldDef.typeAnn) : 'int32_t');
        const access = ifaceDef
          ? `((${className}*)${discC}.self)->${f}`
          : `${discC}.${f}`;
        this.define(f, { ctype, varKind: 'const' });
        return `${ctype} ${f} = ${access};`;
      });
    }
    if (pattern.kind === 'MatchObjLit') {
      const fields = pattern.fields ?? [];
      if (fields.length === 0) return [];
      const structDef = this.classes.get(discType);
      return fields.map(f => {
        const fieldDef = structDef?.fields?.find(fd => fd.name === f);
        const ctype = fieldDef?.ctype ?? (fieldDef?.typeAnn ? this.resolveType(fieldDef.typeAnn) : 'int32_t');
        const access = `${discC}.${f}`;
        this.define(f, { ctype, varKind: 'const' });
        return `${ctype} ${f} = ${access};`;
      });
    }
    return [];
  },

  // Generate a C condition expression for a match pattern
  _matchPatternCond(pattern, discC, discType, enumDef) {
    switch (pattern.kind) {
      case 'MatchWild': return null; // becomes else
      case 'MatchNull': return `!${discC}.has_value`;
      case 'MatchLit': {
        if (pattern.litType === 'string') return `tsc_string_eq(${discC}, STR_LIT("${pattern.value}"))`;
        return `${discC} == ${pattern.value}`;
      }
      case 'MatchRange': return `${discC} >= ${pattern.lo} && ${discC} <= ${pattern.hi}`;
      case 'MatchEnum': return `${discC} == ${pattern.enumName}_${pattern.caseName}`;
      case 'MatchIdent': {
        // Bare identifier: check if it's a known enum value or treat as wildcard
        if (enumDef) {
          const allValues = enumDef.values?.map(v => typeof v === 'string' ? v : v.name) ?? [];
          if (allValues.includes(pattern.name)) return `${discC} == ${discType}_${pattern.name}`;
        }
        return null; // treat as wildcard
      }
      case 'MatchOr': {
        const parts = pattern.patterns.map(p => this._matchPatternCond(p, discC, discType, enumDef)).filter(Boolean);
        return parts.join(' || ');
      }
      case 'MatchClass': {
        // Class pattern: check vtable for interface fat pointers
        const ifaceDef = this.interfaces?.get(discType) ?? null;
        if (ifaceDef) {
          // Interface fat pointer: discC.vtable == &ClassName_InterfaceName_vtable
          return `${discC}.vtable == &${pattern.className}_${discType}_vtable`;
        }
        // Concrete type: compile-time check only — always true (just bind fields)
        return null; // treat as wildcard (fields still extracted by _matchPatternBindings)
      }
      case 'MatchObjLit': {
        // Object literal pattern: check discriminator fields
        if (pattern.discriminators.length === 0) return null;
        const conds = pattern.discriminators.map(d => {
          if (d.litType === 'string') return `tsc_string_eq(${discC}.${d.key}, STR_LIT("${d.value}"))`;
          return `${discC}.${d.key} == ${d.value}`;
        });
        return conds.join(' && ');
      }
      case 'MatchTuple': {
        // Check each non-wildcard element against the corresponding tuple field
        const conds = [];
        for (let i = 0; i < pattern.elements.length; i++) {
          const el = pattern.elements[i];
          if (el.kind === 'MatchWild') continue;
          const fieldC = `${discC}._${i}`;
          const cond = this._matchPatternCond(el, fieldC, null, null);
          if (cond) conds.push(cond);
        }
        return conds.length > 0 ? conds.join(' && ') : '1';
      }
      default: return '1';
    }
  },

  // ── select({key: ch.receive(), ...}) → _SelectResult_N struct + tryReceive chain ──
  emitSelectVarDecl(node, lines, depth) {
    const I = ' '.repeat(this.indent * depth);
    const { name, varKind, init } = node;
    const objArg = init.args?.[0]?.expr;
    const props = objArg?.props ?? [];

    const selIdx = this._selectCount ?? 0;
    this._selectCount = selIdx + 1;
    const structName = `_SelectResult_${selIdx}`;
    const doneLabel = `_sel${selIdx}_done`;

    // Determine field types from channel receive() calls
    const fields = [];
    for (const prop of props) {
      const key = prop.key;
      // prop.value is ch.receive() call; infer channel element type from ch variable
      const val = prop.value;
      let ident = 'i32';
      if (val?.kind === 'Call' && val.callee?.kind === 'Member' && val.callee.prop === 'receive') {
        const chObj = val.callee.object;
        const chSym = this.lookup(chObj?.name ?? '');
        const m = chSym?.ctype?.match(/^Channel_(\w+)$/);
        if (m) ident = m[1];
      }
      const ctype = this.resolveType({ kind: 'TypeRef', name: ident }) ?? 'int32_t';
      fields.push({ key, ident, ctype, valExpr: val });
    }

    // Emit typedef
    const fieldDecls = [`int32_t _arm`, ...fields.map(f => `${f.ctype} ${f.key}`)].join('; ');
    this.addTop(`typedef struct { ${fieldDecls}; } ${structName};`);

    // Register struct type so inferType works for field access
    this.classes.set(structName, {
      fields: [
        { name: '_arm', ctype: 'int32_t' },
        ...fields.map(f => ({ name: f.key, ctype: f.ctype })),
      ],
    });

    // Emit declaration + initialization
    const zeroInits = ['-1', ...fields.map(() => '0')].join(', ');
    lines.push(`${I}${structName} ${name} = {${zeroInits}};`);

    // Emit tryReceive chain (if-else, first ready wins)
    for (let i = 0; i < fields.length; i++) {
      const { key, ident, valExpr } = fields[i];
      const chObj = valExpr?.callee?.object;
      const chC = this.exprToC(chObj, lines, depth);
      const optType = `opt_${ident}`;
      // Ensure opt_T typedef
      this._ensureOptStruct?.(optType, fields[i].ctype);
      const selVar = `_sel_${key}`;
      if (i === 0) {
        lines.push(`${I}{ ${optType} ${selVar} = tsc_channel_try_receive_${ident}(${chC}._inner); if (${selVar}.has_value) { ${name}.${key} = ${selVar}.value; ${name}._arm = ${i}; } }`);
      } else {
        lines.push(`${I}if (${name}._arm < 0) { ${optType} ${selVar} = tsc_channel_try_receive_${ident}(${chC}._inner); if (${selVar}.has_value) { ${name}.${key} = ${selVar}.value; ${name}._arm = ${i}; } }`);
      }
    }

    // Register the result variable in scope
    this.define(name, { ctype: structName, varKind });
  },

};
