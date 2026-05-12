// assign.js
export default {
  // Assignment
  assignToC(node, lines, depth) {
    // Generator .next() assignment: r = g.next() → r = genFn_next(&g, args);
    if (node.right?.kind === 'Call' && node.right.callee?.kind === 'Member'
        && node.right.callee.prop === 'next') {
      const objName = node.right.callee.object?.name;
      const sym = objName ? this.lookup(objName) : null;
      if (sym?._isGenState) {
        const { callExpr } = this._genNextCall(sym, this.exprToC(node.right.callee.object, lines, depth));
        const leftC = this.exprToC(node.left, lines, depth);
        return `${leftC} ${node.op || '='} ${callExpr}`;
      }
    }
    // Prevent assignment to arr.length or arr.capacity
    if (node.left.kind === 'Member' && node.left.object.kind === 'Ident') {
      const arrSym = this.lookup(node.left.object.name);
      if (arrSym?.isArray) {
        if (node.left.prop === 'length') {
          throw this.error(`cannot assign to "length"; use "${node.left.object.name}.resize(n)" instead`, node);
        }
        if (node.left.prop === 'capacity') {
          throw this.error(`cannot assign to "capacity"; use "${node.left.object.name}.reallocate(n)" instead`, node);
        }
      }
      // Check readonly field write outside constructor
      const objSym = this.lookup(node.left.object.name);
      if (objSym?.ctype) {
        const classDef = this.classes.get(objSym.ctype);
        const field = classDef?.fields?.find(f => f.name === node.left.prop);
        if (field?.modifiers?.includes('readonly')) {
          // We are inside the constructor if currentFuncName is 'new' (before mangling) and self.ctype matches
          const thisSym = this.lookup('this') ?? this.lookup('self');
          const inCtor = this.currentFuncName === 'new' && thisSym?.ctype === objSym.ctype;
          if (!inCtor) {
            throw this.error(`cannot assign to readonly field "${node.left.prop}" outside the constructor`, node);
          }
        }
      }
    }
    // Check readonly tuple assignment: t[n] = ...
    if (node.left.kind === 'Index' && node.left.object.kind === 'Ident') {
      const sym = this.lookup(node.left.object.name);
      const tupleDef = sym?.ctype ? this.classes.get(sym.ctype) : null;
      if (tupleDef?.readonly) throw this.error('cannot assign to readonly tuple element', node);
    }
    if (node.left.kind === 'Ident') {
      const sym = this.lookup(node.left.name);
      if (sym && sym.varKind === 'const') {
        throw this.error(`cannot assign to 'const' variable '${node.left.name}'`, node, {
          label: 'cannot assign to const',
          help: [`change \`const\` to \`let\` if this variable needs to be mutable`],
          code: 'E001',
        });
      }
      // String literal union: convert string literal to enum value
      if (sym && node.right?.kind === 'Literal' && node.right.litType === 'string') {
        const enumDef = this.classes.get(sym.ctype);
        if (enumDef?.isStringLiteralUnion) {
          const val = node.right.value;
          if (!enumDef.members.includes(val)) {
            throw this.error(`"${val}" is not a valid value for type ${sym.ctype}`, node);
          }
          const l = this.exprToC(node.left, lines, depth);
          return `${l} ${node.op} ${sym.ctype}_${val}`;
        }
      }
    }
    const l = this.exprToC(node.left, lines, depth);
    // Type-directed literal emit: float field = 1.0 → 1.0f
    let r;
    if (node.right?.kind === 'Literal' && node.right.litType === 'number' && node.op === '=') {
      const leftType = this.inferType(node.left);
      if (leftType === 'float' || leftType === 'double') {
        r = this.literalToCTyped(node.right, leftType);
      }
    }
    if (r === undefined) r = this.exprToC(node.right, lines, depth);

    // >>>= → x = (int32_t)((uint32_t)x >> r)
    if (node.op === '>>>=') {
      return `${l} = (int32_t)((uint32_t)${l} >> ${r})`;
    }

    // **= → x = pow(x, r)
    if (node.op === '**=') {
      this.includes.add('#include <math.h>');
      return `${l} = pow(${l}, ${r})`;
    }
    // ??= → if (!x.has_value) { x = (opt_T){true, rhs}; }
    if (node.op === '??=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const optType = sym?.ctype;
      if (optType?.startsWith('opt_')) {
        if (sym) sym.optIsNull = false; // after ??=, variable is guaranteed to have a value
        return `if (!${l}.has_value) { ${l} = (${optType}){true, ${r}}; }`;
      }
      return `${l} = ${l} ?? ${r}`;
    }
    // &&= / ||= → JS semantics with temp
    if (node.op === '&&=' || node.op === '||=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const lt = sym?.ctype ?? 'int32_t';
      const tmp = `_tsc_lhs`;
      const I = ' '.repeat(this.indent * depth);
      if (node.op === '&&=') {
        return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${r} : ${tmp}; }`;
      } else {
        return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${tmp} : ${r}; }`;
      }
    }

    return `${l} ${node.op} ${r}`;
  }
};
