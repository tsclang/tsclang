import type { CodeGenContext } from '../../codegen.js';
import type { Expression, SymbolInfo, Stmt, Switch, Block } from '@tsclang/ast';
import type { ThrowsCtx } from '../top-level/decorators.js';
import { isDecimal, resolveDecimalBase } from '../types/decimal.js';
export function _emitRetainIfNeeded(ctx: CodeGenContext, valC: string, valNode: Expression, p: (s: string) => void) {
    if (valNode.kind === 'Ident') {
      const sym = ctx.lookup(valNode.name);
      if (sym?.isArc) {
        p(`tsc_arc_retain(${valC});`);
        return;
      }
    }
    if (ctx.inferType(valNode) === 'String' && ['Ident', 'Member', 'Index'].includes(valNode.kind)) {
      p(`tsc_string_retain(${valC});`);
    }
}

export function _wrapErrForCaller(ctx: CodeGenContext, throwsCtx: ThrowsCtx, errExpr: string, calleeSym: SymbolInfo | null) {
    if (throwsCtx.throwsNames.length <= 1) return errExpr;
    const calleeErrTypes = calleeSym?._resultErrTypes ?? [];
    if (calleeErrTypes.length > 1) return errExpr;
    const errType = calleeErrTypes[0];
    if (!errType) return errExpr;
    const idx = throwsCtx.throwsNames.indexOf(errType);
    if (idx === -1) return errExpr;
    return `(_ErrUnion_${throwsCtx.errKey}){.tag = _Err_${errType}, ._${idx} = ${errExpr}}`;
}

export function _visitControlFlow(ctx: CodeGenContext, node: Stmt, lines: string[], depth: number) {
    ctx._currentNode = node;
    const I = ' '.repeat(ctx.indent * depth);
    const p = (s: string) => lines.push(I + s);
    switch (node.kind) {
      case 'ExprStmt': {
        const expr = node.expr;
        // Auto-propagate calls to throws functions inside a throws function or math try/catch
        if ((ctx._throwsCtx || ctx._inMathTry) && expr.kind === 'Call') {
          const callee = expr.callee;
          const sym = callee.kind === 'Ident' ? ctx.lookup(callee.name) : null;
          if (sym?._isThrowsFunc) {
            const tc = ctx._throwsCtx;
            const resName = `_res_${ctx.tempCount++}`;
            const callC = ctx.exprToC(expr, lines, depth);
            p(`${sym._resultType} ${resName} = ${callC};`);
            p(`if (!${resName}.ok) {`);
            if (ctx._inMathTry && sym._resultErrTypes?.length === 1 && sym._resultErrTypes[0] === 'MathError') {
              p(`    ${ctx._mathErrVar} = ${resName}.error;`);
              p(`    goto ${ctx._mathCatchLabel};`);
            } else if (ctx._usesGotoCleanup) {
              ctx._emitFuncCleanup(lines, I + '    ');
              p(`    _result = (${tc!.resultType}){.ok = false, .error = ${ctx._wrapErrForCaller(tc!, `${resName}.error`, sym)}};`);
              p(`    goto cleanup;`);
            } else if (tc) {
              ctx._emitFuncCleanup(lines, I + '    ');
              p(`    return (${tc.resultType}){.ok = false, .error = ${ctx._wrapErrForCaller(tc, `${resName}.error`, sym)}};`);
            } else {
              const errTypes = sym._resultErrTypes?.map((t: string | { name: string }) => typeof t === 'string' ? t : t?.name).join(' | ') ?? 'unknown';
              throw ctx.error(
                `TypeError: '${callee.kind === 'Ident' ? callee.name : 'unknown'}()' throws ${errTypes} which cannot be caught by 'math try/catch' (only MathError is catchable); use regular try/catch or declare 'throws' on the enclosing function`,
                expr
              );
            }
            p(`}`);
            ctx._flushPostStmtCleanups(lines);
            break;
          }
        }
        if (!ctx._throwsCtx && !ctx._inMathTry && expr.kind === 'Call' && expr.callee?.kind === 'Ident') {
          const sym = ctx.lookup(expr.callee.name);
          if (sym?._isThrowsFunc) {
            throw ctx.error(
              `TypeError: Call to throws function '${expr.callee.name}()' requires error handling: use '?', '!', try/catch, or declare 'throws' on the enclosing function`,
              node
            );
          }
        }
        // Check method calls: obj.method() where method is throws
        if (!ctx._throwsCtx && !ctx._inMathTry && expr.kind === 'Call' && expr.callee?.kind === 'Member') {
          const objType = ctx.inferType(expr.callee.object);
          const cls = ctx.classes.get(objType);
          if (cls?._methodNames) {
            const methodInfo = cls._methodNames.get(expr.callee.prop);
            if (methodInfo?._isThrowsFunc) {
              throw ctx.error(
                `TypeError: Call to throws method '${expr.callee.prop}()' requires error handling: use '?', '!', try/catch, or declare 'throws' on the enclosing function`,
                node
              );
            }
          }
        }
        const c = ctx.exprToC(node.expr, lines, depth);
        if (c && c !== '') {
          // Block-form assignments (&&=, ||=, ??=) already include semicolons
          if ((c.startsWith('{') && c.endsWith('}')) || c.startsWith('if (')) p(c);
          else p(`${c};`);
        }
        ctx._flushPostStmtCleanups(lines);
        break;
      }

      case 'Return': {
        const _prevET_ret = ctx._expectedType;
        ctx._expectedType = resolveDecimalBase(ctx, ctx.currentFuncReturnType) ?? ctx.currentFuncReturnType ?? null;
        // Inside Iterable iter_next body: translate return null/val to opt_T
        if (ctx._inIterNextBody) {
          const optType = ctx._iterNextOptType;
          const isNull = !node.value || (node.value.kind === 'Literal' && node.value.litType === 'null');
          if (isNull) {
            lines.push(`${I}return (${optType}){false, 0};`);
          } else {
            ctx._inReturnContext = true;
            const valC = ctx.exprToC(node.value!, lines, depth);
            ctx._inReturnContext = false;
            ctx._emitRetainIfNeeded(valC, node.value!, p);
            const retVal = ctx._iterNextIsComplex ? `&(${valC})` : valC;
            lines.push(`${I}return (${optType}){true, ${retVal}};`);
          }
          ctx._expectedType = _prevET_ret;
          break;
        }
        // Check bare throws in return value, unless auto-propagate will handle it
        const _retAutoProp = ctx._throwsCtx && node.value?.kind === 'Call' &&
          node.value.callee?.kind === 'Ident' && ctx.lookup(node.value.callee.name)?._isThrowsFunc;
        if (!_retAutoProp) ctx._checkNoBareThrows(node.value);
        // Error: return inside finally block
        if (ctx._inFinallyBlock) {
          throw ctx.error('TypeError: Cannot return inside a finally block');
        }
        const funcSym = ctx.currentFuncName ? ctx.lookup(ctx.currentFuncName) : null;
        const retTypeAnn = funcSym?.returnType;
        const isRefReturn = retTypeAnn?.kind === 'TypeRef' && retTypeAnn.name === 'Ref';
        const isMutReturn = retTypeAnn?.kind === 'TypeRef' && retTypeAnn.name === 'Mut';
        if ((isRefReturn || isMutReturn) && node.value?.kind === 'Index') {
          throw ctx.errorCode('E017', null, { detail: 'borrow to array element' });
        }
        if (ctx.currentFuncReturnType?.startsWith('const ') &&
            ctx.currentFuncReturnType?.includes(' *') &&
            node.value?.kind === 'Ident') {
          // Check if return type is Ref<T> (i.e., const T * from resolveType)
          // and the returned value is a local (non-param) variable
          const retSym = ctx.lookup(node.value.name);
          if (retSym && !retSym.isPointer && !retSym.isRefParam && !retSym.funcName) {
            throw ctx.errorCode('E017', null, { detail: `reference to local variable '${node.value.name}'` });
          }
        }
        if (isMutReturn && node.value?.kind === 'Ident') {
          const retSym = ctx.lookup(node.value.name);
          if (retSym && !retSym.isPointer && !retSym.isRefParam && !retSym.funcName) {
            throw ctx.errorCode('E017', null, { detail: `mutable borrow to local variable '${node.value.name}'` });
          }
        }
        // Unknown return: auto-wrap primitive in tsc_unknown_from_XXX
        const _isUnknownReturn = ctx.currentFuncReturnType === 'tsc_unknown';
        const _wrapUnknownReturn = (valC: string, valNode: Expression) => {
          if (!_isUnknownReturn) return valC;
          const valType = ctx.inferType(valNode);
          const packer = ctx._unknownPackerFor(valType);
          ctx._ensureUnknownStruct();
          return `${packer}(${valC})`;
        };
        // Auto-propagate: return throwsFunc() inside a throws function
        if (ctx._throwsCtx && node.value?.kind === 'Call') {
          const callee = node.value.callee;
          const sym = callee?.kind === 'Ident' ? ctx.lookup(callee.name) : null;
          if (sym?._isThrowsFunc) {
            const tc = ctx._throwsCtx;
            const resName = `_res_${ctx.tempCount++}`;
            const callC = ctx.exprToC(node.value, lines, depth);
            p(`${sym._resultType} ${resName} = ${callC};`);
            if (ctx._inMathTry && sym._resultErrTypes?.length === 1 && sym._resultErrTypes[0] === 'MathError') {
              p(`if (!${resName}.ok) { ${ctx._mathErrVar} = ${resName}.error; goto ${ctx._mathCatchLabel}; }`);
            } else if (ctx._usesGotoCleanup) {
              ctx._emitFuncCleanup(lines, I);
              p(`if (!${resName}.ok) { _result = (${tc!.resultType}){.ok = false, .error = ${ctx._wrapErrForCaller(tc!, `${resName}.error`, sym)}}; goto cleanup; }`);
            } else {
              ctx._emitFuncCleanup(lines, I);
              p(`if (!${resName}.ok) { return (${tc!.resultType}){.ok = false, .error = ${ctx._wrapErrForCaller(tc!, `${resName}.error`, sym)}}; }`);
            }
            if (sym._resultIsVoid) {
              if (ctx._usesGotoCleanup) {
                p(`_result = (${tc!.resultType}){.ok = true};`);
                p(`goto cleanup;`);
              } else {
                p(`return (${tc!.resultType}){.ok = true};`);
              }
            } else {
              if (ctx._usesGotoCleanup) {
                p(`_result = (${tc!.resultType}){.ok = true, .value = ${resName}.value};`);
                p(`goto cleanup;`);
              } else {
                p(`return (${tc!.resultType}){.ok = true, .value = ${resName}.value};`);
              }
            }
            ctx._expectedType = _prevET_ret;
            break;
          }
        }
        // goto cleanup pattern for throws functions with owned vars
        if (ctx._usesGotoCleanup) {
          const tc = ctx._throwsCtx!;
          if (node.value) {
            ctx._inReturnContext = true;
            const retC = _wrapUnknownReturn(ctx.exprToC(node.value, lines, depth), node.value);
            ctx._inReturnContext = false;
            const retIsOwnedIdent = node.value.kind === 'Ident' && ctx._hasCleanupFor(node.value.name);
            if (!_isUnknownReturn && !retIsOwnedIdent) ctx._emitRetainIfNeeded(retC, node.value!, p);
            if (retIsOwnedIdent && node.value.kind === 'Ident') ctx._suppressCleanupFor(node.value.name);
            ctx._markPoolVarMoved(node.value);
            p(`_result = (${tc.resultType}){.ok = true, .value = ${retC}};`);
          } else {
            p(`_result = (${tc.resultType}){.ok = true};`);
          }
          ctx._flushPostStmtCleanups(lines);
          ctx._emitFuncCleanup(lines, I);
          p(`goto cleanup;`);
          ctx._expectedType = _prevET_ret;
          break;
        }
        if (ctx._hasPendingCleanups() && node.value) {
          // Evaluate return value before cleanup to avoid use-after-free of owned vars
          ctx._inReturnContext = true;
          const retC = _wrapUnknownReturn(ctx.exprToC(node.value, lines, depth), node.value);
          ctx._inReturnContext = false;
          const retType = _isUnknownReturn ? 'tsc_unknown' : (ctx.inferType(node.value) ?? 'int32_t');
          const retIsOwnedIdent = node.value.kind === 'Ident' && ctx._hasCleanupFor(node.value.name);
          if (retIsOwnedIdent && node.value.kind === 'Ident') {
            ctx._suppressCleanupFor(node.value.name);
            ctx._markPoolVarMoved(node.value);
            if (ctx._throwsCtx) {
              p(`return (${ctx._throwsCtx.resultType}){.ok = true, .value = ${retC}};`);
            } else {
              p(`return ${retC};`);
            }
            ctx._emitFuncCleanup(lines, I);
          } else {
            ctx._emitRetainIfNeeded(retC, node.value, p);
            ctx._markPoolVarMoved(node.value);
            const tmpName = `_ret_${ctx.tempCount++}`;
            p(`${retType} ${tmpName} = ${retC};`);
            ctx._flushPostStmtCleanups(lines);
            ctx._emitFuncCleanup(lines, I);
            if (ctx._throwsCtx) {
              p(`return (${ctx._throwsCtx.resultType}){.ok = true, .value = ${tmpName}};`);
            } else {
              p(`return ${tmpName};`);
            }
          }
        } else {
          ctx._emitFuncCleanup(lines, I);
          if (ctx._throwsCtx) {
            const tc = ctx._throwsCtx;
            if (node.value) {
              ctx._inReturnContext = true;
              const c = _wrapUnknownReturn(ctx.exprToC(node.value!, lines, depth), node.value!);
              ctx._inReturnContext = false;
              if (!_isUnknownReturn) ctx._emitRetainIfNeeded(c, node.value!, p);
              ctx._markPoolVarMoved(node.value);
              if (ctx._postStmtCleanups?.length) {
                const retType2 = ctx.inferType(node.value!) ?? 'int32_t';
                const tmpName2 = `_ret_${ctx.tempCount++}`;
                p(`${retType2} ${tmpName2} = ${c};`);
                ctx._flushPostStmtCleanups(lines);
                p(`return (${tc.resultType}){.ok = true, .value = ${tmpName2}};`);
              } else {
                p(`return (${tc.resultType}){.ok = true, .value = ${c}};`);
              }
            } else {
              p(`return (${tc.resultType}){.ok = true};`);
            }
          } else {
            if (node.value) {
              ctx._inReturnContext = true;
              let c = _wrapUnknownReturn(ctx.exprToC(node.value, lines, depth), node.value);
              ctx._inReturnContext = false;
              if (ctx.currentFuncReturnType === 'tsc_closure' && node.value.kind === 'Ident') {
                const retSym = ctx.lookup(node.value.name);
                if (retSym?.funcName && !retSym.funcPtr) {
                  c = `(tsc_closure){.env = NULL, .fn = (void*)${c}}`;
                }
              }
              if (!_isUnknownReturn) ctx._emitRetainIfNeeded(c, node.value, p);
              const retSym = node.value.kind === 'Ident' ? ctx.lookup(node.value.name) : null;
              ctx._markPoolVarMoved(node.value);
              if (ctx._postStmtCleanups?.length) {
                const retType = ctx.inferType(node.value) ?? 'int32_t';
                const tmpName = `_ret_${ctx.tempCount++}`;
                p(`${retType} ${tmpName} = ${ctx._derefStrPtr(retSym, c)};`);
                ctx._flushPostStmtCleanups(lines);
                p(`return ${tmpName};`);
              } else {
                p(`return ${ctx._derefStrPtr(retSym, c)};`);
              }
            } else {
              p('return;');
            }
          }
        }
        ctx._expectedType = _prevET_ret;
        break;
      }

      case 'If': {
        ctx._checkNoBareThrows(node.test);
        const isNullLit = (n: Expression) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
        let narrowVar: string | null = null;
        let upgradeReleaseVar: string | null = null;
        if (node.test.kind === 'Binary' && (node.test.op === '!=' || node.test.op === '!==')) {
          const nullSide = isNullLit(node.test.right) ? 'right' : isNullLit(node.test.left) ? 'left' : null;
          if (nullSide) {
            const optSide = nullSide === 'right' ? node.test.left : node.test.right;
            if (optSide.kind === 'Ident') {
              const sym = ctx.lookup(optSide.name);
              // Pool opt_ref types: don't narrow (member access routed via .value-> in expr/dispatch.ts)
              const isPool = sym?.ctype?.startsWith('opt_ref_') && ctx.classes.get(sym.ctype.slice(8))?._isPool;
              if (sym?.ctype?.startsWith('opt_') && !isPool) narrowVar = optSide.name;
              else if (sym?.isArcUpgrade) upgradeReleaseVar = optSide.name;
            }
          }
        }
        // Detect truthiness narrowing: if (x) where x is opt_T → narrow x inside block
        if (!narrowVar && node.test.kind === 'Ident') {
          const sym = ctx.lookup(node.test.name);
          if (sym?.ctype?.startsWith('opt_')) {
            const isPool = sym.ctype.startsWith('opt_ref_') && ctx.classes.get(sym.ctype.slice(8))?._isPool;
            if (!isPool) narrowVar = node.test.name;
          }
        }
        // Detect unknown narrowing: typeof x === "typename" → narrow x inside if-block
        let unknownNarrowVar: string | null = null;
        let unknownNarrowCtype: string | null = null;
        let unknownNarrowInElse = false;
        if (node.test.kind === 'Binary' && (node.test.op === '===' || node.test.op === '!==')) {
          const _testOp = node.test.op;
          const _checkUnknownNarrow = (typeofSide: Expression, nameSide: Expression) => {
            if (typeofSide.kind === 'Typeof' && typeofSide.expr.kind === 'Ident' &&
                nameSide.kind === 'Literal' && nameSide.litType === 'string') {
              const sym = ctx.lookup(typeofSide.expr.name);
              if (sym?.ctype === 'tsc_unknown') {
                unknownNarrowVar = typeofSide.expr.name;
                if (nameSide.value === 'array') {
                  unknownNarrowCtype = '__array__';
                } else if (nameSide.value === 'object') {
                  unknownNarrowCtype = '__object__';
                } else {
                  unknownNarrowCtype = ctx._tsNameToCType(nameSide.value);
                }
                unknownNarrowInElse = (_testOp === '!==');
              }
            }
          };
          _checkUnknownNarrow(node.test.left, node.test.right);
          _checkUnknownNarrow(node.test.right, node.test.left);
        }
        const testC = ctx._truthyToC(node.test, lines, depth);
        const alt = node.alternate;
        // Single statement consequent (no braces)?
        let hasBraces = node.consequent.kind === 'Block';
        if (narrowVar) {

          ctx._narrowedVars.add(narrowVar);
        }
        // Unknown narrowing: add to narrowedVars + narrowedUnknownVars for if-block
        if (unknownNarrowVar && !unknownNarrowInElse) {
          ctx._narrowedVars.add(unknownNarrowVar);
          ctx._narrowedUnknownVars.set(unknownNarrowVar, unknownNarrowCtype!);
          const _uSym = ctx.lookup(unknownNarrowVar);
          if (_uSym) ctx._trackRefBorrow(_uSym);
        }
        // Unknown narrowing in else: add AFTER if-block, BEFORE else-block
        let _unknownNarrowInElseActive = false;
        if (hasBraces) {
          p(`if (${testC}) {`);
          const _snap = ctx._snapshotCleanups();
          ctx.visitBlock(node.consequent as Block, lines, depth + 1);
          ctx._restoreCleanups(_snap);
          if (upgradeReleaseVar) {
            const innerI = ' '.repeat(ctx.indent * (depth + 1));
            lines.push(`${innerI}tsc_arc_release(${upgradeReleaseVar});`);
          }
        } else if (!alt && node.consequent.kind === 'ExprStmt') {
          // Inline (no else): if (cond) expr;
          const exprC = ctx.exprToC(node.consequent.expr, lines, depth);
          p(`if (${testC}) ${exprC};`);
        } else if (!alt && node.consequent.kind === 'Continue') {
          const _cLabel = node.consequent.label;
          const _asyncContTarget = ctx._asyncContinueStack?.length ? ctx._asyncContinueStack[ctx._asyncContinueStack.length - 1] : null;
          if (_cLabel || ctx._loopBodyCleanups?.length) {
            const innerI = ' '.repeat(ctx.indent * (depth + 1));
            p(`if (${testC}) {`);
            if (_cLabel) ctx._emitAllLoopCleanups(lines, innerI);
            else ctx._emitLoopBodyCleanups(lines, innerI);
            lines.push(`${innerI}${_cLabel ? `goto ${_cLabel}_continue;` : _asyncContTarget ? `goto ${_asyncContTarget};` : 'continue;'}`);
            p(`}`);
          } else if (_asyncContTarget) {
            p(`if (${testC}) goto ${_asyncContTarget};`);
          } else {
            p(`if (${testC}) continue;`);
          }
        } else if (!alt && node.consequent.kind === 'Break') {
          const _bLabel = node.consequent.label;
          const _asyncBreakTarget = ctx._asyncBreakStack?.length ? ctx._asyncBreakStack[ctx._asyncBreakStack.length - 1] : null;
          if (_bLabel || ctx._loopBodyCleanups?.length) {
            const innerI = ' '.repeat(ctx.indent * (depth + 1));
            p(`if (${testC}) {`);
            if (_bLabel) ctx._emitAllLoopCleanups(lines, innerI);
            else ctx._emitLoopBodyCleanups(lines, innerI);
            lines.push(`${innerI}${_bLabel ? `goto ${_bLabel}_break;` : _asyncBreakTarget ? `goto ${_asyncBreakTarget};` : 'break;'}`);
            p(`}`);
          } else if (_asyncBreakTarget) {
            p(`if (${testC}) goto ${_asyncBreakTarget};`);
          } else {
            p(`if (${testC}) ${_bLabel ? `goto ${_bLabel}_break` : 'break'};`);
          }
        } else if (!alt && node.consequent.kind === 'Return' && !node.consequent.value) {
          if (ctx._hasPendingCleanups()) {
            const innerI = ' '.repeat(ctx.indent * (depth + 1));
            p(`if (${testC}) {`);
            ctx._emitFuncCleanup(lines, innerI);
            lines.push(`${innerI}return;`);
            p(`}`);
          } else {
            p(`if (${testC}) return;`);
          }
        } else {
          p(`if (${testC}) {`);
          const _snap = ctx._snapshotCleanups();
          ctx.visitStmt(node.consequent, lines, depth + 1);
          ctx._restoreCleanups(_snap);
          // Do NOT emit '}' here тАФ it's emitted by the alt section or the no-alt close below
          hasBraces = true;  // treat as if braces were used, so alt/no-alt handling closes correctly
        }
        // Remove unknown narrowing from if-block
        if (unknownNarrowVar && !unknownNarrowInElse) {
          ctx._narrowedVars.delete(unknownNarrowVar);
          ctx._narrowedUnknownVars.delete(unknownNarrowVar);
        }
        if (alt) {
          // Set up unknown narrowing for else-block
          if (unknownNarrowVar && unknownNarrowInElse) {
            ctx._narrowedVars.add(unknownNarrowVar);
            ctx._narrowedUnknownVars.set(unknownNarrowVar, unknownNarrowCtype!);
            const _uSym2 = ctx.lookup(unknownNarrowVar);
            if (_uSym2) ctx._trackRefBorrow(_uSym2);
            _unknownNarrowInElseActive = true;
          }
          // else if: collapse into single line
          if (alt.kind === 'If') {
            p('} else if (' + ctx._truthyToC(alt.test, lines, depth) + ') {');
            { const _snap = ctx._snapshotCleanups(); ctx.visitStmtOrBlock(alt.consequent, lines, depth + 1); ctx._restoreCleanups(_snap); }
            // recurse for chained else-if
            let cur = alt.alternate;
            while (cur) {
              if (cur.kind === 'If') {
                p('} else if (' + ctx._truthyToC(cur.test, lines, depth) + ') {');
                { const _snap = ctx._snapshotCleanups(); ctx.visitStmtOrBlock(cur.consequent, lines, depth + 1); ctx._restoreCleanups(_snap); }
                cur = cur.alternate;
              } else {
                p('} else {');
                { const _snap = ctx._snapshotCleanups(); ctx.visitStmtOrBlock(cur, lines, depth + 1); ctx._restoreCleanups(_snap); }
                cur = null;
              }
            }
            p('}');
          } else {
            p('} else {');
            { const _snap = ctx._snapshotCleanups(); ctx.visitStmtOrBlock(alt, lines, depth + 1); ctx._restoreCleanups(_snap); }
            p('}');
          }
          // Remove unknown narrowing from else-block
          if (_unknownNarrowInElseActive && unknownNarrowVar) {
            ctx._narrowedVars.delete(unknownNarrowVar);
            ctx._narrowedUnknownVars.delete(unknownNarrowVar);
          }
        } else if (hasBraces) {
          p('}');
        }
        if (narrowVar) ctx._narrowedVars.delete(narrowVar);
        break;
      }

      case 'Block': {
        p('{');
        ctx.visitBlock(node, lines, depth + 1);
        p('}');
        break;
      }

      case 'For': {
        if (node.init) ctx._checkNoBareThrows(node.init.kind === 'ExprStmt' ? node.init.expr : node.init as unknown as Expression);
        if (node.test) ctx._checkNoBareThrows(node.test);
        if (node.update) ctx._checkNoBareThrows(node.update);
        const _savedAsyncBreak3 = ctx._asyncBreakStack;
        const _savedAsyncCont3 = ctx._asyncContinueStack;
        ctx._asyncBreakStack = null;
        ctx._asyncContinueStack = null;
        let initC = '';
        if (node.init) {
          if (node.init.kind === 'VarDecls') {
            const simpleDecls = node.init.decls.filter((d) => d.kind === 'VarDecl');
            const destructDecls = node.init.decls.filter((d) => d.kind !== 'VarDecl');
            for (const dd of destructDecls) {
              ctx._visitVarDestruct(dd, lines, depth);
            }
            const parts = simpleDecls.map((d) => {
              const ctype = d.typeAnn ? ctx.resolveType(d.typeAnn) : (d.init ? ctx.inferType(d.init) : 'int32_t');
              const initExpr = d.init ? ctx.exprToC(d.init, lines, depth) : '0';
              ctx.define(d.name, { ctype, varKind: d.varKind });
              return { ctype, name: d.name, initExpr };
            });
            const allSameType = parts.every((pt: { ctype: string }) => pt.ctype === parts[0].ctype);
            if (allSameType) {
              initC = `${parts[0].ctype} ` + parts.map((pt: { name: string; initExpr: string }) => `${pt.name} = ${pt.initExpr}`).join(', ');
            } else {
              const I = ' '.repeat(ctx.indent * depth);
              for (const pt of parts) {
                lines.push(`${I}${pt.ctype} ${pt.name} = ${pt.initExpr};`);
              }
              initC = '';
            }
          } else if (node.init.kind === 'VarDecl') {
            const { varKind, name, typeAnn, init } = node.init;
            const ctype = typeAnn ? ctx.resolveType(typeAnn) : (init ? ctx.inferType(init) : 'int32_t');
            const initExpr = init ? ctx.exprToC(init, lines, depth) : '0';
            initC = `${ctype} ${name} = ${initExpr}`;
            ctx.define(name, { ctype, varKind });
          } else if (node.init.kind === 'ExprStmt') {
            initC = ctx.exprToC(node.init.expr, lines, depth);
          }
        }
        if (ctx._inMathTry) {
          p(`for (${initC};;) {`);
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          const IS = ' '.repeat(ctx.indent * (depth + 1));
          if (node.test) {
            const testLines: string[] = [];
            const testC = ctx._truthyToC(node.test, testLines, depth + 1);
            for (const tl of testLines) lines.push(tl);
            lines.push(`${IS}if (!(${testC})) break;`);
          }
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          if (node.update) {
            const updLines: string[] = [];
            const updC = ctx.exprToC(node.update, updLines, depth + 1);
            if (updLines.length > 0) {
              for (const ul of updLines) lines.push(ul);
            } else if (updC) {
              lines.push(`${IS}${updC};`);
            }
          }
          ctx._loopDepth--;
          ctx._emitLoopBodyCleanups(lines, IS);
          ctx._popLoopCleanups();
          p('}');
        } else {
          const testC = node.test ? ctx._truthyToC(node.test, lines, depth) : '';
          const updC  = node.update ? ctx.exprToC(node.update, lines, depth) : '';
          p(`for (${initC}; ${testC}; ${updC}) {`);
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          ctx._loopDepth--;
          ctx._emitLoopBodyCleanups(lines, ' '.repeat(ctx.indent * (depth + 1)));
          ctx._popLoopCleanups();
          p('}');
        }
        ctx._asyncBreakStack = _savedAsyncBreak3;
        ctx._asyncContinueStack = _savedAsyncCont3;
        break;
      }

      case 'ForOf': {
        const _savedAsyncBreak4 = ctx._asyncBreakStack;
        const _savedAsyncCont4 = ctx._asyncContinueStack;
        ctx._asyncBreakStack = null;
        ctx._asyncContinueStack = null;
        const qual = node.varKind === 'const' ? 'const ' : '';
        const II = ' '.repeat(ctx.indent * (depth + 1));

        // Special case: for (const [k, v] of m.entries()) тЖТ unpack MapEntry fields
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'entries' &&
            node.binding.kind === 'ArrayPattern') {
          const mapObj = node.iterable.callee.object;
          const mapSym = mapObj.kind === 'Ident' ? ctx.lookup(mapObj.name) : null;
          const mapType = mapSym?.ctype ?? ctx.inferType(mapObj);
          if (mapType?.startsWith('TscMap_') || mapType?.startsWith('Map_')) {
            const mapSuffix = mapType.startsWith('TscMap_') ? mapType.slice(7) : mapType.slice(4);
            const parts = mapSuffix.split('_');
            const kIdent = parts[0];
            const vIdent = parts.slice(1).join('_');
            const kCType = ctx._arrIdentToCType(kIdent);
            const vCType = ctx._arrIdentToCType(vIdent);
            ctx._ensureMapEntry(mapSuffix, kCType, vCType);
            const entryName = `MapEntry_${mapSuffix}`;
            const arrType = `Array_${entryName}`;
            const mapObjC = ctx.exprToC(mapObj, lines, depth);
            const entTmpName = `_entries_${ctx.tempCount++}`;
            const ivar = `_i_${ctx.loopCount++}`;
            p(`${arrType} ${entTmpName} = tsc_map_entries_${mapSuffix}(&${mapObjC});`);
            if (mapSym) { ctx.pushScope(); ctx._trackRefBorrow(mapSym); }
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmpName}.length; ${ivar}++) {`);
            const [kElem, vElem] = node.binding.elems;
            if (kElem) {
              lines.push(`${II}${qual}${kCType} ${kElem.name} = ${entTmpName}.data[${ivar}].key;`);
              ctx.define(kElem.name!, { ctype: kCType, varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${vCType} ${vElem.name} = ${entTmpName}.data[${ivar}].value;`);
              ctx.define(vElem.name!, { ctype: vCType, varKind: node.varKind });
            }
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            p('}');
            if (mapSym) ctx.popScope();
            break;
          }
        }

        // for (const cp of s.codePoints()) тЖТ TscCodePointIter while loop
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'codePoints') {
          const strObj = node.iterable.callee.object;
          const strC = ctx.exprToC(strObj, lines, depth);
          const n = ctx.loopCount++;
          const iterVar = `_cp_iter_${n}`;
          const tmpVar = `_cp_${n}`;
          const bindName2 = node.binding.kind === 'Ident' ? node.binding.name : null;
          p(`TscCodePointIter ${iterVar} = tsc_codepoints(${strC});`);
          p(`uint32_t ${tmpVar} = 0;`);
          p(`while (tsc_codepoints_next(&${iterVar}, &${tmpVar})) {`);
          if (bindName2) {
            lines.push(`${II}${qual}uint32_t ${bindName2} = ${tmpVar};`);
            ctx.define(bindName2, { ctype: 'uint32_t', varKind: node.varKind });
          }
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          p('}');
          break;
        }

        // for (const g of s.graphemes()) тЖТ TscGraphemeIter while loop
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'graphemes') {
          const strObj = node.iterable.callee.object;
          const strC = ctx.exprToC(strObj, lines, depth);
          const n = ctx.loopCount++;
          const iterVar = `_g_iter_${n}`;
          const tmpVar = `_g_${n}`;
          const bindName2 = node.binding.kind === 'Ident' ? node.binding.name : null;
          p(`TscGraphemeIter ${iterVar} = tsc_graphemes(${strC});`);
          p(`String ${tmpVar} = {0};`);
          p(`while (tsc_graphemes_next(&${iterVar}, &${tmpVar})) {`);
          if (bindName2) {
            lines.push(`${II}${qual}String ${bindName2} = ${tmpVar};`);
            ctx.define(bindName2, { ctype: 'String', varKind: node.varKind });
          }
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          p('}');
          break;
        }

        // for (const [k, v] of u.searchParams) тЖТ TscURLParamIter while loop
        if (ctx._stdUrlImported &&
            node.iterable.kind === 'Member' && node.iterable.prop === 'searchParams' &&
            node.binding.kind === 'ArrayPattern') {
          const urlObj = node.iterable.object;
          const urlSym = urlObj.kind === 'Ident' ? ctx.lookup(urlObj.name) : null;
          if (urlSym?._isURL) {
            const urlName = urlObj.kind === 'Ident' ? urlObj.name : '';
            const n = ctx.loopCount++;
            const iterVar = `_iter_${n}`;
            const paramVar = `_p_${n}`;
            p(`TscURLParamIter ${iterVar} = tsc_url_params_iter(&${urlName});`);
            p(`TscURLParam ${paramVar} = {0};`);
            p(`while (tsc_url_params_next(&${iterVar}, &${paramVar})) {`);
            const [kElem, vElem] = node.binding.elems;
            if (kElem) {
              lines.push(`${II}${qual}String ${kElem.name} = ${paramVar}.key;`);
              ctx.define(kElem.name!, { ctype: 'String', varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}String ${vElem.name} = ${paramVar}.value;`);
              ctx.define(vElem.name!, { ctype: 'String', varKind: node.varKind });
            }
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            p('}');
            break;
          }
        }

        // for (const v of set) тЖТ index loop over TscSet_SUFFIX._vals
        {
          const _setSym = node.iterable.kind === 'Ident' ? ctx.lookup(node.iterable.name) : null;
          if (_setSym?._isSet) {
            const _sfx = _setSym._setSuffix;
            const _eC  = _setSym._setElemCType;
            const _setC = ctx.exprToC(node.iterable, lines, depth);
            const _ivar = `_i_${ctx.loopCount++}`;
            const _bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
            if (_setSym) { ctx.pushScope(); ctx._trackRefBorrow(_setSym); }
            p(`for (size_t ${_ivar} = 0; ${_ivar} < ${_setC}.size; ${_ivar}++) {`);
            if (_bindName) {
              lines.push(`${II}${qual}${_eC} ${_bindName} = ${_setC}._vals[${_ivar}];`);
              ctx.define(_bindName, { ctype: _eC, varKind: node.varKind });
            }
            ctx._pushLoopCleanups();
            ctx._loopDepth++;
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            ctx._loopDepth--;
            ctx._emitLoopBodyCleanups(lines, II);
            ctx._popLoopCleanups();
            p('}');
            if (_setSym) ctx.popScope();
            break;
          }
        }

        // for (const [i, v] of arr.entries()) -> cached entries loop
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'entries' &&
            node.binding.kind === 'ArrayPattern') {
          const arrObj = node.iterable.callee.object;
          const arrSym = arrObj.kind === 'Ident' ? ctx.lookup(arrObj.name) : null;
          const arrType = arrSym?.ctype ?? ctx.inferType(arrObj);
          if (arrType?.startsWith('Array_')) {
            const etIdent = arrType.slice(6);
            const etCType = ctx._arrIdentToCType(etIdent);
            const tupleName = `Tuple_i32_${etIdent}`;
            const tupleArrName = `Array_${tupleName}`;
            ctx.addTop(`typedef struct { int32_t _0; ${etCType} _1; } ${tupleName};`);
            ctx._ensureArrayStruct(tupleArrName, tupleName);
            const arrObjC = ctx.exprToC(arrObj, lines, depth);
            const entTmp = `_ent_${ctx.tempCount++}`;
            const ivar = `_i_${ctx.loopCount++}`;
            p(`${tupleArrName} ${entTmp} = tsc_array_entries_${etIdent}(${arrObjC});`);
            if (arrSym) { ctx.pushScope(); ctx._trackRefBorrow(arrSym); }
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmp}.length; ${ivar}++) {`);
            const [iElem, vElem] = node.binding.elems;
            if (iElem) {
              lines.push(`${II}${qual}int32_t ${iElem.name} = (int32_t)${ivar};`);
              ctx.define(iElem.name!, { ctype: 'int32_t', varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${etCType} ${vElem.name} = ${entTmp}.data[${ivar}]._1;`);
              ctx.define(vElem.name!, { ctype: etCType, varKind: node.varKind });
            }
            ctx._pushLoopCleanups();
            ctx._loopDepth++;
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            ctx._loopDepth--;
            ctx._emitLoopBodyCleanups(lines, II);
            ctx._popLoopCleanups();
            p('}');
            if (arrSym) ctx.popScope();
            break;
          }
          const setSym = arrSym?._isSet ? arrSym : null;
          if (setSym) {
            const _sElemCType = setSym._setElemCType ?? 'int32_t';
            const _sSfx = setSym._setSuffix;
            const _sElemIdent = ctx.cTypeToIdent(_sElemCType);
            const tupleName = `Tuple_${_sElemIdent}_${_sElemIdent}`;
            const tupleArrName = `Array_${tupleName}`;
            ctx.addTop(`typedef struct { ${_sElemCType} _0; ${_sElemCType} _1; } ${tupleName};`);
            ctx._ensureArrayStruct(tupleArrName, tupleName);
            const setC = ctx.exprToC(arrObj, lines, depth);
            const entTmp = `_ent_${ctx.tempCount++}`;
            const ivar = `_i_${ctx.loopCount++}`;
            p(`${tupleArrName} ${entTmp} = tsc_set_entries_${_sSfx}(${setC});`);
            if (setSym) { ctx.pushScope(); ctx._trackRefBorrow(setSym); }
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmp}.length; ${ivar}++) {`);
            const [aElem, bElem] = node.binding.elems;
            if (aElem) {
              lines.push(`${II}${qual}${_sElemCType} ${aElem.name} = ${entTmp}.data[${ivar}]._0;`);
              ctx.define(aElem.name!, { ctype: _sElemCType, varKind: node.varKind });
            }
            if (bElem) {
              lines.push(`${II}${qual}${_sElemCType} ${bElem.name} = ${entTmp}.data[${ivar}]._1;`);
              ctx.define(bElem.name!, { ctype: _sElemCType, varKind: node.varKind });
            }
            ctx._pushLoopCleanups();
            ctx._loopDepth++;
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            ctx._loopDepth--;
            ctx._emitLoopBodyCleanups(lines, II);
            ctx._popLoopCleanups();
            p('}');
            if (setSym) ctx.popScope();
            break;
          }
        }

        // for (const [k, v] of map) -> index loop over map._keys[i]/_vals[i]
        {
          const _mapSym = node.iterable.kind === 'Ident' ? ctx.lookup(node.iterable.name) : null;
          const _mapType = _mapSym?.ctype ?? (node.iterable.kind === 'Ident' ? null : ctx.inferType(node.iterable));
          if (_mapType?.startsWith('TscMap_') && node.binding.kind === 'ArrayPattern') {
            const _mapSuffix = _mapType.slice(7);
            const _parts = _mapSuffix.split('_');
            const _kIdent = _parts[0];
            const _vIdent = _parts.slice(1).join('_');
            const _kCType = ctx._arrIdentToCType(_kIdent);
            const _vCType = ctx._arrIdentToCType(_vIdent);
            const _mapC = ctx.exprToC(node.iterable, lines, depth);
            const _ivar = `_i_${ctx.loopCount++}`;
            const [kElem, vElem] = node.binding.elems;
            if (_mapSym) { ctx.pushScope(); ctx._trackRefBorrow(_mapSym); }
            p(`for (size_t ${_ivar} = 0; ${_ivar} < ${_mapC}.size; ${_ivar}++) {`);
            if (kElem) {
              lines.push(`${II}${qual}${_kCType} ${kElem.name} = ${_mapC}._keys[${_ivar}];`);
              ctx.define(kElem.name!, { ctype: _kCType, varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${_vCType} ${vElem.name} = ${_mapC}._vals[${_ivar}];`);
              ctx.define(vElem.name!, { ctype: _vCType, varKind: node.varKind });
            }
            ctx._pushLoopCleanups();
            ctx._loopDepth++;
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            ctx._loopDepth--;
            ctx._emitLoopBodyCleanups(lines, II);
            ctx._popLoopCleanups();
            p('}');
            if (_mapSym) ctx.popScope();
            break;
          }
        }

        // Iterable<T> protocol: class implements Iterable<T>
        {
          const _forOfSym = node.iterable.kind === 'Ident' ? ctx.lookup(node.iterable.name) : null;
          const _forOfClass = _forOfSym?.ctype ? ctx.classes.get(_forOfSym.ctype) : null;
          if (_forOfClass?._iterStructName && _forOfClass._iterableElemType) {
            const _clsName = _forOfSym!.ctype;
            const _elemC = _forOfClass._iterableElemType;
            const _elemIdent = ctx.cTypeToIdent(_elemC);
            const _isComplex = !ctx._isSimpleCType(_elemC);
            const _optType = _isComplex ? `iter_opt_${_elemIdent}` : `opt_${_elemIdent}`;
            const _n = ctx.loopCount++;
            const _iterVar = `_iter_${_n}`;
            const _elemVar = `_elem_${_n}`;
            const _objC = ctx.exprToC(node.iterable, lines, depth);
            if (_forOfSym) { ctx.pushScope(); ctx._trackRefBorrow(_forOfSym); }
            p(`${_forOfClass._iterStructName} ${_iterVar} = ${_clsName}_iter(&${_objC});`);
            p(`${_optType} ${_elemVar} = {0};`);
            p(`while ((${_elemVar} = ${_clsName}_iter_next(&${_iterVar})).has_value) {`);
            const _bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
            if (_bindName) {
              const _isComplex = !ctx._isSimpleCType(_elemC);
              if (_isComplex) {
                const ptrQual = node.varKind === 'const' ? 'const ' : '';
                lines.push(`${II}${ptrQual}${_elemC} *${_bindName} = ${_elemVar}.value;`);
                ctx.define(_bindName, { ctype: `${_elemC} *`, varKind: node.varKind });
              } else {
                lines.push(`${II}${qual}${_elemC} ${_bindName} = ${_elemVar}.value;`);
                ctx.define(_bindName, { ctype: _elemC, varKind: node.varKind });
              }
            }
            ctx._pushLoopCleanups();
            ctx._loopDepth++;
            ctx.visitStmtOrBlock(node.body, lines, depth + 1);
            ctx._loopDepth--;
            ctx._emitLoopBodyCleanups(lines, II);
            ctx._popLoopCleanups();
            p('}');
            if (_forOfSym) ctx.popScope();
            break;
          }
        }

        const iterC = ctx.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${ctx.loopCount++}`;
        let elemType = 'int32_t';
        const iterSym = node.iterable.kind === 'Ident' ? ctx.lookup(node.iterable.name) : null;
        if (node.binding.kind === 'Ident' && node.binding.typeAnn) {
          elemType = ctx.resolveType(node.binding.typeAnn);
        } else if (iterSym?.arrElemCType) {
          elemType = iterSym.arrElemCType;
        } else if (iterSym?.ctype === 'String') {
          elemType = 'char';
        }
        const bindName = node.binding.kind === 'Ident' ? node.binding.name : null;

        const _isComplexType = !ctx._isSimpleCType(elemType);

        if (iterSym) { ctx.pushScope(); ctx._trackRefBorrow(iterSym); }
        p(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          if (_isComplexType) {
            const ptrQual = node.varKind === 'const' ? 'const ' : '';
            lines.push(`${II}${ptrQual}${elemType} *${bindName} = &${iterC}.data[${ivar}];`);
            ctx.define(bindName, { ctype: `${elemType} *`, varKind: node.varKind });
          } else {
            lines.push(`${II}${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
            ctx.define(bindName, { ctype: elemType, varKind: node.varKind });
          }
        } else if (node.binding.kind === 'ArrayPattern') {
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`${II}${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            ctx.define(elem.name!, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        ctx._pushLoopCleanups();
        ctx._loopDepth++;
        ctx.visitStmtOrBlock(node.body, lines, depth + 1);
        ctx._loopDepth--;
        ctx._emitLoopBodyCleanups(lines, II);
        ctx._popLoopCleanups();
        p('}');
        if (iterSym) ctx.popScope();
        ctx._asyncBreakStack = _savedAsyncBreak4;
        ctx._asyncContinueStack = _savedAsyncCont4;
        break;
      }

      case 'ForIn': {
        throw ctx.error(`SyntaxError: 'for-in' loops are not supported; use 'for-of' instead`, node);
        break;
      }

      case 'While': {
        ctx._checkNoBareThrows(node.test);
        const _savedAsyncBreak = ctx._asyncBreakStack;
        const _savedAsyncCont = ctx._asyncContinueStack;
        ctx._asyncBreakStack = null;
        ctx._asyncContinueStack = null;
        if (ctx._inMathTry) {
          p('while (1) {');
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          const condLines: string[] = [];
          const testC = ctx._truthyToC(node.test, condLines, depth + 1);
          for (const cl of condLines) lines.push(cl);
          const IS = ' '.repeat(ctx.indent * (depth + 1));
          lines.push(`${IS}if (!(${testC})) break;`);
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          ctx._loopDepth--;
          ctx._emitLoopBodyCleanups(lines, IS);
          ctx._popLoopCleanups();
          p('}');
        } else {
          const testC = ctx._truthyToC(node.test, lines, depth);
          p(`while (${testC}) {`);
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          ctx._loopDepth--;
          ctx._emitLoopBodyCleanups(lines, ' '.repeat(ctx.indent * (depth + 1)));
          ctx._popLoopCleanups();
          p('}');
        }
        ctx._asyncBreakStack = _savedAsyncBreak;
        ctx._asyncContinueStack = _savedAsyncCont;
        break;
      }

      case 'DoWhile': {
        ctx._checkNoBareThrows(node.test);
        const _savedAsyncBreak2 = ctx._asyncBreakStack;
        const _savedAsyncCont2 = ctx._asyncContinueStack;
        ctx._asyncBreakStack = null;
        ctx._asyncContinueStack = null;
        if (ctx._inMathTry) {
          p('do {');
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          const IS = ' '.repeat(ctx.indent * (depth + 1));
          const condLines: string[] = [];
          const testC = ctx._truthyToC(node.test, condLines, depth + 1);
          for (const cl of condLines) lines.push(cl);
          lines.push(`${IS}if (!(${testC})) break;`);
          ctx._loopDepth--;
          ctx._emitLoopBodyCleanups(lines, IS);
          ctx._popLoopCleanups();
          p('} while (1);');
        } else {
          const testC = ctx._truthyToC(node.test, lines, depth);
          p('do {');
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          ctx.visitStmtOrBlock(node.body, lines, depth + 1);
          ctx._loopDepth--;
          ctx._emitLoopBodyCleanups(lines, ' '.repeat(ctx.indent * (depth + 1)));
          ctx._popLoopCleanups();
          p(`} while (${testC});`);
        }
        ctx._asyncBreakStack = _savedAsyncBreak2;
        ctx._asyncContinueStack = _savedAsyncCont2;
        break;
      }

      case 'Break':
        if (node.label) {
          ctx._emitAllLoopCleanups(lines, I);
          p(`goto ${node.label}_break;`);
        } else if (ctx._asyncBreakStack?.length) {
          p(`goto ${ctx._asyncBreakStack[ctx._asyncBreakStack.length - 1]};`);
        } else {
          ctx._emitLoopBodyCleanups(lines, I);
          p('break;');
        }
        break;
      case 'Continue':
        if (node.label) {
          ctx._emitAllLoopCleanups(lines, I);
          p(`goto ${node.label}_continue;`);
        } else if (ctx._asyncContinueStack?.length) {
          p(`goto ${ctx._asyncContinueStack[ctx._asyncContinueStack.length - 1]};`);
        } else {
          ctx._emitLoopBodyCleanups(lines, I);
          p('continue;');
        }
        break;

      case 'Labeled': {
        const label = node.label;
        const inner = node.body;
        const usesBreak    = ctx.labelUsed(inner, label, 'break');
        const usesContinue = ctx.labelUsed(inner, label, 'continue');
        if (inner.kind === 'While' || inner.kind === 'For') {
          let headerLine;
          if (inner.kind === 'While') {
            const testC = ctx.exprToC(inner.test, lines, depth);
            headerLine = `while (${testC}) {`;
          } else {
            let initC = '';
            if (inner.init?.kind === 'VarDecl') {
              const { varKind, name, typeAnn, init } = inner.init;
              const ctype = typeAnn ? ctx.resolveType(typeAnn) : (init ? ctx.inferType(init) : 'int32_t');
              const initExpr = init ? ctx.exprToC(init, lines, depth) : '0';
              initC = `${ctype} ${name} = ${initExpr}`;
              ctx.define(name, { ctype, varKind });
            }
            const testC = inner.test ? ctx.exprToC(inner.test, lines, depth) : '';
            const updC  = inner.update ? ctx.exprToC(inner.update, lines, depth) : '';
            headerLine = `for (${initC}; ${testC}; ${updC}) {`;
          }
          p(headerLine);
          ctx._pushLoopCleanups();
          ctx._loopDepth++;
          const bodyLines: string[] = [];
          ctx.visitStmtOrBlock(inner.body, bodyLines, depth + 1);
          for (const bl of bodyLines) lines.push(bl);
          ctx._emitLoopBodyCleanups(lines, ' '.repeat(ctx.indent * (depth + 1)));
          ctx._loopDepth--;
          ctx._popLoopCleanups();
          if (usesContinue) {
            const II = ' '.repeat(ctx.indent * (depth + 1));
            lines.push(`${II}${label}_continue:;`);
          }
          p('}');
          if (usesBreak) p(`${label}_break:;`);
        } else if (inner.kind === 'ForOf' || inner.kind === 'ForIn') {
          ctx.visitStmt(inner, lines, depth);
          if (usesBreak) p(`${label}_break:;`);
        } else {
          ctx.visitStmt(inner, lines, depth);
        }
        break;
      }

      case 'Throw': {
        ctx._checkNoBareThrows(node.value);
        const val = node.value;
        // Error: throw inside finally block
        if (ctx._inFinallyBlock) {
          throw ctx.error('TypeError: Cannot throw inside a finally block');
        }
        // Error: throw string literal
        if (val?.kind === 'Literal' && val.litType === 'string') {
          throw ctx.error('can only throw Error instances, not string');
        }
        // Error: throw in function without throws declaration
        // (never-return functions are exempt тАФ they are expected to throw/abort)
        if (!ctx._throwsCtx && ctx.inFunction && !ctx._currentFuncIsNever) {
          throw ctx.error(`function "${ctx.currentFuncName}" throws but does not declare "throws"`);
        }

        if (ctx._throwsCtx) {
          ctx._emitPoolDrops(lines, I);
          const tc = ctx._throwsCtx;
          if (val?.kind === 'New') {
            const errClass = val.name === 'Error' ? 'TscError' : val.name;
            const msgArg = val.args?.[0];
            const msgC = msgArg ? ctx.exprToC(msgArg.expr ?? msgArg, lines, depth) : 'STR_LIT("")';
            const errCtor = errClass === 'TscError' ? `(TscError){ .message = ${msgC} }` : `${errClass}_new(${msgC})`;
            if (tc.throwsNames.length === 1) {
              if (ctx._usesGotoCleanup) {
                ctx._emitFuncCleanup(lines, I);
                p(`_result = (${tc.resultType}){.ok = false, .error = ${errCtor}};`);
                p(`goto cleanup;`);
              } else {
                ctx._emitFuncCleanup(lines, I);
                p(`return (${tc.resultType}){.ok = false, .error = ${errCtor}};`);
              }
            } else {
              const idx = tc.throwsNames.indexOf(errClass);
              const errUnionName = `_ErrUnion_${tc.errKey}`;
              p(`${errUnionName} _err = {.tag = _Err_${errClass}, ._${idx} = ${errCtor}};`);
              if (ctx._usesGotoCleanup) {
                ctx._emitFuncCleanup(lines, I);
                p(`_result = (${tc.resultType}){.ok = false, .error = _err};`);
                p(`goto cleanup;`);
              } else {
                ctx._emitFuncCleanup(lines, I);
                p(`return (${tc.resultType}){.ok = false, .error = _err};`);
              }
            }
          } else {
            const errC = ctx.exprToC(val!, lines, depth);
            if (ctx._usesGotoCleanup) {
              ctx._emitFuncCleanup(lines, I);
              p(`_result = (${tc.resultType}){.ok = false, .error = ${errC}};`);
              p(`goto cleanup;`);
            } else {
              ctx._emitFuncCleanup(lines, I);
              p(`return (${tc.resultType}){.ok = false, .error = ${errC}};`);
            }
          }
        } else {
          ctx._emitPoolDrops(lines, I);
          // Not in throws function — fall back to tsc_throw
          if (val?.kind === 'New' && val.name === 'Error' && val.args?.length === 1) {
            const msgC = ctx.exprToC(val.args[0].expr ?? val.args[0], lines, depth);
            p(`tsc_throw("E411", ${msgC});`);
          } else {
            const errC = ctx.exprToC(val, lines, depth);
            p(`tsc_throw("E411", ${errC});`);
          }
        }
        break;
      }

      case 'TryCatch': {
        const tryStmts = node.body?.body ?? node.body ?? [];

        // Require explicit type annotation in catch clauses
        for (const c of node.catches ?? []) {
          if (c.param && !c.typeAnn) {
            throw ctx.error(`TypeError: catch clause requires explicit error type`, c);
          }
        }

        // Check if any catch clause catches MathError
        const hasMathCatch = (node.catches ?? []).some((c) => c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === 'MathError');

        if (hasMathCatch) {
          const catchIdx = ctx.tempCount++;
          const catchLabel = `_catch_${catchIdx}`;
          const catchEndLabel = `_catch_end_${catchIdx}`;
          const errVar = `_math_err_${catchIdx}`;

          p(`MathError ${errVar} = {0};`);

          const prevInMathTry = ctx._inMathTry;
          const prevMathCatchLabel = ctx._mathCatchLabel;
          const prevMathErrVar = ctx._mathErrVar;
          ctx._inMathTry = true;
          ctx._mathCatchLabel = catchLabel;
          ctx._mathErrVar = errVar;

          for (const s of tryStmts) {
            ctx.visitStmt(s, lines, depth);
          }

          ctx._inMathTry = prevInMathTry;
          ctx._mathCatchLabel = prevMathCatchLabel;
          ctx._mathErrVar = prevMathErrVar;

          p(`goto ${catchEndLabel};`);
          p(`${catchLabel}:`);
          for (const c of node.catches ?? []) {
            if (c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === 'MathError') {
              ctx.pushScope();
              if (c.param) {
                ctx.define(c.param, { ctype: 'MathError', _alias: errVar });
              }
              ctx.visitBlock(c.body, lines, depth);
              ctx.popScope();
              break;
            }
          }
          p(`${catchEndLabel}:;`);

          if (node.finally) {
            ctx._inFinallyBlock = true;
            ctx.visitBlock(node.finally, lines, depth);
            ctx._inFinallyBlock = false;
          }
          break;
        }

        // Check if try body contains a call to a throws function
        const _findThrowsFuncCall = (stmts: Stmt[]): Stmt | null => {
          for (const s of stmts) {
            if (s.kind === 'ExprStmt' && s.expr?.kind === 'Call') {
              const callee = s.expr.callee;
              const sym = callee.kind === 'Ident' ? ctx.lookup(callee.name) : null;
              if (sym?._isThrowsFunc) return s;
            }
            if (s.kind === 'VarDecl' && s.init?.kind === 'Call') {
              const callee = s.init.callee;
              const sym = callee?.kind === 'Ident' ? ctx.lookup(callee.name) : null;
              if (sym?._isThrowsFunc) return s;
            }
          }
          return null;
        };
        const throwsFuncCallStmt = _findThrowsFuncCall(tryStmts);

        if (throwsFuncCallStmt) {
          // New Result-based pattern
          ctx._emitTryCatchResult(node, tryStmts, throwsFuncCallStmt, lines, depth);
        } else {
          const _hasPoolNew = (stmts: Stmt[]): boolean => {
            for (const s of stmts) {
              if (s.kind === 'VarDecl' && s.init?.kind === 'New') {
                const cls = ctx.classes.get(s.init.name);
                if (cls?._isPool) return true;
              }
              if (s.kind === 'ExprStmt' && s.expr?.kind === 'New') {
                const cls = ctx.classes.get(s.expr.name);
                if (cls?._isPool) return true;
              }
            }
            return false;
          };

          if (_hasPoolNew(tryStmts)) {
            const catchIdx = ctx.tempCount++;
            const catchLabel = `_catch_${catchIdx}`;
            const catchEndLabel = `_catch_end_${catchIdx}`;
            const errVar = `_catch_err_${catchIdx}`;
            const catches = node.catches ?? [];

            p(`TscError ${errVar} = {0};`);

            const prevInTryBlock = ctx._inTryBlock;
            const prevTryCatchInfo = ctx._tryCatchInfo;
            ctx._inTryBlock = true;
            ctx._tryCatchInfo = { catchLabel, errVar, catches };

            for (const s of tryStmts) {
              const isThrowNew = s.kind === 'Throw' && s.value?.kind === 'New';
              if (isThrowNew) {
                const val = s.value;
                const valName = val?.kind === 'New' ? val.name : '';
                const errClass = valName === 'Error' ? 'TscError' : valName;
                const errVarName = `_err_${ctx.tempCount++}`;
                const errC = ctx.exprToC(val!, lines, depth);
                p(`${errClass} ${errVarName} = ${errC};`);
                for (const c of catches) {
                  if (!c.typeAnn || (c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === errClass) || (errClass === 'TscError' && c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === 'Error')) {
                    ctx.pushScope();
                    ctx.define(c.param!, { ctype: errClass, _alias: errVarName });
                    ctx.visitBlock(c.body, lines, depth);
                    ctx.popScope();
                  }
                }
              } else {
                ctx.visitStmt(s, lines, depth);
              }
            }

            ctx._inTryBlock = prevInTryBlock;
            ctx._tryCatchInfo = prevTryCatchInfo;

            p(`goto ${catchEndLabel};`);
            p(`${catchLabel}:`);
            for (const c of catches) {
              ctx.pushScope();
              if (c.param) {
                const catchType = (c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === 'Error') ? 'TscError' : (c.typeAnn?.kind === 'TypeRef' ? c.typeAnn.name : 'TscError');
                ctx.define(c.param, { ctype: catchType, _alias: errVar });
              }
              ctx.visitBlock(c.body, lines, depth);
              ctx.popScope();
              break;
            }
            p(`${catchEndLabel}:;`);

            if (node.finally) {
              ctx._inFinallyBlock = true;
              ctx.visitBlock(node.finally, lines, depth);
              ctx._inFinallyBlock = false;
            }
          } else {
            for (const s of tryStmts) {
              const isThrowNew = s.kind === 'Throw' && s.value?.kind === 'New';
              if (isThrowNew) {
                const val = s.value;
                const valName = val?.kind === 'New' ? val.name : '';
                const errClass = valName === 'Error' ? 'TscError' : valName;
                const errVarName = `_err_${ctx.tempCount++}`;
                const errC = ctx.exprToC(val!, lines, depth);
                p(`${errClass} ${errVarName} = ${errC};`);
                for (const c of node.catches) {
                  if (!c.typeAnn || (c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === errClass) || (errClass === 'TscError' && c.typeAnn?.kind === 'TypeRef' && c.typeAnn.name === 'Error')) {
                    ctx.pushScope();
                    ctx.define(c.param!, { ctype: errClass, _alias: errVarName });
                    ctx.visitBlock(c.body, lines, depth);
                    ctx.popScope();
                  }
                }
              } else {
                ctx.visitStmt(s, lines, depth);
              }
            }
            if (node.finally) {
              ctx._inFinallyBlock = true;
              ctx.visitBlock(node.finally, lines, depth);
              ctx._inFinallyBlock = false;
            }
          }
        }
        break;
      }

      case 'Switch': {
        ctx._checkNoBareThrows(node.discriminant);
        ctx._validateSwitchFallthrough(node);
        const discType = ctx.inferType(node.discriminant);
        const discC = ctx.exprToC(node.discriminant, lines, depth);
        const IS = ' '.repeat(ctx.indent * (depth + 1));
        p(`switch (${discC}) {`);
        const discEnumDef = ctx.classes.get(discType);
        let hasDefault = false;
        for (const c of node.cases) {
          if (c.test) {
            let caseC;
            if (discEnumDef?.isStringLiteralUnion && c.test.kind === 'Literal' && c.test.litType === 'string') {
              caseC = `${discType}_${c.test.value}`;
            } else {
              const _prevET_case = ctx._expectedType;
              const _decDisc = resolveDecimalBase(ctx, discType);
              if (_decDisc) ctx._expectedType = _decDisc;
              caseC = ctx.exprToC(c.test, lines, depth);
              ctx._expectedType = _prevET_case;
            }
            lines.push(`${IS}case ${caseC}:`);
          } else {
            hasDefault = true;
            lines.push(`${IS}default:`);
          }
          for (const s of c.body) ctx.visitStmt(s, lines, depth + 2);
        }
        if (!hasDefault && ctx._strictRules?.has('switch-default')) {
          lines.push(`${IS}default: break;`);
        }
        p('}');
        break;
      }

      case 'Native': {
        if (ctx._strictRules?.has('no-native')) {
          throw ctx.error('native C blocks are forbidden in strict mode (no-native)', node);
        }
        let nativeOut = '';
        if (node.templateParts) {
          // native(`... ${expr} ...`) тАФ interpolate expressions
          for (const part of node.templateParts) {
            if (part.kind === 'str') {
              nativeOut += part.value;
            } else if (part.kind === 'expr') {
              // Re-parse the expression source (same as _templateToC in misc/closures.ts)
              const toks = ctx._lex(part.src!, ctx.filename);
              const { ast } = ctx._parse(toks);
              const exprNode = ((ast.body[0] as unknown as { expr?: Expression })?.expr ?? ast.body[0]) as Expression;
              nativeOut += ctx.exprToC(exprNode, lines, depth);
            }
          }
        } else {
          // native "..." тАФ verbatim string, unescape escaped quotes
          nativeOut = (node.content ?? '').replace(/\\"/g, '"');
        }
        // Check for undeclared types used as pointer bases: word * varname
        const knownCTypes = new Set([
          'int', 'char', 'void', 'float', 'double', 'bool', 'long', 'short', 'unsigned',
          'int8_t', 'int16_t', 'int32_t', 'int64_t',
          'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
          'size_t', 'ssize_t', 'ptrdiff_t', 'uintptr_t', 'intptr_t',
          'String', 'TscError',
        ]);
        const ptrPattern = /\b([a-zA-Z_]\w*)\s*\*/g;
        let m;
        while ((m = ptrPattern.exec(nativeOut)) !== null) {
          const typeName = m[1];
          if (!knownCTypes.has(typeName) && !ctx.classes.has(typeName) && !ctx.interfaces.has(typeName)) {
            throw ctx.error(`TypeError: Native block references undeclared type '${typeName}'; declare it or use @[native_type]`);
          }
        }
        p(nativeOut);
        break;
      }

      case 'Unsafe': {
        if (ctx._strictRules?.has('no-unsafe')) {
          throw ctx.error('unsafe blocks are forbidden in strict mode (no-unsafe)', node);
        }
        p('{');
        const prevUnsafe = ctx._inUnsafe;
        ctx._inUnsafe = true;
        ctx.visitBlock(node.body, lines, depth + 1);
        ctx._inUnsafe = prevUnsafe;
        p('}');
        break;
      }

      case 'Spawn': {
        const threadVar = ctx._emitSpawnBlock(null, node.body, node.throwsTypes ?? null, lines, depth);
        p(`(void)${threadVar};`);
        break;
      }

      case 'Noop': break;
      default:
        throw ctx.error(`internal: unhandled statement kind '${node.kind}'`, node);
    }
}

const _SIMPLE_C_TYPES = new Set([
    'int8_t', 'int16_t', 'int32_t', 'int64_t',
    'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
    'float', 'double', 'bool', 'size_t', 'ptrdiff_t',
    'char', 'String', 'tsc_unknown',
  ]);

export function _validateSwitchFallthrough(ctx: CodeGenContext, node: Switch) {
    if (ctx.inferType(node.discriminant) === 'double' || ctx.inferType(node.discriminant) === 'float') {
      throw ctx.error(`cannot switch on type 'f64'`, node);
    }
    for (let ci = 0; ci < node.cases.length; ci++) {
      const c = node.cases[ci];
      if (c.body.length === 0) continue;
      const last = c.body[c.body.length - 1];
      const isTerminator = last.kind === 'Break' || last.kind === 'Return' ||
                           last.kind === 'Throw' || last.kind === 'Continue';
      if (!isTerminator && ci < node.cases.length - 1) {
        throw ctx.errorCode('E005', last, undefined, {
          label: 'add `break;` or `return` to end this case',
        });
      }
    }
}

export function _isSimpleCType(ctx: CodeGenContext, ct: string) {
    return _SIMPLE_C_TYPES.has(ct);
}
