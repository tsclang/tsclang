// misc.js
export default {
  newToC(node, lines, depth) {
    const { name, args } = node;
    const argsC = this.argsToC(args, lines, depth);

    // new Error("msg") → (TscError){ .message = STR_LIT("msg") }
    if (name === 'Error') {
      const msgArg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `(TscError){ .message = ${msgArg} }`;
    }

    // new Map<K,V>() → tsc_map_create_K_V()
    if (name === 'Map') {
      const [kt, vt] = (node.typeArgs ?? []).map(t => this.resolveType(t));
      const k = kt ? this.cTypeToIdent(kt) : 'string';
      const v = vt ? this.cTypeToIdent(vt) : 'i32';
      const suffix = `${k}_${v}`;
      // Emit Map_K_V struct only when the target type is Map_* (not TscMap_* from runtime.h)
      if (!this._expectedType?.startsWith('TscMap_')) {
        this._ensureMapStruct(suffix);
      }
      return `tsc_map_create_${k}_${v}()`;
    }

    // new Array<T>(N) or new Array(N) — heap-allocated array
    if (name === 'Array') {
      // Determine element type from type args or annotation context
      let et = 'int32_t';
      if (node.typeArgs?.[0]) et = this.resolveType(node.typeArgs[0]);
      else if (this._newArrayElemHint) et = this._newArrayElemHint;
      const elemIdent = this.cTypeToIdent(et);
      const arrName = `Array_${elemIdent}`;
      this._ensureArrayStruct(arrName, et);
      const capArg = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_array_create_${elemIdent}(${capArg})`;
    }

    // new Shared<T>()
    if (name === 'Shared') {
      if (this._allocatorName === 'none') {
        throw this.error(`"Shared<T>" requires a heap allocator; "none" allocator does not support ARC`);
      }
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'void';
      return `tsc_arc_alloc(sizeof(${t}))`;
    }

    // new Weak<T>(val)
    if (name === 'Weak') {
      return `tsc_weak_create(${argsC})`;
    }

    // new Atomic<T>(val)
    if (name === 'Atomic') {
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'int32_t';
      return `{.value = ${argsC || '0'}}`;
    }

    // new Channel<T>(cap)
    if (name === 'Channel') {
      const t = node.typeArgs?.[0] ? this.cTypeToIdent(this.resolveType(node.typeArgs[0])) : 'i32';
      return `{ ._inner = tsc_channel_create_${t}(${argsC}) }`;
    }

    // new Signal<T>(val)
    if (name === 'Signal') {
      const t = node.typeArgs?.[0] ? this.cTypeToIdent(this.resolveType(node.typeArgs[0])) : 'i32';
      return `tsc_signal_create_${t}(${argsC})`;
    }

    // new Promise<T>(...)
    if (name === 'Promise') {
      return `/* new Promise */ {0}`;
    }

    // new URL(...)
    if (name === 'URL') {
      if (args.length === 1) return `tsc_url_parse(${argsC})`;
      if (args.length === 2) return `tsc_url_parse_relative(${argsC.split(', ')[0]}, &${argsC.split(', ')[1]})`;
    }

    // Generic class instantiation: new Box<i32>(42) → Box_i32_new(42)
    if (this._genericClasses?.has(name)) {
      const tmpl = this._genericClasses.get(name);
      const typeArgs = node.typeArgs ?? [];
      const subst = new Map();
      for (let i = 0; i < tmpl.typeParams.length; i++) {
        const ct = typeArgs[i] ? this.resolveType(typeArgs[i]) : 'int32_t';
        subst.set(tmpl.typeParams[i].name, ct);
      }
      const suffix = tmpl.typeParams.map(tp => this.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
      const monoName = `${name}_${suffix}`;
      if (!this._emittedGenericClasses) this._emittedGenericClasses = new Set();
      if (!this._emittedGenericClasses.has(monoName)) {
        this._emittedGenericClasses.add(monoName);
        this.emitMonoClass(tmpl, monoName, subst);
      }
      return `${monoName}_new(${argsC})`;
    }

    // Known class with constructor
    const cls = this.classes.get(name);
    if (cls) {
      const hasCtor = cls.methods?.some(m => m.name === 'constructor');
      // Suppress const for class instances unless ALL fields are readonly
      const allReadonly = cls.fields?.length > 0 &&
        cls.fields.every(f => f.modifiers?.includes('readonly'));
      if (!allReadonly) this._lastSuppressConst = true;
      if (hasCtor) return `${name}_new(${argsC})`;
      // Throws classes have a synthesized _new(String msg) function
      if (cls._isThrowsClass) return `${name}_new(${argsC})`;
      return `{0}`;
    }

    // Unknown: zero-init struct
    this._lastSuppressConst = true;
    return `(${name}){0}`;
  },

  // ----------------------------------------------------------------
  // Arrow function hoisting
  // ----------------------------------------------------------------
  hoistArrow(node, retType, hint) {
    const n = this.lambdaCount++;
    // Determine return type from body
    let ret = retType === 'void' ? this.inferArrowReturn(node) : retType;
    // Name uses the mangled return type (e.g. _lambda_0_i32)
    const retSuffix = this.cTypeToIdent(ret);
    const name = `_lambda_${n}_${retSuffix}`;
    const paramStrs = (node.params ?? []).map((p, i) => {
      const hinted = this._lambdaParamHint?.[i];
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : (hinted ?? 'void *');
      return `${ct} ${p.name}`;
    });
    const lines = [];
    if (node.body.kind === 'Block') {
      this.visitBlock(node.body, lines, 0);
    } else {
      const c = this.exprToC(node.body, lines, 0);
      lines.push(`return ${c};`);
    }
    this.addLambda(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');
    return name;
  },

  inferArrowReturn(node) {
    if (node.returnType) return this.resolveType(node.returnType);
    if (node.body.kind !== 'Block') {
      // Push lambda params into scope for type inference
      if (node.params?.length && this._lambdaParamHint) {
        this.pushScope();
        for (let i = 0; i < node.params.length; i++) {
          const p = node.params[i];
          const ct = p.typeAnn ? this.resolveType(p.typeAnn) : (this._lambdaParamHint[i] ?? 'void *');
          this.define(p.name, { ctype: ct });
        }
      }
      const t = this.inferType(node.body);
      if (node.params?.length && this._lambdaParamHint) this.popScope();
      return t;
    }
    return 'void';
  },

  // Format a variable declaration: qualifier + ctype + name with proper pointer spacing
  varDecl(qualifier, ctype, name) {
    if (ctype.endsWith(' *')) return `${qualifier}${ctype}${name}`;
    return `${qualifier}${ctype} ${name}`;
  },

  arrowParamTypes(node) {
    return (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
  },

  // Expand an ArrayLit's elements into C initializer strings, handling spreads.
  // Spread `...arr` on a known C array expands to arr[0], arr[1], ...
  arrayLitToC(node, _elemType, lines, depth) {
    const result = [];
    for (const e of node.elems) {
      if (e.spread) {
        // Expand spread from known array
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          const useData = sym.ctype?.startsWith('Array_');
          for (let i = 0; i < sym.arraySize; i++) {
            result.push(useData ? `${e.expr.name}.data[${i}]` : `${e.expr.name}[${i}]`);
          }
        } else {
          result.push(`/* ...${this.exprToC(e.expr, lines, depth)} */`);
        }
      } else {
        result.push(this.exprToC(e.expr, lines, depth));
      }
    }
    return result;
  },

  // Count the static size of an ArrayLit (expanding spread if possible)
  arrayLitSize(node) {
    let count = 0;
    for (const e of node.elems) {
      if (e.spread) {
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) count += sym.arraySize;
        else return -1; // unknown
      } else {
        count++;
      }
    }
    return count;
  },

  // Returns true if the expression will produce a heap-allocated String
  _isHeapStringInit(node) {
    if (!node) return false;
    if (node.kind === 'Binary' && node.op === '+') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      return lt === 'String' || rt === 'String';
    }
    if (node.kind === 'TemplateLit') {
      return node.parts.some(p => p.kind === 'expr');
    }
    if (node.kind === 'Call') {
      if (node.callee.kind === 'Ident' && node.callee.name === 'String') return true;
      // User-defined function call that heap-allocates its String return value
      if (node.callee.kind === 'Ident') {
        const sym = this.lookup(node.callee.name);
        if (sym?.ctype === 'String') {
          // Check the mangled name (accounting for overloads)
          const funcName = sym.funcName ?? node.callee.name;
          if (this._heapStringFuncs?.has(funcName)) return true;
          // Check overloads
          if (sym.overloads?.some(o => this._heapStringFuncs?.has(o.funcName))) return true;
        }
      }
      if (node.callee.kind === 'Member') {
        const prop = node.callee.prop;
        // Methods that return heap-allocated String
        const heapStringProps = new Set([
          'toString', 'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd',
          'repeat', 'replace', 'replaceAll', 'padStart', 'padEnd', 'charAt',
          'slice', 'substring', 'concat',
        ]);
        if (heapStringProps.has(prop)) {
          const objType = this.inferType(node.callee.object);
          // String.toString() is a no-op — not heap allocated
          if (prop === 'toString' && objType === 'String') return false;
          // Only heap if called on a String object
          if (objType === 'String') return true;
          // toString() on any non-string type is also heap
          if (prop === 'toString') return true;
        }
      }
    }
    return false;
  },

  // Expand a TemplateLit node into a C expression (concat or format)
  _templateToC(node, lines, depth) {
    const parts = node.parts; // [{kind:'str',value:'...'} | {kind:'expr',src:'...'}]
    const hasSubs = parts.some(p => p.kind === 'expr');
    if (!hasSubs) {
      // Plain string, no substitutions
      const text = parts.map(p => p.value ?? '').join('');
      return `STR_LIT("${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
    }

    // Parse and compile each expression part
    const compiled = parts.map(p => {
      if (p.kind === 'str') return { kind: 'str', value: p.value };
      // Re-parse the expression source
      const toks = this._lex(p.src, this.filename);
      const ast = this._parse(toks);
      const exprNode = ast.body[0]?.expr ?? ast.body[0];
      const t = this.inferType(exprNode);
      const c = this.exprToC(exprNode, lines, depth);
      return { kind: 'expr', t, c };
    });

    // If all expressions are strings → use tsc_string_concat chain
    const allStrings = compiled.every(p => p.kind === 'str' || p.t === 'String');
    if (allStrings) {
      const pieces = [];
      for (const p of compiled) {
        if (p.kind === 'str') { if (p.value) pieces.push(`STR_LIT("${p.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`); }
        else pieces.push(p.c);
      }
      if (pieces.length === 0) return 'STR_LIT("")';
      if (pieces.length === 1) return pieces[0];
      return pieces.reduce((acc, p) => `tsc_string_concat(${acc}, ${p})`);
    }

    // Mixed types → use tsc_string_format
    let fmt = '';
    const fmtArgs = [];
    for (const p of compiled) {
      if (p.kind === 'str') {
        fmt += p.value.replace(/%/g, '%%');
      } else {
        const t = p.t, c = p.c;
        if (t === 'int32_t' || t === 'int16_t' || t === 'int8_t') { fmt += '%d'; fmtArgs.push(c); }
        else if (t === 'uint32_t' || t === 'uint16_t' || t === 'uint8_t') { fmt += '%u'; fmtArgs.push(c); }
        else if (t === 'int64_t')  { fmt += '%lld'; fmtArgs.push(`(long long)${c}`); }
        else if (t === 'uint64_t') { fmt += '%llu'; fmtArgs.push(`(unsigned long long)${c}`); }
        else if (t === 'double')   { fmt += '%g'; fmtArgs.push(c); }
        else if (t === 'float')    { fmt += '%g'; fmtArgs.push(`(double)${c}`); }
        else if (t === 'bool')     { fmt += '%s'; fmtArgs.push(`(${c}) ? "true" : "false"`); }
        else if (t === 'String')   { fmt += '%.*s'; fmtArgs.push(`(int)${c}.length, ${c}.data`); }
        else                       { fmt += '%d'; fmtArgs.push(c); }
      }
    }
    return `tsc_string_format("${fmt}", ${fmtArgs.join(', ')})`;
  },

  // ----------------------------------------------------------------
  // Closure helpers
  // ----------------------------------------------------------------

  // Walk an AST node and collect all Ident references that are free variables
  // (defined in outer scope, not in params or locally defined within the body).
  _findFreeVars(body, paramNames) {
    const params = new Set(paramNames);
    const builtins = new Set(['true','false','null','undefined','this','self','console','Math','Object','Array','String','Number','Boolean','NaN','Infinity']);
    const captured = new Map(); // name → symInfo
    const seen = new Set();

    const walk = (n, localDefs) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(x => walk(x, localDefs)); return; }
      if (n.kind === 'Ident') {
        const nm = n.name;
        if (!params.has(nm) && !localDefs.has(nm) && !builtins.has(nm) && !seen.has(nm)) {
          const sym = this.lookup(nm);
          if (sym) { seen.add(nm); captured.set(nm, sym); }
        }
        return;
      }
      const inner = new Set(localDefs);
      if (n.kind === 'VarDecl') inner.add(n.name);
      for (const key of Object.keys(n)) {
        if (key === 'kind') continue;
        const child = n[key];
        if (child && typeof child === 'object') walk(child, inner);
      }
    };
    walk(body, new Set());
    return captured;
  },

  // Generate closure structs and fn for an Arrow, returning closure metadata.
  // Returns null if no captures (use regular hoistArrow).
  hoistClosure(arrowNode, varName) {
    const paramNames = (arrowNode.params ?? []).map(p => p.name);
    const captured = this._findFreeVars(arrowNode.body, paramNames);
    if (captured.size === 0) return null; // no closure needed

    const n = this.closureCount++;
    const closureName = `_closure_${n}`;
    const envName = `${closureName}_env`;
    const fnName = `${closureName}_fn`;

    // Determine return type
    let ret = arrowNode.returnType ? this.resolveType(arrowNode.returnType) : this.inferArrowReturn(arrowNode);

    // Build env struct fields
    const envFields = [];
    for (const [nm, sym] of captured) {
      const ct = sym.ctype ?? 'void *';
      if (ct.endsWith(' *')) envFields.push(`${ct.slice(0,-2)} *${nm};`);
      else envFields.push(`${ct} ${nm};`);
    }
    // Use addLambda for all closure items to preserve ordering (env → fn → closure struct)
    this.addLambda(`typedef struct { ${envFields.join(' ')} } ${envName};`);
    this.addLambda('');

    // Build fn params (env + explicit params)
    const paramStrs = [`${envName} *env`];
    for (const p of (arrowNode.params ?? [])) {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      paramStrs.push(`${ct} ${p.name}`);
    }

    // Build fn body — push captured vars into scope mapped to env->nm
    this.pushScope();
    for (const [nm, sym] of captured) {
      this.define(nm, { ...sym, _closureEnvVar: nm });
    }
    for (const p of (arrowNode.params ?? [])) {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      this.define(p.name, { ctype: ct });
    }
    const bodyLines = [];
    if (arrowNode.body.kind === 'Block') {
      this.visitBlock(arrowNode.body, bodyLines, 0);
    } else {
      const c = this.exprToC(arrowNode.body, bodyLines, 0);
      bodyLines.push(`return ${c};`);
    }
    this.popScope();

    // Replace captured var references: nm → env->nm
    const finalLines = bodyLines.map(l => {
      let result = l;
      for (const nm of captured.keys()) {
        result = result.replace(new RegExp(`\\b${nm}\\b`, 'g'), `env->${nm}`);
      }
      return result;
    });

    this.addLambda(`static ${ret} ${fnName}(${paramStrs.join(', ')}) {`);
    for (const l of finalLines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');

    // Build closure struct typedef
    const paramTypes = (arrowNode.params ?? []).map(p =>
      p.typeAnn ? this.resolveType(p.typeAnn) : 'void *'
    );
    const fnPtrDecl = paramTypes.length > 0
      ? `${ret} (*fn)(${envName} *, ${paramTypes.join(', ')})`
      : `${ret} (*fn)(${envName} *)`;
    this.addLambda(`typedef struct { ${envName} env; ${fnPtrDecl}; } ${closureName};`);
    this.addLambda('');

    // Build env initializer
    const envInit = '{' + [...captured.keys()].map(nm => `.${nm} = ${nm}`).join(', ') + '}';

    return { closureName, fnName, envInit, ret, ctype: closureName, capturedVars: captured };
  },

  // Emit `typedef struct {...} Promise_T;` once per type
  _emitPromiseTypedef(promiseType, innerType) {
    if (!this._emittedPromiseTypes) this._emittedPromiseTypes = new Set();
    if (this._emittedPromiseTypes.has(promiseType)) return;
    this._emittedPromiseTypes.add(promiseType);
    this._topBlank();
    this.topLevel.push(`typedef struct { bool _done; ${innerType} _result; bool _ok; } ${promiseType};`);
  },

  // Emit a spawn block: generate env struct, fn, and call site code
  // Returns the C variable name of the thread handle
  _emitSpawnBlock(varName, body, throwsTypes, lines, depth) {
    // Collect free (captured) vars from body
    const syntheticLambda = { params: [], body: body.kind === 'Block' ? body : { kind: 'Block', body: [body] } };
    const freeVars = this._collectFreeVars(syntheticLambda);

    // Collect variables that are WRITTEN in the spawn body (to detect mutable capture)
    const writtenVars = new Set();
    const findWrites = (stmts) => {
      for (const s of stmts ?? []) {
        if (s.kind === 'ExprStmt' && s.expr?.kind === 'Assign') {
          const lhs = s.expr.left;
          if (lhs?.kind === 'Ident') writtenVars.add(lhs.name);
          if (lhs?.kind === 'Member' && lhs.object?.kind === 'Ident') writtenVars.add(lhs.object.name);
        }
        findWrites(s.body?.body ?? []);
        if (s.kind === 'If') { findWrites([s.consequent]); if (s.alternate) findWrites([s.alternate]); }
      }
    };
    const bodyStmts = body.kind === 'Block' ? body.body : [body];
    findWrites(bodyStmts);

    // Validate captures
    for (const fv of freeVars) {
      const sym = this.lookup(fv.name);
      if (fv.ctype.endsWith(' *') && fv.ctype.includes('const ')) {
        throw this.error(`thread closure cannot capture "Ref<T>": not Send`);
      }
      if (writtenVars.has(fv.name) && sym?.varKind === 'let') {
        const classDef = this.classes.get(fv.ctype);
        if (classDef?.fields) {
          throw this.error(`TypeError: Cannot capture '${fv.ctype}' by move into spawn block; use Shared<${fv.ctype}> for shared ownership across threads`);
        } else {
          throw this.error(`TypeError: Cannot capture mutable variable '${fv.name}' by reference in a spawn block; use Shared<T> or Atomic<T>`);
        }
      }
    }

    const idx = this._spawnCount ?? 0;
    this._spawnCount = idx + 1;
    const envType = `_spawn_${idx}_env`;
    const fnName = `_spawn_${idx}_fn`;
    const envVar = `_env_${idx}`;
    const threadVar = varName ?? `_t_${idx}`;

    const hasThrows = throwsTypes?.length > 0;
    let resultType = null;
    let throwsTypeName = null;
    if (hasThrows) {
      throwsTypeName = throwsTypes[0]?.name ?? throwsTypes[0];
      resultType = `Result_void_${throwsTypeName}`;
      if (!this._emittedResultErrKeys) this._emittedResultErrKeys = new Set();
      if (!this._emittedResultErrKeys.has(throwsTypeName)) {
        this._emittedResultErrKeys.add(throwsTypeName);
        this.addTop(`typedef struct { bool ok; union { int _dummy; ${throwsTypeName} error; }; } ${resultType};`);
        this.addTop('');
      }
    }

    // Build env struct fields: [result if throws] + [captured vars]
    const envFields = [];
    if (hasThrows && resultType) envFields.push({ ctype: resultType, name: 'result' });
    for (const fv of freeVars) envFields.push(fv);

    const fieldDecls = envFields.map(f => `${f.ctype} ${f.name};`).join(' ');
    // Ensure blank line before spawn env typedef only when not following throws-related typedefs
    if (!hasThrows && this.typedefs.length > 0 && this.typedefs[this.typedefs.length - 1] !== '') {
      this.typedefs.push('');
    }
    this._lastAddedToTypedefs = false; // allow the typedef to go through (not absorbed as companion)
    this.addTop(`typedef struct { ${fieldDecls} } ${envType};`);
    this.addTop('');

    // Build spawn function
    const fnLines = [];
    fnLines.push(`static void *${fnName}(void *_arg) {`);
    fnLines.push(`    ${envType} *env = (${envType} *)_arg;`);

    this.pushScope();
    for (const fv of freeVars) {
      this.define(fv.name, { ctype: fv.ctype, varKind: 'const', _cAlias: `env->${fv.name}` });
    }

    if (hasThrows && throwsTypeName) {
      for (const s of bodyStmts) {
        if (s.kind === 'Throw') {
          const errC = this.exprToC(s.value);
          fnLines.push(`    env->result = (${resultType}){.ok = false, .error = ${errC}};`);
        } else {
          const sl = [];
          this.visitStmt(s, sl, 1);
          for (const l of sl) fnLines.push(l);
        }
      }
    } else {
      const bodyLines2 = [];
      this.visitBlock(body.kind === 'Block' ? body : { kind: 'Block', body: bodyStmts }, bodyLines2, 1);
      for (const l of bodyLines2) fnLines.push(l);
      fnLines.push(`    free(env);`);
    }

    this.popScope();
    fnLines.push(`    return NULL;`);
    fnLines.push(`}`);
    fnLines.push('');
    for (const l of fnLines) this.addTop(l);

    // Emit call site: alloc env, init captured fields, spawn thread
    const I2 = ' '.repeat(this.indent * depth);
    lines.push(`${I2}${envType} *${envVar} = malloc(sizeof(${envType}));`);
    for (const fv of freeVars) {
      lines.push(`${I2}${envVar}->${fv.name} = ${fv.name};`);
    }
    lines.push(`${I2}tsc_thread_t ${threadVar} = tsc_thread_spawn(${fnName}, ${envVar});`);

    return threadVar;
  },

  // Collect free (outer-scope) variables referenced in a lambda body
  _collectFreeVars(lambda) {
    const paramNames = new Set((lambda.params || []).map(p => p.name));
    const free = [];
    const seen = new Set(paramNames);
    const walkE = (e) => {
      if (!e) return;
      if (e.kind === 'Ident' && !seen.has(e.name)) {
        const sym = this.lookup(e.name);
        if (sym?.ctype) { seen.add(e.name); free.push({ name: e.name, ctype: sym.ctype }); }
      }
      if (e.callee) walkE(e.callee);
      if (e.object) walkE(e.object);
      if (e.left) walkE(e.left);
      if (e.right) walkE(e.right);
      if (e.test) walkE(e.test);
      if (e.args) for (const a of (e.args || [])) walkE(a?.expr);
      if (e.elems) for (const a of (e.elems || [])) walkE(a?.expr);
      if (e.props) for (const p of (e.props || [])) walkE(p?.value);
    };
    const walkS = (s) => {
      if (!s) return;
      if (s.kind === 'ExprStmt') walkE(s.expr);
      if (s.kind === 'VarDecl') walkE(s.init);
      if (s.kind === 'Return') walkE(s.value);
      if (s.kind === 'Block') for (const st of (s.body || [])) walkS(st);
      if (s.kind === 'If') { walkS(s.consequent); if (s.alternate) walkS(s.alternate); }
    };
    if (lambda.body?.kind === 'Block') for (const s of lambda.body.body || []) walkS(s);
    else if (lambda.body) walkE(lambda.body);
    return free;
  },
};
