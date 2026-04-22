// async.js — async/generator state machine codegen
export default {

  _initAsync() {
    if (!this._asyncFuncs) this._asyncFuncs = new Map();
    if (!this._generatorFuncs) this._generatorFuncs = new Map();
  },

  // ─── Return type helpers ──────────────────────────────────────────────────

  // C result type for async _result field.
  // Returns null for Promise<void> (no _result field).
  // Returns 'int' for void (placeholder).
  _asyncRetType(rt) {
    if (!rt) return 'int';
    if (rt.kind === 'TypeRef') {
      if (rt.name === 'Promise') {
        const inner = rt.typeArgs?.[0];
        if (!inner || inner.name === 'void') return null;
        return this.resolveType(inner);
      }
      if (rt.name === 'void') return 'int';
    }
    return this.resolveType(rt);
  },

  // ─── Inlinable const detection ────────────────────────────────────────────

  _isInlinableConst(init) {
    if (!init) return false;
    if (init.kind === 'Literal') return init.litType === 'number' || init.litType === 'boolean';
    return init.kind === 'Num' || init.kind === 'Bool';
  },

  _constLiteralC(init) {
    if (init.kind === 'Literal') {
      if (init.litType === 'number') return String(init.value);
      if (init.litType === 'boolean') return init.value === 'true' || init.value === true ? 'true' : 'false';
    }
    if (init.kind === 'Num') return String(init.value);
    if (init.kind === 'Bool') return init.value ? 'true' : 'false';
    return null;
  },

  // ─── Await info ───────────────────────────────────────────────────────────

  _awaitInfoOf(awaitNode) {
    const expr = awaitNode.expr;
    if (!expr) return null;

    if (expr.kind === 'Call') {
      const callee = expr.callee?.kind === 'Ident' ? expr.callee.name : null;

      if (callee === 'sleep') {
        return { kind: 'sleep', stateType: 'TscSleepAwaitable', pollFn: 'tsc_sleep_poll',
                 resultCType: null, args: expr.args };
      }
      // std/net: fetch(url, opts?) — only if NOT a user-defined async function
      if (callee === 'fetch' && !this._asyncFuncs?.has('fetch')) {
        return { kind: 'net-fetch', stateType: 'TscFetchAwaitable', pollFn: 'tsc_fetch_poll',
                 initFn: 'tsc_fetch_async', resultCType: 'TscResponse', isResult: true, args: expr.args };
      }
      // std/io async functions
      if (callee === 'readAll') {
        return { kind: 'io-readAll', stateType: 'TscReadAllAwaitable', pollFn: 'tsc_read_all_poll',
                 initFn: 'tsc_read_all_async', resultCType: 'Array_u8', args: expr.args };
      }
      if (callee === 'writeAll') {
        return { kind: 'io-writeAll', stateType: 'TscWriteAllAwaitable', pollFn: 'tsc_write_all_poll',
                 initFn: 'tsc_write_all_async', resultCType: null, args: expr.args };
      }
      if (callee === 'pipe') {
        return { kind: 'io-pipe', stateType: 'TscPipeAwaitable', pollFn: 'tsc_pipe_poll',
                 initFn: 'tsc_pipe_async', resultCType: null, args: expr.args };
      }
      // process.stdin.readLine() / process.stdout.write(s) / process.stderr.write(s)
      if (expr.callee?.kind === 'Member' && expr.callee.object?.kind === 'Member' &&
          expr.callee.object?.object?.name === 'process') {
        const _streamProp = expr.callee.object.prop;
        const _streamFn = _streamProp === 'stdin' ? 'tsc_stdin()' :
                          _streamProp === 'stderr' ? 'tsc_stderr()' : 'tsc_stdout()';
        if (expr.callee.prop === 'readLine') {
          return { kind: 'io-readline', stateType: 'TscReadLineAwaitable', pollFn: 'tsc_read_line_poll',
                   initFn: 'tsc_read_line_async', resultCType: 'String', rawArgs: [_streamFn], args: [] };
        }
        if (expr.callee.prop === 'write') {
          return { kind: 'io-writestr', stateType: 'TscWriteStrAwaitable', pollFn: 'tsc_write_str_poll',
                   initFn: 'tsc_write_str_async', resultCType: null, rawArgs: [_streamFn], args: expr.args };
        }
      }
      // WebSocket.connect(url) → tsc_ws_connect_async
      if (expr.callee?.kind === 'Member' &&
          expr.callee.object?.kind === 'Ident' && expr.callee.object.name === 'WebSocket' &&
          expr.callee.prop === 'connect') {
        return { kind: 'ws-connect', stateType: 'TscWsConnectAwaitable', pollFn: 'tsc_ws_connect_poll',
                 initFn: 'tsc_ws_connect_async', resultCType: 'TscWebSocket', args: expr.args };
      }
      // TscSocket methods: sock.readLine(), sock.write(s)
      if (expr.callee?.kind === 'Member' && expr.callee.object?.kind === 'Ident') {
        const _sockSym = this.lookup(expr.callee.object.name);
        const _sockCtype = _sockSym?.ctype ?? this._preScanTypes?.get(expr.callee.object.name);
        const _sockName = expr.callee.object.name;
        if (_sockCtype === 'TscSocket') {
          const _sp = expr.callee.prop;
          if (_sp === 'readLine') {
            return { kind: 'net-socket-readline', stateType: 'TscSocketReadLineAwaitable',
                     pollFn: 'tsc_socket_readline_poll', initFn: 'tsc_socket_readline_async',
                     resultCType: 'String', rawArgs: [`&self->${_sockName}`], args: [] };
          }
          if (_sp === 'write') {
            return { kind: 'net-socket-write', stateType: 'TscSocketWriteAwaitable',
                     pollFn: 'tsc_socket_write_poll', initFn: 'tsc_socket_write_async',
                     resultCType: null, rawArgs: [`&self->${_sockName}`], args: expr.args };
          }
        }
        // TscUdpSocket methods: udp.bind(port)
        if (_sockCtype === 'TscUdpSocket') {
          const _up = expr.callee.prop;
          if (_up === 'bind') {
            return { kind: 'net-udp-bind', stateType: 'TscUdpBindAwaitable',
                     pollFn: 'tsc_udp_bind_poll', initFn: 'tsc_udp_bind_async',
                     resultCType: null, rawArgs: [`&self->${_sockName}`], args: expr.args };
          }
        }
      }
      // fs namespace async methods: fs.readFile(), fs.writeFile(), etc.
      if (expr.callee?.kind === 'Member' && expr.callee.object?.kind === 'Ident') {
        const _fsSym3 = this.lookup(expr.callee.object.name) ??
          (this._preScanTypes?.get(expr.callee.object.name) === '__fs_namespace__' ? { _isFsNamespace: true } : null);
        if (_fsSym3?._isFsNamespace) {
          const _fp = expr.callee.prop;
          const _fsAsync = (initFn, pollFn, stateType, resultCType) =>
            ({ kind: `fs-${_fp}`, stateType, pollFn, initFn, resultCType, args: expr.args });
          if (_fp === 'readFile')     return _fsAsync('tsc_fs_read_async',    'tsc_fs_read_poll',    'TscFsReadAwaitable',    'String');
          if (_fp === 'readFileBytes') return _fsAsync('tsc_fs_read_bytes_async', 'tsc_fs_read_bytes_poll', 'TscFsReadBytesAwaitable', 'Array_u8');
          if (_fp === 'writeFile')    return _fsAsync('tsc_fs_write_async',   'tsc_fs_write_poll',   'TscFsVoidAwaitable',    null);
          if (_fp === 'appendFile')   return _fsAsync('tsc_fs_append_async',  'tsc_fs_append_poll',  'TscFsVoidAwaitable',    null);
          if (_fp === 'exists')       return _fsAsync('tsc_fs_exists_async',  'tsc_fs_exists_poll',  'TscFsBoolAwaitable',    'bool');
          if (_fp === 'mkdir')        return _fsAsync('tsc_fs_mkdir_async',   'tsc_fs_mkdir_poll',   'TscFsVoidAwaitable',    null);
          if (_fp === 'readDir')      return _fsAsync('tsc_fs_readdir_async', 'tsc_fs_readdir_poll', 'TscFsReaddirAwaitable', 'TscDirEntryArray');
          if (_fp === 'remove')       return _fsAsync('tsc_fs_remove_async',  'tsc_fs_remove_poll',  'TscFsVoidAwaitable',    null);
          if (_fp === 'rename')       return _fsAsync('tsc_fs_rename_async',  'tsc_fs_rename_poll',  'TscFsVoidAwaitable',    null);
          if (_fp === 'stat')         return _fsAsync('tsc_fs_stat_async',    'tsc_fs_stat_poll',    'TscFsStatAwaitable',    'TscFileStat');
        }
      }
      // std/net: net.connect(host, port)
      if (expr.callee?.kind === 'Member' &&
          expr.callee.object?.name === 'net' &&
          expr.callee.prop === 'connect') {
        return { kind: 'net-connect', stateType: 'TscConnectAwaitable', pollFn: 'tsc_net_connect_poll',
                 initFn: 'tsc_net_connect_async', resultCType: 'TscSocket', args: expr.args };
      }
      if (expr.callee?.kind === 'Member' &&
          expr.callee.object?.name === 'Promise' &&
          expr.callee.prop === 'all') {
        const items = expr.args?.[0]?.expr?.elems || [];
        return { kind: 'promise-all', items };
      }
      if (expr.callee?.kind === 'Member' &&
          expr.callee.object?.name === 'Promise' &&
          (expr.callee.prop === 'race' || expr.callee.prop === 'any' || expr.callee.prop === 'allSettled')) {
        const prop = expr.callee.prop;
        const items = expr.args?.[0]?.expr?.elems || [];
        let resultCType = null;
        if (prop !== 'allSettled') {
          const firstName = items[0]?.expr?.callee?.kind === 'Ident' ? items[0].expr.callee.name : null;
          if (firstName && this._asyncFuncs?.has(firstName)) {
            resultCType = this._asyncFuncs.get(firstName).resultCType;
          }
        }
        return { kind: `promise-${prop}`, items, resultCType };
      }
      if (callee && this._asyncFuncs?.has(callee)) {
        const info = this._asyncFuncs.get(callee);
        return { kind: 'async', name: callee, stateType: info.stateType,
                 pollFn: info.pollFn, resultCType: info.resultCType, args: expr.args };
      }
      if (callee) {
        return { kind: 'unknown', name: callee,
                 stateType: `${callee}_state`, pollFn: `${callee}_poll`, resultCType: null };
      }
    }
    return null;
  },

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
    // Note: _preScanTypes is intentionally kept alive so _collectAwaitStates (called next) can use it.
    // The caller must clear this._preScanTypes after calling _collectAwaitStates.
    return { paramFields, bodyFields, inlined, inlinedTypes, spawnInfos, extraPollParams };
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

  // ─── emitAsyncFunc ────────────────────────────────────────────────────────

  emitAsyncFunc(node) {
    this._initAsync();
    const { name, params, returnType, body } = node;

    // AVR: max 8 async state machines
    if (this._targetName === 'avr') {
      this._asyncCount = (this._asyncCount || 0) + 1;
      if (this._asyncCount > 8) {
        throw this.error(
          `TypeError: Too many concurrent async state machines for AVR target: max 8, got ${this._asyncCount}`
        );
      }
    }

    // throws handling: async fn that throws → _result is Result_T_Err
    const throwsTypes = node.throwsTypes || [];
    const hasThrows = throwsTypes.length > 0;
    const throwsKey = hasThrows ? throwsTypes[0].name : null;

    const innerResultCType = this._asyncRetType(returnType);
    // isVoidReturn: return type is void (no meaningful return value)
    const isVoidReturn = !returnType
      || (returnType?.kind === 'TypeRef' && (returnType.name === 'void' || returnType.name === 'Promise'));
    let resultCType;
    if (hasThrows) {
      const innerIdent = isVoidReturn ? 'void' : this.cTypeToIdent(innerResultCType ?? 'int');
      resultCType = `Result_${innerIdent}_${throwsKey}`;
      // Emit Result typedef only once (deduplicate across functions sharing same Result type)
      if (!this._emittedResultTypes) this._emittedResultTypes = new Set();
      if (!this._emittedResultTypes.has(resultCType)) {
        this._emittedResultTypes.add(resultCType);
        const innerDecl = isVoidReturn ? 'int _dummy' : `${innerResultCType} value`;
        this._topBlank();
        this.topLevel.push(`typedef struct { bool ok; union { ${innerDecl}; ${throwsKey} error; }; } ${resultCType};`);
      }
    } else {
      resultCType = innerResultCType;
    }

    const stateType = `${name}_state`;
    const pollFn = `${name}_poll`;

    // Ref<T> across await: check if any Ref param is used (Ref types can't cross await)
    const awaitStatesCount = this._collectAwaitStates(body).length;
    if (awaitStatesCount > 0) {
      for (const p of (params || [])) {
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'Ref') {
          throw this.error(`"Ref<T>" cannot live across "await"; use ".clone()" to make an owned copy`, node);
        }
      }
    }

    // Scan fields and collect sub-state fields (also pre-emits any spawn env/fn)
    const { paramFields, bodyFields, inlined, inlinedTypes, spawnInfos, extraPollParams } = this._scanAsyncBody(params, body);
    const awaitStates = this._collectAwaitStates(body);
    this._preScanTypes = null;

    // Propagate inner return type to body vars assigned from unknown awaits (default int32_t)
    if (innerResultCType && innerResultCType !== 'int32_t') {
      const returnedVars = new Set();
      const scanReturns = (stmts) => {
        for (const s of stmts || []) {
          if (s.kind === 'Return' && s.value?.kind === 'Ident') returnedVars.add(s.value.name);
          if (s.kind === 'Block') scanReturns(s.body);
          if (s.kind === 'If') { scanReturns([s.consequent]); if (s.alternate) scanReturns([s.alternate]); }
          if (s.kind === 'TryCatch') scanReturns(s.body?.body || []);
        }
      };
      scanReturns(body?.kind === 'Block' ? body.body : []);
      for (const f of bodyFields) {
        if (f.ctype === 'int32_t' && returnedVars.has(f.name)) f.ctype = innerResultCType;
      }
    }

    // Build struct field strings
    const sFields = ['int32_t _state'];
    if (resultCType !== null) sFields.push(`${resultCType} _result`);
    sFields.push('bool _done');
    for (const f of paramFields) sFields.push(`${f.ctype} ${f.name}`);
    for (const f of bodyFields) {
      sFields.push(`${f.ctype} ${f.name}`);
      // Ensure Array_u8 struct is emitted before the state struct that references it
      if (f.ctype === 'Array_u8') this._ensureArrayStruct('Array_u8', 'uint8_t');
    }
    for (const af of awaitStates) {
      if (!af.isUnknown) sFields.push(`${af.stateType} ${af.fieldName}`);
    }

    // Compact if no promoted body vars; multiline if any body vars exist
    const _hasStaticDec = (node.decorators ?? []).some(d => d.name === 'static');
    if (_hasStaticDec || bodyFields.length === 0) {
      this._emitStructCompact(stateType, sFields);
    } else {
      this._emitStructMultiline(stateType, sFields);
    }

    // Register
    this._asyncFuncs.set(name, { stateType, pollFn, resultCType, params });
    this.define(name, {
      ctype: resultCType ?? 'int', funcName: name,
      _isAsync: true, _stateType: stateType, _pollFn: pollFn, params,
    });

    if (!body) return;

    // Check for unknown await targets (no poll function available)
    const canEmitPoll = awaitStates.every(af => !af.isUnknown);
    if (!canEmitPoll) return;

    // Build promoted set
    const promoted = new Set();
    for (const f of paramFields) promoted.add(f.name);
    for (const f of bodyFields) promoted.add(f.name);

    // Build spawn alias map: userVar → threadVar (for await t.join() detection)
    const spawnVarAlias = new Map();
    for (const si of spawnInfos) spawnVarAlias.set(si.userVar, si.threadVar);

    this._selfCtx = { promoted, inlined, inlinedTypes, resultCType, hasThrows, throwsKey, spawnInfos, spawnVarAlias, extraPollParams };
    this._inAsyncFunc = true;

    const pollLines = this._buildAsyncPoll(body);

    this._inAsyncFunc = false;
    this._selfCtx = null;

    // Extra poll params from spawn free vars
    const extraParamsStr = extraPollParams.length > 0
      ? ', ' + extraPollParams.map(f => `${f.ctype} ${f.name}`).join(', ')
      : '';
    this._emitTopFn(`static void ${pollFn}(${stateType} *self${extraParamsStr})`, pollLines);

    // @static cooperative task: emit static instance, register for main scheduler
    const hasStaticDec = (node.decorators ?? []).some(d => d.name === 'static');
    if (hasStaticDec && this._schedulerName === 'cooperative') {
      this.topLevel.push('');
      this.topLevel.push(`static ${stateType} _${name}_instance;`);
      if (!this._staticTasks) this._staticTasks = [];
      this._staticTasks.push({ name, stateType, pollFn });
      return;
    }

    // Async main handling
    if (name === 'main') {
      this._asyncMainPollFn = pollFn;
      this._asyncMainStateType = stateType;
      this._asyncMainIsDesktop = (resultCType === null); // Promise<void>
    }
  },

  _buildAsyncPoll(body) {
    const stmts = body?.kind === 'Block' ? body.body : [];
    const lines = [];
    const ctx = { awaitIdx: 0, genIdx: 0, nextCase: 1, loopLabels: [], terminated: false };

    lines.push('    switch (self->_state) {');
    lines.push('        case 0:');

    this._emitAsyncStmtList(stmts, lines, ctx, '            ');

    // Implicit done at end of function (if not already terminated by explicit return)
    if (!ctx.terminated) {
      lines.push('            self->_done = true;');
      lines.push('            return;');
    }

    lines.push('    }');

    return lines;
  },

  _emitAsyncStmtList(stmts, lines, ctx, I) {
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (s?.kind === 'While') {
        this._emitAsyncWhile(s, stmts.slice(i + 1), lines, ctx, I);
        return; // remaining stmts handled inside while emitter
      }
      this._emitAsyncStmt(s, lines, ctx, I);
    }
  },

  _emitAsyncWhile(s, remainingStmts, lines, ctx, I) {
    const loopCase = ctx.nextCase++;
    const condC = this._selfE(s.cond ?? s.test);
    const whileBody = s.body?.kind === 'Block' ? s.body.body : [s.body];

    // Transition to loop condition state
    lines.push(`${I}self->_state = ${loopCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`case_${loopCase}:`);
    lines.push(`        case ${loopCase}:`);

    // Condition check: on failure, inline remaining stmts (common: return x after while)
    if (remainingStmts.length === 0) {
      lines.push(`${I}if (!(${condC})) { self->_done = true; return; }`);
    } else {
      lines.push(`${I}if (!(${condC})) {`);
      const savedTerminated = ctx.terminated;
      ctx.terminated = false;
      for (const rs of remainingStmts) this._emitAsyncStmt(rs, lines, ctx, I + '    ');
      if (!ctx.terminated) {
        lines.push(`${I}    self->_done = true;`);
        lines.push(`${I}    return;`);
      }
      ctx.terminated = savedTerminated;
      lines.push(`${I}}`);
    }

    // Loop body
    this._emitAsyncStmtList(whileBody, lines, ctx, I);

    // Loop back
    if (!ctx.terminated) {
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
    }
    ctx.terminated = true;
  },

  // Emit: self->_state = N; /* fall through */ case N:
  _emitAsyncTransition(lines, ctx, I) {
    lines.push(`${I}self->_state = ${ctx.nextCase};`);
    lines.push(`${I}/* fall through */`);
    lines.push(`        case ${ctx.nextCase}:`);
    ctx.nextCase++;
  },

  // Check for await on a non-async/non-callable expression and throw if found
  _checkAwaitTarget(awaitNode) {
    const expr = awaitNode?.expr;
    if (!expr) return;
    if (expr.kind === 'Ident') {
      // Check inlined consts (they're not async)
      const rawType = this._selfCtx?.inlinedTypes?.get(expr.name);
      if (rawType !== undefined) {
        throw this.error(`"await" can only be applied to Promise<T>, got ${rawType}`, awaitNode);
      }
      const sym = this.lookup(expr.name);
      if (sym && !sym._isAsync && sym.varKind) {
        throw this.error(
          `"await" can only be applied to Promise<T>, got ${sym.ctype ?? 'unknown'}`, awaitNode);
      }
    }
  },

  _emitAsyncStmt(s, lines, ctx, I) {
    if (!s) return;

    // ── spawn VarDecl: emit call site using pre-emitted env/fn ──
    if (s.kind === 'VarDecl' && s.init?.kind === 'Spawn') {
      const si = this._selfCtx?.spawnInfos?.find(info => info.userVar === s.name);
      if (!si) return;
      // Patch previous line (e.g. "        case 0:") to open a block
      if (lines.length > 0) lines[lines.length - 1] += ' {';
      lines.push(`${I}${si.envType} *${si.envVar} = malloc(sizeof(${si.envType}));`);
      for (const fv of si.freeVars) {
        lines.push(`${I}${si.envVar}->${fv.name} = ${fv.name};`);
      }
      lines.push(`${I}self->${si.threadVar} = tsc_thread_spawn(${si.fnName}, ${si.envVar});`);
      lines.push(`${I}self->_state = ${ctx.nextCase};`);
      lines.push('        }');
      lines.push(`        case ${ctx.nextCase}:`);
      ctx.nextCase++;
      this.define(s.name, { ctype: 'tsc_thread_t', varKind: s.varKind, _isThread: true });
      return;
    }

    // ── await in VarDecl ──
    if (s.kind === 'VarDecl' && s.init?.kind === 'Await') {
      this._checkAwaitTarget(s.init);
      const ai = this._awaitInfoOf(s.init);
      if (!ai) return;

      // Promise.race / Promise.any: poll all, take first done's result
      if (ai.kind === 'promise-race' || ai.kind === 'promise-any') {
        const baseIdx = ctx.awaitIdx;
        const doneConds = [];
        for (const item of ai.items) {
          const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
          const sub = callName && this._asyncFuncs?.has(callName) ? this._asyncFuncs.get(callName) : null;
          if (sub) {
            lines.push(`${I}self->_await_${ctx.awaitIdx++} = (${sub.stateType}){0};`);
            doneConds.push({ idx: baseIdx + doneConds.length, sub });
          }
        }
        this._emitAsyncTransition(lines, ctx, I);
        for (const { idx, sub } of doneConds) lines.push(`${I}${sub.pollFn}(&self->_await_${idx});`);
        if (doneConds.length) {
          lines.push(`${I}if (${doneConds.map(({ idx }) => `!self->_await_${idx}._done`).join(' && ')}) return;`);
        }
        if (this._selfCtx.promoted.has(s.name) && ai.resultCType) {
          let rhs = `self->_await_${doneConds[doneConds.length - 1].idx}._result`;
          for (let j = doneConds.length - 2; j >= 0; j--) {
            rhs = `self->_await_${doneConds[j].idx}._done ? self->_await_${doneConds[j].idx}._result : ${rhs}`;
          }
          lines.push(`${I}self->${s.name} = ${rhs};`);
        }
        if (ai.resultCType) this.define(s.name, { ctype: ai.resultCType, varKind: s.varKind });
        return;
      }

      const awaitIdx = ctx.awaitIdx++;

      if (ai.kind === 'sleep') {
        const argC = this._selfE(ai.args?.[0]?.expr);
        lines.push(`${I}self->_await_${awaitIdx} = tsc_sleep_awaitable(${argC});`);
      } else if (ai.kind === 'net-fetch') {
        // fetch(url, opts?) — special handling for options object
        const urlArg = ai.args?.[0]?.expr;
        const urlC = urlArg ? this._selfE(urlArg) : 'STR_LIT("")';
        const optsArg = ai.args?.[1]?.expr;
        if (optsArg && optsArg.kind === 'ObjLit') {
          // Wrap case in {} for local opts var
          if (lines.length > 0) lines[lines.length - 1] += ' {';
          const optsIdx = this._fetchOptsCount ?? 0;
          this._fetchOptsCount = optsIdx + 1;
          const optsVar = `_opts_${optsIdx}`;
          const optsFields = (optsArg.props ?? []).map(p => `.${p.key} = ${this._selfE(p.value)}`);
          lines.push(`${I}TscFetchOptions ${optsVar} = { ${optsFields.join(', ')} };`);
          lines.push(`${I}self->_await_${awaitIdx} = tsc_fetch_async(${urlC}, &${optsVar});`);
          lines.push(`${I}self->_state = ${ctx.nextCase};`);
          lines.push(`${I}/* fall through */`);
          lines.push('        }');
          lines.push(`        case ${ctx.nextCase}:`);
          ctx.nextCase++;
        } else {
          lines.push(`${I}self->_await_${awaitIdx} = tsc_fetch_async(${urlC}, NULL);`);
          this._emitAsyncTransition(lines, ctx, I);
        }
      } else if (ai.initFn) {
        const callArgs = [...(ai.rawArgs ?? [])];
        for (const arg of (ai.args ?? [])) {
          const argExpr = arg?.expr;
          if (!argExpr) continue;
          const argC = this._selfE(argExpr);
          const argType = this.inferType(argExpr);
          if (argType === 'Array_u8' || argType?.startsWith('Array_')) {
            callArgs.push(`${argC}.data`, `${argC}.length`);
          } else {
            callArgs.push(argC);
          }
        }
        lines.push(`${I}self->_await_${awaitIdx} = ${ai.initFn}(${callArgs.join(', ')});`);
        this._emitAsyncTransition(lines, ctx, I);
      } else {
        lines.push(`${I}self->_await_${awaitIdx} = (${ai.stateType}){0};`);
        this._emitAsyncTransition(lines, ctx, I);
      }
      lines.push(`${I}${ai.pollFn}(&self->_await_${awaitIdx});`);
      lines.push(`${I}if (!self->_await_${awaitIdx}._done) return;`);
      if (ai.isResult) {
        lines.push(`${I}if (!self->_await_${awaitIdx}._result.ok) { self->_done = true; return; }`);
        if (this._selfCtx.promoted.has(s.name) && ai.resultCType) {
          lines.push(`${I}self->${s.name} = self->_await_${awaitIdx}._result.value;`);
        }
      } else if (this._selfCtx.promoted.has(s.name) && ai.resultCType) {
        lines.push(`${I}self->${s.name} = self->_await_${awaitIdx}._result;`);
      }
      // Define var in scope so subsequent expressions can infer its type
      if (ai.resultCType) this.define(s.name, { ctype: ai.resultCType, varKind: s.varKind });
      return;
    }

    // ── await in VarDestructArr (const [x,y] = await Promise.all([...])) ──
    if (s.kind === 'VarDestructArr' && s.init?.kind === 'Await') {
      const ai = this._awaitInfoOf(s.init);
      if (!ai || ai.kind !== 'promise-all') return;

      const baseIdx = ctx.awaitIdx;
      // Init all sub-states
      for (let j = 0; j < ai.items.length; j++) {
        const callName = ai.items[j]?.expr?.callee?.kind === 'Ident'
          ? ai.items[j].expr.callee.name : null;
        const sub = callName && this._asyncFuncs?.has(callName)
          ? this._asyncFuncs.get(callName) : null;
        if (sub) lines.push(`${I}self->_await_${ctx.awaitIdx++} = (${sub.stateType}){0};`);
      }
      this._emitAsyncTransition(lines, ctx, I);

      // Poll all + combined done check
      const notDone = [];
      for (let j = 0; j < ai.items.length; j++) {
        const callName = ai.items[j]?.expr?.callee?.kind === 'Ident'
          ? ai.items[j].expr.callee.name : null;
        const sub = callName && this._asyncFuncs?.has(callName)
          ? this._asyncFuncs.get(callName) : null;
        if (sub) {
          lines.push(`${I}${sub.pollFn}(&self->_await_${baseIdx + j});`);
          notDone.push(`!self->_await_${baseIdx + j}._done`);
        }
      }
      if (notDone.length) lines.push(`${I}if (${notDone.join(' || ')}) return;`);

      // Assign results to destructured vars (unwrap .value for Result_T_Err types)
      for (let j = 0; j < (s.pattern || []).length; j++) {
        const elem = s.pattern[j];
        if (!elem) continue;
        const callName = ai.items[j]?.expr?.callee?.kind === 'Ident'
          ? ai.items[j].expr.callee.name : null;
        const sub = callName && this._asyncFuncs?.has(callName)
          ? this._asyncFuncs.get(callName) : null;
        if (sub && this._selfCtx.promoted.has(elem.name)) {
          const needsUnwrap = sub.resultCType?.startsWith('Result_');
          const rhs = needsUnwrap
            ? `self->_await_${baseIdx + j}._result.value`
            : `self->_await_${baseIdx + j}._result`;
          lines.push(`${I}self->${elem.name} = ${rhs};`);
        }
      }
      return;
    }

    // ── await in ExprStmt (no result) ──
    if (s.kind === 'ExprStmt' && s.expr?.kind === 'Await') {
      // Special case: await t.join() on a spawned thread handle
      const awaitInner = s.expr.expr;
      if (awaitInner?.kind === 'Call' && awaitInner.callee?.kind === 'Member' && awaitInner.callee.prop === 'join') {
        const tObj = awaitInner.callee.object;
        const alias = this._selfCtx?.spawnVarAlias?.get(tObj?.name);
        if (alias) {
          lines.push(`${I}if (!tsc_thread_done(self->${alias})) return;`);
          lines.push(`${I}tsc_thread_join(self->${alias});`);
          return;
        }
      }
      this._checkAwaitTarget(s.expr);
      const ai = this._awaitInfoOf(s.expr);
      if (!ai) return;

      // Promise.allSettled / race / any as statement (no result capture)
      if (ai.kind === 'promise-allSettled' || ai.kind === 'promise-race' || ai.kind === 'promise-any') {
        const baseIdx = ctx.awaitIdx;
        const subItems = [];
        for (const item of ai.items) {
          const callName = item?.expr?.callee?.kind === 'Ident' ? item.expr.callee.name : null;
          const sub = callName && this._asyncFuncs?.has(callName) ? this._asyncFuncs.get(callName) : null;
          if (sub) { lines.push(`${I}self->_await_${ctx.awaitIdx++} = (${sub.stateType}){0};`); subItems.push({ idx: baseIdx + subItems.length, sub }); }
        }
        this._emitAsyncTransition(lines, ctx, I);
        const notDone = [];
        for (const { idx, sub } of subItems) {
          lines.push(`${I}${sub.pollFn}(&self->_await_${idx});`);
          notDone.push(`!self->_await_${idx}._done`);
        }
        if (notDone.length) {
          const op = ai.kind === 'promise-allSettled' ? ' || ' : ' && ';
          lines.push(`${I}if (${notDone.join(op)}) return;`);
        }
        return;
      }

      const awaitIdx = ctx.awaitIdx++;

      if (ai.kind === 'sleep') {
        const argC = this._selfE(ai.args?.[0]?.expr);
        lines.push(`${I}self->_await_${awaitIdx} = tsc_sleep_awaitable(${argC});`);
      } else if (ai.initFn) {
        const callArgs = [...(ai.rawArgs ?? [])];
        for (const arg of (ai.args ?? [])) {
          const argExpr = arg?.expr;
          if (!argExpr) continue;
          const argC = this._selfE(argExpr);
          const argType = this.inferType(argExpr);
          if (argType === 'Array_u8' || argType?.startsWith('Array_')) {
            callArgs.push(`${argC}.data`, `${argC}.length`);
          } else {
            callArgs.push(argC);
          }
        }
        lines.push(`${I}self->_await_${awaitIdx} = ${ai.initFn}(${callArgs.join(', ')});`);
      } else {
        lines.push(`${I}self->_await_${awaitIdx} = (${ai.stateType}){0};`);
      }
      this._emitAsyncTransition(lines, ctx, I);
      lines.push(`${I}${ai.pollFn}(&self->_await_${awaitIdx});`);
      lines.push(`${I}if (!self->_await_${awaitIdx}._done) return;`);
      return;
    }

    // ── try/catch/finally with await ──
    if (s.kind === 'TryCatch') {
      for (const ts of s.body?.body || []) this._emitAsyncStmt(ts, lines, ctx, I);
      const lastAwaitIdx = ctx.awaitIdx - 1;

      const catchClause = s.catches?.[0];
      if (catchClause) {
        const { param, body: catchBody } = catchClause;
        lines.push(`${I}if (!self->_await_${lastAwaitIdx}._result.ok) {`);
        if (param) {
          // param is a string name; typeAnn is on the catchClause directly
          const pct = catchClause.typeAnn ? this.resolveType(catchClause.typeAnn) : 'void *';
          lines.push(`${I}    ${pct} ${param} = self->_await_${lastAwaitIdx}._result.error;`);
        }
        for (const cs of catchBody?.body || []) this._emitAsyncRegStmt(cs, lines, I + '    ');
        const catchEndsReturn = (catchBody?.body || []).some(cs => cs.kind === 'Return');
        if (!catchEndsReturn) {
          lines.push(`${I}    self->_done = true;`);
          lines.push(`${I}    return;`);
        }
        lines.push(`${I}}`);
      }
      if (s.finally) {
        for (const fs of s.finally.body || []) this._emitAsyncRegStmt(fs, lines, I);
      }
      return;
    }

    // ── for await ──
    if (s.kind === 'ForOf' && s.await) {
      const genName = s.iterable?.callee?.kind === 'Ident' ? s.iterable.callee.name
                    : s.iterable?.kind === 'Ident' ? s.iterable.name : null;
      const gi = genName && this._generatorFuncs?.has(genName)
        ? this._generatorFuncs.get(genName) : null;
      if (!gi) return;

      const genIdx = ctx.genIdx++;
      const genArgs = s.iterable?.kind === 'Call' ? (s.iterable.args || []) : [];
      const loopCase = ctx.nextCase;

      lines.push(`${I}self->_gen_${genIdx} = (${gi.stateType}){0};`);
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}/* fall through */`);
      lines.push(`case_${loopCase}:`);
      lines.push(`        case ${loopCase}: {`);
      ctx.nextCase++;

      const genArgsC = genArgs.map(a => this._selfE(a.expr)).join(', ');
      const nextArgs = genArgsC ? `&self->_gen_${genIdx}, ${genArgsC}` : `&self->_gen_${genIdx}`;
      const nrVar = `_nr_${genIdx}`;
      lines.push(`${I}    ${gi.resultType} ${nrVar} = ${gi.nextFn}(${nextArgs});`);
      lines.push(`${I}    if (${nrVar}.done) { self->_done = true; return; }`);

      if (s.binding?.kind === 'Ident') {
        lines.push(`${I}    const ${gi.valueType} ${s.binding.name} = ${nrVar}.value;`);
      }

      for (const bs of s.body?.body || []) {
        const tmp = [];
        this.visitStmt(bs, tmp, 0);
        for (const l of tmp) lines.push(`${I}    ${l.trim()}`);
      }

      lines.push(`${I}    goto case_${loopCase};`);
      lines.push(`        }`);
      ctx.terminated = true; // loop handles done internally via _nr.done check
      return;
    }

    // ── throw (in async throws function) ──
    if (s.kind === 'Throw' && this._selfCtx?.hasThrows) {
      lines.push(`${I}self->_result = (${this._selfCtx.resultCType}){.ok = false, .error = ${this._selfE(s.value)}};`);
      lines.push(`${I}self->_done = true;`);
      lines.push(`${I}return;`);
      ctx.terminated = true;
      return;
    }

    // ── return ──
    if (s.kind === 'Return') {
      const retCtx = this._selfCtx;
      if (s.value) {
        if (retCtx?.hasThrows) {
          lines.push(`${I}self->_result = (${retCtx.resultCType}){.ok = true, .value = ${this._selfE(s.value)}};`);
        } else {
          lines.push(`${I}self->_result = ${this._selfE(s.value)};`);
        }
      } else if (retCtx?.hasThrows) {
        lines.push(`${I}self->_result = (${retCtx.resultCType}){.ok = true};`);
      }
      lines.push(`${I}self->_done = true;`);
      lines.push(`${I}return;`);
      ctx.terminated = true;
      return;
    }

    // ── regular statement ──
    this._emitAsyncRegStmt(s, lines, I);
  },

  // Emit a regular statement (non-VarDecl, non-Return, non-Await) in async context
  _emitAsyncRegStmt(stmt, lines, I) {
    if (!stmt) return;
    if (stmt.kind === 'VarDecl') {
      const { name, init } = stmt;
      const ctx = this._selfCtx;
      if (ctx?.inlined.has(name)) return;
      if (ctx?.promoted.has(name)) {
        if (init) {
          // In assignment context, bare {0} is not valid — need compound literal cast
          let initC = this._selfE(init);
          const ct = stmt.typeAnn ? this.resolveType(stmt.typeAnn)
                   : (init ? (this.inferType(init) || null) : null);
          if (initC === '{0}' && ct) initC = `(${ct}){0}`;
          lines.push(`${I}self->${name} = ${initC};`);
          // Define in scope so subsequent _awaitInfoOf lookups see the correct type
          if (ct) this.define(name, { ctype: ct, varKind: stmt.varKind ?? 'const' });
        }
      } else {
        const tmp = [];
        this.visitStmt(stmt, tmp, 0);
        for (const l of tmp) lines.push(I + l.trim());
      }
    } else if (stmt.kind === 'Return') {
      const ctx = this._selfCtx;
      if (stmt.value) {
        if (ctx?.hasThrows) {
          // Wrap in Result ok=true
          lines.push(`${I}self->_result = (${ctx.resultCType}){.ok = true, .value = ${this._selfE(stmt.value)}};`);
        } else {
          lines.push(`${I}self->_result = ${this._selfE(stmt.value)};`);
        }
      } else if (ctx?.hasThrows) {
        lines.push(`${I}self->_result = (${ctx.resultCType}){.ok = true};`);
      }
      lines.push(`${I}self->_done = true;`);
      lines.push(`${I}return;`);
    } else if (stmt.kind === 'Throw') {
      const ctx = this._selfCtx;
      if (ctx?.hasThrows) {
        lines.push(`${I}self->_result = (${ctx.resultCType}){.ok = false, .error = ${this._selfE(stmt.value)}};`);
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return;`);
      } else {
        const tmp = [];
        this.visitStmt(stmt, tmp, 0);
        for (const l of tmp) lines.push(I + l.trim());
      }
    } else {
      const tmp = [];
      this.visitStmt(stmt, tmp, 0);
      for (const l of tmp) lines.push(I + l.trim());
    }
  },

  // Evaluate an expression with the current _selfCtx substitution
  _selfE(expr) {
    if (!expr) return '0';
    const r = this.exprToC(expr, [], 0);
    return r;
  },

  // ─── emitGeneratorFunc ────────────────────────────────────────────────────

  emitGeneratorFunc(node) {
    this._initAsync();
    const { name, params, returnType, body, throwsTypes } = node;

    // Determine yield type
    let yieldType = 'int32_t';
    if (returnType?.kind === 'TypeRef') {
      if (returnType.name === 'Generator') {
        yieldType = this.resolveType(returnType.typeArgs?.[0]) || 'int32_t';
      } else {
        yieldType = this.resolveType(returnType) || 'int32_t';
      }
    }

    const throwsNames = [];
    for (const t of (throwsTypes || [])) {
      if (t.kind === 'TypeRef') throwsNames.push(t.name);
    }
    const hasThrows = throwsNames.length > 0;
    const errKey = hasThrows ? throwsNames[0] : null;
    const resultCt = hasThrows
      ? `Result_${this.cTypeToIdent(yieldType)}_${errKey}` : null;

    const stateType = `${name}_state`;
    const resultType = `${name}_result`;
    const nextFn = `${name}_next`;

    // Scan let vars (promoted to struct)
    const letFields = [];
    const seenLets = new Set();
    const walkLets = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl' && s.varKind === 'let' && !seenLets.has(s.name)) {
          seenLets.add(s.name);
          const ct = s.typeAnn ? this.resolveType(s.typeAnn)
                   : s.init ? (this.inferType(s.init) || 'int32_t') : 'int32_t';
          letFields.push({ name: s.name, ctype: ct });
        }
        if (s.kind === 'Block') walkLets(s.body);
        if (s.kind === 'While') walkLets(s.body?.kind === 'Block' ? s.body.body : [s.body]);
        if (s.kind === 'For') walkLets(s.body?.kind === 'Block' ? s.body.body : [s.body]);
      }
    };
    walkLets(body?.kind === 'Block' ? body.body : []);

    // Emit Result_T_E typedef if needed (before state struct references it)
    if (hasThrows) {
      this._topBlank();
      this.topLevel.push(`typedef struct { bool ok; union { ${yieldType} value; ${errKey} error; }; } ${resultCt};`);
      // No blank before state struct — keep them together
    }

    // State struct (compact) — no blank before if we just emitted Result_T_E
    const isVoidYield = yieldType === 'void';
    const stateFields = ['int32_t _state'];
    for (const f of letFields) stateFields.push(`${f.ctype} ${f.name}`);
    stateFields.push('bool _done');
    if (hasThrows) {
      stateFields.push(`${resultCt} _result`);
    } else if (!isVoidYield) {
      stateFields.push(`${yieldType} _value`);
    }
    if (!hasThrows) this._topBlank();
    this.topLevel.push(`typedef struct { ${stateFields.join('; ')}; } ${stateType};`);

    // Result struct (compact, no blank before — same block)
    const resValueType = hasThrows ? resultCt : yieldType;
    const resultField = isVoidYield ? 'int _dummy' : `${resValueType} value`;
    this.topLevel.push(`typedef struct { ${resultField}; bool done; } ${resultType};`);

    // Register result struct in class registry for inferType to resolve .value type
    this.classes.set(resultType, {
      isStruct: true,
      fields: isVoidYield
        ? [{ name: '_dummy', ctype: 'int' }, { name: 'done', ctype: 'bool' }]
        : [{ name: 'value', ctype: resValueType }, { name: 'done', ctype: 'bool' }],
    });

    // Register
    this._generatorFuncs.set(name, { stateType, resultType, nextFn, valueType: yieldType, params, letFields });
    this.define(name, {
      ctype: stateType, funcName: name, _isGenerator: true,
      _stateType: stateType, _resultType: resultType, _nextFn: nextFn,
      _valueType: yieldType, params,
    });

    if (!body) return;

    // Build next function signature
    const paramStrs = (params || []).map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return `${ct} ${p.name}`;
    });
    const fnSig = `static ${resultType} ${nextFn}(${stateType} *self${paramStrs.length ? ', ' + paramStrs.join(', ') : ''})`;

    // Set up generator self context (let vars promoted)
    const genPromoted = new Set(letFields.map(f => f.name));
    this._selfCtx = { promoted: genPromoted, inlined: new Map() };

    const nextLines = this._buildGenNext(body, yieldType, resultType, hasThrows, resultCt);

    this._selfCtx = null;

    this._emitTopFn(fnSig, nextLines);

    // @static / @embedded.singleton generator: emit static instance in BSS
    const _hasStaticDecGen = (node.decorators ?? []).some(d =>
      d.name === 'static' || d.name === 'embedded.singleton');
    if (_hasStaticDecGen) {
      this.topLevel.push('');
      this.topLevel.push(`static ${stateType} _${name}_instance;`);
    }
  },

  _buildGenNext(body, yieldType, resultType, hasThrows, resultCt) {
    const stmts = body?.kind === 'Block' ? body.body : [];
    const lines = [];
    const ctx = { caseNum: 0, loopLabels: [], needTerminal: true };

    const zeroVal = yieldType === 'String' ? '(String){0}'
                  : yieldType === 'bool' ? 'false' : '0';
    const doneRet = hasThrows
      ? `return (${resultType}){(${resultCt}){.ok = false}, true};`
      : `return (${resultType}){${zeroVal}, true};`;

    lines.push('    switch (self->_state) {');
    lines.push('        case 0:');

    this._emitGenStmtList(stmts, lines, ctx, '            ', yieldType, resultType, hasThrows, resultCt, zeroVal);

    // If last statement was a yield, the open case needs a terminal done
    if (ctx.needTerminal) {
      lines.push(`            self->_done = true;`);
      lines.push(`            ${doneRet}`);
    }

    lines.push('    }');
    lines.push(`    ${doneRet}`);

    return lines;
  },

  _emitGenStmtList(stmts, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal) {
    for (const s of stmts || []) {
      this._emitGenStmt(s, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal);
    }
  },

  _emitGenStmt(s, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal) {
    if (!s) return;

    // Unwrap ExprStmt(Yield(...))
    if (s.kind === 'ExprStmt' && s.expr?.kind === 'Yield') {
      this._emitGenStmt(s.expr, lines, ctx, I, yieldType, resultType, hasThrows, resultCt, zeroVal);
      return;
    }

    if (s.kind === 'Yield') {
      const val = s.value ? this._selfE(s.value) : zeroVal;
      if (hasThrows) {
        lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
        lines.push(`${I}return (${resultType}){(${resultCt}){.ok = true, .value = ${val}}, false};`);
      } else {
        lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
        lines.push(`${I}return (${resultType}){${val}, false};`);
      }
      ctx.caseNum++;
      lines.push(`        case ${ctx.caseNum}:`);
      ctx.needTerminal = true;
      return;
    }

    if (s.kind === 'While') {
      // case for loop condition (falls through from previous case)
      const loopCase = ctx.caseNum + 1;
      lines.push(`case_${loopCase}:`);
      lines.push(`        case ${loopCase}:`);
      ctx.caseNum = loopCase;
      ctx.needTerminal = false;
      const condC = this._selfE(s.test ?? s.cond);
      const doneRet = hasThrows
        ? `return (${resultType}){(${resultCt}){.ok = false}, true};`
        : `return (${resultType}){${zeroVal}, true};`;
      lines.push(`${I}if (!(${condC})) { self->_done = true; ${doneRet} }`);

      const whileBody = s.body?.kind === 'Block' ? s.body.body : [s.body];
      let postYieldStmts = [];
      let yieldFound = false;

      for (const ws of whileBody) {
        if (!ws) continue;
        const wsYield = ws.kind === 'Yield' ? ws : (ws.kind === 'ExprStmt' && ws.expr?.kind === 'Yield' ? ws.expr : null);
        if (wsYield) {
          yieldFound = true;
          const val = wsYield.value ? this._selfE(wsYield.value) : zeroVal;
          if (!hasThrows) {
            lines.push(`${I}self->_value = ${val};`);
            lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
            lines.push(`${I}return (${resultType}){self->_value, false};`);
          } else {
            lines.push(`${I}self->_state = ${ctx.caseNum + 1};`);
            lines.push(`${I}return (${resultType}){(${resultCt}){.ok = true, .value = ${val}}, false};`);
          }
          ctx.caseNum++;
          lines.push(`        case ${ctx.caseNum}:`);
        } else {
          if (yieldFound) postYieldStmts.push(ws);
          else {
            // pre-yield while body (before first yield)
            this._emitGenRegStmt(ws, lines, I);
          }
        }
      }
      for (const ps of postYieldStmts) this._emitGenRegStmt(ps, lines, I);

      // Loop back
      lines.push(`${I}self->_state = ${loopCase};`);
      lines.push(`${I}goto case_${loopCase};`);
      return;
    }

    if (s.kind === 'Return') {
      if (!s.value) {
        lines.push(`${I}self->_done = true;`);
        const doneRet = hasThrows
          ? `(${resultType}){(${resultCt}){.ok = false}, true}`
          : `(${resultType}){${zeroVal}, true}`;
        lines.push(`${I}return ${doneRet};`);
      }
      ctx.needTerminal = false;
      return;
    }

    if (s.kind === 'Throw') {
      if (hasThrows) {
        const errC = this._selfE(s.value);
        lines.push(`${I}self->_done = true;`);
        lines.push(`${I}return (${resultType}){(${resultCt}){.ok = false, .error = ${errC}}, true};`);
      }
      ctx.needTerminal = false;
      return;
    }

    this._emitGenRegStmt(s, lines, I);
  },

  _emitGenRegStmt(stmt, lines, I) {
    if (!stmt) return;
    if (stmt.kind === 'VarDecl') {
      const { varKind, name, typeAnn, init } = stmt;
      if (varKind === 'let' && this._selfCtx?.promoted.has(name)) {
        if (init) lines.push(`${I}self->${name} = ${this._selfE(init)};`);
      } else {
        const ct = typeAnn ? this.resolveType(typeAnn)
                 : init ? (this.inferType(init) || 'int32_t') : 'int32_t';
        const initC = init ? this._selfE(init) : null;
        lines.push(initC ? `${I}${ct} ${name} = ${initC};` : `${I}${ct} ${name};`);
      }
    } else {
      const tmp = [];
      this.visitStmt(stmt, tmp, 0);
      for (const l of tmp) lines.push(I + l.trim());
    }
  },
};
