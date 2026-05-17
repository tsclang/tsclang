export default {
  _dispatchConversion(node, lines, depth) {
    const { callee, args } = node;
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
      // EnumMember.toString() вЂ” callee.object is Member (Dir.North), prop is 'toString'
      if (callee.prop === 'toString' && callee.object.kind === 'Member') {
        const enumName = callee.object.object.kind === 'Ident' ? callee.object.object.name : null;
        const enumDef = enumName ? this.classes.get(enumName) : null;
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw this.error(`"toString()" is not available on const enum`);
          const memberC = `${enumName}_${callee.object.prop}`;
          if (enumDef.isStringEnum) return `${enumName}_strings[(int)${memberC}]`;
          return `${enumName}_names[(int)${memberC}]`;
        }
      }
      // Enum.values()
      if (callee.prop === 'values' && callee.object.kind === 'Ident') {
        const enumDef = this.classes.get(callee.object.name);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw this.error(`"values()" is not available on const enum`);
          return `${callee.object.name}_values`;
        }
      }
      // Enum.fromValue(n) вЂ” needs helper function emitted at top
      if (callee.prop === 'fromValue' && callee.object.kind === 'Ident') {
        const enumName = callee.object.name;
        const enumDef = this.classes.get(enumName);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw this.error(`"fromValue()" is not available on const enum`);
          const n = enumDef.members.length;
          const helperName = `${enumName}_fromValue`;
          // Emit helper if not already emitted
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
    if (callee.kind === 'Ident' && (callee.name === 'setTimeout' || callee.name === 'setInterval')) {
      if (this._isEmbedded()) {
        throw this.error(`"${callee.name}" is not available on embedded targets`, node);
      }
    }
    if (callee.kind === 'Ident' && callee.name === 'setTimeout') {
      let fn;
      const cbExpr = args[0]?.expr;
      if (cbExpr?.kind === 'Arrow') {
        const closure = this.hoistClosure(cbExpr, `_cb_${this.closureCount ?? 0}`);
        if (closure) {
          fn = closure.fnName;
        } else {
          fn = this.hoistArrow(cbExpr, 'void', '_cb');
        }
      } else {
        fn = this.exprToC(args[0].expr, lines, depth);
      }
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_timeout(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'setInterval') {
      const lambdaArg = args[0]?.expr;
      if (lambdaArg?.kind === 'Arrow') {
        const freeVars = this._collectFreeVars(lambdaArg);
        if (freeVars.length > 0) {
          const closureIdx = this.lambdaCount++;
          const prefix = `_closure_${closureIdx}`;
          const envType = `${prefix}_env`;
          const fieldDecls = freeVars.map(v => `${v.ctype} ${v.name};`);
          this._topBlank();
          this.topLevel.push(`typedef struct { ${fieldDecls.join(' ')} } ${envType};`);
          this.topLevel.push(`static ${envType} ${prefix}_captured;`);
          const closureLines = [];
          this.pushScope();
          for (const v of freeVars) {
            this.define(v.name, { ctype: v.ctype, _cAlias: `${prefix}_captured.${v.name}`, varKind: 'let' });
          }
          if (lambdaArg.body?.kind === 'Block') this.visitBlock(lambdaArg.body, closureLines, 0);
          this.popScope();
          this._topBlank();
          this.topLevel.push(`static void ${prefix}_fn(void) {`);
          for (const l of closureLines) this.topLevel.push('    ' + l);
          this.topLevel.push('}');
          if (lines !== undefined) {
            const I = ' '.repeat(this.indent * depth);
            const inits = freeVars.map(v => `.${v.name} = ${v.name}`).join(', ');
            lines.push(`${I}${prefix}_captured = (${envType}){ ${inits} };`);
          }
          const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_set_interval(${prefix}_fn, ${ms})`;
        }
      }
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_interval(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'clearTimeout') {
      const id = this.exprToC(args[0].expr, lines, depth);
      return `tsc_clear_timeout(${id})`;
    }

    // parseFloat / tryParseFloat / parseInt / tryParseInt / Number
    // Helper: set _lastOptIsNull=true when arg is a string literal that can't parse as number.
    // Supports 0x/0b/0o prefixes (runtime handles them; JS parseFloat/parseInt don't, so we check manually).
    const _setOptIsNullHint = (argNode) => {
      if (argNode?.kind === 'Literal' && argNode.litType === 'string') {
        const s = argNode.value;
        if (/^0x[0-9a-fA-F]+$/i.test(s) || /^0b[01]+$/i.test(s) || /^0o[0-7]+$/i.test(s)) {
          this._lastOptIsNull = false; // prefixed integer literals always parse successfully
        } else {
          this._lastOptIsNull = isNaN(parseFloat(s));
        }
      }
    };
    // std/string: atob, btoa, decodeUtf8, encodeUtf8
    if (callee.kind === 'Ident' && callee.name === 'atob') {
      this.includes.add('#include "std/base64.h"');
      this._lastSuppressConst = true;
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_atob(${arg})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'btoa') {
      this.includes.add('#include "std/base64.h"');
      this._lastSuppressConst = true;
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_btoa(${arg})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'decodeUtf8') {
      this._lastSuppressConst = true;
      // Static UTF-8 validation for literal byte arrays
      const argExpr = args[0]?.expr;
      const _decLitArr = argExpr?.kind === 'ArrayLit' ? argExpr
        : (argExpr?.kind === 'Ident' ? this.lookup(argExpr.name)?.initNode : null);
      if (_decLitArr?.kind === 'ArrayLit' && _decLitArr.elems?.every(e => e?.expr?.kind === 'Literal')) {
        const bytes = _decLitArr.elems.map(e => parseInt(e.expr.value));
        let i = 0;
        while (i < bytes.length) {
          const b = bytes[i];
          let seqLen;
          if (b < 0x80) { seqLen = 1; }
          else if (b < 0xC2) { seqLen = -1; }
          else if (b < 0xE0) { seqLen = 2; }
          else if (b < 0xF0) { seqLen = 3; }
          else if (b < 0xF5) { seqLen = 4; }
          else { seqLen = -1; }
          if (seqLen < 0) throw this.error(`RuntimeError: decodeUtf8: invalid UTF-8 byte sequence at offset ${i}`);
          for (let j = 1; j < seqLen; j++) {
            if (i + j >= bytes.length || (bytes[i + j] & 0xC0) !== 0x80)
              throw this.error(`RuntimeError: decodeUtf8: invalid UTF-8 byte sequence at offset ${i + j}`);
          }
          i += seqLen;
        }
      }
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(Array_u8){0}';
      return `tsc_decode_utf8(${arg})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'encodeUtf8') {
      this._ensureArrayStruct('Array_u8', 'uint8_t');
      this._lastSuppressConst = true;
      const arg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_encode_utf8(${arg})`;
    }

    // drop(x) в†’ T_drop(x) for pool types
    if (callee.kind === 'Ident' && callee.name === 'drop') {
      const argNode = args[0]?.expr;
      if (argNode) {
        const argSym = argNode.kind === 'Ident' ? this.lookup(argNode.name) : null;
        const argType = argSym?.ctype ?? this.inferType(argNode);
        const _pcn = argType?.startsWith('opt_ref_') ? argType.slice(8) : null;
        if (_pcn && this.classes.get(_pcn)?._isPool) {
          this._ensurePoolDrop(_pcn);
          return `${this.classes.get(_pcn)._poolDropFn}(${this.exprToC(argNode, lines, depth)})`;
        }
      }
    }
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
    // Number(s) в†’ alias for parseFloat(s) в†’ f64 | null
    if (callee.kind === 'Ident' && callee.name === 'Number' && args.length === 1) {
      this._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }

    // structuredClone(x) в†’ C struct copy for primitives/structs, array clone for arrays
    if (callee.kind === 'Ident' && callee.name === 'structuredClone' && args.length === 1) {
      const argNode = args[0].expr;
      const argType = this.inferType(argNode);
      let argC = this.exprToC(argNode, lines, depth);
      if (argType?.startsWith('Array_')) {
        const et = argType.slice(6);
        const etIdent = this.cTypeToIdent(et);
        if (!['Ident', 'Literal'].includes(argNode.kind)) {
          const tmp = `_tsc_clone_${this.tempCount++}`;
          lines.push(`${' '.repeat(this.indent * depth)}${argType} ${tmp} = ${argC};`);
          argC = tmp;
        }
        return `tsc_array_slice_${etIdent}(${argC}, 0, (int32_t)${argC}.length)`;
      }
      // For structs/primitives: C assignment = copy by value
      return `(${argType})(${argC})`;
    }

    // String(n) constructor в†’ tsc_T_to_string(n)
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
          _setOptIsNullHint(args[0]?.expr);
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
    return null;
  },
};
