// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';

export function codegen(ast, filename = 'input') {
  const ctx = new Context(filename);
  ctx.visitProgram(ast);
  return ctx.emit();
}

// ============================================================
class Context {
  constructor(filename) {
    this.filename = filename;
    this.includes = new Set(['#include "runtime.h"']);
    this.topLevel = [];     // forward decls, struct typedefs, functions
    this.mainStmts = [];    // statements inside main()
    this.lambdaCount = 0;
    this.restCount = 0;
    this.lambdaLines = [];  // hoisted lambda functions (emitted before topLevel)
    this.closureCount = 0;
    this.tempCount = 0;
    this.indent = 4;

    // Symbol table: name → { ctype, varKind }
    this.scopes = [new Map()];
    // Known classes: name → { fields, methods }
    this.classes = new Map();
    // Known interfaces
    this.interfaces = new Map();
    // Lambda hoisted functions (emitted before main)
    this.lambdas = [];
    // Are we inside a function body (not main)?
    this.inFunction = false;
    this.currentFuncName = null;
    this.currentFuncReturnType = null;
  }

  // ----------------------------------------------------------------
  // Scope helpers
  // ----------------------------------------------------------------
  pushScope() { this.scopes.push(new Map()); }
  popScope()  { this.scopes.pop(); }
  define(name, info) { this.scopes[this.scopes.length - 1].set(name, info); }
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }

  // ----------------------------------------------------------------
  // Output helpers
  // ----------------------------------------------------------------
  ind(n = 1) { return ' '.repeat(this.indent * n); }

  emit() {
    const parts = [...this.includes].sort();
    parts.push('');
    parts.push(...this.lambdaLines);
    parts.push(...this.topLevel);
    // Ensure blank line between topLevel and main
    if (this.topLevel.length > 0 && this.topLevel[this.topLevel.length - 1] !== '') {
      parts.push('');
    }
    if (this.mainStmts.length > 0 || true) {
      parts.push('int main(void) {');
      parts.push(`${this.ind()}TSC_INIT();`);
      parts.push(...this.mainStmts.map(s => this.ind() + s));
      parts.push(`${this.ind()}return 0;`);
      parts.push('}');
    }
    return parts.join('\n');
  }

  addTop(line) { this.topLevel.push(line); }
  addLambda(line) { this.lambdaLines.push(line); }
  addMain(line) {
    if (this.inFunction) {
      this._currentFuncLines.push(this.ind(this._funcDepth) + line);
    } else {
      this.mainStmts.push(line);
    }
  }

}

import topLevel  from './codegen/top-level.js';
import stmt      from './codegen/stmt.js';
import expr      from './codegen/expr.js';
import calls     from './codegen/calls.js';
import generics  from './codegen/generics.js';
import misc      from './codegen/misc.js';
import types     from './codegen/types.js';

Object.assign(Context.prototype, topLevel, stmt, expr, calls, generics, misc, types);
