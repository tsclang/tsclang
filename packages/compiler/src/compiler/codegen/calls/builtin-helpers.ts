import type { Call, Argument, Expression, TypeAnn, TypeRef } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
export function mathCall(ctx: CodeGenContext, prop: string, args: Argument[], lines: string[], depth: number, node?: Call) {
    const a0t = args[0] ? ctx.inferType(args[0].expr) : 'int32_t';
    const a1t = args[1] ? ctx.inferType(args[1].expr) : 'int32_t';
    const isFloat = (t: string) => t === 'double' || t === 'float';
    const a0 = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
    const a1 = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
    const a2 = args[2] ? ctx.exprToC(args[2].expr, lines, depth) : '0';

    if (prop === 'PI')      { ctx.includes.add('#include <math.h>'); return 'M_PI'; }
    if (prop === 'E')       { ctx.includes.add('#include <math.h>'); return 'M_E'; }
    if (prop === 'LN2')     { ctx.includes.add('#include <math.h>'); return 'M_LN2'; }
    if (prop === 'LN10')    { ctx.includes.add('#include <math.h>'); return 'log(10.0)'; }
    if (prop === 'SQRT2')   { ctx.includes.add('#include <math.h>'); return 'M_SQRT2'; }
    if (prop === 'SQRT1_2') { ctx.includes.add('#include <math.h>'); return 'M_SQRT1_2'; }
    if (prop === 'LOG2E')   { ctx.includes.add('#include <math.h>'); return 'M_LOG2E'; }
    if (prop === 'LOG10E')  { ctx.includes.add('#include <math.h>'); return 'M_LOG10E'; }

    if (prop === 'abs') {
      ctx.includes.add('#include <math.h>');
      if (!isFloat(a0t)) return `(int)abs(${a0})`;
      return `fabs(${a0})`;
    }
    if (prop === 'min' || prop === 'max') {
      if (args.length === 0) {
        throw ctx.error(`Math.${prop}() requires at least 1 argument`);
      }
      const isMin = prop === 'min';
      const op = isMin ? '<' : '>';
      const hasSpread = args.some((a: Argument) => a.spread);
      if (hasSpread) {
        if (args.length > 1) {
          throw ctx.error(`Math.${prop}/max does not support mixed spread and non-spread arguments`);
        }
        const arrExpr = args[0].expr;
        const arrType = ctx.inferType(arrExpr);
        const NUMERIC_ET = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
          u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
          f32:'float', f64:'double', bool:'bool', usize:'size_t', isize:'intptr_t',
          char:'char' };
        const etIdent = arrType.startsWith('Array_') ? arrType.slice(6) : null;
        if (!etIdent || !(etIdent in NUMERIC_ET)) {
          throw ctx.error(`Math.${prop}(...arr) requires a numeric array, got ${etIdent || 'non-array'} elements`);
        }
        const etCType = (NUMERIC_ET as Record<string, string>)[etIdent];
        const arrC = ctx.exprToC(arrExpr, lines, depth);
        const I = ' '.repeat(ctx.indent * depth);
        const vname = `_${prop}_${ctx.tempCount++}`;
        const ivar = `_i_${ctx.tempCount++}`;
        ctx.includes.add('#include <stdio.h>');
        ctx.includes.add('#include <stdlib.h>');
        lines.push(`${I}if (${arrC}.length == 0) { fprintf(stderr, "Math.${prop}: empty array\\n"); exit(1); }`);
        lines.push(`${I}${etCType} ${vname} = ${arrC}.data[0];`);
        lines.push(`${I}for (size_t ${ivar} = 1; ${ivar} < ${arrC}.length; ${ivar}++) {`);
        lines.push(`${I}    if (${arrC}.data[${ivar}] ${op} ${vname}) ${vname} = ${arrC}.data[${ivar}];`);
        lines.push(`${I}}`);
        return vname;
      }
      const hasFloat = args.some((a: Argument) => isFloat(ctx.inferType(a.expr)));
      const allC = args.map((a: Argument) => ctx.exprToC(a.expr, lines, depth));
      const resType = hasFloat ? 'double' : a0t;
      if (args.length === 1) return allC[0];
      if (args.length === 2) {
        if (!hasFloat) return `(${allC[0]} ${op} ${allC[1]}) ? ${allC[0]} : ${allC[1]}`;
        ctx.includes.add('#include <math.h>');
        return `${isMin ? 'fmin' : 'fmax'}(${allC[0]}, ${allC[1]})`;
      }
      const vname = `_${prop}_${ctx.tempCount++}`;
      const I = ' '.repeat(ctx.indent * depth);
      lines.push(`${I}${resType} ${vname} = ${allC[0]};`);
      for (let i = 1; i < allC.length; i++) {
        lines.push(`${I}if (${allC[i]} ${op} ${vname}) ${vname} = ${allC[i]};`);
      }
      return vname;
    }
    if (prop === 'clamp') {
      if (!ctx._emittedTscClamp) {
        ctx._emittedTscClamp = true;
        ctx.addTop('static double tsc_clamp(double v, double lo, double hi) {');
        ctx.addTop('    return v < lo ? lo : (v > hi ? hi : v);');
        ctx.addTop('}');
        ctx.addTop('');
      }
      return `tsc_clamp(${a0}, ${a1}, ${a2})`;
    }
    if (prop === 'sign') {
      return `(${a0} > 0.0) - (${a0} < 0.0) + 0.0`;
    }

    // Math.saturatingCast<T>(x) — clamp to target type's range
    if (prop === 'saturatingCast') {
      const targetType = node?.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'int32_t';
      const srcType = a0t;
      const RANGE: Record<string, [string, string]> = {
        'int8_t':   ['INT8_MIN',   'INT8_MAX'],
        'int16_t':  ['INT16_MIN',  'INT16_MAX'],
        'int32_t':  ['INT32_MIN',  'INT32_MAX'],
        'int64_t':  ['INT64_MIN',  'INT64_MAX'],
        'uint8_t':  ['0',          'UINT8_MAX'],
        'uint16_t': ['0',          'UINT16_MAX'],
        'uint32_t': ['0',          'UINT32_MAX'],
        'uint64_t': ['0',          'UINT64_MAX'],
      };
      const range = RANGE[targetType];
      if (!range) throw ctx.error(`saturatingCast: unsupported target type '${targetType}'`, node);
      if (isFloat(srcType)) {
        return `(${a0} < (${range[0]})) ? (${targetType})(${range[0]}) : ((${a0} > (${range[1]})) ? (${targetType})(${range[1]}) : (${targetType})(${a0}))`;
      }
      return `(${a0} < (${range[0]})) ? (${targetType})(${range[0]}) : ((${a0} > (${range[1]})) ? (${targetType})(${range[1]}) : (${targetType})(${a0}))`;
    }

    // Math.checkedCast<T>(x) — return null if value doesn't fit target type
    if (prop === 'checkedCast') {
      const targetType = node?.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'int32_t';
      const srcType = a0t;
      const optName = `opt_${ctx.cTypeToIdent(targetType)}`;
      ctx._ensureOptStruct(optName, targetType);
      const RANGE: Record<string, [string, string]> = {
        'int8_t':   ['INT8_MIN',   'INT8_MAX'],
        'int16_t':  ['INT16_MIN',  'INT16_MAX'],
        'int32_t':  ['INT32_MIN',  'INT32_MAX'],
        'int64_t':  ['INT64_MIN',  'INT64_MAX'],
        'uint8_t':  ['0',          'UINT8_MAX'],
        'uint16_t': ['0',          'UINT16_MAX'],
        'uint32_t': ['0',          'UINT32_MAX'],
        'uint64_t': ['0',          'UINT64_MAX'],
      };
      const range = RANGE[targetType];
      if (!range) throw ctx.error(`checkedCast: unsupported target type '${targetType}'`, node);
      const I = ' '.repeat(ctx.indent * depth);
      const tmp = `_checked_${ctx.tempCount++}`;
      lines.push(`${I}${optName} ${tmp};`);
      lines.push(`${I}${tmp}.has_value = (${a0} >= (${range[0]}) && ${a0} <= (${range[1]}));`);
      lines.push(`${I}${tmp}.value = ${tmp}.has_value ? (${targetType})(${a0}) : (${targetType})0;`);
      return tmp;
    }

    ctx.includes.add('#include <math.h>');
    const map = {
      floor: `floor(${a0})`, ceil: `ceil(${a0})`,
      round: `round(${a0})`, trunc: `trunc(${a0})`,
      sqrt: `sqrt(${a0})`, cbrt: `cbrt(${a0})`, pow: `pow(${a0}, ${a1})`,
      hypot: `hypot(${a0}, ${a1})`,
      sin: `sin(${a0})`, cos: `cos(${a0})`, tan: `tan(${a0})`,
      asin: `asin(${a0})`, acos: `acos(${a0})`, atan: `atan(${a0})`,
      atan2: `atan2(${a0}, ${a1})`,
      sinh: `sinh(${a0})`, cosh: `cosh(${a0})`, tanh: `tanh(${a0})`,
      asinh: `asinh(${a0})`, acosh: `acosh(${a0})`, atanh: `atanh(${a0})`,
      log: `log(${a0})`, log2: `log2(${a0})`, log10: `log10(${a0})`,
      log1p: `log1p(${a0})`,
      exp: `exp(${a0})`, expm1: `expm1(${a0})`,
      clz32: `(int32_t)__builtin_clz((uint32_t)(${a0}))`,
      imul: `${a0t !== 'int32_t' ? `(int32_t)(${a0})` : a0} * ${a1t !== 'int32_t' ? `(int32_t)(${a1})` : a1}`,
      fround: `(float)(${a0})`,
      random: `tsc_math_random()`,
    };
    const result = (map as Record<string, string>)[prop];
    if (!result) throw ctx.error(`Unknown Math method 'Math.${prop}'`, node);
    return result;
}

export function jsonCall(ctx: CodeGenContext, prop: string, typeArgs: TypeAnn[], args: Argument[], lines: string[], depth: number, node?: Call) {
    if (prop === 'stringify') {
      const arg0 = args[0]?.expr;
      const a0 = arg0 ? ctx.exprToC(arg0, lines, depth) : 'STR_LIT("")';
      const t = arg0 ? ctx.inferType(arg0) : 'int32_t';
      if (t === 'String') return `tsc_json_stringify_string(${a0})`;
      if (t === 'bool')   return `(${a0}) ? STR_LIT("true") : STR_LIT("false")`;
      if (t === 'double' || t === 'float') return `tsc_f64_to_string(${a0})`;
      if (t === 'int64_t') return `tsc_i64_to_string(${a0})`;
      return `tsc_i32_to_string(${a0})`;
    }
    if (prop === 'parse') {
      const typeName = typeArgs[0]?.kind === 'TypeRef' ? (typeArgs[0] as TypeRef).name : 'i32';
      const a0 = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      if (typeName === 'f64' || typeName === 'f32') return `atof(${a0}.data)`;
      if (typeName === 'boolean') return `(${a0}.length == 4 && memcmp(${a0}.data, "true", 4) == 0)`;
      return `atoi(${a0}.data)`;
    }
    throw ctx.error(`Unknown JSON method 'JSON.${prop}'`, node);
}

  // NOTE: node stays `any` — generic recursive walk over arbitrary AST subtrees
  // with computed-kind property access (node.label) cannot be narrowed by TS.
export function labelUsed(ctx: CodeGenContext, node: unknown, label: string, kind: string) {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (n.kind === kind.charAt(0).toUpperCase() + kind.slice(1) && n.label === label) return true;
    if (n.kind === 'Labeled' && n.label === label) return false;
    for (const val of Object.values(n)) {
      if (Array.isArray(val)) {
        for (const item of val) { if (ctx.labelUsed(item, label, kind)) return true; }
      } else if (val && typeof val === 'object' && (val as Record<string, unknown>).kind) {
        if (ctx.labelUsed(val, label, kind)) return true;
      }
    }
    return false;
}

export function isBareLiteralNumber(ctx: CodeGenContext, expr: Expression): boolean {
    if (expr.kind === 'Literal' && expr.litType === 'number' &&
        expr.value !== 'NaN' && expr.value !== 'Infinity' &&
        !expr.value.includes('.') && !expr.value.includes('e') && !expr.value.includes('E') &&
        !expr.value.startsWith('0x') && !expr.value.startsWith('0b') && !expr.value.startsWith('0o') &&
        !expr.value.startsWith('0X') && !expr.value.startsWith('0B') && !expr.value.startsWith('0O')) {
      return true;
    }
    if (expr.kind === 'Unary' && expr.op === '-') return ctx.isBareLiteralNumber(expr.expr);
    return false;
}

export function bareNumberValue(ctx: CodeGenContext, expr: Expression): string {
    if (expr.kind === 'Literal') {
      return expr.value + '.0';
    }
    if (expr.kind === 'Unary' && expr.op === '-') {
      return '-' + ctx.bareNumberValue(expr.expr);
    }
    return '0.0';
}
