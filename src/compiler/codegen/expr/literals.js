// literals.js
export default {
  // Unescape a char literal value to numeric code
  _charCode(raw) {
    if (raw === '\\n') return 10;
    if (raw === '\\t') return 9;
    if (raw === '\\r') return 13;
    if (raw === '\\0') return 0;
    if (raw === '\\\\') return 92;
    if (raw === "\\'") return 39;
    if (raw === '\\"') return 34;
    if (raw.startsWith('\\x')) return parseInt(raw.slice(2), 16);
    if (raw.startsWith('\\u')) return parseInt(raw.slice(2), 16);
    if (raw.length === 1) {
      const code = raw.charCodeAt(0);
      if (code > 127) throw this.error('character literal must be a single ASCII byte');
      return code;
    }
    throw this.error('character literal must be a single ASCII byte');
  },

  literalToC(node) {
    if (node.litType === 'string') return `STR_LIT("${node.value.replace(/\\(?![ntr0'"\\abfv])/g, '\\\\').replace(/"/g, '\\"')}")`;
    if (node.litType === 'char')   return String(this._charCode(node.value)) + 'U';
    if (node.litType === 'bool')   return node.value;
    if (node.litType === 'null')   return 'NULL';
    const v = node.value;
    // Convert 0o (octal) → C octal 0NNN format
    if (v.startsWith('0o') || v.startsWith('0O')) return '0' + v.slice(2);
    // Binary and hex pass through (gcc supports 0b prefix)
    return v;
  },

  // Emit a number literal with the correct suffix for the given target C type
  literalToCTyped(node, ctype) {
    // Char literals: convert to numeric value
    if (node.litType === 'char') {
      const code = this._charCode(node.value);
      if (ctype === 'uint8_t' || ctype === 'char') return code + 'U';
      return String(code);
    }
    let v = node.value;
    // Convert 0o (octal) → C octal 0NNN format
    if (v.startsWith('0o') || v.startsWith('0O')) v = '0' + v.slice(2);
    if (ctype === 'float') {
      // f32: add 'f' suffix if no decimal, or if decimal without suffix
      if (v.startsWith('0x') || v.startsWith('0X')) return `(float)${v}`;
      const base = v.endsWith('f') ? v : v + (v.includes('.') ? 'f' : '.0f');
      return base;
    }
    if (ctype === 'double') {
      if (v.includes('.') || v.includes('e') || v.includes('E')) return v;
      return v + '.0';
    }
    if (ctype === 'int64_t') return v + 'LL';
    if (ctype === 'uint64_t') {
      const n = BigInt(v);
      if (n > 4294967295n) return v + 'ULL';
      return v + 'U';
    }
    if (ctype === 'uint32_t' || ctype === 'uint16_t' || ctype === 'uint8_t') return v + 'U';
    if (ctype === 'size_t') return v + 'U';  // usize literals always get U suffix
    return v;
  },

  // ----------------------------------------------------------------
  // Binary
  // ----------------------------------------------------------------
  // Get compile-time constant value of a const-literal variable or literal node (BigInt or null)
  constVal(node) {
    if (node.kind === 'Literal' && node.litType === 'number') {
      try { return BigInt(node.value.replace(/_/g, '')); } catch(_) { return null; }
    }
    if (node.kind === 'Unary' && node.op === '-') {
      const v = this.constVal(node.expr ?? node.operand);
      return v !== null ? -v : null;
    }
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      return sym?.constValue ?? null;
    }
    return null;
  },

  // For const-context mixed integer binary expressions: cast operands and result explicitly.
  // Returns null if not applicable.
  tryConstMixedBinary(node, targetCtype, lines, depth) {
    const lt = this.inferType(node.left);
    const rt = this.inferType(node.right);
    // Only applies to arithmetic ops with const operands (not let variables)
    const arithOps = ['+', '-', '*', '/', '%'];
    if (!arithOps.includes(node.op)) return null;
    const leftIsLet  = node.left.kind  === 'Ident' && this.lookup(node.left.name)?.varKind === 'let';
    const rightIsLet = node.right.kind === 'Ident' && this.lookup(node.right.name)?.varKind === 'let';
    if (leftIsLet || rightIsLet) return null; // let vars handled separately (error or binaryWidened)

    // i64 + u32 or u32 + i64
    if ((lt === 'int64_t' && rt === 'uint32_t') || (lt === 'uint32_t' && rt === 'int64_t')) {
      // Compile-time overflow check if values are known
      const lv = this.constVal(node.left), rv = this.constVal(node.right);
      if (lv !== null && rv !== null) {
        const result = node.op === '+' ? lv + rv : node.op === '-' ? lv - rv :
                       node.op === '*' ? lv * rv : node.op === '/' ? lv / rv : lv % rv;
        const typeMax = { 'uint32_t': 4294967295n, 'uint8_t': 255n, 'uint16_t': 65535n,
                          'int32_t': 2147483647n, 'int64_t': 9223372036854775807n };
        const typeMin = { 'uint32_t': 0n, 'uint8_t': 0n, 'uint16_t': 0n,
                          'int32_t': -2147483648n, 'int64_t': -9223372036854775808n };
        if (targetCtype in typeMax && (result > typeMax[targetCtype] || result < typeMin[targetCtype])) {
          throw this.error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`, node);
        }
      }
      const [lC, rC] = [this.exprToC(node.left, lines, depth), this.exprToC(node.right, lines, depth)];
      const [lCast, rCast] = lt === 'int64_t' ? [lC, `(int64_t)${rC}`] : [`(int64_t)${lC}`, rC];
      const inner = `(uint32_t)(${lCast} ${node.op} ${rCast})`;
      return targetCtype === 'uint32_t' ? inner : `(${targetCtype})(${inner})`;
    }
    // i32 + u32 or u32 + i32
    if ((lt === 'int32_t' && rt === 'uint32_t') || (lt === 'uint32_t' && rt === 'int32_t')) {
      // Check if the u32 operand fits in i32 range
      const u32Node = lt === 'uint32_t' ? node.left : node.right;
      const u32Val = this.constVal(u32Node);
      if (u32Val !== null && u32Val > 2147483647n) {
        throw this.error(`cannot mix i32 and u32 in const expression: incompatible signed/unsigned ranges`, node);
      }
      const [lC, rC] = [this.exprToC(node.left, lines, depth), this.exprToC(node.right, lines, depth)];
      const [lCast, rCast] = lt === 'int32_t' ? [lC, `(int32_t)${rC}`] : [`(int32_t)${lC}`, rC];
      const inner = `(int32_t)(${lCast} ${node.op} ${rCast})`;
      return targetCtype === 'int32_t' ? inner : `(${targetCtype})(${inner})`;
    }
    // i64 + u32 → u8/u16: overflow check
    if (targetCtype === 'uint8_t' || targetCtype === 'uint16_t') {
      const typeMax = { 'uint8_t': 255n, 'uint16_t': 65535n };
      const typeMin = { 'uint8_t': 0n, 'uint16_t': 0n };
      const lv = this.constVal(node.left), rv = this.constVal(node.right);
      if (lv !== null && rv !== null) {
        const result = node.op === '+' ? lv + rv : node.op === '-' ? lv - rv :
                       node.op === '*' ? lv * rv : node.op === '/' ? lv / rv : lv % rv;
        if (result > typeMax[targetCtype] || result < typeMin[targetCtype]) {
          throw this.error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`, node);
        }
      }
    }
    return null;
  },
};
