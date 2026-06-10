// helpers.js
export default {
  _cTypeBytes(ct) {
    const m = { 'uint8_t':1,'int8_t':1,'uint16_t':2,'int16_t':2,'uint32_t':4,'int32_t':4,'uint64_t':8,'int64_t':8,'float':4,'double':8,'bool':1,'char':1 };
    if (ct === 'size_t') return this._isEmbedded() ? 4 : 8;
    return m[ct] ?? 4;
  },

  _stackSizeOf(ct) {
    if (!ct || ct === 'void') return 0;
    if (ct.endsWith(' *')) return this._isEmbedded() ? 4 : 8;
    if (ct.startsWith('opt_ref_')) return this._isEmbedded() ? 8 : 16;
    if (ct.startsWith('opt_')) {
      const inner = ct.slice(4);
      return this._stackSizeOf(inner) + 4;
    }
    if (ct.startsWith('tuple_')) {
      const def = this.classes.get(ct);
      if (def?.fields) return def.fields.reduce((s, f) => s + this._stackSizeOf(this.resolveType(f.typeAnn)), 0);
      return 4;
    }
    const cls = this.classes.get(ct);
    if (cls?.isStruct && cls.fields) {
      return cls.fields.reduce((s, f) => s + this._stackSizeOf(this.resolveType(f.typeAnn)), 0);
    }
    if (cls?.isTuple && cls.fields) {
      return cls.fields.reduce((s, f) => s + this._stackSizeOf(this.resolveType(f.typeAnn)), 0);
    }
    if (ct.startsWith('Array_') || ct.startsWith('TscMap_') || ct.startsWith('Map_') || ct.startsWith('Set_') || ct.startsWith('TscSet_')) {
      return this._isEmbedded() ? 4 : 8;
    }
    return this._cTypeBytes(ct);
  },

  cTypeToIdent(ctype) {
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

  ctypeToTsName(ctype) {
    const m = {
      'int8_t': 'i8', 'int16_t': 'i16', 'int32_t': 'i32', 'int64_t': 'i64',
      'uint8_t': 'u8', 'uint16_t': 'u16', 'uint32_t': 'u32', 'uint64_t': 'u64',
      'float': 'f32', 'double': 'f64', 'bool': 'boolean',
      'String': 'string', 'size_t': 'usize', 'ptrdiff_t': 'isize',
    };
    return m[ctype] ?? ctype;
  },

  // Map array element identifier back to C type (reverse of cTypeToIdent)
  _arrIdentToCType(ident) {
    const m = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                'f32':'float','f64':'double','bool':'bool','string':'String',
                'usize':'size_t','char':'char' };
    return m[ident] ?? ident;
  },

  // Returns map suffix if ctype is Map_* or TscMap_*, otherwise null
  _mapSuffix(ctype) {
    if (!ctype) return null;
    if (ctype.startsWith('TscMap_')) return ctype.slice(7);
    if (ctype.startsWith('Map_')) return ctype.slice(4);
    return null;
  },

  // Ensure TscMap_K_V is defined (idempotent). runtime.h provides string_i32 via TSC_MAP_DECL.
  _ensureMapStruct(suffix) {
    this._emittedMapStructs.add(suffix);
  },

  // Emit MapEntry_K_V and Array_MapEntry_K_V struct typedefs (idempotent)
  _ensureMapEntry(suffix, kCType, vCType) {
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

  _ensureRefArrayStruct(arrName, et) {
    if (!this._emittedArrayStructs.has(arrName)) {
      this._emittedArrayStructs.add(arrName);
      this.addTop(`typedef struct { ${et} **data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
    }
  },

  // Emit Array_T struct typedef (idempotent)
  _ensureArrayStruct(arrName, et) {
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

  _ensureArrayFreeMacro(elemIdent, arrName, et) {
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

  _ensureArrayPushMacro(elemIdent, arrName, et) {
    const key = `push_${elemIdent}`;
    if (!this._emittedHelpers.has(key)) {
      this._emittedHelpers.add(key);
      this.addTop(`#define tsc_array_push_${elemIdent}(arr, val) do { ${arrName} *_a_ = (arr); ${et} _v_ = (val); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (${et}*)realloc(_a_->data, _nc_ * sizeof(${et})); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)`);
    }
  },

  _isOptType(elemType) {
    return elemType?.startsWith('opt_');
  },

  _wrapOptValue(cExpr, exprNode, elemType) {
    if (!this._isOptType(elemType)) return cExpr;
    const innerCType = this._arrIdentToCType(elemType.slice(4));
    if (exprNode.kind === 'Literal' && exprNode.litType === 'null') {
      return `((${elemType}){false, 0})`;
    }
    return `((${elemType}){true, ${cExpr}})`;
  },

  _ensureOptArrayMacros(elemIdent, arrName, et) {
    this._ensureArrayFreeMacro(elemIdent, arrName, et);
    this._ensureArrayPushMacro(elemIdent, arrName, et);
    this._ensureArrayPopMacro(elemIdent, arrName, et);
  },

  _ensureArrayPopMacro(elemIdent, arrName, et) {
    const key = `pop_${elemIdent}`;
    if (!this._emittedHelpers.has(key)) {
      this._emittedHelpers.add(key);
      this.addTop(`#define tsc_array_pop_${elemIdent}(arr) ({ ${arrName} *_a_ = (arr); ${et} _r_ = {false, 0}; if (_a_->length > 0) { _r_ = _a_->data[--_a_->length]; } _r_; })`);
    }
  },

  // Emit opt_T struct typedef (idempotent): { bool has_value; T value; }
  // Inserts before any trailing blank line so typedefs group together.
  _ensureOptStruct(optName, ctype) {
    if (!this._emittedOptStructs.has(optName)) {
      this._emittedOptStructs.add(optName);
      this.addTop(`typedef struct { bool has_value; ${ctype} value; } ${optName};`);
    }
  },

  // Emit Slice_T / MutSlice_T typedef (idempotent)
  _ensureSliceStruct(slName, etC, mutable = false) {
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
  _ensureOptRefStruct(optName, ctype) {

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

  _tsNameToTypeId(tsName) {
    if (tsName === 'number') return this._tsNameToTypeId(this._defaultNumber);
    const m = { 'i8': 10, 'i16': 11, 'i32': 1, 'i64': 2, 'u8': 12, 'u16': 13, 'u32': 14, 'u64': 15, 'f32': 3, 'f64': 4, 'boolean': 5, 'string': 6, 'array': 7, 'object': 8, 'char': 16 };
    return m[tsName] ?? 0;
  },

  _tsNameToCType(tsName) {
    if (tsName === 'number') return this._tsNameToCType(this._defaultNumber);
    const m = { 'i8': 'int8_t', 'i16': 'int16_t', 'i32': 'int32_t', 'i64': 'int64_t', 'u8': 'uint8_t', 'u16': 'uint16_t', 'u32': 'uint32_t', 'u64': 'uint64_t', 'f32': 'float', 'f64': 'double', 'boolean': 'bool', 'string': 'String', 'char': 'char' };
    return m[tsName] ?? 'int32_t';
  },

  _unknownPackerFor(ctype) {
    const m = { 'int8_t': 'tsc_unknown_from_i32', 'int16_t': 'tsc_unknown_from_i32', 'int32_t': 'tsc_unknown_from_i32', 'int64_t': 'tsc_unknown_from_i64', 'uint8_t': 'tsc_unknown_from_i32', 'uint16_t': 'tsc_unknown_from_i32', 'uint32_t': 'tsc_unknown_from_i32', 'uint64_t': 'tsc_unknown_from_i64', 'float': 'tsc_unknown_from_f32', 'double': 'tsc_unknown_from_f64', 'bool': 'tsc_unknown_from_bool', 'String': 'tsc_unknown_from_string', 'char': 'tsc_unknown_from_char' };
    if (m[ctype]) return m[ctype];
    if (ctype.startsWith('Array_')) {
      if (this._isEmbedded()) {
        throw this.error(`Type '${ctype}' exceeds embedded unknown inline buffer (3 words). Use Ref or pointers for indirect storage`);
      }
      const elemIdent = ctype.slice(6);
      const et = this._arrIdentToCType(elemIdent);
      this._ensureUnknownPackerArray(elemIdent, ctype, et);
      return `tsc_unknown_from_${ctype}`;
    }
    if (this._isEmbedded()) {
      throw this.error(`Type '${ctype}' exceeds embedded unknown inline buffer (3 words). Use Ref or pointers for indirect storage`);
    }
    if (this.classes.has(ctype)) {
      this._ensureUnknownPackerClass(ctype);
      return `tsc_unknown_from_${ctype}`;
    }
    return 'tsc_unknown_from_i32';
  },

  _unknownGetterFor(ctype) {
    const m = { 'int8_t': 'tsc_unknown_get_i32', 'int16_t': 'tsc_unknown_get_i32', 'int32_t': 'tsc_unknown_get_i32', 'int64_t': 'tsc_unknown_get_i64', 'uint8_t': 'tsc_unknown_get_i32', 'uint16_t': 'tsc_unknown_get_i32', 'uint32_t': 'tsc_unknown_get_i32', 'uint64_t': 'tsc_unknown_get_i64', 'float': 'tsc_unknown_get_f32', 'double': 'tsc_unknown_get_f64', 'bool': 'tsc_unknown_get_bool', 'String': 'tsc_unknown_get_string', 'char': 'tsc_unknown_get_char' };
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

  _ensureUnknownPackerArray(elemIdent, arrName, et) {
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

  _ensureUnknownPackerClass(className) {
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

  _ensureGroupByMapStruct(etIdent, etCType) {
    const key = `groupby_${etIdent}`;
    if (this._emittedHelpers.has(key)) return;
    this._emittedHelpers.add(key);
    const arrName = `Array_${etIdent}`;
    this._ensureArrayStruct(arrName, etCType);
    const mapName = `TscMap_string_array_${etIdent}`;
    this.addTop(`typedef struct { String _keys[64]; ${arrName} _vals[64]; size_t size; } ${mapName};`);
    this.addTop('');
  }
};
