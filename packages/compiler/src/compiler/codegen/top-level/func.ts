import type { CodeGenContext } from '../../codegen.js';
import type { ThrowsCtx } from './decorators.js';
import { mangleParams } from '../../types.js';
import { DEFAULT_TARGET } from '@tsclang/shared';
import type { Enum, VarDecl, FuncDecl, ExtensionFunc, Param, TypeAnn, TypeRef, TypeFunc, Block, Expression } from '@tsclang/ast';
// func.ts
export function visitEnum(ctx: CodeGenContext, node: Enum) {
    const { name, members, isConst } = node;
    if (name.length > 0 && name[0] >= 'a' && name[0] <= 'z') {
      throw ctx.errorCode('E400', node, { detail: `enum name "${name}" must start with uppercase (PascalCase)` });
    }
    const cname = ctx._modulePrefix ? ctx._modulePrefix + name : name;
    let counter = 0;
    // Detect string enum: first member with a string value
    const isStringEnum = members.some((m) => m.value?.kind === 'Literal' && m.value.litType === 'string');
    if (isStringEnum && members.some((m) => m.value?.kind === 'Literal' && m.value.litType !== 'string')) {
      throw ctx.errorCode('E115', node, { name });
    }
    const entries = members.map((m) => {
      const mLit = m.value?.kind === 'Literal' ? m.value : null;
      if (isStringEnum) {
        const strVal = mLit ? mLit.value : m.name;
        const idx = counter++;
        return { name: m.name, val: String(idx), strVal, numVal: idx };
      }
      const val = mLit ? ctx.exprToC(m.value!) : String(counter);
      let numVal = counter;
      if (mLit) {
        if (typeof mLit.value === 'number') {
          numVal = mLit.value;
          counter = numVal + 1;
        } else {
          const parsed = Number(val);
          if (Number.isFinite(parsed)) {
            numVal = parsed;
            counter = numVal + 1;
          } else {
            counter++;
          }
        }
      } else {
        counter++;
      }
      return { name: m.name, val, numVal };
    });
    ctx.addTop(`typedef enum { ${entries.map((e: { name: string; val: string }) => `${cname}_${e.name} = ${e.val}`).join(', ')} } ${cname};`);
    let needsToString = false;
    if (!isConst) {
      if (isStringEnum) {
        ctx.addTop(`static const char *${cname}_strings[] = { ${entries.map((e) => `"${e.strVal ?? e.name}"`).join(', ')} };`);
      } else {
        ctx.addTop(`static const ${cname} ${cname}_values[] = { ${entries.map((e) => `${cname}_${e.name}`).join(', ')} };`);
        const numVals = entries.map((e) => e.numVal);
        const isSequential = numVals.length > 0 && numVals.every((v: number, i: number) => v === i);
        if (isSequential) {
          ctx.addTop(`static const char *${cname}_names[] = { ${entries.map((e) => `"${e.name}"`).join(', ')} };`);
        } else {
          needsToString = true;
          const cases = entries.map((e) => `        case ${cname}_${e.name}: return "${e.name}";`).join('\n');
          ctx.addTop(`static const char *${cname}_toString(${cname} v) {\n    switch (v) {\n${cases}\n        default: return "unknown";\n    }\n}`);
        }
      }
    }
    ctx.addTop('');
    ctx.classes.set(name, { isEnum: true, _cname: cname, isStringEnum, isConst, needsToString, members: entries });
}

  // ----------------------------------------------------------------
  // Global variables
  // ----------------------------------------------------------------
export function visitGlobalVar(ctx: CodeGenContext, node: VarDecl) {
    const { varKind, name, typeAnn, init } = node;
    const isConst = varKind === 'const';
    const ctype = typeAnn ? ctx.resolveType(typeAnn) : (init ? ctx.inferType(init) : 'int32_t');
    const qualifier = isConst ? 'static const ' : 'static ';
    if (init) {
      const initC = ctx.exprToC(init);
      ctx.addTop(`${qualifier}${ctype} ${name} = ${initC};`);
    } else {
      ctx.addTop(`${qualifier}${ctype} ${name} = {0};`);
    }
    ctx.addTop('');
    ctx.define(name, { ctype, varKind });
}

  // ----------------------------------------------------------------
  // Functions
  // ----------------------------------------------------------------
export function visitFuncDecl(ctx: CodeGenContext, node: FuncDecl, isTopLevel = false, isExported = false) {
    if (!node.body) return; // overload signature
    const { name, params, returnType, body, generator, decorators, typeParams } = node;

    // @platform(...) decorator: only emit for matching target
    const platformDec = (decorators ?? []).find((d) => d.name === 'platform');
    if (platformDec) {
      const allowed = (platformDec.args ?? []).map((a) => a.kind === 'Literal' ? a.value : String(a));
      const target = ctx._targetName ?? DEFAULT_TARGET;
      if (!allowed.includes(target)) {
        if (name) ctx._platformSkipped.set(name, allowed);
        return; // skip for this platform
      }
    }

    // Decorator functions: store instead of emitting C
    if (node.isDecorator || (name && ctx._decoratorNames?.has(name))) {
      ctx._decoratorFns.set(name, node);
      // Apply own decorators to standalone functions
      const ownDecs = decorators ?? [];
      if (ownDecs.length > 0) {
        ctx._emitDecoratedStandaloneFunc(node, ownDecs);
      }
      return;
    }

    // Regular function with known decorators applied → emit as decorated standalone
      const knownDecs = (decorators ?? []).filter((d) => ctx._decoratorFns?.has(d.name));
    if (knownDecs.length > 0) {
      ctx._emitDecoratedStandaloneFunc(node, knownDecs);
      return;
    }

    // @isr("VECTOR") decorator → ISR(VECTOR_vect) { ... }
    const isrDecorator = (decorators ?? []).find((d) => d.name === 'isr');
    if (isrDecorator) {
        if (node.async) throw ctx.errorCode('E416', null, { detail: `TypeError: Cannot use 'async' with @isr on '${name}'` });
      const vectorArg = isrDecorator.args?.[0];
      const vectorLit = vectorArg?.kind === 'Literal' ? vectorArg : null;
      const vectorName = vectorLit?.litType === 'string' ? vectorLit.value : 'UNKNOWN';
      const bodyHasThrow = (stmts: unknown): boolean => (Array.isArray(stmts) ? stmts : []).some((s: unknown) => {
        const sn = s as Record<string, unknown> | undefined;
        const snBody = sn?.body as Record<string, unknown> | undefined;
        return sn?.kind === 'Throw' || bodyHasThrow(snBody?.body ?? snBody ?? []);
      });
        if (bodyHasThrow(body?.body ?? [])) throw ctx.errorCode('E416', null, { detail: '"throw" is not allowed inside @isr handlers' });
      const funcLines: string[] = [];
      ctx.pushScope();
      for (const p2 of (params ?? [])) ctx.define(p2.name, { ctype: p2.typeAnn ? ctx.resolveType(p2.typeAnn) : 'int32_t', varKind: 'let' });
      const bodyLines: string[] = [];
      ctx.visitBlock(body, bodyLines, 1);
      ctx.popScope();
      funcLines.push(`ISR(${vectorName}_vect) {`);
      for (const l of bodyLines) funcLines.push(l);
      funcLines.push('}');
      for (const l of funcLines) ctx.addTop(l);
      ctx.addTop('');
      return;
    }

    // @stack("name", N) → emit static stack arrays in BSS
    for (const dec of (decorators ?? [])) {
      if (dec.name === 'stack' && (dec.args?.length ?? 0) >= 2) {
        const a0 = dec.args![0];
        const a1 = dec.args![1];
        const sName = a0?.kind === 'Literal' ? a0.value : String(a0);
        const sSize = a1?.kind === 'Literal' ? a1.value : String(a1);
        ctx._topBlank();
        ctx.topLevel.push(`static uintptr_t ${sName}_stack[${sSize}];`);
        ctx.topLevel.push(`static uint8_t ${sName}_stack_top = 0;`);
      }
    }

    // Async/generator dispatch — state machine codegen
    if (node.async || generator) {
      const hasStaticDec = (decorators ?? []).some((d) => d.name === 'static');
      if (!hasStaticDec && ctx._allocatorName === 'static') {
        const kind = node.async && generator ? 'async generator' : node.async ? 'async function' : 'generator';
        throw ctx.errorCode('E301', null, { detail: `${kind} '${name}' must be annotated with @static when allocator is "static"` });
      }
    }
    if (node.async) { ctx.emitAsyncFunc(node); return; }
    if (generator)  { ctx.emitGeneratorFunc(node); return; }

    // If there are pending overload signatures for this function, emit one C function per signature
    const pendingSigs = name ? ctx._pendingOverloads?.get(name) : null;
    if (pendingSigs?.length) {
      ctx._pendingOverloads.delete(name);
      const implRetType = returnType ? ctx.resolveType(returnType) : 'void';
      const allOverloads: { funcName: string; params: Param[] }[] = [];
      for (const sig of pendingSigs) {
        // Build a synthetic node with this signature's params but the implementation's body
        const sigSuffix = mangleParams(sig.params, ctx._defaultNumber);
        const sigCname = `${name}${sigSuffix}`;
        const synth = { ...node, params: sig.params, _monoName: sigCname };
        ctx.visitFuncDecl(synth, isTopLevel);
        allOverloads.push({ funcName: sigCname, params: sig.params });
      }
      // Register all overloads in scope for call-site dispatch
      if (name) {
        ctx.define(name, {
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
    if ((typeParams?.length ?? 0) > 0) {
      // Check: Pick<T, K> in return type where K is a generic param → error
      if (returnType?.kind === 'TypeRef' && returnType.name === 'Pick' && returnType.typeArgs?.length >= 2) {
        const keyArg = returnType.typeArgs[1];
        const typeParamNames = new Set((typeParams ?? []).map((tp) => tp.name));
        if (keyArg.kind === 'TypeRef' && typeParamNames.has(keyArg.name)) {
          throw ctx.errorCode('E416', null, { detail: 'Pick with runtime key in return type is not supported' });
        }
      }

      ctx._genericFuncs.set(name, node);
      return;
    }
    const isNever = returnType?.kind === 'TypeRef' && returnType.name === 'never';
    // Infer return type from first return statement if no annotation
    let retType;
    if (returnType) {
      retType = ctx.resolveType(returnType);
    } else if (body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const retStmt = stmts.find((s) => s?.kind === 'Return' && s?.value);
      retType = retStmt?.kind === 'Return' && retStmt.value ? ctx.inferType(retStmt.value) : 'void';
    } else {
      retType = 'void';
    }
    const origRetType = retType;
    // Stack size: collect own bytes + callees for call-graph analysis
    let _ownBytes = 0;
    const _callees = new Set<string>();
    if (ctx._stackSize != null && body) {
      const _scanStack = (nd: unknown): void => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { (nd as unknown[]).forEach(_scanStack); return; }
        const n = nd as Record<string, unknown> & { kind?: string };
        if (n.kind === 'VarDecl') {
          const ta = n.typeAnn as Record<string, unknown> | undefined;
          if (ta?.kind === 'TypeFixedArray') {
            const et = ctx.resolveType(ta.element as TypeAnn);
            _ownBytes += (ta.size as number) * ctx._cTypeBytes(et);
          } else if (ta) {
            const ct = ctx.resolveType(ta as unknown as TypeAnn);
            _ownBytes += ctx._stackSizeOf(ct);
          } else if (n.init) {
            const ct = ctx.inferType(n.init as Expression);
            _ownBytes += ctx._stackSizeOf(ct);
          } else {
            _ownBytes += ctx._stackSizeOf(ctx._tsNameToCType(ctx._defaultNumber));
          }
        }
        if (n.kind === 'Call') {
          const callee = n.callee as Record<string, unknown> | undefined;
          if (callee?.kind === 'Ident') _callees.add(callee.name as string);
        }
        if (n.kind === 'FuncDecl' || n.kind === 'ArrowFunc') return;
        for (const v of Object.values(n)) {
          if (v && typeof v === 'object') _scanStack(v);
        }
      };
      _scanStack(body);
    }

    const suffix = node._monoName ? '' : mangleParams(params, ctx._defaultNumber);
    let cname = node._monoName ?? (name ? `${name}${suffix}` : `_anon_${ctx.lambdaCount++}`);
    if (ctx._modulePrefix && name && !node._noPrefix) cname = ctx._modulePrefix + cname;
    if (name === 'main' && !node.async && !generator) {
      cname = '_tsc_main';
      ctx._hasExplicitMain = true;
      ctx._explicitMainRetType = origRetType;
    }

    if (ctx._stackSize != null && name) {
      ctx._funcStackInfo.set(cname, { name, ownBytes: _ownBytes, callees: [..._callees] });
      if (cname !== name) ctx._funcStackInfo.set(name, { name, ownBytes: _ownBytes, callees: [..._callees] });
    }

    // Throws function handling
    const throwsTypes = node.throwsTypes ?? [];
    let throwsCtx: ThrowsCtx | null = null;
    if (throwsTypes.length > 0) {
      // Flatten throwsTypes (handles TypeUnion: throws A | B → [A, B])
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
      const retIdent = ctx.cTypeToIdent(retType);
      const resultType = `Result_${retIdent}_${errKey}`;

      // Rename 'ok' → 'ok_fn' to avoid C ambiguity
      if (cname === 'ok') cname = 'ok_fn';

      // Emit union error types on first encounter of errKey
      if (!ctx._emittedResultErrKeys.has(errKey)) {
        ctx._emittedResultErrKeys.add(errKey);
        if (throwsNames.length > 1) {
          const tagEntries = throwsNames.map((n: string, i: number) => `_Err_${n} = ${i}`).join(', ');
          ctx.addTop(`typedef enum { ${tagEntries} } _ErrTag_${errKey};`);
          ctx.addTop(`typedef struct {`);
          ctx.addTop(`    _ErrTag_${errKey} tag;`);
          ctx.addTop(`    union { ${throwsNames.map((n: string, i: number) => `${n} _${i};`).join(' ')} };`);
          ctx.addTop(`} _ErrUnion_${errKey};`);
          ctx.typedefs.push('');
        }
      }
      // Emit this function's Result type (lazy, using resolved retType)
      if (!ctx._emittedResultTypes.has(resultType)) {
        ctx._emittedResultTypes.add(resultType);
        const valPart = isVoid ? 'int _dummy' : `${retType} value`;
        if (throwsNames.length > 1) {
          ctx.addTop(`typedef struct {`);
          ctx.addTop(`    bool ok;`);
          ctx.addTop(`    union { ${valPart}; _ErrUnion_${errKey} error; };`);
          ctx.addTop(`} ${resultType};`);
        } else {
          ctx.addTop(`typedef struct { bool ok; union { ${valPart}; ${throwsNames[0]} error; }; } ${resultType};`);
        }
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

    if (name === 'main' && !node.async && !generator) {
      ctx._explicitMainThrows = throwsCtx !== null;
      ctx._explicitMainResultType = throwsCtx ? throwsCtx.resultType : null;
      ctx._explicitMainErrTypes = throwsCtx ? throwsCtx.throwsNames : null;
    }

    // never return type: body must end with throw/abort
    if (isNever && body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const last = stmts[stmts.length - 1];
      if (!last || last.kind !== 'Throw') {
        throw ctx.errorCode('E117');
      }
    }

    const hasScalarRest = params.some((p: Param) => {
      if (!p.rest) return false;
      const et2 = p.typeAnn?.kind === 'TypeArray' ? ctx.resolveType(p.typeAnn.element) : (p.typeAnn ? ctx.resolveType(p.typeAnn) : null);
      return et2 === 'Scalar';
    });

    const paramStrs = params.map((p: Param) => {
      if (p.rest) {
        // ...args: T[] → T *args, int32_t args_count (unwrap the array type)
        let et = 'int32_t';
        if (p.typeAnn) {
          // Unwrap element type without emitting Array struct typedef
          if (p.typeAnn.kind === 'TypeArray') et = ctx.resolveType(p.typeAnn.element);
          else et = ctx.resolveType(p.typeAnn);
        }
        if (et === 'Scalar') return '...';  // C variadic
        return `${et} *${p.name}, int32_t ${p.name}_count`;
      }
      if (p.destructArr) {
        // [a, b]: T[] → T *_arr  (destructured in body)
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = ctx.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = ctx.resolveType(p.typeAnn);
        return `${et} *_arr`;
      }
      if (p.typeAnn?.kind === 'TypeFunc') return ctx.typeDecl(p.typeAnn, p.name);
      // For Scalar-variadic functions: string params → const char * (C format string convention)
      if (hasScalarRest && p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'string') {
        return `const char *${p.name}`;
      }
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });

    // Define before body for recursion support.
    // For overloads: store all variants keyed by param count, and keep the first definition
    // as a sentinel so that callToC can resolve by arg count.
    if (name) {
      const existing = ctx.lookup(name);
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
        const _closureRet = returnType?.kind === 'TypeFunc' ? (returnType.ret ? ctx.resolveType(returnType.ret) : 'void') : undefined;
        ctx.define(name, { ctype: retType, funcName: cname, params, returnType, _isScalarVariadic: hasScalarRest || undefined, ...(_closureRet ? { closureRetType: _closureRet } : {}), ...symExtra });
      }
    }

    const prevFuncName = ctx._curFuncName;
    ctx._curFuncName = name;
    const lines = ctx.emitFuncBody(name, body, params, retType, null, false, false, throwsCtx, isNever);
    ctx._curFuncName = prevFuncName;
    // Track whether this function heap-allocates String return values
    if (retType === 'String') {
      const heapOps = ['tsc_string_concat','tsc_string_repeat','tsc_string_replace',
                       'tsc_string_pad','tsc_string_to_','tsc_i32_to_string','tsc_f64_to_string',
                       'tsc_i64_to_string','tsc_u32_to_string','tsc_u64_to_string',
                       'tsc_bool_to_string','tsc_char_to_string'];
      const heapsString = lines.some((l: string) => l.trimStart().startsWith('return ') &&
                                          heapOps.some((op: string) => l.includes(op)));

      if (heapsString) ctx._heapStringFuncs.add(cname);
    }
    // Special C syntax when return type is a function pointer: RET (*NAME(PARAMS))(FP_PARAMS)
    let funcSig;
    if (returnType?.kind === 'TypeFunc') {
      funcSig = `tsc_closure ${cname}(${paramStrs.join(', ') || 'void'})`;
    } else {
      const neverPrefix = isNever ? '_Noreturn ' : '';
      const retSep = retType.endsWith('*') ? '' : ' ';
      funcSig = `${neverPrefix}${retType}${retSep}${cname}(${paramStrs.join(', ') || 'void'})`;
    }
    // Add blank line before function if there's preceding content without a trailing blank
    if (ctx.topLevel.length > 0 && ctx.topLevel[ctx.topLevel.length - 1] !== '') {
      ctx.addTop('');
    }
    ctx.addTop(`${funcSig} {`);
    for (const l of lines) ctx.addTop('    ' + l);
    ctx.addTop('}');
    ctx.addTop('');
}

export function emitFuncBody(ctx: CodeGenContext, funcName: string, body: Block | null, params: Param[], retType: string, className: string | null = null, isMoveMethod = false, isMut = false, throwsCtx: ThrowsCtx | null = null, isNever = false) {
    const saved = { inFunction: ctx.inFunction, funcName: ctx.currentFuncName, retType: ctx.currentFuncReturnType, throwsCtx: ctx._throwsCtx, isNever: ctx._currentFuncIsNever,
      inMathTry: ctx._inMathTry, mathCatchLabel: ctx._mathCatchLabel, mathErrVar: ctx._mathErrVar };
    ctx.inFunction = true;
    ctx.currentFuncName = funcName;
    ctx.currentFuncReturnType = retType;
    ctx._throwsCtx = throwsCtx; // null for non-throws, ctx object for throws functions
    ctx._currentFuncIsNever = isNever;
    const lines: string[] = [];
    ctx._currentFuncLines = lines;
    ctx._funcDepth = 0;

    // Set up function-level math-try for throws MathError + safe-math
    const _throwsMathError = throwsCtx?.throwsNames?.includes('MathError') && ctx._strictRules?.has('safe-math');
    ctx._funcMathThrow = null;
    if (_throwsMathError) {
      const _mathErrVar = `_func_math_err`;
      const _mathThrowLabel = `_func_math_throw`;
      lines.push(`MathError ${_mathErrVar} = {0};`);
      ctx._inMathTry = true;
      ctx._mathCatchLabel = _mathThrowLabel;
      ctx._mathErrVar = _mathErrVar;
      ctx._funcMathThrow = { errVar: _mathErrVar, throwLabel: _mathThrowLabel };
    }

    ctx.pushScope();
    // For constructors: declare 'self' as value; for instance methods: as pointer
    const isCtor = className && (funcName === 'new' || funcName === 'constructor');
    if (className) {
      // move-method: self passed by value → use as value (not pointer)
      const selfIsPointer = !isCtor && !isMoveMethod;
      ctx.define('self', { ctype: className, isPointer: selfIsPointer });
      // 'this' keyword in source → 'self' in C; also define 'this' for Member lookup
      ctx.define('this', { ctype: className, isPointer: selfIsPointer });
      if (isCtor) lines.push(`${className} self = {0};`);
    }
    // Detect Scalar[] rest param for va_list setup
    const _scalarRest = params.find((p: Param) => {
      if (!p.rest) return false;
      const _et = p.typeAnn?.kind === 'TypeArray' ? ctx.resolveType(p.typeAnn.element) : (p.typeAnn ? ctx.resolveType(p.typeAnn) : null);
      return _et === 'Scalar';
    });
    const _nonRestParams = params.filter((p: Param) => !p.rest);
    const _lastNonRest = _nonRestParams[_nonRestParams.length - 1];

    for (const p of params) {
      if (p.rest) {
        // Rest param: element type, mark as rest
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = ctx.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = ctx.resolveType(p.typeAnn);
        if (et === 'Scalar') {
          // Scalar[] rest → va_list; setup is emitted after loop
          ctx.define(p.name, { ctype: 'va_list', _isVaList: true, _vaListName: '_va_args' });
        } else {
          ctx.define(p.name, { ctype: et, rest: true, countVar: `${p.name}_count` });
        }
      } else if (p.destructArr) {
        // Array destructuring: emit bindings at top of function body
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = ctx.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = ctx.resolveType(p.typeAnn);
        for (let i = 0; i < p.destructArr.length; i++) {
          const slot = p.destructArr[i];
          if (!slot) continue; // skip (,, c)
          lines.push(`${et} ${slot.name} = _arr[${i}];`);
          ctx.define(slot.name!, { ctype: et });
        }
      } else if (p.typeAnn) {
        const _isFuncParam = p.typeAnn.kind === 'TypeFunc';
        let _ct = _isFuncParam ? 'tsc_closure' : ctx.resolveType(p.typeAnn);
        if (_scalarRest && p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'string') _ct = 'const char *';
        const _isRef = p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'Ref';
        const _isMut = p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'Mut';
        const _isArc = p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'Arc';
        const _isBorrow = _isRef || _isMut;
        const _derefType = (_isBorrow || _isArc) && _ct.endsWith('*')
          ? ctx.resolveType((p.typeAnn as TypeRef).typeArgs?.[0] ?? {})
          : undefined;
        const _funcRet = _isFuncParam ? ((p.typeAnn as TypeFunc).ret ? ctx.resolveType((p.typeAnn as TypeFunc).ret) : 'void') : undefined;
        const _funcParams = _isFuncParam ? ((p.typeAnn as TypeFunc).params ?? []).map((pt: TypeAnn) => ctx.resolveType(pt)) : undefined;
        ctx.define(p.name, { ctype: _ct, isPointer: _ct.endsWith('*'), isRefParam: _isRef,
                              ...(_isMut ? { isMutParam: true } : {}),
                              ...(_isArc ? { isArc: true, derefType: _derefType } : {}),
                              ...(_isFuncParam ? { funcPtr: true, closureRetType: _funcRet, closureParamTypes: _funcParams } : {}),
                              ...(_derefType && !_isArc ? { derefType: _derefType } : {}) });
      }
    }
    if (_scalarRest && _lastNonRest) {
      lines.push(`va_list _va_args;`);
      lines.push(`va_start(_va_args, ${_lastNonRest.name});`);
    }
    // Pre-scan owned vars for goto cleanup pattern in throws functions
    if (throwsCtx && !isCtor) {
      const _preDecls = new Map();
      for (const stmt of (body?.body ?? [])) {
        if (stmt.kind === 'VarDecl' && stmt.typeAnn) {
          let _ctype: string | null = null;
          if (stmt.typeAnn.kind === 'TypeArray') {
            const _et = ctx.resolveType(stmt.typeAnn.element);
            _ctype = `Array_${ctx.cTypeToIdent(_et)}`;
          } else {
            _ctype = ctx.resolveType(stmt.typeAnn);
          }
          if (_ctype?.startsWith('Array_') || _ctype === 'String' || ctx.classes.has(_ctype)) {
            _preDecls.set(stmt.name, _ctype);
          }
        }
      }
      if (_preDecls.size > 0) {
        ctx._usesGotoCleanup = true;
        ctx._gotoCleanupPreDecls = _preDecls;
        ctx._throwsOwnedVars = [];
        lines.push(`${throwsCtx.resultType} _result = {0};`);
        for (const [_vn, _vt] of _preDecls) {
          lines.push(`${_vt} ${_vn} = {0};`);
        }
      }
    }

    ctx.visitBlock(body!, lines, 0);

    if (ctx._usesGotoCleanup) {
      if (throwsCtx?.isVoid) {
        const lastNonEmpty = [...lines].reverse().find((l: string) => l.trim() !== '');
        if (!lastNonEmpty?.trim().startsWith('goto cleanup')) {
          lines.push(`    _result = (${throwsCtx.resultType}){.ok = true};`);
          lines.push('    goto cleanup;');
        }
      }
      if (ctx._funcMathThrow && throwsCtx) {
        lines.push(`${ctx._funcMathThrow.throwLabel}:`);
        if (throwsCtx.throwsNames.length > 1) {
          const _idx = throwsCtx.throwsNames.indexOf('MathError');
          const _unionName = `_ErrUnion_${throwsCtx.errKey}`;
          lines.push(`    ${_unionName} _math_union = {.tag = _Err_MathError, ._${_idx} = ${ctx._funcMathThrow.errVar}};`);
          lines.push(`    _result = (${throwsCtx.resultType}){.ok = false, .error = _math_union};`);
        } else {
          lines.push(`    _result = (${throwsCtx.resultType}){.ok = false, .error = ${ctx._funcMathThrow.errVar}};`);
        }
        lines.push('    goto cleanup;');
      }
      lines.push('cleanup:');
      if (_scalarRest) lines.push('    va_end(_va_args);');
      for (let i = ctx._throwsOwnedVars.length - 1; i >= 0; i--) {
        lines.push(`    ${ctx._throwsOwnedVars[i]};`);
      }
      lines.push('    return _result;');
      ctx._usesGotoCleanup = false;
      ctx._throwsOwnedVars = [];
      ctx._gotoCleanupPreDecls = null;
    } else {
      if (isCtor) {
        ctx._emitFuncCleanup(lines, '    ');
        lines.push('return self;');
      }
      if (_scalarRest && retType === 'void' && !throwsCtx) {
        const lastNonEmpty = [...lines].reverse().find((l: string) => l.trim() !== '');
        if (!lastNonEmpty?.trim().startsWith('return ')) {
          lines.push('va_end(_va_args);');
        }
      }
      if (throwsCtx?.isVoid) {
        const lastNonEmpty = [...lines].reverse().find((l: string) => l.trim() !== '');
        if (!lastNonEmpty?.trim().startsWith('return ')) {
          ctx._emitFuncCleanup(lines, '    ');
          lines.push(`return (${throwsCtx.resultType}){.ok = true};`);
        }
      }
      if (ctx._funcMathThrow && throwsCtx) {
        lines.push(`${ctx._funcMathThrow.throwLabel}:`);
        if (throwsCtx.throwsNames.length > 1) {
          const _idx = throwsCtx.throwsNames.indexOf('MathError');
          const _unionName = `_ErrUnion_${throwsCtx.errKey}`;
          lines.push(`    ${_unionName} _math_union = {.tag = _Err_MathError, ._${_idx} = ${ctx._funcMathThrow.errVar}};`);
          lines.push(`    return (${throwsCtx.resultType}){.ok = false, .error = _math_union};`);
        } else {
          lines.push(`    return (${throwsCtx.resultType}){.ok = false, .error = ${ctx._funcMathThrow.errVar}};`);
        }
      }
    }
    ctx.popScope();

    ctx.inFunction = saved.inFunction;
    ctx.currentFuncName = saved.funcName;
    ctx.currentFuncReturnType = saved.retType;
    ctx._throwsCtx = saved.throwsCtx;
    ctx._currentFuncIsNever = saved.isNever;
    ctx._inMathTry = saved.inMathTry;
    ctx._mathCatchLabel = saved.mathCatchLabel;
    ctx._mathErrVar = saved.mathErrVar;
    ctx._funcMathThrow = null;
    return lines;
}

export function visitExtensionFunc(ctx: CodeGenContext, node: ExtensionFunc) {
    const { name, thisType, params, returnType, body } = node;
    const thisCType = ctx.resolveType(thisType);
    const thisIdent = ctx.cTypeToIdent(thisCType);

    // Check for conflict with existing class method
    if (thisType.kind === 'TypeRef' && ctx.classes.has(thisType.name)) {
      const cls = ctx.classes.get(thisType.name);
      if (cls?._methodNames?.has(name)) {
        throw ctx.errorCode('E416', null, { detail: `TypeError: extension '${name}' conflicts with existing method on ${thisType.name}` });
      }
    }

    const cFuncName = `_ext_${thisIdent}_${name}`;
    const retCType = returnType ? ctx.resolveType(returnType) : 'void';

    // Build param list: _self first, then rest
    const paramParts = [`${thisCType} _self`];
    for (const p of params) {
      const pt = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t';
      paramParts.push(`${pt} ${p.name}`);
    }

    // Emit function
    ctx.addTop(`${retCType} ${cFuncName}(${paramParts.join(', ')}) {`);
    const saved = { inFunction: ctx.inFunction, funcName: ctx.currentFuncName, retType: ctx.currentFuncReturnType };
    ctx.inFunction = true;
    ctx.currentFuncName = cFuncName;
    ctx.currentFuncReturnType = retCType;
    ctx.pushScope();
    ctx.define('this', { ctype: thisCType, _cAlias: '_self' });
    for (const p of params) {
      const pt = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t';
      ctx.define(p.name, { ctype: pt });
    }
    const lines: string[] = [];
    ctx.visitBlock(body, lines, 0);
    ctx.popScope();
    ctx.inFunction = saved.inFunction;
    ctx.currentFuncName = saved.funcName;
    ctx.currentFuncReturnType = saved.retType;
    for (const l of lines) ctx.addTop(`    ${l}`);
    ctx.addTop('}');
    ctx.addTop('');

    // Register extension for call resolution

    const key = `${thisIdent}.${name}`;
    ctx._extensions.set(key, { cFuncName, thisCType, thisIdent, retCType });
}
