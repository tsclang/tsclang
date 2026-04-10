// expr.js
export default {
  exprToC(node, lines = [], depth = 0) {
    if (!node) return '0';
    switch (node.kind) {
      case 'Literal': return this.literalToC(node);

      case 'Ident': {
        if (node.name === 'keyof') throw new Error(`"keyof" can only be used in type position`);
        const kw = {
          'true': 'true', 'false': 'false', 'null': 'NULL',
          'undefined': 'NULL', 'this': 'self',
        };
        if (kw[node.name] !== undefined) return kw[node.name];
        // Narrowed optional variable: x → x.value inside if(x != null) block
        if (this._narrowedVars?.has(node.name)) {
          const sym2 = this.lookup(node.name);
          if (sym2?.ctype?.startsWith('opt_')) return `${node.name}.value`;
        }
        // Function reference (not a func-ptr variable): use mangled name
        const sym = this.lookup(node.name);
        if (sym?.funcName && !sym.funcPtr) return sym.funcName;
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
        // Rest param: .length → args_count
        if (sym?.rest && node.prop === 'length') {
          return sym.countVar ?? `${node.object.name}_count`;
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
        return isPtr ? `${objC}->${node.prop}` : `${objC}.${node.prop}`;
      }

      case 'Index': {
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
        return `{${props.join(', ')}}`;
      }

      case 'Arrow': {
        // Hoisted lambda
        const lambdaName = this.hoistArrow(node, 'void', '_lambda');
        return lambdaName;
      }

      case 'Cast': {
        const ownershipTypes = ['Ref', 'Mut', 'Shared', 'Weak', 'Box', 'Arc', 'Rc'];
        if (node.castType.kind === 'TypeRef' && ownershipTypes.includes(node.castType.name)) {
          throw new Error(`cannot use "as" for ownership types`);
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
            throw new Error(`cannot cast ${this.ctypeToTsName(exprType)} to string using "as"; use ".toString()"`);
          }
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

      case 'Await':    return this.exprToC(node.expr, lines, depth);
      case 'Yield':    return node.value ? this.exprToC(node.value, lines, depth) : '0';
      case 'Drop':     return `/* drop(${this.exprToC(node.expr, lines, depth)}) */`;
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
      if (code > 127) throw new Error('character literal must be a single ASCII byte');
      return code;
    }
    throw new Error('character literal must be a single ASCII byte');
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
          throw new Error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`);
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
        throw new Error(`cannot mix i32 and u32 in const expression: incompatible signed/unsigned ranges`);
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
          throw new Error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`);
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

    // Nullish coalescing for optional types: opt_T ?? default → opt.has_value ? opt.value : default
    if (node.op === '??') {
      const leftType = this.inferType(node.left);
      if (leftType?.startsWith('opt_')) {
        const lC = this.exprToC(node.left, lines, depth);
        const rC = this.exprToC(node.right, lines, depth);
        // Error: || mixed with ?? requires parens
        if (node.right?.kind === 'Binary' && (node.right.op === '||' || node.right.op === '??')) {
          throw new Error(`"||" and "??" require parentheses when mixed`);
        }
        return `${lC}.has_value ? ${lC}.value : ${rC}`;
      }
    }

    // Error: || and ?? mixed without parens
    if (node.op === '||') {
      if (node.right?.kind === 'Binary' && node.right.op === '??') {
        throw new Error(`"||" and "??" require parentheses when mixed`);
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
            throw new Error(`cannot add ${tsA} and ${tsB}: no implicit widening for let variables, use "as"`);
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
    return false;
  },

  // ----------------------------------------------------------------
  // Unary
  // ----------------------------------------------------------------
  unaryToC(node, lines, depth) {
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
    // Prevent assignment to arr.length or arr.capacity
    if (node.left.kind === 'Member' && node.left.object.kind === 'Ident') {
      const arrSym = this.lookup(node.left.object.name);
      if (arrSym?.isArray) {
        if (node.left.prop === 'length') {
          throw new Error(`cannot assign to "length"; use "${node.left.object.name}.resize(n)" instead`);
        }
        if (node.left.prop === 'capacity') {
          throw new Error(`cannot assign to "capacity"; use "${node.left.object.name}.reallocate(n)" instead`);
        }
      }
    }
    // Check readonly tuple assignment: t[n] = ...
    if (node.left.kind === 'Index' && node.left.object.kind === 'Ident') {
      const sym = this.lookup(node.left.object.name);
      const tupleDef = sym?.ctype ? this.classes.get(sym.ctype) : null;
      if (tupleDef?.readonly) throw new Error('cannot assign to readonly tuple element');
    }
    if (node.left.kind === 'Ident') {
      const sym = this.lookup(node.left.name);
      if (sym && sym.varKind === 'const') {
        const loc = node.line ? `\n${this.filename}.tsc:${node.line}:` : '';
        throw new Error(`cannot assign to 'const' variable '${node.left.name}'${loc}`);
      }
      // String literal union: convert string literal to enum value
      if (sym && node.right?.kind === 'Literal' && node.right.litType === 'string') {
        const enumDef = this.classes.get(sym.ctype);
        if (enumDef?.isStringLiteralUnion) {
          const val = node.right.value;
          if (!enumDef.members.includes(val)) {
            throw new Error(`"${val}" is not a valid value for type ${sym.ctype}`);
          }
          const l = this.exprToC(node.left, lines, depth);
          return `${l} ${node.op} ${sym.ctype}_${val}`;
        }
      }
    }
    const l = this.exprToC(node.left, lines, depth);
    const r = this.exprToC(node.right, lines, depth);

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
