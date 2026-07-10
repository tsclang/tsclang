import type { CodeGenContext } from '../../codegen.js';
import type { New, Argument, TypeAnn, Arrow, FuncExpr, Expression, Param } from '@tsclang/ast';

interface RtCtorMethod { name: string; }
interface RtClassField { name?: string; modifiers?: string[]; init?: Expression; decorators?: { name: string }[]; }
interface RtTypeParam { name: string; }

// new-expr.ts
export function newToC(ctx: CodeGenContext, node: New, lines: string[], depth: number): string {
    const { name, args } = node;
    for (const a of args ?? []) ctx._checkNoBareThrows(a.expr ?? a);
    const argsC = ctx.argsToC(args, lines, depth);

    // new Error("msg") → (TscError){ .message = STR_LIT("msg") }
    if (name === 'Error') {
      const msgArg = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `(TscError){ .message = ${msgArg} }`;
    }

    // new Map<K,V>() → tsc_map_create_K_V()
    if (name === 'Map') {
      if (ctx._strictRules?.has('no-dynamic-alloc')) {
        throw ctx.error(`dynamic allocation is forbidden in strict mode (no-dynamic-alloc); Map requires heap allocation`, node);
      }
      if (ctx._allocatorName === 'static' && !args[0]) {
        const [kt2, vt2] = (node.typeArgs ?? []).map((t: TypeAnn) => ctx.resolveType(t));
        const k2 = kt2 ? ctx.ctypeToTsName(kt2) : 'string';
        const v2 = vt2 ? ctx.ctypeToTsName(vt2) : 'i32';
        throw ctx.error(`TypeError: 'new Map<${k2}, ${v2}>()' requires a capacity argument when allocator is "static"; use 'new Map<${k2}, ${v2}>(N)'`);
      }
      const [kt, vt] = (node.typeArgs ?? []).map((t: TypeAnn) => ctx.resolveType(t));
      const k = kt ? ctx.cTypeToIdent(kt) : 'string';
      const v = vt ? ctx.cTypeToIdent(vt) : 'i32';
      const suffix = `${k}_${v}`;
      // Emit Map_K_V struct only when the target type is Map_* (not TscMap_* from runtime.h)
      if (!ctx._expectedType?.startsWith('TscMap_')) {
        ctx._ensureMapStruct(suffix);
      }
      return `tsc_map_create_${k}_${v}()`;
    }

    // new Array<T>(N) or new Array(N) — heap-allocated array
    if (name === 'Array') {
      if (ctx._strictRules?.has('no-dynamic-alloc') && args[0]) {
        const argLit = args[0].expr?.kind === 'Literal' && args[0].expr.litType === 'number';
        if (!argLit) {
          throw ctx.error(`dynamic allocation is forbidden in strict mode (no-dynamic-alloc); use fixed-size array or compile-time constant`, node);
        }
      }
      if (ctx._allocatorName === 'static' && !args[0]) {
        const et2 = node.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'int32_t';
        const tsName = ctx.ctypeToTsName(et2);
        throw ctx.error(`TypeError: 'new Array<${tsName}>()' requires a capacity argument when allocator is "static"; use 'new Array<${tsName}>(N)'`);
      }
      // Determine element type from type args or annotation context
      let et = 'int32_t';
      if (node.typeArgs?.[0]) et = ctx.resolveType(node.typeArgs[0]);
      else if (ctx._newArrayElemHint) et = ctx._newArrayElemHint;
      const elemIdent = ctx.cTypeToIdent(et);
      const arrName = `Array_${elemIdent}`;
      ctx._ensureArrayStruct(arrName, et);
      ctx._ensureArrayCreateMacro(elemIdent, arrName, et);
      const capArg = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_array_create_${elemIdent}(${capArg})`;
    }

    // new Arc<T>()
    if (name === 'Arc') {
      if (ctx._allocatorName === 'static') {
        const t2 = node.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'void';
        const tsName = ctx.ctypeToTsName(t2);
        throw ctx.error(`TypeError: 'new Arc<${tsName}>()' requires heap allocation (ARC), which is unavailable when allocator is "${ctx._allocatorName}"`);
      }
      const t = node.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'void';
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
          return `tsc_date_from_ms(tsc_date_parse_iso(${ctx.exprToC(arg0, lines, depth)}))`;
        }
        const msC = ctx.exprToC(arg0, lines, depth);
        return `tsc_date_from_ms((int64_t)(${msC}))`;
      }
      // new Date(year, month, day[, h, m, s, ms])
      const a = args.map((a: Argument) => ctx.exprToC(a.expr ?? a, lines, depth));
      return `tsc_date_from_ymd(${a[0]}, ${a[1]}, ${a[2] ?? 1}, ${a[3] ?? 0}, ${a[4] ?? 0}, ${a[5] ?? 0}, ${a[6] ?? 0})`;
    }

    // new Readonly(val) → transparent: just return the value
    if (name === 'Readonly') {
      return args[0] ? ctx.exprToC(args[0].expr ?? args[0], lines, depth) : '{0}';
    }

    // new Atomic<T>(val)
    if (name === 'Atomic') {
      const t = node.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'int32_t';
      return `{.value = ${argsC || '0'}}`;
    }

    // new Channel<T>(cap)
    if (name === 'Channel') {
      const t = node.typeArgs?.[0] ? ctx.cTypeToIdent(ctx.resolveType(node.typeArgs[0])) : 'i32';
      return `{ ._inner = tsc_channel_create_${t}(${argsC}) }`;
    }

    // new Signal<T>(val)
    if (name === 'Signal') {
      const t = node.typeArgs?.[0] ? ctx.cTypeToIdent(ctx.resolveType(node.typeArgs[0])) : 'i32';
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
      throw ctx.errorCode('E120', node, { detail: 'Promise requires a type argument: new Promise<T>(executor)' });
    }

    // new URL(...)
    if (name === 'URL') {
      if (args.length === 1) return `tsc_url_parse(${argsC})`;
      if (args.length === 2) return `tsc_url_parse_relative(${argsC.split(', ')[0]}, &${argsC.split(', ')[1]})`;
    }

    // Generic class instantiation: new Box<i32>(42) → Box_i32_new(42)
    if (ctx._genericClasses?.has(name)) {
      const typeArgs = node.typeArgs ?? [];
      const monoName = ctx.ensureMonoClass(name, typeArgs);
      return `${monoName}_new(${argsC})`;
    }

    // Known class with constructor
    const cls = ctx.classes.get(name);
    if (cls) {
      const cname = cls._cname ?? name;
      // Heap class: new HeapClass() → malloc + constructor (auto-free on scope exit)
      if (cls._isHeap) {
        ctx._lastSuppressConst = true;
        const tmpName = `_heap_${ctx.tempCount++}`;
        ctx.includes.add('#include <stdlib.h>');
        lines.push(`${cname} *${tmpName} = (${cname} *)tsc_malloc(sizeof(${cname}));`);
        const hasCtor = cls.methods?.some((m) => m.name === 'constructor');
        if (hasCtor) {
          const ctorArgs = node.args.map((a: Argument) => ctx.exprToC(a.expr ?? a, lines, depth)).join(', ');
          lines.push(`*${tmpName} = ${cname}_new(${ctorArgs});`);
        } else {
          lines.push(`*${tmpName} = (${cname}){0};`);
        }
        return tmpName;
      }
      // Pool class: new PoolClass() → alloc from pool + null check
      if (cls._isPool) {
        ctx._ensurePoolAlloc(cname);
        ctx._lastSuppressConst = true;
        const allocResult = `${cname}_alloc()`;
        const tmpName = `_pool_${ctx.tempCount++}`;
        lines.push(`${cls._poolOptType} ${tmpName} = ${allocResult};`);
        if (!ctx._throwsCtx && !ctx._inTryBlock) {
          throw ctx.error(`pool allocation via "new ${name}()" may fail; wrap in try/catch or declare function as "throws Error"`, node);
        }
        lines.push(`if (!${tmpName}.has_value) {`);
        const errC = `(TscError){ .message = STR_LIT("pool exhausted: ${name}") }`;
        if (ctx._usesGotoCleanup) {
          lines.push(`    _result = (${ctx._throwsCtx!.resultType}){.ok = false, .error = ${errC}};`);
          lines.push(`    goto cleanup;`);
        } else if (ctx._throwsCtx) {
          lines.push(`    return (${ctx._throwsCtx.resultType}){.ok = false, .error = ${errC}};`);
        } else if (ctx._inTryBlock) {
          lines.push(`    ${ctx._tryCatchInfo!.errVar} = ${errC};`);
          lines.push(`    goto ${ctx._tryCatchInfo!.catchLabel};`);
        } else {
          lines.push(`    ${errC};`);
          lines.push(`    abort();`);
        }
        lines.push(`}`);
        const hasCtor = cls.methods?.some((m) => m.name === 'constructor');
        if (hasCtor && node.args?.length > 0) {
          const argsC = node.args.map((a: Argument) => ctx.exprToC(a.expr ?? a, lines, depth)).join(', ');
          lines.push(`*${tmpName}.value = ${cname}_new(${argsC});`);
        }
        return tmpName;
      }
      const hasCtor = cls.methods?.some((m) => m.name === 'constructor');
      // Suppress const for class instances unless ALL fields are readonly
      const allReadonly = (cls.fields?.length ?? 0) > 0 &&
        cls.fields?.every((f) => f.modifiers?.includes('readonly'));
      if (!allReadonly) ctx._lastSuppressConst = true;
      if (hasCtor) return `${cname}_new(${argsC})`;
      // Throws classes have a synthesized _new(String msg) function
      if (cls._isThrowsClass) return `${cname}_new(${argsC})`;
      // Class decorator inits: flag for injection after VarDecl emit
      if (cls._decoratorInits?.length) ctx._pendingDecoratorInits = cls._decoratorInits;
      // @readonly fields with initializers → designated initializer syntax
      const readonlyInits = (cls.fields ?? []).filter((f: RtClassField) =>
        f.init && (f.decorators ?? []).some((d: { name: string }) => d.name === 'readonly')
      );
      if (readonlyInits.length > 0) {
        const parts = readonlyInits.map((f: RtClassField) => `.${f.name} = ${ctx.exprToC(f.init!, lines, depth)}`);
        return `{ ${parts.join(', ')} }`;
      }
      // In return context, compound literal syntax is required; in declarations, {0} works too
      return ctx._inReturnContext ? `(${cname}){0}` : `{0}`;
    }

    // Unknown: zero-init struct
    ctx._lastSuppressConst = true;
    return `(${name}){0}`;
}

  // ----------------------------------------------------------------
  // Arrow function hoisting
  // ----------------------------------------------------------------
export function hoistArrow(ctx: CodeGenContext, node: Arrow | FuncExpr, retType: string | null | undefined, hint?: unknown) {
    const n = ctx.lambdaCount++;
    // Determine return type from body
    let ret = retType === 'void' ? ctx.inferArrowReturn(node) : retType;
    // Name uses the mangled return type (e.g. _lambda_0_i32)
    const retSuffix = ctx.cTypeToIdent(ret ?? 'void');
    const _pfx = ctx._modulePrefix ?? '';
    const name = `${_pfx}_lambda_${n}_${retSuffix}`;
    const paramStrs = (node.params ?? []).map((p: Param, i: number) => {
      const hinted = ctx._lambdaParamHint?.[i];
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : (hinted ?? 'void *');
      return ct === 'String *' ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });
    if (ctx._lambdaParamHint) {
      for (let i = (node.params?.length ?? 0); i < ctx._lambdaParamHint.length; i++) {
        const ct = ctx._lambdaParamHint[i];
        paramStrs.push(ct === 'String *' ? `${ct} _unused_${i}` : `${ct} _unused_${i}`);
      }
    }
    const lines: string[] = [];
    ctx.pushScope();
    ctx._inHoistedLambda = true;
    for (let i = 0; i < (node.params ?? []).length; i++) {
      const p = node.params[i];
      const hinted = ctx._lambdaParamHint?.[i];
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : (hinted ?? 'void *');
      const symInfo: Record<string, unknown> = { ctype: ct, varKind: 'const' };
      if (ct === 'String *') {
        symInfo.isPointer = true;
        symInfo.isRefParam = true;
        symInfo.derefType = 'String';
      }
      ctx.define(p.name, symInfo);
    }
    if (node.body.kind === 'Block') {
      ctx.visitBlock(node.body, lines, 0);
    } else {
      const c = ctx.exprToC(node.body, lines, 0);
      if (ret === 'void') {
        lines.push(`${c};`);
      } else {
        const bodySym = node.body.kind === 'Ident' ? ctx.lookup(node.body.name) : null;
        lines.push(`return ${ctx._derefStrPtr(bodySym, c)};`);
      }
    }
    ctx.popScope();
    ctx._inHoistedLambda = false;
    ctx.addLambda(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) ctx.addLambda('    ' + l);
    ctx.addLambda('}');
    ctx.addLambda('');
    return name;
}

export function _scanReturnExpr(ctx: CodeGenContext, node: unknown): Expression | null {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) { const r = ctx._scanReturnExpr(child); if (r) return r; }
      return null;
    }
    const n = node as Record<string, unknown>;
    if (n.kind === 'Return' && (n.expr || n.value)) return (n.expr || n.value) as Expression;
    for (const key of Object.keys(n)) {
      if (key === 'kind') continue;
      const child = n[key];
      if (child && typeof child === 'object') { const r = ctx._scanReturnExpr(child); if (r) return r; }
    }
    return null;
}

export function inferArrowReturn(ctx: CodeGenContext, node: Arrow | FuncExpr) {
    if (node.returnType) return ctx.resolveType(node.returnType);
    const hasParams = node.params?.length > 0;
    if (hasParams) {
      ctx.pushScope();
      for (let i = 0; i < node.params.length; i++) {
        const p = node.params[i];
        const rawCt = p.typeAnn ? ctx.resolveType(p.typeAnn) : (ctx._lambdaParamHint?.[i] ?? 'void *');
        const inferCt = rawCt === 'String *' ? 'String' : rawCt;
        ctx.define(p.name, { ctype: inferCt });
      }
    }
    let result = 'void';
    if (node.body.kind !== 'Block') {
      result = ctx.inferType(node.body) ?? 'void';
    } else {
      for (const stmt of (node.body.body ?? [])) {
        if (stmt.kind === 'VarDecl' && stmt.init) {
          const initCt = ctx.inferType(stmt.init);
          if (initCt) ctx.define(stmt.name, { ctype: initCt === 'String *' ? 'String' : initCt });
        }
      }
      const retExpr = ctx._scanReturnExpr(node.body);
      if (retExpr) result = ctx.inferType(retExpr) ?? 'void';
    }
    if (hasParams) ctx.popScope();
    return result;
}

  // Format a variable declaration: qualifier + ctype + name with proper pointer spacing
export function varDecl(ctx: CodeGenContext, qualifier: string, ctype: string, name: string) {
    if (qualifier === 'const ' && ctype.startsWith('const ')) qualifier = '';
    if (ctype.endsWith(' *')) return `${qualifier}${ctype}${name}`;
    return `${qualifier}${ctype} ${name}`;
}

export function arrowParamTypes(ctx: CodeGenContext, node: Arrow) {
    return (node.params ?? []).map((p: Param) => p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *').join(', ');
}

  // Expand an ArrayLit's elements into C initializer strings, handling spreads.
  // Spread `...arr` on a known C array expands to arr[0], arr[1], ...
