const PRIMITIVE_IDENTS = new Set(['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64','bool','usize']);
const HEAP_ARRAY_KEYWORDS = ['tsc_array_create', 'tsc_array_filter', 'tsc_array_map',
                              'tsc_array_concat', 'tsc_array_slice'];
export default {
  _visitVarDecl(node, lines, depth) {
    this._currentNode = node;
    const I = ' '.repeat(this.indent * depth);
    const p = (s) => lines.push(I + s);
    {
        const { varKind, name, typeAnn, init } = node;

        // Generator instantiation: const g = genFn(args) тЖТ genFn_state g = {0};
        if (init?.kind === 'Call' && init.callee?.kind === 'Ident') {
          const gi = this._generatorFuncs?.get(init.callee.name);
          if (gi) {
            const I = ' '.repeat(this.indent * depth);
            const genArgs = (init.args || []).map(a => this.exprToC(a.expr, lines, depth));
            lines.push(`${I}${gi.stateType} ${name} = {0};`);
            this.define(name, { ctype: gi.stateType, varKind, _isGenState: true,
              _genFn: init.callee.name, _genArgs: genArgs, _gi: gi });
            return;
          }
        }

        // Generator .next() result: let r = g.next() тЖТ genFn_result r = genFn_next(&g, args);
        if (init?.kind === 'Call' && init.callee?.kind === 'Member' && init.callee.prop === 'next') {
          const objName = init.callee.object?.name;
          const sym = objName ? this.lookup(objName) : null;
          if (sym?._isGenState) {
            const { gi, callExpr } = this._genNextCall(sym, this.exprToC(init.callee.object, lines, depth));
            const I = ' '.repeat(this.indent * depth);
            lines.push(`${I}${gi.resultType} ${name} = ${callExpr};`);
            this.define(name, { ctype: gi.resultType, varKind });
            return;
          }
        }

        // spawn { ... } / spawn throws T { ... } as VarDecl init
        if (init?.kind === 'Spawn') {
          const hasThrows = (init.throwsTypes?.length ?? 0) > 0;
          const threadVar = this._emitSpawnBlock(hasThrows ? null : name, init.body, init.throwsTypes, lines, depth);
          if (hasThrows) {
            this.define(name, { ctype: 'tsc_thread_t', varKind, _cAlias: threadVar, _isThread: true });
            p(`(void)${threadVar};`);
          } else {
            this.define(name, { ctype: 'tsc_thread_t', varKind, _isThread: true });
          }
          return;
        }

        // Thread.spawn(lambda) as VarDecl init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Thread' &&
            init.callee.prop === 'spawn') {
          const lambdaArg = init.args?.[0]?.expr;
          const lambdaBody = lambdaArg?.body ?? { kind: 'Block', body: [] };
          const idx = this._spawnCount ?? 0;
          const threadVar2 = this._emitSpawnBlock(null, lambdaBody, [], lines, depth);
          this.define(name, { ctype: 'tsc_thread_t', varKind, _cAlias: threadVar2, _isThread: true });
          return;
        }

        // Match expression: const x = match { ... }
        if (init?.kind === 'Match') {
          this.emitMatchVarDecl(node, lines, depth);
          return;
        }

        // select({key: ch.receive(), ...}) тЖТ tagged-union SelectResult
        if (init?.kind === 'Call' && init.callee?.kind === 'Ident' && init.callee.name === 'select') {
          this.emitSelectVarDecl(node, lines, depth);
          return;
        }

        // Propagate/NonNull: const x = throwsFunc()?  or  const x = throwsFunc()!
        if (init?.kind === 'Propagate' || init?.kind === 'NonNull') {
          this.emitPropagateVarDecl(node, lines, depth);
          return;
        }

        // Object.fromEntries<{a: T, b: U}>(array) тЖТ compile-time struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee?.object?.name === 'Object' &&
            init.callee?.prop === 'fromEntries' &&
            init.typeArgs?.[0]?.kind === 'TypeObject') {
          const typeArg = init.typeArgs[0];
          const fields = typeArg.fields;
          const fieldNames = fields.map(f => f.name);
          const structName = `_fromEntries_${this._fromEntriesCount++}`;
          const fieldDecls = fields.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
          this.classes.set(structName, { isStruct: true, fields });
          const arg = init.args[0]?.expr;
          let entriesElems = null;
          let isVar = false;
          if (arg?.kind === 'ArrayLit') {
            entriesElems = arg.elems;
          } else if (arg?.kind === 'Ident') {
            const consumed = this._fromEntriesConsumed?.get(arg.name);
            if (consumed) {
              // Emit entries typedefs now (after fromEntries struct, to match expected order)
              const et = this.resolveType(consumed.typeAnn.element);
              this.resolveType(consumed.typeAnn); // emits Array_tuple
              entriesElems = consumed.init?.kind === 'ArrayLit' ? consumed.init.elems : null;
            } else {
              const sym = this.lookup(arg.name);
              if (sym?.initNode?.kind === 'ArrayLit') entriesElems = sym.initNode.elems;
            }
            isVar = true;
          }
          const initParts = [];
          for (const elem of (entriesElems ?? [])) {
            const pair = elem.expr;
            if (pair?.kind !== 'ArrayLit' || pair.elems?.length < 2) continue;
            const keyNode = pair.elems[0]?.expr;
            const valNode = pair.elems[1]?.expr;
            if (keyNode?.kind !== 'Literal' || keyNode.litType !== 'string') continue;
            const key = keyNode.value;
            if (!fieldNames.includes(key)) throw this.error(`Object.fromEntries: key "${key}" is not a field of the target type`);
            initParts.push(`.${key} = ${this.exprToC(valNode, lines, depth)}`);
          }
          if (isVar) {
            p(`${structName} ${name} = {0};`);
            p(`${name} = (${structName}){${initParts.join(', ')}};`);
          } else {
            p(`${structName} ${name} = {${initParts.join(', ')}};`);
          }
          this.define(name, { ctype: structName, varKind });
          return;
        }

        // If consumed by fromEntries (Ident arg), defer all processing тАФ no C emit, no typedefs yet
        if (this._fromEntriesConsumed?.has(name) && typeAnn?.kind === 'TypeArray') {
          this._fromEntriesConsumed.set(name, { typeAnn, init });
          this.define(name, { ctype: 'void', isArray: true, varKind, initNode: init });
          return;
        }

        // String.split() тЖТ special multi-statement form: String *parts; int32_t parts_len; tsc_string_split(...)
        if (!typeAnn && init?.kind === 'Call' &&
            init.callee?.kind === 'Member' && init.callee?.prop === 'split') {
          const splitObjType = this.inferType(init.callee.object);
          if (splitObjType === 'String') {
            const objC = this.exprToC(init.callee.object, lines, depth);
            const sepC = init.args[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
            const lenName = `${name}_len`;
            p(`String *${name};`);
            p(`int32_t ${lenName};`);
            p(`tsc_string_split(${objC}, ${sepC}, &${name}, &${lenName});`);
            this.define(name, { ctype: 'String *', varKind, isArray: false, isSplitResult: true, lenName });
            this._registerCleanup(`tsc_string_array_free(${name}, ${lenName})`);
            return;
          }
        }

        // new Atomic<T>(val) тЖТ Atomic_T typedef + {.value = val}
        if (init?.kind === 'New' && init.name === 'Atomic') {
          const tArg = init.typeArgs?.[0];
          const innerCtype = tArg ? this.resolveType(tArg) : 'int32_t';
          const ident = this.cTypeToIdent(innerCtype);
          const atomicType = `Atomic_${ident}`;
          if (!this._emittedAtomicTypes.has(atomicType)) {
            this._emittedAtomicTypes.add(atomicType);
            this.includes.add('#include <stdatomic.h>');
            this.addTop(`typedef struct { _Atomic ${innerCtype} value; } ${atomicType};`);
            this.addTop('');
          }
          const initVal = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${atomicType} ${name} = {.value = ${initVal}};`);
          this.define(name, { ctype: atomicType, varKind, _isAtomic: true, _atomicInner: innerCtype });
          return;
        }

        // new Readonly(val) or new Readonly<T>(val) тЖТ const T name = val
        if (init?.kind === 'New' && init.name === 'Readonly') {
          const valArg = init.args?.[0];
          const valC = valArg ? this.exprToC(valArg.expr ?? valArg, lines, depth) : '{0}';
          let innerType;
          if (init.typeArgs?.[0]) {
            innerType = this.resolveType(init.typeArgs[0]);
          } else if (valArg) {
            innerType = this.inferType(valArg.expr ?? valArg);
          } else {
            innerType = 'void *';
          }
          p(`const ${innerType} ${name} = ${valC};`);
          this.define(name, { ctype: innerType, varKind, _isReadonly: true });
          return;
        }

        // new AtomicArray<T>(N) тЖТ AtomicArray_T typedef + calloc
        if (init?.kind === 'New' && init.name === 'AtomicArray') {
          const tArg = init.typeArgs?.[0];
          const innerCtype = tArg ? this.resolveType(tArg) : 'int32_t';
          const ident = this.cTypeToIdent(innerCtype);
          const arrType = `AtomicArray_${ident}`;
          if (!this._emittedAtomicTypes.has(arrType)) {
            this._emittedAtomicTypes.add(arrType);
            this.includes.add('#include <stdatomic.h>');
            this.addTop(`typedef struct { int32_t length; _Atomic ${innerCtype} *data; } ${arrType};`);
            this.addTop('');
          }
          const sizeC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${arrType} ${name} = {.length = ${sizeC}, .data = calloc(${sizeC}, sizeof(_Atomic ${innerCtype}))};`);
          this.define(name, { ctype: arrType, varKind, _isAtomicArray: true, _atomicArrayInner: innerCtype });
          this._registerCleanup(`free(${name}.data)`);
          return;
        }

        // new Shared<Atomic<T>>(val) тЖТ Atomic_T_shared typedef + arc alloc + atomic_init
        if (init?.kind === 'New' && init.name === 'Shared' && init.typeArgs?.[0]?.name === 'Atomic') {
          const tArg = init.typeArgs[0].typeArgs?.[0];
          const innerCtype = tArg ? this.resolveType(tArg) : 'int32_t';
          const ident = this.cTypeToIdent(innerCtype);
          const sharedType = `Atomic_${ident}_shared`;
          if (!this._emittedAtomicTypes.has(sharedType)) {
            this._emittedAtomicTypes.add(sharedType);
            this.includes.add('#include <stdatomic.h>');
            this.addTop(`typedef struct { int32_t _refcount; _Atomic ${innerCtype} value; } ${sharedType};`);
            this.addTop('');
          }
          const initVal = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${sharedType} *${name} = tsc_arc_alloc(sizeof(${sharedType}));`);
          p(`atomic_init(&${name}->value, ${initVal});`);
          this.define(name, { ctype: `${sharedType} *`, varKind, _isAtomic: true, _isSharedAtomic: true, _atomicInner: innerCtype });
          this._registerCleanup(`tsc_arc_release(${name})`);
          return;
        }

        // new Signal<T>(val) тЖТ Signal_T struct + tsc_signal_create_T
        if (init?.kind === 'New' && init.name === 'Signal' && this._stdReactiveImported) {
          const tArg = init.typeArgs?.[0];
          const et = tArg ? this.resolveType(tArg) : 'int32_t';
          const etIdent = this.cTypeToIdent(et);
          const sigType = `Signal_${etIdent}`;
          if (!this._emittedSignalTypedefs.has(sigType)) {
            this._emittedSignalTypedefs.add(sigType);
            this.addTop(`typedef struct { ${et} _value; void (**_effects)(void); size_t _effect_count; ${et} (*_compute)(void); } ${sigType};`);
            this.addTop('');
          }
          const initVal = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${sigType} ${name} = tsc_signal_create_${etIdent}(${initVal});`);
          this.define(name, { ctype: sigType, varKind, _isSignal: true, _signalElemType: etIdent });
          return;
        }

        // new StaticMap({ "key": val, ... }) тЖТ compile-time hash lookup function
        if (init?.kind === 'New' && init.name === 'StaticMap' && this._stdEmbeddedImported) {
          this.includes.add('#include "std/embedded.h"');
          const objArg = init.args?.[0]?.expr;
          if (objArg?.kind !== 'ObjLit') return;
          const entries = [];
          for (const prop of (objArg.props ?? [])) {
            if (prop.computed) {
              const keyName = prop.key?.kind === 'Ident' ? prop.key.name : '?';
              throw this.error(`TypeError: StaticMap keys must be compile-time string literals; dynamic key '[${keyName}]' is not allowed`);
            }
            const valC = this.exprToC(prop.value, lines, depth);
            entries.push({ key: prop.key, valC });
          }
          const idx = this._staticMapInlineCount ?? 0;
          this._staticMapInlineCount = idx + 1;
          // No runtime object; define symbol for later get() calls
          this.define(name, { ctype: 'StaticMapInline', varKind, _isStaticMapInline: true,
            _entries: entries, _smIdx: idx, _getFn: null });
          return;
        }

        // new HttpServer({ port: N }) тЖТ TscHttpServer server = tsc_http_server_create(N)
        if (init?.kind === 'New' && init.name === 'HttpServer' && this._stdNetImported) {
          const optsArg = init.args?.[0]?.expr;
          let portC = '8080';
          if (optsArg?.kind === 'ObjLit') {
            const portProp = (optsArg.props ?? []).find(pr => pr.key === 'port');
            if (portProp) portC = this.exprToC(portProp.value, lines, depth);
          }
          p(`TscHttpServer ${name} = tsc_http_server_create(${portC});`);
          this.define(name, { ctype: 'TscHttpServer', varKind, _isHttpServer: true });
          return;
        }

        // new WebSocket("url") тЖТ TscWebSocket ws = tsc_ws_connect(STR_LIT("url"))
        if (init?.kind === 'New' && init.name === 'WebSocket' && this._stdWsImported) {
          const urlC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          p(`TscWebSocket ${name} = tsc_ws_connect(${urlC});`);
          this.define(name, { ctype: 'TscWebSocket', varKind, _isWebSocket: true });
          return;
        }

        // new WebSocketServer() тЖТ TscWebSocketServer server = tsc_ws_server_create()
        if (init?.kind === 'New' && init.name === 'WebSocketServer' && this._stdWsImported) {
          p(`TscWebSocketServer ${name} = tsc_ws_server_create();`);
          this.define(name, { ctype: 'TscWebSocketServer', varKind, _isWsServer: true });
          return;
        }

        // new UDPSocket() тЖТ TscUdpSocket udp = tsc_udp_create()
        if (init?.kind === 'New' && init.name === 'UDPSocket' && this._stdNetImported) {
          p(`TscUdpSocket ${name} = tsc_udp_create();`);
          this.define(name, { ctype: 'TscUdpSocket', varKind, _isUdpSocket: true });
          return;
        }

        // new Tasks<N>() тЖТ Tasks_N typedef + cooperative scheduler support
        if (init?.kind === 'New' && init.name === 'Tasks') {
          if (!this._isEmbedded()) {
            throw this.error(`TypeError: 'std/embedded' requires an embedded platform target or explicit @[embedded] annotation`);
          }
          this.includes.add('#include "std/embedded.h"');
          const nArg = init.typeArgs?.[0];
          const n = nArg?.kind === 'TypeLiteral' ? nArg.value : '1';
          const tasksType = `Tasks_${n}`;
          if (!this._emittedTasksTypedefs) {
            this._emittedTasksTypedefs = true;
            this.addTop('typedef void (*TaskPollFn)(void *state);');
            this.addTop('typedef struct { TaskPollFn fn; void *state; bool active; String name; } TscTask;');
          }
          if (!this._emittedTasksStructs.has(tasksType)) {
            this._emittedTasksStructs.add(tasksType);
            this.addTop(`typedef struct { TscTask _slots[${n}]; size_t _count; } ${tasksType};`);
            this.addTop('');
          }
          p(`${tasksType} ${name} = {0};`);
          this.define(name, { ctype: tasksType, varKind: 'let', _isTasks: true, _tasksN: n, _tasksType: tasksType });
          return;
        }

        // new Buffer(n) тЖТ stack-allocated uint8_t array + Buffer struct (stdlib, not user class)
        if (init?.kind === 'New' && init.name === 'Buffer' && !this.classes.has('Buffer')) {
          if (!this._emittedBufferTypeDef) {
            this._emittedBufferTypeDef = true;
            this.addTop('typedef struct { uint8_t *data; size_t length; } Buffer;');
            this.addTop('');
          }
          const n = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          const dataVar = `_${name}_data_${this._bufDataCount ?? 0}`;
          this._bufDataCount = (this._bufDataCount ?? 0) + 1;
          const bufQual = varKind === 'const' ? 'const ' : '';
          p(`uint8_t ${dataVar}[${n}] = {0};`);
          p(`${bufQual}Buffer ${name} = {.data = ${dataVar}, .length = ${n}};`);
          const bufCapInt = init.args?.[0]?.expr?.kind === 'Literal' ? parseInt(init.args[0].expr.value) : null;
          this.define(name, { ctype: 'Buffer', varKind, _isBuffer: true, _bufCap: bufCapInt });
          return;
        }

        // new DataView(buf) тЖТ DataView struct pointing to buf's data
        if (init?.kind === 'New' && init.name === 'DataView') {
          if (!this._emittedBufferTypeDef) {
            this._emittedBufferTypeDef = true;
            this.addTop('typedef struct { uint8_t *data; size_t length; } Buffer;');
            this.addTop('');
          }
          if (!this._emittedDataViewTypeDef) {
            this._emittedDataViewTypeDef = true;
            this.addTop('typedef struct { uint8_t *data; size_t length; } DataView;');
            this.addTop('');
          }
          const _dvSrcName = init.args?.[0]?.expr?.kind === 'Ident' ? init.args[0].expr.name : null;
          const _dvSrcSym = _dvSrcName ? this.lookup(_dvSrcName) : null;
          const srcName = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'buf';
          p(`DataView ${name} = {.data = ${srcName}.data, .length = ${srcName}.length};`);
          this.define(name, { ctype: 'DataView', varKind: 'let', _isDataView: true, _dvCap: _dvSrcSym?._bufCap ?? null });
          return;
        }

        // new HashMap<K,V>(cap) тЖТ HashMap_K_V typedef + {.capacity = cap}
        if (init?.kind === 'New' && init.name === 'HashMap') {
          // Capacity overflow takes priority over platform error (detected by pre-scan)
          const _capViol = this._hmCapViolations?.get(name);
          if (_capViol) {
            const _n = _capViol.count;
            const _sfx = (_n % 10 === 1 && _n % 100 !== 11) ? 'st'
                       : (_n % 10 === 2 && _n % 100 !== 12) ? 'nd'
                       : (_n % 10 === 3 && _n % 100 !== 13) ? 'rd' : 'th';
            throw this.error(`RuntimeError: HashMap capacity exceeded: max ${_capViol.cap}, attempted to insert ${_n}${_sfx} entry`);
          }
          if (!this._isEmbedded()) {
            throw this.error(`TypeError: 'std/embedded' requires an embedded platform target or explicit @[embedded] annotation`);
          }
          this.includes.add('#include "std/embedded.h"');
          const kArg = init.typeArgs?.[0];
          const vArg = init.typeArgs?.[1];
          const kCType = kArg ? this.resolveType(kArg) : 'String';
          const vCType = vArg ? this.resolveType(vArg) : 'int32_t';
          const kIdent = this.cTypeToIdent(kCType);
          const vIdent = this.cTypeToIdent(vCType);
          const suffix = `${kIdent}_${vIdent}`;
          const hmType = `HashMap_${suffix}`;
          const cap = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '8';
          if (!this._emittedHashMaps.has(hmType)) {
            this._emittedHashMaps.add(hmType);
            this.addTop(`typedef struct {`);
            this.addTop(`    ${kCType} keys[${cap}]; ${vCType} values[${cap}]; bool used[${cap}];`);
            this.addTop(`    size_t capacity; size_t count;`);
            this.addTop(`} ${hmType};`);
            this.addTop('');
          }
          p(`${hmType} ${name} = {.capacity = ${cap}};`);
          this.define(name, { ctype: hmType, varKind: 'let', _isHashMap: true,
            _hmSuffix: suffix, _hmCap: parseInt(cap) || 0, _hmKeyType: kCType, _hmValType: vCType });
          return;
        }

        // new Set<T>() / new Set<T>([...]) тЖТ TscSet_SUFFIX
        if (init?.kind === 'New' && init.name === 'Set') {
          const tArg = init.typeArgs?.[0];
          const elemCType = tArg ? this.resolveType(tArg) : 'int32_t';
          const suffix = this.cTypeToIdent(elemCType);
          const setType = `TscSet_${suffix}`;
          // never const in C тАФ Set is a mutable struct
          p(`${setType} ${name} = tsc_set_create_${suffix}();`);
          const initArr = init.args?.[0]?.expr;
          if (initArr?.kind === 'ArrayLit') {
            for (const el of initArr.elems) {
              const ev = this.exprToC(el.expr, lines, depth);
              p(`tsc_set_add_${suffix}(&${name}, ${ev});`);
            }
          }
          this.define(name, { ctype: setType, varKind, _isSet: true, _setSuffix: suffix, _setElemCType: elemCType });
          return;
        }

        // new Blob([...]) тЖТ two variants:
        //   [int literals] тЖТ simple inline struct Blob {data, size, ?type}
        //   [bufVar], {type:...} тЖТ TscBlob via tsc_blob_create
        if (init?.kind === 'New' && init.name === 'Blob') {
          const firstArg = init.args?.[0]?.expr; // the array arg
          const secondArg = init.args?.[1]?.expr; // optional type arg
          const isArrayArg = firstArg?.kind === 'ArrayLit';
          const firstElem = firstArg?.elems?.[0]?.expr;
          const firstElemSym = firstElem?.kind === 'Ident' ? this.lookup(firstElem.name) : null;
          const isTscBlob = isArrayArg && firstElem && (firstElemSym?._isBuffer || firstElemSym?.ctype === 'Buffer');

          if (isTscBlob) {
            // TscBlob path: new Blob([buf], { type: "..." })
            this.includes.add('#include "std/blob.h"');
            const bufName = firstElem.name;
            const bufSym = firstElemSym;
            const dataExpr = `${bufName}.data`;
            const lenExpr  = `${bufName}.length`;
            let typeStr = 'STR_LIT("")';
            if (secondArg?.kind === 'ObjLit') {
              const tp = secondArg.props?.find(p => p.key === 'type');
              if (tp?.value?.kind === 'Literal') typeStr = `STR_LIT(${JSON.stringify(tp.value.value)})`;
            } else if (secondArg?.kind === 'Literal') {
              typeStr = `STR_LIT(${JSON.stringify(secondArg.value)})`;
            }
            p(`TscBlob ${name} = tsc_blob_create(${dataExpr}, ${lenExpr}, ${typeStr});`);
            this.define(name, { ctype: 'TscBlob', varKind: 'let', _isTscBlob: true });
          } else {
            // Simple inline Blob: new Blob([int, int, ...], ?typeStr)
            const elems = firstArg?.kind === 'ArrayLit'
              ? firstArg.elems.map(e => this.exprToC(e.expr, lines, depth))
              : [];
            const hasType = secondArg != null;
            const blobN = this._blobDataCount = (this._blobDataCount ?? 0); this._blobDataCount++;
            const dataVar = `_blob_data_${blobN}`;
            // Emit typedef
            const typedefBody = hasType
              ? 'typedef struct { uint8_t *data; size_t size; String type; } Blob;'
              : 'typedef struct { uint8_t *data; size_t size; } Blob;';
            if (!this._emittedBlobTypeDef) {
              this._emittedBlobTypeDef = typedefBody;
              this.addTop(typedefBody);
              this.addTop('');
            }
            p(`uint8_t ${dataVar}[] = {${elems.join(', ')}};`);
            let initFields = `.data = ${dataVar}, .size = ${elems.length}`;
            if (hasType) {
              let typeStrLit = 'STR_LIT("")';
              if (secondArg?.kind === 'Literal') typeStrLit = `STR_LIT(${JSON.stringify(secondArg.value)})`;
              initFields += `, .type = ${typeStrLit}`;
            }
            const blobQual = varKind === 'const' ? 'const ' : '';
            p(`${blobQual}Blob ${name} = {${initFields}};`);
            this.define(name, { ctype: 'Blob', varKind, _isBlob: true, _blobCap: elems.length, _hasType: hasType });
          }
          return;
        }

        // new URL(str) or new URL(path, base) тЖТ TscURL + tsc_url_parse / tsc_url_parse_relative
        if (init?.kind === 'New' && init.name === 'URL') {
          this.includes.add('#include "std/url.h"');
          const firstArg = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          if (init.args?.length >= 2) {
            const baseArg = init.args[1] ? this.exprToC(init.args[1].expr, lines, depth) : 'NULL';
            p(`TscURL ${name} = tsc_url_parse_relative(${firstArg}, &${baseArg});`);
          } else {
            p(`TscURL ${name} = tsc_url_parse(${firstArg});`);
          }
          this.define(name, { ctype: 'TscURL', varKind: 'let', _isURL: true });
          this._registerCleanup(`tsc_url_free(&${name})`);
          return;
        }

        // new URLSearchParams(str) тЖТ TscURLSearchParams + tsc_search_params_parse
        if (init?.kind === 'New' && init.name === 'URLSearchParams') {
          this.includes.add('#include "std/url.h"');
          const strArg = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          p(`TscURLSearchParams ${name} = tsc_search_params_parse(${strArg});`);
          this.define(name, { ctype: 'TscURLSearchParams', varKind: 'let', _isURLSearchParams: true });
          this._registerCleanup(`tsc_search_params_free(&${name})`);
          return;
        }

        // new Regex(pattern) тЖТ TscRegex + tsc_regex_compile
        if (init?.kind === 'New' && init.name === 'Regex') {
          this.includes.add('#include "std/regex.h"');
          const patternC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          p(`TscRegex ${name} = tsc_regex_compile(${patternC});`);
          this.define(name, { ctype: 'TscRegex', varKind: 'let', _isRegex: true });
          this._registerCleanup(`tsc_regex_free(&${name})`);
          return;
        }

        // new Random(seed) тЖТ tsc_random_seed (TscRandom typedef is in runtime.h)
        if (init?.kind === 'New' && init.name === 'Random') {
          const seedC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`TscRandom ${name} = tsc_random_seed(${seedC});`);
          this.define(name, { ctype: 'TscRandom', varKind: 'let', _isRandom: true });
          return;
        }

        // new SecureRandom() тЖТ error on embedded targets
        if (init?.kind === 'New' && init.name === 'SecureRandom') {
          if (this._isEmbedded()) {
            throw this.error(`"SecureRandom" is not available on embedded targets`);
          }
          if (!this._emittedTscSecureRandomDef) {
            this._emittedTscSecureRandomDef = true;
            this.addTop('typedef struct { int _fd; } TscSecureRandom;');
            this.addTop('');
          }
          p(`TscSecureRandom ${name} = tsc_secure_random_create();`);
          this.define(name, { ctype: 'TscSecureRandom', varKind: 'let', _isSecureRandom: true });
          return;
        }

        // new AsyncMutex() тЖТ TscAsyncMutex
        if (init?.kind === 'New' && init.name === 'AsyncMutex') {
          p(`TscAsyncMutex ${name} = tsc_async_mutex_create();`);
          this.define(name, { ctype: 'TscAsyncMutex', varKind });
          return;
        }

        // new AbortController() тЖТ TscAbortController
        if (init?.kind === 'New' && init.name === 'AbortController') {
          p(`TscAbortController ${name} = tsc_abort_controller_create();`);
          this.define(name, { ctype: 'TscAbortController', varKind });
          this._registerCleanup(`tsc_abort_controller_free(&${name})`);
          return;
        }

        // new Channel<T>(cap) тЖТ Channel_T typedef + tsc_channel_create_T
        if (init?.kind === 'New' && init.name === 'Channel') {
          const tArg = init.typeArgs?.[0];
          const innerCtype = tArg ? this.resolveType(tArg) : 'int32_t';
          const ident = this.cTypeToIdent(innerCtype);
          const chanType = `Channel_${ident}`;
          if (!this._emittedChannelTypes.has(chanType)) {
            this._emittedChannelTypes.add(chanType);
            this.addTop(`typedef struct { TscChannel_${ident} *_inner; } ${chanType};`);
            this.addTop('');
          }
          const capC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${chanType} ${name} = { ._inner = tsc_channel_create_${ident}(${capC}) };`);
          this.define(name, { ctype: chanType, varKind, _isChannel: true, _channelInner: innerCtype, _channelIdent: ident });
          this._registerCleanup(`tsc_channel_release_${ident}(${name}._inner)`);
          return;
        }

        // new Shared<T>() тЖТ arc alloc
        if (!typeAnn && init?.kind === 'New' && init.name === 'Shared') {
          const tArg = init.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            if (this._allocatorName === 'none' || this._allocatorName === 'static') {
              throw this.error(`TypeError: 'new Shared<${innerType}>()' requires heap allocation (ARC), which is unavailable when allocator is "${this._allocatorName}"`);
            }
            p(`${innerType} *${name} = tsc_arc_alloc(sizeof(${innerType}));`);
            this.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isShared: true, derefType: innerType });
            this._registerCleanup(`tsc_arc_release(${name})`);
            return;
          }
        }

        // new Weak<T>(src) тЖТ weak create
        if (!typeAnn && init?.kind === 'New' && init.name === 'Weak') {
          const tArg = init.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            const argC = init.args?.[0] ? this.exprToC(init.args[0].expr, lines, depth) : 'NULL';
            p(`${innerType} *${name} = tsc_weak_create(${argC});`);
            this.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isWeak: true, derefType: innerType });
            this._registerCleanup(`tsc_weak_release(${name})`);
            return;
          }
        }

        // Borrow check: Shared<T> requires a heap allocator
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Shared' && this._allocatorName === 'none') {
          throw this.error(`"Shared<T>" requires a heap allocator; "none" allocator does not support ARC`);
        }

        // let x: Shared<T> = new T() тЖТ arc alloc with explicit field init
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Shared' && init?.kind === 'New' && init.name !== 'Shared') {
          const tArg = typeAnn.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            const structDef = this.classes.get(innerType);
            p(`${innerType} *${name} = tsc_arc_alloc(sizeof(${innerType}));`);
            if (structDef?.fields) {
              for (const f of structDef.fields) {
                const fname = typeof f === 'string' ? f : f.name;
                p(`${name}->${fname} = 0;`);
              }
            }
            this.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isShared: true, derefType: innerType });
            this._registerCleanup(`tsc_arc_release(${name})`);
            return;
          }
        }

        // w.upgrade() тЖТ weak upgrade (result needs arc_release inside null-check)
        if (!typeAnn && init?.kind === 'Call' &&
            init.callee?.kind === 'Member' && init.callee.prop === 'upgrade') {
          const weakSym2 = init.callee.object?.kind === 'Ident' ? this.lookup(init.callee.object.name) : null;
          if (weakSym2?.isWeak) {
            const innerType2 = weakSym2.derefType;
            const weakC2 = this.exprToC(init.callee.object, lines, depth);
            p(`${innerType2} *${name} = tsc_weak_upgrade(${weakC2});`);
            this.define(name, { ctype: `${innerType2} *`, varKind, isPointer: true, isSharedUpgrade: true, derefType: innerType2 });
            return;
          }
        }

        // let b = a where a is Shared тЖТ arc retain
        if (!typeAnn && init?.kind === 'Ident') {
          const initSym3 = this.lookup(init.name);
          if (initSym3?.isShared) {
            const innerType3 = initSym3.derefType;
            p(`${innerType3} *${name} = tsc_arc_retain(${init.name});`);
            this.define(name, { ctype: `${innerType3} *`, varKind, isPointer: true, isShared: true, derefType: innerType3 });
            this._registerCleanup(`tsc_arc_release(${name})`);
            return;
          }
        }

        // Promise.resolve(expr) тЖТ Promise_T typedef + struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Promise' &&
            init.callee.prop === 'resolve') {
          const arg = init.args?.[0]?.expr;
          const innerType = arg ? this.inferType(arg) : 'int32_t';
          const typeIdent = this.cTypeToIdent(innerType);
          const promiseType = `Promise_${typeIdent}`;
          this._emitPromiseTypedef(promiseType, innerType);
          const argC = arg ? this.exprToC(arg, lines, depth) : '0';
          p(`${promiseType} ${name} = { ._done = true, ._result = ${argC}, ._ok = true };`);
          this.define(name, { ctype: promiseType, varKind });
          return;
        }

        // Promise.reject<T>(error) тЖТ Promise_T_E typedef + rejected struct
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Promise' &&
            init.callee.prop === 'reject') {
          const tArg = init.typeArgs?.[0];
          const innerType = tArg ? this.resolveType(tArg) : 'int32_t';
          const typeIdent = this.cTypeToIdent(innerType);
          const errArg = init.args?.[0]?.expr;
          const errType = errArg ? this.inferType(errArg) : 'TscError';
          const promiseType = `Promise_${typeIdent}_${errType}`;
          if (!this._emittedPromiseTypes.has(promiseType)) {
            this._emittedPromiseTypes.add(promiseType);
            this._topBlank();
            this.topLevel.push(`typedef struct { bool _done; ${innerType} _result; bool _ok; ${errType} _error; } ${promiseType};`);
          }
          const errC = errArg ? this.exprToC(errArg, lines, depth) : '0';
          p(`${promiseType} ${name} = { ._done = true, ._ok = false, ._error = ${errC} };`);
          this.define(name, { ctype: promiseType, varKind });
          return;
        }

        // new Promise<T>((resolve, reject) => { ... }) тЖТ static resolve/reject pattern
        if (init?.kind === 'New' && init.name === 'Promise' && init.typeArgs?.length > 0) {
          const tArg = init.typeArgs[0];
          const innerType = this.resolveType(tArg);
          const typeIdent = this.cTypeToIdent(innerType);
          const promiseType = `Promise_${typeIdent}`;
          this._emitPromiseTypedef(promiseType, innerType);
          const lambda = init.args?.[0]?.expr;
          const lambdaIdx = this.lambdaCount++;
          const prefix = `_lambda_${lambdaIdx}`;
          const resolveName = lambda?.params?.[0]?.name ?? 'resolve';
          const rejectName = lambda?.params?.[1]?.name ?? 'reject';
          this._topBlank();
          this.topLevel.push(`static ${innerType} ${prefix}_${typeIdent}_result;`);
          this.topLevel.push(`static bool ${prefix}_done = false;`);
          this._topBlank();
          this.topLevel.push(`static void ${prefix}_resolve(${innerType} v) { ${prefix}_${typeIdent}_result = v; ${prefix}_done = true; }`);
          this.topLevel.push(`static void ${prefix}_reject(void) { ${prefix}_done = true; }`);
          this.pushScope();
          this.define(resolveName, { ctype: 'void', funcName: `${prefix}_resolve`, varKind: 'let' });
          this.define(rejectName, { ctype: 'void', funcName: `${prefix}_reject`, varKind: 'let' });
          for (const s of (lambda?.body?.body ?? [])) this.visitStmt(s, lines, depth);
          this.popScope();
          p(`${promiseType} ${name} = { ._done = ${prefix}_done, ._result = ${prefix}_${typeIdent}_result, ._ok = true };`);
          this.define(name, { ctype: promiseType, varKind });
          return;
        }

        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'never') {
          throw this.error(`"never" cannot be used as a variable type`);
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'void') {
          throw this.error(`"void" can only be used as a return type`);
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Shared' && this._allocatorName === 'none') {
          throw this.error(`"Shared<T>" requires a heap allocator; "none" allocator does not support ARC`);
        }
        // Fat-pointer assignment: let x: Interface = (new Foo() as Interface) or (new Foo())
        if (typeAnn?.kind === 'TypeRef' && this.interfaces.has(typeAnn.name)) {
          const ifaceName = typeAnn.name;
          // Unwrap `as Interface` cast if present
          const innerInit = (init?.kind === 'Cast' &&
            init.castType?.kind === 'TypeRef' && init.castType.name === ifaceName)
            ? init.expr : init;
          // new Foo() тЖТ create temp var, then fat-ptr
          if (innerInit?.kind === 'New' && this.classes.has(innerInit.name) && !this.interfaces.has(innerInit.name)) {
            const className = innerInit.name;
            const classDef = this.classes.get(className);
            const tempName = `_${innerInit.name.toLowerCase()}_${this.tempCount++}`;
            const initC = this.exprToC(innerInit, lines, depth);
            p(`${className} ${tempName} = ${initC};`);
            this.define(tempName, { ctype: className, varKind: 'let' });
            const hasExplicit = classDef?.implements_?.includes(ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
            p(`${ifaceName} ${name} = { .self = &${tempName}, .vtable = &${vtableName} };`);
            this.define(name, { ctype: ifaceName, varKind });
            return;
          }
        }
        // Fat-pointer assignment: let x: Interface = concreteVar  OR  let x: Interface = (concreteVar as Interface)
        if (typeAnn?.kind === 'TypeRef' && this.interfaces.has(typeAnn.name)) {
          const ifaceName = typeAnn.name;
          // Unwrap cast: (concreteVar as Interface) тЖТ concreteVar
          const innerInit2 = (init?.kind === 'Cast' && init.castType?.kind === 'TypeRef' && init.castType.name === ifaceName) ? init.expr : init;
          if (innerInit2?.kind !== 'Ident') { /* fall through */ }
          else {
          const argName = innerInit2.name;
          const argSym = this.lookup(argName);
          const argClass = argSym?.ctype ? this.classes.get(argSym.ctype) : null;
          if (argClass && !this.interfaces.has(argSym.ctype)) {
            const className = argSym.ctype;
            const hasExplicit = argClass.implements_?.includes(ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) this._ensureImplicitVtable(className, ifaceName);
            p(`${ifaceName} ${name} = {.self = &${argName}, .vtable = &${vtableName}};`);
            this.define(name, { ctype: ifaceName, varKind });
            return;
          }
          } // end if innerInit2?.kind === 'Ident'
        }
        let ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'double');
        // Reading a volatile variable into a local gives a plain (non-volatile) type
        if (!typeAnn && ctype.startsWith('volatile ')) ctype = ctype.slice('volatile '.length);
        // Untyped number literals: integer тЖТ int32_t, float/decimal тЖТ double
        if (!typeAnn && init && init.kind === 'Literal' && init.litType === 'number') {
          const v = init.value;
          ctype = (v.includes('.') || v.includes('e') || v.includes('E')) ? 'double' : 'int32_t';
        }
        // ObjLit with named fields and no type annotation тЖТ defer as individual consts (expanded at destructuring)
        if (!typeAnn && init?.kind === 'ObjLit' && init.props?.length > 0 && init.props.every(p => !p.spread && !p.computed)) {
          const anonName = `_anon_${this._anonStructCount++}`;
          const fields = init.props.map(p => {
            const ft = this.inferType(p.value);
            return { name: p.key, typeAnn: { kind: 'TypeRef', name: ft, typeArgs: [] }, _ctype: ft };
          });
          // Defer emission: don't create typedef or variable yet тАФ expand at destructuring time
          this._deferredAnons.set(name, { fields, init });
          this.define(name, { ctype: anonName, varKind, initNode: init, deferredAnon: true });
          this.classes.set(anonName, { isStruct: true, fields });
          return;
        }
        // Regular (non-const) enums, opt types, and structs don't use const qualifier in C
        const enumDef2 = this.classes.get(ctype);
        const isGenericClassInst = !enumDef2 && this._genericClasses &&
          [...this._genericClasses.keys()].some(n => ctype.startsWith(n + '_'));
        // opt_ types suppress const only when inferred (no type annotation); with explicit T|null annotation, keep const
        const suppressConst = (enumDef2?.isEnum && !enumDef2?.isConst && !enumDef2?.isStringLiteralUnion) || enumDef2?.isKeyOf || enumDef2?.isMutable || (ctype.startsWith('opt_') && !typeAnn) || ctype.startsWith('_anon_') || ctype === 'Slice_u8' || (enumDef2 && !enumDef2.isEnum && !enumDef2.isStruct && !enumDef2.isScalarAlias && !enumDef2.isTuple) || isGenericClassInst || ctype.startsWith('volatile ') || ctype === 'Date';
        const qualifier = (varKind === 'const' && !suppressConst) ? 'const ' : '';

        // Optional type (opt_T): handle null/value init
        if (ctype.startsWith('opt_') && init) {
          const isNullInit = init.kind === 'Literal' && init.litType === 'null';
          if (isNullInit) {
            p(`${qualifier}${ctype} ${name} = {false, 0};`);
          } else {
            const valC = this.exprToC(init, lines, depth);
            // If init already evaluates to opt_T (e.g., from x?.toString()), assign directly
            const initType = this.inferType(init);
            if (initType === ctype) {
              p(`${qualifier}${ctype} ${name} = ${valC};`);
            } else {
              p(`${qualifier}${ctype} ${name} = {true, ${valC}};`);
            }
          }
          // Non-negative at() index: mark as potentially OOB (null check when printing)
          // Must be read AFTER exprToC(init) which sets _lastAtNonNeg / _lastPopEmpty / _lastOptIsNull
          const atNonNeg = this._lastAtNonNeg ?? false;
          this._lastAtNonNeg = undefined;
          const emptyPop = this._lastPopEmpty ?? false;
          this._lastPopEmpty = undefined;
          const parsedNull = this._lastOptIsNull ?? false;
          this._lastOptIsNull = undefined;
          this.define(name, { ctype, varKind, optIsNull: isNullInit || atNonNeg || emptyPop || parsedNull });
          // Track pool vars for auto-drop at block exit
          if (ctype?.startsWith('opt_ref_') && this._currentBlockPoolVars) {
            const _pcls2 = ctype.slice(8);
            if (this.classes.get(_pcls2)?._isPool) {
              this._currentBlockPoolVars.push({ name, className: _pcls2 });
            }
          }
          if (this._lastHalRead) { p(`(void)${name};`); this._lastHalRead = null; }
          return;
        }

        // String literal union: handle string literal init тЖТ enum value
        if (enumDef2?.isStringLiteralUnion && init?.kind === 'Literal' && init.litType === 'string') {
          const val = init.value;
          if (!enumDef2.members.includes(val)) {
            throw this.error(`"${val}" is not a valid value for type ${ctype}`);
          }
          p(`${qualifier}${ctype} ${name} = ${ctype}_${val};`);
          this.define(name, { ctype, varKind });
          return;
        }

        // TypeFixedArray тЖТ C stack array: int32_t arr[N] = {elems}
        if (typeAnn?.kind === 'TypeFixedArray') {
          const et = this.resolveType(typeAnn.element);
          const size = typeAnn.size;
          if (init?.kind === 'ArrayLit') {
            const elems = this.arrayLitToC(init, et, lines, depth);
            if (elems.length === 1) {
              // Single-element: C fill/zero-init shorthand (e.g. [0] тЖТ {0})
              p(`${et} ${name}[${size}] = {${elems[0]}};`);
            } else if (elems.length !== size) {
              throw this.error(`array literal has ${elems.length} elements but type ${this.ctypeToTsName(et)}[${size}] requires exactly ${size}`);
            } else {
              p(`${et} ${name}[${size}] = {${elems.join(', ')}};`);
            }
          } else if (init) {
            const initC = this.exprToC(init, lines, depth);
            p(`${et} ${name}[${size}] = ${initC};`);
          } else {
            p(`${et} ${name}[${size}] = {0};`);
          }
          this.define(name, { ctype: et, isArray: true, arraySize: size, isFixedArray: true, varKind });
          return;
        }

        // TypeArray тЖТ managed Array_T struct
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind !== 'TypeFunc') {
          const et = this.resolveType(typeAnn.element);
          const arrName = `Array_${this.cTypeToIdent(et)}`;
          this._ensureArrayStruct(arrName, et);
          const elemIdent = this.cTypeToIdent(et);

          // new T[N] тЖТ stack array + Array_T struct
          if (init?.kind === 'New' && init.arraySize != null) {
            const nC = this.exprToC(init.arraySize, lines, depth);
            const dataVar = `_buf_data_${this._bufDataCount ?? 0}`;
            this._bufDataCount = (this._bufDataCount ?? 0) + 1;
            p(`${et} ${dataVar}[${nC}] = {0};`);
            p(`${arrName} ${name} = {.data = ${dataVar}, .length = ${nC}, .capacity = ${nC}};`);
            this.define(name, { ctype: arrName, elemType: elemIdent, arrElemCType: et, isArray: true, varKind });
            return;
          }
          if (!init || (init.kind === 'ArrayLit' && init.elems.length === 0)) {
            // Empty array literal or no init
            p(`${qualifier}${arrName} ${name} = {.data = NULL, .length = 0, .capacity = 0};`);
          } else if (init.kind === 'ArrayLit') {
            const litVar = `_lit_${this.tempCount++}`;
            const elems = this.arrayLitToC(init, et, lines, depth);
            p(`${et} ${litVar}[] = {${elems.join(', ')}};`);
            p(`${qualifier}${arrName} ${name} = {.data = ${litVar}, .length = ${elems.length}, .capacity = ${elems.length}};`);
          } else {
            this._newArrayElemHint = et; // hint for new Array(N) without type args
            const initC = this.exprToC(init, lines, depth);
            this._newArrayElemHint = null;
            p(`${qualifier}${arrName} ${name} = ${initC};`);
            // Register cleanup if heap-allocated (new Array or method returning new array)
            if (HEAP_ARRAY_KEYWORDS.some(k => initC.includes(k))) {
              this._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
            }
          }
          this.define(name, { ctype: arrName, elemType: elemIdent, arrElemCType: et, isArray: true,
                              arraySize: init?.kind === 'ArrayLit' ? this.arrayLitSize(init) : undefined, varKind,
                              initNode: init?.kind === 'ArrayLit' ? init : undefined });
          return;
        }

        // Inferred Array_T type (no typeAnn, e.g. result of arr.filter/map/concat/slice)
        if (!typeAnn && ctype?.startsWith('Array_') && init) {
          const elemIdent = ctype.slice(6); // Array_i32 тЖТ i32
          const etC2 = this._arrIdentToCType(elemIdent);
          this._ensureArrayStruct(ctype, etC2);
          const initC = this.exprToC(init, lines, depth);
          const isHeap = HEAP_ARRAY_KEYWORDS.some(k => initC.includes(k));
          const suppressConst2 = this._lastSuppressConst;
          this._lastSuppressConst = undefined;
          if (isHeap) {
            p(`${ctype} ${name} = ${initC};`);
            this._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
          } else {
            const effQual2 = suppressConst2 ? '' : qualifier;
            p(`${this.varDecl(effQual2, ctype, name)} = ${initC};`);
          }
          this.define(name, { ctype, elemType: elemIdent, arrElemCType: etC2, isArray: true, varKind });
          if (this._lastHalRead) { p(`(void)${name};`); this._lastHalRead = null; }
          return;
        }

        // Tuple init: let pair: [i32, string] = [1, "hello"] тЖТ struct init
        {
          const tupleDef1 = this.classes.get(ctype);
          if (tupleDef1?.isTuple && init?.kind === 'ArrayLit') {
            const initParts = [];
            let fieldIdx = 0;
            for (const el of init.elems) {
              if (el.spread) {
                // spread: [...p] тЖТ copy all fields
                const spreadSrc = this.exprToC(el.expr, lines, depth);
                const srcType = this.inferType(el.expr);
                const srcDef = this.classes.get(srcType);
                const tupleHasRest = tupleDef1.fields.some(f => f.rest);
                if (!srcDef?.isTuple && !tupleHasRest) {
                  throw this.error('cannot spread runtime array into fixed-size tuple');
                }
                if (srcDef?.isTuple) {
                  for (const f of srcDef.fields) {
                    initParts.push(`.${tupleDef1.fields[fieldIdx].name} = ${spreadSrc}.${f.name}`);
                    fieldIdx++;
                  }
                }
                continue;
              }
              const field = tupleDef1.fields[fieldIdx++];
              if (!field) continue;
              // Rest field: collect remaining elems into a temp array
              if (field.rest) {
                const tailElems = [el, ...init.elems.slice(init.elems.indexOf(el) + 1)];
                const tailVar = `_tail_${this.tempCount++}`;
                const tailVals = tailElems.map(e => this.exprToC(e.expr, lines, depth)).join(', ');
                lines.push(`${field.elemType} ${tailVar}[] = {${tailVals}};`);
                initParts.push(`.${field.name} = ${tailVar}`);
                // Skip tail_len field тАФ add length directly
                fieldIdx++; // skip _tail_len field
                initParts.push(`._tail_len = ${tailElems.length}`);
                break; // rest consumes all remaining elements
              }
              const valC = this.exprToC(el.expr, lines, depth);
              // Optional field: wrap non-opt value in {true, val}
              if (field.ctype.startsWith('opt_')) {
                const valType = this.inferType(el.expr);
                const initVal = (valType === field.ctype) ? valC : `{true, ${valC}}`;
                initParts.push(`.${field.name} = ${initVal}`);
              } else {
                initParts.push(`.${field.name} = ${valC}`);
              }
            }
            // Fill remaining optional fields with {false, 0}
            while (fieldIdx < tupleDef1.fields.length) {
              const field = tupleDef1.fields[fieldIdx++];
              if (field.ctype.startsWith('opt_')) initParts.push(`.${field.name} = {false, 0}`);
            }
            p(`${qualifier}${ctype} ${name} = {${initParts.join(', ')}};`);
            // Track which optional fields were not provided (null)
            const nullOptFields = new Set();
            for (let i = init.elems.length; i < tupleDef1.fields.length; i++) {
              const f = tupleDef1.fields[i];
              if (f.ctype.startsWith('opt_')) nullOptFields.add(f.name);
            }
            this.define(name, { ctype, varKind, nullOptFields: nullOptFields.size > 0 ? nullOptFields : null });
            return;
          }
        }

        // TypeFunc: single closure variable
        if (typeAnn?.kind === 'TypeFunc') {
          let initC;
          if (init?.kind === 'Arrow') {
            const closure = this.hoistClosure(init, name);
            if (closure) {
              if (closure.retainLines?.length) {
                for (const rl of closure.retainLines) p(rl);
              }
              p(`${closure.envName} ${name}_env = ${closure.envInit};`);
              p(`tsc_closure ${name} = {.env = &${name}_env, .fn = (void*)${closure.fnName}};`);
              this.define(name, { ctype: 'tsc_closure', isClosure: true, closureRetType: closure.ret, varKind, _closureEnvName: `${name}_env`, _closureFnName: closure.fnName,
                                  ...(closure.hasStringCapture ? { closureDestroyFn: closure.destroyFnName } : {}) });
              if (closure.hasStringCapture) {
                for (const nm of closure.capturedStringFields ?? []) {
                  this._registerCleanup(`tsc_string_release(${name}_env.${nm})`);
                }
              }
              const closureLine = (node.line ?? 1) - 1;
              for (const [nm] of closure.capturedVars) {
                const capSym = this.lookup(nm);
                if (capSym && capSym.ctype !== 'String') capSym._movedIntoClosureLine = closureLine;
              }
              return;
            }
            const lambdaName = this.hoistArrow(init, 'void', name);
            const lambdaRet = this.inferArrowReturn(init);
            p(`tsc_closure ${name} = {.env = NULL, .fn = (void*)${lambdaName}};`);
            this.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, closureRetType: lambdaRet });
            return;
          } else {
            const initSym = init?.kind === 'Ident' ? this.lookup(init.name) : null;
            if (initSym?.funcName) {
              initC = `(tsc_closure){.env = NULL, .fn = (void*)${initSym.funcName}}`;
              p(`tsc_closure ${name} = ${initC};`);
              this.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, closureRetType: initSym.ctype, funcName: initSym.funcName });
              return;
            } else {
              initC = init ? this.exprToC(init, lines, depth) : '(tsc_closure){0}';
            }
          }
          p(`tsc_closure ${name} = ${initC};`);
          this.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind });
          return;
        }

        // TypeArray of TypeFunc: array of closures
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind === 'TypeFunc') {
          const arrCtype = 'Array_tsc_closure';
          this.addTop(`typedef struct { tsc_closure *data; size_t length; size_t capacity; } ${arrCtype};`);
          if (init?.kind === 'ArrayLit') {
            const elems = init.elems.map(e => {
              if (e.expr?.kind === 'Ident') {
                const s = this.lookup(e.expr.name);
                return s?.funcName ?? e.expr.name;
              }
              return this.exprToC(e.expr, lines, depth);
            });
            const litName = `_${name}_lit`;
            p(`tsc_closure ${litName}[] = {${elems.map(e => `(tsc_closure){.env = NULL, .fn = (void*)${e}}`).join(', ')}};`);
            p(`${qualifier}${arrCtype} ${name} = {.data = ${litName}, .length = ${elems.length}, .capacity = ${elems.length}};`);
            this.define(name, { ctype: arrCtype, isArray: true, elemType: 'tsc_closure', arrElemCType: 'tsc_closure', arraySize: elems.length, varKind });
            return;
          }
          p(`${qualifier}${arrCtype} ${name} = {0};`);
          this.define(name, { ctype: arrCtype, isArray: true, elemType: 'tsc_closure', arrElemCType: 'tsc_closure', varKind });
          return;
        }

        if (init) {
          if (init.kind === 'Arrow') {
            const closure = this.hoistClosure(init, name);
            if (closure) {
              if (closure.retainLines?.length) {
                for (const rl of closure.retainLines) p(rl);
              }
              p(`${closure.envName} ${name}_env = ${closure.envInit};`);
              p(`tsc_closure ${name} = {.env = &${name}_env, .fn = (void*)${closure.fnName}};`);
              this.define(name, { ctype: 'tsc_closure', isClosure: true, closureRetType: closure.ret, varKind, _closureEnvName: `${name}_env`, _closureFnName: closure.fnName,
                                  ...(closure.hasStringCapture ? { closureDestroyFn: closure.destroyFnName } : {}) });
              if (closure.hasStringCapture) {
                for (const nm of closure.capturedStringFields ?? []) {
                  this._registerCleanup(`tsc_string_release(${name}_env.${nm})`);
                }
              }
              const closureLine = (node.line ?? 1) - 1;
              for (const [nm] of closure.capturedVars) {
                const capSym = this.lookup(nm);
                if (capSym && capSym.ctype !== 'String') capSym._movedIntoClosureLine = closureLine;
              }
              return;
            }
            const lambdaName = this.hoistArrow(init, 'void', name);
            const lambdaRet = this.inferArrowReturn(init);
            p(`tsc_closure ${name} = {.env = NULL, .fn = (void*)${lambdaName}};`);
            this.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, closureRetType: lambdaRet });
            return;
          } else if (!typeAnn && init.kind === 'Ident') {
            const sym = this.lookup(init.name);
            if (sym?.funcName && sym?.params) {
              p(`tsc_closure ${name} = {.env = NULL, .fn = (void*)${sym.funcName}};`);
              this.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, funcName: sym.funcName, closureRetType: sym.ctype });
              return;
            }
            // Move semantics borrow check (before emit, but set _moved AFTER)
            { const initSym2 = this.lookup(init.name);
              const structDef2 = this.classes.get(ctype);
              if (structDef2?.fields || ctype.startsWith('Array_')) {
                if (initSym2?.varKind === 'const') {
                  throw this.error(`cannot move out of "const" binding`, null, { code: 'E003' });
                }
                if (initSym2?.isRefParam) {
                  throw this.error(`cannot move out of "Ref<T>" borrow`, null, { code: 'E004' });
                }
              }
            }
            if (ctype === 'String') {
              p(`tsc_string_retain(${init.name});`);
            }
            p(`${this.varDecl(qualifier, ctype, name)} = ${this.exprToC(init, lines, depth)};`);
            // Move semantics: mark source moved and zero out
            { const initSym2 = this.lookup(init.name);
              const structDef2 = this.classes.get(ctype);
              if (structDef2?.fields || ctype.startsWith('Array_')) {
                if (initSym2) {
                  initSym2._moved = true;
                  initSym2._movedLine = node.line;
                  initSym2._movedSourceNode = init; // for secondary span
                }
              }
              if (initSym2?.varKind === 'let' && structDef2?.fields) {
                p(`${init.name} = (${ctype}){0};`);
              }
            }
            if (ctype === 'String') {
              this._registerCleanup(`tsc_string_release(${name})`);
            }
          } else if (init.kind === 'ObjLit' && enumDef2?.isPartial) {
            // Partial<T> ObjLit: expand { name: "Alice" } тЖТ { .has_name = true, .name = ..., .has_age = false }
            const provided = new Map();
            for (const prop of init.props) {
              if (!prop.spread && !prop.computed) {
                provided.set(prop.key, this.exprToC(prop.value, lines, depth));
              }
            }
            const initParts = [];
            for (const f of enumDef2.fields ?? []) {
              const fname = typeof f === 'string' ? f : f.name;
              if (provided.has(fname)) {
                initParts.push(`.has_${fname} = true`);
                initParts.push(`.${fname} = ${provided.get(fname)}`);
              } else {
                initParts.push(`.has_${fname} = false`);
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = {${initParts.join(', ')}};`);
          } else {
            // Check if init is a Call whose callee returns a TypeFunc
            let callSym = null;
            if (init.kind === 'Call' && init.callee.kind === 'Ident') {
              callSym = this.lookup(init.callee.name);
            }
            if (!typeAnn && callSym?.returnType?.kind === 'TypeFunc') {
              const initC = this.exprToC(init, lines, depth);
              p(`${this.typeDecl(callSym.returnType, name)} = ${initC};`);
              this.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, ...(callSym.closureRetType ? { closureRetType: callSym.closureRetType } : {}) });
              return;
            }
            // Borrow check: cannot move out of array by index (no-typeAnn path)
            if (init.kind === 'Index' && !ctype.endsWith(' *') && typeAnn?.name !== 'Ref') {
              const _arrT2 = this.inferType(init.object);
              if (_arrT2?.startsWith('Array_')) {
                const _elem2 = _arrT2.slice(6);
                if (!PRIMITIVE_IDENTS.has(_elem2)) {
                  throw this.error(`cannot move out of array by index`, init, {
                    code: 'E009', help: ['use .remove(i) to take ownership'],
                  });
                }
              }
            }
            // Ref<T> / Mut<T> borrow from object fields is not supported
            if (init.kind === 'Member' && (typeAnn?.name === 'Ref' || typeAnn?.name === 'Mut')) {
              throw this.error(`TypeError: Cannot borrow a class field; pass the entire object as ${typeAnn.name}<T> instead`, init);
            }
            let initC;
            if (init.kind === 'Literal' && (init.litType === 'number' || init.litType === 'char')) {
              initC = this.literalToCTyped(init, ctype);
            } else {
              // For binary expressions with mixed integer types in const context:
              // cast operands and result explicitly to preserve well-defined semantics
              let mixedBinary = null;
              if (typeAnn && init.kind === 'Binary') {
                mixedBinary = this.tryConstMixedBinary(init, ctype, lines, depth);
              }
              if (mixedBinary !== null) {
                initC = mixedBinary;
              } else if (ctype === 'int64_t' && init.kind === 'Binary') {
                // For binary expressions assigned to int64_t with u32 operands,
                // widen operands individually to avoid overflow before cast
                initC = this.binaryWidened(init, ctype, lines, depth);
              } else {
                // Set expected type hint for context-sensitive calls (e.g. parseFloat with f64 annotation)
                this._expectedType = ctype;
                initC = this.exprToC(init, lines, depth);
                this._expectedType = undefined;
              }
              // Implicit type conversion checks for typed assignments (skip if already handled by mixedBinary)
              if (typeAnn && mixedBinary === null) {
                const srcType = this.inferType(init);
                // Cannot implicitly convert string literal union to string
                if (ctype === 'String') {
                  const srcEnumDef = this.classes.get(srcType);
                  if (srcEnumDef?.isStringLiteralUnion) {
                    throw this.error(`cannot implicitly convert ${srcType} to string: use ".toString()" or "as string"`);
                  }
                }
                const illegalConversions = [
                  ['size_t',    'int32_t',  'usize', 'i32'],
                  ['int32_t',   'float',    'i32',   'f32'],
                  ['int64_t',   'double',   'i64',   'f64'],
                  ['int64_t',   'uint32_t', 'i64',   'u32'],
                  ['uint64_t',  'int64_t',  'u64',   'i64'],
                ];
                for (const [src, dst, srcTs, dstTs] of illegalConversions) {
                  if (srcType === src && ctype === dst) {
                    throw this.error(`cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"`);
                  }
                }
                // Widening casts for non-binary expressions
                if (ctype === 'int64_t' && srcType === 'size_t') {
                  initC = `(int64_t)${initC}`;
                }
              }
            }
            // computed() тЖТ Signal_T var (Signal is the result type, not raw T)
            if (this._lastComputedSigType) {
              const _sigType = this._lastComputedSigType;
              const _sigElemIdent = this._lastComputedElemType;
              this._lastComputedSigType = undefined;
              this._lastComputedElemType = undefined;
              p(`${_sigType} ${name} = ${initC};`);
              this.define(name, { ctype: _sigType, varKind, _isSignal: true, _signalElemType: _sigElemIdent });
              return;
            }
            // Cross-struct assignment: const b: Pt2 = a (where a is a different struct type)
            if (init.kind === 'Ident') {
              const initSym = this.lookup(init.name);
              const srcDef = initSym ? this.classes.get(initSym.ctype) : null;
              const dstDef = this.classes.get(ctype);
              if (srcDef?.isStruct && dstDef?.isStruct && initSym.ctype !== ctype) {
                const qualCast = qualifier === 'const ' ? 'const ' : '';
                initC = `*(${qualCast}${ctype} *)&${initC}`;
              }
            }
            // Heap-allocated map: register free call
            if (ctype.startsWith('Map_') && initC.includes('tsc_map_create')) {
              const mapSuffix = ctype.slice(4);
              p(`${this.varDecl(qualifier, ctype, name)} = ${initC};`);
              this._registerCleanup(`tsc_map_free_${mapSuffix}(&${name})`);
              this._lastArrayElemReturn = undefined;
              this._lastSuppressConst = undefined;
            // Heap-allocated string: emit as non-const and register cleanup
            } else if (ctype === 'String' && this._isHeapStringInit(init)) {
              p(`String ${name} = ${initC};`);
              this._registerCleanup(`tsc_string_release(${name})`);
            } else {
              // Suppress const if flagged by array element return or parse() result
              const effQual = (this._lastArrayElemReturn || this._lastSuppressConst) ? '' : qualifier;
              this._lastArrayElemReturn = undefined;
              this._lastSuppressConst = undefined;
              // Borrow check before emit (with typeAnn path)
              // Skip when source and target are different struct types (cross-type cast, not a move)
              if (init.kind === 'Ident') {
                const initSym2pre = this.lookup(init.name);
                const structDef2pre = this.classes.get(ctype);
                const isCrossStruct = initSym2pre?.ctype && initSym2pre.ctype !== ctype
                  && this.classes.get(initSym2pre.ctype)?.isStruct && structDef2pre?.isStruct;
                if (!isCrossStruct && (structDef2pre?.fields || ctype.startsWith('Array_'))) {
                  if (initSym2pre?.varKind === 'const') {
                    throw this.error(`cannot move out of "const" binding`, null, { code: 'E003' });
                  }
                  if (initSym2pre?.isRefParam) {
                    throw this.error(`cannot move out of "Ref<T>" borrow`, null, { code: 'E004' });
                  }
                }
              } else if (init.kind === 'Index') {
                if (!ctype.endsWith(' *') && typeAnn?.name !== 'Ref') {
                  // Cannot move out of array by index (only borrow via Ref<T>)
                  const _arrT = this.inferType(init.object);
                  if (_arrT?.startsWith('Array_')) {
                    const _elem = _arrT.slice(6);
                    if (!PRIMITIVE_IDENTS.has(_elem)) {
                      throw this.error(`cannot move out of array by index`, init, {
                        code: 'E009', help: ['use .remove(i) to take ownership'],
                      });
                    }
                  }
                } else if (typeAnn?.name === 'Ref' && init.object.kind === 'Ident') {
                  // Ref<T> borrow of array element тЖТ mark array as borrowed
                  const _arrSym = this.lookup(init.object.name);
                  if (_arrSym) this._trackRefBorrow(_arrSym);
                }
              }
              if (init.kind === 'Index' && typeAnn?.name === 'Ref' && ctype.endsWith(' *')) {
                initC = `&${initC}`;
              }
              if (init.kind === 'Ident' && typeAnn?.name === 'Ref' && ctype.endsWith(' *')) {
                const srcSym = this.lookup(init.name);
                if (srcSym && !srcSym.isPointer && !srcSym.ctype?.endsWith('*')) {
                  initC = `&${initC}`;
                }
                if (srcSym) this._trackRefBorrow(srcSym);
              }
              if (init.kind === 'Ident' && typeAnn?.name === 'Mut' && ctype.endsWith('*')) {
                const srcSym = this.lookup(init.name);
                if (srcSym && !srcSym.isPointer && !srcSym.ctype?.endsWith('*')) {
                  initC = `&${initC}`;
                }
                if (srcSym) {
                  if (srcSym.varKind === 'const') {
                    throw this.error(`cannot borrow "${init.name}" as mutable: it is a const binding`);
                  }
                  if ((srcSym._refBorrowCount || 0) > 0) {
                    throw this.error(
                      `TypeError: Cannot create mutable borrow of '${init.name}' while immutable borrow is active`,
                      init
                    );
                  }
                  if (srcSym._mutBorrowedBy) {
                    throw this.error(
                      `TypeError: Cannot create two simultaneous mutable borrows of '${init.name}'`,
                      init
                    );
                  }
                  srcSym._mutBorrowedBy = `_mut_var_${name}`;
                }
              }
              if (ctype === 'String' && init.kind === 'Ident') {
                p(`tsc_string_retain(${init.name});`);
              }
              if (ctype === 'String' && init.kind === 'Member' && init.object.kind === 'Ident') {
                p(`tsc_string_retain(${init.object.name}.${init.prop});`);
              }
              p(`${this.varDecl(effQual, ctype, name)} = ${initC};`);
              if (ctype === 'String' && init.kind === 'Index') {
                p(`tsc_string_retain(${name});`);
              }
              // Move semantics: mark source moved and zero out (after emit)
              if (init.kind === 'Ident') {
                const initSym2 = this.lookup(init.name);
                const structDef2 = this.classes.get(ctype);
                if (structDef2?.fields || ctype.startsWith('Array_')) {
                  if (initSym2) {
                    initSym2._moved = true;
                    initSym2._movedLine = node.line;
                    initSym2._movedSourceNode = init; // for secondary span
                  }
                  if (initSym2?.varKind === 'let' && structDef2?.fields) {
                    p(`${init.name} = (${ctype}){0};`);
                  }
                }
              } else if (init.kind === 'Member' && init.object.kind === 'Ident') {
                // Field move: let d = obj.field → mark field as moved
                const objSym = this.lookup(init.object.name);
                const objDef = objSym ? this.classes.get(objSym.ctype) : null;
                const fieldType = objDef?.fields?.find(f => f.name === init.prop);
                if (fieldType && this.classes.has(this.resolveType(fieldType.typeAnn ?? {}))) {
                  if (!objSym._movedFields) objSym._movedFields = new Set();
                  objSym._movedFields.add(init.prop);
                  objSym._movedFieldLine = objSym._movedFieldLine ?? {};
                  objSym._movedFieldLine[init.prop] = node.line;
                  objSym._movedFieldSourceNode = objSym._movedFieldSourceNode ?? {};
                  objSym._movedFieldSourceNode[init.prop] = init; // for secondary span
                }
              }
              if (ctype === 'String') {
                this._registerCleanup(`tsc_string_release(${name})`);
              }
            }
          }
        } else {
          // No initializer: declare without init
          p(`${this.varDecl(qualifier, ctype, name)};`);
        }
        // Store compile-time value for const variables with literal init (used for const-cast overflow checking)
        let constValue = undefined;
        if (varKind === 'const' && init?.kind === 'Literal' && init.litType === 'number') {
          try { constValue = BigInt(init.value.replace(/_/g, '')); } catch(_) {}
        }
        const isStringRef = typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref' &&
                            typeAnn.typeArgs?.[0]?.name === 'string';
        const _isRefVar = typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref';
        const _refInnerType = _isRefVar && ctype.endsWith(' *')
          ? this.resolveType(typeAnn.typeArgs?.[0] ?? {})
          : undefined;
        this.define(name, { ctype, varKind, constValue, initNode: init,
                            ...(isStringRef ? { isStringRef: true } : {}),
                            ...(_refInnerType ? { isPointer: true, derefType: _refInnerType } : {}) });
        // Register cleanup for class variables with string fields
        if (init && this.classes.has(ctype)) {
          const stringFields = this._getStringFields(ctype);
          if (stringFields.length > 0) {
            this._ensureClassFree(ctype);
            const freeFn = this.classes.get(ctype)?._classFreeFn;
            if (freeFn) this._registerCleanup(`${freeFn}(&${name})`);
          }
        }
        // Track pool vars for auto-drop at block exit
        if (ctype?.startsWith('opt_ref_') && this._currentBlockPoolVars) {
          const _pcls = ctype.slice(8);
          if (this.classes.get(_pcls)?._isPool) {
            this._currentBlockPoolVars.push({ name, className: _pcls });
          }
        }
        this._flushPostStmtCleanups(lines);
        // HAL read: emit (void)varname; to suppress unused variable warning
        if (this._lastHalRead) {
          p(`(void)${name};`);
          this._lastHalRead = null;
        }
        // Class decorator inits: inject after new ClassName() declaration
        if (this._pendingDecoratorInits) {
          for (const { fieldName, cVal } of this._pendingDecoratorInits) {
            p(`${name}.${fieldName} = ${cVal};`);
          }
          this._pendingDecoratorInits = null;
        }
    }
  },
};

