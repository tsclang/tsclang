import type { CodeGenThis } from '../../codegen.js';
import type { Stmt, Expression, Method, Decorator, Param, FuncDecl, TypeRef, TypeAnn, Block, ArrayLit, Arrow, FuncExpr } from '@tsclang/ast';

export type DecoratorFn = FuncDecl & { isDecorator?: boolean };
export type CodeGenMethod = Method & { returnTypeOverride?: string };

interface DeepSubstMarker {
  _deepSubstApply: true;
  stmt: Stmt;
}
type BeforeStmt = Stmt | DeepSubstMarker;

export interface ClassDecField { fieldDecl: string; fieldName: string; cType: string; }
export interface ClassDecInit { fieldName: string; cVal: string | boolean | number; }
export interface ClassDecAnalysis { fields: ClassDecField[]; inits: ClassDecInit[]; }

export interface DecoratorDescAnalysis {
  style: 'desc';
  befores: Expression[];
  afters: Expression[];
}
export interface DecoratorPropDescAnalysis {
  style: 'prop-desc';
  beforeStmts: BeforeStmt[];
  afterStmts: Stmt[];
  applyIsReturn: boolean;
  applyResultVar: string | null;
  applyArgs: ArrayLit['elems'] | null;
  allApplyDeep: boolean;
  capturedBindings: Map<string, Expression>;
  lambdaParams: Param[];
}
export interface DecoratorPassthroughAnalysis {
  style: 'passthrough';
}
export type DecoratorAnalysis = DecoratorDescAnalysis | DecoratorPropDescAnalysis | DecoratorPassthroughAnalysis;

export interface ThrowsCtx {
  resultType: string;
  throwsNames: string[];
  errKey: string;
  isVoid: boolean;
  origRetType: string;
}

// decorators.ts
export default {
  // ----------------------------------------------------------------
  // Decorator helpers
  // ----------------------------------------------------------------

  // Analyze a class decorator body and extract field mutations (target._field = value)
  _analyzeClassDecorator(this: CodeGenThis, decFn: DecoratorFn): ClassDecAnalysis {
    const fields: ClassDecField[] = [], inits: ClassDecInit[] = [];
    for (const stmt of (decFn.body?.body ?? [])) {
      if (stmt.kind !== 'ExprStmt') continue;
      const expr = stmt.expr;
      // target._field = value
      if (expr?.kind === 'Assign' && expr.left?.kind === 'Member') {
        const fieldName = expr.left.prop;
        const valNode = expr.right;
        // Resolve value: literal true/false/number/string
        let cVal: string | boolean | number | null = null, cType: string | null = null;
        if (valNode?.kind === 'Literal') {
          if (valNode.litType === 'bool') { cVal = valNode.value; cType = 'bool'; }
          else if (valNode.litType === 'number') { cVal = valNode.value; cType = 'int32_t'; }
        }
        if (cVal !== null && cType !== null) {
          fields.push({ fieldDecl: `${cType} ${fieldName};`, fieldName, cType });
          inits.push({ fieldName, cVal });
        }
      }
    }
    return { fields, inits };
  },

  // Deep-substitute orig.apply(...) calls with a replacement expression
  _deepSubstOrigApply(this: CodeGenThis, node: unknown, replacement: Expression, isVoid = false): unknown {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return (node as unknown[]).map((n) => this._deepSubstOrigApply(n, replacement, isVoid));
    const n = node as Record<string, unknown>;
    const nValue = n.value as Record<string, unknown> | undefined;
    const nExpr = n.expr as Record<string, unknown> | undefined;
    if (n.kind === 'Return' && nValue?.kind === 'Call' && (nValue.callee as Record<string, unknown>)?.prop === 'apply') {
      // return orig.apply(...) → for void: just call; for non-void: return result
      return isVoid ? { kind: 'ExprStmt', expr: replacement } : { kind: 'Return', value: replacement };
    }
    if (n.kind === 'ExprStmt' && nExpr?.kind === 'Call' && (nExpr.callee as Record<string, unknown>)?.prop === 'apply') {
      return { kind: 'ExprStmt', expr: replacement };
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      result[k] = (typeof v === 'object' && v !== null) ? this._deepSubstOrigApply(v, replacement, isVoid) : v;
    }
    return result;
  },

  // Recursively substitute Ident nodes in an AST
  _substituteInAst(this: CodeGenThis, node: unknown, bindings: Map<string, Expression>): unknown {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return (node as unknown[]).map((n) => this._substituteInAst(n, bindings));
    const n = node as Record<string, unknown>;
    if (n.kind === 'Ident' && bindings.has(n.name as string)) return bindings.get(n.name as string);
    if (n.kind === 'Binary' && n.op === '+') {
      const left  = this._substituteInAst(n.left,  bindings);
      const right = this._substituteInAst(n.right, bindings);
      const isStr = (t: Record<string, unknown>) => t.kind === 'Literal' && (t.litType === 'string' || t.litType === 'char');
      const lRec = left as Record<string, unknown>;
      const rRec = right as Record<string, unknown>;
      if (isStr(lRec) && isStr(rRec)) {
        return { kind: 'Literal', litType: 'string', value: (lRec.value as string) + (rRec.value as string) };
      }
      return { ...n, left, right };
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      result[k] = (typeof v === 'object' && v !== null) ? this._substituteInAst(v, bindings) : v;
    }
    return result;
  },

  // Check if a statement is `return orig.apply(this, ...)` or `orig.apply(this, ...)`
  // Check if orig.apply appears anywhere inside a stmt (for nested patterns like else branches)
  _hasOrigApplyDeep(this: CodeGenThis, node: unknown): boolean {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return (node as unknown[]).some((n) => this._hasOrigApplyDeep(n));
    const n = node as Record<string, unknown>;
    const callee = n.callee as Record<string, unknown> | undefined;
    if (n.kind === 'Call' && callee?.kind === 'Member' && callee?.prop === 'apply') return true;
    return Object.values(n).some((v) => v && typeof v === 'object' ? this._hasOrigApplyDeep(v) : false);
  },

  _isOrigApply(this: CodeGenThis, stmt: unknown): boolean {
    const s = stmt as Record<string, unknown>;
    const expr = s.kind === 'Return' ? s.value
      : s.kind === 'ExprStmt' ? s.expr
      : s.kind === 'VarDecl' ? s.init
      : null;
    if (!expr) return false;
    const e = expr as Record<string, unknown>;
    if (e.kind !== 'Call') return false;
    const callee = e.callee as Record<string, unknown> | undefined;
    return callee?.kind === 'Member' && callee?.prop === 'apply';
  },

  // Analyze a decorator function and extract wrapper info
  // Returns: { style, befores, afters } | { style, beforeStmts, afterStmts, applyIsReturn, paramBindings }
  _analyzeDecorator(this: CodeGenThis, decFn: DecoratorFn, factoryArgs: Expression[] | null = null): DecoratorAnalysis {
    // TSClang `decorator function` style
    if (decFn.isDecorator) {
      const befores: Expression[] = [], afters: Expression[] = [];
      for (const stmt of (decFn.body?.body ?? [])) {
        if (stmt.kind !== 'ExprStmt') continue;
        const c = stmt.expr;
        if (c?.kind !== 'Call') continue;
        const callee = c.callee;
        if (callee?.kind !== 'Member') continue;
        if (callee.prop === 'before' && c.args?.[0]) befores.push((c.args[0].expr ?? c.args[0]) as Expression);
        if (callee.prop === 'after'  && c.args?.[0]) afters.push((c.args[0].expr ?? c.args[0]) as Expression);
      }
      return { style: 'desc', befores, afters };
    }

    // Find the actual inner decorator body (handle factory pattern)
    let innerBody: Stmt[] = decFn.body?.body ?? [];
    let capturedBindings = new Map<string, Expression>();
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
    let wrapperBody: Stmt[] | null = null;
    let lambdaParams: Param[] = [];
    for (const stmt of innerBody) {
      if (stmt.kind !== 'ExprStmt') continue;
      const expr = stmt.expr;
      if (expr?.kind !== 'Assign') continue;
      if (expr.left?.kind !== 'Member' || expr.left.prop !== 'value') continue;
      const rhs = expr.right;
      if (rhs?.kind === 'FuncExpr' || rhs?.kind === 'Arrow') {
        wrapperBody = rhs.body?.kind === 'Block' ? rhs.body.body : ([rhs.body] as unknown as Stmt[]);
        lambdaParams = (rhs.params ?? []).filter((p) => p.name && p.name !== 'this');
        break;
      }
    }

    if (!wrapperBody) return { style: 'passthrough' };

    // Split at orig.apply(...)
    const beforeStmts: BeforeStmt[] = [], afterStmts: Stmt[] = [];
    let foundApply = false, applyIsReturn = false, applyResultVar: string | null = null;
    let applyArgs: ArrayLit['elems'] | null = null;
    let allApplyDeep = false;  // true when orig.apply only appears inside nested stmts
    for (const stmt of wrapperBody) {
      if (this._isOrigApply(stmt)) {
        foundApply = true;
        applyIsReturn = stmt.kind === 'Return';
        if (stmt.kind === 'VarDecl') applyResultVar = stmt.name;
        // Extract explicit args from orig.apply(this, [arg1, arg2, ...])
        const applyExpr = stmt.kind === 'Return' ? stmt.value : stmt.kind === 'ExprStmt' ? stmt.expr : stmt.kind === 'VarDecl' ? stmt.init : null;
        const argsArg = applyExpr?.kind === 'Call' ? applyExpr.args?.[1]?.expr : undefined;
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
  _extractLambdaBody(this: CodeGenThis, lambdaNode: Arrow | FuncExpr | null): Stmt[] {
    if (!lambdaNode) return [];
    const body = lambdaNode.body;
    if (!body) return [];
    if (body.kind === 'Block') return body.body ?? [];
    return [{ kind: 'ExprStmt', expr: body }];
  },

  // Build the C call to the inner function
  _buildInnerCall(this: CodeGenThis, className: string, methodName: string, m: Method, isStatic: boolean): string {
    const innerFnName = `${className}_${methodName}_inner`;
    const paramNames = (m.params ?? []).map((p) => p.name).filter(Boolean);
    if (isStatic) {
      return `${innerFnName}(${paramNames.join(', ')})`;
    }
    return `${innerFnName}(self${paramNames.length ? ', ' + paramNames.join(', ') : ''})`;
  },

  // Emit a decorated method: generates _inner + chain of wrappers
  _emitDecoratedMethod(this: CodeGenThis, className: string, m: Method, isStatic: boolean, explicitImplements: TypeRef[], decs: Decorator[]) {
    const mname = m.name as string;
    // Check if a MethodDesc decorator is applied to a standalone function (error case handled in standalone)
    // decs: [D_1 (outermost/leftmost), ..., D_n (innermost/rightmost)]

    // Emit the original body as _inner
    this.emitMethod(className, { ...m, name: mname + '_inner', decorators: [] }, isStatic, explicitImplements);

    let prevMethodName = mname + '_inner';

    // Apply decorators from innermost (rightmost) to outermost (leftmost)
    for (let i = decs.length - 1; i >= 0; i--) {
      const d = decs[i];
      const isOuter = i === 0;
      const wrapperMethodName = isOuter ? mname : mname + '_' + d.name;

      // Resolve factory args from decorator call args
      const decFn = this._decoratorFns.get(d.name) as DecoratorFn | undefined;
      const factoryArgs = d.args ? d.args.map((a) => a) : null;
      const analysis = this._analyzeDecorator(decFn!, factoryArgs);

      this._emitDecoratorWrapperFn(className, m, isStatic, wrapperMethodName, prevMethodName, analysis, d, i, decs.length);
      prevMethodName = wrapperMethodName;
    }
    // Register the public method name in class metadata so call sites resolve correctly
    const cls = this.classes.get(className);
    if (cls) {
      if (!cls._methodNames) cls._methodNames = new Map();
      const nameMangled = `${className}_${mname}`;
      cls._methodNames.set(mname, { isStatic, nameMangled, isMut: false, isExplicitMut: false, isMoveMethod: false, isIfaceMethod: false });
    }
  },

  // Emit a single wrapper function
  _emitDecoratorWrapperFn(this: CodeGenThis, className: string, m: Method, isStatic: boolean, wrapperName: string, innerName: string, analysis: DecoratorAnalysis, d: Decorator, decIdx: number, totalDecs: number) {
    const retType = m.returnType ? this.resolveType(m.returnType) : 'void';
    const isVoid = retType === 'void';
    const innerFnName = `${className}_${innerName}`;

    // For prop-desc style, use the lambda's params (may differ in name from m.params).
    // Exception: rest params (...args: any[]) mean the lambda captures all args generically —
    // fall back to original method params in that case.
    const lambdaParams = analysis.style === 'prop-desc' ? analysis.lambdaParams : [];
    const _hasRestLambdaParam = lambdaParams.some((p) => p.rest);
    const wrapperParamList: Param[] = (analysis.style === 'prop-desc' && lambdaParams.length > 0 && !_hasRestLambdaParam)
      ? lambdaParams
      : (m.params ?? []);
    const paramNames = wrapperParamList.map((p) => p.name).filter(Boolean);
    const paramCTypes = wrapperParamList.map((p) => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return `${ct} ${p.name}`;
    });

    let selfParam: string, innerCall: string;
    if (isStatic) {
      selfParam = '';
      innerCall = `${innerFnName}(${paramNames.join(', ')})`;
    } else {
      selfParam = `const ${className} *self`;
      innerCall = `${innerFnName}(self${paramNames.length ? ', ' + paramNames.join(', ') : ''})`;
    }

    const allParams = [selfParam, ...paramCTypes].filter(Boolean).join(', ');
    const wrapperFnName = `${className}_${wrapperName}`;

    const lines: string[] = [];
    const I = '    ';

    if (analysis.style === 'desc') {
      // TSClang decorator function style: desc.before/after
      const beforeBody = analysis.befores.flatMap((l: Expression) => this._extractLambdaBody(l));
      const afterBody  = analysis.afters.flatMap((l: Expression) => this._extractLambdaBody(l));

      // Emit before stmts
      const beforeLines: string[] = [], afterLines: string[] = [];
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
      const bindings = new Map<string, Expression>();
      // Find `method` parameter (2nd param of decorator = method name)
      const decFn = this._decoratorFns.get(d.name) as DecoratorFn | undefined;
      const methodParamName = decFn?.params?.[1]?.name;
      if (methodParamName) {
        bindings.set(methodParamName, { kind: 'Literal', litType: 'string', value: m.name as string });
      }
      for (const [k, v] of analysis.capturedBindings) bindings.set(k, v);

      // Transform before/after stmts with substitution
      // When applyResultVar is set (const r = orig.apply(...)), bind r → _r in after stmts
      if (analysis.applyResultVar && !isVoid) {
        bindings.set(analysis.applyResultVar, { kind: 'Ident', name: '_r' });
      }
      // Build the actual inner call, using explicit args from orig.apply if provided
      if (analysis.applyArgs && analysis.applyArgs.length > 0) {
        const tmpLines2: string[] = [];
        this.pushScope();
        if (!isStatic) this.define('self', { ctype: `${className} *`, varKind: 'const' });
        // Use lambda params in scope so type inference works for substituted args
        for (const p of wrapperParamList) {
          if (p.name) this.define(p.name, { ctype: p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t', varKind: 'let' });
        }
        const argsC = analysis.applyArgs.map((a) => {
          const subA = this._substituteInAst(a.expr ?? a, bindings);
          return this.exprToC(subA, tmpLines2, 1);
        });
        this.popScope();
        const selfPart = isStatic ? '' : 'self';
        const parts = [selfPart, ...argsC].filter(Boolean);
        innerCall = `${innerFnName}(${parts.join(', ')})`;
      }

      // Build the replacement AST node for deep-substitution (orig.apply in nested branches)
      const innerCallExpr: Expression = { kind: 'RawC', code: innerCall };

      const subBefore = analysis.beforeStmts.map((s: BeforeStmt) => {
        if (typeof s === 'object' && '_deepSubstApply' in s) {
          // Nested orig.apply: deep-replace it with the inner call
          const subStmt = this._substituteInAst(s.stmt, bindings);
          return this._deepSubstOrigApply(subStmt, innerCallExpr, isVoid);
        }
        return this._substituteInAst(s, bindings);
      });
      // Filter afterStmts: if void and applyResultVar, drop `return <resultVar>` stmts
      let afterFiltered: Stmt[] = analysis.afterStmts;
      if (isVoid && analysis.applyResultVar) {
        afterFiltered = analysis.afterStmts.filter((s) =>
          !(s.kind === 'Return' && s.value?.kind === 'Ident' && s.value.name === analysis.applyResultVar)
        );
      }
      const subAfter = afterFiltered.map((s) => this._substituteInAst(s, bindings));

      const beforeLines: string[] = [], afterLines: string[] = [];
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
  _emitDecoratedStandaloneFunc(this: CodeGenThis, node: FuncDecl, decs: Decorator[]) {
    const { name, params, returnType, body } = node;
    const retType = returnType ? this.resolveType(returnType) : 'void';

    // Check if all decorators are MethodDesc-only (cannot apply to standalone functions)
    for (const d of decs) {
      const decFn = this._decoratorFns.get(d.name) as DecoratorFn | undefined;
      if (!decFn) continue;
      if (decFn.isDecorator) {
        // Check param type: MethodDesc → error
        const descParam = decFn.params?.[0];
        const descTypeAnn = descParam?.typeAnn;
        const descTypeName = descTypeAnn?.kind === 'TypeRef' ? descTypeAnn.name : undefined;
        if (descTypeName === 'MethodDesc') {
          throw this.error(`"${d.name}" is a method decorator and cannot be applied to a standalone function`, node);
        }
      }
    }

    // Mangle the function suffix from param types
    const paramSuffix = params.map((p) => {
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
      const decFn = this._decoratorFns.get(d.name) as DecoratorFn | undefined;
      const factoryArgs = d.args ? d.args.map((a) => a) : null;
      const analysis = this._analyzeDecorator(decFn!, factoryArgs);

      const isVoid = retType === 'void';
      const paramCDecls = params.map((p) => {
        const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
        return `${ct} ${p.name}`;
      });
      const paramNms = params.map((p) => p.name);
      const innerCall = `${prevName}(${paramNms.join(', ')})`;

      const lines: string[] = [];
      const I = '    ';
      if (analysis.style === 'desc') {
        const beforeBody = analysis.befores.flatMap((l: Expression) => this._extractLambdaBody(l));
        const afterBody  = analysis.afters.flatMap((l: Expression) => this._extractLambdaBody(l));
        const beforeLines: string[] = [], afterLines: string[] = [];
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

  emitMethod(this: CodeGenThis, className: string, m: CodeGenMethod, isStatic: boolean, explicitImplements: TypeRef[] = []) {
    if (!m.body) return; // abstract / overload

    // Error: static methods cannot be mut
    if (isStatic && m.modifiers?.includes('mut')) {
      throw this.error(`"static" methods cannot be "mut"`);
    }
    if (isStatic && m.modifiers?.includes('move')) {
      throw this.error(`"static" methods cannot be "move"`);
    }

    // Methods are NOT mangled by param types (class prefix already disambiguates)
    let retType = m.returnTypeOverride ?? (m.returnType ? this.resolveType(m.returnType) : 'void');
    const nameMangled = `${className}_${m.name}`;

    const isMut = m.modifiers?.includes('mut');
    // Move-method: returns the class itself by value → self passed by value
    const isMoveMethod = !isStatic && m.name !== 'new' && retType === className;

    // Interface-implements style: method takes (void *_self) for explicit implements
    const isIfaceMethod = !isStatic && m.name !== 'new' && explicitImplements.length > 0;

    // Emit body first so we can inspect it for self-mutation

    // Build throwsCtx for throws methods
    const throwsTypes = m.throwsTypes ?? [];
    let throwsCtx: ThrowsCtx | null = null;
    if (throwsTypes.length > 0) {
      const throwsNames = (() => {
        const names: string[] = [];
        for (const t of throwsTypes) {
          if (t.kind === 'TypeRef') names.push(t.name === 'Error' ? 'TscError' : t.name);
          else if (t.kind === 'TypeUnion') {
            for (const inner of t.types) { if (inner.kind === 'TypeRef') names.push(inner.name === 'Error' ? 'TscError' : inner.name); }
          }
        }
        return names;
      })();
      const errKey = throwsNames.join('_');
      const isVoid = retType === 'void';
      const retIdent = this.cTypeToIdent(retType);
      const resultType = `Result_${retIdent}_${errKey}`;

      // Emit union error types on first encounter of errKey
      if (!this._emittedResultErrKeys.has(errKey)) {
        this._emittedResultErrKeys.add(errKey);
        if (throwsNames.length > 1) {
          const tagEntries = throwsNames.map((n: string, i: number) => `_Err_${n} = ${i}`).join(', ');
          this.addTop(`typedef enum { ${tagEntries} } _ErrTag_${errKey};`);
          this.addTop(`typedef struct {`);
          this.addTop(`    _ErrTag_${errKey} tag;`);
          this.addTop(`    union { ${throwsNames.map((n: string, i: number) => `${n} _${i};`).join(' ')} };`);
          this.addTop(`} _ErrUnion_${errKey};`);
          this.typedefs.push('');
        }
      }
      // Emit Result type
      if (!this._emittedResultTypes.has(resultType)) {
        this._emittedResultTypes.add(resultType);
        const valPart = isVoid ? 'int _dummy' : `${retType} value`;
        if (throwsNames.length > 1) {
          this.addTop(`typedef struct {`);
          this.addTop(`    bool ok;`);
          this.addTop(`    union { ${valPart}; _ErrUnion_${errKey} error; };`);
          this.addTop(`} ${resultType};`);
        } else {
          this.addTop(`typedef struct { bool ok; union { ${valPart}; ${throwsNames[0]} error; }; } ${resultType};`);
        }
      }

      throwsCtx = { resultType, throwsNames, errKey, isVoid, origRetType: retType };
      retType = resultType;
    }

    // Emit body first so we can inspect it for self-mutation
    const lines: string[] = this.emitFuncBody(m.name, m.body, m.params, retType, className, isMoveMethod, isMut, throwsCtx);

    // Determine whether method mutates self
    const mutatesself = isMut || lines.some((l: string) =>
      /self->[\w]+ *[+\-*\/|&^%]?=(?!=)/.test(l) ||
      /self->[\w]+\+\+/.test(l) ||
      /self->[\w]+--/.test(l)
    );

    const params: string[] = [];
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
    let finalLines: string[] = lines;
    if (isIfaceMethod) {
      finalLines = [`${className} *self = (${className} *)_self;`, `(void)self;`, ...lines];
    } else if (!isStatic && m.name !== 'new' && !lines.some((l: string) => /\bself\b/.test(l))) {
      finalLines = ['(void)self;', ...lines];
    }

    // Register method in class so call sites can resolve it
    const cls = this.classes.get(className);
    if (cls) {
      if (!cls._methodNames) cls._methodNames = new Map();
      cls._methodNames.set(m.name as string, { isStatic, nameMangled, isMut: mutatesself, isExplicitMut: isMut, isMoveMethod, isIfaceMethod, ...(throwsCtx ? { _isThrowsFunc: true, _resultType: throwsCtx.resultType, _resultIsVoid: throwsCtx.isVoid, _resultValueType: throwsCtx.origRetType, _resultErrKey: throwsCtx.errKey, _resultErrTypes: throwsCtx.throwsNames } : {}) });
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
