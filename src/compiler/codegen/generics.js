import { mangleParams } from '../types.js';
// generics.js
export default {
  callGeneric(name, typeArgs, args, lines, depth) {
    const tmpl = this._genericFuncs.get(name);
    if (!tmpl) return `${name}(${this.argsToC(args, lines, depth)})`;

    // Check for ambiguous overload (non-generic version exists in scope)
    const existing = this.lookup(name);
    if (existing?.funcName) {
      throw this.error(`ambiguous call: both generic and non-generic overload match`);
    }

    // Build substitution map: T → concrete C type
    const subst = new Map();
    for (let i = 0; i < tmpl.typeParams.length; i++) {
      const tp = tmpl.typeParams[i];
      let ctype;
      if (typeArgs[i]) {
        ctype = this.resolveType(typeArgs[i]);
      } else if (args[i]) {
        // For ObjLit args, create an anon struct so T has concrete fields
        if (args[i].expr?.kind === 'ObjLit') {
          ctype = this.inferObjLitType(args[i].expr);
        } else {
          ctype = this.inferType(args[i].expr);
        }
      } else {
        ctype = 'int32_t';
      }
      subst.set(tp.name, ctype);
    }

    // Handle structural constraint: T implements { ... } → use anonymous struct
    for (const tp of tmpl.typeParams) {
      if (tp.constraint?.kind === 'TypeObject' && !typeArgs[tmpl.typeParams.indexOf(tp)]) {
        if (args[0]) {
          const argType = args[0].expr?.kind === 'ObjLit'
            ? this.inferObjLitType(args[0].expr)
            : this.inferType(args[0].expr);
          subst.set(tp.name, argType);
        }
      }
    }

    // Compute suffix from resolved monomorphized parameter types (more accurate for utility types)
    const nonThisParams = tmpl.params.filter(p => p.name !== 'this' && p.name !== 'self' && p.typeAnn);
    const suffix = nonThisParams.length > 0
      ? nonThisParams.map(p => this.cTypeToIdent(this.resolveType(this.substType(p.typeAnn, subst)))).join('_')
      : tmpl.typeParams.map(tp => this.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
    const monoName = `${name}_${suffix}`;

    // Emit monomorphized function if not already done
    if (!this._emittedGenerics) this._emittedGenerics = new Set();
    if (!this._emittedGenerics.has(monoName)) {
      this._emittedGenerics.add(monoName);
      this.emitMonoFunc(tmpl, monoName, subst);
    }

    // Generate call args, casting ObjLit args to expected param struct types
    const resolvedParamTypes = nonThisParams.map(p =>
      this.resolveType(this.substType(p.typeAnn, subst)));
    const argsC = args.map((a, i) => {
      const expectedType = resolvedParamTypes[i];
      if (a.expr?.kind === 'ObjLit' && expectedType) {
        const structDef = this.classes.get(expectedType);
        if (structDef?.fields) {
          const fieldNames = structDef.fields.map(f => f.name ?? f);
          const filteredProps = a.expr.props.filter(p => !p.spread && !p.computed && fieldNames.includes(p.key));
          const propsC = filteredProps.map(p => `.${p.key} = ${this.exprToC(p.value, lines, depth)}`).join(', ');
          return `(${expectedType}){${propsC}}`;
        }
      }
      return this.exprToC(a.expr, lines, depth);
    }).join(', ');
    return `${monoName}(${argsC})`;
  },

  // Create a virtual anonymous struct for field lookup (not emitted to C output)
  // Used internally by callGeneric to resolve utility types like Pick<T, K>
  inferObjLitType(node) {
    const fields = node.props
      .filter(p => !p.spread && !p.computed)
      .map(p => ({ name: p.key, ctype: this.inferType(p.value) }));
    const sig = fields.map(f => `${f.ctype} ${f.name}`).join(';');
    if (!this._anonStructSigs) this._anonStructSigs = new Map();
    if (this._anonStructSigs.has(sig)) return this._anonStructSigs.get(sig);
    if (!this._anonStructCount) this._anonStructCount = 0;
    const anonName = `_anon_${this._anonStructCount++}`;
    const structFields = fields.map(f => ({
      name: f.name,
      typeAnn: { kind: 'TypeRef', name: f.ctype, typeArgs: [] },
    }));
    // Register in classes for field lookup but do NOT emit typedef (only used internally)
    this.classes.set(anonName, { isStruct: true, fields: structFields, _virtual: true });
    this._anonStructSigs.set(sig, anonName);
    return anonName;
  },

  // Substitute type params in a type annotation
  substType(typeNode, subst) {
    if (!typeNode) return typeNode;
    if (typeNode.kind === 'TypeRef') {
      if (subst.has(typeNode.name)) {
        const ct = subst.get(typeNode.name);
        // Convert C type back to TypeRef for resolveType
        return { kind: 'TypeRef', name: ct, typeArgs: [] };
      }
      return { ...typeNode, typeArgs: typeNode.typeArgs.map(t => this.substType(t, subst)) };
    }
    if (typeNode.kind === 'TypeArray') return { ...typeNode, element: this.substType(typeNode.element, subst) };
    if (typeNode.kind === 'TypeUnion') return { ...typeNode, types: typeNode.types.map(t => this.substType(t, subst)) };
    return typeNode;
  },

  // Substitute type params in an AST node
  substNode(node, subst) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => this.substNode(n, subst));
    const result = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'typeAnn' || k === 'returnType' || k === 'castType') {
        result[k] = this.substType(v, subst);
      } else {
        result[k] = this.substNode(v, subst);
      }
    }
    return result;
  },

  emitMonoFunc(tmpl, monoName, subst) {
    // Create a copy of the function with substituted type params
    const monoParams = tmpl.params.map(p => ({
      ...p,
      typeAnn: p.typeAnn ? this.substType(p.typeAnn, subst) : p.typeAnn,
    }));
    const monoReturnType = tmpl.returnType ? this.substType(tmpl.returnType, subst) : null;
    const monoBody = this.substNode(tmpl.body, subst);

    const monoNode = {
      kind: 'FuncDecl',
      name: monoName,
      _monoName: monoName, // skip mangleParams suffix
      params: monoParams,
      returnType: monoReturnType,
      body: monoBody,
      generator: tmpl.generator,
      decorators: tmpl.decorators,
      typeParams: [], // already monomorphized
    };
    this.visitFuncDecl(monoNode, true);
  },

  emitMonoClass(tmpl, monoName, subst) {
    const fields  = tmpl.members.filter(m => m.kind === 'Field');
    const methods = tmpl.members.filter(m => m.kind === 'Method');

    // Single-line typedef struct
    const fieldDecls = fields.map(f => {
      const ct = this.resolveType(this.substType(f.typeAnn ?? { kind: 'TypeRef', name: 'int32_t', typeArgs: [] }, subst));
      return `${ct} ${f.name};`;
    }).join(' ');
    this.addTop(`typedef struct { ${fieldDecls} } ${monoName};`);
    this.addTop('');

    // Register class so method dispatch works
    this.classes.set(monoName, {
      fields: fields.map(f => ({ ...f, typeAnn: f.typeAnn ? this.substType(f.typeAnn, subst) : f.typeAnn })),
      methods,
      isStruct: false,
    });

    // Constructor
    const ctor = methods.find(m => m.name === 'constructor');
    if (ctor) {
      const ctorParams = ctor.params
        .filter(p => p.name !== 'this')
        .map(p => ({ ...p, typeAnn: p.typeAnn ? this.substType(p.typeAnn, subst) : p.typeAnn }));
      const paramDecls = ctorParams
        .map(p => `${p.typeAnn ? this.resolveType(p.typeAnn) : 'void *'} ${p.name}`)
        .join(', ');
      const monoBody = this.substNode(ctor.body, subst);
      const bodyLines = this.emitFuncBody('new', monoBody, ctorParams, monoName, monoName);
      this.addTop(`static ${monoName} ${monoName}_new(${paramDecls}) {`);
      for (const l of bodyLines) this.addTop('    ' + l);
      this.addTop('}');
      this.addTop('');
    }

    // Instance / static methods
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      const isStatic = m.modifiers?.includes('static');
      const monoParams = m.params.map(p => ({ ...p, typeAnn: p.typeAnn ? this.substType(p.typeAnn, subst) : p.typeAnn }));
      const monoReturnType = m.returnType ? this.resolveType(this.substType(m.returnType, subst)) : 'void';
      const monoBody = this.substNode(m.body, subst);

      const paramDecls = [];
      if (!isStatic) paramDecls.push(`${monoName} *self`);
      for (const p of monoParams) {
        if (p.name === 'this') continue;
        paramDecls.push(`${p.typeAnn ? this.resolveType(p.typeAnn) : 'void *'} ${p.name}`);
      }

      const bodyLines = this.emitFuncBody(m.name, monoBody, monoParams, monoReturnType, monoName);
      this.addTop(`static ${monoReturnType} ${monoName}_${m.name}(${paramDecls.join(', ')}) {`);
      for (const l of bodyLines) this.addTop('    ' + l);
      this.addTop('}');
      this.addTop('');
    }
  }

};
