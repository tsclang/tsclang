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
  any:     'void *',
  unknown: 'tsc_unknown',
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
export function mangleType(typeNode, defaultNumber = 'f64') {
  if (!typeNode) return '';
  if (typeNode.kind === 'TypeRef') {
    const { name, typeArgs } = typeNode;
    if (name === 'Ref')    return 'ref_' + mangleType(typeArgs[0], defaultNumber);
    if (name === 'Mut')    return 'mut_' + mangleType(typeArgs[0], defaultNumber);
    if (name === 'Shared') return 'shared_' + mangleType(typeArgs[0], defaultNumber);
    if (name === 'Weak')   return 'weak_' + mangleType(typeArgs[0], defaultNumber);
    if (typeArgs.length === 0) {
      if (name === 'number') return defaultNumber;
      return PRIMITIVE_MAP[name] ? name : name;
    }
    return name + '_' + typeArgs.map(t => mangleType(t, defaultNumber)).join('_');
  }
  if (typeNode.kind === 'TypeArray')  return 'Array_' + mangleType(typeNode.element, defaultNumber);
  if (typeNode.kind === 'TypeUnion') {
    const types = typeNode.types;
    const nullIdx = types.findIndex(t => t.kind === 'TypeRef' && t.name === 'null');
    if (nullIdx >= 0 && types.length === 2) {
      const inner = types[1 - nullIdx];
      return 'opt_' + mangleType(inner, defaultNumber);
    }
    return types.map(t => mangleType(t, defaultNumber)).join('_or_');
  }
  if (typeNode.kind === 'TypeFunc') {
    const parts = typeNode.params.map(t => mangleType(t, defaultNumber));
    parts.push(mangleType(typeNode.ret, defaultNumber));
    return 'fn_' + parts.join('_');
  }
  return 'unknown';
}

// Mangle param types for function name suffix: foo(a: i32, b: f64) → foo_i32_f64
export function mangleParams(params, defaultNumber = 'f64') {
  const parts = [];
  for (const p of params) {
    if (p.rest) continue;
    if (p.destructArr) continue;
    if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'any') continue;
    if (p.typeAnn) parts.push(mangleType(p.typeAnn, defaultNumber));
  }
  return parts.length ? '_' + parts.join('_') : '';
}

// Infer C type from a literal node
export function inferLiteralCType(node) {
  if (node.litType === 'string')  return 'String';
  if (node.litType === 'char')    return 'String';
  if (node.litType === 'bool')    return 'bool';
  if (node.litType === 'null')    return 'void *';
  const v = node.value;
  return 'double';
}
