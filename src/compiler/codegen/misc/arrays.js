// arrays.js
export default {
  arrayLitToC(node, _elemType, lines, depth) {
    const result = [];
    for (const e of node.elems) {
      if (e.spread) {
        // Expand spread from known array
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          const useData = sym.ctype?.startsWith('Array_');
          for (let i = 0; i < sym.arraySize; i++) {
            result.push(useData ? `${e.expr.name}.data[${i}]` : `${e.expr.name}[${i}]`);
          }
        } else {
          result.push(`/* ...${this.exprToC(e.expr, lines, depth)} */`);
        }
      } else {
        result.push(this.exprToC(e.expr, lines, depth));
      }
    }
    return result;
  },

  // Count the static size of an ArrayLit (expanding spread if possible)
  arrayLitSize(node) {
    let count = 0;
    for (const e of node.elems) {
      if (e.spread) {
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) count += sym.arraySize;
        else return -1; // unknown
      } else {
        count++;
      }
    }
    return count;
  },

  // Returns true if the expression will produce a heap-allocated String
  _isHeapStringInit(node) {
    if (!node) return false;
    if (node.kind === 'Binary' && node.op === '+') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      return lt === 'String' || rt === 'String';
    }
    if (node.kind === 'TemplateLit') {
      return node.parts.some(p => p.kind === 'expr');
    }
    if (node.kind === 'Call') {
      if (node.callee.kind === 'Ident' && node.callee.name === 'String') return true;
      // User-defined function call that heap-allocates its String return value
      if (node.callee.kind === 'Ident') {
        const sym = this.lookup(node.callee.name);
        if (sym?.ctype === 'String') {
          // Check the mangled name (accounting for overloads)
          const funcName = sym.funcName ?? node.callee.name;
          if (this._heapStringFuncs?.has(funcName)) return true;
          // Check overloads
          if (sym.overloads?.some(o => this._heapStringFuncs?.has(o.funcName))) return true;
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
          const objType = this.inferType(node.callee.object);
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
  },

  // Expand a TemplateLit node into a C expression (concat or format)
};
