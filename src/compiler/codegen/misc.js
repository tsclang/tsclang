// misc.js
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
      const [kt, vt] = (node.typeArgs ?? []).map(t => this.resolveType(t));
      const k = kt ? this.cTypeToIdent(kt) : 'string';
      const v = vt ? this.cTypeToIdent(vt) : 'i32';
      return `tsc_map_create_${k}_${v}()`;
    }

    // new Array<T>() or []
    if (name === 'Array') {
      return `tsc_array_create()`;
    }

    // new Shared<T>()
    if (name === 'Shared') {
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'void';
      return `tsc_arc_alloc(sizeof(${t}))`;
    }

    // new Weak<T>(val)
    if (name === 'Weak') {
      return `tsc_weak_create(${argsC})`;
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
      if (!this._emittedGenericClasses) this._emittedGenericClasses = new Set();
      if (!this._emittedGenericClasses.has(monoName)) {
        this._emittedGenericClasses.add(monoName);
        this.emitMonoClass(tmpl, monoName, subst);
      }
      return `${monoName}_new(${argsC})`;
    }

    // Known class with constructor
    const cls = this.classes.get(name);
    if (cls) {
      const hasCtor = cls.methods?.some(m => m.name === 'constructor');
      if (hasCtor) return `${name}_new(${argsC})`;
      return `{0}`;
    }

    // Unknown: zero-init struct
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
    const paramStrs = (node.params ?? []).map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      return `${ct} ${p.name}`;
    });
    const lines = [];
    if (node.body.kind === 'Block') {
      this.visitBlock(node.body, lines, 0);
    } else {
      const c = this.exprToC(node.body, lines, 0);
      lines.push(`return ${c};`);
    }
    this.addLambda(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');
    return name;
  },

  inferArrowReturn(node) {
    if (node.returnType) return this.resolveType(node.returnType);
    if (node.body.kind !== 'Block') return this.inferType(node.body);
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
  arrayLitToC(node, _elemType, lines, depth) {
    const result = [];
    for (const e of node.elems) {
      if (e.spread) {
        // Expand spread from known array
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          for (let i = 0; i < sym.arraySize; i++) {
            result.push(`${e.expr.name}[${i}]`);
          }
        } else {
          result.push(`/* ...${this.exprToC(e.expr, lines, depth)} */`);
        }
      } else {
        result.push(this.exprToC(e.expr, lines, depth));
      }
    }
    return result;
  },

  // Count the static size of an ArrayLit (expanding spread if possible)
  arrayLitSize(node) {
    let count = 0;
    for (const e of node.elems) {
      if (e.spread) {
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) count += sym.arraySize;
        else return -1; // unknown
      } else {
        count++;
      }
    }
    return count;
  }
};
