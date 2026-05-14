import { PRIMITIVE_MAP, toCType, inferLiteralCType } from '../../types.js';
// resolve.js
export default {
  resolveType(typeNode) {
    if (!typeNode) return 'void';
    if (typeof typeNode === 'string') return toCType(typeNode);

    if (typeNode.kind === 'TypeRef') {
      const { name, typeArgs } = typeNode;
      // usize = u16 on 16-bit targets
      if (name === 'usize' && (this._targetName === 'nes' || this._targetName === 'spectrum')) return 'uint16_t';
      if (name === 'number') return (this._targetName === 'avr') ? 'float' : 'double';
      if (name in PRIMITIVE_MAP) return PRIMITIVE_MAP[name];

      if (name === 'Shared' || name === 'Weak') {
        const innerName = typeArgs[0]?.kind === 'TypeRef' ? typeArgs[0].name : null;
        const COPY_ONLY = new Set(['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64','bool','usize','isize','char']);
        if (innerName && COPY_ONLY.has(innerName)) {
          throw this.error(`TypeError: ${name}<T> requires a non-primitive type, got ${innerName}`, typeNode);
        }
        return `${this.resolveType(typeArgs[0])} *`;
      }
      if (name === 'Ref') {
        const inner = this.resolveType(typeArgs[0]);
        if (inner === 'String') return 'String';
        return `const ${inner} *`;
      }
      if (name === 'Mut') {
        const innerName = typeArgs[0]?.kind === 'TypeRef' ? typeArgs[0].name : null;
        if (innerName && this.interfaces.has(innerName)) return this.resolveType(typeArgs[0]);
        return `${this.resolveType(typeArgs[0])} *`;
      }
      if (name === 'Array' || name === 'ReadonlyArray') {
        const et = typeArgs[0] ? this.resolveType(typeArgs[0]) : 'int32_t';
        const arrName = `Array_${this.cTypeToIdent(et)}`;
        this._ensureArrayStruct(arrName, et);
        return arrName;
      }
      if (name === 'Map') {
        const k = typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'string';
        const v = typeArgs[1] ? this.cTypeToIdent(this.resolveType(typeArgs[1])) : 'i32';
        const suffix = `${k}_${v}`;
        this._ensureMapStruct(suffix);
        return `TscMap_${suffix}`;
      }
      if (name === 'Scalar') return 'Scalar';
      if (name === 'Date') return 'Date';
      if (name === 'AbortController') return 'TscAbortController';
      if (name === 'AbortSignal')     return 'TscAbortSignal *';
      if (name === 'AsyncMutex')      return 'TscAsyncMutex';
      if (name === 'Generator')  return `${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'void'}_state`;
      if (name === 'Readonly' && typeArgs?.[0]) return this.resolveType(typeArgs[0]);
      if (name === 'Atomic')     return `Atomic_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Channel')    return `Channel_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Signal')     return `Signal_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Promise')    return `Promise_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'void'}`;
      if (name === 'volatile')   return `volatile ${this.resolveType(typeArgs[0])}`;
      if (name === 'Volatile')   return `volatile ${this.resolveType(typeArgs[0])} *`;
      if (name === 'Slice' || name === 'MutSlice') {
        const et = typeArgs[0] ? this.resolveType(typeArgs[0]) : 'int32_t';
        const etId = this.cTypeToIdent(et);
        const slName = `${name}_${etId}`;
        this._ensureSliceStruct(slName, et, name === 'MutSlice');
        return slName;
      }

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

          if (!this._emittedOptStructs.has(aliased)) {
            this._emittedOptStructs.add(aliased);
            const optInner = this._pendingOptTypedefs.get(aliased);
            this.addTop(`typedef struct { bool has_value; ${optInner} value; } ${aliased};`);
            this.addTop('');
          }
        }
        return aliased;
      }

      // User-defined type — use C name if registered with a module prefix
      const _cls = this.classes.get(name);
      return _cls?._cname ?? name;
    }

    if (typeNode.kind === 'TypePointer') {
      const pointee = this.resolveType(typeNode.pointee);
      return `${pointee} *`;
    }

    if (typeNode.kind === 'TypeArray') {
      // Function pointer arrays use native C array syntax, not Array_T struct
      if (typeNode.element?.kind === 'TypeFunc') return 'void *';
      const et = this.resolveType(typeNode.element);
      const arrName = `Array_${this.cTypeToIdent(et)}`;
      this._ensureArrayStruct(arrName, et);
      return arrName;
    }

    if (typeNode.kind === 'TypeFixedArray') {
      return this.resolveType(typeNode.element);
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
        if (inner === 'void *') throw this.error(`any is already nullable, "any | null" is redundant`);
        // Pointer types are already nullable (NULL) — no opt_ wrapper needed
        if (inner.endsWith(' *') || inner.endsWith('*')) return inner;
        const optName = `opt_${this.cTypeToIdent(inner)}`;
        // Store for deferred emission

        this._pendingOptTypedefs.set(optName, inner);
        // Emit struct typedef if not already done

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
};
