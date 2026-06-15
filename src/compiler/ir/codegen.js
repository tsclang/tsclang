/**
 * @fileoverview IRCodegen — converts IR to C output.
 *
 * Spec: spec/16-tooling/16-compiler.md — IR section.
 * Issue: #29 — IR to C codegen.
 *
 * "Nearly 1:1 with C, codegen is trivial" (spec).
 *
 * Basic blocks become labeled sections, connected via goto/branch.
 * Entry block starts at the top of the function body (no label needed).
 *
 * Type mapping: uses `toCType` from types.js for known TSC types.
 * `auto` types are inferred from literal init values where possible,
 * otherwise `__auto_type` (GCC extension) is used.
 */

import { toCType } from '../types.js';

export class IRCodegen {
  constructor(opts = {}) {
    this.opts = opts;
    this._indent = '  ';
  }

  /**
   * Emit C code from an IRModule.
   * @param {IRModule} mod
   * @returns {string}
   */
  emit(mod) {
    const parts = [];
    for (const fn of mod.functions) {
      parts.push(this._emitFunction(fn));
    }
    return parts.join('\n\n');
  }

  // ─── Function emission ───────────────────────────────────────────────

  _emitFunction(fn) {
    const retC = toCType(fn.returnType);
    const params = fn.params.length > 0
      ? fn.params.map(p => `${toCType(p.ctype)} ${p.name}`).join(', ')
      : 'void';
    const header = retC === 'void'
      ? `void ${fn.name}(${params})`
      : `${retC} ${fn.name}(${params})`;

    const lines = [`${header} {`];

    for (let i = 0; i < fn.blocks.length; i++) {
      const block = fn.blocks[i];

      // Entry block: no label (execution starts here)
      // Other blocks: emit label
      if (i > 0) {
        lines.push(`${this._indent}${block.label}:;`);
      }

      // Instructions
      for (const instr of block.instructions) {
        const c = this._emitInstruction(instr);
        if (c) lines.push(`${this._indent}${c}`);
      }

      // Terminator
      if (block.terminator) {
        const c = this._emitTerminator(block.terminator);
        if (c) lines.push(`${this._indent}${c}`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ─── Instruction emission ────────────────────────────────────────────

  _emitInstruction(instr) {
    switch (instr.op) {
      case 'alloc':
        return this._emitAlloc(instr);
      case 'assign':
        return `${instr.dest} = ${this._formatValue(instr.value)};`;
      case 'call':
        return this._emitCall(instr);
      case 'drop':
        return `/* drop ${instr.operand} */`;
      case 'borrow':
        return `/* borrow ${instr.dest} = ${instr.source} (${instr.mode}) */`;
      case 'retain':
        return `tsc_retain(${instr.operand});`;
      case 'release':
        return `tsc_release(${instr.operand});`;
      case 'phi':
        // Phi: value already merged via variable, no C code needed
        return null;
      case 'yield':
        return `tsc_yield(${this._formatValue(instr.value)});`;
      default:
        return null;
    }
  }

  _emitAlloc(instr) {
    const cType = this._resolveType(instr.type, instr.value);
    if (instr.value !== undefined) {
      return `${cType} ${instr.dest} = ${this._formatValue(instr.value)};`;
    }
    return `${cType} ${instr.dest};`;
  }

  _emitCall(instr) {
    const args = (instr.args || []).map(a => this._formatValue(a)).join(', ');
    if (instr.dest !== null && instr.dest !== undefined) {
      const cType = this._inferCallType(instr);
      return `${cType} ${instr.dest} = ${instr.fn}(${args});`;
    }
    return `${instr.fn}(${args});`;
  }

  // ─── Terminator emission ─────────────────────────────────────────────

  _emitTerminator(term) {
    switch (term.op) {
      case 'return':
        return term.value !== undefined ? `return ${this._formatValue(term.value)};` : 'return;';
      case 'branch':
        return `if (${this._formatValue(term.cond)}) goto ${term.thenLabel}; else goto ${term.elseLabel};`;
      case 'jump':
        return `goto ${term.label};`;
      case 'throw':
        return `/* throw ${this._formatValue(term.error)} */;`;
      case 'await':
        return `/* await ${term.operand}, resume ${term.resumeLabel} */;`;
      default:
        return null;
    }
  }

  // ─── Type resolution ─────────────────────────────────────────────────

  /**
   * Resolve a TSC type name to C type.
   * For 'auto', infer from the init value if possible.
   */
  _resolveType(typeName, initValue) {
    if (typeName !== 'auto') {
      return toCType(typeName);
    }
    return this._inferTypeFromValue(initValue);
  }

  /**
   * Infer C type from a literal value.
   * @returns {string} C type string
   */
  _inferTypeFromValue(value) {
    if (value === undefined || value === null) {
      return 'int32_t'; // default for uninitialized
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int32_t' : 'double';
    }
    if (typeof value === 'boolean') {
      return 'bool';
    }
    if (typeof value === 'string') {
      // String literal: starts with "
      if (value.startsWith('"')) return 'String';
      // Char literal: starts with '
      if (value.startsWith("'")) return 'char';
      // SSA name or compound expression — can't infer
      return '__auto_type';
    }
    return '__auto_type';
  }

  /**
   * Infer return type for a call instruction.
   * Without type info, use __auto_type.
   */
  _inferCallType(instr) {
    return '__auto_type';
  }

  // ─── Value formatting ────────────────────────────────────────────────

  /**
   * Format an IRValue for C output.
   * Most values pass through as-is (numbers, SSA names, compound expressions).
   */
  _formatValue(value) {
    if (value === undefined) return '';
    if (value === null) return 'NULL';
    return String(value);
  }
}
