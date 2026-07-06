import type { CodeGenContext } from '../../codegen.js';
// helpers.ts
import { TSC_DEFINES } from '@tsclang/shared';
import type { Expression, TypeAnn } from '@tsclang/ast';

const _RUNTIME_ET = new Set(['i32', 'f64', 'string']);
const _RUNTIME_MAP = new Set(['i32_i32', 'i32_f64', 'f64_f64', 'string_string']);
const _RUNTIME_FLATMAP = new Set(['i32_i32', 'f64_f64', 'string_string']);
const _RUNTIME_REDUCE = new Set(['i32_i32', 'i32_f64', 'i32_string', 'f64_string', 'string_string']);
const _RUNTIME_REDUCE_R = new Set(['i32_i32', 'i32_f64']);
const _RUNTIME_FLAT = new Set(['i32', 'f64', 'string', 'Array_i32']);

export interface NumInfo { bits: number; signed: boolean; kind: string; mantissa?: number; scale?: number; decimals?: number }

export function _cTypeBytes(ctx: CodeGenContext, ct: string) {
    const m: Record<string, number> = { 'uint8_t':1,'int8_t':1,'uint16_t':2,'int16_t':2,'uint32_t':4,'int32_t':4,'uint64_t':8,'int64_t':8,'float':4,'double':8,'bool':1,'char':1,'d8_t':1,'d16_t':2,'d32_t':4,'d64_t':8 };
    if (ct === 'size_t') return ctx._ptrBytes();
    return m[ct] ?? 4;
}

export function _stackSizeOf(ctx: CodeGenContext, ct: string): number {
    if (!ct || ct === 'void') return 0;
    if (ct.endsWith(' *')) return ctx._ptrBytes();
    if (ct.startsWith('opt_ref_')) return ctx._ptrBytes() * 2;
    if (ct.startsWith('opt_')) {
      const inner = ct.slice(4);
      return ctx._stackSizeOf(inner) + 4;
    }
    if (ct.startsWith('tuple_')) {
      const def = ctx.classes.get(ct);
      if (def?.fields) return def.fields.reduce((s: number, f: { typeAnn?: TypeAnn | null }) => s + ctx._stackSizeOf(ctx.resolveType(f.typeAnn)), 0);
      return 4;
    }
    const cls = ctx.classes.get(ct);
    if (cls?.isStruct && cls.fields) {
      return cls.fields.reduce((s: number, f: { typeAnn?: TypeAnn | null }) => s + ctx._stackSizeOf(ctx.resolveType(f.typeAnn)), 0);
    }
    if (cls?.isTuple && cls.fields) {
      return cls.fields.reduce((s: number, f: { typeAnn?: TypeAnn | null }) => s + ctx._stackSizeOf(ctx.resolveType(f.typeAnn)), 0);
    }
    if (ct.startsWith('Array_') || ct.startsWith('TscMap_') || ct.startsWith('Map_') || ct.startsWith('Set_') || ct.startsWith('TscSet_')) {
      return ctx._ptrBytes();
    }
    return ctx._cTypeBytes(ct);
}

export function cTypeToIdent(ctx: CodeGenContext, ctype: string) {
    // Map C type to a valid identifier suffix
    const m: Record<string, string> = {
      'int8_t': 'i8', 'int16_t': 'i16', 'int32_t': 'i32', 'int64_t': 'i64',
      'uint8_t': 'u8', 'uint16_t': 'u16', 'uint32_t': 'u32', 'uint64_t': 'u64',
      'float': 'f32', 'double': 'f64',
      'd8_t': 'd8', 'd16_t': 'd16', 'd32_t': 'd32', 'd64_t': 'd64',
      'bool': 'bool', 'String': 'string', 'size_t': 'usize', 'void': 'void',
      'char': 'char',
    };
    if (ctype.startsWith('tuple_')) return 'tuple';
    return m[ctype] ?? ctype.replace(/[^a-zA-Z0-9]/g, '_');
}

export function ctypeToTsName(ctx: CodeGenContext, ctype: string) {
    const m: Record<string, string> = {
      'int8_t': 'i8', 'int16_t': 'i16', 'int32_t': 'i32', 'int64_t': 'i64',
      'uint8_t': 'u8', 'uint16_t': 'u16', 'uint32_t': 'u32', 'uint64_t': 'u64',
      'float': 'f32', 'double': 'f64', 'bool': 'boolean',
      'd8_t': 'd8', 'd16_t': 'd16', 'd32_t': 'd32', 'd64_t': 'd64',
      'String': 'string', 'size_t': 'usize', 'ptrdiff_t': 'isize',
    };
    return m[ctype] ?? ctype;
}

export function _numericTypeInfo(ctx: CodeGenContext, ct: string) {
    const m: Record<string, NumInfo> = {
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
      'd8_t':   { bits: 8,  signed: true,  kind: 'decimal', scale: 100,       decimals: 2 },
      'd16_t':  { bits: 16, signed: true,  kind: 'decimal', scale: 100,       decimals: 2 },
      'd32_t':  { bits: 32, signed: true,  kind: 'decimal', scale: 10000,     decimals: 4 },
      'd64_t':  { bits: 64, signed: true,  kind: 'decimal', scale: 100000000, decimals: 8 },
      'size_t':   { bits: ctx._cTypeBytes('size_t') * 8, signed: false, kind: 'int' },
    };
    if (m[ct]) return m[ct];
    // Resolve scalar aliases (type Money = d32) for decimal types
    const alias = ctx.classes.get(ct);
    if (alias?.isScalarAlias && alias.innerType && m[alias.innerType]) return m[alias.innerType];
    return null;
}

export function _isSafeWidening(ctx: CodeGenContext, src: string, dst: string) {
    if (src === dst) return true;
    if (src === 'size_t' && (dst === 'int64_t' || dst === 'uint64_t')) return true;
    const si = ctx._numericTypeInfo(src);
    const di = ctx._numericTypeInfo(dst);
    if (!si || !di) return true;
    if (si.kind === 'float' && di.kind === 'int') return false;
    if (si.kind === 'float' && di.kind === 'float') return di.bits >= si.bits;
    if (si.kind === 'int' && di.kind === 'float') return si.bits <= (di.mantissa ?? 53);
    if (si.kind === 'decimal' || di.kind === 'decimal') {
      if (si.kind === 'decimal' && di.kind === 'decimal') {
        return di.bits >= si.bits && (di.scale ?? 0) >= (si.scale ?? 0);
      }
      return false;
    }
    if (si.signed === di.signed) return di.bits >= si.bits;
    if (!si.signed && di.signed) return di.bits > si.bits;
    return false;
}

  // Map array element identifier back to C type (reverse of cTypeToIdent)
export function _arrIdentToCType(ctx: CodeGenContext, ident: string) {
    const m: Record<string, string> = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                'f32':'float','f64':'double','bool':'bool','string':'String',
                'usize':'size_t','char':'char',
                'd8':'d8_t','d16':'d16_t','d32':'d32_t','d64':'d64_t' };
    return m[ident] ?? ident;
}

  // Returns map suffix if ctype is Map_* or TscMap_*, otherwise null
export function _mapSuffix(ctx: CodeGenContext, ctype: string) {
    if (!ctype) return null;
    if (ctype.startsWith('TscMap_')) return ctype.slice(7);
    if (ctype.startsWith('Map_')) return ctype.slice(4);
    return null;
}

  // Ensure TscMap_K_V is defined (idempotent). runtime.h provides string_i32 via TSC_MAP_DECL.
export function _ensureMapStruct(ctx: CodeGenContext, suffix: string) {

    ctx._emittedMapStructs.add(suffix);
}

  // Emit MapEntry_K_V and Array_MapEntry_K_V struct typedefs (idempotent)
export function _ensureMapEntry(ctx: CodeGenContext, suffix: string, kCType: string, vCType: string) {
    if (!ctx._emittedMapEntries.has(suffix)) {
      ctx._emittedMapEntries.add(suffix);
      const entryName = `MapEntry_${suffix}`;
      const arrName = `Array_${entryName}`;
      ctx.addTop(`typedef struct { ${kCType} key; ${vCType} value; } ${entryName};`);
      ctx.addTop(`typedef struct { ${entryName} *data; size_t length; size_t capacity; } ${arrName};`);
      ctx.addTop('');
      // Register in _emittedArrayStructs to prevent _ensureArrayStruct from re-emitting

      ctx._emittedArrayStructs.add(arrName);
    }
}

export function _ensureRefArrayStruct(ctx: CodeGenContext, arrName: string, et: string) {
    if (!ctx._emittedArrayStructs.has(arrName)) {
      ctx._emittedArrayStructs.add(arrName);
      ctx.addTop(`typedef struct { ${et} **data; size_t length; size_t capacity; } ${arrName};`);
      ctx.addTop('');
    }
}

  // Emit Array_T struct typedef (idempotent)
export function _ensureArrayStruct(ctx: CodeGenContext, arrName: string, et: string) {
    if (!ctx._emittedArrayStructs.has(arrName)) {
      ctx._emittedArrayStructs.add(arrName);
      ctx.addTop(`typedef struct { ${et} *data; size_t length; size_t capacity; } ${arrName};`);
      ctx.addTop('');
      if (et === 'tsc_unknown') {
        ctx._ensureArrayFreeMacro('tsc_unknown', arrName, et);
        ctx._ensureArrayPushMacro('tsc_unknown', arrName, et);
      }
      if (ctx._isOptType(et)) {
        const ident = ctx.cTypeToIdent(et);
        ctx._ensureOptArrayMacros(ident, arrName, et);
      }
    }
}

export function _ensureArrayFreeMacro(ctx: CodeGenContext, elemIdent: string, arrName: string, et: string) {
    const key = `free_${elemIdent}`;
    if (!ctx._emittedHelpers.has(key)) {
      ctx._emittedHelpers.add(key);
      if (elemIdent === 'tsc_unknown') {
        ctx.addTop(`#define tsc_array_free_tsc_unknown(arr) do { Array_tsc_unknown *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_unknown_drop(&_a_->data[_i_]); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)`);
      } else {
        ctx.addTop(`#define tsc_array_free_${elemIdent}(arr) do { ${arrName} *_a_ = (arr); if (_a_->data && _a_->capacity > 0) free(_a_->data); _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)`);
      }
    }
}

export function _ensureArrayPushMacro(ctx: CodeGenContext, elemIdent: string, arrName: string, et: string) {
    const key = `push_${elemIdent}`;
    if (!ctx._emittedHelpers.has(key)) {
      ctx._emittedHelpers.add(key);
      ctx.addTop(`#define tsc_array_push_${elemIdent}(arr, val) do { ${arrName} *_a_ = (arr); ${et} _v_ = (val); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (${et}*)realloc(_a_->data, _nc_ * sizeof(${et})); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)`);
    }
}

export function _isOptType(ctx: CodeGenContext, elemType: string) {
    return elemType?.startsWith('opt_');
}

export function _wrapOptValue(ctx: CodeGenContext, cExpr: string, exprNode: Expression, elemType: string) {
    if (!ctx._isOptType(elemType)) return cExpr;
    const innerCType = ctx._arrIdentToCType(elemType.slice(4));
    if (exprNode.kind === 'Literal' && exprNode.litType === 'null') {
      return `((${elemType}){false, 0})`;
    }
    return `((${elemType}){true, ${cExpr}})`;
}

export function _ensureOptArrayMacros(ctx: CodeGenContext, elemIdent: string, arrName: string, et: string) {
    ctx._ensureArrayFreeMacro(elemIdent, arrName, et);
    ctx._ensureArrayPushMacro(elemIdent, arrName, et);
    ctx._ensureArrayPopMacro(elemIdent, arrName, et);
}

export function _ensureArrayPopMacro(ctx: CodeGenContext, elemIdent: string, arrName: string, et: string) {
    const key = `pop_${elemIdent}`;
    if (!ctx._emittedHelpers.has(key)) {
      ctx._emittedHelpers.add(key);
      ctx.addTop(`#define tsc_array_pop_${elemIdent}(arr) ({ ${arrName} *_a_ = (arr); ${et} _r_ = {false, 0}; if (_a_->length > 0) { _r_ = _a_->data[--_a_->length]; } _r_; })`);
    }
}

  // Emit opt_T struct typedef (idempotent): { bool has_value; T value; }
  // Inserts before any trailing blank line so typedefs group together.
export function _ensureOptStruct(ctx: CodeGenContext, optName: string, ctype: string) {
    if (!ctx._emittedOptStructs.has(optName)) {
      ctx._emittedOptStructs.add(optName);
      ctx.addTop(`typedef struct { bool has_value; ${ctype} value; } ${optName};`);
    }
}

  // Emit Slice_T / MutSlice_T typedef (idempotent)
export function _ensureSliceStruct(ctx: CodeGenContext, slName: string, etC: string, mutable = false) {
    if (ctx._emittedSliceStructs.has(slName)) return;
    ctx._emittedSliceStructs.add(slName);
    const ptrType = mutable ? `${etC} *` : `const ${etC} *`;
    ctx.addTop(`typedef struct { ${ptrType}ptr; size_t length; } ${slName};`);
}

  // Emit Slice_u8 typedef (idempotent): { uint8_t *ptr; size_t length; }
export function _ensureSliceU8Struct(ctx: CodeGenContext) {
    if (ctx._emittedSliceU8) return;
    ctx._emittedSliceU8 = true;
    ctx._ensureSliceStruct('Slice_u8', 'uint8_t', true);
}

  // Emit opt_ref_T struct typedef (idempotent): { bool has_value; T *value; }
export function _ensureOptRefStruct(ctx: CodeGenContext, optName: string, ctype: string) {

    if (!ctx._emittedOptStructs.has(optName)) {
      ctx._emittedOptStructs.add(optName);
      ctx.addTop(`typedef struct { bool has_value; ${ctype} *value; } ${optName};`);
    }
}

export function _ensureUnknownStruct(ctx: CodeGenContext) {
    if (ctx._emittedUnknownStruct) return;
    ctx._emittedUnknownStruct = true;
    ctx.addTop('typedef struct tsc_unknown_vtable { void (*drop)(void *buf); void (*clone_into)(const void *src, void *dst); } tsc_unknown_vtable;');
    ctx.addTop('typedef struct { uint32_t type_id; const tsc_unknown_vtable *vtable; uint8_t buffer[3 * sizeof(void*)]; } tsc_unknown;');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_i32 = {NULL, NULL};');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_i64 = {NULL, NULL};');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_f32 = {NULL, NULL};');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_f64 = {NULL, NULL};');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_bool = {NULL, NULL};');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_char = {NULL, NULL};');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_i32(int32_t v) { tsc_unknown u = {.type_id = 1, .vtable = &_tsc_vt_i32}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    ctx.addTop('static inline int32_t tsc_unknown_get_i32(const tsc_unknown *self) { int32_t v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_i64(int64_t v) { tsc_unknown u = {.type_id = 2, .vtable = &_tsc_vt_i64}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    ctx.addTop('static inline int64_t tsc_unknown_get_i64(const tsc_unknown *self) { int64_t v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_f32(float v) { tsc_unknown u = {.type_id = 3, .vtable = &_tsc_vt_f32}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    ctx.addTop('static inline float tsc_unknown_get_f32(const tsc_unknown *self) { float v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_f64(double v) { tsc_unknown u = {.type_id = 4, .vtable = &_tsc_vt_f64}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    ctx.addTop('static inline double tsc_unknown_get_f64(const tsc_unknown *self) { double v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_bool(bool v) { tsc_unknown u = {.type_id = 5, .vtable = &_tsc_vt_bool}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    ctx.addTop('static inline bool tsc_unknown_get_bool(const tsc_unknown *self) { bool v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_char(char v) { tsc_unknown u = {.type_id = 16, .vtable = &_tsc_vt_char}; memcpy(u.buffer, &v, sizeof(v)); return u; }');
    ctx.addTop('static inline char tsc_unknown_get_char(const tsc_unknown *self) { char v; memcpy(&v, self->buffer, sizeof(v)); return v; }');
    ctx.addTop(`#ifdef ${TSC_DEFINES.EMBEDDED}`);
    ctx.addTop('static void _tsc_unknown_drop_string(void *buf) { (void)buf; }');
    ctx.addTop('static void _tsc_unknown_clone_string(const void *src, void *dst) { memcpy(dst, src, sizeof(String)); }');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_string = {_tsc_unknown_drop_string, _tsc_unknown_clone_string};');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_string(String s) { tsc_unknown u = {.type_id = 6, .vtable = &_tsc_vt_string}; memcpy(u.buffer, &s, sizeof(String)); return u; }');
    ctx.addTop('static inline String tsc_unknown_get_string(const tsc_unknown *self) { String s; memcpy(&s, self->buffer, sizeof(String)); return s; }');
    ctx.addTop('#else');
    ctx.addTop('static void _tsc_unknown_drop_string(void *buf) { String *ptr; memcpy(&ptr, buf, sizeof(ptr)); if (ptr) { tsc_string_release(*ptr); free(ptr); } }');
    ctx.addTop('static void _tsc_unknown_clone_string(const void *src, void *dst) { String *sp; memcpy(&sp, src, sizeof(String*)); String *dp = (String*)malloc(sizeof(String)); *dp = *sp; tsc_string_retain(*dp); memcpy(dst, &dp, sizeof(dp)); }');
    ctx.addTop('static const tsc_unknown_vtable _tsc_vt_string = {_tsc_unknown_drop_string, _tsc_unknown_clone_string};');
    ctx.addTop('static inline tsc_unknown tsc_unknown_from_string(String s) { String *ptr = (String*)malloc(sizeof(String)); *ptr = s; tsc_string_retain(*ptr); tsc_unknown u = {.type_id = 6, .vtable = &_tsc_vt_string}; memcpy(u.buffer, &ptr, sizeof(ptr)); return u; }');
    ctx.addTop('static inline String tsc_unknown_get_string(const tsc_unknown *self) { String *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return *ptr; }');
    ctx.addTop('#endif');
    ctx.addTop('static inline void tsc_unknown_drop(tsc_unknown *self) { if (self->vtable && self->vtable->drop) self->vtable->drop(self->buffer); }');
}

export function _tsNameToTypeId(ctx: CodeGenContext, tsName: string): number {
    if (tsName === 'number') return ctx._tsNameToTypeId(ctx._defaultNumber);
    const m: Record<string, number> = { 'i8': 10, 'i16': 11, 'i32': 1, 'i64': 2, 'u8': 12, 'u16': 13, 'u32': 14, 'u64': 15, 'f32': 3, 'f64': 4, 'd8': 20, 'd16': 21, 'd32': 22, 'd64': 23, 'boolean': 5, 'string': 6, 'array': 7, 'object': 8, 'char': 16 };
    return m[tsName] ?? 0;
}

export function _tsNameToCType(ctx: CodeGenContext, tsName: string): string {
    if (tsName === 'number') return ctx._tsNameToCType(ctx._defaultNumber);
    const m: Record<string, string> = { 'i8': 'int8_t', 'i16': 'int16_t', 'i32': 'int32_t', 'i64': 'int64_t', 'u8': 'uint8_t', 'u16': 'uint16_t', 'u32': 'uint32_t', 'u64': 'uint64_t', 'f32': 'float', 'f64': 'double', 'd8': 'd8_t', 'd16': 'd16_t', 'd32': 'd32_t', 'd64': 'd64_t', 'boolean': 'bool', 'string': 'String', 'char': 'char' };
    return m[tsName] ?? 'int32_t';
}

export function _unknownPackerFor(ctx: CodeGenContext, ctype: string) {
    const m: Record<string, string> = { 'int8_t': 'tsc_unknown_from_i32', 'int16_t': 'tsc_unknown_from_i32', 'int32_t': 'tsc_unknown_from_i32', 'int64_t': 'tsc_unknown_from_i64', 'uint8_t': 'tsc_unknown_from_i32', 'uint16_t': 'tsc_unknown_from_i32', 'uint32_t': 'tsc_unknown_from_i32', 'uint64_t': 'tsc_unknown_from_i64', 'float': 'tsc_unknown_from_f32', 'double': 'tsc_unknown_from_f64', 'bool': 'tsc_unknown_from_bool', 'String': 'tsc_unknown_from_string', 'char': 'tsc_unknown_from_char' };
    if (m[ctype]) return m[ctype];
    if (ctype.startsWith('Array_')) {
      if (ctx._cap('allocator') !== 'heap' || ctx._cap('bits') < 64) {
        throw ctx.error(`Type '${ctype}' exceeds embedded unknown inline buffer (3 words). Use Ref or pointers for indirect storage`);
      }
      const elemIdent = ctype.slice(6);
      const et = ctx._arrIdentToCType(elemIdent);
      ctx._ensureUnknownPackerArray(elemIdent, ctype, et);
      return `tsc_unknown_from_${ctype}`;
    }
    if (ctx._cap('allocator') !== 'heap' || ctx._cap('bits') < 64) {
      throw ctx.error(`Type '${ctype}' exceeds embedded unknown inline buffer (3 words). Use Ref or pointers for indirect storage`);
    }
    if (ctx.classes.has(ctype)) {
      ctx._ensureUnknownPackerClass(ctype);
      return `tsc_unknown_from_${ctype}`;
    }
    return 'tsc_unknown_from_i32';
}

export function _unknownGetterFor(ctx: CodeGenContext, ctype: string) {
    const m: Record<string, string> = { 'int8_t': 'tsc_unknown_get_i32', 'int16_t': 'tsc_unknown_get_i32', 'int32_t': 'tsc_unknown_get_i32', 'int64_t': 'tsc_unknown_get_i64', 'uint8_t': 'tsc_unknown_get_i32', 'uint16_t': 'tsc_unknown_get_i32', 'uint32_t': 'tsc_unknown_get_i32', 'uint64_t': 'tsc_unknown_get_i64', 'float': 'tsc_unknown_get_f32', 'double': 'tsc_unknown_get_f64', 'bool': 'tsc_unknown_get_bool', 'String': 'tsc_unknown_get_string', 'char': 'tsc_unknown_get_char' };
    if (m[ctype]) return m[ctype];
    if (ctype.startsWith('Array_')) {
      const elemIdent = ctype.slice(6);
      const et = ctx._arrIdentToCType(elemIdent);
      ctx._ensureUnknownPackerArray(elemIdent, ctype, et);
      return `tsc_unknown_get_${ctype}`;
    }
    if (ctx.classes.has(ctype)) {
      ctx._ensureUnknownPackerClass(ctype);
      return `tsc_unknown_get_${ctype}`;
    }
    return 'tsc_unknown_get_i32';
}

export function _ensureUnknownPackerArray(ctx: CodeGenContext, elemIdent: string, arrName: string, et: string) {
    const key = `unknown_array_${elemIdent}`;
    if (ctx._emittedHelpers.has(key)) return;
    ctx._emittedHelpers.add(key);
    ctx._ensureUnknownStruct();
    ctx._ensureArrayStruct(arrName, et);
    ctx._ensureArrayFreeMacro(elemIdent, arrName, et);
    ctx.addTop(`static void _tsc_unknown_drop_${arrName}(void *buf) { ${arrName} *ptr; memcpy(&ptr, buf, sizeof(ptr)); tsc_array_free_${elemIdent}(ptr); free(ptr); }`);
    ctx.addTop(`static void _tsc_unknown_clone_${arrName}(const void *src, void *dst) { ${arrName} *sp; memcpy(&sp, src, sizeof(${arrName}*)); ${arrName} *dp = (${arrName}*)malloc(sizeof(${arrName})); *dp = *sp; dp->data = (${et}*)malloc(sizeof(${et}) * dp->capacity); memcpy(dp->data, sp->data, sizeof(${et}) * sp->length); memcpy(dst, &dp, sizeof(dp)); }`);
    ctx.addTop(`static const tsc_unknown_vtable _tsc_vt_${arrName} = {_tsc_unknown_drop_${arrName}, _tsc_unknown_clone_${arrName}};`);
    ctx.addTop(`static inline tsc_unknown tsc_unknown_from_${arrName}(${arrName} arr) { ${arrName} *heap = (${arrName}*)malloc(sizeof(${arrName})); *heap = arr; if (arr.data && arr.length > 0) { size_t _cap = arr.capacity > 0 ? arr.capacity : arr.length; heap->data = (${et}*)malloc(sizeof(${et}) * _cap); memcpy(heap->data, arr.data, sizeof(${et}) * arr.length); heap->capacity = _cap; } else { heap->data = NULL; heap->length = 0; heap->capacity = 0; } tsc_unknown u = {.type_id = 7, .vtable = &_tsc_vt_${arrName}}; memcpy(u.buffer, &heap, sizeof(heap)); return u; }`);
    ctx.addTop(`static inline ${arrName}* tsc_unknown_get_${arrName}(const tsc_unknown *self) { ${arrName} *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return ptr; }`);
}

export function _ensureUnknownPackerClass(ctx: CodeGenContext, className: string) {
    const key = `unknown_class_${className}`;
    if (ctx._emittedHelpers.has(key)) return;
    ctx._emittedHelpers.add(key);
    ctx._ensureUnknownStruct();
    ctx.addTop(`static void _tsc_unknown_drop_${className}(void *buf) { ${className} *ptr; memcpy(&ptr, buf, sizeof(ptr)); free(ptr); }`);
    ctx.addTop(`static void _tsc_unknown_clone_${className}(const void *src, void *dst) { ${className} *sp; memcpy(&sp, src, sizeof(${className}*)); ${className} *dp = (${className}*)malloc(sizeof(${className})); *dp = *sp; memcpy(dst, &dp, sizeof(dp)); }`);
    ctx.addTop(`static const tsc_unknown_vtable _tsc_vt_${className} = {_tsc_unknown_drop_${className}, _tsc_unknown_clone_${className}};`);
    ctx.addTop(`static inline tsc_unknown tsc_unknown_from_${className}(${className} obj) { ${className} *heap = (${className}*)malloc(sizeof(${className})); *heap = obj; tsc_unknown u = {.type_id = 8, .vtable = &_tsc_vt_${className}}; memcpy(u.buffer, &heap, sizeof(heap)); return u; }`);
    ctx.addTop(`static inline ${className}* tsc_unknown_get_${className}(const tsc_unknown *self) { ${className} *ptr; memcpy(&ptr, self->buffer, sizeof(ptr)); return ptr; }`);
}

export function _ensureGroupByMapStruct(ctx: CodeGenContext, etIdent: string, etCType: string) {
    const key = `groupby_${etIdent}`;
    if (ctx._emittedHelpers.has(key)) return;
    ctx._emittedHelpers.add(key);
    const arrName = `Array_${etIdent}`;
    ctx._ensureArrayStruct(arrName, etCType);
    const mapName = `TscMap_string_array_${etIdent}`;
    ctx.addTop(`typedef struct { String _keys[64]; ${arrName} _vals[64]; size_t size; } ${mapName};`);
    ctx.addTop('');
}

export function _emitArrayMacro(ctx: CodeGenContext, macroName: string, lines: string[]) {
    if (ctx._emittedHelpers.has(macroName)) return;
    ctx._emittedHelpers.add(macroName);
    ctx.addTop(`#ifndef ${macroName}`);
    for (const l of lines) ctx.addTop(l);
    ctx.addTop('#endif');
    ctx.addTop('');
}

export function _arrElem(ctx: CodeGenContext, etC: string) {
    return etC === 'String' ? '&_a_.data[_i_]' : '_a_.data[_i_]';
}

export function _ensureArrayMapMacro(ctx: CodeGenContext, fromEt: string, toEt: string, fromCType: string, toCType: string) {
    ctx._ensureArrayStruct(`Array_${toEt}`, toCType);
    if (_RUNTIME_MAP.has(`${fromEt}_${toEt}`)) return;
    const name = `tsc_array_map_${fromEt}_${toEt}`;
    const elem = ctx._arrElem(fromCType);
    ctx._ensureArrayStruct(`Array_${toEt}`, toCType);
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, fn) ({ \\`,
      `    Array_${fromEt} _a_ = (arr); \\`,
      `    ${toCType} *_d_ = (${toCType}*)_tsc_xmalloc(_a_.length * sizeof(${toCType})); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = (fn)(${elem}); \\`,
      `    (Array_${toEt}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
}

export function _ensureArrayFlatMapMacro(ctx: CodeGenContext, fromEt: string, toEt: string, fromCType: string, toCType: string) {
    ctx._ensureArrayStruct(`Array_${toEt}`, toCType);
    if (_RUNTIME_FLATMAP.has(`${fromEt}_${toEt}`)) return;
    const name = `tsc_array_flat_map_${fromEt}_${toEt}`;
    const elem = ctx._arrElem(fromCType);
    ctx._ensureArrayStruct(`Array_${toEt}`, toCType);
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayFilterMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_filter_${et}`;
    const elem = ctx._arrElem(etC);
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayForeachMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_foreach_${et}`;
    const elem = ctx._arrElem(etC);
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, fn) do { \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) (fn)(${elem}); \\`,
      `} while(0)`,
    ]);
}

export function _ensureArrayReduceMacro(ctx: CodeGenContext, et: string, toEt: string, etC: string, toCType: string, isRight: boolean) {
    const combos = isRight ? _RUNTIME_REDUCE_R : _RUNTIME_REDUCE;
    if (combos.has(`${et}_${toEt}`)) return;
    const op = isRight ? 'reduce_right' : 'reduce';
    const name = `tsc_array_${op}_${et}_${toEt}`;
    const elem = ctx._arrElem(etC);
    const elemR = etC === 'String' ? '&_a_.data[_i_ - 1]' : '_a_.data[_i_ - 1]';
    const loop = isRight
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) _acc_ = (fn)(_acc_, ${elemR});`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _acc_ = (fn)(_acc_, ${elem});`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, fn, init) ({ \\`,
      `    Array_${et} _a_ = (arr); ${toCType} _acc_ = (init); \\`,
      `    ${loop} \\`,
      `    _acc_; \\`,
      `})`,
    ]);
}

export function _ensureArrayEveryMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_every_${et}`;
    const elem = ctx._arrElem(etC);
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); bool _r_ = true; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length && _r_; _i_++) if (!(pred)(${elem})) _r_ = false; \\`,
      `    _r_; \\`,
      `})`,
    ]);
}

export function _ensureArraySomeMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_some_${et}`;
    const elem = ctx._arrElem(etC);
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); bool _r_ = false; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length && !_r_; _i_++) if ((pred)(${elem})) _r_ = true; \\`,
      `    _r_; \\`,
      `})`,
    ]);
}

export function _ensureArrayFindMacro(ctx: CodeGenContext, et: string, etC: string, isLast: boolean) {
    if (_RUNTIME_ET.has(et)) {
      ctx._ensureOptRefStruct(`opt_ref_${et}`, etC);
      return;
    }
    const op = isLast ? 'find_last' : 'find';
    const name = `tsc_array_${op}_${et}`;
    const e = isLast ? (etC === 'String' ? '&_a_.data[_i_ - 1]' : '_a_.data[_i_ - 1]') : ctx._arrElem(etC);
    const ref = isLast ? '&_a_.data[_i_ - 1]' : '&_a_.data[_i_]';
    const loop = isLast
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) if ((pred)(${e})) { _r_ = (opt_ref_${et}){true, ${ref}}; break; }`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if ((pred)(${e})) { _r_ = (opt_ref_${et}){true, ${ref}}; break; }`;
    ctx._ensureOptRefStruct(`opt_ref_${et}`, etC);
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    opt_ref_${et} _r_ = {false, NULL}; \\`,
      `    ${loop} \\`,
      `    _r_; \\`,
      `})`,
    ]);
}

export function _ensureArrayFindIndexMacro(ctx: CodeGenContext, et: string, etC: string, isLast: boolean) {
    if (_RUNTIME_ET.has(et)) return;
    const op = isLast ? 'find_last_index' : 'find_index';
    const name = `tsc_array_${op}_${et}`;
    const e = isLast ? (etC === 'String' ? '&_a_.data[_i_ - 1]' : '_a_.data[_i_ - 1]') : ctx._arrElem(etC);
    const loop = isLast
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) if ((pred)(${e})) { _r_ = (ptrdiff_t)(_i_ - 1); break; }`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if ((pred)(${e})) { _r_ = (ptrdiff_t)_i_; break; }`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, pred) ({ \\`,
      `    Array_${et} _a_ = (arr); ptrdiff_t _r_ = -1; \\`,
      `    ${loop} \\`,
      `    _r_; \\`,
      `})`,
    ]);
}

export function _ensureArrayIncludesMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_includes_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, val) ({ \\`,
      `    Array_${et} _a_ = (arr); ${etC} _v_ = (val); bool _f_ = false; \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length && !_f_; _i_++) if (_a_.data[_i_] == _v_) _f_ = true; \\`,
      `    _f_; \\`,
      `})`,
    ]);
}

export function _ensureArrayIndexOfMacro(ctx: CodeGenContext, et: string, etC: string, isLast: boolean) {
    if (_RUNTIME_ET.has(et)) return;
    const op = isLast ? 'last_index_of' : 'index_of';
    const name = `tsc_array_${op}_${et}`;
    const loop = isLast
      ? `for (size_t _i_ = _a_.length; _i_ > 0; _i_--) if (_a_.data[_i_ - 1] == _v_) { _r_ = (ptrdiff_t)(_i_ - 1); break; }`
      : `for (size_t _i_ = 0; _i_ < _a_.length; _i_++) if (_a_.data[_i_] == _v_) { _r_ = (ptrdiff_t)_i_; break; }`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, val) ({ \\`,
      `    Array_${et} _a_ = (arr); ${etC} _v_ = (val); ptrdiff_t _r_ = -1; \\`,
      `    ${loop} \\`,
      `    _r_; \\`,
      `})`,
    ]);
}

export function _ensureArrayConcatMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_concat_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(a, b) ({ \\`,
      `    Array_${et} _a_ = (a), _b_ = (b); \\`,
      `    size_t _n_ = _a_.length + _b_.length; \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_n_ * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    memcpy(_d_ + _a_.length, _b_.data, _b_.length * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _n_, .capacity = _n_ }; \\`,
      `})`,
    ]);
}

export function _ensureArraySliceMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_slice_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, start, end_idx) ({ \\`,
      `    Array_${et} _a_ = (arr); int32_t _s_ = (start), _e_ = (end_idx); \\`,
      `    if (_s_ < 0) _s_ = 0; if (_e_ > (int32_t)_a_.length) _e_ = (int32_t)_a_.length; \\`,
      `    size_t _n_ = (_s_ < _e_) ? (size_t)(_e_ - _s_) : 0; \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_n_ * sizeof(${etC})); \\`,
      `    if (_n_) memcpy(_d_, _a_.data + _s_, _n_ * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _n_, .capacity = _n_ }; \\`,
      `})`,
    ]);
}

export function _ensureArrayFlatMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_FLAT.has(et)) return;
    const name = `tsc_array_flat_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
}

export function _ensureArrayAtMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_at_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, idx) ({ \\`,
      `    Array_${et} _a_ = (arr); int32_t _i_ = (idx); \\`,
      `    if (_i_ < 0) _i_ = (int32_t)_a_.length + _i_; \\`,
      `    _a_.data[(size_t)_i_]; \\`,
      `})`,
    ]);
}

export function _ensureArrayWithMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_with_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, idx, val) ({ \\`,
      `    Array_${et} _a_ = (arr); int32_t _i_ = (idx); ${etC} _v_ = (val); \\`,
      `    if (_i_ < 0) _i_ = (int32_t)_a_.length + _i_; \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    _d_[(size_t)_i_] = _v_; \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
}

export function _ensureArrayToReversedMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_to_reversed_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = _a_.data[_a_.length - 1 - _i_]; \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
}

export function _ensureArrayToSplicedMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_to_spliced_${et}`;
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayKeysMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_keys_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    int32_t *_d_ = (int32_t*)_tsc_xmalloc(_a_.length * sizeof(int32_t)); \\`,
      `    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = (int32_t)_i_; \\`,
      `    (Array_i32){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
}

export function _ensureArrayValuesMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_values_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr) ({ \\`,
      `    Array_${et} _a_ = (arr); \\`,
      `    ${etC} *_d_ = (${etC}*)_tsc_xmalloc(_a_.length * sizeof(${etC})); \\`,
      `    if (_a_.length) memcpy(_d_, _a_.data, _a_.length * sizeof(${etC})); \\`,
      `    (Array_${et}){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \\`,
      `})`,
    ]);
}

export function _ensureArrayReverseMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_reverse_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr) do { \\`,
      `    Array_${et} *_a_ = (arr); \\`,
      `    for (size_t _l_ = 0, _r_ = _a_->length; _l_ < _r_; ) { \\`,
      `        _r_--; ${etC} _t_ = _a_->data[_l_]; _a_->data[_l_++] = _a_->data[_r_]; _a_->data[_r_] = _t_; \\`,
      `    } \\`,
      `} while(0)`,
    ]);
}

export function _ensureArrayFillMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_fill_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, val, start, end_idx) do { \\`,
      `    Array_${et} *_a_ = (arr); ${etC} _v_ = (val); int32_t _s_ = (start), _e_ = (end_idx); \\`,
      `    if (_s_ < 0) _s_ = 0; if (_e_ > (int32_t)_a_->length) _e_ = (int32_t)_a_->length; \\`,
      `    for (int32_t _i_ = _s_; _i_ < _e_; _i_++) _a_->data[_i_] = _v_; \\`,
      `} while(0)`,
    ]);
}

export function _ensureArrayResizeMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_resize_${et}`;
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayReallocateMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_reallocate_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, new_cap) do { \\`,
      `    Array_${et} *_a_ = (arr); size_t _nc_ = (size_t)(new_cap); \\`,
      `    ${etC} *_nd_ = (${etC}*)_tsc_xmalloc(_nc_ * sizeof(${etC})); \\`,
      `    size_t _cp_ = _a_->length < _nc_ ? _a_->length : _nc_; \\`,
      `    if (_cp_ > 0) memcpy(_nd_, _a_->data, _cp_ * sizeof(${etC})); \\`,
      `    _a_->data = _nd_; _a_->capacity = _nc_; \\`,
      `    if (_a_->length > _nc_) _a_->length = _nc_; \\`,
      `} while(0)`,
    ]);
}

export function _ensureArraySpliceMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_splice_${et}`;
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayShiftMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) {
      ctx._ensureOptStruct(`opt_${et}`, etC);
      return;
    }
    const name = `tsc_array_shift_${et}`;
    ctx._ensureOptStruct(`opt_${et}`, etC);
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayUnshiftMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_unshift_${et}`;
    ctx._emitArrayMacro(name, [
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
}

export function _ensureArrayRemoveMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_remove_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, idx) ({ \\`,
      `    Array_${et} *_a_ = (arr); size_t _i_ = (size_t)(idx); \\`,
      `    ${etC} _v_ = _a_->data[_i_]; \\`,
      `    memmove(_a_->data + _i_, _a_->data + _i_ + 1, (_a_->length - _i_ - 1) * sizeof(${etC})); \\`,
      `    _a_->length--; _v_; \\`,
      `})`,
    ]);
}

export function _ensureArraySetMacro(ctx: CodeGenContext, et: string, etC: string) {
    if (_RUNTIME_ET.has(et)) return;
    const name = `tsc_array_set_${et}`;
    ctx._emitArrayMacro(name, [
      `#define ${name}(arr, src, offset) do { \\`,
      `    Array_${et} *_d_ = (arr); Array_${et} _s_ = (src); size_t _off_ = (size_t)(offset); \\`,
      `    for (size_t _i_ = 0; _i_ < _s_.length && _off_ + _i_ < _d_->length; _i_++) \\`,
      `        _d_->data[_off_ + _i_] = _s_.data[_i_]; \\`,
      `} while(0)`,
    ]);
}
