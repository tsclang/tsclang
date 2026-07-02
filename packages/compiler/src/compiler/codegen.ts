// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';
import { lex as _lex }   from './lexer.js';
import { parse as _parse } from './parser.js';
import { TscError } from './error.js';
import type { DiagSpan } from './error.js';
import { ScopeManager } from './codegen/scope-manager.js';
import { BorrowTracker } from './codegen/borrow-tracker.js';
import { OutputBuffer } from './codegen/output-buffer.js';
import { TypeChecker } from './typechecker.js';
import type { Capabilities } from './profile.js';
import type { ThrowsCtx } from './codegen/top-level/decorators.js';
import { RUNTIME_HEADER, RUNTIME_WASM_HEADER, TSC_DEFINES, WASM_TARGET, DEFAULT_ALLOCATOR, DEFAULT_ASYNC, DEFAULT_USIZE, DEFAULT_BITS, DEFAULT_NUMBER } from '@tsclang/shared';
import type { Program, Method, TypeRef, TypeAnn, TypeArray, MethodSig, PropSig, FuncDecl, FuncOverload, ClassDecl, SymbolInfo, Expression, Call, Await, CatchClause, NodePos, Param, Argument, ObjLit, New, Arrow, ArrayLit, TemplateLit, Stmt, Block, FuncExpr, Literal, Binary, Unary, Assign, VarDecl, Switch, MatchCase, MatchPattern, TryCatch, Match, While, DoWhile, For, ForOf } from '@tsclang/ast';

export const DESKTOP_CAPABILITIES = {
  allocator: DEFAULT_ALLOCATOR,
  async: DEFAULT_ASYNC,
  fpu: true,
  bits: DEFAULT_BITS,
  usize: DEFAULT_USIZE,
  defaultNumber: DEFAULT_NUMBER,
  unaligned_access: true,
  os: true,
  posix: true,
  strtoll: true,
};

// Returns { c: string, warnings: TscError[], exports: Object }
// opts.maxErrors — max errors before stopping (default 10, Infinity for --all-errors)
// opts.libraryMode — emit without #include and main() (for bundled deps)
// opts.importedModules — { [resolvedPath]: exportMap } pre-compiled module exports
// opts.sourceToPath    — { [importSource]: resolvedPath } for namespace import lookup
export function codegen(ast: Program, filename: string = 'input', src: string | null = null, opts: CodeGenOptions = {}) {
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
        let nsName: string | null = null;
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
            ctx._typeAliases.set(localName, entry.cType!);
          } else if (entry.isStruct || entry.isEnum || entry.isScalarAlias) {
            // Type entry (class/interface/enum/struct) → register in type table
            ctx.classes.set(localName, entry as unknown as ClassMeta);
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
// Class metadata — typed shape for entries in the `classes` map
// ============================================================

export interface ClassMetaField {
  name: string;
  typeAnn?: TypeAnn | null;
  ctype?: string;
  _ctype?: string;
  label?: string;
  const?: boolean;
  optional?: boolean;
  isMethod?: boolean;
  modifiers?: string[];
  rest?: boolean;
  elemType?: string;
}

export interface MethodInfo {
  isStatic: boolean;
  nameMangled: string;
  isMut: boolean;
  isExplicitMut: boolean;
  isMoveMethod: boolean;
  isIfaceMethod: boolean;
  _isThrowsFunc?: boolean;
  _resultType?: string;
  _resultIsVoid?: boolean;
  _resultValueType?: string;
  _resultErrKey?: string;
  _resultErrTypes?: string[];
}

export interface ClassMeta {
  // Kind discriminants
  isStruct?: boolean;
  isTuple?: boolean;
  isEnum?: boolean;
  isScalarAlias?: boolean;
  isMutable?: boolean;
  isPartial?: boolean;
  isConst?: boolean;
  isStringEnum?: boolean;
  isStringLiteralUnion?: boolean;
  isKeyOf?: boolean;
  readonly?: boolean;
  needsToString?: boolean;

  // Core data
  fields?: ClassMetaField[];
  methods?: Method[];
  members?: string[] | { name: string; value?: unknown }[];
  superClass?: string | null;
  implements_?: TypeRef[];
  innerType?: string;

  // C name (module-prefixed)
  _cname?: string;

  // Enum values
  values?: string[];

  // Pool metadata
  _isPool?: boolean;
  _poolSize?: number;
  _poolOptType?: string;
  _poolAllocFn?: string;
  _poolDropFn?: string;
  _poolMaskVar?: string;
  _poolVar?: string;
  _poolMaskType?: string;
  _poolAllocEmitted?: boolean;
  _poolDropEmitted?: boolean;

  // Heap metadata
  _isHeap?: boolean;
  _heapClassName?: string;
  _heapDestructorEmitted?: boolean;

  // Free/cleanup metadata
  _classFreeEmitted?: boolean;
  _stringFields?: string[];
  _classFreeFn?: string;

  // Method metadata
  _methodNames?: Map<string, MethodInfo>;

  // Iterable
  _iterableElemType?: string;
  _iterStructName?: string;

  // Throws
  _isThrowsClass?: boolean;

  // Decorator
  _decoratorInits?: { fieldName: string; cVal: string | boolean | number }[];

  // Misc
  _isInline?: boolean;
  _isVtable?: boolean;
  _vtableKind?: string;
  _virtual?: boolean;
}

// ============================================================
// Typed shapes for Context state
// ============================================================

export interface PoolVar {
  name: string;
  className: string;
}

export interface CleanupLevel {
  list: string[];
  set: Set<string>;
}

export interface StaticTask {
  name: string;
  stateType?: string;
  pollFn: string;
}

export interface AsyncFuncInfo {
  stateType: string;
  pollFn: string;
  resultCType: string | null;
  innerResultCType?: string;
  params: unknown[];
}

export interface GenFuncInfo {
  stateType: string;
  resultType: string;
  nextFn: string;
  valueType: string;
  params: unknown[];
  letFields: unknown[];
}

export interface DeferredAnon {
  fields: { name: string; _ctype: string }[];
  init: Expression | null;
}

export interface FromEntriesEntry {
  typeAnn: TypeArray;
  init: Expression | null | undefined;
}

export interface ExtInfo {
  cFuncName: string;
  thisCType: string;
  thisIdent: string;
  retCType: string;
}

export interface FuncStackInfo {
  name: string;
  ownBytes: number;
  callees: string[];
}

export interface ThrowsClassInfo {
  hasMessage: boolean;
  hasStack: boolean;
  needsNew: boolean;
}

export interface HmCapInfo {
  count: number;
  cap: number;
}

export interface ArcClassInfo {
  arc?: boolean;
  weak?: boolean;
  refFirst?: boolean;
}

export interface DeclareModuleEntry {
  kind: string;
  name: string;
  typeAnn?: TypeAnn | null;
}

export interface SelfCtx {
  promoted: Set<string>;
  inlined: Map<string, string>;
  inlinedTypes?: Map<string, string>;
  resultCType?: string | null;
  hasThrows?: boolean;
  throwsKey?: string | null;
  spawnInfos?: SpawnInfo[];
  spawnVarAlias?: Map<string, string>;
  extraPollParams?: FieldInfo[];
  stringFields: string[];
  classFreeFields: { name: string; freeFn: string }[];
  arrayFields?: { name: string; elemIdent: string }[];
  hasCleanup?: boolean;
  paramStringFields?: string[];
}

export interface TryCatchInfo {
  catchLabel: string;
  errVar: string;
  catches: CatchClause[];
}

export interface FuncMathThrow {
  errVar: string;
  throwLabel: string;
}

export interface ErrorOpts {
  label?: string | null;
  spans?: DiagSpan[];
  help?: string[];
  notes?: string[];
  code?: string | null;
  secondary?: unknown;
  [key: string]: unknown;
}

export interface CodeGenOptions {
  maxErrors?: number;
  debugLines?: boolean;
  libraryMode?: boolean;
  depInitFns?: string[];
  modulePrefix?: string | null;
  target?: string;
  defaultNumber?: string;
  allocator?: string;
  scheduler?: string;
  strict?: string[];
  ramSize?: number;
  stackSize?: number;
  capabilities?: Capabilities;
  importedModules?: Record<string, Record<string, SymbolInfo> | null>;
  sourceToPath?: Record<string, string>;
}

// ============================================================
class Context {

  // Core state
  filename!: string;
  src!: string | null;
  _currentNode!: NodePos | null;

  // Output
  _output!: OutputBuffer;

  // Counters
  lambdaCount!: number;
  restCount!: number;
  closureCount!: number;
  tempCount!: number;
  loopCount!: number;
  indent!: number;

  // Scope & borrow tracking
  _scopeMgr!: ScopeManager;
  _borrowTracker!: BorrowTracker;
  _languageBuiltins!: Set<string>;

  // Symbol tables
  classes!: Map<string, ClassMeta>;
  interfaces!: Map<string, (MethodSig | PropSig)[]>;
  lambdas!: string[];
  inFunction!: boolean;
  currentFuncName!: string | null;
  currentFuncReturnType!: string | null;

  // Cleanup
  _blockCleanupStack!: CleanupLevel[];
  _usesGotoCleanup!: boolean;
  _throwsOwnedVars!: string[];
  _gotoCleanupPreDecls!: Map<string, string> | null;
  _loopDepth!: number;
  _loopCleanupStack!: string[][];
  _loopBodyCleanups!: string[] | null;

  // Emitted structs tracking
  _emittedArrayStructs!: Set<string>;
  _emittedOptStructs!: Set<string>;
  _emittedResultTypes!: Set<string>;
  _emittedHelpers!: Set<string>;
  _emittedImplicitVtables!: Set<string>;
  _emittedTasksPolls!: Set<string>;
  _emittedGenerics!: Set<string>;
  _emittedPromiseTypes!: Set<string>;
  _emittedResultErrKeys!: Set<string>;
  _emittedGenericClasses!: Set<string>;
  _emittedAtomicTypes!: Set<string>;
  _emittedSignalTypedefs!: Set<string>;
  _emittedTasksStructs!: Set<string>;
  _emittedHashMaps!: Set<string>;
  _emittedChannelTypes!: Set<string>;
  _emittedStaticMaps!: Set<string>;
  _emittedMapStructs!: Set<string>;
  _emittedMapEntries!: Set<string>;
  _emittedSliceStructs!: Set<string>;
  _emittedTuples!: Set<string>;
  _emittedBlobTypeDef!: boolean | string;
  _emittedBufferTypeDef!: boolean;
  _emittedDataViewTypeDef!: boolean;
  _emittedTscClamp!: boolean;
  _emittedTscSecureRandomDef!: boolean;
  _emittedSliceU8!: boolean;
  _emittedReaderVtable!: boolean;
  _emittedWriterVtable!: boolean;
  _mapHasSetCalls!: Set<string>;
  _heapStringFuncs!: Set<string>;

  // State tracking
  _anonStructSigs!: Map<string, string>;
  _anonStructCount!: number;
  _cmpxchgCount!: number;
  _tasksStateCount!: number;
  _fromEntriesCount!: number;
  _staticTasks!: StaticTask[];
  _asyncFuncs!: Map<string, AsyncFuncInfo>;
  _generatorFuncs!: Map<string, GenFuncInfo>;
  _capturedSignalMap!: Map<string, string>;
  _persistentCaptureRefs!: Map<string, string>;
  _deferredAnons!: Map<string, DeferredAnon>;
  _genericClasses!: Map<string, ClassDecl>;
  _genericFuncs!: Map<string, FuncDecl>;
  _pendingOverloads!: Map<string, FuncOverload[]>;
  _declaredModules!: Map<string, DeclareModuleEntry[]>;
  _extensions!: Map<string, ExtInfo>;
  _typeAliases!: Map<string, string>;
  _pendingOptTypedefs!: Map<string, string>;
  _resolvingTypes!: Set<string>;
  _narrowedVars!: Set<string>;
  _narrowedUnknownVars!: Map<string, string>;
  _emittedUnknownStruct!: boolean;
  _inDeclare!: boolean;

  // Warnings & errors
  _warnings!: TscError[];
  _errors!: TscError[];
  _maxErrors!: number;

  // Library mode
  _libraryMode!: boolean;
  _libInitStmts!: string[];
  _depInitFns!: string[];
  _exports!: Map<string, SymbolInfo>;

  // CLI/config opts
  _optsTarget!: string | null;
  _optsDefaultNumber!: string | null;
  _optsAllocator!: string | null;
  _optsAsync!: string | null;
  _optsRamSize!: number | null;
  _optsStackSize!: number | null;

  // Explicit main
  _hasExplicitMain!: boolean;
  _explicitMainRetType!: string | null;
  _explicitMainThrows!: boolean;
  _explicitMainResultType!: string | null;
  _explicitMainErrTypes!: string[] | null;

  // Lex/parse & type checking
  _lex!: typeof _lex;
  _parse!: typeof _parse;
  _typeChecker!: TypeChecker;

  // Config-derived (set in codegen() and visitProgram)
  _debugLines!: boolean;
  _modulePrefix!: string | null;
  _strictRules!: Set<string> | null;
  _capabilities!: Capabilities;
  _importedModules!: Record<string, Record<string, SymbolInfo> | null>;
  _sourceToPath!: Record<string, string>;
  _targetName!: string;
  _allocatorName!: string;
  _asyncName!: string | null;
  _ramSize!: number | null;
  _stackSize!: number | null;
  _defaultNumber!: string;
  _useArgcArgv!: boolean;

  // Registries (set in visitProgram pre-scans)
  _fromEntriesConsumed!: Map<string, FromEntriesEntry | null>;
  _arcClasses!: Map<string, ArcClassInfo>;
  _funcStackInfo!: Map<string, FuncStackInfo>;
  _throwsClasses!: Map<string, ThrowsClassInfo>;
  _decoratorFns!: Map<string, unknown>;
  _decoratorNames!: Set<string>;
  _hmCapViolations!: Map<string, HmCapInfo>;
  _funcRefVars!: Set<string>;
  _platformSkipped!: Map<string, string[]>;
  _emittedTasksTypedefs!: boolean;

  // Function-visit state
  _curFuncName!: string | null;
  _throwsCtx!: ThrowsCtx | null;
  _currentFuncIsNever!: boolean;
  _currentFuncLines!: string[];
  _funcDepth!: number;
  _funcMathThrow!: FuncMathThrow | null;
  _mathCatchLabel!: string | null;
  _mathErrVar!: string | null;

  // Async machinery
  _asyncCount!: number;
  _preScanTypes!: Map<string, string> | null;
  _selfCtx!: SelfCtx | null;
  _inAsyncFunc!: boolean;
  _asyncMainPollFn!: string | null;
  _asyncMainStateType!: string | null;
  _asyncMainIsDesktop!: boolean;
  _asyncBreakStack!: string[] | null;
  _asyncContinueStack!: string[] | null;
  _forOfEmitCount!: number;
  _forOfCount!: number;
  _fetchOptsCount!: number;
  _inAsyncTryCatch!: boolean;
  _expectedType!: string | null;

  // Iteration / spawn
  _inIterNextBody!: boolean;
  _iterNextElemType!: string;
  _iterNextOptType!: string;
  _iterNextIsComplex!: boolean;
  _inReturnContext!: boolean;
  _spawnCount!: number;

  // Statement flags
  _inFinallyBlock!: boolean;
  _inTryBlock!: boolean;
  _inMathTry!: boolean;
  _tryCatchInfo!: TryCatchInfo | null;
  _inUnsafe!: boolean;
  _selectCount!: number;
  _inWeakUpgrade!: boolean;
  _staticMapInlineCount!: number;
  _newArrayElemHint!: string | null | undefined;

  // Block/pool stacks
  _currentBlockPoolVars!: PoolVar[] | null;
  _currentBlockHeapVars!: PoolVar[] | null;
  _poolVarStack!: PoolVar[][];
  _heapVarStack!: PoolVar[][];

  // Calls / stdlib state
  _lastSuppressConst!: boolean | undefined;
  _lastHalRead!: string | null;
  _lambdaParamHint!: string[] | null | undefined;
  _inComputedFn!: boolean;
  _lastComputedSigType: string | undefined;
  _lastComputedElemType: string | undefined;
  _handlerCount!: number;
  _batchCount!: number;
  _reactiveClosureCount!: number;
  _blobTextN!: number;
  _urlOptN!: number;
  _dvTmpCount!: number;
  _lastOptIsNull!: boolean | undefined;
  _lastPopEmpty!: boolean | undefined;
  _lastArrayElemReturn!: boolean | undefined;
  _lastAtNonNeg!: boolean | undefined;
  _lastCbRetType!: string;
  _genResultCount!: number;

  // Misc state
  _inHoistedLambda!: boolean;
  _pendingDecoratorInits!: { fieldName: string; cVal: string | boolean | number }[] | null;
  _blobStrN!: number;
  _bufDataCount!: number;
  _blobDataCount!: number;
  _bssUsage!: number;
  _noOptEmit!: boolean;
  _postStmtCleanups!: string[];
  _panicHelpers!: Set<string>;

  // Std module import flags (set when import is processed)
  _stdIoImported!: boolean;
  _stdHalImported!: boolean;
  _stdUrlImported!: boolean;
  _stdReactiveImported!: boolean;
  _stdWsImported!: boolean;
  _stdNetImported!: boolean;
  _stdFsImported!: boolean;
  _stdTemporalImported!: boolean;
  _stdEmbeddedImported!: boolean;
  _avrSleepModeImported!: boolean;

  constructor(filename: string, src: string | null = null, opts: CodeGenOptions = {}) {
    this.filename = filename;
    this.src = src;           // full source text (for error snippets)
    this._currentNode = null; // updated at entry of exprToC / visitStmt
    // Output buffers: delegated to OutputBuffer
    const _initInclude = opts.target === WASM_TARGET ? `#include "${RUNTIME_WASM_HEADER}"` : `#include "${RUNTIME_HEADER}"`;
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
  resolveType(...a: unknown[]): string             { return this._typeChecker.resolveType(...a); }
  resolveTupleType(...a: unknown[]): string        { return this._typeChecker.resolveTupleType(...a); }
  typeDecl(...a: unknown[]): string                { return this._typeChecker.typeDecl(...a); }
  inferType(...a: unknown[]): string               { return this._typeChecker.inferType(...a); }
  _effectiveType(...a: unknown[]): string          { return this._typeChecker._effectiveType(...a); }
  _inferCall(...a: unknown[]): string              { return this._typeChecker._inferCall(...a); }
  _inferMemberCall(...a: unknown[]): string        { return this._typeChecker._inferMemberCall(...a); }
  inferTypeWithParams(...a: unknown[]): string     { return this._typeChecker.inferTypeWithParams(...a); }

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
  _trackRefBorrow(sym: SymbolInfo | null) { this._borrowTracker.trackRefBorrow(sym); }
  _trackMutBorrow(sym: SymbolInfo | null) { this._borrowTracker.trackMutBorrow(sym); }
  _trackMutQuarantine(sym: SymbolInfo | null, closureVarName: string | null = null) { this._borrowTracker.trackMutQuarantine(sym, closureVarName); }
  _releaseQuarantineBy(closureVarName: string) { this._borrowTracker.releaseQuarantineBy(closureVarName); }
  _derefStrPtr(sym: SymbolInfo | null | undefined, cexpr: string) {
    return sym?.ctype === 'String *' ? `(*${cexpr})` : cexpr;
  }
  _checkBorrowsAcrossAwait(awaitNode: Await) {
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
  _trackBorrowForRefReturn(callNode: Call, resultName: string, mode: string) {
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
  define(name: string, info: SymbolInfo) {
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
  _cap<K extends keyof Capabilities>(key: K): NonNullable<Capabilities[K]> {
    return ((this._capabilities as Capabilities)[key] ?? (DESKTOP_CAPABILITIES as Record<string, unknown>)[key]) as NonNullable<Capabilities[K]>;
  }
  _errMsgField(errTypes: string[]) {
    const errType = errTypes?.[0];
    return this._msgFieldFor(errType);
  }
  _msgFieldFor(errType: string) {
    return (errType === 'TscError' || errType === 'MathError') ? 'message' : '_base.message';
  }
  _panicMsgExpr(resExpr: string, errTypes: string[]) {
    if (!errTypes || errTypes.length <= 1) {
      return `${resExpr}.error.${this._msgFieldFor(errTypes?.[0])}`;
    }
    const key = errTypes.join('_');
    const unionName = `_ErrUnion_${key}`;
    const helperName = `_tsc_panic_msg_${key}`;
    if (!this._panicHelpers) this._panicHelpers = new Set();
    if (!this._panicHelpers.has(key)) {
      this._panicHelpers.add(key);
      const cases = errTypes.map((et: string, i: number) =>
        `    case _Err_${et}: return e._${i}.${this._msgFieldFor(et)};`
      );
      this.addTop(`static String ${helperName}(${unionName} e) {\n    switch (e.tag) {\n${cases.join('\n')}\n    }\n    return STR_LIT("unknown error");\n}`);
    }
    return `${helperName}(${resExpr}.error)`;
  }
  _ptrBytes() {
    const m = { u16: 2, u32: 4, u64: 8 };
    return (m as Record<string, number>)[this._cap('usize')] ?? 4;
  }
  _isWasmBare() { return this._targetName === WASM_TARGET; }
  lookup(name: string) {
    return this._scopeMgr.lookup(name);
  }

  _checkNoBareThrows(expr: Expression | null | undefined) {
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
        // Check method calls: obj.method() where method is throws
        if (expr.callee?.kind === 'Member') {
          const objType = this.inferType(expr.callee.object);
          const cls = this.classes.get(objType);
          if (cls?._methodNames) {
            const methodInfo = cls._methodNames.get(expr.callee.prop);
            if (methodInfo?._isThrowsFunc) {
              const errNames = (methodInfo._resultErrTypes ?? []).join(' | ');
              throw this.error(
                `TypeError: Call to throws method '${expr.callee.prop}()' requires error handling: use '?', '!', or assign to a variable first (throws ${errNames})`,
                expr
              );
            }
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
        this._checkNoBareThrows(expr.object);
        this._checkNoBareThrows(expr.start);
        this._checkNoBareThrows(expr.end);
        break;
      case 'ArrayLit':
        for (const el of ((expr as { elements?: unknown[] }).elements ?? [])) this._checkNoBareThrows(el as Expression);
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
      case 'Typeof':
        this._checkNoBareThrows(expr.expr);
        break;
      case 'Drop':
        this._checkNoBareThrows(expr.expr);
        break;
      case 'Yield':
        if (expr.value) this._checkNoBareThrows(expr.value);
        break;
      case 'Await':
        this._checkNoBareThrows(expr.expr);
        break;
      case 'TemplateLit':
        for (const part of (expr.parts as { expr?: Expression }[])) {
          if (part.expr) this._checkNoBareThrows(part.expr);
        }
        break;
      case 'New':
        for (const a of expr.args ?? []) this._checkNoBareThrows(a.expr ?? a);
        break;
      case 'Match':
        this._checkNoBareThrows(expr.discriminant);
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
  error(msg: string, node?: unknown, opts: string[] | ErrorOpts = {}) {
    const n = (node ?? this._currentNode) as NodePos | null | undefined;
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
  warn(msg: string, node?: unknown, opts: string[] | ErrorOpts = {}) {
    const n = (node ?? this._currentNode) as NodePos | null | undefined;
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
  _registerCleanup(stmt: string) {
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

  _pushPostStmtCleanup(line: string) {
    if (!this._postStmtCleanups) this._postStmtCleanups = [];
    this._postStmtCleanups.push(line);
  }

  _flushPostStmtCleanups(lines: string[]) {
    if (this._postStmtCleanups?.length) {
      for (const cleanup of this._postStmtCleanups) lines.push(cleanup);
      this._postStmtCleanups = [];
    }
  }

  _genNextCall(sym: SymbolInfo, objC: string) {
    const gi = sym._gi as unknown as GenFuncInfo;
    const nextArgs: string[] = [...((sym._genArgs as string[]) ?? [])];
    const callArgs = nextArgs.length ? `&${objC}, ${nextArgs.join(', ')}` : `&${objC}`;
    return { gi, callExpr: `${gi.nextFn}(${callArgs})` };
  }

  _markPoolVarMoved(node: Expression | null) {
    if (node?.kind === 'Ident') {
      const sym = this.lookup(node.name);
      if (sym?.ctype?.startsWith('opt_ref_')) {
        sym._moved = true;
        sym._movedLine = node.line;
        sym._movedSourceNode = node;
      }
    }
  }

  _checkMoved(sym: SymbolInfo | null | undefined, node: NodePos | null, name: string) {
    if (sym?._closureEnvVar) return;
    if (sym?._moved) {
      const ms = sym._movedSourceNode as NodePos | undefined;
      throw this.error(`use of moved value: "${name}"`, node, {
        label: 'use of moved value',
        spans: ms?.line != null ? [{ line: ms.line, col: ms.col, endCol: ms.endCol, char: '-', label: 'value moved here' }] : [],
        code: 'E002',
      });
    }
  }

  _checkFieldMoved(sym: SymbolInfo | null | undefined, prop: string, node: NodePos | null, objName: string) {
    if (sym?._movedFields && (sym._movedFields as unknown as { has(p: string): boolean }).has(prop)) {
      const ms = (sym._movedFieldSourceNode as Record<string, NodePos> | undefined)?.[prop];
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

  _emitHeapCleanup(lines: string[], I: string) {
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

  _suppressCleanupFor(varName: string) {
    const matchers = [
      `&${varName})`, `(${varName})`, `(${varName},`, `(${varName}_env)`,
    ];
    const matches = (s: string) => matchers.some(m => s.includes(m));
    for (let b = this._blockCleanupStack.length - 1; b >= 1; b--) {
      const level = this._blockCleanupStack[b];
      for (let i = level.list.length - 1; i >= 0; i--) {
        if (matches(level.list[i])) level.list.splice(i, 1);
      }
      level.set = new Set(level.list);
    }
    if (this._loopBodyCleanups) {
      this._loopBodyCleanups = this._loopBodyCleanups.filter((s) => !matches(s));
    }
    if (this._throwsOwnedVars) {
      this._throwsOwnedVars = this._throwsOwnedVars.filter((s) => !matches(s));
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

  _restoreHeapMoved(snapshot: Map<SymbolInfo, boolean>) {
    for (const [sym, moved] of snapshot) {
      sym._moved = moved;
    }
  }

  _hasCleanupFor(varName: string) {
    const matchers = [
      `&${varName})`, `(${varName})`, `(${varName},`, `(${varName}_env)`,
    ];
    const matches = (s: string) => matchers.some(m => s.includes(m));
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
    const arr: string[] = [];
    this._loopCleanupStack.push(arr);
    this._loopBodyCleanups = arr;
  }

  _popLoopCleanups() {
    this._loopCleanupStack.pop();
    this._loopBodyCleanups = this._loopCleanupStack.length > 0
      ? this._loopCleanupStack[this._loopCleanupStack.length - 1]
      : null;
  }

  _emitAllLoopCleanups(lines: string[], indent: string) {
    for (let l = this._loopCleanupStack.length - 1; l >= 0; l--) {
      const arr = this._loopCleanupStack[l];
      for (let i = arr.length - 1; i >= 0; i--) {
        lines.push(`${indent}${arr[i]};`);
      }
    }
  }

  _emitLoopBodyCleanups(lines: string[], indent: string) {
    if (!this._loopBodyCleanups?.length) return;
    for (let i = this._loopBodyCleanups.length - 1; i >= 0; i--) {
      lines.push(`${indent}${this._loopBodyCleanups[i]};`);
    }
  }

  _emitPoolDrops(lines: string[], I: string) {
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

  _emitHeapDrops(lines: string[], I: string) {
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

  _emitFuncCleanup(lines: string[], I: string) {
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
    return this._blockCleanupStack.map((l: CleanupLevel) => ({ list: [...l.list], set: new Set(l.set) }));
  }

  _restoreCleanups(snapshot: { list: string[]; set: Set<string> }[]) {
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
    const _pushSection = (arr: string[], parts: string[]) => {
      const trimmed = [...arr];
      while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
      if (trimmed.length === 0) return;
      parts.push(...trimmed);
      parts.push('');
    };

    // Library mode: emit typedefs + lambdas + topLevel + __init (no includes, no main)
    if (this._libraryMode) {
      const parts: string[] = [];
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
    const parts: string[] = [];
    // Pre-generate main's panic message expression (may addTop helper functions)
    let _mainPanicMsg: string | null = null;
    if (this._hasExplicitMain && this._explicitMainThrows) {
      _mainPanicMsg = this._panicMsgExpr('_unwrap_main', this._explicitMainErrTypes ?? []);
    }
    if (this._asyncName === 'libuv') parts.push(`#define ${TSC_DEFINES.SCHEDULER_LIBUV}`);
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
      parts.push(...this.mainStmts.map((s: string) => s.startsWith('#') ? s : this.ind() + s));
      // Cooperative scheduler loop for @static tasks
      if (this._staticTasks?.length) {
        const I = this.ind();
        if (this._staticTasks.length === 1) {
          const t = this._staticTasks[0];
          parts.push(`${I}while (!_${t.name}_instance._done) {`);
          parts.push(`${I}    ${t.pollFn}(&_${t.name}_instance);`);
          parts.push(`${I}}`);
        } else {
          const cond = this._staticTasks.map((t: StaticTask) => `!_${t.name}_instance._done`).join(' || ');
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

  addTop(line: string) { this._output.addTop(line); }
  addLambda(line: string) { this._output.addLambda(line); }

  // Delegating methods: types/helpers → functional
  _cTypeBytes(ct: string) { return helpers._cTypeBytes(this, ct); }
  _stackSizeOf(ct: string) { return helpers._stackSizeOf(this, ct); }
  cTypeToIdent(ctype: string) { return helpers.cTypeToIdent(this, ctype); }
  ctypeToTsName(ctype: string) { return helpers.ctypeToTsName(this, ctype); }
  _numericTypeInfo(ct: string) { return helpers._numericTypeInfo(this, ct); }
  _isSafeWidening(src: string, dst: string) { return helpers._isSafeWidening(this, src, dst); }
  _arrIdentToCType(ident: string) { return helpers._arrIdentToCType(this, ident); }
  _mapSuffix(ctype: string) { return helpers._mapSuffix(this, ctype); }
  _ensureMapStruct(suffix: string) { return helpers._ensureMapStruct(this, suffix); }
  _ensureMapEntry(suffix: string, kCType: string, vCType: string) { return helpers._ensureMapEntry(this, suffix, kCType, vCType); }
  _ensureRefArrayStruct(arrName: string, et: string) { return helpers._ensureRefArrayStruct(this, arrName, et); }
  _ensureArrayStruct(arrName: string, et: string) { return helpers._ensureArrayStruct(this, arrName, et); }
  _ensureArrayFreeMacro(elemIdent: string, arrName: string, et: string) { return helpers._ensureArrayFreeMacro(this, elemIdent, arrName, et); }
  _ensureArrayPushMacro(elemIdent: string, arrName: string, et: string) { return helpers._ensureArrayPushMacro(this, elemIdent, arrName, et); }
  _isOptType(elemType: string) { return helpers._isOptType(this, elemType); }
  _wrapOptValue(cExpr: string, exprNode: Expression, elemType: string) { return helpers._wrapOptValue(this, cExpr, exprNode, elemType); }
  _ensureOptArrayMacros(elemIdent: string, arrName: string, et: string) { return helpers._ensureOptArrayMacros(this, elemIdent, arrName, et); }
  _ensureArrayPopMacro(elemIdent: string, arrName: string, et: string) { return helpers._ensureArrayPopMacro(this, elemIdent, arrName, et); }
  _ensureOptStruct(optName: string, ctype: string) { return helpers._ensureOptStruct(this, optName, ctype); }
  _ensureSliceStruct(slName: string, etC: string, mutable = false) { return helpers._ensureSliceStruct(this, slName, etC, mutable); }
  _ensureSliceU8Struct() { return helpers._ensureSliceU8Struct(this); }
  _ensureOptRefStruct(optName: string, ctype: string) { return helpers._ensureOptRefStruct(this, optName, ctype); }
  _ensureUnknownStruct() { return helpers._ensureUnknownStruct(this); }
  _tsNameToTypeId(tsName: string) { return helpers._tsNameToTypeId(this, tsName); }
  _tsNameToCType(tsName: string) { return helpers._tsNameToCType(this, tsName); }
  _unknownPackerFor(ctype: string) { return helpers._unknownPackerFor(this, ctype); }
  _unknownGetterFor(ctype: string) { return helpers._unknownGetterFor(this, ctype); }
  _ensureUnknownPackerArray(elemIdent: string, arrName: string, et: string) { return helpers._ensureUnknownPackerArray(this, elemIdent, arrName, et); }
  _ensureUnknownPackerClass(className: string) { return helpers._ensureUnknownPackerClass(this, className); }
  _ensureGroupByMapStruct(etIdent: string, etCType: string) { return helpers._ensureGroupByMapStruct(this, etIdent, etCType); }
  _emitArrayMacro(macroName: string, lines: string[]) { return helpers._emitArrayMacro(this, macroName, lines); }
  _arrElem(etC: string) { return helpers._arrElem(this, etC); }
  _ensureArrayMapMacro(fromEt: string, toEt: string, fromCType: string, toCType: string) { return helpers._ensureArrayMapMacro(this, fromEt, toEt, fromCType, toCType); }
  _ensureArrayFlatMapMacro(fromEt: string, toEt: string, fromCType: string, toCType: string) { return helpers._ensureArrayFlatMapMacro(this, fromEt, toEt, fromCType, toCType); }
  _ensureArrayFilterMacro(et: string, etC: string) { return helpers._ensureArrayFilterMacro(this, et, etC); }
  _ensureArrayForeachMacro(et: string, etC: string) { return helpers._ensureArrayForeachMacro(this, et, etC); }
  _ensureArrayReduceMacro(et: string, toEt: string, etC: string, toCType: string, isRight: boolean) { return helpers._ensureArrayReduceMacro(this, et, toEt, etC, toCType, isRight); }
  _ensureArrayEveryMacro(et: string, etC: string) { return helpers._ensureArrayEveryMacro(this, et, etC); }
  _ensureArraySomeMacro(et: string, etC: string) { return helpers._ensureArraySomeMacro(this, et, etC); }
  _ensureArrayFindMacro(et: string, etC: string, isLast: boolean) { return helpers._ensureArrayFindMacro(this, et, etC, isLast); }
  _ensureArrayFindIndexMacro(et: string, etC: string, isLast: boolean) { return helpers._ensureArrayFindIndexMacro(this, et, etC, isLast); }
  _ensureArrayIncludesMacro(et: string, etC: string) { return helpers._ensureArrayIncludesMacro(this, et, etC); }
  _ensureArrayIndexOfMacro(et: string, etC: string, isLast: boolean) { return helpers._ensureArrayIndexOfMacro(this, et, etC, isLast); }
  _ensureArrayConcatMacro(et: string, etC: string) { return helpers._ensureArrayConcatMacro(this, et, etC); }
  _ensureArraySliceMacro(et: string, etC: string) { return helpers._ensureArraySliceMacro(this, et, etC); }
  _ensureArrayFlatMacro(et: string, etC: string) { return helpers._ensureArrayFlatMacro(this, et, etC); }
  _ensureArrayAtMacro(et: string, etC: string) { return helpers._ensureArrayAtMacro(this, et, etC); }
  _ensureArrayWithMacro(et: string, etC: string) { return helpers._ensureArrayWithMacro(this, et, etC); }
  _ensureArrayToReversedMacro(et: string, etC: string) { return helpers._ensureArrayToReversedMacro(this, et, etC); }
  _ensureArrayToSplicedMacro(et: string, etC: string) { return helpers._ensureArrayToSplicedMacro(this, et, etC); }
  _ensureArrayKeysMacro(et: string, etC: string) { return helpers._ensureArrayKeysMacro(this, et, etC); }
  _ensureArrayValuesMacro(et: string, etC: string) { return helpers._ensureArrayValuesMacro(this, et, etC); }
  _ensureArrayReverseMacro(et: string, etC: string) { return helpers._ensureArrayReverseMacro(this, et, etC); }
  _ensureArrayFillMacro(et: string, etC: string) { return helpers._ensureArrayFillMacro(this, et, etC); }
  _ensureArrayResizeMacro(et: string, etC: string) { return helpers._ensureArrayResizeMacro(this, et, etC); }
  _ensureArrayReallocateMacro(et: string, etC: string) { return helpers._ensureArrayReallocateMacro(this, et, etC); }
  _ensureArraySpliceMacro(et: string, etC: string) { return helpers._ensureArraySpliceMacro(this, et, etC); }
  _ensureArrayShiftMacro(et: string, etC: string) { return helpers._ensureArrayShiftMacro(this, et, etC); }
  _ensureArrayUnshiftMacro(et: string, etC: string) { return helpers._ensureArrayUnshiftMacro(this, et, etC); }
  _ensureArrayRemoveMacro(et: string, etC: string) { return helpers._ensureArrayRemoveMacro(this, et, etC); }
  _ensureArraySetMacro(et: string, etC: string) { return helpers._ensureArraySetMacro(this, et, etC); }


  // Delegating methods: genericsFns
  callGeneric(name: string, typeArgs: TypeAnn[], args: Argument[], lines: string[], depth: number) { return genericsFns.callGeneric(this, name, typeArgs, args, lines, depth); }
  inferObjLitType(node: ObjLit) { return genericsFns.inferObjLitType(this, node); }
  substType(typeNode: TypeAnn | null | undefined, subst: Map<string, string>) { return genericsFns.substType(this, typeNode, subst); }
  substNode(node: unknown, subst: Map<string, string>) { return genericsFns.substNode(this, node, subst); }
  emitMonoFunc(tmpl: FuncDecl, monoName: string, subst: Map<string, string>) { return genericsFns.emitMonoFunc(this, tmpl, monoName, subst); }
  emitMonoClass(tmpl: ClassDecl, monoName: string, subst: Map<string, string>) { return genericsFns.emitMonoClass(this, tmpl, monoName, subst); }

  // Delegating methods: miscFns
  newToC(node: New, lines: string[], depth: number) { return miscFns.newToC(this, node, lines, depth); }
  hoistArrow(node: Arrow | FuncExpr, retType: string | null | undefined, hint?: unknown) { return miscFns.hoistArrow(this, node, retType, hint); }
  _scanReturnExpr(node: unknown) { return miscFns._scanReturnExpr(this, node); }
  inferArrowReturn(node: Arrow | FuncExpr) { return miscFns.inferArrowReturn(this, node); }
  varDecl(qualifier: string, ctype: string, name: string) { return miscFns.varDecl(this, qualifier, ctype, name); }
  arrowParamTypes(node: Arrow) { return miscFns.arrowParamTypes(this, node); }
  arrayLitToC(node: ArrayLit, _elemType: string, lines: string[], depth: number) { return miscFns.arrayLitToC(this, node, _elemType, lines, depth); }
  arrayLitSize(node: ArrayLit) { return miscFns.arrayLitSize(this, node); }
  _isHeapStringInit(node: Expression | null) { return miscFns._isHeapStringInit(this, node); }
  _templateToC(node: TemplateLit, lines: string[], depth: number) { return miscFns._templateToC(this, node, lines, depth); }
  _findFreeVars(body: Expression | Block | null, paramNames: string[], selfName: string | null) { return miscFns._findFreeVars(this, body, paramNames, selfName); }
  hoistClosure(arrowNode: Arrow | FuncExpr, varName: string | null) { return miscFns.hoistClosure(this, arrowNode, varName); }
  _emitIterableImpl(className: string, iterMethod: IterMethod, elemCType: string) { return miscFns._emitIterableImpl(this, className, iterMethod, elemCType); }
  _emitPromiseTypedef(promiseType: string, innerType: string) { return miscFns._emitPromiseTypedef(this, promiseType, innerType); }
  _emitSpawnBlock(varName: string | null, body: Stmt | Expression, throwsTypes: TypeAnn[] | null, lines: string[], depth: number) { return miscFns._emitSpawnBlock(this, varName, body, throwsTypes, lines, depth); }
  _collectFreeVars(lambda: { params: Param[]; body: Block | Expression | null }) { return miscFns._collectFreeVars(this, lambda); }
  _avrSleepModeToC(node: Expression) { return miscFns._avrSleepModeToC(this, node); }

  // Delegating methods: exprFns
  exprToC(node: Expression, lines: string[] = [], depth: number = 0) { return exprFns.exprToC(this, node, lines, depth); }
  _truthyToC(node: Expression, lines: string[] = [], depth: number = 0) { return exprFns._truthyToC(this, node, lines, depth); }
  _charCode(raw: string) { return exprFns._charCode(this, raw); }
  _charLiteralToSTR_LIT(value: string) { return exprFns._charLiteralToSTR_LIT(this, value); }
  _stringLiteralToByte(node: Literal) { return exprFns._stringLiteralToByte(this, node); }
  literalToC(node: Literal) { return exprFns.literalToC(this, node); }
  literalToCTyped(node: Literal, ctype: string) { return exprFns.literalToCTyped(this, node, ctype); }
  _checkLiteralFitsType(node: Expression, ctype: string) { return exprFns._checkLiteralFitsType(this, node, ctype); }
  constVal(node: Expression) { return exprFns.constVal(this, node); }
  tryConstMixedBinary(node: Binary, targetCtype: string, lines: string[], depth: number) { return exprFns.tryConstMixedBinary(this, node, targetCtype, lines, depth); }
  binaryWidened(node: Binary, targetCtype: string, lines: string[], depth: number) { return exprFns.binaryWidened(this, node, targetCtype, lines, depth); }
  binaryToC(node: Binary, lines: string[], depth: number) { return exprFns.binaryToC(this, node, lines, depth); }
  _hasFloatVar(node: Expression) { return exprFns._hasFloatVar(this, node); }
  isStringExpr(node: Expression) { return exprFns.isStringExpr(this, node); }
  _derefStringPtr(node: Expression, cexpr: string) { return exprFns._derefStringPtr(this, node, cexpr); }
  _flattenStringConcat(node: Expression) { return exprFns._flattenStringConcat(this, node); }
  _stringConcatChain(operands: Expression[], lines: string[], depth: number) { return exprFns._stringConcatChain(this, operands, lines, depth); }
  unaryToC(node: Unary, lines: string[], depth: number) { return exprFns.unaryToC(this, node, lines, depth); }
  assignToC(node: Assign, lines: string[], depth: number) { return exprFns.assignToC(this, node, lines, depth); }

  // Delegating methods: stmtFns
  visitBlock(block: Block, lines: string[], depth: number) { return stmtFns.visitBlock(this, block, lines, depth); }
  visitStmtInMain(node: Stmt) { return stmtFns.visitStmtInMain(this, node); }
  visitStmt(node: Stmt, lines: string[], depth: number) { return stmtFns.visitStmt(this, node, lines, depth); }
  visitStmtOrBlock(node: Stmt, lines: string[], depth: number) { return stmtFns.visitStmtOrBlock(this, node, lines, depth); }

  // Delegating methods: stmtSubFns
  _visitVarDecl(node: VarDecl, lines: string[], depth: number) { return stmtSubFns._visitVarDecl(this, node, lines, depth); }
  _visitVarDestruct(node: Parameters<typeof stmtSubFns._visitVarDestruct>[1], lines: string[], depth: number) { return stmtSubFns._visitVarDestruct(this, node, lines, depth); }
  _emitRetainIfNeeded(valC: string, valNode: Expression, p: (s: string) => void) { return stmtSubFns._emitRetainIfNeeded(this, valC, valNode, p); }
  _wrapErrForCaller(throwsCtx: Parameters<typeof stmtSubFns._wrapErrForCaller>[1], errExpr: string, calleeSym: SymbolInfo | null) { return stmtSubFns._wrapErrForCaller(this, throwsCtx, errExpr, calleeSym); }
  _visitControlFlow(node: Stmt, lines: string[], depth: number) { return stmtSubFns._visitControlFlow(this, node, lines, depth); }
  _validateSwitchFallthrough(node: Switch) { return stmtSubFns._validateSwitchFallthrough(this, node); }
  _isSimpleCType(ct: string) { return stmtSubFns._isSimpleCType(this, ct); }
  _emitMatchCore(discriminant: Expression, cases: MatchCase[], hasParens: boolean, discC: string, discType: string, resultType: string, resultVar: string, lines: string[], depth: number) { return stmtSubFns._emitMatchCore(this, discriminant, cases, hasParens, discC, discType, resultType, resultVar, lines, depth); }
  emitMatchVarDecl(node: VarDecl, lines: string[], depth: number) { return stmtSubFns.emitMatchVarDecl(this, node, lines, depth); }
  _matchExprToC(node: Match, lines: string[], depth: number) { return stmtSubFns._matchExprToC(this, node, lines, depth); }
  _emitTryCatchResult(node: TryCatch, tryStmts: Stmt[], callStmt: Stmt, lines: string[], depth: number) { return stmtSubFns._emitTryCatchResult(this, node, tryStmts, callStmt, lines, depth); }
  _emitCatchBodies(catches: CatchClause[], resName: string, calleeSym: SymbolInfo | null, lines: string[], depth: number) { return stmtSubFns._emitCatchBodies(this, catches, resName, calleeSym, lines, depth); }
  emitPropagateVarDecl(node: VarDecl, lines: string[], depth: number) { return stmtSubFns.emitPropagateVarDecl(this, node, lines, depth); }
  _matchPatternBindings(pattern: MatchPattern, discC: string, discType: string) { return stmtSubFns._matchPatternBindings(this, pattern, discC, discType); }
  _matchPatternCond(pattern: MatchPattern, discC: string, discType: string | null, enumDef: Parameters<typeof stmtSubFns._matchPatternCond>[4]) { return stmtSubFns._matchPatternCond(this, pattern, discC, discType, enumDef); }
  emitSelectVarDecl(node: VarDecl, lines: string[], depth: number) { return stmtSubFns.emitSelectVarDecl(this, node, lines, depth); }

  // Delegating methods: asyncFns
  _initAsync() { return asyncFns._initAsync(this); }
  _asyncRetType(rt: TypeAnn | null) { return asyncFns._asyncRetType(this, rt); }
  _isInlinableConst(init: Parameters<typeof asyncFns._isInlinableConst>[1]) { return asyncFns._isInlinableConst(this, init); }
  _constLiteralC(init: Parameters<typeof asyncFns._constLiteralC>[1]) { return asyncFns._constLiteralC(this, init); }
  _awaitInfoOf(awaitNode: Await) { return asyncFns._awaitInfoOf(this, awaitNode); }
  _scanAsyncBody(params: Param[], body: Block | null) { return asyncFns._scanAsyncBody(this, params, body); }
  _scanExprIdents(node: Expression | Stmt | null | undefined, touch: (name: string) => void) { return asyncFns._scanExprIdents(this, node, touch); }
  _livenessScan(body: Block | null, localVarNames: Set<string>) { return asyncFns._livenessScan(this, body, localVarNames); }
  _genLivenessScan(body: Block | null, localVarNames: Set<string>) { return asyncFns._genLivenessScan(this, body, localVarNames); }
  _collectAwaitStates(body: Block | null) { return asyncFns._collectAwaitStates(this, body); }
  _topBlank(arr?: Parameters<typeof asyncFns._topBlank>[1]) { return asyncFns._topBlank(this, arr); }
  _emitStructMultiline(name: string, fields: string[]) { return asyncFns._emitStructMultiline(this, name, fields); }
  _emitStructCompact(name: string, fields: string[]) { return asyncFns._emitStructCompact(this, name, fields); }
  _emitTopFn(sig: string, bodyLines: string[]) { return asyncFns._emitTopFn(this, sig, bodyLines); }
  emitAsyncFunc(node: FuncDecl) { return asyncFns.emitAsyncFunc(this, node); }
  _buildAsyncPoll(body: Block | null) { return asyncFns._buildAsyncPoll(this, body); }
  _emitAsyncStmtList(stmts: Stmt[], lines: string[], actx: Parameters<typeof asyncFns._emitAsyncStmtList>[3], I: string) { return asyncFns._emitAsyncStmtList(this, stmts, lines, actx, I); }
  _emitAsyncWhile(s: While, remainingStmts: Stmt[], lines: string[], actx: Parameters<typeof asyncFns._emitAsyncWhile>[4], I: string) { return asyncFns._emitAsyncWhile(this, s, remainingStmts, lines, actx, I); }
  _emitAsyncDoWhile(s: DoWhile, remainingStmts: Stmt[], lines: string[], actx: Parameters<typeof asyncFns._emitAsyncDoWhile>[4], I: string) { return asyncFns._emitAsyncDoWhile(this, s, remainingStmts, lines, actx, I); }
  _emitAsyncFor(s: For, remainingStmts: Stmt[], lines: string[], actx: Parameters<typeof asyncFns._emitAsyncFor>[4], I: string) { return asyncFns._emitAsyncFor(this, s, remainingStmts, lines, actx, I); }
  _emitAsyncForOf(s: ForOf, remainingStmts: Stmt[], lines: string[], actx: Parameters<typeof asyncFns._emitAsyncForOf>[4], I: string) { return asyncFns._emitAsyncForOf(this, s, remainingStmts, lines, actx, I); }
  _emitAsyncTransition(lines: string[], actx: Parameters<typeof asyncFns._emitAsyncTransition>[2], I: string) { return asyncFns._emitAsyncTransition(this, lines, actx, I); }
  _checkAwaitTarget(awaitNode: Parameters<typeof asyncFns._checkAwaitTarget>[1]) { return asyncFns._checkAwaitTarget(this, awaitNode); }
  _emitAsyncStmt(s: Stmt, lines: string[], actx: Parameters<typeof asyncFns._emitAsyncStmt>[3], I: string) { return asyncFns._emitAsyncStmt(this, s, lines, actx, I); }
  _emitAsyncRegStmt(stmt: Stmt, lines: string[], I: string) { return asyncFns._emitAsyncRegStmt(this, stmt, lines, I); }
  _emitAsyncSwitch(node: Switch, lines: string[], actx: Parameters<typeof asyncFns._emitAsyncSwitch>[3], I: string) { return asyncFns._emitAsyncSwitch(this, node, lines, actx, I); }
  _selfE(expr: Expression | null | undefined) { return asyncFns._selfE(this, expr); }
  emitGeneratorFunc(node: FuncDecl) { return asyncFns.emitGeneratorFunc(this, node); }
  _buildGenNext(body: Block | null, yieldType: string, resultType: string, hasThrows: boolean, resultCt: string | null) { return asyncFns._buildGenNext(this, body, yieldType, resultType, hasThrows, resultCt); }
  _emitGenStmtList(stmts: Parameters<typeof asyncFns._emitGenStmtList>[1], lines: string[], gctx: Parameters<typeof asyncFns._emitGenStmtList>[3], I: string, yieldType: string, resultType: string, hasThrows: boolean, resultCt: string | null, zeroVal: string) { return asyncFns._emitGenStmtList(this, stmts, lines, gctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal); }
  _emitGenStmt(s: Parameters<typeof asyncFns._emitGenStmt>[1], lines: string[], gctx: Parameters<typeof asyncFns._emitGenStmt>[3], I: string, yieldType: string, resultType: string, hasThrows: boolean, resultCt: string | null, zeroVal: string) { return asyncFns._emitGenStmt(this, s, lines, gctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal); }
  _emitGenRegStmt(stmt: Parameters<typeof asyncFns._emitGenRegStmt>[1], lines: string[], I: string) { return asyncFns._emitGenRegStmt(this, stmt, lines, I); }

}

// Declaration merging: mixin methods added via Object.assign at bottom of file.
// All signatures use loose (...args: any[]) for now — individual methods can be
// tightened later. This gives method-name checking and IDE autocomplete.
interface Context {
  _asyncGenRetType: string | null;
  _analyzeClassDecorator(...args: any[]): any;
  _analyzeDecorator(...args: any[]): any;
  _buildInnerCall(...args: any[]): any;
  _classHasInheritance(...args: any[]): any;
  _deepSubstOrigApply(...args: any[]): any;
  _dispatchArrayStatic(...args: any[]): any;
  _dispatchBuiltin(...args: any[]): any;
  _dispatchConcurrency(...args: any[]): any;
  _dispatchConversion(...args: any[]): any;
  _dispatchGroupBy(...args: any[]): any;
  _dispatchObjectStatic(...args: any[]): any;
  _dispatchStdBlob(...args: any[]): any;
  _dispatchStdBuffer(...args: any[]): any;
  _dispatchStdDataView(...args: any[]): any;
  _dispatchStdFs(...args: any[]): any;
  _dispatchStdHal(...args: any[]): any;
  _dispatchStdHashMap(...args: any[]): any;
  _dispatchStdIo(...args: any[]): any;
  _dispatchStdLib(...args: any[]): any;
  _dispatchStdNet(...args: any[]): any;
  _dispatchStdRegex(...args: any[]): any;
  _dispatchStdSet(...args: any[]): any;
  _dispatchStdSignal(...args: any[]): any;
  _dispatchStdTasks(...args: any[]): any;
  _dispatchStdTemporal(...args: any[]): any;
  _dispatchStdUrl(...args: any[]): any;
  _dispatchStdWs(...args: any[]): any;
  _dvOp(...args: any[]): any;
  _emitDecoratedMethod(...args: any[]): any;
  _emitDecoratedStandaloneFunc(...args: any[]): any;
  _emitDecoratorWrapperFn(...args: any[]): any;
  _emitPoolClass(...args: any[]): any;
  _ensureClassFree(...args: any[]): any;
  _ensureHeapDestructor(...args: any[]): any;
  _ensureImplicitVtable(...args: any[]): any;
  _ensurePoolAlloc(...args: any[]): any;
  _ensurePoolDrop(...args: any[]): any;
  _extractCallbackFn(...args: any[]): any;
  _extractLambdaBody(...args: any[]): any;
  _getIfaceParamName(...args: any[]): any;
  _getStringFields(...args: any[]): any;
  _hasOrigApplyDeep(...args: any[]): any;
  _handleStdAvr(...args: any[]): any;
  _handleStdFs(...args: any[]): any;
  _handleStdIo(...args: any[]): any;
  _handleStdReactive(...args: any[]): any;
  _handleStdNet(...args: any[]): any;
  _handleStdLibc(...args: any[]): any;
  _handleStdStack(...args: any[]): any;
  _isOrigApply(...args: any[]): any;
  _markHeapClass(...args: any[]): any;
  _substituteInAst(...args: any[]): any;
  argsToC(...args: any[]): any;
  bareNumberValue(...args: any[]): any;
  callToC(...args: any[]): any;
  consoleCall(...args: any[]): any;
  emitFuncBody(...args: any[]): any;
  emitMethod(...args: any[]): any;
  emitVtableConstant(...args: any[]): any;
  flattenUnion(...args: any[]): any;
  getStringLiteralMembers(...args: any[]): any;
  getStructFields(...args: any[]): any;
  isBareLiteralNumber(...args: any[]): any;
  isStringLiteralUnion(...args: any[]): any;
  jsonCall(...args: any[]): any;
  labelUsed(...args: any[]): any;
  mathCall(...args: any[]): any;
  methodCall(...args: any[]): any;
  visitClassDecl(...args: any[]): any;
  visitDeclareConst(...args: any[]): any;
  visitDeclareFunction(...args: any[]): any;
  visitDeclareModule(...args: any[]): any;
  visitEnum(...args: any[]): any;
  visitExtensionFunc(...args: any[]): any;
  visitFuncDecl(...args: any[]): any;
  visitGlobalVar(...args: any[]): any;
  visitInterface(...args: any[]): any;
  visitProgram(...args: any[]): any;
  visitTopLevel(...args: any[]): any;
  visitTypeAlias(...args: any[]): any;
}

export type CodeGenThis = Context;
export type CodeGenContext = Context;

import topLevel  from './codegen/top-level.js';
import * as stmtFns from './codegen/stmt.js';
import * as stmtSubFns from './codegen/stmt/index.js';
import calls     from './codegen/calls/index.js';
import * as asyncFns from './codegen/async/index.js';
import type { SpawnInfo, FieldInfo } from './codegen/async/scan.js';
import { STDLIB_HANDLERS, LANGUAGE_BUILTINS } from './stdlib-registry.js';
import * as exprFns from './codegen/expr/index.js';
import * as miscFns from './codegen/misc/index.js';
import type { IterMethod } from './codegen/misc/emit-helpers.js';
import * as genericsFns from './codegen/generics.js';
import * as helpers from './codegen/types/helpers.js';

const _mixinSources = [
  ['topLevel',  topLevel],
  ['calls',     calls],
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

Object.assign(Context.prototype, topLevel, calls, STDLIB_HANDLERS);
