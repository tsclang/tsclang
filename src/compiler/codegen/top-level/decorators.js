// decorators.js
export default {
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
};
