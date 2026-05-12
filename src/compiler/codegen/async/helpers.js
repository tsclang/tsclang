// helpers.js
export default {
  _initAsync() {
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
};
