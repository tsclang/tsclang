import type { CodeGenContext } from '../../codegen.js';
import type { ClassMeta } from '../../codegen.js';
import type { Expression, MatchCase, MatchPattern, VarDecl, Stmt, CatchClause, Match, TryCatch, TypeAnn } from '@tsclang/ast';
import type { SymbolInfo } from '@tsclang/ast';
export function _emitMatchCore(ctx: CodeGenContext, discriminant: Expression, cases: MatchCase[], hasParens: boolean,
                               discC: string, discType: string, resultType: string, resultVar: string,
                               lines: string[], depth: number) {
    const I = ' '.repeat(ctx.indent * depth);
    const p = (s: string) => lines.push(I + s);

    p(`${resultType} ${resultVar} = {0};`);

    const enumDef = ctx.classes.get(discType);
    const isEnum = enumDef?.isEnum && !enumDef?.isConst && !enumDef?.isStringLiteralUnion;

    if (isEnum) {
      const allValues = ((enumDef.members ?? []) as { name: string }[]).map((m) => m.name);
      const coveredEnumCases = new Set<string>();
      let hasWild = false;
      for (const c of cases) {
        if (c.pattern.kind === 'MatchWild') hasWild = true;
        if (c.pattern.kind === 'MatchEnum') coveredEnumCases.add(c.pattern.caseName);
      }
      if (!hasWild) {
        const missing = allValues.filter((v: string) => !coveredEnumCases.has(v));
        if (missing.length > 0) {
          throw ctx.errorCode('E110', null, { name: discType, missing: missing.map((v: string) => `'${v}'`).join(', ') });
        }
      }
    }

    if (isEnum && !hasParens) {
      let hasDefault = false;
      p(`switch (${discC}) {`);
      for (const c of cases) {
        const bodyC = ctx.exprToC(c.body, lines, depth);
        if (c.pattern.kind === 'MatchEnum') {
          const _enumDef = ctx.classes.get(c.pattern.enumName);
          const _enumCname = _enumDef?._cname ?? c.pattern.enumName;
          p(`    case ${_enumCname}_${c.pattern.caseName}: ${resultVar} = ${bodyC}; break;`);
        } else if (c.pattern.kind === 'MatchWild') {
          hasDefault = true;
          p(`    default: ${resultVar} = ${bodyC}; break;`);
        }
      }
      if (!hasDefault && ctx._strictRules?.has('switch-default')) {
        p('    default: break;');
      }
      p('}');
    } else {
      let discUse = discC;
      if (!['Ident', 'Literal'].includes(discriminant.kind)) {
        const discTmp = `_tsc_disc_${ctx.tempCount++}`;
        p(`${discType} ${discTmp} = ${discC};`);
        discUse = discTmp;
      }
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const isLast = i === cases.length - 1;
        const prefix = i === 0 ? 'if' : 'else if';
        const needsBindings = c.pattern.kind === 'MatchClass' || c.pattern.kind === 'MatchObjLit';

        if (isLast && (c.pattern.kind === 'MatchWild' || (isEnum && c.pattern.kind === 'MatchEnum'))) {
          const bodyC = ctx.exprToC(c.body, lines, depth);
          p(`else { ${resultVar} = ${bodyC}; }`);
        } else {
          const cond = ctx._matchPatternCond(c.pattern, discUse, discType, enumDef);
          if (needsBindings) {
            const armLines: string[] = [];
            const armI = ' '.repeat(ctx.indent * (depth + 1));
            ctx.pushScope();
            const bindings = ctx._matchPatternBindings(c.pattern, discUse, discType);
            for (const b of bindings) armLines.push(armI + b);
            const bodyC = ctx.exprToC(c.body, armLines, depth + 1);
            armLines.push(`${armI}${resultVar} = ${bodyC};`);
            ctx.popScope();
            if (cond === null) {
              p(`else {`);
            } else {
              p(`${prefix} (${cond}) {`);
            }
            lines.push(...armLines);
            p('}');
          } else if (cond === null) {
            const bodyC = ctx.exprToC(c.body, lines, depth);
            p(`else { ${resultVar} = ${bodyC}; }`);
          } else {
            const bodyC = ctx.exprToC(c.body, lines, depth);
            p(`${prefix} (${cond}) { ${resultVar} = ${bodyC}; }`);
          }
        }
      }
    }
}

export function emitMatchVarDecl(ctx: CodeGenContext, node: VarDecl, lines: string[], depth: number) {
    const { name, typeAnn, init } = node;
    if (init?.kind !== 'Match') return;
    const { discriminant, cases, hasParens } = init;

    const discC = ctx.exprToC(discriminant, lines, depth);
    const discType = ctx.inferType(discriminant);

    const resultType = typeAnn
      ? ctx.resolveType(typeAnn)
      : (cases.length > 0 ? ctx.inferType(cases[0].body) : 'int32_t');

    ctx.define(name, { ctype: resultType, varKind: 'let' });

    ctx._emitMatchCore(discriminant, cases, hasParens ?? false, discC, discType, resultType, name, lines, depth);
}

export function _matchExprToC(ctx: CodeGenContext, node: Match, lines: string[], depth: number) {
    const { discriminant, cases, hasParens } = node;

    const discC = ctx.exprToC(discriminant, lines, depth);
    const discType = ctx.inferType(discriminant);

    const resultType = cases.length > 0 ? ctx._effectiveType(cases[0].body) : 'int32_t';
    const resultVar = `_match_${ctx.tempCount++}`;

    ctx._emitMatchCore(discriminant, cases, hasParens ?? false, discC, discType, resultType, resultVar, lines, depth);

    return resultVar;
}

  // -----------------------------------------------------------------------
  // Result-based TryCatch emission
  // -----------------------------------------------------------------------
export function _emitTryCatchResult(ctx: CodeGenContext, node: TryCatch, tryStmts: Stmt[], callStmt: Stmt, lines: string[], depth: number) {
    const I = ' '.repeat(ctx.indent * depth);
    const p = (s: string) => lines.push(I + s);
    const II = ' '.repeat(ctx.indent * (depth + 1));

    // Require explicit type annotation in catch clauses
    for (const c of node.catches ?? []) {
      if (c.param && !c.typeAnn) {
        throw ctx.errorCode('E111', c);
      }
    }

    // Determine if this is a void ExprStmt call or a VarDecl call
    const isVoidCall = callStmt.kind === 'ExprStmt';
    const callExpr = isVoidCall ? (callStmt as { expr: Expression }).expr : (callStmt as VarDecl).init;
    const varName = isVoidCall ? null : (callStmt as VarDecl).name;
    const varKind = isVoidCall ? undefined : (callStmt as VarDecl).varKind;

    // Get callee symbol for result type info
    const callee = callExpr?.kind === 'Call' ? callExpr.callee : undefined;
    const calleeSym = callee?.kind === 'Ident' ? ctx.lookup(callee.name) : null;
    const resultType = calleeSym?._resultType ?? 'int';
    const isResultVoid = calleeSym?._resultIsVoid ?? true;

    // Emit: ResultType _res_N = call();
    const resName = `_res_${ctx.tempCount++}`;
    const callC = ctx.exprToC(callExpr!, lines, depth);
    p(`${resultType} ${resName} = ${callC};`);

    const catches = node.catches ?? [];
    const isUnionError = (calleeSym?._resultErrTypes?.length ?? 0) > 1;

    if (isVoidCall || isResultVoid) {
      // Simple: if (!ok) { catch }
      p(`if (!${resName}.ok) {`);
      ctx._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
      p('}');
    } else {
      // Non-void: value is used; check if there are subsequent statements
      const callIdx = tryStmts.indexOf(callStmt);
      const restStmts = tryStmts.slice(callIdx + 1);
      if (restStmts.length === 0) {
        // No rest stmts: if (!ok) { catch }
        p(`if (!${resName}.ok) {`);
        ctx._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
        p('}');
      } else {
        // Rest stmts: if (ok) { var = value; rest... } else { catch }
        p(`if (${resName}.ok) {`);
        const valType = calleeSym?._resultValueType ?? 'int32_t';
        const qualifier = (varKind === 'const' && valType !== 'String') ? 'const ' : '';
        lines.push(`${II}${qualifier}${valType} ${varName} = ${resName}.value;`);
        ctx.pushScope();
        ctx.define(varName!, { ctype: valType, varKind });
        for (const s of restStmts) ctx.visitStmt(s, lines, depth + 1);
        ctx.popScope();
        p('} else {');
        ctx._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
        p('}');
      }
    }

    // Finally block (always emitted, never inside if)
    if (node.finally) {
      ctx._inFinallyBlock = true;
      ctx.visitBlock(node.finally, lines, depth);
      ctx._inFinallyBlock = false;
    }
}

export function _emitCatchBodies(ctx: CodeGenContext, catches: CatchClause[], resName: string, calleeSym: SymbolInfo | null, lines: string[], depth: number) {
    const I = ' '.repeat(ctx.indent * depth);
    const II = ' '.repeat(ctx.indent * (depth + 1));
    const isUnion = (calleeSym?._resultErrTypes?.length ?? 0) > 1;

    if (catches.length === 0) return;

    if (catches.length === 1) {
      const c = catches[0];
      // Union catch clause: catch (e: ErrA | ErrB) — no binding, just body
      const isUnionCatch = c.typeAnn?.kind === 'TypeUnion';
      if (isUnionCatch) {
        ctx.pushScope();
        ctx.visitBlock(c.body, lines, depth);
        ctx.popScope();
      } else {
        const errClass = (c.typeAnn?.kind === 'TypeRef' ? c.typeAnn.name : null) ?? 'void';
        const errExpr = isUnion
          ? `${resName}.error._${calleeSym?._resultErrTypes?.indexOf(errClass) ?? 0}`
          : `${resName}.error`;
        const bodyStr = JSON.stringify(c.body);
        const paramUsed = bodyStr.includes(`"name":"${c.param}"`);
        if (paramUsed) {
          lines.push(`${I}${errClass} ${c.param} = ${errExpr};`);
        } else {
          lines.push(`${I}(void)${errExpr};`);
        }
        ctx.pushScope();
        ctx.define(c.param!, { ctype: errClass });
        ctx.visitBlock(c.body, lines, depth);
        ctx.popScope();
      }
    } else {
      // Multiple catch clauses → union tag dispatch (if/else if chain)
      for (let i = 0; i < catches.length; i++) {
        const c = catches[i];
        const errClass = (c.typeAnn?.kind === 'TypeRef' ? c.typeAnn.name : null) ?? 'void';
        if (i === 0) {
          lines.push(`${I}if (${resName}.error.tag == _Err_${errClass}) {`);
        } else {
          lines.push(`${I}} else if (${resName}.error.tag == _Err_${errClass}) {`);
        }
        const errExpr = `${resName}.error._${i}`;
        const bodyStr = JSON.stringify(c.body);
        const paramUsed = bodyStr.includes(`"name":"${c.param}"`);
        if (paramUsed) {
          lines.push(`${II}${errClass} ${c.param} = ${errExpr};`);
        } else {
          lines.push(`${II}(void)${errExpr};`);
        }
        ctx.pushScope();
        ctx.define(c.param!, { ctype: errClass });
        ctx.visitBlock(c.body, lines, depth + 1);
        ctx.popScope();
      }
      lines.push(`${I}}`);
    }
}

  // -----------------------------------------------------------------------
  // Propagate/NonNull VarDecl: const x = throwsFunc()?  or  !
  // -----------------------------------------------------------------------
export function emitPropagateVarDecl(ctx: CodeGenContext, node: VarDecl, lines: string[], depth: number) {
    const { varKind, name, typeAnn, init } = node;
    const I = ' '.repeat(ctx.indent * depth);
    const p = (s: string) => lines.push(I + s);

    const isProp = init?.kind === 'Propagate';
    const innerExpr = (init?.kind === 'Propagate' || init?.kind === 'NonNull') ? init.expr : undefined;

    // Get callee symbol
    const callee = innerExpr?.kind === 'Call' ? innerExpr.callee : undefined;
    const calleeSym = (callee?.kind === 'Ident') ? ctx.lookup(callee.name) : null;

    if (!calleeSym?._isThrowsFunc) {
      if (isProp) {
        const calleeName = callee?.kind === 'Ident' ? callee.name : '?';
        throw ctx.errorCode('E415', null, { detail: `TypeError: Cannot use '?' on '${calleeName}()': function does not throw` });
      }
      // NonNull on non-throws: just emit normally
      const c = ctx.exprToC(innerExpr!, lines, depth);
      const ctype = typeAnn ? ctx.resolveType(typeAnn) : ctx.inferType(innerExpr!);
      const qualifier = (varKind === 'const' && ctype !== 'String') ? 'const ' : '';
      p(`${qualifier}${ctype} ${name} = ${c};`);
      ctx.define(name, { ctype, varKind });
      return;
    }

    // Throws function: emit Result-based propagation
    const resultType = calleeSym._resultType;
    const resName = `_res_${ctx.tempCount++}`;
    const callC = ctx.exprToC(innerExpr!, lines, depth);
    p(`${resultType} ${resName} = ${callC};`);

    if (ctx._throwsCtx) {
      const _wrappedErr = ctx._wrapErrForCaller(ctx._throwsCtx, `${resName}.error`, calleeSym);
      if (ctx._usesGotoCleanup) {
        const _hasBlock = ctx._hasPendingCleanups();
        if (_hasBlock) {
          p(`if (!${resName}.ok) {`);
          ctx._emitFuncCleanup(lines, I + ' '.repeat(ctx.indent));
          p(`    _result = (${ctx._throwsCtx.resultType}){.ok = false, .error = ${_wrappedErr}};`);
          p(`    goto cleanup;`);
          p(`}`);
        } else {
          p(`if (!${resName}.ok) { _result = (${ctx._throwsCtx.resultType}){.ok = false, .error = ${_wrappedErr}}; goto cleanup; }`);
        }
      } else if (ctx._hasPendingCleanups()) {
        p(`if (!${resName}.ok) {`);
        ctx._emitFuncCleanup(lines, I + ' '.repeat(ctx.indent));
        p(`    return (${ctx._throwsCtx.resultType}){.ok = false, .error = ${_wrappedErr}};`);
        p(`}`);
      } else {
        p(`if (!${resName}.ok) { return (${ctx._throwsCtx.resultType}){.ok = false, .error = ${_wrappedErr}}; }`);
      }
    } else {
      if (isProp) {
        const fnName = ctx.currentFuncName ?? '<function>';
        throw ctx.errorCode('E415', null, { detail: `TypeError: Cannot use '?' in '${fnName}': function does not declare 'throws'` });
      }
      p(`if (!${resName}.ok) { tsc_panic("E409", ${ctx._panicMsgExpr(resName, calleeSym._resultErrTypes)}); }`);
    }

    // Bind the value
    const valueType = calleeSym._resultValueType ?? 'int32_t';
    const qualifier = (varKind === 'const' && valueType !== 'String') ? 'const ' : '';
    p(`${qualifier}${valueType} ${name} = ${resName}.value;`);
    ctx.define(name, { ctype: valueType, varKind });
}

  // Generate field binding declarations for patterns that destructure (MatchClass, MatchObjLit)
  // Returns array of C declaration strings, or empty array if no bindings needed
export function _matchPatternBindings(ctx: CodeGenContext, pattern: MatchPattern, discC: string, discType: string) {
    if (pattern.kind === 'MatchClass') {
      const fields = pattern.fields ?? [];
      if (fields.length === 0) return [];
      const className = pattern.className;
      const ifaceDef = ctx.interfaces?.get(discType) ?? null;
      const classDef = ctx.classes.get(className);
      return fields.map((f: string) => {
        const fieldDef = classDef?.fields?.find((fd: { name: string }) => fd.name === f);
        const ctype = fieldDef?.ctype ?? (fieldDef?.typeAnn ? ctx.resolveType(fieldDef.typeAnn) : 'int32_t');
        const access = ifaceDef
          ? `((${className}*)${discC}.self)->${f}`
          : `${discC}.${f}`;
        ctx.define(f, { ctype, varKind: 'const' });
        return `${ctype} ${f} = ${access};`;
      });
    }
    if (pattern.kind === 'MatchObjLit') {
      const fields = pattern.fields ?? [];
      if (fields.length === 0) return [];
      const structDef = ctx.classes.get(discType);
      return fields.map((f: string) => {
        const fieldDef = structDef?.fields?.find((fd: { name: string }) => fd.name === f);
        const ctype = fieldDef?.ctype ?? (fieldDef?.typeAnn ? ctx.resolveType(fieldDef.typeAnn) : 'int32_t');
        const access = `${discC}.${f}`;
        ctx.define(f, { ctype, varKind: 'const' });
        return `${ctype} ${f} = ${access};`;
      });
    }
    return [];
}

  // Generate a C condition expression for a match pattern
export function _matchPatternCond(ctx: CodeGenContext, pattern: MatchPattern, discC: string, discType: string | null, enumDef: ClassMeta | undefined): string | null {
    switch (pattern.kind) {
      case 'MatchWild': return null; // becomes else
      case 'MatchNull': return `!${discC}.has_value`;
      case 'MatchLit': {
        if (pattern.litType === 'string') return `tsc_string_eq(${discC}, STR_LIT("${pattern.value}"))`;
        return `${discC} == ${pattern.value}`;
      }
      case 'MatchRange': return `${discC} >= ${pattern.lo} && ${discC} < ${pattern.hi}`;
      case 'MatchEnum': {
        const _enumDef = ctx.classes.get(pattern.enumName);
        const _enumCname = _enumDef?._cname ?? pattern.enumName;
        return `${discC} == ${_enumCname}_${pattern.caseName}`;
      }
      case 'MatchIdent': {
        // Bare identifier: check if it's a known enum value or treat as wildcard
        if (enumDef) {
          const allValues = enumDef.values?.map((v: string | { name: string }) => typeof v === 'string' ? v : v.name) ?? [];
          if (allValues.includes(pattern.name)) return `${discC} == ${discType}_${pattern.name}`;
        }
        return null; // treat as wildcard
      }
      case 'MatchOr': {
        const parts = pattern.patterns.map((p: MatchPattern) => _matchPatternCond(ctx, p, discC, discType, enumDef)).filter(Boolean);
        return parts.join(' || ');
      }
      case 'MatchClass': {
        // Class pattern: check vtable for interface fat pointers
        const ifaceDef = discType ? (ctx.interfaces?.get(discType) ?? null) : null;
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
        const conds = pattern.discriminators.map((d: { key: string; value: string; litType: string }) => {
          if (d.litType === 'string') return `tsc_string_eq(${discC}.${d.key}, STR_LIT("${d.value}"))`;
          return `${discC}.${d.key} == ${d.value}`;
        });
        return conds.join(' && ');
      }
      case 'MatchTuple': {
        // Check each non-wildcard element against the corresponding tuple field
        const conds: string[] = [];
        for (let i = 0; i < pattern.elements.length; i++) {
          const el = pattern.elements[i];
          if (el.kind === 'MatchWild') continue;
          const fieldC = `${discC}._${i}`;
          const cond = ctx._matchPatternCond(el, fieldC, null, undefined);
          if (cond) conds.push(cond);
        }
        return conds.length > 0 ? conds.join(' && ') : '1';
      }
      default: throw ctx.errorCode('E417', pattern as MatchPattern, { detail: `internal: unhandled match pattern kind '${(pattern as MatchPattern).kind}'` });
    }
}

  // ── select({key: ch.receive(), ...}) → _SelectResult_N struct + tryReceive chain ──
export function emitSelectVarDecl(ctx: CodeGenContext, node: VarDecl, lines: string[], depth: number) {
    const I = ' '.repeat(ctx.indent * depth);
    const { name, varKind, init } = node;
    const objArg = init?.kind === 'Call' ? init.args?.[0]?.expr : undefined;
    const props = objArg?.kind === 'ObjLit' ? objArg.props ?? [] : [];

    const selIdx = ctx._selectCount ?? 0;
    ctx._selectCount = selIdx + 1;
    const structName = `_SelectResult_${selIdx}`;
    const doneLabel = `_sel${selIdx}_done`;

    // Determine field types from channel receive() calls
    const fields: { key: string; ident: string; ctype: string; valExpr: Expression }[] = [];
    for (const prop of props) {
      const key = prop.key;
      // prop.value is ch.receive() call; infer channel element type from ch variable
      const val = prop.value;
      let ident = 'i32';
      if (val?.kind === 'Call' && val.callee?.kind === 'Member' && val.callee.prop === 'receive') {
        const chObj = val.callee.object;
        const chSym = chObj?.kind === 'Ident' ? ctx.lookup(chObj.name) : null;
        const m = chSym?.ctype?.match(/^Channel_(\w+)$/);
        if (m) ident = m[1];
      }
      const ctype = ctx.resolveType({ kind: 'TypeRef', name: ident } as unknown as TypeAnn) ?? 'int32_t';
      fields.push({ key: typeof key === 'string' ? key : '', ident, ctype, valExpr: val as Expression });
    }

    // Emit typedef
    const fieldDecls = [`int32_t _arm`, ...fields.map((f: { ctype: string; key: string }) => `${f.ctype} ${f.key}`)].join('; ');
    ctx.addTop(`typedef struct { ${fieldDecls}; } ${structName};`);

    // Register struct type so inferType works for field access
    ctx.classes.set(structName, {
      fields: [
        { name: '_arm', ctype: 'int32_t' },
        ...fields.map((f: { key: string; ctype: string }) => ({ name: f.key, ctype: f.ctype })),
      ],
    });

    // Emit declaration + initialization
    const zeroInits = ['-1', ...fields.map(() => '0')].join(', ');
    lines.push(`${I}${structName} ${name} = {${zeroInits}};`);

    // Emit tryReceive chain (if-else, first ready wins)
    for (let i = 0; i < fields.length; i++) {
      const { key, ident, valExpr } = fields[i];
      const chObj = valExpr?.kind === 'Call' && valExpr.callee?.kind === 'Member' ? valExpr.callee.object : undefined;
      const chC = ctx.exprToC(chObj!, lines, depth);
      const optType = `opt_${ident}`;
      // Ensure opt_T typedef
      ctx._ensureOptStruct?.(optType, fields[i].ctype);
      const selVar = `_sel_${key}`;
      if (i === 0) {
        lines.push(`${I}{ ${optType} ${selVar} = tsc_channel_try_receive_${ident}(${chC}._inner); if (${selVar}.has_value) { ${name}.${key} = ${selVar}.value; ${name}._arm = ${i}; } }`);
      } else {
        lines.push(`${I}if (${name}._arm < 0) { ${optType} ${selVar} = tsc_channel_try_receive_${ident}(${chC}._inner); if (${selVar}.has_value) { ${name}.${key} = ${selVar}.value; ${name}._arm = ${i}; } }`);
      }
    }

    // Register the result variable in scope
    ctx.define(name, { ctype: structName, varKind });
}

