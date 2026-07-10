import type { Call, Expression } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
export function _dispatchConversion(ctx: CodeGenContext, node: Call, lines: string[], depth: number) {
    const { callee, args } = node;
    if (callee.kind === 'Member') {
      // variable.toString() where variable is a string-literal-union type
      if (callee.prop === 'toString' && callee.object.kind === 'Ident') {
        const objSym = ctx.lookup(callee.object.name);
        const objEnumDef = objSym ? ctx.classes.get(objSym.ctype!) : null;
        if (objEnumDef?.isStringLiteralUnion) {
          const objC = ctx.exprToC(callee.object, lines, depth);
          return `STR_LIT_RUNTIME(${objSym!.ctype}_values[(int)${objC}]).data`;
        }
      }
      // EnumMember.toString() вЂ” callee.object is Member (Dir.North), prop is 'toString'
      if (callee.prop === 'toString' && callee.object.kind === 'Member') {
        const enumName = callee.object.object.kind === 'Ident' ? callee.object.object.name : null;
        const enumDef = enumName ? ctx.classes.get(enumName) : null;
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw ctx.errorCode('E416', null, { detail: '"toString()" is not available on const enum' });
          const ec = enumDef._cname ?? enumName;
          const memberC = `${ec}_${callee.object.prop}`;
          if (enumDef.isStringEnum) return `${ec}_strings[(int)${memberC}]`;
          if (enumDef.needsToString) return `${ec}_toString(${memberC})`;
          return `${ec}_names[(int)${memberC}]`;
        }
      }
      // Enum.values()
      if (callee.prop === 'values' && callee.object.kind === 'Ident') {
        const enumDef = ctx.classes.get(callee.object.name);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw ctx.errorCode('E416', null, { detail: '"values()" is not available on const enum' });
          return `${enumDef._cname ?? callee.object.name}_values`;
        }
      }
      // Enum.fromValue(n) вЂ” needs helper function emitted at top
      if (callee.prop === 'fromValue' && callee.object.kind === 'Ident') {
        const enumName = callee.object.name;
        const enumDef = ctx.classes.get(enumName);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw ctx.errorCode('E416', null, { detail: '"fromValue()" is not available on const enum' });
          const ec = enumDef._cname ?? enumName;
          const n = (enumDef.members ?? []).length;
          const helperName = `${ec}_fromValue`;
          // Emit helper if not already emitted
          if (!ctx._emittedHelpers.has(helperName)) {
            ctx._emittedHelpers.add(helperName);
            ctx.addTop(`typedef struct { bool has_value; ${ec} value; } opt_${ec};`);
            ctx.addTop(`static inline opt_${ec} ${helperName}(int32_t v) {`);
            ctx.addTop(`    for (int i = 0; i < ${n}; i++) { if ((int32_t)${ec}_values[i] == v) return (opt_${ec}){true, ${ec}_values[i]}; }`);
            ctx.addTop(`    return (opt_${ec}){false, 0};`);
            ctx.addTop(`}`);
            ctx.addTop(``);
          }
          const argC = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
          return `${helperName}(${argC})`;
        }
      }
    }

    // setTimeout / setInterval / clearTimeout
    if (callee.kind === 'Ident' && (callee.name === 'setTimeout' || callee.name === 'setInterval')) {
      if (ctx._cap('async') !== 'libuv') {
        throw ctx.errorCode('E300', node, { detail: `"${callee.name}" is not available on embedded targets` });
      }
    }
    if (callee.kind === 'Ident' && callee.name === 'setTimeout') {
      let fn;
      const cbExpr = args[0]?.expr;
      if (cbExpr?.kind === 'Arrow') {
        const closure = ctx.hoistClosure(cbExpr, `_cb_${ctx.closureCount ?? 0}`);
        if (closure) {
          fn = closure.fnName;
        } else {
          fn = ctx.hoistArrow(cbExpr, 'void', '_cb');
        }
      } else {
        fn = ctx.exprToC(args[0].expr, lines, depth);
      }
      const ms = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_timeout(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'setInterval') {
      const lambdaArg = args[0]?.expr;
      if (lambdaArg?.kind === 'Arrow') {
        const freeVars = ctx._collectFreeVars(lambdaArg);
        if (freeVars.length > 0) {
          const closureIdx = ctx.lambdaCount++;
          const prefix = `_closure_${closureIdx}`;
          const envType = `${prefix}_env`;
          const fieldDecls = freeVars.map((v: { name: string; ctype: string }) => `${v.ctype} ${v.name};`);
          ctx._topBlank();
          ctx.topLevel.push(`typedef struct { ${fieldDecls.join(' ')} } ${envType};`);
          ctx.topLevel.push(`static ${envType} ${prefix}_captured;`);
          const closureLines: string[] = [];
          ctx.pushScope();
          for (const v of freeVars) {
            ctx.define(v.name, { ctype: v.ctype, _cAlias: `${prefix}_captured.${v.name}`, varKind: 'let' });
          }
          if (lambdaArg.body?.kind === 'Block') ctx.visitBlock(lambdaArg.body, closureLines, 0);
          ctx.popScope();
          ctx._topBlank();
          ctx.topLevel.push(`static void ${prefix}_fn(void) {`);
          for (const l of closureLines) ctx.topLevel.push('    ' + l);
          ctx.topLevel.push('}');
          if (lines !== undefined) {
            const I = ' '.repeat(ctx.indent * depth);
            const inits = freeVars.map((v: { name: string; ctype: string }) => `.${v.name} = ${v.name}`).join(', ');
            lines.push(`${I}${prefix}_captured = (${envType}){ ${inits} };`);
          }
          const ms = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_set_interval(${prefix}_fn, ${ms})`;
        }
      }
      let fn;
      const lambdaArg2 = args[0]?.expr;
      if (lambdaArg2?.kind === 'Arrow') {
        const closure = ctx.hoistClosure(lambdaArg2, `_cb_${ctx.closureCount ?? 0}`);
        if (closure) {
          fn = closure.fnName;
        } else {
          fn = ctx.hoistArrow(lambdaArg2, 'void', '_cb');
        }
      } else {
        fn = ctx.exprToC(args[0].expr, lines, depth);
      }
      const ms = args[1] ? ctx.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_interval(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'clearTimeout') {
      const id = ctx.exprToC(args[0].expr, lines, depth);
      return `tsc_clear_timeout(${id})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'clearInterval') {
      const id = ctx.exprToC(args[0].expr, lines, depth);
      return `tsc_clear_interval(${id})`;
    }

    // parseFloat / tryParseFloat / parseInt / tryParseInt / Number
    // Helper: set _lastOptIsNull=true when arg is a string literal that can't parse as number.
    // Supports 0x/0b/0o prefixes (runtime handles them; JS parseFloat/parseInt don't, so we check manually).
    const _setOptIsNullHint = (argNode: Expression | undefined) => {
      if (argNode?.kind === 'Literal' && argNode.litType === 'string') {
        const s = argNode.value;
        if (/^0x[0-9a-fA-F]+$/i.test(s) || /^0b[01]+$/i.test(s) || /^0o[0-7]+$/i.test(s)) {
          ctx._lastOptIsNull = false; // prefixed integer literals always parse successfully
        } else {
          ctx._lastOptIsNull = isNaN(parseFloat(s));
        }
      }
    };
    // std/string: url.encode(), url.decode(), url.encodeComponent(), url.decodeComponent()
    // std/string: decodeUtf8, encodeUtf8 (special: static validation for decodeUtf8)
    if (callee.kind === 'Ident' && callee.name === 'decodeUtf8') {
      const sym = ctx.lookup('decodeUtf8');
      if (sym?.funcName === 'tsc_decode_utf8') {
        ctx._lastSuppressConst = true;
        const argExpr = args[0]?.expr;
        const _decLitArr = argExpr?.kind === 'ArrayLit' ? argExpr
          : (argExpr?.kind === 'Ident' ? ctx.lookup(argExpr.name)?.initNode : null);
        if (_decLitArr?.kind === 'ArrayLit' && _decLitArr.elems?.every((e: { expr?: { kind?: string } }) => e?.expr?.kind === 'Literal')) {
          const bytes = _decLitArr.elems.map((e: { expr: { value: string } }) => parseInt(e.expr.value));
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
            if (seqLen < 0) throw ctx.errorCode('E418', null, { detail: `RuntimeError: decodeUtf8: invalid UTF-8 byte sequence at offset ${i}` });
            for (let j = 1; j < seqLen; j++) {
              if (i + j >= bytes.length || (bytes[i + j] & 0xC0) !== 0x80)
                throw ctx.errorCode('E418', null, { detail: `RuntimeError: decodeUtf8: invalid UTF-8 byte sequence at offset ${i + j}` });
            }
            i += seqLen;
          }
        }
        const arg = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '(Array_u8){0}';
        return `tsc_decode_utf8(${arg})`;
      }
    }
    if (callee.kind === 'Ident' && callee.name === 'encodeUtf8') {
      const sym = ctx.lookup('encodeUtf8');
      if (sym?.funcName === 'tsc_encode_utf8') {
        ctx._ensureArrayStruct('Array_u8', 'uint8_t');
        ctx._lastSuppressConst = true;
        const arg = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        return `tsc_encode_utf8(${arg})`;
      }
    }

    // drop(x) в†’ T_drop(x) for pool types
    if (callee.kind === 'Ident' && callee.name === 'drop') {
      const argNode = args[0]?.expr;
      if (argNode) {
        const argSym = argNode.kind === 'Ident' ? ctx.lookup(argNode.name) : null;
        const argType = argSym?.ctype ?? ctx.inferType(argNode);
        const _pcn = argType?.startsWith('opt_ref_') ? argType.slice(8) : null;
        if (_pcn && ctx.classes.get(_pcn)?._isPool) {
          ctx._ensurePoolDrop(_pcn);
          return `${ctx.classes.get(_pcn)?._poolDropFn}(${ctx.exprToC(argNode, lines, depth)})`;
        }
      }
    }
    if (callee.kind === 'Ident' && callee.name === 'parseFloat') {
      // With explicit f64 type annotation, use panic version returning double
      if (ctx._expectedType === 'double') {
        return `tsc_parse_f64(${ctx.exprToC(args[0].expr, lines, depth)})`;
      }
      ctx._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_parse_float(${ctx.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseFloat') {
      ctx._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_f64(${ctx.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'parseInt') {
      ctx._ensureOptStruct('opt_i32', 'int32_t');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_parse_int(${ctx.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseInt') {
      ctx._ensureOptStruct('opt_i32', 'int32_t');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_i32(${ctx.exprToC(args[0].expr, lines, depth)})`;
    }
    // Number(s) в†’ alias for parseFloat(s) в†’ f64 | null
    if (callee.kind === 'Ident' && callee.name === 'Number' && args.length === 1) {
      ctx._ensureOptStruct('opt_f64', 'double');
      _setOptIsNullHint(args[0]?.expr);
      return `tsc_try_parse_f64(${ctx.exprToC(args[0].expr, lines, depth)})`;
    }

    // structuredClone(x) в†’ C struct copy for primitives/structs, array clone for arrays
    if (callee.kind === 'Ident' && callee.name === 'structuredClone' && args.length === 1) {
      const argNode = args[0].expr;
      const argType = ctx.inferType(argNode);
      let argC = ctx.exprToC(argNode, lines, depth);
      if (argType?.startsWith('Array_')) {
        const et = argType.slice(6);
        const etIdent = ctx.cTypeToIdent(et);
        if (!['Ident', 'Literal'].includes(argNode.kind)) {
          const tmp = `_tsc_clone_${ctx.tempCount++}`;
          lines.push(`${' '.repeat(ctx.indent * depth)}${argType} ${tmp} = ${argC};`);
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
      const argType = ctx.inferType(argNode);
      const argIdent = ctx.cTypeToIdent(argType);
      const argC = ctx.exprToC(argNode, lines, depth);
      return `tsc_${argIdent}_to_string(${argC})`;
    }

    // String.fromCharCode(code) → tsc_string_from_char_code(code)
    if (callee.kind === 'Member' && callee.object.kind === 'Ident' && callee.object.name === 'String' && callee.prop === 'fromCharCode' && args.length === 1) {
      const argC = ctx.exprToC(args[0].expr, lines, depth);
      return `tsc_string_from_char_code(${argC})`;
    }

    // i32.parse(s), i32.tryParse(s), f64.parse(s), f64.tryParse(s)
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const typeName = callee.object.name;
      const primitiveMap = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                              'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                              'f32':'float','f64':'double',
                              'd8':'d8_t','d16':'d16_t','d32':'d32_t','d64':'d64_t' };
      if (typeName in primitiveMap) {
        const ctype = (primitiveMap as Record<string, string>)[typeName];
        const ident = ctx.cTypeToIdent(ctype);
        if (callee.prop === 'parse') {
          const argC = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          ctx._lastSuppressConst = true; // parse() panics; result is non-const in C
          return `tsc_${ident}_parse(${argC})`;
        }
        if (callee.prop === 'tryParse') {
          ctx._ensureOptStruct(`opt_${ident}`, ctype);
          _setOptIsNullHint(args[0]?.expr);
          const argC = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_${ident}_try_parse(${argC})`;
        }
      }
    }

    // sleep()
    if (callee.kind === 'Ident' && callee.name === 'sleep') {
      const ms = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_sleep_awaitable(${ms})`;
    }

    // Method call on known object
    if (callee.kind === 'Member') {
      return ctx.methodCall(callee, args, lines, depth);
    }
    return null;
}
