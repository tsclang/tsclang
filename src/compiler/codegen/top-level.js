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
              if (ta.name === 'Shared') { info.shared = true; info.refFirst = false; }
              if (ta.name === 'Weak') { info.weak = true; info.refFirst = false; }
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
    for (const node of ast.body) {
      if (node.kind === 'ProfileAnnotation') {
        const mTarget = node.content.match(/target\((\w+)\)/);
        if (mTarget) this._targetName = mTarget[1];
        const mAlloc = node.content.match(/allocator\((\w+)\)/);
        if (mAlloc) this._allocatorName = mAlloc[1];
      }
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
      case 'Import':  break; // stdlib handled via includes
      case 'Export':
        if (node.default) throw this.error('"export default" is not allowed; use named exports only');
        if (node.decl?.kind === 'FuncDecl') {
          this.visitFuncDecl(node.decl, true, true); // isExported=true → no static
        } else if (node.decl?.kind === 'ExtensionFunc') {
          this.visitExtensionFunc(node.decl);
        } else {
          this.visitTopLevel(node.decl);
        }
        break;
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

        // Make it a static global only if referenced by a top-level function body
        // (required for C correctness — function can't access main() locals)
        const needsStatic = this._funcRefVars?.has(node.name);
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
    this.classes.set(name, { fields, methods, superClass: effectiveSuperClass, isStruct: true, implements_,
      ...(isThrowsClass ? { _isThrowsClass: true } : {}) });

    // Map TSClang base class names → C names
    const cBase = effectiveSuperClass === 'Error' ? 'TscError' : effectiveSuperClass;

    // Check if this class is used as Shared<T> or Weak<T>
    const arcInfo = this._arcClasses?.get(name);

    // All-static class with no fields → no struct needed (just a namespace)
    const allStatic = methods.length > 0 && methods.every(m => m.modifiers.includes('static'));
    const hasUserFields = fields.length > 0 || cBase;

    if (!allStatic || hasUserFields) {
      // Build field list (single-line struct always)
      const userFieldParts = [];
      if (cBase) userFieldParts.push(`${cBase} _base;`);
      for (const f of fields) {
        // Ref<T>/Mut<T> cannot be stored in class fields
        if (f.typeAnn?.kind === 'TypeRef' && (f.typeAnn.name === 'Ref' || f.typeAnn.name === 'Mut')) {
          throw this.error(`"${f.typeAnn.name}<T>" cannot be stored in a class field`);
        }
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        if (ct.endsWith(' *')) userFieldParts.push(`${ct.slice(0, -2)} *${f.name};`);
        else userFieldParts.push(`${ct} ${f.name};`);
      }

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

    // Methods: emit with explicit-implements style (void *_self) when class has 'implements'
    const explicitImplements = node.implements_ ?? [];
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      const isStatic = m.modifiers.includes('static');
      this.emitMethod(name, m, isStatic, explicitImplements);
    }

    // Emit vtable constants for each explicitly implemented interface
    for (const ifaceName of explicitImplements) {
      this.emitVtableConstant(name, ifaceName);
    }
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

    // #[isr(...)] annotation on async function → error
    if (this._pendingIsrAnnotation) {
      const pendingIsr = this._pendingIsrAnnotation;
      this._pendingIsrAnnotation = null;
      if (node.async) throw this.error(`TypeError: Cannot use 'await' inside an ISR handler '${name}'`);
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
    const saved = { inFunction: this.inFunction, funcName: this.currentFuncName, retType: this.currentFuncReturnType, throwsCtx: this._throwsCtx, isNever: this._currentFuncIsNever };
    this.inFunction = true;
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
    if (isCtor) lines.push('return self;');
    // For void throws functions: add implicit {.ok=true} return if last stmt isn't a return
    if (throwsCtx?.isVoid) {
      const lastNonEmpty = [...lines].reverse().find(l => l.trim() !== '');
      if (!lastNonEmpty?.trim().startsWith('return ')) {
        lines.push(`return (${throwsCtx.resultType}){.ok = true};`);
      }
    }
    this.popScope();

    this.inFunction = saved.inFunction;
    this.currentFuncName = saved.funcName;
    this.currentFuncReturnType = saved.retType;
    this._throwsCtx = saved.throwsCtx;
    this._currentFuncIsNever = saved.isNever;
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
