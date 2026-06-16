// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';
import { lex as _lex }   from './lexer.js';
import { parse as _parse } from './parser.js';
import { TscError } from './error.js';
import { ScopeManager } from './codegen/scope-manager.js';
import { BorrowTracker } from './codegen/borrow-tracker.js';
import { OutputBuffer } from './codegen/output-buffer.js';
import { TypeChecker } from './typechecker.js';

const WASM_BARE_TARGET = 'wasm';

const DESKTOP_CAPABILITIES = {
  allocator: 'heap',
  async: 'libuv',
  fpu: true,
  bits: 64,
  usize: 'u64',
  defaultNumber: 'f64',
  unaligned_access: true,
  os: true,
};

// Returns { c: string, warnings: TscError[], exports: Object }
// opts.maxErrors — max errors before stopping (default 10, Infinity for --all-errors)
// opts.libraryMode — emit without #include and main() (for bundled deps)
// opts.importedModules — { [resolvedPath]: exportMap } pre-compiled module exports
// opts.sourceToPath    — { [importSource]: resolvedPath } for namespace import lookup
export function codegen(ast, filename = 'input', src = null, opts = {}) {
  const ctx = new Context(filename, src, opts);
  if (opts.maxErrors !== undefined) ctx._maxErrors = opts.maxErrors;
  if (opts.debugLines) ctx._debugLines = true;
  if (opts.libraryMode) ctx._libraryMode = true;
  if (opts.depInitFns) ctx._depInitFns = opts.depInitFns;
  if (opts.modulePrefix) ctx._modulePrefix = opts.modulePrefix;
  if (opts.target) ctx._optsTarget = opts.target;
  if (opts.defaultNumber) ctx._optsDefaultNumber = opts.defaultNumber;
  if (opts.allocator) ctx._optsAllocator = opts.allocator;
  if (opts.scheduler) ctx._optsAsync = opts.scheduler;
  if (opts.strict) {
    ctx._strictRules = new Set(opts.strict);
    if (ctx._strictRules.has('safe-arith') || ctx._strictRules.has('safe-div')) {
      ctx._strictRules.delete('safe-arith');
      ctx._strictRules.delete('safe-div');
      ctx._strictRules.add('safe-math');
    }
  }
  if (opts.ramSize) ctx._optsRamSize = opts.ramSize;
  if (opts.stackSize) ctx._optsStackSize = opts.stackSize;
  ctx._capabilities = opts.capabilities || DESKTOP_CAPABILITIES;

  // Build namespace set and import renames from import nodes
  const namespaceImports = new Map(); // localName → resolvedPath
  const importRenames = new Map();    // resolvedPath → Map(originalName → localAlias)
  if (opts.importedModules && opts.sourceToPath && ast?.body) {
    for (const node of ast.body) {
      if (node.kind === 'Import' && node.names?.length) {
        const resolvedPath = opts.sourceToPath[node.source];
        if (!resolvedPath) continue;
        if (node.namespace && node.names?.[0]) {
          const n = node.names[0];
          namespaceImports.set(typeof n === 'object' ? n.name : n, resolvedPath);
        } else {
          if (!importRenames.has(resolvedPath)) importRenames.set(resolvedPath, new Map());
          const renames = importRenames.get(resolvedPath);
          for (const n of node.names) {
            if (typeof n === 'object' && n.alias) {
              renames.set(n.name, n.alias);
            }
          }
        }
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
        // Named import: put exports in scope, applying renames if any
        const renames = importRenames.get(resolvedPath);
        for (const [name, entry] of Object.entries(moduleExports)) {
          const localName = renames?.get(name) ?? name;
          if (entry._isTypeAlias) {
            ctx._typeAliases.set(localName, entry.cType);
          } else if (entry.isStruct || entry.isEnum || entry.isScalarAlias) {
            // Type entry (class/interface/enum/struct) → register in type table
            ctx.classes.set(localName, entry);
          } else {
            ctx.define(localName, entry);
          }
        }
      }
    }
  }
  // Store sourceToPath and importedModules for ExportFrom handling
  ctx._importedModules = opts.importedModules ?? {};
  ctx._sourceToPath = opts.sourceToPath ?? {};

  ctx.visitProgram(ast);
  const _hasInit = ctx._libInitStmts.length > 0 || ctx._depInitFns.length > 0;
  const _initFn = _hasInit ? `${ctx._modulePrefix ?? ''}__init` : null;
  return { c: ctx.emit(), warnings: ctx._warnings, exports: Object.fromEntries(ctx._exports), _initFn };
}

// ============================================================
class Context {
  constructor(filename, src = null, opts = {}) {
    this.filename = filename;
    this.src = src;           // full source text (for error snippets)
    this._currentNode = null; // updated at entry of exprToC / visitStmt
    // Output buffers: delegated to OutputBuffer
    const _initInclude = opts.target === 'wasm' ? '#include "runtime_wasm.h"' : '#include "runtime.h"';
    this._output = new OutputBuffer(_initInclude);
    this.lambdaCount = 0;
    this.restCount = 0;
    this.closureCount = 0;
    this.tempCount = 0;
    this.loopCount = 0;
    this.indent = 4;

    // Symbol table: delegated to ScopeManager
    this._scopeMgr = new ScopeManager();
    // Borrow tracking: delegated to BorrowTracker
    this._borrowTracker = new BorrowTracker(this._scopeMgr);
    this._languageBuiltins = LANGUAGE_BUILTINS;
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

    // Cleanup: per-block stack. Level 0 = main scope, level 1+ = function/block scopes
    this._blockCleanupStack = [{ list: [], set: new Set() }];

    // goto cleanup for throws functions with owned vars
    this._usesGotoCleanup = false;
    this._throwsOwnedVars = [];
    this._gotoCleanupPreDecls = null;

    // Loop depth: loop-local owned vars use _loopCleanupStack
    this._loopDepth = 0;
    this._loopCleanupStack = [];
    this._loopBodyCleanups = null;

    // Types predefined in runtime.h — prevent codegen from re-emitting them
    this._emittedArrayStructs = new Set(['Array_string', 'Array_u8']);
    this._emittedOptStructs   = new Set(['opt_u8', 'opt_string']);
    this._emittedResultTypes = new Set();
    this._emittedHelpers = new Set(['free_i32', 'free_string', 'free_u8']);
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
    this._resolvingTypes = new Set();
    this._narrowedVars = new Set();
    this._narrowedUnknownVars = new Map();
    this._emittedUnknownStruct = false;
    this._inDeclare = false;

    // Collected warnings (printed after compilation, don't abort)
    this._warnings = [];

    // Collected errors (DiagnosticBag — filled by visitProgram)
    this._errors = [];
    this._maxErrors = 10; // increased by --all-errors

    // Library mode: emit without includes/main (for bundled deps)
    this._libraryMode = false;
    // Runtime init statements for library mode (non-const top-level vars)
    this._libInitStmts = [];
    // Dep init function names to call (from imported modules)
    this._depInitFns = [];
    // Exported symbols: name → scope entry (populated by case 'Export')
    this._exports = new Map();

    // CLI/config opts — set by codegen() from buildOpts
    this._optsTarget = null;
    this._optsDefaultNumber = null;
    this._optsAllocator = null;
    this._optsAsync = null;
    this._optsRamSize = null;
    this._optsStackSize = null;

    // Explicit user-defined main() — rename to __main and call from generated int main()
    this._hasExplicitMain = false;
    this._explicitMainRetType = null;
    this._explicitMainThrows = false;
    this._explicitMainResultType = null;
    this._explicitMainErrTypes = null;

    // Lex/parse helpers for template string expansion
    this._lex = _lex;
    this._parse = _parse;

    // Type checking: delegated to TypeChecker
    this._typeChecker = new TypeChecker(this);
  }

  // ----------------------------------------------------------------
  // Type checking (delegated to TypeChecker)
  // ----------------------------------------------------------------
  resolveType(...a)       { return this._typeChecker.resolveType(...a); }
  resolveTupleType(...a)  { return this._typeChecker.resolveTupleType(...a); }
  typeDecl(...a)          { return this._typeChecker.typeDecl(...a); }
  inferType(...a)         { return this._typeChecker.inferType(...a); }
  _effectiveType(...a)    { return this._typeChecker._effectiveType(...a); }
  _inferCall(...a)        { return this._typeChecker._inferCall(...a); }
  _inferMemberCall(...a)  { return this._typeChecker._inferMemberCall(...a); }
  inferTypeWithParams(...a) { return this._typeChecker.inferTypeWithParams(...a); }

  // ----------------------------------------------------------------
  // Scope helpers (delegated to ScopeManager)
  // ----------------------------------------------------------------

  // Backward-compatible accessor — subdirectory code reads this.scopes directly.
  get scopes() { return this._scopeMgr.scopes; }

  // Backward-compatible accessors — subdirectory code accesses output buffers directly.
  get includes()   { return this._output.includes; }
  get typedefs()   { return this._output.typedefs; }
  get topLevel()   { return this._output.topLevel; }
  get mainStmts()  { return this._output.mainStmts; }
  get lambdaLines() { return this._output.lambdaLines; }
  // Allow subdirectory code to manipulate addTop routing state
  get _lastAddedToTypedefs() { return this._output._lastAddedToTypedefs; }
  set _lastAddedToTypedefs(v) { this._output._lastAddedToTypedefs = v; }

  pushScope() {
    this._scopeMgr.pushScope();
    this._borrowTracker.pushScope();
  }
  popScope()  {
    const scope = this._scopeMgr.popScope();
    this._borrowTracker.onScopeExit(scope);
  }
  _trackRefBorrow(sym) { this._borrowTracker.trackRefBorrow(sym); }
  _trackMutBorrow(sym) { this._borrowTracker.trackMutBorrow(sym); }
  _trackMutQuarantine(sym, closureVarName = null) { this._borrowTracker.trackMutQuarantine(sym, closureVarName); }
  _releaseQuarantineBy(closureVarName) { this._borrowTracker.releaseQuarantineBy(closureVarName); }
  _derefStrPtr(sym, cexpr) {
    return sym?.ctype === 'String *' ? `(*${cexpr})` : cexpr;
  }
  _checkBorrowsAcrossAwait(awaitNode) {
    for (const scopeLevel of this.scopes) {
      for (const [sname, sym] of scopeLevel) {
        if (sym._mutQuarantined) {
          throw this.error(
            `Cannot hold mutable reference to "${sname}" across "await" (potential asynchronous aliasing)`,
            awaitNode
          );
        }
        if ((sym._refBorrowCount || 0) > 0) {
          throw this.error(
            `"${sname}" cannot live across "await"; use ".clone()" to make an owned copy`,
            awaitNode
          );
        }
      }
    }
  }
  _trackBorrowForRefReturn(callNode, resultName, mode) {
    if (!callNode?.args?.length) return;
    const callee = callNode.callee;
    if (!callee || callee.kind !== 'Ident') return;
    const fnSym = this.lookup(callee.name);
    const params = fnSym?.params;
    if (!params) return;
    for (let i = 0; i < params.length && i < callNode.args.length; i++) {
      const param = params[i];
      const isRefMut = param.typeAnn?.kind === 'TypeRef' &&
        (param.typeAnn.name === 'Ref' || param.typeAnn.name === 'Mut');
      if (!isRefMut) continue;
      const innerName = param.typeAnn.typeArgs?.[0]?.name;
      if (innerName && this.interfaces.has(innerName)) continue;
      const argExpr = callNode.args[i].expr;
      if (argExpr?.kind !== 'Ident') continue;
      const argSym = this.lookup(argExpr.name);
      if (!argSym) continue;
      if (mode === 'Mut') {
        this._trackMutQuarantine(argSym);
      } else {
        if ((argSym._refBorrowCount || 0) === 0) {
          this._trackRefBorrow(argSym);
        }
      }
    }
  }
  define(name, info) {
    // Auto-mark heap pointer vars (ctype is "ClassName *" where ClassName is @heap)
    if (info?.ctype?.endsWith(' *') && !info._isHeap && !info._isPointer) {
      const clsName = info.ctype.slice(0, -2);
      const clsDef = this.classes.get(clsName);
      if (clsDef?._isHeap) {
        info._isHeap = true;
        // Auto-register in current block for auto-free at scope exit
        if (this._currentBlockHeapVars) {
          this._currentBlockHeapVars.push({ name, className: clsName });
        }
      }
    }
    this._scopeMgr.define(name, info);
  }
  _cap(key) { return this._capabilities[key] ?? DESKTOP_CAPABILITIES[key]; }
  _errMsgField(errTypes) {
    const errType = errTypes?.[0];
    return this._msgFieldFor(errType);
  }
  _msgFieldFor(errType) {
    return (errType === 'TscError' || errType === 'MathError') ? 'message' : '_base.message';
  }
  _panicMsgExpr(resExpr, errTypes) {
    if (!errTypes || errTypes.length <= 1) {
      return `${resExpr}.error.${this._msgFieldFor(errTypes?.[0])}`;
    }
    const key = errTypes.join('_');
    const unionName = `_ErrUnion_${key}`;
    const helperName = `_tsc_panic_msg_${key}`;
    if (!this._panicHelpers) this._panicHelpers = new Set();
    if (!this._panicHelpers.has(key)) {
      this._panicHelpers.add(key);
      const cases = errTypes.map((et, i) =>
        `    case _Err_${et}: return e._${i}.${this._msgFieldFor(et)};`
      );
      this.addTop(`static String ${helperName}(${unionName} e) {\n    switch (e.tag) {\n${cases.join('\n')}\n    }\n    return STR_LIT("unknown error");\n}`);
    }
    return `${helperName}(${resExpr}.error)`;
  }
  _ptrBytes() {
    const m = { u16: 2, u32: 4, u64: 8 };
    return m[this._cap('usize')] ?? 4;
  }
  _isWasmBare() { return this._targetName === WASM_BARE_TARGET; }
  lookup(name) {
    return this._scopeMgr.lookup(name);
  }

  _checkNoBareThrows(expr) {
    if (!expr) return;
    switch (expr.kind) {
      case 'Call': {
        if (expr.callee?.kind === 'Ident') {
          const sym = this.lookup(expr.callee.name);
          if (sym?._isThrowsFunc) {
            throw this.error(
              `TypeError: Call to throws function '${expr.callee.name}()' requires error handling: use '?', '!', or assign to a variable first`,
              expr
            );
          }
        }
        for (const arg of expr.args ?? []) {
          this._checkNoBareThrows(arg.expr ?? arg);
        }
        break;
      }
      case 'Binary':
        this._checkNoBareThrows(expr.left);
        this._checkNoBareThrows(expr.right);
        break;
      case 'Member':
      case 'OptChain':
        this._checkNoBareThrows(expr.object);
        break;
      case 'Index':
        this._checkNoBareThrows(expr.object);
        this._checkNoBareThrows(expr.index);
        break;
      case 'RangeIndex':
        this._checkNoBareThrows(expr.start);
        this._checkNoBareThrows(expr.end);
        break;
      case 'ArrayLit':
        for (const el of expr.elements ?? []) this._checkNoBareThrows(el);
        break;
      case 'ObjLit':
        for (const p of expr.props ?? []) {
          if (p.value) this._checkNoBareThrows(p.value);
          if (p.expr) this._checkNoBareThrows(p.expr);
        }
        break;
      case 'Unary':
        this._checkNoBareThrows(expr.expr);
        break;
      case 'Ternary':
        this._checkNoBareThrows(expr.cond);
        this._checkNoBareThrows(expr.yes);
        this._checkNoBareThrows(expr.no);
        break;
      case 'Assign':
        this._checkNoBareThrows(expr.right);
        break;
      case 'Cast':
        this._checkNoBareThrows(expr.expr);
        break;
      case 'NonNull':
      case 'Propagate':
        break;
      default: break;
    }
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
    if (this._usesGotoCleanup && this._throwsOwnedVars.includes(stmt)) return;
    if (this._usesGotoCleanup && this._gotoCleanupPreDecls) {
      for (const vname of this._gotoCleanupPreDecls.keys()) {
        if (stmt.includes(`&${vname})`) || stmt.includes(`(${vname})`) || stmt.includes(`(${vname}_env)`)) {
          if (!this._throwsOwnedVars.includes(stmt)) {
            this._throwsOwnedVars.push(stmt);
          }
          return;
        }
      }
    }
    if (this._loopDepth > 0 && this._loopBodyCleanups) {
      if (!this._loopBodyCleanups.includes(stmt)) {
        this._loopBodyCleanups.push(stmt);
      }
      return;
    }
    if (this._usesGotoCleanup && this._blockCleanupStack.length === 2) {
      if (!this._throwsOwnedVars.includes(stmt)) {
        this._throwsOwnedVars.push(stmt);
      }
      return;
    }
    const top = this._blockCleanupStack[this._blockCleanupStack.length - 1];
    if (!top.set.has(stmt)) {
      top.set.add(stmt);
      top.list.push(stmt);
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

  _markPoolVarMoved(node) {
    if (node?.kind === 'Ident') {
      const sym = this.lookup(node.name);
      if (sym?.ctype?.startsWith('opt_ref_')) {
        sym._moved = true;
        sym._movedLine = node.line;
        sym._movedSourceNode = node;
      }
    }
  }

  _checkMoved(sym, node, name) {
    if (sym?._closureEnvVar) return;
    if (sym?._moved) {
      const ms = sym._movedSourceNode;
      throw this.error(`use of moved value: "${name}"`, node, {
        label: 'use of moved value',
        spans: ms?.line != null ? [{ line: ms.line, col: ms.col, endCol: ms.endCol, char: '-', label: 'value moved here' }] : [],
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

  _hasPendingCleanups() {
    if (this._usesGotoCleanup) {
      if (this._loopBodyCleanups?.length) return true;
      for (let b = this._blockCleanupStack.length - 1; b >= 2; b--) {
        if (this._blockCleanupStack[b].list.length) return true;
      }
      return false;
    }
    if (this._loopBodyCleanups?.length) return true;
    for (let b = this._blockCleanupStack.length - 1; b >= 1; b--) {
      if (this._blockCleanupStack[b].list.length) return true;
    }
    if (this._hasPendingHeapCleanups()) return true;
    return false;
  }

  _hasPendingHeapCleanups() {
    if (!this._heapVarStack) return false;
    for (let s = this._heapVarStack.length - 1; s >= 0; s--) {
      for (const { name } of this._heapVarStack[s]) {
        const sym = this.scopes.length > 0 ? this.lookup(name) : null;
        if (!sym?._moved) return true;
      }
    }
    return false;
  }

  _emitHeapCleanup(lines, I) {
    if (!this._heapVarStack) return;
    for (let s = this._heapVarStack.length - 1; s >= 0; s--) {
      const vars = this._heapVarStack[s];
      for (let i = vars.length - 1; i >= 0; i--) {
        const { name, className } = vars[i];
        const sym = this.scopes.length > 0 ? this.lookup(name) : null;
        if (sym?._moved) continue;
        const cls = this.classes.get(className);
        if (cls?._isHeap) {
          this._ensureHeapDestructor(className);
          lines.push(`${I}if (${name} != NULL) { ${className}_destructor(${name}); tsc_free(${name}); }`);
          if (sym) sym._moved = true;
        }
      }
    }
  }

  _suppressCleanupFor(varName) {
    const matchers = [
      `&${varName})`, `(${varName})`, `(${varName},`, `(${varName}_env)`,
    ];
    const matches = (s) => matchers.some(m => s.includes(m));
    for (let b = this._blockCleanupStack.length - 1; b >= 1; b--) {
      const level = this._blockCleanupStack[b];
      for (let i = level.list.length - 1; i >= 0; i--) {
        if (matches(level.list[i])) level.list.splice(i, 1);
      }
      level.set = new Set(level.list);
    }
    if (this._loopBodyCleanups) {
      this._loopBodyCleanups = this._loopBodyCleanups.filter(s => !matches(s));
    }
    if (this._throwsOwnedVars) {
      this._throwsOwnedVars = this._throwsOwnedVars.filter(s => !matches(s));
    }
  }

  _snapshotHeapMoved() {
    const snapshot = new Map();
    if (!this._heapVarStack) return snapshot;
    for (let s = 0; s < this._heapVarStack.length; s++) {
      for (const { name } of this._heapVarStack[s]) {
        const sym = this.scopes.length > 0 ? this.lookup(name) : null;
        if (sym) snapshot.set(sym, !!sym._moved);
      }
    }
    return snapshot;
  }

  _restoreHeapMoved(snapshot) {
    for (const [sym, moved] of snapshot) {
      sym._moved = moved;
    }
  }

  _hasCleanupFor(varName) {
    const matchers = [
      `&${varName})`, `(${varName})`, `(${varName},`, `(${varName}_env)`,
    ];
    const matches = (s) => matchers.some(m => s.includes(m));
    for (let b = this._blockCleanupStack.length - 1; b >= 1; b--) {
      for (const stmt of this._blockCleanupStack[b].list) {
        if (matches(stmt)) return true;
      }
    }
    if (this._loopBodyCleanups) {
      for (const s of this._loopBodyCleanups) {
        if (matches(s)) return true;
      }
    }
    return false;
  }

  _pushLoopCleanups() {
    const arr = [];
    this._loopCleanupStack.push(arr);
    this._loopBodyCleanups = arr;
  }

  _popLoopCleanups() {
    this._loopCleanupStack.pop();
    this._loopBodyCleanups = this._loopCleanupStack.length > 0
      ? this._loopCleanupStack[this._loopCleanupStack.length - 1]
      : null;
  }

  _emitAllLoopCleanups(lines, indent) {
    for (let l = this._loopCleanupStack.length - 1; l >= 0; l--) {
      const arr = this._loopCleanupStack[l];
      for (let i = arr.length - 1; i >= 0; i--) {
        lines.push(`${indent}${arr[i]};`);
      }
    }
  }

  _emitLoopBodyCleanups(lines, indent) {
    if (!this._loopBodyCleanups?.length) return;
    for (let i = this._loopBodyCleanups.length - 1; i >= 0; i--) {
      lines.push(`${indent}${this._loopBodyCleanups[i]};`);
    }
  }

  _emitPoolDrops(lines, I) {
    if (!this._poolVarStack?.length) return;
    for (let p = this._poolVarStack.length - 1; p >= 0; p--) {
      const poolVars = this._poolVarStack[p];
      for (let i = poolVars.length - 1; i >= 0; i--) {
        const { name, className } = poolVars[i];
        const sym = this.scopes.length > 0 ? this.lookup(name) : null;
        if (sym?._moved) continue;
        const cls = this.classes.get(className);
        if (cls?._isPool) {
          this._ensurePoolDrop(className);
          lines.push(`${I}${cls._poolDropFn}(${name});`);
          if (sym) sym._moved = true;
        }
      }
    }
  }

  _emitHeapDrops(lines, I) {
    if (!this._heapVarStack?.length) return;
    for (let p = this._heapVarStack.length - 1; p >= 0; p--) {
      const heapVars = this._heapVarStack[p];
      for (let i = heapVars.length - 1; i >= 0; i--) {
        const { name, className } = heapVars[i];
        const sym = this.scopes.length > 0 ? this.lookup(name) : null;
        if (sym?._moved) continue;
        const cls = this.classes.get(className);
        if (cls?._isHeap) {
          this._ensureHeapDestructor(className);
          lines.push(`${I}if (${name} != NULL) { ${className}_destructor(${name}); tsc_free(${name}); }`);
          if (sym) sym._moved = true;
        }
      }
    }
  }

  _emitFuncCleanup(lines, I) {
    if (this._usesGotoCleanup) {
      if (this._loopBodyCleanups?.length) {
        for (let i = this._loopBodyCleanups.length - 1; i >= 0; i--) {
          lines.push(`${I}${this._loopBodyCleanups[i]};`);
        }
      }
      for (let b = this._blockCleanupStack.length - 1; b >= 2; b--) {
        const level = this._blockCleanupStack[b];
        for (let i = level.list.length - 1; i >= 0; i--) {
          lines.push(`${I}${level.list[i]};`);
        }
      }
      return;
    }
    if (this._loopBodyCleanups?.length) {
      for (let i = this._loopBodyCleanups.length - 1; i >= 0; i--) {
        lines.push(`${I}${this._loopBodyCleanups[i]};`);
      }
    }
    for (let b = this._blockCleanupStack.length - 1; b >= 1; b--) {
      const level = this._blockCleanupStack[b];
      for (let i = level.list.length - 1; i >= 0; i--) {
        lines.push(`${I}${level.list[i]};`);
      }
      level.list = [];
      level.set = new Set();
    }
    this._emitHeapCleanup(lines, I);
  }

  _snapshotCleanups() {
    return this._blockCleanupStack.map(l => ({ list: [...l.list], set: new Set(l.set) }));
  }

  _restoreCleanups(snapshot) {
    for (let i = 0; i < this._blockCleanupStack.length; i++) {
      this._blockCleanupStack[i].list = snapshot[i].list;
      this._blockCleanupStack[i].set = snapshot[i].set;
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

    // Library mode: emit typedefs + lambdas + topLevel + __init (no includes, no main)
    if (this._libraryMode) {
      const parts = [];
      _pushSection(this.typedefs, parts);
      _pushSection(this.lambdaLines, parts);
      _pushSection(this.topLevel, parts);
      // Emit __init function for runtime initializations
      if (this._libInitStmts.length > 0 || this._depInitFns.length > 0) {
        const _fnName = `${this._modulePrefix ?? ''}__init`;
        parts.push(`void ${_fnName}(void) {`);
        for (const fn of this._depInitFns) {
          parts.push(`    ${fn}();`);
        }
        for (const stmt of this._libInitStmts) {
          parts.push(`    ${stmt}`);
        }
        parts.push('}');
        parts.push('');
      }
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts.length ? parts.join('\n') + '\n' : '';
    }

    // Full emit: includes → typedefs → lambdas → topLevel → main
    const parts = [];
    // Pre-generate main's panic message expression (may addTop helper functions)
    let _mainPanicMsg = null;
    if (this._hasExplicitMain && this._explicitMainThrows) {
      _mainPanicMsg = this._panicMsgExpr('_unwrap_main', this._explicitMainErrTypes);
    }
    if (this._asyncName === 'libuv') parts.push('#define TSC_SCHEDULER_LIBUV');
    parts.push(...[...this.includes].sort());
    parts.push('');
    _pushSection(this.typedefs, parts);
    _pushSection(this.lambdaLines, parts);
    _pushSection(this.topLevel, parts);

    {
      const mainSig = this._useArgcArgv ? 'int main(int argc, char **argv)' : 'int main(void)';
      parts.push(`${mainSig} {`);
      parts.push(`${this.ind()}TSC_INIT();`);
      // Call dep module init functions (runtime-initialized static vars)
      for (const fn of this._depInitFns) {
        parts.push(`${this.ind()}${fn}();`);
      }
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
        if (this._asyncName === 'libuv') {
          parts.push(`${this.ind()}TSC_RUN_ASYNC(${this._asyncMainStateType}, ${this._asyncMainPollFn}, &_main_sm);`);
        } else {
          parts.push(`${this.ind()}while (!_main_sm._done) {`);
          parts.push(`${this.ind()}    ${this._asyncMainPollFn}(&_main_sm);`);
          parts.push(`${this.ind()}}`);
        }
      }
      // Emit cleanup in reverse registration order (LIFO)
      const mainLevel = this._blockCleanupStack[0];
      for (let i = mainLevel.list.length - 1; i >= 0; i--) {
        parts.push(`${this.ind()}${mainLevel.list[i]};`);
      }
      if (this._hasExplicitMain) {
        if (this._explicitMainThrows) {
          const unwrap = `_unwrap_main`;
          parts.push(`${this.ind()}${this._explicitMainResultType} ${unwrap} = _tsc_main();`);
          const panicMsg = _mainPanicMsg;
          parts.push(`${this.ind()}if (!${unwrap}.ok) { tsc_panic(${panicMsg}); }`);
          if (this._explicitMainRetType === 'void') {
            parts.push(`${this.ind()}return 0;`);
          } else {
            parts.push(`${this.ind()}return ${unwrap}.value;`);
          }
        } else if (this._explicitMainRetType === 'void') {
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

  addTop(line) { this._output.addTop(line); }
  addLambda(line) { this._output.addLambda(line); }

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
import { STDLIB_HANDLERS, LANGUAGE_BUILTINS } from './stdlib-registry.js';

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

Object.assign(Context.prototype, topLevel, stmt, stmtSub, expr, calls, generics, misc, types, asyncMixin, STDLIB_HANDLERS);
