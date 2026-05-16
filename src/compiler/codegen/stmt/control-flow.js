export default {
  _visitControlFlow(node, lines, depth) {
    this._currentNode = node;
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);
    switch (node.kind) {
      case 'ExprStmt': {
        const expr = node.expr;
        // Auto-propagate calls to throws functions inside a throws function
        if (this._throwsCtx && expr.kind === 'Call') {
          const callee = expr.callee;
          const sym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
          if (sym?._isThrowsFunc) {
            const ctx = this._throwsCtx;
            const resName = `_res_${this.tempCount++}`;
            const callC = this.exprToC(expr, lines, depth);
            p(`${sym._resultType} ${resName} = ${callC};`);
            p(`if (!${resName}.ok) { return (${ctx.resultType}){.ok = false, .error = ${resName}.error}; }`);
            this._flushPostStmtCleanups(lines);
            break;
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
            if (this.inferType(node.value) === 'String') lines.push(`${I}tsc_string_retain(${valC});`);
            lines.push(`${I}return (${optType}){true, ${valC}};`);
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
        if (this._hasPendingCleanups() && node.value) {
          // Evaluate return value before cleanup to avoid use-after-free of owned vars
          this._inReturnContext = true;
          const retC = this.exprToC(node.value, lines, depth);
          this._inReturnContext = false;
          const retType = this.inferType(node.value) ?? 'int32_t';
          const tmpName = `_ret_${this.tempCount++}`;
          if (retType === 'String') p(`tsc_string_retain(${retC});`);
          p(`${retType} ${tmpName} = ${retC};`);
          this._emitFuncCleanup(lines, I);
          if (this._throwsCtx) {
            p(`return (${this._throwsCtx.resultType}){.ok = true, .value = ${tmpName}};`);
          } else {
            p(`return ${tmpName};`);
          }
        } else {
          this._emitFuncCleanup(lines, I);
          if (this._throwsCtx) {
            const ctx = this._throwsCtx;
            if (node.value) {
              this._inReturnContext = true;
              const c = this.exprToC(node.value, lines, depth);
              this._inReturnContext = false;
              if (this.inferType(node.value) === 'String') p(`tsc_string_retain(${c});`);
              p(`return (${ctx.resultType}){.ok = true, .value = ${c}};`);
            } else {
              p(`return (${ctx.resultType}){.ok = true};`);
            }
          } else {
            if (node.value) {
              this._inReturnContext = true;
              let c = this.exprToC(node.value, lines, depth);
              this._inReturnContext = false;
              if (this.currentFuncReturnType === 'tsc_closure' && node.value.kind === 'Ident') {
                const retSym = this.lookup(node.value.name);
                if (retSym?.funcName && !retSym.funcPtr) {
                  c = `(tsc_closure){.env = NULL, .fn = (void*)${c}}`;
                }
              }
              if (this.inferType(node.value) === 'String') p(`tsc_string_retain(${c});`);
              p(`return ${c};`);
            } else {
              p('return;');
            }
          }
        }
        break;
      }

      case 'If': {
        // Detect narrowing: if (x != null) тЖТ narrow x to x.value inside block
        const isNullLit = (n) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
        let narrowVar = null;
        let upgradeReleaseVar = null;
        if (node.test.kind === 'Binary' && (node.test.op === '!=' || node.test.op === '!==')) {
          const nullSide = isNullLit(node.test.right) ? 'right' : isNullLit(node.test.left) ? 'left' : null;
          if (nullSide) {
            const optSide = nullSide === 'right' ? node.test.left : node.test.right;
            if (optSide.kind === 'Ident') {
              const sym = this.lookup(optSide.name);
              // Pool opt_ref types: don't narrow (member access routed via .value-> in expr.js)
              const isPool = sym?.ctype?.startsWith('opt_ref_') && this.classes.get(sym.ctype.slice(8))?._isPool;
              if (sym?.ctype?.startsWith('opt_') && !isPool) narrowVar = optSide.name;
              else if (sym?.isSharedUpgrade) upgradeReleaseVar = optSide.name;
            }
          }
        }
        const testC = this.exprToC(node.test, lines, depth);
        const alt = node.alternate;
        // Single statement consequent (no braces)?
        let hasBraces = node.consequent.kind === 'Block';
        if (narrowVar) {

          this._narrowedVars.add(narrowVar);
        }
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
          p(`if (${testC}) continue;`);
        } else if (!alt && node.consequent.kind === 'Break') {
          p(`if (${testC}) break;`);
        } else if (!alt && node.consequent.kind === 'Return' && !node.consequent.value) {
          p(`if (${testC}) return;`);
        } else {
          p(`if (${testC}) {`);
          const _snap = this._snapshotCleanups();
          this.visitStmt(node.consequent, lines, depth + 1);
          this._restoreCleanups(_snap);
          // Do NOT emit '}' here тАФ it's emitted by the alt section or the no-alt close below
          hasBraces = true;  // treat as if braces were used, so alt/no-alt handling closes correctly
        }
        if (alt) {
          // else if: collapse into single line
          if (alt.kind === 'If') {
            p('} else if (' + this.exprToC(alt.test, lines, depth) + ') {');
            { const _snap = this._snapshotCleanups(); this.visitStmtOrBlock(alt.consequent, lines, depth + 1); this._restoreCleanups(_snap); }
            // recurse for chained else-if
            let cur = alt.alternate;
            while (cur) {
              if (cur.kind === 'If') {
                p('} else if (' + this.exprToC(cur.test, lines, depth) + ') {');
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
        let initC = '';
        if (node.init) {
          if (node.init.kind === 'VarDecl') {
            const { varKind, name, typeAnn, init } = node.init;
            const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
            const initExpr = init ? this.exprToC(init, lines, depth) : '0';
            initC = `${ctype} ${name} = ${initExpr}`;
            this.define(name, { ctype, varKind });
          } else if (node.init.kind === 'ExprStmt') {
            initC = this.exprToC(node.init.expr, lines, depth);
          }
        }
        const testC = node.test ? this.exprToC(node.test, lines, depth) : '';
        const updC  = node.update ? this.exprToC(node.update, lines, depth) : '';
        p(`for (${initC}; ${testC}; ${updC}) {`);
        const savedLC = this._loopBodyCleanups;
        this._loopBodyCleanups = [];
        this._loopDepth++;
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        this._loopDepth--;
        this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
        this._loopBodyCleanups = savedLC;
        p('}');
        break;
      }

      case 'ForOf': {
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
          p(`uint32_t ${tmpVar};`);
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
          p(`String ${tmpVar};`);
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
            p(`TscURLParam ${paramVar};`);
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
            p(`for (size_t ${_ivar} = 0; ${_ivar} < ${_setC}.size; ${_ivar}++) {`);
            if (_bindName) {
              lines.push(`${II}${qual}${_eC} ${_bindName} = ${_setC}._vals[${_ivar}];`);
              this.define(_bindName, { ctype: _eC, varKind: node.varKind });
            }
            const savedLC1 = this._loopBodyCleanups;
            this._loopBodyCleanups = [];
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._loopBodyCleanups = savedLC1;
            p('}');
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
            const _optType = `opt_${_elemIdent}`;
            const _n = this.loopCount++;
            const _iterVar = `_iter_${_n}`;
            const _elemVar = `_elem_${_n}`;
            const _objC = this.exprToC(node.iterable, lines, depth);
            p(`${_forOfClass._iterStructName} ${_iterVar} = ${_clsName}_iter(&${_objC});`);
            p(`${_optType} ${_elemVar};`);
            p(`while ((${_elemVar} = ${_clsName}_iter_next(&${_iterVar})).has_value) {`);
            const _bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
            if (_bindName) {
              lines.push(`${II}${qual}${_elemC} ${_bindName} = ${_elemVar}.value;`);
              this.define(_bindName, { ctype: _elemC, varKind: node.varKind });
            }
            const savedLC2 = this._loopBodyCleanups;
            this._loopBodyCleanups = [];
            this._loopDepth++;
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            this._loopDepth--;
            this._emitLoopBodyCleanups(lines, II);
            this._loopBodyCleanups = savedLC2;
            p('}');
            break;
          }
        }

        const iterC = this.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${this.loopCount++}`;
        // Infer element type: explicit annotation > array symbol > string char > default i32
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

        p(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          lines.push(`${II}${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
          this.define(bindName, { ctype: elemType, varKind: node.varKind });
        } else if (node.binding.kind === 'ArrayPattern') {
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`${II}${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        const savedLC3 = this._loopBodyCleanups;
        this._loopBodyCleanups = [];
        this._loopDepth++;
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        this._loopDepth--;
        this._emitLoopBodyCleanups(lines, II);
        this._loopBodyCleanups = savedLC3;
        p('}');
        break;
      }

      case 'ForIn': {
        throw this.error(`SyntaxError: 'for-in' loops are not supported; use 'for-of' instead`, node);
        break;
      }

      case 'While': {
        const testC = this.exprToC(node.test, lines, depth);
        p(`while (${testC}) {`);
        const savedLC4 = this._loopBodyCleanups;
        this._loopBodyCleanups = [];
        this._loopDepth++;
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        this._loopDepth--;
        this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
        this._loopBodyCleanups = savedLC4;
        p('}');
        break;
      }

      case 'DoWhile': {
        const testC = this.exprToC(node.test, lines, depth);
        p('do {');
        const savedLC5 = this._loopBodyCleanups;
        this._loopBodyCleanups = [];
        this._loopDepth++;
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        this._loopDepth--;
        this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
        this._loopBodyCleanups = savedLC5;
        p(`} while (${testC});`);
        break;
      }

      case 'Break':
        if (node.label) p(`goto ${node.label}_break;`);
        else p('break;');
        break;
      case 'Continue':
        if (node.label) p(`goto ${node.label}_continue;`);
        else p('continue;');
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
          const savedLC6 = this._loopBodyCleanups;
          this._loopBodyCleanups = [];
          this._loopDepth++;
          const bodyLines = [];
          this.visitStmtOrBlock(inner.body, bodyLines, depth + 1);
          for (const bl of bodyLines) lines.push(bl);
          this._emitLoopBodyCleanups(lines, ' '.repeat(this.indent * (depth + 1)));
          this._loopDepth--;
          this._loopBodyCleanups = savedLC6;
          if (usesContinue) {
            const II = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${II}${label}_continue:;`);
          }
          p('}');
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
          const ctx = this._throwsCtx;
          this._emitFuncCleanup(lines, I);
          if (val?.kind === 'New') {
            const errClass = val.name;
            const msgArg = val.args?.[0];
            const msgC = msgArg ? this.exprToC(msgArg.expr ?? msgArg, lines, depth) : 'STR_LIT("")';
            if (ctx.throwsNames.length === 1) {
              // Single error type
              p(`return (${ctx.resultType}){.ok = false, .error = ${errClass}_new(${msgC})};`);
            } else {
              // Union error type
              const idx = ctx.throwsNames.indexOf(errClass);
              const errUnionName = `_ErrUnion_${ctx.errKey}`;
              p(`${errUnionName} _err = {.tag = _Err_${errClass}, ._${idx} = ${errClass}_new(${msgC})};`);
              p(`return (${ctx.resultType}){.ok = false, .error = _err};`);
            }
          } else {
            const errC = this.exprToC(val, lines, depth);
            p(`return (${ctx.resultType}){.ok = false, .error = ${errC}};`);
          }
        } else {
          // Not in throws function тАФ fall back to tsc_throw
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

        // Check if try body contains a call to a throws function
        const _findThrowsFuncCall = (stmts) => {
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
          // Old embedded pattern (for throw new X() directly inside try)
          for (const s of tryStmts) {
            const isThrowNew = s.kind === 'Throw' && s.value?.kind === 'New';
            if (isThrowNew) {
              const val = s.value;
              const errClass = val.name;
              const errVarName = `_err_${this.tempCount++}`;
              const errC = this.exprToC(val, lines, depth);
              p(`${errClass} ${errVarName} = ${errC};`);
              for (const c of node.catches) {
                if (!c.typeAnn || c.typeAnn.name === errClass) {
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
        break;
      }

      case 'Switch': {
        const discType = this.inferType(node.discriminant);
        if (discType === 'double' || discType === 'float') {
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
        const discC = this.exprToC(node.discriminant, lines, depth);
        const IS = ' '.repeat(this.indent * (depth + 1));
        p(`switch (${discC}) {`);
        // Check if discriminant is a string literal union type
        const discEnumDef = this.classes.get(discType);
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
            lines.push(`${IS}default:`);
          }
          for (const s of c.body) this.visitStmt(s, lines, depth + 2);
        }
        p('}');
        break;
      }

      case 'Native': {
        let nativeOut = '';
        if (node.templateParts) {
          // native(`... ${expr} ...`) тАФ interpolate expressions
          for (const part of node.templateParts) {
            if (part.kind === 'str') {
              nativeOut += part.value;
            } else if (part.kind === 'expr') {
              // Re-parse the expression source (same as _templateToC in misc.js)
              const toks = this._lex(part.src, this.filename);
              const ast = this._parse(toks);
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
};
