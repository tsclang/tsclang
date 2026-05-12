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

    // new Shared<T>()
    if (name === 'Shared') {
      if (this._allocatorName === 'none' || this._allocatorName === 'static') {
        const t2 = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'void';
        const tsName = this.ctypeToTsName(t2);
        throw this.error(`TypeError: 'new Shared<${tsName}>()' requires heap allocation (ARC), which is unavailable when allocator is "${this._allocatorName}"`);
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
      // allocator-none: no heap allocation via new (except @embedded.inline which is stack-allocated)
      if (this._allocatorName === 'none' && !cls._isInline) {
        throw this.error(`TypeError: Heap allocation ('new ${name}()') is not allowed when allocator is "none"`);
      }
      const hasCtor = cls.methods?.some(m => m.name === 'constructor');
      // Suppress const for class instances unless ALL fields are readonly
      const allReadonly = cls.fields?.length > 0 &&
        cls.fields.every(f => f.modifiers?.includes('readonly'));
      if (!allReadonly) this._lastSuppressConst = true;
      if (hasCtor) return `${name}_new(${argsC})`;
      // Throws classes have a synthesized _new(String msg) function
      if (cls._isThrowsClass) return `${name}_new(${argsC})`;
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
      return this._inReturnContext ? `(${name}){0}` : `{0}`;
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
      return `${ct} ${p.name}`;
    });
    const lines = [];
    this.pushScope();
    for (let i = 0; i < (node.params ?? []).length; i++) {
      const p = node.params[i];
      const hinted = this._lambdaParamHint?.[i];
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : (hinted ?? 'void *');
      this.define(p.name, { ctype: ct, varKind: 'const' });
    }
    if (node.body.kind === 'Block') {
      this.visitBlock(node.body, lines, 0);
    } else {
      const c = this.exprToC(node.body, lines, 0);
      lines.push(`return ${c};`);
    }
    this.popScope();
    this.addLambda(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');
    return name;
  },

  inferArrowReturn(node) {
    if (node.returnType) return this.resolveType(node.returnType);
    if (node.body.kind !== 'Block') {
      // Push lambda params into scope for type inference
      if (node.params?.length && this._lambdaParamHint) {
        this.pushScope();
        for (let i = 0; i < node.params.length; i++) {
          const p = node.params[i];
          const ct = p.typeAnn ? this.resolveType(p.typeAnn) : (this._lambdaParamHint[i] ?? 'void *');
          this.define(p.name, { ctype: ct });
        }
      }
      const t = this.inferType(node.body);
      if (node.params?.length && this._lambdaParamHint) this.popScope();
      return t;
    }
    return 'void';
  },

  // Format a variable declaration: qualifier + ctype + name with proper pointer spacing
  varDecl(qualifier, ctype, name) {
    if (ctype.endsWith(' *')) return `${qualifier}${ctype}${name}`;
    return `${qualifier}${ctype} ${name}`;
  },

  arrowParamTypes(node) {
    return (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
  },

  // Expand an ArrayLit's elements into C initializer strings, handling spreads.
  // Spread `...arr` on a known C array expands to arr[0], arr[1], ...
};
