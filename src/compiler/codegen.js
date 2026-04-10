// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';
import { lex as _lex }   from './lexer.js';
import { parse as _parse } from './parser.js';

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
    this.typedefs = [];    // struct typedefs (emitted first)
    this.topLevel = [];    // named function definitions (emitted after lambdas)
    this.mainStmts = [];    // statements inside main()
    this.lambdaCount = 0;
    this.restCount = 0;
    this.lambdaLines = [];  // hoisted lambda functions (emitted before topLevel)
    this.closureCount = 0;
    this.tempCount = 0;
    this.loopCount = 0;
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

    // Cleanup: stmts to emit before return 0 in main (LIFO order)
    this._mainCleanup = [];
    this._cleanupSet = new Set();

    // Lex/parse helpers for template string expansion
    this._lex = _lex;
    this._parse = _parse;
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

  // Register a cleanup statement (e.g., "tsc_array_free_i32(&arr)") for main scope
  _registerCleanup(stmt) {
    if (!this.inFunction && !this._cleanupSet.has(stmt)) {
      this._cleanupSet.add(stmt);
      this._mainCleanup.push(stmt);
    }
  }

  // ----------------------------------------------------------------
  // Output helpers
  // ----------------------------------------------------------------
  ind(n = 1) { return ' '.repeat(this.indent * n); }

  emit() {
    const parts = [...this.includes].sort();
    parts.push('');

    // Order: typedefs → lambdas → named functions (topLevel) → main
    const _pushSection = (arr) => {
      // Trim trailing blank lines, then skip if empty
      const trimmed = [...arr];
      while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
      if (trimmed.length === 0) return;
      parts.push(...trimmed);
      parts.push('');
    };
    _pushSection(this.typedefs);
    _pushSection(this.lambdaLines);
    _pushSection(this.topLevel);

    if (this.mainStmts.length > 0 || true) {
      parts.push('int main(void) {');
      parts.push(`${this.ind()}TSC_INIT();`);
      parts.push(...this.mainStmts.map(s => this.ind() + s));
      // Emit cleanup in reverse registration order (LIFO)
      for (let i = this._mainCleanup.length - 1; i >= 0; i--) {
        parts.push(`${this.ind()}${this._mainCleanup[i]};`);
      }
      parts.push(`${this.ind()}return 0;`);
      parts.push('}');
    }
    return parts.join('\n') + '\n';
  }

  addTop(line) {
    // Route typedef/enum declarations and their companion static const arrays to
    // the typedefs section. Named function definitions go to topLevel.

    // Inside a multi-line typedef/struct block — route continuation lines to typedefs
    if (this._inTypedefBlock) {
      this.typedefs.push(line);
      if (line.startsWith('}')) this._inTypedefBlock = false;
      return;
    }

    if (line.startsWith('typedef ') || line.startsWith('typedef\t') || line.startsWith('struct ')) {
      this.typedefs.push(line);
      this._lastAddedToTypedefs = true;
      // Detect start of multi-line block (no closing } on same line)
      if (!line.includes('}')) this._inTypedefBlock = true;
    } else if (this._lastAddedToTypedefs && (line.startsWith('static const ') || line === '')) {
      // Companion declarations (e.g. enum values/names arrays) follow typedefs directly.
      // Absorb blank lines; add non-blank companion lines to typedefs.
      if (line !== '') this.typedefs.push(line);
      // Keep flag so multiple companions are grouped
    } else {
      this._lastAddedToTypedefs = false;
      this.topLevel.push(line);
    }
  }
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
