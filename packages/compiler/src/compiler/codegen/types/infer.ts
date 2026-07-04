import type { CodeGenContext } from '../../codegen.js';
import type { Expression, Call, TypeAnn, Arrow, Member, TypeRef, Ident, MethodSig } from '@tsclang/ast';
import { inferLiteralCType, PRIMITIVE_MAP } from '../../types.js';

interface RtField { name?: string; label?: string; typeAnn?: TypeAnn; ctype?: string; _ctype?: string; }
interface RtMethod { name: string; returnType?: TypeAnn | null; }
interface RtTypeParam { name: string; }

// infer.ts
export function inferType(ctx: CodeGenContext, node: Expression | null | undefined): string {
    if (!node) return 'double';
    switch (node.kind) {
      case 'Literal':  return inferLiteralCType(node, ctx._defaultNumber);
      case 'TemplateLit': return 'String';
      case 'Ident': {
        if (node.name === 'true' || node.name === 'false') return 'bool';
        if (node.name === 'null') return 'void *';
        const sym = ctx.lookup(node.name);
        // Narrowed unknown variable: return narrowed C type
        if (ctx._narrowedVars?.has(node.name) && sym?.ctype === 'tsc_unknown' && ctx._narrowedUnknownVars?.has(node.name)) {
          return ctx._narrowedUnknownVars.get(node.name)!;
        }
        // Narrowed opt variable: return inner C type
        if (ctx._narrowedVars?.has(node.name) && sym?.ctype?.startsWith('opt_')) {
          const innerIdent = sym.ctype.slice(4);
          return ctx._arrIdentToCType(innerIdent);
        }
        return sym?.ctype ?? 'int32_t';
      }
      case 'Binary': {
        if (node.op === '**') return 'double';
        if (['+','-','*','/','%'].includes(node.op)) {
          const lt = ctx.inferType(node.left);
          const rt = ctx.inferType(node.right);
          if (lt === 'String' || lt === 'String *' || rt === 'String' || rt === 'String *') return 'String';
          if (lt === 'double' || rt === 'double') return 'double';
          if (lt === 'float'  || rt === 'float')  return 'float';
          const INT_RANK: Record<string, number> = {
            'int8_t': 1, 'uint8_t': 2, 'int16_t': 3, 'uint16_t': 4,
            'int32_t': 5, 'uint32_t': 6, 'int64_t': 7, 'uint64_t': 8,
          };
          if (INT_RANK[lt] && INT_RANK[rt]) return INT_RANK[lt] >= INT_RANK[rt] ? lt : rt;
          return lt;
        }
        // Bitwise/shift ops always yield integer
        if (['&','|','^','<<','>>'].includes(node.op)) return ctx.inferType(node.left);
        if (node.op === '>>>') return 'int32_t';
        if (node.op === '??') {
          const lt = ctx.inferType(node.left);
          if (lt?.startsWith('opt_')) return ctx._arrIdentToCType(lt.slice(4));
          return lt || ctx.inferType(node.right);
        }
        return 'bool';
      }
      case 'OptChain': {
        const objType = ctx.inferType(node.object);
        if (objType?.startsWith('opt_')) {
          const innerIdent = objType.slice(4);
          const innerCType = ctx._arrIdentToCType(innerIdent);
          const classDef = ctx.classes.get(innerCType);
          const field = classDef?.fields?.find((f) => f.name === node.prop);
          const fieldCType = field?.typeAnn ? ctx.resolveType(field.typeAnn) : (field?._ctype ?? 'int32_t');
          return `opt_${ctx.cTypeToIdent(fieldCType)}`;
        }
        return 'int32_t';
      }
      case 'Member': {
        // process.stdin/stdout/stderr (std/io)
        if (ctx._stdIoImported && node.object.kind === 'Ident' && node.object.name === 'process') {
          if (node.prop === 'stdin') return 'TscReader';
          if (node.prop === 'stdout' || node.prop === 'stderr') return 'TscWriter';
        }
        // Math constants are double
        if (node.object.kind === 'Ident' && node.object.name === 'Math') {
          const mathFloatConsts = ['PI', 'E', 'LN2', 'LN10', 'SQRT2', 'SQRT1_2', 'LOG2E', 'LOG10E'];
          if (mathFloatConsts.includes(node.prop)) return 'double';
        }
        // Number.* constants: type-specific integer limits + JS standard float constants
        if (node.object.kind === 'Ident' && node.object.name === 'Number') {
          const intLimitTypes: Record<string, string> = {
            MAX_I8: 'int8_t',  MIN_I8: 'int8_t',
            MAX_I16: 'int16_t', MIN_I16: 'int16_t',
            MAX_I32: 'int32_t', MIN_I32: 'int32_t',
            MAX_I64: 'int64_t', MIN_I64: 'int64_t',
            MAX_U8: 'uint8_t', MAX_U16: 'uint16_t',
            MAX_U32: 'uint32_t', MAX_U64: 'uint64_t',
          };
          if (intLimitTypes[node.prop]) return intLimitTypes[node.prop];
          if (node.prop === 'MAX_SAFE_INTEGER' || node.prop === 'MIN_SAFE_INTEGER') return 'int64_t';
          const floatConsts = ['MAX_VALUE', 'MIN_VALUE', 'EPSILON',
            'POSITIVE_INFINITY', 'NEGATIVE_INFINITY', 'NaN'];
          if (floatConsts.includes(node.prop)) return 'double';
        }
        // String.fromCharCode → String
        if (node.object.kind === 'Ident' && node.object.name === 'String' && node.prop === 'fromCharCode') return 'String';
        if (node.prop === 'length')   return 'size_t';
        if (node.prop === 'capacity') return 'size_t';
        if (node.prop === 'size') {
          const ot = ctx.inferType(node.object);
          if (ctx._mapSuffix(ot)) return 'size_t';
          const _szSym = node.object.kind === 'Ident' ? ctx.lookup(node.object.name) : null;
          if (_szSym?._isSet) return 'size_t';
        }
        if (node.prop === 'data') {
          const _datObjType = ctx.inferType(node.object);
          if (_datObjType === 'String') return 'const char *';
          // else fall through to struct field lookup
        }
        if (node.prop === 'bytes') {
          const bt = ctx.inferType(node.object);
          if (bt === 'String') return 'Slice_u8';
        }
        if (node.prop === 'message') return 'String';
        // Enum member access
        if (node.object.kind === 'Ident') {
          const enumDef = ctx.classes.get(node.object.name);
          if (enumDef?.isEnum) return node.object.name;
          // Struct member access: p.x where p is a struct type
          const objSym = ctx.lookup(node.object.name);
          if (objSym) {
            const structDef = (objSym.ctype ? ctx.classes.get(objSym.ctype) : null) ?? (objSym.derefType ? ctx.classes.get(objSym.derefType) : null);
            if (structDef?.fields) {
              const field = structDef.fields.find((f) => f.name === node.prop);
              if (field?.typeAnn) return ctx.resolveType(field.typeAnn);
              if (field?.ctype) return field.ctype;
              // Check inherited fields from superClass
              if (structDef.superClass) {
                const baseDef = ctx.classes.get(structDef.superClass);
                const baseField = baseDef?.fields?.find((f) => f.name === node.prop);
                if (baseField?.typeAnn) return ctx.resolveType(baseField.typeAnn);
              }
            }
            // Labeled tuple access: p.x → type of field with label 'x'
            if (structDef?.isTuple) {
              const field = structDef.fields?.find((f) => f.label === node.prop);
              if (field?.ctype) return field.ctype.replace(' *', '');
            }
          }
        }
        // Temporal struct field access
        if (ctx._stdTemporalImported && node.object.kind === 'Ident') {
          const _tpSym = ctx.lookup(node.object.name);
          const _tpCtype = _tpSym?.ctype ?? '';
          const _tpIntFields = ['year', 'month', 'day', 'hour', 'minute', 'second',
                                'days', 'hours', 'minutes', 'seconds',
                                'epochNanoseconds', 'epochSeconds', 'epochMilliseconds'];
          if (['TscPlainDate','TscPlainTime','TscPlainDateTime','TscInstant',
               'TscDuration','TscZonedDateTime'].includes(_tpCtype)) {
            if (_tpIntFields.includes(node.prop)) return 'int32_t';
            if (node.prop === 'timeZone') return 'String';
          }
        }
        // TscPerfEntry field access (from performance.measure())
        if (node.object.kind === 'Ident') {
          const _peSym = ctx.lookup(node.object.name);
          if (_peSym?.ctype === 'TscPerfEntry') {
            if (node.prop === 'name') return 'String';
            if (node.prop === 'duration' || node.prop === 'startTime') return 'double';
          }
        }
        // Blob / TscBlob field access
        if (node.object.kind === 'Ident') {
          const _blobMSym = ctx.lookup(node.object.name);
          if (_blobMSym?._isBlob || _blobMSym?._isTscBlob || _blobMSym?.ctype === 'Blob' || _blobMSym?.ctype === 'TscBlob') {
            if (node.prop === 'size') return 'size_t';
            if (node.prop === 'type') return 'String';
          }
        }
        // URL field access
        if (ctx._stdUrlImported && node.object.kind === 'Ident') {
          const _urlSym = ctx.lookup(node.object.name);
          if (_urlSym?._isURL) {
            const _urlFields = ['protocol', 'host', 'pathname', 'hash', 'search', 'hostname', 'port', 'href'];
            if (_urlFields.includes(node.prop)) return 'String';
            if (node.prop === 'searchParams') return 'TscURLSearchParams';
          }
        }
        // AbortController / AbortSignal field access
        if (node.object.kind === 'Ident') {
          const _abortSym = ctx.lookup(node.object.name);
          if (_abortSym?.ctype === 'TscAbortController') {
            if (node.prop === 'signal') return 'TscAbortSignal *';
          }
          if (_abortSym?.ctype === 'TscAbortSignal *') {
            if (node.prop === 'aborted') return 'bool';
          }
        }
        // Fallback: infer object type recursively (e.g. call result member access)
        {
          const objType = ctx.inferType(node.object);
          if (objType && objType !== 'int32_t') {
            let sd = ctx.classes.get(objType);
            if (!sd && objType.endsWith('*')) {
              const stripped = objType.replace(/^(const |mutable )/, '').replace(/ \*$/, '');
              sd = ctx.classes.get(stripped);
            }
            if (sd?.fields) {
              const f = sd.fields.find((ff) => ff.name === node.prop);
              if (f?.typeAnn) return ctx.resolveType(f.typeAnn);
              if (f?.ctype) return f.ctype;
            }
          }
        }
        return 'int32_t';
      }
      case 'Call': return ctx._inferCall(node);
      case 'New': {
        if (node.name === 'Date') return 'Date';
        if (node.name === 'Error') return 'TscError';
        if (node.name === 'MathError') return 'MathError';
        if (node.name === 'UDPSocket') return 'TscUdpSocket';
        if (node.name === 'WebSocketServer') return 'TscWebSocketServer';
        if (node.name === 'Array' || node.name === 'ReadonlyArray') {
          const et = node.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'int32_t';
          return `Array_${ctx.cTypeToIdent(et)}`;
        }
        if (node.name === 'Map') {
          const [kt, vt] = (node.typeArgs ?? []).map((t: TypeAnn) => ctx.resolveType(t));
          const k = kt ? ctx.cTypeToIdent(kt) : 'string';
          const v = vt ? ctx.cTypeToIdent(vt) : 'i32';
          return `TscMap_${k}_${v}`;
        }
        if (node.name === 'Set') {
          const et = node.typeArgs?.[0] ? ctx.resolveType(node.typeArgs[0]) : 'int32_t';
          return `TscSet_${ctx.cTypeToIdent(et)}`;
        }
        const tArgs = node.typeArgs;
        if (tArgs && tArgs.length > 0) {
          const result = ctx.computeMonoName(node.name, tArgs);
          if (result) return result.monoName;
        }
        const poolCls = ctx.classes.get(node.name);
        if (poolCls?._isPool) return `opt_ref_${node.name}`;
        if (poolCls?._isHeap) return `${node.name} *`;
        return node.name;
      }
      case 'ObjLit': return 'int32_t';
      case 'ArrayLit': {
        const first = node.elems.find((e: { expr: Expression; spread?: boolean }) => !e.spread);
        const et = first ? ctx.inferType(first.expr) : 'int32_t';
        return `Array_${ctx.cTypeToIdent(et)}`;
      }
      case 'Index': {
        // req.params["key"] → String
        if (node.object.kind === 'Member' && node.object.prop === 'params') {
          const reqSym = node.object.object.kind === 'Ident' ? ctx.lookup(node.object.object.name) : null;
          if (reqSym?.ctype === 'TscRequest *') return 'String';
        }
        const objType = ctx.inferType(node.object);
        // Tuple index: pair[0] → type of field _0
        const tupleDef2 = ctx.classes.get(objType);
        if (tupleDef2?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const field = tupleDef2.fields?.[parseInt(node.index.value, 10)];
          if (field?.ctype) return field.ctype.replace(' *', '');
        }
        // Buffer/DataView/String indexing → uint8_t
        if (objType === 'Buffer' || objType === 'DataView' || objType === 'String') return 'uint8_t';
        // Slice_T / MutSlice_T indexing → element type
        if (objType?.startsWith('Slice_') || objType?.startsWith('MutSlice_')) {
          const etIdent = objType.startsWith('MutSlice_') ? objType.slice(9) : objType.slice(6);
          const primMap2: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
                             u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
                             f32:'float', f64:'double', bool:'bool', usize:'size_t', string:'String' };
          return primMap2[etIdent] ?? etIdent;
        }
        // Pointer to Array_T * → element type
        const _ptrArr = objType?.match(/^(?:const )?Array_(\w+) \*$/);
        if (_ptrArr) {
          const primMap: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
                            u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
                            f32:'float', f64:'double', bool:'bool', usize:'size_t', string:'String' };
          return primMap[_ptrArr[1]] ?? _ptrArr[1];
        }
        // Array_ref_T → T * (ref array element is a pointer)
        if (objType?.startsWith('Array_ref_')) {
          const innerIdent = objType.slice(10);
          const primMap: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
                            u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
                            f32:'float', f64:'double', bool:'bool', usize:'size_t', string:'String' };
          const innerCType = primMap[innerIdent] ?? innerIdent;
          return `${innerCType} *`;
        }
        // Array_T → T (array element type)
        if (objType?.startsWith('Array_')) {
          const etIdent = objType.slice(6);
          const primMap: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
                            u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
                            f32:'float', f64:'double', bool:'bool', usize:'size_t', string:'String' };
          return (primMap as Record<string, string>)[etIdent] ?? etIdent;
        }
        // T * → T  (pointer element type)
        if (objType.endsWith(' *')) return objType.slice(0, -2);
        return 'int32_t';
      }
      case 'Cast': {
        const ct = ctx.resolveType(node.castType);
        const srcType = ctx.inferType(node.expr);
        if (srcType === 'tsc_unknown' && ct !== 'tsc_unknown') {
          return ct;
        }
        return ct;
      }
      case 'Ternary': return ctx.inferType(node.yes);
      case 'Unary': {
        if (node.op === '!') return 'bool';
        if (node.op === '-' || node.op === '+' || node.op === '~') return ctx.inferType(node.expr);
        if (node.op === '*') {
          // Dereference: type of *ptr is the pointee type
          const ptrType = ctx.inferType(node.expr);
          if (ptrType.endsWith(' *')) return ptrType.slice(0, -2);
          return 'int32_t';
        }
        if (node.op === '&') {
          // Address-of: type of &x is x's type followed by *
          const baseType = ctx.inferType(node.expr);
          return `${baseType} *`;
        }
        return ctx.inferType(node.expr);
      }
      case 'Typeof': return 'String';
      case 'RangeIndex': {
        const objType = ctx.inferType(node.object);
        if (objType === 'String') return 'String';
        if (objType?.startsWith('Array_')) return objType;
        return 'int32_t';
      }
      case 'Assign': return ctx.inferType(node.left);
      case 'NonNull':
      case 'Propagate': return ctx.inferType(node.expr);
      case 'Await': {
        const innerType = ctx.inferType(node.expr);
        if (innerType?.startsWith('Promise_')) return innerType.slice(8);
        return innerType;
      }
      case 'Arrow':
      case 'FuncExpr': return 'tsc_closure';
      case 'Drop': return 'void';
      case 'Yield': return ctx._asyncGenRetType ?? 'int32_t';
      case 'Match': return (node.cases?.length > 0) ? ctx.inferType(node.cases[0].body) : 'int32_t';
      default: return 'int32_t';
    }
}

export function _effectiveType(ctx: CodeGenContext, node: Expression | null | undefined): string {
    if (!node) return 'double';
    const dn = ctx._defaultNumber;
    const floatDefault = dn === 'f64' || dn === 'f32';
    const decDefault = dn === 'd8' || dn === 'd16' || dn === 'd32' || dn === 'd64';
    switch (node.kind) {
      case 'Literal': {
        if (node.litType !== 'number') return ctx.inferType(node);
        const v = node.value;
        if (!v.includes('.') && !v.includes('e') && !v.includes('E')) {
          if (floatDefault) return ctx._cap('bits') < 32 ? 'int16_t' : 'int32_t';
          return inferLiteralCType(node, dn);
        }
        if (decDefault) return PRIMITIVE_MAP[dn] || 'double';
        return dn === 'f32' ? 'float' : 'double';
      }
      case 'Binary': {
        if (node.op === '**') return 'double';
        if (node.op === '>>>') return 'int32_t';
        const numOps = ['+','-','*','/','%','&','|','^','<<','>>'];
        if (!numOps.includes(node.op)) return ctx.inferType(node);
        const lt = ctx._effectiveType(node.left);
        const rt = ctx._effectiveType(node.right);
        if (lt === 'String' || lt === 'String *' || rt === 'String' || rt === 'String *') return 'String';
        if (lt === 'double' || rt === 'double') return 'double';
        if (lt === 'float'  || rt === 'float')  return 'float';
        const si = ctx._numericTypeInfo(lt);
        const di = ctx._numericTypeInfo(rt);
        if (si && di && si.kind === 'int' && di.kind === 'int') {
          if (di.bits > si.bits) return rt;
          if (di.bits === si.bits && !di.signed) return rt;
          return lt;
        }
        return lt;
      }
      case 'Unary': {
        if (node.op === '-' || node.op === '+' || node.op === '~') return ctx._effectiveType(node.expr);
        return ctx.inferType(node);
      }
      case 'Ternary': {
        return ctx._effectiveType(node.yes);
      }
      case 'Match': {
        return (node.cases?.length > 0) ? ctx._effectiveType(node.cases[0].body) : 'int32_t';
      }
      default:
        return ctx.inferType(node);
    }
}

export function _inferCall(ctx: CodeGenContext, node: Call): string {
    if (node.callee.kind === 'OptChain') {
      const objType = ctx.inferType(node.callee.object);
      if (objType?.startsWith('opt_') && node.callee.prop === 'toString') return 'opt_string';
      return 'int32_t';
    }
    if (node.callee.kind === 'Ident') {
      const sym = ctx.lookup(node.callee.name);
      if (sym?._isStackMacro === 'push') return 'void';
      if (sym?._isStackMacro === 'empty') return 'bool';
      if (sym?._isStackMacro === 'pop') {
        const tArg = node.typeArgs?.[0];
        return tArg ? ctx.resolveType(tArg) : 'int32_t';
      }
    }
    if (node.callee.kind === 'Ident') {
      const _sfn = node.callee.name;
      if (_sfn === 'structuredClone' && node.args?.[0]) {
        return ctx.inferType(node.args[0].expr);
      }
    }
    if (node.callee.kind === 'Ident' && ctx._genericFuncs?.has(node.callee.name)) {
      const tmpl = ctx._genericFuncs.get(node.callee.name);
      if (!tmpl) return 'int32_t';
      const subst = new Map();
      const typeParams = tmpl.typeParams ?? [];
      for (let i = 0; i < typeParams.length; i++) {
        const tp = typeParams[i];
        const typeArgs = node.typeArgs ?? [];
        let ctype;
        if (typeArgs[i]) ctype = ctx.resolveType(typeArgs[i]);
        else if (node.args?.[i]) ctype = ctx.inferType(node.args[i].expr);
        else ctype = 'int32_t';
        subst.set(tp.name, ctype);
      }
      if (tmpl.returnType) {
        const monoRet = ctx.substType(tmpl.returnType, subst);
        return ctx.resolveType(monoRet);
      }
      return 'int32_t';
    }
    if (node.callee.kind === 'Member') {
      const r = ctx._inferMemberCall(node);
      if (r !== null) return r;
    }
    if (node.callee.kind === 'Member' && node.callee.prop === 'next') {
      const genObj = node.callee.object;
      const genSym = genObj.kind === 'Ident' ? ctx.lookup(genObj.name) : null;
      if (genSym?._isGenState) {
        const gi = genSym._gi as unknown as { resultType?: string } | undefined;
        return gi?.resultType ?? genSym._resultType ?? 'int32_t';
      }
    }
    if (node.callee.kind === 'Member') {
      const callee = node.callee;
      const obj2 = callee.object;
      const sym2 = obj2.kind === 'Ident' ? ctx.lookup(obj2.name) : null;
      const objType2 = sym2?.ctype ?? ctx.inferType(obj2);
      let lookupType = objType2;
      if (lookupType?.startsWith('opt_ref_')) {
        const inner = lookupType.slice(8);
        if (ctx.classes.get(inner)?._isPool) lookupType = inner;
      }
      const cls2 = ctx.classes.get(lookupType);
      if (cls2?.methods) {
        const m2 = cls2.methods.find((m) => m.name === callee.prop);
        if (m2?.returnType) return ctx.resolveType(m2.returnType);
      }
      const ifaceType = sym2?.ctype ?? objType2;
      const ifaceDef = ctx.interfaces.get(ifaceType);
      if (ifaceDef) {
        const m3 = ifaceDef.find((m): m is MethodSig => m.kind === 'MethodSig' && m.name === callee.prop);
        if (m3?.returnType) return ctx.resolveType(m3.returnType);
      }
    }
    if (node.callee.kind === 'Ident') {
      const n2 = node.callee.name;
      if (n2 === 'parseInt' || n2 === 'tryParseInt') return 'opt_i32';
      if (n2 === 'parseFloat' || n2 === 'tryParseFloat' || n2 === 'Number') return 'opt_f64';
      if (n2 === 'String') return 'String';
      const sym = ctx.lookup(n2);
      if (sym?.ctype === 'tsc_closure' && sym.closureRetType && !sym.funcName) return sym.closureRetType;
      if (sym) return sym.ctype ?? 'int32_t';
    }
    return 'int32_t';
}

export function _inferMemberCall(ctx: CodeGenContext, node: Call): string | null {
    const callee = node.callee as Member;
    const obj = callee.object;
    const prop = callee.prop;
    if (obj.kind === 'Ident') {
      const nsSym2 = ctx.lookup(obj.name);
      if (nsSym2?._isNamespace) {
        const nsEntry2 = nsSym2._namespaceExports?.[prop];
        if (nsEntry2?.ctype) return nsEntry2.ctype;
      }
    }
    if (obj.kind === 'Ident' && obj.name === 'Array' && (prop === 'from' || prop === 'of')) {
      const typeArg = node.typeArgs?.[0];
      if (typeArg) {
        const ct = ctx.resolveType(typeArg);
        return `Array_${ctx.cTypeToIdent(ct)}`;
      }
      if (prop === 'of' && node.args?.length > 0) {
        const et = ctx.inferType(node.args[0].expr);
        return `Array_${ctx.cTypeToIdent(et)}`;
      }
      if (prop === 'from' && node.args?.[0]) {
        const srcType = ctx.inferType(node.args[0].expr);
        if (srcType?.startsWith('Array_')) return srcType;
      }
      return 'Array_i32';
    }
    if (obj.kind === 'Ident' && prop === 'alloc' && ctx.classes.get(obj.name)?._isPool) {
      throw ctx.error(`PoolClass.alloc() is removed; use "new ${obj.name}()" instead`, node);
    }
    if (obj.kind === 'Ident' && obj.name === 'performance') {
      if (prop === 'measure') return 'TscPerfEntry';
      return 'double';
    }
    if (obj.kind === 'Ident' && obj.name === 'Math') {
      if (prop === 'clz32' || prop === 'imul') return 'int32_t';
      if (prop === 'fround') return 'float';
      if (prop === 'saturatingCast') {
        const tname = (node.typeArgs?.[0] as TypeRef | undefined)?.name ?? 'i32';
        const primMap: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
          u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
          f32:'float', f64:'double', bool:'bool', usize:'size_t' };
        return (primMap as Record<string, string>)[tname] ?? 'int32_t';
      }
      if (prop === 'checkedCast') {
        const tname = (node.typeArgs?.[0] as TypeRef | undefined)?.name ?? 'i32';
        const primMap: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
          u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
          f32:'float', f64:'double', bool:'bool', usize:'size_t' };
        const ctype = (primMap as Record<string, string>)[tname] ?? 'int32_t';
        const ident = ctx.cTypeToIdent(ctype);
        return `opt_${ident}`;
      }
      if (prop === 'abs' || prop === 'min' || prop === 'max') {
        const a0 = node.args?.[0];
        if (a0?.spread) {
          const arrType = ctx.inferType(a0.expr);
          const primMap: Record<string, string> = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
            u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
            f32:'float', f64:'double', bool:'bool', usize:'size_t' };
          const etIdent = arrType?.startsWith('Array_') ? arrType.slice(6) : null;
          if (etIdent && (primMap as Record<string, string>)[etIdent]) return (primMap as Record<string, string>)[etIdent];
        }
        const a0t = a0 ? ctx.inferType(a0.expr) : 'int32_t';
        if (a0t !== 'double' && a0t !== 'float') return 'int32_t';
      }
      return 'double';
    }
    if (obj.kind === 'Ident' && obj.name === 'Date' && prop === 'now') return 'int64_t';
    if (obj.kind === 'Ident' && obj.name === 'String' && prop === 'fromCharCode') return 'String';
    if (obj.kind === 'Ident' && obj.name === 'JSON') {
      if (prop === 'stringify') return 'String';
      if (prop === 'parse') {
        const tname = (node.typeArgs?.[0] as TypeRef | undefined)?.name ?? 'i32';
        if (tname === 'f64' || tname === 'f32') return 'double';
        if (tname === 'boolean') return 'bool';
        return 'int32_t';
      }
    }
    if (obj.kind === 'Ident' && (obj.name === 'Map' || obj.name === 'Object') && prop === 'groupBy') {
      const arrExpr = node.args?.[0]?.expr;
      if (arrExpr) {
        const arrType = ctx.inferType(arrExpr);
        if (arrType?.startsWith('Array_')) {
          const etIdent = arrType.slice(6);
          const etCType = ctx._arrIdentToCType(etIdent);
          ctx._ensureGroupByMapStruct(etIdent, etCType);
          return `TscMap_string_array_${etIdent}`;
        }
      }
      return 'int32_t';
    }
    if (obj.kind === 'Ident' && obj.name === 'Object') {
      if (prop === 'keys') return 'Array_string';
      if (prop === 'values' || prop === 'entries') {
        const argExpr = node.args?.[0]?.expr;
        if (argExpr) {
          const objType = ctx.inferType(argExpr);
          const cls = objType ? ctx.classes.get(objType) : null;
          if ((cls?.fields?.length ?? 0) > 0) {
            const firstType = ctx.resolveType(cls!.fields![0].typeAnn);
            const etIdent = ctx.cTypeToIdent(firstType);
            if (prop === 'values') return `Array_ref_${etIdent}`;
            const tupleName = `Tuple_string_ref_${etIdent}`;
            return `Array_${tupleName}`;
          }
        }
        return prop === 'values' ? 'Array_ref_i32' : 'Array_Tuple_string_ref_i32';
      }
    }
    if (obj.kind === 'Ident' && obj.name === 'console') return 'void';
    if (obj.kind === 'Ident' && ctx._stdTemporalImported) {
      const _tc = obj.name;
      if (_tc === 'PlainDate' && prop === 'from') return 'TscPlainDate';
      if (_tc === 'PlainTime' && prop === 'from') return 'TscPlainTime';
      if (_tc === 'PlainDateTime' && prop === 'from') return 'TscPlainDateTime';
      if (_tc === 'Instant' && prop === 'now') return 'TscInstant';
      if (_tc === 'ZonedDateTime' && prop === 'now') return 'TscZonedDateTime';
      if (_tc === 'Duration' && prop === 'from') return 'TscDuration';
      if (_tc === 'Now') {
        if (prop === 'instant') return 'TscInstant';
        if (prop === 'plainDate') return 'TscPlainDate';
      }
    }
    if (obj.kind === 'Ident' && ctx._stdTemporalImported) {
      const _tSym = ctx.lookup(obj.name);
      if (_tSym?.ctype === 'TscPlainDate') {
        if (prop === 'add') return 'TscPlainDate';
        if (prop === 'until') return 'TscDuration';
      }
    }
    if (obj.kind === 'Ident') {
      const _bSym = ctx.lookup(obj.name);
      if (_bSym?._isBuffer || _bSym?.ctype === 'Buffer') {
        if (prop === 'slice') return 'Buffer';
        if (prop === 'fill') return 'void';
      }
      if (_bSym?._isDataView || _bSym?.ctype === 'DataView') {
        const dvGetTypes: Record<string, string> = { getU8:'uint8_t', getI8:'int8_t', getU16:'uint16_t', getI16:'int16_t', getU32:'uint32_t', getI32:'int32_t', getU64:'uint64_t', getI64:'int64_t', getF32:'float', getF64:'double', getU16LE:'uint16_t', getU32LE:'uint32_t', getF64LE:'double' };
        if ((dvGetTypes as Record<string, string>)[prop]) return (dvGetTypes as Record<string, string>)[prop];
        if (prop.startsWith('set')) return 'void';
        if (prop === 'byteLength' || prop === 'byteOffset') return 'size_t';
      }
    }
    if (node.callee.kind === 'Index') {
      const _idxObjType = ctx.inferType(node.callee.object);
      if (_idxObjType === 'Buffer' || _idxObjType === 'DataView') return 'uint8_t';
    }
    if (prop === 'at' && ctx.inferType(obj) === 'String') return 'opt_u8';
    if (prop === 'toFixed' || prop === 'toPrecision') return 'String';
    if (obj.kind === 'Member' &&
        obj.object.kind === 'Ident' && obj.object.name === 'process' &&
        obj.prop === 'env') {
      if (prop === 'get') return 'opt_string';
      if (prop === 'has') return 'bool';
    }
    const _setSym0 = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (_setSym0?._isSet) {
      if (prop === 'has') return 'bool';
      if (prop === 'delete') return 'bool';
      if (prop === 'add' || prop === 'clear' || prop === 'forEach') return 'void';
      if (prop === 'values' || prop === 'keys') {
        const _setElemCType = _setSym0._setElemCType ?? 'int32_t';
        const _setId = ctx.cTypeToIdent(_setElemCType);
        return `Array_${_setId}`;
      }
      if (prop === 'entries') {
        const _setElemCType = _setSym0._setElemCType ?? 'int32_t';
        const _setId = ctx.cTypeToIdent(_setElemCType);
        return `Array_Tuple_${_setId}_${_setId}`;
      }
      if (prop === 'union' || prop === 'intersection' || prop === 'difference' || prop === 'symmetricDifference') {
        return _setSym0.ctype ?? null;
      }
      if (prop === 'isSubsetOf' || prop === 'isSupersetOf' || prop === 'isDisjointFrom') return 'bool';
    }
    const objSym0 = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    const objType0 = objSym0?.ctype ?? ctx.inferType(obj);
    const _mapSfx0 = ctx._mapSuffix(objType0);
    if (_mapSfx0) {
      const mapSuffix = _mapSfx0;
      const parts = mapSuffix.split('_');
      const kIdent = parts[0];
      const vIdent = parts.slice(1).join('_');
      const vCType = ctx._arrIdentToCType(vIdent);
      if (prop === 'get') {
        const optName = `opt_ref_${vIdent}`;
        ctx._ensureOptRefStruct(optName, vCType);
        return optName;
      }
      if (prop === 'delete') return 'bool';
      if (prop === 'has') return 'bool';
      if (prop === 'set' || prop === 'clear' || prop === 'forEach') return 'void';
      if (prop === 'values') {
        const arrName = `Array_${vIdent}`;
        ctx._ensureArrayStruct(arrName, vCType);
        return arrName;
      }
      if (prop === 'keys') {
        const kCType = ctx._arrIdentToCType(kIdent);
        const arrName = `Array_${kIdent}`;
        ctx._ensureArrayStruct(arrName, kCType);
        return arrName;
      }
      if (prop === 'entries') {
        const kCType = ctx._arrIdentToCType(kIdent);
        const vCTypeE = ctx._arrIdentToCType(vIdent);
        ctx._ensureMapEntry(mapSuffix, kCType, vCTypeE);
        return `Array_MapEntry_${mapSuffix}`;
      }
    }
    const objSymDate = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymDate?.ctype === 'Date') {
      if (prop === 'getTime' || prop === 'valueOf') return 'int64_t';
      if (prop === 'getTimezoneOffset') return 'int32_t';
      if (prop === 'toISOString' || prop === 'toString' || prop === 'toDateString' ||
          prop === 'toTimeString' || prop === 'toLocaleDateString' ||
          prop === 'toLocaleTimeString' || prop === 'toLocaleString') return 'String';
      if (prop.startsWith('get')) return 'int32_t';
      if (prop.startsWith('set')) return 'void';
    }
    const objSymA = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymA?._isAtomic) {
      if (prop === 'load' || prop === 'fetchAdd' || prop === 'fetchSub' || prop === 'fetchOr' || prop === 'fetchAnd' || prop === 'fetchXor' || prop === 'swap') return objSymA._atomicInner ?? 'int32_t';
      if (prop === 'store') return 'void';
      if (prop === 'compareExchange') return 'bool';
    }
    if (objSymA?._isAtomicArray) {
      if (prop === 'load' || prop === 'fetchAdd' || prop === 'fetchSub' || prop === 'fetchOr' || prop === 'fetchAnd' || prop === 'fetchXor' || prop === 'swap') return objSymA._atomicArrayInner ?? 'int32_t';
      if (prop === 'store') return 'void';
      if (prop === 'compareExchange') return 'bool';
    }
    if (objSymA?._isChannel) {
      if (prop === 'receive') return objSymA._channelInner ?? 'int32_t';
      if (prop === 'tryReceive') return `opt_${objSymA._channelIdent}`;
      if (prop === 'trySend' || prop === 'isEmpty' || prop === 'isFull') return 'bool';
      if (prop === 'length' || prop === 'capacity') return 'size_t';
      if (prop === 'send' || prop === 'close') return 'void';
    }
    if ((objSymA?.ctype === 'tsc_thread_t' || objSymA?._isThread) && prop === 'join') return 'void';
    const objSymAvr = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymAvr?._isAvrObj) {
      if ((obj as Ident).name === 'ADC' && prop === 'read') return 'uint16_t';
      return 'void';
    }
    const objSymRnd = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymRnd?._isRandom) {
      if (prop === 'nextF64') return 'double';
      if (prop === 'nextI32' || prop === 'range') return 'int32_t';
    }
    const objSymHm = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymHm?._isHashMap) {
      const _hmVt = objSymHm._hmValType ?? 'int32_t';
      const _hmVid = ctx.cTypeToIdent(_hmVt);
      if (prop === 'has') return 'bool';
      if (prop === 'get') return `opt_${_hmVid}`;
      if (prop === 'set' || prop === 'delete') return 'void';
    }
    if (objSymHm?._isStaticMapInline && prop === 'get') return 'opt_i32';
    if (ctx._stdIoImported && obj.kind === 'Ident') {
      const _ioSym2 = ctx.lookup(obj.name);
      if (_ioSym2?.ctype === 'Reader' && prop === 'read') return 'size_t';
      if (_ioSym2?.ctype === 'Writer' && prop === 'write') return 'size_t';
    }
    if (ctx._stdFsImported && obj.kind === 'Ident') {
      const _fsSym2 = ctx.lookup(obj.name);
      if (_fsSym2?._isFsNamespace) {
        if (prop === 'readFileSync') return 'String';
        if (prop === 'readFileBytesSync') return 'Array_u8';
        if (prop === 'existsSync') return 'bool';
        if (prop === 'readDirSync') return 'TscDirEntryArray';
        if (prop === 'statSync') return 'TscFileStat';
        return 'void';
      }
    }
    if (ctx._stdHalImported && obj.kind === 'Ident') {
      const _hc = obj.name; const _hp = prop;
      if (_hc === 'GPIO' && (_hp === 'read')) return 'bool';
      if (_hc === 'I2C' && _hp === 'read') return 'Array_u8';
      if (_hc === 'SPI' && _hp === 'transfer') return 'uint8_t';
      if (_hc === 'UART' && _hp === 'read') return 'opt_u8';
      if (_hc === 'UART' && _hp === 'available') return 'bool';
    }
    const objSymBlob = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymBlob?._isBlob) {
      if (prop === 'slice') return 'Blob';
      if (prop === 'arrayBuffer') return 'Buffer';
    }
    if (objSymBlob?._isTscBlob) {
      if (prop === 'text') return 'String';
    }
    const objSymUrl = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymUrl?._isURL || objSymUrl?._isURLSearchParams) {
      if (prop === 'get') return 'const char *';
      if (prop === 'set' || prop === 'delete') return 'void';
    }
    if (obj.kind === 'Member' && prop === 'get') {
      const _usym = obj.object.kind === 'Ident' ? ctx.lookup(obj.object.name) : null;
      if (_usym?._isURL && obj.prop === 'searchParams') return 'const char *';
    }
    const objSymRx = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (objSymRx?._isRegex) {
      if (prop === 'test') return 'bool';
      if (prop === 'match') return 'opt_Array_string';
      if (prop === 'matchAll') return 'Array_Array_string';
      if (prop === 'replace' || prop === 'replaceAll') return 'String';
    }
    const objSymAC = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    const objTypeAC = objSymAC?.ctype ?? ctx.inferType(obj);
    if (objTypeAC === 'TscAbortController') {
      if (prop === 'signal') return 'TscAbortSignal *';
      if (prop === 'abort') return 'void';
    }
    if (objTypeAC === 'TscAbortSignal *') {
      if (prop === 'aborted') return 'bool';
    }
    if (objTypeAC === 'TscAsyncMutex') {
      if (prop === 'tryLock' || prop === 'lock') return 'bool';
      if (prop === 'unlock') return 'void';
      if (prop === 'isLocked') return 'bool';
    }
    const _sigSymInf = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    if (_sigSymInf?._isSignal) {
      if (prop === 'get') return ctx._arrIdentToCType(_sigSymInf._signalElemType);
      if (prop === 'set') return 'void';
    }
    const objSym = obj.kind === 'Ident' ? ctx.lookup(obj.name) : null;
    let objType = objSym?.ctype ?? ctx.inferType(obj);
    if (objSym?.ctype === 'tsc_unknown' && obj.kind === 'Ident' && ctx._narrowedUnknownVars?.has(obj.name)) {
      objType = ctx._narrowedUnknownVars.get(obj.name)!;
    }
    if (objType?.startsWith('Array_')) {
      const et = objSym?.elemType ?? objType.slice(6);
      const etCType = objSym?.arrElemCType ?? 'int32_t';
      if (prop === 'pop') return et ? (ctx._isOptType(etCType) ? etCType : `opt_${et}`) : 'opt_i32';
      if (prop === 'shift') return et ? (ctx._isOptType(etCType) ? etCType : `opt_${et}`) : 'opt_i32';
      if (prop === 'remove') return etCType;
      if (prop === 'find' || prop === 'findLast') return et ? `opt_ref_${et}` : 'opt_ref_i32';
      if (prop === 'filter' || prop === 'concat' || prop === 'clone') return objType;
      if (prop === 'map' || prop === 'flatMap') {
        const cbArg = node.args?.[0]?.expr ?? node.args?.[0];
        if (cbArg?.kind === 'Arrow') {
          const outCType = ctx.inferTypeWithParams(cbArg, etCType);
          let outIdent = ctx.cTypeToIdent(outCType);
          if (prop === 'flatMap' && outCType?.startsWith('Array_')) {
            outIdent = outCType.slice(6);
          }
          return `Array_${outIdent}`;
        }
        if (cbArg?.kind === 'Ident') {
          const sym = ctx.lookup(cbArg.name);
          const retCType = sym?._closureFnName ? sym.closureRetType : sym?.ctype;
          if (retCType) {
            let outIdent = ctx.cTypeToIdent(retCType);
            if (prop === 'flatMap' && retCType.startsWith('Array_')) {
              outIdent = retCType.slice(6);
            }
            return `Array_${outIdent}`;
          }
        }
        return objType;
      }
      if (prop === 'slice') return objType;
      if (prop === 'values') return objType;
      if (prop === 'keys') return objType;
      if (prop === 'entries') return `Array_Tuple_i32_${et}`;
      if (prop === 'toReversed' || prop === 'toSorted' || prop === 'toSpliced') return objType;
      if (prop === 'with') return objType;
      if (prop === 'splice') return objType;
      if (prop === 'flat') return et?.startsWith('Array_') ? et : objType;
      if (prop === 'findIndex' || prop === 'indexOf' || prop === 'findLastIndex' || prop === 'lastIndexOf') return 'int32_t';
      if (prop === 'includes' || prop === 'every' || prop === 'some') return 'bool';
      if (prop === 'set') return 'void';
      if (prop === 'length' || prop === 'capacity') return 'size_t';
      if (prop === 'join') return 'String';
      if (prop === 'at') return etCType;
      if (prop === 'reduce' || prop === 'reduceRight') {
        const initExpr = node.args?.[1]?.expr;
        return initExpr ? ctx.inferType(initExpr) : (objSym?.arrElemCType ?? 'int32_t');
      }
    }
    if (objType === 'String' || objType === 'String *') {
      const _sret: Record<string, string> = {
        toLowerCase: 'String', toUpperCase: 'String', trim: 'String',
        trimStart: 'String', trimEnd: 'String', repeat: 'String',
        replace: 'String', replaceAll: 'String', padStart: 'String', padEnd: 'String',
        charAt: 'String', slice: 'String', substring: 'String',
        concat: 'String', toString: 'String',
        endsWith: 'bool', startsWith: 'bool', includes: 'bool',
        indexOf: 'int32_t', lastIndexOf: 'int32_t', charCodeAt: 'uint32_t',
        split: 'Array_String',
        at: 'opt_u8',
        search: 'int32_t',
        match: 'opt_Array_string',
        matchAll: 'Array_Array_string',
        length: 'size_t',
      };
      if (Object.hasOwn(_sret, prop)) return (_sret as Record<string, string>)[prop];
    }
    if (prop === 'fromValue' && obj.kind === 'Ident') {
      const ed = ctx.classes.get(obj.name);
      if (ed?.isEnum) return `opt_${obj.name}`;
    }
    if (prop === 'values' && obj.kind === 'Ident') {
      const ed = ctx.classes.get(obj.name);
      if (ed?.isEnum) return `${obj.name} *`;
    }
    if (prop === 'toString' && obj.kind === 'Ident') {
      const objSym2 = ctx.lookup(obj.name);
      const objEnumDef = objSym2?.ctype ? ctx.classes.get(objSym2.ctype) : null;
      if (objEnumDef?.isStringLiteralUnion) return 'const char *';
    }
    if (prop === 'toString' && obj.kind === 'Member') {
      const enumName = obj.object?.kind === 'Ident' ? obj.object.name : null;
      const ed = enumName ? ctx.classes.get(enumName) : null;
      if (ed?.isEnum) return 'const char *';
    }
    if (prop === 'toString') {
      const objType5 = ctx.inferType(obj);
      if (objType5 && !objType5.startsWith('Array_') && !ctx._mapSuffix(objType5) &&
          !objType5.startsWith('opt_') && objType5 !== 'void') {
        return 'String';
      }
    }
    const primitiveMap2: Record<string, string> = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                             'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                             'f32':'float','f64':'double' };
    if (obj.kind === 'Ident' && obj.name in primitiveMap2) {
      const cT = (primitiveMap2 as Record<string, string>)[obj.name];
      const etId = ctx.cTypeToIdent(cT);
      if (prop === 'parse') return cT;
      if (prop === 'tryParse') return `opt_${etId}`;
    }
    const objTypePromise = ctx.inferType(obj);
    if (objTypePromise?.startsWith('Promise_') && prop === 'then') {
      const cbArg = node.args[0];
      if (cbArg?.expr?.kind === 'Arrow') {
        const retType = cbArg.expr.returnType ? ctx.resolveType(cbArg.expr.returnType) : null;
        if (retType) return `Promise_${ctx.cTypeToIdent(retType)}`;
      }
      return objTypePromise;
    }
    if (objTypePromise?.startsWith('Promise_') && (prop === 'catch' || prop === 'finally')) {
      return objTypePromise;
    }
    return null;
}

export function inferTypeWithParams(ctx: CodeGenContext, arrowNode: Arrow, paramCType: string): string {
    const hasParams = arrowNode.params?.length > 0;
    if (hasParams) {
      ctx.pushScope();
      for (let i = 0; i < arrowNode.params.length; i++) {
        const p = arrowNode.params[i];
        const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : (i === 0 ? paramCType : 'void *');
        ctx.define(p.name, { ctype: ct === 'String *' ? 'String' : ct });
      }
    }
    let result;
    if (arrowNode.body?.kind !== 'Block') {
      result = ctx.inferType(arrowNode.body) ?? 'double';
    } else {
      for (const stmt of (arrowNode.body.body ?? [])) {
        if (stmt.kind === 'VarDecl' && stmt.init) {
          const initCt = ctx.inferType(stmt.init);
          if (initCt) ctx.define(stmt.name, { ctype: initCt === 'String *' ? 'String' : initCt });
        }
      }
      const retExpr = ctx._scanReturnExpr(arrowNode.body);
      result = retExpr ? (ctx.inferType(retExpr) ?? 'double') : 'void';
    }
    if (hasParams) ctx.popScope();
    return result;
}
