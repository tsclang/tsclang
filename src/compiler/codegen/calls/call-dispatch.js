export default {
  callToC(node, lines, depth) {
    const { callee, args } = node;

    // Namespace import: Lib.someFunc(...) в†’ desugar to Ident call
    if (callee.kind === 'Member' && callee.object?.kind === 'Ident') {
      const nsSym = this.lookup(callee.object.name);
      if (nsSym?._isNamespace) {
        const nsEntry = nsSym._namespaceExports?.[callee.prop];
        if (nsEntry) {
          this.define(callee.prop, nsEntry);
          // Re-dispatch as Ident call so mangling and type inference work normally
          const syntheticCall = { ...node, callee: { kind: 'Ident', name: callee.prop } };
          return this.callToC(syntheticCall, lines, depth);
        }
      }
    }

    // Generator .next() call: gen.next() в†’ genFn_next(&gen, ...storedArgs)
    if (callee.kind === 'Member' && callee.prop === 'next') {
      const objName = callee.object?.name ?? callee.object;
      const sym = typeof objName === 'string' ? this.lookup(objName) : null;
      if (sym?._isGenState) {
        const { gi, callExpr } = this._genNextCall(sym, this.exprToC(callee.object, lines, depth));
        if (lines !== undefined) {
          const I = ' '.repeat(this.indent * depth);
          const rVar = `_r_${(this._genResultCount = (this._genResultCount || 0) + 1) - 1}`;
          lines.push(`${I}${gi.resultType} ${rVar} = ${callExpr};`);
          this.define(rVar, { ctype: gi.resultType, varKind: 'let' });
          return rVar;
        }
        return callExpr;
      }
    }

    // Optional chaining: x?.method() where x is opt_T
    if (callee.kind === 'OptChain') {
      const obj = callee.object;
      const objType = this.inferType(obj);
      const objC = this.exprToC(obj, lines, depth);
      if (objType?.startsWith('opt_')) {
        const innerIdent = objType.slice(4);
        if (callee.prop === 'toString') {
          // Ensure opt_string typedef is emitted
          if (!this._emittedOptStructs.has('opt_string')) {
            this._emittedOptStructs.add('opt_string');
            this.addTop(`typedef struct { bool has_value; String value; } opt_string;`);
          }
          const fnName = `tsc_${innerIdent}_to_string`;
          return `${objC}.has_value ? (opt_string){true, ${fnName}(${objC}.value)} : (opt_string){false, STR_LIT("")}`;
        }
      }
      // Fallback: treat as non-optional
      const objC2 = this.exprToC(obj, lines, depth);
      return `${objC2}.${callee.prop}(${this.argsToC(args, lines, depth)})`;
    }

    // @platform check: calling a function skipped for current platform
    if (callee.kind === 'Ident' && this._platformSkipped?.has(callee.name)) {
      const allowed = this._platformSkipped.get(callee.name).join('", "');
      const target = this._targetName ?? 'desktop';
      throw this.error(`TypeError: '${callee.name}' is only available on platform "${allowed}", but current target is "${target}"`);
    }

    // super(args) in constructor в†’ initialize base struct
    if (callee.kind === 'Ident' && callee.name === 'super') {
      const selfSym = this.lookup('self');
      const cls = selfSym ? this.classes.get(selfSym.ctype) : null;
      const superClass = cls?.superClass;
      if (superClass === 'Error') {
        // super(msg) в†’ self._base.message = msg
        const msgC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        return `self._base.message = ${msgC}`;
      } else if (superClass) {
        // super(args) в†’ self._base = BaseClass_new(args)
        const argsC = this.argsToC(args, lines, depth);
        return `self._base = ${superClass}_new(${argsC})`;
      }
      return '/* super */';
    }


    const _r = this._dispatchConcurrency(node, lines, depth); if (_r !== null) return _r;
    const _r2 = this._dispatchBuiltin(node, lines, depth); if (_r2 !== null) return _r2;
    const _r3 = this._dispatchStdLib(node, lines, depth); if (_r3 !== null) return _r3;
    const _r4 = this._dispatchConversion(node, lines, depth); if (_r4 !== null) return _r4;

    // Generic function call: monomorphize
    if (callee.kind === 'Ident' && this._genericFuncs?.has(callee.name)) {
      return this.callGeneric(callee.name, node.typeArgs ?? [], args, lines, depth);
    }

    // Plain function call вЂ” look up mangled name in scope
    let calleeC;
    let sym = null;
    if (callee.kind === 'Ident') {
      sym = this.lookup(callee.name);
      // Overload resolution: if there are multiple overloads, pick by arg count then type
      if (sym?.overloads && sym.overloads.length > 0) {
        const argCount = args.filter(a => !a.spread).length;
        // First filter by arg count
        const countMatches = sym.overloads.filter(o => o.params.filter(p => !p.rest).length === argCount);
        let match;
        if (countMatches.length === 1) {
          match = countMatches[0];
        } else if (countMatches.length > 1) {
          // Multiple count matches: pick by type
          match = countMatches.find(o =>
            args.every((a, i) => {
              const p = o.params[i];
              if (!p?.typeAnn) return true;
              const expectedCtype = this.resolveType(p.typeAnn);
              const actualCtype = this.inferType(a.expr);
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
        // avr/hal direct calls that return values: set _lastHalRead so stmt.js emits (void)name;
        if (sym?._suppressVoidWarning && sym.ctype !== 'void') this._lastHalRead = sym.ctype;
      }
    } else {
      calleeC = this.exprToC(callee, lines, depth);
    }

    // Closure call: name(args) в†’ name.fn(&name.env, args)
    if (sym?.isClosure && callee.kind === 'Ident') {
      const argsC = this.argsToC(args, lines, depth);
      const callArgs = argsC ? `&${callee.name}.env, ${argsC}` : `&${callee.name}.env`;
      return `${callee.name}.fn(${callArgs})`;
    }

    // Libc variadic call or user Scalar-variadic call: pass args as raw C values
    if (sym?._isLibcVariadic || sym?._isScalarVariadic) {
      const _libcVmap = { printf: 'vprintf', fprintf: 'vfprintf', sprintf: 'vsprintf', snprintf: 'vsnprintf', scanf: 'vscanf', sscanf: 'vsscanf', fscanf: 'vfscanf' };
      const _toRawArg = (a) => {
        // Spread of a va_list в†’ va_list variable name (for v-variant forwarding)
        if (a.spread) {
          const spreadSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
          if (spreadSym?._isVaList) return { isVaList: true, vaListName: spreadSym._vaListName };
          return { raw: `/* ...${this.exprToC(a.expr, lines, depth)} */` };
        }
        if (a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          return { raw: `"${a.expr.value.replace(/"/g, '\\"')}"` };
        }
        const ac = this.exprToC(a.expr, lines, depth);
        const at = this.inferType(a.expr);
        return { raw: at === 'String' ? `${ac}.data` : ac };
      };
      const processed = args.map(_toRawArg);
      const vaListArg = processed.find(p => p.isVaList);
      if (vaListArg) {
        // Forward to v-variant: printf(fmt, ...args) в†’ vprintf(fmt, _va_args)
        const vName = _libcVmap[calleeC] ?? ('v' + calleeC);
        const normalParts = processed.filter(p => !p.isVaList).map(p => p.raw);
        normalParts.push(vaListArg.vaListName);
        return `${vName}(${normalParts.join(', ')})`;
      }
      return `${calleeC}(${processed.map(p => p.raw).join(', ')})`;
    }

    // Check for any-typed params: cannot pass typed value as any
    if (sym?.params) {
      for (let i = 0; i < sym.params.length && i < args.length; i++) {
        const p = sym.params[i];
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'any') {
          const argType = this.inferType(args[i].expr);
          if (argType !== 'void *' && argType !== null && argType !== undefined) {
            const tsType = this.ctypeToTsName(argType);
            throw this.error(`cannot pass ${tsType} as "any": any is opaque across function boundaries`);
          }
        }
      }
    }

    // Check if callee has a rest param вЂ” if so, bundle variadic args into a temp array
    const symParams = sym?.params;
    const restIdx = symParams ? symParams.findIndex(p => p.rest) : -1;
    if (restIdx >= 0) {
      const restParam = symParams[restIdx];
      let et = 'int32_t';
      if (restParam.typeAnn?.kind === 'TypeArray') et = this.resolveType(restParam.typeAnn.element);
      else if (restParam.typeAnn) et = this.resolveType(restParam.typeAnn);
      // Normal args before rest
      const normalArgs = args.slice(0, restIdx).map(a => this.exprToC(a.expr, lines, depth));
      // Variadic args from restIdx onward
      const varArgs = args.slice(restIdx);
      const I = ' '.repeat(this.indent * depth);
      const restName = `_rest_${this.restCount++}`;
      const varArgsC = varArgs.map(a => this.exprToC(a.expr, lines, depth)).join(', ');
      lines.push(`${I}${et} ${restName}[] = {${varArgsC}};`);
      const allArgs = [...normalArgs, restName, String(varArgs.length)];
      return `${calleeC}(${allArgs.join(', ')})`;
    }

    // Fill in default params at call site if fewer args are provided (skip if any spread arg)
    const hasSpread = args.some(a => a.spread);
    if (!hasSpread && symParams && args.length < symParams.filter(p => !p.rest).length) {
      const normalParams = symParams.filter(p => !p.rest);
      const filled = normalParams.map((p, i) => {
        if (i < args.length) return this.exprToC(args[i].expr, lines, depth);
        if (p.defaultVal) return this.exprToC(p.defaultVal, lines, depth);
        return '0'; // fallback (shouldn't happen if type-checked)
      });
      return `${calleeC}(${filled.join(', ')})`;
    }

    // If we have symParams, coerce string literals to enum values for string-literal-union params
    // (only when no spread args вЂ” spread needs argsToC expansion)
    const hasSpreadArgs = args.some(a => a.spread);
    if (symParams && !hasSpreadArgs) {
      const I = ' '.repeat(this.indent * depth);
      const coercedArgs = args.map((a, i) => {
        const param = symParams[i];
        if (!param) return this.exprToC(a.expr, lines, depth);
        const paramType = param.typeAnn ? this.resolveType(param.typeAnn) : null;
        const paramEnumDef = paramType ? this.classes.get(paramType) : null;
        if (paramEnumDef?.isStringLiteralUnion && a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          const val = a.expr.value;
          if (!paramEnumDef.members.includes(val)) {
            throw this.error(`"${val}" is not a valid value for type ${paramType}`);
          }
          return `${paramType}_${val}`;
        }
        // ObjLit arg to struct param: prefix with (StructType)
        if (paramEnumDef?.isStruct && a.expr.kind === 'ObjLit') {
          const initC = this.exprToC(a.expr, lines, depth);
          return `(${paramType})${initC}`;
        }
        // Array struct arg to destructured array param (int32_t *_arr): pass .data
        if (param.destructArr) {
          const argSym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
          if (argSym?.ctype?.startsWith('Array_')) {
            return `${this.exprToC(a.expr, lines, depth)}.data`;
          }
        }
        // Borrow check: cannot pass const variable as Mut<T> (non-interface only;
        // interface Mut<T> is caught below with a better message)
        if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Mut' &&
            a.expr.kind === 'Ident') {
          const innerCheck = param.typeAnn.typeArgs?.[0]?.name;
          if (!innerCheck || !this.interfaces.has(innerCheck)) {
            const argSym = this.lookup(a.expr.name);
            if (argSym?.varKind === 'const') {
              throw this.error(`cannot borrow "${a.expr.name}" as mutable: it is a const binding`);
            }
          }
        }
        // Interface param (or Mut<Interface>): wrap concrete class arg in fat pointer
        // Also handle `c as Shape` cast вЂ” unwrap to the inner ident
        const ifaceName = this._getIfaceParamName(param.typeAnn);
        const rawArgExpr = (ifaceName && a.expr.kind === 'Cast' &&
          a.expr.castType?.kind === 'TypeRef' && a.expr.castType.name === ifaceName)
          ? a.expr.expr : a.expr;
        if (ifaceName && this.interfaces.has(ifaceName) && rawArgExpr.kind === 'Ident') {
          const a2 = { ...a, expr: rawArgExpr };
          a = a2;
          const argName = a.expr.name;
          // Check: cannot pass const variable as Mut<Interface>
          if (param.typeAnn?.kind === 'TypeRef' && param.typeAnn.name === 'Mut') {
            const argVarInfo = this.lookup(argName);
            if (argVarInfo?.varKind === 'const') {
              const mutIfaceName = param.typeAnn.typeArgs?.[0]?.name ?? ifaceName;
              throw this.error(`TypeError: Cannot pass const variable '${argName}' as Mut<${mutIfaceName}>`);
            }
          }
          const argSym3 = this.lookup(argName);
          const argClass = argSym3?.ctype ? this.classes.get(argSym3.ctype) : null;
          if (argClass && !this.interfaces.has(argSym3.ctype)) {
            // Concrete class: wrap in fat pointer
            const className = argSym3.ctype;
            const hasExplicit = argClass.implements_?.includes(ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
            const fatName = `_${param.name}_${argName}`;
            // Reuse existing fat-ptr variable if already declared in scope
            if (!this.lookup(fatName)) {
              lines.push(`${I}${ifaceName} ${fatName} = { .self = &${argName}, .vtable = &${vtableName} };`);
              this.define(fatName, { ctype: ifaceName });
            }
            return fatName;
          }
        }
        // Ref<T>/Mut<T> param: pass &var (for non-interface inner types)
        if (param.typeAnn?.kind === 'TypeRef' &&
            (param.typeAnn.name === 'Ref' || param.typeAnn.name === 'Mut')) {
          const innerName2 = param.typeAnn.typeArgs?.[0]?.name;
          if (!innerName2 || !this.interfaces.has(innerName2)) {
            const argSym2 = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
            if (argSym2 && a.expr.kind === 'Ident') {
              if (param.typeAnn.name === 'Mut') {
                // Cannot mutably borrow while an immutable borrow is active
                if (argSym2._refBorrowed) {
                  throw this.error(
                    `TypeError: Cannot create mutable borrow of '${a.expr.name}' while immutable borrow is active`,
                    a.expr
                  );
                }
                // Cannot pass to two *different* Mut<T> borrowers in the same scope
                if (argSym2._mutBorrowedBy && argSym2._mutBorrowedBy !== calleeC) {
                  throw this.error(
                    `TypeError: Cannot create two simultaneous mutable borrows of '${a.expr.name}'`,
                    a.expr
                  );
                }
                argSym2._mutBorrowedBy = calleeC;
              } else {
                // Ref<T>: mark as immutably borrowed (for future Mut<T> checks)
                argSym2._refBorrowed = true;
              }
            }
            const argC2 = this.exprToC(a.expr, lines, depth);
            if (!argSym2?.isPointer && !argSym2?.ctype?.endsWith('*')) return `&${argC2}`;
            return argC2;
          }
        }
        return this.exprToC(a.expr, lines, depth);
      });
      return `${calleeC}(${coercedArgs.join(', ')})`;
    }

    const argsC = this.argsToC(args, lines, depth);
    return `${calleeC}(${argsC})`;
  },
};
