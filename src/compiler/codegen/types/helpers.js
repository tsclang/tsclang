// helpers.js
export default {
  _cTypeBytes(ct) {
    const m = { 'uint8_t':1,'int8_t':1,'uint16_t':2,'int16_t':2,'uint32_t':4,'int32_t':4,'uint64_t':8,'int64_t':8,'float':4,'double':8,'bool':1,'char':1,'size_t':4 };
    return m[ct] ?? 4;
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
      'float': 'f32', 'double': 'f64', 'bool': 'bool',
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

  // Emit Array_T struct typedef (idempotent)
  _ensureArrayStruct(arrName, et) {

    if (!this._emittedArrayStructs.has(arrName)) {
      this._emittedArrayStructs.add(arrName);
      this.addTop(`typedef struct { ${et} *data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
    }
  },

  _ensureArrayFreeMacro(elemIdent, arrName, et) {
    const key = `free_${elemIdent}`;
    if (!this._emittedHelpers.has(key)) {
      this._emittedHelpers.add(key);
      this.addTop(`#define tsc_array_free_${elemIdent}(arr) do { ${arrName} *_a_ = (arr); if (_a_->data && _a_->capacity > 0) free(_a_->data); _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)`);
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
    const m = { 'i8': 10, 'i16': 11, 'i32': 1, 'i64': 2, 'u8': 12, 'u16': 13, 'u32': 14, 'u64': 15, 'f32': 3, 'f64': 4, 'bool': 5, 'number': 4, 'string': 6 };
    return m[tsName] ?? 0;
  },

  _tsNameToCType(tsName) {
    const m = { 'i8': 'int8_t', 'i16': 'int16_t', 'i32': 'int32_t', 'i64': 'int64_t', 'u8': 'uint8_t', 'u16': 'uint16_t', 'u32': 'uint32_t', 'u64': 'uint64_t', 'f32': 'float', 'f64': 'double', 'bool': 'bool', 'number': 'double', 'string': 'String' };
    return m[tsName] ?? 'int32_t';
  },

  _unknownPackerFor(ctype) {
    const m = { 'int8_t': 'tsc_unknown_from_i32', 'int16_t': 'tsc_unknown_from_i32', 'int32_t': 'tsc_unknown_from_i32', 'int64_t': 'tsc_unknown_from_i64', 'uint8_t': 'tsc_unknown_from_i32', 'uint16_t': 'tsc_unknown_from_i32', 'uint32_t': 'tsc_unknown_from_i32', 'uint64_t': 'tsc_unknown_from_i64', 'float': 'tsc_unknown_from_f32', 'double': 'tsc_unknown_from_f64', 'bool': 'tsc_unknown_from_bool', 'String': 'tsc_unknown_from_string' };
    return m[ctype] ?? 'tsc_unknown_from_i32';
  },

  _unknownGetterFor(ctype) {
    const m = { 'int8_t': 'tsc_unknown_get_i32', 'int16_t': 'tsc_unknown_get_i32', 'int32_t': 'tsc_unknown_get_i32', 'int64_t': 'tsc_unknown_get_i64', 'uint8_t': 'tsc_unknown_get_i32', 'uint16_t': 'tsc_unknown_get_i32', 'uint32_t': 'tsc_unknown_get_i32', 'uint64_t': 'tsc_unknown_get_i64', 'float': 'tsc_unknown_get_f32', 'double': 'tsc_unknown_get_f64', 'bool': 'tsc_unknown_get_bool', 'String': 'tsc_unknown_get_string' };
    return m[ctype] ?? 'tsc_unknown_get_i32';
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
