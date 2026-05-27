export default {
  mathCall(prop, args, lines, depth) {
    const a0t = args[0] ? this.inferType(args[0].expr) : 'int32_t';
    const a1t = args[1] ? this.inferType(args[1].expr) : 'int32_t';
    const isFloat = (t) => t === 'double' || t === 'float';
    const a0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
    const a1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
    const a2 = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';

    if (prop === 'PI')      { this.includes.add('#include <math.h>'); return 'M_PI'; }
    if (prop === 'E')       { this.includes.add('#include <math.h>'); return 'M_E'; }
    if (prop === 'LN2')     { this.includes.add('#include <math.h>'); return 'M_LN2'; }
    if (prop === 'LN10')    { this.includes.add('#include <math.h>'); return 'log(10.0)'; }
    if (prop === 'SQRT2')   { this.includes.add('#include <math.h>'); return 'M_SQRT2'; }
    if (prop === 'SQRT1_2') { this.includes.add('#include <math.h>'); return 'M_SQRT1_2'; }
    if (prop === 'LOG2E')   { this.includes.add('#include <math.h>'); return 'M_LOG2E'; }
    if (prop === 'LOG10E')  { this.includes.add('#include <math.h>'); return 'M_LOG10E'; }

    if (prop === 'abs') {
      this.includes.add('#include <math.h>');
      if (!isFloat(a0t)) return `(int)abs(${a0})`;
      return `fabs(${a0})`;
    }
    if (prop === 'min' || prop === 'max') {
      if (args.length === 0) {
        throw this.error(`Math.${prop}() requires at least 1 argument`);
      }
      const isMin = prop === 'min';
      const op = isMin ? '<' : '>';
      const hasSpread = args.some(a => a.spread);
      if (hasSpread) {
        if (args.length > 1) {
          throw this.error(`Math.${prop}/max does not support mixed spread and non-spread arguments`);
        }
        const arrExpr = args[0].expr;
        const arrType = this.inferType(arrExpr);
        const NUMERIC_ET = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
          u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
          f32:'float', f64:'double', bool:'bool', usize:'size_t', isize:'intptr_t',
          char:'char' };
        const etIdent = arrType.startsWith('Array_') ? arrType.slice(6) : null;
        if (!etIdent || !(etIdent in NUMERIC_ET)) {
          throw this.error(`Math.${prop}(...arr) requires a numeric array, got ${etIdent || 'non-array'} elements`);
        }
        const etCType = NUMERIC_ET[etIdent];
        const arrC = this.exprToC(arrExpr, lines, depth);
        const I = ' '.repeat(this.indent * depth);
        const vname = `_${prop}_${this.tempCount++}`;
        const ivar = `_i_${this.tempCount++}`;
        this.includes.add('#include <stdio.h>');
        this.includes.add('#include <stdlib.h>');
        lines.push(`${I}if (${arrC}.length == 0) { fprintf(stderr, "Math.${prop}: empty array\\n"); exit(1); }`);
        lines.push(`${I}${etCType} ${vname} = ${arrC}.data[0];`);
        lines.push(`${I}for (size_t ${ivar} = 1; ${ivar} < ${arrC}.length; ${ivar}++) {`);
        lines.push(`${I}    if (${arrC}.data[${ivar}] ${op} ${vname}) ${vname} = ${arrC}.data[${ivar}];`);
        lines.push(`${I}}`);
        return vname;
      }
      const hasFloat = args.some(a => isFloat(this.inferType(a.expr)));
      const allC = args.map(a => this.exprToC(a.expr, lines, depth));
      const resType = hasFloat ? 'double' : a0t;
      if (args.length === 1) return allC[0];
      if (args.length === 2) {
        if (!hasFloat) return `(${allC[0]} ${op} ${allC[1]}) ? ${allC[0]} : ${allC[1]}`;
        this.includes.add('#include <math.h>');
        return `${isMin ? 'fmin' : 'fmax'}(${allC[0]}, ${allC[1]})`;
      }
      const vname = `_${prop}_${this.tempCount++}`;
      const I = ' '.repeat(this.indent * depth);
      lines.push(`${I}${resType} ${vname} = ${allC[0]};`);
      for (let i = 1; i < allC.length; i++) {
        lines.push(`${I}if (${allC[i]} ${op} ${vname}) ${vname} = ${allC[i]};`);
      }
      return vname;
    }
    if (prop === 'clamp') {
      if (!this._emittedTscClamp) {
        this._emittedTscClamp = true;
        this.addTop('static double tsc_clamp(double v, double lo, double hi) {');
        this.addTop('    return v < lo ? lo : (v > hi ? hi : v);');
        this.addTop('}');
        this.addTop('');
      }
      return `tsc_clamp(${a0}, ${a1}, ${a2})`;
    }
    if (prop === 'sign') {
      return `(${a0} > 0.0) - (${a0} < 0.0) + 0.0`;
    }

    this.includes.add('#include <math.h>');
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
    return map[prop] ?? `/* Math.${prop} */(${a0})`;
  },

  jsonCall(prop, typeArgs, args, lines, depth) {
    if (prop === 'stringify') {
      const arg0 = args[0]?.expr;
      const a0 = arg0 ? this.exprToC(arg0, lines, depth) : 'STR_LIT("")';
      const t = arg0 ? this.inferType(arg0) : 'int32_t';
      if (t === 'String') return `tsc_json_stringify_string(${a0})`;
      if (t === 'bool')   return `(${a0}) ? STR_LIT("true") : STR_LIT("false")`;
      if (t === 'double' || t === 'float') return `tsc_f64_to_string(${a0})`;
      if (t === 'int64_t') return `tsc_i64_to_string(${a0})`;
      return `tsc_i32_to_string(${a0})`;
    }
    if (prop === 'parse') {
      const typeName = typeArgs[0]?.name ?? 'i32';
      const a0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      if (typeName === 'f64' || typeName === 'f32') return `atof(${a0}.data)`;
      if (typeName === 'bool') return `(${a0}.length == 4 && memcmp(${a0}.data, "true", 4) == 0)`;
      return `atoi(${a0}.data)`;
    }
    return `/* JSON.${prop} */0`;
  },

  labelUsed(node, label, kind) {
    if (!node || typeof node !== 'object') return false;
    if (node.kind === kind.charAt(0).toUpperCase() + kind.slice(1) && node.label === label) return true;
    if (node.kind === 'Labeled' && node.label === label) return false;
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) {
        for (const item of val) { if (this.labelUsed(item, label, kind)) return true; }
      } else if (val && typeof val === 'object' && val.kind) {
        if (this.labelUsed(val, label, kind)) return true;
      }
    }
    return false;
  },

  isBareLiteralNumber(expr) {
    if (expr.kind === 'Literal' && expr.litType === 'number' &&
        !expr.value.includes('.') && !expr.value.includes('e') && !expr.value.includes('E') &&
        !expr.value.startsWith('0x') && !expr.value.startsWith('0b') && !expr.value.startsWith('0o') &&
        !expr.value.startsWith('0X') && !expr.value.startsWith('0B') && !expr.value.startsWith('0O')) {
      return true;
    }
    if (expr.kind === 'Unary' && expr.op === '-') return this.isBareLiteralNumber(expr.expr);
    return false;
  },

  bareNumberValue(expr) {
    if (expr.kind === 'Literal') {
      return expr.value + '.0';
    }
    if (expr.kind === 'Unary' && expr.op === '-') {
      return '-' + this.bareNumberValue(expr.expr);
    }
    return '0.0';
  },
};
