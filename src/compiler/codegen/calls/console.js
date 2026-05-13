export default {
  consoleCall(method, args, lines, depth) {
    if (method === 'time') {
      const label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("default")';
      return `tsc_console_time(${label})`;
    }
    if (method === 'timeEnd') {
      const label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("default")';
      return `tsc_console_time_end(${label})`;
    }
    if (method === 'trace') {
      if (this._isEmbedded()) {
        throw this.error(`"console.trace()" is not available on embedded targets`);
      }
      const label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `tsc_console_trace(${label})`;
    }

    const isErr = method === 'error' || method === 'warn' || method === 'debug';

    if (args.length === 0) {
      return isErr ? 'fprintf(stderr, "\\n")' : 'printf("\\n")';
    }

    const fmtParts = [];
    const fmtArgs  = [];

    for (const arg of args) {
      const expr  = arg.expr;
      const ctype = this.inferType(expr);

      if (expr.kind === 'Literal' && expr.litType === 'string') {
        fmtParts.push(expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%'));
        continue;
      }

      if (expr.kind === 'Binary' && expr.op === '+' && this.isStringExpr(expr)) {
        const flattenConcat = (n) => {
          if (n.kind === 'Binary' && n.op === '+' && this.isStringExpr(n)) {
            return [...flattenConcat(n.left), ...flattenConcat(n.right)];
          }
          return [n];
        };
        const segments = flattenConcat(expr);
        // Only flatten when every segment is a string literal (safe to merge into format string)
        if (segments.every(seg => seg.kind === 'Literal' && (seg.litType === 'string' || seg.litType === 'char'))) {
          let concatFmt = '';
          for (const seg of segments) {
            concatFmt += seg.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
          }
          fmtParts.push(concatFmt);
          continue;
        }
        // Mixed concat (e.g. "x=" + num): fall through to the general String path
        // which creates a temp variable and emits tsc_string_free
      }

      if (expr.kind === 'Typeof') {
        const _tofSym = expr.expr.kind === 'Ident' ? this.lookup(expr.expr.name) : null;
        const _tofCt = _tofSym?.ctype ?? this.inferType(expr.expr);
        fmtParts.push(this.ctypeToTsName(_tofCt));
        continue;
      }

      if (this.isBareLiteralNumber(expr)) {
        const v = this.bareNumberValue(expr);
        fmtParts.push('%g');
        fmtArgs.push(v);
        continue;
      }

      const cexpr = this.exprToC(expr, lines, depth);

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
          const tmp = `_tmp_${this.tempCount++}`;
          const I = ' '.repeat(this.indent * depth);
          const cexprStr = cexpr;
          lines.push(`${I}String ${tmp} = ${cexprStr};`);
          this._pushPostStmtCleanup(`${I}tsc_string_free(${tmp});`);
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
        if (ctype.startsWith('opt_ref_')) {
          const innerIdent = ctype.slice(8);
          const innerCType = this._arrIdentToCType(innerIdent);
          if (innerCType === 'double' || innerCType === 'float') {
            fmtParts.push('%g');
            fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1.0`);
          } else {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? *${cexpr}.value : -1`);
          }
          continue;
        }
        if (ctype.startsWith('opt_')) {
          const innerIdent = ctype.slice(4);
          const ed = this.classes.get(innerIdent);
          const sym2 = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
          if (ed?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? (int)${cexpr}.value : -1`);
          } else if (sym2?.optIsNull || (() => {
              if (expr.kind === 'Index' && expr.object.kind === 'Ident' && expr.index.kind === 'Literal') {
                const tSym = this.lookup(expr.object.name);
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
            const innerCType = this._arrIdentToCType(innerIdent);
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
};
