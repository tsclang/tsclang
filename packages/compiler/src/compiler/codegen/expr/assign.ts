import type { Assign, ClassMember, Binary } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
import { isDecimal, resolveDecimalBase } from '../types/decimal.js';
// assign.ts
  // Assignment
export function assignToC(ctx: CodeGenContext, node: Assign, lines: string[], depth: number): string | null {
    // Generator .next() assignment: r = g.next() → r = genFn_next(&g, args);
    if (node.right?.kind === 'Call' && node.right.callee?.kind === 'Member'
        && node.right.callee.prop === 'next') {
      const objName = (node.right.callee.object as { name?: string })?.name;
      const sym = objName ? ctx.lookup(objName) : null;
      if (sym?._isGenState) {
        const { callExpr } = ctx._genNextCall(sym, ctx.exprToC(node.right.callee.object, lines, depth));
        const leftC = ctx.exprToC(node.left, lines, depth);
        return `${leftC} ${node.op || '='} ${callExpr}`;
      }
    }
    // Prevent assignment to arr.length or arr.capacity
    if (node.left.kind === 'Member' && node.left.object.kind === 'Ident') {
      const arrSym = ctx.lookup(node.left.object.name);
      if (arrSym?.isArray) {
        if (node.left.prop === 'length') {
          throw ctx.error(`cannot assign to "length"; use "${node.left.object.name}.resize(n)" instead`, node);
        }
        if (node.left.prop === 'capacity') {
          throw ctx.error(`cannot assign to "capacity"; use "${node.left.object.name}.reallocate(n)" instead`, node);
        }
      }
      // Check readonly field write outside constructor
      const objSym = ctx.lookup(node.left.object.name);
      if (objSym?.ctype) {
        const classDef = ctx.classes.get(objSym.ctype);
        const field = classDef?.fields?.find((f) => f.name === (node.left as { prop: string }).prop);
        if (field?.modifiers?.includes('readonly')) {
          const thisSym = ctx.lookup('this') ?? ctx.lookup('self');
          const inCtor = ctx.currentFuncName === 'new' && thisSym?.ctype === objSym.ctype;
          if (!inCtor) {
            throw ctx.error(`cannot assign to readonly field "${node.left.prop}" outside the constructor`, node);
          }
        }
      }
      // Borrow check: cannot mutate field while an immutable borrow is active
      if ((objSym?._refBorrowCount || 0) > 0) {
        throw ctx.errorCode('E010', node, { name: node.left.object.name });
      }
      // Mut quarantine: cannot access field while a mutable borrow return is active
      if (objSym?._mutQuarantined) {
        throw ctx.errorCode('E011', node, { name: node.left.object.name });
      }
    }
    // Check readonly tuple assignment: t[n] = ...
    if (node.left.kind === 'Index' && node.left.object.kind === 'Ident') {
      const sym = ctx.lookup(node.left.object.name);
      const tupleDef = sym?.ctype ? ctx.classes.get(sym.ctype) : null;
      if (tupleDef?.readonly) throw ctx.error('cannot assign to readonly tuple element', node);
    }
    if (node.left.kind === 'Ident') {
      const sym = ctx.lookup(node.left.name);
      if (sym && sym.varKind === 'const') {
        throw ctx.errorCode('E001', node, { name: node.left.name }, {
          label: 'cannot assign to const',
        });
      }
      // String literal union: convert string literal to enum value
      if (sym && node.right?.kind === 'Literal' && node.right.litType === 'string') {
        const enumDef = ctx.classes.get(sym.ctype!);
        if (enumDef?.isStringLiteralUnion) {
          const val = node.right.value;
          if (!(enumDef.members as string[] | undefined)?.includes(val)) {
            throw ctx.errorCode('E114', node, { value: val, type: sym.ctype! });
          }
          const l = ctx.exprToC(node.left, lines, depth);
          return `${l} ${node.op} ${sym.ctype}_${val}`;
        }
      }
    }
    // Weak<T> assignment: w = new Weak<T>(src) → w = tsc_weak_create(src)
    if (node.left.kind === 'Ident' && node.op === '=') {
      const sym = ctx.lookup(node.left.name);
      if (sym?.isWeak && node.right?.kind === 'New' && node.right.name === 'Weak') {
        const argC = node.right.args?.[0] ? ctx.exprToC(node.right.args[0].expr ?? node.right.args[0], lines, depth) : 'NULL';
        return `${node.left.name} = tsc_weak_create(${argC})`;
      }
    }
    // unknown reassignment: drop old, pack new
    if (node.left.kind === 'Ident' && node.op === '=') {
      const sym = ctx.lookup(node.left.name);
      if (sym?.ctype === 'tsc_unknown') {
        ctx._ensureUnknownStruct();
        const rightCtype = ctx.inferType(node.right);
        const r = ctx.exprToC(node.right, lines, depth);
        const I = ' '.repeat(ctx.indent * depth);
        lines.push(`${I}tsc_unknown_drop(&${node.left.name});`);
        if (rightCtype === 'tsc_unknown') {
          lines.push(`${I}${node.left.name} = ${r};`);
        } else {
          const packer = ctx._unknownPackerFor(rightCtype);
          lines.push(`${I}${node.left.name} = ${packer}(${r});`);
        }
        return null;
      }
    }
    // null assignment: compile error for non-nullable, compound literal for opt_T
    if (node.op === '=' && node.right?.kind === 'Literal' && node.right.litType === 'null') {
      const leftSym = node.left.kind === 'Ident' ? ctx.lookup(node.left.name) : null;
      const leftCtype = leftSym?.ctype;
      if (leftCtype && !leftCtype.startsWith('opt_') && leftCtype !== 'void *' && leftCtype !== 'tsc_unknown' && !leftCtype.endsWith(' *')) {
        throw ctx.errorCode('E116', node);
      }
      if (leftCtype?.startsWith('opt_')) {
        if (leftSym) leftSym.optIsNull = true;
        let l;
        if (node.left.kind === 'Ident' && ctx._narrowedVars?.has(node.left.name)) {
          l = node.left.name;
        } else {
          l = ctx.exprToC(node.left, lines, depth);
        }
        return `${l} = (${leftCtype}){false, 0}`;
      }
    }
    // Narrowing LHS fix: use variable name directly for narrowed opt_ Ident
    let l;
    if (node.left.kind === 'Ident' && ctx._narrowedVars?.has(node.left.name)) {
      l = node.left.name;
    } else {
      l = ctx.exprToC(node.left, lines, depth);
    }
    // Type-directed literal emit: float field = 1.0 → 1.0f
    let r;
    if (node.right?.kind === 'Literal' && node.right.litType === 'number' && node.op === '=') {
      const leftType = ctx.inferType(node.left);
      if (leftType === 'float' || leftType === 'double') {
        r = ctx.literalToCTyped(node.right, leftType);
      }
    }
    if (r === undefined) {
      const _prevET_asn = ctx._expectedType;
      const _asnLt = ctx.inferType(node.left);
      ctx._expectedType = resolveDecimalBase(ctx, _asnLt);
      r = ctx.exprToC(node.right, lines, depth);
      ctx._expectedType = _prevET_asn;
    }

    // Move tracking for `b = a` where a is Ident of owned type (opt_ref_, heap ptr, or struct)
    if (node.op === '=' && node.left.kind === 'Ident' && node.right?.kind === 'Ident' && node.left.name !== node.right.name) {
      const rightSym = ctx.lookup(node.right.name);
      const leftSym = ctx.lookup(node.left.name);
      const rightCtype = rightSym?.ctype;
      if (rightCtype && rightCtype.startsWith('opt_ref_')) {
        if (rightSym._moved) {
          throw ctx.errorCode('E002', node.right, { name: node.right.name });
        }
        if (rightSym.varKind === 'const') {
          throw ctx.errorCode('E003');
        }
        rightSym._moved = true;
        rightSym._movedLine = node.line;
        rightSym._movedSourceNode = node.right;
        if (rightSym.varKind === 'let') {
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}${node.right.name} = (${rightCtype}){false, NULL, -1};`);
        }
      } else if (rightSym?._isHeap) {
        if (rightSym._moved) {
          throw ctx.errorCode('E002', node.right, { name: node.right.name });
        }
        if (rightSym.varKind === 'const') {
          throw ctx.errorCode('E003');
        }
        rightSym._moved = true;
        rightSym._movedLine = node.line;
        rightSym._movedSourceNode = node.right;
        if (rightSym.varKind === 'let') {
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}${node.right.name} = NULL;`);
        }
      }
    }

    // opt_T value/null assignment: wrap in compound literal
    if (node.op === '=' && node.left.kind === 'Ident') {
      const leftSym = ctx.lookup(node.left.name);
      const leftCtype = leftSym?.ctype;
      if (leftCtype?.startsWith('opt_') && !(node.right?.kind === 'Literal' && node.right.litType === 'null')) {
        const rightType = ctx.inferType(node.right);
        if (rightType !== leftCtype) {
          leftSym!.optIsNull = false;
          r = `(${leftCtype}){true, ${r}}`;
        }
      }
    }

    // Member assign of struct {0} → need (Type){0} compound literal for valid C
    if (node.left.kind === 'Member' && r === '{0}' && node.op === '=') {
      const leftType = ctx.inferType(node.left);
      if (leftType && leftType !== 'int32_t' && ctx.classes.has(leftType)) {
        r = `(${leftType}){0}`;
      }
    }

    // >>>= → x = (int32_t)((uint32_t)x >> r)
    if (node.op === '>>>=') {
      if (node.left.kind === 'Ident') return `${l} = (int32_t)((uint32_t)${l} >> ${r})`;
      const lt2 = ctx.inferType(node.left) ?? 'int32_t';
      const ptr = `_tsc_ptr_${ctx.tempCount++}`;
      const I = ' '.repeat(ctx.indent * depth);
      lines.push(`${I}{ ${lt2} *${ptr} = &(${l}); *${ptr} = (int32_t)((uint32_t)*${ptr} >> ${r}); }`);
      return null;
    }

    // **= → x = pow(x, r)
    if (node.op === '**=') {
      ctx.includes.add('#include <math.h>');
      if (node.left.kind === 'Ident') return `${l} = pow(${l}, ${r})`;
      const lt2 = ctx.inferType(node.left) ?? 'double';
      const ptr = `_tsc_ptr_${ctx.tempCount++}`;
      const I = ' '.repeat(ctx.indent * depth);
      lines.push(`${I}{ ${lt2} *${ptr} = &(${l}); *${ptr} = pow(*${ptr}, ${r}); }`);
      return null;
    }
    // ??= → if (!x.has_value) { x = (opt_T){true, rhs}; }
    if (node.op === '??=') {
      const sym = node.left.kind === 'Ident' ? ctx.lookup(node.left.name) : null;
      const optType = sym?.ctype;
      if (optType?.startsWith('opt_')) {
        if (sym) sym.optIsNull = false;
        if (node.left.kind === 'Ident') return `if (!${l}.has_value) { ${l} = (${optType}){true, ${r}}; }`;
        const ptr = `_tsc_ptr_${ctx.tempCount++}`;
        const I = ' '.repeat(ctx.indent * depth);
        lines.push(`${I}{ ${optType} *${ptr} = &(${l}); if (!(*${ptr}).has_value) { *${ptr} = (${optType}){true, ${r}}; } }`);
        return null;
      }
      return `${l} = ${l} ?? ${r}`;
    }
    // &&= / ||= → JS semantics with temp
    if (node.op === '&&=' || node.op === '||=') {
      const sym = node.left.kind === 'Ident' ? ctx.lookup(node.left.name) : null;
      const lt = sym?.ctype ?? 'int32_t';
      const tmp = `_tsc_lhs`;
      if (node.left.kind === 'Ident') {
        if (node.op === '&&=') {
          return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${r} : ${tmp}; }`;
        } else {
          return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${tmp} : ${r}; }`;
        }
      }
      const ptr = `_tsc_ptr_${ctx.tempCount++}`;
      const I = ' '.repeat(ctx.indent * depth);
      if (node.op === '&&=') {
        lines.push(`${I}{ ${lt} *${ptr} = &(${l}); ${lt} ${tmp} = *${ptr}; *${ptr} = (${tmp}) ? ${r} : ${tmp}; }`);
      } else {
        lines.push(`${I}{ ${lt} *${ptr} = &(${l}); ${lt} ${tmp} = *${ptr}; *${ptr} = (${tmp}) ? ${tmp} : ${r}; }`);
      }
      return null;
    }

    let leftType;
    if (node.left.kind === 'Ident' && ctx._narrowedVars?.has(node.left.name)) {
      const leftSym = ctx.lookup(node.left.name);
      leftType = leftSym?.ctype ?? 'int32_t';
    } else {
      leftType = ctx.inferType(node.left);
    }

    // += for string: s += "x" → eval concat first, release old, assign (ownership transfer)
    if (node.op === '+=' && leftType === 'String') {
      const I = ' '.repeat(ctx.indent * depth);
      if (node.left.kind === 'Ident') {
        lines.push(`${I}{ String _tsc_tmp = ${r}; tsc_string_release(${l}); ${l} = _tsc_tmp; }`);
      } else {
        const ptr = `_tsc_ptr_${ctx.tempCount++}`;
        lines.push(`${I}{ String *${ptr} = &(${l}); String _tsc_tmp = ${r}; tsc_string_release(*${ptr}); *${ptr} = _tsc_tmp; }`);
      }
      return null;
    }

    // String property/array assign: safe temp pattern to avoid a.p = a.p destroying before retain
    if (node.op === '=' && leftType === 'String' &&
        (node.left.kind === 'Member' || node.left.kind === 'Index')) {
      if (l === r) return null;
      const I = ' '.repeat(ctx.indent * depth);
      if (node.left.kind === 'Index') {
        const ptr = `_tsc_ptr_${ctx.tempCount++}`;
        lines.push(`${I}{ String *${ptr} = &(${l}); String _tsc_tmp = ${r}; tsc_string_retain(_tsc_tmp); tsc_string_release(*${ptr}); *${ptr} = _tsc_tmp; }`);
      } else {
        lines.push(`${I}{ String _tsc_tmp = ${r}; tsc_string_retain(_tsc_tmp); tsc_string_release(${l}); ${l} = _tsc_tmp; }`);
      }
      return null;
    }

    const intTypes = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','char','bool']);
    if (node.op === '+=' || node.op === '-=' || node.op === '*=') {
      const hasSafeMath = ctx._strictRules?.has('safe-math');
      if (hasSafeMath && intTypes.has(leftType)) {
        if (ctx._inMathTry) {
          const builtin = node.op === '+=' ? '__builtin_add_overflow'
                        : node.op === '-=' ? '__builtin_sub_overflow'
                        : '__builtin_mul_overflow';
          const opName = node.op[0] === '+' ? 'add' : node.op[0] === '-' ? 'sub' : 'mul';
          const tmp = `_math_${ctx.tempCount++}`;
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}${leftType} ${tmp};`);
          lines.push(`${I}if (${builtin}((${leftType})(${l}), (${leftType})(${r}), &${tmp})) { ${ctx._mathErrVar}.operation = "${opName}"; goto ${ctx._mathCatchLabel}; }`);
          return `${l} = ${tmp}`;
        }
        throw ctx.errorCode('E203', node, { detail: 'unguarded integer arithmetic in safe-math mode; wrap in try/catch or declare \'throws MathError\'' });
      }
    }
    if (node.op === '/=' || node.op === '%=') {
      const hasSafeMath = ctx._strictRules?.has('safe-math');
      if (hasSafeMath && intTypes.has(leftType)) {
        if (ctx._inMathTry) {
          const opName = node.op[0] === '/' ? 'div' : 'mod';
          const I = ' '.repeat(ctx.indent * depth);
          const divTmp = `_math_${ctx.tempCount++}`;
          lines.push(`${I}int32_t ${divTmp} = ${r};`);
          lines.push(`${I}if (${divTmp} == 0) { ${ctx._mathErrVar}.operation = "${opName}"; goto ${ctx._mathCatchLabel}; }`);
          const minMap = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
          const minConst = (minMap as Record<string, string>)[leftType];
          if (minConst) {
            lines.push(`${I}if (${divTmp} == -1 && ${l} == ${minConst}) { ${ctx._mathErrVar}.operation = "${opName}"; goto ${ctx._mathCatchLabel}; }`);
          }
          return `${l} ${node.op} ${divTmp}`;
        }
        throw ctx.errorCode('E203', node, { detail: 'unguarded integer division in safe-math mode; wrap in try/catch or declare \'throws MathError\'' });
      }
      if (intTypes.has(leftType) && lines) {
        const I = ' '.repeat(ctx.indent * depth);
        const tmp = `_tsc_div_${ctx.tempCount++}`;
        const divTag = ctx.panicTag('E401');
        const panicExpr = ctx._strictRules?.has('no-abort')
          ? `_tsc_on_panic("${divTag}")`
          : 'abort()';
        lines.push(`${I}int32_t ${tmp} = ${r};`);
        lines.push(`${I}if (${tmp} == 0) { fprintf(stderr, "panic${divTag}\\n"); ${panicExpr}; }`);
        const minMap = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
        const minConst = (minMap as Record<string, string>)[leftType];
        if (minConst) {
          const ovfTag = ctx.panicTag('E402');
          const overflowPanic = ctx._strictRules?.has('no-abort')
            ? `_tsc_on_panic("${ovfTag}")`
            : 'abort()';
          lines.push(`${I}if (${tmp} == -1 && ${l} == ${minConst}) { fprintf(stderr, "panic${ovfTag}\\n"); ${overflowPanic}; }`);
        }
        return `${l} ${node.op} ${tmp}`;
      }
    }

    const bitwiseAssignOps = ['&=', '|=', '^=', '<<=', '>>='];
    if (bitwiseAssignOps.includes(node.op)) {
      const leftType = ctx.inferType(node.left);
      const rightType = ctx.inferType(node.right);
      const NUMERIC = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','double','float','char','size_t','bool']);
      if (!NUMERIC.has(leftType) || !NUMERIC.has(rightType)) {
        const tsName = (t: string) => t === 'String' ? 'string' : t === 'void *' ? 'null' : t;
        throw ctx.errorCode('E105', node, { detail: `bitwise op '${node.op}' not applicable to '${tsName(leftType)}' and '${tsName(rightType)}'` });
      }
      const leftIsFloat = leftType === 'double' || leftType === 'float';
      const rightIsFloat = (rightType === 'double' || rightType === 'float') && ctx._hasFloatVar(node.right);
      if ((leftIsFloat || rightIsFloat) && lines) {
        const rawOp = node.op[0];
        return `${l} = (${leftType})(((int32_t)(${l})) ${rawOp} ((int32_t)(${r})))`;
      }
    }

    // Compound assignment widening check (#42)
    const compoundBinOps = { '+=':'+', '-=':'-', '*=':'*', '/=':'/', '%=':'%',
                             '&=':'&', '|=':'|', '^=':'^', '<<=':'<<', '>>=':'>>' };
    const binOp = (compoundBinOps as Record<string, string>)[node.op];
    if (binOp) {
      // Skip widening check for numeric literals — _expectedType handles scaling
      const isCompoundNumLit = (node.right?.kind === 'Literal' && node.right?.litType === 'number')
        || (node.right?.kind === 'Unary' && node.right?.op === '-'
          && node.right?.expr?.kind === 'Literal' && node.right?.expr?.litType === 'number');
      if (!isCompoundNumLit) {
        const binNode = { kind: 'Binary', op: binOp, left: node.left, right: node.right } as Binary;
        const resultType = ctx._effectiveType(binNode);
        const si = ctx._numericTypeInfo(resultType);
        const di = ctx._numericTypeInfo(leftType);
        if (si && di && !ctx._isSafeWidening(resultType, leftType)) {
          const srcTs = ctx.ctypeToTsName(resultType);
          const dstTs = ctx.ctypeToTsName(leftType);
          throw ctx.errorCode('E100', node, { detail: `cannot implicitly convert ${srcTs} to ${dstTs} in '${node.op}': use "as ${dstTs}" or explicit assignment` });
        }
      }
    }

    // Numeric type conversion check for simple assignment
    if (node.op === '=') {
      // Float literal with fractional part → integer type
      if (node.right?.kind === 'Literal' && node.right.litType === 'number') {
        const fval = parseFloat(node.right.value.replace(/_/g, ''));
        if (!Number.isInteger(fval)) {
          const di = ctx._numericTypeInfo(leftType);
          if (di && di.kind === 'int') {
            const dstTs = ctx.ctypeToTsName(leftType);
            throw ctx.errorCode('E100', node, { detail: `float literal ${node.right.value} assigned to integer type ${dstTs} — fractional part will be lost\nhint: use '${node.right.value} as ${dstTs}' for explicit truncation, or Math.trunc(${node.right.value})` });
          }
        }
      }
      // Safe widening check for non-literal expressions
      const isNumLit = (node.right?.kind === 'Literal' && node.right?.litType === 'number')
        || (node.right?.kind === 'Unary' && node.right?.op === '-'
          && node.right?.expr?.kind === 'Literal' && node.right?.expr?.litType === 'number');
      if (!isNumLit) {
        const rightType = ctx._effectiveType(node.right);
        const si = ctx._numericTypeInfo(rightType);
        const di = ctx._numericTypeInfo(leftType);
        if (si && di && !ctx._isSafeWidening(rightType, leftType)) {
          const srcTs = ctx.ctypeToTsName(rightType);
          const dstTs = ctx.ctypeToTsName(leftType);
          throw ctx.errorCode('E100', node, { detail: `cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"` });
        }
      }
    }

    // Decimal compound assignment: *=, /= need runtime helpers; +=, -=, %= need type check + zero guard
    const dLeftBase = resolveDecimalBase(ctx, leftType);
    if (dLeftBase && (node.op === '+=' || node.op === '-=' || node.op === '*=' || node.op === '/=' || node.op === '%=')) {
      const dRightBase = resolveDecimalBase(ctx, ctx.inferType(node.right));
      if (dRightBase && dRightBase !== dLeftBase) {
        throw ctx.errorCode('E100', node, { detail: `cannot mix ${ctx.ctypeToTsName(leftType)} and ${ctx.ctypeToTsName(ctx.inferType(node.right))} in arithmetic without explicit cast` });
      }
      if (node.op === '*=') {
        const helper = `tsc_mul_${dLeftBase.replace('_t', '')}`;
        return `${l} = ${helper}(${l}, ${r})`;
      }
      if (node.op === '/=' || node.op === '%=') {
        const I = ' '.repeat(ctx.indent * depth);
        const tmp = `_tsc_div_${ctx.tempCount++}`;
        const tag = ctx.panicTag('E401');
        const panicExpr = ctx._strictRules?.has('no-abort')
          ? `_tsc_on_panic("${tag}")`
          : 'abort()';
        lines.push(`${I}${dLeftBase} ${tmp} = ${r};`);
        lines.push(`${I}if (${tmp} == 0) { fprintf(stderr, "panic${tag}\\n"); ${panicExpr}; }`);
        if (node.op === '/=') {
          const helper = `tsc_div_${dLeftBase.replace('_t', '')}`;
          return `${l} = ${helper}(${l}, ${tmp})`;
        }
        return `${l} %= ${tmp}`;
      }
      // +=, -= fall through to raw integer ops (correct for same-scale decimals)
    }

    if (node.op === '+=' || node.op === '-=' || node.op === '*=') {
      const signedIntSet = new Set(['int8_t', 'int16_t', 'int32_t', 'int64_t']);
      if (signedIntSet.has(leftType)) {
        const uType = leftType.replace('int', 'uint');
        const baseOp = node.op[0];
        return `${l} = (${leftType})((${uType})${l} ${baseOp} (${uType})${r})`;
      }
    }

    return `${l} ${node.op} ${r}`;
}
