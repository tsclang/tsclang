export default {
  _emitRetainIfNeeded(this: any, valC: any, valNode: any, p: any) {
    if (valNode.kind === 'Ident') {
      const sym = this.lookup(valNode.name);
      if (sym?.isArc) {
        p(`tsc_arc_retain(${valC});`);
        return;
      }
    }
    if (this.inferType(valNode) === 'String' && ['Ident', 'Member', 'Index'].includes(valNode.kind)) {
      p(`tsc_string_retain(${valC});`);
    }
  },

  _wrapErrForCaller(this: any, ctx: any, errExpr: any, calleeSym: any) {
    if (ctx.throwsNames.length <= 1) return errExpr;
    const calleeErrTypes = calleeSym?._resultErrTypes ?? [];
    if (calleeErrTypes.length > 1) return errExpr;
    const errType = calleeErrTypes[0];
    if (!errType) return errExpr;
    const idx = ctx.throwsNames.indexOf(errType);
    if (idx === -1) return errExpr;
    return `(_ErrUnion_${ctx.errKey}){.tag = _Err_${errType}, ._${idx} = ${errExpr}}`;
  },

  _visitControlFlow(this: any, node: any, lines: any, depth: any) {
    this._currentNode = node;
    const I = ' '.repeat(this.indent * depth);
    const p = (s: any) => lines.push(I + s);
    switch (node.kind) {
      case 'ExprStmt': {
        const expr = node.expr;
        // Auto-propagate calls to throws functions inside a throws function or math try/catch
        if ((this._throwsCtx || this._inMathTry) && expr.kind === 'Call') {
          const callee = expr.callee;
          const sym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
          if (sym?._isThrowsFunc) {
            const ctx = this._throwsCtx;
            const resName = `_res_${this.tempCount++}`;
            const callC = this.exprToC(expr, lines, depth);
            p(`${sym._resultType} ${resName} = ${callC};`);
            p(`if (!${resName}.ok) {`);
            if (this._inMathTry && sym._resultErrTypes?.length === 1 && sym._resultErrTypes[0] === 'MathError') {
              p(`    ${this._mathErrVar} = ${resName}.error;`);
              p(`    goto ${this._mathCatchLabel};`);
            } else if (ctx?._usesGotoCleanup ?? this._usesGotoCleanup) {
              this._emitFuncCleanup(lines, I + '    ');
              p(`    _result = (${ctx.resultType}){.ok = false, .error = ${this._wrapErrForCaller(ctx, `${resName}.error`, sym)}};`);
              p(`    goto cleanup;`);
            } else if (ctx) {
              this._emitFuncCleanup(lines, I + '    ');
              p(`    return (${ctx.resultType}){.ok = false, .error = ${this._wrapErrForCaller(ctx, `${resName}.error`, sym)}};`);
            } else {
              p(`    /* unhandled throws error in non-throwing context */`);
            }
            p(`}`);
            this._flushPostStmtCleanups(lines);
            break;
          }
        }
        if (!this._throwsCtx && !this._inMathTry && expr.kind === 'Call' && expr.callee?.kind === 'Ident') {
          const sym = this.lookup(expr.callee.name);
          if (sym?._isThrowsFunc) {
            throw this.error(
              `TypeError: Call to throws function '${expr.callee.name}()' requires error handling: use '?', '!', try/catch, or declare 'throws' on the enclosing function`,
              node
            );
          }
        }
        const c = this.exprToC(node.expr, lines, depth);
        if (c && c !== '') {
          // Block-form assignments (&&=, ||=, ??=) already include semicolons
          if ((c.startsWith('{') && c.endsWith('}')) || c.startsWith('if (')) p(c);
          else p(`${c};`);
        }
        this._flushPostStmtCleanups(lines);
        break;
      }

      case 'Return': {
        // Inside Iterable iter_next body: translate return null/val to opt_T
        if (this._inIterNextBody) {
          const optType = this._iterNextOptType;
          const isNull = !node.value || (node.value.kind === 'Literal' && node.value.litType === 'null');
          if (isNull) {
            lines.push(`${I}return (${optType}){false, 0};`);
          } else {
            this._inReturnContext = true;
            const valC = this.exprToC(node.value, lines, depth);
            this._inReturnContext = false;
            this._emitRetainIfNeeded(valC, node.value, p);
            const retVal = this._iterNextIsComplex ? `&(${valC})` : valC;
            lines.push(`${I}return (${optType}){true, ${retVal}};`);
          }
          break;
        }
        // Error: return inside finally block
        if (this._inFinallyBlock) {
          throw this.error('TypeError: Cannot return inside a finally block');
        }
        // Error: returning Ref/Mut to local variable or array element (lifetime overflow)
        const funcSym = this.currentFuncName ? this.lookup(this.currentFuncName) : null;
        const retTypeAnn = funcSym?.returnType;
        const isRefReturn = retTypeAnn?.kind === 'TypeRef' && retTypeAnn.name === 'Ref';
        const isMutReturn = retTypeAnn?.kind === 'TypeRef' && retTypeAnn.name === 'Mut';
        if ((isRefReturn || isMutReturn) && node.value?.kind === 'Index') {
          throw this.error(`TypeError: Cannot return borrow to array element from function`);
        }
        if (this.currentFuncReturnType?.startsWith('const ') &&
            this.currentFuncReturnType?.includes(' *') &&
            node.value?.kind === 'Ident') {
          // Check if return type is Ref<T> (i.e., const T * from resolveType)
          // and the returned value is a local (non-param) variable
          const retSym = this.lookup(node.value.name);
          if (retSym && !retSym.isPointer && !retSym.isRefParam && !retSym.funcName) {
            throw this.error(`TypeError: Cannot return reference to local variable '${node.value.name}' that does not outlive the function`);
          }
        }
        if (isMutReturn && node.value?.kind === 'Ident') {
          const retSym = this.lookup(node.value.name);
          if (retSym && !retSym.isPointer && !retSym.isRefParam && !retSym.funcName) {
            throw this.error(`TypeError: Cannot return mutable borrow to local variable '${node.value.name}' that does not outlive the function`);
          }
        }
        // Unknown return: auto-wrap primitive in tsc_unknown_from_XXX
        const _isUnknownReturn = this.currentFuncReturnType === 'tsc_unknown';
        const _wrapUnknownReturn = (valC: any, valNode: any) => {
          if (!_isUnknownReturn) return valC;
          const valType = this.inferType(valNode);
          const packer = this._unknownPackerFor(valType);
          this._ensureUnknownStruct();
          return `${packer}(${valC})`;
        };
        // Auto-propagate: return throwsFunc() inside a throws function
        if (this._throwsCtx && node.value?.kind === 'Call') {
          const callee = node.value.callee;
          const sym = callee?.kind === 'Ident' ? this.lookup(callee.name) : null;
          if (sym?._isThrowsFunc) {
            const ctx = this._throwsCtx;
            const resName = `_res_${this.tempCount++}`;
            const callC = this.exprToC(node.value, lines, depth);
            p(`${sym._resultType} ${resName} = ${callC};`);
            if (this._inMathTry && sym._resultErrTypes?.length === 1 && sym._resultErrTypes[0] === 'MathError') {
              p(`if (!${resName}.ok) { ${this._mathErrVar} = ${resName}.error; goto ${this._mathCatchLabel}; }`);
            } else if (this._usesGotoCleanup) {
              this._emitFuncCleanup(lines, I);
              p(`if (!${resName}.ok) { _result = (${ctx.resultType}){.ok = false, .error = ${this._wrapErrForCaller(ctx, `${resName}.error`, sym)}}; goto cleanup; }`);
            } else {
              this._emitFuncCleanup(lines, I);
              p(`if (!${resName}.ok) { return (${ctx.resultType}){.ok = false, .error = ${this._wrapErrForCaller(ctx, `${resName}.error`, sym)}}; }`);
            }
            if (sym._resultIsVoid) {
              if (this._usesGotoCleanup) {
                p(`_result = (${ctx.resultType}){.ok = true};`);
                p(`goto cleanup;`);
              } else {
                p(`return (${ctx.resultType}){.ok = true};`);
              }
            } else {
              if (this._usesGotoCleanup) {
                p(`_result = (${ctx.resultType}){.ok = true, .value = ${resName}.value};`);
                p(`goto cleanup;`);
              } else {
                p(`return (${ctx.resultType}){.ok = true, .value = ${resName}.value};`);
              }
            }
            break;
          }
        }
        // goto cleanup pattern for throws functions with owned vars
        if (this._usesGotoCleanup) {
          const ctx = this._throwsCtx;
          if (node.value) {
            this._inReturnContext = true;
            const retC = _wrapUnknownReturn(this.exprToC(node.value, lines, depth), node.value);
            this._inReturnContext = false;
            const retIsOwnedIdent = node.value.kind === 'Ident' && this._hasCleanupFor(node.value.name);
            if (!_isUnknownReturn && !retIsOwnedIdent) this._emitRetainIfNeeded(retC, node.value, p);
            if (retIsOwnedIdent) this._suppressCleanupFor(node.value.name);
            this._markPoolVarMoved(node.value);
            p(`_result = (${ctx.resultType}){.ok = true, .value = ${retC}};`);
          } else {
            p(`_result = (${ctx.resultType}){.ok = true};`);
          }
          this._emitFuncCleanup(lines, I);
          p(`goto cleanup;`);
          break;
        }
        if (this._hasPendingCleanups() && node.value) {
          // Evaluate return value before cleanup to avoid use-after-free of owned vars
          this._inReturnContext = true;
          const retC = _wrapUnknownReturn(this.exprToC(node.value, lines, depth), node.value);
          this._inReturnContext = false;
          const retType = _isUnknownReturn ? 'tsc_unknown' : (this.inferType(node.value) ?? 'int32_t');
          const retIsOwnedIdent = node.value.kind === 'Ident' && this._hasCleanupFor(node.value.name);
          if (retIsOwnedIdent) {
            this._suppressCleanupFor(node.value.name);
            this._markPoolVarMoved(node.value);
            if (this._throwsCtx) {
              p(`return (${this._throwsCtx.resultType}){.ok = true, .value = ${retC}};`);
            } else {
              p(`return ${retC};`);
            }
            this._emitFuncCleanup(lines, I);
          } else {
            this._emitRetainIfNeeded(retC, node.value, p);
            this._markPoolVarMoved(node.value);
            const tmpName = `_ret_${this.tempCount++}`;
            p(`${retType} ${tmpName} = ${retC};`);
            this._emitFuncCleanup(lines, I);
            if (this._throwsCtx) {
              p(`return (${this._throwsCtx.resultType}){.ok = true, .value = ${tmpName}};`);
            } else {
              p(`return ${tmpName};`);
            }
          }
        } else {
          this._emitFuncCleanup(lines, I);
          if (this._throwsCtx) {
            const ctx = this._throwsCtx;
            if (node.value) {
              this._inReturnContext = true;
              const c = _wrapUnknownReturn(this.exprToC(node.value, lines, depth), node.value);
              this._inReturnContext = false;
              if (!_isUnknownReturn) this._emitRetainIfNeeded(c, node.value, p);
              this._markPoolVarMoved(node.value);
              p(`return (${ctx.resultType}){.ok = true, .value = ${c}};`);
            } else {
              p(`return (${ctx.resultType}){.ok = true};`);
            }
          } else {
            if (node.value) {
              this._inReturnContext = true;
              let c = _wrapUnknownReturn(this.exprToC(node.value, lines, depth), node.value);
              this._inReturnContext = false;
              if (this.currentFuncReturnType === 'tsc_closure' && node.value.kind === 'Ident') {
                const retSym = this.lookup(node.value.name);
                if (retSym?.funcName && !retSym.funcPtr) {
                  c = `(tsc_closure){.env = NULL, .fn = (void*)${c}}`;
                }
              }
              if (!_isUnknownReturn) this._emitRetainIfNeeded(c, node.value, p);
              const retSym = node.value.kind === 'Ident' ? this.lookup(node.value.name) : null;
              this._markPoolVarMoved(node.value);
              p(`return ${this._derefStrPtr(retSym, c)};`);
            } else {
              p('return;');
            }
          }
        }
        break;
      }

      case 'If': {
        // Detect narrowing: if (x != null) тЖТ narrow x to x.value inside block
        const isNullLit = (n: any) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
        let narrowVar: any = null;
        let upgradeReleaseVar: any = null;
        if (node.test.kind === 'Binary' && (node.test.op === '!=' || node.test.op === '!==')) {
          const nullSide = isNullLit(node.test.right) ? 'right' : isNullLit(node.test.left) ? 'left' : null;
          if (nullSide) {
            const optSide = nullSide === 'right' ? node.test.left : node.test.right;
            if (optSide.kind === 'Ident') {
              const sym = this.lookup(optSide.name);
              // Pool opt_ref types: don't narrow (member access routed via .value-> in expr/dispatch.ts)
              const isPool = sym?.ctype?.startsWith('opt_ref_') && this.classes.get(sym.ctype.slice(8))?._isPool;
              if (sym?.ctype?.startsWith('opt_') && !isPool) narrowVar = optSide.name;
              else if (sym?.isArcUpgrade) upgradeReleaseVar = optSide.name;
            }
          }
        }
        // Detect truthiness narrowing: if (x) where x is opt_T → narrow x inside block
        if (!narrowVar && node.test.kind === 'Ident') {
          const sym = this.lookup(node.test.name);
          if (sym?.ctype?.startsWith('opt_')) {
            const isPool = sym.ctype.startsWith('opt_ref_') && this.classes.get(sym.ctype.slice(8))?._isPool;
            if (!isPool) narrowVar = node.test.name;
          }
        }
        // Detect unknown narrowing: typeof x === "typename" → narrow x inside if-block
        let unknownNarrowVar: any = null;
        let unknownNarrowCtype: any = null;
        let unknownNarrowInElse = false;
        if (node.test.kind === 'Binary' && (node.test.op === '===' || node.test.op === '!==')) {
          const _checkUnknownNarrow = (typeofSide: any, nameSide: any) => {
            if (typeofSide.kind === 'Typeof' && typeofSide.expr.kind === 'Ident' &&
                nameSide.kind === 'Literal' && nameSide.litType === 'string') {
              const sym = this.lookup(typeofSide.expr.name);
              if (sym?.ctype === 'tsc_unknown') {
                unknownNarrowVar = typeofSide.expr.name;
                if (nameSide.value === 'array') {
                  unknownNarrowCtype = '__array__';
                } else if (nameSide.value === 'object') {
                  unknownNarrowCtype = '__object__';
                } else {
                  unknownNarrowCtype = this._tsNameToCType(nameSide.value);
                }
                unknownNarrowInElse = (node.test.op === '!==');
              }
            }
          };
          _checkUnknownNarrow(node.test.left, node.test.right);
          _checkUnknownNarrow(node.test.right, node.test.left);
        }
        const testC = this._truthyToC(node.test, lines, depth);
        const alt = node.alternate;
        // Single statement consequent (no braces)?
        let hasBraces = node.consequent.kind === 'Block';
        if (narrowVar) {

          this._narrowedVars.add(narrowVar);
        }
        // Unknown narrowing: add to narrowedVars + narrowedUnknownVars for if-block
        if (unknownNarrowVar && !unknownNarrowInElse) {
          this._narrowedVars.add(unknownNarrowVar);
          this._narrowedUnknownVars.set(unknownNarrowVar, unknownNarrowCtype);
          const _uSym = this.lookup(unknownNarrowVar);
          if (_uSym) this._trackRefBorrow(_uSym);
        }
        // Unknown narrowing in else: add AFTER if-block, BEFORE else-block
        let _unknownNarrowInElseActive = false;
        if (hasBraces) {
          p(`if (${testC}) {`);
          const _snap = this._snapshotCleanups();
          this.visitBlock(node.consequent, lines, depth + 1);
          this._restoreCleanups(_snap);
          if (upgradeReleaseVar) {
            const innerI = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${innerI}tsc_arc_release(${upgradeReleaseVar});`);
          }
        } else if (!alt && node.consequent.kind === 'ExprStmt') {
          // Inline (no else): if (cond) expr;
          const exprC = this.exprToC(node.consequent.expr, lines, depth);
          p(`if (${testC}) ${exprC};`);
        } else if (!alt && node.consequent.kind === 'Continue') {
          const _cLabel = node.consequent.label;
          const _asyncContTarget = this._asyncContinueStack?.length ? this._asyncContinueStack[this._asyncContinueStack.length - 1] : null;
          if (_cLabel || this._loopBodyCleanups?.length) {
            const innerI = ' '.repeat(this.indent * (depth + 1));
            p(`if (${testC}) {`);
            if (_cLabel) this._emitAllLoopCleanups(lines, innerI);
            else this._emitLoopBodyCleanups(lines, innerI);
            lines.push(`${innerI}${_cLabel ? `goto ${_cLabel}_continue;` : _asyncContTarget ? `goto ${_asyncContTarget};` : 'continue;'}`);
            p(`}`);
          } else if (_asyncContTarget) {
            p(`if (${testC}) goto ${_asyncContTarget};`);
          } else {
            p(`if (${testC}) continue;`);
          }
        } else if (!alt && node.consequent.kind === 'Break') {
          const _bLabel = node.consequent.label;
          const _asyncBreakTarget = this._asyncBreakStack?.length ? this._asyncBreakStack[this._asyncBreakStack.length - 1] : null;
          if (_bLabel || this._loopBodyCleanups?.length) {
            const innerI = ' '.repeat(this.indent * (depth + 1));
            p(`if (${testC}) {`);
            if (_bLabel) this._emitAllLoopCleanups(lines, innerI);
            else this._emitLoopBodyCleanups(lines, innerI);
            lines.push(`${innerI}${_bLabel ? `goto ${_bLabel}_break;` : _asyncBreakTarget ? `goto ${_asyncBreakTarget};` : 'break;'}`);
            p(`}`);
          } else if (_asyncBreakTarget) {
            p(`if (${testC}) goto ${_asyncBreakTarget};`);
          } else {
            p(`if (${testC}) ${_bLabel ? `goto ${_bLabel}_break` : 'break'};`);
          }
        } else if (!alt && node.consequent.kind === 'Return' && !node.consequent.value) {
          if (this._hasPendingCleanups()) {
            const innerI = ' '.repeat(this.indent * (depth + 1));
            p(`if (${testC}) {`);
            this._emitFuncCleanup(lines, innerI);
            lines.push(`${innerI}return;`);
            p(`}`);
          } else {
            p(`if (${testC}) return;`);
          }
        } else {
          p(`if (${testC}) {`);
          const _snap = this._snapshotCleanups();
          this.visitStmt(node.consequent, lines, depth + 1);
          this._restoreCleanups(_snap);
          // Do NOT emit '}' here тАФ it's emitted by the alt section or the no-alt close below
          hasBraces = true;  // treat as if braces were used, so alt/no-alt handling closes correctly
        }
        // Remove unknown narrowing from if-block
        if (unknownNarrowVar && !unknownNarrowInElse) {
          this._narrowedVars.delete(unknownNarrowVar);
          this._narrowedUnknownVars.delete(unknownNarrowVar);
        }
        if (alt) {
          // Set up unknown narrowing for else-block
          if (unknownNarrowVar && unknownNarrowInElse) {
            this._narrowedVars.add(unknownNarrowVar);
            this._narrowedUnknownVars.set(unknownNarrowVar, unknownNarrowCtype);
            const _uSym2 = this.lookup(unknownNarrowVar);
            if (_uSym2) this._trackRefBorrow(_uSym2);
            _unknownNarrowInElseActive = true;
          }
          // else if: collapse into single line
          if (alt.kind === 'If') {
            p('} else if (' + this._truthyToC(alt.test, lines, depth) + ') {');
            { const _snap = this._snapshotCleanups(); this.visitStmtOrBlock(alt.consequent, lines, depth + 1); this._restoreCleanups(_snap); }
            // recurse for chained else-if
            let cur = alt.alternate;
            while (cur) {
              if (cur.kind === 'If') {
                p('} else if (' + this._truthyToC(cur.test, lines, depth) + ') {');
                { const _snap = this._snapshotCleanups(); this.visitStmtOrBlock(cur.consequent, lines, depth + 1); this._restoreCleanups(_snap); }
                cur = cur.alternate;
              } else {
                p('} else {');
                { const _snap = this._snapshotCleanups(); this.visitStmtOrBlock(cur, lines, depth + 1); this._restoreCleanups(_snap); }
                cur = null;
              }
            }
            p('}');
          } else {
            p('} else {');
            { const _snap = this._snapshotCleanups(); this.visitStmtOrBlock(alt, lines, depth + 1); this._restoreCleanups(_snap); }
            p('}');
          }
          // Remove unknown narrowing from else-block
          if (_unknownNarrowInElseActive) {
            this._narrowedVars.delete(unknownNarrowVar);
            this._narrowedUnknownVars.delete(unknownNarrowVar);
          }
        } else if (hasBraces) {
          p('}');
        }
        if (narrowVar) this._narrowedVars.delete(narrowVar);
        break;
      }

      case 'Block': {
        p('{');
        this.visitBlock(node, lines, depth + 1);
        p('}');
        break;
      }

      case 'For': {
        const _savedAsyncBreak3 = this._asyncBreakStack;
        const _savedAsyncCont3 = this._asyncContinueStack;
        this._asyncBreakStack = null;
        this._asyncContinueStack = null;
        let initC = '';
        if (node.init) {
          if (node.init.kind === 'VarDecls') {
            const parts = node.init.decls.map((d: any) => {
              const ctype = d.typeAnn ? this.resolveType(d.typeAnn) : (d.init ? this.inferType(d.init) : 'int32_t');
              const initExpr = d.init ? this.exprToC(d.init, lines, depth) : '0';
              this.define(d.name, { ctype, varKind: d.varKind });
              return { ctype, name: d.name, initExpr };
            });
            const allSameType = parts.every((pt: any) => pt.ctype === parts[0].ctype);
            if (allSameType) {
              initC = `${parts[0].ctype} ` + parts.map((pt: any) => `${pt.name} = ${pt.initExpr}`).join(', ');
            } else {
              const I = ' '.repeat(this.indent * depth);
              for (const pt of parts) {
                lines.push(`${I}${pt.ctype} ${pt.name} = ${pt.initExpr};`);
              }
              initC = '';
            }
          } else if (node.init.kind === 'VarDecl') {
            const { varKind, name, typeAnn, init } = node.init;
            const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
            const initExpr = init ? this.exprToC(init, lines, depth) : '0';
            initC = `${ctype} ${name} = ${initExpr}`;
            this.define(name, { ctype, varKind });
          } else if (node.init.kind === 'ExprStmt') {
            initC = this.exprToC(node.init.expr, lines, depth);
          }
        }
        if (this._inMathTry) {
          p(`for (${initC};;) {`);
          this._pushLoopCleanups();
          this._loopDepth++;
          const IS = ' '.repeat(this.indent * (depth + 1));
          if (node.test) {
            const testLines: any[] = [];
            const testC = this._truthyToC(node.test, testLines, depth + 1);
            for (const tl of testLines) lines.push(tl);
            lines.push(`${IS}if (!(${testC})) break;`);
          }
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          if (node.update) {
            const updLines: any[] = [];
            const updC = this.exprToC(node.update, updLines, depth + 1);
            if (updLines.length > 0) {
              for (const ul of updLines) lines.push(ul);
            } else if (updC) {
              lines.push(`${IS}${updC};`);
            }
          }
          this._loopDepth--;
          this._emitLoopBodyCleanups(lines, IS);
          this._popLoopCleanups();
          p('}');
        } else {
          const testC = node.test ? this._truthyToC(node.test, lines, depth) : '';
          const updC  = node.update ? this.exprToC(node.update, lines, depth) : '';
          p(`for (${initC}; ${testC}; ${updC}) {`);
          this._pushLoopCleanups();
          this._loopDepth++;
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          this._loopDepth--;
          this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
          this._popLoopCleanups();
          p('}');
        }
        this._asyncBreakStack = _savedAsyncBreak3;
        this._asyncContinueStack = _savedAsyncCont3;
        break;
      }

      case 'ForOf': {
        const _savedAsyncBreak4 = this._asyncBreakStack;
        const _savedAsyncCont4 = this._asyncContinueStack;
        this._asyncBreakStack = null;
        this._asyncContinueStack = null;
        const qual = node.varKind === 'const' ? 'const ' : '';
        const II = ' '.repeat(this.indent * (depth + 1));

        // Special case: for (const [k, v] of m.entries()) тЖТ unpack MapEntry fields
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'entries' &&
            node.binding.kind === 'ArrayPattern') {
          const mapObj = node.iterable.callee.object;
          const mapSym = mapObj.kind === 'Ident' ? this.lookup(mapObj.name) : null;
          const mapType = mapSym?.ctype ?? this.inferType(mapObj);
          if (mapType?.startsWith('TscMap_') || mapType?.startsWith('Map_')) {
            const mapSuffix = mapType.startsWith('TscMap_') ? mapType.slice(7) : mapType.slice(4);
            const parts = mapSuffix.split('_');
            const kIdent = parts[0];
            const vIdent = parts.slice(1).join('_');
            const kCType = this._arrIdentToCType(kIdent);
            const vCType = this._arrIdentToCType(vIdent);
            this._ensureMapEntry(mapSuffix, kCType, vCType);
            const entryName = `MapEntry_${mapSuffix}`;
            const arrType = `Array_${entryName}`;
            const mapObjC = this.exprToC(mapObj, lines, depth);
            const entTmpName = `_entries_${this.tempCount++}`;
            const ivar = `_i_${this.loopCount++}`;
            p(`${arrType} ${entTmpName} = tsc_map_entries_${mapSuffix}(&${mapObjC});`);
            if (mapSym) { this.pushScope(); this._trackRefBorrow(mapSym); }
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmpName}.length; ${ivar}++) {`);
            const [kElem, vElem] = node.binding.elems;
            if (kElem) {
              lines.push(`${II}${qual}${kCType} ${kElem.name} = ${entTmpName}.data[${ivar}].key;`);
              this.define(kElem.name, { ctype: kCType, varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${vCType} ${vElem.name} = ${entTmpName}.data[${ivar}].value;`);
              this.define(vElem.name, { ctype: vCType, varKind: node.varKind });
            }
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            p('}');
            if (mapSym) this.popScope();
            break;
          }
        }

        // for (const cp of s.codePoints()) тЖТ TscCodePointIter while loop
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'codePoints') {
          const strObj = node.iterable.callee.object;
          const strC = this.exprToC(strObj, lines, depth);
          const n = this.loopCount++;
          const iterVar = `_cp_iter_${n}`;
          const tmpVar = `_cp_${n}`;
          const bindName2 = node.binding.kind === 'Ident' ? node.binding.name : null;
          p(`TscCodePointIter ${iterVar} = tsc_codepoints(${strC});`);
          p(`uint32_t ${tmpVar} = 0;`);
          p(`while (tsc_codepoints_next(&${iterVar}, &${tmpVar})) {`);
          if (bindName2) {
            lines.push(`${II}${qual}uint32_t ${bindName2} = ${tmpVar};`);
            this.define(bindName2, { ctype: 'uint32_t', varKind: node.varKind });
          }
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          p('}');
          break;
        }

        // for (const g of s.graphemes()) тЖТ TscGraphemeIter while loop
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'graphemes') {
          const strObj = node.iterable.callee.object;
          const strC = this.exprToC(strObj, lines, depth);
          const n = this.loopCount++;
          const iterVar = `_g_iter_${n}`;
          const tmpVar = `_g_${n}`;
          const bindName2 = node.binding.kind === 'Ident' ? node.binding.name : null;
          p(`TscGraphemeIter ${iterVar} = tsc_graphemes(${strC});`);
          p(`String ${tmpVar} = {0};`);
          p(`while (tsc_graphemes_next(&${iterVar}, &${tmpVar})) {`);
          if (bindName2) {
            lines.push(`${II}${qual}String ${bindName2} = ${tmpVar};`);
            this.define(bindName2, { ctype: 'String', varKind: node.varKind });
          }
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          p('}');
          break;
        }

        // for (const [k, v] of u.searchParams) тЖТ TscURLParamIter while loop
        if (this._stdUrlImported &&
            node.iterable.kind === 'Member' && node.iterable.prop === 'searchParams' &&
            node.binding.kind === 'ArrayPattern') {
          const urlObj = node.iterable.object;
          const urlSym = urlObj.kind === 'Ident' ? this.lookup(urlObj.name) : null;
          if (urlSym?._isURL) {
            const urlName = urlObj.name;
            const n = this.loopCount++;
            const iterVar = `_iter_${n}`;
            const paramVar = `_p_${n}`;
            p(`TscURLParamIter ${iterVar} = tsc_url_params_iter(&${urlName});`);
            p(`TscURLParam ${paramVar} = {0};`);
            p(`while (tsc_url_params_next(&${iterVar}, &${paramVar})) {`);
            const [kElem, vElem] = node.binding.elems;
            if (kElem) {
              lines.push(`${II}${qual}String ${kElem.name} = ${paramVar}.key;`);
              this.define(kElem.name, { ctype: 'String', varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}String ${vElem.name} = ${paramVar}.value;`);
              this.define(vElem.name, { ctype: 'String', varKind: node.varKind });
            }
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            p('}');
            break;
          }
        }

        // for (const v of set) тЖТ index loop over TscSet_SUFFIX._vals
        {
          const _setSym = node.iterable.kind === 'Ident' ? this.lookup(node.iterable.name) : null;
          if (_setSym?._isSet) {
            const _sfx = _setSym._setSuffix;
            const _eC  = _setSym._setElemCType;
            const _setC = this.exprToC(node.iterable, lines, depth);
            const _ivar = `_i_${this.loopCount++}`;
            const _bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
            if (_setSym) { this.pushScope(); this._trackRefBorrow(_setSym); }
            p(`for (size_t ${_ivar} = 0; ${_ivar} < ${_setC}.size; ${_ivar}++) {`);
            if (_bindName) {
              lines.push(`${II}${qual}${_eC} ${_bindName} = ${_setC}._vals[${_ivar}];`);
              this.define(_bindName, { ctype: _eC, varKind: node.varKind });
            }
            this._pushLoopCleanups();
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._popLoopCleanups();
            p('}');
            if (_setSym) this.popScope();
            break;
          }
        }

        // for (const [i, v] of arr.entries()) -> cached entries loop
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'entries' &&
            node.binding.kind === 'ArrayPattern') {
          const arrObj = node.iterable.callee.object;
          const arrSym = arrObj.kind === 'Ident' ? this.lookup(arrObj.name) : null;
          const arrType = arrSym?.ctype ?? this.inferType(arrObj);
          if (arrType?.startsWith('Array_')) {
            const etIdent = arrType.slice(6);
            const etCType = this._arrIdentToCType(etIdent);
            const tupleName = `Tuple_i32_${etIdent}`;
            const tupleArrName = `Array_${tupleName}`;
            this.addTop(`typedef struct { int32_t _0; ${etCType} _1; } ${tupleName};`);
            this._ensureArrayStruct(tupleArrName, tupleName);
            const arrObjC = this.exprToC(arrObj, lines, depth);
            const entTmp = `_ent_${this.tempCount++}`;
            const ivar = `_i_${this.loopCount++}`;
            p(`${tupleArrName} ${entTmp} = tsc_array_entries_${etIdent}(${arrObjC});`);
            if (arrSym) { this.pushScope(); this._trackRefBorrow(arrSym); }
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmp}.length; ${ivar}++) {`);
            const [iElem, vElem] = node.binding.elems;
            if (iElem) {
              lines.push(`${II}${qual}int32_t ${iElem.name} = (int32_t)${ivar};`);
              this.define(iElem.name, { ctype: 'int32_t', varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${etCType} ${vElem.name} = ${entTmp}.data[${ivar}]._1;`);
              this.define(vElem.name, { ctype: etCType, varKind: node.varKind });
            }
            this._pushLoopCleanups();
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._popLoopCleanups();
            p('}');
            if (arrSym) this.popScope();
            break;
          }
          const setSym = arrSym?._isSet ? arrSym : null;
          if (setSym) {
            const _sElemCType = setSym._setElemCType ?? 'int32_t';
            const _sSfx = setSym._setSuffix;
            const _sElemIdent = this.cTypeToIdent(_sElemCType);
            const tupleName = `Tuple_${_sElemIdent}_${_sElemIdent}`;
            const tupleArrName = `Array_${tupleName}`;
            this.addTop(`typedef struct { ${_sElemCType} _0; ${_sElemCType} _1; } ${tupleName};`);
            this._ensureArrayStruct(tupleArrName, tupleName);
            const setC = this.exprToC(arrObj, lines, depth);
            const entTmp = `_ent_${this.tempCount++}`;
            const ivar = `_i_${this.loopCount++}`;
            p(`${tupleArrName} ${entTmp} = tsc_set_entries_${_sSfx}(${setC});`);
            if (setSym) { this.pushScope(); this._trackRefBorrow(setSym); }
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmp}.length; ${ivar}++) {`);
            const [aElem, bElem] = node.binding.elems;
            if (aElem) {
              lines.push(`${II}${qual}${_sElemCType} ${aElem.name} = ${entTmp}.data[${ivar}]._0;`);
              this.define(aElem.name, { ctype: _sElemCType, varKind: node.varKind });
            }
            if (bElem) {
              lines.push(`${II}${qual}${_sElemCType} ${bElem.name} = ${entTmp}.data[${ivar}]._1;`);
              this.define(bElem.name, { ctype: _sElemCType, varKind: node.varKind });
            }
            this._pushLoopCleanups();
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._popLoopCleanups();
            p('}');
            if (setSym) this.popScope();
            break;
          }
        }

        // for (const [k, v] of map) -> index loop over map._keys[i]/_vals[i]
        {
          const _mapSym = node.iterable.kind === 'Ident' ? this.lookup(node.iterable.name) : null;
          const _mapType = _mapSym?.ctype ?? (node.iterable.kind === 'Ident' ? null : this.inferType(node.iterable));
          if (_mapType?.startsWith('TscMap_') && node.binding.kind === 'ArrayPattern') {
            const _mapSuffix = _mapType.slice(7);
            const _parts = _mapSuffix.split('_');
            const _kIdent = _parts[0];
            const _vIdent = _parts.slice(1).join('_');
            const _kCType = this._arrIdentToCType(_kIdent);
            const _vCType = this._arrIdentToCType(_vIdent);
            const _mapC = this.exprToC(node.iterable, lines, depth);
            const _ivar = `_i_${this.loopCount++}`;
            const [kElem, vElem] = node.binding.elems;
            if (_mapSym) { this.pushScope(); this._trackRefBorrow(_mapSym); }
            p(`for (size_t ${_ivar} = 0; ${_ivar} < ${_mapC}.size; ${_ivar}++) {`);
            if (kElem) {
              lines.push(`${II}${qual}${_kCType} ${kElem.name} = ${_mapC}._keys[${_ivar}];`);
              this.define(kElem.name, { ctype: _kCType, varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${_vCType} ${vElem.name} = ${_mapC}._vals[${_ivar}];`);
              this.define(vElem.name, { ctype: _vCType, varKind: node.varKind });
            }
            this._pushLoopCleanups();
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._popLoopCleanups();
            p('}');
            if (_mapSym) this.popScope();
            break;
          }
        }

        // Iterable<T> protocol: class implements Iterable<T>
        {
          const _forOfSym = node.iterable.kind === 'Ident' ? this.lookup(node.iterable.name) : null;
          const _forOfClass = _forOfSym?.ctype ? this.classes.get(_forOfSym.ctype) : null;
          if (_forOfClass?._iterStructName && _forOfClass._iterableElemType) {
            const _clsName = _forOfSym.ctype;
            const _elemC = _forOfClass._iterableElemType;
            const _elemIdent = this.cTypeToIdent(_elemC);
            const _isComplex = !this._isSimpleCType(_elemC);
            const _optType = _isComplex ? `iter_opt_${_elemIdent}` : `opt_${_elemIdent}`;
            const _n = this.loopCount++;
            const _iterVar = `_iter_${_n}`;
            const _elemVar = `_elem_${_n}`;
            const _objC = this.exprToC(node.iterable, lines, depth);
            if (_forOfSym) { this.pushScope(); this._trackRefBorrow(_forOfSym); }
            p(`${_forOfClass._iterStructName} ${_iterVar} = ${_clsName}_iter(&${_objC});`);
            p(`${_optType} ${_elemVar} = {0};`);
            p(`while ((${_elemVar} = ${_clsName}_iter_next(&${_iterVar})).has_value) {`);
            const _bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
            if (_bindName) {
              const _isComplex = !this._isSimpleCType(_elemC);
              if (_isComplex) {
                const ptrQual = node.varKind === 'const' ? 'const ' : '';
                lines.push(`${II}${ptrQual}${_elemC} *${_bindName} = ${_elemVar}.value;`);
                this.define(_bindName, { ctype: `${_elemC} *`, varKind: node.varKind });
              } else {
                lines.push(`${II}${qual}${_elemC} ${_bindName} = ${_elemVar}.value;`);
                this.define(_bindName, { ctype: _elemC, varKind: node.varKind });
              }
            }
            this._pushLoopCleanups();
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._popLoopCleanups();
            p('}');
            if (_forOfSym) this.popScope();
            break;
          }
        }

        const iterC = this.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${this.loopCount++}`;
        let elemType = 'int32_t';
        const iterSym = node.iterable.kind === 'Ident' ? this.lookup(node.iterable.name) : null;
        if (node.binding.kind === 'Ident' && node.binding.typeAnn) {
          elemType = this.resolveType(node.binding.typeAnn);
        } else if (iterSym?.arrElemCType) {
          elemType = iterSym.arrElemCType;
        } else if (iterSym?.ctype === 'String') {
          elemType = 'char';
        }
        const bindName = node.binding.kind === 'Ident' ? node.binding.name : null;

        const _isComplexType = !this._isSimpleCType(elemType);

        if (iterSym) { this.pushScope(); this._trackRefBorrow(iterSym); }
        p(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          if (_isComplexType) {
            const ptrQual = node.varKind === 'const' ? 'const ' : '';
            lines.push(`${II}${ptrQual}${elemType} *${bindName} = &${iterC}.data[${ivar}];`);
            this.define(bindName, { ctype: `${elemType} *`, varKind: node.varKind });
          } else {
            lines.push(`${II}${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
            this.define(bindName, { ctype: elemType, varKind: node.varKind });
          }
        } else if (node.binding.kind === 'ArrayPattern') {
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`${II}${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        this._pushLoopCleanups();
        this._loopDepth++;
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        this._loopDepth--;
        this._emitLoopBodyCleanups(lines, II);
        this._popLoopCleanups();
        p('}');
        if (iterSym) this.popScope();
        this._asyncBreakStack = _savedAsyncBreak4;
        this._asyncContinueStack = _savedAsyncCont4;
        break;
      }

      case 'ForIn': {
        throw this.error(`SyntaxError: 'for-in' loops are not supported; use 'for-of' instead`, node);
        break;
      }

      case 'While': {
        const _savedAsyncBreak = this._asyncBreakStack;
        const _savedAsyncCont = this._asyncContinueStack;
        this._asyncBreakStack = null;
        this._asyncContinueStack = null;
        if (this._inMathTry) {
          p('while (1) {');
          this._pushLoopCleanups();
          this._loopDepth++;
          const condLines: any[] = [];
          const testC = this._truthyToC(node.test, condLines, depth + 1);
          for (const cl of condLines) lines.push(cl);
          const IS = ' '.repeat(this.indent * (depth + 1));
          lines.push(`${IS}if (!(${testC})) break;`);
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          this._loopDepth--;
          this._emitLoopBodyCleanups(lines, IS);
          this._popLoopCleanups();
          p('}');
        } else {
          const testC = this._truthyToC(node.test, lines, depth);
          p(`while (${testC}) {`);
          this._pushLoopCleanups();
          this._loopDepth++;
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          this._loopDepth--;
          this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
          this._popLoopCleanups();
          p('}');
        }
        this._asyncBreakStack = _savedAsyncBreak;
        this._asyncContinueStack = _savedAsyncCont;
        break;
      }

      case 'DoWhile': {
        const _savedAsyncBreak2 = this._asyncBreakStack;
        const _savedAsyncCont2 = this._asyncContinueStack;
        this._asyncBreakStack = null;
        this._asyncContinueStack = null;
        if (this._inMathTry) {
          p('do {');
          this._pushLoopCleanups();
          this._loopDepth++;
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          const IS = ' '.repeat(this.indent * (depth + 1));
          const condLines: any[] = [];
          const testC = this._truthyToC(node.test, condLines, depth + 1);
          for (const cl of condLines) lines.push(cl);
          lines.push(`${IS}if (!(${testC})) break;`);
          this._loopDepth--;
          this._emitLoopBodyCleanups(lines, IS);
          this._popLoopCleanups();
          p('} while (1);');
        } else {
          const testC = this._truthyToC(node.test, lines, depth);
          p('do {');
          this._pushLoopCleanups();
          this._loopDepth++;
          this.visitStmtOrBlock(node.body, lines, depth + 1);
          this._loopDepth--;
          this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
          this._popLoopCleanups();
          p(`} while (${testC});`);
        }
        this._asyncBreakStack = _savedAsyncBreak2;
        this._asyncContinueStack = _savedAsyncCont2;
        break;
      }

      case 'Break':
        if (node.label) {
          this._emitAllLoopCleanups(lines, I);
          p(`goto ${node.label}_break;`);
        } else if (this._asyncBreakStack?.length) {
          p(`goto ${this._asyncBreakStack[this._asyncBreakStack.length - 1]};`);
        } else {
          this._emitLoopBodyCleanups(lines, I);
          p('break;');
        }
        break;
      case 'Continue':
        if (node.label) {
          this._emitAllLoopCleanups(lines, I);
          p(`goto ${node.label}_continue;`);
        } else if (this._asyncContinueStack?.length) {
          p(`goto ${this._asyncContinueStack[this._asyncContinueStack.length - 1]};`);
        } else {
          this._emitLoopBodyCleanups(lines, I);
          p('continue;');
        }
        break;

      case 'Labeled': {
        const label = node.label;
        const inner = node.body;
        const usesBreak    = this.labelUsed(inner, label, 'break');
        const usesContinue = this.labelUsed(inner, label, 'continue');
        if (inner.kind === 'While' || inner.kind === 'For') {
          let headerLine;
          if (inner.kind === 'While') {
            const testC = this.exprToC(inner.test, lines, depth);
            headerLine = `while (${testC}) {`;
          } else {
            let initC = '';
            if (inner.init?.kind === 'VarDecl') {
              const { varKind, name, typeAnn, init } = inner.init;
              const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
              const initExpr = init ? this.exprToC(init, lines, depth) : '0';
              initC = `${ctype} ${name} = ${initExpr}`;
              this.define(name, { ctype, varKind });
            }
            const testC = inner.test ? this.exprToC(inner.test, lines, depth) : '';
            const updC  = inner.update ? this.exprToC(inner.update, lines, depth) : '';
            headerLine = `for (${initC}; ${testC}; ${updC}) {`;
          }
          p(headerLine);
          this._pushLoopCleanups();
          this._loopDepth++;
          const bodyLines: any[] = [];
          this.visitStmtOrBlock(inner.body, bodyLines, depth + 1);
          for (const bl of bodyLines) lines.push(bl);
          this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
          this._loopDepth--;
          this._popLoopCleanups();
          if (usesContinue) {
            const II = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${II}${label}_continue:;`);
          }
          p('}');
          if (usesBreak) p(`${label}_break:;`);
        } else if (inner.kind === 'ForOf' || inner.kind === 'ForIn') {
          this.visitStmt(inner, lines, depth);
          if (usesBreak) p(`${label}_break:;`);
        } else {
          this.visitStmt(inner, lines, depth);
        }
        break;
      }

      case 'Throw': {
        const val = node.value;
        // Error: throw inside finally block
        if (this._inFinallyBlock) {
          throw this.error('TypeError: Cannot throw inside a finally block');
        }
        // Error: throw string literal
        if (val?.kind === 'Literal' && val.litType === 'string') {
          throw this.error('can only throw Error instances, not string');
        }
        // Error: throw in function without throws declaration
        // (never-return functions are exempt тАФ they are expected to throw/abort)
        if (!this._throwsCtx && this.inFunction && !this._currentFuncIsNever) {
          throw this.error(`function "${this.currentFuncName}" throws but does not declare "throws"`);
        }

        if (this._throwsCtx) {
          this._emitPoolDrops(lines, I);
          const ctx = this._throwsCtx;
          if (val?.kind === 'New') {
            const errClass = val.name === 'Error' ? 'TscError' : val.name;
            const msgArg = val.args?.[0];
            const msgC = msgArg ? this.exprToC(msgArg.expr ?? msgArg, lines, depth) : 'STR_LIT("")';
            const errCtor = errClass === 'TscError' ? `(TscError){ .message = ${msgC} }` : `${errClass}_new(${msgC})`;
            if (ctx.throwsNames.length === 1) {
              if (this._usesGotoCleanup) {
                this._emitFuncCleanup(lines, I);
                p(`_result = (${ctx.resultType}){.ok = false, .error = ${errCtor}};`);
                p(`goto cleanup;`);
              } else {
                this._emitFuncCleanup(lines, I);
                p(`return (${ctx.resultType}){.ok = false, .error = ${errCtor}};`);
              }
            } else {
              const idx = ctx.throwsNames.indexOf(errClass);
              const errUnionName = `_ErrUnion_${ctx.errKey}`;
              p(`${errUnionName} _err = {.tag = _Err_${errClass}, ._${idx} = ${errCtor}};`);
              if (this._usesGotoCleanup) {
                this._emitFuncCleanup(lines, I);
                p(`_result = (${ctx.resultType}){.ok = false, .error = _err};`);
                p(`goto cleanup;`);
              } else {
                this._emitFuncCleanup(lines, I);
                p(`return (${ctx.resultType}){.ok = false, .error = _err};`);
              }
            }
          } else {
            const errC = this.exprToC(val, lines, depth);
            if (this._usesGotoCleanup) {
              this._emitFuncCleanup(lines, I);
              p(`_result = (${ctx.resultType}){.ok = false, .error = ${errC}};`);
              p(`goto cleanup;`);
            } else {
              this._emitFuncCleanup(lines, I);
              p(`return (${ctx.resultType}){.ok = false, .error = ${errC}};`);
            }
          }
        } else {
          this._emitPoolDrops(lines, I);
          // Not in throws function — fall back to tsc_throw
          if (val?.kind === 'New' && val.name === 'Error' && val.args?.length === 1) {
            const msgC = this.exprToC(val.args[0].expr ?? val.args[0], lines, depth);
            p(`tsc_throw(${msgC});`);
          } else {
            const errC = this.exprToC(val, lines, depth);
            p(`tsc_throw(${errC});`);
          }
        }
        break;
      }

      case 'TryCatch': {
        const tryStmts = node.body?.body ?? node.body ?? [];

        // Require explicit type annotation in catch clauses
        for (const c of node.catches ?? []) {
          if (c.param && !c.typeAnn) {
            throw this.error(`TypeError: catch clause requires explicit error type`, c);
          }
        }

        // Check if any catch clause catches MathError
        const hasMathCatch = (node.catches ?? []).some((c: any) => c.typeAnn?.name === 'MathError');

        if (hasMathCatch) {
          const catchIdx = this.tempCount++;
          const catchLabel = `_catch_${catchIdx}`;
          const catchEndLabel = `_catch_end_${catchIdx}`;
          const errVar = `_math_err_${catchIdx}`;

          p(`MathError ${errVar} = {0};`);

          const prevInMathTry = this._inMathTry;
          const prevMathCatchLabel = this._mathCatchLabel;
          const prevMathErrVar = this._mathErrVar;
          this._inMathTry = true;
          this._mathCatchLabel = catchLabel;
          this._mathErrVar = errVar;

          for (const s of tryStmts) {
            this.visitStmt(s, lines, depth);
          }

          this._inMathTry = prevInMathTry;
          this._mathCatchLabel = prevMathCatchLabel;
          this._mathErrVar = prevMathErrVar;

          p(`goto ${catchEndLabel};`);
          p(`${catchLabel}:`);
          for (const c of node.catches ?? []) {
            if (c.typeAnn?.name === 'MathError') {
              this.pushScope();
              if (c.param) {
                this.define(c.param, { ctype: 'MathError', _alias: errVar });
              }
              this.visitBlock(c.body, lines, depth);
              this.popScope();
              break;
            }
          }
          p(`${catchEndLabel}:;`);

          if (node.finally) {
            this._inFinallyBlock = true;
            this.visitBlock(node.finally, lines, depth);
            this._inFinallyBlock = false;
          }
          break;
        }

        // Check if try body contains a call to a throws function
        const _findThrowsFuncCall = (stmts: any): any => {
          for (const s of stmts) {
            if (s.kind === 'ExprStmt' && s.expr?.kind === 'Call') {
              const callee = s.expr.callee;
              const sym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
              if (sym?._isThrowsFunc) return s;
            }
            if (s.kind === 'VarDecl' && s.init?.kind === 'Call') {
              const callee = s.init.callee;
              const sym = callee?.kind === 'Ident' ? this.lookup(callee.name) : null;
              if (sym?._isThrowsFunc) return s;
            }
          }
          return null;
        };
        const throwsFuncCallStmt = _findThrowsFuncCall(tryStmts);

        if (throwsFuncCallStmt) {
          // New Result-based pattern
          this._emitTryCatchResult(node, tryStmts, throwsFuncCallStmt, lines, depth);
        } else {
          const _hasPoolNew = (stmts: any): any => {
            for (const s of stmts) {
              if (s.kind === 'VarDecl' && s.init?.kind === 'New') {
                const cls = this.classes.get(s.init.name);
                if (cls?._isPool) return true;
              }
              if (s.kind === 'ExprStmt' && s.expr?.kind === 'New') {
                const cls = this.classes.get(s.expr.name);
                if (cls?._isPool) return true;
              }
            }
            return false;
          };

          if (_hasPoolNew(tryStmts)) {
            const catchIdx = this.tempCount++;
            const catchLabel = `_catch_${catchIdx}`;
            const catchEndLabel = `_catch_end_${catchIdx}`;
            const errVar = `_catch_err_${catchIdx}`;
            const catches = node.catches ?? [];

            p(`TscError ${errVar} = {0};`);

            const prevInTryBlock = this._inTryBlock;
            const prevTryCatchInfo = this._tryCatchInfo;
            this._inTryBlock = true;
            this._tryCatchInfo = { catchLabel, errVar, catches };

            for (const s of tryStmts) {
              const isThrowNew = s.kind === 'Throw' && s.value?.kind === 'New';
              if (isThrowNew) {
                const val = s.value;
                const errClass = val.name === 'Error' ? 'TscError' : val.name;
                const errVarName = `_err_${this.tempCount++}`;
                const errC = this.exprToC(val, lines, depth);
                p(`${errClass} ${errVarName} = ${errC};`);
                for (const c of catches) {
                  if (!c.typeAnn || c.typeAnn.name === errClass || (errClass === 'TscError' && c.typeAnn?.name === 'Error')) {
                    this.pushScope();
                    this.define(c.param, { ctype: errClass, _alias: errVarName });
                    this.visitBlock(c.body, lines, depth);
                    this.popScope();
                  }
                }
              } else {
                this.visitStmt(s, lines, depth);
              }
            }

            this._inTryBlock = prevInTryBlock;
            this._tryCatchInfo = prevTryCatchInfo;

            p(`goto ${catchEndLabel};`);
            p(`${catchLabel}:`);
            for (const c of catches) {
              this.pushScope();
              if (c.param) {
                const catchType = c.typeAnn?.name === 'Error' ? 'TscError' : (c.typeAnn?.name ?? 'TscError');
                this.define(c.param, { ctype: catchType, _alias: errVar });
              }
              this.visitBlock(c.body, lines, depth);
              this.popScope();
              break;
            }
            p(`${catchEndLabel}:;`);

            if (node.finally) {
              this._inFinallyBlock = true;
              this.visitBlock(node.finally, lines, depth);
              this._inFinallyBlock = false;
            }
          } else {
            for (const s of tryStmts) {
              const isThrowNew = s.kind === 'Throw' && s.value?.kind === 'New';
              if (isThrowNew) {
                const val = s.value;
                const errClass = val.name === 'Error' ? 'TscError' : val.name;
                const errVarName = `_err_${this.tempCount++}`;
                const errC = this.exprToC(val, lines, depth);
                p(`${errClass} ${errVarName} = ${errC};`);
                for (const c of node.catches) {
                  if (!c.typeAnn || c.typeAnn.name === errClass || (errClass === 'TscError' && c.typeAnn?.name === 'Error')) {
                    this.pushScope();
                    this.define(c.param, { ctype: errClass, _alias: errVarName });
                    this.visitBlock(c.body, lines, depth);
                    this.popScope();
                  }
                }
              } else {
                this.visitStmt(s, lines, depth);
              }
            }
            if (node.finally) {
              this._inFinallyBlock = true;
              this.visitBlock(node.finally, lines, depth);
              this._inFinallyBlock = false;
            }
          }
        }
        break;
      }

      case 'Switch': {
        this._validateSwitchFallthrough(node);
        const discType = this.inferType(node.discriminant);
        const discC = this.exprToC(node.discriminant, lines, depth);
        const IS = ' '.repeat(this.indent * (depth + 1));
        p(`switch (${discC}) {`);
        const discEnumDef = this.classes.get(discType);
        let hasDefault = false;
        for (const c of node.cases) {
          if (c.test) {
            let caseC;
            if (discEnumDef?.isStringLiteralUnion && c.test.kind === 'Literal' && c.test.litType === 'string') {
              caseC = `${discType}_${c.test.value}`;
            } else {
              caseC = this.exprToC(c.test, lines, depth);
            }
            lines.push(`${IS}case ${caseC}:`);
          } else {
            hasDefault = true;
            lines.push(`${IS}default:`);
          }
          for (const s of c.body) this.visitStmt(s, lines, depth + 2);
        }
        if (!hasDefault && this._strictRules?.has('switch-default')) {
          lines.push(`${IS}default: break;`);
        }
        p('}');
        break;
      }

      case 'Native': {
        if (this._strictRules?.has('no-native')) {
          throw this.error('native C blocks are forbidden in strict mode (no-native)', node);
        }
        let nativeOut = '';
        if (node.templateParts) {
          // native(`... ${expr} ...`) тАФ interpolate expressions
          for (const part of node.templateParts) {
            if (part.kind === 'str') {
              nativeOut += part.value;
            } else if (part.kind === 'expr') {
              // Re-parse the expression source (same as _templateToC in misc/closures.ts)
              const toks = this._lex(part.src, this.filename);
              const { ast } = this._parse(toks);
              const exprNode = ast.body[0]?.expr ?? ast.body[0];
              nativeOut += this.exprToC(exprNode, lines, depth);
            }
          }
        } else {
          // native "..." тАФ verbatim string, unescape escaped quotes
          nativeOut = node.content.replace(/\\"/g, '"');
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
          if (!knownCTypes.has(typeName) && !this.classes.has(typeName) && !this.interfaces.has(typeName)) {
            throw this.error(`TypeError: Native block references undeclared type '${typeName}'; declare it or use @[native_type]`);
          }
        }
        p(nativeOut);
        break;
      }

      case 'Unsafe': {
        if (this._strictRules?.has('no-unsafe')) {
          throw this.error('unsafe blocks are forbidden in strict mode (no-unsafe)', node);
        }
        p('{');
        const prevUnsafe = this._inUnsafe;
        this._inUnsafe = true;
        this.visitBlock(node.body, lines, depth + 1);
        this._inUnsafe = prevUnsafe;
        p('}');
        break;
      }

      case 'Spawn': {
        const threadVar = this._emitSpawnBlock(null, node.body, node.throwsTypes, lines, depth);
        p(`(void)${threadVar};`);
        break;
      }

      case 'Noop': break;
      default:
        p(`/* unhandled stmt: ${node.kind} */`);
    }
  },

  _SIMPLE_C_TYPES: new Set([
    'int8_t', 'int16_t', 'int32_t', 'int64_t',
    'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
    'float', 'double', 'bool', 'size_t', 'ptrdiff_t',
    'char', 'String', 'tsc_unknown',
  ]),

  _validateSwitchFallthrough(this: any, node: any) {
    if (this.inferType(node.discriminant) === 'double' || this.inferType(node.discriminant) === 'float') {
      throw this.error(`cannot switch on type 'f64'`, node);
    }
    for (let ci = 0; ci < node.cases.length; ci++) {
      const c = node.cases[ci];
      if (c.body.length === 0) continue;
      const last = c.body[c.body.length - 1];
      const isTerminator = last.kind === 'Break' || last.kind === 'Return' ||
                           last.kind === 'Throw' || last.kind === 'Continue';
      if (!isTerminator && ci < node.cases.length - 1) {
        throw this.error(`implicit fallthrough`, last, {
          label: 'add `break;` or `return` to end this case',
          help: ['each case must end with `break`, `return`, or `continue`'],
          code: 'E005',
        });
      }
    }
  },

  _isSimpleCType(this: any, ct: any) {
    return this._SIMPLE_C_TYPES.has(ct);
  },
};
