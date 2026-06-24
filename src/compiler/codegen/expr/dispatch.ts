// dispatch.ts
export default {
  exprToC(this: any, node: any, lines: any[] = [], depth: any = 0) {
    if (!node) return '0';
    this._currentNode = node;
    switch (node.kind) {
      case 'RawC': return node.code;
      case 'Literal': return this.literalToC(node);

      case 'Ident': {
        if (node.name === 'keyof') throw this.error(`"keyof" can only be used in type position`, node);
        const kw: Record<string, string> = {
          'true': 'true', 'false': 'false', 'null': 'NULL',
          'undefined': 'NULL',
        };
        if (kw[node.name] !== undefined) return kw[node.name];
        // 'this' keyword: check scope first (extension methods alias it to '_self')
        if (node.name === 'this') {
          const thisSym = this.lookup('this');
          if (thisSym?._cAlias) return thisSym._cAlias;
          return 'self';
        }
        // Narrowed optional variable: x → x.value inside if(x != null) block
        if (this._narrowedVars?.has(node.name)) {
          const sym2 = this.lookup(node.name);
          if (sym2?.ctype === 'tsc_unknown' && this._narrowedUnknownVars?.has(node.name)) {
            const narrowedCtype = this._narrowedUnknownVars.get(node.name);
            if (narrowedCtype === '__array__' || narrowedCtype === '__object__') {
              return node.name;
            }
            const getter = this._unknownGetterFor(narrowedCtype);
            return `${getter}(&${node.name})`;
          }
          if (sym2?.ctype?.startsWith('opt_')) {
            this._checkMoved(sym2, node, node.name);
            return `${node.name}.value`;
          }
        }
        // Function reference (not a func-ptr variable): use mangled name
        const sym = this.lookup(node.name);
        this._checkMoved(sym, node, node.name);
        if (sym?._mutQuarantined) {
          throw this.error(`cannot access '${node.name}' while a mutable borrow is active`, node);
        }
        if (sym?.isWeak && !this._inWeakUpgrade) {
          throw this.error(`cannot dereference '${node.name}' (Weak<T>); use '${node.name}.upgrade()' and check for null`, node);
        }
        if (sym?._cAlias) return sym._cAlias;
        if (sym?.funcName && !sym.funcPtr) return sym.funcName;
        // Async/generator self context: inlined consts → literal, promoted vars → self->name
        if (this._selfCtx) {
          if (this._selfCtx.inlined?.has(node.name)) return this._selfCtx.inlined.get(node.name);
          if (this._selfCtx.promoted?.has(node.name)) return `self->${node.name}`;
        }
        // Deferred anon struct used outside destructuring: materialize now
        if (sym?.deferredAnon && this._deferredAnons?.has(node.name)) {
          const { fields, init: _init } = this._deferredAnons.get(node.name);
          const ctype = sym.ctype;
          const fieldDecls = fields.map((f: any) => `${f._ctype} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${ctype};`);
          this.addTop('');
          const initParts = (_init.props ?? []).map((pr: any) => `.${pr.key} = ${this.exprToC(pr.value, lines, depth)}`);
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}${ctype} ${node.name} = {${initParts.join(', ')}};`);
          sym.deferredAnon = false;
          this._deferredAnons.delete(node.name);
        }
        if (sym?._closureEnvVar) return `env->${node.name}`;
        return node.name;
      }

      case 'Binary': return this.binaryToC(node, lines, depth);
      case 'Unary':  return this.unaryToC(node, lines, depth);
      case 'Assign': return this.assignToC(node, lines, depth);
      case 'Ternary': {
        this._checkNoBareThrows(node.cond);
        this._checkNoBareThrows(node.yes);
        this._checkNoBareThrows(node.no);
        const c = this._truthyToC(node.cond, lines, depth);
        const yRaw = this.exprToC(node.yes, lines, depth);
        const n = this.exprToC(node.no, lines, depth);
        // Wrap nested ternary in yes-branch to avoid ambiguity
        const y = node.yes.kind === 'Ternary' ? `(${yRaw})` : yRaw;
        return `(${c}) ? ${y} : ${n}`;
      }

      case 'Member': {
        this._checkNoBareThrows(node.object);
        // Namespace import: X.Foo → resolve Foo from namespace
        if (node.object.kind === 'Ident') {
          const nsSym = this.lookup(node.object.name);
          if (nsSym?._isNamespace) {
            const nsEntry = nsSym._namespaceExports?.[node.prop];
            if (nsEntry) {
              this.define(node.prop, nsEntry);
              if (nsEntry._cAlias) return nsEntry._cAlias;
              if (nsEntry.funcName && !nsEntry.funcPtr) return nsEntry.funcName;
              return node.prop;
            }
          }
        }
        // process.argv → _argv (array built in main from argc/argv)
        if (node.object.kind === 'Ident' && node.object.name === 'process' && node.prop === 'argv') {
          this._useArgcArgv = true;
          return '_argv';
        }
        // process.stdin / process.stdout / process.stderr (std/io)
        if (this._stdIoImported && node.object.kind === 'Ident' && node.object.name === 'process') {
          if (this._cap('os') === false) {
            throw this.error(`TypeError: 'process.${node.prop}' is not available on embedded targets`);
          }
          if (node.prop === 'stdin')  { this._lastSuppressConst = true; return 'tsc_stdin()'; }
          if (node.prop === 'stdout') { this._lastSuppressConst = true; return 'tsc_stdout()'; }
          if (node.prop === 'stderr') { this._lastSuppressConst = true; return 'tsc_stderr()'; }
        }
        // Math constants: Math.PI, Math.E, Math.SQRT2, etc.
        if (node.object.kind === 'Ident' && node.object.name === 'Math') {
          const mathConsts: Record<string, string> = {
            PI: 'M_PI', E: 'M_E', LN2: 'M_LN2', LN10: 'M_LN10',
            SQRT2: 'M_SQRT2', SQRT1_2: 'M_SQRT1_2',
            LOG2E: 'M_LOG2E', LOG10E: 'M_LOG10E',
          };
          if (mathConsts[node.prop]) {
            this.includes.add('#include <math.h>');
            return mathConsts[node.prop];
          }
        }
        const sym = node.object.kind === 'Ident' ? this.lookup(node.object.name) : null;
        if (sym?._mutQuarantined) {
          throw this.error(`cannot access '${node.object.name}' while a mutable borrow is active`, node);
        }
        if (sym?.ctype === 'tsc_unknown' && this._narrowedUnknownVars?.has(node.object.name)) {
          const _nc = this._narrowedUnknownVars.get(node.object.name);
          if (_nc === '__array__') throw this.error(`Cannot access '.${node.prop}' on '${node.object.name}' after typeof "array"; use '${node.object.name} as Array<T>' first`, node);
          if (_nc === '__object__') throw this.error(`Cannot access '.${node.prop}' on '${node.object.name}' after typeof "object"; use '${node.object.name} as ClassName' first`, node);
        }
        // Channel<T>.length / .capacity → tsc_channel_length/capacity_T(ch._inner)
        if (sym?._isChannel && (node.prop === 'length' || node.prop === 'capacity')) {
          const ident = sym._channelIdent;
          const objC = this.exprToC(node.object, lines, depth);
          const fn = node.prop === 'length' ? 'length' : 'capacity';
          return `tsc_channel_${fn}_${ident}(${objC}._inner)`;
        }
        if (sym?._isDataView || sym?.ctype === 'DataView') {
          const objC = node.object.kind === 'Ident' ? node.object.name : this.exprToC(node.object, lines, depth);
          if (node.prop === 'byteLength') return `(size_t)${objC}.byte_length`;
          if (node.prop === 'byteOffset') return `(size_t)${objC}.byte_offset`;
        }
        this._checkMoved(sym, node, node.object.name);
        this._checkFieldMoved(sym, node.prop, node, node.object.name);
        // Error subclass: e.message → _err_0._base.message (parent fields via _base)
        if (sym?._alias && sym?.ctype) {
          const errClass = this.classes.get(sym.ctype);
          const isOwnField = errClass?.fields?.some((f: any) => f.name === node.prop);
          if (!isOwnField) {
            // Field is on parent (TscError._base): route through _alias._base.prop
            return `${sym._alias}._base.${node.prop}`;
          }
          return `${sym._alias}.${node.prop}`;
        }
        // Check private field access from outside the class
        if (sym?.ctype) {
          const classDef = this.classes.get(sym.ctype);
          const field = classDef?.fields?.find((f: any) => f.name === node.prop);
          if (field?.modifiers?.includes('private')) {
            // We are inside the class if 'this' or 'self' in scope has the same ctype
            const thisSym = this.lookup('this') ?? this.lookup('self');
            const inMethod = thisSym?.ctype === sym.ctype;
            if (!inMethod) {
              throw this.error(`"${node.prop}" is private and not accessible from outside the class`, node);
            }
          }
        }
        // Rest param: .length → args_count
        if (sym?.rest && node.prop === 'length') {
          return sym.countVar ?? `${node.object.name}_count`;
        }
        // Fixed-size array: .length → compile-time constant
        if (sym?.isFixedArray && node.prop === 'length') {
          return `(size_t)${sym.arraySize}`;
        }
        // PinMode enum (std/hal): PinMode.OUTPUT → TSC_PINMODE_OUTPUT
        if (node.object.kind === 'Ident' && node.object.name === 'PinMode') {
          const pm: Record<string, string> = { INPUT: 'TSC_PINMODE_INPUT', OUTPUT: 'TSC_PINMODE_OUTPUT', INPUTPULLUP: 'TSC_PINMODE_INPUTPULLUP' };
          return pm[node.prop] ?? `TSC_PINMODE_${node.prop.toUpperCase()}`;
        }
        // Enum member access: Direction.North → Direction_North
        if (node.object.kind === 'Ident') {
          const enumDef = this.classes.get(node.object.name);
          if (enumDef?.isEnum) return `${enumDef._cname ?? node.object.name}_${node.prop}`;
          // Labeled tuple field access: p.x → p._0 (look up via symbol type)
          const symForLabel = this.lookup(node.object.name);
          const tupleDef3 = symForLabel ? this.classes.get(symForLabel.ctype) : null;
          if (tupleDef3?.isTuple) {
            const field = tupleDef3.fields.find((f: any) => f.label === node.prop);
            if (field) {
        const objC = this.exprToC(node.object, lines, depth);
              return `${objC}.${field.name}`;
            }
          }
        }
        // Heap pointer var: p.field → p->field (heap class is already a pointer)
        if (sym?._isHeap) {
          const rawName = node.object.kind === 'Ident' ? node.object.name : this.exprToC(node.object, lines, depth);
          return `${rawName}->${node.prop}`;
        }
        const symType = sym?.ctype?.replace(' *', '');
        if (this.classes.get(symType)?._isHeap && sym?.ctype?.endsWith(' *')) {
          const rawName = node.object.kind === 'Ident' ? node.object.name : this.exprToC(node.object, lines, depth);
          return `${rawName}->${node.prop}`;
        }
        // Pool opt_ref var: p.field → p.value->field (route through pool pointer)
        // Note: only exclude has_value and _pool_idx (struct meta-fields); 'value' may be a class field
        if (sym?.ctype?.startsWith('opt_ref_') && !['has_value','_pool_idx'].includes(node.prop)) {
          const poolClassName = sym.ctype.slice(8);
          const poolCls = this.classes.get(poolClassName);
          if (poolCls?._isPool) {
            // Check if this prop exists on the pool class itself (not on opt_ref wrapper)
            const isClassField = poolCls.fields?.some((f: any) => f.name === node.prop);
            if (isClassField || node.prop !== 'value') {
              // Use raw variable name (not narrowed form) to avoid double-indirection
              const rawName = node.object.kind === 'Ident' ? node.object.name : this.exprToC(node.object, lines, depth);
              return `${rawName}.value->${node.prop}`;
            }
          }
        }
        const objC = this.exprToC(node.object, lines, depth);
        // String.bytes → Slice_u8 {.ptr = data, .length = length}
        if (node.prop === 'bytes') {
          const objType3 = this.inferType(node.object);
          if (objType3 === 'String') {
            this._ensureSliceU8Struct();
            return `{.ptr = (uint8_t *)${objC}.data, .length = ${objC}.length}`;
          }
        }
        const isPtr = sym?.isPointer;
        // Inherited field access: if prop not in own fields, check base class
        const symCls = sym ? this.classes.get(sym.ctype) : null;
        if (symCls?.superClass && symCls.fields && !symCls.fields.some((f: any) => f.name === node.prop)) {
          const baseCls = this.classes.get(symCls.superClass);
          if (baseCls?.fields?.some((f: any) => f.name === node.prop)) {
            return isPtr ? `${objC}->_base.${node.prop}` : `${objC}._base.${node.prop}`;
          }
        }
        // Throws class: .message → ._base.message
        if (symCls?._isThrowsClass && node.prop === 'message') {
          return isPtr ? `${objC}->_base.message` : `${objC}._base.message`;
        }
        // AbortController.signal / AbortSignal.aborted
        if (sym?.ctype === 'TscAbortController' && node.prop === 'signal') {
          return `${objC}.signal`;
        }
        if (sym?.ctype === 'TscAbortSignal *' && node.prop === 'aborted') {
          return `tsc_abort_signal_aborted(${objC})`;
        }
        // URL field access — u.search after mutation → tsc_url_search(&u)
        if (this._stdUrlImported && sym?._isURL) {
          const _urlMutatedFields = ['search'];
          if (_urlMutatedFields.includes(node.prop)) {
            return `tsc_url_search(&${node.object.name})`;
          }
        }
        if (!sym) {
          const inferredType = this.inferType(node.object);
          if (inferredType?.endsWith(' *')) {
            return `${objC}->${node.prop}`;
          }
        }
        return isPtr ? `${objC}->${node.prop}` : `${objC}.${node.prop}`;
      }

      case 'Index': {
        this._checkNoBareThrows(node.object);
        this._checkNoBareThrows(node.index);
        if (node.object.kind === 'Ident') {
          const _idxQSym = this.lookup(node.object.name);
          if (_idxQSym?._mutQuarantined) {
            throw this.error(`cannot access '${node.object.name}' while a mutable borrow is active`, node);
          }
          if (_idxQSym?.ctype === 'tsc_unknown' && this._narrowedUnknownVars?.has(node.object.name)) {
            const _nc = this._narrowedUnknownVars.get(node.object.name);
            if (_nc === '__array__') throw this.error(`Cannot index '${node.object.name}' after typeof "array"; use '${node.object.name} as Array<T>' first`, node);
            if (_nc === '__object__') throw this.error(`Cannot index '${node.object.name}' after typeof "object"; use '${node.object.name} as ClassName' first`, node);
          }
        }
        // req.params["key"] → tsc_request_param(req, STR_LIT("key"))
        if (this._stdNetImported && node.object.kind === 'Member' && node.object.prop === 'params') {
          const reqSym = node.object.object.kind === 'Ident' ? this.lookup(node.object.object.name) : null;
          if (reqSym?.ctype === 'TscRequest *') {
            const reqC = this.exprToC(node.object.object, lines, depth);
            const keyC = this.exprToC(node.index, lines, depth);
            return `tsc_request_param(${reqC}, ${keyC})`;
          }
        }
        const objType = this.inferType(node.object);
        const tupleDef = this.classes.get(objType);
        // Tuple index access: pair[0] → pair._0
        if (tupleDef?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const objC = this.exprToC(node.object, lines, depth);
          return `${objC}._${node.index.value}`;
        }
        const obj = this.exprToC(node.object, lines, depth);
        // Detect negative literal index: -1 or -(literal)
        const negLitVal = (idx: any): any => {
          if (idx.kind === 'Literal' && idx.litType === 'number' && parseFloat(idx.value) < 0)
            return Math.abs(parseFloat(idx.value));
          if (idx.kind === 'Unary' && idx.op === '-' && idx.expr.kind === 'Literal' && idx.expr.litType === 'number')
            return parseFloat(idx.expr.value);
          return null;
        };
        const negVal = negLitVal(node.index);
        const isNegLit = negVal !== null;
        // Pointer to Array (Ref<T[]>): const Array_X * → obj->data[i]
        const _ptrArr = objType?.match(/^(?:const )?Array_(\w+) \*$/);
        if (_ptrArr) {
          if (isNegLit) return `${obj}->data[${obj}->length - ${negVal}]`;
          const idx = this.exprToC(node.index, lines, depth);
          return `${obj}->data[${idx}]`;
        }
        // Array_T indexing: arr[i] → arr.data[i], arr[-1] → arr.data[arr.length - 1]
        if (objType?.startsWith('Array_')) {
          if (isNegLit) {
            return `${obj}.data[${obj}.length - ${negVal}]`;
          }
          const idx = this.exprToC(node.index, lines, depth);
          // Compile-time OOB: literal index >= known array size → use checked access
          const arrSym = node.object.kind === 'Ident' ? this.lookup(node.object.name) : null;
          if (node.index.kind === 'Literal' && arrSym?.arraySize != null) {
            const idxVal = parseFloat(node.index.value);
            if (!isNaN(idxVal) && idxVal >= arrSym.arraySize) {
              const elemIdent = arrSym.elemType ?? objType.slice(6);
              return `tsc_array_get_checked_${elemIdent}(${obj}, ${idx})`;
            }
          }
          return `${obj}.data[${idx}]`;
        }
        // Slice_T / MutSlice_T indexing: s[i] → s.ptr[i]
        if (objType?.startsWith('Slice_') || objType?.startsWith('MutSlice_')) {
          const idx = this.exprToC(node.index, lines, depth);
          return isNegLit ? `${obj}.ptr[${obj}.length - ${negVal}]` : `${obj}.ptr[${idx}]`;
        }
        // Buffer indexing: buf[i] → buf.data[i]
        if (objType === 'Buffer' || objType === 'DataView') {
          const idx = this.exprToC(node.index, lines, depth);
          return `${obj}.data[${idx}]`;
        }
        // String indexing: s[i] → (uint8_t)TSC_STRING_GET_CHAR(s, i)
        if (objType === 'String') {
          if (isNegLit) {
            const n = negVal;
            return `(uint8_t)TSC_STRING_GET_CHAR(${obj}, ${obj}.length - ${n})`;
          }
          const idx = this.exprToC(node.index, lines, depth);
          return `(uint8_t)TSC_STRING_GET_CHAR(${obj}, ${idx})`;
        }
        const idx = this.exprToC(node.index, lines, depth);
        return `${obj}[${idx}]`;
      }

      case 'RangeIndex': {
        this._checkNoBareThrows(node.object);
        this._checkNoBareThrows(node.start);
        this._checkNoBareThrows(node.end);
        const obj = this.exprToC(node.object, lines, depth);
        const objType2 = this.inferType(node.object);
        if (node.object.kind === 'Ident' && objType2 !== 'String') {
          const _riSym = this.lookup(node.object.name);
          if (_riSym) this._trackRefBorrow(_riSym);
        }
        const start = node.start ? this.exprToC(node.start, lines, depth) : null;
        const end   = node.end   ? this.exprToC(node.end,   lines, depth) : null;
        // Compute length as literal if both bounds are numeric literals
        const litLen = (startNode: any, endNode: any) => {
          if (startNode && endNode &&
              startNode.kind === 'Literal' && startNode.litType === 'number' &&
              endNode.kind === 'Literal' && endNode.litType === 'number') {
            return String(parseFloat(endNode.value) - parseFloat(startNode.value));
          }
          return null;
        };
        if (objType2 === 'String') {
          const dataExpr   = start ? `${obj}.data + ${start}` : `${obj}.data`;
          const staticLen  = litLen(node.start, node.end);
          const lenExpr    = staticLen ? staticLen :
                             (start && end)  ? `${end} - ${start}` :
                             (start && !end) ? `${obj}.length - ${start}` :
                             (end && !start) ? end : `${obj}.length`;
          return `{.data = ${dataExpr}, .length = ${lenExpr}, .capacity = 0}`;
        }
        // Array range: arr[start..end] → same struct init
        const dataExpr = start ? `${obj}.data + ${start}` : `${obj}.data`;
        const lenExpr  = (start && end)  ? `${end} - ${start}` :
                         (start && !end) ? `${obj}.length - ${start}` :
                         (end && !start) ? end : `${obj}.length`;
        return `{.data = ${dataExpr}, .length = ${lenExpr}, .capacity = 0}`;
      }

      case 'TemplateLit': {
        return this._templateToC(node, lines, depth);
      }

      case 'Call': {
        return this.callToC(node, lines, depth);
      }

      case 'New': {
        return this.newToC(node, lines, depth);
      }

      case 'ArrayLit': {
        for (const el of node.elems ?? []) this._checkNoBareThrows(el.expr ?? el);
        const elems = node.elems.filter((e: any) => !e.spread);
        let elemType;
        if (this._expectedType?.startsWith('Array_')) {
          elemType = this._arrIdentToCType(this._expectedType.slice(6));
        }
        if (!elemType) elemType = elems.length ? this.inferType(elems[0].expr) : null;
        if (elemType === 'String *') elemType = 'String';
        if (!elemType) elemType = 'int32_t';
        if (!this._expectedType?.startsWith('Array_') && elems.length > 1) {
          const elemTypes = elems.map((e: any) => {
            const t = this.inferType(e.expr);
            return t === 'String *' ? 'String' : t;
          });
          if (elemTypes.some((t: any) => t !== elemTypes[0])) {
            const tsName = (ct: any) => (ct === 'double' || ct === 'float') ? 'number' : this.ctypeToTsName(ct);
            const unique = [...new Set(elemTypes.map(tsName))];
            throw this.error(`mixed array literal — specify type: [${unique.join(', ')}] (tuple) or T[]`, node);
          }
        }
        const arrType = `Array_${this.cTypeToIdent(elemType)}`;
        this._ensureArrayStruct(arrType, elemType);
        const dataVar = `_arr_data_${this.tempCount++}`;
        const prevExpected = this._expectedType;
        if (arrType?.startsWith('Array_') && this._expectedType?.startsWith('Array_')) {
          this._expectedType = arrType;
        }
        const items = elems.map((e: any) => {
          let c = this.exprToC(e.expr, lines, depth);
          if (e.expr.kind === 'Ident') {
            const sym = this.lookup(e.expr.name);
            if (sym?.ctype === 'String *' && elemType === 'String') return `(*${c})`;
          }
          if (elemType === 'tsc_unknown') {
            const _argType = this.inferType(e.expr);
            if (_argType !== 'tsc_unknown') {
              this._ensureUnknownStruct();
              const _packer = this._unknownPackerFor(_argType);
              c = `${_packer}(${c})`;
            }
          }
          if (this._isOptType(elemType)) {
            c = this._wrapOptValue(c, e.expr, elemType);
          }
          return c;
        }).join(', ');
        this._expectedType = prevExpected;
        if (this._inAsyncFunc) {
          this.topLevel.push(`static ${elemType} ${dataVar}[] = {${items}};`);
          return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = 0}`;
        }
        if (this._inHoistedLambda) {
          lines.push(`${elemType} *${dataVar} = (${elemType}*)malloc(${elems.length} * sizeof(${elemType}));`);
          const assignItems = elems.map((e: any, i: any) => {
            const c = this.exprToC(e.expr, lines, depth);
            if (e.expr.kind === 'Ident') {
              const sym = this.lookup(e.expr.name);
              if (sym?.ctype === 'String *' && elemType === 'String') return `${dataVar}[${i}] = (*${c})`;
            }
            return `${dataVar}[${i}] = ${c}`;
          });
          for (const ai of assignItems) lines.push(`${ai};`);
          return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = ${elems.length}}`;
        }
        lines.push(`${elemType} ${dataVar}[] = {${items}};`);
        return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = ${elems.length}}`;
      }

      case 'ObjLit': {
        for (const p of node.props ?? []) {
          if (p.value) this._checkNoBareThrows(p.value);
          if (p.expr) this._checkNoBareThrows(p.expr);
        }
        if (node.props.length === 0) {
          throw this.error(`empty object literal is forbidden; use a typed variable or Map<K, V>`, node);
        }
        const spreads = node.props.filter((p: any) => p.spread);
        const explicit = node.props.filter((p: any) => !p.spread && !p.computed);
        // If there are spread elements, expand struct fields inline
        if (spreads.length > 0) {
          const explicitMap = new Map(explicit.map((p: any) => [p.key, p.value]));
          const resultProps: any[] = [];
          for (const sp of spreads) {
            const srcC = this.exprToC(sp.expr, lines, depth);
            const srcType = this.inferType(sp.expr);
            const cls = this.classes.get(srcType);
            if (cls?.fields) {
              const stringFields: any[] = [];
              for (const f of cls.fields) {
                if (!explicitMap.has(f.name)) {
                  const ftype = f._ctype || (f.typeAnn ? this.resolveType(f.typeAnn) : null);
                  resultProps.push([f.name, `${srcC}.${f.name}`, true]);
                  if (ftype === 'String') {
                    stringFields.push(f.name);
                  }
                }
              }
              if (stringFields.length > 0) {
                const I = ' '.repeat(this.indent * depth);
                for (const fn of stringFields) {
                  lines.push(`${I}tsc_string_retain(${srcC}.${fn});`);
                }
              }
              if (sp.expr.kind === 'Ident') {
                const srcSym = this.lookup(sp.expr.name);
                if (srcSym && srcSym.varKind !== 'const') {
                  srcSym._moved = true;
                  const srcName = sp.expr.name;
                  this._pushPostStmtCleanup(`memset(&${srcName}, 0, sizeof(${srcType}));`);
                }
              }
            }
          }
          for (const [key, val] of explicitMap) {
            resultProps.push([key, this.exprToC(val, lines, depth), false]);
          }
          const props = resultProps.map(([k, v]) => `.${k} = ${v}`);
          return props.length > 0 ? `{${props.join(', ')}}` : `{}`;
        }
        const props = node.props.map((p: any) => {
          if (p.computed) throw this.error(`computed object key '[...]' is not supported; use StaticMap or inline the value`, node);
          return `.${p.key} = ${this.exprToC(p.value, lines, depth)}`;
        });
        return props.length > 0 ? `{ ${props.join(', ')} }` : `{}`;
      }

      case 'FuncExpr':
      case 'Arrow': {
        const closure = this.hoistClosure(node, '_lambda');
        if (closure) {
          if (closure.retainLines?.length) {
          const I = ' '.repeat(this.indent * depth);
          for (const rl of closure.retainLines) lines.push(`${I}${rl}`);
        }
        const envLocal = `_lambda_env_${this.closureCount - 1}`;
        lines.push(`${' '.repeat(this.indent * depth)}${closure.envName} *${envLocal} = tsc_malloc(sizeof(${closure.envName}));`);
        lines.push(`${' '.repeat(this.indent * depth)}*${envLocal} = (${closure.envName})${closure.envInit};`);
        return `(tsc_closure){.env = ${envLocal}, .fn = (void*)${closure.fnName}}`;
        }
        const lambdaName = this.hoistArrow(node, 'void', '_lambda');
        return `(tsc_closure){.env = NULL, .fn = (void*)${lambdaName}}`;
      }

      case 'Match': {
        return this._matchExprToC(node, lines, depth);
      }

      case 'Cast': {
        this._checkNoBareThrows(node.expr);
        // as Volatile<T> → (volatile T *)expr; hex literals get U suffix
        if (node.castType.kind === 'TypeRef' && node.castType.name === 'Volatile') {
          const inner = this.resolveType(node.castType.typeArgs?.[0]);
          let exprC = this.exprToC(node.expr, lines, depth);
          if (/^0x[0-9a-fA-F]+$/.test(exprC)) exprC += 'U';
          return `(volatile ${inner} *)${exprC}`;
        }
        const ownershipTypes = ['Ref', 'Mut', 'Arc', 'Weak', 'Box', 'Rc'];
        if (node.castType.kind === 'TypeRef' && ownershipTypes.includes(node.castType.name)) {
          throw this.error(`cannot use "as" for ownership types`, node);
        }
        // String literal union → string: use values array
        if (node.castType.kind === 'TypeRef' && node.castType.name === 'string') {
          const exprType = this.inferType(node.expr);
          const exprEnumDef = this.classes.get(exprType);
          if (exprEnumDef?.isStringLiteralUnion) {
            const exprC = this.exprToC(node.expr, lines, depth);
            return `STR_LIT_RUNTIME(${exprType}_values[(int)${exprC}])`;
          }
          // Numeric type → string: cannot use "as", must use ".toString()"
          const numericTypes = ['int32_t','int64_t','int8_t','int16_t',
                                'uint8_t','uint16_t','uint32_t','uint64_t',
                                'float','double','size_t','bool'];
          if (numericTypes.includes(exprType)) {
            throw this.error(`cannot cast ${this.ctypeToTsName(exprType)} to string using "as"; use ".toString()"`, node);
          }
        }
        // Pointer cast (as *T): just return the inner expr — type annotation only, no C cast needed
        if (node.castType.kind === 'TypePointer') {
          return this.exprToC(node.expr, lines, depth);
        }
        const ct = this.resolveType(node.castType);
        // Char/string literal cast to char/u8: produce numeric value
        if ((ct === 'char' || ct === 'uint8_t') && node.expr.kind === 'Literal') {
          if (node.expr.litType === 'char') {
            const code = this._charCode(node.expr.value);
            return ct === 'uint8_t' ? code + 'U' : String(code);
          }
          if (node.expr.litType === 'string') {
            const code = this._stringLiteralToByte(node.expr);
            return ct === 'uint8_t' ? code + 'U' : String(code);
          }
        }
        const exprC = this.exprToC(node.expr, lines, depth);
        const srcType = this.inferType(node.expr);
        if (ct === 'tsc_unknown' && srcType !== 'tsc_unknown') {
          this._ensureUnknownStruct();
          const packer = this._unknownPackerFor(srcType);
          return `${packer}(${exprC})`;
        }
        if ((srcType === 'tsc_unknown' || srcType === '__array__' || srcType === '__object__') && ct !== 'tsc_unknown') {
          this._ensureUnknownStruct();
          const getter = this._unknownGetterFor(ct);
          if (ct.startsWith('Array_') || this.classes.has(ct)) {
            return `*${getter}(&${exprC})`;
          }
          return `${getter}(&${exprC})`;
        }
        // Non-null assertion: opt_T as T → unwrap with runtime panic if null
        if (srcType?.startsWith('opt_') && !ct.startsWith('opt_')) {
          const innerIdent = srcType.slice(4);
          const innerCType = this._arrIdentToCType(innerIdent);
          if (innerCType === ct) {
            return `(${exprC}.has_value ? ${exprC}.value : (fprintf(stderr, "panic: null cast to non-null\\n"), abort(), (${ct})0))`;
          }
          return `(${exprC}.has_value ? (${ct})${exprC}.value : (fprintf(stderr, "panic: null cast to non-null\\n"), abort(), (${ct})0))`;
        }
        if (srcType === ct) return exprC;
        if (this._strictRules?.has('no-lossy-cast') && srcType && ct && srcType !== ct) {
          const LOSSY = [
            ['int64_t','int32_t'],['int64_t','float'],['uint64_t','double'],
            ['int32_t','float'],['double','float'],['double','int32_t'],['double','int64_t'],
            ['float','int32_t'],['float','int64_t'],
            ['int64_t','int8_t'],['int64_t','int16_t'],['int64_t','uint8_t'],['int64_t','uint16_t'],['int64_t','uint32_t'],
            ['int32_t','int8_t'],['int32_t','int16_t'],['int32_t','uint8_t'],['int32_t','uint16_t'],
            ['int32_t','uint32_t'],['uint32_t','int32_t'],
            ['uint64_t','int32_t'],['uint64_t','int64_t'],
            ['uint32_t','int16_t'],['uint32_t','int8_t'],
            ['uint16_t','int8_t'],['uint16_t','uint8_t'],
            ['size_t','int32_t'],['size_t','int16_t'],['size_t','int8_t'],
          ];
          if (LOSSY.some(([s,t]) => srcType === s && ct === t)) {
            const tsName = (c: any) => c === 'double' ? 'f64' : c === 'float' ? 'f32' : c === 'size_t' ? 'usize' : c.replace(/_t$/,'').replace(/^u/,'u').replace(/^int/,'i');
            throw this.error(`lossy cast from ${tsName(srcType)} to ${tsName(ct)} is forbidden (no-lossy-cast); remove 'no-lossy-cast' from strict rules or use a safe widening path`, node);
          }
        }
        const needsParens = node.expr.kind === 'Binary' || node.expr.kind === 'Ternary' || node.expr.kind === 'Logical';
        return needsParens ? `(${ct})(${exprC})` : `(${ct})${exprC}`;
      }

      case 'Typeof': {
        this._checkNoBareThrows(node.expr);
        const exprC = this.exprToC(node.expr, lines, depth);
        const sym = node.expr.kind === 'Ident' ? this.lookup(node.expr.name) : null;
        const ctype = sym?.ctype ?? 'int32_t';
        if (ctype === 'tsc_unknown') {
          this._ensureUnknownStruct();
          return `STR_LIT("unknown")`;
        }
        const tsName = this.ctypeToTsName(ctype);
        return `STR_LIT("${tsName}")`;
      }

      case 'Await': {
        // await t.join() in non-async context → tsc_thread_join(t)
        if (!this._inAsyncFunc) {
          if (node.expr?.kind === 'Call' &&
              node.expr.callee?.kind === 'Member' && node.expr.callee.prop === 'join') {
            const tObj = node.expr.callee.object;
            const tSym2 = tObj?.kind === 'Ident' ? this.lookup(tObj.name) : null;
            if (tSym2?._isThread || tSym2?.ctype === 'tsc_thread_t') {
              const tC2 = this.exprToC(tObj, lines, depth);
              return `tsc_thread_join(${tC2})`;
            }
          }
          throw this.error(`"await" can only be used inside an "async" function`, node);
        }
        // Check for await on non-async variable (e.g. await x where x: i32)
        if (node.expr?.kind === 'Ident') {
          const awaitSym = this.lookup(node.expr.name);
          if (awaitSym && !awaitSym._isAsync && awaitSym.varKind) {
            const t = awaitSym.ctype ?? 'unknown';
            throw this.error(`"await" can only be applied to Promise<T>, got ${t}`, node);
          }
        }
        return this.exprToC(node.expr, lines, depth);
      }
      case 'Yield':    { if (node.value) this._checkNoBareThrows(node.value); return node.value ? this.exprToC(node.value, lines, depth) : '0'; }
      case 'Drop': {
        this._checkNoBareThrows(node.expr);
        // drop(x) for pool opt_ref_T → T_drop(x)
        const dropExpr = node.expr;
        const dropSym = dropExpr?.kind === 'Ident' ? this.lookup(dropExpr.name) : null;
        const dropType = dropSym?.ctype ?? this.inferType(dropExpr);
        const _dpcn = dropType?.startsWith('opt_ref_') ? dropType.slice(8) : null;
        if (_dpcn && this.classes.get(_dpcn)?._isPool) {
          this._ensurePoolDrop(_dpcn);
          const _dc = this.classes.get(_dpcn);
          const _dropArg = dropExpr?.kind === 'Ident' ? dropExpr.name : this.exprToC(dropExpr, lines, depth);
          return `${_dc._poolDropFn}(${_dropArg})`;
        }
        throw this.error(`drop() can only be used on pool-allocated types`, node);
      }
      case 'NonNull': {
        const innerExpr = node.expr;
        const callee = innerExpr?.callee;
        const calleeSym = (callee?.kind === 'Ident') ? this.lookup(callee.name) : null;
        if (calleeSym?._isThrowsFunc) {
          if (this._inAsyncFunc) {
            throw this.error(`TypeError: '!' error handling is not supported in async functions; use try/catch on await`);
          }
          const I = ' '.repeat(this.indent * depth);
          const resName = `_res_${this.tempCount++}`;
          const callC = this.exprToC(innerExpr, lines, depth);
          lines.push(`${I}${calleeSym._resultType} ${resName} = ${callC};`);
          lines.push(`${I}if (!${resName}.ok) { tsc_panic(${this._panicMsgExpr(resName, calleeSym._resultErrTypes)}); }`);
          if (calleeSym._resultIsVoid) return '((void)0)';
          return `${resName}.value`;
        }
        return this.exprToC(innerExpr, lines, depth);
      }
      case 'Propagate': {
        if (this._inAsyncFunc) {
          throw this.error(`TypeError: '?' error propagation is not supported in async functions; use try/catch on await`);
        }
        const innerExpr = node.expr;
        const callee = innerExpr?.callee;
        const calleeSym = (callee?.kind === 'Ident') ? this.lookup(callee.name) : null;
        if (!calleeSym?._isThrowsFunc) {
          const calleeName = callee?.kind === 'Ident' ? callee.name : '?';
          throw this.error(`TypeError: Cannot use '?' on '${calleeName}()': function does not throw`);
        }
        if (!this._throwsCtx) {
          const fnName = this.currentFuncName ?? '<function>';
          throw this.error(`TypeError: Cannot use '?' in '${fnName}': function does not declare 'throws'`);
        }
        const ctx = this._throwsCtx;
        const I = ' '.repeat(this.indent * depth);
        const resName = `_res_${this.tempCount++}`;
        const callC = this.exprToC(innerExpr, lines, depth);
        lines.push(`${I}${calleeSym._resultType} ${resName} = ${callC};`);
        const _wrappedErr = this._wrapErrForCaller(ctx, `${resName}.error`, calleeSym);
        if (this._usesGotoCleanup) {
          lines.push(`${I}if (!${resName}.ok) { _result = (${ctx.resultType}){.ok = false, .error = ${_wrappedErr}}; goto cleanup; }`);
        } else if (this._hasPendingCleanups()) {
          lines.push(`${I}if (!${resName}.ok) {`);
          this._emitFuncCleanup(lines, I + ' '.repeat(this.indent));
          lines.push(`${I}    return (${ctx.resultType}){.ok = false, .error = ${_wrappedErr}};`);
          lines.push(`${I}}`);
        } else {
          lines.push(`${I}if (!${resName}.ok) { return (${ctx.resultType}){.ok = false, .error = ${_wrappedErr}}; }`);
        }
        if (calleeSym._resultIsVoid) return '((void)0)';
        return `${resName}.value`;
      }
      case 'OptChain': {
        this._checkNoBareThrows(node.object);
        const objType = this.inferType(node.object);
        if (objType?.startsWith('opt_')) {
          const innerIdent = objType.slice(4);
          const innerCType = this._arrIdentToCType(innerIdent);
          const classDef = this.classes.get(innerCType);
          const field = classDef?.fields?.find((f: any) => f.name === node.prop);
          const fieldCType = field?.typeAnn ? this.resolveType(field.typeAnn) : (field?._ctype ?? 'int32_t');
          const fieldIdent = this.cTypeToIdent(fieldCType);
          const optFieldType = `opt_${fieldIdent}`;
          this._ensureOptStruct(optFieldType, fieldCType);
          let objC = this.exprToC(node.object, lines, depth);
          if (!['Ident', 'Literal'].includes(node.object.kind)) {
            const tmp = `_tsc_oc_${this.tempCount++}`;
            lines.push(`${' '.repeat(this.indent * depth)}${objType} ${tmp} = ${objC};`);
            objC = tmp;
          }
          return `${objC}.has_value ? (${optFieldType}){true, ${objC}.value.${node.prop}} : (${optFieldType}){false, 0}`;
        }
        const obj = this.exprToC(node.object, lines, depth);
        return `${obj}.${node.prop}`;
      }

      default:
        throw this.error(`internal: unhandled expression kind '${node.kind}'`, node);
    }
  },

  _truthyToC(this: any, node: any, lines: any[] = [], depth: any = 0) {
    const type = this.inferType(node);
    if (!type || type === 'bool' || type === 'void *') {
      return this.exprToC(node, lines, depth);
    }
    const numericTypes = new Set([
      'int8_t','int16_t','int32_t','int64_t',
      'uint8_t','uint16_t','uint32_t','uint64_t',
      'float','double','size_t','char',
    ]);
    if (numericTypes.has(type)) {
      return this.exprToC(node, lines, depth);
    }
    if (type === 'String') {
      const c = this.exprToC(node, lines, depth);
      return `${c}.length > 0`;
    }
    if (type.startsWith('opt_')) {
      const innerIdent = type.slice(4);
      const innerCType = this._arrIdentToCType(innerIdent);
      const c = this.exprToC(node, lines, depth);
      if (innerCType === 'String') {
        return `${c}.has_value && ${c}.value.length > 0`;
      }
      if (numericTypes.has(innerCType)) {
        return `${c}.has_value && ${c}.value != 0`;
      }
      return `${c}.has_value`;
    }
    if (this.classes.has(type) || type.startsWith('Array_') || type.startsWith('TscMap_') || type.startsWith('Map_') || type.startsWith('TscSet_') || type.startsWith('Set_')) {
      this.warn(`condition is always true`, node);
      return '1';
    }
    return this.exprToC(node, lines, depth);
  },
};
