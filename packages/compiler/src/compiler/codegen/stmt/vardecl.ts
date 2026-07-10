import type { CodeGenContext } from '../../codegen.js';
import type { Expression, TypeAnn, TypeRef, VarDecl, ObjectField, Call, Block, Literal } from '@tsclang/ast';
import type { SymbolInfo } from '@tsclang/ast';
import { resolveDecimalBase } from '../types/decimal.js';
const PRIMITIVE_IDENTS = new Set(['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64','d8','d16','d32','d64','boolean','usize']);
const HEAP_ARRAY_KEYWORDS = ['tsc_array_create', 'tsc_array_filter', 'tsc_array_map',
                              'tsc_array_concat', 'tsc_array_slice'];
export function _visitVarDecl(ctx: CodeGenContext, node: VarDecl, lines: string[], depth: number) {
    ctx._currentNode = node;
    const I = ' '.repeat(ctx.indent * depth);
    const p = (s: string) => lines.push(I + s);
    {
        const { varKind, name, typeAnn, init } = node;

        // Generator instantiation: const g = genFn(args) С‚Р–Рў genFn_state g = {0};
        if (init?.kind === 'Call' && init.callee?.kind === 'Ident') {
          const gi = ctx._generatorFuncs?.get(init.callee.name);
          if (gi) {
            const I = ' '.repeat(ctx.indent * depth);
            const genArgs = (init.args || []).map((a: { expr: Expression }) => ctx.exprToC(a.expr, lines, depth));
            lines.push(`${I}${gi.stateType} ${name} = {0};`);
            ctx.define(name, { ctype: gi.stateType, varKind, _isGenState: true,
              _genFn: init.callee.name, _genArgs: genArgs, _gi: gi });
            return;
          }
        }

        // Generator .next() result: let r = g.next() С‚Р–Рў genFn_result r = genFn_next(&g, args);
        if (init?.kind === 'Call' && init.callee?.kind === 'Member' && init.callee.prop === 'next') {
          const objName = init.callee.object?.kind === 'Ident' ? init.callee.object.name : undefined;
          const sym = objName ? ctx.lookup(objName) : null;
          if (sym?._isGenState) {
            const { gi, callExpr } = ctx._genNextCall(sym, ctx.exprToC(init.callee.object, lines, depth));
            const I = ' '.repeat(ctx.indent * depth);
            lines.push(`${I}${gi.resultType} ${name} = ${callExpr};`);
            ctx.define(name, { ctype: gi.resultType, varKind });
            return;
          }
        }

        // spawn { ... } / spawn throws T { ... } as VarDecl init
        if (init?.kind === 'Spawn') {
          const hasThrows = (init.throwsTypes?.length ?? 0) > 0;
          const threadVar = ctx._emitSpawnBlock(hasThrows ? null : name, init.body, init.throwsTypes ?? null, lines, depth);
          if (hasThrows) {
            ctx.define(name, { ctype: 'tsc_thread_t', varKind, _cAlias: threadVar, _isThread: true });
            p(`(void)${threadVar};`);
          } else {
            ctx.define(name, { ctype: 'tsc_thread_t', varKind, _isThread: true });
          }
          return;
        }

        // Thread.spawn(lambda) as VarDecl init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Thread' &&
            init.callee.prop === 'spawn') {
          const lambdaArg = init.args?.[0]?.expr;
          const lambdaBody = (lambdaArg?.kind === 'Arrow' || lambdaArg?.kind === 'FuncExpr') ? (lambdaArg.body ?? { kind: 'Block', body: [] }) : { kind: 'Block', body: [] };
          const idx = ctx._spawnCount ?? 0;
          const threadVar2 = ctx._emitSpawnBlock(null, lambdaBody as Block, [], lines, depth);
          ctx.define(name, { ctype: 'tsc_thread_t', varKind, _cAlias: threadVar2, _isThread: true });
          return;
        }

        // Match expression: const x = match { ... }
        if (init?.kind === 'Match') {
          ctx.emitMatchVarDecl(node, lines, depth);
          return;
        }

        // select({key: ch.receive(), ...}) С‚Р–Рў tagged-union SelectResult
        if (init?.kind === 'Call' && init.callee?.kind === 'Ident' && init.callee.name === 'select') {
          ctx.emitSelectVarDecl(node, lines, depth);
          return;
        }

        // Propagate/NonNull: const x = throwsFunc()?  or  const x = throwsFunc()!
        if (init?.kind === 'Propagate' || init?.kind === 'NonNull') {
          ctx.emitPropagateVarDecl(node, lines, depth);
          return;
        }

        // Object.fromEntries<{a: T, b: U}>(array) С‚Р–Рў compile-time struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee?.object?.kind === 'Ident' && init.callee?.object?.name === 'Object' &&
            init.callee?.prop === 'fromEntries' &&
            init.typeArgs?.[0]?.kind === 'TypeObject') {
          const typeArg = init.typeArgs[0];
          const fields = typeArg.fields;
          const fieldNames = fields.map((f: { name: string }) => f.name);
          const structName = `_fromEntries_${ctx._fromEntriesCount++}`;
          const fieldDecls = fields.map((f: ObjectField) => `${ctx.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
          ctx.classes.set(structName, { isStruct: true, fields });
          const arg = init.args[0]?.expr;
          let entriesElems: Array<{ expr: Expression; spread?: boolean }> | null = null;
          let isVar = false;
          if (arg?.kind === 'ArrayLit') {
            entriesElems = arg.elems;
          } else if (arg?.kind === 'Ident') {
            const consumed = ctx._fromEntriesConsumed?.get(arg.name);
            if (consumed) {
              // Emit entries typedefs now (after fromEntries struct, to match expected order)
              const et = ctx.resolveType(consumed.typeAnn.element);
              ctx.resolveType(consumed.typeAnn); // emits Array_tuple
              entriesElems = consumed.init?.kind === 'ArrayLit' ? consumed.init.elems : null;
            } else {
              const sym = ctx.lookup(arg.name);
              if (sym?.initNode?.kind === 'ArrayLit') entriesElems = sym.initNode.elems;
            }
            isVar = true;
          }
          const initParts: string[] = [];
          for (const elem of (entriesElems ?? [])) {
            const pair = elem.expr;
            if (pair?.kind !== 'ArrayLit' || pair.elems?.length < 2) continue;
            const keyNode = pair.elems[0]?.expr;
            const valNode = pair.elems[1]?.expr;
            if (keyNode?.kind !== 'Literal' || keyNode.litType !== 'string') continue;
            const key = keyNode.value;
            if (!fieldNames.includes(key)) throw ctx.errorCode('E108', null, { detail: `Object.fromEntries: key "${key}" is not a field of the target type` });
            initParts.push(`.${key} = ${ctx.exprToC(valNode, lines, depth)}`);
          }
          if (isVar) {
            p(`${structName} ${name} = {0};`);
            p(`${name} = (${structName}){${initParts.join(', ')}};`);
          } else {
            p(`${structName} ${name} = {${initParts.join(', ')}};`);
          }
          ctx.define(name, { ctype: structName, varKind });
          return;
        }

        // If consumed by fromEntries (Ident arg), defer all processing С‚РђР¤ no C emit, no typedefs yet
        if (ctx._fromEntriesConsumed?.has(name) && typeAnn?.kind === 'TypeArray') {
          ctx._fromEntriesConsumed.set(name, { typeAnn, init });
          ctx.define(name, { ctype: 'void', isArray: true, varKind, initNode: init });
          return;
        }

        // String.split() С‚Р–Рў special multi-statement form: String *parts; int32_t parts_len; tsc_string_split(...)
        if (!typeAnn && init?.kind === 'Call' &&
            init.callee?.kind === 'Member' && init.callee?.prop === 'split') {
          const splitObjType = ctx.inferType(init.callee.object);
          if (splitObjType === 'String') {
            const objC = ctx.exprToC(init.callee.object, lines, depth);
            const sepC = init.args[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
            const lenName = `${name}_len`;
            p(`String *${name} = NULL;`);
            p(`int32_t ${lenName} = 0;`);
            p(`tsc_string_split(${objC}, ${sepC}, &${name}, &${lenName});`);
            ctx.define(name, { ctype: 'String *', varKind, isArray: false, isSplitResult: true, lenName });
            ctx._registerCleanup(`tsc_string_array_free(${name}, ${lenName})`);
            return;
          }
        }

        // new Atomic<T>(val) С‚Р–Рў Atomic_T typedef + {.value = val}
        if (init?.kind === 'New' && init.name === 'Atomic') {
          const tArg = init.typeArgs?.[0];
          const innerCtype = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const ident = ctx.cTypeToIdent(innerCtype);
          const atomicType = `Atomic_${ident}`;
          if (!ctx._emittedAtomicTypes.has(atomicType)) {
            ctx._emittedAtomicTypes.add(atomicType);
            ctx.includes.add('#include <stdatomic.h>');
            ctx.addTop(`typedef struct { _Atomic ${innerCtype} value; } ${atomicType};`);
            ctx.addTop('');
          }
          const initVal = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${atomicType} ${name} = {.value = ${initVal}};`);
          ctx.define(name, { ctype: atomicType, varKind, _isAtomic: true, _atomicInner: innerCtype });
          return;
        }

        // new Readonly(val) or new Readonly<T>(val) С‚Р–Рў const T name = val
        if (init?.kind === 'New' && init.name === 'Readonly') {
          const valArg = init.args?.[0];
          const valC = valArg ? ctx.exprToC(valArg.expr ?? valArg, lines, depth) : '{0}';
          let innerType;
          if (init.typeArgs?.[0]) {
            innerType = ctx.resolveType(init.typeArgs[0]);
          } else if (valArg) {
            innerType = ctx.inferType(valArg.expr ?? valArg);
          } else {
            innerType = 'void *';
          }
          p(`const ${innerType} ${name} = ${valC};`);
          ctx.define(name, { ctype: innerType, varKind, _isReadonly: true });
          return;
        }

        // new AtomicArray<T>(N) С‚Р–Рў AtomicArray_T typedef + calloc
        if (init?.kind === 'New' && init.name === 'AtomicArray') {
          const tArg = init.typeArgs?.[0];
          const innerCtype = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const ident = ctx.cTypeToIdent(innerCtype);
          const arrType = `AtomicArray_${ident}`;
          if (!ctx._emittedAtomicTypes.has(arrType)) {
            ctx._emittedAtomicTypes.add(arrType);
            ctx.includes.add('#include <stdatomic.h>');
            ctx.addTop(`typedef struct { int32_t length; _Atomic ${innerCtype} *data; } ${arrType};`);
            ctx.addTop('');
          }
          const sizeC = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${arrType} ${name} = {.length = ${sizeC}, .data = calloc(${sizeC}, sizeof(_Atomic ${innerCtype}))};`);
          ctx.define(name, { ctype: arrType, varKind, _isAtomicArray: true, _atomicArrayInner: innerCtype });
          ctx._registerCleanup(`free(${name}.data)`);
          return;
        }

        // new Arc<Atomic<T>>(val) С‚Р–Рў Atomic_T_shared typedef + arc alloc + atomic_init
        if (init?.kind === 'New' && init.name === 'Arc' && init.typeArgs?.[0]?.kind === 'TypeRef' && init.typeArgs?.[0]?.name === 'Atomic') {
          const tArg = init.typeArgs[0].typeArgs?.[0];
          const innerCtype = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const ident = ctx.cTypeToIdent(innerCtype);
          const sharedType = `Atomic_${ident}_shared`;
          if (!ctx._emittedAtomicTypes.has(sharedType)) {
            ctx._emittedAtomicTypes.add(sharedType);
            ctx.includes.add('#include <stdatomic.h>');
            ctx.addTop(`typedef struct { int32_t _refcount; int32_t _weakcount; _Atomic ${innerCtype} value; } ${sharedType};`);
            ctx.addTop('');
          }
          const initVal = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${sharedType} *${name} = tsc_arc_alloc(sizeof(${sharedType}));`);
          p(`atomic_init(&${name}->value, ${initVal});`);
          ctx.define(name, { ctype: `${sharedType} *`, varKind, _isAtomic: true, _isArcAtomic: true, _atomicInner: innerCtype });
          ctx._registerCleanup(`tsc_arc_release(${name})`);
          return;
        }

        // new Signal<T>(val) С‚Р–Рў Signal_T struct + tsc_signal_create_T
        if (init?.kind === 'New' && init.name === 'Signal' && ctx._stdReactiveImported) {
          const tArg = init.typeArgs?.[0];
          const et = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const etIdent = ctx.cTypeToIdent(et);
          const sigType = `Signal_${etIdent}`;
          if (!ctx._emittedSignalTypedefs.has(sigType)) {
            ctx._emittedSignalTypedefs.add(sigType);
            ctx.addTop(`typedef struct { ${et} _value; void (**_effects)(void); size_t _effect_count; ${et} (*_compute)(void); } ${sigType};`);
            ctx.addTop('');
          }
          const initVal = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${sigType} ${name} = tsc_signal_create_${etIdent}(${initVal});`);
          ctx.define(name, { ctype: sigType, varKind, _isSignal: true, _signalElemType: etIdent });
          return;
        }

        // new StaticMap({ "key": val, ... }) С‚Р–Рў compile-time hash lookup function
        if (init?.kind === 'New' && init.name === 'StaticMap' && ctx._stdEmbeddedImported) {
          ctx.includes.add('#include "std/embedded.h"');
          const objArg = init.args?.[0]?.expr;
          if (objArg?.kind !== 'ObjLit') return;
          const entries: { key: string | Expression; valC: string }[] = [];
          for (const prop of (objArg.props ?? [])) {
            if (prop.computed) {
              const keyExpr = prop.key;
              const keyName = typeof keyExpr === 'object' && keyExpr?.kind === 'Ident' ? keyExpr.name : '?';
              throw ctx.error(`TypeError: StaticMap keys must be compile-time string literals; dynamic key '[${keyName}]' is not allowed`);
            }
            const valC = ctx.exprToC(prop.value!, lines, depth);
            entries.push({ key: prop.key ?? '', valC });
          }
          const idx = ctx._staticMapInlineCount ?? 0;
          ctx._staticMapInlineCount = idx + 1;
          // No runtime object; define symbol for later get() calls
          ctx.define(name, { ctype: 'StaticMapInline', varKind, _isStaticMapInline: true,
            _entries: entries, _smIdx: idx, _getFn: null });
          return;
        }

        // new HttpServer({ port: N }) С‚Р–Рў TscHttpServer server = tsc_http_server_create(N)
        if (init?.kind === 'New' && init.name === 'HttpServer' && ctx._stdNetImported) {
          const optsArg = init.args?.[0]?.expr;
          let portC = '8080';
          if (optsArg?.kind === 'ObjLit') {
            const portProp = (optsArg.props ?? []).find((pr) => pr.key === 'port');
            if (portProp) portC = ctx.exprToC(portProp.value!, lines, depth);
          }
          p(`TscHttpServer ${name} = tsc_http_server_create(${portC});`);
          ctx.define(name, { ctype: 'TscHttpServer', varKind, _isHttpServer: true });
          return;
        }

        // new WebSocket("url") С‚Р–Рў TscWebSocket ws = tsc_ws_connect(STR_LIT("url"))
        if (init?.kind === 'New' && init.name === 'WebSocket' && ctx._stdWsImported) {
          const urlC = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          p(`TscWebSocket ${name} = tsc_ws_connect(${urlC});`);
          ctx.define(name, { ctype: 'TscWebSocket', varKind, _isWebSocket: true });
          return;
        }

        // new WebSocketServer() С‚Р–Рў TscWebSocketServer server = tsc_ws_server_create()
        if (init?.kind === 'New' && init.name === 'WebSocketServer' && ctx._stdWsImported) {
          p(`TscWebSocketServer ${name} = tsc_ws_server_create();`);
          ctx.define(name, { ctype: 'TscWebSocketServer', varKind, _isWsServer: true });
          return;
        }

        // new UDPSocket() С‚Р–Рў TscUdpSocket udp = tsc_udp_create()
        if (init?.kind === 'New' && init.name === 'UDPSocket' && ctx._stdNetImported) {
          p(`TscUdpSocket ${name} = tsc_udp_create();`);
          ctx.define(name, { ctype: 'TscUdpSocket', varKind, _isUdpSocket: true });
          return;
        }

        // new Tasks<N>() С‚Р–Рў Tasks_N typedef + cooperative scheduler support
        if (init?.kind === 'New' && init.name === 'Tasks') {
          if (ctx._cap('async') === 'libuv') {
            throw ctx.error(`TypeError: 'std/embedded' requires an embedded platform target or explicit @[embedded] annotation`);
          }
          ctx.includes.add('#include "std/embedded.h"');
          const nArg = init.typeArgs?.[0];
          const n = nArg?.kind === 'TypeLiteral' ? nArg.value : '1';
          const tasksType = `Tasks_${n}`;
          if (!ctx._emittedTasksTypedefs) {
            ctx._emittedTasksTypedefs = true;
            ctx.addTop('typedef void (*TaskPollFn)(void *state);');
            ctx.addTop('typedef struct { TaskPollFn fn; void *state; bool active; String name; } TscTask;');
          }
          if (!ctx._emittedTasksStructs.has(tasksType)) {
            ctx._emittedTasksStructs.add(tasksType);
            ctx.addTop(`typedef struct { TscTask _slots[${n}]; size_t _count; } ${tasksType};`);
            ctx.addTop('');
          }
          p(`${tasksType} ${name} = {0};`);
          ctx.define(name, { ctype: tasksType, varKind: 'let', _isTasks: true, _tasksN: n, _tasksType: tasksType });
          return;
        }

        // new Buffer(n) С‚Р–Рў stack-allocated uint8_t array + Buffer struct (stdlib, not user class)
        if (init?.kind === 'New' && init.name === 'Buffer' && !ctx.classes.has('Buffer')) {
          if (!ctx._emittedBufferTypeDef) {
            ctx._emittedBufferTypeDef = true;
            ctx.addTop('typedef struct { uint8_t *data; size_t length; } Buffer;');
            ctx.addTop('');
          }
          const n = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          const dataVar = `_${name}_data_${ctx._bufDataCount ?? 0}`;
          ctx._bufDataCount = (ctx._bufDataCount ?? 0) + 1;
          const bufQual = varKind === 'const' ? 'const ' : '';
          p(`uint8_t ${dataVar}[${n}] = {0};`);
          p(`${bufQual}Buffer ${name} = {.data = ${dataVar}, .length = ${n}};`);
          const bufCapInt = init.args?.[0]?.expr?.kind === 'Literal' ? parseInt(init.args[0].expr.value) : null;
          ctx.define(name, { ctype: 'Buffer', varKind, _isBuffer: true, _bufCap: bufCapInt });
          return;
        }

        // new DataView(buf) С‚Р–Рў DataView struct pointing to buf's data
        if (init?.kind === 'New' && init.name === 'DataView') {
          if (!ctx._emittedBufferTypeDef) {
            ctx._emittedBufferTypeDef = true;
            ctx.addTop('typedef struct { uint8_t *data; size_t length; } Buffer;');
            ctx.addTop('');
          }
          if (!ctx._emittedDataViewTypeDef) {
            ctx._emittedDataViewTypeDef = true;
            ctx.addTop('typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;');
            ctx.addTop('');
          }
          const _dvSrcName = init.args?.[0]?.expr?.kind === 'Ident' ? init.args[0].expr.name : null;
          const _dvSrcSym = _dvSrcName ? ctx.lookup(_dvSrcName) : null;
          const srcExpr = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'buf';
          const offsetExpr = init.args?.[1] ? ctx.exprToC(init.args[1].expr, lines, depth) : '0';
          const lengthExpr = init.args?.[2] ? ctx.exprToC(init.args[2].expr, lines, depth) : `${srcExpr}.length`;
          p(`DataView ${name} = {.data = ${srcExpr}.data, .byte_offset = (size_t)(${offsetExpr}), .byte_length = (size_t)(${lengthExpr})};`);
          ctx.define(name, { ctype: 'DataView', varKind: 'let', _isDataView: true, _dvCap: _dvSrcSym?._bufCap ?? null });
          return;
        }

        // new HashMap<K,V>(cap) С‚Р–Рў HashMap_K_V typedef + {.capacity = cap}
        if (init?.kind === 'New' && init.name === 'HashMap') {
          // Capacity overflow takes priority over platform error (detected by pre-scan)
          const _capViol = ctx._hmCapViolations?.get(name);
          if (_capViol) {
            const _n = _capViol.count;
            const _sfx = (_n % 10 === 1 && _n % 100 !== 11) ? 'st'
                       : (_n % 10 === 2 && _n % 100 !== 12) ? 'nd'
                       : (_n % 10 === 3 && _n % 100 !== 13) ? 'rd' : 'th';
            throw ctx.error(`RuntimeError: HashMap capacity exceeded: max ${_capViol.cap}, attempted to insert ${_n}${_sfx} entry`);
          }
          if (ctx._cap('async') === 'libuv') {
            throw ctx.error(`TypeError: 'std/embedded' requires an embedded platform target or explicit @[embedded] annotation`);
          }
          ctx.includes.add('#include "std/embedded.h"');
          const kArg = init.typeArgs?.[0];
          const vArg = init.typeArgs?.[1];
          const kCType = kArg ? ctx.resolveType(kArg) : 'String';
          const vCType = vArg ? ctx.resolveType(vArg) : 'int32_t';
          const kIdent = ctx.cTypeToIdent(kCType);
          const vIdent = ctx.cTypeToIdent(vCType);
          const suffix = `${kIdent}_${vIdent}`;
          const hmType = `HashMap_${suffix}`;
          const cap = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '8';
          if (!ctx._emittedHashMaps.has(hmType)) {
            ctx._emittedHashMaps.add(hmType);
            ctx.addTop(`typedef struct {`);
            ctx.addTop(`    ${kCType} keys[${cap}]; ${vCType} values[${cap}]; bool used[${cap}];`);
            ctx.addTop(`    size_t capacity; size_t count;`);
            ctx.addTop(`} ${hmType};`);
            ctx.addTop('');
          }
          p(`${hmType} ${name} = {.capacity = ${cap}};`);
          ctx.define(name, { ctype: hmType, varKind: 'let', _isHashMap: true,
            _hmSuffix: suffix, _hmCap: parseInt(cap) || 0, _hmKeyType: kCType, _hmValType: vCType });
          return;
        }

        // new Set<T>() / new Set<T>([...]) С‚Р–Рў TscSet_SUFFIX
        if (init?.kind === 'New' && init.name === 'Set') {
          if (ctx._strictRules?.has('no-dynamic-alloc')) {
            throw ctx.errorCode('E206', init, { detail: 'Set requires heap allocation' });
          }
          const tArg = init.typeArgs?.[0];
          const elemCType = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const suffix = ctx.cTypeToIdent(elemCType);
          const setType = `TscSet_${suffix}`;
          // never const in C С‚РђР¤ Set is a mutable struct
          p(`${setType} ${name} = tsc_set_create_${suffix}();`);
          const initArr = init.args?.[0]?.expr;
          if (initArr?.kind === 'ArrayLit') {
            for (const el of initArr.elems) {
              const ev = ctx.exprToC(el.expr, lines, depth);
              p(`tsc_set_add_${suffix}(&${name}, ${ev});`);
            }
          }
          ctx.define(name, { ctype: setType, varKind, _isSet: true, _setSuffix: suffix, _setElemCType: elemCType });
          return;
        }

        // new Blob([...]) С‚Р–Рў two variants:
        //   [int literals] С‚Р–Рў simple inline struct Blob {data, size, ?type}
        //   [bufVar], {type:...} С‚Р–Рў TscBlob via tsc_blob_create
        if (init?.kind === 'New' && init.name === 'Blob') {
          const firstArg = init.args?.[0]?.expr; // the array arg
          const secondArg = init.args?.[1]?.expr; // optional type arg
          const isArrayArg = firstArg?.kind === 'ArrayLit';
          const firstElem = isArrayArg ? firstArg?.elems?.[0]?.expr : undefined;
          const firstElemSym = firstElem?.kind === 'Ident' ? ctx.lookup(firstElem.name) : null;
          const isTscBlob = isArrayArg && firstElem && (firstElemSym?._isBuffer || firstElemSym?.ctype === 'Buffer');

          if (isTscBlob) {
            // TscBlob path: new Blob([buf], { type: "..." })
            ctx.includes.add('#include "std/blob.h"');
            const bufName = firstElem?.kind === 'Ident' ? firstElem.name : '';
            const bufSym = firstElemSym;
            const dataExpr = `${bufName}.data`;
            const lenExpr  = `${bufName}.length`;
            let typeStr = 'STR_LIT("")';
            if (secondArg?.kind === 'ObjLit') {
              const tp = secondArg.props?.find((p) => p.key === 'type');
              if (tp?.value?.kind === 'Literal') typeStr = `STR_LIT(${JSON.stringify(tp.value.value)})`;
            } else if (secondArg?.kind === 'Literal') {
              typeStr = `STR_LIT(${JSON.stringify(secondArg.value)})`;
            }
            p(`TscBlob ${name} = tsc_blob_create(${dataExpr}, ${lenExpr}, ${typeStr});`);
            ctx.define(name, { ctype: 'TscBlob', varKind: 'let', _isTscBlob: true });
          } else {
            // Simple inline Blob: new Blob([int, int, ...], ?typeStr)
            const elems = firstArg?.kind === 'ArrayLit'
              ? firstArg.elems.map((e: { expr: Expression }) => ctx.exprToC(e.expr, lines, depth))
              : [];
            const hasType = secondArg != null;
            const blobN = ctx._blobDataCount = (ctx._blobDataCount ?? 0); ctx._blobDataCount++;
            const dataVar = `_blob_data_${blobN}`;
            // Emit typedef
            const typedefBody = hasType
              ? 'typedef struct { uint8_t *data; size_t size; String type; } Blob;'
              : 'typedef struct { uint8_t *data; size_t size; } Blob;';
            if (!ctx._emittedBlobTypeDef) {
              ctx._emittedBlobTypeDef = typedefBody;
              ctx.addTop(typedefBody);
              ctx.addTop('');
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
            ctx.define(name, { ctype: 'Blob', varKind, _isBlob: true, _blobCap: elems.length, _hasType: hasType });
          }
          return;
        }

        // new URL(str) or new URL(path, base) С‚Р–Рў TscURL + tsc_url_parse / tsc_url_parse_relative
        if (init?.kind === 'New' && init.name === 'URL') {
          ctx.includes.add('#include "std/url.h"');
          const firstArg = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          if (init.args?.length >= 2) {
            const baseArg = init.args[1] ? ctx.exprToC(init.args[1].expr, lines, depth) : 'NULL';
            p(`TscURL ${name} = tsc_url_parse_relative(${firstArg}, &${baseArg});`);
          } else {
            p(`TscURL ${name} = tsc_url_parse(${firstArg});`);
          }
          ctx.define(name, { ctype: 'TscURL', varKind: 'let', _isURL: true });
          ctx._registerCleanup(`tsc_url_free(&${name})`);
          return;
        }

        // new URLSearchParams(str) С‚Р–Рў TscURLSearchParams + tsc_search_params_parse
        if (init?.kind === 'New' && init.name === 'URLSearchParams') {
          ctx.includes.add('#include "std/url.h"');
          const strArg = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          p(`TscURLSearchParams ${name} = tsc_search_params_parse(${strArg});`);
          ctx.define(name, { ctype: 'TscURLSearchParams', varKind: 'let', _isURLSearchParams: true });
          ctx._registerCleanup(`tsc_search_params_free(&${name})`);
          return;
        }

        // new Regex(pattern) С‚Р–Рў TscRegex + tsc_regex_compile
        if (init?.kind === 'New' && init.name === 'Regex') {
          ctx.includes.add('#include "std/regex.h"');
          const patternC = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'STR_LIT("")';
          p(`TscRegex ${name} = tsc_regex_compile(${patternC});`);
          ctx.define(name, { ctype: 'TscRegex', varKind: 'let', _isRegex: true });
          ctx._registerCleanup(`tsc_regex_free(&${name})`);
          return;
        }

        // new Random(seed) С‚Р–Рў tsc_random_seed (TscRandom typedef is in runtime.h)
        if (init?.kind === 'New' && init.name === 'Random') {
          const seedC = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`TscRandom ${name} = tsc_random_seed(${seedC});`);
          ctx.define(name, { ctype: 'TscRandom', varKind: 'let', _isRandom: true });
          return;
        }

        // new SecureRandom() С‚Р–Рў error on embedded targets
        if (init?.kind === 'New' && init.name === 'SecureRandom') {
          if (ctx._cap('os') === false) {
            throw ctx.error(`"SecureRandom" is not available on embedded targets`);
          }
          if (!ctx._emittedTscSecureRandomDef) {
            ctx._emittedTscSecureRandomDef = true;
            ctx.addTop('typedef struct { int _fd; } TscSecureRandom;');
            ctx.addTop('');
          }
          p(`TscSecureRandom ${name} = tsc_secure_random_create();`);
          ctx.define(name, { ctype: 'TscSecureRandom', varKind: 'let', _isSecureRandom: true });
          return;
        }

        // new AsyncMutex() С‚Р–Рў TscAsyncMutex
        if (init?.kind === 'New' && init.name === 'AsyncMutex') {
          p(`TscAsyncMutex ${name} = tsc_async_mutex_create();`);
          ctx.define(name, { ctype: 'TscAsyncMutex', varKind });
          return;
        }

        // new AbortController() С‚Р–Рў TscAbortController
        if (init?.kind === 'New' && init.name === 'AbortController') {
          p(`TscAbortController ${name} = tsc_abort_controller_create();`);
          ctx.define(name, { ctype: 'TscAbortController', varKind });
          ctx._registerCleanup(`tsc_abort_controller_free(&${name})`);
          return;
        }

        // new Channel<T>(cap) С‚Р–Рў Channel_T typedef + tsc_channel_create_T
        if (init?.kind === 'New' && init.name === 'Channel') {
          const tArg = init.typeArgs?.[0];
          const innerCtype = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const ident = ctx.cTypeToIdent(innerCtype);
          const chanType = `Channel_${ident}`;
          if (!ctx._emittedChannelTypes.has(chanType)) {
            ctx._emittedChannelTypes.add(chanType);
            ctx.addTop(`typedef struct { TscChannel_${ident} *_inner; } ${chanType};`);
            ctx.addTop('');
          }
          const capC = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : '0';
          p(`${chanType} ${name} = { ._inner = tsc_channel_create_${ident}(${capC}) };`);
          ctx.define(name, { ctype: chanType, varKind, _isChannel: true, _channelInner: innerCtype, _channelIdent: ident });
          ctx._registerCleanup(`tsc_channel_release_${ident}(${name}._inner)`);
          return;
        }

        // new Arc<T>() С‚Р–Рў arc alloc
        if (!typeAnn && init?.kind === 'New' && init.name === 'Arc') {
          const tArg = init.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            if (ctx._allocatorName === 'static') {
              throw ctx.error(`TypeError: 'new Arc<${innerType}>()' requires heap allocation (ARC), which is unavailable when allocator is "${ctx._allocatorName}"`);
            }
            p(`${innerType} *${name} = tsc_arc_alloc(sizeof(${innerType}));`);
            ctx.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isArc: true, derefType: innerType });
            const sFields = ctx._getStringFields(innerType);
            if (sFields.length > 0) {
              ctx._ensureClassFree(innerType);
              const freeFn = ctx.classes.get(innerType)?._classFreeFn;
              if (freeFn) ctx._registerCleanup(`${freeFn}(${name}); tsc_arc_release(${name})`);
              else ctx._registerCleanup(`tsc_arc_release(${name})`);
            } else {
              ctx._registerCleanup(`tsc_arc_release(${name})`);
            }
            return;
          }
        }

        // new Weak<T>(src) С‚Р–Рў weak create
        if (!typeAnn && init?.kind === 'New' && init.name === 'Weak') {
          const tArg = init.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            const argC = init.args?.[0] ? ctx.exprToC(init.args[0].expr, lines, depth) : 'NULL';
            p(`${innerType} *${name} = tsc_weak_create(${argC});`);
            ctx.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isWeak: true, derefType: innerType });
            ctx._registerCleanup(`tsc_weak_release(${name})`);
            return;
          }
        }

        // let w: Weak<T>; without init в†’ NULL-init weak pointer
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Weak' && !init) {
          const tArg = typeAnn.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            p(`${innerType} *${name} = NULL;`);
            ctx.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isWeak: true, derefType: innerType });
            ctx._registerCleanup(`tsc_weak_release(${name})`);
            return;
          }
        }

        // Borrow check: Arc<T> requires a heap allocator
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Arc' && ctx._allocatorName === 'static') {
          throw ctx.error(`"Arc<T>" requires a heap allocator; "${ctx._allocatorName}" allocator does not support ARC`);
        }

        // let x: Arc<T> = new T() С‚Р–Рў arc alloc with explicit field init
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Arc' && init?.kind === 'New' && init.name !== 'Arc') {
          const tArg = typeAnn.typeArgs?.[0];
          if (tArg?.kind === 'TypeRef') {
            const innerType = tArg.name;
            const structDef = ctx.classes.get(innerType);
            p(`${innerType} *${name} = tsc_arc_alloc(sizeof(${innerType}));`);
            if (structDef?.fields) {
              for (const f of structDef.fields) {
                const fname = typeof f === 'string' ? f : f.name;
                p(`${name}->${fname} = 0;`);
              }
            }
            ctx.define(name, { ctype: `${innerType} *`, varKind, isPointer: true, isArc: true, derefType: innerType });
            ctx._registerCleanup(`tsc_arc_release(${name})`);
            return;
          }
        }

        // w.upgrade() С‚Р–Рў weak upgrade (result needs arc_release inside null-check)
        if (!typeAnn && init?.kind === 'Call' &&
            init.callee?.kind === 'Member' && init.callee.prop === 'upgrade') {
          const weakSym2 = init.callee.object?.kind === 'Ident' ? ctx.lookup(init.callee.object.name) : null;
          if (weakSym2?.isWeak) {
            const innerType2 = weakSym2.derefType;
            ctx._inWeakUpgrade = true;
            const weakC2 = ctx.exprToC(init.callee.object, lines, depth);
            ctx._inWeakUpgrade = false;
            p(`${innerType2} *${name} = tsc_weak_upgrade(${weakC2});`);
            ctx.define(name, { ctype: `${innerType2} *`, varKind, isPointer: true, isArcUpgrade: true, derefType: innerType2 });
            return;
          }
        }

        // let b = a where a is Arc С‚Р–Рў arc retain
        if (!typeAnn && init?.kind === 'Ident') {
          const initSym3 = ctx.lookup(init.name);
          if (initSym3?.isArc) {
            const innerType3 = initSym3.derefType;
            p(`${innerType3} *${name} = tsc_arc_retain(${init.name});`);
            ctx.define(name, { ctype: `${innerType3} *`, varKind, isPointer: true, isArc: true, derefType: innerType3 });
            ctx._registerCleanup(`tsc_arc_release(${name})`);
            return;
          }
        }

        // Promise.resolve(expr) С‚Р–Рў Promise_T typedef + struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Promise' &&
            init.callee.prop === 'resolve') {
          const arg = init.args?.[0]?.expr;
          const innerType = arg ? ctx.inferType(arg) : 'int32_t';
          const typeIdent = ctx.cTypeToIdent(innerType);
          const promiseType = `Promise_${typeIdent}`;
          ctx._emitPromiseTypedef(promiseType, innerType);
          const argC = arg ? ctx.exprToC(arg, lines, depth) : '0';
          p(`${promiseType} ${name} = { ._done = true, ._result = ${argC}, ._ok = true };`);
          ctx.define(name, { ctype: promiseType, varKind });
          return;
        }

        // Promise.reject<T>(error) С‚Р–Рў Promise_T_E typedef + rejected struct
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee.object?.kind === 'Ident' && init.callee.object.name === 'Promise' &&
            init.callee.prop === 'reject') {
          const tArg = init.typeArgs?.[0];
          const innerType = tArg ? ctx.resolveType(tArg) : 'int32_t';
          const typeIdent = ctx.cTypeToIdent(innerType);
          const errArg = init.args?.[0]?.expr;
          const errType = errArg ? ctx.inferType(errArg) : 'TscError';
          const promiseType = `Promise_${typeIdent}_${errType}`;
          if (!ctx._emittedPromiseTypes.has(promiseType)) {
            ctx._emittedPromiseTypes.add(promiseType);
            ctx._topBlank();
            ctx.topLevel.push(`typedef struct { bool _done; ${innerType} _result; bool _ok; ${errType} _error; } ${promiseType};`);
          }
          const errC = errArg ? ctx.exprToC(errArg, lines, depth) : '0';
          p(`${promiseType} ${name} = { ._done = true, ._ok = false, ._error = ${errC} };`);
          ctx.define(name, { ctype: promiseType, varKind });
          return;
        }

        // new Promise<T>((resolve, reject) => { ... }) С‚Р–Рў static resolve/reject pattern
        if (init?.kind === 'New' && init.name === 'Promise' && (init.typeArgs?.length ?? 0) > 0) {
          const tArg = init.typeArgs![0];
          const innerType = ctx.resolveType(tArg);
          const typeIdent = ctx.cTypeToIdent(innerType);
          const promiseType = `Promise_${typeIdent}`;
          ctx._emitPromiseTypedef(promiseType, innerType);
          const lambda = init.args?.[0]?.expr;
          const lambdaIdx = ctx.lambdaCount++;
          const prefix = `_lambda_${lambdaIdx}`;
          const resolveName = (lambda?.kind === 'Arrow' || lambda?.kind === 'FuncExpr') ? (lambda.params?.[0]?.name ?? 'resolve') : 'resolve';
          const rejectName = (lambda?.kind === 'Arrow' || lambda?.kind === 'FuncExpr') ? (lambda.params?.[1]?.name ?? 'reject') : 'reject';
          ctx._topBlank();
          ctx.topLevel.push(`static ${innerType} ${prefix}_${typeIdent}_result = 0;`);
          ctx.topLevel.push(`static bool ${prefix}_done = false;`);
          ctx._topBlank();
          ctx.topLevel.push(`static void ${prefix}_resolve(${innerType} v) { ${prefix}_${typeIdent}_result = v; ${prefix}_done = true; }`);
          ctx.topLevel.push(`static void ${prefix}_reject(void) { ${prefix}_done = true; }`);
          ctx.pushScope();
          ctx.define(resolveName, { ctype: 'void', funcName: `${prefix}_resolve`, varKind: 'let' });
          ctx.define(rejectName, { ctype: 'void', funcName: `${prefix}_reject`, varKind: 'let' });
          const lambdaBody = (lambda?.kind === 'Arrow' || lambda?.kind === 'FuncExpr') ? lambda.body : null;
          for (const s of (lambdaBody?.kind === 'Block' ? lambdaBody.body : [])) ctx.visitStmt(s, lines, depth);
          ctx.popScope();
          p(`${promiseType} ${name} = { ._done = ${prefix}_done, ._result = ${prefix}_${typeIdent}_result, ._ok = true };`);
          ctx.define(name, { ctype: promiseType, varKind });
          return;
        }

        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'never') {
          throw ctx.errorCode('E106', null, { detail: '"never" cannot be used as a variable type' });
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'void') {
          throw ctx.errorCode('E106', null, { detail: '"void" can only be used as a return type' });
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Arc' && ctx._allocatorName === 'static') {
          throw ctx.error(`"Arc<T>" requires a heap allocator; "${ctx._allocatorName}" allocator does not support ARC`);
        }
        // Fat-pointer assignment: let x: Interface = (new Foo() as Interface) or (new Foo())
        if (typeAnn?.kind === 'TypeRef' && ctx.interfaces.has(typeAnn.name)) {
          const ifaceName = typeAnn.name;
          // Unwrap `as Interface` cast if present
          const innerInit = (init?.kind === 'Cast' &&
            init.castType?.kind === 'TypeRef' && init.castType.name === ifaceName)
            ? init.expr : init;
          // new Foo() С‚Р–Рў create temp var, then fat-ptr
          if (innerInit?.kind === 'New' && ctx.classes.has(innerInit.name) && !ctx.interfaces.has(innerInit.name)) {
            const className = innerInit.name;
            const classDef = ctx.classes.get(className);
            const tempName = `_${innerInit.name.toLowerCase()}_${ctx.tempCount++}`;
            const initC = ctx.exprToC(innerInit, lines, depth);
            p(`${className} ${tempName} = ${initC};`);
            ctx.define(tempName, { ctype: className, varKind: 'let' });
            const hasExplicit = classDef?.implements_?.some((impl: TypeRef | string) => (typeof impl === 'string' ? impl : impl.name) === ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) ctx._ensureImplicitVtable(className, ifaceName);
            p(`${ifaceName} ${name} = { .self = &${tempName}, .vtable = &${vtableName} };`);
            ctx.define(name, { ctype: ifaceName, varKind });
            return;
          }
        }
        // Fat-pointer assignment: let x: Interface = concreteVar  OR  let x: Interface = (concreteVar as Interface)
        if (typeAnn?.kind === 'TypeRef' && ctx.interfaces.has(typeAnn.name)) {
          const ifaceName = typeAnn.name;
          // Unwrap cast: (concreteVar as Interface) С‚Р–Рў concreteVar
          const innerInit2 = (init?.kind === 'Cast' && init.castType?.kind === 'TypeRef' && init.castType.name === ifaceName) ? init.expr : init;
          if (innerInit2?.kind !== 'Ident') { /* fall through */ }
          else {
          const argName = innerInit2.name;
          const argSym = ctx.lookup(argName);
          if (argSym && argSym.ctype && !ctx.interfaces.has(argSym.ctype)) {
            const argClass = ctx.classes.get(argSym.ctype);
            if (argClass) {
            const className = argSym.ctype;
            const hasExplicit = argClass.implements_?.some((impl: TypeRef | string) => (typeof impl === 'string' ? impl : impl.name) === ifaceName);
            const vtableName = hasExplicit
              ? `${className}_${ifaceName}_vtable`
              : `_${className}_${ifaceName}_vtable`;
            if (!hasExplicit) ctx._ensureImplicitVtable(className, ifaceName);
            p(`${ifaceName} ${name} = {.self = &${argName}, .vtable = &${vtableName}};`);
            ctx.define(name, { ctype: ifaceName, varKind });
            return;
            }
          }
          } // end if innerInit2?.kind === 'Ident'
        }
        let ctype = typeAnn ? ctx.resolveType(typeAnn) : (init ? ctx.inferType(init) : 'double');
        if (ctype === 'String *' && init?.kind === 'Ident') {
          const initSym = ctx.lookup(init.name);
          if (initSym?.isRefParam && initSym?.derefType === 'String') ctype = 'String';
        }
        // Reading a volatile variable into a local gives a plain (non-volatile) type
        if (!typeAnn && ctype.startsWith('volatile ')) ctype = ctype.slice('volatile '.length);
        if (!typeAnn && init && init.kind === 'Literal' && init.litType === 'number') {
          ctype = ctx._tsNameToCType(ctx._defaultNumber);
        }
        // ObjLit with named fields and no type annotation С‚Р–Рў defer as individual consts (expanded at destructuring)
        if (!typeAnn && init?.kind === 'ObjLit' && init.props?.length > 0 && init.props.every((p) => !p.spread && !p.computed)) {
          for (const p of init.props) {
            if (p.value) ctx._checkNoBareThrows(p.value);
          }
          const anonName = `_anon_${ctx._anonStructCount++}`;
          const fields = init.props.map((p) => {
            const ft = ctx.inferType(p.value);
            return { name: typeof p.key === 'string' ? p.key : '', typeAnn: { kind: 'TypeRef' as const, name: ft, typeArgs: [] }, _ctype: ft };
          });
          // Defer emission: don't create typedef or variable yet С‚РђР¤ expand at destructuring time
          ctx._deferredAnons.set(name, { fields, init });
          ctx.define(name, { ctype: anonName, varKind, initNode: init, deferredAnon: true });
          ctx.classes.set(anonName, { isStruct: true, fields });
          return;
        }
        // Regular (non-const) enums, opt types, and structs don't use const qualifier in C
        const enumDef2 = ctx.classes.get(ctype);
        const isGenericClassInst = !enumDef2 && ctx._genericClasses &&
          [...ctx._genericClasses.keys()].some((n: string) => ctype.startsWith(n + '_'));
        // opt_ types suppress const only when inferred (no type annotation); with explicit T|null annotation, keep const
        const suppressConst = (enumDef2?.isEnum && !enumDef2?.isConst && !enumDef2?.isStringLiteralUnion) || enumDef2?.isKeyOf || enumDef2?.isMutable || enumDef2?.isStruct || (ctype.startsWith('opt_') && !typeAnn) || ctype.startsWith('_anon_') || ctype === 'Slice_u8' || (enumDef2 && !enumDef2.isEnum && !enumDef2.isStruct && !enumDef2.isScalarAlias && !enumDef2.isTuple) || isGenericClassInst || ctype.startsWith('volatile ') || ctype === 'Date';
        const qualifier = (varKind === 'const' && !suppressConst) ? 'const ' : '';

        // Optional type (opt_T): handle null/value init
        if (ctype.startsWith('opt_') && init) {
          const isNullInit = init.kind === 'Literal' && init.litType === 'null';
          if (isNullInit) {
            p(`${qualifier}${ctype} ${name} = {false, 0};`);
          } else {
            const valC = ctx.exprToC(init, lines, depth);
            // If init already evaluates to opt_T (e.g., from x?.toString()), assign directly
            const initType = ctx.inferType(init);
            if (initType === ctype) {
              p(`${qualifier}${ctype} ${name} = ${valC};`);
            } else {
              p(`${qualifier}${ctype} ${name} = {true, ${valC}};`);
            }
          }
          // Non-negative at() index: mark as potentially OOB (null check when printing)
          // Must be read AFTER exprToC(init) which sets _lastAtNonNeg / _lastPopEmpty / _lastOptIsNull
          const atNonNeg = ctx._lastAtNonNeg ?? false;
          ctx._lastAtNonNeg = undefined;
          const emptyPop = ctx._lastPopEmpty ?? false;
          ctx._lastPopEmpty = undefined;
          const parsedNull = ctx._lastOptIsNull ?? false;
          ctx._lastOptIsNull = undefined;
          ctx.define(name, { ctype, varKind, optIsNull: isNullInit || atNonNeg || emptyPop || parsedNull });
          // Track pool vars for auto-drop at block exit
          if (ctype?.startsWith('opt_ref_') && ctx._currentBlockPoolVars) {
            const _pcls2 = ctype.slice(8);
            if (ctx.classes.get(_pcls2)?._isPool) {
              ctx._currentBlockPoolVars.push({ name, className: _pcls2 });
            }
          }
          // Heap vars are auto-registered in define()
          // Move semantics for pool refs: mark source moved and zero out
          if (ctype?.startsWith('opt_ref_') && init?.kind === 'Ident') {
            const initSym2 = ctx.lookup(init.name);
            if (initSym2) {
              initSym2._moved = true;
              initSym2._movedLine = node.line;
              initSym2._movedSourceNode = init;
            }
            if (initSym2?.varKind === 'let') {
              p(`${init.name} = (${ctype}){0};`);
            }
          }
          if (ctx._lastHalRead) { p(`(void)${name};`); ctx._lastHalRead = null; }
          return;
        }

        // Move semantics for heap pointers: mark source moved and zero out
        if (ctype?.endsWith(' *') && init?.kind === 'Ident' && ctx.classes.get(ctype.slice(0, -2))?._isHeap) {
          const initSym3 = ctx.lookup(init.name);
          if (initSym3?._moved) {
            throw ctx.errorCode('E002', init, { name: init.name });
          }
          if (initSym3) {
            initSym3._moved = true;
            initSym3._movedLine = node.line;
            initSym3._movedSourceNode = init;
          }
          if (initSym3?.varKind === 'let') {
            p(`${init.name} = NULL;`);
          }
        }

        // String literal union: handle string literal init С‚Р–Рў enum value
        if (enumDef2?.isStringLiteralUnion && init?.kind === 'Literal' && init.litType === 'string') {
          const val = init.value;
          if (!(enumDef2.members as string[] | undefined)?.includes(val)) {
            throw ctx.errorCode('E114', null, { value: val, type: ctype });
          }
          p(`${qualifier}${ctype} ${name} = ${ctype}_${val};`);
          ctx.define(name, { ctype, varKind });
          return;
        }

        // TypeFixedArray С‚Р–Рў C stack array: int32_t arr[N] = {elems}
        if (typeAnn?.kind === 'TypeFixedArray') {
          const et = ctx.resolveType(typeAnn.element);
          const size = typeAnn.size;
          if (init?.kind === 'ArrayLit') {
            const elems = ctx.arrayLitToC(init, et, lines, depth);
            if (elems.length === 1) {
              // Single-element: C fill/zero-init shorthand (e.g. [0] С‚Р–Рў {0})
              p(`${et} ${name}[${size}] = {${elems[0]}};`);
            } else if (elems.length !== size) {
              throw ctx.errorCode('E113', null, { detail: `array literal has ${elems.length} elements but type ${ctx.ctypeToTsName(et)}[${size}] requires exactly ${size}` });
            } else {
              p(`${et} ${name}[${size}] = {${elems.join(', ')}};`);
            }
          } else if (init) {
            const initC = ctx.exprToC(init, lines, depth);
            p(`${et} ${name}[${size}] = ${initC};`);
          } else {
            p(`${et} ${name}[${size}] = {0};`);
          }
          ctx.define(name, { ctype: et, isArray: true, arraySize: size, isFixedArray: true, varKind });
          return;
        }

        // TypeArray С‚Р–Рў managed Array_T struct
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind !== 'TypeFunc') {
          const et = ctx.resolveType(typeAnn.element);
          const arrName = `Array_${ctx.cTypeToIdent(et)}`;
          ctx._ensureArrayStruct(arrName, et);
          const elemIdent = ctx.cTypeToIdent(et);

          // new T[N] С‚Р–Рў stack array + Array_T struct
          if (init?.kind === 'New' && init.arraySize != null) {
            const nC = ctx.exprToC(init.arraySize, lines, depth);
            const dataVar = `_buf_data_${ctx._bufDataCount ?? 0}`;
            ctx._bufDataCount = (ctx._bufDataCount ?? 0) + 1;
            p(`${et} ${dataVar}[${nC}] = {0};`);
            p(`${arrName} ${name} = {.data = ${dataVar}, .length = ${nC}, .capacity = ${nC}};`);
            ctx.define(name, { ctype: arrName, elemType: elemIdent, arrElemCType: et, isArray: true, varKind });
            return;
          }
          if (!init || (init.kind === 'ArrayLit' && init.elems.length === 0)) {
            // Empty array literal or no init
            p(`${qualifier}${arrName} ${name} = {.data = NULL, .length = 0, .capacity = 0};`);
          } else if (init.kind === 'ArrayLit') {
            const litVar = `_lit_${ctx.tempCount++}`;
            ctx._expectedType = et?.startsWith('Array_') ? et : null;
            const elems = ctx.arrayLitToC(init, et, lines, depth);
            ctx._expectedType = null;
            p(`${et} ${litVar}[] = {${elems.join(', ')}};`);
            p(`${qualifier}${arrName} ${name} = {.data = ${litVar}, .length = ${elems.length}, .capacity = ${elems.length}};`);
          } else {
            ctx._expectedType = arrName;
            ctx._newArrayElemHint = et;
            const initC = ctx.exprToC(init, lines, depth);
            ctx._newArrayElemHint = null;
            ctx._expectedType = null;
            if (ctx._gotoCleanupPreDecls?.has(name)) {
              p(`${name} = ${initC};`);
            } else {
              p(`${qualifier}${arrName} ${name} = ${initC};`);
            }
            // Register cleanup if heap-allocated (new Array or method returning new array)
            if (HEAP_ARRAY_KEYWORDS.some((k: string) => initC.includes(k))) {
              ctx._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
            }
          }
          ctx.define(name, { ctype: arrName, elemType: elemIdent, arrElemCType: et, isArray: true,
                              arraySize: init?.kind === 'ArrayLit' ? ctx.arrayLitSize(init) : undefined, varKind,
                              initNode: init?.kind === 'ArrayLit' ? init : undefined });
          return;
        }

        // Inferred Array_T type (no typeAnn, e.g. result of arr.filter/map/concat/slice)
        // Exclude pointer types (Array_T * = Ref/Mut<Array<T>>) which need different handling
        if (!typeAnn && ctype?.startsWith('Array_') && !ctype.endsWith(' *') && init) {
          if (ctype.startsWith('Array_ref_')) {
            const initC = ctx.exprToC(init, lines, depth);
            const qualifier = varKind === 'const' ? 'const ' : '';
            p(`${qualifier}${ctype} ${name} = ${initC};`);
            ctx.define(name, { ctype, varKind });
            return;
          }
          if (ctype.startsWith('Array_Tuple_')) {
            const initC = ctx.exprToC(init, lines, depth);
            const qualifier = varKind === 'const' ? 'const ' : '';
            p(`${qualifier}${ctype} ${name} = ${initC};`);
            ctx.define(name, { ctype, varKind });
            return;
          }
          const elemIdent = ctype.slice(6); // Array_i32 С‚Р–Рў i32
          const etC2 = ctx._arrIdentToCType(elemIdent);
          ctx._ensureArrayStruct(ctype, etC2);
          const initC = ctx.exprToC(init, lines, depth);
          const isHeap = HEAP_ARRAY_KEYWORDS.some((k: string) => initC.includes(k));
          const suppressConst2 = ctx._lastSuppressConst;
          ctx._lastSuppressConst = undefined;
          if (isHeap) {
            p(`${ctype} ${name} = ${initC};`);
            ctx._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
          } else {
            const effQual2 = suppressConst2 ? '' : qualifier;
            p(`${ctx.varDecl(effQual2, ctype, name)} = ${initC};`);
          }
          ctx.define(name, { ctype, elemType: elemIdent, arrElemCType: etC2, isArray: true, varKind });
          if (ctx._lastHalRead) { p(`(void)${name};`); ctx._lastHalRead = null; }
          return;
        }

        // Tuple init: let pair: [i32, string] = [1, "hello"] С‚Р–Рў struct init
        {
          const tupleDef1 = ctx.classes.get(ctype);
          if (tupleDef1?.isTuple && init?.kind === 'ArrayLit') {
            const tfields = tupleDef1.fields!;
            const initParts: string[] = [];
            let fieldIdx = 0;
            for (const el of init.elems) {
              if (el.spread) {
                // spread: [...p] С‚Р–Рў copy all fields
                const spreadSrc = ctx.exprToC(el.expr, lines, depth);
                const srcType = ctx.inferType(el.expr);
                const srcDef = ctx.classes.get(srcType);
                const tupleHasRest = tfields.some((f) => f.rest);
                if (!srcDef?.isTuple && !tupleHasRest) {
                  throw ctx.errorCode('E113', null, { detail: 'cannot spread runtime array into fixed-size tuple' });
                }
                if (srcDef?.isTuple) {
                  for (const f of srcDef.fields!) {
                    initParts.push(`.${tfields[fieldIdx].name} = ${spreadSrc}.${f.name}`);
                    fieldIdx++;
                  }
                }
                continue;
              }
              const field = tfields[fieldIdx++];
              if (!field) continue;
              // Rest field: collect remaining elems into a temp array
              if (field.rest) {
                const tailElems = [el, ...init.elems.slice(init.elems.indexOf(el) + 1)];
                const tailVar = `_tail_${ctx.tempCount++}`;
                const tailVals = tailElems.map((e: { expr: Expression }) => ctx.exprToC(e.expr, lines, depth)).join(', ');
                lines.push(`${field.elemType} ${tailVar}[] = {${tailVals}};`);
                initParts.push(`.${field.name} = ${tailVar}`);
                // Skip tail_len field С‚РђР¤ add length directly
                fieldIdx++; // skip _tail_len field
                initParts.push(`._tail_len = ${tailElems.length}`);
                break; // rest consumes all remaining elements
              }
              const valC = ctx.exprToC(el.expr, lines, depth);
              // Optional field: wrap non-opt value in {true, val}
              if (field.ctype?.startsWith('opt_')) {
                const valType = ctx.inferType(el.expr);
                const initVal = (valType === field.ctype) ? valC : `{true, ${valC}}`;
                initParts.push(`.${field.name} = ${initVal}`);
              } else {
                initParts.push(`.${field.name} = ${valC}`);
              }
            }
            // Fill remaining optional fields with {false, 0}
            while (fieldIdx < tfields.length) {
              const field = tfields[fieldIdx++];
              if (field.ctype?.startsWith('opt_')) initParts.push(`.${field.name} = {false, 0}`);
            }
            p(`${qualifier}${ctype} ${name} = {${initParts.join(', ')}};`);
            // Track which optional fields were not provided (null)
            const nullOptFields = new Set();
            for (let i = init.elems.length; i < tfields.length; i++) {
              const f = tfields[i];
              if (f.ctype?.startsWith('opt_')) nullOptFields.add(f.name);
            }
            ctx.define(name, { ctype, varKind, nullOptFields: nullOptFields.size > 0 ? nullOptFields : null });
            return;
          }
        }

        // unknown type: pack value into tsc_unknown container
        if (ctype === 'tsc_unknown' && init) {
          ctx._ensureUnknownStruct();
          const initCtype = ctx.inferType(init);
          const initC = ctx.exprToC(init, lines, depth);
          if (initCtype === 'tsc_unknown') {
            p(`${qualifier}tsc_unknown ${name} = ${initC};`);
          } else {
            const packer = ctx._unknownPackerFor(initCtype);
            p(`${qualifier}tsc_unknown ${name} = ${packer}(${initC});`);
          }
          ctx.define(name, { ctype: 'tsc_unknown', varKind });
          ctx._registerCleanup(`tsc_unknown_drop(&${name})`);
          return;
        }
        if (ctype === 'tsc_unknown' && !init) {
          ctx._ensureUnknownStruct();
          p(`${qualifier}tsc_unknown ${name} = {0};`);
          ctx.define(name, { ctype: 'tsc_unknown', varKind });
          return;
        }

        // TypeFunc: single closure variable
        if (typeAnn?.kind === 'TypeFunc') {
          if (ctx._strictRules?.has('no-closures')) {
            throw ctx.errorCode('E200', node);
          }
          const _closureParamCtypes = (typeAnn.params ?? []).map((p: TypeAnn) => ctx.resolveType(p));
          let initC: string;
          if (init?.kind === 'Arrow' || init?.kind === 'FuncExpr') {
            // Pre-declare for recursion support (before hoistClosure compiles body)
            const _pfx1 = ctx._modulePrefix ?? '';
            const _predFnName = `${_pfx1}_closure_${ctx.closureCount}_fn`;
            ctx.define(name, { ctype: 'tsc_closure', isClosure: true, _isRecursiveSelf: true, _closureFnName: _predFnName, varKind });
            const closure = ctx.hoistClosure(init, name);
            if (closure) {
              if (closure.retainLines?.length) {
                for (const rl of closure.retainLines) p(rl);
              }
              p(`${closure.envName} *${name}_env = tsc_malloc(sizeof(${closure.envName}));`);
              p(`*${name}_env = (${closure.envName})${closure.envInit};`);
              p(`tsc_closure ${name} = {.env = ${name}_env, .fn = (void*)${closure.fnName}};`);
              ctx.define(name, { ctype: 'tsc_closure', isClosure: true, closureRetType: closure.ret, closureParamTypes: _closureParamCtypes, varKind, _closureEnvName: `${name}_env`, _closureFnName: closure.fnName,
                                  closureDestroyFn: closure.destroyFnName });
              ctx._registerCleanup(`${closure.destroyFnName}(${name}_env)`);
              return;
            }
            // Non-capturing: update pre-declared symbol for lambda path
            const _selfSym = ctx.lookup(name);
            if (_selfSym) {
              _selfSym.isClosure = false;
              _selfSym.funcPtr = true;
              const _predRet = init.returnType ? ctx.resolveType(init.returnType) : ctx.inferArrowReturn(init);
              _selfSym._closureFnName = `${_pfx1}_lambda_${ctx.lambdaCount}_${ctx.cTypeToIdent(_predRet)}`;
            }
            const lambdaName = ctx.hoistArrow(init, 'void', name);
            const lambdaRet = ctx.inferArrowReturn(init);
            p(`tsc_closure ${name} = {.env = NULL, .fn = (void*)${lambdaName}};`);
            ctx.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, closureRetType: lambdaRet, closureParamTypes: _closureParamCtypes });
            return;
          } else {
            const initSym = init?.kind === 'Ident' ? ctx.lookup(init.name) : null;
            if (initSym?.funcName) {
              initC = `(tsc_closure){.env = NULL, .fn = (void*)${initSym.funcName}}`;
              p(`tsc_closure ${name} = ${initC};`);
              ctx.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, closureRetType: initSym.ctype, closureParamTypes: _closureParamCtypes, funcName: initSym.funcName });
              return;
            } else {
              initC = init ? ctx.exprToC(init, lines, depth) : '(tsc_closure){0}';
            }
          }
          p(`tsc_closure ${name} = ${initC};`);
          const _closureRetFromAnn = typeAnn.ret ? ctx.resolveType(typeAnn.ret) : 'void';
          let _initIsClosure = false;
          if (init?.kind === 'Call' && init.callee.kind === 'Ident') {
            const _callSym = ctx.lookup(init.callee.name);
            if (_callSym?._returnsCapturingClosure) _initIsClosure = true;
          }
          ctx.define(name, { ctype: 'tsc_closure', ...(_initIsClosure ? { isClosure: true } : { funcPtr: true }), varKind, closureRetType: _closureRetFromAnn, closureParamTypes: _closureParamCtypes });
          return;
        }

        // TypeArray of TypeFunc: array of closures
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind === 'TypeFunc') {
          const arrCtype = 'Array_tsc_closure';
          const _arrElemClosureParams = (typeAnn.element.params ?? []).map((p: TypeAnn) => ctx.resolveType(p));
          const _arrElemClosureRet = typeAnn.element.ret ? ctx.resolveType(typeAnn.element.ret) : undefined;
          ctx.addTop(`typedef struct { tsc_closure *data; size_t length; size_t capacity; } ${arrCtype};`);
          if (init?.kind === 'ArrayLit') {
            const elems = init.elems.map((e: { expr: Expression }) => {
              if (e.expr?.kind === 'Ident') {
                const s = ctx.lookup(e.expr.name);
                return s?.funcName ?? e.expr.name;
              }
              return ctx.exprToC(e.expr, lines, depth);
            });
            const litName = `_${name}_lit`;
            p(`tsc_closure ${litName}[] = {${elems.map((e: string) => `(tsc_closure){.env = NULL, .fn = (void*)${e}}`).join(', ')}};`);
            p(`${qualifier}${arrCtype} ${name} = {.data = ${litName}, .length = ${elems.length}, .capacity = ${elems.length}};`);
            ctx.define(name, { ctype: arrCtype, isArray: true, elemType: 'tsc_closure', arrElemCType: 'tsc_closure', arraySize: elems.length, varKind, _arrElemClosureParams, _arrElemClosureRet });
            return;
          }
          p(`${qualifier}${arrCtype} ${name} = {0};`);
          ctx.define(name, { ctype: arrCtype, isArray: true, elemType: 'tsc_closure', arrElemCType: 'tsc_closure', varKind, _arrElemClosureParams, _arrElemClosureRet });
          return;
        }

        if (init) {
          if (init.kind === 'Arrow' || init.kind === 'FuncExpr') {
            if (ctx._strictRules?.has('no-closures')) {
              throw ctx.errorCode('E200', node);
            }
            const _arrowParamCtypes = (init.params ?? []).map((p) => p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *');
            // Pre-declare for recursion support (before hoistClosure compiles body)
            const _pfx2 = ctx._modulePrefix ?? '';
            const _predFnName = `${_pfx2}_closure_${ctx.closureCount}_fn`;
            ctx.define(name, { ctype: 'tsc_closure', isClosure: true, _isRecursiveSelf: true, _closureFnName: _predFnName, varKind });
            const closure = ctx.hoistClosure(init, name);
            if (closure) {
              if (closure.retainLines?.length) {
                for (const rl of closure.retainLines) p(rl);
              }
              p(`${closure.envName} *${name}_env = tsc_malloc(sizeof(${closure.envName}));`);
              p(`*${name}_env = (${closure.envName})${closure.envInit};`);
              p(`tsc_closure ${name} = {.env = ${name}_env, .fn = (void*)${closure.fnName}};`);
              ctx.define(name, { ctype: 'tsc_closure', isClosure: true, closureRetType: closure.ret, closureParamTypes: _arrowParamCtypes, varKind, _closureEnvName: `${name}_env`, _closureFnName: closure.fnName,
                                  closureDestroyFn: closure.destroyFnName });
              ctx._registerCleanup(`${closure.destroyFnName}(${name}_env)`);
              return;
            }
            // Non-capturing: update pre-declared symbol for lambda path
            const _selfSym2 = ctx.lookup(name);
            if (_selfSym2) {
              _selfSym2.isClosure = false;
              _selfSym2.funcPtr = true;
              const _predRet2 = init.returnType ? ctx.resolveType(init.returnType) : ctx.inferArrowReturn(init);
              _selfSym2._closureFnName = `${_pfx2}_lambda_${ctx.lambdaCount}_${ctx.cTypeToIdent(_predRet2)}`;
            }
            const lambdaName = ctx.hoistArrow(init, 'void', name);
            const lambdaRet = ctx.inferArrowReturn(init);
            p(`tsc_closure ${name} = {.env = NULL, .fn = (void*)${lambdaName}};`);
            ctx.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, closureRetType: lambdaRet, closureParamTypes: _arrowParamCtypes });
            return;
          } else if (!typeAnn && init.kind === 'Ident') {
            const sym = ctx.lookup(init.name);
            if (sym?.funcName && sym?.params) {
              if (ctx._strictRules?.has('no-closures')) {
                throw ctx.errorCode('E200', node);
              }
              p(`tsc_closure ${name} = {.env = NULL, .fn = (void*)${sym.funcName}};`);
              ctx.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind, funcName: sym.funcName, closureRetType: sym.ctype,
                                  ...(sym.closureParamTypes ? { closureParamTypes: sym.closureParamTypes } :
                                    sym.params ? { closureParamTypes: sym.params.map((pp: { typeAnn?: TypeAnn }) => pp.typeAnn ? ctx.resolveType(pp.typeAnn) : 'void *') } : {}) });
              return;
            } else if (sym?.ctype === 'tsc_closure' && sym?.closureRetType) {
              if (ctx._strictRules?.has('no-closures')) {
                throw ctx.errorCode('E200', node);
              }
              p(`${ctx.varDecl(qualifier, 'tsc_closure', name)} = ${init.name};`);
              ctx.define(name, { ctype: 'tsc_closure', funcPtr: true, varKind,
                                  closureRetType: sym.closureRetType,
                                  ...(sym.closureParamTypes ? { closureParamTypes: sym.closureParamTypes } : {}),
                                  ...(sym.isClosure ? { isClosure: true } : {}) });
              return;
            }
            // Move semantics borrow check (before emit, but set _moved AFTER)
            { const initSym2 = ctx.lookup(init.name);
              const structDef2 = ctx.classes.get(ctype);
              if (structDef2?.fields || ctype.startsWith('Array_')) {
                if (initSym2?.varKind === 'const') {
                  throw ctx.errorCode('E003');
                }
                if (initSym2?.isRefParam) {
                  throw ctx.errorCode('E004');
                }
              }
            }
            if (ctype === 'String') {
              const initSymS = ctx.lookup(init.name);
              const derefInit = ctx._derefStrPtr(initSymS, init.name);
              p(`tsc_string_retain(${derefInit});`);
            }
            if (ctx._gotoCleanupPreDecls?.has(name)) {
              const initSymS = ctx.lookup(init.name);
              p(`${name} = ${ctx._derefStrPtr(initSymS, ctx.exprToC(init, lines, depth))};`);
            } else {
              const initSymS = ctx.lookup(init.name);
              p(`${ctx.varDecl(qualifier, ctype, name)} = ${ctx._derefStrPtr(initSymS, ctx.exprToC(init, lines, depth))};`);
            }
            // Move semantics: mark source moved and zero out
            { const initSym2 = ctx.lookup(init.name);
              const structDef2 = ctx.classes.get(ctype);
              const PRIMITIVE_CTYPES = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','float','double','bool','char','size_t']);
              const isPrimitiveTuple = structDef2?.isTuple && (structDef2.fields ?? []).every((f: { ctype?: string }) => PRIMITIVE_CTYPES.has(f.ctype?.replace(' *', '') ?? ''));
              if ((structDef2?.fields && !isPrimitiveTuple) || ctype.startsWith('Array_') || ctype.startsWith('opt_ref_')) {
                if (initSym2) {
                  initSym2._moved = true;
                  initSym2._movedLine = node.line;
                  initSym2._movedSourceNode = init;
                }
              }
              if (initSym2?.varKind === 'let' && ((structDef2?.fields && !isPrimitiveTuple) || ctype.startsWith('opt_ref_'))) {
                p(`${init.name} = (${ctype}){0};`);
              }
            }
            if (ctype === 'String') {
              ctx._registerCleanup(`tsc_string_release(${name})`);
            }
          } else if (init.kind === 'ObjLit' && enumDef2?.isPartial) {
            // Partial<T> ObjLit: expand { name: "Alice" } С‚Р–Рў { .has_name = true, .name = ..., .has_age = false }
            const provided = new Map();
            for (const prop of init.props) {
              if (!prop.spread && !prop.computed) {
                provided.set(prop.key, ctx.exprToC(prop.value!, lines, depth));
              }
            }
            const initParts: string[] = [];
            for (const f of enumDef2.fields ?? []) {
              const fname = typeof f === 'string' ? f : f.name;
              if (provided.has(fname)) {
                initParts.push(`.has_${fname} = true`);
                initParts.push(`.${fname} = ${provided.get(fname)}`);
              } else {
                initParts.push(`.has_${fname} = false`);
              }
            }
            p(`${ctx.varDecl(qualifier, ctype, name)} = {${initParts.join(', ')}};`);
          } else {
            // Check if init is a Call whose callee returns a TypeFunc
            let callSym: SymbolInfo | null = null;
            if (init.kind === 'Call' && init.callee.kind === 'Ident') {
              callSym = ctx.lookup(init.callee.name);
            }
            if (!typeAnn && callSym?.returnType?.kind === 'TypeFunc') {
              const initC = ctx.exprToC(init, lines, depth);
              p(`${ctx.typeDecl(callSym.returnType, name)} = ${initC};`);
              const _retFuncParams = callSym.returnType.params ? callSym.returnType.params.map((pt: TypeAnn) => ctx.resolveType(pt)) : undefined;
              const _returnsClosure = !!callSym._returnsCapturingClosure;
              ctx.define(name, { ctype: 'tsc_closure', ...(_returnsClosure ? { isClosure: true } : { funcPtr: true }), varKind, ...(callSym.closureRetType ? { closureRetType: callSym.closureRetType } : {}), ...(_retFuncParams ? { closureParamTypes: _retFuncParams } : {}) });
              return;
            }
            if (init.kind === 'Index' && !ctype.endsWith(' *') && typeAnn?.kind === 'TypeRef' && typeAnn.name !== 'Ref') {
              const _arrT2 = ctx.inferType(init.object);
              if (_arrT2?.startsWith('Array_')) {
                const _elem2 = _arrT2.slice(6);
                if (!PRIMITIVE_IDENTS.has(_elem2) && _elem2 !== 'string') {
                  throw ctx.errorCode('E009', init);
                }
              }
            }
            // Ref<T> / Mut<T> borrow from object fields is not supported
            if (init.kind === 'Member' && typeAnn?.kind === 'TypeRef' && (typeAnn.name === 'Ref' || typeAnn.name === 'Mut')) {
              throw ctx.errorCode('E018', init, { type: typeAnn.name });
            }
            // Auto-propagate throws function calls in throws context
            if (ctx._throwsCtx && init?.kind === 'Call' && init.callee?.kind === 'Ident') {
              const calleeSym = ctx.lookup(init.callee.name);
              if (calleeSym?._isThrowsFunc) {
                const tc = ctx._throwsCtx;
                const resName = `_res_${ctx.tempCount++}`;
                const callC = ctx.exprToC(init, lines, depth);
                p(`${calleeSym._resultType} ${resName} = ${callC};`);
                p(`if (!${resName}.ok) {`);
                if (ctx._usesGotoCleanup) {
                  ctx._emitFuncCleanup(lines, I + '    ');
                  p(`    _result = (${tc!.resultType}){.ok = false, .error = ${ctx._wrapErrForCaller(tc!, `${resName}.error`, calleeSym)}};`);
                  p(`    goto cleanup;`);
                } else {
                  ctx._emitFuncCleanup(lines, I + '    ');
                  p(`    return (${tc!.resultType}){.ok = false, .error = ${ctx._wrapErrForCaller(tc!, `${resName}.error`, calleeSym)}};`);
                }
                p(`}`);
                const valueType = calleeSym._resultValueType ?? 'int32_t';
                p(`${ctx.varDecl(qualifier, valueType, name)} = ${resName}.value;`);
                ctx.define(name, { ctype: valueType, varKind });
                if (valueType?.startsWith('opt_ref_') && ctx._currentBlockPoolVars) {
                  const _pcls = valueType.slice(8);
                  if (ctx.classes.get(_pcls)?._isPool) {
                    ctx._currentBlockPoolVars.push({ name, className: _pcls });
                  }
                }
                return;
              }
            }
            let initC: string;
            ctx._checkLiteralFitsType(init, ctype);
            // Float literal with fractional part в†’ integer type: error
            if (typeAnn && init.kind === 'Literal' && init.litType === 'number') {
              const fval = parseFloat(init.value.replace(/_/g, ''));
              if (!Number.isInteger(fval)) {
                const di = ctx._numericTypeInfo(ctype);
                if (di && di.kind === 'int') {
                  const dstTs = ctx.ctypeToTsName(ctype);
                  throw ctx.errorCode('E100', null, { detail: `float literal ${init.value} assigned to integer type ${dstTs} вЂ” fractional part will be lost\nhint: use '${init.value} as ${dstTs}' for explicit truncation, or Math.trunc(${init.value})` });}
              }
            }
            if (init.kind === 'Literal' && (init.litType === 'number' || init.litType === 'char')) {
              initC = ctx.literalToCTyped(init, ctype);
            } else if (init.kind === 'Unary' && init.op === '-' && init.expr?.kind === 'Literal' && (init.expr as Literal).litType === 'number') {
              const di = ctx._numericTypeInfo(ctype);
              if (di && di.kind === 'decimal') {
                initC = '-' + ctx.literalToCTyped(init.expr as Literal, ctype);
              } else {
                initC = ctx.exprToC(init, lines, depth);
              }
            } else if (init.kind === 'Literal' && init.litType === 'string'
                       && (ctype === 'char' || ctype === 'uint8_t')) {
              const code = ctx._stringLiteralToByte(init);
              initC = ctype === 'uint8_t' ? code + 'U' : String(code);
            } else {
              // For binary expressions with mixed integer types in const context:
              // cast operands and result explicitly to preserve well-defined semantics
              let mixedBinary: string | null = null;
              if (typeAnn && init.kind === 'Binary') {
                mixedBinary = ctx.tryConstMixedBinary(init, ctype, lines, depth);
              }
              if (mixedBinary !== null) {
                initC = mixedBinary;
              } else if (ctype === 'int64_t' && init.kind === 'Binary') {
                // For binary expressions assigned to int64_t with u32 operands,
                // widen operands individually to avoid overflow before cast
                initC = ctx.binaryWidened(init, ctype, lines, depth);
              } else {
                // Set expected type hint for context-sensitive calls (e.g. parseFloat with f64 annotation)
                ctx._expectedType = resolveDecimalBase(ctx, ctype) ?? ctype;
                initC = ctx.exprToC(init, lines, depth);
                ctx._expectedType = null;
              }
              // Implicit type conversion checks for typed assignments (skip if already handled by mixedBinary)
              if (typeAnn && mixedBinary === null) {
                const srcType = ctx.inferType(init);
                // Cannot implicitly convert string literal union to string
                if (ctype === 'String') {
                  const srcEnumDef = ctx.classes.get(srcType);
                  if (srcEnumDef?.isStringLiteralUnion) {
                    throw ctx.errorCode('E100', null, { detail: `cannot implicitly convert ${srcType} to string: use ".toString()" or "as string"` });
                  }
                }
                // Safe widening check for non-literal expressions
                const _isNumLiteral = (e: any): boolean =>
                  (e?.kind === 'Literal' && e?.litType === 'number') ||
                  (e?.kind === 'Unary' && e?.op === '-' && _isNumLiteral(e?.expr));
                const isNumLit = _isNumLiteral(init)
                  || (init.kind === 'Ternary' && _isNumLiteral(init.yes) && _isNumLiteral(init.no));
                if (!isNumLit) {
                  const srcTypeEff = ctx._effectiveType(init);
                  const si = ctx._numericTypeInfo(srcTypeEff);
                  const di = ctx._numericTypeInfo(ctype);
                  if (si && di && !ctx._isSafeWidening(srcTypeEff, ctype)) {
                    const srcTs = ctx.ctypeToTsName(srcTypeEff);
                    const dstTs = ctx.ctypeToTsName(ctype);
                    throw ctx.errorCode('E100', null, { detail: `cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"` });
                  }
                }
                // C-level widening cast for size_t в†’ int64_t
                if (ctype === 'int64_t' && srcType === 'size_t') {
                  initC = `(int64_t)${initC}`;
                }
              }
            }
            // computed() в†’ Signal_T var (Signal is the result type, not raw T)
            if (ctx._lastComputedSigType) {
              const _sigType = ctx._lastComputedSigType;
              const _sigElemIdent = ctx._lastComputedElemType;
              ctx._lastComputedSigType = undefined;
              ctx._lastComputedElemType = undefined;
              if (!ctx._emittedSignalTypedefs.has(_sigType)) {
                ctx._emittedSignalTypedefs.add(_sigType);
                const _sigElemCType = ctx._arrIdentToCType(_sigElemIdent!);
                ctx.addTop(`typedef struct { ${_sigElemCType} _value; void (**_effects)(void); size_t _effect_count; ${_sigElemCType} (*_compute)(void); } ${_sigType};`);
                ctx.addTop('');
              }
              p(`${_sigType} ${name} = ${initC};`);
              ctx.define(name, { ctype: _sigType, varKind, _isSignal: true, _signalElemType: _sigElemIdent });
              return;
            }
            // Cross-struct assignment: const b: Pt2 = a (where a is a different struct type)
            if (init.kind === 'Ident') {
              const initSym = ctx.lookup(init.name);
              const srcDef = initSym?.ctype ? ctx.classes.get(initSym.ctype) : null;
              const dstDef = ctx.classes.get(ctype);
              if (srcDef?.isStruct && dstDef?.isStruct && initSym?.ctype !== ctype) {
                const qualCast = qualifier === 'const ' ? 'const ' : '';
                initC = `*(${qualCast}${ctype} *)&${initC}`;
              }
            }
            // Heap-allocated map: register free call
            if (ctype.startsWith('Map_') && initC.includes('tsc_map_create')) {
              const mapSuffix = ctype.slice(4);
              p(`${ctx.varDecl(qualifier, ctype, name)} = ${initC};`);
              ctx._registerCleanup(`tsc_map_free_${mapSuffix}(&${name})`);
              ctx._lastArrayElemReturn = undefined;
              ctx._lastSuppressConst = undefined;
            // Heap-allocated string: emit as non-const and register cleanup
            } else if (ctype === 'String' && ctx._isHeapStringInit(init)) {
              if (ctx._gotoCleanupPreDecls?.has(name)) {
                p(`${name} = ${initC};`);
              } else {
                p(`String ${name} = ${initC};`);
              }
              ctx._registerCleanup(`tsc_string_release(${name})`);
            } else {
              // Detect Ref/Mut return before effQual вЂ” Mut return suppresses const qualifier
              let _retBorrowMode: string | null = null;
              if (init?.kind === 'Call' && init.callee?.kind === 'Ident') {
                const _fnSym = ctx.lookup(init.callee.name);
                const _retAnn = _fnSym?.returnType;
                if (_retAnn?.kind === 'TypeRef') {
                  if (_retAnn.name === 'Ref') _retBorrowMode = 'Ref';
                  else if (_retAnn.name === 'Mut') _retBorrowMode = 'Mut';
                }
              }
              // Suppress const if flagged by array element return, parse() result, or Mut return
              const effQual = (ctx._lastArrayElemReturn || ctx._lastSuppressConst || _retBorrowMode === 'Mut') ? '' : qualifier;
              ctx._lastArrayElemReturn = undefined;
              ctx._lastSuppressConst = undefined;
              // D6: Conservative lifetime binding вЂ” borrow all Ref/Mut arguments
              if (_retBorrowMode) {
                ctx._trackBorrowForRefReturn(init as unknown as Call, name, _retBorrowMode);
              }
              // Borrow check before emit (with typeAnn path)
              // Skip when source and target are different struct types (cross-type cast, not a move)
              if (init.kind === 'Ident') {
                const initSym2pre = ctx.lookup(init.name);
                const structDef2pre = ctx.classes.get(ctype);
                const isCrossStruct = initSym2pre?.ctype && initSym2pre.ctype !== ctype
                  && ctx.classes.get(initSym2pre.ctype)?.isStruct && structDef2pre?.isStruct;
                if (!isCrossStruct && (structDef2pre?.fields || ctype.startsWith('Array_'))) {
                  if (initSym2pre?.varKind === 'const') {
                    throw ctx.errorCode('E003');
                  }
                  if (initSym2pre?.isRefParam) {
                    throw ctx.errorCode('E004');
                  }
                }
              } else if (init.kind === 'Index') {
                if (!ctype.endsWith(' *') && !(typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref')) {
                  const _arrT = ctx.inferType(init.object);
                  if (_arrT?.startsWith('Array_')) {
                    const _elem = _arrT.slice(6);
                    if (!PRIMITIVE_IDENTS.has(_elem) && _elem !== 'string') {
                      throw ctx.errorCode('E009', init);
                    }
                  }
                } else if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref' && init.object.kind === 'Ident') {
                  const _arrSym = ctx.lookup(init.object.name);
                  if (_arrSym) ctx._trackRefBorrow(_arrSym);
                }
              }
              if (init.kind === 'Index' && typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref' && ctype.endsWith(' *')) {
                initC = `&${initC}`;
              }
              if (init.kind === 'Ident' && typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref' && ctype.endsWith(' *')) {
                const srcSym = ctx.lookup(init.name);
                if (srcSym && !srcSym.isPointer && !srcSym.ctype?.endsWith('*')) {
                  initC = `&${initC}`;
                }
                if (srcSym) ctx._trackRefBorrow(srcSym);
              }
              if (init.kind === 'Ident' && typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Mut' && ctype.endsWith('*')) {
                const srcSym = ctx.lookup(init.name);
                if (srcSym && !srcSym.isPointer && !srcSym.ctype?.endsWith('*')) {
                  initC = `&${initC}`;
                }
                if (srcSym) {
                  if (srcSym.varKind === 'const') {
                    throw ctx.errorCode('E013', null, { name: init.name });
                  }
                  if ((srcSym._refBorrowCount || 0) > 0) {
                    throw ctx.errorCode('E014', init, { name: init.name });
                  }
                  if (srcSym._mutBorrowedBy) {
                    throw ctx.errorCode('E012', init, { name: init.name });
                  }
                  srcSym._mutBorrowedBy = `_mut_var_${name}`;
                  ctx._trackMutBorrow(srcSym);
                }
              }
              if (ctype === 'String' && init.kind === 'Ident') {
                p(`tsc_string_retain(${init.name});`);
              }
              if (ctype === 'String' && init.kind === 'Member' && init.object.kind === 'Ident') {
                p(`tsc_string_retain(${init.object.name}.${init.prop});`);
              }
              if (ctx._gotoCleanupPreDecls?.has(name)) {
                p(`${name} = ${initC};`);
              } else {
                p(`${ctx.varDecl(effQual, ctype, name)} = ${initC};`);
              }
              if (ctype === 'String' && init.kind === 'Index') {
                p(`tsc_string_retain(${name});`);
                ctx._registerCleanup(`tsc_string_release(${name})`);
                if (init.object.kind === 'Ident' && init.index.kind === 'Literal' && init.index.litType === 'number') {
                  const objSym = ctx.lookup(init.object.name);
                  const objType = objSym?.ctype;
                  const tupleDef = objType ? ctx.classes.get(objType) : null;
                  if (tupleDef?.isTuple && objSym?.varKind === 'let') {
                    const fieldIdx = parseInt(init.index.value, 10);
                    p(`memset(&${init.object.name}._${fieldIdx}, 0, sizeof(String));`);
                  }
                }
              }
              // Move semantics: mark source moved and zero out (after emit)
              if (init.kind === 'Ident') {
                const initSym2 = ctx.lookup(init.name);
                const structDef2 = ctx.classes.get(ctype);
                if (structDef2?.fields || ctype.startsWith('Array_') || ctype.startsWith('opt_ref_')) {
                  if (initSym2) {
                    initSym2._moved = true;
                    initSym2._movedLine = node.line;
                    initSym2._movedSourceNode = init; // for secondary span
                  }
                  if (initSym2?.varKind === 'let' && (structDef2?.fields || ctype.startsWith('opt_ref_'))) {
                    p(`${init.name} = (${ctype}){0};`);
                  }
                }
              } else if (init.kind === 'Member' && init.object.kind === 'Ident') {
                // Field move: let d = obj.field в†’ mark field as moved
                const objSym = ctx.lookup(init.object.name);
                const objDef = objSym?.ctype ? ctx.classes.get(objSym.ctype) : null;
                const fieldType = objDef?.fields?.find((f) => f.name === init.prop);
                if (fieldType && ctx.classes.has(ctx.resolveType(fieldType.typeAnn)) && objSym) {
                  if (!objSym._movedFields) objSym._movedFields = [];
                  objSym._movedFields.push(init.prop);
                  objSym._movedFieldLine = objSym._movedFieldLine ?? {};
                  objSym._movedFieldLine[init.prop] = node.line;
                  objSym._movedFieldSourceNode = objSym._movedFieldSourceNode ?? {};
                  objSym._movedFieldSourceNode[init.prop] = init; // for secondary span
                }
              }
              if (ctype === 'String') {
                ctx._registerCleanup(`tsc_string_release(${name})`);
              }
              if (ctype?.startsWith('Array_') && HEAP_ARRAY_KEYWORDS.some((k: string) => initC.includes(k))) {
                const elemIdent = ctype.slice(6);
                ctx._registerCleanup(`tsc_array_free_${elemIdent}(&${name})`);
              }
            }
          }
        } else {
          // No initializer: zero-init for safe defaults, compile error for enum
          const enumDef = ctx.classes.get(ctype);
          if (enumDef?.isEnum && !enumDef?.isStringLiteralUnion && !enumDef?.isKeyOf) {
            throw ctx.error(`variable of enum type "${ctype}" must be explicitly initialized or declared nullable`);
          }
          const PRIMITIVE_ZERO: Record<string, string> = {
            'int8_t': '0', 'int16_t': '0', 'int32_t': '0', 'int64_t': '0',
            'uint8_t': '0', 'uint16_t': '0', 'uint32_t': '0', 'uint64_t': '0',
            'float': '0.0f', 'double': '0.0',
            'bool': 'false',
            'char': '0',
            'size_t': '0', 'ptrdiff_t': '0',
          };
          if (ctype === 'String') {
            p(`${ctx.varDecl(qualifier, ctype, name)} = STR_LIT("");`);
          } else if (PRIMITIVE_ZERO[ctype] !== undefined) {
            p(`${ctx.varDecl(qualifier, ctype, name)} = ${PRIMITIVE_ZERO[ctype]};`);
          } else {
            p(`${ctx.varDecl(qualifier, ctype, name)} = {0};`);
          }
        }
        // Store compile-time value for const variables with literal init (used for const-cast overflow checking)
        let constValue: bigint | undefined = undefined;
        if (varKind === 'const' && init?.kind === 'Literal' && init.litType === 'number') {
          const raw = init.value.replace(/_/g, '');
          try { constValue = BigInt(raw); } catch(_) {
            const fval = parseFloat(raw);
            if (Number.isInteger(fval)) constValue = BigInt(fval);
          }
        }
        const isStringRef = typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref' &&
                            typeAnn.typeArgs?.[0]?.kind === 'TypeRef' && typeAnn.typeArgs[0].name === 'string';
        const _isRefVar = typeAnn?.kind === 'TypeRef' && typeAnn.name === 'Ref';
        const _refInnerType = _isRefVar && ctype.endsWith(' *')
          ? ctx.resolveType(typeAnn.typeArgs?.[0] ?? {})
          : undefined;
        const _isPtrByCtype = !_refInnerType && ctype?.endsWith(' *');
        ctx.define(name, { ctype, varKind, constValue, initNode: init,
                            ...(isStringRef ? { isStringRef: true } : {}),
                            ...(_refInnerType ? { isPointer: true, derefType: _refInnerType } : {}),
                            ...(_isPtrByCtype ? { isPointer: true } : {}) });
        // Register cleanup for class variables with string fields
        if (init && ctx.classes.has(ctype)) {
          const stringFields = ctx._getStringFields(ctype);
          if (stringFields.length > 0) {
            ctx._ensureClassFree(ctype);
            const freeFn = ctx.classes.get(ctype)?._classFreeFn;
            if (freeFn) ctx._registerCleanup(`${freeFn}(&${name})`);
          }
        }
        // Track pool vars for auto-drop at block exit
        if (ctype?.startsWith('opt_ref_') && ctx._currentBlockPoolVars) {
          const _pcls = ctype.slice(8);
          if (ctx.classes.get(_pcls)?._isPool) {
            ctx._currentBlockPoolVars.push({ name, className: _pcls });
          }
        }
        ctx._flushPostStmtCleanups(lines);
        // HAL read: emit (void)varname; to suppress unused variable warning
        if (ctx._lastHalRead) {
          p(`(void)${name};`);
          ctx._lastHalRead = null;
        }
        // Class decorator inits: inject after new ClassName() declaration
        if (ctx._pendingDecoratorInits) {
          for (const { fieldName, cVal } of ctx._pendingDecoratorInits) {
            p(`${name}.${fieldName} = ${cVal};`);
          }
          ctx._pendingDecoratorInits = null;
        }
    }
}

