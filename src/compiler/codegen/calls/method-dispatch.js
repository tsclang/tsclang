export default {
  methodCall(callee, args, lines, depth) {
    let baseObject = callee.object;
    if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
      const I = ' '.repeat(this.indent * depth);
      while (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
        const innerC = this.callToC(baseObject, lines, depth);
        lines.push(`${I}${innerC};`);
        baseObject = baseObject.callee.object;
      }
    }
    const objC = this.exprToC(baseObject, lines, depth);
    const prop  = callee.prop;

    const sym   = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    const et    = sym?.elemType ?? 'i32';
    const etC   = sym?.arrElemCType ?? 'int32_t';

    const lambdaOutET = (argsC) => {
      const m = argsC.match(/_lambda_\d+_(\w+)/);
      return m ? m[1] : et;
    };

    const isArrayObj = sym?.isArray || this.inferType(baseObject)?.startsWith('Array_');
    const arrayCallbackProps = new Set(['filter','map','every','some','find','findIndex','forEach','sort','reduce']);
    let cbFnName = null;
    let cbExtraArgs = '';
    let argsForC = args;
    if (isArrayObj && arrayCallbackProps.has(prop) && args.length > 0) {
      this._lambdaParamHint = (prop === 'reduce' || prop === 'sort') ? [etC, etC] : [etC];
      cbFnName = this._extractCallbackFn(args[0], lines, depth);
      this._lambdaParamHint = null;
      if (cbFnName) {
        argsForC = args.slice(1);
        if (argsForC.length > 0) {
          cbExtraArgs = argsForC.map(a => a.spread ? `/* ...${this.exprToC(a.expr, lines, depth)} */` : this.exprToC(a.expr, lines, depth)).join(', ');
        }
      }
    }
    const argsC = this.argsToC(argsForC, lines, depth);
    if (isArrayObj) {
      switch (prop) {
        case 'push': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          const elemC = args[0] ? this.exprToC(args[0].expr, [], depth) : '0';
          if (baseObject.kind === 'Ident') {
            this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            if (sym) sym.arraySize = undefined;
          }
          return `tsc_array_push_${et}(&${objC}, ${elemC})`;
        }
        case 'pop': {
          if ((sym?._refBorrowCount || 0) > 0)
            throw this.error(`cannot mutate '${baseObject.name}' while a borrow is active`, baseObject);
          this._ensureOptStruct(`opt_${et}`, etC);
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
        case 'filter':  return `tsc_array_filter_${et}(${objC}, ${cbFnName ?? argsC})`;
        case 'forEach': return `tsc_array_foreach_${et}(${objC}, ${cbFnName ?? argsC})`;
        case 'map': {
          const outET = cbFnName ? (this._lastCbRetType ? this.cTypeToIdent(this._lastCbRetType) : et) : lambdaOutET(argsC);
          return `tsc_array_map_${et}_${outET}(${objC}, ${cbFnName ?? argsC})`;
        }
        case 'reduce': {
          const initExpr = args[1]?.expr;
          const outET = initExpr ? this.cTypeToIdent(this.inferType(initExpr)) : et;
          const reduceArgs = cbFnName ? `${cbFnName}${cbExtraArgs ? ', ' + cbExtraArgs : ''}` : argsC;
          return `tsc_array_reduce_${et}_${outET}(${objC}, ${reduceArgs})`;
        }
        case 'every':    return `tsc_array_every_${et}(${objC}, ${cbFnName ?? argsC})`;
        case 'some':     return `tsc_array_some_${et}(${objC}, ${cbFnName ?? argsC})`;
        case 'find': {
          this._ensureOptRefStruct(`opt_ref_${et}`, etC);
          return `tsc_array_find_${et}(${objC}, ${cbFnName ?? argsC})`;
        }
        case 'findIndex': return `(int)tsc_array_find_index_${et}(${objC}, ${cbFnName ?? argsC})`;
        case 'indexOf':  return `(int)tsc_array_index_of_${et}(${objC}, ${argsC})`;
        case 'includes': return `tsc_array_includes_${et}(${objC}, ${argsC})`;
        case 'concat':   return `tsc_array_concat_${et}(${objC}, ${argsC})`;
        case 'slice': {
          const s = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const e = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_slice_${et}(${objC}, ${s}, ${e})`;
        }
        case 'join': {
          const sep = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")';
          return `tsc_array_join_${et}(${objC}, ${sep})`;
        }
        case 'keys':    return `tsc_array_keys_${et}(${objC})`;
        case 'values':  return `tsc_array_values_${et}(${objC})`;
        case 'entries': return `tsc_array_entries_${et}(${objC})`;
        case 'flat':    return `tsc_array_flat_${et}(${objC})`;
        case 'clone': {
          if (baseObject.kind === 'Ident') {
            return `tsc_array_slice_${et}(${objC}, 0, (int32_t)${objC}.length)`;
          }
          const arrType = this.inferType(baseObject) ?? `Array_${etC}`;
          const tmp = `_tsc_arr_${this.tempCount++}`;
          lines.push(`${' '.repeat(this.indent * depth)}${arrType} ${tmp} = ${objC};`);
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

    const strMethods = {
      length:     () => `${objC}.length`,
      slice:      () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${objC}, ${a[0]??0}, ${a[1]??'(int32_t)'+objC+'.length'})`; },
      indexOf:      () => `(int)tsc_string_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      lastIndexOf:  () => `(int)tsc_string_last_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      at:           () => {
        const idxNode = args[0]?.expr;
        const idxC = this.exprToC(idxNode, lines, depth);
        if (!this._emittedOptStructs.has('opt_u8')) {
          this._emittedOptStructs.add('opt_u8');
        }
        const idxVal = (idxNode?.kind === 'Literal' && idxNode?.litType === 'number') ? parseFloat(idxNode.value) : NaN;
        this._lastAtNonNeg = !isNaN(idxVal) && idxVal >= 0;
        return `tsc_string_at(${objC}, ${idxC})`;
      },
      includes:   () => `tsc_string_includes(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      startsWith: () => `tsc_string_starts_with(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      endsWith:   () => `tsc_string_ends_with(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      split:      () => `tsc_string_split(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      trim:       () => `tsc_string_trim(${objC})`,
      toUpperCase:() => `tsc_string_to_upper(${objC})`,
      toLowerCase:() => `tsc_string_to_lower(${objC})`,
      replace:    () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace(${objC}, ${a[0]}, ${a[1]})`; },
      padStart:   () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_start(${objC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      padEnd:     () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_end(${objC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      repeat:     () => `tsc_string_repeat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charAt:     () => `tsc_string_char_at(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charCodeAt: () => { const idxC = this.exprToC(args[0].expr, lines, depth); return `(unsigned)(uint8_t)TSC_STRING_GET_CHAR(${objC}, ${idxC})`; },
      concat:     () => `tsc_string_concat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      codePoints:  () => `tsc_codepoints(${objC})`,
      graphemes:   () => `tsc_graphemes(${objC})`,
      replaceAll:  () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace_all(${objC}, ${a[0]}, ${a[1]})`; },
      substring:   () => {
                     const a = args.map(a => this.exprToC(a.expr, lines, depth));
                     if (a[1] === undefined && baseObject.kind !== 'Ident') {
                       const tmp = `_tsc_str_${this.tempCount++}`;
                       lines.push(`${' '.repeat(this.indent * depth)}String ${tmp} = ${objC};`);
                       return `tsc_string_substring(${tmp}, ${a[0]}, (int32_t)${tmp}.length)`;
                     }
                     return `tsc_string_substring(${objC}, ${a[0]}, ${a[1] ?? `(int32_t)${objC}.length`})`;
                   },
      trimStart:   () => `tsc_string_trim_start(${objC})`,
      trimEnd:     () => `tsc_string_trim_end(${objC})`,
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
        if (prop === 'get')    return `tsc_map_get_${mapSuffix}(&${objC}, ${argsC})`;
        if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'has')    return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'clear')  return `tsc_map_clear_${mapSuffix}(&${objC})`;
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
        this._ensurePoolAlloc(baseObject.name);
        return `${poolDef._poolAllocFn}()`;
      }
      if (poolDef?._isPool && prop === 'drop') {
        this._ensurePoolDrop(baseObject.name);
        return `${poolDef._poolDropFn}(${argsC})`;
      }
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

    const classSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
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
      const closure = this.hoistClosure(expr, `_cb_${this.closureCount ?? 0}`);
      if (closure) {
        if (closure.retainLines?.length) {
          const I = ' '.repeat(this.indent * depth);
          for (const rl of closure.retainLines) lines.push(`${I}${rl}`);
        }
        lines.push(`${' '.repeat(this.indent * depth)}${closure.envName} _cb_env_${this.closureCount - 1} = ${closure.envInit};`);
        lines.push(`${' '.repeat(this.indent * depth)}tsc_closure _cb_${this.closureCount - 1} = (tsc_closure){.env = &_cb_env_${this.closureCount - 1}, .fn = (void*)${closure.fnName}};`);
        this._lastCbRetType = closure.ret;
        return closure.fnName;
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
