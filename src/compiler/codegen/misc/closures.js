// closures.js
export default {
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
      const { ast } = this._parse(toks);
      const exprNode = ast.body[0]?.expr ?? ast.body[0];
      let t = this.inferType(exprNode);
      let c = this.exprToC(exprNode, lines, depth);
      // TscBlob in template → tsc_blob_to_string
      if (t === 'TscBlob' || (exprNode.kind === 'Ident' && this.lookup(exprNode.name)?._isTscBlob)) {
        const n = this._blobStrN = (this._blobStrN ?? 0); this._blobStrN++;
        const tmp = `_blob_str_${n}`;
        const I = ' '.repeat(this.indent * depth);
        lines.push(`${I}String ${tmp} = tsc_blob_to_string(&${c});`);
        this._pushPostStmtCleanup(`${I}tsc_string_release(${tmp});`);
        t = 'String'; c = tmp;
      }
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
    let captured;
    let explicitCaptures = null;
    if (arrowNode.captures?.length > 0) {
      captured = new Map();
      explicitCaptures = [];
      for (const cap of arrowNode.captures) {
        const sym = this.lookup(cap.name);
        if (!sym) throw this.error(`Cannot capture '${cap.name}' — not in scope`, arrowNode);
        captured.set(cap.name, sym);
        let mode = 'move';
        if (cap.typeAnn?.kind === 'TypeRef') {
          if (cap.typeAnn.name === 'Ref') mode = 'ref';
          else if (cap.typeAnn.name === 'Mut') mode = 'mut';
        }
        explicitCaptures.push({ name: cap.name, mode, typeAnn: cap.typeAnn });
        if (mode === 'move') {
          sym._moved = true;
          sym._movedLine = arrowNode.line ?? 0;
        }
        if (mode === 'mut') {
          this._trackMutQuarantine(sym, varName);
        }
        if (mode === 'ref') {
          this._trackRefBorrow(sym);
        }
      }
    } else {
      captured = this._findFreeVars(arrowNode.body, paramNames);
    }
    if (captured.size === 0) return null;

    const n = this.closureCount++;
    const closureName = `_closure_${n}`;
    const envName = `${closureName}_env`;
    const fnName = `${closureName}_fn`;

    let ret = arrowNode.returnType ? this.resolveType(arrowNode.returnType) : this.inferArrowReturn(arrowNode);

    const envFields = [];
    const capturedStringFields = [];
    for (const [nm, sym] of captured) {
      const ct = sym.ctype ?? 'void *';
      const capInfo = explicitCaptures?.find(c => c.name === nm);
      if (capInfo) {
        if (capInfo.mode === 'ref') {
          const innerCt = ct.endsWith(' *') ? ct.slice(0, -2) : ct;
          envFields.push(`const ${innerCt} *${nm};`);
        } else if (capInfo.mode === 'mut') {
          const innerCt = ct.endsWith(' *') ? ct.slice(0, -2) : ct;
          envFields.push(`${innerCt} *${nm};`);
        } else {
          envFields.push(`${ct} ${nm};`);
          if (ct === 'String') capturedStringFields.push(nm);
        }
      } else {
        if (ct.endsWith(' *')) envFields.push(`${ct.slice(0,-2)} *${nm};`);
        else envFields.push(`${ct} ${nm};`);
        if (ct === 'String') capturedStringFields.push(nm);
      }
    }
    const hasStringCapture = capturedStringFields.length > 0;
    this.addLambda(`typedef struct { ${envFields.join(' ')} } ${envName};`);
    this.addLambda('');

    const destroyFnName = `${closureName}_destroy`;
    if (hasStringCapture) {
      this.addLambda(`static void ${destroyFnName}(void *_env) {`);
      this.addLambda(`    ${envName} *env = (${envName} *)_env;`);
      for (const nm of capturedStringFields) {
        this.addLambda(`    tsc_string_release(env->${nm});`);
      }
      this.addLambda('    free(env);');
      this.addLambda('}');
      this.addLambda('');
    }

    const paramStrs = [`${envName} *env`];
    for (const p of (arrowNode.params ?? [])) {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      paramStrs.push(`${ct} ${p.name}`);
    }

    this.pushScope();
    for (const [nm, sym] of captured) {
      const capInfo = explicitCaptures?.find(c => c.name === nm);
      if (capInfo && (capInfo.mode === 'ref' || capInfo.mode === 'mut')) {
        const ct = sym.ctype ?? 'void *';
        const innerCt = ct.endsWith(' *') ? ct.slice(0, -2) : ct;
        this.define(nm, { ctype: `${innerCt} *`, isPointer: true, derefType: innerCt, _closureEnvVar: nm });
      } else {
        this.define(nm, { ...sym, _closureEnvVar: nm });
      }
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

    this.addLambda(`static ${ret} ${fnName}(${paramStrs.join(', ')}) {`);
    for (const l of bodyLines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');

    const retainLines = [];
    for (const nm of capturedStringFields) {
      const sym = captured.get(nm);
      const src = sym?._closureEnvVar ? `env->${nm}` : nm;
      retainLines.push(`tsc_string_retain(${src});`);
    }
    const envInit = '{' + [...captured.entries()].map(([nm, sym]) => {
      const src = sym._closureEnvVar ? `env->${nm}` : nm;
      const capInfo = explicitCaptures?.find(c => c.name === nm);
      if (capInfo && (capInfo.mode === 'ref' || capInfo.mode === 'mut')) {
        if (sym.ctype?.endsWith(' *')) return `.${nm} = ${nm}`;
        return `.${nm} = &${nm}`;
      }
      return `.${nm} = ${src}`;
    }).join(', ') + '}';

    const captureModes = explicitCaptures
      ? new Map(explicitCaptures.map(c => [c.name, c.mode]))
      : null;

    return { closureName, fnName, envInit, ret, ctype: 'tsc_closure', capturedVars: captured,
             retainLines, hasStringCapture, destroyFnName, capturedStringFields, envName, captureModes };
  },

  // Special codegen for iter() method of Iterable<T> class.
  // Generates: ClassName_iter_t struct + ClassName_iter_next + ClassName_iter factory.
  // Returns true if the pattern was recognized and emitted.
};
