// scan.js
export default {
  // ─── Body scan: fields to promote and inlinable consts ────────────────────
  _scanAsyncBody(params, body) {
    const paramFields = [];
    const bodyFields = [];
    const inlined = new Map();     // name → C literal string
    const inlinedTypes = new Map(); // name → raw TSclang type name (for error messages)
    const seen = new Set();
    const spawnInfos = [];      // { userVar, threadVar, envType, fnName, envVar, freeVars }
    const extraPollParams = []; // free vars of spawn blocks that become extra poll params

    // Pre-scan type map: tracks variable types as the walk progresses so that
    // _awaitInfoOf can look up types of variables not yet in the real scope.
    const preScanTypes = new Map();
    this._preScanTypes = preScanTypes;

    for (const p of (params || [])) {
      if (p.rest || p.destructArr) continue;
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      if (!seen.has(p.name)) { seen.add(p.name); paramFields.push({ name: p.name, ctype: ct }); preScanTypes.set(p.name, ct); }
    }

    const walk = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;

        // Spawn VarDecl: pre-emit env struct + fn to topLevel, add thread var to body fields
        if (s.kind === 'VarDecl' && s.init?.kind === 'Spawn') {
          if (!seen.has(s.name)) seen.add(s.name);
          const spawnIdx = this._spawnCount ?? 0;
          const threadVar = this._emitSpawnBlock(null, s.init.body, s.init.throwsTypes, [], 0);
          const envType = `_spawn_${spawnIdx}_env`;
          const fnName  = `_spawn_${spawnIdx}_fn`;
          const envVar  = `_env_${spawnIdx}`;
          const synLambda = { params: [], body: s.init.body.kind === 'Block' ? s.init.body : { kind: 'Block', body: [s.init.body] } };
          const fvArr = this._collectFreeVars(synLambda);
          if (!seen.has(threadVar)) { seen.add(threadVar); bodyFields.push({ name: threadVar, ctype: 'tsc_thread_t' }); }
          spawnInfos.push({ userVar: s.name, threadVar, envType, fnName, envVar, freeVars: fvArr });
          for (const fv of fvArr) {
            if (!paramFields.some(f => f.name === fv.name) && !extraPollParams.some(f => f.name === fv.name)) {
              extraPollParams.push({ name: fv.name, ctype: fv.ctype });
            }
          }
          continue;
        }

        if (s.kind === 'VarDecl') {
          const { varKind, name, typeAnn, init } = s;
          if (varKind === 'const' && this._isInlinableConst(init) && !seen.has(name)) {
            inlined.set(name, this._constLiteralC(init));
            inlinedTypes.set(name, typeAnn?.name ?? 'i32');
          } else if (!seen.has(name)) {
            seen.add(name);
            let ct;
            if (init?.kind === 'Await') {
              const ai = this._awaitInfoOf(init);
              ct = ai?.resultCType || 'int32_t';
              if (!ct) ct = 'int32_t';
            } else if (typeAnn) {
              ct = this.resolveType(typeAnn);
            } else if (init) {
              ct = this.inferType(init) || 'int32_t';
            } else ct = 'int32_t';
            bodyFields.push({ name, ctype: ct });
            preScanTypes.set(name, ct);
          }
        }
        // VarDestructArr (const [x, y] = ...)
        if (s.kind === 'VarDestructArr') {
          for (const elem of (s.pattern || [])) {
            if (!elem || seen.has(elem.name)) continue;
            seen.add(elem.name);
            bodyFields.push({ name: elem.name, ctype: 'int32_t' });
          }
        }
        if (s.kind === 'Block') walk(s.body);
        if (s.kind === 'If') {
          const c = s.consequent;
          walk(c?.kind === 'Block' ? c.body : (c ? [c] : []));
          const a = s.alternate;
          if (a) walk(a?.kind === 'Block' ? a.body : [a]);
        }
        if (s.kind === 'While') walk(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        if (s.kind === 'For')   walk(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        if (s.kind === 'TryCatch') {
          walk(s.body?.body || []);
          if (s.catches) for (const c of s.catches) walk(c.body?.body || []);
          if (s.finally) walk(s.finally.body || []);
        }
      }
    };

    walk(body?.kind === 'Block' ? body.body : []);

    if (bodyFields.length > 0) {
      const localVarNames = new Set(bodyFields.map(f => f.name));
      const needsPromotion = this._livenessScan(body, localVarNames);
      const safeLocal = new Set([
        'int32_t', 'int64_t', 'int8_t', 'int16_t',
        'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
        'float', 'double', 'size_t', 'bool', 'int', 'void',
      ]);
      const filtered = bodyFields.filter(f =>
        needsPromotion.has(f.name) || !safeLocal.has(f.ctype)
      );
      if (filtered.length < bodyFields.length) {
        for (const f of bodyFields) {
          if (!needsPromotion.has(f.name) && safeLocal.has(f.ctype)) preScanTypes.delete(f.name);
        }
        bodyFields.length = 0;
        bodyFields.push(...filtered);
      }
    }

    // Note: _preScanTypes is intentionally kept alive so _collectAwaitStates (called next) can use it.
    // The caller must clear this._preScanTypes after calling _collectAwaitStates.
    return { paramFields, bodyFields, inlined, inlinedTypes, spawnInfos, extraPollParams };
  },

  _scanExprIdents(node, touch) {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'Ident') { touch(node.name); return; }
    if (node.kind === 'Literal' || node.kind === 'RawC') return;
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object') {
            if (item.kind) this._scanExprIdents(item, touch);
            else if (item.expr?.kind) this._scanExprIdents(item.expr, touch);
          }
        }
      } else if (val && typeof val === 'object' && val.kind) {
        this._scanExprIdents(val, touch);
      }
    }
  },

  _livenessScan(body, localVarNames) {
    const segs = new Map();
    let seg = 0;

    const touch = (name) => {
      if (!localVarNames.has(name)) return;
      const info = segs.get(name);
      if (info) {
        if (seg < info.min) info.min = seg;
        if (seg > info.max) info.max = seg;
      } else {
        segs.set(name, { min: seg, max: seg });
      }
    };

    const scanExpr = (node) => this._scanExprIdents(node, touch);

    const walk = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;

        const isAwaitVarDecl = s.kind === 'VarDecl' && s.init?.kind === 'Await';
        const isAwaitDestruct = s.kind === 'VarDestructArr' && s.init?.kind === 'Await';
        const isAwaitExpr = s.kind === 'ExprStmt' && s.expr?.kind === 'Await';

        if (isAwaitVarDecl) {
          scanExpr(s.init.expr);
          seg++;
          touch(s.name);
          continue;
        }
        if (isAwaitDestruct) {
          scanExpr(s.init.expr);
          seg++;
          for (const elem of (s.pattern || [])) if (elem) touch(elem.name);
          continue;
        }
        if (isAwaitExpr) {
          scanExpr(s.expr.expr);
          seg++;
          continue;
        }

        if (s.kind === 'ForOf' && s.await) {
          seg++;
          if (s.binding?.kind === 'Ident') touch(s.binding.name);
          continue;
        }

        if (s.kind === 'VarDecl' && s.init?.kind === 'Spawn') {
          touch(s.name);
          continue;
        }

        if (s.kind === 'VarDecl') {
          touch(s.name);
          if (s.init) scanExpr(s.init);
        }
        if (s.kind === 'VarDestructArr') {
          for (const elem of (s.pattern || [])) if (elem) touch(elem.name);
          if (s.init) scanExpr(s.init);
        }
        if (s.kind === 'ExprStmt') scanExpr(s.expr);
        if (s.kind === 'Return' && s.value) scanExpr(s.value);
        if (s.kind === 'Throw' && s.value) scanExpr(s.value);
        if (s.kind === 'If') {
          scanExpr(s.test ?? s.cond);
          const c = s.consequent;
          walk(c?.kind === 'Block' ? c.body : (c ? [c] : []));
          const a = s.alternate;
          if (a) walk(a?.kind === 'Block' ? a.body : [a]);
        }
        if (s.kind === 'While') {
          scanExpr(s.test ?? s.cond);
          walk(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        }
        if (s.kind === 'For') {
          if (s.init?.kind === 'VarDecl') { touch(s.init.name); if (s.init.init) scanExpr(s.init.init); }
          else if (s.init) scanExpr(s.init);
          if (s.test) scanExpr(s.test);
          if (s.update) scanExpr(s.update);
          walk(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        }
        if (s.kind === 'TryCatch') {
          walk(s.body?.body || []);
          if (s.catches) for (const c of s.catches) {
            if (c.param) touch(c.param);
            walk(c.body?.body || []);
          }
          if (s.finally) walk(s.finally.body || []);
        }
        if (s.kind === 'Block') walk(s.body);
      }
    };

    walk(body?.kind === 'Block' ? body.body : []);

    const needsPromotion = new Set();
    for (const [name, { min, max }] of segs) {
      if (max > min) needsPromotion.add(name);
    }
    return needsPromotion;
  },

  // Collect await sub-state field descriptors for the struct
  _collectAwaitStates(body) {
    const result = [];
    let awaitIdx = 0;
    let genIdx = 0;

    const walk = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;
        const ae = s.kind === 'VarDecl' && s.init?.kind === 'Await' ? s.init
                 : s.kind === 'VarDestructArr' && s.init?.kind === 'Await' ? s.init
                 : s.kind === 'ExprStmt' && s.expr?.kind === 'Await' ? s.expr
                 : null;
        if (ae) {
          const ai = this._awaitInfoOf(ae);
          const _isMultiPromise = ai?.kind === 'promise-all' || ai?.kind === 'promise-race' ||
                                  ai?.kind === 'promise-any' || ai?.kind === 'promise-allSettled';
          if (_isMultiPromise) {
            for (const item of ai.items) {
              const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
              const sub = callName && this._asyncFuncs?.has(callName)
                ? this._asyncFuncs.get(callName) : null;
              result.push({ fieldName: `_await_${awaitIdx++}`,
                            stateType: sub?.stateType ?? `${callName}_state` });
            }
          } else if (ai) {
            result.push({ fieldName: `_await_${awaitIdx++}`, stateType: ai.stateType,
                          isUnknown: ai.kind === 'unknown' });
          }
        }
        if (s.kind === 'ForOf' && s.await) {
          const genName = s.iterable?.callee?.kind === 'Ident' ? s.iterable.callee.name
                        : s.iterable?.kind === 'Ident' ? s.iterable.name : null;
          const gi = genName && this._generatorFuncs?.has(genName)
            ? this._generatorFuncs.get(genName) : null;
          if (gi) result.push({ fieldName: `_gen_${genIdx++}`, stateType: gi.stateType, isGen: true });
        }
        if (s.kind === 'While') walk(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        if (s.kind === 'If') {
          const c = s.consequent;
          walk(c?.kind === 'Block' ? c.body : (c ? [c] : []));
          if (s.alternate) walk(s.alternate?.kind === 'Block' ? s.alternate.body : [s.alternate]);
        }
        if (s.kind === 'TryCatch') walk(s.body?.body || []);
      }
    };

    walk(body?.kind === 'Block' ? body.body : []);
    return result;
  },

  // ─── Top-level emitters ───────────────────────────────────────────────────

  _topBlank(arr = this.topLevel) {
    if (arr.length > 0 && arr[arr.length - 1] !== '') arr.push('');
  },

  _emitStructMultiline(name, fields) {
    this._topBlank();
    this.topLevel.push('typedef struct {');
    // First line: state/result/done header fields (up to bool _done)
    let headerEnd = 0;
    for (let i = 0; i < fields.length; i++) {
      headerEnd = i;
      if (fields[i].startsWith('bool _done')) break;
    }
    const headerFields = fields.slice(0, headerEnd + 1);
    const bodyFields = fields.slice(headerEnd + 1);
    this.topLevel.push(`    ${headerFields.join('; ')};`);
    for (const f of bodyFields) this.topLevel.push(`    ${f};`);
    this.topLevel.push(`} ${name};`);
  },

  _emitStructCompact(name, fields) {
    this._topBlank();
    this.topLevel.push(`typedef struct { ${fields.join('; ')}; } ${name};`);
  },

  _emitTopFn(sig, bodyLines) {
    this._topBlank();
    this.topLevel.push(`${sig} {`);
    for (const l of bodyLines) this.topLevel.push(l);
    this.topLevel.push('}');
  },
};
