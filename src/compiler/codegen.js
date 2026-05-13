// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';
import { lex as _lex }   from './lexer.js';
import { parse as _parse } from './parser.js';
import { TscError } from './error.js';

const EMBEDDED_TARGETS = new Set(['avr', 'arm', 'stm32']);
const ALL_EMBEDDED_TARGETS = new Set(['avr', 'arm', 'stm32', 'nes', 'genesis', 'ps1', 'spectrum']);

// Returns { c: string, warnings: TscError[], exports: Object }
// opts.maxErrors — max errors before stopping (default 10, Infinity for --all-errors)
// opts.libraryMode — emit without #include and main() (for bundled deps)
// opts.importedModules — { [resolvedPath]: exportMap } pre-compiled module exports
// opts.sourceToPath    — { [importSource]: resolvedPath } for namespace import lookup
export function codegen(ast, filename = 'input', src = null, opts = {}) {
  const ctx = new Context(filename, src);
  if (opts.maxErrors !== undefined) ctx._maxErrors = opts.maxErrors;
  if (opts.debugLines) ctx._debugLines = true;
  if (opts.libraryMode) ctx._libraryMode = true;
  if (opts.modulePrefix) ctx._modulePrefix = opts.modulePrefix;

  // Build namespace set from import nodes (before pre-populating scope)
  const namespaceImports = new Map(); // localName → resolvedPath
  if (opts.importedModules && opts.sourceToPath && ast?.body) {
    for (const node of ast.body) {
      if (node.kind === 'Import' && node.namespace && node.names?.[0]) {
        const resolvedPath = opts.sourceToPath[node.source];
        if (resolvedPath) namespaceImports.set(node.names[0], resolvedPath);
      }
    }
  }

  // Pre-populate scope from already-compiled imported modules
  if (opts.importedModules) {
    for (const [resolvedPath, moduleExports] of Object.entries(opts.importedModules)) {
      if (!moduleExports) continue;
      // Check if this module is imported as a namespace
      let nsName = null;
      for (const [name, path] of namespaceImports) {
        if (path === resolvedPath) { nsName = name; break; }
      }
      if (nsName) {
        // Namespace import: define X as a namespace object
        ctx.define(nsName, { ctype: '_namespace', _isNamespace: true, _namespaceExports: moduleExports });
      } else {
        // Named import: put all exports flat in scope
        for (const [name, entry] of Object.entries(moduleExports)) {
          ctx.define(name, entry);
        }
      }
    }
  }
  // Store sourceToPath and importedModules for ExportFrom handling
  ctx._importedModules = opts.importedModules ?? {};
  ctx._sourceToPath = opts.sourceToPath ?? {};

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

    // Function-scoped cleanup (null when not in function)
    this._funcCleanup = null;
    this._funcCleanupSet = null;
    // Loop depth: loop-local owned vars are not registered in _funcCleanup
    this._loopDepth = 0;

    // Types predefined in runtime.h — prevent codegen from re-emitting them
    this._emittedArrayStructs = new Set(['Array_string', 'Array_u8']);
    this._emittedOptStructs   = new Set(['opt_u8']);
    this._emittedResultTypes = new Set();
    this._emittedHelpers = new Set();
    this._emittedImplicitVtables = new Set();
    this._emittedTasksPolls = new Set();
    this._emittedGenerics = new Set();
    this._emittedPromiseTypes = new Set();
    this._emittedResultErrKeys = new Set();
    this._emittedGenericClasses = new Set();
    this._emittedAtomicTypes = new Set();
    this._emittedSignalTypedefs = new Set();
    this._emittedTasksStructs = new Set();
    this._emittedHashMaps = new Set();
    this._emittedChannelTypes = new Set();
    this._emittedStaticMaps = new Set();
    this._emittedMapStructs = new Set(['string_i32']);
    this._emittedMapEntries = new Set();
    this._emittedSliceStructs = new Set();
    this._emittedTuples = new Set();
    this._emittedBlobTypeDef = false;
    this._emittedBufferTypeDef = false;
    this._emittedDataViewTypeDef = false;
    this._emittedTscClamp = false;
    this._emittedTscSecureRandomDef = false;
    this._emittedSliceU8 = false;
    this._emittedReaderVtable = false;
    this._emittedWriterVtable = false;
    this._mapHasSetCalls = new Set();
    this._heapStringFuncs = new Set();
    this._anonStructSigs = new Map();
    this._anonStructCount = 0;
    this._cmpxchgCount = 0;
    this._tasksStateCount = 0;
    this._fromEntriesCount = 0;
    this._staticTasks = [];
    this._asyncFuncs = new Map();
    this._generatorFuncs = new Map();
    this._capturedSignalMap = new Map();
    this._persistentCaptureRefs = new Map();
    this._deferredAnons = new Map();
    this._genericClasses = new Map();
    this._genericFuncs = new Map();
    this._pendingOverloads = new Map();
    this._declaredModules = new Map();
    this._extensions = new Map();
    this._typeAliases = new Map();
    this._pendingOptTypedefs = new Map();
    this._narrowedVars = new Set();

    // Collected warnings (printed after compilation, don't abort)
    this._warnings = [];

    // Collected errors (DiagnosticBag — filled by visitProgram)
    this._errors = [];
    this._maxErrors = 10; // increased by --all-errors

    // Library mode: emit without includes/main (for bundled deps)
    this._libraryMode = false;
    // Exported symbols: name → scope entry (populated by case 'Export')
    this._exports = new Map();

    // Explicit user-defined main() — rename to __main and call from generated int main()
    this._hasExplicitMain = false;
    this._explicitMainRetType = null;

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
  _isEmbedded()          { return EMBEDDED_TARGETS.has(this._targetName); }
  _isEmbeddedOrRetro()   { return ALL_EMBEDDED_TARGETS.has(this._targetName); }
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

  // Register a cleanup statement (e.g., "tsc_array_free_i32(&arr)") for main or function scope
  _registerCleanup(stmt) {
    if (!this.inFunction) {
      if (!this._cleanupSet.has(stmt)) {
        this._cleanupSet.add(stmt);
        this._mainCleanup.push(stmt);
      }
    } else if (this._funcCleanup && this._loopDepth === 0) {
      // Register for function-scope cleanup (not inside loops)
      if (!this._funcCleanupSet.has(stmt)) {
        this._funcCleanupSet.add(stmt);
        this._funcCleanup.push(stmt);
      }
    }
  }

  _pushPostStmtCleanup(line) {
    if (!this._postStmtCleanups) this._postStmtCleanups = [];
    this._postStmtCleanups.push(line);
  }

  _flushPostStmtCleanups(lines) {
    if (this._postStmtCleanups?.length) {
      for (const cleanup of this._postStmtCleanups) lines.push(cleanup);
      this._postStmtCleanups = [];
    }
  }

  _genNextCall(sym, objC) {
    const gi = sym._gi;
    const nextArgs = [].concat(sym._genArgs || []);
    const callArgs = nextArgs.length ? `&${objC}, ${nextArgs.join(', ')}` : `&${objC}`;
    return { gi, callExpr: `${gi.nextFn}(${callArgs})` };
  }

  _checkMoved(sym, node, name) {
    if (sym?._moved) {
      const ms = sym._movedSourceNode;
      throw this.error(`use of moved value: "${name}"`, node, {
        label: 'use of moved value',
        spans: ms?.line != null ? [{ line: ms.line, col: ms.col, endCol: ms.endCol, char: '-', label: 'value moved here' }] : [],
        code: 'E002',
      });
    }
    if (sym?._movedIntoClosureLine !== undefined) {
      throw this.error(`use of moved value: '${name}' was moved into closure on line ${sym._movedIntoClosureLine}`, node, {
        label: 'use of moved value',
        code: 'E002',
      });
    }
  }

  _checkFieldMoved(sym, prop, node, objName) {
    if (sym?._movedFields?.has(prop)) {
      const ms = sym._movedFieldSourceNode?.[prop];
      throw this.error(`use of moved value: '${objName}.${prop}'`, node, {
        label: 'use of moved value',
        spans: ms?.line != null ? [{ line: ms.line, col: ms.col, endCol: ms.endCol, char: '-', label: 'value moved here' }] : [],
        code: 'E006',
      });
    }
  }

  // Emit current function-scoped cleanup in LIFO order into lines
  _emitFuncCleanup(lines, I) {
    if (!this._funcCleanup?.length) return;
    for (let i = this._funcCleanup.length - 1; i >= 0; i--) {
      lines.push(`${I}${this._funcCleanup[i]};`);
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
    const parts = [];
    if (this._schedulerName === 'libuv') parts.push('#define TSC_SCHEDULER_LIBUV');
    parts.push(...[...this.includes].sort());
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
        parts.push(`${this.ind()}${this._asyncMainStateType} _main_sm = {0};`);
        if (this._schedulerName === 'libuv') {
          parts.push(`${this.ind()}TSC_RUN_ASYNC(${this._asyncMainStateType}, ${this._asyncMainPollFn}, &_main_sm);`);
        } else {
          parts.push(`${this.ind()}while (!_main_sm._done) {`);
          parts.push(`${this.ind()}    ${this._asyncMainPollFn}(&_main_sm);`);
          parts.push(`${this.ind()}}`);
        }
      }
      // Emit cleanup in reverse registration order (LIFO)
      for (let i = this._mainCleanup.length - 1; i >= 0; i--) {
        parts.push(`${this.ind()}${this._mainCleanup[i]};`);
      }
      if (this._hasExplicitMain) {
        if (this._explicitMainRetType === 'void') {
          parts.push(`${this.ind()}_tsc_main();`);
          parts.push(`${this.ind()}return 0;`);
        } else {
          parts.push(`${this.ind()}return _tsc_main();`);
        }
      } else {
        parts.push(`${this.ind()}return 0;`);
      }
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
import stmtSub   from './codegen/stmt/index.js';
import expr      from './codegen/expr.js';
import calls     from './codegen/calls/index.js';
import generics  from './codegen/generics.js';
import misc      from './codegen/misc.js';
import types     from './codegen/types.js';
import asyncMixin from './codegen/async.js';

const _mixinSources = [
  ['topLevel',  topLevel],
  ['stmt',      stmt],
  ['stmtSub',   stmtSub],
  ['expr',      expr],
  ['calls',     calls],
  ['generics',  generics],
  ['misc',      misc],
  ['types',     types],
  ['async',     asyncMixin],
];

{
  const seen = new Map();
  for (const [name, obj] of _mixinSources) {
    for (const key of Object.keys(obj)) {
      if (seen.has(key)) {
        console.error(`codegen mixin collision: "${key}" defined in both "${seen.get(key)}" and "${name}"`);
        process.exit(1);
      }
      seen.set(key, name);
    }
  }
}

Object.assign(Context.prototype, topLevel, stmt, stmtSub, expr, calls, generics, misc, types, asyncMixin);
