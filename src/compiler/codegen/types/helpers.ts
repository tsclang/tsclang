// helpers.js
const _RUNTIME_ET = new Set(['i32', 'f64', 'string']);
const _RUNTIME_MAP = new Set(['i32_i32', 'i32_f64', 'f64_f64', 'string_string']);
const _RUNTIME_FLATMAP = new Set(['i32_i32', 'f64_f64', 'string_string']);
const _RUNTIME_REDUCE = new Set(['i32_i32', 'i32_f64', 'i32_string', 'f64_string', 'string_string']);
const _RUNTIME_REDUCE_R = new Set(['i32_i32', 'i32_f64']);
const _RUNTIME_FLAT = new Set(['i32', 'f64', 'string', 'Array_i32']);

export default {
  _cTypeBytes(ct: any) {
    const m = { 'uint8_t':1,'int8_t':1,'uint16_t':2,'int16_t':2,'uint32_t':4,'int32_t':4,'uint64_t':8,'int64_t':8,'float':4,'double':8,'bool':1,'char':1 };
    if (ct === 'size_t') return this._ptrBytes();
    return m[ct] ?? 4;
  },

  _stackSizeOf(ct: any) {
    if (!ct || ct === 'void') return 0;
    if (ct.endsWith(' *')) return this._ptrBytes();
    if (ct.startsWith('opt_ref_')) return this._ptrBytes() * 2;
    if (ct.startsWith('opt_')) {
      const inner = ct.slice(4);
      return this._stackSizeOf(inner) + 4;
    }
    if (ct.startsWith('tuple_')) {
      const def = this.classes.get(ct);
      if (def?.fields) return def.fields.reduce((s: any, f: any) => s + this._stackSizeOf(this.resolveType(f.typeAnn)), 0);
      return 4;
    }
    const cls = this.classes.get(ct);
    if (cls?.isStruct && cls.fields) {
      return cls.fields.reduce((s: any, f: any) => s + this._stackSizeOf(this.resolveType(f.typeAnn)), 0);
    }
    if (cls?.isTuple && cls.fields) {
      return cls.fields.reduce((s: any, f: any) => s + this._stackSizeOf(this.resolveType(f.typeAnn)), 0);
    }
    if (ct.startsWith('Array_') || ct.startsWith('TscMap_') || ct.startsWith('Map_') || ct.startsWith('Set_') || ct.startsWith('TscSet_')) {
      return this._ptrBytes();
    }
    return this._cTypeBytes(ct);
  },

  cTypeToIdent(ctype: any) {
    // Map C type to a valid identifier suffix
    const m = {
      'int8_t': 'i8', 'int16_t': 'i16', 'int32_t': 'i32', 'int64_t': 'i64',
      'uint8_t': 'u8', 'uint16_t': 'u16', 'uint32_t': 'u32', 'uint64_t': 'u64',
      'float': 'f32', 'double': 'f64',
      'bool': 'bool', 'String': 'string', 'size_t': 'usize', 'void': 'void',
      'char': 'char',
    };
    if (ctype.startsWith('tuple_')) return 'tuple';
    return m[ctype] ?? ctype.replace(/[^a-zA-Z0-9]/g, '_');
  },

  ctypeToTsName(ctype: any) {
    const m = {
      'int8_t': 'i8', 'int16_t': 'i16', 'int32_t': 'i32', 'int64_t': 'i64',
      'uint8_t': 'u8', 'uint16_t': 'u16', 'uint32_t': 'u32', 'uint64_t': 'u64',
      'float': 'f32', 'double': 'f64', 'bool': 'boolean',
      'String': 'string', 'size_t': 'usize', 'ptrdiff_t': 'isize',
    };
    return m[ctype] ?? ctype;
  },

  _numericTypeInfo(ct: any) {
    const m = {
      'int8_t':   { bits: 8,  signed: true,  kind: 'int' },
      'int16_t':  { bits: 16, signed: true,  kind: 'int' },
      'int32_t':  { bits: 32, signed: true,  kind: 'int' },
      'int64_t':  { bits: 64, signed: true,  kind: 'int' },
      'uint8_t':  { bits: 8,  signed: false, kind: 'int' },
      'uint16_t': { bits: 16, signed: false, kind: 'int' },
      'uint32_t': { bits: 32, signed: false, kind: 'int' },
      'uint64_t': { bits: 64, signed: false, kind: 'int' },
      'float':    { bits: 32, signed: true,  kind: 'float', mantissa: 24 },
      'double':   { bits: 64, signed: true,  kind: 'float', mantissa: 53 },
      'size_t':   { bits: this._cTypeBytes('size_t') * 8, signed: false, kind: 'int' },
    };
    return m[ct] ?? null;
  },

  _isSafeWidening(src: any, dst: any) {
    if (src === dst) return true;
    if (src === 'size_t' && (dst === 'int64_t' || dst === 'uint64_t')) return true;
    const si = this._numericTypeInfo(src);
    const di = this._numericTypeInfo(dst);
    if (!si || !di) return true;
    if (si.kind === 'float' && di.kind === 'int') return false;
    if (si.kind === 'float' && di.kind === 'float') return di.bits >= si.bits;
    if (si.kind === 'int' && di.kind === 'float') return si.bits <= di.mantissa;
    if (si.signed === di.signed) return di.bits >= si.bits;
    if (!si.signed && di.signed) return di.bits > si.bits;
    return false;
  },

  // Map array element identifier back to C type (reverse of cTypeToIdent)
  _arrIdentToCType(ident: any) {
    const m = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                'f32':'float','f64':'double','bool':'bool','string':'String',
                'usize':'size_t','char':'char' };
    return m[ident] ?? ident;
  },

  // Returns map suffix if ctype is Map_* or TscMap_*, otherwise null
  _mapSuffix(ctype: any) {
    if (!ctype) return null;
    if (ctype.startsWith('TscMap_')) return ctype.slice(7);
    if (ctype.startsWith('Map_')) return ctype.slice(4);
    return null;
  },

  // Ensure TscMap_K_V is defined (idempotent). runtime.h provides string_i32 via TSC_MAP_DECL.
  _ensureMapStruct(suffix: any) {
    this._emittedMapStructs.add(suffix);
  },

  // Emit MapEntry_K_V and Array_MapEntry_K_V struct typedefs (idempotent)
  _ensureMapEntry(suffix: any, kCType: any, vCType: any) {
    if (!this._emittedMapEntries.has(suffix)) {
      this._emittedMapEntries.add(suffix);
      const entryName = `MapEntry_${suffix}`;
      const arrName = `Array_${entryName}`;
      this.addTop(`typedef struct { ${kCType} key; ${vCType} value; } ${entryName};`);
      this.addTop(`typedef struct { ${entryName} *data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
      // Register in _emittedArrayStructs to prevent _ensureArrayStruct from re-emitting
      this._emittedArrayStructs.add(arrName);
    }
  },

  _ensureRefArrayStruct(arrName: any, et: any) {
    if (!this._emittedArrayStructs.has(arrName)) {
      this._emittedArrayStructs.add(arrName);
      this.addTop(`typedef struct { ${et} **data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
    }
  },

  // Emit Array_T struct typedef (idempotent)
  _ensureArrayStruct(arrName: any, et: any) {
    if (!this._emittedArrayStructs.has(arrName)) {
      this._emittedArrayStructs.add(arrName);
      this.addTop(`typedef struct { ${et} *data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
      if (et === 'tsc_unknown') {
        this._ensureArrayFreeMacro('tsc_unknown', arrName, et);
        this._ensureArrayPushMacro('tsc_unknown', arrName, et);
      }
      if (this._isOptType(et)) {
        const ident = this.cTypeToIdent(et);
        this._ensureOptArrayMacros(ident, arrName, et);
      }
    }
  },

  _ensureArrayFreeMacro(elemIdent: any, arrName: any, et: any) {
    const key = `free_${elemIdent}`;
    if (!this._emittedHelpers.has(key)) {
      this._emittedHelpers.add(key);
      if (elemIdent === 'tsc_unknown') {
        this.addTop(`#define tsc_array_free_tsc_unknown(arr) do { Array_tsc_unknown *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_unknown_drop(&_a_->data[_i_]); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)`);
      } else {
        this.addTop(`#define tsc_array_free_${elemIdent}(arr) do { ${arrName} *_a_ = (arr); if (_a_->data && _a_->capacity > 0) free(_a_->data); _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)`);
      }
    }
  },

  _ensureArrayPushMacro(elemIdent: any, arrName: any, et: any) {
    const key = `push_${elemIdent}`;
    if (!this._emittedHelpers.has(key)) {
      this._emittedHelpers.add(key);
      this.addTop(`#define tsc_array_push_${elemIdent}(arr, val) do { ${arrName} *_a_ = (arr); ${et} _v_ = (val); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (${et}*)realloc(_a_->data, _nc_ * sizeof(${et})); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)`);
    }
  },

  _isOptType(elemType: any) {
    return elemType?.startsWith('opt_');
  },

  _wrapOptValue(cExpr: any, exprNode: any, elemType: any) {
    if (!this._isOptType(elemType)) return cExpr;
    const innerCType = this._arrIdentToCType(elemType.slice(4));
    if (exprNode.kind === 'Literal' && exprNode.litType === 'null') {
      return `((${elemType}){false, 0})`;
    }
    return `((${elemType}){true, ${cExpr}})`;
  },

  _ensureOptArrayMacros(elemIdent: any, arrName: any, et: any) {
    this._ensureArrayFreeMacro(elemIdent, arrName, et);
    this._ensureArrayPushMacro(elemIdent, arrName, et);
    this._ensureArrayPopMacro(elemIdent, arrName, et);
  },

  _ensureArrayPopMacro(elemIdent: any, arrName: any, et: any) {
    const key = `pop_${elemIdent}`;
    if (!this._emittedHelpers.has(key)) {
      this._emittedHelpers.add(key);
      this.addTop(`#define tsc_array_pop_${elemIdent}(arr) ({ ${arrName} *_a_ = (arr); ${et} _r_ = {false, 0}; if (_a_->length > 0) { _r_ = _a_->data[--_a_->length]; } _r_; })`);
    }
  },

  // Emit opt_T struct typedef (idempotent): { bool has_value; T value; }
  // Inserts before any trailing blank line so typedefs group together.
  _ensureOptStruct(optName: any, ctype: any) {
    if (!this._emittedOptStructs.has(optName)) {
      this._emittedOptStructs.add(optName);
      this.addTop(`typedef struct { bool has_value; ${ctype} value; } ${optName};`);
    }
  },

  // Emit Slice_T / MutSlice_T typedef (idempotent)
  _ensureSliceStruct(slName: any, etC: any, mutable = false) {
    if (this._emittedSliceStructs.has(slName)) return;
    this._emittedSliceStructs.add(slName);
    const ptrType = mutable ? `${etC} *` : `const ${etC} *`;
    this.addTop(`typedef struct { ${ptrType}ptr; size_t length; } ${slName};`);
  },

  // Emit Slice_u8 typedef (idempotent): { uint8_t *ptr; size_t length; }
  _ensureSliceU8Struct() {
    if (this._emittedSliceU8) return;
    this._emittedSliceU8 = true;
    this._ensureSliceStruct('Slice_u8', 'uint8_t', true);
  },

  // Emit opt_ref_T struct typedef (idempotent): { bool has_value; T *value; }
  _ensureOptRefStruct(optName: any, ctype: any) {

    if (!this._emittedOptStructs.has(optName)) {
      this._emittedOptStructs.add(optName);
      this.addTop(`typedef struct { bool has_value; ${ctype} *value; } ${optName};`);
    }
  },

  _ensureUnknownStruct() {
    if (this._emittedUnknownStruct) return;
    this._emittedUnknownStruct = true;
    this.addTop('typedef struct tsc_unknown_vtable { void (*drop)(void *buf); void (*clone_into)(const void *src, void *dst); } tsc_unknown_vtable;');
    this.addTop('typedef struct { uint32_t type_id; const tsc_unknown_vtable *vtable; uint8_t buffer[3 * sizeof(void*)]; } tsc_unknown;');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_i32 = {NULL, NULL};');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_i64 = {NULL, NULL};');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_f32 = {NULL, NULL};');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_f64 = {NULL, NULL};');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_bool = {NULL, NULL};');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_char = {NULL, NULL};');
    this.addTop('static inline tsc_unknown tsc_unknown_from_i32(int32_t v) { tsc_unknown u = {.type_id = 1, .vtable = &_tsc_vt_i32}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    this.addTop('static inline int32_t tsc_unknown_get_i32(const tsc_unknown *self) { int32_t v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    this.addTop('static inline tsc_unknown tsc_unknown_from_i64(int64_t v) { tsc_unknown u = {.type_id = 2, .vtable = &_tsc_vt_i64}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    this.addTop('static inline int64_t tsc_unknown_get_i64(const tsc_unknown *self) { int64_t v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    this.addTop('static inline tsc_unknown tsc_unknown_from_f32(float v) { tsc_unknown u = {.type_id = 3, .vtable = &_tsc_vt_f32}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    this.addTop('static inline float tsc_unknown_get_f32(const tsc_unknown *self) { float v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    this.addTop('static inline tsc_unknown tsc_unknown_from_f64(double v) { tsc_unknown u = {.type_id = 4, .vtable = &_tsc_vt_f64}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    this.addTop('static inline double tsc_unknown_get_f64(const tsc_unknown *self) { double v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    this.addTop('static inline tsc_unknown tsc_unknown_from_bool(bool v) { tsc_unknown u = {.type_id = 5, .vtable = &_tsc_vt_bool}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    this.addTop('static inline bool tsc_unknown_get_bool(const tsc_unknown *self) { bool v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    this.addTop('static inline tsc_unknown tsc_unknown_from_char(char v) { tsc_unknown u = {.type_id = 16, .vtable = &_tsc_vt_char}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    this.addTop('static inline char tsc_unknown_get_char(const tsc_unknown *self) { char v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    this.addTop('#ifdef TSC_EMBEDDED');
    this.addTop('static void _tsc_unknown_drop_string(void *buf) { (void)buf; }');
    this.addTop('static void _tsc_unknown_clone_string(const void *src, void *dst) { memcpy(dst, src, sizeof(String)); }');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_string = {_tsc_unknown_drop_string, _tsc_unknown_clone_string};');
    this.addTop('static inline tsc_unknown tsc_unknown_from_string(String s) { tsc_unknown u = {.type_id = 6, .vtable = &_tsc_vt_string}; memcpy(u.buffer, &s, sizeof(String)); return u; }');
    this.addTop('static inline String tsc_unknown_get_string(const tsc_unknown *self) { String s; memcpy(&s, self->buffer, sizeof(String)); return s; }');
    this.addTop('#else');
    this.addTop('static void _tsc_unknown_drop_string(void *buf) { String *ptr; memcpy(&ptr, buf, sizeof(ptr)); if (ptr) { tsc_string_release(*ptr); free(ptr); } }');
    this.addTop('static void _tsc_unknown_clone_string(const void *src, void *dst) { String *sp; memcpy(&sp, src, sizeof(String*)); String *dp = (String*)malloc(sizeof(String)); *dp = *sp; tsc_string_retain(*dp); memcpy(dst, &dp, sizeof(dp)); }');
    this.addTop('static const tsc_unknown_vtable _tsc_vt_string = {_tsc_unknown_drop_string, _tsc_unknown_clone_string};');
    this.addTop('static inline tsc_unknown tsc_unknown_from_string(String s) { String *ptr = (String*)malloc(sizeof(String)); *ptr = s; tsc_string_retain(*ptr); tsc_unknown u = {.type_id = 6, .vtable = &_tsc_vt_string}; memcpy(u.buffer, &ptr, sizeof(ptr)); return u; }');
    this.addTop('static inline String tsc_unknown_get_string(const tsc_unknown *self) { String *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return *ptr; }');
    this.addTop('#endif');
    this.addTop('static inline void tsc_unknown_drop(tsc_unknown *self) { if (self->vtable && self->vtable->drop) self->vtable->drop(self->buffer); }');
  },

  _tsNameToTypeId(tsName: any) {
    if (tsName === 'number') return this._tsNameToTypeId(this._defaultNumber);
    const m = { 'i8': 10, 'i16': 11, 'i32': 1, 'i64': 2, 'u8': 12, 'u16': 13, 'u32': 14, 'u64': 15, 'f32': 3, 'f64': 4, 'boolean': 5, 'string': 6, 'array': 7, 'object': 8, 'char': 16 };
    return m[tsName] ?? 0;
  },

  _tsNameToCType(tsName: any) {
    if (tsName === 'number') return this._tsNameToCType(this._defaultNumber);
    const m = { 'i8': 'int8_t', 'i16': 'int16_t', 'i32': 'int32_t', 'i64': 'int64_t', 'u8': 'uint8_t', 'u16': 'uint16_t', 'u32': 'uint32_t', 'u64': 'uint64_t', 'f32': 'float', 'f64': 'double', 'boolean': 'bool', 'string': 'String', 'char': 'char' };
    return m[tsName] ?? 'int32_t';
  },

  _unknownPackerFor(ctype: any) {
    const m: Record<string, string> = { 'int8_t': 'tsc_unknown_from_i32', 'int16_t': 'tsc_unknown_from_i32', 'int32_t': 'tsc_unknown_from_i32', 'int64_t': 'tsc_unknown_from_i64', 'uint8_t': 'tsc_unknown_from_i32', 'uint16_t': 'tsc_unknown_from_i32', 'uint32_t': 'tsc_unknown_from_i32', 'uint64_t': 'tsc_unknown_from_i64', 'float': 'tsc_unknown_from_f32', 'double': 'tsc_unknown_from_f64', 'bool': 'tsc_unknown_from_bool', 'String': 'tsc_unknown_from_string', 'char': 'tsc_unknown_from_char' };
    if (m[ctype]) return m[ctype];
    if (ctype.startsWith('Array_')) {
      if (this._cap('allocator') !== 'heap' || this._cap('bits') < 64) {
        throw this.error(`Type '${ctype}' exceeds embedded unknown inline buffer (3 words). Use Ref or pointers for indirect storage`);
      }
      const elemIdent = ctype.slice(6);
      const et = this._arrIdentToCType(elemIdent);
      this._ensureUnknownPackerArray(elemIdent, ctype, et);
      return `tsc_unknown_from_${ctype}`;
    }
    if (this._cap('allocator') !== 'heap' || this._cap('bits') < 64) {
      throw this.error(`Type '${ctype}' exceeds embedded unknown inline buffer (3 words). Use Ref or pointers for indirect storage`);
    }
    if (this.classes.has(ctype)) {
      this._ensureUnknownPackerClass(ctype);
      return `tsc_unknown_from_${ctype}`;
    }
    return 'tsc_unknown_from_i32';
  },

  _unknownGetterFor(ctype: any) {
    const m: Record<string, string> = { 'int8_t': 'tsc_unknown_get_i32', 'int16_t': 'tsc_unknown_get_i32', 'int32_t': 'tsc_unknown_get_i32', 'int64_t': 'tsc_unknown_get_i64', 'uint8_t': 'tsc_unknown_get_i32', 'uint16_t': 'tsc_unknown_get_i32', 'uint32_t': 'tsc_unknown_get_i32', 'uint64_t': 'tsc_unknown_get_i64', 'float': 'tsc_unknown_get_f32', 'double': 'tsc_unknown_get_f64', 'bool': 'tsc_unknown_get_bool', 'String': 'tsc_unknown_get_string', 'char': 'tsc_unknown_get_char' };
    if (m[ctype]) return m[ctype];
    if (ctype.startsWith('Array_')) {
      const elemIdent = ctype.slice(6);
      const et = this._arrIdentToCType(elemIdent);
      this._ensureUnknownPackerArray(elemIdent, ctype, et);
      return `tsc_unknown_get_${ctype}`;
    }
    if (this.classes.has(ctype)) {
      this._ensureUnknownPackerClass(ctype);
      return `tsc_unknown_get_${ctype}`;
    }
    return 'tsc_unknown_get_i32';
  },

  _ensureUnknownPackerArray(elemIdent: any, arrName: any, et: any) {
    const key = `unknown_array_${elemIdent}`;
    if (this._emittedHelpers.has(key)) return;
    this._emittedHelpers.add(key);
    this._ensureUnknownStruct();
    this._ensureArrayStruct(arrName, et);
    this._ensureArrayFreeMacro(elemIdent, arrName, et);
    this.addTop(`static void _tsc_unknown_drop_${arrName}(void *buf) { ${arrName} *ptr; memcpy(&ptr, buf, sizeof(ptr)); tsc_array_free_${elemIdent}(ptr); free(ptr); }`);
    this.addTop(`static void _tsc_unknown_clone_${arrName}(const void *src, void *dst) { ${arrName} *sp; memcpy(&sp, src, sizeof(${arrName}*)); ${arrName} *dp = (${arrName}*)malloc(sizeof(${arrName})); *dp = *sp; dp->data = (${et}*)malloc(sizeof(${et}) * dp->capacity); memcpy(dp->data, sp->data, sizeof(${et}) * sp->length); memcpy(dst, &dp, sizeof(dp)); }`);
    this.addTop(`static const tsc_unknown_vtable _tsc_vt_${arrName} = {_tsc_unknown_drop_${arrName}, _tsc_unknown_clone_${arrName}};`);
    this.addTop(`static inline tsc_unknown tsc_unknown_from_${arrName}(${arrName} arr) { ${arrName} *heap = (${arrName}*)malloc(sizeof(${arrName})); *heap = arr; if (arr.data && arr.length > 0) { size_t _cap = arr.capacity > 0 ? arr.capacity : arr.length; heap->data = (${et}*)malloc(sizeof(${et}) * _cap); memcpy(heap->data, arr.data, sizeof(${et}) * arr.length); heap->capacity = _cap; } else { heap->data = NULL; heap->length = 0; heap->capacity = 0; } tsc_unknown u = {.type_id = 7, .vtable = &_tsc_vt_${arrName}}; memcpy(u.buffer, &heap, sizeof(heap)); return u; }`);
    this.addTop(`static inline ${arrName}* tsc_unknown_get_${arrName}(const tsc_unknown *self) { ${arrName} *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return ptr; }`);
  },

  _ensureUnknownPackerClass(className: any) {
    const key = `unknown_class_${className}`;
    if (this._emittedHelpers.has(key)) return;
    this._emittedHelpers.add(key);
    this._ensureUnknownStruct();
    this.addTop(`static void _tsc_unknown_drop_${className}(void *buf) { ${className} *ptr; memcpy(&ptr, buf, sizeof(ptr)); free(ptr); }`);
    this.addTop(`static void _tsc_unknown_clone_${className}(const void *src, void *dst) { ${className} *sp; memcpy(&sp, src, sizeof(${className}*)); ${className} *dp = (${className}*)malloc(sizeof(${className})); *dp = *sp; memcpy(dst, &dp, sizeof(dp)); }`);
    this.addTop(`static const tsc_unknown_vtable _tsc_vt_${className} = {_tsc_unknown_drop_${className}, _tsc_unknown_clone_${className}};`);
    this.addTop(`static inline tsc_unknown tsc_unknown_from_${className}(${className} obj) { ${className} *heap = (${className}*)malloc(sizeof(${className})); *heap = obj; tsc_unknown u = {.type_id = 8, .vtable = &_tsc_vt_${className}}; memcpy(u.buffer, &heap, sizeof(heap)); return u; }`);
    this.addTop(`static inline ${className}* tsc_unknown_get_${className}(const tsc_unknown *self) { ${className} *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return ptr; }`);
  },

  _ensureGroupByMapStruct(etIdent: any, etCType: any) {
    const key = `groupby_${etIdent}`;
    if (this._emittedHelpers.has(key)) return;
    this._emittedHelpers.add(key);
    const arrName = `Array_${etIdent}`;
    this._ensureArrayStruct(arrName, etCType);
    const mapName = `TscMap_string_array_${etIdent}`;
    this.addTop(`typedef struct { String _keys[64]; ${arrName} _vals[64]; size_t size; } ${mapName};`);
    this.addTop('');
  },

  _emitArrayMacro(macroName: any, lines: any) {
    if (this._emittedHelpers.has(macroName)) return;
    this._emittedHelpers.add(macroName);
    this.addTop(`#ifndef ${macroName}`);
    for (const l of lines) this.addTop(l);
    this.addTop('#endif');
    this.addTop('');
  },

  _arrElem(etC: any) {
    return etC === 'String' ? '&_a_.data[_i_]' : '_a_.data[_i_]';
  },

  _ensureArrayMapMacro(fromEt: any, toEt: any, fromCType: any, toCType: any) {
    this._ensureArrayStruct(`Array_${toEt}`, toCType);
    if (_RUNTIME_MAP.has(`${fromEt}_${toEt}`)) return;
    const name = `tsc_array_map_${fromEt}_${toEt}`;
    const elem = this._arrElem(fromCType);
    this._ensureArrayStruct(`Array_${toEt}`, toCType);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, fn) ({ \\`,
      `    Array_${fromEt} _a_ = (arr); \\`,
      `    ${toCType} *_d_ = (${toCType}*)_tsc_xmalloc(_a_.length * sizeof(${toCType})); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = (fn)(${elem}); \\`,
      `    (Array_${toEt}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
  },

  _ensureArrayFlatMapMacro(fromEt: any, toEt: any, fromCType: any, toCType: any) {
    this._ensureArrayStruct(`Array_${toEt}`, toCType);
    if (_RUNTIME_FLATMAP.has(`${fromEt}_${toEt}`)) return;
    const name = `tsc_array_flat_map_${fromEt}_${toEt}`;
    const elem = this._arrElem(fromCType);
    this._ensureArrayStruct(`Array_${toEt}`, toCType);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, fn) ({ \\`,
      `    Array_${fromEt} _a_ = (arr); \\`,
      `    Array_${toEt} _r_ = {NULL, 0, 0}; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) { \\`,
      `        Array_${toEt} _chunk_ = (fn)(${elem}); \\`,
      `        for (size_t _j_ = 0; _j_ < _chunk_.length; _j_++) { \\`,
      `            if (_r_.length >= _r_.capacity) { \\`,
      `                size_t _nc_ = _r_.capacity == 0 ? 8 : _r_.capacity * 2; \\`,
      `                _r_.data = (${toCType}*)_tsc_xrealloc(_r_.data, _nc_ * sizeof(${toCType})); _r_.capacity = _nc_; \\`,
      `            } \\`,
      `            _r_.data[_r_.length++] = _chunk_.data[_j_]; \\`,
      `        } \\`,
      `        if (_chunk_.capacity > 0) free(_chunk_.data); \\`,
      `    } \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayFilterMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_filter_${et}`;
    const elem = this._arrElem(etC);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    Array_${et} _r_ = {NULL, 0, 0}; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) { \\`,
      `        if ((pred)(${elem})) { \\`,
      `            if (_r_.length >= _r_.capacity) { \\`,
      `                size_t _nc_ = _r_.capacity == 0 ? 8 : _r_.capacity * 2; \\`,
      `                _r_.data = (${etC}*)_tsc_xrealloc(_r_.data, _nc_ * sizeof(${etC})); _r_.capacity = _nc_; \\`,
      `            } \\`,
      `            _r_.data[_r_.length++] = _a_.data[_i_]; \\`,
      `        } \\`,
      `    } \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayForeachMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_foreach_${et}`;
    const elem = this._arrElem(etC);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, fn) do { \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) (fn)(${elem}); \\`,
      `} while(0)`,
    ]);
  },

  _ensureArrayReduceMacro(et: any, toEt: any, etC: any, toCType: any, isRight: any) {
    const combos = isRight ? _RUNTIME_REDUCE_R : _RUNTIME_REDUCE;
    if (combos.has(`${et}_${toEt}`)) return;
    const op = isRight ? 'reduce_right' : 'reduce';
    const name = `tsc_array_${op}_${et}_${toEt}`;
    const elem = this._arrElem(etC);
    const elemR = etC === 'String' ? '&_a_.data[_i_ - 1]' : '_a_.data[_i_ - 1]';
    const loop = isRight
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) _acc_ = (fn)(_acc_, ${elemR});`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _acc_ = (fn)(_acc_, ${elem});`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, fn, init) ({ \\`,
      `    Array_${et} _a_ = (arr); ${toCType} _acc_ = (init); \\`,
      `    ${loop} \\`,
      `    _acc_; \\`,
      `})`,
    ]);
  },

  _ensureArrayEveryMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_every_${et}`;
    const elem = this._arrElem(etC);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); bool _r_ = true; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length && _r_; _i_++) if (!(pred)(${elem})) _r_ = false; \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArraySomeMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_some_${et}`;
    const elem = this._arrElem(etC);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); bool _r_ = false; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length && !_r_; _i_++) if ((pred)(${elem})) _r_ = true; \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayFindMacro(et: any, etC: any, isLast: any) {
    if (_RUNTIME_ET.has(et)) {
      this._ensureOptRefStruct(`opt_ref_${et}`, etC);
      return;
    }
    const op = isLast ? 'find_last' : 'find';
    const name = `tsc_array_${op}_${et}`;
    const e = isLast ? (etC === 'String' ? '&_a_.data[_i_ - 1]' : '_a_.data[_i_ - 1]') : this._arrElem(etC);
    const ref = isLast ? '&_a_.data[_i_ - 1]' : '&_a_.data[_i_]';
    const loop = isLast
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) if ((pred)(${e})) { _r_ = (opt_ref_${et}){true, ${ref}}; break; }`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if ((pred)(${e})) { _r_ = (opt_ref_${et}){true, ${ref}}; break; }`;
    this._ensureOptRefStruct(`opt_ref_${et}`, etC);
    this._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    opt_ref_${et} _r_ = {false, NULL}; \\`,
      `    ${loop} \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayFindIndexMacro(et: any, etC: any, isLast: any) {
    if (_RUNTIME_ET.has(et)) return;
    const op = isLast ? 'find_last_index' : 'find_index';
    const name = `tsc_array_${op}_${et}`;
    const e = isLast ? (etC === 'String' ? '&_a_.data[_i_ - 1]' : '_a_.data[_i_ - 1]') : this._arrElem(etC);
    const loop = isLast
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) if ((pred)(${e})) { _r_ = (ptrdiff_t)(_i_ - 1); break; }`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if ((pred)(${e})) { _r_ = (ptrdiff_t)_i_; break; }`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); ptrdiff_t _r_ = -1; \\`,
      `    ${loop} \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayIncludesMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_includes_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, val) ({ \\`,
      `    Array_${et} _a_ = (arr); ${etC} _v_ = (val); bool _f_ = false; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length && !_f_; _i_++) if (_a_.data[_i_] == _v_) _f_ = true; \\`,
      `    _f_; \\`,
      `})`,
    ]);
  },

  _ensureArrayIndexOfMacro(et: any, etC: any, isLast: any) {
    if (_RUNTIME_ET.has(et)) return;
    const op = isLast ? 'last_index_of' : 'index_of';
    const name = `tsc_array_${op}_${et}`;
    const loop = isLast
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) if (_a_.data[_i_ - 1] == _v_) { _r_ = (ptrdiff_t)(_i_ - 1); break; }`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if (_a_.data[_i_] == _v_) { _r_ = (ptrdiff_t)_i_; break; }`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, val) ({ \\`,
      `    Array_${et} _a_ = (arr); ${etC} _v_ = (val); ptrdiff_t _r_ = -1; \\`,
      `    ${loop} \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayConcatMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_concat_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(a, b) ({ \\`,
      `    Array_${et} _a_ = (a), _b_ = (b); \\`,
      `    size_t _n_ = _a_.length + _b_.length; \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_n_ * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    memcpy(_d_ + _a_.length, _b_.data, _b_.length * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _n_, .capacity = _n_ }; \\`,
      `})`,
    ]);
  },

  _ensureArraySliceMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_slice_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, start, end_idx) ({ \\`,
      `    Array_${et} _a_ = (arr); int32_t _s_ = (start), _e_ = (end_idx); \\`,
      `    if (_s_ < 0) _s_ = 0; if (_e_ > (int32_t)_a_.length) _e_ = (int32_t)_a_.length; \\`,
      `    size_t _n_ = (_s_ < _e_) ? (size_t)(_e_ - _s_) : 0; \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_n_ * sizeof(${etC})); \\`,
      `    if (_n_) memcpy(_d_, _a_.data + _s_, _n_ * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _n_, .capacity = _n_ }; \\`,
      `})`,
    ]);
  },

  _ensureArrayFlatMacro(et: any, etC: any) {
    if (_RUNTIME_FLAT.has(et)) return;
    const name = `tsc_array_flat_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
  },

  _ensureArrayAtMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_at_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, idx) ({ \\`,
      `    Array_${et} _a_ = (arr); int32_t _i_ = (idx); \\`,
      `    if (_i_ < 0) _i_ = (int32_t)_a_.length + _i_; \\`,
      `    _a_.data[(size_t)_i_]; \\`,
      `})`,
    ]);
  },

  _ensureArrayWithMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_with_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, idx, val) ({ \\`,
      `    Array_${et} _a_ = (arr); int32_t _i_ = (idx); ${etC} _v_ = (val); \\`,
      `    if (_i_ < 0) _i_ = (int32_t)_a_.length + _i_; \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    _d_[(size_t)_i_] = _v_; \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
  },

  _ensureArrayToReversedMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_to_reversed_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = _a_.data[_a_.length - 1 - _i_]; \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
  },

  _ensureArrayToSplicedMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_to_spliced_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, start, del_cnt, ...) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    int32_t _s_ = (start); if (_s_ < 0) _s_ = (int32_t)_a_.length + _s_; \\`,
      `    if (_s_ < 0) _s_ = 0; if ((size_t)_s_ > _a_.length) _s_ = (int32_t)_a_.length; \\`,
      `    int32_t _dc_ = (del_cnt); if (_dc_ < 0) _dc_ = 0; \\`,
      `    if ((size_t)_dc_ > _a_.length - (size_t)_s_) _dc_ = (int32_t)(_a_.length - (size_t)_s_); \\`,
      `    ${etC} _ins_[] = {__VA_ARGS__}; size_t _ni_ = sizeof(_ins_) / sizeof(${etC}); \\`,
      `    size_t _new_len_ = (size_t)_s_ + _ni_ + (_a_.length - (size_t)_s_ - (size_t)_dc_); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_new_len_ * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, (size_t)_s_ * sizeof(${etC})); \\`,
      `    memcpy(_d_ + _s_, _ins_, _ni_ * sizeof(${etC})); \\`,
      `    memcpy(_d_ + _s_ + _ni_, _a_.data + _s_ + _dc_, (_a_.length - (size_t)_s_ - (size_t)_dc_) * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _new_len_, .capacity = _new_len_ }; \\`,
      `})`,
    ]);
  },

  _ensureArrayKeysMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_keys_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    int32_t *_d_ = (int32_t*)_tsc_xmalloc(_a_.length * sizeof(int32_t)); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = (int32_t)_i_; \\`,
      `    (Array_i32){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
  },

  _ensureArrayValuesMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_values_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    if (_a_.length) memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
  },

  _ensureArrayReverseMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_reverse_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr) do { \\`,
      `    Array_${et} *_a_ = (arr); \\`,
      `    for (size_t _l_ = 0, _r_ = _a_->length; _l_ < _r_; ) { \\`,
      `        _r_--; ${etC} _t_ = _a_->data[_l_]; _a_->data[_l_++] = _a_->data[_r_]; _a_->data[_r_] = _t_; \\`,
      `    } \\`,
      `} while(0)`,
    ]);
  },

  _ensureArrayFillMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_fill_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, val, start, end_idx) do { \\`,
      `    Array_${et} *_a_ = (arr); ${etC} _v_ = (val); int32_t _s_ = (start), _e_ = (end_idx); \\`,
      `    if (_s_ < 0) _s_ = 0; if (_e_ > (int32_t)_a_->length) _e_ = (int32_t)_a_->length; \\`,
      `    for (int32_t _i_ = _s_; _i_ < _e_; _i_++) _a_->data[_i_] = _v_; \\`,
      `} while(0)`,
    ]);
  },

  _ensureArrayResizeMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_resize_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, new_len, def_val) do { \\`,
      `    Array_${et} *_a_ = (arr); size_t _nl_ = (size_t)(new_len); ${etC} _dv_ = (def_val); \\`,
      `    if (_nl_ > _a_->capacity) { \\`,
      `        ${etC} *_nd_ = (${etC}*)_tsc_xmalloc(_nl_ * sizeof(${etC})); \\`,
      `        if (_a_->length > 0) memcpy(_nd_, _a_->data, _a_->length * sizeof(${etC})); \\`,
      `        for (size_t _i_ = _a_->length; _i_ < _nl_; _i_++) _nd_[_i_] = _dv_; \\`,
      `        _a_->data = _nd_; _a_->capacity = _nl_; \\`,
      `    } else if (_nl_ > _a_->length) { \\`,
      `        for (size_t _i_ = _a_->length; _i_ < _nl_; _i_++) _a_->data[_i_] = _dv_; \\`,
      `    } \\`,
      `    _a_->length = _nl_; \\`,
      `} while(0)`,
    ]);
  },

  _ensureArrayReallocateMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_reallocate_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, new_cap) do { \\`,
      `    Array_${et} *_a_ = (arr); size_t _nc_ = (size_t)(new_cap); \\`,
      `    ${etC} *_nd_ = (${etC}*)_tsc_xmalloc(_nc_ * sizeof(${etC})); \\`,
      `    size_t _cp_ = _a_->length < _nc_ ? _a_->length : _nc_; \\`,
      `    if (_cp_ > 0) memcpy(_nd_, _a_->data, _cp_ * sizeof(${etC})); \\`,
      `    _a_->data = _nd_; _a_->capacity = _nc_; \\`,
      `    if (_a_->length > _nc_) _a_->length = _nc_; \\`,
      `} while(0)`,
    ]);
  },

  _ensureArraySpliceMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_splice_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, start, del_cnt, ...) ({ \\`,
      `    Array_${et} *_a_ = (arr); \\`,
      `    int32_t _s_ = (start); if (_s_ < 0) _s_ = (int32_t)_a_->length + _s_; \\`,
      `    if (_s_ < 0) _s_ = 0; if ((size_t)_s_ > _a_->length) _s_ = (int32_t)_a_->length; \\`,
      `    int32_t _dc_ = (del_cnt); if (_dc_ < 0) _dc_ = 0; \\`,
      `    if ((size_t)_dc_ > _a_->length - (size_t)_s_) _dc_ = (int32_t)(_a_->length - (size_t)_s_); \\`,
      `    ${etC} _ins_[] = {__VA_ARGS__}; size_t _ni_ = sizeof(_ins_) / sizeof(${etC}); \\`,
      `    Array_${et} _r_ = {NULL, 0, 0}; \\`,
      `    if (_dc_ > 0) { \\`,
      `        _r_.data = (${etC}*)_tsc_xmalloc((size_t)_dc_ * sizeof(${etC})); \\`,
      `        memcpy(_r_.data, _a_->data + _s_, (size_t)_dc_ * sizeof(${etC})); \\`,
      `        _r_.length = (size_t)_dc_; _r_.capacity = (size_t)_dc_; \\`,
      `    } \\`,
      `    size_t _tail_ = _a_->length - (size_t)_s_ - (size_t)_dc_; \\`,
      `    size_t _new_len_ = (size_t)_s_ + _ni_ + _tail_; \\`,
      `    if (_new_len_ > _a_->capacity) { \\`,
      `        size_t _nc_ = _new_len_ * 2; \\`,
      `        _a_->data = (${etC}*)_tsc_xrealloc(_a_->data, _nc_ * sizeof(${etC})); _a_->capacity = _nc_; \\`,
      `    } \\`,
      `    if (_ni_ != (size_t)_dc_) { \\`,
      `        memmove(_a_->data + _s_ + _ni_, _a_->data + _s_ + _dc_, _tail_ * sizeof(${etC})); \\`,
      `    } \\`,
      `    memcpy(_a_->data + _s_, _ins_, _ni_ * sizeof(${etC})); \\`,
      `    _a_->length = _new_len_; \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayShiftMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) {
      this._ensureOptStruct(`opt_${et}`, etC);
      return;
    }
    const name = `tsc_array_shift_${et}`;
    this._ensureOptStruct(`opt_${et}`, etC);
    this._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} *_a_ = (arr); \\`,
      `    opt_${et} _r_ = {false, 0}; \\`,
      `    if (_a_->length > 0) { \\`,
      `        _r_ = (opt_${et}){true, _a_->data[0]}; \\`,
      `        memmove(_a_->data, _a_->data + 1, (_a_->length - 1) * sizeof(${etC})); \\`,
      `        _a_->length--; \\`,
      `    } \\`,
      `    _r_; \\`,
      `})`,
    ]);
  },

  _ensureArrayUnshiftMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_unshift_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, val) do { \\`,
      `    Array_${et} *_a_ = (arr); ${etC} _v_ = (val); \\`,
      `    if (_a_->length >= _a_->capacity) { \\`,
      `        size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; \\`,
      `        _a_->data = (${etC}*)_tsc_xrealloc(_a_->data, _nc_ * sizeof(${etC})); _a_->capacity = _nc_; \\`,
      `    } \\`,
      `    memmove(_a_->data + 1, _a_->data, _a_->length * sizeof(${etC})); \\`,
      `    _a_->data[0] = _v_; _a_->length++; \\`,
      `} while(0)`,
    ]);
  },

  _ensureArrayRemoveMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_remove_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, idx) ({ \\`,
      `    Array_${et} *_a_ = (arr); size_t _i_ = (size_t)(idx); \\`,
      `    ${etC} _v_ = _a_->data[_i_]; \\`,
      `    memmove(_a_->data + _i_, _a_->data + _i_ + 1, (_a_->length - _i_ - 1) * sizeof(${etC})); \\`,
      `    _a_->length--; _v_; \\`,
      `})`,
    ]);
  },

  _ensureArraySetMacro(et: any, etC: any) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_set_${et}`;
    this._emitArrayMacro(name, [
      `#define ${name}(arr, src, offset) do { \\`,
      `    Array_${et} *_d_ = (arr); Array_${et} _s_ = (src); size_t _off_ = (size_t)(offset); \\`,
      `    for (size_t _i_ = 0; _i_ < _s_.length && _off_ + _i_ < _d_->length; _i_++) \\`,
      `        _d_->data[_off_ + _i_] = _s_.data[_i_]; \\`,
      `} while(0)`,
    ]);
  }
};
