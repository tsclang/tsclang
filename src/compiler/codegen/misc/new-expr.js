// new-expr.js
export default {
  newToC(node, lines, depth) {
    const { name, args } = node;
    const argsC = this.argsToC(args, lines, depth);

    // new Error("msg") → (TscError){ .message = STR_LIT("msg") }
    if (name === 'Error') {
      const msgArg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `(TscError){ .message = ${msgArg} }`;
    }

    // new Map<K,V>() → tsc_map_create_K_V()
    if (name === 'Map') {
      if (this._strictRules?.has('no-dynamic-alloc')) {
        throw this.error(`dynamic allocation is forbidden in strict mode (no-dynamic-alloc); Map requires heap allocation`, node);
      }
      if (this._allocatorName === 'static' && !args[0]) {
        const [kt2, vt2] = (node.typeArgs ?? []).map(t => this.resolveType(t));
        const k2 = kt2 ? this.ctypeToTsName(kt2) : 'string';
        const v2 = vt2 ? this.ctypeToTsName(vt2) : 'i32';
        throw this.error(`TypeError: 'new Map<${k2}, ${v2}>()' requires a capacity argument when allocator is "static"; use 'new Map<${k2}, ${v2}>(N)'`);
      }
      const [kt, vt] = (node.typeArgs ?? []).map(t => this.resolveType(t));
      const k = kt ? this.cTypeToIdent(kt) : 'string';
      const v = vt ? this.cTypeToIdent(vt) : 'i32';
      const suffix = `${k}_${v}`;
      // Emit Map_K_V struct only when the target type is Map_* (not TscMap_* from runtime.h)
      if (!this._expectedType?.startsWith('TscMap_')) {
        this._ensureMapStruct(suffix);
      }
      return `tsc_map_create_${k}_${v}()`;
    }

    // new Array<T>(N) or new Array(N) — heap-allocated array
    if (name === 'Array') {
      if (this._strictRules?.has('no-dynamic-alloc') && args[0]) {
        const argLit = args[0].expr?.kind === 'Literal' && args[0].expr.litType === 'number';
        if (!argLit) {
          throw this.error(`dynamic allocation is forbidden in strict mode (no-dynamic-alloc); use fixed-size array or compile-time constant`, node);
        }
      }
      if (this._allocatorName === 'static' && !args[0]) {
        const et2 = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'int32_t';
        const tsName = this.ctypeToTsName(et2);
        throw this.error(`TypeError: 'new Array<${tsName}>()' requires a capacity argument when allocator is "static"; use 'new Array<${tsName}>(N)'`);
      }
      // Determine element type from type args or annotation context
      let et = 'int32_t';
      if (node.typeArgs?.[0]) et = this.resolveType(node.typeArgs[0]);
      else if (this._newArrayElemHint) et = this._newArrayElemHint;
      const elemIdent = this.cTypeToIdent(et);
      const arrName = `Array_${elemIdent}`;
      this._ensureArrayStruct(arrName, et);
      const capArg = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_array_create_${elemIdent}(${capArg})`;
    }

    // new Arc<T>()
    if (name === 'Arc') {
      if (this._allocatorName === 'static') {
        const t2 = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'void';
        const tsName = this.ctypeToTsName(t2);
        throw this.error(`TypeError: 'new Arc<${tsName}>()' requires heap allocation (ARC), which is unavailable when allocator is "${this._allocatorName}"`);
      }
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'void';
      return `tsc_arc_alloc(sizeof(${t}))`;
    }

    // new Weak<T>(val)
    if (name === 'Weak') {
      return `tsc_weak_create(${argsC})`;
    }

    // new Date() / new Date(ms) / new Date(y, m, d, ...) → tsc_date_*
    if (name === 'Date') {
      if (args.length === 0) {
        return `(Date){ tsc_date_now() }`;
      }
      if (args.length === 1) {
        const arg0 = args[0].expr ?? args[0];
        if (arg0.kind === 'Literal' && arg0.litType === 'string') {
          // new Date("ISO string") — parse via strptime
          return `tsc_date_from_ms(tsc_date_parse_iso(${this.exprToC(arg0, lines, depth)}))`;
        }
        const msC = this.exprToC(arg0, lines, depth);
        return `tsc_date_from_ms((int64_t)(${msC}))`;
      }
      // new Date(year, month, day[, h, m, s, ms])
      const a = args.map(a => this.exprToC(a.expr ?? a, lines, depth));
      return `tsc_date_from_ymd(${a[0]}, ${a[1]}, ${a[2] ?? 1}, ${a[3] ?? 0}, ${a[4] ?? 0}, ${a[5] ?? 0}, ${a[6] ?? 0})`;
    }

    // new Readonly(val) → transparent: just return the value
    if (name === 'Readonly') {
      return args[0] ? this.exprToC(args[0].expr ?? args[0], lines, depth) : '{0}';
    }

    // new Atomic<T>(val)
    if (name === 'Atomic') {
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'int32_t';
      return `{.value = ${argsC || '0'}}`;
    }

    // new Channel<T>(cap)
    if (name === 'Channel') {
      const t = node.typeArgs?.[0] ? this.cTypeToIdent(this.resolveType(node.typeArgs[0])) : 'i32';
      return `{ ._inner = tsc_channel_create_${t}(${argsC}) }`;
    }

    // new Signal<T>(val)
    if (name === 'Signal') {
      const t = node.typeArgs?.[0] ? this.cTypeToIdent(this.resolveType(node.typeArgs[0])) : 'i32';
      return `tsc_signal_create_${t}(${argsC})`;
    }

    // new AbortController()
    if (name === 'AbortController') {
      return `tsc_abort_controller_create()`;
    }

    // new UDPSocket() → tsc_udp_create()
    if (name === 'UDPSocket') {
      return `tsc_udp_create()`;
    }

    // new WebSocketServer() → tsc_ws_server_create()
    if (name === 'WebSocketServer') {
      return `tsc_ws_server_create()`;
    }

    // new Promise<T>(...)
    if (name === 'Promise') {
      return `/* new Promise */ {0}`;
    }

    // new URL(...)
    if (name === 'URL') {
      if (args.length === 1) return `tsc_url_parse(${argsC})`;
      if (args.length === 2) return `tsc_url_parse_relative(${argsC.split(', ')[0]}, &${argsC.split(', ')[1]})`;
    }

    // Generic class instantiation: new Box<i32>(42) → Box_i32_new(42)
    if (this._genericClasses?.has(name)) {
      const tmpl = this._genericClasses.get(name);
      const typeArgs = node.typeArgs ?? [];
      const subst = new Map();
      for (let i = 0; i < tmpl.typeParams.length; i++) {
        const ct = typeArgs[i] ? this.resolveType(typeArgs[i]) : 'int32_t';
        subst.set(tmpl.typeParams[i].name, ct);
      }
      const suffix = tmpl.typeParams.map(tp => this.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
      const monoName = `${name}_${suffix}`;
      if (!this._emittedGenericClasses.has(monoName)) {
        this._emittedGenericClasses.add(monoName);
        this.emitMonoClass(tmpl, monoName, subst);
      }
      return `${monoName}_new(${argsC})`;
    }

    // Known class with constructor
    const cls = this.classes.get(name);
    if (cls) {
      const cname = cls._cname ?? name;
      // Heap class: new HeapClass() → malloc + constructor (auto-free on scope exit)
      if (cls._isHeap) {
        this._lastSuppressConst = true;
        const tmpName = `_heap_${this.tempCount++}`;
        this.includes.add('#include <stdlib.h>');
        lines.push(`${cname} *${tmpName} = (${cname} *)tsc_malloc(sizeof(${cname}));`);
        const hasCtor = cls.methods?.some(m => m.name === 'constructor');
        const ctorArgs = hasCtor ? node.args.map(a => this.exprToC(a.expr ?? a, lines, depth)).join(', ') : '';
        lines.push(`*${tmpName} = ${cname}_new(${ctorArgs});`);
        return tmpName;
      }
      // Pool class: new PoolClass() → alloc from pool + null check
      if (cls._isPool) {
        this._ensurePoolAlloc(cname);
        this._lastSuppressConst = true;
        const allocResult = `${cname}_alloc()`;
        const tmpName = `_pool_${this.tempCount++}`;
        lines.push(`${cls._poolOptType} ${tmpName} = ${allocResult};`);
        if (!this._throwsCtx && !this._inTryBlock) {
          throw this.error(`pool allocation via "new ${name}()" may fail; wrap in try/catch or declare function as "throws Error"`, node);
        }
        lines.push(`if (!${tmpName}.has_value) {`);
        const errC = `Error_new(STR_LIT("pool exhausted: ${name}"))`;
        if (this._usesGotoCleanup) {
          lines.push(`    _result = (${this._throwsCtx.resultType}){.ok = false, .error = ${errC}};`);
          lines.push(`    goto cleanup;`);
        } else if (this._throwsCtx) {
          lines.push(`    return (${this._throwsCtx.resultType}){.ok = false, .error = ${errC}};`);
        } else if (this._inTryBlock) {
          lines.push(`    ${this._tryCatchInfo.errVar} = ${errC};`);
          lines.push(`    goto ${this._tryCatchInfo.catchLabel};`);
        } else {
          lines.push(`    ${errC};`);
          lines.push(`    abort();`);
        }
        lines.push(`}`);
        const hasCtor = cls.methods?.some(m => m.name === 'constructor');
        if (hasCtor && node.args?.length > 0) {
          const argsC = node.args.map(a => this.exprToC(a.expr ?? a, lines, depth)).join(', ');
          lines.push(`*${tmpName}.value = ${cname}_new(${argsC});`);
        }
        return tmpName;
      }
      const hasCtor = cls.methods?.some(m => m.name === 'constructor');
      // Suppress const for class instances unless ALL fields are readonly
      const allReadonly = cls.fields?.length > 0 &&
        cls.fields.every(f => f.modifiers?.includes('readonly'));
      if (!allReadonly) this._lastSuppressConst = true;
      if (hasCtor) return `${cname}_new(${argsC})`;
      // Throws classes have a synthesized _new(String msg) function
      if (cls._isThrowsClass) return `${cname}_new(${argsC})`;
      // Class decorator inits: flag for injection after VarDecl emit
      if (cls._decoratorInits?.length) this._pendingDecoratorInits = cls._decoratorInits;
      // @readonly fields with initializers → designated initializer syntax
      const readonlyInits = (cls.fields ?? []).filter(f =>
        f.init && (f.decorators ?? []).some(d => d.name === 'readonly')
      );
      if (readonlyInits.length > 0) {
        const parts = readonlyInits.map(f => `.${f.name} = ${this.exprToC(f.init, lines, depth)}`);
        return `{ ${parts.join(', ')} }`;
      }
      // In return context, compound literal syntax is required; in declarations, {0} works too
      return this._inReturnContext ? `(${cname}){0}` : `{0}`;
    }

    // Unknown: zero-init struct
    this._lastSuppressConst = true;
    return `(${name}){0}`;
  },

  // ----------------------------------------------------------------
  // Arrow function hoisting
  // ----------------------------------------------------------------
  hoistArrow(node, retType, hint) {
    const n = this.lambdaCount++;
    // Determine return type from body
    let ret = retType === 'void' ? this.inferArrowReturn(node) : retType;
    // Name uses the mangled return type (e.g. _lambda_0_i32)
    const retSuffix = this.cTypeToIdent(ret);
    const name = `_lambda_${n}_${retSuffix}`;
    const paramStrs = (node.params ?? []).map((p, i) => {
      const hinted = this._lambdaParamHint?.[i];
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : (hinted ?? 'void *');
      return ct === 'String *' ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });
    if (this._lambdaParamHint) {
      for (let i = (node.params?.length ?? 0); i < this._lambdaParamHint.length; i++) {
        const ct = this._lambdaParamHint[i];
        paramStrs.push(ct === 'String *' ? `${ct} _unused_${i}` : `${ct} _unused_${i}`);
      }
    }
    const lines = [];
    this.pushScope();
    this._inHoistedLambda = true;
    for (let i = 0; i < (node.params ?? []).length; i++) {
      const p = node.params[i];
      const hinted = this._lambdaParamHint?.[i];
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : (hinted ?? 'void *');
      const symInfo = { ctype: ct, varKind: 'const' };
      if (ct === 'String *') {
        symInfo.isPointer = true;
        symInfo.isRefParam = true;
        symInfo.derefType = 'String';
      }
      this.define(p.name, symInfo);
    }
    if (node.body.kind === 'Block') {
      this.visitBlock(node.body, lines, 0);
    } else {
      const c = this.exprToC(node.body, lines, 0);
      const bodySym = node.body.kind === 'Ident' ? this.lookup(node.body.name) : null;
      lines.push(`return ${this._derefStrPtr(bodySym, c)};`);
    }
    this.popScope();
    this._inHoistedLambda = false;
    this.addLambda(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');
    return name;
  },

  _scanReturnExpr(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) { const r = this._scanReturnExpr(child); if (r) return r; }
      return null;
    }
    if (node.kind === 'Return' && (node.expr || node.value)) return node.expr || node.value;
    for (const key of Object.keys(node)) {
      if (key === 'kind') continue;
      const child = node[key];
      if (child && typeof child === 'object') { const r = this._scanReturnExpr(child); if (r) return r; }
    }
    return null;
  },

  inferArrowReturn(node) {
    if (node.returnType) return this.resolveType(node.returnType);
    const hasParams = node.params?.length > 0;
    if (hasParams) {
      this.pushScope();
      for (let i = 0; i < node.params.length; i++) {
        const p = node.params[i];
        const rawCt = p.typeAnn ? this.resolveType(p.typeAnn) : (this._lambdaParamHint?.[i] ?? 'void *');
        const inferCt = rawCt === 'String *' ? 'String' : rawCt;
        this.define(p.name, { ctype: inferCt });
      }
    }
    let result = 'void';
    if (node.body.kind !== 'Block') {
      result = this.inferType(node.body) ?? 'void';
    } else {
      for (const stmt of (node.body.body ?? [])) {
        if (stmt.kind === 'VarDecl' && stmt.init) {
          const initCt = this.inferType(stmt.init);
          if (initCt) this.define(stmt.name, { ctype: initCt === 'String *' ? 'String' : initCt });
        }
      }
      const retExpr = this._scanReturnExpr(node.body);
      if (retExpr) result = this.inferType(retExpr) ?? 'void';
    }
    if (hasParams) this.popScope();
    return result;
  },

  // Format a variable declaration: qualifier + ctype + name with proper pointer spacing
  varDecl(qualifier, ctype, name) {
    if (qualifier === 'const ' && ctype.startsWith('const ')) qualifier = '';
    if (ctype.endsWith(' *')) return `${qualifier}${ctype}${name}`;
    return `${qualifier}${ctype} ${name}`;
  },

  arrowParamTypes(node) {
    return (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
  },

  // Expand an ArrayLit's elements into C initializer strings, handling spreads.
  // Spread `...arr` on a known C array expands to arr[0], arr[1], ...
};
