import { PRIMITIVE_MAP, toCType, inferLiteralCType } from '../types.js';
// types.js
export default {
  resolveType(typeNode) {
    if (!typeNode) return 'void';
    if (typeof typeNode === 'string') return toCType(typeNode);

    if (typeNode.kind === 'TypeRef') {
      const { name, typeArgs } = typeNode;
      if (name in PRIMITIVE_MAP) return PRIMITIVE_MAP[name];

      if (name === 'Ref')    return `const ${this.resolveType(typeArgs[0])} *`;
      if (name === 'Mut')    return `${this.resolveType(typeArgs[0])} *`;
      if (name === 'Shared') return `${this.resolveType(typeArgs[0])} *`;
      if (name === 'Weak')   return `${this.resolveType(typeArgs[0])} *`;
      if (name === 'Array' || name === 'ReadonlyArray') {
        const et = typeArgs[0] ? this.resolveType(typeArgs[0]) : 'int32_t';
        return `Array_${this.cTypeToIdent(et)}`;
      }
      if (name === 'Map') {
        const k = typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'string';
        const v = typeArgs[1] ? this.cTypeToIdent(this.resolveType(typeArgs[1])) : 'i32';
        return `TscMap_${k}_${v}`;
      }
      if (name === 'Generator')  return `${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'void'}_state`;
      if (name === 'Atomic')     return `Atomic_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Channel')    return `Channel_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Signal')     return `Signal_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Promise')    return `Promise_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'void'}`;
      if (name === 'volatile')   return `volatile ${this.resolveType(typeArgs[0])}`;

      // Inline utility types: Pick<T, K>, Omit<T, K> without a named alias
      if ((name === 'Pick' || name === 'Omit') && typeArgs.length >= 2) {
        const baseType = this.resolveType(typeArgs[0]);
        const baseDef = this.classes.get(baseType);
        if (baseDef?.fields) {
          const keyNames = this.getStringLiteralMembers(typeArgs[1]);
          const picked = name === 'Pick'
            ? baseDef.fields.filter(f => keyNames.length === 0 || keyNames.includes(f.name ?? f))
            : baseDef.fields.filter(f => !keyNames.includes(f.name ?? f));
          const structKey = `_${name.toLowerCase()}_${keyNames.join('_')}`;
          if (!this.classes.has(structKey)) {
            const fieldDecls = picked.map(f => {
              const fname = f.name ?? f;
              const ftype = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
              return `${ftype} ${fname};`;
            }).join(' ');
            this.addTop(`typedef struct { ${fieldDecls} } ${structKey};`);
            this.addTop('');
            this.classes.set(structKey, { isStruct: true, fields: picked });
          }
          return structKey;
        }
        return baseType; // fallback
      }

      // Transparent type alias (NonNullable, Record, etc.)
      if (this._typeAliases?.has(name)) {
        const aliased = this._typeAliases.get(name);
        // Lazily emit opt typedef if needed (but not when inside NonNullable processing)
        if (!this._noOptEmit && aliased.startsWith('opt_') && this._pendingOptTypedefs?.has(aliased)) {
          if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
          if (!this._emittedOptStructs.has(aliased)) {
            this._emittedOptStructs.add(aliased);
            const optInner = this._pendingOptTypedefs.get(aliased);
            this.addTop(`typedef struct { bool has_value; ${optInner} value; } ${aliased};`);
            this.addTop('');
          }
        }
        return aliased;
      }

      // User-defined type
      return name;
    }

    if (typeNode.kind === 'TypeArray') {
      const et = this.resolveType(typeNode.element);
      const arrName = `Array_${this.cTypeToIdent(et)}`;
      // Emit managed array struct for tuple element types
      if (typeNode.element?.kind === 'TypeTuple') {
        if (!this._emittedArrayStructs) this._emittedArrayStructs = new Set();
        if (!this._emittedArrayStructs.has(arrName)) {
          this._emittedArrayStructs.add(arrName);
          this.addTop(`typedef struct { ${et} *data; size_t length; size_t capacity; } ${arrName};`);
          this.addTop('');
        }
      }
      return arrName;
    }

    if (typeNode.kind === 'TypeObject') {
      // Inline struct type — return 'struct { ... }' (anonymous)
      const fields = typeNode.fields.map(f => {
        const ct = this.resolveType(f.typeAnn);
        return `${ct} ${f.name}`;
      }).join('; ');
      return `struct { ${fields}; }`;
    }

    if (typeNode.kind === 'TypeTuple') {
      return this.resolveTupleType(typeNode);
    }

    if (typeNode.kind === 'TypeUnion') {
      // T | null → opt_T
      const allLeaves = this.flattenUnion(typeNode);
      const nonNull = allLeaves.filter(t => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined'))
                                          && !(t.kind === 'TypeLiteral' && t.value === 'null'));
      const hasNull = allLeaves.length !== nonNull.length;
      if (hasNull && nonNull.length === 1) {
        const inner = this.resolveType(nonNull[0]);
        if (inner === 'void *') throw new Error(`any is already nullable, "any | null" is redundant`);
        const optName = `opt_${this.cTypeToIdent(inner)}`;
        // Store for deferred emission
        if (!this._pendingOptTypedefs) this._pendingOptTypedefs = new Map();
        this._pendingOptTypedefs.set(optName, inner);
        // Emit struct typedef if not already done
        if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
        if (!this._emittedOptStructs.has(optName)) {
          this._emittedOptStructs.add(optName);
          this.addTop(`typedef struct { bool has_value; ${inner} value; } ${optName};`);
        }
        return optName;
      }
      return 'void *';
    }

    if (typeNode.kind === 'TypeFunc') {
      // Function pointer type — for non-declarator uses, return a placeholder
      return 'void *';
    }

    return 'void';
  },

  // Build tuple struct name and emit typedef if needed
  resolveTupleType(typeNode, namedAs = null) {
    const { elements, readonly } = typeNode;

    // Build struct fields
    const fields = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.rest) {
        // Rest element: ...T[] → T *_tail; int32_t _tail_len
        const et = this.resolveType(el.typeAnn.element ?? el.typeAnn);
        fields.push({ name: `_tail`, ctype: `${et} *`, const: false, rest: true, elemType: et });
        fields.push({ name: `_tail_len`, ctype: `int32_t`, const: false, tailLen: true });
      } else {
        let ct = this.resolveType(el.typeAnn);
        if (el.optional) {
          // Wrap in opt_T
          const optName = `opt_${this.cTypeToIdent(ct)}`;
          if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
          if (!this._emittedOptStructs.has(optName)) {
            this._emittedOptStructs.add(optName);
            this.addTop(`typedef struct { bool has_value; ${ct} value; } ${optName};`);
          }
          ct = optName;
        }
        fields.push({ name: `_${i}`, label: el.label, ctype: ct, const: readonly });
      }
    }

    // Build struct name
    let structName;
    if (namedAs) {
      structName = namedAs;
    } else {
      const elNames = elements
        .filter(e => !e.rest)
        .map(e => this.cTypeToIdent(this.resolveType(e.typeAnn)));
      const prefix = readonly ? 'readonly_tuple' : 'tuple';
      structName = `${prefix}_${elNames.join('_')}`;
    }

    // Emit typedef if not already done
    if (!this._emittedTuples) this._emittedTuples = new Set();
    if (!this._emittedTuples.has(structName)) {
      this._emittedTuples.add(structName);
      const fieldDecls = fields.map(f => {
        const ct = f.ctype.endsWith(' *') ? f.ctype.trimEnd() : f.ctype;
        return `${f.const ? 'const ' : ''}${ct}${ct.endsWith('*') ? '' : ' '}${f.name};`;
      }).join(' ');
      this.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
      // Register in classes for index/field access
      this.classes.set(structName, { isTuple: true, fields, readonly: !!readonly });
    }

    return structName;
  },

  // Generate a full C declarator: handles function pointer types correctly
  // e.g. typeDecl({kind:'TypeFunc', params:[i32], ret:i32}, 'f') → 'int32_t (*f)(int32_t)'
  typeDecl(typeNode, name) {
    if (!typeNode) return `void *${name ? ' ' + name : ''}`;
    if (typeNode.kind === 'TypeFunc') {
      const ret = this.resolveType(typeNode.ret);
      const pts = typeNode.params.map(p => this.resolveType(p));
      return `${ret} (*${name || ''})(${pts.join(', ') || 'void'})`;
    }
    if (typeNode.kind === 'TypeArray' && typeNode.element?.kind === 'TypeFunc') {
      const ft = typeNode.element;
      const ret = this.resolveType(ft.ret);
      const pts = ft.params.map(p => this.resolveType(p));
      return `${ret} (*${name || ''}[])(${pts.join(', ') || 'void'})`;
    }
    return `${this.resolveType(typeNode)}${name ? ' ' + name : ''}`;
  },

  // ----------------------------------------------------------------
  // Type inference from expression
  // ----------------------------------------------------------------
  inferType(node) {
    if (!node) return 'int32_t';
    switch (node.kind) {
      case 'Literal':  return inferLiteralCType(node);
      case 'Ident': {
        if (node.name === 'true' || node.name === 'false') return 'bool';
        if (node.name === 'null') return 'void *';
        const sym = this.lookup(node.name);
        // Narrowed opt variable: return inner C type
        if (this._narrowedVars?.has(node.name) && sym?.ctype?.startsWith('opt_')) {
          const identToCType3 = { 'i8':'int8_t', 'i16':'int16_t', 'i32':'int32_t', 'i64':'int64_t', 'u8':'uint8_t', 'u16':'uint16_t', 'u32':'uint32_t', 'u64':'uint64_t', 'f32':'float', 'f64':'double', 'bool':'bool', 'string':'String', 'usize':'size_t' };
          const innerIdent = sym.ctype.slice(4);
          return identToCType3[innerIdent] ?? innerIdent;
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
        if (node.prop === 'length')  return 'size_t';
        if (node.prop === 'data')    return 'const char *';
        if (node.prop === 'message') return 'String';
        // Enum member access
        if (node.object.kind === 'Ident') {
          const enumDef = this.classes.get(node.object.name);
          if (enumDef?.isEnum) return node.object.name;
          // Struct member access: p.x where p is a struct type
          const objSym = this.lookup(node.object.name);
          if (objSym) {
            const structDef = this.classes.get(objSym.ctype);
            if (structDef?.fields) {
              const field = structDef.fields.find(f => (f.name ?? f) === node.prop);
              if (field?.typeAnn) return this.resolveType(field.typeAnn);
            }
            // Labeled tuple access: p.x → type of field with label 'x'
            if (structDef?.isTuple) {
              const field = structDef.fields.find(f => f.label === node.prop);
              if (field) return field.ctype.replace(' *', '');
            }
          }
        }
        return 'int32_t';
      }
      case 'Call': {
        // Optional chaining: x?.toString() where x is opt_T → opt_string
        if (node.callee.kind === 'OptChain') {
          const objType = this.inferType(node.callee.object);
          if (objType?.startsWith('opt_') && node.callee.prop === 'toString') return 'opt_string';
          return 'int32_t';
        }
        // Generic function call: infer return type from template + substitution
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
          const obj = node.callee.object;
          if (obj.kind === 'Ident' && obj.name === 'performance') return 'double';
          if (obj.kind === 'Ident' && obj.name === 'Math') return 'double';
          if (obj.kind === 'Ident' && obj.name === 'console') return 'void';
          if (node.callee.prop === 'at') return 'opt_u8';
          if (node.callee.prop === 'toFixed' || node.callee.prop === 'toPrecision') return 'String';
          // Enum.fromValue() → opt_Enum
          if (node.callee.prop === 'fromValue' && obj.kind === 'Ident') {
            const ed = this.classes.get(obj.name);
            if (ed?.isEnum) return `opt_${obj.name}`;
          }
          // Enum.values() → EnumName *
          if (node.callee.prop === 'values' && obj.kind === 'Ident') {
            const ed = this.classes.get(obj.name);
            if (ed?.isEnum) return `${obj.name} *`;
          }
          // variable.toString() for string-literal-union → const char *
          if (node.callee.prop === 'toString' && obj.kind === 'Ident') {
            const objSym = this.lookup(obj.name);
            const objEnumDef = objSym ? this.classes.get(objSym.ctype) : null;
            if (objEnumDef?.isStringLiteralUnion) return 'const char *';
          }
          // EnumMember.toString() → const char *
          if (node.callee.prop === 'toString' && obj.kind === 'Member') {
            const enumName = obj.object?.kind === 'Ident' ? obj.object.name : null;
            const ed = enumName ? this.classes.get(enumName) : null;
            if (ed?.isEnum) return 'const char *';
          }
        }
        if (node.callee.kind === 'Ident') {
          const sym = this.lookup(node.callee.name);
          if (sym) return sym.ctype;
        }
        return 'int32_t';
      }
      case 'New': {
        if (node.name === 'Error') return 'TscError';
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
        const objType = this.inferType(node.object);
        // Tuple index: pair[0] → type of field _0
        const tupleDef2 = this.classes.get(objType);
        if (tupleDef2?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const field = tupleDef2.fields[parseInt(node.index.value, 10)];
          if (field) return field.ctype.replace(' *', '');
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
        return this.inferType(node.expr);
      }
      default: return 'int32_t';
    }
  },

  // ----------------------------------------------------------------
  // Utility
  // ----------------------------------------------------------------
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
  }
};
