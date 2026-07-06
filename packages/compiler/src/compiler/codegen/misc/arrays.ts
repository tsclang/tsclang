import type { ArrayLit, Expression, Ident } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';
import { isDecimal, resolveDecimalBase } from '../types/decimal.js';
// arrays.ts
export function arrayLitToC(ctx: CodeGenContext, node: ArrayLit, _elemType: string, lines: string[], depth: number) {
    const result: string[] = [];
    const _prevET = ctx._expectedType;
    const _decElem = resolveDecimalBase(ctx, _elemType);
    if (_decElem) ctx._expectedType = _decElem;
    for (const e of node.elems) {
      if (e.spread) {
        const sym = e.expr?.kind === 'Ident' ? ctx.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          const useData = sym.ctype?.startsWith('Array_');
          for (let i = 0; i < sym.arraySize; i++) {
            result.push(useData ? `${(e.expr as Ident).name}.data[${i}]` : `${(e.expr as Ident).name}[${i}]`);
          }
        } else {
          result.push(`/* ...${ctx.exprToC(e.expr, lines, depth)} */`);
        }
      } else {
        let c = ctx.exprToC(e.expr, lines, depth);
        if (_elemType === 'tsc_unknown') {
          const _argType = ctx.inferType(e.expr);
          if (_argType !== 'tsc_unknown') {
            ctx._ensureUnknownStruct();
            const _packer = ctx._unknownPackerFor(_argType);
            c = `${_packer}(${c})`;
          }
        }
        if (ctx._isOptType(_elemType)) {
          c = ctx._wrapOptValue(c, e.expr, _elemType);
        }
        result.push(c);
      }
    }
    ctx._expectedType = _prevET;
    return result;
}

  // Count the static size of an ArrayLit (expanding spread if possible)
export function arrayLitSize(ctx: CodeGenContext, node: ArrayLit) {
    let count = 0;
    for (const e of node.elems) {
      if (e.spread) {
        const sym = e.expr?.kind === 'Ident' ? ctx.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) count += sym.arraySize;
        else return -1; // unknown
      } else {
        count++;
      }
    }
    return count;
}

  // Returns true if the expression will produce a heap-allocated String
export function _isHeapStringInit(ctx: CodeGenContext, node: Expression | null) {
    if (!node) return false;
    if (node.kind === 'Binary' && node.op === '+') {
      const lt = ctx.inferType(node.left);
      const rt = ctx.inferType(node.right);
      return lt === 'String' || rt === 'String';
    }
    if (node.kind === 'TemplateLit') {
      return node.parts.some((p: unknown) => (p as { kind?: string }).kind === 'expr');
    }
    if (node.kind === 'Call') {
      if (node.callee.kind === 'Ident' && node.callee.name === 'String') return true;
      // User-defined function call that heap-allocates its String return value
      if (node.callee.kind === 'Ident') {
        const sym = ctx.lookup(node.callee.name);
        if (sym?.ctype === 'String') {
          // Check the mangled name (accounting for overloads)
          const funcName = sym.funcName ?? node.callee.name;
          if (ctx._heapStringFuncs?.has(funcName)) return true;
          // Check overloads
          if (sym.overloads?.some((o: { funcName: string }) => ctx._heapStringFuncs?.has(o.funcName))) return true;
        }
      }
      if (node.callee.kind === 'Member') {
        const prop = node.callee.prop;
        // Methods that return heap-allocated String
        const heapStringProps = new Set([
          'toString', 'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd',
          'repeat', 'replace', 'replaceAll', 'padStart', 'padEnd', 'charAt',
          'slice', 'substring', 'concat',
        ]);
        if (heapStringProps.has(prop)) {
          const objType = ctx.inferType(node.callee.object);
          // String.toString() is a no-op — not heap allocated
          if (prop === 'toString' && objType === 'String') return false;
          // Only heap if called on a String object
          if (objType === 'String') return true;
          // toString() on any non-string type is also heap
          if (prop === 'toString') return true;
        }
      }
    }
    return false;
}

  // Expand a TemplateLit node into a C expression (concat or format)
