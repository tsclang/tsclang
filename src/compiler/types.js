// TSClang Type System — type resolution helpers for codegen

// Primitive type mapping: TSClang → C
export const PRIMITIVE_MAP = {
  i8:    'int8_t',
  i16:   'int16_t',
  i32:   'int32_t',
  i64:   'int64_t',
  u8:    'uint8_t',
  u16:   'uint16_t',
  u32:   'uint32_t',
  u64:   'uint64_t',
  f32:   'float',
  f64:   'double',
  bool:  'bool',
  usize: 'size_t',
  isize: 'ptrdiff_t',
  char:  'char',
  string: 'String',
  void:  'void',
  never: 'void',
  any:   'void *',
};

export function isPrimitive(name) { return name in PRIMITIVE_MAP; }
export function toCType(name) { return PRIMITIVE_MAP[name] ?? name; }

// printf format for a C type
export function fmtSpec(ctype) {
  const m = {
    'int8_t':   '%d', 'int16_t': '%d', 'int32_t': '%d',
    'int64_t':  '%lld',
    'uint8_t':  '%u', 'uint16_t': '%u', 'uint32_t': '%u',
    'uint64_t': '%llu',
    'float':    '%g', 'double': '%g',
    'bool':     '%s',   // special: ternary
    'String':   '%s',   // special: .data
    'char':     '%c',
    'size_t':   '%zu',
    'ptrdiff_t':'%zd',
  };
  return m[ctype] ?? '%d';
}

// Mangle a type for use in C function/struct names
export function mangleType(typeNode) {
  if (!typeNode) return '';
  if (typeNode.kind === 'TypeRef') {
    const { name, typeArgs } = typeNode;
    if (name === 'Ref')    return 'ref_' + mangleType(typeArgs[0]);
    if (name === 'Mut')    return 'mut_' + mangleType(typeArgs[0]);
    if (name === 'Shared') return 'shared_' + mangleType(typeArgs[0]);
    if (name === 'Weak')   return 'weak_' + mangleType(typeArgs[0]);
    if (typeArgs.length === 0) {
      return PRIMITIVE_MAP[name] ? toCType(name).replace(/[^a-zA-Z0-9]/g, '_') : name;
    }
    return name + '_' + typeArgs.map(mangleType).join('_');
  }
  if (typeNode.kind === 'TypeArray')  return 'arr_' + mangleType(typeNode.element);
  if (typeNode.kind === 'TypeUnion')  return typeNode.types.map(mangleType).join('_or_');
  return 'unknown';
}

// Mangle param types for function name suffix: foo(a: i32, b: f64) → foo_i32_f64
export function mangleParams(params) {
  const parts = [];
  for (const p of params) {
    if (p.rest) { parts.push('rest_' + (p.typeAnn ? mangleType(p.typeAnn) : 'any')); continue; }
    if (p.typeAnn) parts.push(mangleType(p.typeAnn));
  }
  return parts.length ? '_' + parts.join('_') : '';
}

// Infer C type from a literal node
export function inferLiteralCType(node) {
  if (node.litType === 'string')  return 'String';
  if (node.litType === 'bool')    return 'bool';
  if (node.litType === 'null')    return 'void *';
  const v = node.value;
  if (v.includes('.') || v.includes('e') || v.includes('E')) return 'double';
  return 'int32_t';
}
