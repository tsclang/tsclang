// expr.js
export default {
  exprToC(node, lines = [], depth = 0) {
    if (!node) return '0';
    this._currentNode = node;
    switch (node.kind) {
      case 'RawC': return node.code;
      case 'Literal': return this.literalToC(node);

      case 'Ident': {
        if (node.name === 'keyof') throw this.error(`"keyof" can only be used in type position`, node);
        const kw = {
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
          if (sym2?.ctype?.startsWith('opt_')) return `${node.name}.value`;
        }
        // Function reference (not a func-ptr variable): use mangled name
        const sym = this.lookup(node.name);
        // Check for use-after-move
        if (sym?._moved) {
          const ms = sym._movedSourceNode;
          throw this.error(`use of moved value: "${node.name}"`, node, {
            label: 'use of moved value',
            spans: ms?.line != null ? [{
              line: ms.line, col: ms.col, endCol: ms.endCol,
              char: '-', label: 'value moved here',
            }] : [],
            code: 'E002',
          });
        }
        // Check for use-after-move-into-closure
        if (sym?._movedIntoClosureLine !== undefined) {
          throw this.error(`use of moved value: '${node.name}' was moved into closure on line ${sym._movedIntoClosureLine}`, node, {
            label: 'use of moved value',
            code: 'E002',
          });
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
          const fieldDecls = fields.map(f => `${f._ctype} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${ctype};`);
          this.addTop('');
          const initParts = (_init.props ?? []).map(pr => `.${pr.key} = ${this.exprToC(pr.value, lines, depth)}`);
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}${ctype} ${node.name} = {${initParts.join(', ')}};`);
          sym.deferredAnon = false;
          this._deferredAnons.delete(node.name);
        }
        return node.name;
      }

      case 'Binary': return this.binaryToC(node, lines, depth);
      case 'Unary':  return this.unaryToC(node, lines, depth);
      case 'Assign': return this.assignToC(node, lines, depth);
      case 'Ternary': {
        const c = this.exprToC(node.cond, lines, depth);
        const yRaw = this.exprToC(node.yes, lines, depth);
        const n = this.exprToC(node.no, lines, depth);
        // Wrap nested ternary in yes-branch to avoid ambiguity
        const y = node.yes.kind === 'Ternary' ? `(${yRaw})` : yRaw;
        return `(${c}) ? ${y} : ${n}`;
      }

      case 'Member': {
        // Namespace import: X.Foo → resolve Foo from namespace
        if (node.object.kind === 'Ident') {
          const nsSym = this.lookup(node.object.name);
          if (nsSym?._isNamespace) {
            const nsEntry = nsSym._namespaceExports?.[node.prop];
            if (nsEntry) {
              // Put in local scope so subsequent uses work
              this.define(node.prop, nsEntry);
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
          const embeddedTargets = ['avr', 'arm', 'stm32'];
          if (embeddedTargets.includes(this._targetName)) {
            throw this.error(`TypeError: 'process.${node.prop}' is not available on embedded targets`);
          }
          if (node.prop === 'stdin')  { this._lastSuppressConst = true; return 'tsc_stdin()'; }
          if (node.prop === 'stdout') { this._lastSuppressConst = true; return 'tsc_stdout()'; }
          if (node.prop === 'stderr') { this._lastSuppressConst = true; return 'tsc_stderr()'; }
        }
        // Math constants: Math.PI, Math.E, Math.SQRT2, etc.
        if (node.object.kind === 'Ident' && node.object.name === 'Math') {
          const mathConsts = {
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
        // Channel<T>.length / .capacity → tsc_channel_length/capacity_T(ch._inner)
        if (sym?._isChannel && (node.prop === 'length' || node.prop === 'capacity')) {
          const ident = sym._channelIdent;
          const objC = this.exprToC(node.object, lines, depth);
          const fn = node.prop === 'length' ? 'length' : 'capacity';
          return `tsc_channel_${fn}_${ident}(${objC}._inner)`;
        }
        // Check for use of moved variable (e.g. a.value after let b = a)
        if (sym?._moved) {
          const ms = sym._movedSourceNode;
          throw this.error(`use of moved value: "${node.object.name}"`, node, {
            label: 'use of moved value',
            spans: ms?.line != null ? [{
              line: ms.line, col: ms.col, endCol: ms.endCol,
              char: '-', label: 'value moved here',
            }] : [],
            code: 'E002',
          });
        }
        // Check for use of moved field (field move tracking)
        if (sym?._movedFields?.has(node.prop)) {
          const ms = sym._movedFieldSourceNode?.[node.prop];
          throw this.error(`use of moved value: '${node.object.name}.${node.prop}'`, node, {
            label: 'use of moved value',
            spans: ms?.line != null ? [{
              line: ms.line, col: ms.col, endCol: ms.endCol,
              char: '-', label: 'value moved here',
            }] : [],
            code: 'E006',
          });
        }
        // Error subclass: e.message → _err_0._base.message (parent fields via _base)
        if (sym?._alias && sym?.ctype) {
          const errClass = this.classes.get(sym.ctype);
          const isOwnField = errClass?.fields?.some(f => f.name === node.prop);
          if (!isOwnField) {
            // Field is on parent (TscError._base): route through _alias._base.prop
            return `${sym._alias}._base.${node.prop}`;
          }
          return `${sym._alias}.${node.prop}`;
        }
        // Check private field access from outside the class
        if (sym?.ctype) {
          const classDef = this.classes.get(sym.ctype);
          const field = classDef?.fields?.find(f => f.name === node.prop);
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
        // Enum member access: Direction.North → Direction_North
        if (node.object.kind === 'Ident') {
          const enumDef = this.classes.get(node.object.name);
          if (enumDef?.isEnum) return `${node.object.name}_${node.prop}`;
          // Labeled tuple field access: p.x → p._0 (look up via symbol type)
          const symForLabel = this.lookup(node.object.name);
          const tupleDef3 = symForLabel ? this.classes.get(symForLabel.ctype) : null;
          if (tupleDef3?.isTuple) {
            const field = tupleDef3.fields.find(f => f.label === node.prop);
            if (field) {
              const objC = this.exprToC(node.object, lines, depth);
              return `${objC}.${field.name}`;
            }
          }
        }
        // Pool opt_ref var: p.field → p.value->field (route through pool pointer)
        // Note: only exclude has_value and _pool_idx (struct meta-fields); 'value' may be a class field
        if (sym?.ctype?.startsWith('opt_ref_') && !['has_value','_pool_idx'].includes(node.prop)) {
          const poolClassName = sym.ctype.slice(8);
          const poolCls = this.classes.get(poolClassName);
          if (poolCls?._isPool) {
            // Check if this prop exists on the pool class itself (not on opt_ref wrapper)
            const isClassField = poolCls.fields?.some(f => f.name === node.prop);
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
        if (symCls?.superClass && symCls.fields && !symCls.fields.some(f => f.name === node.prop)) {
          const baseCls = this.classes.get(symCls.superClass);
          if (baseCls?.fields?.some(f => f.name === node.prop)) {
            return isPtr ? `${objC}->_base.${node.prop}` : `${objC}._base.${node.prop}`;
          }
        }
        // Throws class: .message → ._base.message
        if (symCls?._isThrowsClass && node.prop === 'message') {
          return isPtr ? `${objC}->_base.message` : `${objC}._base.message`;
        }
        // URL field access — u.search after mutation → tsc_url_search(&u)
        if (this._stdUrlImported && sym?._isURL) {
          const _urlMutatedFields = ['search'];
          if (_urlMutatedFields.includes(node.prop)) {
            return `tsc_url_search(&${node.object.name})`;
          }
        }
        return isPtr ? `${objC}->${node.prop}` : `${objC}.${node.prop}`;
      }

      case 'Index': {
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
        const negLitVal = (idx) => {
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
        // String indexing: s[i] → (uint8_t)s.data[i], s[-1] → (uint8_t)s.data[s.length - 1]
        if (objType === 'String') {
          if (isNegLit) {
            const n = negVal;
            return `(uint8_t)${obj}.data[${obj}.length - ${n}]`;
          }
          const idx = this.exprToC(node.index, lines, depth);
          return `(uint8_t)${obj}.data[${idx}]`;
        }
        const idx = this.exprToC(node.index, lines, depth);
        return `${obj}[${idx}]`;
      }

      case 'RangeIndex': {
        // s[start..end], s[..], s[6..], s[..5] — string/array slice
        const obj = this.exprToC(node.object, lines, depth);
        const objType2 = this.inferType(node.object);
        const start = node.start ? this.exprToC(node.start, lines, depth) : null;
        const end   = node.end   ? this.exprToC(node.end,   lines, depth) : null;
        // Compute length as literal if both bounds are numeric literals
        const litLen = (startNode, endNode) => {
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
        // Determine element type from first element
        const elems = node.elems.filter(e => !e.spread);
        const elemType = elems.length ? this.inferType(elems[0].expr) : 'int32_t';
        const arrType = `Array_${this.cTypeToIdent(elemType)}`;
        const dataVar = `_arr_data_${this.tempCount++}`;
        const items = elems.map(e => this.exprToC(e.expr, lines, depth)).join(', ');
        lines.push(`${elemType} ${dataVar}[] = {${items}};`);
        return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = ${elems.length}}`;
      }

      case 'ObjLit': {
        const props = node.props.map(p => {
          if (p.spread) return `/* ...${this.exprToC(p.expr, lines, depth)} */`;
          if (p.computed) return `/* computed key */`;
          return `.${p.key} = ${this.exprToC(p.value, lines, depth)}`;
        });
        return props.length > 0 ? `{ ${props.join(', ')} }` : `{}`;
      }

      case 'Arrow': {
        // Hoisted lambda
        const lambdaName = this.hoistArrow(node, 'void', '_lambda');
        return lambdaName;
      }

      case 'Cast': {
        // as Volatile<T> → (volatile T *)expr; hex literals get U suffix
        if (node.castType.kind === 'TypeRef' && node.castType.name === 'Volatile') {
          const inner = this.resolveType(node.castType.typeArgs?.[0]);
          let exprC = this.exprToC(node.expr, lines, depth);
          if (/^0x[0-9a-fA-F]+$/.test(exprC)) exprC += 'U';
          return `(volatile ${inner} *)${exprC}`;
        }
        const ownershipTypes = ['Ref', 'Mut', 'Shared', 'Weak', 'Box', 'Arc', 'Rc'];
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
        const exprC = this.exprToC(node.expr, lines, depth);
        const ct = this.resolveType(node.castType);
        // Wrap complex expressions in parens to preserve operator precedence
        const needsParens = node.expr.kind === 'Binary' || node.expr.kind === 'Ternary' || node.expr.kind === 'Logical';
        return needsParens ? `(${ct})(${exprC})` : `(${ct})${exprC}`;
      }

      case 'Typeof': {
        const exprC = this.exprToC(node.expr, lines, depth);
        // Return the type string as known at compile time
        const sym = node.expr.kind === 'Ident' ? this.lookup(node.expr.name) : null;
        const ctype = sym?.ctype ?? 'int32_t';
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
      case 'Yield':    return node.value ? this.exprToC(node.value, lines, depth) : '0';
      case 'Drop': {
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
        return `/* drop(${this.exprToC(node.expr, lines, depth)}) */`;
      }
      case 'NonNull':  return this.exprToC(node.expr, lines, depth);
      case 'Propagate': return this.exprToC(node.expr, lines, depth);
      case 'OptChain': {
        const obj = this.exprToC(node.object, lines, depth);
        return `${obj}.${node.prop}`;
      }

      default:
        return `/* expr:${node.kind} */`;
    }
  },

  // ----------------------------------------------------------------
  // Literals
  // ----------------------------------------------------------------
  // Unescape a char literal value to numeric code
  _charCode(raw) {
    if (raw === '\\n') return 10;
    if (raw === '\\t') return 9;
    if (raw === '\\r') return 13;
    if (raw === '\\0') return 0;
    if (raw === '\\\\') return 92;
    if (raw === "\\'") return 39;
    if (raw === '\\"') return 34;
    if (raw.startsWith('\\x')) return parseInt(raw.slice(2), 16);
    if (raw.startsWith('\\u')) return parseInt(raw.slice(2), 16);
    if (raw.length === 1) {
      const code = raw.charCodeAt(0);
      if (code > 127) throw this.error('character literal must be a single ASCII byte');
      return code;
    }
    throw this.error('character literal must be a single ASCII byte');
  },

  literalToC(node) {
    if (node.litType === 'string') return `STR_LIT("${node.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
    if (node.litType === 'char')   return String(this._charCode(node.value)) + 'U';
    if (node.litType === 'bool')   return node.value;
    if (node.litType === 'null')   return 'NULL';
    const v = node.value;
    // Convert 0o (octal) → C octal 0NNN format
    if (v.startsWith('0o') || v.startsWith('0O')) return '0' + v.slice(2);
    // Binary and hex pass through (gcc supports 0b prefix)
    return v;
  },

  // Emit a number literal with the correct suffix for the given target C type
  literalToCTyped(node, ctype) {
    // Char literals: convert to numeric value
    if (node.litType === 'char') {
      const code = this._charCode(node.value);
      if (ctype === 'uint8_t' || ctype === 'char') return code + 'U';
      return String(code);
    }
    let v = node.value;
    // Convert 0o (octal) → C octal 0NNN format
    if (v.startsWith('0o') || v.startsWith('0O')) v = '0' + v.slice(2);
    if (ctype === 'float') {
      // f32: add 'f' suffix if no decimal, or if decimal without suffix
      if (v.startsWith('0x') || v.startsWith('0X')) return `(float)${v}`;
      const base = v.endsWith('f') ? v : v + (v.includes('.') ? 'f' : '.0f');
      return base;
    }
    if (ctype === 'double') {
      if (v.includes('.') || v.includes('e') || v.includes('E')) return v;
      return v + '.0';
    }
    if (ctype === 'int64_t') return v + 'LL';
    if (ctype === 'uint64_t') {
      const n = BigInt(v);
      if (n > 4294967295n) return v + 'ULL';
      return v + 'U';
    }
    if (ctype === 'uint32_t' || ctype === 'uint16_t' || ctype === 'uint8_t') return v + 'U';
    if (ctype === 'size_t') return v + 'U';  // usize literals always get U suffix
    return v;
  },

  // ----------------------------------------------------------------
  // Binary
  // ----------------------------------------------------------------
  // Get compile-time constant value of a const-literal variable or literal node (BigInt or null)
  constVal(node) {
    if (node.kind === 'Literal' && node.litType === 'number') {
      try { return BigInt(node.value.replace(/_/g, '')); } catch(_) { return null; }
    }
    if (node.kind === 'Unary' && node.op === '-') {
      const v = this.constVal(node.expr ?? node.operand);
      return v !== null ? -v : null;
    }
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      return sym?.constValue ?? null;
    }
    return null;
  },

  // For const-context mixed integer binary expressions: cast operands and result explicitly.
  // Returns null if not applicable.
  tryConstMixedBinary(node, targetCtype, lines, depth) {
    const lt = this.inferType(node.left);
    const rt = this.inferType(node.right);
    // Only applies to arithmetic ops with const operands (not let variables)
    const arithOps = ['+', '-', '*', '/', '%'];
    if (!arithOps.includes(node.op)) return null;
    const leftIsLet  = node.left.kind  === 'Ident' && this.lookup(node.left.name)?.varKind === 'let';
    const rightIsLet = node.right.kind === 'Ident' && this.lookup(node.right.name)?.varKind === 'let';
    if (leftIsLet || rightIsLet) return null; // let vars handled separately (error or binaryWidened)

    // i64 + u32 or u32 + i64
    if ((lt === 'int64_t' && rt === 'uint32_t') || (lt === 'uint32_t' && rt === 'int64_t')) {
      // Compile-time overflow check if values are known
      const lv = this.constVal(node.left), rv = this.constVal(node.right);
      if (lv !== null && rv !== null) {
        const result = node.op === '+' ? lv + rv : node.op === '-' ? lv - rv :
                       node.op === '*' ? lv * rv : node.op === '/' ? lv / rv : lv % rv;
        const typeMax = { 'uint32_t': 4294967295n, 'uint8_t': 255n, 'uint16_t': 65535n,
                          'int32_t': 2147483647n, 'int64_t': 9223372036854775807n };
        const typeMin = { 'uint32_t': 0n, 'uint8_t': 0n, 'uint16_t': 0n,
                          'int32_t': -2147483648n, 'int64_t': -9223372036854775808n };
        if (targetCtype in typeMax && (result > typeMax[targetCtype] || result < typeMin[targetCtype])) {
          throw this.error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`, node);
        }
      }
      const [lC, rC] = [this.exprToC(node.left, lines, depth), this.exprToC(node.right, lines, depth)];
      const [lCast, rCast] = lt === 'int64_t' ? [lC, `(int64_t)${rC}`] : [`(int64_t)${lC}`, rC];
      const inner = `(uint32_t)(${lCast} ${node.op} ${rCast})`;
      return targetCtype === 'uint32_t' ? inner : `(${targetCtype})(${inner})`;
    }
    // i32 + u32 or u32 + i32
    if ((lt === 'int32_t' && rt === 'uint32_t') || (lt === 'uint32_t' && rt === 'int32_t')) {
      // Check if the u32 operand fits in i32 range
      const u32Node = lt === 'uint32_t' ? node.left : node.right;
      const u32Val = this.constVal(u32Node);
      if (u32Val !== null && u32Val > 2147483647n) {
        throw this.error(`cannot mix i32 and u32 in const expression: incompatible signed/unsigned ranges`, node);
      }
      const [lC, rC] = [this.exprToC(node.left, lines, depth), this.exprToC(node.right, lines, depth)];
      const [lCast, rCast] = lt === 'int32_t' ? [lC, `(int32_t)${rC}`] : [`(int32_t)${lC}`, rC];
      const inner = `(int32_t)(${lCast} ${node.op} ${rCast})`;
      return targetCtype === 'int32_t' ? inner : `(${targetCtype})(${inner})`;
    }
    // i64 + u32 → u8/u16: overflow check
    if (targetCtype === 'uint8_t' || targetCtype === 'uint16_t') {
      const typeMax = { 'uint8_t': 255n, 'uint16_t': 65535n };
      const typeMin = { 'uint8_t': 0n, 'uint16_t': 0n };
      const lv = this.constVal(node.left), rv = this.constVal(node.right);
      if (lv !== null && rv !== null) {
        const result = node.op === '+' ? lv + rv : node.op === '-' ? lv - rv :
                       node.op === '*' ? lv * rv : node.op === '/' ? lv / rv : lv % rv;
        if (result > typeMax[targetCtype] || result < typeMin[targetCtype]) {
          throw this.error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`, node);
        }
      }
    }
    return null;
  },

  // Emit a binary expression with operands widened to targetCtype to avoid overflow
  binaryWidened(node, targetCtype, lines, depth) {
    const widenOperand = (operand) => {
      if (operand.kind === 'Literal' && operand.litType === 'number') {
        return this.literalToCTyped(operand, targetCtype);
      }
      const ot = this.inferType(operand);
      const needsCast = (targetCtype === 'int64_t' && (ot === 'uint32_t' || ot === 'size_t' || ot === 'int32_t'));
      const c = this.exprToC(operand, lines, depth);
      return needsCast ? `(${targetCtype})${c}` : c;
    };
    const lC = widenOperand(node.left);
    const rC = widenOperand(node.right);
    return `${lC} ${node.op} ${rC}`;
  },

  binaryToC(node, lines, depth) {
    // instanceof: obj instanceof TypeName
    if (node.op === 'instanceof') {
      const typeName = node.right.kind === 'Ident' ? node.right.name : null;
      if (!typeName) throw this.error(`TypeError: 'instanceof' right-hand side must be a type name`, node);
      const objSym2 = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      if (!this.interfaces.has(typeName)) {
        // Class on RHS: only valid when LHS is that same class (always-true compile-time check)
        if (this.classes.has(typeName) && objSym2?.ctype === typeName) return '1';
        // LHS is an interface fat-ptr and RHS is a concrete class: vtable compare
        if (this.classes.has(typeName) && objSym2?.ctype && this.interfaces.has(objSym2.ctype)) {
          const ifaceName = objSym2.ctype;
          const className = typeName;
          const classDef = this.classes.get(className);
          const hasExplicit = classDef?.implements_?.includes(ifaceName);
          const vtableName = hasExplicit ? `${className}_${ifaceName}_vtable` : `_${className}_${ifaceName}_vtable`;
          if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
          const objC2 = this.exprToC(node.left, lines, depth);
          return `${objC2}.vtable == &${vtableName}`;
        }
        throw this.error(`TypeError: 'instanceof' requires an interface type on the right-hand side, got '${typeName}'`, node);
      }
      // Interface instanceof: compare vtable pointer (obj must be concrete class)
      const objC = this.exprToC(node.left, lines, depth);
      if (objSym2?.ctype && this.classes.has(objSym2.ctype)) {
        const className = objSym2.ctype;
        const classDef = this.classes.get(className);
        const hasExplicit = classDef?.implements_?.includes(typeName);
        const vtableName = hasExplicit ? `${className}_${typeName}_vtable` : `_${className}_${typeName}_vtable`;
        if (!hasExplicit) this._ensureImplicitVtable(className, typeName);
        return `${objC}.vtable == &${vtableName}`;
      }
      // Fallback
      return `${objC}.vtable != NULL`;
    }

    // Optional type comparisons: opt_T != null → opt.has_value, opt_T == null → !opt.has_value
    if (node.op === '!=' || node.op === '!==' || node.op === '==' || node.op === '===') {
      const isNull = (n) => n.kind === 'Literal' && n.litType === 'null';
      const optSide = isNull(node.right) ? node.left : isNull(node.left) ? node.right : null;
      if (optSide) {
        const optType = this.inferType(optSide);
        if (optType?.startsWith('opt_')) {
          const optC = this.exprToC(optSide, lines, depth);
          return (node.op === '!=' || node.op === '!==') ? `${optC}.has_value` : `!${optC}.has_value`;
        }
      }
    }

    // Pool opt_ref null check: p != null → p.has_value, p == null → !p.has_value
    if (node.op === '!=' || node.op === '!==' || node.op === '==' || node.op === '===') {
      const _isNullLit = (n) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
      const _nullSide = _isNullLit(node.right) ? 'right' : _isNullLit(node.left) ? 'left' : null;
      if (_nullSide) {
        const _other = _nullSide === 'right' ? node.left : node.right;
        const _otherSym = _other.kind === 'Ident' ? this.lookup(_other.name) : null;
        if (_otherSym?.ctype?.startsWith('opt_ref_') && this.classes.get(_otherSym.ctype.slice(8))?._isPool) {
          const _vc = this.exprToC(_other, lines, depth);
          return (node.op === '!=' || node.op === '!==') ? `${_vc}.has_value` : `!${_vc}.has_value`;
        }
      }
    }

    // Nullish coalescing for optional types: opt_T ?? default → opt.has_value ? opt.value : default
    if (node.op === '??') {
      const leftType = this.inferType(node.left);
      if (leftType?.startsWith('opt_')) {
        const lC = this.exprToC(node.left, lines, depth);
        const rC = this.exprToC(node.right, lines, depth);
        // Error: || mixed with ?? requires parens
        if (node.right?.kind === 'Binary' && (node.right.op === '||' || node.right.op === '??')) {
          throw this.error(`"||" and "??" require parentheses when mixed`, node);
        }
        return `${lC}.has_value ? ${lC}.value : ${rC}`;
      }
    }

    // Error: || and ?? mixed without parens
    if (node.op === '||') {
      if (node.right?.kind === 'Binary' && node.right.op === '??') {
        throw this.error(`"||" and "??" require parentheses when mixed`, node);
      }
    }

    // ** uses pow() from math.h
    if (node.op === '**') {
      this.includes.add('#include <math.h>');
      const lC = this.exprToC(node.left, lines, depth);
      const rC = this.exprToC(node.right, lines, depth);
      const lLit = node.left.kind === 'Literal' && !node.left.value.includes('.');
      const rLit = node.right.kind === 'Literal' && !node.right.value.includes('.');
      return `pow(${lLit ? lC + '.0' : lC}, ${rLit ? rC + '.0' : rC})`;
    }

    // && / || with non-bool operands: JS operand-return semantics (returns the operand, not 0/1)
    if (node.op === '&&' || node.op === '||') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      if (lt !== 'bool' && rt !== 'bool') {
        const tmp = `_tsc_lhs_${this.tempCount++}`;
        const lC = this.exprToC(node.left, lines, depth);
        const I = ' '.repeat(this.indent * depth);
        lines.push(`${I}${lt} ${tmp} = ${lC};`);
        const rC = this.exprToC(node.right, lines, depth);
        if (node.op === '&&') return `(${tmp}) ? ${rC} : ${tmp}`;
        else                  return `(${tmp}) ? ${tmp} : ${rC}`;
      }
    }

    // Wrap sub-expressions in parens when needed for precedence
    const needsParens = (child, parentOp, isRight) => {
      if (child.kind !== 'Binary') return child.kind === 'Assign';
      const prec = { '**':13, '*':12, '/':12, '%':12, '+':11, '-':11,
        '<<':10, '>>':10, '>>>':10, '<':9, '>':9, '<=':9, '>=':9,
        '==':8, '!=':8, '===':8, '!==':8,
        '&':7, '^':6, '|':5, '&&':4, '||':3, '??':3 };
      const pp = prec[parentOp] ?? 0;
      const cp = prec[child.op] ?? 0;
      if (cp < pp) return true;
      if (cp === pp && isRight) return true; // left-assoc needs parens on right
      return false;
    };
    // Check for illegal mixed integer types in arithmetic (when operands are let variables)
    const arithOps = ['+', '-', '*', '/', '%'];
    if (arithOps.includes(node.op)) {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      const mixedPairs = [['int64_t','uint32_t'],['uint32_t','int64_t'],
                          ['uint64_t','int64_t'],['int64_t','uint64_t']];
      for (const [a, b] of mixedPairs) {
        if (lt === a && rt === b) {
          // Only error if either operand is a let/var variable (not const/literal)
          const leftIsLet  = node.left.kind  === 'Ident' && this.lookup(node.left.name)?.varKind  === 'let';
          const rightIsLet = node.right.kind === 'Ident' && this.lookup(node.right.name)?.varKind === 'let';
          if (leftIsLet || rightIsLet) {
            const [tsA, tsB] = [a,b].map(t => this.ctypeToTsName(t));
            throw this.error(`cannot add ${tsA} and ${tsB}: no implicit widening for let variables, use "as"`, node);
          }
        }
      }
    }

    const lRaw = this.exprToC(node.left,  lines, depth);
    const rRaw = this.exprToC(node.right, lines, depth);
    const l = needsParens(node.left,  node.op, false) ? `(${lRaw})` : lRaw;
    const r = needsParens(node.right, node.op, true)  ? `(${rRaw})` : rRaw;
    const opMap = {
      '===': '==', '!==': '!=',
      '&&':  '&&', '||': '||', '??': '||',
    };
    const op = opMap[node.op] ?? node.op;

    // >>> (unsigned right shift) → (int32_t)((uint32_t)l >> r)
    if (node.op === '>>>') {
      return `(int32_t)((uint32_t)${l} >> ${r})`;
    }

    // Bitwise ops on integers — if used where double is expected, emit with cast
    const bitwiseOps = ['&', '|', '^', '<<', '>>'];
    if (bitwiseOps.includes(node.op)) {
      return `${l} ${op} ${r}`;
    }

    // String equality: use tsc_string_eq
    if ((node.op === '==' || node.op === '===' || node.op === '!=' || node.op === '!==') &&
        this.isStringExpr(node.left)) {
      const eq = `tsc_string_eq(${l}, ${r})`;
      return (node.op === '!=' || node.op === '!==') ? `!${eq}` : eq;
    }
    // String concat via +
    if (node.op === '+' && this.isStringExpr(node.left)) {
      const rType = this.inferType(node.right);
      let rC = r;
      if (rType !== 'String') {
        const etIdent = this.cTypeToIdent(rType);
        rC = `tsc_${etIdent}_to_string(${r})`;
      }
      return `tsc_string_concat(${l}, ${rC})`;
    }
    return `${l} ${op} ${r}`;
  },

  isStringExpr(node) {
    if (node.kind === 'Literal' && node.litType === 'string') return true;
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      return sym?.ctype === 'String';
    }
    // Binary + whose left is a string → the result is also String
    if (node.kind === 'Binary' && node.op === '+') return this.isStringExpr(node.left);
    // Template literal, Call returning string, etc.
    if (node.kind === 'Call') return this.inferType(node) === 'String';
    return false;
  },

  // ----------------------------------------------------------------
  // Unary
  // ----------------------------------------------------------------
  unaryToC(node, lines, depth) {
    if (node.op === '&' || node.op === '*') {
      if (!this._inUnsafe) {
        throw this.error(`TypeError: Raw pointer operation outside unsafe block; wrap in 'unsafe { ... }'`, node);
      }
      const e = this.exprToC(node.expr, lines, depth);
      return node.op === '&' ? `&${e}` : `*${e}`;
    }
    const e = this.exprToC(node.expr, lines, depth);
    switch (node.op) {
      case '!':     return `!${e}`;
      case '-':     return `-${e}`;
      case '~':     return `~${e}`;
      case '++pre': return `++${e}`;
      case '--pre': return `--${e}`;
      case '++post': return `${e}++`;
      case '--post': return `${e}--`;
      default: return `/* ${node.op} */${e}`;
    }
  },

  // ----------------------------------------------------------------
  // Assignment
  // ----------------------------------------------------------------
  assignToC(node, lines, depth) {
    // Generator .next() assignment: r = g.next() → r = genFn_next(&g, args);
    if (node.right?.kind === 'Call' && node.right.callee?.kind === 'Member'
        && node.right.callee.prop === 'next') {
      const objName = node.right.callee.object?.name;
      const sym = objName ? this.lookup(objName) : null;
      if (sym?._isGenState) {
        const gi = sym._gi;
        const objC = this.exprToC(node.right.callee.object, lines, depth);
        const nextArgs = [].concat(sym._genArgs || []);
        const callArgs = nextArgs.length ? `&${objC}, ${nextArgs.join(', ')}` : `&${objC}`;
        const leftC = this.exprToC(node.left, lines, depth);
        return `${leftC} ${node.op || '='} ${gi.nextFn}(${callArgs})`;
      }
    }
    // Prevent assignment to arr.length or arr.capacity
    if (node.left.kind === 'Member' && node.left.object.kind === 'Ident') {
      const arrSym = this.lookup(node.left.object.name);
      if (arrSym?.isArray) {
        if (node.left.prop === 'length') {
          throw this.error(`cannot assign to "length"; use "${node.left.object.name}.resize(n)" instead`, node);
        }
        if (node.left.prop === 'capacity') {
          throw this.error(`cannot assign to "capacity"; use "${node.left.object.name}.reallocate(n)" instead`, node);
        }
      }
      // Check readonly field write outside constructor
      const objSym = this.lookup(node.left.object.name);
      if (objSym?.ctype) {
        const classDef = this.classes.get(objSym.ctype);
        const field = classDef?.fields?.find(f => f.name === node.left.prop);
        if (field?.modifiers?.includes('readonly')) {
          // We are inside the constructor if currentFuncName is 'new' (before mangling) and self.ctype matches
          const thisSym = this.lookup('this') ?? this.lookup('self');
          const inCtor = this.currentFuncName === 'new' && thisSym?.ctype === objSym.ctype;
          if (!inCtor) {
            throw this.error(`cannot assign to readonly field "${node.left.prop}" outside the constructor`, node);
          }
        }
      }
    }
    // Check readonly tuple assignment: t[n] = ...
    if (node.left.kind === 'Index' && node.left.object.kind === 'Ident') {
      const sym = this.lookup(node.left.object.name);
      const tupleDef = sym?.ctype ? this.classes.get(sym.ctype) : null;
      if (tupleDef?.readonly) throw this.error('cannot assign to readonly tuple element', node);
    }
    if (node.left.kind === 'Ident') {
      const sym = this.lookup(node.left.name);
      if (sym && sym.varKind === 'const') {
        throw this.error(`cannot assign to 'const' variable '${node.left.name}'`, node, {
          label: 'cannot assign to const',
          help: [`change \`const\` to \`let\` if this variable needs to be mutable`],
          code: 'E001',
        });
      }
      // String literal union: convert string literal to enum value
      if (sym && node.right?.kind === 'Literal' && node.right.litType === 'string') {
        const enumDef = this.classes.get(sym.ctype);
        if (enumDef?.isStringLiteralUnion) {
          const val = node.right.value;
          if (!enumDef.members.includes(val)) {
            throw this.error(`"${val}" is not a valid value for type ${sym.ctype}`, node);
          }
          const l = this.exprToC(node.left, lines, depth);
          return `${l} ${node.op} ${sym.ctype}_${val}`;
        }
      }
    }
    const l = this.exprToC(node.left, lines, depth);
    // Type-directed literal emit: float field = 1.0 → 1.0f
    let r;
    if (node.right?.kind === 'Literal' && node.right.litType === 'number' && node.op === '=') {
      const leftType = this.inferType(node.left);
      if (leftType === 'float' || leftType === 'double') {
        r = this.literalToCTyped(node.right, leftType);
      }
    }
    if (r === undefined) r = this.exprToC(node.right, lines, depth);

    // >>>= → x = (int32_t)((uint32_t)x >> r)
    if (node.op === '>>>=') {
      return `${l} = (int32_t)((uint32_t)${l} >> ${r})`;
    }

    // **= → x = pow(x, r)
    if (node.op === '**=') {
      this.includes.add('#include <math.h>');
      return `${l} = pow(${l}, ${r})`;
    }
    // ??= → if (!x.has_value) { x = (opt_T){true, rhs}; }
    if (node.op === '??=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const optType = sym?.ctype;
      if (optType?.startsWith('opt_')) {
        if (sym) sym.optIsNull = false; // after ??=, variable is guaranteed to have a value
        return `if (!${l}.has_value) { ${l} = (${optType}){true, ${r}}; }`;
      }
      return `${l} = ${l} ?? ${r}`;
    }
    // &&= / ||= → JS semantics with temp
    if (node.op === '&&=' || node.op === '||=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const lt = sym?.ctype ?? 'int32_t';
      const tmp = `_tsc_lhs`;
      const I = ' '.repeat(this.indent * depth);
      if (node.op === '&&=') {
        return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${r} : ${tmp}; }`;
      } else {
        return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${tmp} : ${r}; }`;
      }
    }

    return `${l} ${node.op} ${r}`;
  }
};
