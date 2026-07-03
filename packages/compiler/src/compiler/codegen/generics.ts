import type { CodeGenContext, ClassMetaField } from '../codegen.js';
import { mangleParams } from '../types.js';
import type { Expression, TypeAnn, TypeRef, Argument, ObjLit, ObjLitProp, FuncDecl, ClassDecl, Param, ClassMember, Method, Field, Block } from '@tsclang/ast';
// generics.ts

export interface MonoClassResult {
    monoName: string;
    subst: Map<string, string>;
    tmpl: ClassDecl;
}

export function computeMonoName(ctx: CodeGenContext, name: string, typeArgs: TypeAnn[]): MonoClassResult | null {
    const tmpl = ctx._genericClasses.get(name);
    if (!tmpl) return null;
    const subst = new Map<string, string>();
    const typeParams = tmpl.typeParams ?? [];
    for (let i = 0; i < typeParams.length; i++) {
        const ct = typeArgs[i] ? ctx.resolveType(typeArgs[i]) : 'int32_t';
        subst.set(typeParams[i], ct);
    }
    const suffix = typeParams.map((tp: string) => ctx.cTypeToIdent(subst.get(tp) ?? 'void')).join('_');
    const monoName = `${name}_${suffix}`;
    return { monoName, subst, tmpl };
}

export function ensureMonoClass(ctx: CodeGenContext, name: string, typeArgs: TypeAnn[]): string {
    const result = computeMonoName(ctx, name, typeArgs);
    if (!result) return name;
    if (!ctx._emittedGenericClasses.has(result.monoName)) {
        ctx._emittedGenericClasses.add(result.monoName);
        ctx.emitMonoClass(result.tmpl, result.monoName, result.subst);
    }
    return result.monoName;
}
export function callGeneric(ctx: CodeGenContext, name: string, typeArgs: TypeAnn[], args: Argument[], lines: string[], depth: number) {
    const tmpl = ctx._genericFuncs.get(name);
    if (!tmpl) return `${name}(${ctx.argsToC(args, lines, depth)})`;

    // Check for ambiguous overload (non-generic version exists in scope)
    const existing = ctx.lookup(name);
    if (existing?.funcName) {
      throw ctx.error(`ambiguous call: both generic and non-generic overload match`);
    }

    // Build substitution map: T → concrete C type
    const subst = new Map<string, string>();
    const typeParams = tmpl.typeParams ?? [];
    for (let i = 0; i < typeParams.length; i++) {
      const tp = typeParams[i];
      let ctype;
      if (typeArgs[i]) {
        ctype = ctx.resolveType(typeArgs[i]);
      } else if (args[i]) {
        // For ObjLit args, create an anon struct so T has concrete fields
        const expr = args[i].expr;
        if (expr?.kind === 'ObjLit') {
          ctype = ctx.inferObjLitType(expr);
        } else {
          ctype = ctx.inferType(args[i].expr);
        }
      } else {
        ctype = 'int32_t';
      }
      subst.set(tp.name, ctype);
    }

    // Handle structural constraint: T implements { ... } → use anonymous struct
    for (const tp of typeParams) {
      if (tp.constraint?.kind === 'TypeObject' && !typeArgs[typeParams.indexOf(tp)]) {
        if (args[0]) {
          const argType = args[0].expr?.kind === 'ObjLit'
            ? ctx.inferObjLitType(args[0].expr)
            : ctx.inferType(args[0].expr);
          subst.set(tp.name, argType);
        }
      }
    }

    // Compute suffix from resolved monomorphized parameter types (more accurate for utility types)
    const nonThisParams = tmpl.params.filter((p: Param) => p.name !== 'this' && p.name !== 'self' && p.typeAnn);
    const suffix = nonThisParams.length > 0
      ? nonThisParams.map((p: Param) => ctx.cTypeToIdent(ctx.resolveType(ctx.substType(p.typeAnn!, subst)))).join('_')
      : typeParams.map((tp) => ctx.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
    const monoName = `${name}_${suffix}`;

    // Emit monomorphized function if not already done

    if (!ctx._emittedGenerics.has(monoName)) {
      ctx._emittedGenerics.add(monoName);
      ctx.emitMonoFunc(tmpl, monoName, subst);
    }

    // Generate call args, casting ObjLit args to expected param struct types
    const resolvedParamTypes = nonThisParams.map((p: Param) =>
      ctx.resolveType(ctx.substType(p.typeAnn!, subst)));
    const argsC = args.map((a: Argument, i: number) => {
      const expectedType = resolvedParamTypes[i];
      if (a.expr?.kind === 'ObjLit' && expectedType) {
        const structDef = ctx.classes.get(expectedType);
        if (structDef?.fields) {
          const fieldNames = structDef.fields.map((f) => f.name ?? '');
          const filteredProps = (a.expr as ObjLit).props.filter((p: ObjLitProp) => !p.spread && !p.computed && fieldNames.includes(String(p.key)));
          const propsC = filteredProps.map((p: ObjLitProp) => `.${p.key} = ${ctx.exprToC(p.value!, lines, depth)}`).join(', ');
          return `(${expectedType}){${propsC}}`;
        }
      }
      return ctx.exprToC(a.expr, lines, depth);
    }).join(', ');
    return `${monoName}(${argsC})`;
}

  // Create a virtual anonymous struct for field lookup (not emitted to C output)
  // Used internally by callGeneric to resolve utility types like Pick<T, K>
export function inferObjLitType(ctx: CodeGenContext, node: ObjLit) {
    const fields = node.props
      .filter((p: ObjLitProp) => !p.spread && !p.computed)
      .map((p: ObjLitProp) => ({ name: String(p.key), ctype: ctx.inferType(p.value!) }));
    const sig = fields.map((f: { name: string; ctype: string }) => `${f.ctype} ${f.name}`).join(';');

    if (ctx._anonStructSigs.has(sig)) return ctx._anonStructSigs.get(sig)!;

    const anonName = `_anon_${ctx._anonStructCount++}`;
    const structFields = fields.map((f: { name: string; ctype: string }) => ({
      name: f.name,
      typeAnn: { kind: 'TypeRef' as const, name: f.ctype, typeArgs: [] as TypeAnn[], _internal: true },
    }));
    // Register in classes for field lookup but do NOT emit typedef (only used internally)
    ctx.classes.set(anonName, { isStruct: true, fields: structFields, _virtual: true });
    ctx._anonStructSigs.set(sig, anonName);
    return anonName;
}

  // Substitute type params in a type annotation
export function substType(ctx: CodeGenContext, typeNode: TypeAnn | null | undefined, subst: Map<string, string>): TypeAnn | null | undefined {
    if (!typeNode) return typeNode;
    if (typeNode.kind === 'TypeRef') {
      if (subst.has(typeNode.name)) {
        const ct = subst.get(typeNode.name)!;
        return { kind: 'TypeRef', name: ct, typeArgs: [], _internal: true } as TypeRef;
      }
      return { ...typeNode, typeArgs: typeNode.typeArgs.map((t: TypeAnn) => ctx.substType(t, subst) as TypeAnn) };
    }
    if (typeNode.kind === 'TypeArray') return { ...typeNode, element: ctx.substType(typeNode.element, subst) as TypeAnn };
    if (typeNode.kind === 'TypeUnion') return { ...typeNode, types: typeNode.types.map((t: TypeAnn) => ctx.substType(t, subst) as TypeAnn) };
    return typeNode;
}

  // Substitute type params in an AST node
export function substNode(ctx: CodeGenContext, node: unknown, subst: Map<string, string>): unknown {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return (node as unknown[]).map((n) => ctx.substNode(n, subst));
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'typeAnn' || k === 'returnType' || k === 'castType') {
        result[k] = ctx.substType(v as TypeAnn, subst);
      } else if (k === 'typeArgs') {
        result[k] = Array.isArray(v) ? (v as TypeAnn[]).map((t) => ctx.substType(t, subst)) : v;
      } else {
        result[k] = ctx.substNode(v, subst);
      }
    }
    return result;
}

export function emitMonoFunc(ctx: CodeGenContext, tmpl: FuncDecl, monoName: string, subst: Map<string, string>) {
    // Create a copy of the function with substituted type params
    const monoParams = tmpl.params.map((p: Param) => ({
      ...p,
      typeAnn: p.typeAnn ? ctx.substType(p.typeAnn, subst) : p.typeAnn,
    }));
    const monoReturnType = tmpl.returnType ? ctx.substType(tmpl.returnType, subst) : null;
    const monoBody = ctx.substNode(tmpl.body, subst);

    const monoNode: FuncDecl = {
      kind: 'FuncDecl',
      name: monoName,
      _monoName: monoName,
      params: monoParams,
      returnType: monoReturnType,
      body: monoBody as Block | null,
      generator: tmpl.generator,
      decorators: tmpl.decorators,
      typeParams: [],
    } as FuncDecl;
    ctx.visitFuncDecl(monoNode, true);
}

export function emitMonoClass(ctx: CodeGenContext, tmpl: ClassDecl, monoName: string, subst: Map<string, string>) {
    const fields  = tmpl.members.filter((m: ClassMember): m is Field => m.kind === 'Field');
    const methods = tmpl.members.filter((m: ClassMember): m is Method => m.kind === 'Method');

    // Register class so method dispatch works
    ctx.classes.set(monoName, {
      fields: fields.map((f: Field) => ({ ...f, typeAnn: f.typeAnn ? ctx.substType(f.typeAnn, subst) : f.typeAnn })) as unknown as ClassMetaField[],
      methods: methods.map((m: Method) => ({
        ...m,
        returnType: m.returnType ? ctx.substType(m.returnType, subst) : m.returnType,
        params: m.params.map((p: Param) => ({
          ...p,
          typeAnn: p.typeAnn ? ctx.substType(p.typeAnn, subst) : p.typeAnn,
        })),
      })),
      isStruct: false,
    });

    // Single-line typedef struct
    const fieldDecls = fields.map((f: Field) => {
      const ct = ctx.resolveType(ctx.substType(f.typeAnn ?? { kind: 'TypeRef', name: 'int32_t', typeArgs: [] }, subst));
      return `${ct} ${f.name};`;
    }).join(' ');
    ctx.addTop(`typedef struct { ${fieldDecls} } ${monoName};`);
    ctx.addTop('');

    // Constructor
    const ctor = methods.find((m: Method) => m.name === 'constructor');
    if (ctor) {
      const ctorParams = ctor.params
        .filter((p: Param) => p.name !== 'this')
        .map((p: Param) => ({ ...p, typeAnn: p.typeAnn ? ctx.substType(p.typeAnn, subst) : p.typeAnn }));
      const paramDecls = ctorParams
        .map((p: Param) => `${p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *'} ${p.name}`)
        .join(', ');
      const monoBody = ctx.substNode(ctor.body, subst);
      const bodyLines = ctx.emitFuncBody('new', monoBody as Block | null, ctorParams, monoName, monoName);
      ctx.addTop(`static ${monoName} ${monoName}_new(${paramDecls}) {`);
      for (const l of bodyLines) ctx.addTop('    ' + l);
      ctx.addTop('}');
      ctx.addTop('');
    }

    // Instance / static methods
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      const isStatic = m.modifiers?.includes('static');
      const monoParams = m.params.map((p: Param) => ({ ...p, typeAnn: p.typeAnn ? ctx.substType(p.typeAnn, subst) : p.typeAnn }));
      const monoReturnType = m.returnType ? ctx.resolveType(ctx.substType(m.returnType, subst)) : 'void';
      const monoBody = ctx.substNode(m.body, subst);

      const paramDecls: string[] = [];
      if (!isStatic) paramDecls.push(`${monoName} *self`);
      for (const p of monoParams) {
        if (p.name === 'this') continue;
        paramDecls.push(`${p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *'} ${p.name}`);
      }

      const bodyLines = ctx.emitFuncBody(m.name as string, monoBody as Block | null, monoParams, monoReturnType, monoName);
      ctx.addTop(`static ${monoReturnType} ${monoName}_${m.name}(${paramDecls.join(', ')}) {`);
      for (const l of bodyLines) ctx.addTop('    ' + l);
      ctx.addTop('}');
      ctx.addTop('');
    }
}

