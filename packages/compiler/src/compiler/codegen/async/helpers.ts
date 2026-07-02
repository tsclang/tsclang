import type { TypeAnn, TypeRef, Await, Argument, Expression } from '@tsclang/ast';
import type { CodeGenContext } from '../../codegen.js';

export interface AwaitInfo {
  kind: string;
  stateType?: string;
  pollFn?: string;
  initFn?: string;
  resultCType?: string | null;
  args?: Argument[];
  rawArgs?: string[];
  isResult?: boolean;
  name?: string;
  items?: { expr: Expression; spread?: boolean }[];
}

export function _awaitItemCallName(expr: Expression | undefined): string | null {
  if (!expr || expr.kind !== 'Call') return null;
  const callee = expr.callee;
  return callee.kind === 'Ident' ? callee.name : null;
}

type InitNode = { kind: string; litType?: string; value: string | boolean };
export function _initAsync(ctx: CodeGenContext) {


}

  // ─── Return type helpers ──────────────────────────────────────────────────

  // C result type for async _result field.
  // Returns null for Promise<void> (no _result field).
  // Returns 'int' for void (placeholder).
export function _asyncRetType(ctx: CodeGenContext, rt: TypeAnn | null) {
    if (!rt) return 'int';
    if (rt.kind === 'TypeRef') {
      if (rt.name === 'Promise') {
        const inner = rt.typeArgs?.[0];
        if (!inner || (inner as TypeRef).name === 'void') return null;
        return ctx.resolveType(inner);
      }
      if (rt.name === 'void') return 'int';
    }
    return ctx.resolveType(rt);
}

  // ─── Inlinable const detection ────────────────────────────────────────────

export function _isInlinableConst(ctx: CodeGenContext, init: Expression | null | undefined) {
    if (!init) return false;
    const n = init as unknown as InitNode;
    if (n.kind === 'Literal') return n.litType === 'number' || n.litType === 'boolean';
    return n.kind === 'Num' || n.kind === 'Bool';
}

export function _constLiteralC(ctx: CodeGenContext, init: Expression) {
    const n = init as unknown as InitNode;
    if (n.kind === 'Literal') {
      if (n.litType === 'number') return String(n.value);
      if (n.litType === 'boolean') return n.value === 'true' || n.value === true ? 'true' : 'false';
    }
    if (n.kind === 'Num') return String(n.value);
    if (n.kind === 'Bool') return n.value ? 'true' : 'false';
    return null;
}

  // ─── Await info ───────────────────────────────────────────────────────────

export function _awaitInfoOf(ctx: CodeGenContext, awaitNode: Await): AwaitInfo | null {
    const expr = awaitNode.expr;
    if (!expr) return null;

    if (expr.kind === 'Call') {
      const callee = expr.callee?.kind === 'Ident' ? expr.callee.name : null;

      if (callee === 'sleep') {
        return { kind: 'sleep', stateType: 'TscSleepAwaitable', pollFn: 'tsc_sleep_poll',
                 resultCType: null, args: expr.args };
      }
      // std/net: fetch(url, opts?) — only if NOT a user-defined async function
      if (callee === 'fetch' && !ctx._asyncFuncs?.has('fetch')) {
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
      if (expr?.callee?.kind === 'Member' && expr.callee.object?.kind === 'Member' &&
          expr.callee.object?.object?.kind === 'Ident' && expr.callee.object?.object?.name === 'process') {
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
        const _sockSym = ctx.lookup(expr.callee.object.name);
        const _sockCtype = _sockSym?.ctype ?? ctx._preScanTypes?.get(expr.callee.object.name);
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
        const _fsSym3 = ctx.lookup(expr.callee.object.name) ??
          (ctx._preScanTypes?.get(expr.callee.object.name) === '__fs_namespace__' ? { _isFsNamespace: true } : null);
        if (_fsSym3?._isFsNamespace) {
          const _fp = expr.callee.prop;
          const _fsAsync = (initFn: string, pollFn: string, stateType: string, resultCType: string | null) =>
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
      if (expr?.callee?.kind === 'Member' &&
          expr.callee.object?.kind === 'Ident' && expr.callee.object?.name === 'net' &&
          expr.callee.prop === 'connect') {
        return { kind: 'net-connect', stateType: 'TscConnectAwaitable', pollFn: 'tsc_net_connect_poll',
                 initFn: 'tsc_net_connect_async', resultCType: 'TscSocket', args: expr.args };
      }
      if (expr?.callee?.kind === 'Member' &&
          expr.callee.object?.kind === 'Ident' && expr.callee.object?.name === 'Promise' &&
          expr.callee.prop === 'all') {
        const items = (expr.args?.[0]?.expr?.kind === 'ArrayLit' ? expr.args[0].expr.elems : null) || [];
        return { kind: 'promise-all', items };
      }
      if (expr?.callee?.kind === 'Member' &&
          expr.callee.object?.kind === 'Ident' && expr.callee.object?.name === 'Promise' &&
          (expr.callee.prop === 'race' || expr.callee.prop === 'any' || expr.callee.prop === 'allSettled')) {
        const prop = expr.callee.prop;
        const items = (expr.args?.[0]?.expr?.kind === 'ArrayLit' ? expr.args[0].expr.elems : null) || [];
        let resultCType: string | null = null;
        if (prop !== 'allSettled') {
          const firstExpr = items[0]?.expr;
          const firstName = firstExpr?.kind === 'Call' && firstExpr.callee?.kind === 'Ident' ? firstExpr.callee.name : null;
          if (firstName && ctx._asyncFuncs?.has(firstName)) {
            resultCType = ctx._asyncFuncs.get(firstName)!.resultCType;
          }
        }
        return { kind: `promise-${prop}`, items, resultCType };
      }
      if (callee && ctx._asyncFuncs?.has(callee)) {
        const info = ctx._asyncFuncs.get(callee)!;
        const isResult = info.resultCType?.startsWith('Result_');
        const valueCType = isResult ? info.innerResultCType : info.resultCType;
        return { kind: 'async', name: callee, stateType: info.stateType,
                 pollFn: info.pollFn, resultCType: valueCType, isResult, args: expr.args };
      }
      if (callee) {
        return { kind: 'unknown', name: callee,
                 stateType: `${callee}_state`, pollFn: `${callee}_poll`, resultCType: null };
      }
    }
    return null;
}
