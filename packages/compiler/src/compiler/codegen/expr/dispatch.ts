import type { CodeGenContext } from '../../codegen.js';
// dispatch.ts
import type { Expression, ObjLitProp } from '@tsclang/ast';
import { isDecimal, resolveDecimalBase } from '../types/decimal.js';
export function exprToC(ctx: CodeGenContext, node: Expression, lines: string[] = [], depth: number = 0): string {
    if (!node) return '0';
    ctx._currentNode = node;
    switch (node.kind) {
      case 'RawC': return node.code;
      case 'Literal': {
        if (node.litType === 'number' && ctx._expectedType && isDecimal(ctx._expectedType)) {
          return ctx.literalToCTyped(node, ctx._expectedType);
        }
        return ctx.literalToC(node);
      }

      case 'Ident': {
        if (node.name === 'keyof') throw ctx.error(`"keyof" can only be used in type position`, node);
        const kw: Record<string, string> = {
          'true': 'true', 'false': 'false', 'null': 'NULL',
          'undefined': 'NULL',
        };
        if (kw[node.name] !== undefined) return kw[node.name];
        // 'this' keyword: check scope first (extension methods alias it to '_self')
        if (node.name === 'this') {
          const thisSym = ctx.lookup('this');
          if (thisSym?._cAlias) return thisSym._cAlias;
          return 'self';
        }
        // Narrowed optional variable: x → x.value inside if(x != null) block
        if (ctx._narrowedVars?.has(node.name)) {
          const sym2 = ctx.lookup(node.name);
          if (sym2?.ctype === 'tsc_unknown' && ctx._narrowedUnknownVars?.has(node.name)) {
            const narrowedCtype = ctx._narrowedUnknownVars.get(node.name);
            if (narrowedCtype === '__array__' || narrowedCtype === '__object__') {
              return node.name;
            }
            if (!narrowedCtype) return node.name;
            const getter = ctx._unknownGetterFor(narrowedCtype);
            return `${getter}(&${node.name})`;
          }
          if (sym2?.ctype?.startsWith('opt_')) {
            ctx._checkMoved(sym2, node, node.name);
            return `${node.name}.value`;
          }
        }
        // Function reference (not a func-ptr variable): use mangled name
        const sym = ctx.lookup(node.name);
        ctx._checkMoved(sym, node, node.name);
        if (sym?._mutQuarantined) {
          throw ctx.error(`cannot access '${node.name}' while a mutable borrow is active`, node);
        }
        if (sym?.isWeak && !ctx._inWeakUpgrade) {
          throw ctx.error(`cannot dereference '${node.name}' (Weak<T>); use '${node.name}.upgrade()' and check for null`, node);
        }
        if (sym?._cAlias) return sym._cAlias;
        if (sym?.funcName && !sym.funcPtr) return sym.funcName;
        // Async/generator self context: inlined consts → literal, promoted vars → self->name
        if (ctx._selfCtx) {
          if (ctx._selfCtx.inlined?.has(node.name)) return ctx._selfCtx.inlined.get(node.name)!;
          if (ctx._selfCtx.promoted?.has(node.name)) return `self->${node.name}`;
        }
        // Deferred anon struct used outside destructuring: materialize now
        if (sym?.deferredAnon && ctx._deferredAnons?.has(node.name)) {
          const { fields, init: _init } = ctx._deferredAnons.get(node.name)!;
          const ctype = sym.ctype;
          const fieldDecls = fields.map((f: { name: string; _ctype: string }) => `${f._ctype} ${f.name};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${ctype};`);
          ctx.addTop('');
          const initParts = ((_init as unknown as { props?: { key: string; value: Expression }[] } | null)?.props ?? []).map((pr: { key: string; value: Expression }) => `.${pr.key} = ${ctx.exprToC(pr.value, lines, depth)}`);
          const I = ' '.repeat(ctx.indent * depth);
          lines.push(`${I}${ctype} ${node.name} = {${initParts.join(', ')}};`);
          sym.deferredAnon = false;
          ctx._deferredAnons.delete(node.name);
        }
        if (sym?._closureEnvVar) return `env->${node.name}`;
        return node.name;
      }

      case 'Binary': return ctx.binaryToC(node, lines, depth);
      case 'Unary':  return ctx.unaryToC(node, lines, depth);
      case 'Assign': return ctx.assignToC(node, lines, depth) ?? '';
      case 'Ternary': {
        ctx._checkNoBareThrows(node.cond);
        ctx._checkNoBareThrows(node.yes);
        ctx._checkNoBareThrows(node.no);
        const c = ctx._truthyToC(node.cond, lines, depth);
        const yRaw = ctx.exprToC(node.yes, lines, depth);
        const n = ctx.exprToC(node.no, lines, depth);
        // Wrap nested ternary in yes-branch to avoid ambiguity
        const y = node.yes.kind === 'Ternary' ? `(${yRaw})` : yRaw;
        return `(${c}) ? ${y} : ${n}`;
      }

      case 'Member': {
        ctx._checkNoBareThrows(node.object);
        // Namespace import: X.Foo → resolve Foo from namespace
        if (node.object.kind === 'Ident') {
          const nsSym = ctx.lookup(node.object.name);
          if (nsSym?._isNamespace) {
            const nsEntry = nsSym._namespaceExports?.[node.prop];
            if (nsEntry) {
              ctx.define(node.prop, nsEntry);
              if (nsEntry._cAlias) return nsEntry._cAlias;
              if (nsEntry.funcName && !nsEntry.funcPtr) return nsEntry.funcName;
              return node.prop;
            }
          }
        }
        // process.argv → _argv (array built in main from argc/argv)
        if (node.object.kind === 'Ident' && node.object.name === 'process' && node.prop === 'argv') {
          ctx._useArgcArgv = true;
          return '_argv';
        }
        // process.stdin / process.stdout / process.stderr (std/io)
        if (ctx._stdIoImported && node.object.kind === 'Ident' && node.object.name === 'process') {
          if (ctx._cap('os') === false) {
            throw ctx.error(`TypeError: 'process.${node.prop}' is not available on embedded targets`);
          }
          if (node.prop === 'stdin')  { ctx._lastSuppressConst = true; return 'tsc_stdin()'; }
          if (node.prop === 'stdout') { ctx._lastSuppressConst = true; return 'tsc_stdout()'; }
          if (node.prop === 'stderr') { ctx._lastSuppressConst = true; return 'tsc_stderr()'; }
        }
        // Math constants: Math.PI, Math.E, Math.SQRT2, etc.
        if (node.object.kind === 'Ident' && node.object.name === 'Math') {
          const mathConsts: Record<string, string> = {
            PI: 'M_PI', E: 'M_E', LN2: 'M_LN2', LN10: 'M_LN10',
            SQRT2: 'M_SQRT2', SQRT1_2: 'M_SQRT1_2',
            LOG2E: 'M_LOG2E', LOG10E: 'M_LOG10E',
          };
          if (mathConsts[node.prop]) {
            ctx.includes.add('#include <math.h>');
            return mathConsts[node.prop];
          }
        }
        // Number.* constants: type-specific integer limits + JS standard float constants
        if (node.object.kind === 'Ident' && node.object.name === 'Number') {
          const intLimits: Record<string, string> = {
            MAX_I8:  'INT8_MAX',  MIN_I8:  'INT8_MIN',
            MAX_I16: 'INT16_MAX', MIN_I16: 'INT16_MIN',
            MAX_I32: 'INT32_MAX', MIN_I32: 'INT32_MIN',
            MAX_I64: 'INT64_MAX', MIN_I64: 'INT64_MIN',
            MAX_U8:  'UINT8_MAX', MAX_U16: 'UINT16_MAX',
            MAX_U32: 'UINT32_MAX', MAX_U64: 'UINT64_MAX',
          };
          if (intLimits[node.prop]) return intLimits[node.prop];
          if (node.prop === 'MAX_SAFE_INTEGER') return '9007199254740991LL';
          if (node.prop === 'MIN_SAFE_INTEGER') return '(-9007199254740991LL)';
          const floatConsts: Record<string, string> = {
            MAX_VALUE:         'DBL_MAX',
            MIN_VALUE:         'DBL_MIN',
            EPSILON:           'DBL_EPSILON',
            POSITIVE_INFINITY: 'INFINITY',
            NEGATIVE_INFINITY: '(-INFINITY)',
            NaN:               'NAN',
          };
          if (floatConsts[node.prop]) {
            ctx.includes.add('#include <float.h>');
            return floatConsts[node.prop];
          }
          throw ctx.error(`TypeError: 'Number.${node.prop}' is not a known constant`, node);
        }
        const sym = node.object.kind === 'Ident' ? ctx.lookup(node.object.name) : null;
        const objName = node.object.kind === 'Ident' ? node.object.name : '';
        if (sym?._mutQuarantined) {
          throw ctx.error(`cannot access '${objName}' while a mutable borrow is active`, node);
        }
        if (sym?.ctype === 'tsc_unknown' && ctx._narrowedUnknownVars?.has(objName)) {
          const _nc = ctx._narrowedUnknownVars.get(objName);
          if (_nc === '__array__') throw ctx.error(`Cannot access '.${node.prop}' on '${objName}' after typeof "array"; use '${objName} as Array<T>' first`, node);
          if (_nc === '__object__') throw ctx.error(`Cannot access '.${node.prop}' on '${objName}' after typeof "object"; use '${objName} as ClassName' first`, node);
        }
        // Channel<T>.length / .capacity → tsc_channel_length/capacity_T(ch._inner)
        if (sym?._isChannel && (node.prop === 'length' || node.prop === 'capacity')) {
          const ident = sym._channelIdent;
          const objC = ctx.exprToC(node.object, lines, depth);
          const fn = node.prop === 'length' ? 'length' : 'capacity';
          return `tsc_channel_${fn}_${ident}(${objC}._inner)`;
        }
        if (sym?._isDataView || sym?.ctype === 'DataView') {
          const objC = node.object.kind === 'Ident' ? node.object.name : ctx.exprToC(node.object, lines, depth);
          if (node.prop === 'byteLength') return `(size_t)${objC}.byte_length`;
          if (node.prop === 'byteOffset') return `(size_t)${objC}.byte_offset`;
        }
        ctx._checkMoved(sym, node, objName);
        ctx._checkFieldMoved(sym, node.prop, node, objName);
        // Error subclass: e.message → _err_0._base.message (parent fields via _base)
        if (sym?._alias && sym?.ctype) {
          const errClass = ctx.classes.get(sym.ctype);
          const isOwnField = errClass?.fields?.some((f: { name: string }) => f.name === node.prop);
          if (!isOwnField) {
            // Field is on parent (TscError._base): route through _alias._base.prop
            return `${sym._alias}._base.${node.prop}`;
          }
          return `${sym._alias}.${node.prop}`;
        }
        // Check private field access from outside the class
        if (sym?.ctype) {
          const classDef = ctx.classes.get(sym.ctype);
          const field = classDef?.fields?.find((f: { name: string; modifiers?: string[] }) => f.name === node.prop);
            if (field?.modifiers?.includes('private')) {
            // We are inside the class if 'this' or 'self' in scope has the same ctype
            const thisSym = ctx.lookup('this') ?? ctx.lookup('self');
            const inMethod = thisSym?.ctype === sym.ctype;
            if (!inMethod) {
              throw ctx.error(`"${node.prop}" is private and not accessible from outside the class`, node);
            }
          }
        }
        // Rest param: .length → args_count
        if (sym?.rest && node.prop === 'length') {
          return sym.countVar ?? `${objName}_count`;
        }
        // Fixed-size array: .length → compile-time constant
        if (sym?.isFixedArray && node.prop === 'length') {
          return `(size_t)${sym.arraySize}`;
        }
        // PinMode enum (std/hal): PinMode.OUTPUT → TSC_PINMODE_OUTPUT
        if (node.object.kind === 'Ident' && node.object.name === 'PinMode') {
          const pm: Record<string, string> = { INPUT: 'TSC_PINMODE_INPUT', OUTPUT: 'TSC_PINMODE_OUTPUT', INPUTPULLUP: 'TSC_PINMODE_INPUTPULLUP' };
          return pm[node.prop] ?? `TSC_PINMODE_${node.prop.toUpperCase()}`;
        }
        // Enum member access: Direction.North → Direction_North
        if (node.object.kind === 'Ident') {
          const enumDef = ctx.classes.get(node.object.name);
          if (enumDef?.isEnum) return `${enumDef._cname ?? node.object.name}_${node.prop}`;
          // Labeled tuple field access: p.x → p._0 (look up via symbol type)
          const symForLabel = ctx.lookup(node.object.name);
          const tupleDef3 = symForLabel ? ctx.classes.get(symForLabel.ctype!) : null;
          if (tupleDef3?.isTuple) {
            const field = tupleDef3.fields?.find((f) => f.label === node.prop);
            if (field) {
        const objC = ctx.exprToC(node.object, lines, depth);
              return `${objC}.${field.name}`;
            }
          }
        }
        // Heap pointer var: p.field → p->field (heap class is already a pointer)
        if (sym?._isHeap) {
          const rawName = node.object.kind === 'Ident' ? node.object.name : ctx.exprToC(node.object, lines, depth);
          return `${rawName}->${node.prop}`;
        }
        const symType = sym?.ctype?.replace(' *', '');
        if (ctx.classes.get(symType!)?._isHeap && sym?.ctype?.endsWith(' *')) {
          const rawName = node.object.kind === 'Ident' ? node.object.name : ctx.exprToC(node.object, lines, depth);
          return `${rawName}->${node.prop}`;
        }
        // Pool opt_ref var: p.field → p.value->field (route through pool pointer)
        // Note: only exclude has_value and _pool_idx (struct meta-fields); 'value' may be a class field
        if (sym?.ctype?.startsWith('opt_ref_') && !['has_value','_pool_idx'].includes(node.prop)) {
          const poolClassName = sym.ctype.slice(8);
          const poolCls = ctx.classes.get(poolClassName);
          if (poolCls?._isPool) {
            // Check if this prop exists on the pool class itself (not on opt_ref wrapper)
            const isClassField = poolCls.fields?.some((f: { name: string }) => f.name === node.prop);
            if (isClassField || node.prop !== 'value') {
              // Use raw variable name (not narrowed form) to avoid double-indirection
              const rawName = node.object.kind === 'Ident' ? node.object.name : ctx.exprToC(node.object, lines, depth);
              return `${rawName}.value->${node.prop}`;
            }
          }
        }
        const objC = ctx.exprToC(node.object, lines, depth);
        // String.bytes → Slice_u8 {.ptr = data, .length = length}
        if (node.prop === 'bytes') {
          const objType3 = ctx.inferType(node.object);
          if (objType3 === 'String') {
            ctx._ensureSliceU8Struct();
            return `{.ptr = (uint8_t *)${objC}.data, .length = ${objC}.length}`;
          }
        }
        const isPtr = sym?.isPointer;
        // Inherited field access: if prop not in own fields, check base class
        const symCls = sym ? ctx.classes.get(sym.ctype!) : null;
        if (symCls?.superClass && symCls.fields && !symCls.fields.some((f: { name: string }) => f.name === node.prop)) {
          const baseCls = ctx.classes.get(symCls.superClass);
          if (baseCls?.fields?.some((f: { name: string }) => f.name === node.prop)) {
            return isPtr ? `${objC}->_base.${node.prop}` : `${objC}._base.${node.prop}`;
          }
        }
        // Throws class: .message → ._base.message
        if (symCls?._isThrowsClass && node.prop === 'message') {
          return isPtr ? `${objC}->_base.message` : `${objC}._base.message`;
        }
        // AbortController.signal / AbortSignal.aborted
        if (sym?.ctype === 'TscAbortController' && node.prop === 'signal') {
          return `${objC}.signal`;
        }
        if (sym?.ctype === 'TscAbortSignal *' && node.prop === 'aborted') {
          return `tsc_abort_signal_aborted(${objC})`;
        }
        // URL field access — u.search after mutation → tsc_url_search(&u)
        if (ctx._stdUrlImported && sym?._isURL) {
          const _urlMutatedFields = ['search'];
          if (_urlMutatedFields.includes(node.prop)) {
            return `tsc_url_search(&${objName})`;
          }
        }
        if (!sym) {
          const inferredType = ctx.inferType(node.object);
          if (inferredType?.endsWith(' *')) {
            return `${objC}->${node.prop}`;
          }
        }
        return isPtr ? `${objC}->${node.prop}` : `${objC}.${node.prop}`;
      }

      case 'Index': {
        ctx._checkNoBareThrows(node.object);
        ctx._checkNoBareThrows(node.index);
        if (node.object.kind === 'Ident') {
          const _idxQSym = ctx.lookup(node.object.name);
          if (_idxQSym?._mutQuarantined) {
            throw ctx.error(`cannot access '${node.object.name}' while a mutable borrow is active`, node);
          }
          if (_idxQSym?.ctype === 'tsc_unknown' && ctx._narrowedUnknownVars?.has(node.object.name)) {
            const _nc = ctx._narrowedUnknownVars.get(node.object.name);
            if (_nc === '__array__') throw ctx.error(`Cannot index '${node.object.name}' after typeof "array"; use '${node.object.name} as Array<T>' first`, node);
            if (_nc === '__object__') throw ctx.error(`Cannot index '${node.object.name}' after typeof "object"; use '${node.object.name} as ClassName' first`, node);
          }
        }
        // req.params["key"] → tsc_request_param(req, STR_LIT("key"))
        if (ctx._stdNetImported && node.object.kind === 'Member' && node.object.prop === 'params') {
          const reqSym = node.object.object.kind === 'Ident' ? ctx.lookup(node.object.object.name) : null;
          if (reqSym?.ctype === 'TscRequest *') {
            const reqC = ctx.exprToC(node.object.object, lines, depth);
            const keyC = ctx.exprToC(node.index, lines, depth);
            return `tsc_request_param(${reqC}, ${keyC})`;
          }
        }
        const objType = ctx.inferType(node.object);
        const tupleDef = ctx.classes.get(objType);
        // Tuple index access: pair[0] → pair._0
        if (tupleDef?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const objC = ctx.exprToC(node.object, lines, depth);
          return `${objC}._${node.index.value}`;
        }
        const obj = ctx.exprToC(node.object, lines, depth);
        // Detect negative literal index: -1 or -(literal)
        const negLitVal = (idx: Expression): number | null => {
          if (idx.kind === 'Literal' && idx.litType === 'number' && parseFloat(idx.value) < 0)
            return Math.abs(parseFloat(idx.value));
          if (idx.kind === 'Unary' && idx.op === '-' && idx.expr.kind === 'Literal' && idx.expr.litType === 'number')
            return parseFloat(idx.expr.value);
          return null;
        };
        const negVal = negLitVal(node.index);
        const isNegLit = negVal !== null;
        // Pointer to Array (Ref<T[]>): const Array_X * → obj->data[i]
        const _ptrArr = objType?.match(/^(?:const )?Array_(\w+) \*$/);
        if (_ptrArr) {
          if (isNegLit) return `${obj}->data[${obj}->length - ${negVal}]`;
          const idx = ctx.exprToC(node.index, lines, depth);
          return `${obj}->data[${idx}]`;
        }
        // Array_T indexing: arr[i] → arr.data[i], arr[-1] → arr.data[arr.length - 1]
        if (objType?.startsWith('Array_')) {
          if (isNegLit) {
            return `${obj}.data[${obj}.length - ${negVal}]`;
          }
          const idx = ctx.exprToC(node.index, lines, depth);
          // Compile-time OOB: literal index >= known array size → use checked access
          const arrSym = node.object.kind === 'Ident' ? ctx.lookup(node.object.name) : null;
          if (node.index.kind === 'Literal' && arrSym?.arraySize != null) {
            const idxVal = parseFloat(node.index.value);
            if (!isNaN(idxVal) && idxVal >= arrSym.arraySize) {
              const elemIdent = arrSym.elemType ?? objType.slice(6);
              return `tsc_array_get_checked_${elemIdent}(${obj}, ${idx})`;
            }
          }
          return `${obj}.data[${idx}]`;
        }
        // Slice_T / MutSlice_T indexing: s[i] → s.ptr[i]
        if (objType?.startsWith('Slice_') || objType?.startsWith('MutSlice_')) {
          const idx = ctx.exprToC(node.index, lines, depth);
          return isNegLit ? `${obj}.ptr[${obj}.length - ${negVal}]` : `${obj}.ptr[${idx}]`;
        }
        // Buffer indexing: buf[i] → buf.data[i]
        if (objType === 'Buffer' || objType === 'DataView') {
          const idx = ctx.exprToC(node.index, lines, depth);
          return `${obj}.data[${idx}]`;
        }
        // String indexing: s[i] → (uint8_t)TSC_STRING_GET_CHAR(s, i)
        if (objType === 'String') {
          if (isNegLit) {
            const n = negVal;
            return `(uint8_t)TSC_STRING_GET_CHAR(${obj}, ${obj}.length - ${n})`;
          }
          const idx = ctx.exprToC(node.index, lines, depth);
          return `(uint8_t)TSC_STRING_GET_CHAR(${obj}, ${idx})`;
        }
        const idx = ctx.exprToC(node.index, lines, depth);
        return `${obj}[${idx}]`;
      }

      case 'RangeIndex': {
        ctx._checkNoBareThrows(node.object);
        ctx._checkNoBareThrows(node.start);
        ctx._checkNoBareThrows(node.end);
        const obj = ctx.exprToC(node.object, lines, depth);
        const objType2 = ctx.inferType(node.object);
        if (node.object.kind === 'Ident' && objType2 !== 'String') {
          const _riSym = ctx.lookup(node.object.name);
          if (_riSym) ctx._trackRefBorrow(_riSym);
        }
        const start = node.start ? ctx.exprToC(node.start, lines, depth) : null;
        const end   = node.end   ? ctx.exprToC(node.end,   lines, depth) : null;
        // Compute length as literal if both bounds are numeric literals
        const litLen = (startNode: Expression | null | undefined, endNode: Expression | null | undefined): string | null => {
          if (startNode && endNode &&
              startNode.kind === 'Literal' && startNode.litType === 'number' &&
              endNode.kind === 'Literal' && endNode.litType === 'number') {
            return String(parseFloat(endNode.value) - parseFloat(startNode.value));
          }
          return null;
        };
        if (objType2 === 'String') {
          const dataExpr   = start ? `${obj}.data + ${start}` : `${obj}.data`;
          const staticLen  = litLen(node.start, node.end);
          const lenExpr    = staticLen ? staticLen :
                             (start && end)  ? `${end} - ${start}` :
                             (start && !end) ? `${obj}.length - ${start}` :
                             (end && !start) ? end : `${obj}.length`;
          return `{.data = ${dataExpr}, .length = ${lenExpr}, .capacity = 0}`;
        }
        // Array range: arr[start..end] → same struct init
        const dataExpr = start ? `${obj}.data + ${start}` : `${obj}.data`;
        const lenExpr  = (start && end)  ? `${end} - ${start}` :
                         (start && !end) ? `${obj}.length - ${start}` :
                         (end && !start) ? end : `${obj}.length`;
        return `{.data = ${dataExpr}, .length = ${lenExpr}, .capacity = 0}`;
      }

      case 'TemplateLit': {
        return ctx._templateToC(node, lines, depth);
      }

      case 'Call': {
        return ctx.callToC(node, lines, depth);
      }

      case 'New': {
        return ctx.newToC(node, lines, depth);
      }

      case 'ArrayLit': {
        for (const el of node.elems ?? []) ctx._checkNoBareThrows(el.expr ?? el);
        const elems = node.elems.filter((e: { spread?: boolean }) => !e.spread);
        let elemType;
        if (ctx._expectedType?.startsWith('Array_')) {
          elemType = ctx._arrIdentToCType(ctx._expectedType.slice(6));
        }
        if (!elemType) elemType = elems.length ? ctx.inferType(elems[0].expr) : null;
        if (elemType === 'String *') elemType = 'String';
        if (!elemType) elemType = 'int32_t';
        if (!ctx._expectedType?.startsWith('Array_') && elems.length > 1) {
          const elemTypes = elems.map((e: { expr: Expression }) => {
            const t = ctx.inferType(e.expr);
            return t === 'String *' ? 'String' : t;
          });
          if (elemTypes.some((t: string) => t !== elemTypes[0])) {
            const tsName = (ct: string) => (ct === 'double' || ct === 'float') ? 'number' : ctx.ctypeToTsName(ct);
            const unique = [...new Set(elemTypes.map(tsName))];
            throw ctx.error(`mixed array literal — specify type: [${unique.join(', ')}] (tuple) or T[]`, node);
          }
        }
        const arrType = `Array_${ctx.cTypeToIdent(elemType)}`;
        ctx._ensureArrayStruct(arrType, elemType);
        const dataVar = `_arr_data_${ctx.tempCount++}`;
        const prevExpected = ctx._expectedType;
        if (arrType?.startsWith('Array_') && ctx._expectedType?.startsWith('Array_')) {
          ctx._expectedType = arrType;
        } else if (resolveDecimalBase(ctx, elemType)) {
          ctx._expectedType = resolveDecimalBase(ctx, elemType);
        }
        const items = elems.map((e: { expr: Expression }) => {
          let c = ctx.exprToC(e.expr, lines, depth);
          if (e.expr.kind === 'Ident') {
            const sym = ctx.lookup(e.expr.name);
            if (sym?.ctype === 'String *' && elemType === 'String') return `(*${c})`;
          }
          if (elemType === 'tsc_unknown') {
            const _argType = ctx.inferType(e.expr);
            if (_argType !== 'tsc_unknown') {
              ctx._ensureUnknownStruct();
              const _packer = ctx._unknownPackerFor(_argType);
              c = `${_packer}(${c})`;
            }
          }
          if (ctx._isOptType(elemType)) {
            c = ctx._wrapOptValue(c, e.expr, elemType);
          }
          return c;
        }).join(', ');
        ctx._expectedType = prevExpected;
        if (ctx._inAsyncFunc) {
          ctx.topLevel.push(`static ${elemType} ${dataVar}[] = {${items}};`);
          return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = 0}`;
        }
        if (ctx._inHoistedLambda) {
          lines.push(`${elemType} *${dataVar} = (${elemType}*)malloc(${elems.length} * sizeof(${elemType}));`);
          const assignItems = elems.map((e: { expr: Expression }, i: number) => {
            const c = ctx.exprToC(e.expr, lines, depth);
            if (e.expr.kind === 'Ident') {
              const sym = ctx.lookup(e.expr.name);
              if (sym?.ctype === 'String *' && elemType === 'String') return `${dataVar}[${i}] = (*${c})`;
            }
            return `${dataVar}[${i}] = ${c}`;
          });
          for (const ai of assignItems) lines.push(`${ai};`);
          return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = ${elems.length}}`;
        }
        lines.push(`${elemType} ${dataVar}[] = {${items}};`);
        return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = ${elems.length}}`;
      }

      case 'ObjLit': {
        for (const p of node.props ?? []) {
          if (p.value) ctx._checkNoBareThrows(p.value);
          if (p.expr) ctx._checkNoBareThrows(p.expr);
        }
        if (node.props.length === 0) {
          throw ctx.error(`empty object literal is forbidden; use a typed variable or Map<K, V>`, node);
        }
        const spreads = node.props.filter((p: { spread?: boolean }) => p.spread);
        const explicit = node.props.filter((p: { spread?: boolean; computed?: boolean }) => !p.spread && !p.computed);
        // If there are spread elements, expand struct fields inline
        if (spreads.length > 0) {
          const explicitMap = new Map(explicit.map((p: ObjLitProp) => [String(p.key), p.value]));
          const resultProps: [string, string, boolean][] = [];
          for (const sp of spreads) {
            const srcC = ctx.exprToC(sp.expr!, lines, depth);
            const srcType = ctx.inferType(sp.expr);
            const cls = ctx.classes.get(srcType);
            if (cls?.fields) {
              const stringFields: string[] = [];
              for (const f of cls.fields) {
                if (!explicitMap.has(f.name)) {
                  const ftype = f._ctype || (f.typeAnn ? ctx.resolveType(f.typeAnn) : null);
                  resultProps.push([f.name, `${srcC}.${f.name}`, true]);
                  if (ftype === 'String') {
                    stringFields.push(f.name);
                  }
                }
              }
              if (stringFields.length > 0) {
                const I = ' '.repeat(ctx.indent * depth);
                for (const fn of stringFields) {
                  lines.push(`${I}tsc_string_retain(${srcC}.${fn});`);
                }
              }
              if (sp.expr?.kind === 'Ident') {
                const srcSym = ctx.lookup(sp.expr.name);
                if (srcSym && srcSym.varKind !== 'const') {
                  srcSym._moved = true;
                  const srcName = sp.expr.name;
                  ctx._pushPostStmtCleanup(`memset(&${srcName}, 0, sizeof(${srcType}));`);
                }
              }
            }
          }
          for (const [key, val] of explicitMap) {
            resultProps.push([key, ctx.exprToC(val!, lines, depth), false]);
          }
          const props = resultProps.map(([k, v]) => `.${k} = ${v}`);
          return props.length > 0 ? `{${props.join(', ')}}` : `{}`;
        }
        const props = node.props.map((p: ObjLitProp) => {
          if (p.computed) throw ctx.error(`computed object key '[...]' is not supported; use StaticMap or inline the value`, node);
          return `.${p.key} = ${ctx.exprToC(p.value!, lines, depth)}`;
        });
        return props.length > 0 ? `{ ${props.join(', ')} }` : `{}`;
      }

      case 'FuncExpr':
      case 'Arrow': {
        const closure = ctx.hoistClosure(node, '_lambda');
        if (closure) {
          if (closure.retainLines?.length) {
          const I = ' '.repeat(ctx.indent * depth);
          for (const rl of closure.retainLines) lines.push(`${I}${rl}`);
        }
        const envLocal = `_lambda_env_${ctx.closureCount - 1}`;
        lines.push(`${' '.repeat(ctx.indent * depth)}${closure.envName} *${envLocal} = tsc_malloc(sizeof(${closure.envName}));`);
        lines.push(`${' '.repeat(ctx.indent * depth)}*${envLocal} = (${closure.envName})${closure.envInit};`);
        return `(tsc_closure){.env = ${envLocal}, .fn = (void*)${closure.fnName}}`;
        }
        const lambdaName = ctx.hoistArrow(node, 'void', '_lambda');
        return `(tsc_closure){.env = NULL, .fn = (void*)${lambdaName}}`;
      }

      case 'Match': {
        return ctx._matchExprToC(node, lines, depth);
      }

      case 'Cast': {
        ctx._checkNoBareThrows(node.expr);
        // as Volatile<T> → (volatile T *)expr; hex literals get U suffix
        if (node.castType.kind === 'TypeRef' && node.castType.name === 'Volatile') {
          const inner = ctx.resolveType(node.castType.typeArgs?.[0]);
          let exprC = ctx.exprToC(node.expr, lines, depth);
          if (/^0x[0-9a-fA-F]+$/.test(exprC)) exprC += 'U';
          return `(volatile ${inner} *)${exprC}`;
        }
        const ownershipTypes = ['Ref', 'Mut', 'Arc', 'Weak', 'Box', 'Rc'];
        if (node.castType.kind === 'TypeRef' && ownershipTypes.includes(node.castType.name)) {
          throw ctx.error(`cannot use "as" for ownership types`, node);
        }
        // String literal union → string: use values array
        if (node.castType.kind === 'TypeRef' && node.castType.name === 'string') {
          const exprType = ctx.inferType(node.expr);
          const exprEnumDef = ctx.classes.get(exprType);
          if (exprEnumDef?.isStringLiteralUnion) {
            const exprC = ctx.exprToC(node.expr, lines, depth);
            return `STR_LIT_RUNTIME(${exprType}_values[(int)${exprC}])`;
          }
          // Numeric type → string: cannot use "as", must use ".toString()"
          const numericTypes = ['int32_t','int64_t','int8_t','int16_t',
                                'uint8_t','uint16_t','uint32_t','uint64_t',
                                'float','double','size_t','bool'];
          if (numericTypes.includes(exprType)) {
            throw ctx.error(`cannot cast ${ctx.ctypeToTsName(exprType)} to string using "as"; use ".toString()"`, node);
          }
        }
        // Pointer cast (as *T): just return the inner expr — type annotation only, no C cast needed
        if (node.castType.kind === 'TypePointer') {
          return ctx.exprToC(node.expr, lines, depth);
        }
        const ct = ctx.resolveType(node.castType);
        // Char/string literal cast to char/u8: produce numeric value
        if ((ct === 'char' || ct === 'uint8_t') && node.expr.kind === 'Literal') {
          if (node.expr.litType === 'char') {
            const code = ctx._charCode(node.expr.value);
            return ct === 'uint8_t' ? code + 'U' : String(code);
          }
          if (node.expr.litType === 'string') {
            const code = ctx._stringLiteralToByte(node.expr);
            return ct === 'uint8_t' ? code + 'U' : String(code);
          }
        }
        const _prevET_cast = ctx._expectedType;
        ctx._expectedType = null;
        const exprC = ctx.exprToC(node.expr, lines, depth);
        ctx._expectedType = _prevET_cast;
        const srcType = ctx.inferType(node.expr);
        if (ct === 'tsc_unknown' && srcType !== 'tsc_unknown') {
          ctx._ensureUnknownStruct();
          const packer = ctx._unknownPackerFor(srcType);
          return `${packer}(${exprC})`;
        }
        if ((srcType === 'tsc_unknown' || srcType === '__array__' || srcType === '__object__') && ct !== 'tsc_unknown') {
          ctx._ensureUnknownStruct();
          const getter = ctx._unknownGetterFor(ct);
          if (ct.startsWith('Array_') || ctx.classes.has(ct)) {
            return `*${getter}(&${exprC})`;
          }
          return `${getter}(&${exprC})`;
        }
        // Non-null assertion: opt_T as T → unwrap with runtime panic if null
        if (srcType?.startsWith('opt_') && !ct.startsWith('opt_')) {
          const innerIdent = srcType.slice(4);
          const innerCType = ctx._arrIdentToCType(innerIdent);
          if (innerCType === ct) {
            return `(${exprC}.has_value ? ${exprC}.value : (fprintf(stderr, "panic: null cast to non-null\\n"), abort(), (${ct})0))`;
          }
          return `(${exprC}.has_value ? (${ct})${exprC}.value : (fprintf(stderr, "panic: null cast to non-null\\n"), abort(), (${ct})0))`;
        }
        if (srcType === ct) return exprC;
        if (ctx._strictRules?.has('no-lossy-cast') && srcType && ct && srcType !== ct) {
          const LOSSY = [
            ['int64_t','int32_t'],['int64_t','float'],['uint64_t','double'],
            ['int32_t','float'],['double','float'],['double','int32_t'],['double','int64_t'],
            ['float','int32_t'],['float','int64_t'],
            ['int64_t','int8_t'],['int64_t','int16_t'],['int64_t','uint8_t'],['int64_t','uint16_t'],['int64_t','uint32_t'],
            ['int32_t','int8_t'],['int32_t','int16_t'],['int32_t','uint8_t'],['int32_t','uint16_t'],
            ['int32_t','uint32_t'],['uint32_t','int32_t'],
            ['uint64_t','int32_t'],['uint64_t','int64_t'],
            ['uint32_t','int16_t'],['uint32_t','int8_t'],
            ['uint16_t','int8_t'],['uint16_t','uint8_t'],
            ['size_t','int32_t'],['size_t','int16_t'],['size_t','int8_t'],
          ];
          const tsName = (c: string) => c === 'double' ? 'f64' : c === 'float' ? 'f32' : c === 'size_t' ? 'usize' : c.replace(/_t$/,'').replace(/^u/,'u').replace(/^int/,'i');
          if (LOSSY.some(([s,t]) => srcType === s && ct === t)) {
            throw ctx.error(`lossy cast from ${tsName(srcType)} to ${tsName(ct)} is forbidden (no-lossy-cast); remove 'no-lossy-cast' from strict rules or use a safe widening path`, node);
          }
          // Decimal lossy casts: narrowing, decimal→integer (fractional loss), float→decimal (precision loss)
          const DEC_SET = new Set(['d8_t','d16_t','d32_t','d64_t']);
          const INT_SET = new Set(['int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t']);
          const FLOAT_SET = new Set(['double','float']);
          const DEC_SCALES: Record<string,number> = { 'd8_t':100,'d16_t':100,'d32_t':10000,'d64_t':100000000 };
          const DEC_BITS: Record<string,number> = { 'd8_t':8,'d16_t':16,'d32_t':32,'d64_t':64 };
          let decLossy = false;
          if (DEC_SET.has(srcType) && DEC_SET.has(ct)) {
            if (DEC_SCALES[ct] < DEC_SCALES[srcType] || DEC_BITS[ct] < DEC_BITS[srcType]) decLossy = true;
          } else if (DEC_SET.has(srcType) && INT_SET.has(ct)) {
            decLossy = true;
          } else if (FLOAT_SET.has(srcType) && DEC_SET.has(ct)) {
            decLossy = true;
          } else if (DEC_SET.has(srcType) && ct === 'float') {
            decLossy = true;
          }
          if (decLossy) {
            throw ctx.error(`lossy cast from ${tsName(srcType)} to ${tsName(ct)} is forbidden (no-lossy-cast); remove 'no-lossy-cast' from strict rules or use a safe widening path`, node);
          }
        }
        // Decimal cast: scale conversion needed (not a plain C cast)
        {
          const DECIMAL_SCALES_CAST: Record<string, number> = {
            'd8_t': 100, 'd16_t': 100, 'd32_t': 10000, 'd64_t': 100000000,
          };
          const srcDec = DECIMAL_SCALES_CAST[srcType ?? ''];
          const dstDec = DECIMAL_SCALES_CAST[ct];
          if (srcDec !== undefined || dstDec !== undefined) {
            const isFloatSrc = srcType === 'double' || srcType === 'float';
            const isFloatDst = ct === 'double' || ct === 'float';
            const llSuffix = ct === 'd64_t' ? 'LL' : '';
            if (srcDec !== undefined && dstDec !== undefined) {
              // decimal → decimal
              if (srcDec === dstDec) {
                return `(${ct})${exprC}`;
              } else if (dstDec > srcDec) {
                const ratio = dstDec / srcDec;
                return `(${ct})(${exprC} * ${ratio}${llSuffix})`;
              } else {
                const ratio = srcDec / dstDec;
                return `(${ct})(${exprC} / ${ratio}${llSuffix})`;
              }
            } else if (dstDec !== undefined) {
              // int/float → decimal: multiply by scale
              const scaleStr = isFloatSrc ? `${dstDec}.0` : `${dstDec}${llSuffix}`;
              return `(${ct})(${exprC} * ${scaleStr})`;
            } else {
              // decimal → int/float: divide by scale
              const scaleStr = isFloatDst ? `${srcDec}.0` : `${srcDec}`;
              return `(${ct})(${exprC} / ${scaleStr})`;
            }
          }
        }
        const needsParens = node.expr.kind === 'Binary' || node.expr.kind === 'Ternary';
        return needsParens ? `(${ct})(${exprC})` : `(${ct})${exprC}`;
      }

      case 'Typeof': {
        ctx._checkNoBareThrows(node.expr);
        const exprC = ctx.exprToC(node.expr, lines, depth);
        const sym = node.expr.kind === 'Ident' ? ctx.lookup(node.expr.name) : null;
        const ctype = sym?.ctype ?? 'int32_t';
        if (ctype === 'tsc_unknown') {
          ctx._ensureUnknownStruct();
          return `STR_LIT("unknown")`;
        }
        const tsName = ctx.ctypeToTsName(ctype);
        return `STR_LIT("${tsName}")`;
      }

      case 'Await': {
        // await t.join() in non-async context → tsc_thread_join(t)
        if (!ctx._inAsyncFunc) {
          if (node.expr?.kind === 'Call' &&
              node.expr.callee?.kind === 'Member' && node.expr.callee.prop === 'join') {
            const tObj = node.expr.callee.object;
            const tSym2 = tObj?.kind === 'Ident' ? ctx.lookup(tObj.name) : null;
            if (tSym2?._isThread || tSym2?.ctype === 'tsc_thread_t') {
              const tC2 = ctx.exprToC(tObj, lines, depth);
              return `tsc_thread_join(${tC2})`;
            }
          }
          throw ctx.error(`"await" can only be used inside an "async" function`, node);
        }
        // Check for await on non-async variable (e.g. await x where x: i32)
        if (node.expr?.kind === 'Ident') {
          const awaitSym = ctx.lookup(node.expr.name);
          if (awaitSym && !awaitSym._isAsync && awaitSym.varKind) {
            const t = awaitSym.ctype ?? 'unknown';
            throw ctx.error(`"await" can only be applied to Promise<T>, got ${t}`, node);
          }
        }
        return ctx.exprToC(node.expr, lines, depth);
      }
      case 'Yield':    { if (node.value) ctx._checkNoBareThrows(node.value); return node.value ? ctx.exprToC(node.value, lines, depth) : '0'; }
      case 'Drop': {
        ctx._checkNoBareThrows(node.expr);
        // drop(x) for pool opt_ref_T → T_drop(x)
        const dropExpr = node.expr;
        const dropSym = dropExpr?.kind === 'Ident' ? ctx.lookup(dropExpr.name) : null;
        const dropType = dropSym?.ctype ?? ctx.inferType(dropExpr);
        const _dpcn = dropType?.startsWith('opt_ref_') ? dropType.slice(8) : null;
        if (_dpcn && ctx.classes.get(_dpcn)?._isPool) {
          ctx._ensurePoolDrop(_dpcn);
          const _dc = ctx.classes.get(_dpcn);
          const _dropArg = dropExpr?.kind === 'Ident' ? dropExpr.name : ctx.exprToC(dropExpr, lines, depth);
          return `${_dc?._poolDropFn}(${_dropArg})`;
        }
        throw ctx.error(`drop() can only be used on pool-allocated types`, node);
      }
      case 'NonNull': {
        const innerExpr: Expression = node.expr;
        const callee = innerExpr?.kind === 'Call' ? innerExpr.callee : undefined;
        const calleeSym = (callee?.kind === 'Ident') ? ctx.lookup(callee.name) : null;
        if (calleeSym?._isThrowsFunc) {
          if (ctx._inAsyncFunc) {
            throw ctx.error(`TypeError: '!' error handling is not supported in async functions; use try/catch on await`);
          }
          const I = ' '.repeat(ctx.indent * depth);
          const resName = `_res_${ctx.tempCount++}`;
          const callC = ctx.exprToC(innerExpr, lines, depth);
          lines.push(`${I}${calleeSym._resultType} ${resName} = ${callC};`);
          lines.push(`${I}if (!${resName}.ok) { tsc_panic(${ctx._panicMsgExpr(resName, calleeSym._resultErrTypes)}); }`);
          if (calleeSym._resultIsVoid) return '((void)0)';
          return `${resName}.value`;
        }
        return ctx.exprToC(innerExpr, lines, depth);
      }
      case 'Propagate': {
        if (ctx._inAsyncFunc) {
          throw ctx.error(`TypeError: '?' error propagation is not supported in async functions; use try/catch on await`);
        }
        const innerExpr: Expression = node.expr;
        const callee = innerExpr?.kind === 'Call' ? innerExpr.callee : undefined;
        const calleeSym = (callee?.kind === 'Ident') ? ctx.lookup(callee.name) : null;
        if (!calleeSym?._isThrowsFunc) {
          const calleeName = callee?.kind === 'Ident' ? callee.name : '?';
          throw ctx.error(`TypeError: Cannot use '?' on '${calleeName}()': function does not throw`);
        }
        if (!ctx._throwsCtx) {
          const fnName = ctx.currentFuncName ?? '<function>';
          throw ctx.error(`TypeError: Cannot use '?' in '${fnName}': function does not declare 'throws'`);
        }
        const throwsData = ctx._throwsCtx!;
        const I = ' '.repeat(ctx.indent * depth);
        const resName = `_res_${ctx.tempCount++}`;
        const callC = ctx.exprToC(innerExpr!, lines, depth);
        lines.push(`${I}${calleeSym._resultType} ${resName} = ${callC};`);
        const _wrappedErr = ctx._wrapErrForCaller(throwsData, `${resName}.error`, calleeSym);
        if (ctx._usesGotoCleanup) {
          lines.push(`${I}if (!${resName}.ok) { _result = (${throwsData.resultType}){.ok = false, .error = ${_wrappedErr}}; goto cleanup; }`);
        } else if (ctx._hasPendingCleanups()) {
          lines.push(`${I}if (!${resName}.ok) {`);
          ctx._emitFuncCleanup(lines, I + ' '.repeat(ctx.indent));
          lines.push(`${I}    return (${throwsData.resultType}){.ok = false, .error = ${_wrappedErr}};`);
          lines.push(`${I}}`);
        } else {
          lines.push(`${I}if (!${resName}.ok) { return (${throwsData.resultType}){.ok = false, .error = ${_wrappedErr}}; }`);
        }
        if (calleeSym._resultIsVoid) return '((void)0)';
        return `${resName}.value`;
      }
      case 'OptChain': {
        ctx._checkNoBareThrows(node.object);
        const objType = ctx.inferType(node.object);
        if (objType?.startsWith('opt_')) {
          const innerIdent = objType.slice(4);
          const innerCType = ctx._arrIdentToCType(innerIdent);
          const classDef = ctx.classes.get(innerCType);
          const field = classDef?.fields?.find((f) => f.name === node.prop);
          const fieldCType = field?.typeAnn ? ctx.resolveType(field.typeAnn) : (field?._ctype ?? 'int32_t');
          const fieldIdent = ctx.cTypeToIdent(fieldCType);
          const optFieldType = `opt_${fieldIdent}`;
          ctx._ensureOptStruct(optFieldType, fieldCType);
          let objC = ctx.exprToC(node.object, lines, depth);
          if (!['Ident', 'Literal'].includes(node.object.kind)) {
            const tmp = `_tsc_oc_${ctx.tempCount++}`;
            lines.push(`${' '.repeat(ctx.indent * depth)}${objType} ${tmp} = ${objC};`);
            objC = tmp;
          }
          return `${objC}.has_value ? (${optFieldType}){true, ${objC}.value.${node.prop}} : (${optFieldType}){false, 0}`;
        }
        const obj = ctx.exprToC(node.object, lines, depth);
        return `${obj}.${node.prop}`;
      }

      default:
        throw ctx.error(`internal: unhandled expression kind '${node.kind}'`, node);
    }
}

export function _truthyToC(ctx: CodeGenContext, node: Expression, lines: string[] = [], depth: number = 0): string {
    const type = ctx.inferType(node);
    if (!type || type === 'bool' || type === 'void *') {
      return ctx.exprToC(node, lines, depth);
    }
    const numericTypes = new Set([
      'int8_t','int16_t','int32_t','int64_t',
      'uint8_t','uint16_t','uint32_t','uint64_t',
      'float','double','size_t','char',
    ]);
    if (numericTypes.has(type)) {
      return ctx.exprToC(node, lines, depth);
    }
    if (type === 'String') {
      const c = ctx.exprToC(node, lines, depth);
      return `${c}.length > 0`;
    }
    if (type.startsWith('opt_')) {
      const innerIdent = type.slice(4);
      const innerCType = ctx._arrIdentToCType(innerIdent);
      const c = ctx.exprToC(node, lines, depth);
      if (innerCType === 'String') {
        return `${c}.has_value && ${c}.value.length > 0`;
      }
      if (numericTypes.has(innerCType)) {
        return `${c}.has_value && ${c}.value != 0`;
      }
      return `${c}.has_value`;
    }
    if (ctx.classes.has(type) || type.startsWith('Array_') || type.startsWith('TscMap_') || type.startsWith('Map_') || type.startsWith('TscSet_') || type.startsWith('Set_')) {
      ctx.warn(`condition is always true`, node);
      return '1';
    }
    return ctx.exprToC(node, lines, depth);
}
