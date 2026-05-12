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
      const ast = this._parse(toks);
      const exprNode = ast.body[0]?.expr ?? ast.body[0];
      let t = this.inferType(exprNode);
      let c = this.exprToC(exprNode, lines, depth);
      // TscBlob in template → tsc_blob_to_string
      if (t === 'TscBlob' || (exprNode.kind === 'Ident' && this.lookup(exprNode.name)?._isTscBlob)) {
        const n = this._blobStrN = (this._blobStrN ?? 0); this._blobStrN++;
        const tmp = `_blob_str_${n}`;
        const I = ' '.repeat(this.indent * depth);
        lines.push(`${I}String ${tmp} = tsc_blob_to_string(&${c});`);
        this._pushPostStmtCleanup(`${I}tsc_string_free(${tmp});`);
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

  // Special codegen for iter() method of Iterable<T> class.
  // Generates: ClassName_iter_t struct + ClassName_iter_next + ClassName_iter factory.
  // Returns true if the pattern was recognized and emitted.
};
