// emit-helpers.js
export default {
  _emitIterableImpl(className, iterMethod, elemCType) {
    const stmts = iterMethod.body?.body ?? iterMethod.body?.stmts ?? [];

    // Find pre-return VarDecl stmts and the returned arrow
    const preStmts = [];
    let returnedArrow = null;
    for (const s of stmts) {
      if (s.kind === 'Return' && s.value?.kind === 'Arrow') { returnedArrow = s.value; break; }
      preStmts.push(s);
    }
    if (!returnedArrow) return false;

    const elemIdent = this.cTypeToIdent(elemCType);
    const optType = `opt_${elemIdent}`;
    const iterStructName = `${className}_iter_t`;

    // Ensure opt_T struct is defined
    if (!this._emittedOptStructs.has(optType)) {
      this._emittedOptStructs.add(optType);
      this.addTop(`typedef struct { bool has_value; ${elemCType} value; } ${optType};`);
      this.addTop('');
    }

    // === Process pre-stmts to collect local vars ===
    this.pushScope();
    this.define('this', { ctype: `${className} *`, _cAlias: '_self', isPointer: true });

    const localVars = [];
    const factoryLines = [];
    for (const s of preStmts) {
      if (s.kind !== 'VarDecl') continue;
      const tmpLines = [];
      const initC = s.init ? this.exprToC(s.init, tmpLines, 1) : '0';
      const ct = s.typeAnn ? this.resolveType(s.typeAnn)
                           : (s.init ? this.inferType(s.init) : null) ?? 'int32_t';
      const isConst = s.varKind === 'const';
      localVars.push({ name: s.name, ctype: ct, initC, isConst });
      this.define(s.name, { ctype: ct, varKind: s.varKind });
      for (const l of tmpLines) factoryLines.push(l);
      factoryLines.push(`    ${isConst ? 'const ' : ''}${ct} ${s.name} = ${initC};`);
    }
    this.popScope();

    // === Emit iterator struct ===
    const structFields = localVars.map(v => `${v.ctype} ${v.name};`).join(' ');
    this.addTop(`typedef struct { ${structFields} } ${iterStructName};`);
    this.addTop('');

    // === Emit next function ===
    this.pushScope();
    for (const v of localVars) {
      this.define(v.name, { ctype: v.ctype, _cAlias: `_self->${v.name}`, varKind: v.isConst ? 'const' : 'let' });
    }
    this._inIterNextBody = true;
    this._iterNextElemType = elemCType;
    this._iterNextOptType = optType;

    const nextBodyLines = [];
    if (returnedArrow.body?.kind === 'Block') {
      this.visitBlock(returnedArrow.body, nextBodyLines, 0);
    } else {
      this._inReturnContext = true;
      const c = this.exprToC(returnedArrow.body, nextBodyLines, 0);
      this._inReturnContext = false;
      nextBodyLines.push(`return (${optType}){true, ${c}};`);
    }

    this._inIterNextBody = false;
    this.popScope();

    this.addTop(`static ${optType} ${className}_iter_next(${iterStructName} *_self) {`);
    for (const l of nextBodyLines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');

    // === Emit factory function ===
    const returnFields = localVars.map(v => `.${v.name} = ${v.name}`).join(', ');
    this.addTop(`static ${iterStructName} ${className}_iter(const ${className} *_self) {`);
    for (const l of factoryLines) this.addTop(l);
    this.addTop(`    return (${iterStructName}){${returnFields}};`);
    this.addTop('}');
    this.addTop('');

    // Record that iterable impl was generated (used by ForOf)
    const classInfo = this.classes.get(className);
    if (classInfo) classInfo._iterStructName = iterStructName;
    return true;
  },

  // Emit `typedef struct {...} Promise_T;` once per type
  _emitPromiseTypedef(promiseType, innerType) {
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

  _avrSleepModeToC(node) {
    // SleepMode.Idle → SLEEP_MODE_IDLE, etc.
    if (node.kind === 'Member' && node.object.kind === 'Ident' && node.object.name === 'SleepMode') {
      const map = {
        Idle: 'SLEEP_MODE_IDLE', ADC: 'SLEEP_MODE_ADC',
        PowerDown: 'SLEEP_MODE_PWR_DOWN', PowerSave: 'SLEEP_MODE_PWR_SAVE',
        Standby: 'SLEEP_MODE_STANDBY', ExtStandby: 'SLEEP_MODE_EXT_STANDBY',
      };
      return map[node.prop] ?? `SLEEP_MODE_${node.prop.toUpperCase()}`;
    }
    return this.exprToC(node, [], 0);
  },
};
