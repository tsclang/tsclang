// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';
import { lex as _lex }   from './lexer.js';
import { parse as _parse } from './parser.js';
import { TscError } from './error.js';

// Returns { c: string, warnings: TscError[], exports: Object }
// opts.maxErrors — max errors before stopping (default 10, Infinity for --all-errors)
// opts.libraryMode — emit without #include and main() (for bundled deps)
// opts.importedModules — { [resolvedPath]: exportMap } pre-compiled module exports
export function codegen(ast, filename = 'input', src = null, opts = {}) {
  const ctx = new Context(filename, src);
  if (opts.maxErrors !== undefined) ctx._maxErrors = opts.maxErrors;
  if (opts.debugLines) ctx._debugLines = true;
  if (opts.libraryMode) ctx._libraryMode = true;

  // Pre-populate scope from already-compiled imported modules
  if (opts.importedModules) {
    for (const moduleExports of Object.values(opts.importedModules)) {
      if (!moduleExports) continue;
      for (const [name, entry] of Object.entries(moduleExports)) {
        ctx.define(name, entry);
      }
    }
  }

  ctx.visitProgram(ast);
  return { c: ctx.emit(), warnings: ctx._warnings, exports: Object.fromEntries(ctx._exports) };
}

// ============================================================
class Context {
  constructor(filename, src = null) {
    this.filename = filename;
    this.src = src;           // full source text (for error snippets)
    this._currentNode = null; // updated at entry of exprToC / visitStmt
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

    // Collected warnings (printed after compilation, don't abort)
    this._warnings = [];

    // Collected errors (DiagnosticBag — filled by visitProgram)
    this._errors = [];
    this._maxErrors = 10; // increased by --all-errors

    // Library mode: emit without includes/main (for bundled deps)
    this._libraryMode = false;
    // Exported symbols: name → scope entry (populated by case 'Export')
    this._exports = new Map();

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

  // Throw a positioned TscError.
  // node — AST node with optional .line/.col/.endCol; falls back to this._currentNode.
  // opts — string[] (legacy notes=[]) OR object { label, spans, help, notes, code }
  error(msg, node, opts = {}) {
    const n = node ?? this._currentNode;
    const legacy = Array.isArray(opts);
    throw new TscError(msg, {
      filename: this.filename,
      line:   n?.line   ?? null,
      col:    n?.col    ?? null,
      endCol: n?.endCol ?? null,
      src:    this.src,
      notes:  legacy ? opts          : (opts.notes ?? []),
      label:  legacy ? null          : (opts.label ?? null),
      spans:  legacy ? []            : (opts.spans ?? []),
      help:   legacy ? []            : (opts.help  ?? []),
      code:   legacy ? null          : (opts.code  ?? null),
    });
  }

  // Collect a warning diagnostic (does not throw).
  // opts — same shape as error(): string[] (legacy notes) or { label, spans, help, notes, code }
  warn(msg, node, opts = {}) {
    const n = node ?? this._currentNode;
    const legacy = Array.isArray(opts);
    this._warnings.push(new TscError(msg, {
      kind:   'warning',
      filename: this.filename,
      line:   n?.line   ?? null,
      col:    n?.col    ?? null,
      endCol: n?.endCol ?? null,
      src:    this.src,
      notes:  legacy ? opts          : (opts.notes ?? []),
      label:  legacy ? null          : (opts.label ?? null),
      spans:  legacy ? []            : (opts.spans ?? []),
      help:   legacy ? []            : (opts.help  ?? []),
      code:   legacy ? null          : (opts.code  ?? null),
    }));
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
    // Trim trailing blanks then push section with trailing blank separator
    const _pushSection = (arr, parts) => {
      const trimmed = [...arr];
      while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
      if (trimmed.length === 0) return;
      parts.push(...trimmed);
      parts.push('');
    };

    // Library mode: emit typedefs + lambdas + topLevel only (no includes, no main)
    if (this._libraryMode) {
      const parts = [];
      _pushSection(this.typedefs, parts);
      _pushSection(this.lambdaLines, parts);
      _pushSection(this.topLevel, parts);
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts.length ? parts.join('\n') + '\n' : '';
    }

    // Full emit: includes → typedefs → lambdas → topLevel → main
    const parts = [...this.includes].sort();
    parts.push('');
    _pushSection(this.typedefs, parts);
    _pushSection(this.lambdaLines, parts);
    _pushSection(this.topLevel, parts);

    {
      const mainSig = this._useArgcArgv ? 'int main(int argc, char **argv)' : 'int main(void)';
      parts.push(`${mainSig} {`);
      parts.push(`${this.ind()}TSC_INIT();`);
      if (this._useArgcArgv) {
        parts.push(`${this.ind()}Array_string _argv = tsc_make_argv(argc, argv);`);
      }
      parts.push(...this.mainStmts.map(s => s.startsWith('#') ? s : this.ind() + s));
      // Cooperative scheduler loop for @static tasks
      if (this._staticTasks?.length) {
        const I = this.ind();
        if (this._staticTasks.length === 1) {
          const t = this._staticTasks[0];
          parts.push(`${I}while (!_${t.name}_instance._done) {`);
          parts.push(`${I}    ${t.pollFn}(&_${t.name}_instance);`);
          parts.push(`${I}}`);
        } else {
          const cond = this._staticTasks.map(t => `!_${t.name}_instance._done`).join(' || ');
          parts.push(`${I}while (${cond}) {`);
          for (const t of this._staticTasks) {
            parts.push(`${I}    if (!_${t.name}_instance._done) ${t.pollFn}(&_${t.name}_instance);`);
          }
          parts.push(`${I}}`);
        }
      }
      // Async main bootstrap
      if (this._asyncMainPollFn) {
        const embeddedTargets = ['avr', 'arm', 'stm32'];
        if (embeddedTargets.includes(this._targetName)) {
          parts.push(`${this.ind()}${this._asyncMainStateType} _main_sm = {0};`);
          parts.push(`${this.ind()}while (!_main_sm._done) {`);
          parts.push(`${this.ind()}    ${this._asyncMainPollFn}(&_main_sm);`);
          parts.push(`${this.ind()}}`);
        } else {
          parts.push(`${this.ind()}tsc_event_loop_run(${this._asyncMainPollFn});`);
        }
      }
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
import asyncMixin from './codegen/async.js';

Object.assign(Context.prototype, topLevel, stmt, expr, calls, generics, misc, types, asyncMixin);
