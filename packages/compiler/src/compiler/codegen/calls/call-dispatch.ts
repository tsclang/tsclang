import type { CodeGenContext } from '../../codegen.js';
import { DEFAULT_TARGET } from '@tsclang/shared';
import type { Expression, Call, Argument, SymbolInfo, Param, TypeRef } from '@tsclang/ast';
import { isDecimal, resolveDecimalBase } from '../types/decimal.js';
export function callToC(ctx: CodeGenContext, node: Call, lines: string[], depth: number): string {
    const { callee, args } = node;

    // Namespace import: Lib.someFunc(...) в†’ desugar to Ident call
    if (callee.kind === 'Member' && callee.object?.kind === 'Ident') {
      const nsSym = ctx.lookup(callee.object.name);
      if (nsSym?._isNamespace) {
        const nsEntry = nsSym._namespaceExports?.[callee.prop];
        if (nsEntry) {
          ctx.define(callee.prop, nsEntry);
          // Re-dispatch as Ident call so mangling and type inference work normally
          const syntheticCall = { ...node, callee: { kind: 'Ident', name: callee.prop } } as Call;
          return ctx.callToC(syntheticCall, lines, depth);
        }
      }
    }

    // Generator .next() call: gen.next() в†’ genFn_next(&gen, ...storedArgs)
    if (callee.kind === 'Member' && callee.prop === 'next') {
      const objName = callee.object?.kind === 'Ident' ? callee.object.name : null;
      const sym = typeof objName === 'string' ? ctx.lookup(objName) : null;
      if (sym?._isGenState) {
        const { gi, callExpr } = ctx._genNextCall(sym, ctx.exprToC(callee.object, lines, depth));
        if (lines !== undefined) {
          const I = ' '.repeat(ctx.indent * depth);
          const rVar = `_r_${(ctx._genResultCount = (ctx._genResultCount || 0) + 1) - 1}`;
          lines.push(`${I}${gi.resultType} ${rVar} = ${callExpr};`);
          ctx.define(rVar, { ctype: gi.resultType, varKind: 'let' });
          return rVar;
        }
        return callExpr;
      }
    }

    // Optional chaining: x?.method() where x is opt_T
    if (callee.kind === 'OptChain') {
      const obj = callee.object;
      const objType = ctx.inferType(obj);
      let objC = ctx.exprToC(obj, lines, depth);
      if (objType?.startsWith('opt_')) {
        const innerIdent = objType.slice(4);
        if (callee.prop === 'toString') {
          const fnName = `tsc_${innerIdent}_to_string`;
          if (!['Ident', 'Literal'].includes(obj.kind)) {
            const tmp = `_tsc_opt_${ctx.tempCount++}`;
            lines.push(`${' '.repeat(ctx.indent * depth)}${objType} ${tmp} = ${objC};`);
            objC = tmp;
          }
          return `${objC}.has_value ? (opt_string){true, ${fnName}(${objC}.value)} : (opt_string){false, STR_LIT("")}`;
        }
      }
      // Fallback: treat as non-optional
      const objC2 = ctx.exprToC(obj, lines, depth);
      return `${objC2}.${callee.prop}(${ctx.argsToC(args, lines, depth)})`;
    }

    // @platform check: calling a function skipped for current platform
    if (callee.kind === 'Ident' && ctx._platformSkipped?.has(callee.name)) {
      const allowed = ctx._platformSkipped.get(callee.name)!.join('", "');
      const target = ctx._targetName ?? DEFAULT_TARGET;
      throw ctx.errorCode('E300', null, { detail: `'${callee.name}' is only available on platform "${allowed}", but current target is "${target}"` });
    }

    if (callee.kind === 'Ident') {
      const sym = ctx.lookup(callee.name);
      if (sym?._isStackMacro) {
        const strArg = (i: number) => args[i]?.expr?.kind === 'Literal' ? args[i].expr.value : '??';
        if (sym._isStackMacro === 'push') {
          const sName = strArg(0);
          const val = ctx.exprToC(args[1].expr, lines, depth);
          return `(${sName}_stack[${sName}_stack_top++] = (uintptr_t)(${val}))`;
        }
        if (sym._isStackMacro === 'empty') {
          const sName = strArg(0);
          return `(${sName}_stack_top == 0)`;
        }
        if (sym._isStackMacro === 'pop') {
          const sName = strArg(0);
          const tArg = node.typeArgs?.[0];
          const ct = tArg ? ctx.resolveType(tArg) : 'int32_t';
          return `((${ct})${sName}_stack[--${sName}_stack_top])`;
        }
      }
    }

    // super(args) in constructor в†’ initialize base struct
    if (callee.kind === 'Ident' && callee.name === 'super') {
      const selfSym = ctx.lookup('self');
      const cls = selfSym ? ctx.classes.get(selfSym.ctype!) : null;
      const superClass = cls?.superClass;
      if (superClass === 'Error') {
        // super(msg) в†’ self._base.message = msg
        const msgC = args[0] ? ctx.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        return `self._base.message = ${msgC}`;
      } else if (superClass) {
        // super(args) в†’ self._base = BaseClass_new(args)
        const argsC = ctx.argsToC(args, lines, depth);
        return `self._base = ${superClass}_new(${argsC})`;
      }
      throw ctx.error(`super() can only be called in a class with a superclass`, node);
    }


    const _r = ctx._dispatchConcurrency(node, lines, depth); if (_r !== null) return _r;
    const _af = ctx._dispatchArrayStatic(node, lines, depth); if (_af !== null) return _af;
    const _os = ctx._dispatchObjectStatic(node, lines, depth); if (_os !== null) return _os;
    const _gb = ctx._dispatchGroupBy(node, lines, depth); if (_gb !== null) return _gb;
    const _r2 = ctx._dispatchBuiltin(node, lines, depth); if (_r2 !== null) return _r2;
    const _r3 = ctx._dispatchStdLib(node, lines, depth); if (_r3 !== null) return _r3;
    const _r4 = ctx._dispatchConversion(node, lines, depth); if (_r4 !== null) return _r4;

    // Check for bare throws calls as arguments (must use ! or ?)
    for (const a of args) {
      ctx._checkNoBareThrows(a.expr ?? a);
    }

    // Generic function call: monomorphize
    if (callee.kind === 'Ident' && ctx._genericFuncs?.has(callee.name)) {
      return ctx.callGeneric(callee.name, node.typeArgs ?? [], args, lines, depth);
    }

    // IIFE: (x => expr)(args) — hoist and call directly
    if (callee.kind === 'Arrow') {
      if (ctx._strictRules?.has('no-closures')) {
        throw ctx.errorCode('E200', node);
      }
      const closure = ctx.hoistClosure(callee, `_iife_${ctx.closureCount ?? 0}`);
      if (closure) {
        const argsC = ctx.argsToC(args, lines, depth);
      const paramTypes = args.map((a: { expr: Expression }) => ctx.inferType(a.expr) ?? 'void *');
        const sigArgs = ['void *', ...paramTypes].join(', ');
        const envName = `_iife_env_${ctx.closureCount - 1}`;
        lines.push(`${' '.repeat(ctx.indent * depth)}${closure.envName} *${envName} = tsc_malloc(sizeof(${closure.envName}));`);
        lines.push(`${' '.repeat(ctx.indent * depth)}*${envName} = (${closure.envName})${closure.envInit};`);
        return `((${closure.ret} (*)(${sigArgs}))${closure.fnName})(${envName}${argsC ? ', ' + argsC : ''})`;
      }
      const fnName = ctx.hoistArrow(callee, 'void', '_iife');
      const argsC = ctx.argsToC(args, lines, depth);
      return `${fnName}(${argsC})`;
    }

    // Plain function call вЂ” look up mangled name in scope
    let calleeC;
    let sym: SymbolInfo | null = null;
    if (callee.kind === 'Ident') {
      sym = ctx.lookup(callee.name);
      // Overload resolution: if there are multiple overloads, pick by arg count then type
      if (sym?.overloads && sym.overloads.length > 0) {
        const argCount = args.filter((a: { spread?: boolean }) => !a.spread).length;
        // First filter by arg count
        const countMatches = sym.overloads.filter((o: { params: Param[] }) => o.params.filter((p: Param) => !p.rest).length === argCount);
        let match;
        if (countMatches.length === 1) {
          match = countMatches[0];
        } else if (countMatches.length > 1) {
          // Multiple count matches: pick by type
          match = countMatches.find((o: { params: Param[] }) =>
            args.every((a: { expr: Expression }, i: number) => {
              const p = o.params[i];
              if (!p?.typeAnn) return true;
              const expectedCtype = ctx.resolveType(p.typeAnn);
              const actualCtype = ctx.inferType(a.expr);
              return expectedCtype === actualCtype || expectedCtype.includes(actualCtype) || actualCtype.includes(expectedCtype);
            })
          ) ?? countMatches[0];
        } else {
          match = sym.overloads[sym.overloads.length - 1]; // fallback to last
        }
        calleeC = match.funcName;
        // Use matched params for rest/default filling below
        sym = { ...sym, funcName: calleeC, params: match.params };
      } else {
        // funcPtr variables hold the name directly; functions use their mangled name
        calleeC = (sym?.funcName && !sym.funcPtr) ? sym.funcName : callee.name;
        // Unknown identifier check: callee not in scope and not a language builtin
        if (!sym && !ctx._languageBuiltins.has(callee.name)) {
          throw ctx.error(`unknown identifier '${callee.name}'`);
        }
        // avr/hal direct calls that return values: set _lastHalRead so stmt.js emits (void)name;
        if (sym?._suppressVoidWarning && sym.ctype !== 'void') ctx._lastHalRead = sym.ctype ?? null;
      }
    } else {
      calleeC = ctx.exprToC(callee, lines, depth);
    }

    // Recursive self-call: direct static call (no function pointer indirection)
    if (sym?._isRecursiveSelf && sym?._closureFnName && callee.kind === 'Ident') {
      const argsC = ctx.argsToC(args, lines, depth);
      ctx._releaseQuarantineBy(callee.name);
      if (sym.isClosure) {
        return `${sym._closureFnName}(env${argsC ? ', ' + argsC : ''})`;
      }
      return `${sym._closureFnName}(${argsC})`;
    }

    // tsc_closure call: closure variable or func-ptr variable (not a regular function)
    if (sym?.ctype === 'tsc_closure' && (!sym.funcName || sym.funcPtr) && callee.kind === 'Ident') {
      const argsC = ctx.argsToC(args, lines, depth);
      const paramTypes = sym.closureParamTypes ?? (node.args ?? []).map((a: Argument) => ctx.inferType(a.expr) ?? 'void *');
      const retType = sym.closureRetType ?? ctx.inferType(node) ?? 'void';
      if (sym.isClosure || !sym.funcPtr) {
        ctx._releaseQuarantineBy(callee.name);
        const sigArgs = paramTypes.length > 0 ? ['void *', ...paramTypes].join(', ') : 'void *';
        const callArgs = argsC ? `${callee.name}.env, ${argsC}` : `${callee.name}.env`;
        return `((${retType} (*)(${sigArgs}))${callee.name}.fn)(${callArgs})`;
      }
      ctx._releaseQuarantineBy(callee.name);
      const sigArgs = paramTypes.join(', ') || 'void';
      return `((${retType} (*)(${sigArgs}))${callee.name}.fn)(${argsC})`;
    }

    // tsc_closure call from expression (e.g. arr[0](args))
    if (callee.kind !== 'Ident' && !sym?.funcName) {
      const calleeType = ctx.inferType(callee);
      if (calleeType === 'tsc_closure') {
        const argsC = ctx.argsToC(args, lines, depth);
        let paramTypes: string[] | null = null;
        let retType = ctx.inferType(node) ?? 'void';
        if (callee.kind === 'Index' && callee.object.kind === 'Ident') {
          const arrSym = ctx.lookup(callee.object.name);
          if (arrSym?._arrElemClosureParams) paramTypes = arrSym._arrElemClosureParams;
          if (arrSym?._arrElemClosureRet) retType = arrSym._arrElemClosureRet;
        }
        if (!paramTypes) paramTypes = (node.args ?? []).map((a: Argument) => ctx.inferType(a.expr) ?? 'void *');
        const sigArgs = paramTypes.join(', ') || 'void';
        return `((${retType} (*)(${sigArgs}))${calleeC}.fn)(${argsC})`;
      }
    }

    // Libc variadic call or user Scalar-variadic call: pass args as raw C values
    if (sym?._isLibcVariadic || sym?._isScalarVariadic) {
      const _libcVmap: Record<string, string> = { printf: 'vprintf', fprintf: 'vfprintf', sprintf: 'vsprintf', snprintf: 'vsnprintf', scanf: 'vscanf', sscanf: 'vsscanf', fscanf: 'vfscanf' };
      const _toRawArg = (a: Argument): { isVaList?: boolean; vaListName?: string; raw?: string } => {
        // Spread of a va_list в†’ va_list variable name (for v-variant forwarding)
        if (a.spread) {
          const spreadSym = a.expr?.kind === 'Ident' ? ctx.lookup(a.expr.name) : null;
          if (spreadSym?._isVaList) return { isVaList: true, vaListName: spreadSym._vaListName };
          throw ctx.error(`spread '...' requires a va_list in variadic function calls`, a.expr ?? a);
        }
        if (a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          return { raw: `"${a.expr.value.replace(/"/g, '\\"')}"` };
        }
        const ac = ctx.exprToC(a.expr, lines, depth);
        const at = ctx.inferType(a.expr);
        return { raw: at === 'String' ? `${ac}.data` : ac };
      };
      const processed = args.map(_toRawArg);
      const vaListArg = processed.find((p) => p.isVaList);
      if (vaListArg) {
        const vName = _libcVmap[calleeC] ?? ('v' + calleeC);
        const normalParts = processed.filter((p) => !p.isVaList).map((p) => p.raw!);
        normalParts.push(vaListArg.vaListName!);
        return `${vName}(${normalParts.join(', ')})`;
      }
      return `${calleeC}(${processed.map((p) => p.raw!).join(', ')})`;
    }

    // Check for any-typed params: cannot pass typed value as any
    if (sym?.params) {
      for (let i = 0; i < sym.params.length && i < args.length; i++) {
        const p = sym.params[i];
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'any') {
          const argType = ctx.inferType(args[i].expr);
          if (argType !== 'void *' && argType !== null && argType !== undefined) {
            const tsType = ctx.ctypeToTsName(argType);
            throw ctx.errorCode('E120', null, { detail: `cannot pass ${tsType} as "any": any is opaque across function boundaries` });
          }
        }
      }
    }

    // Check if callee has a rest param вЂ” if so, bundle variadic args into a temp array
    const symParams = sym?.params;
    const restIdx = symParams ? symParams.findIndex((p: { rest?: boolean }) => p.rest) : -1;
    if (restIdx >= 0) {
      const restParam = symParams![restIdx];
      let et = 'int32_t';
      if (restParam.typeAnn?.kind === 'TypeArray') et = ctx.resolveType(restParam.typeAnn.element);
      else if (restParam.typeAnn) et = ctx.resolveType(restParam.typeAnn);
      // Normal args before rest
      const normalArgs = args.slice(0, restIdx).map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth));
      // Variadic args from restIdx onward
      const varArgs = args.slice(restIdx);
      const I = ' '.repeat(ctx.indent * depth);
      const restName = `_rest_${ctx.restCount++}`;
      const varArgsC = varArgs.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth)).join(', ');
      lines.push(`${I}${et} ${restName}[] = {${varArgsC}};`);
      const allArgs = [...normalArgs, restName, String(varArgs.length)];
      return `${calleeC}(${allArgs.join(', ')})`;
    }

    // Fill in default params at call site if fewer args are provided (skip if any spread arg)
    const hasSpread = args.some((a: { spread?: boolean }) => a.spread);
    if (!hasSpread && symParams && args.length < symParams.filter((p: { rest?: boolean }) => !p.rest).length) {
      const normalParams = symParams.filter((p: { rest?: boolean }) => !p.rest);
      const filled = normalParams.map((p: { defaultVal?: Expression }, i: number) => {
        if (i < args.length) {
          return ctx.exprToC(args[i].expr, lines, depth);
        }
        if (p.defaultVal) return ctx.exprToC(p.defaultVal, lines, depth);
        return '0'; // fallback (shouldn't happen if type-checked)
      });
      return `${calleeC}(${filled.join(', ')})`;
    }

    // If we have symParams, coerce string literals to enum values for string-literal-union params
    // (only when no spread args вЂ” spread needs argsToC expansion)
    const hasSpreadArgs = args.some((a: { spread?: boolean }) => a.spread);
    if (symParams && !hasSpreadArgs) {
      const I = ' '.repeat(ctx.indent * depth);
      const _callMutBorrowedSyms: SymbolInfo[] = [];
      // Pre-pass: detect same variable passed as Mut<T> to multiple params of the same call
      {
        const mutArgNames = new Map();
        for (let i = 0; i < args.length; i++) {
          const p = symParams[i];
          if (p?.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'Mut' &&
              args[i].expr.kind === 'Ident') {
            const nm = (args[i].expr as { name: string }).name;
            const innerName = p.typeAnn.typeArgs?.[0]?.name;
            if (!innerName || !ctx.interfaces.has(innerName)) {
              if (mutArgNames.has(nm)) {
                throw ctx.errorCode('E012', args[i].expr, { name: nm });
              }
              mutArgNames.set(nm, i);
            }
          }
        }
      }
      const coercedArgs = args.map((a: Argument, i: number) => {
        const param = symParams[i];
        if (!param) return ctx.exprToC(a.expr, lines, depth);
        if (a.expr.kind === 'Ident') {
          const _argQSym = ctx.lookup(a.expr.name);
          if (_argQSym?._mutQuarantined) {
            throw ctx.errorCode('E011', a.expr, { name: a.expr.name });
          }
        }
        const paramType = param.typeAnn ? ctx.resolveType(param.typeAnn) : null;
        const paramEnumDef = paramType ? ctx.classes.get(paramType) : null;
        if (paramEnumDef?.isStringLiteralUnion && a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          const val = a.expr.value;
          if (!((paramEnumDef.members as string[] | undefined) ?? []).includes(val)) {
            throw ctx.errorCode('E114', null, { value: val as string, type: paramType! });
          }
          return `${paramType}_${val}`;
        }
        // ObjLit arg to struct param: prefix with (StructType)
        if (paramEnumDef?.isStruct && a.expr.kind === 'ObjLit') {
          const initC = ctx.exprToC(a.expr, lines, depth);
          return `(${paramType})${initC}`;
        }
        // Array struct arg to destructured array param (int32_t *_arr): pass .data
        if (param.destructArr) {
          const argSym = a.expr?.kind === 'Ident' ? ctx.lookup(a.expr.name) : null;
          if (argSym?.ctype?.startsWith('Array_')) {
            return `${ctx.exprToC(a.expr, lines, depth)}.data`;
          }
        }
        // Borrow check: cannot pass const variable as Mut<T> (non-interface only;
        // interface Mut<T> is caught below with a better message)
        if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Mut' &&
            a.expr.kind === 'Ident') {
          const innerCheck = param.typeAnn.typeArgs?.[0]?.name;
          if (!innerCheck || !ctx.interfaces.has(innerCheck)) {
            const argSym = ctx.lookup(a.expr.name);
            if (argSym?.varKind === 'const') {
              throw ctx.errorCode('E013', null, { name: a.expr.name });
            }
          }
        }
        // Interface param (or Mut<Interface>): wrap concrete class arg in fat pointer
        // Also handle `c as Shape` cast вЂ” unwrap to the inner ident
        const ifaceName = ctx._getIfaceParamName(param.typeAnn);
        const rawArgExpr = (ifaceName && a.expr.kind === 'Cast' &&
          a.expr.castType?.kind === 'TypeRef' && a.expr.castType.name === ifaceName)
          ? a.expr.expr : a.expr;
        if (ifaceName && ctx.interfaces.has(ifaceName) && rawArgExpr.kind === 'Ident') {
          const a2 = { ...a, expr: rawArgExpr };
          a = a2;
          const argName = (a.expr as { name: string }).name;
          // Check: cannot pass const variable as Mut<Interface>
          if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Mut') {
            const argVarInfo = ctx.lookup(argName);
            if (argVarInfo?.varKind === 'const') {
              const mutIfaceName = param.typeAnn.typeArgs?.[0]?.name ?? ifaceName;
              throw ctx.errorCode('E024', null, { name: argName, iface: mutIfaceName });
            }
          }
          const argSym3 = ctx.lookup(argName);
          const argClass = argSym3?.ctype ? ctx.classes.get(argSym3.ctype) : null;
          if (argClass && argSym3?.ctype && !ctx.interfaces.has(argSym3.ctype)) {
            // Concrete class: wrap in fat pointer
            const className = argSym3.ctype;
            const hasExplicit = argClass.implements_?.some((i: TypeRef | string) => (typeof i === 'string' ? i : i.name) === ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) ctx._ensureImplicitVtable(className, ifaceName);
            const fatName = `_${param.name}_${argName}`;
            // Reuse existing fat-ptr variable if already declared in scope
            if (!ctx.lookup(fatName)) {
              lines.push(`${I}${ifaceName} ${fatName} = { .self = &${argName}, .vtable = &${vtableName} };`);
              ctx.define(fatName, { ctype: ifaceName });
            }
            return fatName;
          }
        }
        if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Arc') {
          const argSymSh = a.expr?.kind === 'Ident' ? ctx.lookup(a.expr.name) : null;
          if (argSymSh && a.expr.kind === 'Ident') {
            if (argSymSh.isRefParam) {
              throw ctx.errorCode('E015', a.expr, { name: a.expr.name, detail: `cannot pass Ref<T> '${a.expr.name}' as Arc<T> — incompatible borrow types` });
            }
            if (argSymSh.isMutParam) {
              throw ctx.errorCode('E015', a.expr, { name: a.expr.name, detail: `cannot pass Mut<T> '${a.expr.name}' as Arc<T> — mutable borrow cannot become shared reference` });
            }
          }
        }
        // Ref<T>/Mut<T> param: pass &var (for non-interface inner types)
        if (param.typeAnn?.kind === 'TypeRef' &&
            (param.typeAnn.name === 'Ref' || param.typeAnn.name === 'Mut')) {
          const innerName2 = param.typeAnn.typeArgs?.[0]?.name;
          if (!innerName2 || !ctx.interfaces.has(innerName2)) {
            const argSym2 = a.expr?.kind === 'Ident' ? ctx.lookup(a.expr.name) : null;
            if (argSym2 && a.expr.kind === 'Ident') {
              if (param.typeAnn.name === 'Mut') {
                if (argSym2.isRefParam) {
                  throw ctx.errorCode('E015', a.expr, { name: a.expr.name, detail: `cannot re-borrow Ref<T> '${a.expr.name}' as Mut<T> — immutable borrow cannot become mutable` });
                }
                if (argSym2.isArc) {
                  throw ctx.errorCode('E015', a.expr, { name: a.expr.name, detail: `cannot create mutable borrow of Arc<T> '${a.expr.name}' — Arc does not give exclusive access` });
                }
                // Cannot mutably borrow while an immutable borrow is active
                if ((argSym2._refBorrowCount || 0) > 0) {
                  throw ctx.errorCode('E014', a.expr, { name: a.expr.name });
                }
                // Cannot pass to two *different* Mut<T> borrowers in the same scope
                if (argSym2._mutBorrowedBy && argSym2._mutBorrowedBy !== calleeC) {
                  throw ctx.errorCode('E012', a.expr, { name: a.expr.name });
                }
                argSym2._mutBorrowedBy = calleeC;
                _callMutBorrowedSyms.push(argSym2);
              } else {
                // Ref<T>: mark as immutably borrowed (for future Mut<T> checks)
                ctx._trackRefBorrow(argSym2);
              }
            }
            const argC2 = ctx.exprToC(a.expr, lines, depth);
            if (!argSym2?.isPointer && !argSym2?.ctype?.endsWith('*')) return `&${argC2}`;
            return argC2;
          }
        }
        // tsc_closure param: wrap closure/func arg into tsc_closure
        if (paramType === 'tsc_closure' && a.expr.kind === 'Ident') {
          const argSym = ctx.lookup(a.expr.name);
          if (argSym?.isClosure && argSym._closureEnvName) {
            return `(tsc_closure){.env = ${a.expr.name}_env, .fn = (void*)${argSym._closureFnName}}`;
          }
          if (argSym?.funcPtr && argSym.ctype === 'tsc_closure') {
            return a.expr.name;
          }
          if (argSym?.funcName) {
            return `(tsc_closure){.env = NULL, .fn = (void*)${argSym.funcName}}`;
          }
        }
        if (paramType === 'tsc_closure' && a.expr.kind === 'Arrow') {
          if (ctx._strictRules?.has('no-closures')) {
            throw ctx.errorCode('E200', node);
          }
          const closure = ctx.hoistClosure(a.expr, `_cb_${ctx.closureCount ?? 0}`);
          if (closure) {
            if (closure.retainLines?.length) {
              const I = ' '.repeat(ctx.indent * depth);
              for (const rl of closure.retainLines) lines.push(`${I}${rl}`);
            }
            lines.push(`${' '.repeat(ctx.indent * depth)}${closure.envName} *_cb_env_${ctx.closureCount - 1} = tsc_malloc(sizeof(${closure.envName}));`);
            lines.push(`${' '.repeat(ctx.indent * depth)}*_cb_env_${ctx.closureCount - 1} = (${closure.envName})${closure.envInit};`);
            return `(tsc_closure){.env = _cb_env_${ctx.closureCount - 1}, .fn = (void*)${closure.fnName}}`;
          }
          const lambdaName = ctx.hoistArrow(a.expr, 'void', '_cb');
          return `(tsc_closure){.env = NULL, .fn = (void*)${lambdaName}}`;
        }
        const _prevExpected = ctx._expectedType;
        const _decPT = resolveDecimalBase(ctx, paramType);
        if (paramType?.startsWith('Array_') || _decPT) ctx._expectedType = _decPT ?? paramType;
        const _argC = ctx.exprToC(a.expr, lines, depth);
        ctx._expectedType = _prevExpected;
        if (paramType === 'tsc_unknown') {
          const _argType = ctx.inferType(a.expr);
          if (_argType !== 'tsc_unknown') {
            ctx._ensureUnknownStruct();
            const _packer = ctx._unknownPackerFor(_argType);
            return `${_packer}(${_argC})`;
          }
        }
        // Move semantics: class/array-by-value arg passed to function → mark source as moved
        if (a.expr.kind === 'Ident' && paramType) {
          const _moveClassDef = ctx.classes.get(paramType);
          const _hasFields = !!_moveClassDef?.fields;
          const _isArray = paramType.startsWith('Array_');
          const _isBorrow = param.typeAnn?.kind === 'TypeRef' &&
            (param.typeAnn.name === 'Ref' || param.typeAnn.name === 'Mut' || param.typeAnn.name === 'Arc');
          if ((_hasFields || _isArray) && !_isBorrow) {
            const _moveArgSym = ctx.lookup(a.expr.name);
            if (_moveArgSym) {
              if (_moveArgSym.isRefParam) {
                throw ctx.errorCode('E016', a.expr, { borrow_type: 'Ref<T>', name: a.expr.name });
              }
              if (_moveArgSym.isMutParam) {
                throw ctx.errorCode('E016', a.expr, { borrow_type: 'Mut<T>', name: a.expr.name });
              }
              if (_moveArgSym.isArc) {
                throw ctx.errorCode('E016', a.expr, { borrow_type: 'Arc<T>', name: a.expr.name });
              }
              if (_moveArgSym.varKind === 'const') {
                throw ctx.errorCode('E003', a.expr);
              }
              if (_moveArgSym._moved) {
                throw ctx.errorCode('E002', a.expr, { name: a.expr.name });
              }
              _moveArgSym._moved = true;
              _moveArgSym._movedLine = a.expr.line;
              _moveArgSym._movedSourceNode = a.expr;
              if (_moveArgSym.varKind === 'let' && _hasFields) {
                if (!ctx._postStmtCleanups) ctx._postStmtCleanups = [];
                ctx._postStmtCleanups.push(`${I}${a.expr.name} = (${paramType}){0};`);
              }
            }
          }
        }
        return _argC;
      });
      const result = `${calleeC}(${coercedArgs.join(', ')})`;
      for (const sym of _callMutBorrowedSyms) delete sym._mutBorrowedBy;
      return result;
    }

    const argsC = ctx.argsToC(args, lines, depth);
    return `${calleeC}(${argsC})`;
}

export function _dispatchArrayStatic(ctx: CodeGenContext, node: Call, lines: string[], depth: number) {
    const { callee, args } = node;
    if (callee?.kind !== 'Member') return null;
    if (callee.prop !== 'from' && callee.prop !== 'of') return null;
    const obj = callee.object;
    if (obj?.kind !== 'Ident' || obj.name !== 'Array') return null;

    const typeArg = node.typeArgs?.[0];
    const etCType = typeArg ? ctx.resolveType(typeArg) : (args.length > 0 ? ctx.inferType(args[0].expr) : 'int32_t');
    if (etCType?.startsWith('Array_')) {
      const inner = etCType.slice(6);
      const innerC = ctx._arrIdentToCType(inner);
      ctx._ensureArrayStruct(etCType, innerC);
    }
    const etIdent = ctx.cTypeToIdent(etCType);
    const arrName = `Array_${etIdent}`;
    ctx._ensureArrayStruct(arrName, etCType);
    const I = ' '.repeat(ctx.indent * depth);

    if (callee.prop === 'from') {
      if (args.length < 1) return null;
      const srcExpr = args[0].expr;
      const srcC = ctx.exprToC(srcExpr, lines, depth);
      const srcType = ctx.inferType(srcExpr);
      if (srcType?.startsWith('Array_')) {
        if (srcType === arrName) {
          return `tsc_array_slice_${etIdent}(${srcC}, 0, (int32_t)${srcC}.length)`;
        }
        const srcIdent = srcType.slice(6);
        return `tsc_array_cast_${srcIdent}_${etIdent}(${srcC})`;
      }
      return `tsc_array_slice_${etIdent}(${srcC}, 0, (int32_t)${srcC}.length)`;
    }

    // Array.of
    const itemsC = args.map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth));
    const count = itemsC.length;
    const tmpArr = `_of_${ctx.tempCount++}`;
    for (let i = 0; i < count; i++) {
      lines.push(`${I}${etCType} ${tmpArr}_${i} = ${itemsC[i]};`);
    }
    lines.push(`${I}${etCType} ${tmpArr}_data[] = {${itemsC.map((_, i: number) => `${tmpArr}_${i}`).join(', ')}};`);
    lines.push(`${I}${arrName} ${tmpArr} = {.data = ${tmpArr}_data, .length = ${count}, .capacity = ${count}};`);
    return `${tmpArr}`;
}

export function _dispatchObjectStatic(ctx: CodeGenContext, node: Call, lines: string[], depth: number) {
    const { callee, args } = node;
    if (callee?.kind !== 'Member') return null;
    const obj = callee.object;
    if (obj?.kind !== 'Ident' || obj.name !== 'Object') return null;
    const prop = callee.prop;
    if (prop !== 'keys' && prop !== 'values' && prop !== 'entries') return null;
    if (args.length < 1) return null;
    const argExpr = args[0].expr;
    const objType = ctx.inferType(argExpr);
    const cls = objType ? ctx.classes.get(objType) : null;
    if (!cls || !cls.fields || cls.fields.length === 0) return null;
    const fields = cls.fields;
    const I = ' '.repeat(ctx.indent * depth);
    if (prop === 'keys') {
      const argC = ctx.exprToC(argExpr, lines, depth);
      const tmpObj = `_obj_${ctx.tempCount++}`;
      lines.push(`${I}${objType} ${tmpObj} = ${argC};`);
      ctx._ensureArrayStruct('Array_string', 'String');
      const keysData = fields.map((f: { name: string }) => `STR_LIT("${f.name}")`).join(', ');
      const tmpArr = `_keys_${ctx.tempCount++}`;
      lines.push(`${I}String ${tmpArr}_data[] = {${keysData}};`);
      lines.push(`${I}Array_string ${tmpArr} = {.data = ${tmpArr}_data, .length = ${fields.length}, .capacity = ${fields.length}};`);
      return `${tmpArr}`;
    }
    const fieldTypes = fields.map((f) => ctx.resolveType(f.typeAnn));
    const firstType = fieldTypes[0];
    const allSame = fieldTypes.every((t: string) => t === firstType);
    if (!allSame) {
      throw ctx.errorCode('E120', node, { detail: 'Object.values/entries requires uniform field types' });
    }
    const etIdent = ctx.cTypeToIdent(firstType);
    const refArrName = `Array_ref_${etIdent}`;
    ctx._ensureRefArrayStruct(refArrName, firstType);
    let srcExpr;
    const srcIsIdent = argExpr.kind === 'Ident';
    if (srcIsIdent) {
      srcExpr = argExpr.name;
      const srcSym = ctx.lookup(argExpr.name);
      if (srcSym) ctx._trackRefBorrow(srcSym);
    } else {
      const argC = ctx.exprToC(argExpr, lines, depth);
      const tmpObj = `_obj_${ctx.tempCount++}`;
      lines.push(`${I}${objType} ${tmpObj} = ${argC};`);
      srcExpr = tmpObj;
    }
    if (prop === 'values') {
      const valsData = fields.map((f: { name: string }) => `&${srcExpr}.${f.name}`).join(', ');
      const tmpArr = `_vals_${ctx.tempCount++}`;
      lines.push(`${I}${firstType} *${tmpArr}_data[] = {${valsData}};`);
      lines.push(`${I}${refArrName} ${tmpArr} = {.data = ${tmpArr}_data, .length = ${fields.length}, .capacity = ${fields.length}};`);
      return `${tmpArr}`;
    }
    const tupleName = `Tuple_string_ref_${etIdent}`;
    const tupleArrName = `Array_${tupleName}`;
    if (!ctx._emittedTuples?.has(tupleName)) {
      if (!ctx._emittedTuples) ctx._emittedTuples = new Set();
      ctx._emittedTuples.add(tupleName);
      ctx.addTop(`typedef struct { String _0; ${firstType} *_1; } ${tupleName};`);
      ctx.addTop('');
      ctx.classes.set(tupleName, { isTuple: true, fields: [
        { name: '_0', label: undefined, ctype: 'String', const: false },
        { name: '_1', label: undefined, ctype: `${firstType} *`, const: false }
      ], readonly: false });
    }
    ctx._ensureArrayStruct(tupleArrName, tupleName);
    const entriesData = fields.map((f: { name: string }) => `{STR_LIT("${f.name}"), &${srcExpr}.${f.name}}`).join(', ');
    const tmpArr = `_entries_${ctx.tempCount++}`;
    lines.push(`${I}${tupleName} ${tmpArr}_data[] = {${entriesData}};`);
    lines.push(`${I}${tupleArrName} ${tmpArr} = {.data = ${tmpArr}_data, .length = ${fields.length}, .capacity = ${fields.length}};`);
    return `${tmpArr}`;
}

export function _dispatchGroupBy(ctx: CodeGenContext, node: Call, lines: string[], depth: number) {
    const { callee, args } = node;
    if (callee?.kind !== 'Member') return null;
    if (callee.prop !== 'groupBy') return null;
    const obj = callee.object;
    if (obj?.kind !== 'Ident') return null;
    if (obj.name !== 'Map' && obj.name !== 'Object') return null;
    if (args.length < 2) return null;
    if (ctx._cap('allocator') !== 'heap') {
      throw ctx.errorCode('E300', node, { detail: `'${obj.name}.groupBy()' is not available on embedded targets` });
    }
    const arrExpr = args[0].expr;
    const arrType = ctx.inferType(arrExpr);
    if (!arrType?.startsWith('Array_')) return null;
    const etIdent = arrType.slice(6);
    const etCType = ctx._arrIdentToCType(etIdent);
    const arrName = `Array_${etIdent}`;
    ctx._ensureArrayStruct(arrName, etCType);
    const keyFnArg = args[1];
    ctx._lambdaParamHint = etCType === 'String' ? ['String *'] : [etCType];
    const cbFnName = ctx._extractCallbackFn(keyFnArg, lines, depth);
    ctx._lambdaParamHint = null;
    if (!cbFnName) return null;
    ctx._ensureGroupByMapStruct(etIdent, etCType);
    const arrC = ctx.exprToC(arrExpr, lines, depth);
    const macroSuffix = etIdent;
    return `tsc_map_group_by_${macroSuffix}(${arrC}, ${cbFnName})`;
}
