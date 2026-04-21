import { mangleParams } from '../types.js';
// top-level.js
export default {
  visitProgram(ast) {
    // Pre-scan: find variables exclusively consumed by Object.fromEntries(varName)
    this._fromEntriesConsumed = new Map();
    for (const node of ast.body) {
      const stmt = node.kind === 'Export' ? node.decl : node;
      if (stmt?.kind === 'VarDecl' &&
          stmt.init?.kind === 'Call' &&
          stmt.init.callee?.kind === 'Member' &&
          stmt.init.callee?.object?.name === 'Object' &&
          stmt.init.callee?.prop === 'fromEntries' &&
          stmt.init.args?.[0]?.expr?.kind === 'Ident') {
        this._fromEntriesConsumed.set(stmt.init.args[0].expr.name, null);
      }
    }

    // Pre-scan: find Shared<T> and Weak<T> usage to know which classes need _refcount/_weakcount
    this._arcClasses = new Map();
    const _scanArc = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_scanArc); return; }
      if (n.kind === 'New' && (n.name === 'Shared' || n.name === 'Weak')) {
        const tArg = n.typeArgs?.[0];
        if (tArg?.kind === 'TypeRef') {
          const info = this._arcClasses.get(tArg.name) ?? {};
          if (n.name === 'Shared') { info.shared = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          if (n.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          this._arcClasses.set(tArg.name, info);
        }
      }
      if (n.kind === 'VarDecl') {
        const _checkTypeAnn = (ta) => {
          if (!ta) return;
          if (ta.kind === 'TypeRef' && (ta.name === 'Shared' || ta.name === 'Weak')) {
            const tArg = ta.typeArgs?.[0];
            if (tArg?.kind === 'TypeRef') {
              const info = this._arcClasses.get(tArg.name) ?? {};
              if (ta.name === 'Shared') { info.shared = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
              if (ta.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
              this._arcClasses.set(tArg.name, info);
            }
          }
        };
        _checkTypeAnn(n.typeAnn);
      }
      // Also scan TypeRef fields for Weak<T>
      if (n.kind === 'TypeRef' && n.name === 'Weak') {
        const tArg = n.typeArgs?.[0];
        if (tArg?.kind === 'TypeRef') {
          const info = this._arcClasses.get(tArg.name) ?? {};
          info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true;
          this._arcClasses.set(tArg.name, info);
        }
      }
      for (const key of Object.keys(n)) {
        const child = n[key];
        if (child && typeof child === 'object') _scanArc(child);
      }
    };
    for (const node of ast.body) _scanArc(node);

    // Pre-scan: detect inheritance chains > 1 level (must fire before per-class non-Error check)
    {
      const classDecls = {};
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl' && !n.typeParams?.length) classDecls[n.name] = n;
      }
      for (const [name, n] of Object.entries(classDecls)) {
        if (!n.superClass) continue;
        const parent = classDecls[n.superClass];
        if (parent?.superClass) {
          throw this.error(`TypeError: Inheritance chains longer than one level are not supported; '${name}' cannot extend '${n.superClass}' which already extends '${parent.superClass}'`);
        }
      }
    }

    // Pre-scan: detect target and allocator annotations
    this._targetName = 'desktop';
    this._allocatorName = 'default';
    // Also check comment-style annotation: // @target: avr
    if (this.src) {
      const mCommentTarget = this.src.match(/\/\/\s*@target:\s*(\w+)/);
      if (mCommentTarget) this._targetName = mCommentTarget[1];
    }
    for (const node of ast.body) {
      if (node.kind === 'ProfileAnnotation') {
        const mTarget = node.content.match(/target\((\w+)\)/);
        if (mTarget) this._targetName = mTarget[1];
        const mAlloc = node.content.match(/allocator[:(]"?(\w+)"?\)?/);
        if (mAlloc) this._allocatorName = mAlloc[1]; // 'none', 'static', 'dynamic'
        const mNoRec = /no_recursion:true/.test(node.content);
        if (mNoRec) this._noRecursion = true;
        const mSched = node.content.match(/scheduler:(\w+)/);
        if (mSched) this._schedulerName = mSched[1]; // 'cooperative'
        const mRam = node.content.match(/ram_size:(\d+)/);
        if (mRam) this._ramSize = parseInt(mRam[1]);
        const mStack = node.content.match(/stack_size:(\d+)/);
        if (mStack) this._stackSize = parseInt(mStack[1]);
      }
    }

    // Pre-scan: recursion detection when no_recursion is true
    if (this._noRecursion) {
      // Build call graph: funcName → Set of called top-level funcNames
      const callGraph = new Map();
      const _collectCalls = (nd, result) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach(x => _collectCalls(x, result)); return; }
        if (nd.kind === 'Call' && nd.callee?.kind === 'Ident') result.add(nd.callee.name);
        // Don't recurse into nested function bodies
        if (nd.kind === 'FuncDecl' || nd.kind === 'ArrowFunc') return;
        for (const v of Object.values(nd)) {
          if (v && typeof v === 'object') _collectCalls(v, result);
        }
      };
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'FuncDecl' && n.body) {
          const calls = new Set();
          _collectCalls(n.body, calls);
          callGraph.set(n.name, calls);
        }
      }
      // Detect cycles via DFS
      const visited = new Set();
      const inStack = new Map(); // funcName → index in path
      const path = [];
      const _dfs = (fn) => {
        if (inStack.has(fn)) {
          const cycleStart = inStack.get(fn);
          const cycle = path.slice(cycleStart);
          if (cycle.length === 1) {
            throw this.error(`TypeError: Direct recursion detected in '${fn}()': recursion is forbidden when no_recursion is true`);
          } else {
            const cycleStr = [...cycle, fn].join(' → ');
            throw this.error(`TypeError: Mutual recursion detected: ${cycleStr}; recursion is forbidden when no_recursion is true`);
          }
        }
        if (visited.has(fn)) return;
        inStack.set(fn, path.length);
        path.push(fn);
        for (const callee of (callGraph.get(fn) ?? [])) {
          if (callGraph.has(callee)) _dfs(callee);
        }
        path.pop();
        inStack.delete(fn);
        visited.add(fn);
      };
      for (const fn of callGraph.keys()) _dfs(fn);
    }

    // Pre-scan: collect all classes used in throws clauses → _throwsClasses
    // Also collect union groups for _new determination
    this._throwsClasses = new Map(); // className → { hasMessage, hasStack, needsNew }
    const _throwsUnions = []; // each element = array of class names from one throws clause
    // Flatten throwsTypes array (handles both TypeRef and TypeUnion elements)
    const _flattenThrowsNames = (throwsTypes) => {
      const names = [];
      for (const t of throwsTypes ?? []) {
        if (t.kind === 'TypeRef') names.push(t.name);
        else if (t.kind === 'TypeUnion') {
          for (const inner of t.types) { if (inner.kind === 'TypeRef') names.push(inner.name); }
        }
      }
      return names;
    };
    const _collectThrows = (throwsTypes) => {
      if (!throwsTypes?.length) return;
      const names = _flattenThrowsNames(throwsTypes);
      for (const n of names) {
        if (!this._throwsClasses.has(n)) this._throwsClasses.set(n, { hasMessage: false, hasStack: false, needsNew: false });
      }
      if (names.length > 0) _throwsUnions.push(names);
    };
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'FuncDecl') _collectThrows(n.throwsTypes);
      if (n?.kind === 'ClassDecl') {
        for (const m of (n.members ?? [])) {
          if (m.kind === 'Method') _collectThrows(m.throwsTypes);
        }
      }
    }
    // Determine hasMessage/hasStack for each throws class; also check all classes for embedded stack
    const _embeddedTargets = ['avr', 'arm', 'stm32'];
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind === 'ClassDecl') {
        const fields = (n.members ?? []).filter(m => m.kind === 'Field');
        const hasStack = fields.some(f => f.name === 'stack');
        // Any class with 'stack' field on embedded target → error
        if (hasStack && _embeddedTargets.includes(this._targetName)) {
          throw this.error(`TypeError: Error stack traces are not supported on embedded targets (${this._targetName})`);
        }
        const info = this._throwsClasses.get(n.name);
        if (info) {
          info.hasMessage = fields.some(f => f.name === 'message');
          info.hasStack = hasStack;
        }
      }
    }
    // Determine needsNew: walk AST for throw new X() nodes
    const _thrownClasses = new Set();
    const _walkThrows = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_walkThrows); return; }
      if (n.kind === 'Throw' && n.value?.kind === 'New') _thrownClasses.add(n.value.name);
      for (const k of Object.keys(n)) {
        if (k !== 'parent') { const v = n[k]; if (v && typeof v === 'object') _walkThrows(v); }
      }
    };
    for (const node of ast.body) _walkThrows(node);
    // For each union: if any member thrown → all get needsNew
    for (const union of _throwsUnions) {
      if (union.some(name => _thrownClasses.has(name))) {
        for (const name of union) {
          const info = this._throwsClasses.get(name);
          if (info) info.needsNew = true;
        }
      }
    }

    // Pre-scan: collect all Result typedefs needed, grouped by errKey
    // Map: errKey → [{ retCtype, retIdent, resultName }]
    this._resultTypesByErrKey = new Map();
    this._emittedResultErrKeys = new Set();
    const _basicTypeMap = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
      'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
      'f32':'float','f64':'double','bool':'bool','string':'String',
      'void':'void','usize':'size_t','char':'char' };
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if (n?.kind !== 'FuncDecl' || !n.throwsTypes?.length) continue;
      const throwsNames = _flattenThrowsNames(n.throwsTypes);
      if (!throwsNames.length) continue;
      const errKey = throwsNames.join('_');
      let retCtype;
      if (!n.returnType || (n.returnType.kind === 'TypeRef' && n.returnType.name === 'void')) {
        retCtype = 'void';
      } else if (n.returnType.kind === 'TypeRef') {
        retCtype = _basicTypeMap[n.returnType.name] ?? n.returnType.name;
      } else {
        retCtype = 'void';
      }
      const retIdent = this.cTypeToIdent(retCtype);
      const resultName = `Result_${retIdent}_${errKey}`;
      if (!this._resultTypesByErrKey.has(errKey)) this._resultTypesByErrKey.set(errKey, []);
      const list = this._resultTypesByErrKey.get(errKey);
      if (!list.some(r => r.resultName === resultName)) {
        list.push({ retCtype, retIdent, resultName });
      }
    }

    // Pre-scan: collect names used as decorators (so we can suppress C emission for those functions)
    this._decoratorFns = new Map();   // name → FuncDecl AST
    this._decoratorNames = new Set(); // all names used with @
    this._platformSkipped = new Map(); // name → allowed platforms (for error reporting)
    {
      const scanDecs = (decs) => { for (const d of (decs ?? [])) this._decoratorNames.add(d.name); };
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'ClassDecl') {
          scanDecs(n.decorators);
          for (const m of (n.members ?? [])) scanDecs(m.decorators);
        }
        if (n?.kind === 'FuncDecl') scanDecs(n.decorators);
      }
    }

    // Pre-scan: detect HashMap capacity violations (capacity overflow takes priority over platform error)
    this._hmCapViolations = new Map(); // varName → { count, cap }
    {
      const _hmDecls = new Map(); // varName → capacityNum
      for (const node of ast.body) {
        const n = node.kind === 'Export' ? node.decl : node;
        if (n?.kind === 'VarDecl' && n.init?.kind === 'New' && n.init.name === 'HashMap') {
          const capLit = n.init.args?.[0]?.expr;
          const capNum = capLit?.litType === 'number' ? parseInt(capLit.value) : 0;
          if (capNum > 0) _hmDecls.set(n.name, { count: 0, cap: capNum });
        }
        if (n?.kind === 'ExprStmt' && n.expr?.kind === 'Call') {
          const callee = n.expr.callee;
          if (callee?.kind === 'Member' && callee.prop === 'set' && callee.object?.kind === 'Ident') {
            const info = _hmDecls.get(callee.object.name);
            if (info) {
              info.count++;
              if (info.count > info.cap && !this._hmCapViolations.has(callee.object.name)) {
                this._hmCapViolations.set(callee.object.name, { count: info.count, cap: info.cap });
              }
            }
          }
        }
      }
    }

    // Pre-scan: collect variable names referenced by top-level functions
    // These must become static globals (accessible from function scope)
    this._funcRefVars = new Set();
    for (const node of ast.body) {
      const n = node.kind === 'Export' ? node.decl : node;
      if ((n?.kind === 'FuncDecl' || n?.kind === 'ExtensionFunc') && n.body) {
        // Exclude parameter names — they shadow globals and must not trigger promotion
        const localNames = new Set();
        const srcParams = n.kind === 'ExtensionFunc'
          ? [{ name: 'this' }, ...(n.params ?? [])]
          : (n.params ?? []);
        for (const p of srcParams) {
          if (p?.name) localNames.add(p.name);
          if (p?.destructObj) for (const k of Object.keys(p.destructObj)) localNames.add(k);
          if (p?.destructArr) for (const s of p.destructArr) if (s?.name) localNames.add(s.name);
        }
        // Collect idents from body, skipping shadowed param names
        // Also skip nested function bodies (they have their own scopes)
        const _collect = (nd, outerLocals) => {
          if (!nd || typeof nd !== 'object') return;
          if (Array.isArray(nd)) { nd.forEach(x => _collect(x, outerLocals)); return; }
          if (nd.kind === 'Ident') {
            if (!outerLocals.has(nd.name)) this._funcRefVars.add(nd.name);
            return;
          }
          // Nested function: collect with its own param scope merged
          if (nd.kind === 'FuncDecl' || nd.kind === 'ArrowFunc') {
            const inner = new Set(outerLocals);
            for (const p of (nd.params ?? [])) {
              if (p?.name) inner.add(p.name);
            }
            if (nd.body) _collect(nd.body, inner);
            return;
          }
          // VarDecl: add declared name to local scope for subsequent siblings
          // (we don't track declaration order here — just collect all idents)
          for (const v of Object.values(nd)) {
            if (v && typeof v === 'object') _collect(v, outerLocals);
          }
        };
        _collect(n.body, localNames);
      }
      // Also scan reactive callbacks (effect/computed/batch arrow args) for non-Signal free vars
      // Signal vars are captured by pointer into the env struct, not promoted to static globals
      if (n?.kind === 'ExprStmt' && n.expr?.kind === 'Call') {
        const _callee = n.expr.callee;
        const _isReactive = _callee?.kind === 'Ident' && ['effect', 'computed', 'batch'].includes(_callee.name);
        if (_isReactive) {
          const arrow = n.expr.args?.[0]?.expr;
          if (arrow?.kind === 'Arrow') {
            // Collect top-level Signal var names (to exclude from promotion)
            const _signalVarNames = new Set();
            for (const sn of ast.body) {
              const sd = sn.kind === 'Export' ? sn.decl : sn;
              if (sd?.kind === 'VarDecl' && sd.init?.kind === 'New' && sd.init.name === 'Signal') {
                _signalVarNames.add(sd.name);
              }
            }
            const arrowParams = new Set((arrow.params ?? []).map(p => p.name));
            const _collectArrow = (nd) => {
              if (!nd || typeof nd !== 'object') return;
              if (Array.isArray(nd)) { nd.forEach(_collectArrow); return; }
              if (nd.kind === 'Ident' && !arrowParams.has(nd.name) && !_signalVarNames.has(nd.name)) {
                this._funcRefVars.add(nd.name);
              }
              for (const v of Object.values(nd)) {
                if (v && typeof v === 'object') _collectArrow(v);
              }
            };
            _collectArrow(arrow.body);
          }
        }
      }
    }

    for (const node of ast.body) {
      try {
        this.visitTopLevel(node);
      } catch (e) {
        if (e?.isTscError) {
          this._errors.push(e);
          if (this._errors.length >= this._maxErrors) break;
        } else {
          throw e;
        }
      }
    }
    if (this._errors.length > 0) {
      const bag = new Error('compilation failed');
      bag.isTscErrorBag = true;
      bag.errors = this._errors;
      throw bag;
    }
  },

  visitTopLevel(node) {
    if (!node) return;
    switch (node.kind) {
      case 'ProfileAnnotation': {
        if (node.content.startsWith('isr(')) this._pendingIsrAnnotation = node.content;
        break;
      }
      case 'Import':
        // Handle stdlib imports that require includes or special registration
        if (node.source === 'std/avr') {
          this.includes.add('#include "std/avr.h"');
          // Register imported names as special avr objects
          for (const name of (node.names ?? [])) {
            if (name === 'SleepMode') this._avrSleepModeImported = true;
            else this.define(name, { ctype: '_avr_' + name, varKind: 'const', _isAvrObj: true, _avrName: name });
          }
        } else if (node.source === 'std/random') {
          this._stdRandomImported = true;
        } else if (node.source === 'std/string') {
          for (const name of (node.names ?? [])) {
            if (name === 'atob' || name === 'btoa') this._stdStringBase64 = true;
            else if (name === 'decodeUtf8') this._stdStringDecodeUtf8 = true;
            else if (name === 'encodeUtf8') this._stdStringEncodeUtf8 = true;
            else if (name === 'Regex') this._stdStringRegex = true;
            // 'String' namespace — no extra registration needed
          }
        } else if (node.source === 'std/embedded') {
          this._stdEmbeddedImported = true;
        } else if (node.source === 'std/temporal') {
          this.includes.add('#include "std/temporal.h"');
          this._stdTemporalImported = true;
        } else if (node.source === 'std/fs') {
          const embeddedTargets = ['avr', 'arm', 'stm32'];
          if (embeddedTargets.includes(this._targetName)) {
            throw this.error(`TypeError: 'std/fs' is not available on embedded targets`);
          }
          this.includes.add('#include "std/fs.h"');
          this._stdFsImported = true;
        } else if (node.source === 'std/url') {
          this.includes.add('#include "std/url.h"');
          this._stdUrlImported = true;
        } else if (node.source === 'std/blob') {
          // #include "std/blob.h" only added when TscBlob is actually used (isTscBlob path in stmt.js)
          this._stdBlobImported = true;
        } else if (node.source === 'std/io') {
          this.includes.add('#include "std/io.h"');
          this._stdIoImported = true;
          // Register Reader/Writer as vtable interface types
          for (const nm of (node.names ?? [])) {
            if (nm === 'Reader') {
              if (!this._emittedReaderVtable) {
                this._emittedReaderVtable = true;
                // Array_u8 must appear before Reader vtable
                this._ensureArrayStruct('Array_u8', 'uint8_t');
                this.typedefs.push('');
                this.addTop('typedef struct {');
                this.addTop('    size_t (*read)(void *self, uint8_t *buf, size_t len);');
                this.addTop('} Reader_vtable;');
                this.addTop('typedef struct { void *self; const Reader_vtable *vtable; } Reader;');
                this.addTop('');
              }
              this.classes.set('Reader', { isStruct: true, _isVtable: true, _vtableKind: 'Reader',
                fields: [{ name: 'self', ctype: 'void *' }, { name: 'vtable', ctype: 'const Reader_vtable *' }] });
            }
            if (nm === 'Writer') {
              if (!this._emittedWriterVtable) {
                this._emittedWriterVtable = true;
                // Array_u8 must appear before Writer vtable
                this._ensureArrayStruct('Array_u8', 'uint8_t');
                this.typedefs.push('');
                this.addTop('typedef struct {');
                this.addTop('    size_t (*write)(void *self, const uint8_t *buf, size_t len);');
                this.addTop('} Writer_vtable;');
                this.addTop('typedef struct { void *self; const Writer_vtable *vtable; } Writer;');
                this.addTop('');
              }
              this.classes.set('Writer', { isStruct: true, _isVtable: true, _vtableKind: 'Writer',
                fields: [{ name: 'self', ctype: 'void *' }, { name: 'vtable', ctype: 'const Writer_vtable *' }] });
            }
          }
        } else if (node.source === 'std/reactive') {
          this.includes.add('#include "std/reactive.h"');
          this._stdReactiveImported = true;
          this._reactiveClosureCount = 0;
          this._capturedSignalMap = new Map(); // varName → pointer expr like "_closure_0_captured.x"
        } else if (node.source === 'std/ws') {
          this.includes.add('#include "std/ws.h"');
          this._stdWsImported = true;
        } else if (node.source === 'std/net') {
          const embeddedTargets = ['avr', 'arm', 'stm32'];
          if (embeddedTargets.includes(this._targetName)) {
            throw this.error(`TypeError: 'std/net' is not available on embedded targets`);
          }
          this.includes.add('#include "std/net.h"');
          this._stdNetImported = true;
          // Register TscResponse so inferType resolves .ok → bool, .status → int32_t
          this.classes.set('TscResponse', {
            isStruct: true,
            fields: [{ name: 'ok', ctype: 'bool' }, { name: 'status', ctype: 'int32_t' }],
          });
        } else if (node.source === 'std/hal') {
          const embeddedTargets = ['avr', 'arm', 'stm32'];
          if (!embeddedTargets.includes(this._targetName)) {
            throw this.error(`TypeError: 'std/hal' requires an embedded platform target`);
          }
          this.includes.add('#include "std/hal.h"');
          this._stdHalImported = true;
        }
        break; // stdlib handled via includes
      case 'ExportFrom': {
        // export { X, Y } from "./module"  OR  export { X, Y }
        const { names, source } = node;
        if (source) {
          // Re-export from external module: look up in _importedModules
          const resolvedPath = this._sourceToPath?.[source];
          const moduleExports = resolvedPath ? this._importedModules?.[resolvedPath] : null;
          for (const name of (names ?? [])) {
            const entry = moduleExports?.[name] ?? this.lookup(name);
            if (entry) {
              this.define(name, entry);
              this._exports.set(name, entry);
            }
          }
        } else {
          // export { X, Y } — re-export already-defined symbols
          for (const name of (names ?? [])) {
            const entry = this.lookup(name);
            if (entry) this._exports.set(name, entry);
          }
        }
        break;
      }
      case 'Export': {
        if (node.default) throw this.error('"export default" is not allowed; use named exports only');
        if (node.decl?.kind === 'FuncDecl') {
          this.visitFuncDecl(node.decl, true, true); // isExported=true → no static
        } else if (node.decl?.kind === 'ExtensionFunc') {
          this.visitExtensionFunc(node.decl);
        } else {
          this.visitTopLevel(node.decl);
        }
        // Track exported symbol for bundle system
        const _exportedName = node.decl?.name;
        if (_exportedName) {
          const _entry = this.lookup(_exportedName);
          if (_entry) this._exports.set(_exportedName, _entry);
        }
        break;
      }
      case 'ClassDecl':   this.visitClassDecl(node); break;
      case 'Interface':   this.visitInterface(node); break;
      case 'Enum':        this.visitEnum(node); break;
      case 'TypeAlias':   this.visitTypeAlias(node); break;
      case 'FuncDecl':    this.visitFuncDecl(node, true, false); break; // not exported → static
      case 'FuncOverload':
        // Collect signatures; implementation FuncDecl will emit them
        if (!this._pendingOverloads) this._pendingOverloads = new Map();
        { const _sigs = this._pendingOverloads.get(node.name) ?? [];
          // Check for duplicate/ambiguous signature
          const newSig = (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
          const dupSig = _sigs.find(s => {
            const sig = (s.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
            return sig === newSig;
          });
          if (dupSig) {
            const paramDesc = (node.params ?? []).map(p => `${p.name}: ${p.typeAnn?.name ?? '?'}`).join(', ');
            throw this.error(`TypeError: Ambiguous overload for '${node.name}': duplicate signature '(${paramDesc})'`);
          }
          _sigs.push(node);
          this._pendingOverloads.set(node.name, _sigs); }
        break;
      case 'VarDecl': {
        // process.argv assignment → alias _argv in scope, emit in main
        if (node.init?.kind === 'Member' &&
            node.init.object?.kind === 'Ident' && node.init.object.name === 'process' &&
            node.init.prop === 'argv') {
          this._useArgcArgv = true;
          // Array_string is predefined in runtime.h (no need to emit typedef)
          if (!this._emittedArrayStructs) this._emittedArrayStructs = new Set();
          this._emittedArrayStructs.add('Array_string');
          this.define(node.name, { ctype: 'Array_string', varKind: node.varKind, _cAlias: '_argv' });
          break;
        }
        // volatile<T> global variable → emit as plain global C var (before main)
        if (node.typeAnn?.kind === 'TypeRef' && node.typeAnn.name === 'volatile') {
          const vCtype = this.resolveType(node.typeAnn);
          const vInit = node.init ? this.exprToC(node.init) : '0';
          this.addTop(`${vCtype} ${node.name} = ${vInit};`);
          this.addTop('');
          this.define(node.name, { ctype: vCtype, varKind: node.varKind });
          break;
        }

        // @static decorator: emit as compile-time static backing (BSS-friendly)
        const staticDec = (node.decorators ?? []).find(d => d.name === 'static');
        if (staticDec && node.init?.kind === 'New' && node.init.name === 'Array') {
          const capArg = node.init.args?.[0];
          if (capArg) {
            const capC = this.exprToC(capArg.expr, [], 0);
            const et = node.init.typeArgs?.[0] ? this.resolveType(node.init.typeArgs[0]) : 'int32_t';
            const etId = this.cTypeToIdent(et);
            const dataVar = `${node.name}_data`;
            this.topLevel.push(`static ${et} ${dataVar}[${capC}];`);
            this.topLevel.push(`static struct { ${et} *data; size_t length; size_t capacity; } ${node.name} = {`);
            this.topLevel.push(`    .data = ${dataVar}, .length = 0, .capacity = ${capC}`);
            this.topLevel.push(`};`);
            this.topLevel.push('');
            const arrName = `Array_${etId}`;
            this.define(node.name, { ctype: arrName, varKind: node.varKind, elemType: etId, arrElemCType: et, isArray: true, _isStaticArray: true });
            break;
          }
        }
        if (staticDec && node.typeAnn?.kind === 'TypeFixedArray') {
          const et = this.resolveType(node.typeAnn.element);
          const size = node.typeAnn.size;
          if (this._ramSize != null) {
            const bytes = size * this._cTypeBytes(et);
            this._bssUsage = (this._bssUsage ?? 0) + bytes;
            if (this._bssUsage > this._ramSize) {
              throw this.error(`TypeError: Static BSS usage (${this._bssUsage} bytes) exceeds ram_size (${this._ramSize} bytes)`);
            }
          }
          const initLines = [];
          this.visitStmt(node, initLines, 0);
          // Rewrite the emitted line to be static
          for (const line of initLines) {
            const trimmed = line.trim();
            if (trimmed) this.topLevel.push('static ' + trimmed);
          }
          this.topLevel.push('');
          this.define(node.name, { ctype: et, varKind: node.varKind, isFixedArray: true, arraySize: size });
          break;
        }
        if (staticDec && node.init?.kind === 'New' && node.init.name === 'Map') {
          const capArg = node.init.args?.[0];
          if (capArg) {
            const capC = this.exprToC(capArg.expr, [], 0);
            const [kt, vt] = (node.init.typeArgs ?? []).map(t => this.resolveType(t));
            const k = kt ?? 'int32_t';
            const v = vt ?? 'int32_t';
            const kId = this.cTypeToIdent(k);
            const vId = this.cTypeToIdent(v);
            const smType = `StaticMap_${kId}_${vId}`;
            if (!this._emittedStaticMaps) this._emittedStaticMaps = new Set();
            if (!this._emittedStaticMaps.has(smType)) {
              this._emittedStaticMaps.add(smType);
              this.addTop(`typedef struct {`);
              this.addTop(`    ${k} keys[${capC}];`);
              this.addTop(`    ${v} values[${capC}];`);
              this.addTop(`    bool used[${capC}];`);
              this.addTop(`    size_t capacity;`);
              this.addTop(`    size_t count;`);
              this.addTop(`} ${smType};`);
              this.addTop('');
            }
            this.topLevel.push(`static ${smType} ${node.name} = {.capacity = ${capC}};`);
            this.topLevel.push('');
            this.define(node.name, { ctype: smType, varKind: node.varKind, _isStaticMap: true, _smSuffix: `${kId}_${vId}` });
            break;
          }
        }

        // Make it a static global if: referenced by a top-level function body,
        // OR in library mode (no main()), OR @static decorator forces BSS lifetime
        const needsStatic = this._libraryMode || this._funcRefVars?.has(node.name) || !!staticDec;
        if (needsStatic) {
          // Module-level variable → static global (not inside main)
          const varLines = [];
          this.visitStmt(node, varLines, 0);
          for (const line of varLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.topLevel.push('static ' + trimmed);
          }
          this.topLevel.push('');
        } else {
          // Runtime-init variable → stays inside main()
          this.visitStmtInMain(node);
        }
        break;
      }
      case 'ExtensionFunc': this.visitExtensionFunc(node); break;
      case 'DeclareConst':    this.visitDeclareConst(node); break;
      case 'DeclareFunction': this.visitDeclareFunction(node); break;
      case 'Noop':        break;
      default:
        // Top-level expression (e.g. console.log at top level)
        this.visitStmtInMain(node);
    }
  },

  visitDeclareConst(node) {
    const { name, typeAnn, init } = node;
    const ct = this.resolveType(typeAnn);
    const initC = init ? this.exprToC(init, [], 0) : '0';
    this.topLevel.push(`static const ${ct} ${name} = ${initC};`);
    this.topLevel.push('');
    // Register in scope so later references work
    this.define(name, { ctype: ct, varKind: 'const' });
  },

  visitDeclareFunction(node) {
    const { name, params, returnType } = node;
    const retC = returnType ? this.resolveType(returnType) : 'void';
    const paramParts = (params ?? []).map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });
    const paramStr = paramParts.length > 0 ? paramParts.join(', ') : 'void';
    // Try to include a known library for well-known math functions
    const mathFuncs = new Set(['sin','cos','tan','asin','acos','atan','atan2','sqrt','pow','exp','log','log2','log10','floor','ceil','fabs','fmod','hypot']);
    if (mathFuncs.has(name)) this.includes.add('#include <math.h>');
    this.topLevel.push(`extern ${retC} ${name}(${paramStr});`);
    this.topLevel.push('');
    // Register in scope
    this.define(name, { ctype: retC, varKind: 'const', funcName: name, params: node.params ?? [] });
  },

  // ----------------------------------------------------------------
  // Classes
  // ----------------------------------------------------------------
  visitClassDecl(node) {
    const { name, superClass, members, decorators, typeParams } = node;
    // Generic class: store as template
    if (typeParams?.length > 0) {
      if (!this._genericClasses) this._genericClasses = new Map();
      this._genericClasses.set(name, node);
      return;
    }

    // Reserved prefix check (runs before PascalCase to give precise message)
    for (const pfx of ['ref_']) {
      if (name.startsWith(pfx)) {
        throw this.error(`type name "${name}" uses reserved prefix "${pfx}"`, node);
      }
    }
    // PascalCase invariant check (skip built-in/internal names)
    if (name.length > 0 && name[0] >= 'a' && name[0] <= 'z') {
      throw this.error(`class name "${name}" must start with uppercase (PascalCase)`, node);
    }

    // @readonly on methods is invalid
    for (const m of (node.members ?? [])) {
      if (m.kind === 'Method' && (m.decorators ?? []).some(d => d.name === 'readonly')) {
        throw this.error(`"@readonly" can only be applied to properties`, m);
      }
    }

    // Collect extra fields from class decorators (@sealed → target._field = val)
    const _classDecoratorFields = [];   // extra fields to add to struct
    const _classDecoratorInits  = [];   // statements to run after new ClassName()
    for (const d of (decorators ?? [])) {
      if (['embedded.inline', 'embedded.pool', 'packed', 'align'].includes(d.name)) continue;
      const decFn = this._decoratorFns?.get(d.name);
      if (decFn) {
        const { fields: df, inits: di } = this._analyzeClassDecorator(decFn);
        _classDecoratorFields.push(...df);
        _classDecoratorInits.push(...di);
      }
    }

    // Process @embedded.* decorators
    const inlineDec = decorators?.find(d => d.name === 'embedded.inline');
    const poolDec   = decorators?.find(d => d.name === 'embedded.pool');
    const _embeddedTargets = ['avr', 'arm', 'stm32'];
    const isEmbedded = _embeddedTargets.includes(this._targetName);

    if (inlineDec && !isEmbedded) {
      throw this.error(`Warning: @embedded.inline on '${name}' has no effect on non-embedded platform; annotation ignored`, node);
    }
    if (poolDec && !isEmbedded) {
      throw this.error(`Warning: @embedded.pool on '${name}' has no effect on non-embedded platform; annotation ignored`, node);
    }
    if (poolDec && isEmbedded) {
      const poolSizeArg = poolDec.args?.[0];
      if (!poolSizeArg || poolSizeArg.kind !== 'Literal') {
        throw this.error(`TypeError: @embedded.pool requires a numeric capacity argument; use @embedded.pool(N)`, node);
      }
    }
    if (inlineDec && isEmbedded) {
      const badMethods = members.filter(m => m.kind === 'Method' && m.name !== 'constructor' && m.body?.body?.length > 0);
      if (badMethods.length > 0) {
        throw this.error(`TypeError: @embedded.inline class '${name}' cannot have non-trivial methods; remove '${badMethods[0].name}()' or use a regular class`, node);
      }
    }

    // Process @packed and @align decorators
    const packedDec = decorators?.find(d => d.name === 'packed');
    const alignDec  = decorators?.find(d => d.name === 'align');
    if (packedDec && alignDec) {
      throw this.error('@packed and @align cannot be used together');
    }
    let structAttr = '';
    if (packedDec) {
      structAttr = ' __attribute__((packed))';
    } else if (alignDec) {
      const alignVal = alignDec.args?.[0];
      const alignN = alignVal?.kind === 'Literal' ? Number(alignVal.value) : 0;
      if (!alignN || (alignN & (alignN - 1)) !== 0) {
        throw this.error('@align argument must be a power of two');
      }
      structAttr = ` __attribute__((aligned(${alignN})))`;
    }

    const allFields_ = members.filter(m => m.kind === 'Field');
    const methods = members.filter(m => m.kind === 'Method');
    const throwsInfo = this._throwsClasses?.get(name);
    const isThrowsClass = !!throwsInfo;

    // For throws classes: replace 'message' field with TscError _base
    let fields = allFields_;
    let effectiveSuperClass = superClass;
    if (isThrowsClass) {
      // Always treat as if extending Error (TscError _base)
      effectiveSuperClass = 'Error';
      // Remove 'message' field — it's replaced by _base.message via TscError
      fields = allFields_.filter(f => f.name !== 'message');
    }

    // Register as struct (isStruct:true allows const qualifier in VarDecl)
    const implements_ = node.implements_ ?? [];
    // Detect implements Iterable<T> and extract element type
    const _ifaceName = (iface) => typeof iface === 'string' ? iface : iface.name;
    let _iterableElemType = null;
    for (const iface of implements_) {
      if (_ifaceName(iface) === 'Iterable' && typeof iface === 'object' && iface.typeArgs?.[0]) {
        _iterableElemType = this.resolveType(iface.typeArgs[0]);
        break;
      }
    }
    this.classes.set(name, { fields, methods, superClass: effectiveSuperClass, isStruct: true, implements_,
      ...(isThrowsClass ? { _isThrowsClass: true } : {}),
      ...(_classDecoratorInits.length > 0 ? { _decoratorInits: _classDecoratorInits } : {}),
      ...(_iterableElemType ? { _iterableElemType } : {}) });

    // Map TSClang base class names → C names
    const cBase = effectiveSuperClass === 'Error' ? 'TscError' : effectiveSuperClass;

    // Check if this class is used as Shared<T> or Weak<T>
    const arcInfo = this._arcClasses?.get(name);

    // All-static class with no fields → skip struct unless class name used as a type
    const _allStatic = methods.length > 0 && methods.every(m => m.modifiers.includes('static'));
    const _hasUserFields = fields.length > 0 || cBase;
    const _usedAsType = !_allStatic || _hasUserFields || (() => {
      const scanType = (node) => {
        if (!node || typeof node !== 'object') return false;
        if (Array.isArray(node)) return node.some(scanType);
        if (node.kind === 'TypeRef' && node.name === name) return true;
        return Object.values(node).some(v => v && typeof v === 'object' ? scanType(v) : false);
      };
      return methods.some(m => scanType(m.returnType) || (m.params ?? []).some(p => scanType(p.typeAnn)));
    })();

    if (_usedAsType) {
      // Build field list (single-line struct always)
      const userFieldParts = [];
      if (cBase) userFieldParts.push(`${cBase} _base;`);
      for (const f of fields) {
        // Ref<T>/Mut<T> cannot be stored in class fields
        if (f.typeAnn?.kind === 'TypeRef' && (f.typeAnn.name === 'Ref' || f.typeAnn.name === 'Mut')) {
          throw this.error(`"${f.typeAnn.name}<T>" cannot be stored in a class field`);
        }
        const isReadonly = (f.decorators ?? []).some(d => d.name === 'readonly');
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        const constPfx = isReadonly ? 'const ' : '';
        if (ct.endsWith(' *')) userFieldParts.push(`${constPfx}${ct.slice(0, -2)} *${f.name};`);
        else userFieldParts.push(`${constPfx}${ct} ${f.name};`);
      }
      // Fields from class decorators (e.g., @sealed adds _sealed: bool)
      for (const { fieldDecl } of _classDecoratorFields) userFieldParts.push(fieldDecl);

      if (arcInfo) {
        const arcPre = arcInfo.refFirst ? [
          ...(arcInfo.shared || arcInfo.weak ? ['int32_t _refcount;'] : []),
          ...(arcInfo.weak ? ['int32_t _weakcount;'] : []),
        ] : [];
        const arcPost = arcInfo.refFirst ? [] : [
          ...(arcInfo.shared || arcInfo.weak ? ['int32_t _refcount;'] : []),
          ...(arcInfo.weak ? ['int32_t _weakcount;'] : []),
        ];
        const allArcFields = [...arcPre, ...userFieldParts, ...arcPost];
        const isSelfRef = fields.some(f => {
          const ct = f.typeAnn ? this.resolveType(f.typeAnn) : '';
          return ct.includes(name + ' *') || ct.includes(name + '*');
        });
        if (isSelfRef) {
          this.addTop(`typedef struct ${name} ${name};`);
          this.addTop(`struct ${name} { ${allArcFields.join(' ')} };`);
        } else {
          this.addTop(`typedef struct { ${allArcFields.join(' ')} } ${name};`);
        }
      } else {
        // C does not allow empty structs; use a dummy field when no user fields exist
        const fieldContent = userFieldParts.length > 0 ? userFieldParts.join(' ') : 'int _dummy;';
        this.addTop(`typedef struct${structAttr} { ${fieldContent} } ${name};`);
      }

      // For throws classes: emit _new function directly to typedefs (so it appears between
      // the struct typedef and the Result typedefs emitted in visitFuncDecl).
      if (isThrowsClass && throwsInfo.needsNew) {
        const hasStack = throwsInfo.hasStack;
        let newBody = `${name} s = {0}; s._base.message = msg;`;
        if (hasStack) newBody += ` s.stack = tsc_capture_stack();`;
        newBody += ` return s;`;
        this.typedefs.push(`static ${name} ${name}_new(String msg) { ${newBody} }`);
        this.typedefs.push('');  // blank after _new, before Result typedef
        this._lastAddedToTypedefs = false;  // next addTop('') won't be swallowed
      } else {
        this.addTop('');  // blank after struct (no _new)
      }
    }

    // For throws classes: skip normal constructor handling (we emitted _new above)
    if (isThrowsClass) {
      // Emit non-constructor methods only
      const explicitImplements = node.implements_ ?? [];
      for (const m of methods) {
        if (m.name === 'constructor') continue;
        const isStatic = m.modifiers.includes('static');
        this.emitMethod(name, m, isStatic, explicitImplements);
      }
      for (const ifaceName of explicitImplements) this.emitVtableConstant(name, ifaceName);
      return;
    }

    // Constructor if present
    const ctor = methods.find(m => m.name === 'constructor');
    if (ctor) {
      // Check that all fields are unconditionally assigned in the constructor
      if (fields.length > 0 && ctor.body) {
        const unconditional = new Set();
        const stmts = ctor.body.body ?? ctor.body;
        for (const stmt of stmts) {
          if (stmt.kind === 'ExprStmt' &&
              stmt.expr?.kind === 'Assign' &&
              stmt.expr.left?.kind === 'Member' &&
              stmt.expr.left.object?.kind === 'Ident' &&
              stmt.expr.left.object.name === 'this') {
            unconditional.add(stmt.expr.left.prop);
          }
        }
        for (const f of fields) {
          if (!unconditional.has(f.name)) {
            throw this.error(`field "${f.name}" may not be initialized on all paths in constructor`);
          }
        }
      }
      this.emitMethod(name, { ...ctor, name: 'new', isStatic: true, returnTypeOverride: name }, true);
    }

    // Emit Iterable<T> impl before methods (iter() will be skipped below)
    const _ifaceName2 = (iface) => typeof iface === 'string' ? iface : iface.name;
    const classInfo_ = this.classes.get(name);
    if (classInfo_?._iterableElemType) {
      const iterMethod_ = methods.find(m => m.name === 'iter');
      if (iterMethod_) this._emitIterableImpl(name, iterMethod_, classInfo_._iterableElemType);
    }

    // Methods: emit with explicit-implements style (void *_self) when class has non-Iterable implements
    const explicitImplements = (node.implements_ ?? []).filter(i => _ifaceName2(i) !== 'Iterable');
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      if (m.name === 'iter' && classInfo_?._iterableElemType) continue; // handled by _emitIterableImpl
      const isStatic = m.modifiers.includes('static');
      const mDecs = (m.decorators ?? []).filter(d => this._decoratorFns?.has(d.name));
      if (mDecs.length > 0) {
        this._emitDecoratedMethod(name, m, isStatic, explicitImplements, mDecs);
      } else {
        this.emitMethod(name, m, isStatic, explicitImplements);
      }
    }

    // Emit vtable constants for each explicitly implemented interface
    for (const ifaceName of explicitImplements) {
      this.emitVtableConstant(name, ifaceName);
    }

    // @embedded.pool: generate pool array, mask (alloc/drop emitted lazily)
    if (poolDec && isEmbedded) {
      this._emitPoolClass(name, poolDec);
    }
    // Mark class as inline value type
    if (inlineDec && isEmbedded) {
      const cls = this.classes.get(name);
      if (cls) cls._isInline = true;
    }
  },

  _emitPoolClass(name, poolDec) {
    const poolSize = parseInt(poolDec.args[0].value);
    const poolVar  = `_${name.toLowerCase()}_pool`;
    const maskVar  = `_${name.toLowerCase()}_pool_mask`;
    const optType  = `opt_ref_${name}`;
    const allocFn  = `${name}_alloc`;
    const dropFn   = `${name}_drop`;
    const maskType = poolSize <= 8 ? 'uint8_t' : 'uint16_t';

    // Always emit pool storage
    this.addTop(`static ${name} ${poolVar}[${poolSize}];`);
    this.addTop(`static ${maskType} ${maskVar} = 0;`);
    this.addTop('');

    // Mark in classes map — alloc/drop emitted lazily
    const cls = this.classes.get(name);
    if (cls) {
      cls._isPool = true; cls._poolSize = poolSize; cls._poolOptType = optType;
      cls._poolAllocFn = allocFn; cls._poolDropFn = dropFn; cls._poolMaskVar = maskVar;
      cls._poolVar = poolVar; cls._poolMaskType = maskType;
    }
  },

  _ensurePoolAlloc(className) {
    const cls = this.classes.get(className);
    if (!cls?._isPool || cls._poolAllocEmitted) return;
    cls._poolAllocEmitted = true;
    const { _poolOptType: optType, _poolAllocFn: allocFn, _poolVar: poolVar,
            _poolMaskVar: maskVar, _poolSize: poolSize } = cls;
    this.addTop(`typedef struct { bool has_value; ${className} *value; int _pool_idx; } ${optType};`);
    this.addTop('');
    this.addTop(`static ${optType} ${allocFn}(void) {`);
    this.addTop(`    for (int _i = 0; _i < ${poolSize}; _i++) {`);
    this.addTop(`        if (!(${maskVar} & (1 << _i))) {`);
    this.addTop(`            ${maskVar} |= (1 << _i);`);
    this.addTop(`            return (${optType}){true, &${poolVar}[_i], _i};`);
    this.addTop(`        }`);
    this.addTop(`    }`);
    this.addTop(`    return (${optType}){false, NULL, -1};`);
    this.addTop(`}`);
    this.addTop('');
  },

  _ensurePoolDrop(className) {
    const cls = this.classes.get(className);
    if (!cls?._isPool || cls._poolDropEmitted) return;
    this._ensurePoolAlloc(className); // drop requires alloc
    cls._poolDropEmitted = true;
    const { _poolOptType: optType, _poolDropFn: dropFn, _poolMaskVar: maskVar } = cls;
    const param = className[0].toLowerCase();
    this.addTop(`static void ${dropFn}(${optType} ${param}) {`);
    this.addTop(`    if (${param}.has_value) ${maskVar} &= ~(1 << ${param}._pool_idx);`);
    this.addTop(`}`);
    this.addTop('');
  },

  emitVtableConstant(className, ifaceName, classNode = null) {
    const ifaceDef = this.interfaces.get(ifaceName);
    if (!ifaceDef) return;
    const ifaceMethods = ifaceDef.filter(m => m.kind === 'MethodSig');
    // Verify all interface methods are implemented
    const classDef = this.classes.get(className);
    for (const im of ifaceMethods) {
      const methodExists = classDef?.methods?.some(mm => mm.name === im.name);
      if (!methodExists) {
        throw this.error(`class "${className}" does not implement method "${im.name}" from interface "${ifaceName}"`);
      }
    }
    const vtableName = `${className}_${ifaceName}_vtable`;
    const entries = ifaceMethods.map(m => {
      return `    .${m.name} = ${className}_${m.name}`;
    }).join(',\n');
    this.addTop(`static const ${ifaceName}_vtable ${vtableName} = { ${ifaceMethods.map(m => `.${m.name} = ${className}_${m.name}`).join(', ')} };`);
    this.addTop('');
  },

  // ----------------------------------------------------------------
  // Decorator helpers
  // ----------------------------------------------------------------

  // Analyze a class decorator body and extract field mutations (target._field = value)
  _analyzeClassDecorator(decFn) {
    const fields = [], inits = [];
    for (const stmt of (decFn.body?.body ?? [])) {
      if (stmt.kind !== 'ExprStmt') continue;
      const expr = stmt.expr;
      // target._field = value
      if (expr?.kind === 'Assign' && expr.left?.kind === 'Member') {
        const fieldName = expr.left.prop;
        const valNode = expr.right;
        // Resolve value: literal true/false/number/string
        let cVal = null, cType = null;
        if (valNode?.kind === 'Literal') {
          if (valNode.litType === 'bool') { cVal = valNode.value; cType = 'bool'; }
          else if (valNode.litType === 'number') { cVal = valNode.value; cType = 'int32_t'; }
        }
        if (cVal !== null) {
          fields.push({ fieldDecl: `${cType} ${fieldName};`, fieldName, cType });
          inits.push({ fieldName, cVal });
        }
      }
    }
    return { fields, inits };
  },

  // Deep-substitute orig.apply(...) calls with a replacement expression
  _deepSubstOrigApply(node, replacement, isVoid = false) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => this._deepSubstOrigApply(n, replacement, isVoid));
    if (node.kind === 'Return' && node.value?.kind === 'Call' && node.value.callee?.prop === 'apply') {
      // return orig.apply(...) → for void: just call; for non-void: return result
      return isVoid ? { kind: 'ExprStmt', expr: replacement } : { kind: 'Return', value: replacement };
    }
    if (node.kind === 'ExprStmt' && node.expr?.kind === 'Call' && node.expr.callee?.prop === 'apply') {
      return { kind: 'ExprStmt', expr: replacement };
    }
    const result = {};
    for (const [k, v] of Object.entries(node)) {
      result[k] = (typeof v === 'object' && v !== null) ? this._deepSubstOrigApply(v, replacement, isVoid) : v;
    }
    return result;
  },

  // Recursively substitute Ident nodes in an AST
  _substituteInAst(node, bindings) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => this._substituteInAst(n, bindings));
    if (node.kind === 'Ident' && bindings.has(node.name)) return bindings.get(node.name);
    if (node.kind === 'Binary' && node.op === '+') {
      const left  = this._substituteInAst(node.left,  bindings);
      const right = this._substituteInAst(node.right, bindings);
      const isStr = t => t.kind === 'Literal' && (t.litType === 'string' || t.litType === 'char');
      if (isStr(left) && isStr(right)) {
        return { kind: 'Literal', litType: 'string', value: left.value + right.value };
      }
      return { ...node, left, right };
    }
    const result = {};
    for (const [k, v] of Object.entries(node)) {
      result[k] = (typeof v === 'object' && v !== null) ? this._substituteInAst(v, bindings) : v;
    }
    return result;
  },

  // Check if a statement is `return orig.apply(this, ...)` or `orig.apply(this, ...)`
  // Check if orig.apply appears anywhere inside a stmt (for nested patterns like else branches)
  _hasOrigApplyDeep(node) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(n => this._hasOrigApplyDeep(n));
    if (node.kind === 'Call' && node.callee?.kind === 'Member' && node.callee?.prop === 'apply') return true;
    return Object.values(node).some(v => v && typeof v === 'object' ? this._hasOrigApplyDeep(v) : false);
  },

  _isOrigApply(stmt) {
    const expr = stmt.kind === 'Return' ? stmt.value
      : stmt.kind === 'ExprStmt' ? stmt.expr
      : stmt.kind === 'VarDecl' ? stmt.init
      : null;
    if (!expr) return false;
    if (expr.kind !== 'Call') return false;
    const callee = expr.callee;
    return callee?.kind === 'Member' && callee.prop === 'apply';
  },

  // Analyze a decorator function and extract wrapper info
  // Returns: { style, befores, afters } | { style, beforeStmts, afterStmts, applyIsReturn, paramBindings }
  _analyzeDecorator(decFn, factoryArgs = null) {
    // TSClang `decorator function` style
    if (decFn.isDecorator) {
      const befores = [], afters = [];
      for (const stmt of (decFn.body?.body ?? [])) {
        if (stmt.kind !== 'ExprStmt') continue;
        const c = stmt.expr;
        if (c?.kind !== 'Call') continue;
        const callee = c.callee;
        if (callee?.kind !== 'Member') continue;
        if (callee.prop === 'before' && c.args?.[0]) befores.push(c.args[0].expr ?? c.args[0]);
        if (callee.prop === 'after'  && c.args?.[0]) afters.push(c.args[0].expr ?? c.args[0]);
      }
      return { style: 'desc', befores, afters };
    }

    // Find the actual inner decorator body (handle factory pattern)
    let innerBody = decFn.body?.body ?? [];
    let capturedBindings = new Map();
    if (factoryArgs !== null) {
      // Factory: look for `return function(target, method, desc) { ... }`
      for (const stmt of innerBody) {
        if (stmt.kind === 'Return' && stmt.value?.kind === 'FuncExpr') {
          innerBody = stmt.value.body?.body ?? [];
          // Bind factory param names to their argument values
          for (let i = 0; i < (decFn.params ?? []).length; i++) {
            const pName = decFn.params[i].name;
            if (factoryArgs[i]) capturedBindings.set(pName, factoryArgs[i]);
          }
          break;
        }
      }
    }

    // Find `desc.value = function(...) { BODY }` or `desc.value = function(x: T) { BODY }`
    let wrapperBody = null;
    let lambdaParams = [];
    for (const stmt of innerBody) {
      if (stmt.kind !== 'ExprStmt') continue;
      const expr = stmt.expr;
      if (expr?.kind !== 'Assign') continue;
      if (expr.left?.kind !== 'Member' || expr.left.prop !== 'value') continue;
      const rhs = expr.right;
      if (rhs?.kind === 'FuncExpr' || rhs?.kind === 'Arrow') {
        wrapperBody = (rhs.body?.body ?? rhs.body?.body) ?? (rhs.body?.kind === 'Block' ? rhs.body.body : [rhs.body]);
        lambdaParams = (rhs.params ?? []).filter(p => p.name && p.name !== 'this');
        break;
      }
    }

    if (!wrapperBody) return { style: 'passthrough' };

    // Split at orig.apply(...)
    const beforeStmts = [], afterStmts = [];
    let foundApply = false, applyIsReturn = false, applyResultVar = null, applyArgs = null;
    let allApplyDeep = false;  // true when orig.apply only appears inside nested stmts
    for (const stmt of wrapperBody) {
      if (this._isOrigApply(stmt)) {
        foundApply = true;
        applyIsReturn = stmt.kind === 'Return';
        if (stmt.kind === 'VarDecl') applyResultVar = stmt.name;
        // Extract explicit args from orig.apply(this, [arg1, arg2, ...])
        const applyExpr = stmt.kind === 'Return' ? stmt.value : stmt.kind === 'ExprStmt' ? stmt.expr : stmt.init;
        const argsArg = applyExpr?.args?.[1]?.expr;
        if (argsArg?.kind === 'ArrayLit') applyArgs = argsArg.elems;
      } else if (!foundApply && this._hasOrigApplyDeep(stmt)) {
        // orig.apply is nested inside this stmt (e.g., in else branch) → deep substitute
        beforeStmts.push({ _deepSubstApply: true, stmt });
        allApplyDeep = true;
      } else {
        (foundApply ? afterStmts : beforeStmts).push(stmt);
      }
    }
    // If all applies are deep (no top-level apply found), mark accordingly
    if (allApplyDeep && !foundApply) allApplyDeep = true; else allApplyDeep = false;
    return { style: 'prop-desc', beforeStmts, afterStmts, applyIsReturn, applyResultVar, applyArgs, allApplyDeep, capturedBindings, lambdaParams };
  },

  // Build a synthetic body statement from an Arrow/FuncExpr lambda (for desc.before/after)
  _extractLambdaBody(lambdaNode) {
    if (!lambdaNode) return [];
    const body = lambdaNode.body;
    if (!body) return [];
    if (body.kind === 'Block') return body.body ?? [];
    return [{ kind: 'ExprStmt', expr: body }];
  },

  // Build the C call to the inner function
  _buildInnerCall(className, methodName, m, isStatic) {
    const innerFnName = `${className}_${methodName}_inner`;
    const paramNames = (m.params ?? []).map(p => p.name).filter(Boolean);
    if (isStatic) {
      return `${innerFnName}(${paramNames.join(', ')})`;
    }
    return `${innerFnName}(self${paramNames.length ? ', ' + paramNames.join(', ') : ''})`;
  },

  // Emit a decorated method: generates _inner + chain of wrappers
  _emitDecoratedMethod(className, m, isStatic, explicitImplements, decs) {
    // Check if a MethodDesc decorator is applied to a standalone function (error case handled in standalone)
    // decs: [D_1 (outermost/leftmost), ..., D_n (innermost/rightmost)]

    // Emit the original body as _inner
    this.emitMethod(className, { ...m, name: m.name + '_inner', decorators: [] }, isStatic, explicitImplements);

    let prevMethodName = m.name + '_inner';

    // Apply decorators from innermost (rightmost) to outermost (leftmost)
    for (let i = decs.length - 1; i >= 0; i--) {
      const d = decs[i];
      const isOuter = i === 0;
      const wrapperMethodName = isOuter ? m.name : m.name + '_' + d.name;

      // Resolve factory args from decorator call args
      const decFn = this._decoratorFns.get(d.name);
      const factoryArgs = d.args ? d.args.map(a => a) : null;
      const analysis = this._analyzeDecorator(decFn, factoryArgs);

      this._emitDecoratorWrapperFn(className, m, isStatic, wrapperMethodName, prevMethodName, analysis, d, i, decs.length);
      prevMethodName = wrapperMethodName;
    }
    // Register the public method name in class metadata so call sites resolve correctly
    const cls = this.classes.get(className);
    if (cls) {
      if (!cls._methodNames) cls._methodNames = new Map();
      const nameMangled = `${className}_${m.name}`;
      cls._methodNames.set(m.name, { isStatic, nameMangled, isMut: false, isExplicitMut: false, isMoveMethod: false, isIfaceMethod: false });
    }
  },

  // Emit a single wrapper function
  _emitDecoratorWrapperFn(className, m, isStatic, wrapperName, innerName, analysis, d, decIdx, totalDecs) {
    const retType = m.returnType ? this.resolveType(m.returnType) : 'void';
    const isVoid = retType === 'void';
    const innerFnName = `${className}_${innerName}`;

    // For prop-desc style, use the lambda's params (may differ in name from m.params).
    // Exception: rest params (...args: any[]) mean the lambda captures all args generically —
    // fall back to original method params in that case.
    const _hasRestLambdaParam = analysis.lambdaParams?.some(p => p.rest);
    const wrapperParamList = (analysis.style === 'prop-desc' && analysis.lambdaParams?.length > 0 && !_hasRestLambdaParam)
      ? analysis.lambdaParams
      : (m.params ?? []);
    const paramNames = wrapperParamList.map(p => p.name).filter(Boolean);
    const paramCTypes = wrapperParamList.map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return `${ct} ${p.name}`;
    });

    let selfParam, innerCall;
    if (isStatic) {
      selfParam = '';
      innerCall = `${innerFnName}(${paramNames.join(', ')})`;
    } else {
      selfParam = `const ${className} *self`;
      innerCall = `${innerFnName}(self${paramNames.length ? ', ' + paramNames.join(', ') : ''})`;
    }

    const allParams = [selfParam, ...paramCTypes].filter(Boolean).join(', ');
    const wrapperFnName = `${className}_${wrapperName}`;

    const lines = [];
    const I = '    ';

    if (analysis.style === 'desc') {
      // TSClang decorator function style: desc.before/after
      const beforeBody = analysis.befores.flatMap(l => this._extractLambdaBody(l));
      const afterBody  = analysis.afters.flatMap(l => this._extractLambdaBody(l));

      // Emit before stmts
      const beforeLines = [], afterLines = [];
      this.pushScope();
      this.visitBlock({ body: beforeBody }, beforeLines, 1);
      this.popScope();
      this.pushScope();
      this.visitBlock({ body: afterBody }, afterLines, 1);
      this.popScope();

      lines.push(`static ${retType} ${wrapperFnName}(${allParams}) {`);
      for (const l of beforeLines) lines.push(l);
      lines.push(`${I}${isVoid ? '' : (retType + ' _r = ')}${innerCall};`);
      for (const l of afterLines) lines.push(l);
      if (!isVoid) lines.push(`${I}return _r;`);
      lines.push('}');
    } else if (analysis.style === 'prop-desc') {
      // TypeScript PropertyDescriptor style
      // Build bindings: `method` param → actual method name, factory captures → literal values
      const bindings = new Map();
      // Find `method` parameter (2nd param of decorator = method name)
      const decFn = this._decoratorFns.get(d.name);
      const methodParamName = decFn?.params?.[1]?.name;
      if (methodParamName) {
        bindings.set(methodParamName, { kind: 'Literal', litType: 'string', value: m.name });
      }
      for (const [k, v] of analysis.capturedBindings) bindings.set(k, v);

      // Transform before/after stmts with substitution
      // When applyResultVar is set (const r = orig.apply(...)), bind r → _r in after stmts
      if (analysis.applyResultVar && !isVoid) {
        bindings.set(analysis.applyResultVar, { kind: 'Ident', name: '_r' });
      }
      // Build the actual inner call, using explicit args from orig.apply if provided
      if (analysis.applyArgs && analysis.applyArgs.length > 0) {
        const tmpLines2 = [];
        this.pushScope();
        if (!isStatic) this.define('self', { ctype: `${className} *`, varKind: 'const' });
        // Use lambda params in scope so type inference works for substituted args
        for (const p of wrapperParamList) {
          if (p.name) this.define(p.name, { ctype: p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t', varKind: 'let' });
        }
        const argsC = analysis.applyArgs.map(a => {
          const subA = this._substituteInAst(a.expr ?? a, bindings);
          return this.exprToC(subA, tmpLines2, 1);
        });
        this.popScope();
        const selfPart = isStatic ? '' : 'self';
        const parts = [selfPart, ...argsC].filter(Boolean);
        innerCall = `${innerFnName}(${parts.join(', ')})`;
      }

      // Build the replacement AST node for deep-substitution (orig.apply in nested branches)
      const innerCallExpr = { kind: 'RawC', code: innerCall };

      const subBefore = analysis.beforeStmts.map(s => {
        if (s._deepSubstApply) {
          // Nested orig.apply: deep-replace it with the inner call
          const subStmt = this._substituteInAst(s.stmt, bindings);
          return this._deepSubstOrigApply(subStmt, innerCallExpr, isVoid);
        }
        return this._substituteInAst(s, bindings);
      });
      // Filter afterStmts: if void and applyResultVar, drop `return <resultVar>` stmts
      let afterFiltered = analysis.afterStmts;
      if (isVoid && analysis.applyResultVar) {
        afterFiltered = analysis.afterStmts.filter(s =>
          !(s.kind === 'Return' && s.value?.kind === 'Ident' && s.value.name === analysis.applyResultVar)
        );
      }
      const subAfter = afterFiltered.map(s => this._substituteInAst(s, bindings));

      const beforeLines = [], afterLines = [];
      this.pushScope();
      if (!isStatic) this.define('self', { ctype: `${className} *`, varKind: 'const' });
      if (analysis.applyResultVar && !isVoid) this.define(analysis.applyResultVar, { ctype: retType });
      for (const p of wrapperParamList) {
        if (p.name) this.define(p.name, { ctype: p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t', varKind: 'let' });
      }
      this.visitBlock({ body: subBefore }, beforeLines, 1);
      this.visitBlock({ body: subAfter }, afterLines, 1);
      this.popScope();

      lines.push(`static ${retType} ${wrapperFnName}(${allParams}) {`);
      for (const l of beforeLines) lines.push(l);
      if (!analysis.allApplyDeep) {
        if (analysis.applyIsReturn && !isVoid) {
          lines.push(`${I}return ${innerCall};`);
        } else if (analysis.applyResultVar && !isVoid) {
          // const r = orig.apply(...) → retType _r = innerCall;
          lines.push(`${I}${retType} _r = ${innerCall};`);
        } else {
          lines.push(`${I}${isVoid ? '' : (retType + ' _r = ')}${innerCall};`);
          if (!isVoid) lines.push(`${I}return _r;`);
        }
      }
      for (const l of afterLines) lines.push(l);
      lines.push('}');
    } else {
      // passthrough: just delegate to inner
      lines.push(`static ${retType} ${wrapperFnName}(${allParams}) {`);
      if (!isStatic) lines.push(`${I}(void)self;`);
      lines.push(`${I}${isVoid ? '' : 'return '}${innerCall};`);
      lines.push('}');
    }

    for (const l of lines) this.addTop(l);
    this.addTop('');
  },

  // Emit a decorated standalone function
  _emitDecoratedStandaloneFunc(node, decs) {
    const { name, params, returnType, body } = node;
    const retType = returnType ? this.resolveType(returnType) : 'void';

    // Check if all decorators are MethodDesc-only (cannot apply to standalone functions)
    for (const d of decs) {
      const decFn = this._decoratorFns.get(d.name);
      if (!decFn) continue;
      if (decFn.isDecorator) {
        // Check param type: MethodDesc → error
        const descParam = decFn.params?.[0];
        const descTypeName = descParam?.typeAnn?.name;
        if (descTypeName === 'MethodDesc') {
          throw this.error(`"${d.name}" is a method decorator and cannot be applied to a standalone function`, node);
        }
      }
    }

    // Mangle the function suffix from param types
    const paramSuffix = params.map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return ct === 'String' ? 'string' : ct.replace(/[^a-zA-Z0-9]/g, '_');
    }).join('_');
    const mangledName = paramSuffix ? `${name}_${paramSuffix}` : name;
    const innerMangledName = paramSuffix ? `${name}_inner_${paramSuffix}` : `${name}_inner`;

    // Emit original as _inner (use _monoName to prevent double-mangling)
    const innerNode = { ...node, name: innerMangledName, _monoName: innerMangledName, decorators: [] };
    this.visitFuncDecl(innerNode, true, false);

    // Emit each wrapper layer
    let prevName = innerMangledName;
    for (let i = decs.length - 1; i >= 0; i--) {
      const d = decs[i];
      const isOuter = i === 0;
      const wrapperFnName = isOuter ? mangledName : `${name}_${d.name}_${paramSuffix}`;
      const decFn = this._decoratorFns.get(d.name);
      const factoryArgs = d.args ? d.args.map(a => a) : null;
      const analysis = this._analyzeDecorator(decFn, factoryArgs);

      const isVoid = retType === 'void';
      const paramCDecls = params.map(p => {
        const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
        return `${ct} ${p.name}`;
      });
      const paramNms = params.map(p => p.name);
      const innerCall = `${prevName}(${paramNms.join(', ')})`;

      const lines = [];
      const I = '    ';
      if (analysis.style === 'desc') {
        const beforeBody = analysis.befores.flatMap(l => this._extractLambdaBody(l));
        const afterBody  = analysis.afters.flatMap(l => this._extractLambdaBody(l));
        const beforeLines = [], afterLines = [];
        this.pushScope();
        this.visitBlock({ body: beforeBody }, beforeLines, 1);
        this.popScope();
        this.pushScope();
        this.visitBlock({ body: afterBody }, afterLines, 1);
        this.popScope();
        lines.push(`static ${retType} ${wrapperFnName}(${paramCDecls.join(', ')}) {`);
        for (const l of beforeLines) lines.push(l);
        lines.push(`${I}${isVoid ? '' : (retType + ' _r = ')}${innerCall};`);
        for (const l of afterLines) lines.push(l);
        if (!isVoid) lines.push(`${I}return _r;`);
        lines.push('}');
      } else {
        lines.push(`static ${retType} ${wrapperFnName}(${paramCDecls.join(', ')}) {`);
        lines.push(`${I}${isVoid ? '' : 'return '}${innerCall};`);
        lines.push('}');
      }
      for (const l of lines) this.addTop(l);
      this.addTop('');
      prevName = wrapperFnName;
    }
    // Register the outer (public) name in scope so call sites can resolve it
    this.define(name, { ctype: retType, funcName: mangledName, params });
  },

  emitMethod(className, m, isStatic, explicitImplements = []) {
    if (!m.body) return; // abstract / overload

    // Error: static methods cannot be mut
    if (isStatic && m.modifiers?.includes('mut')) {
      throw this.error(`"static" methods cannot be "mut"`);
    }

    // Methods are NOT mangled by param types (class prefix already disambiguates)
    const retType = m.returnTypeOverride ?? (m.returnType ? this.resolveType(m.returnType) : 'void');
    const nameMangled = `${className}_${m.name}`;

    const isMut = m.modifiers?.includes('mut');
    // Move-method: returns the class itself by value → self passed by value
    const isMoveMethod = !isStatic && m.name !== 'new' && retType === className;

    // Interface-implements style: method takes (void *_self) for explicit implements
    const isIfaceMethod = !isStatic && m.name !== 'new' && explicitImplements.length > 0;

    // Emit body first so we can inspect it for self-mutation
    const lines = this.emitFuncBody(m.name, m.body, m.params, retType, className, isMoveMethod, isMut);

    // Determine whether method mutates self
    const mutatesself = isMut || lines.some(l =>
      /self->[\w]+ *[+\-*\/|&^%]?=(?!=)/.test(l) ||
      /self->[\w]+\+\+/.test(l) ||
      /self->[\w]+--/.test(l)
    );

    const params = [];
    if (!isStatic && m.name !== 'new') {
      if (isMoveMethod) {
        params.push(`${className} self`);
      } else if (isIfaceMethod) {
        // Interface-style: void *_self
        params.push(`void *_self`);
      } else if (mutatesself) {
        params.push(`${className} *self`);
      } else {
        params.push(`const ${className} *self`);
      }
    }
    for (const p of m.params) {
      if (p.name === 'this') continue;
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      params.push(`${ct} ${p.name}`);
    }

    // For iface-style methods: always prepend self cast (vtable requires void *_self signature)
    let finalLines = lines;
    if (isIfaceMethod) {
      finalLines = [`${className} *self = (${className} *)_self;`, `(void)self;`, ...lines];
    }

    // Register method in class so call sites can resolve it
    const cls = this.classes.get(className);
    if (cls) {
      if (!cls._methodNames) cls._methodNames = new Map();
      cls._methodNames.set(m.name, { isStatic, nameMangled, isMut: mutatesself, isExplicitMut: isMut, isMoveMethod, isIfaceMethod });
    }
    this.addTop(`static ${retType} ${nameMangled}(${params.join(', ') || 'void'}) {`);
    for (const l of finalLines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');
  },

  // ----------------------------------------------------------------
  // Interfaces
  // ----------------------------------------------------------------
  visitInterface(node) {
    const { name, members } = node;
    this.interfaces.set(name, members);

    const props = members.filter(m => m.kind === 'PropSig');
    const methods = members.filter(m => m.kind === 'MethodSig');

    // Pure struct interface (no methods) → emit typedef struct
    if (methods.length === 0 && props.length > 0) {
      const fieldParts = [];
      for (const f of props) {
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        if (f.optional) {
          // Optional field: bool has_X; T X; (no opt_T wrapper needed)
          fieldParts.push(`bool has_${f.name}; ${ct} ${f.name};`);
        } else {
          fieldParts.push(`${ct} ${f.name};`);
        }
      }
      this.addTop(`typedef struct { ${fieldParts.join(' ')} } ${name};`);
      // No blank line — consecutive typedefs can follow immediately
      this.classes.set(name, { isStruct: true, fields: props });
      return;
    }

    if (methods.length === 0) return;

    // vtable typedef (single-line)
    const vtableFields = methods.map(m => {
      const ret = m.returnType ? this.resolveType(m.returnType) : 'void';
      const params = m.params.map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
      return `${ret} (*${m.name})(void *self${params ? ', ' + params : ''});`;
    });
    this.addTop(`typedef struct { ${vtableFields.join(' ')} } ${name}_vtable;`);
    this.addTop(`typedef struct { void *self; const ${name}_vtable *vtable; } ${name};`);
    // Push blank directly so it appears between interface typedefs and following class typedefs
    this.typedefs.push('');
    this._lastAddedToTypedefs = true;
  },

  // ----------------------------------------------------------------
  // Enums
  // ----------------------------------------------------------------
  visitTypeAlias(node) {
    const { name, typeAnn } = node;
    // String literal union: type Dir = "north" | "south"
    // → typedef enum + static const char* values[]
    if (this.isStringLiteralUnion(typeAnn)) {
      const members = this.getStringLiteralMembers(typeAnn);
      const enumVals = members.map(v => `${name}_${v}`).join(', ');
      this.addTop(`typedef enum { ${enumVals} } ${name};`);
      const strVals = members.map(v => `"${v}"`).join(', ');
      this.addTop(`static const char *${name}_values[] = { ${strVals} };`);
      this.addTop('');
      this.classes.set(name, { isEnum: true, isStringLiteralUnion: true, members });
    } else if (typeAnn?.kind === 'TypeObject') {
      // Struct alias: type Point = { x: f64; y: f64 } → typedef struct { double x; double y; } Point;
      const hasMethod = typeAnn.fields.some(f => f.isMethod);
      if (hasMethod) throw this.error(`"type" alias cannot contain methods; use "interface" instead`);
      const fields = typeAnn.fields.map(f => {
        const ct = this.resolveType(f.typeAnn);
        return `${ct} ${f.name};`;
      }).join(' ');
      this.addTop(`typedef struct { ${fields} } ${name};`);
      this.classes.set(name, { isStruct: true, fields: typeAnn.fields });
    } else if (typeAnn?.kind === 'TypeTuple') {
      // Tuple alias: type Point = [x: f64, y: f64] → typedef struct { double _0; double _1; } Point;
      this.resolveTupleType(typeAnn, name);
    } else if (typeAnn?.kind === 'TypeRef' && typeAnn.typeArgs.length > 0) {
      // Utility types
      const utName = typeAnn.name;
      const utArgs = typeAnn.typeArgs;
      if (utName === 'Pick' && utArgs.length >= 2) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const pickedNames = this.getStringLiteralMembers(utArgs[1]);
          for (const pn of pickedNames) {
            if (!fields.some(f => f.name === pn))
              throw this.error(`field "${pn}" does not exist in ${baseTypeName}`);
          }
          // Multi-pick: "name" | "age" → both picked
          const picked = fields.filter(f => pickedNames.length > 0 ? pickedNames.includes(f.name) : true);
          const fieldDecls = picked.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields: picked });
        }
      } else if (utName === 'Omit' && utArgs.length >= 2) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const omitNames = this.getStringLiteralMembers(utArgs[1]);
          for (const on of omitNames) {
            if (!fields.some(f => f.name === on))
              throw this.error(`field "${on}" does not exist in ${baseTypeName}`);
          }
          const kept = fields.filter(f => !omitNames.includes(f.name));
          const fieldDecls = kept.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields: kept });
        }
      } else if (utName === 'Partial' && utArgs.length >= 1) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.flatMap(f => {
            const ct = this.resolveType(f.typeAnn);
            return [`bool has_${f.name};`, `${ct} ${f.name};`];
          }).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, isMutable: true, isPartial: true, fields });
        }
      } else if (utName === 'Required' && utArgs.length >= 1) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, isMutable: true, fields });
        }
      } else if (utName === 'Readonly' && utArgs.length >= 1) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.map(f => `const ${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields });
        }
      } else if (utName === 'NonNullable' && utArgs.length >= 1) {
        // NonNullable<T | null> → T (transparent alias, strips opt_)
        let inner = utArgs[0];
        if (inner.kind === 'TypeUnion') {
          const nonNull = inner.types.filter(t => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined')));
          if (nonNull.length === 1) inner = nonNull[0];
        }
        // Resolve without triggering lazy opt typedef emission
        this._noOptEmit = true;
        let innerCtype = this.resolveType(inner);
        this._noOptEmit = false;
        // If resolving through a MaybeX alias that maps to opt_T, get the inner T
        if (innerCtype.startsWith('opt_') && this._pendingOptTypedefs?.has(innerCtype)) {
          innerCtype = this._pendingOptTypedefs.get(innerCtype);
        } else if (innerCtype.startsWith('opt_')) {
          // Strip opt_ (best effort: opt_string → String via re-resolve... just use pending map)
          innerCtype = innerCtype.slice(4);
        }
        if (!this._typeAliases) this._typeAliases = new Map();
        this._typeAliases.set(name, innerCtype); // transparent alias, no typedef
      } else if (utName === 'Record' && utArgs.length >= 2) {
        const keyTypeNode = utArgs[0];
        const valTypeNode = utArgs[1];
        const valCtype = this.resolveType(valTypeNode);
        if (!this._typeAliases) this._typeAliases = new Map();
        if (this.isStringLiteralUnion(keyTypeNode)) {
          // Record<"x"|"y", f64> → struct { double x; double y; }
          const keys = this.getStringLiteralMembers(keyTypeNode);
          const fieldDecls = keys.map(k => `${valCtype} ${k};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields: keys.map(k => ({ name: k, typeAnn: valTypeNode })) });
        } else {
          const keyCtype = this.resolveType(keyTypeNode);
          const keyEnumDef = this.classes.get(keyCtype);
          if (keyEnumDef?.isEnum && !keyEnumDef?.isStringLiteralUnion) {
            // Record<EnumType, V> → struct with enum member names as fields
            const rawMembers = keyEnumDef.members ?? [];
            const memberNames = rawMembers.map(m => typeof m === 'string' ? m : m.name);
            const fieldDecls = memberNames.map(m => `${valCtype} ${m};`).join(' ');
            this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
            this.classes.set(name, { isStruct: true, fields: memberNames.map(m => ({ name: m, typeAnn: valTypeNode })) });
          } else if (keyCtype === 'String' || keyCtype === 'string' || keyTypeNode.name === 'string') {
            // Record<string, V> → TscMap alias
            const k = this.cTypeToIdent(keyCtype);
            const v = this.cTypeToIdent(valCtype);
            this._typeAliases.set(name, `TscMap_${k}_${v}`);
          } else {
            throw this.error(`Record key must be a string literal union or string enum, not ${keyTypeNode.name ?? keyCtype}`);
          }
        }
      } else if (utName === 'Exclude' || utName === 'Extract') {
        throw this.error(`conditional types are not supported`);
      } else if (utName === 'ReturnType' && utArgs.length >= 1) {
        // ReturnType<typeof fn> → fn's return type
        const arg = utArgs[0];
        if (!this._typeAliases) this._typeAliases = new Map();
        if (arg.kind === 'TypeTypeof') {
          const sym = this.lookup(arg.name);
          if (sym?.returnType) {
            this._typeAliases.set(name, this.resolveType(sym.returnType));
          } else if (sym?.ctype) {
            this._typeAliases.set(name, sym.ctype);
          } else {
            this._typeAliases.set(name, 'void');
          }
        } else {
          throw this.error(`ReturnType argument must be a function type`);
        }
      } else if (utName === 'Parameters' && utArgs.length >= 1) {
        // Parameters<typeof fn> → tuple type of fn's params
        const arg = utArgs[0];
        if (arg.kind === 'TypeTypeof') {
          const sym = this.lookup(arg.name);
          if (sym?.params) {
            const params = sym.params.filter(p => !p.rest);
            const tupleNode = {
              kind: 'TypeTuple',
              elements: params.map(p => ({ typeAnn: p.typeAnn ?? { kind: 'TypeRef', name: 'i32', typeArgs: [] }, label: p.name, rest: false, optional: false })),
              readonly: false
            };
            const tupleName = this.resolveTupleType(tupleNode);
            if (!this._typeAliases) this._typeAliases = new Map();
            this._typeAliases.set(name, tupleName);
          }
        }
      } else if (utName === 'Awaited' && utArgs.length >= 1) {
        // Awaited<Promise<T>> → T
        if (!this._typeAliases) this._typeAliases = new Map();
        let inner = utArgs[0];
        // Unwrap all Promise<> wrappers
        while (inner.kind === 'TypeRef' && inner.name === 'Promise' && inner.typeArgs.length > 0) {
          inner = inner.typeArgs[0];
        }
        this._typeAliases.set(name, this.resolveType(inner));
      }
    } else if (typeAnn?.kind === 'TypeKeyOf') {
      // keyof T → string-literal-union enum of field names
      const targetTypeName = typeAnn.target?.name;
      const fields = targetTypeName ? this.getStructFields(targetTypeName) : null;
      if (fields && fields.length > 0) {
        const fieldNames = fields.map(f => f.name);
        const enumVals = fieldNames.map(v => `${name}_${v}`).join(', ');
        this.addTop(`typedef enum { ${enumVals} } ${name};`);
        const strVals = fieldNames.map(v => `"${v}"`).join(', ');
        this.addTop(`static const char *${name}_values[] = { ${strVals} };`);
        this.addTop('');
        this.classes.set(name, { isEnum: true, isStringLiteralUnion: true, isKeyOf: true, members: fieldNames });
      }
    } else if (typeAnn?.kind === 'TypeRef' && typeAnn.typeArgs.length === 0) {
      // Scalar alias: type UserId = i32 → typedef int32_t UserId;
      // Skip generic type aliases (Pick<User, Fields>, etc.) — no C output
      const inner = this.resolveType(typeAnn);
      if (inner !== name) {
        this.addTop(`typedef ${inner} ${name};`);
        this.classes.set(name, { isScalarAlias: true, innerType: inner });
      }
    } else if (typeAnn?.kind === 'TypeUnion') {
      // Mixed union (non-string) → error if any member is a string literal
      const allMembers = this.flattenUnion(typeAnn);
      const hasString = allMembers.some(t => t.kind === 'TypeLiteral' && t.litKind === 'string');
      const hasNonString = allMembers.some(t => !(t.kind === 'TypeLiteral' && t.litKind === 'string'));
      if (hasString && hasNonString) {
        throw this.error(`string literal union cannot be mixed with non-string types`);
      }
      if (!this._typeAliases) this._typeAliases = new Map();
      // For nullable unions (T | null), compute opt name without emitting typedef yet
      const nonNullLeaves = allMembers.filter(t => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined'))
                                                  && !(t.kind === 'TypeLiteral' && t.value === 'null'));
      if (allMembers.length !== nonNullLeaves.length && nonNullLeaves.length === 1) {
        const inner = this.resolveType(nonNullLeaves[0]);
        const optName = `opt_${this.cTypeToIdent(inner)}`;
        this._typeAliases.set(name, optName);
        // Store for deferred typedef emission (emitted on first actual use)
        if (!this._pendingOptTypedefs) this._pendingOptTypedefs = new Map();
        this._pendingOptTypedefs.set(optName, inner);
      } else {
        this._typeAliases.set(name, this.resolveType(typeAnn));
      }
    }
    // Other type aliases: no C output (structural types, generic aliases, etc.)
  },

  // Get struct-like field definitions for a named type (interface or struct alias)
  getStructFields(typeName) {
    const cls = this.classes.get(typeName);
    if (cls?.isStruct && cls.fields) return cls.fields;
    const iface = this.interfaces.get(typeName);
    if (iface) return iface.filter(m => m.kind === 'PropSig');
    return null;
  },

  // Flatten nested TypeUnion into array of leaf types
  flattenUnion(typeAnn) {
    if (typeAnn.kind === 'TypeUnion') return typeAnn.types.flatMap(t => this.flattenUnion(t));
    return [typeAnn];
  },

  // Check if a type annotation is a pure string literal union (handles nested TypeUnions)
  isStringLiteralUnion(typeAnn) {
    if (!typeAnn) return false;
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return true;
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.every(t => this.isStringLiteralUnion(t));
    }
    return false;
  },

  // Extract string literal values from a string literal union type (handles nested TypeUnions)
  getStringLiteralMembers(typeAnn) {
    if (!typeAnn) return [];
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return [typeAnn.value];
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.flatMap(t => this.getStringLiteralMembers(t));
    }
    return [];
  },

  visitEnum(node) {
    const { name, members, isConst } = node;
    let counter = 0;
    // Detect string enum: first member with a string value
    const isStringEnum = members.some(m => m.value?.litType === 'string');
    const entries = members.map(m => {
      if (isStringEnum) {
        const strVal = m.value ? m.value.value : m.name;
        const idx = counter++;
        return { name: m.name, val: String(idx), strVal };
      }
      const val = m.value ? this.exprToC(m.value) : String(counter++);
      if (m.value) { try { counter = parseInt(val) + 1; } catch {} }
      return { name: m.name, val };
    });
    this.addTop(`typedef enum { ${entries.map(e => `${name}_${e.name} = ${e.val}`).join(', ')} } ${name};`);
    if (!isConst) {
      if (isStringEnum) {
        this.addTop(`static const char *${name}_strings[] = { ${entries.map(e => `"${e.strVal}"`).join(', ')} };`);
      } else {
        this.addTop(`static const ${name} ${name}_values[] = { ${entries.map(e => `${name}_${e.name}`).join(', ')} };`);
        this.addTop(`static const char *${name}_names[] = { ${entries.map(e => `"${e.name}"`).join(', ')} };`);
      }
    }
    this.addTop('');
    this.classes.set(name, { isEnum: true, isStringEnum, isConst, members: entries });
  },

  // ----------------------------------------------------------------
  // Global variables
  // ----------------------------------------------------------------
  visitGlobalVar(node) {
    const { varKind, name, typeAnn, init } = node;
    const isConst = varKind === 'const';
    const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
    const qualifier = isConst ? 'static const ' : 'static ';
    if (init) {
      const initC = this.exprToC(init);
      this.addTop(`${qualifier}${ctype} ${name} = ${initC};`);
    } else {
      this.addTop(`${qualifier}${ctype} ${name} = {0};`);
    }
    this.addTop('');
    this.define(name, { ctype, varKind });
  },

  // ----------------------------------------------------------------
  // Functions
  // ----------------------------------------------------------------
  visitFuncDecl(node, isTopLevel = false, isExported = false) {
    if (!node.body) return; // overload signature
    const { name, params, returnType, body, generator, decorators, typeParams } = node;

    // @platform(...) decorator: only emit for matching target
    const platformDec = (decorators ?? []).find(d => d.name === 'platform');
    if (platformDec) {
      const allowed = (platformDec.args ?? []).map(a => a.value ?? a);
      const target = this._targetName ?? 'desktop';
      if (!allowed.includes(target)) {
        if (name) this._platformSkipped.set(name, allowed);
        return; // skip for this platform
      }
    }

    // Decorator functions: store instead of emitting C
    if (node.isDecorator || (name && this._decoratorNames?.has(name))) {
      this._decoratorFns.set(name, node);
      // Apply own decorators to standalone functions
      const ownDecs = decorators ?? [];
      if (ownDecs.length > 0) {
        this._emitDecoratedStandaloneFunc(node, ownDecs);
      }
      return;
    }

    // Regular function with known decorators applied → emit as decorated standalone
    const knownDecs = (decorators ?? []).filter(d => this._decoratorFns?.has(d.name));
    if (knownDecs.length > 0) {
      this._emitDecoratedStandaloneFunc(node, knownDecs);
      return;
    }

    // #[isr(...)] annotation → forbid await and throw inside
    if (this._pendingIsrAnnotation) {
      const pendingIsr = this._pendingIsrAnnotation;
      this._pendingIsrAnnotation = null;
      if (node.async) throw this.error(`TypeError: Cannot use 'await' inside an ISR handler '${name}'`);
      const bodyHasThrowIsr = (stmts) => (stmts ?? []).some(s => s.kind === 'Throw' || bodyHasThrowIsr(s.body?.body ?? s.body ?? []));
      if (bodyHasThrowIsr(body?.body ?? [])) throw this.error(`"throw" is not allowed inside ISR handler '${name}'`);
    } else {
      this._pendingIsrAnnotation = null;
    }

    // @embedded.isr("VECTOR") decorator → ISR(VECTOR_vect) { ... }
    const isrDecorator = (decorators ?? []).find(d => d.name === 'embedded.isr');
    if (isrDecorator) {
      const vectorArg = isrDecorator.args?.[0];
      const vectorName = vectorArg?.litType === 'string' ? vectorArg.value : 'UNKNOWN';
      // Throw not allowed inside ISR
      const bodyHasThrow = (stmts) => (stmts ?? []).some(s => s.kind === 'Throw' || bodyHasThrow(s.body?.body ?? s.body ?? []));
      if (bodyHasThrow(body?.body ?? [])) throw this.error(`"throw" is not allowed inside @embedded.isr handlers`);
      const funcLines = [];
      this.pushScope();
      for (const p2 of (params ?? [])) this.define(p2.name, { ctype: p2.typeAnn ? this.resolveType(p2.typeAnn) : 'int32_t', varKind: 'let' });
      const bodyLines = [];
      this.visitBlock(body, bodyLines, 1);
      this.popScope();
      funcLines.push(`ISR(${vectorName}_vect) {`);
      for (const l of bodyLines) funcLines.push(l);
      funcLines.push('}');
      for (const l of funcLines) this.addTop(l);
      this.addTop('');
      return;
    }

    // Async/generator dispatch — state machine codegen
    if (node.async || generator) {
      const hasStaticDec = (node.decorators ?? []).some(d => d.name === 'static');
      if (!hasStaticDec && this._allocatorName === 'static') {
        const kind = node.async && generator ? 'async generator' : node.async ? 'async function' : 'generator';
        throw this.error(`TypeError: ${kind} '${name}' must be annotated with @static when allocator is "static"`);
      }
    }
    if (node.async) { this.emitAsyncFunc(node); return; }
    if (generator)  { this.emitGeneratorFunc(node); return; }

    // If there are pending overload signatures for this function, emit one C function per signature
    const pendingSigs = name ? this._pendingOverloads?.get(name) : null;
    if (pendingSigs?.length) {
      this._pendingOverloads.delete(name);
      const implRetType = returnType ? this.resolveType(returnType) : 'void';
      const allOverloads = [];
      for (const sig of pendingSigs) {
        // Build a synthetic node with this signature's params but the implementation's body
        const sigSuffix = mangleParams(sig.params);
        const sigCname = `${name}${sigSuffix}`;
        const synth = { ...node, params: sig.params, _monoName: sigCname };
        this.visitFuncDecl(synth, isTopLevel);
        allOverloads.push({ funcName: sigCname, params: sig.params });
      }
      // Register all overloads in scope for call-site dispatch
      if (name) {
        this.define(name, {
          ctype: implRetType,
          funcName: allOverloads[0].funcName,
          params: allOverloads[0].params,
          overloads: allOverloads,
          _overloadsInitialized: true,
          returnType,
        });
      }
      return;
    }

    // Generic function: store as template, emit on demand at call sites
    if (typeParams?.length > 0) {
      // Check: Pick<T, K> in return type where K is a generic param → error
      if (returnType?.kind === 'TypeRef' && returnType.name === 'Pick' && returnType.typeArgs?.length >= 2) {
        const keyArg = returnType.typeArgs[1];
        const typeParamNames = new Set(typeParams.map(tp => tp.name));
        if (keyArg.kind === 'TypeRef' && typeParamNames.has(keyArg.name)) {
          throw this.error(`Pick with runtime key in return type is not supported`);
        }
      }
      if (!this._genericFuncs) this._genericFuncs = new Map();
      this._genericFuncs.set(name, node);
      return;
    }
    const isNever = returnType?.kind === 'TypeRef' && returnType.name === 'never';
    // Infer return type from first return statement if no annotation
    let retType;
    if (returnType) {
      retType = this.resolveType(returnType);
    } else if (body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const retStmt = stmts.find(s => s.kind === 'Return' && s.value);
      retType = retStmt ? this.inferType(retStmt.value) : 'void';
    } else {
      retType = 'void';
    }
    // Stack size check
    if (this._stackSize != null && body) {
      let stackBytes = 0;
      const _scanStack = (nd) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach(_scanStack); return; }
        if (nd.kind === 'VarDecl' && nd.typeAnn?.kind === 'TypeFixedArray') {
          const et = this.resolveType(nd.typeAnn.element);
          stackBytes += nd.typeAnn.size * this._cTypeBytes(et);
        }
        if (nd.kind === 'FuncDecl' || nd.kind === 'ArrowFunc') return;
        for (const v of Object.values(nd)) {
          if (v && typeof v === 'object') _scanStack(v);
        }
      };
      _scanStack(body);
      if (stackBytes > this._stackSize) {
        throw this.error(`Warning: Worst-case stack depth (${stackBytes} bytes) exceeds stack_size (${this._stackSize} bytes) in '${name}()'`);
      }
    }

    const suffix = node._monoName ? '' : mangleParams(params);
    let cname = node._monoName ?? (name ? `${name}${suffix}` : `_anon_${this.lambdaCount++}`);

    // Throws function handling
    const throwsTypes = node.throwsTypes ?? [];
    let throwsCtx = null;
    if (throwsTypes.length > 0) {
      // Flatten throwsTypes (handles TypeUnion: throws A | B → [A, B])
      const throwsNames = (() => {
        const names = [];
        for (const t of throwsTypes) {
          if (t.kind === 'TypeRef') names.push(t.name);
          else if (t.kind === 'TypeUnion') {
            for (const inner of t.types) { if (inner.kind === 'TypeRef') names.push(inner.name); }
          }
        }
        return names;
      })();
      const errKey = throwsNames.join('_');
      const isVoid = retType === 'void';
      const retIdent = this.cTypeToIdent(retType);
      const resultType = `Result_${retIdent}_${errKey}`;

      // Rename 'ok' → 'ok_fn' to avoid C ambiguity
      if (cname === 'ok') cname = 'ok_fn';

      // Emit all Result typedefs for this errKey (first time only)
      if (!this._emittedResultErrKeys.has(errKey)) {
        this._emittedResultErrKeys.add(errKey);
        if (throwsNames.length > 1) {
          // Union error: emit _ErrTag + _ErrUnion + blank + all Results + blank
          const tagEntries = throwsNames.map((n, i) => `_Err_${n} = ${i}`).join(', ');
          this.addTop(`typedef enum { ${tagEntries} } _ErrTag_${errKey};`);
          this.addTop(`typedef struct {`);
          this.addTop(`    _ErrTag_${errKey} tag;`);
          this.addTop(`    union { ${throwsNames.map((n, i) => `${n} _${i};`).join(' ')} };`);
          this.addTop(`} _ErrUnion_${errKey};`);
          this.typedefs.push('');  // blank between _ErrUnion and Result typedefs
        }
        // Emit all Result types for this errKey (in pre-scan order)
        const resultList = this._resultTypesByErrKey.get(errKey) ?? [];
        for (const r of resultList) {
          if (throwsNames.length > 1) {
            // Union: multi-line Result
            const valPart = r.retCtype === 'void' ? 'int _dummy' : `${r.retCtype} value`;
            this.addTop(`typedef struct {`);
            this.addTop(`    bool ok;`);
            this.addTop(`    union { ${valPart}; _ErrUnion_${errKey} error; };`);
            this.addTop(`} ${r.resultName};`);
          } else {
            // Single: single-line Result
            const valPart = r.retCtype === 'void' ? 'int _dummy' : `${r.retCtype} value`;
            this.addTop(`typedef struct { bool ok; union { ${valPart}; ${throwsNames[0]} error; }; } ${r.resultName};`);
          }
        }
        if (throwsNames.length > 1) this.typedefs.push('');  // blank after union Result typedefs
      }

      // Build throwsCtx for function body
      throwsCtx = {
        resultType,
        throwsNames,
        errKey,
        isVoid,
        origRetType: retType,
      };
      // Replace retType with Result type
      retType = resultType;
    }

    // never return type: body must end with throw/abort
    if (isNever && body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const last = stmts[stmts.length - 1];
      if (!last || last.kind !== 'Throw') {
        throw this.error(`function with return type "never" must not return`);
      }
    }

    const paramStrs = params.map(p => {
      if (p.rest) {
        // ...args: T[] → T *args, int32_t args_count (unwrap the array type)
        let et = 'int32_t';
        if (p.typeAnn) {
          // Unwrap element type without emitting Array struct typedef
          if (p.typeAnn.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
          else et = this.resolveType(p.typeAnn);
        }
        return `${et} *${p.name}, int32_t ${p.name}_count`;
      }
      if (p.destructArr) {
        // [a, b]: T[] → T *_arr  (destructured in body)
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        return `${et} *_arr`;
      }
      if (p.typeAnn?.kind === 'TypeFunc') return this.typeDecl(p.typeAnn, p.name);
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });

    // Define before body for recursion support.
    // For overloads: store all variants keyed by param count, and keep the first definition
    // as a sentinel so that callToC can resolve by arg count.
    if (name) {
      const existing = this.lookup(name);
      if (existing && existing.funcName !== cname) {
        // This is an overload: add to the overloads map
        if (!existing.overloads) existing.overloads = [];
        existing.overloads.push({ funcName: cname, params });
        // Also add the first definition as overload if not already done
        if (!existing._overloadsInitialized) {
          existing.overloads.unshift({ funcName: existing.funcName, params: existing.params });
          existing._overloadsInitialized = true;
        }
      } else {
        const symExtra = throwsCtx ? {
          _isThrowsFunc: true,
          _resultType: throwsCtx.resultType,
          _resultIsVoid: throwsCtx.isVoid,
          _resultValueType: throwsCtx.origRetType,
          _resultErrKey: throwsCtx.errKey,
          _resultErrTypes: throwsCtx.throwsNames,
        } : {};
        this.define(name, { ctype: retType, funcName: cname, params, returnType, ...symExtra });
      }
    }

    const lines = this.emitFuncBody(name, body, params, retType, null, false, false, throwsCtx, isNever);
    // Track whether this function heap-allocates String return values
    if (retType === 'String') {
      const heapOps = ['tsc_string_concat','tsc_string_repeat','tsc_string_replace',
                       'tsc_string_pad','tsc_string_to_','tsc_i32_to_string','tsc_f64_to_string',
                       'tsc_i64_to_string','tsc_u32_to_string','tsc_u64_to_string',
                       'tsc_bool_to_string','tsc_char_to_string'];
      const heapsString = lines.some(l => l.trimStart().startsWith('return ') &&
                                          heapOps.some(op => l.includes(op)));
      if (!this._heapStringFuncs) this._heapStringFuncs = new Set();
      if (heapsString) this._heapStringFuncs.add(cname);
    }
    // Special C syntax when return type is a function pointer: RET (*NAME(PARAMS))(FP_PARAMS)
    let funcSig;
    if (returnType?.kind === 'TypeFunc') {
      const fpRet = this.resolveType(returnType.ret);
      const fpParams = returnType.params.map(pt => this.resolveType(pt)).join(', ') || 'void';
      funcSig = `${fpRet} (*${cname}(${paramStrs.join(', ') || 'void'}))(${fpParams})`;
    } else {
      const neverPrefix = isNever ? '_Noreturn ' : '';
      const retSep = retType.endsWith('*') ? '' : ' ';
      funcSig = `${neverPrefix}${retType}${retSep}${cname}(${paramStrs.join(', ') || 'void'})`;
    }
    // Add blank line before function if there's preceding content without a trailing blank
    if (this.topLevel.length > 0 && this.topLevel[this.topLevel.length - 1] !== '') {
      this.addTop('');
    }
    this.addTop(`${funcSig} {`);
    for (const l of lines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');
  },

  emitFuncBody(funcName, body, params, retType, className = null, isMoveMethod = false, isMut = false, throwsCtx = null, isNever = false) {
    const saved = { inFunction: this.inFunction, funcName: this.currentFuncName, retType: this.currentFuncReturnType, throwsCtx: this._throwsCtx, isNever: this._currentFuncIsNever, funcCleanup: this._funcCleanup, funcCleanupSet: this._funcCleanupSet };
    this.inFunction = true;
    this._funcCleanup = [];
    this._funcCleanupSet = new Set();
    this.currentFuncName = funcName;
    this.currentFuncReturnType = retType;
    this._throwsCtx = throwsCtx; // null for non-throws, ctx object for throws functions
    this._currentFuncIsNever = isNever;
    const lines = [];
    this._currentFuncLines = lines;
    this._funcDepth = 0;

    this.pushScope();
    // For constructors: declare 'self' as value; for instance methods: as pointer
    const isCtor = className && (funcName === 'new' || funcName === 'constructor');
    if (className) {
      // move-method: self passed by value → use as value (not pointer)
      const selfIsPointer = !isCtor && !isMoveMethod;
      this.define('self', { ctype: className, isPointer: selfIsPointer });
      // 'this' keyword in source → 'self' in C; also define 'this' for Member lookup
      this.define('this', { ctype: className, isPointer: selfIsPointer });
      if (isCtor) lines.push(`${className} self = {0};`);
    }
    for (const p of params) {
      if (p.rest) {
        // Rest param: element type, mark as rest
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        this.define(p.name, { ctype: et, rest: true, countVar: `${p.name}_count` });
      } else if (p.destructArr) {
        // Array destructuring: emit bindings at top of function body
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        for (let i = 0; i < p.destructArr.length; i++) {
          const slot = p.destructArr[i];
          if (!slot) continue; // skip (,, c)
          lines.push(`${et} ${slot.name} = _arr[${i}];`);
          this.define(slot.name, { ctype: et });
        }
      } else if (p.typeAnn) {
        const _ct = this.resolveType(p.typeAnn);
        const _isRef = p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'Ref';
        this.define(p.name, { ctype: _ct, isPointer: _ct.endsWith('*'), isRefParam: _isRef });
      }
    }
    this.visitBlock(body, lines, 0);
    if (isCtor) {
      this._emitFuncCleanup(lines, '    ');
      lines.push('return self;');
    }
    // For void throws functions: add implicit {.ok=true} return if last stmt isn't a return
    if (throwsCtx?.isVoid) {
      const lastNonEmpty = [...lines].reverse().find(l => l.trim() !== '');
      if (!lastNonEmpty?.trim().startsWith('return ')) {
        this._emitFuncCleanup(lines, '    ');
        lines.push(`return (${throwsCtx.resultType}){.ok = true};`);
      }
    }
    this.popScope();

    this.inFunction = saved.inFunction;
    this.currentFuncName = saved.funcName;
    this.currentFuncReturnType = saved.retType;
    this._throwsCtx = saved.throwsCtx;
    this._currentFuncIsNever = saved.isNever;
    this._funcCleanup = saved.funcCleanup;
    this._funcCleanupSet = saved.funcCleanupSet;
    return lines;
  },

  visitExtensionFunc(node) {
    const { name, thisType, params, returnType, body } = node;
    const thisCType = this.resolveType(thisType);
    const thisIdent = this.cTypeToIdent(thisCType);

    // Check for conflict with existing class method
    if (thisType.kind === 'TypeRef' && this.classes.has(thisType.name)) {
      const cls = this.classes.get(thisType.name);
      if (cls._methodNames?.has(name)) {
        throw this.error(`TypeError: extension '${name}' conflicts with existing method on ${thisType.name}`);
      }
    }

    const cFuncName = `_ext_${thisIdent}_${name}`;
    const retCType = returnType ? this.resolveType(returnType) : 'void';

    // Build param list: _self first, then rest
    const paramParts = [`${thisCType} _self`];
    for (const p of params) {
      const pt = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      paramParts.push(`${pt} ${p.name}`);
    }

    // Emit function
    this.addTop(`${retCType} ${cFuncName}(${paramParts.join(', ')}) {`);
    const saved = { inFunction: this.inFunction, funcName: this.currentFuncName, retType: this.currentFuncReturnType };
    this.inFunction = true;
    this.currentFuncName = cFuncName;
    this.currentFuncReturnType = retCType;
    this.pushScope();
    this.define('this', { ctype: thisCType, _cAlias: '_self' });
    for (const p of params) {
      const pt = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      this.define(p.name, { ctype: pt });
    }
    const lines = [];
    this.visitBlock(body, lines, 0);
    this.popScope();
    this.inFunction = saved.inFunction;
    this.currentFuncName = saved.funcName;
    this.currentFuncReturnType = saved.retType;
    for (const l of lines) this.addTop(`    ${l}`);
    this.addTop('}');
    this.addTop('');

    // Register extension for call resolution
    if (!this._extensions) this._extensions = new Map();
    const key = `${thisIdent}.${name}`;
    this._extensions.set(key, { cFuncName, thisCType, thisIdent, retCType });
  }
};
