import { PRIMITIVE_MAP, toCType, inferLiteralCType } from '../types.js';
// types.js
export default {
  resolveType(typeNode) {
    if (!typeNode) return 'void';
    if (typeof typeNode === 'string') return toCType(typeNode);

    if (typeNode.kind === 'TypeRef') {
      const { name, typeArgs } = typeNode;
      if (name in PRIMITIVE_MAP) return PRIMITIVE_MAP[name];

      if (name === 'Ref') {
        const inner = this.resolveType(typeArgs[0]);
        if (inner === 'String') return 'String'; // string slice borrows are struct-by-value
        return `const ${inner} *`;
      }
      if (name === 'Mut') {
        const innerName = typeArgs[0]?.kind === 'TypeRef' ? typeArgs[0].name : null;
        if (innerName && this.interfaces.has(innerName)) return this.resolveType(typeArgs[0]); // fat-ptr by value
        return `${this.resolveType(typeArgs[0])} *`;
      }
      if (name === 'Shared') return `${this.resolveType(typeArgs[0])} *`;
      if (name === 'Weak')   return `${this.resolveType(typeArgs[0])} *`;
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
        return `Map_${suffix}`;
      }
      if (name === 'Generator')  return `${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'void'}_state`;
      if (name === 'Atomic')     return `Atomic_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Channel')    return `Channel_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Signal')     return `Signal_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Promise')    return `Promise_${typeArgs[0] ? this.cTypeToIdent(this.resolveType(typeArgs[0])) : 'void'}`;
      if (name === 'volatile')   return `volatile ${this.resolveType(typeArgs[0])}`;
      if (name === 'Volatile')   return `volatile ${this.resolveType(typeArgs[0])} *`;

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
      case 'TemplateLit': return 'String';
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
        if (node.prop === 'length')   return 'size_t';
        if (node.prop === 'capacity') return 'size_t';
        if (node.prop === 'size') {
          const ot = this.inferType(node.object);
          if (this._mapSuffix(ot)) return 'size_t';
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
            const structDef = this.classes.get(objSym.ctype);
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
        // Fallback: infer object type recursively (e.g. call result member access)
        {
          const objType = this.inferType(node.object);
          if (objType && objType !== 'int32_t') {
            const sd = this.classes.get(objType);
            if (sd?.fields) {
              const f = sd.fields.find(ff => (ff.name ?? ff) === node.prop);
              if (f?.typeAnn) return this.resolveType(f.typeAnn);
              if (f?.ctype) return f.ctype;
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
          const prop = node.callee.prop;
          if (obj.kind === 'Ident' && obj.name === 'performance') return 'double';
          if (obj.kind === 'Ident' && obj.name === 'Math') {
            if (prop === 'clz32' || prop === 'imul') return 'int32_t';
            if (prop === 'fround') return 'float';
            return 'double';
          }
          if (obj.kind === 'Ident' && obj.name === 'console') return 'void';
          if (prop === 'at') return 'opt_u8';
          if (prop === 'toFixed' || prop === 'toPrecision') return 'String';
          // Map method return types
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
          // Atomic<T> method return types
          const objSymA = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
          if (objSymA?._isAtomic) {
            if (prop === 'load' || prop === 'fetchAdd') return objSymA._atomicInner ?? 'int32_t';
            if (prop === 'store') return 'void';
            if (prop === 'compareExchange') return 'bool';
          }
          // Channel<T> method return types
          if (objSymA?._isChannel) {
            if (prop === 'receive') return objSymA._channelInner ?? 'int32_t';
            if (prop === 'tryReceive') return `opt_${objSymA._channelIdent}`;
            if (prop === 'trySend' || prop === 'isEmpty') return 'bool';
            if (prop === 'length' || prop === 'capacity') return 'size_t';
            if (prop === 'send' || prop === 'close') return 'void';
          }
          // tsc_thread_t .join()
          if ((objSymA?.ctype === 'tsc_thread_t' || objSymA?._isThread) && prop === 'join') return 'void';

          // Array method return types
          const objSym = obj.kind === 'Ident' ? this.lookup(obj.name) : null;
          const objType = objSym?.ctype ?? this.inferType(obj);
          if (objType?.startsWith('Array_')) {
            const et = objSym?.elemType ?? objType.slice(6); // Array_i32 → i32
            const etCType = objSym?.arrElemCType ?? 'int32_t';
            if (prop === 'pop') return et ? `opt_${et}` : 'opt_i32';
            if (prop === 'remove') return etCType; // returns element directly
            if (prop === 'find') return et ? `opt_ref_${et}` : 'opt_ref_i32';
            if (prop === 'filter' || prop === 'concat') return objType;
            if (prop === 'map') return objType; // approximate (may differ for cross-type map)
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
          // String method return types
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
          // numeric.toString() → String (heap allocated)
          if (node.callee.prop === 'toString') {
            const objType5 = this.inferType(obj);
            if (objType5 && !objType5.startsWith('Array_') && !this._mapSuffix(objType5) &&
                !objType5.startsWith('opt_') && objType5 !== 'void') {
              return 'String';
            }
          }
          // i32.parse → int32_t, i32.tryParse → opt_i32, etc.
          const primitiveMap2 = { 'i8':'int8_t','i16':'int16_t','i32':'int32_t','i64':'int64_t',
                                   'u8':'uint8_t','u16':'uint16_t','u32':'uint32_t','u64':'uint64_t',
                                   'f32':'float','f64':'double' };
          if (obj.kind === 'Ident' && obj.name in primitiveMap2) {
            const cT = primitiveMap2[obj.name];
            const etId = this.cTypeToIdent(cT);
            if (node.callee.prop === 'parse') return cT;
            if (node.callee.prop === 'tryParse') return `opt_${etId}`;
          }
        }
        // Generator .next() call: return result type
        if (node.callee.kind === 'Member' && node.callee.prop === 'next') {
          const genObj = node.callee.object;
          const genSym = genObj.kind === 'Ident' ? this.lookup(genObj.name) : null;
          if (genSym?._isGenState) return genSym._gi?.resultType ?? genSym._resultType ?? 'int32_t';
        }
        // Generic method call on class instance: look up method return type
        if (node.callee.kind === 'Member') {
          const obj2 = node.callee.object;
          const sym2 = obj2.kind === 'Ident' ? this.lookup(obj2.name) : null;
          const cls2 = sym2 ? this.classes.get(sym2.ctype) : null;
          if (cls2?.methods) {
            const m2 = cls2.methods.find(m => m.name === node.callee.prop);
            if (m2?.returnType) return this.resolveType(m2.returnType);
          }
          // Interface method call: look up interface method return type
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
      }
      case 'New': {
        if (node.name === 'Error') return 'TscError';
        if (node.name === 'Map') {
          const [kt, vt] = (node.typeArgs ?? []).map(t => this.resolveType(t));
          const k = kt ? this.cTypeToIdent(kt) : 'string';
          const v = vt ? this.cTypeToIdent(vt) : 'i32';
          return `Map_${k}_${v}`;
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
        const objType = this.inferType(node.object);
        // Tuple index: pair[0] → type of field _0
        const tupleDef2 = this.classes.get(objType);
        if (tupleDef2?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const field = tupleDef2.fields[parseInt(node.index.value, 10)];
          if (field) return field.ctype.replace(' *', '');
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

  // Emit Map_K_V struct typedef (idempotent)
  _ensureMapStruct(suffix) {
    if (!this._emittedMapStructs) this._emittedMapStructs = new Set();
    if (!this._emittedMapStructs.has(suffix)) {
      this._emittedMapStructs.add(suffix);
      this.addTop(`typedef struct { void *_data; size_t size; } Map_${suffix};`);
      // No trailing blank line — subsequent typedefs (opt, Array) go on the next line
    }
  },

  // Emit MapEntry_K_V and Array_MapEntry_K_V struct typedefs (idempotent)
  _ensureMapEntry(suffix, kCType, vCType) {
    if (!this._emittedMapEntries) this._emittedMapEntries = new Set();
    if (!this._emittedMapEntries.has(suffix)) {
      this._emittedMapEntries.add(suffix);
      const entryName = `MapEntry_${suffix}`;
      const arrName = `Array_${entryName}`;
      this.addTop(`typedef struct { ${kCType} key; ${vCType} value; } ${entryName};`);
      this.addTop(`typedef struct { ${entryName} *data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
    }
  },

  // Emit Array_T struct typedef (idempotent)
  _ensureArrayStruct(arrName, et) {
    if (!this._emittedArrayStructs) this._emittedArrayStructs = new Set();
    if (!this._emittedArrayStructs.has(arrName)) {
      this._emittedArrayStructs.add(arrName);
      this.addTop(`typedef struct { ${et} *data; size_t length; size_t capacity; } ${arrName};`);
      this.addTop('');
    }
  },

  // Emit opt_T struct typedef (idempotent): { bool has_value; T value; }
  // Inserts before any trailing blank line so typedefs group together.
  _ensureOptStruct(optName, ctype) {
    if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
    if (!this._emittedOptStructs.has(optName)) {
      this._emittedOptStructs.add(optName);
      this.addTop(`typedef struct { bool has_value; ${ctype} value; } ${optName};`);
    }
  },

  // Emit Slice_u8 typedef (idempotent): { uint8_t *ptr; size_t length; }
  _ensureSliceU8Struct() {
    if (this._emittedSliceU8) return;
    this._emittedSliceU8 = true;
    this.addTop(`typedef struct { uint8_t *ptr; size_t length; } Slice_u8;`);
  },

  // Emit opt_ref_T struct typedef (idempotent): { bool has_value; T *value; }
  _ensureOptRefStruct(optName, ctype) {
    if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
    if (!this._emittedOptStructs.has(optName)) {
      this._emittedOptStructs.add(optName);
      this.addTop(`typedef struct { bool has_value; ${ctype} *value; } ${optName};`);
    }
  }
};
