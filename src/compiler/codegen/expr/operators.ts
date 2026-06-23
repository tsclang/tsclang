// operators.js
export default {
  // Emit a binary expression with operands widened to targetCtype to avoid overflow
  binaryWidened(node: any, targetCtype: any, lines: any, depth: any) {
    const widenOperand = (operand: any): any => {
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

  binaryToC(node: any, lines: any, depth: any) {
    this._checkNoBareThrows(node.left);
    this._checkNoBareThrows(node.right);
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
      const isNull = (n: any) => n.kind === 'Literal' && n.litType === 'null';
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
      const _isNullLit = (n: any) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
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
        let lC = this.exprToC(node.left, lines, depth);
        // Error: || mixed with ?? requires parens
        if (node.right?.kind === 'Binary' && (node.right.op === '||' || node.right.op === '??')) {
          throw this.error(`"||" and "??" require parentheses when mixed`, node);
        }
        if (!['Ident', 'Literal'].includes(node.left.kind)) {
          const tmp = `_tsc_opt_${this.tempCount++}`;
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}${leftType} ${tmp} = ${lC};`);
          lC = tmp;
        }
        const rC = this.exprToC(node.right, lines, depth);
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
    const needsParens = (child: any, parentOp: any, isRight: any) => {
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
      const mixedPairs = [
        ['int8_t','uint8_t'],   ['uint8_t','int8_t'],
        ['int16_t','uint16_t'], ['uint16_t','int16_t'],
        ['int32_t','uint32_t'], ['uint32_t','int32_t'],
        ['int64_t','uint64_t'], ['uint64_t','int64_t'],
        ['int64_t','uint32_t'], ['uint32_t','int64_t'],
      ];
      for (const [a, b] of mixedPairs) {
        if (lt === a && rt === b) {
          // Only error if either operand is a let/var variable (not const/literal)
          const leftIsLet  = node.left.kind  === 'Ident' && this.lookup(node.left.name)?.varKind  === 'let';
          const rightIsLet = node.right.kind === 'Ident' && this.lookup(node.right.name)?.varKind === 'let';
          if (leftIsLet || rightIsLet) {
            const [tsA, tsB] = [a,b].map((t: any) => this.ctypeToTsName(t));
            const widthA = a.match(/\d+/)?.[0];
            const widthB = b.match(/\d+/)?.[0];
            const reason = widthA === widthB
              ? `cannot mix ${tsA} and ${tsB}: signed/unsigned mismatch, use "as" to specify type`
              : `cannot add ${tsA} and ${tsB}: no implicit widening for let variables, use "as"`;
            throw this.error(reason, node);
          }
        }
      }
    }

    // String concat chain (3+ operands): flatten and use tsc_string_concat_n
    // to avoid leaking intermediate heap-allocated String temporaries.
    // Must intercept before l/r computation to prevent duplicate exprToC calls.
    if (node.op === '+' && this.isStringExpr(node.left)) {
      const operands = this._flattenStringConcat(node);
      if (operands.length >= 3) {
        return this._stringConcatChain(operands, lines, depth);
      }
    }

    // Error: binary operations on unknown type (must narrow first via typeof)
    const _allBinaryOps = ['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>'];
    if (_allBinaryOps.includes(node.op)) {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      if (lt === 'tsc_unknown') throw this.error(`Cannot perform binary operation '${node.op}' on type 'unknown'`, node);
      if (rt === 'tsc_unknown') throw this.error(`Cannot perform binary operation '${node.op}' on type 'unknown'`, node);
    }

    // typeof x === "typename" runtime check for unknown variables
    if ((node.op === '===' || node.op === '!==') && node.left.kind === 'Typeof') {
      const inner = node.left.expr;
      if (inner.kind === 'Ident') {
        const sym = this.lookup(inner.name);
        if (sym?.ctype === 'tsc_unknown') {
          this._ensureUnknownStruct();
          if (node.right.kind === 'Literal' && node.right.litType === 'string') {
            const tid = this._tsNameToTypeId(node.right.value);
            const cOp = node.op === '===' ? '==' : '!=';
            return `${inner.name}.type_id ${cOp} ${tid}`;
          }
        }
      }
    }
    if ((node.op === '===' || node.op === '!==') && node.right.kind === 'Typeof') {
      const inner = node.right.expr;
      if (inner.kind === 'Ident') {
        const sym = this.lookup(inner.name);
        if (sym?.ctype === 'tsc_unknown') {
          this._ensureUnknownStruct();
          if (node.left.kind === 'Literal' && node.left.litType === 'string') {
            const tid = this._tsNameToTypeId(node.left.value);
            const cOp = node.op === '===' ? '==' : '!=';
            return `${inner.name}.type_id ${cOp} ${tid}`;
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

    const bitwiseOps = ['&', '|', '^', '<<', '>>'];
    if (bitwiseOps.includes(node.op)) {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      const NUMERIC = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','double','float','char','size_t','bool']);
      if (!NUMERIC.has(lt) || !NUMERIC.has(rt)) {
        const tsName = (t: any) => t === 'String' ? 'string' : t === 'void *' ? 'null' : t;
        throw this.error(`TypeError: bitwise op '${node.op}' not applicable to '${tsName(lt)}' and '${tsName(rt)}'`, node);
      }
      const needsCast = this._hasFloatVar(node.left) || this._hasFloatVar(node.right);
      if (needsCast) {
        const lft = this._hasFloatVar(node.left) ? this.inferType(node.left) : this.inferType(node.right);
        return `(${lft})(((int32_t)(${l})) ${op} ((int32_t)(${r})))`;
      }
      return `${l} ${op} ${r}`;
    }

    // String equality: use tsc_string_eq
    if ((node.op === '==' || node.op === '===' || node.op === '!=' || node.op === '!==') &&
        this.isStringExpr(node.left)) {
      const ld = this._derefStringPtr(node.left, l);
      const rd = this._derefStringPtr(node.right, r);
      const eq = `tsc_string_eq(${ld}, ${rd})`;
      return (node.op === '!=' || node.op === '!==') ? `!${eq}` : eq;
    }
    // String concat via +
    if (node.op === '+' && this.isStringExpr(node.left)) {
      const ld = this._derefStringPtr(node.left, l);
      const rType = this.inferType(node.right);
      let rC = this._derefStringPtr(node.right, r);
      if (rType !== 'String' && rType !== 'String *') {
        const etIdent = this.cTypeToIdent(rType);
        rC = `tsc_${etIdent}_to_string(${r})`;
      }
      return `tsc_string_concat(${ld}, ${rC})`;
    }
    if (node.op === '%') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      if (lt === 'double' || rt === 'double') return `fmod(${l}, ${r})`;
    }
    const intTypes = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','char','bool']);
    const _isIntOperand = (n: any, t: any) => {
      if (intTypes.has(t)) return true;
      if (t === undefined) return true;
      if (t === 'double' || t === 'float') {
        if (n?.kind === 'Literal' && n?.litType === 'number') return Number.isInteger(parseFloat(n.value));
        if (n?.kind === 'Unary' && n?.op === '-' && n?.expr?.kind === 'Literal' && n?.expr?.litType === 'number') return Number.isInteger(parseFloat(n.expr.value));
      }
      return false;
    };
    if (node.op === '+' || node.op === '-' || node.op === '*') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      const isInt = _isIntOperand(node.left, lt) && _isIntOperand(node.right, rt);
      const hasSafeMath = this._strictRules?.has('safe-math');

      if (hasSafeMath && isInt) {
        if (this._inMathTry) {
          const builtin = op === '+' ? '__builtin_add_overflow'
                        : op === '-' ? '__builtin_sub_overflow'
                        : '__builtin_mul_overflow';
          const typeRank = { 'int8_t': 0, 'int16_t': 1, 'int32_t': 2, 'int64_t': 3 };
          const resultType = (typeRank[lt] ?? 2) >= (typeRank[rt] ?? 2) ? (lt ?? 'int32_t') : (rt ?? 'int32_t');
          const tmp = `_math_${this.tempCount++}`;
          const opName = op === '+' ? 'add' : op === '-' ? 'sub' : 'mul';
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}${resultType} ${tmp};`);
          lines.push(`${I}if (${builtin}((${resultType})(${l}), (${resultType})(${r}), &${tmp})) { ${this._mathErrVar}.operation = "${opName}"; goto ${this._mathCatchLabel}; }`);
          return tmp;
        }
        throw this.error(`unguarded integer arithmetic in safe-math mode; wrap in try/catch or declare 'throws MathError'`, node);
      }
      const signedIntSet = new Set(['int8_t', 'int16_t', 'int32_t', 'int64_t']);
      const slt = this.inferType(node.left);
      const srt = this.inferType(node.right);
      if (signedIntSet.has(slt) && signedIntSet.has(srt)) {
        const typeRank = { 'int8_t': 0, 'int16_t': 1, 'int32_t': 2, 'int64_t': 3 };
        const resultType = typeRank[slt] >= typeRank[srt] ? slt : srt;
        const uType = resultType.replace('int', 'uint');
        return `(${resultType})((${uType})${l} ${op} (${uType})${r})`;
      }
    }
    if (node.op === '/' || node.op === '%') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      const isIntSafeMath = _isIntOperand(node.left, lt) && _isIntOperand(node.right, rt);
      const isIntDefault = intTypes.has(lt) || intTypes.has(rt) || (lt === undefined && rt === undefined);
      const hasSafeMath = this._strictRules?.has('safe-math');

      if (hasSafeMath && isIntSafeMath) {
        if (this._inMathTry) {
          const opName = op === '/' ? 'div' : 'mod';
          const I = ' '.repeat(this.indent * depth);
          const divTmp = `_math_${this.tempCount++}`;
          lines.push(`${I}int32_t ${divTmp} = ${r};`);
          lines.push(`${I}if (${divTmp} == 0) { ${this._mathErrVar}.operation = "${opName}"; goto ${this._mathCatchLabel}; }`);
          const minMap = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
          const minConst = minMap[lt];
          if (minConst) {
            lines.push(`${I}if (${divTmp} == -1 && ${l} == ${minConst}) { ${this._mathErrVar}.operation = "${opName}"; goto ${this._mathCatchLabel}; }`);
          }
          return `${l} ${op} ${divTmp}`;
        }
        throw this.error(`unguarded integer division in safe-math mode; wrap in try/catch or declare 'throws MathError'`, node);
      }
      if (isIntDefault && lines) {
        const I = ' '.repeat(this.indent * depth);
        const tmp = `_tsc_div_${this.tempCount++}`;
        const panicExpr = this._strictRules?.has('no-abort')
          ? '_tsc_on_panic("division by zero")'
          : 'abort()';
        lines.push(`${I}int32_t ${tmp} = ${r};`);
        lines.push(`${I}if (${tmp} == 0) { fprintf(stderr, "panic: division by zero\\n"); ${panicExpr}; }`);
        const minMap = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
        const minConst = minMap[lt];
        if (minConst) {
          const overflowPanic = this._strictRules?.has('no-abort')
            ? '_tsc_on_panic("integer overflow")'
            : 'abort()';
          lines.push(`${I}if (${tmp} == -1 && ${l} == ${minConst}) { fprintf(stderr, "panic: integer overflow\\n"); ${overflowPanic}; }`);
        }
        return `${l} ${op} ${tmp}`;
      }
    }
    return `${l} ${op} ${r}`;
  },

  _hasFloatVar(node: any) {
    if (!node) return false;
    if (node.kind === 'Literal') return false;
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      return sym?.ctype === 'double' || sym?.ctype === 'float';
    }
    if (node.kind === 'Binary') return this._hasFloatVar(node.left) || this._hasFloatVar(node.right);
    if (node.kind === 'Unary') return this._hasFloatVar(node.expr);
    const t = this.inferType(node);
    return t === 'double' || t === 'float';
  },

  isStringExpr(node: any) {
    if (node.kind === 'Literal' && (node.litType === 'string' || node.litType === 'char')) return true;
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      if (sym?.ctype === 'String' || sym?.ctype === 'String *') return true;
      if (sym?.ctype === 'tsc_unknown' && this._narrowedUnknownVars?.has(node.name)) {
        return this._narrowedUnknownVars.get(node.name) === 'String';
      }
      return false;
    }
    // Binary + whose left is a string → the result is also String
    if (node.kind === 'Binary' && node.op === '+') return this.isStringExpr(node.left);
    // Template literal, Call returning string, etc.
    if (node.kind === 'Call') return this.inferType(node) === 'String';
    return false;
  },

  _derefStringPtr(node: any, cexpr: any) {
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      if (sym?.ctype === 'String *') return `(*${cexpr})`;
    }
    return cexpr;
  },

  _flattenStringConcat(node: any) {
    if (node.kind === 'Binary' && node.op === '+' && this.isStringExpr(node.left)) {
      return [...this._flattenStringConcat(node.left), node.right];
    }
    return [node];
  },

  _stringConcatChain(operands: any, lines: any, depth: any) {
    const I = ' '.repeat(this.indent * depth);
    const parts: any[] = [];
    const temps: any[] = [];

    for (const operand of operands) {
      const c = this.exprToC(operand, lines, depth);
      const t = this.inferType(operand);

      let part;
      let needsTemp = false;

      if (t === 'String *') {
        part = this._derefStringPtr(operand, c);
      } else if (t === 'String') {
        part = this._derefStringPtr(operand, c);
        if (this._isHeapStringInit(operand)) needsTemp = true;
      } else {
        const etIdent = this.cTypeToIdent(t);
        part = `tsc_${etIdent}_to_string(${c})`;
        needsTemp = true;
      }

      if (needsTemp) {
        const tmp = `_tsc_cat_${this.tempCount++}`;
        lines.push(`${I}String ${tmp} = ${part};`);
        parts.push(tmp);
        temps.push(tmp);
      } else {
        parts.push(part);
      }
    }

    for (let i = temps.length - 1; i >= 0; i--) {
      this._pushPostStmtCleanup(`${I}tsc_string_release(${temps[i]});`);
    }

    if (parts.length <= 1) return parts[0] || 'STR_LIT("")';
    if (parts.length === 2) return `tsc_string_concat(${parts[0]}, ${parts[1]})`;
    return `tsc_string_concat_n((String[]){ ${parts.join(', ')} }, ${parts.length})`;
  },

  // ----------------------------------------------------------------
  // Unary
  // ----------------------------------------------------------------
  unaryToC(node: any, lines: any, depth: any) {
    this._checkNoBareThrows(node.expr);
    if (node.op === '&' || node.op === '*') {
      if (node.op === '*') {
        const sym = node.expr.kind === 'Ident' ? this.lookup(node.expr.name) : null;
        const ctype = sym?.ctype ?? this.inferType(node.expr);
        if (ctype?.startsWith('opt_ref_')) {
          const e = this.exprToC(node.expr, lines, depth);
          if (this._narrowedVars?.has(node.expr.name)) {
            return `*${e}`;
          }
          return `*${e}.value`;
        }
      }
      if (!this._inUnsafe) {
        throw this.error(`TypeError: Raw pointer operation outside unsafe block; wrap in 'unsafe { ... }'`, node);
      }
      const e = this.exprToC(node.expr, lines, depth);
      return node.op === '&' ? `&${e}` : `*${e}`;
    }
    const e = this.exprToC(node.expr, lines, depth);
    switch (node.op) {
      case '!':     return `!${e}`;
      case '+':
      case '-':
      case '~': {
        const et = this.inferType(node.expr);
        const NUMERIC = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','double','float','char','size_t','bool']);
        if (!NUMERIC.has(et)) {
          const tsName = (t: any) => t === 'String' ? 'string' : t === 'void *' ? 'null' : t;
          const label = node.op === '~' ? `bitwise op '~'` : `unary '${node.op}'`;
          throw this.error(`TypeError: ${label} not applicable to '${tsName(et)}'`, node);
        }
        if (node.op === '~') {
          if (this._hasFloatVar(node.expr)) return `(${et})(~((int32_t)(${e})))`;
          return `~${e}`;
        }
        return `${node.op}${e}`;
      }
      case '++pre': return `++${e}`;
      case '--pre': return `--${e}`;
      case '++post': return `${e}++`;
      case '--post': return `${e}--`;
      default: return `/* ${node.op} */${e}`;
    }
  },
};
