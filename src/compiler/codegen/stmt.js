// stmt.js
export default {
  visitBlock(block, lines, depth) {
    this.pushScope();
    for (const s of block.body) this.visitStmt(s, lines, depth);
    this.popScope();
  },

  visitStmtInMain(node) {
    const lines = [];
    this.visitStmt(node, lines, 0);
    for (const l of lines) this.mainStmts.push(l);
  },

  visitStmt(node, lines, depth) {
    this._currentNode = node;
    const I = ' '.repeat(this.indent * depth);  // indentation at current depth
    const p = (s) => lines.push(I + s);          // push with current-depth indent
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': {
        const { varKind, name, typeAnn, init } = node;

        // Generator instantiation: const g = genFn(args) → genFn_state g = {0};
        if (init?.kind === 'Call' && init.callee?.kind === 'Ident') {
          const gi = this._generatorFuncs?.get(init.callee.name);
          if (gi) {
            const I = ' '.repeat(this.indent * depth);
            const genArgs = (init.args || []).map(a => this.exprToC(a.expr, lines, depth));
            lines.push(`${I}${gi.stateType} ${name} = {0};`);
            this.define(name, { ctype: gi.stateType, varKind, _isGenState: true,
              _genFn: init.callee.name, _genArgs: genArgs, _gi: gi });
            break;
          }
        }

        // Generator .next() result: let r = g.next() → genFn_result r = genFn_next(&g, args);
        if (init?.kind === 'Call' && init.callee?.kind === 'Member' && init.callee.prop === 'next') {
          const objName = init.callee.object?.name;
          const sym = objName ? this.lookup(objName) : null;
          if (sym?._isGenState) {
            const gi = sym._gi;
            const I = ' '.repeat(this.indent * depth);
            const objC = this.exprToC(init.callee.object, lines, depth);
            const nextArgs = [].concat(sym._genArgs || []);
            const callArgs = nextArgs.length ? `&${objC}, ${nextArgs.join(', ')}` : `&${objC}`;
            lines.push(`${I}${gi.resultType} ${name} = ${gi.nextFn}(${callArgs});`);
            this.define(name, { ctype: gi.resultType, varKind });
            break;
          }
        }

        // Match expression: const x = match { ... }
        if (init?.kind === 'Match') {
          this.emitMatchVarDecl(node, lines, depth);
          break;
        }

        // Propagate/NonNull: const x = throwsFunc()?  or  const x = throwsFunc()!
        if (init?.kind === 'Propagate' || init?.kind === 'NonNull') {
          this.emitPropagateVarDecl(node, lines, depth);
          break;
        }

        // Object.fromEntries<{a: T, b: U}>(array) → compile-time struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee?.object?.name === 'Object' &&
            init.callee?.prop === 'fromEntries' &&
            init.typeArgs?.[0]?.kind === 'TypeObject') {
          const typeArg = init.typeArgs[0];
          const fields = typeArg.fields;
          const fieldNames = fields.map(f => f.name);
          if (!this._fromEntriesCount) this._fromEntriesCount = 0;
          const structName = `_fromEntries_${this._fromEntriesCount++}`;
          const fieldDecls = fields.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
          this.classes.set(structName, { isStruct: true, fields });
          const arg = init.args[0]?.expr;
          let entriesElems = null;
          let isVar = false;
          if (arg?.kind === 'ArrayLit') {
            entriesElems = arg.elems;
          } else if (arg?.kind === 'Ident') {
            const consumed = this._fromEntriesConsumed?.get(arg.name);
            if (consumed) {
              // Emit entries typedefs now (after fromEntries struct, to match expected order)
              const et = this.resolveType(consumed.typeAnn.element);
              this.resolveType(consumed.typeAnn); // emits Array_tuple
              entriesElems = consumed.init?.kind === 'ArrayLit' ? consumed.init.elems : null;
            } else {
              const sym = this.lookup(arg.name);
              if (sym?.initNode?.kind === 'ArrayLit') entriesElems = sym.initNode.elems;
            }
            isVar = true;
          }
          const initParts = [];
          for (const elem of (entriesElems ?? [])) {
            const pair = elem.expr;
            if (pair?.kind !== 'ArrayLit' || pair.elems?.length < 2) continue;
            const keyNode = pair.elems[0]?.expr;
            const valNode = pair.elems[1]?.expr;
            if (keyNode?.kind !== 'Literal' || keyNode.litType !== 'string') continue;
            const key = keyNode.value;
            if (!fieldNames.includes(key)) throw this.error(`Object.fromEntries: key "${key}" is not a field of the target type`);
            initParts.push(`.${key} = ${this.exprToC(valNode, lines, depth)}`);
          }
          if (isVar) {
            p(`${structName} ${name} = {0};`);
            p(`${name} = (${structName}){${initParts.join(', ')}};`);
          } else {
            p(`${structName} ${name} = {${initParts.join(', ')}};`);
          }
          this.define(name, { ctype: structName, varKind });
          break;
        }

        // If consumed by fromEntries (Ident arg), defer all processing — no C emit, no typedefs yet
        if (this._fromEntriesConsumed?.has(name) && typeAnn?.kind === 'TypeArray') {
          this._fromEntriesConsumed.set(name, { typeAnn, init });
          this.define(name, { ctype: 'void', isArray: true, varKind, initNode: init });
          break;
        }

        // String.split() → special multi-statement form: String *parts; int32_t parts_len; tsc_string_split(...)
        if (!typeAnn && init?.kind === 'Call' &&
            init.callee?.kind === 'Member' && init.callee?.prop === 'split') {
          const splitObjType = this.inferType(init.callee.object);
          if (splitObjType === 'String') {
            const objC = this.exprToC(init.callee.object, lines, depth);
            const sepC = init.args[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
            const lenName = `${name}_len`;
            p(`String *${name};`);
            p(`int32_t ${lenName};`);
            p(`tsc_string_split(${objC}, ${sepC}, &${name}, &${lenName});`);
            this.define(name, { ctype: 'String *', varKind, isArray: false, isSplitResult: true, lenName });
            this._registerCleanup(`tsc_string_array_free(${name}, ${lenName})`);
            break;
          }
        }

        // new Shared<T>() → arc alloc
        if (!typeAnn && init?.kind === 'New' && init.name === 'Shared') {
          const tArg = init.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            p(`${innerType} *${name} = tsc_arc_alloc(sizeof(${innerType}));`);
            this.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isShared: true, derefType: innerType });
            this._registerCleanup(`tsc_arc_release(${name})`);
            break;
          }
        }

        // new Weak<T>(src) → weak create
        if (!typeAnn && init?.kind === 'New' && init.name === 'Weak') {
          const tArg = init.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            const argC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'NULL';
            p(`${innerType} *${name} = tsc_weak_create(${argC});`);
            this.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isWeak: true, derefType: innerType });
            this._registerCleanup(`tsc_weak_release(${name})`);
            break;
          }
        }

        // Borrow check: Shared<T> requires a heap allocator
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Shared' && this._allocatorName === 'none') {
          throw this.error(`"Shared<T>" requires a heap allocator; "none" allocator does not support ARC`);
        }

        // let x: Shared<T> = new T() → arc alloc with explicit field init
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Shared' && init?.kind === 'New' && init.name !== 'Shared') {
          const tArg = typeAnn.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            const structDef = this.classes.get(innerType);
            p(`${innerType} *${name} = tsc_arc_alloc(sizeof(${innerType}));`);
            p(`${name}->_refcount = 1;`);
            if (structDef?.fields) {
              for (const f of structDef.fields) {
                const fname = typeof f === 'string' ? f : f.name;
                p(`${name}->${fname} = 0;`);
              }
            }
            this.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isShared: true, derefType: innerType });
            this._registerCleanup(`tsc_arc_release((void **)&${name})`);
            break;
          }
        }

        // w.upgrade() → weak upgrade (result needs arc_release inside null-check)
        if (!typeAnn && init?.kind === 'Call' &&
            init.callee?.kind === 'Member' && init.callee.prop === 'upgrade') {
          const weakSym2 = init.callee.object?.kind === 'Ident' ? this.lookup(init.callee.object.name) : null;
          if (weakSym2?.isWeak) {
            const innerType2 = weakSym2.derefType;
            const weakC2 = this.exprToC(init.callee.object, lines, depth);
            p(`${innerType2} *${name} = tsc_weak_upgrade(${weakC2});`);
            this.define(name, { ctype: `${innerType2} *`, varKind, isPointer: true, isSharedUpgrade: true, derefType: innerType2 });
            break;
          }
        }

        // let b = a where a is Shared → arc retain
        if (!typeAnn && init?.kind === 'Ident') {
          const initSym3 = this.lookup(init.name);
          if (initSym3?.isShared) {
            const innerType3 = initSym3.derefType;
            p(`${innerType3} *${name} = tsc_arc_retain(${init.name});`);
            this.define(name, { ctype: `${innerType3} *`, varKind, isPointer: true, isShared: true, derefType: innerType3 });
            this._registerCleanup(`tsc_arc_release(${name})`);
            break;
          }
        }

        // Promise.resolve(expr) → Promise_T typedef + struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Promise' &&
            init.callee.prop === 'resolve') {
          const arg = init.args?.[0]?.expr;
          const innerType = arg ? this.inferType(arg) : 'int32_t';
          const typeIdent = this.cTypeToIdent(innerType);
          const promiseType = `Promise_${typeIdent}`;
          this._emitPromiseTypedef(promiseType, innerType);
          const argC = arg ? this.exprToC(arg, lines, depth) : '0';
          p(`${promiseType} ${name} = { ._done = true, ._result = ${argC}, ._ok = true };`);
          this.define(name, { ctype: promiseType, varKind });
          break;
        }

        // Promise.reject<T>(error) → Promise_T_E typedef + rejected struct
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Promise' &&
            init.callee.prop === 'reject') {
          const tArg = init.typeArgs?.[0];
          const innerType = tArg ? this.resolveType(tArg) : 'int32_t';
          const typeIdent = this.cTypeToIdent(innerType);
          const errArg = init.args?.[0]?.expr;
          const errType = errArg ? this.inferType(errArg) : 'TscError';
          const promiseType = `Promise_${typeIdent}_${errType}`;
          if (!this._emittedPromiseTypes) this._emittedPromiseTypes = new Set();
          if (!this._emittedPromiseTypes.has(promiseType)) {
            this._emittedPromiseTypes.add(promiseType);
            this._topBlank();
            this.topLevel.push(`typedef struct { bool _done; ${innerType} _result; bool _ok; ${errType} _error; } ${promiseType};`);
          }
          const errC = errArg ? this.exprToC(errArg, lines, depth) : '0';
          p(`${promiseType} ${name} = { ._done = true, ._ok = false, ._error = ${errC} };`);
          this.define(name, { ctype: promiseType, varKind });
          break;
        }

        // new Promise<T>((resolve, reject) => { ... }) → static resolve/reject pattern
        if (init?.kind === 'New' && init.name === 'Promise' && init.typeArgs?.length > 0) {
          const tArg = init.typeArgs[0];
          const innerType = this.resolveType(tArg);
          const typeIdent = this.cTypeToIdent(innerType);
          const promiseType = `Promise_${typeIdent}`;
          this._emitPromiseTypedef(promiseType, innerType);
          const lambda = init.args?.[0]?.expr;
          const lambdaIdx = this.lambdaCount++;
          const prefix = `_lambda_${lambdaIdx}`;
          const resolveName = lambda?.params?.[0]?.name ?? 'resolve';
          const rejectName = lambda?.params?.[1]?.name ?? 'reject';
          this._topBlank();
          this.topLevel.push(`static ${innerType} ${prefix}_${typeIdent}_result;`);
          this.topLevel.push(`static bool ${prefix}_done = false;`);
          this._topBlank();
          this.topLevel.push(`static void ${prefix}_resolve(${innerType} v) { ${prefix}_${typeIdent}_result = v; ${prefix}_done = true; }`);
          this.topLevel.push(`static void ${prefix}_reject(void) { ${prefix}_done = true; }`);
          this.pushScope();
          this.define(resolveName, { ctype: 'void', funcName: `${prefix}_resolve`, varKind: 'let' });
          this.define(rejectName, { ctype: 'void', funcName: `${prefix}_reject`, varKind: 'let' });
          for (const s of (lambda?.body?.body ?? [])) this.visitStmt(s, lines, depth);
          this.popScope();
          p(`${promiseType} ${name} = { ._done = ${prefix}_done, ._result = ${prefix}_${typeIdent}_result, ._ok = true };`);
          this.define(name, { ctype: promiseType, varKind });
          break;
        }

        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'never') {
          throw this.error(`"never" cannot be used as a variable type`);
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'void') {
          throw this.error(`"void" can only be used as a return type`);
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Shared' && this._allocatorName === 'none') {
          throw this.error(`"Shared<T>" requires a heap allocator; "none" allocator does not support ARC`);
        }
        // Fat-pointer assignment: let x: Interface = (new Foo() as Interface) or (new Foo())
        if (typeAnn?.kind === 'TypeRef' && this.interfaces.has(typeAnn.name)) {
          const ifaceName = typeAnn.name;
          // Unwrap `as Interface` cast if present
          const innerInit = (init?.kind === 'Cast' &&
            init.castType?.kind === 'TypeRef' && init.castType.name === ifaceName)
            ? init.expr : init;
          // new Foo() → create temp var, then fat-ptr
          if (innerInit?.kind === 'New' && this.classes.has(innerInit.name) && !this.interfaces.has(innerInit.name)) {
            const className = innerInit.name;
            const classDef = this.classes.get(className);
            const tempName = `_${innerInit.name.toLowerCase()}_${this.tempCount++}`;
            const initC = this.exprToC(innerInit, lines, depth);
            p(`${className} ${tempName} = ${initC};`);
            this.define(tempName, { ctype: className, varKind: 'let' });
            const hasExplicit = classDef?.implements_?.includes(ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
            p(`${ifaceName} ${name} = { .self = &${tempName}, .vtable = &${vtableName} };`);
            this.define(name, { ctype: ifaceName, varKind });
            break;
          }
        }
        // Fat-pointer assignment: let x: Interface = concreteVar
        if (typeAnn?.kind === 'TypeRef' && this.interfaces.has(typeAnn.name) && init?.kind === 'Ident') {
          const ifaceName = typeAnn.name;
          const argName = init.name;
          const argSym = this.lookup(argName);
          const argClass = argSym?.ctype ? this.classes.get(argSym.ctype) : null;
          if (argClass && !this.interfaces.has(argSym.ctype)) {
            const className = argSym.ctype;
            const hasExplicit = argClass.implements_?.includes(ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
            p(`${ifaceName} ${name} = {.self = &${argName}, .vtable = &${vtableName}};`);
            this.define(name, { ctype: ifaceName, varKind });
            break;
          }
        }
        let ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'double');
        // Untyped number literals: integer → int32_t, float/decimal → double
        if (!typeAnn && init && init.kind === 'Literal' && init.litType === 'number') {
          const v = init.value;
          ctype = (v.includes('.') || v.includes('e') || v.includes('E')) ? 'double' : 'int32_t';
        }
        // ObjLit with named fields and no type annotation → defer as individual consts (expanded at destructuring)
        if (!typeAnn && init?.kind === 'ObjLit' && init.props?.length > 0 && init.props.every(p => !p.spread && !p.computed)) {
          if (!this._anonStructCount) this._anonStructCount = 0;
          const anonName = `_anon_${this._anonStructCount++}`;
          const fields = init.props.map(p => {
            const ft = this.inferType(p.value);
            return { name: p.key, typeAnn: { kind: 'TypeRef', name: ft, typeArgs: [] }, _ctype: ft };
          });
          // Defer emission: don't create typedef or variable yet — expand at destructuring time
          if (!this._deferredAnons) this._deferredAnons = new Map();
          this._deferredAnons.set(name, { fields, init });
          this.define(name, { ctype: anonName, varKind, initNode: init, deferredAnon: true });
          this.classes.set(anonName, { isStruct: true, fields });
          break;
        }
        // Regular (non-const) enums, opt types, and structs don't use const qualifier in C
        const enumDef2 = this.classes.get(ctype);
        const isGenericClassInst = !enumDef2 && this._genericClasses &&
          [...this._genericClasses.keys()].some(n => ctype.startsWith(n + '_'));
        // opt_ types suppress const only when inferred (no type annotation); with explicit T|null annotation, keep const
        const suppressConst = (enumDef2?.isEnum && !enumDef2?.isConst && !enumDef2?.isStringLiteralUnion) || enumDef2?.isKeyOf || enumDef2?.isMutable || (ctype.startsWith('opt_') && !typeAnn) || ctype.startsWith('_anon_') || ctype === 'Slice_u8' || (enumDef2 && !enumDef2.isEnum && !enumDef2.isStruct && !enumDef2.isScalarAlias && !enumDef2.isTuple) || isGenericClassInst;
        const qualifier = (varKind === 'const' && !suppressConst) ? 'const ' : '';

        // Optional type (opt_T): handle null/value init
        if (ctype.startsWith('opt_') && init) {
          const isNullInit = init.kind === 'Literal' && init.litType === 'null';
          if (isNullInit) {
            p(`${qualifier}${ctype} ${name} = {false, 0};`);
          } else {
            const valC = this.exprToC(init, lines, depth);
            // If init already evaluates to opt_T (e.g., from x?.toString()), assign directly
            const initType = this.inferType(init);
            if (initType === ctype) {
              p(`${qualifier}${ctype} ${name} = ${valC};`);
            } else {
              p(`${qualifier}${ctype} ${name} = {true, ${valC}};`);
            }
          }
          // Non-negative at() index: mark as potentially OOB (null check when printing)
          // Must be read AFTER exprToC(init) which sets _lastAtNonNeg / _lastPopEmpty / _lastOptIsNull
          const atNonNeg = this._lastAtNonNeg ?? false;
          this._lastAtNonNeg = undefined;
          const emptyPop = this._lastPopEmpty ?? false;
          this._lastPopEmpty = undefined;
          const parsedNull = this._lastOptIsNull ?? false;
          this._lastOptIsNull = undefined;
          this.define(name, { ctype, varKind, optIsNull: isNullInit || atNonNeg || emptyPop || parsedNull });
          break;
        }

        // String literal union: handle string literal init → enum value
        if (enumDef2?.isStringLiteralUnion && init?.kind === 'Literal' && init.litType === 'string') {
          const val = init.value;
          if (!enumDef2.members.includes(val)) {
            throw this.error(`"${val}" is not a valid value for type ${ctype}`);
          }
          p(`${qualifier}${ctype} ${name} = ${ctype}_${val};`);
          this.define(name, { ctype, varKind });
          break;
        }

        // TypeFixedArray → C stack array: int32_t arr[N] = {elems}
        if (typeAnn?.kind === 'TypeFixedArray') {
          const et = this.resolveType(typeAnn.element);
          const size = typeAnn.size;
          if (init?.kind === 'ArrayLit') {
            const elems = this.arrayLitToC(init, et, lines, depth);
            if (elems.length !== size) {
              throw this.error(`array literal has ${elems.length} elements but type ${this.ctypeToTsName(et)}[${size}] requires exactly ${size}`);
            }
            p(`${et} ${name}[${size}] = {${elems.join(', ')}};`);
          } else if (init) {
            const initC = this.exprToC(init, lines, depth);
            p(`${et} ${name}[${size}] = ${initC};`);
          } else {
            p(`${et} ${name}[${size}] = {0};`);
          }
          this.define(name, { ctype: et, isArray: true, arraySize: size, isFixedArray: true, varKind });
          break;
        }

        // TypeArray → managed Array_T struct
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind !== 'TypeFunc') {
          const et = this.resolveType(typeAnn.element);
          const arrName = `Array_${this.cTypeToIdent(et)}`;
          this._ensureArrayStruct(arrName, et);
          const elemIdent = this.cTypeToIdent(et);

          if (!init || (init.kind === 'ArrayLit' && init.elems.length === 0)) {
            // Empty array literal or no init
            p(`${qualifier}${arrName} ${name} = {.data = NULL, .length = 0, .capacity = 0};`);
          } else if (init.kind === 'ArrayLit') {
            const litVar = `_lit_${this.tempCount++}`;
            const elems = this.arrayLitToC(init, et, lines, depth);
            p(`${et} ${litVar}[] = {${elems.join(', ')}};`);
            p(`${qualifier}${arrName} ${name} = {.data = ${litVar}, .length = ${elems.length}, .capacity = ${elems.length}};`);
          } else {
            this._newArrayElemHint = et; // hint for new Array(N) without type args
            const initC = this.exprToC(init, lines, depth);
            this._newArrayElemHint = null;
            p(`${qualifier}${arrName} ${name} = ${initC};`);
            // Register cleanup if heap-allocated (new Array or method returning new array)
            const heapKeywords = ['tsc_array_create', 'tsc_array_filter', 'tsc_array_map',
                                  'tsc_array_concat', 'tsc_array_slice'];
            if (heapKeywords.some(k => initC.includes(k))) {
              this._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
            }
          }
          this.define(name, { ctype: arrName, elemType: elemIdent, arrElemCType: et, isArray: true,
                              arraySize: init?.kind === 'ArrayLit' ? this.arrayLitSize(init) : undefined, varKind });
          break;
        }

        // Inferred Array_T type (no typeAnn, e.g. result of arr.filter/map/concat/slice)
        if (!typeAnn && ctype?.startsWith('Array_') && init) {
          const elemIdent = ctype.slice(6); // Array_i32 → i32
          const etC2 = this._arrIdentToCType(elemIdent);
          const heapKeywords = ['tsc_array_create', 'tsc_array_filter', 'tsc_array_map',
                                'tsc_array_concat', 'tsc_array_slice'];
          const initC = this.exprToC(init, lines, depth);
          const isHeap = heapKeywords.some(k => initC.includes(k));
          const suppressConst2 = this._lastSuppressConst;
          this._lastSuppressConst = undefined;
          if (isHeap) {
            p(`${ctype} ${name} = ${initC};`);
            this._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
          } else {
            const effQual2 = suppressConst2 ? '' : qualifier;
            p(`${this.varDecl(effQual2, ctype, name)} = ${initC};`);
          }
          this.define(name, { ctype, elemType: elemIdent, arrElemCType: etC2, isArray: true, varKind });
          break;
        }

        // Tuple init: let pair: [i32, string] = [1, "hello"] → struct init
        {
          const tupleDef1 = this.classes.get(ctype);
          if (tupleDef1?.isTuple && init?.kind === 'ArrayLit') {
            const initParts = [];
            let fieldIdx = 0;
            for (const el of init.elems) {
              if (el.spread) {
                // spread: [...p] → copy all fields
                const spreadSrc = this.exprToC(el.expr, lines, depth);
                const srcType = this.inferType(el.expr);
                const srcDef = this.classes.get(srcType);
                const tupleHasRest = tupleDef1.fields.some(f => f.rest);
                if (!srcDef?.isTuple && !tupleHasRest) {
                  throw this.error('cannot spread runtime array into fixed-size tuple');
                }
                if (srcDef?.isTuple) {
                  for (const f of srcDef.fields) {
                    initParts.push(`.${tupleDef1.fields[fieldIdx].name} = ${spreadSrc}.${f.name}`);
                    fieldIdx++;
                  }
                }
                continue;
              }
              const field = tupleDef1.fields[fieldIdx++];
              if (!field) continue;
              // Rest field: collect remaining elems into a temp array
              if (field.rest) {
                const tailElems = [el, ...init.elems.slice(init.elems.indexOf(el) + 1)];
                const tailVar = `_tail_${this.tempCount++}`;
                const tailVals = tailElems.map(e => this.exprToC(e.expr, lines, depth)).join(', ');
                lines.push(`${field.elemType} ${tailVar}[] = {${tailVals}};`);
                initParts.push(`.${field.name} = ${tailVar}`);
                // Skip tail_len field — add length directly
                fieldIdx++; // skip _tail_len field
                initParts.push(`._tail_len = ${tailElems.length}`);
                break; // rest consumes all remaining elements
              }
              const valC = this.exprToC(el.expr, lines, depth);
              // Optional field: wrap non-opt value in {true, val}
              if (field.ctype.startsWith('opt_')) {
                const valType = this.inferType(el.expr);
                const initVal = (valType === field.ctype) ? valC : `{true, ${valC}}`;
                initParts.push(`.${field.name} = ${initVal}`);
              } else {
                initParts.push(`.${field.name} = ${valC}`);
              }
            }
            // Fill remaining optional fields with {false, 0}
            while (fieldIdx < tupleDef1.fields.length) {
              const field = tupleDef1.fields[fieldIdx++];
              if (field.ctype.startsWith('opt_')) initParts.push(`.${field.name} = {false, 0}`);
            }
            p(`${qualifier}${ctype} ${name} = {${initParts.join(', ')}};`);
            // Track which optional fields were not provided (null)
            const nullOptFields = new Set();
            for (let i = init.elems.length; i < tupleDef1.fields.length; i++) {
              const f = tupleDef1.fields[i];
              if (f.ctype.startsWith('opt_')) nullOptFields.add(f.name);
            }
            this.define(name, { ctype, varKind, nullOptFields: nullOptFields.size > 0 ? nullOptFields : null });
            break;
          }
        }

        // TypeFunc (or TypeArray of TypeFunc): function pointer declaration
        if (typeAnn?.kind === 'TypeFunc' || (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind === 'TypeFunc')) {
          let initC;
          if (init?.kind === 'ArrayLit') {
            // {square_i32, ...} — resolve each element as function ref
            const elems = init.elems.map(e => {
              if (e.expr?.kind === 'Ident') {
                const s = this.lookup(e.expr.name);
                return s?.funcName ?? e.expr.name;
              }
              return this.exprToC(e.expr, lines, depth);
            });
            initC = `{${elems.join(', ')}}`;
          } else {
            initC = init ? this.exprToC(init, lines, depth) : '0';
          }
          p(`${this.typeDecl(typeAnn, name)} = ${initC};`);
          this.define(name, { ctype: 'void *', funcPtr: true, varKind });
          break;
        }

        if (init) {
          // Special: arrow function → closure struct or function pointer
          if (init.kind === 'Arrow') {
            const closure = this.hoistClosure(init, name);
            if (closure) {
              p(`${closure.closureName} ${name} = {.env = ${closure.envInit}, .fn = ${closure.fnName}};`);
              this.define(name, { ctype: closure.closureName, isClosure: true, closureRetType: closure.ret, varKind });
              // Mark captured variables as moved (0-indexed line number for error messages)
              const closureLine = (node.line ?? 1) - 1;
              for (const [nm] of closure.capturedVars) {
                const capSym = this.lookup(nm);
                if (capSym) capSym._movedIntoClosureLine = closureLine;
              }
              break;
            }
            const lambdaName = this.hoistArrow(init, ctype, name);
            // Function pointers don't use const qualifier on the return type
            p(`${ctype} (*${name})(${this.arrowParamTypes(init)}) = ${lambdaName};`);
          } else if (!typeAnn && init.kind === 'Ident') {
            // Possibly a function reference — check symbol table
            const sym = this.lookup(init.name);
            if (sym?.funcName && sym?.params) {
              const pts = sym.params.filter(pp => !pp.rest).map(pp => pp.typeAnn ? this.resolveType(pp.typeAnn) : 'void *');
              p(`${sym.ctype} (*${name})(${pts.join(', ') || 'void'}) = ${sym.funcName};`);
              this.define(name, { ctype: sym.ctype, funcPtr: true, varKind, funcName: sym.funcName });
              break;
            }
            // Move semantics borrow check (before emit, but set _moved AFTER)
            { const initSym2 = this.lookup(init.name);
              const structDef2 = this.classes.get(ctype);
              if (structDef2?.fields || ctype === 'String' || ctype.startsWith('Array_')) {
                if (initSym2?.varKind === 'const') {
                  throw this.error(`cannot move out of "const" binding`, null, { code: 'E003' });
                }
                if (initSym2?.isRefParam) {
                  throw this.error(`cannot move out of "Ref<T>" borrow`, null, { code: 'E004' });
                }
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = ${this.exprToC(init, lines, depth)};`);
            // Move semantics: mark source moved and zero out
            { const initSym2 = this.lookup(init.name);
              const structDef2 = this.classes.get(ctype);
              if (structDef2?.fields || ctype === 'String' || ctype.startsWith('Array_')) {
                if (initSym2) {
                  initSym2._moved = true;
                  initSym2._movedLine = node.line;
                  initSym2._movedSourceNode = init; // for secondary span
                }
              }
              if (initSym2?.varKind === 'let' && structDef2?.fields) {
                p(`${init.name} = (${ctype}){0};`);
              }
            }
          } else if (init.kind === 'ObjLit' && enumDef2?.isPartial) {
            // Partial<T> ObjLit: expand { name: "Alice" } → { .has_name = true, .name = ..., .has_age = false }
            const provided = new Map();
            for (const prop of init.props) {
              if (!prop.spread && !prop.computed) {
                provided.set(prop.key, this.exprToC(prop.value, lines, depth));
              }
            }
            const initParts = [];
            for (const f of enumDef2.fields ?? []) {
              const fname = typeof f === 'string' ? f : f.name;
              if (provided.has(fname)) {
                initParts.push(`.has_${fname} = true`);
                initParts.push(`.${fname} = ${provided.get(fname)}`);
              } else {
                initParts.push(`.has_${fname} = false`);
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = {${initParts.join(', ')}};`);
          } else {
            // Check if init is a Call whose callee returns a TypeFunc
            let callSym = null;
            if (init.kind === 'Call' && init.callee.kind === 'Ident') {
              callSym = this.lookup(init.callee.name);
            }
            if (!typeAnn && callSym?.returnType?.kind === 'TypeFunc') {
              const initC = this.exprToC(init, lines, depth);
              p(`${this.typeDecl(callSym.returnType, name)} = ${initC};`);
              this.define(name, { ctype: 'void *', funcPtr: true, varKind });
              break;
            }
            let initC;
            if (init.kind === 'Literal' && (init.litType === 'number' || init.litType === 'char')) {
              initC = this.literalToCTyped(init, ctype);
            } else {
              // For binary expressions with mixed integer types in const context:
              // cast operands and result explicitly to preserve well-defined semantics
              let mixedBinary = null;
              if (typeAnn && init.kind === 'Binary') {
                mixedBinary = this.tryConstMixedBinary(init, ctype, lines, depth);
              }
              if (mixedBinary !== null) {
                initC = mixedBinary;
              } else if (ctype === 'int64_t' && init.kind === 'Binary') {
                // For binary expressions assigned to int64_t with u32 operands,
                // widen operands individually to avoid overflow before cast
                initC = this.binaryWidened(init, ctype, lines, depth);
              } else {
                // Set expected type hint for context-sensitive calls (e.g. parseFloat with f64 annotation)
                this._expectedType = ctype;
                initC = this.exprToC(init, lines, depth);
                this._expectedType = undefined;
              }
              // Implicit type conversion checks for typed assignments (skip if already handled by mixedBinary)
              if (typeAnn && mixedBinary === null) {
                const srcType = this.inferType(init);
                // Cannot implicitly convert string literal union to string
                if (ctype === 'String') {
                  const srcEnumDef = this.classes.get(srcType);
                  if (srcEnumDef?.isStringLiteralUnion) {
                    throw this.error(`cannot implicitly convert ${srcType} to string: use ".toString()" or "as string"`);
                  }
                }
                const illegalConversions = [
                  ['size_t',    'int32_t',  'usize', 'i32'],
                  ['int32_t',   'float',    'i32',   'f32'],
                  ['int64_t',   'double',   'i64',   'f64'],
                  ['int64_t',   'uint32_t', 'i64',   'u32'],
                  ['uint64_t',  'int64_t',  'u64',   'i64'],
                ];
                for (const [src, dst, srcTs, dstTs] of illegalConversions) {
                  if (srcType === src && ctype === dst) {
                    throw this.error(`cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"`);
                  }
                }
                // Widening casts for non-binary expressions
                if (ctype === 'int64_t' && srcType === 'size_t') {
                  initC = `(int64_t)${initC}`;
                }
              }
            }
            // Cross-struct assignment: const b: Pt2 = a (where a is a different struct type)
            if (init.kind === 'Ident') {
              const initSym = this.lookup(init.name);
              const srcDef = initSym ? this.classes.get(initSym.ctype) : null;
              const dstDef = this.classes.get(ctype);
              if (srcDef?.isStruct && dstDef?.isStruct && initSym.ctype !== ctype) {
                const qualCast = qualifier === 'const ' ? 'const ' : '';
                initC = `*(${qualCast}${ctype} *)&${initC}`;
              }
            }
            // Heap-allocated map: register free call
            if (ctype.startsWith('Map_') && initC.includes('tsc_map_create')) {
              const mapSuffix = ctype.slice(4);
              p(`${this.varDecl(qualifier, ctype, name)} = ${initC};`);
              this._registerCleanup(`tsc_map_free_${mapSuffix}(&${name})`);
              this._lastArrayElemReturn = undefined;
              this._lastSuppressConst = undefined;
            // Heap-allocated string: emit as non-const and register cleanup
            } else if (ctype === 'String' && this._isHeapStringInit(init)) {
              p(`String ${name} = ${initC};`);
              this._registerCleanup(`tsc_string_free(${name})`);
            } else {
              // Suppress const if flagged by array element return or parse() result
              const effQual = (this._lastArrayElemReturn || this._lastSuppressConst) ? '' : qualifier;
              this._lastArrayElemReturn = undefined;
              this._lastSuppressConst = undefined;
              // Borrow check before emit (with typeAnn path)
              // Skip when source and target are different struct types (cross-type cast, not a move)
              if (init.kind === 'Ident') {
                const initSym2pre = this.lookup(init.name);
                const structDef2pre = this.classes.get(ctype);
                const isCrossStruct = initSym2pre?.ctype && initSym2pre.ctype !== ctype
                  && this.classes.get(initSym2pre.ctype)?.isStruct && structDef2pre?.isStruct;
                if (!isCrossStruct && (structDef2pre?.fields || ctype === 'String' || ctype.startsWith('Array_'))) {
                  if (initSym2pre?.varKind === 'const') {
                    throw this.error(`cannot move out of "const" binding`, null, { code: 'E003' });
                  }
                  if (initSym2pre?.isRefParam) {
                    throw this.error(`cannot move out of "Ref<T>" borrow`, null, { code: 'E004' });
                  }
                }
              }
              p(`${this.varDecl(effQual, ctype, name)} = ${initC};`);
              // Move semantics: mark source moved and zero out (after emit)
              if (init.kind === 'Ident') {
                const initSym2 = this.lookup(init.name);
                const structDef2 = this.classes.get(ctype);
                if (structDef2?.fields || ctype === 'String' || ctype.startsWith('Array_')) {
                  if (initSym2) {
                    initSym2._moved = true;
                    initSym2._movedLine = node.line;
                    initSym2._movedSourceNode = init; // for secondary span
                  }
                  if (initSym2?.varKind === 'let' && structDef2?.fields) {
                    p(`${init.name} = (${ctype}){0};`);
                  }
                }
              } else if (init.kind === 'Member' && init.object.kind === 'Ident') {
                // Field move: let d = obj.field → mark field as moved
                const objSym = this.lookup(init.object.name);
                const objDef = objSym ? this.classes.get(objSym.ctype) : null;
                const fieldType = objDef?.fields?.find(f => f.name === init.prop);
                if (fieldType && (fieldType.typeAnn?.name === 'string' || this.classes.has(this.resolveType(fieldType.typeAnn ?? {})))) {
                  if (!objSym._movedFields) objSym._movedFields = new Set();
                  objSym._movedFields.add(init.prop);
                  objSym._movedFieldLine = objSym._movedFieldLine ?? {};
                  objSym._movedFieldLine[init.prop] = node.line;
                  objSym._movedFieldSourceNode = objSym._movedFieldSourceNode ?? {};
                  objSym._movedFieldSourceNode[init.prop] = init; // for secondary span
                }
              }
            }
          }
        } else {
          // No initializer: declare without init
          p(`${this.varDecl(qualifier, ctype, name)};`);
        }
        // Store compile-time value for const variables with literal init (used for const-cast overflow checking)
        let constValue = undefined;
        if (varKind === 'const' && init?.kind === 'Literal' && init.litType === 'number') {
          try { constValue = BigInt(init.value.replace(/_/g, '')); } catch(_) {}
        }
        const isStringRef = typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref' &&
                            typeAnn.typeArgs?.[0]?.name === 'string';
        this.define(name, { ctype, varKind, constValue, initNode: init,
                            ...(isStringRef ? { isStringRef: true } : {}) });
        break;
      }

      case 'VarDestructObj': {
        const { varKind, pattern, typeAnn, init } = node;
        const qual = varKind === 'const' ? 'const ' : '';
        const objType = this.inferType(init);
        const structDef = this.classes.get(objType);

        // Deferred anon struct (from ObjLit Ident): expand props directly
        if (init.kind === 'Ident') {
          const _dSym = this.lookup(init.name);
          if (_dSym?.deferredAnon && this._deferredAnons?.has(init.name)) {
            const _dAnon = this._deferredAnons.get(init.name);
            const propMap2 = new Map((_dAnon.init.props ?? []).map(pr => [pr.key, pr.value]));
            for (const { name: fname } of _dAnon.fields) {
              const propVal2 = propMap2.get(fname);
              const propC2 = propVal2 ? this.exprToC(propVal2, lines, depth) : '0';
              const propType2 = propVal2 ? this.inferType(propVal2) : 'int32_t';
              p(`${qual}${propType2} _obj_${fname} = ${propC2};`);
              this.define(`_obj_${fname}`, { ctype: propType2, varKind });
            }
            for (const { name: fname, alias, defaultVal } of pattern) {
              const propType2 = this.lookup(`_obj_${fname}`)?.ctype ?? 'int32_t';
              if (defaultVal) {
                const dC2 = this.exprToC(defaultVal, lines, depth);
                p(`${qual}${propType2} ${alias} = (_obj_${fname} != 0) ? _obj_${fname} : ${dC2};`);
              } else {
                p(`${qual}${propType2} ${alias} = _obj_${fname};`);
              }
              this.define(alias, { ctype: propType2, varKind });
            }
            break;
          }
        }

        // ObjLit init: expand props directly as _obj_field variables (no anonymous struct)
        if (init.kind === 'ObjLit') {
          const propMap = new Map((init.props ?? []).map(pr => [pr.key, pr.value]));
          // First pass: emit temp vars for each prop
          for (const { name } of pattern) {
            const propVal = propMap.get(name);
            const propC = propVal ? this.exprToC(propVal, lines, depth) : '0';
            const propType = propVal ? this.inferType(propVal) : 'int32_t';
            p(`${qual}${propType} _obj_${name} = ${propC};`);
            this.define(`_obj_${name}`, { ctype: propType, varKind });
          }
          // Second pass: bind destructured names
          for (const { name, alias, defaultVal } of pattern) {
            const propType = this.lookup(`_obj_${name}`)?.ctype ?? 'int32_t';
            if (defaultVal) {
              const dC = this.exprToC(defaultVal, lines, depth);
              p(`${qual}${propType} ${alias} = (_obj_${name} != 0) ? _obj_${name} : ${dC};`);
            } else {
              p(`${qual}${propType} ${alias} = _obj_${name};`);
            }
            this.define(alias, { ctype: propType, varKind });
          }
          break;
        }

        // Ident init with type annotation: move semantics (copy fields + zero-out source)
        if (typeAnn && init.kind === 'Ident' && structDef?.fields) {
          const srcName = init.name;
          for (const { name, alias } of pattern) {
            const field = structDef.fields.find(f => (typeof f === 'string' ? f : (f.name ?? f)) === name);
            const fieldCType = field?.typeAnn ? this.resolveType(field.typeAnn) : 'int32_t';
            p(`${fieldCType} ${alias} = ${srcName}.${name};`);
            this.define(alias, { ctype: fieldCType, varKind });
          }
          p(`${srcName} = (${objType}){0};`);
          break;
        }

        // Ident init with known struct fields: emit pointer borrows
        if (init.kind === 'Ident' && structDef?.fields) {
          const srcName = init.name;
          for (const { name, alias } of pattern) {
            const field = structDef.fields.find(f => (typeof f === 'string' ? f : (f.name ?? f)) === name);
            const fieldCType = field?.typeAnn ? this.resolveType(field.typeAnn) : 'int32_t';
            p(`${qual}${fieldCType} *${alias} = &${srcName}.${name};`);
            this.define(alias, { ctype: `${fieldCType} *`, varKind, isPointer: true, derefType: fieldCType });
          }
          break;
        }

        // Fallback: copy to temp and access
        const initC = this.exprToC(init, lines, depth);
        const tmpName = `_obj_${this.tempCount++}`;
        p(`${objType} ${tmpName} = ${initC};`);
        for (const { name, alias, defaultVal } of pattern) {
          if (defaultVal) {
            const dC = this.exprToC(defaultVal, lines, depth);
            p(`${qual}int32_t ${alias} = (${tmpName}.${name} != 0) ? ${tmpName}.${name} : ${dC};`);
          } else {
            p(`${qual}int32_t ${alias} = ${tmpName}.${name};`);
          }
          this.define(alias, { ctype: 'int32_t', varKind });
        }
        break;
      }

      case 'VarDestructArr': {
        const { varKind, pattern, init } = node;
        const initType = this.inferType(init);
        const tupleDef0 = this.classes.get(initType);
        const qual = varKind === 'const' ? 'const ' : '';
        if (tupleDef0?.isTuple) {
          // Tuple destructuring: const [a, b] = pair → typed field access
          const initC = this.exprToC(init, lines, depth);
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            const field = tupleDef0.fields[i];
            const ctype = field ? field.ctype.replace(' *', '') : 'int32_t'; // strip pointer for rest
            p(`${qual}${ctype} ${elem.name} = ${initC}._${i};`);
            this.define(elem.name, { ctype, varKind });
          }
        } else if (initType?.startsWith('Array_')) {
          // Array_T destructuring: const [first, ...rest] = arr
          const elemIdent = initType.slice(6); // Array_i32 → i32
          const elemCType = this._arrIdentToCType(elemIdent);
          const srcC = this.exprToC(init, lines, depth);
          const nonRestCount = pattern.filter(e => e && !e.rest).length;
          let idx = 0;
          for (const elem of pattern) {
            if (!elem) { idx++; continue; }
            if (elem.rest) {
              // Rest: sub-array slice
              p(`${qual}${initType} ${elem.name} = {.data = ${srcC}.data + ${idx}, .length = ${srcC}.length - ${idx}, .capacity = 0};`);
              this.define(elem.name, { ctype: initType, elemType: elemIdent, arrElemCType: elemCType, isArray: true, varKind });
            } else {
              // Regular element: direct index
              p(`${qual}${elemCType} ${elem.name} = ${srcC}.data[${idx}];`);
              this.define(elem.name, { ctype: elemCType, varKind });
              idx++;
            }
          }
        } else {
          const initC = this.exprToC(init, lines, depth);
          const tmpName = `_arr_${this.tempCount++}`;
          p(`__auto_type ${tmpName} = ${initC};`);
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            if (elem.rest) {
              p(`/* rest: ${elem.name} */`);
            } else {
              p(`${qual}int32_t ${elem.name} = ${tmpName}._${i};`);
              this.define(elem.name, { ctype: 'int32_t', varKind });
            }
          }
        }
        break;
      }

      case 'ExprStmt': {
        const expr = node.expr;
        // Auto-propagate calls to throws functions inside a throws function
        if (this._throwsCtx && expr.kind === 'Call') {
          const callee = expr.callee;
          const sym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
          if (sym?._isThrowsFunc) {
            const ctx = this._throwsCtx;
            const resName = `_res_${this.tempCount++}`;
            const callC = this.exprToC(expr, lines, depth);
            p(`${sym._resultType} ${resName} = ${callC};`);
            p(`if (!${resName}.ok) { return (${ctx.resultType}){.ok = false, .error = ${resName}.error}; }`);
            if (this._postStmtCleanups?.length) {
              for (const cleanup of this._postStmtCleanups) lines.push(cleanup);
              this._postStmtCleanups = [];
            }
            break;
          }
        }
        const c = this.exprToC(node.expr, lines, depth);
        if (c && c !== '') {
          // Block-form assignments (&&=, ||=, ??=) already include semicolons
          if ((c.startsWith('{') && c.endsWith('}')) || c.startsWith('if (')) p(c);
          else p(`${c};`);
        }
        // Flush post-statement cleanups (e.g. temp strings from console.log(n.toString()))
        if (this._postStmtCleanups?.length) {
          for (const cleanup of this._postStmtCleanups) lines.push(cleanup);
          this._postStmtCleanups = [];
        }
        break;
      }

      case 'Return': {
        // Error: return inside finally block
        if (this._inFinallyBlock) {
          throw this.error('TypeError: Cannot return inside a finally block');
        }
        // Error: returning Ref to local variable (lifetime overflow)
        if (this.currentFuncReturnType?.startsWith('const ') &&
            this.currentFuncReturnType?.includes(' *') &&
            node.value?.kind === 'Ident') {
          // Check if return type is Ref<T> (i.e., const T * from resolveType)
          // and the returned value is a local (non-param) variable
          const retSym = this.lookup(node.value.name);
          if (retSym && !retSym.isPointer && !retSym.isRefParam && !retSym.funcName) {
            throw this.error(`TypeError: Cannot return reference to local variable '${node.value.name}' that does not outlive the function`);
          }
        }
        if (this._throwsCtx) {
          const ctx = this._throwsCtx;
          if (node.value) {
            const c = this.exprToC(node.value, lines, depth);
            p(`return (${ctx.resultType}){.ok = true, .value = ${c}};`);
          } else {
            p(`return (${ctx.resultType}){.ok = true};`);
          }
        } else {
          if (node.value) {
            const c = this.exprToC(node.value, lines, depth);
            p(`return ${c};`);
          } else {
            p('return;');
          }
        }
        break;
      }

      case 'If': {
        // Detect narrowing: if (x != null) → narrow x to x.value inside block
        const isNullLit = (n) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
        let narrowVar = null;
        let upgradeReleaseVar = null;
        if (node.test.kind === 'Binary' && (node.test.op === '!=' || node.test.op === '!==')) {
          const nullSide = isNullLit(node.test.right) ? 'right' : isNullLit(node.test.left) ? 'left' : null;
          if (nullSide) {
            const optSide = nullSide === 'right' ? node.test.left : node.test.right;
            if (optSide.kind === 'Ident') {
              const sym = this.lookup(optSide.name);
              if (sym?.ctype?.startsWith('opt_')) narrowVar = optSide.name;
              else if (sym?.isSharedUpgrade) upgradeReleaseVar = optSide.name;
            }
          }
        }
        const testC = this.exprToC(node.test, lines, depth);
        const alt = node.alternate;
        // Single statement consequent (no braces)?
        let hasBraces = node.consequent.kind === 'Block';
        if (narrowVar) {
          if (!this._narrowedVars) this._narrowedVars = new Set();
          this._narrowedVars.add(narrowVar);
        }
        if (hasBraces) {
          p(`if (${testC}) {`);
          this.visitBlock(node.consequent, lines, depth + 1);
          if (upgradeReleaseVar) {
            const innerI = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${innerI}tsc_arc_release(${upgradeReleaseVar});`);
          }
        } else if (node.consequent.kind === 'ExprStmt') {
          // Inline: if (cond) expr;
          const exprC = this.exprToC(node.consequent.expr, lines, depth);
          p(`if (${testC}) ${exprC};`);
        } else if (node.consequent.kind === 'Continue') {
          p(`if (${testC}) continue;`);
        } else if (node.consequent.kind === 'Break') {
          p(`if (${testC}) break;`);
        } else if (node.consequent.kind === 'Return' && !node.consequent.value) {
          p(`if (${testC}) return;`);
        } else {
          p(`if (${testC}) {`);
          this.visitStmt(node.consequent, lines, depth + 1);
          // Do NOT emit '}' here — it's emitted by the alt section or the no-alt close below
          hasBraces = true;  // treat as if braces were used, so alt/no-alt handling closes correctly
        }
        if (alt) {
          // else if: collapse into single line
          if (alt.kind === 'If') {
            p('} else if (' + this.exprToC(alt.test, lines, depth) + ') {');
            this.visitStmtOrBlock(alt.consequent, lines, depth + 1);
            // recurse for chained else-if
            let cur = alt.alternate;
            while (cur) {
              if (cur.kind === 'If') {
                p('} else if (' + this.exprToC(cur.test, lines, depth) + ') {');
                this.visitStmtOrBlock(cur.consequent, lines, depth + 1);
                cur = cur.alternate;
              } else {
                p('} else {');
                this.visitStmtOrBlock(cur, lines, depth + 1);
                cur = null;
              }
            }
            p('}');
          } else {
            p('} else {');
            this.visitStmtOrBlock(alt, lines, depth + 1);
            p('}');
          }
        } else if (hasBraces) {
          p('}');
        }
        if (narrowVar) this._narrowedVars.delete(narrowVar);
        break;
      }

      case 'Block': {
        p('{');
        this.visitBlock(node, lines, depth + 1);
        p('}');
        break;
      }

      case 'For': {
        let initC = '';
        if (node.init) {
          if (node.init.kind === 'VarDecl') {
            const { varKind, name, typeAnn, init } = node.init;
            const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
            const initExpr = init ? this.exprToC(init, lines, depth) : '0';
            initC = `${ctype} ${name} = ${initExpr}`;
            this.define(name, { ctype, varKind });
          } else if (node.init.kind === 'ExprStmt') {
            initC = this.exprToC(node.init.expr, lines, depth);
          }
        }
        const testC = node.test ? this.exprToC(node.test, lines, depth) : '';
        const updC  = node.update ? this.exprToC(node.update, lines, depth) : '';
        p(`for (${initC}; ${testC}; ${updC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'ForOf': {
        const qual = node.varKind === 'const' ? 'const ' : '';
        const II = ' '.repeat(this.indent * (depth + 1));

        // Special case: for (const [k, v] of m.entries()) → unpack MapEntry fields
        if (node.iterable.kind === 'Call' &&
            node.iterable.callee?.kind === 'Member' &&
            node.iterable.callee?.prop === 'entries' &&
            node.binding.kind === 'ArrayPattern') {
          const mapObj = node.iterable.callee.object;
          const mapSym = mapObj.kind === 'Ident' ? this.lookup(mapObj.name) : null;
          const mapType = mapSym?.ctype ?? this.inferType(mapObj);
          if (mapType?.startsWith('Map_')) {
            const mapSuffix = mapType.slice(4);
            const parts = mapSuffix.split('_');
            const kIdent = parts[0];
            const vIdent = parts.slice(1).join('_');
            const kCType = this._arrIdentToCType(kIdent);
            const vCType = this._arrIdentToCType(vIdent);
            this._ensureMapEntry(mapSuffix, kCType, vCType);
            const entryName = `MapEntry_${mapSuffix}`;
            const arrType = `Array_${entryName}`;
            const mapObjC = this.exprToC(mapObj, lines, depth);
            const entTmpName = `_entries_${this.tempCount++}`;
            const ivar = `_i_${this.loopCount++}`;
            p(`${arrType} ${entTmpName} = tsc_map_entries_${mapSuffix}(&${mapObjC});`);
            p(`for (size_t ${ivar} = 0; ${ivar} < ${entTmpName}.length; ${ivar}++) {`);
            const [kElem, vElem] = node.binding.elems;
            if (kElem) {
              lines.push(`${II}${qual}${kCType} ${kElem.name} = ${entTmpName}.data[${ivar}].key;`);
              this.define(kElem.name, { ctype: kCType, varKind: node.varKind });
            }
            if (vElem) {
              lines.push(`${II}${qual}${vCType} ${vElem.name} = ${entTmpName}.data[${ivar}].value;`);
              this.define(vElem.name, { ctype: vCType, varKind: node.varKind });
            }
            this.visitStmtOrBlock(node.body, lines, depth + 1);
            p('}');
            break;
          }
        }

        const iterC = this.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${this.loopCount++}`;
        // Infer element type: explicit annotation > array symbol > string char > default i32
        let elemType = 'int32_t';
        const iterSym = node.iterable.kind === 'Ident' ? this.lookup(node.iterable.name) : null;
        if (node.binding.kind === 'Ident' && node.binding.typeAnn) {
          elemType = this.resolveType(node.binding.typeAnn);
        } else if (iterSym?.arrElemCType) {
          elemType = iterSym.arrElemCType;
        } else if (iterSym?.ctype === 'String') {
          elemType = 'char';
        }
        const bindName = node.binding.kind === 'Ident' ? node.binding.name : null;

        p(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          lines.push(`${II}${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
          this.define(bindName, { ctype: elemType, varKind: node.varKind });
        } else if (node.binding.kind === 'ArrayPattern') {
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`${II}${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'ForIn': {
        p(`/* for-in not supported */`);
        break;
      }

      case 'While': {
        const testC = this.exprToC(node.test, lines, depth);
        p(`while (${testC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'DoWhile': {
        const testC = this.exprToC(node.test, lines, depth);
        p('do {');
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p(`} while (${testC});`);
        break;
      }

      case 'Break':
        if (node.label) p(`goto ${node.label}_break;`);
        else p('break;');
        break;
      case 'Continue':
        if (node.label) p(`goto ${node.label}_continue;`);
        else p('continue;');
        break;

      case 'Labeled': {
        const label = node.label;
        const inner = node.body;
        const usesBreak    = this.labelUsed(inner, label, 'break');
        const usesContinue = this.labelUsed(inner, label, 'continue');
        if (inner.kind === 'While' || inner.kind === 'For') {
          let headerLine;
          if (inner.kind === 'While') {
            const testC = this.exprToC(inner.test, lines, depth);
            headerLine = `while (${testC}) {`;
          } else {
            let initC = '';
            if (inner.init?.kind === 'VarDecl') {
              const { varKind, name, typeAnn, init } = inner.init;
              const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
              const initExpr = init ? this.exprToC(init, lines, depth) : '0';
              initC = `${ctype} ${name} = ${initExpr}`;
              this.define(name, { ctype, varKind });
            }
            const testC = inner.test ? this.exprToC(inner.test, lines, depth) : '';
            const updC  = inner.update ? this.exprToC(inner.update, lines, depth) : '';
            headerLine = `for (${initC}; ${testC}; ${updC}) {`;
          }
          p(headerLine);
          const bodyLines = [];
          this.visitStmtOrBlock(inner.body, bodyLines, depth + 1);
          for (const bl of bodyLines) lines.push(bl);
          if (usesContinue) {
            const II = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${II}${label}_continue:;`);
          }
          p('}');
          if (usesBreak) p(`${label}_break:;`);
        } else {
          this.visitStmt(inner, lines, depth);
        }
        break;
      }

      case 'Throw': {
        const val = node.value;
        // Error: throw inside finally block
        if (this._inFinallyBlock) {
          throw this.error('TypeError: Cannot throw inside a finally block');
        }
        // Error: throw string literal
        if (val?.kind === 'Literal' && val.litType === 'string') {
          throw this.error('can only throw Error instances, not string');
        }
        // Error: throw in function without throws declaration
        // (never-return functions are exempt — they are expected to throw/abort)
        if (!this._throwsCtx && this.inFunction && !this._currentFuncIsNever) {
          throw this.error(`function "${this.currentFuncName}" throws but does not declare "throws"`);
        }

        if (this._throwsCtx) {
          const ctx = this._throwsCtx;
          if (val?.kind === 'New') {
            const errClass = val.name;
            const msgArg = val.args?.[0];
            const msgC = msgArg ? this.exprToC(msgArg.expr ?? msgArg, lines, depth) : 'STR_LIT("")';
            if (ctx.throwsNames.length === 1) {
              // Single error type
              p(`return (${ctx.resultType}){.ok = false, .error = ${errClass}_new(${msgC})};`);
            } else {
              // Union error type
              const idx = ctx.throwsNames.indexOf(errClass);
              const errUnionName = `_ErrUnion_${ctx.errKey}`;
              p(`${errUnionName} _err = {.tag = _Err_${errClass}, ._${idx} = ${errClass}_new(${msgC})};`);
              p(`return (${ctx.resultType}){.ok = false, .error = _err};`);
            }
          } else {
            const errC = this.exprToC(val, lines, depth);
            p(`return (${ctx.resultType}){.ok = false, .error = ${errC}};`);
          }
        } else {
          // Not in throws function — fall back to tsc_throw
          if (val?.kind === 'New' && val.name === 'Error' && val.args?.length === 1) {
            const msgC = this.exprToC(val.args[0].expr ?? val.args[0], lines, depth);
            p(`tsc_throw(${msgC});`);
          } else {
            const errC = this.exprToC(val, lines, depth);
            p(`tsc_throw(${errC});`);
          }
        }
        break;
      }

      case 'TryCatch': {
        const tryStmts = node.body?.body ?? node.body ?? [];

        // Check if try body contains a call to a throws function
        const _findThrowsFuncCall = (stmts) => {
          for (const s of stmts) {
            if (s.kind === 'ExprStmt' && s.expr?.kind === 'Call') {
              const callee = s.expr.callee;
              const sym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
              if (sym?._isThrowsFunc) return s;
            }
            if (s.kind === 'VarDecl' && s.init?.kind === 'Call') {
              const callee = s.init.callee;
              const sym = callee?.kind === 'Ident' ? this.lookup(callee.name) : null;
              if (sym?._isThrowsFunc) return s;
            }
          }
          return null;
        };
        const throwsFuncCallStmt = _findThrowsFuncCall(tryStmts);

        if (throwsFuncCallStmt) {
          // New Result-based pattern
          this._emitTryCatchResult(node, tryStmts, throwsFuncCallStmt, lines, depth);
        } else {
          // Old embedded pattern (for throw new X() directly inside try)
          for (const s of tryStmts) {
            const isThrowNew = s.kind === 'Throw' && s.value?.kind === 'New';
            if (isThrowNew) {
              const val = s.value;
              const errClass = val.name;
              const errVarName = `_err_${this.tempCount++}`;
              const errC = this.exprToC(val, lines, depth);
              p(`${errClass} ${errVarName} = ${errC};`);
              for (const c of node.catches) {
                if (!c.typeAnn || c.typeAnn.name === errClass) {
                  this.pushScope();
                  this.define(c.param, { ctype: errClass, _alias: errVarName });
                  this.visitBlock(c.body, lines, depth);
                  this.popScope();
                }
              }
            } else {
              this.visitStmt(s, lines, depth);
            }
          }
          if (node.finally) {
            this._inFinallyBlock = true;
            this.visitBlock(node.finally, lines, depth);
            this._inFinallyBlock = false;
          }
        }
        break;
      }

      case 'Switch': {
        const discType = this.inferType(node.discriminant);
        if (discType === 'double' || discType === 'float') {
          throw this.error(`cannot switch on type 'f64'`, node);
        }
        for (let ci = 0; ci < node.cases.length; ci++) {
          const c = node.cases[ci];
          if (c.body.length === 0) continue;
          const last = c.body[c.body.length - 1];
          const isTerminator = last.kind === 'Break' || last.kind === 'Return' ||
                               last.kind === 'Throw' || last.kind === 'Continue';
          if (!isTerminator && ci < node.cases.length - 1) {
            throw this.error(`implicit fallthrough`, last, {
              label: 'add `break;` or `return` to end this case',
              help: ['each case must end with `break`, `return`, or `continue`'],
              code: 'E005',
            });
          }
        }
        const discC = this.exprToC(node.discriminant, lines, depth);
        const IS = ' '.repeat(this.indent * (depth + 1));
        p(`switch (${discC}) {`);
        // Check if discriminant is a string literal union type
        const discEnumDef = this.classes.get(discType);
        for (const c of node.cases) {
          if (c.test) {
            let caseC;
            if (discEnumDef?.isStringLiteralUnion && c.test.kind === 'Literal' && c.test.litType === 'string') {
              caseC = `${discType}_${c.test.value}`;
            } else {
              caseC = this.exprToC(c.test, lines, depth);
            }
            lines.push(`${IS}case ${caseC}:`);
          } else {
            lines.push(`${IS}default:`);
          }
          for (const s of c.body) this.visitStmt(s, lines, depth + 2);
        }
        p('}');
        break;
      }

      case 'Native': {
        let nativeOut = '';
        if (node.templateParts) {
          // native(`... ${expr} ...`) — interpolate expressions
          for (const part of node.templateParts) {
            if (part.kind === 'str') {
              nativeOut += part.value;
            } else if (part.kind === 'expr') {
              // Re-parse the expression source (same as _templateToC in misc.js)
              const toks = this._lex(part.src, this.filename);
              const ast = this._parse(toks);
              const exprNode = ast.body[0]?.expr ?? ast.body[0];
              nativeOut += this.exprToC(exprNode, lines, depth);
            }
          }
        } else {
          // native "..." — verbatim string, unescape escaped quotes
          nativeOut = node.content.replace(/\\"/g, '"');
        }
        // Check for undeclared types used as pointer bases: word * varname
        const knownCTypes = new Set([
          'int', 'char', 'void', 'float', 'double', 'bool', 'long', 'short', 'unsigned',
          'int8_t', 'int16_t', 'int32_t', 'int64_t',
          'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
          'size_t', 'ssize_t', 'ptrdiff_t', 'uintptr_t', 'intptr_t',
          'String', 'TscError',
        ]);
        const ptrPattern = /\b([a-zA-Z_]\w*)\s*\*/g;
        let m;
        while ((m = ptrPattern.exec(nativeOut)) !== null) {
          const typeName = m[1];
          if (!knownCTypes.has(typeName) && !this.classes.has(typeName) && !this.interfaces.has(typeName)) {
            throw this.error(`TypeError: Native block references undeclared type '${typeName}'; declare it or use @[native_type]`);
          }
        }
        p(nativeOut);
        break;
      }

      case 'Unsafe': {
        p('{');
        const prevUnsafe = this._inUnsafe;
        this._inUnsafe = true;
        this.visitBlock(node.body, lines, depth + 1);
        this._inUnsafe = prevUnsafe;
        p('}');
        break;
      }

      case 'Spawn': {
        p('/* spawn block — not yet implemented */');
        break;
      }

      case 'Noop': break;
      default:
        p(`/* unhandled stmt: ${node.kind} */`);
    }
  },

  visitStmtOrBlock(node, lines, depth) {
    if (node.kind === 'Block') this.visitBlock(node, lines, depth);
    else this.visitStmt(node, lines, depth);
  },

  // -----------------------------------------------------------------------
  // Match expression used as VarDecl initializer: const x = match { ... }
  // -----------------------------------------------------------------------
  emitMatchVarDecl(node, lines, depth) {
    const { varKind, name, typeAnn, init } = node;
    const { discriminant, cases, hasParens } = init;
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);

    // Determine discriminant C expression and type
    const discC = this.exprToC(discriminant, lines, depth);
    const discType = this.inferType(discriminant);

    // Determine result type from first arm body
    const resultType = typeAnn
      ? this.resolveType(typeAnn)
      : (cases.length > 0 ? this.inferType(cases[0].body) : 'int32_t');
    const qualifier = (varKind === 'const') ? '' : '';  // match result var is never const
    p(`${resultType} ${name};`);
    this.define(name, { ctype: resultType, varKind: 'let' });

    // Check if discriminant is an enum type
    const enumDef = this.classes.get(discType);
    const isEnum = enumDef?.isEnum && !enumDef?.isConst && !enumDef?.isStringLiteralUnion;

    // For enum discriminants: check exhaustiveness
    if (isEnum) {
      const allValues = (enumDef.members ?? []).map(m => m.name);
      const coveredEnumCases = new Set();
      let hasWild = false;
      for (const c of cases) {
        if (c.pattern.kind === 'MatchWild') hasWild = true;
        if (c.pattern.kind === 'MatchEnum') coveredEnumCases.add(c.pattern.caseName);
      }
      if (!hasWild) {
        const missing = allValues.filter(v => !coveredEnumCases.has(v));
        if (missing.length > 0) {
          throw this.error(`TypeError: Non-exhaustive match on enum '${discType}': missing cases ${missing.map(v => `'${v}'`).join(', ')}`);
        }
      }
    }

    // Emit match as switch (enum, non-parens) or if/else chain
    if (isEnum && !hasParens) {
      // Switch/case form
      p(`switch (${discC}) {`);
      for (const c of cases) {
        const bodyC = this.exprToC(c.body, lines, depth);
        if (c.pattern.kind === 'MatchEnum') {
          p(`    case ${c.pattern.enumName}_${c.pattern.caseName}: ${name} = ${bodyC}; break;`);
        } else if (c.pattern.kind === 'MatchWild') {
          p(`    default: ${name} = ${bodyC}; break;`);
        }
      }
      p('}');
    } else {
      // if/else chain form
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const bodyC = this.exprToC(c.body, lines, depth);
        const isLast = i === cases.length - 1;
        const prefix = i === 0 ? 'if' : 'else if';

        if (isLast && (c.pattern.kind === 'MatchWild' || (isEnum && c.pattern.kind === 'MatchEnum'))) {
          // Last case: emit as else
          p(`else { ${name} = ${bodyC}; }`);
        } else {
          const cond = this._matchPatternCond(c.pattern, discC, discType, enumDef);
          if (cond === null) {
            // Wildcard not at last position (just emit as else)
            p(`else { ${name} = ${bodyC}; }`);
          } else {
            p(`${prefix} (${cond}) { ${name} = ${bodyC}; }`);
          }
        }
      }
    }
  },

  // -----------------------------------------------------------------------
  // Result-based TryCatch emission
  // -----------------------------------------------------------------------
  _emitTryCatchResult(node, tryStmts, callStmt, lines, depth) {
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);
    const II = ' '.repeat(this.indent * (depth + 1));

    // Determine if this is a void ExprStmt call or a VarDecl call
    const isVoidCall = callStmt.kind === 'ExprStmt';
    const callExpr = isVoidCall ? callStmt.expr : callStmt.init;
    const varName = isVoidCall ? null : callStmt.name;
    const varKind = isVoidCall ? null : callStmt.varKind;

    // Get callee symbol for result type info
    const callee = callExpr.callee;
    const calleeSym = callee.kind === 'Ident' ? this.lookup(callee.name) : null;
    const resultType = calleeSym?._resultType ?? 'int';
    const isResultVoid = calleeSym?._resultIsVoid ?? true;

    // Emit: ResultType _res_N = call();
    const resName = `_res_${this.tempCount++}`;
    const callC = this.exprToC(callExpr, lines, depth);
    p(`${resultType} ${resName} = ${callC};`);

    const catches = node.catches ?? [];
    const isUnionError = (calleeSym?._resultErrTypes?.length ?? 0) > 1;

    if (isVoidCall || isResultVoid) {
      // Simple: if (!ok) { catch }
      p(`if (!${resName}.ok) {`);
      this._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
      p('}');
    } else {
      // Non-void: value is used; check if there are subsequent statements
      const callIdx = tryStmts.indexOf(callStmt);
      const restStmts = tryStmts.slice(callIdx + 1);
      if (restStmts.length === 0) {
        // No rest stmts: if (!ok) { catch }
        p(`if (!${resName}.ok) {`);
        this._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
        p('}');
      } else {
        // Rest stmts: if (ok) { var = value; rest... } else { catch }
        p(`if (${resName}.ok) {`);
        const valType = calleeSym?._resultValueType ?? 'int32_t';
        const qualifier = (varKind === 'const' && valType !== 'String') ? 'const ' : '';
        lines.push(`${II}${qualifier}${valType} ${varName} = ${resName}.value;`);
        this.pushScope();
        this.define(varName, { ctype: valType, varKind });
        for (const s of restStmts) this.visitStmt(s, lines, depth + 1);
        this.popScope();
        p('} else {');
        this._emitCatchBodies(catches, resName, calleeSym, lines, depth + 1);
        p('}');
      }
    }

    // Finally block (always emitted, never inside if)
    if (node.finally) {
      this._inFinallyBlock = true;
      this.visitBlock(node.finally, lines, depth);
      this._inFinallyBlock = false;
    }
  },

  _emitCatchBodies(catches, resName, calleeSym, lines, depth) {
    const I = ' '.repeat(this.indent * depth);
    const II = ' '.repeat(this.indent * (depth + 1));
    const isUnion = (calleeSym?._resultErrTypes?.length ?? 0) > 1;

    if (catches.length === 0) return;

    if (catches.length === 1) {
      const c = catches[0];
      // Union catch clause: catch (e: ErrA | ErrB) — no binding, just body
      const isUnionCatch = c.typeAnn?.kind === 'TypeUnion';
      if (isUnionCatch) {
        this.pushScope();
        this.visitBlock(c.body, lines, depth);
        this.popScope();
      } else {
        const errClass = c.typeAnn?.name ?? 'void';
        const errExpr = isUnion
          ? `${resName}.error._${calleeSym?._resultErrTypes?.indexOf(errClass) ?? 0}`
          : `${resName}.error`;
        lines.push(`${I}${errClass} ${c.param} = ${errExpr};`);
        // Suppress unused-variable warning if param not referenced in body
        const bodyStr = JSON.stringify(c.body);
        if (!bodyStr.includes(`"name":"${c.param}"`)) lines.push(`${I}(void)${c.param};`);
        this.pushScope();
        this.define(c.param, { ctype: errClass });
        this.visitBlock(c.body, lines, depth);
        this.popScope();
      }
    } else {
      // Multiple catch clauses → union tag dispatch (if/else if chain)
      for (let i = 0; i < catches.length; i++) {
        const c = catches[i];
        const errClass = c.typeAnn?.name ?? 'void';
        if (i === 0) {
          lines.push(`${I}if (${resName}.error.tag == _Err_${errClass}) {`);
        } else {
          lines.push(`${I}} else if (${resName}.error.tag == _Err_${errClass}) {`);
        }
        lines.push(`${II}${errClass} ${c.param} = ${resName}.error._${i};`);
        this.pushScope();
        this.define(c.param, { ctype: errClass });
        this.visitBlock(c.body, lines, depth + 1);
        this.popScope();
      }
      lines.push(`${I}}`);
    }
  },

  // -----------------------------------------------------------------------
  // Propagate/NonNull VarDecl: const x = throwsFunc()?  or  !
  // -----------------------------------------------------------------------
  emitPropagateVarDecl(node, lines, depth) {
    const { varKind, name, typeAnn, init } = node;
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);

    const isProp = init.kind === 'Propagate';
    const innerExpr = init.expr; // the inner Call (or other) expression

    // Get callee symbol
    const callee = innerExpr?.callee;
    const calleeSym = (callee?.kind === 'Ident') ? this.lookup(callee.name) : null;

    if (!calleeSym?._isThrowsFunc) {
      if (isProp) {
        const calleeName = callee?.kind === 'Ident' ? callee.name : '?';
        throw this.error(`TypeError: Cannot use '?' on '${calleeName}()': function does not throw`);
      }
      // NonNull on non-throws: just emit normally
      const c = this.exprToC(innerExpr, lines, depth);
      const ctype = typeAnn ? this.resolveType(typeAnn) : this.inferType(innerExpr);
      const qualifier = (varKind === 'const' && ctype !== 'String') ? 'const ' : '';
      p(`${qualifier}${ctype} ${name} = ${c};`);
      this.define(name, { ctype, varKind });
      return;
    }

    // Throws function: emit Result-based propagation
    const resultType = calleeSym._resultType;
    const resName = `_res_${this.tempCount++}`;
    const callC = this.exprToC(innerExpr, lines, depth);
    p(`${resultType} ${resName} = ${callC};`);

    if (this._throwsCtx) {
      // Inside a throws function: propagate error
      p(`if (!${resName}.ok) { return (${this._throwsCtx.resultType}){.ok = false, .error = ${resName}.error}; }`);
    } else {
      // Outside throws function: panic on error (!), error on ? (already caught above)
      p(`if (!${resName}.ok) { tsc_panic(${resName}.error._base.message); }`);
    }

    // Bind the value
    const valueType = calleeSym._resultValueType ?? 'int32_t';
    const qualifier = (varKind === 'const' && valueType !== 'String') ? 'const ' : '';
    p(`${qualifier}${valueType} ${name} = ${resName}.value;`);
    this.define(name, { ctype: valueType, varKind });
  },

  // Generate a C condition expression for a match pattern
  _matchPatternCond(pattern, discC, discType, enumDef) {
    switch (pattern.kind) {
      case 'MatchWild': return null; // becomes else
      case 'MatchNull': return `!${discC}.has_value`;
      case 'MatchLit': {
        if (pattern.litType === 'string') return `tsc_string_eq(${discC}, STR_LIT("${pattern.value}"))`;
        return `${discC} == ${pattern.value}`;
      }
      case 'MatchRange': return `${discC} >= ${pattern.lo} && ${discC} <= ${pattern.hi}`;
      case 'MatchEnum': return `${discC} == ${pattern.enumName}_${pattern.caseName}`;
      case 'MatchIdent': {
        // Bare identifier: check if it's a known enum value or treat as wildcard
        if (enumDef) {
          const allValues = enumDef.values?.map(v => typeof v === 'string' ? v : v.name) ?? [];
          if (allValues.includes(pattern.name)) return `${discC} == ${discType}_${pattern.name}`;
        }
        return null; // treat as wildcard
      }
      case 'MatchOr': {
        const parts = pattern.patterns.map(p => this._matchPatternCond(p, discC, discType, enumDef)).filter(Boolean);
        return parts.join(' || ');
      }
      case 'MatchTuple': {
        // Check each non-wildcard element against the corresponding tuple field
        const conds = [];
        for (let i = 0; i < pattern.elements.length; i++) {
          const el = pattern.elements[i];
          if (el.kind === 'MatchWild') continue;
          const fieldC = `${discC}._${i}`;
          const cond = this._matchPatternCond(el, fieldC, null, null);
          if (cond) conds.push(cond);
        }
        return conds.length > 0 ? conds.join(' && ') : '1';
      }
      default: return '1';
    }
  },

};
