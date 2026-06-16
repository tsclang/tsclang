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
          const thisSym = this.lookup('this') ?? this.lookup('self');
          const inCtor = this.currentFuncName === 'new' && thisSym?.ctype === objSym.ctype;
          if (!inCtor) {
            throw this.error(`cannot assign to readonly field "${node.left.prop}" outside the constructor`, node);
          }
        }
      }
      // Borrow check: cannot mutate field while an immutable borrow is active
      if ((objSym?._refBorrowCount || 0) > 0) {
        throw this.error(`cannot mutate '${node.left.object.name}' while a borrow is active`, node);
      }
      // Mut quarantine: cannot access field while a mutable borrow return is active
      if (objSym?._mutQuarantined) {
        throw this.error(`cannot access '${node.left.object.name}' while a mutable borrow is active`, node);
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
    // Weak<T> assignment: w = new Weak<T>(src) → w = tsc_weak_create(src)
    if (node.left.kind === 'Ident' && node.op === '=') {
      const sym = this.lookup(node.left.name);
      if (sym?.isWeak && node.right?.kind === 'New' && node.right.name === 'Weak') {
        const argC = node.right.args?.[0] ? this.exprToC(node.right.args[0].expr ?? node.right.args[0], lines, depth) : 'NULL';
        return `${node.left.name} = tsc_weak_create(${argC})`;
      }
    }
    // unknown reassignment: drop old, pack new
    if (node.left.kind === 'Ident' && node.op === '=') {
      const sym = this.lookup(node.left.name);
      if (sym?.ctype === 'tsc_unknown') {
        this._ensureUnknownStruct();
        const rightCtype = this.inferType(node.right);
        const r = this.exprToC(node.right, lines, depth);
        const I = ' '.repeat(this.indent * depth);
        lines.push(`${I}tsc_unknown_drop(&${node.left.name});`);
        if (rightCtype === 'tsc_unknown') {
          lines.push(`${I}${node.left.name} = ${r};`);
        } else {
          const packer = this._unknownPackerFor(rightCtype);
          lines.push(`${I}${node.left.name} = ${packer}(${r});`);
        }
        return null;
      }
    }
    // null assignment: compile error for non-nullable, compound literal for opt_T
    if (node.op === '=' && node.right?.kind === 'Literal' && node.right.litType === 'null') {
      const leftSym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const leftCtype = leftSym?.ctype;
      if (leftCtype && !leftCtype.startsWith('opt_') && leftCtype !== 'void *' && leftCtype !== 'tsc_unknown' && !leftCtype.endsWith(' *')) {
        throw this.error(`cannot assign null to non-nullable type`, node);
      }
      if (leftCtype?.startsWith('opt_')) {
        if (leftSym) leftSym.optIsNull = true;
        let l;
        if (node.left.kind === 'Ident' && this._narrowedVars?.has(node.left.name)) {
          l = node.left.name;
        } else {
          l = this.exprToC(node.left, lines, depth);
        }
        return `${l} = (${leftCtype}){false, 0}`;
      }
    }
    // Narrowing LHS fix: use variable name directly for narrowed opt_ Ident
    let l;
    if (node.left.kind === 'Ident' && this._narrowedVars?.has(node.left.name)) {
      l = node.left.name;
    } else {
      l = this.exprToC(node.left, lines, depth);
    }
    // Type-directed literal emit: float field = 1.0 → 1.0f
    let r;
    if (node.right?.kind === 'Literal' && node.right.litType === 'number' && node.op === '=') {
      const leftType = this.inferType(node.left);
      if (leftType === 'float' || leftType === 'double') {
        r = this.literalToCTyped(node.right, leftType);
      }
    }
    if (r === undefined) r = this.exprToC(node.right, lines, depth);

    // Move tracking for `b = a` where a is Ident of owned type (opt_ref_, heap ptr, or struct)
    if (node.op === '=' && node.left.kind === 'Ident' && node.right?.kind === 'Ident' && node.left.name !== node.right.name) {
      const rightSym = this.lookup(node.right.name);
      const leftSym = this.lookup(node.left.name);
      const rightCtype = rightSym?.ctype;
      if (rightCtype && rightCtype.startsWith('opt_ref_')) {
        if (rightSym._moved) {
          throw this.error(`use of moved value: "${node.right.name}"`, node.right, { code: 'E002' });
        }
        if (rightSym.varKind === 'const') {
          throw this.error(`cannot move out of "const" binding`, null, { code: 'E003' });
        }
        rightSym._moved = true;
        rightSym._movedLine = node.line;
        rightSym._movedSourceNode = node.right;
        if (rightSym.varKind === 'let') {
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}${node.right.name} = (${rightCtype}){false, NULL, -1};`);
        }
      } else if (rightSym?._isHeap) {
        if (rightSym._moved) {
          throw this.error(`use of moved value: "${node.right.name}"`, node.right, { code: 'E002' });
        }
        if (rightSym.varKind === 'const') {
          throw this.error(`cannot move out of "const" binding`, null, { code: 'E003' });
        }
        rightSym._moved = true;
        rightSym._movedLine = node.line;
        rightSym._movedSourceNode = node.right;
        if (rightSym.varKind === 'let') {
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}${node.right.name} = NULL;`);
        }
      }
    }

    // opt_T value/null assignment: wrap in compound literal
    if (node.op === '=' && node.left.kind === 'Ident') {
      const leftSym = this.lookup(node.left.name);
      const leftCtype = leftSym?.ctype;
      if (leftCtype?.startsWith('opt_') && !(node.right?.kind === 'Literal' && node.right.litType === 'null')) {
        const rightType = this.inferType(node.right);
        if (rightType !== leftCtype) {
          leftSym.optIsNull = false;
          r = `(${leftCtype}){true, ${r}}`;
        }
      }
    }

    // Member assign of struct {0} → need (Type){0} compound literal for valid C
    if (node.left.kind === 'Member' && r === '{0}' && node.op === '=') {
      const leftType = this.inferType(node.left);
      if (leftType && leftType !== 'int32_t' && this.classes.has(leftType)) {
        r = `(${leftType}){0}`;
      }
    }

    // >>>= → x = (int32_t)((uint32_t)x >> r)
    if (node.op === '>>>=') {
      if (node.left.kind === 'Ident') return `${l} = (int32_t)((uint32_t)${l} >> ${r})`;
      const lt2 = this.inferType(node.left) ?? 'int32_t';
      const ptr = `_tsc_ptr_${this.tempCount++}`;
      const I = ' '.repeat(this.indent * depth);
      lines.push(`${I}{ ${lt2} *${ptr} = &(${l}); *${ptr} = (int32_t)((uint32_t)*${ptr} >> ${r}); }`);
      return null;
    }

    // **= → x = pow(x, r)
    if (node.op === '**=') {
      this.includes.add('#include <math.h>');
      if (node.left.kind === 'Ident') return `${l} = pow(${l}, ${r})`;
      const lt2 = this.inferType(node.left) ?? 'double';
      const ptr = `_tsc_ptr_${this.tempCount++}`;
      const I = ' '.repeat(this.indent * depth);
      lines.push(`${I}{ ${lt2} *${ptr} = &(${l}); *${ptr} = pow(*${ptr}, ${r}); }`);
      return null;
    }
    // ??= → if (!x.has_value) { x = (opt_T){true, rhs}; }
    if (node.op === '??=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const optType = sym?.ctype;
      if (optType?.startsWith('opt_')) {
        if (sym) sym.optIsNull = false;
        if (node.left.kind === 'Ident') return `if (!${l}.has_value) { ${l} = (${optType}){true, ${r}}; }`;
        const ptr = `_tsc_ptr_${this.tempCount++}`;
        const I = ' '.repeat(this.indent * depth);
        lines.push(`${I}{ ${optType} *${ptr} = &(${l}); if (!(*${ptr}).has_value) { *${ptr} = (${optType}){true, ${r}}; } }`);
        return null;
      }
      return `${l} = ${l} ?? ${r}`;
    }
    // &&= / ||= → JS semantics with temp
    if (node.op === '&&=' || node.op === '||=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const lt = sym?.ctype ?? 'int32_t';
      const tmp = `_tsc_lhs`;
      if (node.left.kind === 'Ident') {
        if (node.op === '&&=') {
          return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${r} : ${tmp}; }`;
        } else {
          return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${tmp} : ${r}; }`;
        }
      }
      const ptr = `_tsc_ptr_${this.tempCount++}`;
      const I = ' '.repeat(this.indent * depth);
      if (node.op === '&&=') {
        lines.push(`${I}{ ${lt} *${ptr} = &(${l}); ${lt} ${tmp} = *${ptr}; *${ptr} = (${tmp}) ? ${r} : ${tmp}; }`);
      } else {
        lines.push(`${I}{ ${lt} *${ptr} = &(${l}); ${lt} ${tmp} = *${ptr}; *${ptr} = (${tmp}) ? ${tmp} : ${r}; }`);
      }
      return null;
    }

    let leftType;
    if (node.left.kind === 'Ident' && this._narrowedVars?.has(node.left.name)) {
      const leftSym = this.lookup(node.left.name);
      leftType = leftSym?.ctype ?? 'int32_t';
    } else {
      leftType = this.inferType(node.left);
    }

    // += for string: s += "x" → eval concat first, release old, assign (ownership transfer)
    if (node.op === '+=' && leftType === 'String') {
      const I = ' '.repeat(this.indent * depth);
      if (node.left.kind === 'Ident') {
        lines.push(`${I}{ String _tsc_tmp = ${r}; tsc_string_release(${l}); ${l} = _tsc_tmp; }`);
      } else {
        const ptr = `_tsc_ptr_${this.tempCount++}`;
        lines.push(`${I}{ String *${ptr} = &(${l}); String _tsc_tmp = ${r}; tsc_string_release(*${ptr}); *${ptr} = _tsc_tmp; }`);
      }
      return null;
    }

    // String property/array assign: safe temp pattern to avoid a.p = a.p destroying before retain
    if (node.op === '=' && leftType === 'String' &&
        (node.left.kind === 'Member' || node.left.kind === 'Index')) {
      if (l === r) return null;
      const I = ' '.repeat(this.indent * depth);
      if (node.left.kind === 'Index') {
        const ptr = `_tsc_ptr_${this.tempCount++}`;
        lines.push(`${I}{ String *${ptr} = &(${l}); String _tsc_tmp = ${r}; tsc_string_retain(_tsc_tmp); tsc_string_release(*${ptr}); *${ptr} = _tsc_tmp; }`);
      } else {
        lines.push(`${I}{ String _tsc_tmp = ${r}; tsc_string_retain(_tsc_tmp); tsc_string_release(${l}); ${l} = _tsc_tmp; }`);
      }
      return null;
    }

    const intTypes = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','char','bool']);
    if (node.op === '+=' || node.op === '-=' || node.op === '*=') {
      if (this._strictRules?.has('safe-arith')) {
        if (intTypes.has(leftType)) {
          throw this.error(`integer arithmetic may overflow at runtime (safe-arith); use Math.checkedAdd/Sub/Mul or guard manually`, node);
        }
      }
    }
    if (node.op === '/=' || node.op === '%=') {
      const leftType = this.inferType(node.left);
      if (this._strictRules?.has('safe-div') && intTypes.has(leftType)) {
        throw this.error(`integer division may panic at runtime (safe-div); guard with 'if (y != 0)' or use a safe division function`, node);
      }
      if (intTypes.has(leftType) && lines) {
        const I = ' '.repeat(this.indent * depth);
        const tmp = `_tsc_div_${this.tempCount++}`;
        const panicExpr = this._strictRules?.has('no-abort')
          ? '_tsc_on_panic("division by zero")'
          : 'abort()';
        lines.push(`${I}int32_t ${tmp} = ${r};`);
        lines.push(`${I}if (${tmp} == 0) { fprintf(stderr, "panic: division by zero\\n"); ${panicExpr}; }`);
        const minMap = { 'int32_t': 'INT32_MIN', 'int64_t': 'INT64_MIN' };
        const minConst = minMap[leftType];
        if (minConst) {
          const overflowPanic = this._strictRules?.has('no-abort')
            ? '_tsc_on_panic("integer overflow")'
            : 'abort()';
          lines.push(`${I}if (${tmp} == -1 && ${l} == ${minConst}) { fprintf(stderr, "panic: integer overflow\\n"); ${overflowPanic}; }`);
        }
        return `${l} ${node.op} ${tmp}`;
      }
    }

    const bitwiseAssignOps = ['&=', '|=', '^=', '<<=', '>>='];
    if (bitwiseAssignOps.includes(node.op)) {
      const leftType = this.inferType(node.left);
      const rightType = this.inferType(node.right);
      const NUMERIC = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','double','float','char','size_t','bool']);
      if (!NUMERIC.has(leftType) || !NUMERIC.has(rightType)) {
        const tsName = (t) => t === 'String' ? 'string' : t === 'void *' ? 'null' : t;
        throw this.error(`TypeError: bitwise op '${node.op}' not applicable to '${tsName(leftType)}' and '${tsName(rightType)}'`, node);
      }
      const leftIsFloat = leftType === 'double' || leftType === 'float';
      const rightIsFloat = (rightType === 'double' || rightType === 'float') && this._hasFloatVar(node.right);
      if ((leftIsFloat || rightIsFloat) && lines) {
        const rawOp = node.op[0];
        return `${l} = (${leftType})(((int32_t)(${l})) ${rawOp} ((int32_t)(${r})))`;
      }
    }

    // Compound assignment widening check (#42)
    const compoundBinOps = { '+=':'+', '-=':'-', '*=':'*', '/=':'/', '%=':'%',
                             '&=':'&', '|=':'|', '^=':'^', '<<=':'<<', '>>=':'>>' };
    const binOp = compoundBinOps[node.op];
    if (binOp) {
      const binNode = { kind: 'Binary', op: binOp, left: node.left, right: node.right };
      const resultType = this._effectiveType(binNode);
      const si = this._numericTypeInfo(resultType);
      const di = this._numericTypeInfo(leftType);
      if (si && di && !this._isSafeWidening(resultType, leftType)) {
        const srcTs = this.ctypeToTsName(resultType);
        const dstTs = this.ctypeToTsName(leftType);
        throw this.error(`cannot implicitly convert ${srcTs} to ${dstTs} in '${node.op}': use "as ${dstTs}" or explicit assignment`);
      }
    }

    // Numeric type conversion check for simple assignment
    if (node.op === '=') {
      // Float literal with fractional part → integer type
      if (node.right?.kind === 'Literal' && node.right.litType === 'number') {
        const fval = parseFloat(node.right.value.replace(/_/g, ''));
        if (!Number.isInteger(fval)) {
          const di = this._numericTypeInfo(leftType);
          if (di && di.kind === 'int') {
            const dstTs = this.ctypeToTsName(leftType);
            throw this.error(`float literal ${node.right.value} assigned to integer type ${dstTs} — fractional part will be lost\nhint: use '${node.right.value} as ${dstTs}' for explicit truncation, or Math.trunc(${node.right.value})`);
          }
        }
      }
      // Safe widening check for non-literal expressions
      const isNumLit = (node.right?.kind === 'Literal' && node.right?.litType === 'number')
        || (node.right?.kind === 'Unary' && node.right?.op === '-'
          && node.right?.expr?.kind === 'Literal' && node.right?.expr?.litType === 'number');
      if (!isNumLit) {
        const rightType = this._effectiveType(node.right);
        const si = this._numericTypeInfo(rightType);
        const di = this._numericTypeInfo(leftType);
        if (si && di && !this._isSafeWidening(rightType, leftType)) {
          const srcTs = this.ctypeToTsName(rightType);
          const dstTs = this.ctypeToTsName(leftType);
          throw this.error(`cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"`);
        }
      }
    }

    if (node.op === '+=' || node.op === '-=' || node.op === '*=') {
      const signedIntSet = new Set(['int8_t', 'int16_t', 'int32_t', 'int64_t']);
      if (signedIntSet.has(leftType)) {
        const uType = leftType.replace('int', 'uint');
        const baseOp = node.op[0];
        return `${l} = (${leftType})((${uType})${l} ${baseOp} (${uType})${r})`;
      }
    }

    return `${l} ${node.op} ${r}`;
  }
};
