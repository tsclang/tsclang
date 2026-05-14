import { inferLiteralCType } from '../../types.js';
// infer.js
export default {
  inferType(node) {
    if (!node) return 'int32_t';
    switch (node.kind) {
      case 'Literal':  return inferLiteralCType(node);
      case 'TemplateLit': return 'String';
      case 'Ident': {
        if (node.name === 'true' || node.name === 'false') return 'bool';
        if (node.name === 'null') return 'void *';
        const sym = this.lookup(node.name);
        // Narrowed opt variable: return inner C type
        if (this._narrowedVars?.has(node.name) && sym?.ctype?.startsWith('opt_')) {
          const innerIdent = sym.ctype.slice(4);
          return this._arrIdentToCType(innerIdent);
        }
        return sym?.ctype ?? 'int32_t';
      }
      case 'Binary': {
        if (node.op === '**') return 'double';
        if (['+','-','*','/','%'].includes(node.op)) {
          const lt = this.inferType(node.left);
          const rt = this.inferType(node.right);
          if (lt === 'String' || rt === 'String') return 'String';
          if (lt === 'double' || rt === 'double') return 'double';
          if (lt === 'float'  || rt === 'float')  return 'float';
          return lt;
        }
        // Bitwise/shift ops always yield integer
        if (['&','|','^','<<','>>'].includes(node.op)) return this.inferType(node.left);
        if (node.op === '>>>') return 'int32_t';
        return 'bool';
      }
      case 'Member': {
        // process.stdin/stdout/stderr (std/io)
        if (this._stdIoImported && node.object.kind === 'Ident' && node.object.name === 'process') {
          if (node.prop === 'stdin') return 'TscReader';
          if (node.prop === 'stdout' || node.prop === 'stderr') return 'TscWriter';
        }
        // Math constants are double
        if (node.object.kind === 'Ident' && node.object.name === 'Math') {
          const mathFloatConsts = ['PI', 'E', 'LN2', 'LN10', 'SQRT2', 'SQRT1_2', 'LOG2E', 'LOG10E'];
          if (mathFloatConsts.includes(node.prop)) return 'double';
        }
        if (node.prop === 'length')   return 'size_t';
        if (node.prop === 'capacity') return 'size_t';
        if (node.prop === 'size') {
          const ot = this.inferType(node.object);
          if (this._mapSuffix(ot)) return 'size_t';
          const _szSym = node.object.kind === 'Ident' ? this.lookup(node.object.name) : null;
          if (_szSym?._isSet) return 'size_t';
        }
        if (node.prop === 'data') {
          const _datObjType = this.inferType(node.object);
          if (_datObjType === 'String') return 'const char *';
          // else fall through to struct field lookup
        }
        if (node.prop === 'bytes') {
          const bt = this.inferType(node.object);
          if (bt === 'String') return 'Slice_u8';
        }
        if (node.prop === 'message') return 'String';
        // Enum member access
        if (node.object.kind === 'Ident') {
          const enumDef = this.classes.get(node.object.name);
          if (enumDef?.isEnum) return node.object.name;
          // Struct member access: p.x where p is a struct type
          const objSym = this.lookup(node.object.name);
          if (objSym) {
            const structDef = this.classes.get(objSym.ctype) ?? this.classes.get(objSym.derefType);
            if (structDef?.fields) {
              const field = structDef.fields.find(f => (f.name ?? f) === node.prop);
              if (field?.typeAnn) return this.resolveType(field.typeAnn);
              if (field?.ctype) return field.ctype;
              // Check inherited fields from superClass
              if (structDef.superClass) {
                const baseDef = this.classes.get(structDef.superClass);
                const baseField = baseDef?.fields?.find(f => (f.name ?? f) === node.prop);
                if (baseField?.typeAnn) return this.resolveType(baseField.typeAnn);
              }
            }
            // Labeled tuple access: p.x → type of field with label 'x'
            if (structDef?.isTuple) {
              const field = structDef.fields.find(f => f.label === node.prop);
              if (field) return field.ctype.replace(' *', '');
            }
          }
        }
        // Temporal struct field access
        if (this._stdTemporalImported && node.object.kind === 'Ident') {
          const _tpSym = this.lookup(node.object.name);
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
          const _peSym = this.lookup(node.object.name);
          if (_peSym?.ctype === 'TscPerfEntry') {
            if (node.prop === 'name') return 'String';
            if (node.prop === 'duration' || node.prop === 'startTime') return 'double';
          }
        }
        // Blob / TscBlob field access
        if (node.object.kind === 'Ident') {
          const _blobMSym = this.lookup(node.object.name);
          if (_blobMSym?._isBlob || _blobMSym?._isTscBlob || _blobMSym?.ctype === 'Blob' || _blobMSym?.ctype === 'TscBlob') {
            if (node.prop === 'size') return 'size_t';
            if (node.prop === 'type') return 'String';
          }
        }
        // URL field access
        if (this._stdUrlImported && node.object.kind === 'Ident') {
          const _urlSym = this.lookup(node.object.name);
          if (_urlSym?._isURL) {
            const _urlFields = ['protocol', 'host', 'pathname', 'hash', 'search', 'hostname', 'port', 'href'];
            if (_urlFields.includes(node.prop)) return 'String';
            if (node.prop === 'searchParams') return 'TscURLSearchParams';
          }
        }
        // AbortController / AbortSignal field access
        if (node.object.kind === 'Ident') {
          const _abortSym = this.lookup(node.object.name);
          if (_abortSym?.ctype === 'TscAbortController') {
            if (node.prop === 'signal') return 'TscAbortSignal *';
          }
          if (_abortSym?.ctype === 'TscAbortSignal *') {
            if (node.prop === 'aborted') return 'bool';
          }
        }
        // Fallback: infer object type recursively (e.g. call result member access)
        {
          const objType = this.inferType(node.object);
          if (objType && objType !== 'int32_t') {
            let sd = this.classes.get(objType);
            if (!sd && objType.endsWith('*')) {
              const stripped = objType.replace(/^(const |mutable )/, '').replace(/ \*$/, '');
              sd = this.classes.get(stripped);
            }
            if (sd?.fields) {
              const f = sd.fields.find(ff => (ff.name ?? ff) === node.prop);
              if (f?.typeAnn) return this.resolveType(f.typeAnn);
              if (f?.ctype) return f.ctype;
            }
          }
        }
        return 'int32_t';
      }
      case 'Call': return this._inferCall(node);
      case 'New': {
        if (node.name === 'Date') return 'Date';
        if (node.name === 'Error') return 'TscError';
        if (node.name === 'UDPSocket') return 'TscUdpSocket';
        if (node.name === 'WebSocketServer') return 'TscWebSocketServer';
        if (node.name === 'Map') {
          const [kt, vt] = (node.typeArgs ?? []).map(t => this.resolveType(t));
          const k = kt ? this.cTypeToIdent(kt) : 'string';
          const v = vt ? this.cTypeToIdent(vt) : 'i32';
          return `TscMap_${k}_${v}`;
        }
        if (this._genericClasses?.has(node.name) && node.typeArgs?.length > 0) {
          const tmpl = this._genericClasses.get(node.name);
          const subst = new Map();
          for (let i = 0; i < tmpl.typeParams.length; i++) {
            const ct = node.typeArgs[i] ? this.resolveType(node.typeArgs[i]) : 'int32_t';
            subst.set(tmpl.typeParams[i].name, ct);
          }
          const suffix = tmpl.typeParams.map(tp => this.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
          return `${node.name}_${suffix}`;
        }
        return node.name;
      }
      case 'ObjLit': return 'int32_t';
      case 'ArrayLit': {
        const first = node.elems.find(e => !e.spread);
        const et = first ? this.inferType(first.expr) : 'int32_t';
        return `Array_${this.cTypeToIdent(et)}`;
      }
      case 'Index': {
        // req.params["key"] → String
        if (node.object.kind === 'Member' && node.object.prop === 'params') {
          const reqSym = node.object.object.kind === 'Ident' ? this.lookup(node.object.object.name) : null;
          if (reqSym?.ctype === 'TscRequest *') return 'String';
        }
        const objType = this.inferType(node.object);
        // Tuple index: pair[0] → type of field _0
        const tupleDef2 = this.classes.get(objType);
        if (tupleDef2?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const field = tupleDef2.fields[parseInt(node.index.value, 10)];
          if (field) return field.ctype.replace(' *', '');
        }
        // Buffer/DataView indexing → uint8_t
        if (objType === 'Buffer' || objType === 'DataView') return 'uint8_t';
        // Slice_T / MutSlice_T indexing → element type
        if (objType?.startsWith('Slice_') || objType?.startsWith('MutSlice_')) {
          const etIdent = objType.startsWith('MutSlice_') ? objType.slice(9) : objType.slice(6);
          const primMap2 = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
                             u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
                             f32:'float', f64:'double', bool:'bool', usize:'size_t', string:'String' };
          return primMap2[etIdent] ?? etIdent;
        }
        // Array_T → T (array element type)
        if (objType.startsWith('Array_')) {
          const etIdent = objType.slice(6);
          const primMap = { i8:'int8_t', i16:'int16_t', i32:'int32_t', i64:'int64_t',
                            u8:'uint8_t', u16:'uint16_t', u32:'uint32_t', u64:'uint64_t',
                            f32:'float', f64:'double', bool:'bool', usize:'size_t', string:'String' };
          return primMap[etIdent] ?? etIdent;
        }
        // T * → T  (pointer element type)
        if (objType.endsWith(' *')) return objType.slice(0, -2);
        return 'int32_t';
      }
      case 'Cast':   return this.resolveType(node.castType);
      case 'Ternary': return this.inferType(node.yes);
      case 'Unary': {
        if (node.op === '!') return 'bool';
        if (node.op === '-' || node.op === '~') return this.inferType(node.expr);
        if (node.op === '*') {
          // Dereference: type of *ptr is the pointee type
          const ptrType = this.inferType(node.expr);
          if (ptrType.endsWith(' *')) return ptrType.slice(0, -2);
          return 'int32_t';
        }
        if (node.op === '&') {
          // Address-of: type of &x is x's type followed by *
          const baseType = this.inferType(node.expr);
          return `${baseType} *`;
        }
        return this.inferType(node.expr);
      }
      case 'Typeof': return 'String';
      default: return 'int32_t';
    }
  },

  _inferCall(node) {
    if (node.callee.kind === 'OptChain') {
      const objType = this.inferType(node.callee.object);
      if (objType?.startsWith('opt_') && node.callee.prop === 'toString') return 'opt_string';
      return 'int32_t';
    }
    if (node.callee.kind === 'Ident') {
      const _sfn = node.callee.name;
      if (_sfn === 'atob' || _sfn === 'btoa' || _sfn === 'decodeUtf8') return 'String';
      if (_sfn === 'encodeUtf8') return 'Array_u8';
      if (_sfn === 'structuredClone' && node.args?.[0]) {
        return this.inferType(node.args[0].expr);
      }
    }
    if (node.callee.kind === 'Ident' && this._genericFuncs?.has(node.callee.name)) {
      const tmpl = this._genericFuncs.get(node.callee.name);
      const subst = new Map();
      for (let i = 0; i < tmpl.typeParams.length; i++) {
        const tp = tmpl.typeParams[i];
        const typeArgs = node.typeArgs ?? [];
        let ctype;
        if (typeArgs[i]) ctype = this.resolveType(typeArgs[i]);
        else if (node.args?.[i]) ctype = this.inferType(node.args[i].expr);
        else ctype = 'int32_t';
        subst.set(tp.name, ctype);
      }
      if (tmpl.returnType) {
        const monoRet = this.substType(tmpl.returnType, subst);
        return this.resolveType(monoRet);
      }
      return 'int32_t';
    }
    if (node.callee.kind === 'Member') {
      const r = this._inferMemberCall(node);
      if (r !== null) return r;
    }
    if (node.callee.kind === 'Member' && node.callee.prop === 'next') {
      const genObj = node.callee.object;
      const genSym = genObj.kind === 'Ident' ? this.lookup(genObj.name) : null;
      if (genSym?._isGenState) return genSym._gi?.resultType ?? genSym._resultType ?? 'int32_t';
    }
    if (node.callee.kind === 'Member') {
      const obj2 = node.callee.object;
      const sym2 = obj2.kind === 'Ident' ? this.lookup(obj2.name) : null;
      const cls2 = sym2 ? this.classes.get(sym2.ctype) : null;
      if (cls2?.methods) {
        const m2 = cls2.methods.find(m => m.name === node.callee.prop);
        if (m2?.returnType) return this.resolveType(m2.returnType);
      }
      if (sym2) {
        const ifaceDef = this.interfaces.get(sym2.ctype);
        if (ifaceDef) {
          const m3 = ifaceDef.find(m => m.kind === 'MethodSig' && m.name === node.callee.prop);
          if (m3?.returnType) return this.resolveType(m3.returnType);
        }
      }
    }
    if (node.callee.kind === 'Ident') {
      const n2 = node.callee.name;
      if (n2 === 'parseInt' || n2 === 'tryParseInt') return 'opt_i32';
      if (n2 === 'parseFloat' || n2 === 'tryParseFloat' || n2 === 'Number') return 'opt_f64';
      if (n2 === 'String') return 'String';
      const sym = this.lookup(n2);
      if (sym?.isClosure && sym.closureRetType) return sym.closureRetType;
      if (sym) return sym.ctype;
    }
    return 'int32_t';
  },

  _inferMemberCall(node) {
    const obj = node.callee.object;
    const prop = node.callee.prop;
    if (obj.kind === 'Ident') {
      const nsSym2 = this.lookup(obj.name);
      if (nsSym2?._isNamespace) {
        const nsEntry2 = nsSym2._namespaceExports?.[prop];
        if (nsEntry2?.ctype) return nsEntry2.ctype;
      }
    }
    if (obj.kind === 'Ident' && prop === 'alloc' && this.classes.get(obj.name)?._isPool) {
      return `opt_ref_${obj.name}`;
    }
    if (obj.kind === 'Ident' && obj.name === 'performance') {
      if (prop === 'measure') return 'TscPerfEntry';
      return 'double';
    }
    if (obj.kind === 'Ident' && obj.name === 'Math') {
      if (prop === 'clz32' || prop === 'imul') return 'int32_t';
      if (prop === 'fround') return 'float';
      if (prop === 'abs' || prop === 'min' || prop === 'max') {
        const a0t = node.args?.[0] ? this.inferType(node.args[0].expr) : 'int32_t';
        if (a0t !== 'double' && a0t !== 'float') return 'int32_t';
      }
      return 'double';
    }
    if (obj.kind === 'Ident' && obj.name === 'Date' && prop === 'now') return 'int64_t';
    if (obj.kind === 'Ident' && obj.name === 'JSON') {
      if (prop === 'stringify') return 'String';
      if (prop === 'parse') {
        const tname = node.typeArgs?.[0]?.name ?? 'i32';
        if (tname === 'f64' || tname === 'f32') return 'double';
        if (tname === 'bool') return 'bool';
        return 'int32_t';
      }
    }
    if (obj.kind === 'Ident' && obj.name === 'console') return 'void';
    if (obj.kind === 'Ident' && this._stdTemporalImported) {
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
    if (obj.kind === 'Ident' && this._stdTemporalImported) {
      const _tSym = this.lookup(obj.name);
      if (_tSym?.ctype === 'TscPlainDate') {
        if (prop === 'add') return 'TscPlainDate';
        if (prop === 'until') return 'TscDuration';
      }
    }
    if (obj.kind === 'Ident') {
      const _bSym = this.lookup(obj.name);
      if (_bSym?._isBuffer || _bSym?.ctype === 'Buffer') {
        if (prop === 'slice') return 'Buffer';
        if (prop === 'fill') return 'void';
      }
      if (_bSym?._isDataView || _bSym?.ctype === 'DataView') {
        if (prop === 'getU8') return 'uint32_t';
        if (prop === 'getU16LE') return 'uint32_t';
        if (prop === 'getU32LE') return 'uint32_t';
        if (prop === 'getF64LE') return 'double';
        if (prop === 'setU8' || prop === 'setU16LE' || prop === 'setU32LE' || prop === 'setF64LE') return 'void';
      }
    }
    if (node.callee?.kind === 'Index') {
      const _idxObjType = this.inferType(node.callee?.object);
      if (_idxObjType === 'Buffer' || _idxObjType === 'DataView') return 'uint8_t';
    }
    if (prop === 'at') return 'opt_u8';
    if (prop === 'toFixed' || prop === 'toPrecision') return 'String';
    if (obj.kind === 'Member' &&
        obj.object.kind === 'Ident' && obj.object.name === 'process' &&
        obj.prop === 'env') {
      if (prop === 'get') return 'opt_String';
      if (prop === 'has') return 'bool';
    }
    const _setSym0 = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (_setSym0?._isSet) {
      if (prop === 'has' || prop === 'delete') return 'bool';
      if (prop === 'add' || prop === 'clear') return 'void';
    }
    const objSym0 = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    const objType0 = objSym0?.ctype ?? this.inferType(obj);
    const _mapSfx0 = this._mapSuffix(objType0);
    if (_mapSfx0) {
      const mapSuffix = _mapSfx0;
      const parts = mapSuffix.split('_');
      const kIdent = parts[0];
      const vIdent = parts.slice(1).join('_');
      const vCType = this._arrIdentToCType(vIdent);
      if (prop === 'get' || prop === 'delete') {
        const optName = `opt_${vIdent}`;
        this._ensureOptStruct(optName, vCType);
        return optName;
      }
      if (prop === 'has') return 'bool';
      if (prop === 'set' || prop === 'clear') return 'void';
      if (prop === 'keys') {
        const kCType = this._arrIdentToCType(kIdent);
        const arrName = `Array_${kIdent}`;
        this._ensureArrayStruct(arrName, kCType);
        return arrName;
      }
      if (prop === 'entries') {
        const kCType = this._arrIdentToCType(kIdent);
        const vCTypeE = this._arrIdentToCType(vIdent);
        this._ensureMapEntry(mapSuffix, kCType, vCTypeE);
        return `Array_MapEntry_${mapSuffix}`;
      }
    }
    const objSymDate = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymDate?.ctype === 'Date') {
      if (prop === 'getTime' || prop === 'valueOf') return 'int64_t';
      if (prop === 'getTimezoneOffset') return 'int32_t';
      if (prop === 'toISOString' || prop === 'toString' || prop === 'toDateString' ||
          prop === 'toTimeString' || prop === 'toLocaleDateString' ||
          prop === 'toLocaleTimeString' || prop === 'toLocaleString') return 'String';
      if (prop.startsWith('get')) return 'int32_t';
      if (prop.startsWith('set')) return 'void';
    }
    const objSymA = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymA?._isAtomic) {
      if (prop === 'load' || prop === 'fetchAdd') return objSymA._atomicInner ?? 'int32_t';
      if (prop === 'store') return 'void';
      if (prop === 'compareExchange') return 'bool';
    }
    if (objSymA?._isAtomicArray) {
      if (prop === 'load' || prop === 'fetchAdd') return objSymA._atomicArrayInner ?? 'int32_t';
      if (prop === 'store') return 'void';
      if (prop === 'compareExchange') return 'bool';
    }
    if (objSymA?._isChannel) {
      if (prop === 'receive') return objSymA._channelInner ?? 'int32_t';
      if (prop === 'tryReceive') return `opt_${objSymA._channelIdent}`;
      if (prop === 'trySend' || prop === 'isEmpty') return 'bool';
      if (prop === 'length' || prop === 'capacity') return 'size_t';
      if (prop === 'send' || prop === 'close') return 'void';
    }
    if ((objSymA?.ctype === 'tsc_thread_t' || objSymA?._isThread) && prop === 'join') return 'void';
    const objSymAvr = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymAvr?._isAvrObj) {
      if (obj.name === 'ADC' && prop === 'read') return 'uint16_t';
      return 'void';
    }
    const objSymRnd = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymRnd?._isRandom) {
      if (prop === 'nextF64') return 'double';
      if (prop === 'nextI32' || prop === 'range') return 'int32_t';
    }
    const objSymHm = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymHm?._isHashMap) {
      const _hmVt = objSymHm._hmValType ?? 'int32_t';
      const _hmVid = this.cTypeToIdent(_hmVt);
      if (prop === 'has') return 'bool';
      if (prop === 'get') return `opt_${_hmVid}`;
      if (prop === 'set' || prop === 'delete') return 'void';
    }
    if (objSymHm?._isStaticMapInline && prop === 'get') return 'opt_i32';
    if (this._stdIoImported && obj.kind === 'Ident') {
      const _ioSym2 = this.lookup(obj.name);
      if (_ioSym2?.ctype === 'Reader' && prop === 'read') return 'size_t';
      if (_ioSym2?.ctype === 'Writer' && prop === 'write') return 'size_t';
    }
    if (this._stdFsImported && obj.kind === 'Ident') {
      const _fsSym2 = this.lookup(obj.name);
      if (_fsSym2?._isFsNamespace) {
        if (prop === 'readFileSync') return 'String';
        if (prop === 'readFileBytesSync') return 'Array_u8';
        if (prop === 'existsSync') return 'bool';
        if (prop === 'readDirSync') return 'TscDirEntryArray';
        if (prop === 'statSync') return 'TscFileStat';
        return 'void';
      }
    }
    if (this._stdHalImported && obj.kind === 'Ident') {
      const _hc = obj.name; const _hp = prop;
      if (_hc === 'GPIO' && (_hp === 'read')) return 'bool';
      if (_hc === 'I2C' && _hp === 'read') return 'Array_u8';
      if (_hc === 'SPI' && _hp === 'transfer') return 'uint8_t';
      if (_hc === 'UART' && _hp === 'read') return 'opt_u8';
      if (_hc === 'UART' && _hp === 'available') return 'bool';
    }
    const objSymBlob = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymBlob?._isBlob) {
      if (prop === 'slice') return 'Blob';
      if (prop === 'arrayBuffer') return 'Buffer';
    }
    if (objSymBlob?._isTscBlob) {
      if (prop === 'text') return 'String';
    }
    const objSymUrl = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymUrl?._isURL || objSymUrl?._isURLSearchParams) {
      if (prop === 'get') return 'const char *';
      if (prop === 'set' || prop === 'delete') return 'void';
    }
    if (obj.kind === 'Member' && prop === 'get') {
      const _usym = obj.object.kind === 'Ident' ? this.lookup(obj.object.name) : null;
      if (_usym?._isURL && obj.prop === 'searchParams') return 'const char *';
    }
    const objSymRx = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    if (objSymRx?._isRegex) {
      if (prop === 'test') return 'bool';
      if (prop === 'match') return 'opt_Array_string';
      if (prop === 'replace' || prop === 'replaceAll') return 'String';
    }
    const objSymAC = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    const objTypeAC = objSymAC?.ctype ?? this.inferType(obj);
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
    const objSym = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
    const objType = objSym?.ctype ?? this.inferType(obj);
    if (objType?.startsWith('Array_')) {
      const et = objSym?.elemType ?? objType.slice(6);
      const etCType = objSym?.arrElemCType ?? 'int32_t';
      if (prop === 'pop') return et ? `opt_${et}` : 'opt_i32';
      if (prop === 'remove') return etCType;
      if (prop === 'find') return et ? `opt_ref_${et}` : 'opt_ref_i32';
      if (prop === 'filter' || prop === 'concat' || prop === 'clone') return objType;
      if (prop === 'map') return objType;
      if (prop === 'slice') return objType;
      if (prop === 'findIndex' || prop === 'indexOf') return 'int32_t';
      if (prop === 'includes' || prop === 'every' || prop === 'some') return 'bool';
      if (prop === 'length' || prop === 'capacity') return 'size_t';
      if (prop === 'join') return 'String';
      if (prop === 'reduce') {
        const initExpr = node.args?.[1]?.expr;
        return initExpr ? this.inferType(initExpr) : (objSym?.arrElemCType ?? 'int32_t');
      }
    }
    if (objType === 'String') {
      const _sret = {
        toLowerCase: 'String', toUpperCase: 'String', trim: 'String',
        trimStart: 'String', trimEnd: 'String', repeat: 'String',
        replace: 'String', replaceAll: 'String', padStart: 'String', padEnd: 'String',
        charAt: 'String', slice: 'String', substring: 'String',
        concat: 'String', toString: 'String',
        endsWith: 'bool', startsWith: 'bool', includes: 'bool',
        indexOf: 'int32_t', lastIndexOf: 'int32_t', charCodeAt: 'uint32_t',
        split: 'Array_String',
        at: 'opt_u8',
        length: 'size_t',
      };
      if (Object.hasOwn(_sret, prop)) return _sret[prop];
    }
    if (node.callee.prop === 'fromValue' && obj.kind === 'Ident') {
      const ed = this.classes.get(obj.name);
      if (ed?.isEnum) return `opt_${obj.name}`;
    }
    if (node.callee.prop === 'values' && obj.kind === 'Ident') {
      const ed = this.classes.get(obj.name);
      if (ed?.isEnum) return `${obj.name} *`;
    }
    if (node.callee.prop === 'toString' && obj.kind === 'Ident') {
      const objSym2 = this.lookup(obj.name);
      const objEnumDef = objSym2 ? this.classes.get(objSym2.ctype) : null;
      if (objEnumDef?.isStringLiteralUnion) return 'const char *';
    }
    if (node.callee.prop === 'toString' && obj.kind === 'Member') {
      const enumName = obj.object?.kind === 'Ident' ? obj.object.name : null;
      const ed = enumName ? this.classes.get(enumName) : null;
      if (ed?.isEnum) return 'const char *';
    }
    if (node.callee.prop === 'toString') {
      const objType5 = this.inferType(obj);
      if (objType5 && !objType5.startsWith('Array_') && !this._mapSuffix(objType5) &&
          !objType5.startsWith('opt_') && objType5 !== 'void') {
        return 'String';
      }
    }
    const primitiveMap2 = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                             'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                             'f32':'float','f64':'double' };
    if (obj.kind === 'Ident' && obj.name in primitiveMap2) {
      const cT = primitiveMap2[obj.name];
      const etId = this.cTypeToIdent(cT);
      if (node.callee.prop === 'parse') return cT;
      if (node.callee.prop === 'tryParse') return `opt_${etId}`;
    }
    return null;
  },
};
