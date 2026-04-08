// calls.js
export default {
  callToC(node, lines, depth) {
    const { callee, args } = node;

    // Optional chaining: x?.method() where x is opt_T
    if (callee.kind === 'OptChain') {
      const obj = callee.object;
      const objType = this.inferType(obj);
      const objC = this.exprToC(obj, lines, depth);
      if (objType?.startsWith('opt_')) {
        const innerIdent = objType.slice(4);
        if (callee.prop === 'toString') {
          // Ensure opt_string typedef is emitted
          if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
          if (!this._emittedOptStructs.has('opt_string')) {
            this._emittedOptStructs.add('opt_string');
            this.addTop(`typedef struct { bool has_value; String value; } opt_string;`);
          }
          const fnName = `tsc_${innerIdent}_to_string`;
          return `${objC}.has_value ? (opt_string){true, ${fnName}(${objC}.value)} : (opt_string){false, STR_LIT("")}`;
        }
      }
      // Fallback: treat as non-optional
      const objC2 = this.exprToC(obj, lines, depth);
      return `${objC2}.${callee.prop}(${this.argsToC(args, lines, depth)})`;
    }

    // console.log / console.error / console.warn / console.debug
    if (callee.kind === 'Member' && callee.object.kind === 'Ident' && callee.object.name === 'console') {
      return this.consoleCall(callee.prop, args, lines, depth);
    }

    // performance.now()
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'performance' &&
        callee.prop === 'now') {
      return 'tsc_performance_now()';
    }

    // process.exit(n)
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'process' &&
        callee.prop === 'exit') {
      const code = args.length ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `exit(${code})`;
    }

    // Math.xxx
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'Math') {
      return this.mathCall(callee.prop, args, lines, depth);
    }

    // Enum.method() calls: Enum.values(), Enum.fromValue(), EnumMember.toString()
    if (callee.kind === 'Member') {
      // variable.toString() where variable is a string-literal-union type
      if (callee.prop === 'toString' && callee.object.kind === 'Ident') {
        const objSym = this.lookup(callee.object.name);
        const objEnumDef = objSym ? this.classes.get(objSym.ctype) : null;
        if (objEnumDef?.isStringLiteralUnion) {
          const objC = this.exprToC(callee.object, lines, depth);
          return `${objSym.ctype}_values[(int)${objC}]`;
        }
      }
      // EnumMember.toString() — callee.object is Member (Dir.North), prop is 'toString'
      if (callee.prop === 'toString' && callee.object.kind === 'Member') {
        const enumName = callee.object.object.kind === 'Ident' ? callee.object.object.name : null;
        const enumDef = enumName ? this.classes.get(enumName) : null;
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw new Error(`"toString()" is not available on const enum`);
          const memberC = `${enumName}_${callee.object.prop}`;
          if (enumDef.isStringEnum) return `${enumName}_strings[(int)${memberC}]`;
          return `${enumName}_names[(int)${memberC}]`;
        }
      }
      // Enum.values()
      if (callee.prop === 'values' && callee.object.kind === 'Ident') {
        const enumDef = this.classes.get(callee.object.name);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw new Error(`"values()" is not available on const enum`);
          return `${callee.object.name}_values`;
        }
      }
      // Enum.fromValue(n) — needs helper function emitted at top
      if (callee.prop === 'fromValue' && callee.object.kind === 'Ident') {
        const enumName = callee.object.name;
        const enumDef = this.classes.get(enumName);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw new Error(`"fromValue()" is not available on const enum`);
          const n = enumDef.members.length;
          const helperName = `${enumName}_fromValue`;
          // Emit helper if not already emitted
          if (!this._emittedHelpers) this._emittedHelpers = new Set();
          if (!this._emittedHelpers.has(helperName)) {
            this._emittedHelpers.add(helperName);
            this.addTop(`typedef struct { bool has_value; ${enumName} value; } opt_${enumName};`);
            this.addTop(`static inline opt_${enumName} ${helperName}(int32_t v) {`);
            this.addTop(`    for (int i = 0; i < ${n}; i++) { if ((int32_t)${enumName}_values[i] == v) return (opt_${enumName}){true, ${enumName}_values[i]}; }`);
            this.addTop(`    return (opt_${enumName}){false, 0};`);
            this.addTop(`}`);
            this.addTop(``);
          }
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `${helperName}(${argC})`;
        }
      }
    }

    // setTimeout / setInterval / clearTimeout
    if (callee.kind === 'Ident' && callee.name === 'setTimeout') {
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_timeout(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'setInterval') {
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_interval(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'clearTimeout') {
      const id = this.exprToC(args[0].expr, lines, depth);
      return `tsc_clear_timeout(${id})`;
    }

    // parseFloat / tryParseFloat / tryParseInt
    if (callee.kind === 'Ident' && callee.name === 'parseFloat') {
      return `tsc_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseFloat') {
      return `tsc_try_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'parseInt') {
      return `tsc_parse_i32(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseInt') {
      return `tsc_try_parse_i32(${this.exprToC(args[0].expr, lines, depth)})`;
    }

    // sleep()
    if (callee.kind === 'Ident' && callee.name === 'sleep') {
      const ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_sleep_awaitable(${ms})`;
    }

    // Method call on known object
    if (callee.kind === 'Member') {
      return this.methodCall(callee, args, lines, depth);
    }

    // Generic function call: monomorphize
    if (callee.kind === 'Ident' && this._genericFuncs?.has(callee.name)) {
      return this.callGeneric(callee.name, node.typeArgs ?? [], args, lines, depth);
    }

    // Plain function call — look up mangled name in scope
    let calleeC;
    let sym = null;
    if (callee.kind === 'Ident') {
      sym = this.lookup(callee.name);
      // funcPtr variables hold the name directly; functions use their mangled name
      calleeC = (sym?.funcName && !sym.funcPtr) ? sym.funcName : callee.name;
    } else {
      calleeC = this.exprToC(callee, lines, depth);
    }

    // Check for any-typed params: cannot pass typed value as any
    if (sym?.params) {
      for (let i = 0; i < sym.params.length && i < args.length; i++) {
        const p = sym.params[i];
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'any') {
          const argType = this.inferType(args[i].expr);
          if (argType !== 'void *' && argType !== null && argType !== undefined) {
            const tsType = this.ctypeToTsName(argType);
            throw new Error(`cannot pass ${tsType} as "any": any is opaque across function boundaries`);
          }
        }
      }
    }

    // Check if callee has a rest param — if so, bundle variadic args into a temp array
    const symParams = sym?.params;
    const restIdx = symParams ? symParams.findIndex(p => p.rest) : -1;
    if (restIdx >= 0) {
      const restParam = symParams[restIdx];
      let et = 'int32_t';
      if (restParam.typeAnn?.kind === 'TypeArray') et = this.resolveType(restParam.typeAnn.element);
      else if (restParam.typeAnn) et = this.resolveType(restParam.typeAnn);
      // Normal args before rest
      const normalArgs = args.slice(0, restIdx).map(a => this.exprToC(a.expr, lines, depth));
      // Variadic args from restIdx onward
      const varArgs = args.slice(restIdx);
      const I = ' '.repeat(this.indent * depth);
      const restName = `_rest_${this.restCount++}`;
      const varArgsC = varArgs.map(a => this.exprToC(a.expr, lines, depth)).join(', ');
      lines.push(`${I}${et} ${restName}[] = {${varArgsC}};`);
      const allArgs = [...normalArgs, restName, String(varArgs.length)];
      return `${calleeC}(${allArgs.join(', ')})`;
    }

    // Fill in default params at call site if fewer args are provided (skip if any spread arg)
    const hasSpread = args.some(a => a.spread);
    if (!hasSpread && symParams && args.length < symParams.filter(p => !p.rest).length) {
      const normalParams = symParams.filter(p => !p.rest);
      const filled = normalParams.map((p, i) => {
        if (i < args.length) return this.exprToC(args[i].expr, lines, depth);
        if (p.defaultVal) return this.exprToC(p.defaultVal, lines, depth);
        return '0'; // fallback (shouldn't happen if type-checked)
      });
      return `${calleeC}(${filled.join(', ')})`;
    }

    // If we have symParams, coerce string literals to enum values for string-literal-union params
    // (only when no spread args — spread needs argsToC expansion)
    const hasSpreadArgs = args.some(a => a.spread);
    if (symParams && !hasSpreadArgs) {
      const coercedArgs = args.map((a, i) => {
        const param = symParams[i];
        if (!param) return this.exprToC(a.expr, lines, depth);
        const paramType = param.typeAnn ? this.resolveType(param.typeAnn) : null;
        const paramEnumDef = paramType ? this.classes.get(paramType) : null;
        if (paramEnumDef?.isStringLiteralUnion && a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          const val = a.expr.value;
          if (!paramEnumDef.members.includes(val)) {
            throw new Error(`"${val}" is not a valid value for type ${paramType}`);
          }
          return `${paramType}_${val}`;
        }
        // ObjLit arg to struct param: prefix with (StructType)
        if (paramEnumDef?.isStruct && a.expr.kind === 'ObjLit') {
          const initC = this.exprToC(a.expr, lines, depth);
          return `(${paramType})${initC}`;
        }
        return this.exprToC(a.expr, lines, depth);
      });
      return `${calleeC}(${coercedArgs.join(', ')})`;
    }

    const argsC = this.argsToC(args, lines, depth);
    return `${calleeC}(${argsC})`;
  },

  consoleCall(method, args, lines, depth) {
    const isErr = method === 'error' || method === 'warn' || method === 'debug';

    if (args.length === 0) {
      return isErr ? 'fprintf(stderr, "\\n")' : 'printf("\\n")';
    }

    const fmtParts = [];
    const fmtArgs  = [];

    for (const arg of args) {
      const expr  = arg.expr;
      const ctype = this.inferType(expr);

      // String literal → embed value directly in format string (no separate arg)
      if (expr.kind === 'Literal' && expr.litType === 'string') {
        fmtParts.push(expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%'));
        continue;
      }

      // A bare decimal integer literal is type `number` = f64 in TSClang
      if (this.isBareLiteralNumber(expr)) {
        const v = this.bareNumberValue(expr);
        fmtParts.push('%g');
        fmtArgs.push(v);
        continue;
      }

      const cexpr = this.exprToC(expr, lines, depth);

      // Bitwise ops: if operands are explicitly typed (from variables), use %d; otherwise %g (JS number)
      if (expr.kind === 'Binary' && ['&','|','^','<<','>>','>>>'].includes(expr.op)) {
        const hasTypedVar = (n) => {
          if (!n) return false;
          if (n.kind === 'Ident') {
            const s = this.lookup(n.name);
            return s?.ctype != null && s.ctype !== 'double' && s.ctype !== 'void *';
          }
          if (n.kind === 'Binary') return hasTypedVar(n.left) || hasTypedVar(n.right);
          return false;
        };
        if (hasTypedVar(expr)) {
          fmtParts.push('%d');
          fmtArgs.push(cexpr);
        } else {
          fmtParts.push('%g');
          fmtArgs.push(`(double)(${cexpr})`);
        }
        continue;
      }

      if (ctype === 'String') {
        fmtParts.push('%s');
        fmtArgs.push(`${cexpr}.data`);
      } else if (ctype === 'const char *' || ctype === 'char *') {
        fmtParts.push('%s');
        fmtArgs.push(cexpr);
      } else if (ctype === 'bool') {
        fmtParts.push('%s');
        fmtArgs.push(`${(expr.kind === 'Member' || expr.kind === 'Index') ? cexpr : '(' + cexpr + ')'} ? "true" : "false"`);
      } else if (ctype === 'double') {
        fmtParts.push('%g');
        fmtArgs.push(cexpr);
      } else if (ctype === 'float') {
        fmtParts.push('%g');
        fmtArgs.push(`(double)${cexpr}`);
      } else if (ctype === 'int64_t') {
        fmtParts.push('%lld');
        fmtArgs.push(`(long long)${cexpr}`);
      } else if (ctype === 'uint64_t') {
        fmtParts.push('%llu');
        fmtArgs.push(`(unsigned long long)${cexpr}`);
      } else if (ctype === 'uint8_t' || ctype === 'uint16_t') {
        fmtParts.push('%u');
        fmtArgs.push(`(unsigned)${cexpr}`);
      } else if (ctype === 'uint32_t') {
        fmtParts.push('%u');
        fmtArgs.push(cexpr);
      } else if (ctype === 'int8_t' || ctype === 'int16_t') {
        fmtParts.push('%d');
        fmtArgs.push(`(int)${cexpr}`);
      } else if (ctype === 'char') {
        fmtParts.push('%c');
        fmtArgs.push(cexpr);
      } else if (ctype === 'size_t') {
        fmtParts.push('%zu');
        fmtArgs.push(cexpr);
      } else {
        // Optional type (opt_T)
        if (ctype.startsWith('opt_')) {
          const innerIdent = ctype.slice(4); // e.g., "i32" from "opt_i32"
          const ed = this.classes.get(innerIdent);
          const sym2 = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
          if (ed?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? (int)${cexpr}.value : -1`);
          } else if (sym2?.optIsNull || (() => {
              // Check if this is a null optional tuple field access: a[1] where _1 was not initialized
              if (expr.kind === 'Index' && expr.object.kind === 'Ident' && expr.index.kind === 'Literal') {
                const tSym = this.lookup(expr.object.name);
                return tSym?.nullOptFields?.has(`_${expr.index.value}`);
              }
              return false;
            })()) {
            // Null-initialized optional — show "some" or "null"
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? "some" : "null"`);
          } else if (innerIdent === 'string') {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? ${cexpr}.value.data : "null"`);
          } else {
            // Numeric or other — print the value
            const identToCType2 = { 'i8':'int8_t', 'i16':'int16_t', 'i32':'int32_t', 'i64':'int64_t', 'u8':'uint8_t', 'u16':'uint16_t', 'u32':'uint32_t', 'u64':'uint64_t', 'f32':'float', 'f64':'double', 'bool':'bool', 'usize':'size_t' };
            const innerCType = identToCType2[innerIdent] ?? innerIdent;
            // For inline call expressions, create a temp var first (but not for simple Ident/Index/Member)
            let valExpr = cexpr;
            if (expr.kind === 'Call') {
              const tmp = `_at_${this.tempCount++}`;
              lines.push(`${ctype} ${tmp} = ${cexpr};`);
              valExpr = tmp;
            }
            if (innerCType === 'double' || innerCType === 'float') {
              fmtParts.push('%g');
              fmtArgs.push(`${valExpr}.value`);
            } else if (innerCType === 'int64_t') {
              fmtParts.push('%lld');
              fmtArgs.push(`(long long)${valExpr}.value`);
            } else if (innerCType === 'uint8_t' || innerCType === 'uint16_t') {
              fmtParts.push('%u');
              fmtArgs.push(`(unsigned)${valExpr}.value`);
            } else {
              fmtParts.push('%d');
              fmtArgs.push(`${valExpr}.value`);
            }
          }
          continue;
        } else {
          // String literal union enum: print the string value
          const enumDef = this.classes.get(ctype);
          if (enumDef?.isStringLiteralUnion) {
            fmtParts.push('%s');
            fmtArgs.push(`${ctype}_values[(int)${cexpr}]`);
          } else if (enumDef?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`(int)${cexpr}`);
          } else {
            fmtParts.push('%d');
            fmtArgs.push(cexpr);
          }
        }
      }
    }

    const fmt = '"' + fmtParts.join(' ') + '\\n"';
    if (fmtArgs.length === 0) {
      return isErr ? `fprintf(stderr, ${fmt})` : `printf(${fmt})`;
    }
    const allArgs = [fmt, ...fmtArgs].join(', ');
    return isErr ? `fprintf(stderr, ${allArgs})` : `printf(${allArgs})`;
  },

  // Check if a labeled break/continue with the given label is used in an AST subtree
  labelUsed(node, label, kind) {
    if (!node || typeof node !== 'object') return false;
    if (node.kind === kind.charAt(0).toUpperCase() + kind.slice(1) && node.label === label) return true;
    // Don't descend into nested labeled loops with the same label
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

  // Is this a bare integer number literal (or unary minus thereof)?
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

  // Get the double representation of a bare integer literal
  bareNumberValue(expr) {
    if (expr.kind === 'Literal') {
      return expr.value + '.0';
    }
    if (expr.kind === 'Unary' && expr.op === '-') {
      return '-' + this.bareNumberValue(expr.expr);
    }
    return '0.0';
  },

  mathCall(prop, args, lines, depth) {
    this.includes.add('#include <math.h>');
    const a0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
    const a1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
    const a2 = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';
    const map = {
      abs: `fabs(${a0})`, floor: `floor(${a0})`, ceil: `ceil(${a0})`,
      round: `round(${a0})`, trunc: `trunc(${a0})`,
      sqrt: `sqrt(${a0})`, pow: `pow(${a0}, ${a1})`,
      log: `log(${a0})`, log2: `log2(${a0})`, log10: `log10(${a0})`,
      sin: `sin(${a0})`, cos: `cos(${a0})`, tan: `tan(${a0})`,
      min: `fmin(${a0}, ${a1})`, max: `fmax(${a0}, ${a1})`,
      hypot: `hypot(${a0}, ${a1})`,
      clamp: `(${a0} < ${a1} ? ${a1} : (${a0} > ${a2} ? ${a2} : ${a0}))`,
      sign: `((${a0} > 0.0) - (${a0} < 0.0) + 0.0)`,
    };
    if (prop === 'PI')   return 'M_PI';
    if (prop === 'E')    return 'M_E';
    if (prop === 'LN2')  return 'M_LN2';
    if (prop === 'LN10') return 'log(10.0)';
    if (prop === 'SQRT2') return 'M_SQRT2';
    return map[prop] ?? `/* Math.${prop} */(${a0})`;
  },

  methodCall(callee, args, lines, depth) {
    const objC = this.exprToC(callee.object, lines, depth);
    const prop  = callee.prop;
    const argsC = this.argsToC(args, lines, depth);

    // Array methods
    const arrMethods = {
      push: () => {
        const elemC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const sym = callee.object.kind === 'Ident' ? this.lookup(callee.object.name) : null;
        const et = sym?.elemType ?? 'i32';
        return `tsc_array_push_${et}(&${objC}, ${elemC})`;
      },
      pop:    () => `tsc_array_pop(&${objC})`,
      length: () => `${objC}.length`,
      slice:  () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `{.data = ${objC}.data + ${a[0]??0}, .length = ${a[1]??0} - ${a[0]??0}}`; },
      join:   () => { const sep = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")'; return `tsc_array_join(&${objC}, ${sep})`; },
      indexOf:() => { const v = this.exprToC(args[0].expr, lines, depth); return `tsc_array_index_of(&${objC}, ${v})`; },
      includes:()=>{ const v = this.exprToC(args[0].expr, lines, depth); return `tsc_array_includes(&${objC}, ${v})`; },
      map:    () => `tsc_array_map(&${objC}, ${argsC})`,
      filter: () => `tsc_array_filter(&${objC}, ${argsC})`,
      forEach:() => `tsc_array_foreach(&${objC}, ${argsC})`,
      reverse:() => `tsc_array_reverse(&${objC})`,
      sort:   () => `tsc_array_sort(&${objC}, ${argsC})`,
      fill:   () => { const v = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'; return `memset(${objC}.data, ${v}, ${objC}.length)`; },
      find:   () => `tsc_array_find(&${objC}, ${argsC})`,
      every:  () => `tsc_array_every(&${objC}, ${argsC})`,
      some:   () => `tsc_array_some(&${objC}, ${argsC})`,
      keys:   () => `tsc_array_keys(&${objC})`,
      values: () => `tsc_array_values(&${objC})`,
      entries:() => `tsc_array_entries(&${objC})`,
      flat:   () => `tsc_array_flat(&${objC})`,
      reduce: () => `tsc_array_reduce(&${objC}, ${argsC})`,
    };

    // String methods
    const strMethods = {
      length:     () => `${objC}.length`,
      slice:      () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${objC}, ${a[0]??0}, ${a[1]??'(int32_t)'+objC+'.length'})`; },
      indexOf:      () => `tsc_string_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      lastIndexOf:  () => `(int)tsc_string_last_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      at:           () => {
        // s.at(n) → tsc_string_at(s, n) returning opt_u8
        const idxNode = args[0]?.expr;
        const idxC = this.exprToC(idxNode, lines, depth);
        if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
        if (!this._emittedOptStructs.has('opt_u8')) {
          this._emittedOptStructs.add('opt_u8');
          // opt_u8 is defined in runtime.h — no local typedef needed
        }
        // Flag: non-negative literal index might be OOB → optIsNull hint for VarDecl
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
      charCodeAt: () => `tsc_string_char_code_at(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      concat:     () => `tsc_string_concat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      codePoints: () => `tsc_codepoints(${objC})`,
      graphemes:  () => `tsc_graphemes(${objC})`,
    };

    // TscMap_* methods → explicit C function calls
    const objType2 = (callee.object.kind === 'Ident' ? this.lookup(callee.object.name)?.ctype : null)
      ?? this.inferType(callee.object);
    if (objType2?.startsWith('TscMap_')) {
      const mapSuffix = objType2.slice(7); // e.g., "string_i32"
      if (prop === 'set') return `tsc_map_set_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'get') return `tsc_map_get_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'has') return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'size') return `(int32_t)${objC}._count`;
    }

    // Map methods
    const mapMethods = ['set','get','has','delete','keys','values','entries','size','forEach','clear'];

    // Float methods: toFixed, toPrecision
    const numMethods = {
      toFixed: () => {
        const objType = this.inferType(callee.object);
        if (objType === 'int32_t' || objType === 'int64_t' || objType === 'uint32_t')
          throw new Error(`"toFixed()" is only available on f32/f64`);
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw new Error(`"toFixed()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.${n}f", ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
      toPrecision: () => {
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw new Error(`"toPrecision()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.*g", ${n}, ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
    };

    if (arrMethods[prop]) return arrMethods[prop]();
    if (strMethods[prop]) return strMethods[prop]();
    if (numMethods[prop]) return numMethods[prop]();

    // Generic method: obj.method(args) → ObjType_method(&obj, args)
    const sym = callee.object.kind === 'Ident' ? this.lookup(callee.object.name) : null;
    if (sym?.ctype && this.classes.has(sym.ctype)) {
      const suffix = args.length ? '_' + args.map(a => this.inferType(a.expr)).join('_') : '';
      return `${sym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
    }

    // Fallback: obj.method(args)
    return `${objC}.${prop}(${argsC})`;
  },

  argsToC(args, lines, depth) {
    const parts = [];
    for (const a of args) {
      if (a.spread) {
        // Expand spread from a known C array: arr → arr[0], arr[1], ...
        const sym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          for (let i = 0; i < sym.arraySize; i++) parts.push(`${a.expr.name}[${i}]`);
        } else {
          parts.push(`/* ...${this.exprToC(a.expr, lines, depth)} */`);
        }
      } else {
        parts.push(this.exprToC(a.expr, lines, depth));
      }
    }
    return parts.join(', ');
  }

};
