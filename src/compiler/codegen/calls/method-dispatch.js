export default {
  methodCall(callee, args, lines, depth) {
    let baseObject = callee.object;
    if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
      const I = ' '.repeat(this.indent * depth);
      const chainLinks = [];
      while (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
        chainLinks.push(baseObject);
        baseObject = baseObject.callee.object;
      }
      for (let i = chainLinks.length - 1; i >= 0; i--) {
        const link = chainLinks[i];
        const flatCallee = { ...link.callee, object: baseObject };
        const innerC = this.methodCall(flatCallee, link.args, lines, depth);
        const resultType = this.inferType(link);
        const nextProp = (i > 0) ? chainLinks[i - 1].callee.prop : callee.prop;
        const nextTargetClass = this.classes.get(resultType);
        const nextTargetIface = this.interfaces.get(resultType);
        const hasNextMethod = (nextTargetClass?.methods?.some(m => m.name === nextProp))
          || (nextTargetIface?.some(m => m.kind === 'MethodSig' && m.name === nextProp))
          || (resultType.startsWith('Array_') && ['map','filter','slice','join','every','some','find','findIndex','forEach','sort','reduce','reduceRight','findLast','findLastIndex','flatMap','keys','values','entries','flat','concat','includes','indexOf','lastIndexOf','at','with','toReversed','toSorted','toSpliced','clone','pop','shift','unshift','splice','reverse','push','resize','reallocate','fill','set','view','viewMut','length','capacity'].includes(nextProp))
          || (resultType === 'String' && ['slice','indexOf','lastIndexOf','at','includes','startsWith','endsWith','split','trim','toUpperCase','toLowerCase','replace','padStart','padEnd','repeat','charAt','charCodeAt','concat','codePoints','graphemes','replaceAll','substring','trimStart','trimEnd','search','match','matchAll','length','toString'].includes(nextProp));
        if (hasNextMethod) {
          const tmpName = `_chain_${this.tempCount++}`;
          lines.push(`${I}${resultType} ${tmpName} = ${innerC};`);
          const chainDef = { ctype: resultType, varKind: 'const' };
          if (resultType.startsWith('Array_')) {
            const chainElemIdent = resultType.slice(6);
            chainDef.elemType = chainElemIdent;
            chainDef.arrElemCType = this._arrIdentToCType(chainElemIdent);
            chainDef.isArray = true;
          }
          this.define(tmpName, chainDef);
          baseObject = { kind: 'Ident', name: tmpName };
        } else {
          lines.push(`${I}${innerC};`);
        }
      }
    } else if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Ident') {
      const I = ' '.repeat(this.indent * depth);
      const resultType = this.inferType(baseObject);
      const tmpName = `_chain_${this.tempCount++}`;
      const innerC = this.callToC(baseObject, lines, depth);
      lines.push(`${I}${resultType} ${tmpName} = ${innerC};`);
      this.define(tmpName, { ctype: resultType, varKind: 'const' });
      baseObject = { kind: 'Ident', name: tmpName };
    } else if (baseObject.kind === 'New') {
      const I = ' '.repeat(this.indent * depth);
      const resultType = this.inferType(baseObject);
      const tmpName = `_chain_${this.tempCount++}`;
      const innerC = this.exprToC(baseObject, lines, depth);
      lines.push(`${I}${resultType} ${tmpName} = ${innerC};`);
      this.define(tmpName, { ctype: resultType, varKind: 'let' });
      baseObject = { kind: 'Ident', name: tmpName };
    }
    const prop  = callee.prop;
    const sym   = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (prop === 'upgrade' && sym?.isWeak) this._inWeakUpgrade = true;
    const objC = this.exprToC(baseObject, lines, depth);
    if (prop === 'upgrade' && sym?.isWeak) this._inWeakUpgrade = false;
    if (sym?._mutQuarantined) {
      throw this.error(`cannot access '${baseObject.name}' while a mutable borrow is active`, baseObject);
    }
    let et    = sym?.elemType ?? 'i32';
    let etC   = sym?.arrElemCType ?? 'int32_t';
    let arrObjC = objC;

    // Ref<T[]> / Mut<T[]>: dereference pointer for array operations
    if (sym?.isRefParam && sym?.derefType?.startsWith('Array_')) {
      et = sym.derefType.slice(6);
      etC = this._arrIdentToCType(et);
      arrObjC = `(*${objC})`;
    }

    const lambdaOutET = (argsC) => {
      const m = argsC.match(/_lambda_\d+_(\w+)/);
      return m ? m[1] : et;
    };

    const isArrayObj = sym?.isArray || this.inferType(baseObject)?.startsWith('Array_')
                     || (sym?.isRefParam && sym?.derefType?.startsWith('Array_'));
    const arrayCallbackProps = new Set(['filter','map','every','some','find','findIndex','forEach','sort','reduce','reduceRight','findLast','findLastIndex','flatMap']);
    let cbFnName = null;
    let cbExtraArgs = '';
    let argsForC = args;
    if (isArrayObj && arrayCallbackProps.has(prop) && args.length > 0) {
      const _refHint = etC === 'String' ? 'String *' : etC;
      if (prop === 'reduce' || prop === 'reduceRight') {
        this._lambdaParamHint = [etC, _refHint];
      } else if (prop === 'sort') {
        this._lambdaParamHint = [_refHint, _refHint];
      } else {
        this._lambdaParamHint = [_refHint];
      }
      cbFnName = this._extractCallbackFn(args[0], lines, depth);
      this._lambdaParamHint = null;
      if (cbFnName) {
        argsForC = args.slice(1);
        if (argsForC.length > 0) {
          cbExtraArgs = argsForC.map(a => a.spread ? `/* ...${this.exprToC(a.expr, lines, depth)} */` : this.exprToC(a.expr, lines, depth)).join(', ');
        }
      }
    }
    const _objType = this.inferType(baseObject);
    if (_objType?.startsWith('Promise_') && ['then','catch','finally'].includes(prop) && args.length > 0) {
      const innerType = _objType.slice(8);
      const innerCType = this._arrIdentToCType(innerType);
      if (prop !== 'finally') this._lambdaParamHint = [innerCType];
      cbFnName = this._extractCallbackFn(args[0], lines, depth);
      this._lambdaParamHint = null;
      if (cbFnName) {
        argsForC = [];
      }
    }
    const argsC = this.argsToC(argsForC, lines, depth);
    if (isArrayObj) {
      switch (prop) {
        case 'push': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          let elemC = args[0] ? this.exprToC(args[0].expr, [], depth) : '0';
          if (et === 'tsc_unknown' && args[0]) {
            const _argType = this.inferType(args[0].expr);
            if (_argType !== 'tsc_unknown') {
              this._ensureUnknownStruct();
              const _packer = this._unknownPackerFor(_argType);
              elemC = `${_packer}(${elemC})`;
            }
          }
          if (this._isOptType(etC) && args[0]) {
            elemC = this._wrapOptValue(elemC, args[0].expr, etC);
          }
          if (args[0] && args[0].expr.kind === 'Ident') {
            const _pushCls = this.classes.get(et);
            const _pushIsArr = et.startsWith('Array_');
            if ((_pushCls?.fields || _pushIsArr)) {
              const _pushSym = this.lookup(args[0].expr.name);
              if (_pushSym) {
                if (_pushSym._moved)
                  throw this.error(`use of moved value: "${args[0].expr.name}"`, args[0].expr,
                    { code: 'E002', secondary: _pushSym._movedSourceNode, secondaryLine: _pushSym._movedLine });
                _pushSym._moved = true;
                _pushSym._movedLine = args[0].expr.line;
                _pushSym._movedSourceNode = args[0].expr;
              }
            }
          }
          if (baseObject.kind === 'Ident') {
            this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            if (sym) sym.arraySize = undefined;
          }
          if (args[0]?.expr.kind === 'Ident') {
            const _pushArgSym = this.lookup(args[0].expr.name);
            elemC = this._derefStrPtr(_pushArgSym, elemC);
          }
          return `tsc_array_push_${et}(&${objC}, ${elemC})`;
        }
        case 'pop': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          if (!this._isOptType(etC)) {
            this._ensureOptStruct(`opt_${et}`, etC);
          }
          if (sym?.arraySize === 0) this._lastPopEmpty = true;
          return `tsc_array_pop_${et}(&${objC})`;
        }
        case 'remove': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          const idxC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          this._lastArrayElemReturn = true;
          return `tsc_array_remove_${et}(&${objC}, ${idxC})`;
        }
        case 'view': {
          const slName = `Slice_${et}`;
          this._ensureSliceStruct(slName, etC, false);
          if (baseObject.kind === 'Ident' && sym) this._trackRefBorrow(sym);
          let _vs = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _ve = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(size_t)${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const vsTmp = `_tsc_vs_${this.tempCount++}`;
            lines.push(`${' '.repeat(this.indent * depth)}int32_t ${vsTmp} = ${_vs};`);
            _vs = vsTmp;
          }
          return `(${slName}){ .ptr = ${objC}.data + (${_vs}), .length = (size_t)(${_ve}) - (${_vs}) }`;
        }
        case 'viewMut': {
          const msName = `MutSlice_${et}`;
          this._ensureSliceStruct(msName, etC, true);
          if (baseObject.kind === 'Ident' && sym) this._trackRefBorrow(sym);
          let _ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _me = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(size_t)${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const msTmp = `_tsc_vs_${this.tempCount++}`;
            lines.push(`${' '.repeat(this.indent * depth)}int32_t ${msTmp} = ${_ms};`);
            _ms = msTmp;
          }
          return `(${msName}){ .ptr = ${objC}.data + (${_ms}), .length = (size_t)(${_me}) - (${_ms}) }`;
        }
        case 'length':   return `${objC}.length`;
        case 'capacity': return `${objC}.capacity`;
        case 'sort': {
          if (args.length && this._strictRules?.has('no-sort')) {
            throw this.error('Array.sort() with comparator is forbidden in strict mode (no-sort)', baseObject);
          }
          const fnC = args.length ? (cbFnName ?? argsC) : 'NULL';
          return `tsc_array_sort_${et}(&${objC}, ${fnC})`;
        }
        case 'reverse':    return `tsc_array_reverse_${et}(&${objC})`;
        case 'fill': {
          const v     = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const start = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const end   = args[2] ? this.exprToC(args[2].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_fill_${et}(&${objC}, ${v}, ${start}, ${end})`;
        }
        case 'resize': {
          const nNode = args[0]?.expr;
          const nC    = nNode ? this.exprToC(nNode, lines, depth) : '0';
          const fillC = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          if (baseObject.kind === 'Ident') {
            const nLit = nNode?.kind === 'Literal' ? parseFloat(nNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(nLit) || isNaN(curSize) || nLit > curSize) {
              this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = isNaN(nLit) ? undefined : nLit;
          }
          return `tsc_array_resize_${et}(&${objC}, ${nC}, ${fillC})`;
        }
        case 'reallocate': {
          const capNode = args[0]?.expr;
          const capC = capNode ? this.exprToC(capNode, lines, depth) : '0';
          if (baseObject.kind === 'Ident') {
            const capLit = capNode?.kind === 'Literal' ? parseFloat(capNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(capLit) || isNaN(curSize) || capLit > curSize) {
              this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = undefined;
          }
          return `tsc_array_reallocate_${et}(&${objC}, ${capC})`;
        }
        case 'filter':  return `tsc_array_filter_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        case 'forEach': return `tsc_array_foreach_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        case 'map': {
          const outET = cbFnName ? (this._lastCbRetType ? this.cTypeToIdent(this._lastCbRetType) : et) : lambdaOutET(argsC);
          if (outET !== et) {
            const outArrName = `Array_${outET}`;
            const outElemCType = this._arrIdentToCType(outET);
            this._ensureArrayStruct(outArrName, outElemCType);
          }
          return `tsc_array_map_${et}_${outET}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'reduce': {
          const initExpr = args[1]?.expr;
          const outET = initExpr ? this.cTypeToIdent(this.inferType(initExpr)) : et;
          const reduceArgs = cbFnName ? `${cbFnName}${cbExtraArgs ? ', ' + cbExtraArgs : ''}` : argsC;
          return `tsc_array_reduce_${et}_${outET}(${arrObjC}, ${reduceArgs})`;
        }
        case 'reduceRight': {
          const initExpr2 = args[1]?.expr;
          const outET2 = initExpr2 ? this.cTypeToIdent(this.inferType(initExpr2)) : et;
          const reduceArgs2 = cbFnName ? `${cbFnName}${cbExtraArgs ? ', ' + cbExtraArgs : ''}` : argsC;
          return `tsc_array_reduce_right_${et}_${outET2}(${arrObjC}, ${reduceArgs2})`;
        }
        case 'every':    return `tsc_array_every_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        case 'some':     return `tsc_array_some_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        case 'find': {
          this._ensureOptRefStruct(`opt_ref_${et}`, etC);
          return `tsc_array_find_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'findIndex': return `(int)tsc_array_find_index_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        case 'indexOf':  return `(int)tsc_array_index_of_${et}(${arrObjC}, ${argsC})`;
        case 'includes': return `tsc_array_includes_${et}(${arrObjC}, ${argsC})`;
        case 'concat':   return `tsc_array_concat_${et}(${arrObjC}, ${argsC})`;
        case 'set': {
          const srcExpr = args[0]?.expr;
          const srcC = srcExpr ? this.exprToC(srcExpr, lines, depth) : '';
          const offsetC = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_array_set_${et}(&${objC}, ${srcC}, ${offsetC})`;
        }
        case 'slice': {
          const s = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const e = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(int32_t)${arrObjC}.length`;
          return `tsc_array_slice_${et}(${arrObjC}, ${s}, ${e})`;
        }
        case 'join': {
          const sep = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")';
          return `tsc_array_join_${et}(${arrObjC}, ${sep})`;
        }
        case 'keys':    return `tsc_array_keys_${et}(${arrObjC})`;
        case 'values':  return `tsc_array_values_${et}(${arrObjC})`;
        case 'entries': return `tsc_array_entries_${et}(${arrObjC})`;
        case 'flat':    return `tsc_array_flat_${et}(${arrObjC})`;
        case 'shift': {
          this._ensureOptStruct(`opt_${et}`, etC);
          this._lastSuppressConst = true;
          return `tsc_array_shift_${et}(&${objC})`;
        }
        case 'unshift': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          const uv = args[0] ? this.exprToC(args[0].expr, [], depth) : '0';
          return `tsc_array_unshift_${et}(&${objC}, ${uv})`;
        }
        case 'splice': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          const spStart = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const spDel = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const spItems = argsForC.slice(2).map(a => a.spread ? `/* ...${this.exprToC(a.expr, lines, depth)} */` : this.exprToC(a.expr, lines, depth));
          const spArgs = spItems.length > 0 ? `${spStart}, ${spDel}, ${spItems.join(', ')}` : `${spStart}, ${spDel}`;
          return `tsc_array_splice_${et}(&${objC}, ${spArgs})`;
        }
        case 'at': {
          const atIdx = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_array_at_${et}(${arrObjC}, ${atIdx})`;
        }
        case 'with': {
          const wIdx = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const wVal = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_array_with_${et}(${arrObjC}, ${wIdx}, ${wVal})`;
        }
        case 'lastIndexOf': return `(int)tsc_array_last_index_of_${et}(${arrObjC}, ${argsC})`;
        case 'findLast': {
          this._ensureOptRefStruct(`opt_ref_${et}`, etC);
          return `tsc_array_find_last_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'findLastIndex': return `(int)tsc_array_find_last_index_${et}(${arrObjC}, ${cbFnName ?? argsC})`;
        case 'flatMap': {
          let fmOutET = et;
          if (cbFnName && this._lastCbRetType) {
            const fmRet = this._lastCbRetType;
            fmOutET = fmRet.startsWith('Array_') ? fmRet.slice(6) : this.cTypeToIdent(fmRet);
          }
          return `tsc_array_flat_map_${et}_${fmOutET}(${arrObjC}, ${cbFnName ?? argsC})`;
        }
        case 'toReversed': return `tsc_array_to_reversed_${et}(${arrObjC})`;
        case 'toSorted': {
          const tsCmp = args.length ? (cbFnName ?? argsC) : 'NULL';
          return tsCmp === 'NULL' ? `tsc_array_to_sorted_${et}(${arrObjC})` : `tsc_array_to_sorted_${et}(${arrObjC})`;
        }
        case 'toSpliced': {
          const tsStart = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const tsDel = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const tsItems = argsForC.slice(2).map(a => a.spread ? `/* ...${this.exprToC(a.expr, lines, depth)} */` : this.exprToC(a.expr, lines, depth));
          const tsArgs = tsItems.length > 0 ? `${tsStart}, ${tsDel}, ${tsItems.join(', ')}` : `${tsStart}, ${tsDel}`;
          return `tsc_array_to_spliced_${et}(${arrObjC}, ${tsArgs})`;
        }
        case 'clone': {
          if (baseObject.kind === 'Ident') {
            return `tsc_array_slice_${et}(${arrObjC}, 0, (int32_t)${arrObjC}.length)`;
          }
          const arrType = this.inferType(baseObject) ?? `Array_${etC}`;
          const tmp = `_tsc_arr_${this.tempCount++}`;
          lines.push(`${' '.repeat(this.indent * depth)}${arrType} ${tmp} = ${arrObjC};`);
          return `tsc_array_slice_${et}(${tmp}, 0, (int32_t)${tmp}.length)`;
        }
      }
    }

    const baseObjType = this.inferType(baseObject);
    const isSliceObj = baseObjType?.startsWith('Slice_') || baseObjType?.startsWith('MutSlice_');
    if (isSliceObj) {
      const isMut = baseObjType.startsWith('MutSlice_');
      const sliceEtC = baseObjType.slice(isMut ? 9 : 6);
      const sliceEt  = this.cTypeToIdent(sliceEtC);
      switch (prop) {
        case 'view': {
          const slName = `Slice_${sliceEt}`;
          this._ensureSliceStruct(slName, sliceEtC, false);
          let _vs = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _ve = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const vsTmp = `_tsc_vs_${this.tempCount++}`;
            lines.push(`${' '.repeat(this.indent * depth)}int32_t ${vsTmp} = ${_vs};`);
            _vs = vsTmp;
          }
          return `(${slName}){ .ptr = ${objC}.ptr + (${_vs}), .length = (size_t)(${_ve}) - (${_vs}) }`;
        }
        case 'viewMut': {
          const msName = `MutSlice_${sliceEt}`;
          this._ensureSliceStruct(msName, sliceEtC, true);
          let _ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const _me = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${objC}.length`;
          if (args[0] && !['Ident','Literal'].includes(args[0].expr.kind)) {
            const msTmp = `_tsc_vs_${this.tempCount++}`;
            lines.push(`${' '.repeat(this.indent * depth)}int32_t ${msTmp} = ${_ms};`);
            _ms = msTmp;
          }
          return `(${msName}){ .ptr = ${objC}.ptr + (${_ms}), .length = (size_t)(${_me}) - (${_ms}) }`;
        }
      }
    }

    const _isStrPtr = sym?.ctype === 'String *';
    const strObjC = _isStrPtr ? `(*${objC})` : objC;
    const strMethods = {
      length:     () => `${_isStrPtr ? objC + '->' : objC + '.'}length`,
      slice:      () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${strObjC}, ${a[0]??0}, ${a[1]??'(int32_t)'+strObjC+'.length'})`; },
      indexOf:      () => `(int)tsc_string_index_of(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      lastIndexOf:  () => `(int)tsc_string_last_index_of(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      at:           () => {
        const idxNode = args[0]?.expr;
        const idxC = this.exprToC(idxNode, lines, depth);
        if (!this._emittedOptStructs.has('opt_u8')) {
          this._emittedOptStructs.add('opt_u8');
        }
        const idxVal = (idxNode?.kind === 'Literal' && idxNode?.litType === 'number') ? parseFloat(idxNode.value) : NaN;
        this._lastAtNonNeg = !isNaN(idxVal) && idxVal >= 0;
        return `tsc_string_at(${strObjC}, ${idxC})`;
      },
      includes:   () => `tsc_string_includes(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      startsWith: () => `tsc_string_starts_with(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      endsWith:   () => `tsc_string_ends_with(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      split:      () => { this._ensureArrayStruct('Array_string', 'String'); return `tsc_string_split_expr(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`; },
      trim:       () => `tsc_string_trim(${strObjC})`,
      toUpperCase:() => `tsc_string_to_upper(${strObjC})`,
      toLowerCase:() => `tsc_string_to_lower(${strObjC})`,
      replace:    () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace(${strObjC}, ${a[0]}, ${a[1]})`; },
      padStart:   () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_start(${strObjC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      padEnd:     () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_end(${strObjC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      repeat:     () => `tsc_string_repeat(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charAt:     () => `tsc_string_char_at(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charCodeAt: () => { const idxC = this.exprToC(args[0].expr, lines, depth); return `(unsigned)(uint8_t)TSC_STRING_GET_CHAR(${strObjC}, ${idxC})`; },
      concat:     () => `tsc_string_concat(${strObjC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      codePoints:  () => `tsc_codepoints(${strObjC})`,
      graphemes:   () => `tsc_graphemes(${strObjC})`,
      replaceAll:  () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace_all(${strObjC}, ${a[0]}, ${a[1]})`; },
      substring:   () => {
                     const a = args.map(a => this.exprToC(a.expr, lines, depth));
                     if (a[1] === undefined && baseObject.kind !== 'Ident') {
                       const tmp = `_tsc_str_${this.tempCount++}`;
                       lines.push(`${' '.repeat(this.indent * depth)}String ${tmp} = ${strObjC};`);
                       return `tsc_string_substring(${tmp}, ${a[0]}, (int32_t)${tmp}.length)`;
                     }
                     return `tsc_string_substring(${strObjC}, ${a[0]}, ${a[1] ?? `(int32_t)${strObjC}.length`})`;
                   },
      trimStart:   () => `tsc_string_trim_start(${strObjC})`,
      trimEnd:     () => `tsc_string_trim_end(${strObjC})`,
      search:      () => {
                     const rArg = args[0]?.expr;
                     const rC = this.exprToC(rArg, lines, depth);
                     const rSym = rArg?.kind === 'Ident' ? this.lookup(rArg.name) : null;
                     if (rSym?._isRegex) return `tsc_regex_search(&${rArg.name}, ${strObjC})`;
                     return `tsc_regex_search(&(TscRegex){0}, ${strObjC})`;
                   },
      match:       () => {
                     const rArg = args[0]?.expr;
                     const rC = this.exprToC(rArg, lines, depth);
                     const rSym = rArg?.kind === 'Ident' ? this.lookup(rArg.name) : null;
                     this._ensureArrayStruct('Array_string', 'String');
                     this._ensureOptStruct('opt_Array_string', 'Array_string');
                     if (rSym?._isRegex) return `tsc_regex_match(&${rArg.name}, ${strObjC})`;
                     return `tsc_regex_match(&(TscRegex){0}, ${strObjC})`;
                   },
      matchAll:    () => {
                     const rArg = args[0]?.expr;
                     const rSym = rArg?.kind === 'Ident' ? this.lookup(rArg.name) : null;
                     this._ensureArrayStruct('Array_string', 'String');
                     this._ensureArrayStruct('Array_Array_string', 'Array_string');
                     if (rSym?._isRegex) return `tsc_regex_match_all(&${rArg.name}, ${strObjC})`;
                     return `tsc_regex_match_all(&(TscRegex){0}, ${strObjC})`;
                   },
    };

    const _smInlineSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (_smInlineSym?._isStaticMapInline && prop === 'get') {
      const sym = _smInlineSym;
      if (!sym._getFn) {
        const idx = sym._smIdx;
        const fnName = `_staticmap_${idx}_get`;
        sym._getFn = fnName;
        const entries = sym._entries;
        const n = entries.length;
        const buckets = Math.max(1, n);

        this.addTop('typedef struct { bool has_value; int32_t value; } opt_i32;');
        this.addTop('');

        const djb2 = (s) => {
          let h = 5381;
          for (let i = 0; i < s.length; i++) {
            h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
          }
          return h;
        };

        const bucketMap = new Map();
        for (const e of entries) {
          const b = djb2(e.key) % buckets;
          if (!bucketMap.has(b)) bucketMap.set(b, []);
          bucketMap.get(b).push(e);
        }

        const fnLines = [];
        fnLines.push(`static opt_i32 ${fnName}(String key) {`);
        fnLines.push(`    uint32_t _h = tsc_djb2(key);`);
        fnLines.push(`    switch (_h % ${buckets}) {`);
        for (const [b, bEntries] of bucketMap) {
          let line = `        case ${b}:`;
          for (const e of bEntries) {
            line += ` if (tsc_string_eq(key, STR_LIT("${e.key}"))) return (opt_i32){true, ${e.valC}};`;
          }
          line += ' break;';
          fnLines.push(line);
        }
        if (this._strictRules?.has('switch-default')) {
          fnLines.push('        default: break;');
        }
        fnLines.push('    }');
        fnLines.push('    return (opt_i32){false, 0};');
        fnLines.push('}');
        for (const l of fnLines) this.topLevel.push(l);
        this.topLevel.push('');
        this._lastSuppressConst = true;
      }
      const keyC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `${sym._getFn}(${keyC})`;
    }

    const _smSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (_smSym?._isStaticMap) {
      const sfx = _smSym._smSuffix;
      const varName = baseObject.name;
      if (prop === 'set')    return `tsc_staticmap_set_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'get')    return `tsc_staticmap_get_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'has')    return `tsc_staticmap_has_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'delete') return `tsc_staticmap_delete_${sfx}(&${varName}, ${argsC})`;
      if (prop === 'clear')  return `tsc_staticmap_clear_${sfx}(&${varName})`;
    }

    const objType2 = (baseObject.kind === 'Ident' ? this.lookup(baseObject.name)?.ctype : null)
      ?? this.inferType(baseObject);
    const _mapSfx2 = this._mapSuffix(objType2);
    if (_mapSfx2) {
      const mapSuffix = _mapSfx2;
      const mapVarName = baseObject.kind === 'Ident' ? baseObject.name : null;
      if (prop === 'set') {
        if (mapVarName) {
          this._mapHasSetCalls.add(mapVarName);
        }
        return `tsc_map_set_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'get' || prop === 'delete') {
        if (mapVarName) {
          const hasSet = this._mapHasSetCalls?.has(mapVarName) ?? false;
          this._lastOptIsNull = !hasSet;
        }
        if (prop === 'get') {
          const parts = mapSuffix.split('_');
          const vIdent = parts.slice(1).join('_');
          const vCType = this._arrIdentToCType(vIdent);
          this._ensureOptRefStruct(`opt_ref_${vIdent}`, vCType);
          return `tsc_map_get_ref_${mapSuffix}(&${objC}, ${argsC})`;
        }
        if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'has')    return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'clear')  return `tsc_map_clear_${mapSuffix}(&${objC})`;
      if (prop === 'forEach') {
        const cbArg = args[0]?.expr;
        if (!cbArg || cbArg.kind !== 'Arrow') return null;
        const parts = mapSuffix.split('_');
        const kIdent = parts[0];
        const vIdent = parts.slice(1).join('_');
        const kCType = this._arrIdentToCType(kIdent);
        const vCType = this._arrIdentToCType(vIdent);
        this._lambdaParamHint = [vCType, kCType];
        const cbFnName = this._extractCallbackFn(args[0], lines, depth);
        this._lambdaParamHint = null;
        if (!cbFnName) return null;
        return `tsc_map_for_each_${mapSuffix}(&${objC}, ${cbFnName})`;
      }
      if (prop === 'values') {
        const parts = mapSuffix.split('_');
        const vIdent = parts.slice(1).join('_');
        const vCType = this._arrIdentToCType(vIdent);
        this._ensureArrayStruct(`Array_${vIdent}`, vCType);
        this._lastSuppressConst = true;
        return `tsc_map_values_${mapSuffix}(&${objC})`;
      }
      if (prop === 'keys') {
        this._lastSuppressConst = true;
        return `tsc_map_keys_${mapSuffix}(&${objC})`;
      }
      if (prop === 'entries') return `tsc_map_entries_${mapSuffix}(&${objC})`;
    }

    const numMethods = {
      toFixed: () => {
        const objType = this.inferType(baseObject);
        if (objType === 'int32_t' || objType === 'int64_t' || objType === 'uint32_t')
          throw this.error(`"toFixed()" is only available on f32/f64`);
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw this.error(`"toFixed()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.${n}f", ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
      toPrecision: () => {
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw this.error(`"toPrecision()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.*g", ${n}, ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
    };

    const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
    if (hasOwn(strMethods, prop) && strMethods[prop]) return strMethods[prop]();
    if (hasOwn(numMethods, prop) && numMethods[prop]) return numMethods[prop]();

    if (prop === 'toString') {
      const objType5 = (baseObject.kind === 'Ident' ? this.lookup(baseObject.name)?.ctype : null)
                       ?? this.inferType(baseObject);
      if (objType5 === 'String') return objC;
      if (objType5 && !objType5.startsWith('Array_') && !this._mapSuffix(objType5) &&
          !objType5.startsWith('opt_') && objType5 !== 'void') {
        const etId5 = this.cTypeToIdent(objType5);
        return `tsc_${etId5}_to_string(${objC})`;
      }
    }

    if (baseObject.kind === 'Ident' && this.classes.has(baseObject.name)) {
      const poolDef = this.classes.get(baseObject.name);
      if (poolDef?._isPool && prop === 'alloc') {
        throw this.error(`PoolClass.alloc() is removed; use "new ${baseObject.name}()" instead`, node);
      }
      if (poolDef?._isPool && prop === 'drop') {
        this._ensurePoolDrop(baseObject.name);
        return `${poolDef._poolDropFn}(${argsC})`;
      }
    }

    if (prop === 'upgrade' && sym?.isWeak) {
      return `tsc_weak_upgrade(${objC})`;
    }

    if (baseObject.kind === 'Ident' && this.classes.has(baseObject.name)) {
      const classDef = this.classes.get(baseObject.name);
      const methodInfo = classDef?._methodNames?.get(prop);
      if (methodInfo?.isStatic) {
        return `${methodInfo.nameMangled}(${argsC})`;
      }
    }

    const ifaceSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (ifaceSym?.ctype && this.interfaces.has(ifaceSym.ctype)) {
      const ifaceArgsC = argsC ? `, ${argsC}` : '';
      return `${objC}.vtable->${prop}(${objC}.self${ifaceArgsC})`;
    }

    const objType = this.inferType(baseObject);
    if (objType?.startsWith('Promise_') && (prop === 'then' || prop === 'catch' || prop === 'finally')) {
      const innerType = objType.slice(8);
      const innerCType = this._arrIdentToCType(innerType);
      const I = ' '.repeat(this.indent * depth);
      const cbRetType = this._lastCbRetType ?? innerCType;
      const cbRetIdent = this.cTypeToIdent(cbRetType);
      const resultPromiseType = `Promise_${cbRetIdent}`;

      if (prop === 'then') {
        this._emitPromiseTypedef(resultPromiseType, cbRetType);
        const tmpName = `_then_${this.tempCount++}`;
        lines.push(`${I}${cbRetType} ${tmpName} = ${cbFnName}(${objC}._result);`);
        this.define(tmpName, { ctype: cbRetType, varKind: 'const' });
        return `(${resultPromiseType}){._done = true, ._result = ${tmpName}, ._ok = true}`;
      }
      if (prop === 'catch') {
        this._emitPromiseTypedef(resultPromiseType, cbRetType);
        const tmpName = `_catch_${this.tempCount++}`;
        lines.push(`${I}${cbRetType} ${tmpName} = ${objC}._ok ? ${objC}._result : ${cbFnName}(${objC}._error);`);
        this.define(tmpName, { ctype: cbRetType, varKind: 'const' });
        return `(${resultPromiseType}){._done = true, ._result = ${tmpName}, ._ok = true}`;
      }
      if (prop === 'finally') {
        this._emitPromiseTypedef(objType, innerCType);
        lines.push(`${I}${cbFnName}();`);
        return objC;
      }
    }

    const classSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (classSym?.ctype?.startsWith('opt_ref_')) {
      const poolClassName = classSym.ctype.slice(8);
      const poolCls = this.classes.get(poolClassName);
      if (poolCls?._isPool) {
        const methodInfo = poolCls._methodNames?.get(prop);
        if (methodInfo?.isMoveMethod) {
          if (classSym.varKind === 'const') {
            throw this.error(`TypeError: Cannot move '${baseObject.name}': variable is declared const`);
          }
          return `${methodInfo.nameMangled}(*${objC}.value${argsC ? ', ' + argsC : ''})`;
        }
        if (methodInfo?.isExplicitMut && classSym.varKind === 'const') {
          throw this.error(`cannot call "mut" method on const binding`);
        }
        if (methodInfo) {
          return `${poolClassName}_${prop}(${objC}.value${argsC ? ', ' + argsC : ''})`;
        }
      }
    }
    if (classSym?.ctype && this.classes.has(classSym.ctype)) {
      const classDef2 = this.classes.get(classSym.ctype);
      const methodInfo2 = classDef2?._methodNames?.get(prop);
      if (methodInfo2?.isMoveMethod) {
        if (classSym.varKind === 'const') {
          throw this.error(`TypeError: Cannot move '${baseObject.name}': variable is declared const`);
        }
        return `${methodInfo2.nameMangled}(${objC}${argsC ? ', ' + argsC : ''})`;
      }
      if (methodInfo2?.isExplicitMut && classSym.varKind === 'const') {
        throw this.error(`cannot call "mut" method on const binding`);
      }
      if (methodInfo2) {
        return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
      }
    }

    if (this._extensions) {
      const objType = this.inferType(baseObject);
      if (objType) {
        const typeIdent = this.cTypeToIdent(objType);
        const extKey = `${typeIdent}.${prop}`;
        const ext = this._extensions.get(extKey);
        if (ext) {
          return `${ext.cFuncName}(${objC}${argsC ? ', ' + argsC : ''})`;
        }
      }
    }

    if (classSym?.ctype && this.classes.has(classSym.ctype)) {
      return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
    }
    return `${objC}.${prop}(${argsC})`;
  },

  argsToC(args, lines, depth) {
    const parts = [];
    const I = ' '.repeat(this.indent * depth);
    for (const a of args) {
      if (a.spread) {
        const spreadSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
        if (spreadSym?.isArray && spreadSym.arraySize >= 0) {
          const n = a.expr.name;
          const useData = spreadSym.ctype?.startsWith('Array_');
          for (let i = 0; i < spreadSym.arraySize; i++)
            parts.push(useData ? `${n}.data[${i}]` : `${n}[${i}]`);
        } else {
          parts.push(`/* ...${this.exprToC(a.expr, lines, depth)} */`);
        }
      } else {
        let c = this.exprToC(a.expr, lines, depth);
        if (this._isHeapStringInit(a.expr)) {
          const tmp = `_arg_${this.tempCount++}`;
          lines.push(`${I}String ${tmp} = ${c};`);
          this._pushPostStmtCleanup(`${I}tsc_string_release(${tmp});`);
          c = tmp;
        }
        parts.push(c);
      }
    }
    return parts.join(', ');
  },

  _getIfaceParamName(typeAnn) {
    if (!typeAnn || typeAnn.kind !== 'TypeRef') return null;
    if (this.interfaces.has(typeAnn.name)) return typeAnn.name;
    if ((typeAnn.name === 'Mut' || typeAnn.name === 'Ref') && typeAnn.typeArgs?.[0]?.kind === 'TypeRef') {
      const inner = typeAnn.typeArgs[0].name;
      if (this.interfaces.has(inner)) return inner;
    }
    return null;
  },

  _extractCallbackFn(arg, lines, depth) {
    const expr = arg.expr ?? arg;
    if (expr.kind === 'Arrow') {
      if (this._strictRules?.has('no-closures')) {
        throw this.error('closures are forbidden in strict mode (no-closures); use named functions or inline the logic', expr);
      }
      const closure = this.hoistClosure(expr, `_cb_${this.closureCount ?? 0}`);
      if (closure) {
        if (closure.retainLines?.length) {
          const I = ' '.repeat(this.indent * depth);
          for (const rl of closure.retainLines) lines.push(`${I}${rl}`);
        }
        const envIdx = this.closureCount - 1;
        const envLocal = `_cb_env_${envIdx}`;
        const envGlobal = `_tsc_cb_env_${envIdx}`;
        this.addLambda(`static ${closure.envName} *${envGlobal};`);
        lines.push(`${' '.repeat(this.indent * depth)}${closure.envName} ${envLocal} = ${closure.envInit};`);
        lines.push(`${' '.repeat(this.indent * depth)}${envGlobal} = &${envLocal};`);
        const hint = this._lambdaParamHint ?? [];
        const adapterParams = hint.length > 0
          ? hint.map((ct, i) => `${ct} _p${i}`).join(', ')
          : 'void *_elem';
        const adapterArgs = hint.length > 0
          ? hint.map((_, i) => `_p${i}`).join(', ')
          : '_elem';
        const adapterName = `${closure.closureName}_adapter`;
        this.addLambda(`static ${closure.ret} ${adapterName}(${adapterParams}) {`);
        this.addLambda(`    return ${closure.fnName}(${envGlobal}, ${adapterArgs});`);
        this.addLambda(`}`);
        this.addLambda('');
        this._lastCbRetType = closure.ret;
        return adapterName;
      }
      const fnName = this.hoistArrow(expr, 'void', '_cb');
      this._lastCbRetType = this.inferArrowReturn(expr);
      return fnName;
    }
    if (expr.kind === 'Ident') {
      const sym = this.lookup(expr.name);
      if (sym?._closureFnName) { this._lastCbRetType = sym.closureRetType; return sym._closureFnName; }
      if (sym?.funcName) { this._lastCbRetType = sym.ctype; return sym.funcName; }
    }

    return null;
  },

  _ensureImplicitVtable(className, ifaceName) {
    const key = `${className}_${ifaceName}`;
    if (this._emittedImplicitVtables.has(key)) return;
    this._emittedImplicitVtables.add(key);

    const ifaceDef = this.interfaces.get(ifaceName);
    if (!ifaceDef) return;
    const ifaceMethods = ifaceDef.filter(m => m.kind === 'MethodSig');
    const classDef = this.classes.get(className);
    for (const im of ifaceMethods) {
      const methodExists = classDef?.methods?.some(mm => mm.name === im.name);
      if (!methodExists) {
        throw this.error(`TypeError: Class '${className}' does not implement interface '${ifaceName}': missing method '${im.name}'`);
      }
    }
    const vtableName = `_${className}_${ifaceName}_vtable`;

    const entries = ifaceMethods.map(m => {
      const retType = m.returnType ? this.resolveType(m.returnType) : 'void';
      return `    .${m.name} = (${retType} (*)(void *))${className}_${m.name}`;
    });
    this.topLevel.push(
      `static const ${ifaceName}_vtable ${vtableName} = {`,
      ...entries.map(e => e + ','),
      `};`,
      ``
    );
  },
};
