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
  }
};
