import { mangleParams } from '../../types.js';
// func.js
export default {
  visitEnum(node) {
    const { name, members, isConst } = node;
    let counter = 0;
    // Detect string enum: first member with a string value
    const isStringEnum = members.some(m => m.value?.litType === 'string');
    const entries = members.map(m => {
      if (isStringEnum) {
        const strVal = m.value ? m.value.value : m.name;
        const idx = counter++;
        return { name: m.name, val: String(idx), strVal };
      }
      const val = m.value ? this.exprToC(m.value) : String(counter++);
      if (m.value) { try { counter = parseInt(val) + 1; } catch {} }
      return { name: m.name, val };
    });
    this.addTop(`typedef enum { ${entries.map(e => `${name}_${e.name} = ${e.val}`).join(', ')} } ${name};`);
    if (!isConst) {
      if (isStringEnum) {
        this.addTop(`static const char *${name}_strings[] = { ${entries.map(e => `"${e.strVal}"`).join(', ')} };`);
      } else {
        this.addTop(`static const ${name} ${name}_values[] = { ${entries.map(e => `${name}_${e.name}`).join(', ')} };`);
        this.addTop(`static const char *${name}_names[] = { ${entries.map(e => `"${e.name}"`).join(', ')} };`);
      }
    }
    this.addTop('');
    this.classes.set(name, { isEnum: true, isStringEnum, isConst, members: entries });
  },

  // ----------------------------------------------------------------
  // Global variables
  // ----------------------------------------------------------------
  visitGlobalVar(node) {
    const { varKind, name, typeAnn, init } = node;
    const isConst = varKind === 'const';
    const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
    const qualifier = isConst ? 'static const ' : 'static ';
    if (init) {
      const initC = this.exprToC(init);
      this.addTop(`${qualifier}${ctype} ${name} = ${initC};`);
    } else {
      this.addTop(`${qualifier}${ctype} ${name} = {0};`);
    }
    this.addTop('');
    this.define(name, { ctype, varKind });
  },

  // ----------------------------------------------------------------
  // Functions
  // ----------------------------------------------------------------
  visitFuncDecl(node, isTopLevel = false, isExported = false) {
    if (!node.body) return; // overload signature
    const { name, params, returnType, body, generator, decorators, typeParams } = node;

    // @platform(...) decorator: only emit for matching target
    const platformDec = (decorators ?? []).find(d => d.name === 'platform');
    if (platformDec) {
      const allowed = (platformDec.args ?? []).map(a => a.value ?? a);
      const target = this._targetName ?? 'desktop';
      if (!allowed.includes(target)) {
        if (name) this._platformSkipped.set(name, allowed);
        return; // skip for this platform
      }
    }

    // Decorator functions: store instead of emitting C
    if (node.isDecorator || (name && this._decoratorNames?.has(name))) {
      this._decoratorFns.set(name, node);
      // Apply own decorators to standalone functions
      const ownDecs = decorators ?? [];
      if (ownDecs.length > 0) {
        this._emitDecoratedStandaloneFunc(node, ownDecs);
      }
      return;
    }

    // Regular function with known decorators applied → emit as decorated standalone
    const knownDecs = (decorators ?? []).filter(d => this._decoratorFns?.has(d.name));
    if (knownDecs.length > 0) {
      this._emitDecoratedStandaloneFunc(node, knownDecs);
      return;
    }

    // #[isr(...)] annotation → forbid await and throw inside
    if (this._pendingIsrAnnotation) {
      const pendingIsr = this._pendingIsrAnnotation;
      this._pendingIsrAnnotation = null;
      if (node.async) throw this.error(`TypeError: Cannot use 'await' inside an ISR handler '${name}'`);
      const bodyHasThrowIsr = (stmts) => (stmts ?? []).some(s => s.kind === 'Throw' || bodyHasThrowIsr(s.body?.body ?? s.body ?? []));
      if (bodyHasThrowIsr(body?.body ?? [])) throw this.error(`"throw" is not allowed inside ISR handler '${name}'`);
    } else {
      this._pendingIsrAnnotation = null;
    }

    // @embedded.isr("VECTOR") decorator → ISR(VECTOR_vect) { ... }
    const isrDecorator = (decorators ?? []).find(d => d.name === 'embedded.isr');
    if (isrDecorator) {
      const vectorArg = isrDecorator.args?.[0];
      const vectorName = vectorArg?.litType === 'string' ? vectorArg.value : 'UNKNOWN';
      // Throw not allowed inside ISR
      const bodyHasThrow = (stmts) => (stmts ?? []).some(s => s.kind === 'Throw' || bodyHasThrow(s.body?.body ?? s.body ?? []));
      if (bodyHasThrow(body?.body ?? [])) throw this.error(`"throw" is not allowed inside @embedded.isr handlers`);
      const funcLines = [];
      this.pushScope();
      for (const p2 of (params ?? [])) this.define(p2.name, { ctype: p2.typeAnn ? this.resolveType(p2.typeAnn) : 'int32_t', varKind: 'let' });
      const bodyLines = [];
      this.visitBlock(body, bodyLines, 1);
      this.popScope();
      funcLines.push(`ISR(${vectorName}_vect) {`);
      for (const l of bodyLines) funcLines.push(l);
      funcLines.push('}');
      for (const l of funcLines) this.addTop(l);
      this.addTop('');
      return;
    }

    // @embedded.stack("name", N) → emit static stack arrays in BSS
    for (const dec of (node.decorators ?? [])) {
      if (dec.name === 'embedded.stack' && dec.args?.length >= 2) {
        const sName = dec.args[0]?.value ?? dec.args[0];
        const sSize = dec.args[1]?.value ?? dec.args[1];
        this._topBlank();
        this.topLevel.push(`static uintptr_t ${sName}_stack[${sSize}];`);
        this.topLevel.push(`static uint8_t ${sName}_stack_top = 0;`);
      }
    }

    // Async/generator dispatch — state machine codegen
    if (node.async || generator) {
      const hasStaticDec = (node.decorators ?? []).some(d => d.name === 'static');
      if (!hasStaticDec && this._allocatorName === 'static') {
        const kind = node.async && generator ? 'async generator' : node.async ? 'async function' : 'generator';
        throw this.error(`TypeError: ${kind} '${name}' must be annotated with @static when allocator is "static"`);
      }
    }
    if (node.async) { this.emitAsyncFunc(node); return; }
    if (generator)  { this.emitGeneratorFunc(node); return; }

    // If there are pending overload signatures for this function, emit one C function per signature
    const pendingSigs = name ? this._pendingOverloads?.get(name) : null;
    if (pendingSigs?.length) {
      this._pendingOverloads.delete(name);
      const implRetType = returnType ? this.resolveType(returnType) : 'void';
      const allOverloads = [];
      for (const sig of pendingSigs) {
        // Build a synthetic node with this signature's params but the implementation's body
        const sigSuffix = mangleParams(sig.params);
        const sigCname = `${name}${sigSuffix}`;
        const synth = { ...node, params: sig.params, _monoName: sigCname };
        this.visitFuncDecl(synth, isTopLevel);
        allOverloads.push({ funcName: sigCname, params: sig.params });
      }
      // Register all overloads in scope for call-site dispatch
      if (name) {
        this.define(name, {
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
    if (typeParams?.length > 0) {
      // Check: Pick<T, K> in return type where K is a generic param → error
      if (returnType?.kind === 'TypeRef' && returnType.name === 'Pick' && returnType.typeArgs?.length >= 2) {
        const keyArg = returnType.typeArgs[1];
        const typeParamNames = new Set(typeParams.map(tp => tp.name));
        if (keyArg.kind === 'TypeRef' && typeParamNames.has(keyArg.name)) {
          throw this.error(`Pick with runtime key in return type is not supported`);
        }
      }

      this._genericFuncs.set(name, node);
      return;
    }
    const isNever = returnType?.kind === 'TypeRef' && returnType.name === 'never';
    // Infer return type from first return statement if no annotation
    let retType;
    if (returnType) {
      retType = this.resolveType(returnType);
    } else if (body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const retStmt = stmts.find(s => s.kind === 'Return' && s.value);
      retType = retStmt ? this.inferType(retStmt.value) : 'void';
    } else {
      retType = 'void';
    }
    const origRetType = retType;
    // Stack size check
    if (this._stackSize != null && body) {
      let stackBytes = 0;
      const _scanStack = (nd) => {
        if (!nd || typeof nd !== 'object') return;
        if (Array.isArray(nd)) { nd.forEach(_scanStack); return; }
        if (nd.kind === 'VarDecl' && nd.typeAnn?.kind === 'TypeFixedArray') {
          const et = this.resolveType(nd.typeAnn.element);
          stackBytes += nd.typeAnn.size * this._cTypeBytes(et);
        }
        if (nd.kind === 'FuncDecl' || nd.kind === 'ArrowFunc') return;
        for (const v of Object.values(nd)) {
          if (v && typeof v === 'object') _scanStack(v);
        }
      };
      _scanStack(body);
      if (stackBytes > this._stackSize) {
        throw this.error(`Warning: Worst-case stack depth (${stackBytes} bytes) exceeds stack_size (${this._stackSize} bytes) in '${name}()'`);
      }
    }

    const suffix = node._monoName ? '' : mangleParams(params);
    let cname = node._monoName ?? (name ? `${name}${suffix}` : `_anon_${this.lambdaCount++}`);
    if (this._modulePrefix && name && !node._noPrefix) cname = this._modulePrefix + cname;
    // Rename user-defined main() to avoid conflict with generated int main()
    if (name === 'main' && !node.async && !generator) {
      cname = '_tsc_main';
      this._hasExplicitMain = true;
      this._explicitMainRetType = origRetType;
    }

    // Throws function handling
    const throwsTypes = node.throwsTypes ?? [];
    let throwsCtx = null;
    if (throwsTypes.length > 0) {
      // Flatten throwsTypes (handles TypeUnion: throws A | B → [A, B])
      const throwsNames = (() => {
        const names = [];
        for (const t of throwsTypes) {
          if (t.kind === 'TypeRef') names.push(t.name);
          else if (t.kind === 'TypeUnion') {
            for (const inner of t.types) { if (inner.kind === 'TypeRef') names.push(inner.name); }
          }
        }
        return names;
      })();
      const errKey = throwsNames.join('_');
      const isVoid = retType === 'void';
      const retIdent = this.cTypeToIdent(retType);
      const resultType = `Result_${retIdent}_${errKey}`;

      // Rename 'ok' → 'ok_fn' to avoid C ambiguity
      if (cname === 'ok') cname = 'ok_fn';

      // Emit all Result typedefs for this errKey (first time only)
      if (!this._emittedResultErrKeys.has(errKey)) {
        this._emittedResultErrKeys.add(errKey);
        if (throwsNames.length > 1) {
          // Union error: emit _ErrTag + _ErrUnion + blank + all Results + blank
          const tagEntries = throwsNames.map((n, i) => `_Err_${n} = ${i}`).join(', ');
          this.addTop(`typedef enum { ${tagEntries} } _ErrTag_${errKey};`);
          this.addTop(`typedef struct {`);
          this.addTop(`    _ErrTag_${errKey} tag;`);
          this.addTop(`    union { ${throwsNames.map((n, i) => `${n} _${i};`).join(' ')} };`);
          this.addTop(`} _ErrUnion_${errKey};`);
          this.typedefs.push('');  // blank between _ErrUnion and Result typedefs
        }
        // Emit all Result types for this errKey (in pre-scan order)
        const resultList = this._resultTypesByErrKey.get(errKey) ?? [];
        for (const r of resultList) {
          if (throwsNames.length > 1) {
            // Union: multi-line Result
            const valPart = r.retCtype === 'void' ? 'int _dummy' : `${r.retCtype} value`;
            this.addTop(`typedef struct {`);
            this.addTop(`    bool ok;`);
            this.addTop(`    union { ${valPart}; _ErrUnion_${errKey} error; };`);
            this.addTop(`} ${r.resultName};`);
          } else {
            // Single: single-line Result
            const valPart = r.retCtype === 'void' ? 'int _dummy' : `${r.retCtype} value`;
            this.addTop(`typedef struct { bool ok; union { ${valPart}; ${throwsNames[0]} error; }; } ${r.resultName};`);
          }
        }
        if (throwsNames.length > 1) this.typedefs.push('');  // blank after union Result typedefs
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

    // never return type: body must end with throw/abort
    if (isNever && body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const last = stmts[stmts.length - 1];
      if (!last || last.kind !== 'Throw') {
        throw this.error(`function with return type "never" must not return`);
      }
    }

    const hasScalarRest = params.some(p => {
      if (!p.rest) return false;
      const et2 = p.typeAnn?.kind === 'TypeArray' ? this.resolveType(p.typeAnn.element) : (p.typeAnn ? this.resolveType(p.typeAnn) : null);
      return et2 === 'Scalar';
    });

    const paramStrs = params.map(p => {
      if (p.rest) {
        // ...args: T[] → T *args, int32_t args_count (unwrap the array type)
        let et = 'int32_t';
        if (p.typeAnn) {
          // Unwrap element type without emitting Array struct typedef
          if (p.typeAnn.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
          else et = this.resolveType(p.typeAnn);
        }
        if (et === 'Scalar') return '...';  // C variadic
        return `${et} *${p.name}, int32_t ${p.name}_count`;
      }
      if (p.destructArr) {
        // [a, b]: T[] → T *_arr  (destructured in body)
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        return `${et} *_arr`;
      }
      if (p.typeAnn?.kind === 'TypeFunc') return this.typeDecl(p.typeAnn, p.name);
      // For Scalar-variadic functions: string params → const char * (C format string convention)
      if (hasScalarRest && p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'string') {
        return `const char *${p.name}`;
      }
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });

    // Define before body for recursion support.
    // For overloads: store all variants keyed by param count, and keep the first definition
    // as a sentinel so that callToC can resolve by arg count.
    if (name) {
      const existing = this.lookup(name);
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
        const _closureRet = returnType?.kind === 'TypeFunc' ? (returnType.ret ? this.resolveType(returnType.ret) : 'void') : undefined;
        this.define(name, { ctype: retType, funcName: cname, params, returnType, _isScalarVariadic: hasScalarRest || undefined, ...(_closureRet ? { closureRetType: _closureRet } : {}), ...symExtra });
      }
    }

    const lines = this.emitFuncBody(name, body, params, retType, null, false, false, throwsCtx, isNever);
    // Track whether this function heap-allocates String return values
    if (retType === 'String') {
      const heapOps = ['tsc_string_concat','tsc_string_repeat','tsc_string_replace',
                       'tsc_string_pad','tsc_string_to_','tsc_i32_to_string','tsc_f64_to_string',
                       'tsc_i64_to_string','tsc_u32_to_string','tsc_u64_to_string',
                       'tsc_bool_to_string','tsc_char_to_string'];
      const heapsString = lines.some(l => l.trimStart().startsWith('return ') &&
                                          heapOps.some(op => l.includes(op)));

      if (heapsString) this._heapStringFuncs.add(cname);
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
    if (this.topLevel.length > 0 && this.topLevel[this.topLevel.length - 1] !== '') {
      this.addTop('');
    }
    this.addTop(`${funcSig} {`);
    for (const l of lines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');
  },

  emitFuncBody(funcName, body, params, retType, className = null, isMoveMethod = false, isMut = false, throwsCtx = null, isNever = false) {
    const saved = { inFunction: this.inFunction, funcName: this.currentFuncName, retType: this.currentFuncReturnType, throwsCtx: this._throwsCtx, isNever: this._currentFuncIsNever, funcCleanup: this._funcCleanup, funcCleanupSet: this._funcCleanupSet };
    this.inFunction = true;
    this._funcCleanup = [];
    this._funcCleanupSet = new Set();
    this.currentFuncName = funcName;
    this.currentFuncReturnType = retType;
    this._throwsCtx = throwsCtx; // null for non-throws, ctx object for throws functions
    this._currentFuncIsNever = isNever;
    const lines = [];
    this._currentFuncLines = lines;
    this._funcDepth = 0;

    this.pushScope();
    // For constructors: declare 'self' as value; for instance methods: as pointer
    const isCtor = className && (funcName === 'new' || funcName === 'constructor');
    if (className) {
      // move-method: self passed by value → use as value (not pointer)
      const selfIsPointer = !isCtor && !isMoveMethod;
      this.define('self', { ctype: className, isPointer: selfIsPointer });
      // 'this' keyword in source → 'self' in C; also define 'this' for Member lookup
      this.define('this', { ctype: className, isPointer: selfIsPointer });
      if (isCtor) lines.push(`${className} self = {0};`);
    }
    // Detect Scalar[] rest param for va_list setup
    const _scalarRest = params.find(p => {
      if (!p.rest) return false;
      const _et = p.typeAnn?.kind === 'TypeArray' ? this.resolveType(p.typeAnn.element) : (p.typeAnn ? this.resolveType(p.typeAnn) : null);
      return _et === 'Scalar';
    });
    const _nonRestParams = params.filter(p => !p.rest);
    const _lastNonRest = _nonRestParams[_nonRestParams.length - 1];

    for (const p of params) {
      if (p.rest) {
        // Rest param: element type, mark as rest
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        if (et === 'Scalar') {
          // Scalar[] rest → va_list; setup is emitted after loop
          this.define(p.name, { ctype: 'va_list', _isVaList: true, _vaListName: '_va_args' });
        } else {
          this.define(p.name, { ctype: et, rest: true, countVar: `${p.name}_count` });
        }
      } else if (p.destructArr) {
        // Array destructuring: emit bindings at top of function body
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        for (let i = 0; i < p.destructArr.length; i++) {
          const slot = p.destructArr[i];
          if (!slot) continue; // skip (,, c)
          lines.push(`${et} ${slot.name} = _arr[${i}];`);
          this.define(slot.name, { ctype: et });
        }
      } else if (p.typeAnn) {
        const _isFuncParam = p.typeAnn.kind === 'TypeFunc';
        let _ct = _isFuncParam ? 'tsc_closure' : this.resolveType(p.typeAnn);
        if (_scalarRest && p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'string') _ct = 'const char *';
        const _isRef = p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'Ref';
        const _isMut = p.typeAnn.kind === 'TypeRef' && p.typeAnn.name === 'Mut';
        const _isBorrow = _isRef || _isMut;
        const _derefType = _isBorrow && _ct.endsWith('*')
          ? this.resolveType(p.typeAnn.typeArgs?.[0] ?? {})
          : undefined;
        const _funcRet = _isFuncParam ? (p.typeAnn.ret ? this.resolveType(p.typeAnn.ret) : 'void') : undefined;
        this.define(p.name, { ctype: _ct, isPointer: _ct.endsWith('*'), isRefParam: _isRef,
                              ...(_isFuncParam ? { funcPtr: true, closureRetType: _funcRet } : {}),
                              ...(_derefType ? { derefType: _derefType } : {}) });
      }
    }
    if (_scalarRest && _lastNonRest) {
      lines.push(`va_list _va_args;`);
      lines.push(`va_start(_va_args, ${_lastNonRest.name});`);
      this._registerCleanup('va_end(_va_args)');
    }
    this.visitBlock(body, lines, 0);
    if (isCtor) {
      this._emitFuncCleanup(lines, '    ');
      lines.push('return self;');
    }
    // For void Scalar-variadic functions: emit va_end cleanup before implicit fall-through
    if (_scalarRest && retType === 'void' && !throwsCtx) {
      const lastNonEmpty = [...lines].reverse().find(l => l.trim() !== '');
      if (!lastNonEmpty?.trim().startsWith('return ')) {
        this._emitFuncCleanup(lines, '');
      }
    }
    // For void throws functions: add implicit {.ok=true} return if last stmt isn't a return
    if (throwsCtx?.isVoid) {
      const lastNonEmpty = [...lines].reverse().find(l => l.trim() !== '');
      if (!lastNonEmpty?.trim().startsWith('return ')) {
        this._emitFuncCleanup(lines, '    ');
        lines.push(`return (${throwsCtx.resultType}){.ok = true};`);
      }
    }
    this.popScope();

    this.inFunction = saved.inFunction;
    this.currentFuncName = saved.funcName;
    this.currentFuncReturnType = saved.retType;
    this._throwsCtx = saved.throwsCtx;
    this._currentFuncIsNever = saved.isNever;
    this._funcCleanup = saved.funcCleanup;
    this._funcCleanupSet = saved.funcCleanupSet;
    return lines;
  },

  visitExtensionFunc(node) {
    const { name, thisType, params, returnType, body } = node;
    const thisCType = this.resolveType(thisType);
    const thisIdent = this.cTypeToIdent(thisCType);

    // Check for conflict with existing class method
    if (thisType.kind === 'TypeRef' && this.classes.has(thisType.name)) {
      const cls = this.classes.get(thisType.name);
      if (cls._methodNames?.has(name)) {
        throw this.error(`TypeError: extension '${name}' conflicts with existing method on ${thisType.name}`);
      }
    }

    const cFuncName = `_ext_${thisIdent}_${name}`;
    const retCType = returnType ? this.resolveType(returnType) : 'void';

    // Build param list: _self first, then rest
    const paramParts = [`${thisCType} _self`];
    for (const p of params) {
      const pt = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      paramParts.push(`${pt} ${p.name}`);
    }

    // Emit function
    this.addTop(`${retCType} ${cFuncName}(${paramParts.join(', ')}) {`);
    const saved = { inFunction: this.inFunction, funcName: this.currentFuncName, retType: this.currentFuncReturnType };
    this.inFunction = true;
    this.currentFuncName = cFuncName;
    this.currentFuncReturnType = retCType;
    this.pushScope();
    this.define('this', { ctype: thisCType, _cAlias: '_self' });
    for (const p of params) {
      const pt = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      this.define(p.name, { ctype: pt });
    }
    const lines = [];
    this.visitBlock(body, lines, 0);
    this.popScope();
    this.inFunction = saved.inFunction;
    this.currentFuncName = saved.funcName;
    this.currentFuncReturnType = saved.retType;
    for (const l of lines) this.addTop(`    ${l}`);
    this.addTop('}');
    this.addTop('');

    // Register extension for call resolution

    const key = `${thisIdent}.${name}`;
    this._extensions.set(key, { cFuncName, thisCType, thisIdent, retCType });
  }
};
