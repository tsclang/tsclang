// operators.js
export default {
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
};
