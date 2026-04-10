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

    // parseFloat / tryParseFloat / parseInt / tryParseInt
    // Helper: set _lastOptIsNull=true when arg is a string literal that can't parse as number
    const _setOptIsNullHint = (argNode) => {
      if (argNode?.kind === 'Literal' && argNode.litType === 'string') {
        this._lastOptIsNull = isNaN(parseFloat(argNode.value));
      }
    };
    if (callee.kind === 'Ident' && callee.name === 'parseFloat') {
      // With explicit f64 type annotation, use panic version returning double
      if (this._expectedType === 'double') {
        return `tsc_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
      }
      this._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_parse_float(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseFloat') {
      this._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'parseInt') {
      this._ensureOptStruct('opt_i32', 'int32_t');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_parse_int(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseInt') {
      this._ensureOptStruct('opt_i32', 'int32_t');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_i32(${this.exprToC(args[0].expr, lines, depth)})`;
    }

    // String(n) constructor → tsc_T_to_string(n)
    if (callee.kind === 'Ident' && callee.name === 'String' && args.length === 1) {
      const argNode = args[0].expr;
      const argType = this.inferType(argNode);
      const argIdent = this.cTypeToIdent(argType);
      const argC = this.exprToC(argNode, lines, depth);
      return `tsc_${argIdent}_to_string(${argC})`;
    }

    // i32.parse(s), i32.tryParse(s), f64.parse(s), f64.tryParse(s)
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const typeName = callee.object.name;
      const primitiveMap = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                              'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                              'f32':'float','f64':'double' };
      if (typeName in primitiveMap) {
        const ctype = primitiveMap[typeName];
        const ident = this.cTypeToIdent(ctype);
        if (callee.prop === 'parse') {
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          this._lastSuppressConst = true; // parse() panics; result is non-const in C
          return `tsc_${ident}_parse(${argC})`;
        }
        if (callee.prop === 'tryParse') {
          this._ensureOptStruct(`opt_${ident}`, ctype);
          if (args[0]?.expr?.kind === 'Literal' && args[0].expr.litType === 'string') {
            this._lastOptIsNull = isNaN(parseFloat(args[0].expr.value));
          }
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_${ident}_try_parse(${argC})`;
        }
      }
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
        // Array struct arg to destructured array param (int32_t *_arr): pass .data
        if (param.destructArr) {
          const argSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
          if (argSym?.ctype?.startsWith('Array_')) {
            return `${this.exprToC(a.expr, lines, depth)}.data`;
          }
        }
        // Ref<T>/Mut<T> param: pass &var
        if (param.typeAnn?.kind === 'TypeRef' &&
            (param.typeAnn.name === 'Ref' || param.typeAnn.name === 'Mut')) {
          const argSym2 = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
          const argC2 = this.exprToC(a.expr, lines, depth);
          if (!argSym2?.isPointer && !argSym2?.ctype?.endsWith('*')) return `&${argC2}`;
          return argC2;
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

      // Pointer-borrow types from struct destructuring (const T *field = &obj.field)
      if (ctype?.endsWith(' *') && !ctype.startsWith('void') && !ctype.startsWith('const char')) {
        const sym = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
        const derefType = sym?.derefType ?? ctype.replace(/^(const )?/, '').replace(/ \*$/, '');
        if (derefType === 'String') {
          fmtParts.push('%s');
          fmtArgs.push(`${cexpr}->data`);
        } else if (derefType === 'double' || derefType === 'float') {
          fmtParts.push('%g');
          fmtArgs.push(`*${cexpr}`);
        } else if (derefType === 'int64_t') {
          fmtParts.push('%lld');
          fmtArgs.push(`(long long)*${cexpr}`);
        } else if (derefType === 'bool') {
          fmtParts.push('%s');
          fmtArgs.push(`*${cexpr} ? "true" : "false"`);
        } else {
          fmtParts.push('%d');
          fmtArgs.push(`*${cexpr}`);
        }
        continue;
      }

      if (ctype === 'String') {
        const strSym = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
        if (strSym?.isStringRef) {
          fmtParts.push('%.*s');
          fmtArgs.push(`(int)${cexpr}.length`, `${cexpr}.data`);
        } else if (this._isHeapStringInit(expr)) {
          // Inline heap string (e.g., n.toString()): store in temp, printf, free
          const tmp = `_tmp_${this.tempCount++}`;
          const I = ' '.repeat(this.indent * depth);
          const cexprStr = cexpr;
          lines.push(`${I}String ${tmp} = ${cexprStr};`);
          if (!this._postStmtCleanups) this._postStmtCleanups = [];
          this._postStmtCleanups.push(`${I}tsc_string_free(${tmp});`);
          fmtParts.push('%s');
          fmtArgs.push(`${tmp}.data`);
        } else {
          fmtParts.push('%s');
          fmtArgs.push(`${cexpr}.data`);
        }
      } else if (ctype === 'const char *' || ctype === 'char *') {
        fmtParts.push('%s');
        fmtArgs.push(cexpr);
      } else if (ctype === 'bool') {
        fmtParts.push('%s');
        // Wrap in parens only when needed to disambiguate: identifiers, unary, binary, ternary, assign
        // Function calls (Call) and member accesses don't need parens
        const needsParens = expr.kind === 'Ident' || expr.kind === 'Unary' ||
                            expr.kind === 'Binary' || expr.kind === 'Ternary' || expr.kind === 'Assign';
        fmtArgs.push(`${needsParens ? `(${cexpr})` : cexpr} ? "true" : "false"`);
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
        // Optional reference type (opt_ref_T): { bool has_value; T *value; }
        if (ctype.startsWith('opt_ref_')) {
          const innerIdent = ctype.slice(8); // "i32" from "opt_ref_i32"
          const identToCType3 = { 'i8':'int8_t', 'i16':'int16_t', 'i32':'int32_t', 'i64':'int64_t',
                                   'u8':'uint8_t', 'u16':'uint16_t', 'u32':'uint32_t', 'u64':'uint64_t',
                                   'f32':'float', 'f64':'double', 'bool':'bool', 'usize':'size_t' };
          const innerCType = identToCType3[innerIdent] ?? innerIdent;
          // No-value sentinel: -1 for int, etc.
          if (innerCType === 'double' || innerCType === 'float') {
            fmtParts.push('%g');
            fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1.0`);
          } else {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1`);
          }
          continue;
        }
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
              const _calleeProp = expr.callee?.kind === 'Member' ? expr.callee.prop : null;
              const _tmpPfx = _calleeProp === 'at' ? '_at_' : '_v_';
              const tmp = `${_tmpPfx}${this.tempCount++}`;
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
    // Handle method chain: arr.resize(10, 0).fill(7, 0, 5)
    // When callee.object is itself a Call, emit it as a statement and use the base object
    let baseObject = callee.object;
    if (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
      const I = ' '.repeat(this.indent * depth);
      while (baseObject.kind === 'Call' && baseObject.callee?.kind === 'Member') {
        const innerC = this.callToC(baseObject, lines, depth);
        lines.push(`${I}${innerC};`);
        baseObject = baseObject.callee.object;
      }
    }
    const objC = this.exprToC(baseObject, lines, depth);
    const prop  = callee.prop;

    // Determine array element type from symbol
    const sym   = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    const et    = sym?.elemType ?? 'i32';           // identifier suffix, e.g. 'i32'
    const etC   = sym?.arrElemCType ?? 'int32_t';   // C type, e.g. 'int32_t'

    // Helper: extract output type from lambda name _lambda_N_TYPE
    const lambdaOutET = (argsC) => {
      const m = argsC.match(/_lambda_\d+_(\w+)/);
      return m ? m[1] : et;
    };

    // Set lambda param type hint for array callback methods
    const isArrayObj = sym?.isArray || this.inferType(baseObject)?.startsWith('Array_');
    const arrayCallbackProps = new Set(['filter','map','every','some','find','findIndex','forEach','sort','reduce']);
    if (isArrayObj && arrayCallbackProps.has(prop)) {
      // sort comparator has 2 params; reduce has (acc, x) both same type
      this._lambdaParamHint = (prop === 'reduce' || prop === 'sort') ? [etC, etC] : [etC];
    }
    const argsC = this.argsToC(args, lines, depth);
    this._lambdaParamHint = null;
    if (isArrayObj) {
      switch (prop) {
        case 'push': {
          const elemC = args[0] ? this.exprToC(args[0].expr, [], depth) : '0';
          if (baseObject.kind === 'Ident') {
            this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            if (sym) sym.arraySize = undefined; // size unknown after push
          }
          return `tsc_array_push_${et}(&${objC}, ${elemC})`;
        }
        case 'pop': {
          this._ensureOptStruct(`opt_${et}`, etC);
          if (sym?.arraySize === 0) this._lastPopEmpty = true;
          return `tsc_array_pop_${et}(&${objC})`;
        }
        case 'remove': {
          const idxC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          this._lastArrayElemReturn = true; // suppress const for the returned element
          return `tsc_array_remove_${et}(&${objC}, ${idxC})`;
        }
        case 'length':   return `${objC}.length`;
        case 'capacity': return `${objC}.capacity`;
        case 'sort': {
          const fnC = args.length ? argsC : 'NULL';
          return `tsc_array_sort_${et}(&${objC}, ${fnC})`;
        }
        case 'reverse':    return `tsc_array_reverse_${et}(&${objC})`;
        case 'fill': {
          const v     = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const start = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const end   = args[2] ? this.exprToC(args[2].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_fill_${et}(&${objC}, ${v}, ${start}, ${end})`;
        }
        case 'resize': {
          const nNode = args[0]?.expr;
          const nC    = nNode ? this.exprToC(nNode, lines, depth) : '0';
          const fillC = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          // Register cleanup only if new size likely exceeds current (may heap-alloc)
          if (baseObject.kind === 'Ident') {
            const nLit = nNode?.kind === 'Literal' ? parseFloat(nNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(nLit) || isNaN(curSize) || nLit > curSize) {
              this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = isNaN(nLit) ? undefined : nLit; // update tracked size
          }
          return `tsc_array_resize_${et}(&${objC}, ${nC}, ${fillC})`;
        }
        case 'reallocate': {
          const capNode = args[0]?.expr;
          const capC = capNode ? this.exprToC(capNode, lines, depth) : '0';
          if (baseObject.kind === 'Ident') {
            const capLit = capNode?.kind === 'Literal' ? parseFloat(capNode.value) : NaN;
            const curSize = sym?.arraySize ?? NaN;
            if (isNaN(capLit) || isNaN(curSize) || capLit > curSize) {
              this._registerCleanup(`tsc_array_free_${et}(&${objC})`);
            }
            if (sym) sym.arraySize = undefined; // capacity changed, size unknown
          }
          return `tsc_array_reallocate_${et}(&${objC}, ${capC})`;
        }
        case 'filter':  return `tsc_array_filter_${et}(${objC}, ${argsC})`;
        case 'forEach': return `tsc_array_foreach_${et}(${objC}, ${argsC})`;
        case 'map': {
          const outET = lambdaOutET(argsC);
          return `tsc_array_map_${et}_${outET}(${objC}, ${argsC})`;
        }
        case 'reduce': {
          const initExpr = args[1]?.expr;
          const outET = initExpr ? this.cTypeToIdent(this.inferType(initExpr)) : et;
          return `tsc_array_reduce_${et}_${outET}(${objC}, ${argsC})`;
        }
        case 'every':    return `tsc_array_every_${et}(${objC}, ${argsC})`;
        case 'some':     return `tsc_array_some_${et}(${objC}, ${argsC})`;
        case 'find': {
          this._ensureOptRefStruct(`opt_ref_${et}`, etC);
          return `tsc_array_find_${et}(${objC}, ${argsC})`;
        }
        case 'findIndex': return `(int)tsc_array_find_index_${et}(${objC}, ${argsC})`;
        case 'indexOf':  return `(int)tsc_array_index_of_${et}(${objC}, ${argsC})`;
        case 'includes': return `tsc_array_includes_${et}(${objC}, ${argsC})`;
        case 'concat':   return `tsc_array_concat_${et}(${objC}, ${argsC})`;
        case 'slice': {
          const s = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const e = args[1] ? this.exprToC(args[1].expr, lines, depth) : `(int32_t)${objC}.length`;
          return `tsc_array_slice_${et}(${objC}, ${s}, ${e})`;
        }
        case 'join': {
          const sep = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")';
          return `tsc_array_join_${et}(${objC}, ${sep})`;
        }
        case 'keys':    return `tsc_array_keys_${et}(${objC})`;
        case 'values':  return `tsc_array_values_${et}(${objC})`;
        case 'entries': return `tsc_array_entries_${et}(${objC})`;
        case 'flat':    return `tsc_array_flat_${et}(${objC})`;
      }
    }

    // (legacy arrMethods fallback — only reached for non-array objects with same prop names)
    const arrMethods = {};

    // String methods
    const strMethods = {
      length:     () => `${objC}.length`,
      slice:      () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${objC}, ${a[0]??0}, ${a[1]??'(int32_t)'+objC+'.length'})`; },
      indexOf:      () => `(int)tsc_string_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
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
      charCodeAt: () => { const idxC = this.exprToC(args[0].expr, lines, depth); return `(unsigned)(uint8_t)${objC}.data[${idxC}]`; },
      concat:     () => `tsc_string_concat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      codePoints:  () => `tsc_codepoints(${objC})`,
      graphemes:   () => `tsc_graphemes(${objC})`,
      replaceAll:  () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace_all(${objC}, ${a[0]}, ${a[1]})`; },
      substring:   () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_substring(${objC}, ${a[0]}, ${a[1]??objC+'.length'})`; },
      trimStart:   () => `tsc_string_trim_start(${objC})`,
      trimEnd:     () => `tsc_string_trim_end(${objC})`,
    };

    // Map_* methods → explicit C function calls
    const objType2 = (baseObject.kind === 'Ident' ? this.lookup(baseObject.name)?.ctype : null)
      ?? this.inferType(baseObject);
    const _mapSfx2 = this._mapSuffix(objType2);
    if (_mapSfx2) {
      const mapSuffix = _mapSfx2; // e.g., "string_i32"
      const mapVarName = baseObject.kind === 'Ident' ? baseObject.name : null;
      if (prop === 'set') {
        // Track that this map variable has had at least one set call
        if (mapVarName) {
          if (!this._mapHasSetCalls) this._mapHasSetCalls = new Set();
          this._mapHasSetCalls.add(mapVarName);
        }
        return `tsc_map_set_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'get' || prop === 'delete') {
        // If no set calls were made on this map variable, the result is definitely null
        if (mapVarName) {
          const hasSet = this._mapHasSetCalls?.has(mapVarName) ?? false;
          this._lastOptIsNull = !hasSet;
        }
        if (prop === 'get')    return `tsc_map_get_${mapSuffix}(&${objC}, ${argsC})`;
        if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      }
      if (prop === 'has')    return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'clear')  return `tsc_map_clear_${mapSuffix}(&${objC})`;
      if (prop === 'keys') {
        this._lastSuppressConst = true; // keys() returns heap array — suppress const qualifier
        return `tsc_map_keys_${mapSuffix}(&${objC})`;
      }
      if (prop === 'entries') return `tsc_map_entries_${mapSuffix}(&${objC})`;
    }

    // Float methods: toFixed, toPrecision
    const numMethods = {
      toFixed: () => {
        const objType = this.inferType(baseObject);
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

    const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
    if (hasOwn(arrMethods, prop) && arrMethods[prop]) return arrMethods[prop]();
    if (hasOwn(strMethods, prop) && strMethods[prop]) return strMethods[prop]();
    if (hasOwn(numMethods, prop) && numMethods[prop]) return numMethods[prop]();

    // toString() dispatch by object type
    if (prop === 'toString') {
      const objType5 = (baseObject.kind === 'Ident' ? this.lookup(baseObject.name)?.ctype : null)
                       ?? this.inferType(baseObject);
      // String.toString() is a no-op
      if (objType5 === 'String') return objC;
      // numeric.toString() → tsc_T_to_string(x)
      if (objType5 && !objType5.startsWith('Array_') && !this._mapSuffix(objType5) &&
          !objType5.startsWith('opt_') && objType5 !== 'void') {
        const etId5 = this.cTypeToIdent(objType5);
        return `tsc_${etId5}_to_string(${objC})`;
      }
    }

    // Generic method: obj.method(args) → ObjType_method(&obj, args)
    const classSym = baseObject.kind === 'Ident' ? this.lookup(baseObject.name) : null;
    if (classSym?.ctype && this.classes.has(classSym.ctype)) {
      return `${classSym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
    }

    // Fallback: obj.method(args)
    return `${objC}.${prop}(${argsC})`;
  },

  argsToC(args, lines, depth) {
    const parts = [];
    for (const a of args) {
      if (a.spread) {
        // Expand spread from a known array: arr → arr.data[0], arr.data[1], ...
        const spreadSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
        if (spreadSym?.isArray && spreadSym.arraySize >= 0) {
          const n = a.expr.name;
          const useData = spreadSym.ctype?.startsWith('Array_');
          for (let i = 0; i < spreadSym.arraySize; i++)
            parts.push(useData ? `${n}.data[${i}]` : `${n}[${i}]`);
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
