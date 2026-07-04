import type { Binary, Unary, Expression, TypeRef } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
// operators.ts
  // Emit a binary expression with operands widened to targetCtype to avoid overflow
export function binaryWidened(ctx: CodeGenContext, node: Binary, targetCtype: string, lines: string[], depth: number) {
    const widenOperand = (operand: Expression): string => {
      if (operand.kind === 'Literal' && operand.litType === 'number') {
        return ctx.literalToCTyped(operand, targetCtype);
      }
      const ot = ctx.inferType(operand);
      const needsCast = (targetCtype === 'int64_t' && (ot === 'uint32_t' || ot === 'size_t' || ot === 'int32_t'));
      const c = ctx.exprToC(operand, lines, depth);
      return needsCast ? `(${targetCtype})${c}` : c;
    };
    const lC = widenOperand(node.left);
    const rC = widenOperand(node.right);
    return `${lC} ${node.op} ${rC}`;
}

export function binaryToC(ctx: CodeGenContext, node: Binary, lines: string[], depth: number): string {
    ctx._checkNoBareThrows(node.left);
    ctx._checkNoBareThrows(node.right);
    // instanceof: obj instanceof TypeName
    if (node.op === 'instanceof') {
      const typeName = node.right.kind === 'Ident' ? node.right.name : null;
      if (!typeName) throw ctx.error(`TypeError: 'instanceof' right-hand side must be a type name`, node);
      const objSym2 = node.left.kind === 'Ident' ? ctx.lookup(node.left.name) : null;
      if (!ctx.interfaces.has(typeName)) {
        // Class on RHS: only valid when LHS is that same class (always-true compile-time check)
        if (ctx.classes.has(typeName) && objSym2?.ctype === typeName) return '1';
        // LHS is an interface fat-ptr and RHS is a concrete class: vtable compare
        if (ctx.classes.has(typeName) && objSym2?.ctype && ctx.interfaces.has(objSym2.ctype)) {
          const ifaceName = objSym2.ctype;
          const className = typeName;
          const classDef = ctx.classes.get(className);
          const hasExplicit = classDef?.implements_?.some((i: TypeRef | string) => (typeof i === 'string' ? i : i.name) === ifaceName);
          const vtableName = hasExplicit ? `${className}_${ifaceName}_vtable` : `_${className}_${ifaceName}_vtable`;
          if (!hasExplicit) ctx._ensureImplicitVtable(className, ifaceName);
          const objC2 = ctx.exprToC(node.left, lines, depth);
          return `${objC2}.vtable == &${vtableName}`;
        }
        throw ctx.error(`TypeError: 'instanceof' requires an interface type on the right-hand side, got '${typeName}'`, node);
      }
      // Interface instanceof: compare vtable pointer (obj must be concrete class)
      const objC = ctx.exprToC(node.left, lines, depth);
      if (objSym2?.ctype && ctx.classes.has(objSym2.ctype)) {
        const className = objSym2.ctype;
        const classDef = ctx.classes.get(className);
        const hasExplicit = classDef?.implements_?.some((i: TypeRef | string) => (typeof i === 'string' ? i : i.name) === typeName);
        const vtableName = hasExplicit ? `${className}_${typeName}_vtable` : `_${className}_${typeName}_vtable`;
        if (!hasExplicit) ctx._ensureImplicitVtable(className, typeName);
        return `${objC}.vtable == &${vtableName}`;
      }
      // Fallback
      return `${objC}.vtable != NULL`;
    }

    // Optional type comparisons: opt_T != null → opt.has_value, opt_T == null → !opt.has_value
    if (node.op === '!=' || node.op === '!==' || node.op === '==' || node.op === '===') {
      const isNull = (n: Expression) => n.kind === 'Literal' && n.litType === 'null';
      const optSide = isNull(node.right) ? node.left : isNull(node.left) ? node.right : null;
      if (optSide) {
        const optType = ctx.inferType(optSide);
        if (optType?.startsWith('opt_')) {
          const optC = ctx.exprToC(optSide, lines, depth);
          return (node.op === '!=' || node.op === '!==') ? `${optC}.has_value` : `!${optC}.has_value`;
        }
      }
    }

    // Pool opt_ref null check: p != null → p.has_value, p == null → !p.has_value
    if (node.op === '!=' || node.op === '!==' || node.op === '==' || node.op === '===') {
      const _isNullLit = (n: Expression) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
      const _nullSide = _isNullLit(node.right) ? 'right' : _isNullLit(node.left) ? 'left' : null;
      if (_nullSide) {
        const _other = _nullSide === 'right' ? node.left : node.right;
        const _otherSym = _other.kind === 'Ident' ? ctx.lookup(_other.name) : null;
        if (_otherSym?.ctype?.startsWith('opt_ref_') && ctx.classes.get(_otherSym.ctype.slice(8))?._isPool) {
          const _vc = ctx.exprToC(_other, lines, depth);
          return (node.op === '!=' || node.op === '!==') ? `${_vc}.has_value` : `!${_vc}.has_value`;
        }
      }
    }

    // Nullish coalescing for optional types: opt_T ?? default → opt.has_value ? opt.value : default
    if (node.op === '??') {
      const leftType = ctx.inferType(node.left);
      if (leftType?.startsWith('opt_')) {
        let lC = ctx.exprToC(node.left, lines, depth);
        // Error: || mixed with ?? requires parens
        if (node.right?.kind === 'Binary' && (node.right.op === '||' || node.right.op === '??')) {
          throw ctx.error(`"||" and "??" require parentheses when mixed`, node);
        }
        if (!['Ident', 'Literal'].includes(node.left.kind)) {
          const tmp = `_tsc_opt_${ctx.tempCount++}`;
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}${leftType} ${tmp} = ${lC};`);
          lC = tmp;
        }
        const rC = ctx.exprToC(node.right, lines, depth);
        return `${lC}.has_value ? ${lC}.value : ${rC}`;
      }
    }

    // Error: || and ?? mixed without parens
    if (node.op === '||') {
      if (node.right?.kind === 'Binary' && node.right.op === '??') {
        throw ctx.error(`"||" and "??" require parentheses when mixed`, node);
      }
    }

    // ** uses pow() from math.h
    if (node.op === '**') {
      ctx.includes.add('#include <math.h>');
      const lC = ctx.exprToC(node.left, lines, depth);
      const rC = ctx.exprToC(node.right, lines, depth);
      const lLit = node.left.kind === 'Literal' && !node.left.value.includes('.');
      const rLit = node.right.kind === 'Literal' && !node.right.value.includes('.');
      return `pow(${lLit ? lC + '.0' : lC}, ${rLit ? rC + '.0' : rC})`;
    }

    // && / || with non-bool operands: JS operand-return semantics (returns the operand, not 0/1)
    if (node.op === '&&' || node.op === '||') {
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      if (lt !== 'bool' && rt !== 'bool') {
        const tmp = `_tsc_lhs_${ctx.tempCount++}`;
        const lC = ctx.exprToC(node.left, lines, depth);
        const I = ' '.repeat(ctx.indent * depth);
        lines.push(`${I}${lt} ${tmp} = ${lC};`);
        const rC = ctx.exprToC(node.right, lines, depth);
        if (node.op === '&&') return `(${tmp}) ? ${rC} : ${tmp}`;
        else                  return `(${tmp}) ? ${tmp} : ${rC}`;
      }
    }

    // Wrap sub-expressions in parens when needed for precedence
    const needsParens = (child: Expression, parentOp: string, isRight: boolean) => {
      if (child.kind !== 'Binary') return child.kind === 'Assign';
      const prec: Record<string, number> = { '**':13, '*':12, '/':12, '%':12, '+':11, '-':11,
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
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      const mixedPairs = [
        ['int8_t','uint8_t'],   ['uint8_t','int8_t'],
        ['int16_t','uint16_t'], ['uint16_t','int16_t'],
        ['int32_t','uint32_t'], ['uint32_t','int32_t'],
        ['int64_t','uint64_t'], ['uint64_t','int64_t'],
      ];
      for (const [a, b] of mixedPairs) {
        if (lt === a && rt === b) {
          // Only error if either operand is a let/var variable (not const/literal)
          const leftIsLet  = node.left.kind  === 'Ident' && ctx.lookup(node.left.name)?.varKind  === 'let';
          const rightIsLet = node.right.kind === 'Ident' && ctx.lookup(node.right.name)?.varKind === 'let';
          if (leftIsLet || rightIsLet) {
            const [tsA, tsB] = [a,b].map((t: string) => ctx.ctypeToTsName(t));
            const widthA = a.match(/\d+/)?.[0];
            const widthB = b.match(/\d+/)?.[0];
            const reason = widthA === widthB
              ? `cannot mix ${tsA} and ${tsB}: signed/unsigned mismatch, use "as" to specify type`
              : `cannot add ${tsA} and ${tsB}: no implicit widening for let variables, use "as"`;
            throw ctx.error(reason, node);
          }
        }
      }
    }

    // String concat chain (3+ operands): flatten and use tsc_string_concat_n
    // to avoid leaking intermediate heap-allocated String temporaries.
    // Must intercept before l/r computation to prevent duplicate exprToC calls.
    if (node.op === '+' && ctx.isStringExpr(node.left)) {
      const operands = ctx._flattenStringConcat(node);
      if (operands.length >= 3) {
        return ctx._stringConcatChain(operands, lines, depth);
      }
    }

    // Error: binary operations on unknown type (must narrow first via typeof)
    const _allBinaryOps = ['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>'];
    if (_allBinaryOps.includes(node.op)) {
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      if (lt === 'tsc_unknown') throw ctx.error(`Cannot perform binary operation '${node.op}' on type 'unknown'`, node);
      if (rt === 'tsc_unknown') throw ctx.error(`Cannot perform binary operation '${node.op}' on type 'unknown'`, node);
    }

    // typeof x === "typename" runtime check for unknown variables
    if ((node.op === '===' || node.op === '!==') && node.left.kind === 'Typeof') {
      const inner = node.left.expr;
      if (inner.kind === 'Ident') {
        const sym = ctx.lookup(inner.name);
        if (sym?.ctype === 'tsc_unknown') {
          ctx._ensureUnknownStruct();
          if (node.right.kind === 'Literal' && node.right.litType === 'string') {
            const tid = ctx._tsNameToTypeId(node.right.value);
            const cOp = node.op === '===' ? '==' : '!=';
            return `${inner.name}.type_id ${cOp} ${tid}`;
          }
        }
      }
    }
    if ((node.op === '===' || node.op === '!==') && node.right.kind === 'Typeof') {
      const inner = node.right.expr;
      if (inner.kind === 'Ident') {
        const sym = ctx.lookup(inner.name);
        if (sym?.ctype === 'tsc_unknown') {
          ctx._ensureUnknownStruct();
          if (node.left.kind === 'Literal' && node.left.litType === 'string') {
            const tid = ctx._tsNameToTypeId(node.left.value);
            const cOp = node.op === '===' ? '==' : '!=';
            return `${inner.name}.type_id ${cOp} ${tid}`;
          }
        }
      }
    }

    const lRaw = ctx.exprToC(node.left,  lines, depth);
    const rRaw = ctx.exprToC(node.right, lines, depth);
    const l = needsParens(node.left,  node.op, false) ? `(${lRaw})` : lRaw;
    const r = needsParens(node.right, node.op, true)  ? `(${rRaw})` : rRaw;
    const opMap: Record<string, string> = {
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
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      const NUMERIC = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','double','float','char','size_t','bool']);
      if (!NUMERIC.has(lt) || !NUMERIC.has(rt)) {
        const tsName = (t: string) => t === 'String' ? 'string' : t === 'void *' ? 'null' : t;
        throw ctx.error(`TypeError: bitwise op '${node.op}' not applicable to '${tsName(lt)}' and '${tsName(rt)}'`, node);
      }
      const needsCast = ctx._hasFloatVar(node.left) || ctx._hasFloatVar(node.right);
      if (needsCast) {
        const lft = ctx._hasFloatVar(node.left) ? ctx.inferType(node.left) : ctx.inferType(node.right);
        return `(${lft})(((int32_t)(${l})) ${op} ((int32_t)(${r})))`;
      }
      return `${l} ${op} ${r}`;
    }

    // String equality: use tsc_string_eq
    if ((node.op === '==' || node.op === '===' || node.op === '!=' || node.op === '!==') &&
        ctx.isStringExpr(node.left)) {
      const ld = ctx._derefStringPtr(node.left, l);
      const rd = ctx._derefStringPtr(node.right, r);
      const eq = `tsc_string_eq(${ld}, ${rd})`;
      return (node.op === '!=' || node.op === '!==') ? `!${eq}` : eq;
    }
    // String concat via +
    if (node.op === '+' && ctx.isStringExpr(node.left)) {
      const ld = ctx._derefStringPtr(node.left, l);
      const rType = ctx.inferType(node.right);
      let rC = ctx._derefStringPtr(node.right, r);
      if (rType !== 'String' && rType !== 'String *') {
        const etIdent = ctx.cTypeToIdent(rType);
        const I = ' '.repeat(ctx.indent * depth);
        const tmp = `_tsc_cat_${ctx.tempCount++}`;
        lines.push(`${I}String ${tmp} = tsc_${etIdent}_to_string(${r});`);
        ctx._pushPostStmtCleanup(`${I}tsc_string_release(${tmp});`);
        rC = tmp;
      }
      return `tsc_string_concat(${ld}, ${rC})`;
    }
    if (node.op === '%') {
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      if (lt === 'double' || rt === 'double') return `fmod(${l}, ${r})`;
    }
    const intTypes = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','char','bool']);
    // Decimal fixed-point arithmetic: *, / need runtime helpers; +, -, % are plain integer ops
    const DECIMAL_CTYPES = new Set(['d8_t', 'd16_t', 'd32_t', 'd64_t']);
    if (arithOps.includes(node.op)) {
      const dlt = ctx.inferType(node.left);
      const drt = ctx.inferType(node.right);
      if (DECIMAL_CTYPES.has(dlt) || DECIMAL_CTYPES.has(drt)) {
        if (dlt !== drt) {
          const tsA = ctx.ctypeToTsName(dlt);
          const tsB = ctx.ctypeToTsName(drt);
          throw ctx.error(`TypeError: cannot mix ${tsA} and ${tsB} in arithmetic without explicit cast`, node);
        }
        if (node.op === '*') {
          const helper = `tsc_mul_${dlt.replace('_t', '')}`;
          return `${helper}(${l}, ${r})`;
        }
        if (node.op === '/' || node.op === '%') {
          const I = ' '.repeat(ctx.indent * depth);
          const tmp = `_tsc_div_${ctx.tempCount++}`;
          const panicExpr = ctx._strictRules?.has('no-abort')
            ? '_tsc_on_panic("division by zero")'
            : 'abort()';
          lines.push(`${I}${drt} ${tmp} = ${r};`);
          lines.push(`${I}if (${tmp} == 0) { fprintf(stderr, "panic: division by zero\\n"); ${panicExpr}; }`);
          if (node.op === '/') {
            const helper = `tsc_div_${dlt.replace('_t', '')}`;
            return `${helper}(${l}, ${tmp})`;
          }
          return `${l} % ${tmp}`;
        }
        return `${l} ${op} ${r}`;
      }
    }
    // Decimal comparison check: reject mixed decimal types (different scales = wrong results)
    const cmpOps = new Set(['<', '>', '<=', '>=', '==', '!=', '===', '!==']);
    if (cmpOps.has(node.op)) {
      const dlt = ctx.inferType(node.left);
      const drt = ctx.inferType(node.right);
      if (DECIMAL_CTYPES.has(dlt) || DECIMAL_CTYPES.has(drt)) {
        if (dlt !== drt) {
          const tsA = ctx.ctypeToTsName(dlt);
          const tsB = ctx.ctypeToTsName(drt);
          throw ctx.error(`TypeError: cannot compare ${tsA} and ${tsB} without explicit cast`, node);
        }
      }
    }
    const _isIntOperand = (n: Expression, t: string) => {
      if (intTypes.has(t)) return true;
      if (t === undefined) return true;
      if (t === 'double' || t === 'float') {
        if (n?.kind === 'Literal' && n?.litType === 'number') return Number.isInteger(parseFloat(n.value));
        if (n?.kind === 'Unary' && n?.op === '-' && n?.expr?.kind === 'Literal' && n?.expr?.litType === 'number') return Number.isInteger(parseFloat(n.expr.value));
      }
      return false;
    };
    if (node.op === '+' || node.op === '-' || node.op === '*') {
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      const isInt = _isIntOperand(node.left, lt) && _isIntOperand(node.right, rt);
      const hasSafeMath = ctx._strictRules?.has('safe-math');

      if (hasSafeMath && isInt) {
        if (ctx._inMathTry) {
          const builtin = op === '+' ? '__builtin_add_overflow'
                        : op === '-' ? '__builtin_sub_overflow'
                        : '__builtin_mul_overflow';
          const typeRank: Record<string, number> = { 'int8_t': 0, 'int16_t': 1, 'int32_t': 2, 'int64_t': 3 };
          const resultType = (typeRank[lt] ?? 2) >= (typeRank[rt] ?? 2) ? (lt ?? 'int32_t') : (rt ?? 'int32_t');
          const tmp = `_math_${ctx.tempCount++}`;
          const opName = op === '+' ? 'add' : op === '-' ? 'sub' : 'mul';
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}${resultType} ${tmp};`);
          lines.push(`${I}if (${builtin}((${resultType})(${l}), (${resultType})(${r}), &${tmp})) { ${ctx._mathErrVar}.operation = "${opName}"; goto ${ctx._mathCatchLabel}; }`);
          return tmp;
        }
        throw ctx.error(`unguarded integer arithmetic in safe-math mode; wrap in try/catch or declare 'throws MathError'`, node);
      }
      const signedIntSet = new Set(['int8_t', 'int16_t', 'int32_t', 'int64_t']);
      const slt = ctx.inferType(node.left);
      const srt = ctx.inferType(node.right);
      if (signedIntSet.has(slt) && signedIntSet.has(srt)) {
        const typeRank: Record<string, number> = { 'int8_t': 0, 'int16_t': 1, 'int32_t': 2, 'int64_t': 3 };
        const resultType = typeRank[slt] >= typeRank[srt] ? slt : srt;
        const uType = resultType.replace('int', 'uint');
        return `(${resultType})((${uType})${l} ${op} (${uType})${r})`;
      }
      // i64 + u32: widen u32 → i64 (safe per C §6.3.1.8: i64 represents all u32 values)
      if ((slt === 'int64_t' && srt === 'uint32_t') || (slt === 'uint32_t' && srt === 'int64_t')) {
        const lCast = slt === 'uint32_t' ? `(int64_t)(${l})` : l;
        const rCast = srt === 'uint32_t' ? `(int64_t)(${r})` : r;
        return `(int64_t)((uint64_t)${lCast} ${op} (uint64_t)${rCast})`;
      }
    }
    if (node.op === '/' || node.op === '%') {
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      const isIntSafeMath = _isIntOperand(node.left, lt) && _isIntOperand(node.right, rt);
      const isIntDefault = intTypes.has(lt) || intTypes.has(rt) || (lt === undefined && rt === undefined);
      const hasSafeMath = ctx._strictRules?.has('safe-math');

      if (hasSafeMath && isIntSafeMath) {
        if (ctx._inMathTry) {
          const opName = op === '/' ? 'div' : 'mod';
          const I = ' '.repeat(ctx.indent * depth);
          const divTmp = `_math_${ctx.tempCount++}`;
          lines.push(`${I}int32_t ${divTmp} = ${r};`);
          lines.push(`${I}if (${divTmp} == 0) { ${ctx._mathErrVar}.operation = "${opName}"; goto ${ctx._mathCatchLabel}; }`);
          const minMap: Record<string, string> = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
          const minConst = minMap[lt];
          if (minConst) {
            lines.push(`${I}if (${divTmp} == -1 && ${l} == ${minConst}) { ${ctx._mathErrVar}.operation = "${opName}"; goto ${ctx._mathCatchLabel}; }`);
          }
          return `${l} ${op} ${divTmp}`;
        }
        throw ctx.error(`unguarded integer division in safe-math mode; wrap in try/catch or declare 'throws MathError'`, node);
      }
      if (isIntDefault && lines) {
        const I = ' '.repeat(ctx.indent * depth);
        const tmp = `_tsc_div_${ctx.tempCount++}`;
        const panicExpr = ctx._strictRules?.has('no-abort')
          ? '_tsc_on_panic("division by zero")'
          : 'abort()';
        lines.push(`${I}int32_t ${tmp} = ${r};`);
        lines.push(`${I}if (${tmp} == 0) { fprintf(stderr, "panic: division by zero\\n"); ${panicExpr}; }`);
        const minMap: Record<string, string> = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
        const minConst = minMap[lt];
        if (minConst) {
          const overflowPanic = ctx._strictRules?.has('no-abort')
            ? '_tsc_on_panic("integer overflow")'
            : 'abort()';
          lines.push(`${I}if (${tmp} == -1 && ${l} == ${minConst}) { fprintf(stderr, "panic: integer overflow\\n"); ${overflowPanic}; }`);
        }
        return `${l} ${op} ${tmp}`;
      }
    }
    return `${l} ${op} ${r}`;
}

export function _hasFloatVar(ctx: CodeGenContext, node: Expression): boolean {
    if (!node) return false;
    if (node.kind === 'Literal') return false;
    if (node.kind === 'Ident') {
      const sym = ctx.lookup(node.name);
      return sym?.ctype === 'double' || sym?.ctype === 'float';
    }
    if (node.kind === 'Binary') return ctx._hasFloatVar(node.left) || ctx._hasFloatVar(node.right);
    if (node.kind === 'Unary') return ctx._hasFloatVar(node.expr);
    const t = ctx.inferType(node);
    return t === 'double' || t === 'float';
}

export function isStringExpr(ctx: CodeGenContext, node: Expression): boolean {
    if (node.kind === 'Literal' && (node.litType === 'string' || node.litType === 'char')) return true;
    if (node.kind === 'Ident') {
      const sym = ctx.lookup(node.name);
      if (sym?.ctype === 'String' || sym?.ctype === 'String *') return true;
      if (sym?.ctype === 'tsc_unknown' && ctx._narrowedUnknownVars?.has(node.name)) {
        return ctx._narrowedUnknownVars.get(node.name) === 'String';
      }
      return false;
    }
    // Binary + whose left is a string → the result is also String
    if (node.kind === 'Binary' && node.op === '+') return ctx.isStringExpr(node.left);
    // Template literal, Call returning string, etc.
    if (node.kind === 'Call') return ctx.inferType(node) === 'String';
    return false;
}

export function _derefStringPtr(ctx: CodeGenContext, node: Expression, cexpr: string) {
    if (node.kind === 'Ident') {
      const sym = ctx.lookup(node.name);
      if (sym?.ctype === 'String *') return `(*${cexpr})`;
    }
    return cexpr;
}

export function _flattenStringConcat(ctx: CodeGenContext, node: Expression): Expression[] {
    if (node.kind === 'Binary' && node.op === '+' && ctx.isStringExpr(node.left)) {
      return [...ctx._flattenStringConcat(node.left), node.right];
    }
    return [node];
}

export function _stringConcatChain(ctx: CodeGenContext, operands: Expression[], lines: string[], depth: number) {
    const I = ' '.repeat(ctx.indent * depth);
    const parts: string[] = [];
    const temps: string[] = [];

    for (const operand of operands) {
      const c = ctx.exprToC(operand, lines, depth);
      const t = ctx.inferType(operand);

      let part;
      let needsTemp = false;

      if (t === 'String *') {
        part = ctx._derefStringPtr(operand, c);
      } else if (t === 'String') {
        part = ctx._derefStringPtr(operand, c);
        if (ctx._isHeapStringInit(operand)) needsTemp = true;
      } else {
        const etIdent = ctx.cTypeToIdent(t);
        part = `tsc_${etIdent}_to_string(${c})`;
        needsTemp = true;
      }

      if (needsTemp) {
        const tmp = `_tsc_cat_${ctx.tempCount++}`;
        lines.push(`${I}String ${tmp} = ${part};`);
        parts.push(tmp);
        temps.push(tmp);
      } else {
        parts.push(part);
      }
    }

    for (let i = temps.length - 1; i >= 0; i--) {
      ctx._pushPostStmtCleanup(`${I}tsc_string_release(${temps[i]});`);
    }

    if (parts.length <= 1) return parts[0] || 'STR_LIT("")';
    if (parts.length === 2) return `tsc_string_concat(${parts[0]}, ${parts[1]})`;
    return `tsc_string_concat_n((String[]){ ${parts.join(', ')} }, ${parts.length})`;
}

  // ----------------------------------------------------------------
  // Unary
  // ----------------------------------------------------------------
export function unaryToC(ctx: CodeGenContext, node: Unary, lines: string[], depth: number): string {
    ctx._checkNoBareThrows(node.expr);
    if (node.op === '&' || node.op === '*') {
      if (node.op === '*') {
        const sym = node.expr.kind === 'Ident' ? ctx.lookup(node.expr.name) : null;
        const ctype = sym?.ctype ?? ctx.inferType(node.expr);
        if (ctype?.startsWith('opt_ref_')) {
          const e = ctx.exprToC(node.expr, lines, depth);
          if (node.expr.kind === 'Ident' && ctx._narrowedVars?.has(node.expr.name)) {
            return `*${e}`;
          }
          return `*${e}.value`;
        }
      }
      if (!ctx._inUnsafe) {
        throw ctx.error(`TypeError: Raw pointer operation outside unsafe block; wrap in 'unsafe { ... }'`, node);
      }
      const e = ctx.exprToC(node.expr, lines, depth);
      return node.op === '&' ? `&${e}` : `*${e}`;
    }
    const e = ctx.exprToC(node.expr, lines, depth);
    switch (node.op) {
      case '!':     return `!${e}`;
      case '+':
      case '-':
      case '~': {
        const et = ctx.inferType(node.expr);
        const NUMERIC = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','double','float','char','size_t','bool']);
        if (!NUMERIC.has(et)) {
          const tsName = (t: string) => t === 'String' ? 'string' : t === 'void *' ? 'null' : t;
          const label = node.op === '~' ? `bitwise op '~'` : `unary '${node.op}'`;
          throw ctx.error(`TypeError: ${label} not applicable to '${tsName(et)}'`, node);
        }
        if (node.op === '~') {
          if (ctx._hasFloatVar(node.expr)) return `(${et})(~((int32_t)(${e})))`;
          return `~${e}`;
        }
        return `${node.op}${e}`;
      }
      case '++pre': return `++${e}`;
      case '--pre': return `--${e}`;
      case '++post': return `${e}++`;
      case '--post': return `${e}--`;
      default: throw ctx.error(`internal: unhandled unary operator '${node.op}'`, node);
    }
}
