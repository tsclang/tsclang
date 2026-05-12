export default {
  _dispatchStdLib(node, lines, depth) {
    const { callee, args } = node;
    let _r;
    _r = this._dispatchStdIo(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdHal(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdBlob(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdUrl(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdSignal(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdWs(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdNet(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdFs(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdTemporal(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdBuffer(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdDataView(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdHashMap(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdSet(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdTasks(node, lines, depth);
    if (_r !== null) return _r;
    _r = this._dispatchStdRegex(node, lines, depth);
    if (_r !== null) return _r;
    return null;
  },

  _dispatchStdIo(node, lines, depth) {
    const { callee, args } = node;
    if (this._stdIoImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _ioSym = this.lookup(callee.object.name);
      const _ioName = callee.object.name;
      const _ioProp = callee.prop;
      if (_ioSym?.ctype === 'Reader' && _ioProp === 'read') {
        const bufArg = args[0]?.expr;
        const bufName = bufArg?.kind === 'Ident' ? bufArg.name : this.exprToC(bufArg, lines, depth);
        this._lastHalRead = 'size_t';
        return `${_ioName}.vtable->read(${_ioName}.self, ${bufName}.data, ${bufName}.length)`;
      }
      if (_ioSym?.ctype === 'Writer' && _ioProp === 'write') {
        const bufArg = args[0]?.expr;
        const bufName = bufArg?.kind === 'Ident' ? bufArg.name : this.exprToC(bufArg, lines, depth);
        return `${_ioName}.vtable->write(${_ioName}.self, ${bufName}.data, ${bufName}.length)`;
      }
    }
    return null;
  },

  _dispatchStdHal(node, lines, depth) {
    const { callee, args } = node;
    if (this._stdHalImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _halClass = callee.object.name;
      const _halProp  = callee.prop;
      if (_halClass === 'GPIO') {
        if (_halProp === 'mode') {
          const pin  = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const mode = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'TSC_PINMODE_INPUT';
          return `tsc_gpio_mode(${pin}, ${mode})`;
        }
        if (_halProp === 'output') return `tsc_gpio_output(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        if (_halProp === 'input')  return `tsc_gpio_input(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        if (_halProp === 'write') {
          const pin = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'false';
          return `tsc_gpio_write(${pin}, ${val})`;
        }
        if (_halProp === 'read') {
          this._lastHalRead = 'bool';
          return `tsc_gpio_read(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        }
      }
      if (_halClass === 'I2C') {
        if (_halProp === 'begin') return 'tsc_i2c_begin()';
        if (_halProp === 'write') {
          const addr = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const dataN = args[1]?.expr?.kind === 'Ident' ? args[1].expr.name : '_data';
          return `tsc_i2c_write(${addr}, ${dataN}.data, ${dataN}.length)`;
        }
        if (_halProp === 'read') {
          const addr = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const len  = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          this._lastHalRead = 'Array_u8';
          return `tsc_i2c_read(${addr}, ${len})`;
        }
      }
      if (_halClass === 'SPI') {
        if (_halProp === 'begin') return 'tsc_spi_begin()';
        if (_halProp === 'transfer') {
          this._lastHalRead = 'uint8_t';
          return `tsc_spi_transfer(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        }
      }
      if (_halClass === 'UART') {
        if (_halProp === 'init') {
          const cfgArg = args[0]?.expr;
          let baud = '9600';
          if (cfgArg?.kind === 'ObjLit') {
            const bp = cfgArg.props?.find(p => p.key === 'baud');
            if (bp?.value) baud = this.exprToC(bp.value, lines, depth);
          }
          return `tsc_uart_init(${baud})`;
        }
        if (_halProp === 'available') {
          this._lastHalRead = 'bool';
          return 'tsc_uart_available()';
        }
        if (_halProp === 'write') return `tsc_uart_write(${args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'})`;
        if (_halProp === 'read') {
          this._lastHalRead = 'opt_u8';
          this._ensureOptStruct('opt_u8', 'uint8_t');
          return `tsc_uart_read()`;
        }
      }
    }

    return null;
  },

  _dispatchStdBlob(node, lines, depth) {
    const { callee, args } = node;
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _blobSym = this.lookup(callee.object.name);
      const _blobName = callee.object.name;
      const _blobProp = callee.prop;
      if (_blobSym?._isBlob) {
        if (_blobProp === 'slice') {
          const start = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const end   = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${_blobName}.size`;
          const sizeExpr = (args[0] && args[1] &&
            args[0].expr.kind === 'Literal' && args[1].expr.kind === 'Literal')
            ? String(parseInt(args[1].expr.value) - parseInt(args[0].expr.value))
            : `(${end} - ${start})`;
          return `{.data = ${_blobName}.data + ${start}, .size = ${sizeExpr}}`;
        }
        if (_blobProp === 'arrayBuffer') {
          // Ensure Buffer typedef
          if (!this._emittedBufferTypeDef) {
            this._emittedBufferTypeDef = true;
            this.addTop('typedef struct { uint8_t *data; size_t length; } Buffer;');
            this.addTop('');
          }
          return `{.data = ${_blobName}.data, .length = ${_blobName}.size}`;
        }
      }
      if (_blobSym?._isTscBlob) {
        if (_blobProp === 'text') {
          const n = this._blobTextN = (this._blobTextN ?? 0); this._blobTextN++;
          const tmp = `_text_${n}`;
          const I = ' '.repeat(this.indent * depth);
          lines.push(`${I}String ${tmp} = tsc_blob_text(&${_blobName});`);
          this._pushPostStmtCleanup(`${I}tsc_string_free(${tmp});`);
          return tmp;
        }
      }
    }
    return null;
  },

  _dispatchStdUrl(node, lines, depth) {
    const { callee, args } = node;
    // URL / URLSearchParams method calls
    if (this._stdUrlImported && callee.kind === 'Member') {
      // u.searchParams.get/set/delete вЂ” callee.object is Member (u.searchParams)
      if (callee.object.kind === 'Member' && callee.object.prop === 'searchParams') {
        const urlObj = callee.object.object;
        const urlSym = urlObj.kind === 'Ident' ? this.lookup(urlObj.name) : null;
        if (urlSym?._isURL) {
          const urlName = urlObj.name;
          const _spProp = callee.prop;
          if (_spProp === 'get') {
            const keyC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            const n = this._urlOptN = (this._urlOptN ?? 0); this._urlOptN++;
            const tmp = `_v_${n}`;
            lines.push(`${' '.repeat(depth * 4)}TscOptString ${tmp} = tsc_search_params_get(&${urlName}.searchParams, ${keyC});`);
            return `${tmp}.has_value ? ${tmp}.value.data : "null"`;
          }
          if (_spProp === 'set') {
            const k = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            const v = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
            return `tsc_url_params_set(&${urlName}, ${k}, ${v})`;
          }
          if (_spProp === 'delete') {
            const k = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            return `tsc_url_params_delete(&${urlName}, ${k})`;
          }
        }
      }
      // p.get(key) вЂ” URLSearchParams standalone
      if (callee.object.kind === 'Ident') {
        const _spSym = this.lookup(callee.object.name);
        if (_spSym?._isURLSearchParams) {
          const _spName = callee.object.name;
          const _spProp = callee.prop;
          if (_spProp === 'get') {
            const keyC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
            const n = this._urlOptN = (this._urlOptN ?? 0); this._urlOptN++;
            const tmp = `_v_${n}`;
            lines.push(`${' '.repeat(depth * 4)}TscOptString ${tmp} = tsc_search_params_get(&${_spName}, ${keyC});`);
            return `${tmp}.has_value ? ${tmp}.value.data : "null"`;
          }
        }
      }
    }
    return null;
  },

  _dispatchStdSignal(node, lines, depth) {
    const { callee, args } = node;
    // Signal methods: signal.get(), signal.set(val)
    if (this._stdReactiveImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _sigSym = this.lookup(callee.object.name);
      if (_sigSym?._isSignal) {
        const etIdent = _sigSym._signalElemType;
        const sigRef = this._capturedSignalMap?.get(callee.object.name) ?? `&${callee.object.name}`;
        if (callee.prop === 'get') return `tsc_signal_get_${etIdent}(${sigRef})`;
        if (callee.prop === 'set') {
          if (this._inComputedFn) throw this.error(`TypeError: Side effect (signal.set) inside computed() is not allowed`);
          const val = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_signal_set_${etIdent}(${sigRef}, ${val})`;
        }
      }
    }

    // computed(arrow), effect(arrow), batch(arrow)
    if (this._stdReactiveImported && callee.kind === 'Ident') {
      if (callee.name === 'computed' || callee.name === 'effect' || callee.name === 'batch') {
        const arrow = args[0]?.expr;
        const n = callee.name === 'batch' ? (this._batchCount ?? 0) : (this._reactiveClosureCount ?? 0);
        const prefix = callee.name === 'batch' ? `_batch_${n}` : `_closure_${n}`;
        const fnName = `${prefix}_fn`;

        if (callee.name === 'batch') {
          // batch: emit static fn that accesses already-captured signal refs
          this._batchCount = (this._batchCount ?? 0) + 1;
          const batchLines = [];
          if (arrow?.kind === 'Arrow') {
            // Use persistent capture refs inside batch body
            const _savedMap = this._capturedSignalMap;
            this._capturedSignalMap = new Map(this._persistentCaptureRefs ?? []);
            this.pushScope();
            if (arrow.body.kind === 'Block') this.visitBlock(arrow.body, batchLines, 0);
            else { const c = this.exprToC(arrow.body, batchLines, 0); batchLines.push(`return ${c};`); }
            this.popScope();
            this._capturedSignalMap = _savedMap;
          }
          this.topLevel.push(`static void ${fnName}(void) {`);
          for (const l of batchLines) this.topLevel.push('    ' + l);
          this.topLevel.push('}');
          this.topLevel.push('');
          return `tsc_batch(${fnName})`;
        }

        // computed/effect: collect Signal free vars, emit env struct + static captured + fn
        if (!arrow || arrow.kind !== 'Arrow') return `tsc_effect(NULL)`;
        this._reactiveClosureCount = (this._reactiveClosureCount ?? 0) + 1;

        // Find free Signal vars
        const paramNames = new Set((arrow.params ?? []).map(p => p.name));
        const capturedSignals = new Map();
        const walkFreeVars = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(walkFreeVars); return; }
          if (node.kind === 'Call' && node.callee?.kind === 'Member' && node.callee.object?.kind === 'Ident') {
            const varName = node.callee.object.name;
            if (!paramNames.has(varName)) {
              const sym = this.lookup(varName);
              if (sym?._isSignal) capturedSignals.set(varName, sym);
            }
          }
          for (const key of Object.keys(node)) {
            if (key !== 'kind') walkFreeVars(node[key]);
          }
        };
        walkFreeVars(arrow.body);

        // Emit env struct and static captured:
        // if topLevel has global statics already в†’ append there; else use typedefs (stays adjacent to Signal typedef)
        let _envInTopLevel = false;
        if (capturedSignals.size > 0) {
          const envName = `_closure_${n}_env`;
          const fields = [...capturedSignals.entries()].map(([nm, sym]) => `${sym.ctype} *${nm};`).join(' ');
          const hasGlobalsBefore = this.topLevel.some(l => l.trim().length > 0);
          if (hasGlobalsBefore) {
            this.topLevel.push(`typedef struct { ${fields} } ${envName};`);
            this.topLevel.push(`static ${envName} _closure_${n}_captured;`);
            _envInTopLevel = true;
          } else {
            this.typedefs.push(`typedef struct { ${fields} } ${envName};`);
            this.typedefs.push(`static ${envName} _closure_${n}_captured;`);
          }
          // Track captured signal refs for fn body emission
          for (const nm of capturedSignals.keys()) {
            this._capturedSignalMap.set(nm, `_closure_${n}_captured.${nm}`);
          }
        }

        // Emit fn
        const retType = callee.name === 'effect' ? 'void'
          : (arrow.body.kind === 'Block' ? 'int32_t' : (this.inferArrowReturn(arrow) || 'int32_t'));
        const etIdent = this.cTypeToIdent(retType);
        const sigType = callee.name === 'computed' ? `Signal_${etIdent}` : null;

        if (callee.name === 'computed') this._inComputedFn = true;
        const fnLines = [];
        this.pushScope();
        if (arrow.body.kind === 'Block') this.visitBlock(arrow.body, fnLines, 0);
        else { const c = this.exprToC(arrow.body, fnLines, 0); fnLines.push(`return ${c};`); }
        this.popScope();
        if (callee.name === 'computed') this._inComputedFn = false;

        // Clear captured signal map after fn body (back to main context)
        if (capturedSignals.size > 0) {
          for (const nm of capturedSignals.keys()) this._capturedSignalMap.delete(nm);
        }

        // No leading blank when env is adjacent in topLevel; add blank otherwise (env in typedefs)
        if (!_envInTopLevel) this.topLevel.push('');
        this.topLevel.push(`static ${retType} ${fnName}(void) {`);
        for (const l of fnLines) this.topLevel.push('    ' + l);
        this.topLevel.push('}');
        this.topLevel.push('');

        // Emit env init in current scope (main/function body)
        if (capturedSignals.size > 0) {
          const envInit = `(_closure_${n}_env){ ${[...capturedSignals.keys()].map(nm => `.${nm} = &${nm}`).join(', ')} }`;
          lines.push(' '.repeat(this.indent * depth) + `_closure_${n}_captured = ${envInit};`);
          // Track persistent captures for batch fns (separate from fn-body map)
          for (const nm of capturedSignals.keys()) {
            this._persistentCaptureRefs.set(nm, `_closure_${n}_captured.${nm}`);
          }
        }

        if (callee.name === 'computed') {
          // Signal the VarDecl that the result type is Signal_T (not raw T)
          this._lastComputedSigType = sigType;
          this._lastComputedElemType = etIdent;
          return `tsc_computed_${etIdent}(${fnName})`;
        }
        return `tsc_effect(${fnName})`;
      }
    }

    return null;
  },

  _dispatchStdWs(node, lines, depth) {
    const { callee, args } = node;
    // WebSocket methods: ws.send(), ws.close(), ws.onMessage(), ws.onClose(), ws.sendBytes()
    if (this._stdWsImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _wsSym = this.lookup(callee.object.name);
      if (_wsSym?._isWebSocket || _wsSym?.ctype === 'TscWebSocket' || _wsSym?.ctype === 'TscWebSocket *') {
        const _wsIsPtr = _wsSym?.ctype?.endsWith('*');
        const _wsExprC = this.exprToC(callee.object, lines, depth);
        const wsRef = _wsIsPtr ? _wsExprC : `&${_wsExprC}`;
        const _wsProp = callee.prop;
        if (_wsProp === 'send') {
          const msgC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_ws_send(${wsRef}, ${msgC})`;
        }
        if (_wsProp === 'close') {
          return `tsc_ws_close(${wsRef})`;
        }
        if (_wsProp === 'sendBytes') {
          const dataExprC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(_empty_arr)';
          return `tsc_ws_send_bytes(${wsRef}, ${dataExprC}.data, ${dataExprC}.length)`;
        }
        const _wsHoistCb = (paramTypes) => {
          const cbArg = args[0]?.expr;
          if (cbArg?.kind === 'Arrow') {
            this._lambdaParamHint = paramTypes ?? (cbArg.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'String');
            const cbName = this.hoistArrow(cbArg, 'void');
            this._lambdaParamHint = null;
            return cbName;
          }
          return cbArg ? this.exprToC(cbArg, lines, depth) : 'NULL';
        };
        if (_wsProp === 'onMessage') return `tsc_ws_on_message(${wsRef}, ${_wsHoistCb()})`;
        if (_wsProp === 'onClose')   return `tsc_ws_on_close(${wsRef}, ${_wsHoistCb([])})`;
      }
      // WebSocketServer methods: server.onConnect(cb), server.listen(port)
      if (_wsSym?._isWsServer || _wsSym?.ctype === 'TscWebSocketServer') {
        const svrRef = `&${callee.object.name}`;
        const _svrProp = callee.prop;
        if (_svrProp === 'listen') {
          const portC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `tsc_ws_server_listen(${svrRef}, ${portC})`;
        }
        if (_svrProp === 'onConnect') {
          const cbArg = args[0]?.expr;
          let cbName;
          if (cbArg?.kind === 'Arrow') {
            const paramNames = (cbArg.params ?? []).map((p, i) => p.name ?? `_p${i}`);
            const paramTypes = ['TscWebSocket *'];
            const paramStrs = paramTypes.map((t, i) => `${t}${paramNames[i] ?? `_p${i}`}`);
            const handlerLines = [];
            this.pushScope();
            for (let i = 0; i < Math.min(paramNames.length, paramTypes.length); i++) {
              this.define(paramNames[i], { ctype: paramTypes[i], varKind: 'const', _isWebSocket: true });
            }
            if (cbArg.body.kind === 'Block') this.visitBlock(cbArg.body, handlerLines, 0);
            else { const c = this.exprToC(cbArg.body, handlerLines, 0); handlerLines.push(`return ${c};`); }
            this.popScope();
            const n = this._handlerCount ?? 0;
            this._handlerCount = n + 1;
            cbName = `_lambda_${n}_void`;
            this.topLevel.push(`static void ${cbName}(${paramStrs.join(', ')}) {`);
            for (const l of handlerLines) this.topLevel.push('    ' + l);
            this.topLevel.push('}');
            this.topLevel.push('');
          } else {
            cbName = cbArg ? this.exprToC(cbArg, lines, depth) : 'NULL';
          }
          return `tsc_ws_server_on_connect(${svrRef}, ${cbName})`;
        }
      }
    }

    return null;
  },

  _dispatchStdNet(node, lines, depth) {
    const { callee, args } = node;
    // std/net: net.listen(port, handler) / net.connect handled via async
    if (this._stdNetImported && callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'net') {
      const _netProp = callee.prop;
      if (_netProp === 'listen') {
        const portC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const cbArg = args[1]?.expr;
        const n = this._handlerCount ?? 0;
        this._handlerCount = n + 1;
        const handlerName = `_handler_${n}`;
        if (cbArg?.kind === 'Arrow') {
          const paramTypes = ['TscSocket *'];
          const paramNames = (cbArg.params ?? []).map((p, i) => p.name ?? `_p${i}`);
          const paramStrs = paramTypes.map((t, i) => `${t}${paramNames[i]}`);
          const handlerLines = [];
          this.pushScope();
          for (let i = 0; i < paramNames.length; i++) {
            this.define(paramNames[i], { ctype: paramTypes[i], varKind: 'const' });
          }
          if (cbArg.body.kind === 'Block') this.visitBlock(cbArg.body, handlerLines, 0);
          else { const c = this.exprToC(cbArg.body, handlerLines, 0); handlerLines.push(`return ${c};`); }
          this.popScope();
          this.topLevel.push(`static void ${handlerName}(${paramStrs.join(', ')}) {`);
          for (const l of handlerLines) this.topLevel.push('    ' + l);
          this.topLevel.push('}');
          this.topLevel.push('');
        }
        return `tsc_net_listen(${portC}, ${handlerName})`;
      }
    }

    // std/net: HttpServer methods (server.get, server.post, server.listen)
    if (this._stdNetImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _serverSym = this.lookup(callee.object.name);
      if (_serverSym?._isHttpServer) {
        const svrRef = `&${callee.object.name}`;
        const _svrProp = callee.prop;
        if (_svrProp === 'listen') return `tsc_http_server_listen(${svrRef})`;
        if (_svrProp === 'get' || _svrProp === 'post') {
          const pathC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("/")';
          const cbArg = args[1]?.expr;
          const n = this._handlerCount ?? 0;
          this._handlerCount = n + 1;
          const handlerName = `_handler_${n}`;
          if (cbArg?.kind === 'Arrow') {
            const paramNames = (cbArg.params ?? []).map((p, i) => p.name ?? `_p${i}`);
            const paramTypes = ['TscRequest *', 'TscResponse *'];
            const paramStrs = paramTypes.map((t, i) => `${t}${paramNames[i] ?? `_p${i}`}`);
            const handlerLines = [];
            this.pushScope();
            for (let i = 0; i < Math.min(paramNames.length, paramTypes.length); i++) {
              this.define(paramNames[i], { ctype: paramTypes[i], varKind: 'const', _isNetParam: true });
            }
            if (cbArg.body.kind === 'Block') this.visitBlock(cbArg.body, handlerLines, 0);
            else { const c = this.exprToC(cbArg.body, handlerLines, 0); handlerLines.push(`return ${c};`); }
            this.popScope();
            this.topLevel.push(`static void ${handlerName}(${paramStrs.join(', ')}) {`);
            for (const l of handlerLines) this.topLevel.push('    ' + l);
            this.topLevel.push('}');
            this.topLevel.push('');
          }
          return `tsc_http_server_${_svrProp}(${svrRef}, ${pathC}, ${handlerName})`;
        }
      }
      // TscResponse methods: res.text, res.json
      if (_serverSym?.ctype === 'TscResponse *') {
        const resC = callee.object.name;
        if (callee.prop === 'text') {
          const textC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_response_text(${resC}, ${textC})`;
        }
        if (callee.prop === 'json') {
          const jsonC = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_response_json(${resC}, ${jsonC})`;
        }
      }
      // TscSocket methods: sock.close()
      if (_serverSym?.ctype === 'TscSocket *' || _serverSym?.ctype === 'TscSocket') {
        if (callee.prop === 'close') {
          const sockC = this.exprToC(callee.object, lines, depth);
          const sockRef = _serverSym.ctype.endsWith('*') ? sockC : `&${sockC}`;
          return `tsc_socket_close(${sockRef})`;
        }
      }
    }

    return null;
  },

  _dispatchStdFs(node, lines, depth) {
    const { callee, args } = node;
    // fs namespace: fs.watch(), fs.readFileSync(), fs.writeFileSync(), etc.
    if (this._stdFsImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _fsSym = this.lookup(callee.object.name);
      if (_fsSym?._isFsNamespace) {
        const _fsProp = callee.prop;
        const _a0 = () => args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        const _a1 = () => args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
        if (_fsProp === 'watch') {
          const pathC = _a0();
          const cbArg = args[1]?.expr;
          let cbName;
          if (cbArg?.kind === 'Arrow') {
            this._lambdaParamHint = (cbArg.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'String');
            cbName = this.hoistArrow(cbArg, 'void');
            this._lambdaParamHint = null;
          } else {
            cbName = cbArg ? this.exprToC(cbArg, lines, depth) : 'NULL';
          }
          return `tsc_fs_watch(${pathC}, ${cbName})`;
        }
        if (_fsProp === 'readFileSync')      return `tsc_fs_read_sync(${_a0()})`;
        if (_fsProp === 'readFileBytesSync') return `tsc_fs_read_bytes_sync(${_a0()})`;
        if (_fsProp === 'writeFileSync')     return `tsc_fs_write_sync(${_a0()}, ${_a1()})`;
        if (_fsProp === 'appendFileSync')    return `tsc_fs_append_sync(${_a0()}, ${_a1()})`;
        if (_fsProp === 'existsSync')        return `tsc_fs_exists_sync(${_a0()})`;
        if (_fsProp === 'mkdirSync')         return `tsc_fs_mkdir_sync(${_a0()})`;
        if (_fsProp === 'readDirSync')        return `tsc_fs_readdir_sync(${_a0()})`;
        if (_fsProp === 'removeSync')        return `tsc_fs_remove_sync(${_a0()})`;
        if (_fsProp === 'renameSync')        return `tsc_fs_rename_sync(${_a0()}, ${_a1()})`;
        if (_fsProp === 'statSync')          return `tsc_fs_stat_sync(${_a0()})`;
      }
    }

    return null;
  },

  _dispatchStdTemporal(node, lines, depth) {
    const { callee, args } = node;
    // Temporal static methods: PlainDate.from(), Instant.now(), etc.
    if (this._stdTemporalImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _tClass = callee.object.name;
      const _tProp  = callee.prop;
      const _temporalSuppressConst = () => { this._lastSuppressConst = true; };
      if (_tClass === 'PlainDate' && _tProp === 'from') {
        const y = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const m = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
        const d = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';
        _temporalSuppressConst();
        return `tsc_plain_date_from(${y}, ${m}, ${d})`;
      }
      if (_tClass === 'PlainTime' && _tProp === 'from') {
        const h = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const m = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
        const s = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';
        _temporalSuppressConst();
        return `tsc_plain_time_from(${h}, ${m}, ${s})`;
      }
      if (_tClass === 'PlainDateTime' && _tProp === 'from') {
        const date = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(TscPlainDate){0}';
        const time = args[1] ? this.exprToC(args[1].expr, lines, depth) : '(TscPlainTime){0}';
        _temporalSuppressConst();
        return `tsc_plain_datetime_from(${date}, ${time})`;
      }
      if (_tClass === 'Instant' && _tProp === 'now') { _temporalSuppressConst(); return `tsc_instant_now()`; }
      if (_tClass === 'ZonedDateTime' && _tProp === 'now') {
        const tz = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("UTC")';
        _temporalSuppressConst();
        return `tsc_zoned_datetime_now(${tz})`;
      }
      if (_tClass === 'Now') {
        if (_tProp === 'instant') { _temporalSuppressConst(); return `tsc_instant_now()`; }
        if (_tProp === 'plainDate') {
          const tz = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("UTC")';
          _temporalSuppressConst();
          return `tsc_now_plain_date(${tz})`;
        }
      }
      if (_tClass === 'Duration' && _tProp === 'from') {
        const objArg = args[0]?.expr;
        if (objArg?.kind === 'ObjLit') {
          const props = {};
          for (const p of (objArg.props ?? [])) {
            props[p.key] = p.value ? this.exprToC(p.value, lines, depth) : '0';
          }
          _temporalSuppressConst();
          if ('days' in props && !('hours' in props) && !('minutes' in props)) {
            return `tsc_duration_from_days(${props.days ?? '0'})`;
          }
          const h = props.hours ?? '0';
          const m = props.minutes ?? '0';
          const s = props.seconds ?? '0';
          return `tsc_duration_from_hms(${h}, ${m}, ${s})`;
        }
      }
    }

    // Temporal instance methods: d.add(), d.until(), etc.
    if (this._stdTemporalImported && callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _tSym = this.lookup(callee.object.name);
      const _tCtype = _tSym?.ctype ?? '';
      if (_tCtype === 'TscPlainDate') {
        const _tName = callee.object.name;
        const _tProp = callee.prop;
        if (_tProp === 'add') {
          this._lastSuppressConst = true;
          const durC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(TscDuration){0}';
          return `tsc_plain_date_add(${_tName}, ${durC})`;
        }
        if (_tProp === 'until') {
          this._lastSuppressConst = true;
          const d2C = args[0] ? this.exprToC(args[0].expr, lines, depth) : '(TscPlainDate){0}';
          return `tsc_plain_date_until(${_tName}, ${d2C})`;
        }
      }
    }

    return null;
  },

  _dispatchStdBuffer(node, lines, depth) {
    const { callee, args } = node;
    // Buffer method calls: buf.fill(), buf.slice()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _bufSym = this.lookup(callee.object.name);
      if (_bufSym?._isBuffer || _bufSym?.ctype === 'Buffer') {
        const _bufName = callee.object.name;
        const _bufProp = callee.prop;
        if (_bufProp === 'fill') {
          const val = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `memset(${_bufName}.data, ${val}, ${_bufName}.length)`;
        }
        if (_bufProp === 'slice') {
          const start = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          const end = args[1] ? this.exprToC(args[1].expr, lines, depth) : `${_bufName}.length`;
          const lenExpr = (args[0]?.expr?.kind === 'Literal' && args[1]?.expr?.kind === 'Literal')
            ? String(parseFloat(args[1].expr.value) - parseFloat(args[0].expr.value))
            : `(${end}) - (${start})`;
          return `{.data = ${_bufName}.data + ${start}, .length = ${lenExpr}}`;
        }
      }
    }

    return null;
  },

  _dispatchStdDataView(node, lines, depth) {
    const { callee, args } = node;
    // DataView method calls: dv.setU8(), dv.getU8(), dv.setU16LE(), dv.getU16LE(), etc.
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _dvSym = this.lookup(callee.object.name);
      if (_dvSym?._isDataView || _dvSym?.ctype === 'DataView') {
        const _dvName = callee.object.name;
        const _dvProp = callee.prop;
        const _dvIdx = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        if (_dvProp === 'setU8') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `${_dvName}.data[${_dvIdx}] = ${val}`;
        }
        if (_dvProp === 'getU8') return `${_dvName}.data[${_dvIdx}]`;
        const I = ' '.repeat(this.indent * depth);
        // Static bounds check for get operations
        const _dvOpSizes = { getU8:1, getU16LE:2, getU32LE:4, getF64LE:8, setU8:1, setU16LE:2, setU32LE:4, setF64LE:8 };
        if (_dvOpSizes[_dvProp] && _dvSym._dvCap != null) {
          const opSize = _dvOpSizes[_dvProp];
          const offsetNode = args[0]?.expr;
          const offsetVal = (offsetNode?.kind === 'Literal' && offsetNode?.litType === 'number') ? parseInt(offsetNode.value) : null;
          if (offsetVal != null && offsetVal + opSize > _dvSym._dvCap) {
            const suffix = _dvProp.startsWith('set') ? `requires ${opSize} bytes, but buffer length is ${_dvSym._dvCap}` : `requires ${opSize} bytes, but buffer length is ${_dvSym._dvCap}`;
            throw this.error(`TypeError: DataView.${_dvProp} at offset ${offsetVal} requires ${opSize} bytes, but buffer length is ${_dvSym._dvCap}`);
          }
        }
        if (_dvProp === 'setU16LE') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const n = this._dvW16n = (this._dvW16n ?? 0); this._dvW16n++;
          const tmp = `_w16_${n}`;
          lines.push(`${I}uint16_t ${tmp} = ${val};`);
          return `memcpy(${_dvName}.data + ${_dvIdx}, &${tmp}, 2)`;
        }
        if (_dvProp === 'getU16LE') {
          const tmp = `_v16`;
          lines.push(`${I}uint16_t ${tmp}; memcpy(&${tmp}, ${_dvName}.data + ${_dvIdx}, 2);`);
          return `(uint16_t)${tmp}`;
        }
        if (_dvProp === 'setU32LE') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const n = this._dvW32n = (this._dvW32n ?? 0); this._dvW32n++;
          const tmp = `_w32_${n}`;
          lines.push(`${I}uint32_t ${tmp} = ${val};`);
          return `memcpy(${_dvName}.data + ${_dvIdx}, &${tmp}, 4)`;
        }
        if (_dvProp === 'getU32LE') {
          const n = this._dvR32n = (this._dvR32n ?? 0); this._dvR32n++;
          const tmp = `_r32_${n}`;
          lines.push(`${I}uint32_t ${tmp}; memcpy(&${tmp}, ${_dvName}.data + ${_dvIdx}, 4);`);
          return tmp;
        }
        if (_dvProp === 'setF64LE') {
          const val = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          const n = this._dvWF64n = (this._dvWF64n ?? 0); this._dvWF64n++;
          const tmp = `_wf64_${n}`;
          lines.push(`${I}double ${tmp} = ${val};`);
          return `memcpy(${_dvName}.data + ${_dvIdx}, &${tmp}, 8)`;
        }
        if (_dvProp === 'getF64LE') {
          const n = this._dvRF64n = (this._dvRF64n ?? 0); this._dvRF64n++;
          const tmp = `_rf64_${n}`;
          lines.push(`${I}double ${tmp}; memcpy(&${tmp}, ${_dvName}.data + ${_dvIdx}, 8);`);
          return tmp;
        }
      }
    }

    return null;
  },

  _dispatchStdHashMap(node, lines, depth) {
    const { callee, args } = node;
    // HashMap method calls: m.set(), m.get(), m.has(), m.delete()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _hmSym = this.lookup(callee.object.name);
      if (_hmSym?._isHashMap) {
        const _hmName = callee.object.name;
        const _hmProp = callee.prop;
        const _hmSfx = _hmSym._hmSuffix;
        const _hmArg0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        if (_hmProp === 'has') return `tsc_hashmap_has_${_hmSfx}(&${_hmName}, ${_hmArg0})`;
        if (_hmProp === 'set') {
          // Compile-time capacity overflow check
          if (_hmSym._hmCap > 0) {
            _hmSym._hmSetCount = (_hmSym._hmSetCount ?? 0) + 1;
            if (_hmSym._hmSetCount > _hmSym._hmCap) {
              throw this.error(
                `RuntimeError: HashMap capacity exceeded: max ${_hmSym._hmCap}, attempted to insert ${_hmSym._hmSetCount}th entry`
              );
            }
          }
          const _hmArg1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
          return `tsc_hashmap_set_${_hmSfx}(&${_hmName}, ${_hmArg0}, ${_hmArg1})`;
        }
        if (_hmProp === 'get') {
          const vIdent = this.cTypeToIdent(_hmSym._hmValType ?? 'int32_t');
          const optName = `opt_${vIdent}`;
          this._ensureOptStruct(optName, _hmSym._hmValType ?? 'int32_t');
          this._lastSuppressConst = true;
          return `tsc_hashmap_get_${_hmSfx}(&${_hmName}, ${_hmArg0})`;
        }
        if (_hmProp === 'delete') return `tsc_hashmap_delete_${_hmSfx}(&${_hmName}, ${_hmArg0})`;
      }
    }

    return null;
  },

  _dispatchStdSet(node, lines, depth) {
    const { callee, args } = node;
    // Set method calls: s.add(), s.has(), s.delete(), s.clear()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _setSym = this.lookup(callee.object.name);
      if (_setSym?._isSet) {
        const _sName = callee.object.name;
        const _sProp = callee.prop;
        const _sSfx  = _setSym._setSuffix;
        const _sArg0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        if (_sProp === 'add')    return `tsc_set_add_${_sSfx}(&${_sName}, ${_sArg0})`;
        if (_sProp === 'has')    return `tsc_set_has_${_sSfx}(&${_sName}, ${_sArg0})`;
        if (_sProp === 'delete') return `tsc_set_delete_${_sSfx}(&${_sName}, ${_sArg0})`;
        if (_sProp === 'clear')  return `tsc_set_clear_${_sSfx}(&${_sName})`;
      }
    }

    return null;
  },

  _dispatchStdTasks(node, lines, depth) {
    const { callee, args } = node;
    // Tasks method calls: tasks.add(), tasks.run(), tasks.stop()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _tasksSym = this.lookup(callee.object.name);
      if (_tasksSym?._isTasks) {
        const _tasksName = callee.object.name;
        const _tasksProp = callee.prop;
        if (_tasksProp === 'run') return `tsc_tasks_run(&${_tasksName})`;
        if (_tasksProp === 'stop') {
          const _label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_tasks_stop(&${_tasksName}, ${_label})`;
        }
        if (_tasksProp === 'add') {
          const _label = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
          const _fnName = args[1]?.expr?.kind === 'Ident' ? args[1].expr.name : null;
          const _genInfo = _fnName ? this._generatorFuncs?.get(_fnName) : null;
          if (_genInfo) {
            const { stateType, nextFn } = _genInfo;
            const pollFn = `${_fnName}_poll`;
            if (!this._emittedTasksPolls.has(pollFn)) {
              this._emittedTasksPolls.add(pollFn);
              this.topLevel.push('');
              this.topLevel.push(`static void ${pollFn}(void *state) {`);
              this.topLevel.push(`    ${nextFn}((${stateType} *)state);`);
              this.topLevel.push(`}`);
            }
            const stateVar = `_${_fnName}_state_${this._tasksStateCount++}`;
            const I = ' '.repeat(this.indent * depth);
            lines.push(`${I}static ${stateType} ${stateVar} = {0};`);
            return `tsc_tasks_add(&${_tasksName}, ${_label}, ${pollFn}, &${stateVar})`;
          }
        }
      }
    }

    return null;
  },

  _dispatchStdRegex(node, lines, depth) {
    const { callee, args } = node;
    // TscRegex method calls: r.test(), r.match(), r.replace(), r.replaceAll()
    if (callee.kind === 'Member' && callee.object.kind === 'Ident') {
      const _rxSym = this.lookup(callee.object.name);
      if (_rxSym?._isRegex) {
        const _rxName = callee.object.name;
        const _rxProp = callee.prop;
        const _rxArg0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
        if (_rxProp === 'test') return `tsc_regex_test(&${_rxName}, ${_rxArg0})`;
        if (_rxProp === 'match') {
          this._lastSuppressConst = true;
          this._ensureArrayStruct('Array_string', 'String');
          this._ensureOptStruct('opt_Array_string', 'Array_string');
          return `tsc_regex_match(&${_rxName}, ${_rxArg0})`;
        }
        if (_rxProp === 'replace') {
          this._lastSuppressConst = true;
          const _rxArg1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_regex_replace(&${_rxName}, ${_rxArg0}, ${_rxArg1})`;
        }
        if (_rxProp === 'replaceAll') {
          this._lastSuppressConst = true;
          const _rxArg1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : 'STR_LIT("")';
          return `tsc_regex_replace_all(&${_rxName}, ${_rxArg0}, ${_rxArg1})`;
        }
      }
    }

    return null;
  },
};
