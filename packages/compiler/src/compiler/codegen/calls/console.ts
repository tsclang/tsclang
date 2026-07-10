import type { Argument, Expression, Literal } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
export function consoleCall(ctx: CodeGenContext, method: string, args: Argument[], lines: string[], depth: number) {
    if (method === 'time') {
      const label = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("default")';
      return `tsc_console_time(${label})`;
    }
    if (method === 'timeEnd') {
      const label = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("default")';
      return `tsc_console_time_end(${label})`;
    }
    if (method === 'trace') {
      if (ctx._cap('os') === false || ctx._isWasmBare()) {
        throw ctx.error(`"console.trace()" is not available on ${ctx._targetName} targets`);
      }
      const label = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_console_trace(${label})`;
    }

    const isErr = method === 'error' || method === 'warn' || method === 'debug';

    if (args.length === 0) {
      return isErr ? 'fprintf(stderr, "\\n")' : 'printf("\\n")';
    }

    const fmtParts: string[] = [];
    const fmtArgs: string[] = [];
    let needSpace = false;

    for (const arg of args) {
      const expr  = arg.expr;
      let ctype = ctx.inferType(expr);

      if (expr.kind === 'Literal' && expr.litType === 'string') {
        fmtParts.push(expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%'));
        continue;
      }

      // Unwrap throws function calls: store Result, check ok, use .value
      let unwrapRes: string | null = null;
      if (expr.kind === 'Call' && expr.callee?.kind === 'Ident') {
        const calleeSym = ctx.lookup(expr.callee.name);
        if (calleeSym?._isThrowsFunc && ctype?.startsWith('Result_')) {
          const I = ' '.repeat(ctx.indent * depth);
          unwrapRes = `_unwrap_${ctx.tempCount++}`;
          const callC = ctx.exprToC(expr, lines, depth);
          lines.push(`${I}${calleeSym._resultType} ${unwrapRes} = ${callC};`);
          lines.push(`${I}if (!${unwrapRes}.ok) { tsc_panic("E409", ${ctx._panicMsgExpr(unwrapRes, calleeSym._resultErrTypes)}); }`);
          ctype = calleeSym._resultValueType ?? 'int32_t';
        }
      }

      if (expr.kind === 'Binary' && expr.op === '+' && ctx.isStringExpr(expr)) {
        const flattenConcat = (n: Expression): Expression[] => {
          if (n.kind === 'Binary' && n.op === '+' && ctx.isStringExpr(n)) {
            return [...flattenConcat(n.left), ...flattenConcat(n.right)];
          }
          return [n];
        };
        const segments = flattenConcat(expr);
        // Only flatten when every segment is a string literal (safe to merge into format string)
        if (segments.every((seg: Expression) => seg.kind === 'Literal' && (seg.litType === 'string' || seg.litType === 'char'))) {
          let concatFmt = '';
          for (const seg of segments) {
            concatFmt += (seg as Literal).value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
          }
          fmtParts.push(concatFmt);
          continue;
        }
        // Mixed concat (e.g. "x=" + num): fall through to the general String path
        // which creates a temp variable and emits tsc_string_release
      }

      if (expr.kind === 'Typeof') {
        const _tofSym = expr.expr.kind === 'Ident' ? ctx.lookup(expr.expr.name) : null;
        const _tofCt = _tofSym?.ctype ?? ctx.inferType(expr.expr);
        fmtParts.push(ctx.ctypeToTsName(_tofCt));
        continue;
      }

      if (ctx.isBareLiteralNumber(expr)) {
        const v = ctx.bareNumberValue(expr);
        fmtParts.push('%s');
        fmtArgs.push(`tsc_dtoa(${v})`);
        continue;
      }

      const cexpr = unwrapRes ? `${unwrapRes}.value` : ctx.exprToC(expr, lines, depth);

      if (expr.kind === 'Binary' && ['&','|','^','<<','>>','>>>'].includes(expr.op)) {
        const hasTypedVar = (n: Expression | null): boolean => {
          if (!n) return false;
          if (n.kind === 'Ident') {
            const s = ctx.lookup(n.name);
            return s?.ctype != null && s.ctype !== 'double' && s.ctype !== 'void *';
          }
          if (n.kind === 'Binary') return hasTypedVar(n.left) || hasTypedVar(n.right);
          return false;
        };
        if (hasTypedVar(expr)) {
          if (ctx._cap('bits') < 32) { fmtParts.push('%ld'); fmtArgs.push(`(long)${cexpr}`); }
          else { fmtParts.push('%d'); fmtArgs.push(cexpr); }
        } else {
          fmtParts.push('%s');
          fmtArgs.push(`tsc_dtoa((double)(${cexpr}))`);
        }
        continue;
      }

      if (ctype?.endsWith(' *') && !ctype.startsWith('void') && !ctype.startsWith('const char')) {
        const sym = expr.kind === 'Ident' ? ctx.lookup(expr.name) : null;
        const derefType = sym?.derefType ?? ctype.replace(/^(const )?/, '').replace(/ \*$/, '');
        if (derefType === 'String') {
          fmtParts.push('%s');
          fmtArgs.push(`${cexpr}->data`);
        } else if (derefType === 'double' || derefType === 'float') {
          fmtParts.push('%s');
          fmtArgs.push(`tsc_dtoa(*${cexpr})`);
        } else if (derefType === 'int64_t') {
          if (ctx._strictRules?.has('no-i64-print') || ctx._cap('bits') < 32) {
            throw ctx.error('i64/u64 values cannot be printed (no-i64-print)', expr);
          }
          fmtParts.push('%lld');
          fmtArgs.push(`(long long)*${cexpr}`);
        } else if (derefType === 'bool') {
          fmtParts.push('%s');
          fmtArgs.push(`*${cexpr} ? "true" : "false"`);
        } else {
          if (ctx._cap('bits') < 32) { fmtParts.push('%ld'); fmtArgs.push(`(long)*${cexpr}`); }
          else { fmtParts.push('%d'); fmtArgs.push(`*${cexpr}`); }
        }
        continue;
      }

      if (ctype === 'String') {
        if (ctx._cap('allocator') !== 'heap') {
          if (fmtParts.length > 0) {
            fmtParts.push('');
            const flushFmt = '"' + fmtParts.join(' ') + '"';
            const flushArgs = fmtArgs.length > 0 ? [flushFmt, ...fmtArgs].join(', ') : flushFmt;
            const I = ' '.repeat(ctx.indent * depth);
            lines.push(`${I}${isErr ? 'fprintf(stderr, ' : 'printf('}${flushArgs});`);
            fmtParts.length = 0;
            fmtArgs.length = 0;
          }
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}tsc_print_str(${cexpr});`);
          continue;
        }
        const strSym = expr.kind === 'Ident' ? ctx.lookup(expr.name) : null;
        if (strSym?.isStringRef) {
          fmtParts.push('%.*s');
          fmtArgs.push(`(int)${cexpr}.length`, `${cexpr}.data`);
        } else if (ctx._isHeapStringInit(expr)) {
          const tmp = `_tmp_${ctx.tempCount++}`;
          const I = ' '.repeat(ctx.indent * depth);
          const cexprStr = cexpr;
          lines.push(`${I}String ${tmp} = ${cexprStr};`);
          ctx._pushPostStmtCleanup(`${I}tsc_string_release(${tmp});`);
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
        const needsParens = expr.kind === 'Ident' || expr.kind === 'Member' || expr.kind === 'Unary' ||
                            expr.kind === 'Binary' || expr.kind === 'Ternary' || expr.kind === 'Assign';
        fmtArgs.push(`${needsParens ? `(${cexpr})` : cexpr} ? "true" : "false"`);
      } else if (ctype === 'double') {
        fmtParts.push('%s');
        fmtArgs.push(`tsc_dtoa((double)(${cexpr}))`);
      } else if (ctype === 'float') {
        fmtParts.push('%s');
        fmtArgs.push(`tsc_dtoa((double)${cexpr})`);
      } else if (ctype === 'd8_t' || ctype === 'd16_t' || ctype === 'd32_t' || ctype === 'd64_t') {
        fmtParts.push('%s');
        const decScales: Record<string, [number, number]> = {
          'd8_t': [100, 2], 'd16_t': [100, 2], 'd32_t': [10000, 4], 'd64_t': [100000000, 8],
        };
        const [scale, dp] = decScales[ctype];
        fmtArgs.push(`tsc_dec_dtoa((int64_t)(${cexpr}), ${scale}, ${dp})`);
      } else if (ctype === 'int64_t') {
        if (ctx._strictRules?.has('no-i64-print') || ctx._cap('bits') < 32) {
          throw ctx.error('i64/u64 values cannot be printed (no-i64-print)', expr);
        }
        fmtParts.push('%lld');
        fmtArgs.push(`(long long)${cexpr}`);
      } else if (ctype === 'uint64_t') {
        if (ctx._strictRules?.has('no-i64-print') || ctx._cap('bits') < 32) {
          throw ctx.error('i64/u64 values cannot be printed (no-i64-print)', expr);
        }
        fmtParts.push('%llu');
        fmtArgs.push(`(unsigned long long)${cexpr}`);
      } else if (ctype === 'uint8_t' || ctype === 'uint16_t') {
        fmtParts.push('%u');
        fmtArgs.push(`(unsigned)${cexpr}`);
      } else if (ctype === 'uint32_t') {
        if (ctx._cap('bits') < 32) { fmtParts.push('%lu'); fmtArgs.push(`(unsigned long)${cexpr}`); }
        else { fmtParts.push('%u'); fmtArgs.push(cexpr); }
      } else if (ctype === 'int8_t' || ctype === 'int16_t') {
        fmtParts.push('%d');
        fmtArgs.push(`(int)${cexpr}`);
      } else if (ctype === 'char') {
        fmtParts.push('%c');
        fmtArgs.push(cexpr);
      } else if (ctype === 'size_t') {
        if (ctx._cap('bits') < 32) { fmtParts.push('%u'); fmtArgs.push(`(unsigned)${cexpr}`); }
        else { fmtParts.push('%zu'); fmtArgs.push(cexpr); }
      } else {
        if (ctype.startsWith('opt_ref_')) {
          const innerIdent = ctype.slice(8);
          const innerCType = ctx._arrIdentToCType(innerIdent);
          const sym2 = expr.kind === 'Ident' ? ctx.lookup(expr.name) : null;
          if (sym2?.optIsNull) {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? "some" : "null"`);
          } else if (innerCType === 'String') {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? ${cexpr}.value->data : "null"`);
          } else if (innerCType === 'double' || innerCType === 'float') {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? tsc_dtoa((double)(*${cexpr}.value)) : "null"`);
          } else {
            if (ctx._cap('bits') < 32) { fmtParts.push('%ld'); fmtArgs.push(`(long)(${cexpr}.has_value ? *${cexpr}.value : -1)`); }
            else { fmtParts.push('%d'); fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1`); }
          }
          continue;
        }
        if (ctype.startsWith('opt_')) {
          const innerIdent = ctype.slice(4);
          const ed = ctx.classes.get(innerIdent);
          const sym2 = expr.kind === 'Ident' ? ctx.lookup(expr.name) : null;
          const isNullLiteral = expr.kind === 'Literal' && expr.litType === 'null';
          if (ed?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? (int)${cexpr}.value : -1`);
          } else if (sym2?.optIsNull || isNullLiteral || (() => {
              if (expr.kind === 'Index' && expr.object.kind === 'Ident' && expr.index.kind === 'Literal') {
                const tSym = ctx.lookup(expr.object.name);
                return tSym?.nullOptFields?.has(`_${expr.index.value}`);
              }
              return false;
            })()) {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? "some" : "null"`);
          } else if (innerIdent === 'string') {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? ${cexpr}.value.data : "null"`);
          } else {
            const innerCType = ctx._arrIdentToCType(innerIdent);
            let valExpr = cexpr;
            const isOptArrayIndex = expr.kind === 'Index' && (() => {
              const objType = expr.object ? ctx.inferType(expr.object) : null;
              return objType?.startsWith('Array_opt_');
            })();
            if (isOptArrayIndex) {
              if (needSpace) { lines.push('printf(" ");'); needSpace = false; }
              const tmp = `_v_${ctx.tempCount++}`;
              lines.push(`${ctype} ${tmp} = ${cexpr};`);
              let valFmt;
              let valCast;
              if (innerCType === 'double' || innerCType === 'float') { valFmt = '%s'; valCast = `tsc_dtoa((double)${tmp}.value)`; }
              else if (innerCType === 'int64_t') { valFmt = '%lld'; valCast = `(long long)${tmp}.value`; }
              else if (innerCType === 'uint8_t' || innerCType === 'uint16_t') { valFmt = '%u'; valCast = `(unsigned)${tmp}.value`; }
              else if (ctx._cap('bits') < 32) { valFmt = '%ld'; valCast = `(long)${tmp}.value`; }
              else { valFmt = '%d'; valCast = `${tmp}.value`; }
              if (fmtParts.length > 0) {
                const prevFmt = '"' + fmtParts.join(' ') + ' "';
                if (fmtArgs.length === 0) lines.push(isErr ? `fprintf(stderr, ${prevFmt});` : `printf(${prevFmt});`);
                else lines.push(isErr ? `fprintf(stderr, ${prevFmt}, ${fmtArgs.join(', ')});` : `printf(${prevFmt}, ${fmtArgs.join(', ')});`);
                fmtParts.length = 0;
                fmtArgs.length = 0;
              }
              lines.push(`${tmp}.has_value ? printf("${valFmt}", ${valCast}) : printf("null");`);
              needSpace = true;
              continue;
            }
            if (expr.kind === 'Call') {
              const _calleeProp = expr.callee?.kind === 'Member' ? expr.callee.prop : null;
              const _tmpPfx = _calleeProp === 'at' ? '_at_' : '_v_';
              const tmp = `${_tmpPfx}${ctx.tempCount++}`;
              lines.push(`${ctype} ${tmp} = ${cexpr};`);
              valExpr = tmp;
            }
            if (innerCType === 'double' || innerCType === 'float') {
              fmtParts.push('%s');
              fmtArgs.push(`tsc_dtoa((double)(${valExpr}.value))`);
            } else if (innerCType === 'int64_t') {
              if (ctx._strictRules?.has('no-i64-print') || ctx._cap('bits') < 32) {
                throw ctx.error('i64/u64 values cannot be printed (no-i64-print)', expr);
              }
              fmtParts.push('%lld');
              fmtArgs.push(`(long long)${valExpr}.value`);
            } else if (innerCType === 'uint8_t' || innerCType === 'uint16_t') {
              fmtParts.push('%u');
              fmtArgs.push(`(unsigned)${valExpr}.value`);
            } else {
              if (ctx._cap('bits') < 32) { fmtParts.push('%ld'); fmtArgs.push(`(long)${valExpr}.value`); }
              else { fmtParts.push('%d'); fmtArgs.push(`${valExpr}.value`); }
            }
          }
          continue;
        } else {
          const enumDef = ctx.classes.get(ctype);
          if (enumDef?.isStringLiteralUnion) {
            fmtParts.push('%s');
            fmtArgs.push(`${ctype}_values[(int)${cexpr}]`);
          } else if (enumDef?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`(int)${cexpr}`);
          } else {
            if (ctx._cap('bits') < 32) { fmtParts.push('%ld'); fmtArgs.push(`(long)${cexpr}`); }
            else { fmtParts.push('%d'); fmtArgs.push(cexpr); }
          }
        }
      }
    }

    if (fmtParts.length === 0) {
      return isErr ? 'fprintf(stderr, "\\n")' : 'printf("\\n")';
    }
    if (needSpace) fmtParts[0] = ' ' + fmtParts[0];
    const fmt = '"' + fmtParts.join(' ') + '\\n"';
    if (fmtArgs.length === 0) {
      return isErr ? `fprintf(stderr, ${fmt})` : `printf(${fmt})`;
    }
    const allArgs = [fmt, ...fmtArgs].join(', ');
    return isErr ? `fprintf(stderr, ${allArgs})` : `printf(${allArgs})`;
}
