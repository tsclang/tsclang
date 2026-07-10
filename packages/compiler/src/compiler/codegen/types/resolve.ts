import type { TypeAnn, TypeTuple, TypeRef, ObjectField } from '@tsclang/ast';
import type { CodeGenContext, ClassMetaField } from '../../codegen.js';
import { PRIMITIVE_MAP, toCType, inferLiteralCType } from '../../types.js';
// resolve.ts

interface TupleField {
  name: string;
  ctype: string;
  const?: boolean;
  rest?: boolean;
  elemType?: string;
  tailLen?: boolean;
  label?: string | null | undefined;
}

// NOTE: parser emits tuple elements with `typeAnn`/`label` (ast TupleElement says `type`);
// this runtime-accurate shape avoids casts at every access site.
interface RtTupleEl { name?: string; typeAnn: TypeAnn; label?: string | null; rest?: boolean; optional?: boolean; }

export function resolveType(ctx: CodeGenContext, typeNode: TypeAnn | string | null | undefined): string {
    if (!typeNode) return 'void';
    if (typeof typeNode === 'string') return toCType(typeNode);

    if (typeNode.kind === 'TypeRef') {
      const { name, typeArgs } = typeNode;
      if (name === 'null' || name === 'undefined') {
        throw ctx.errorCode('E106', typeNode, { detail: `"${name}" cannot be used as a standalone type; use T | ${name}` });
      }
      // usize resolved from capabilities
      if (name === 'usize') {
        const usizeType = ctx._cap('usize');
        if (usizeType === 'u8') return 'uint8_t';
        if (usizeType === 'u16') return 'uint16_t';
        if (usizeType === 'u32') return 'uint32_t';
        if (usizeType === 'u64') return 'size_t';
        return 'size_t';
      }
      if (name === 'number') return PRIMITIVE_MAP[ctx._defaultNumber] || 'double';
      if (!(typeNode as { _internal?: boolean })._internal) {
        if (name === 'bool') {
          throw ctx.errorCode('E106', typeNode, { detail: '"bool" is not a valid TSC type; use "boolean"' });
        }
        if (name === 'String') {
          throw ctx.errorCode('E106', typeNode, { detail: '"String" is not a valid TSC type; use "string"' });
        }
      }
      if (name in PRIMITIVE_MAP) {
        if (name === 'unknown') ctx._ensureUnknownStruct();
        if (ctx._strictRules?.has('no-any') && (name === 'any' || name === 'unknown')) {
          throw ctx.errorCode('E211', typeNode, { name });
        }
        if (name === 'any' && !ctx._inUnsafe && !ctx._inDeclare) {
          throw ctx.errorCode('E106', typeNode, { detail: `"any" is only allowed in "declare" or "unsafe" context; use "unknown" for type-safe dynamic values` });
        }
        return PRIMITIVE_MAP[name];
      }

      if (name === 'Arc' || name === 'Weak') {
        const innerName = typeArgs[0]?.kind === 'TypeRef' ? typeArgs[0].name : null;
        const COPY_ONLY = new Set(['i8','i16','i32','i64','u8','u16','u32','u64','f32','f64','boolean','usize','isize','char']);
        if (innerName && COPY_ONLY.has(innerName)) {
          throw ctx.errorCode('E106', typeNode, { detail: `TypeError: ${name}<T> requires a non-primitive type, got ${innerName}` });
        }
        return `${ctx.resolveType(typeArgs[0])} *`;
      }
      if (name === 'Ref') {
        const inner = ctx.resolveType(typeArgs[0]);
        if (inner === 'String') return 'String';
        return `const ${inner} *`;
      }
      if (name === 'Mut') {
        const innerName = typeArgs[0]?.kind === 'TypeRef' ? typeArgs[0].name : null;
        if (innerName && ctx.interfaces.has(innerName)) return ctx.resolveType(typeArgs[0]);
        return `${ctx.resolveType(typeArgs[0])} *`;
      }
      if (name === 'Array' || name === 'ReadonlyArray') {
        const et = typeArgs[0] ? ctx.resolveType(typeArgs[0]) : 'int32_t';
        const arrName = `Array_${ctx.cTypeToIdent(et)}`;
        ctx._ensureArrayStruct(arrName, et);
        return arrName;
      }
      if (name === 'Map') {
        const k = typeArgs[0] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[0])) : 'string';
        const v = typeArgs[1] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[1])) : 'i32';
        const suffix = `${k}_${v}`;
        ctx._ensureMapStruct(suffix);
        return `TscMap_${suffix}`;
      }
      if (name === 'Scalar') return 'Scalar';
      if (name === 'Date') return 'Date';
      if (name === 'AbortController') return 'TscAbortController';
      if (name === 'AbortSignal')     return 'TscAbortSignal *';
      if (name === 'AsyncMutex')      return 'TscAsyncMutex';
      if (name === 'Generator')  return `${typeArgs[0] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[0])) : 'void'}_state`;
      if (name === 'Readonly' && typeArgs?.[0]) return ctx.resolveType(typeArgs[0]);
      if (name === 'Atomic')     return `Atomic_${typeArgs[0] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Channel')    return `Channel_${typeArgs[0] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Signal')     return `Signal_${typeArgs[0] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[0])) : 'i32'}`;
      if (name === 'Promise')    return `Promise_${typeArgs[0] ? ctx.cTypeToIdent(ctx.resolveType(typeArgs[0])) : 'void'}`;
      if (name === 'volatile')   return `volatile ${ctx.resolveType(typeArgs[0])}`;
      if (name === 'Volatile')   return `volatile ${ctx.resolveType(typeArgs[0])} *`;
      if (name === 'Slice' || name === 'MutSlice') {
        const et = typeArgs[0] ? ctx.resolveType(typeArgs[0]) : 'int32_t';
        const etId = ctx.cTypeToIdent(et);
        const slName = `${name}_${etId}`;
        ctx._ensureSliceStruct(slName, et, name === 'MutSlice');
        return slName;
      }

      // Inline utility types: Pick<T, K>, Omit<T, K> without a named alias
      if (name === 'Partial' && typeArgs.length >= 1) {
        const baseType = ctx.resolveType(typeArgs[0]);
        const baseDef = ctx.classes.get(baseType);
        if (baseDef?.fields) {
          const structKey = `_partial_${ctx.cTypeToIdent(baseType)}`;
          if (!ctx.classes.has(structKey)) {
            const fieldDecls = baseDef.fields.flatMap((f: ClassMetaField) => {
              const fname = f.name ?? '';
              const ftype = f.typeAnn ? ctx.resolveType(f.typeAnn) : 'int32_t';
              return [`bool has_${fname};`, `${ftype} ${fname};`];
            }).join(' ');
            ctx.classes.set(structKey, { isStruct: true, isMutable: true, isPartial: true, fields: baseDef.fields });
            ctx.addTop(`typedef struct { ${fieldDecls} } ${structKey};`);
            ctx.addTop('');
          }
          return structKey;
        }
        return baseType;
      }
      if ((name === 'Pick' || name === 'Omit') && typeArgs.length >= 2) {
        const baseType = ctx.resolveType(typeArgs[0]);
        const baseDef = ctx.classes.get(baseType);
        if (baseDef?.fields) {
          const keyNames = ctx.getStringLiteralMembers(typeArgs[1]);
          const picked = name === 'Pick'
            ? baseDef.fields.filter((f: ClassMetaField) => keyNames.length === 0 || keyNames.includes(f.name ?? ''))
            : baseDef.fields.filter((f: ClassMetaField) => !keyNames.includes(f.name ?? ''));
          const structKey = `_${name.toLowerCase()}_${keyNames.join('_')}`;
          if (!ctx.classes.has(structKey)) {
            const fieldDecls = picked.map((f: ClassMetaField) => {
              const fname = f.name ?? '';
              const ftype = f.typeAnn ? ctx.resolveType(f.typeAnn) : 'int32_t';
              return `${ftype} ${fname};`;
            }).join(' ');
            ctx.classes.set(structKey, { isStruct: true, fields: picked });
            ctx.addTop(`typedef struct { ${fieldDecls} } ${structKey};`);
            ctx.addTop('');
          }
          return structKey;
        }
        return baseType; // fallback
      }

      // Transparent type alias (NonNullable, Record, etc.)
      if (ctx._typeAliases?.has(name)) {
        const aliased = ctx._typeAliases.get(name)!;
        // Lazily emit opt typedef if needed (but not when inside NonNullable processing)
        if (!ctx._noOptEmit && aliased.startsWith('opt_') && ctx._pendingOptTypedefs?.has(aliased)) {

          if (!ctx._emittedOptStructs.has(aliased)) {
            ctx._emittedOptStructs.add(aliased);
            const optInner = ctx._pendingOptTypedefs.get(aliased)!;
            ctx.addTop(`typedef struct { bool has_value; ${optInner} value; } ${aliased};`);
            ctx.addTop('');
          }
        }
        return aliased;
      }

      // Generic class with typeArgs → trigger monomorphization
      if (typeArgs?.length > 0 && ctx._genericClasses?.has(name)) {
        return ctx.ensureMonoClass(name, typeArgs);
      }

      // User-defined type — use C name if registered with a module prefix
      const _cls = ctx.classes.get(name);
      if (_cls?._isPool) {
        ctx._ensurePoolAlloc(name);
        return _cls._poolOptType!;
      }
      if (_cls?._isHeap) {
        return `${_cls?._cname ?? name} *`;
      }
      return _cls?._cname ?? name;
    }

    if (typeNode.kind === 'TypePointer') {
      const pointee = ctx.resolveType(typeNode.pointee);
      return `${pointee} *`;
    }

    if (typeNode.kind === 'TypeArray') {
      // Function pointer arrays use native C array syntax, not Array_T struct
      if (typeNode.element?.kind === 'TypeFunc') return 'tsc_closure';
      const et = ctx.resolveType(typeNode.element);
      const arrName = `Array_${ctx.cTypeToIdent(et)}`;
      ctx._ensureArrayStruct(arrName, et);
      return arrName;
    }

    if (typeNode.kind === 'TypeFixedArray') {
      return ctx.resolveType(typeNode.element);
    }

    if (typeNode.kind === 'TypeObject') {
      // Inline struct type — return 'struct { ... }' (anonymous)
      const fields = typeNode.fields.map((f: ObjectField) => {
        const ct = ctx.resolveType(f.typeAnn);
        return `${ct} ${f.name}`;
      }).join('; ');
      return `struct { ${fields}; }`;
    }

    if (typeNode.kind === 'TypeTuple') {
      return ctx.resolveTupleType(typeNode);
    }

    if (typeNode.kind === 'TypeUnion') {
      // T | null → opt_T
      const allLeaves = ctx.flattenUnion(typeNode);
      const nonNull = allLeaves.filter((t: TypeAnn) => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined'))
                                          && !(t.kind === 'TypeLiteral' && t.value === 'null'));
      const hasNull = allLeaves.length !== nonNull.length;
      if (hasNull && nonNull.length === 1) {
        const inner = ctx.resolveType(nonNull[0]);
        if (inner === 'void *') throw ctx.errorCode('E120', null, { detail: 'any is already nullable, "any | null" is redundant' });
        // Pointer types are already nullable (NULL) — no opt_ wrapper needed
        if (inner.endsWith(' *') || inner.endsWith('*')) return inner;
        // Pool ref types are already nullable (has_value) — no double-wrap
        if (inner.startsWith('opt_ref_')) return inner;
        const optName = `opt_${ctx.cTypeToIdent(inner)}`;
        // Store for deferred emission

        ctx._pendingOptTypedefs.set(optName, inner);
        // Emit struct typedef if not already done

        if (!ctx._emittedOptStructs.has(optName)) {
          ctx._emittedOptStructs.add(optName);
          ctx.addTop(`typedef struct { bool has_value; ${inner} value; } ${optName};`);
        }
        return optName;
      }
      return 'void *';
    }

    if (typeNode.kind === 'TypeFunc') {
      return 'tsc_closure';
    }

    return 'void';
}

  // Build tuple struct name and emit typedef if needed
export function resolveTupleType(ctx: CodeGenContext, typeNode: TypeTuple, namedAs: string | null = null): string {
    const elements = typeNode.elements as unknown as RtTupleEl[];
    const readonly = (typeNode as { readonly?: boolean }).readonly;

    // Build struct fields
    const fields: TupleField[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.rest) {
        // Rest element: ...T[] → T *_tail; int32_t _tail_len
        const et = ctx.resolveType((el.typeAnn as { element?: TypeAnn }).element ?? el.typeAnn);
        fields.push({ name: `_tail`, ctype: `${et} *`, const: false, rest: true, elemType: et });
        fields.push({ name: `_tail_len`, ctype: `int32_t`, const: false, tailLen: true });
      } else {
        let ct = ctx.resolveType(el.typeAnn);
        if (el.optional) {
          // Wrap in opt_T
          const optName = `opt_${ctx.cTypeToIdent(ct)}`;

          if (!ctx._emittedOptStructs.has(optName)) {
            ctx._emittedOptStructs.add(optName);
            ctx.addTop(`typedef struct { bool has_value; ${ct} value; } ${optName};`);
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
        .filter((e: RtTupleEl) => !e.rest)
        .map((e: RtTupleEl) => ctx.cTypeToIdent(ctx.resolveType(e.typeAnn)));
      const prefix = readonly ? 'readonly_tuple' : 'tuple';
      structName = `${prefix}_${elNames.join('_')}`;
    }

    // Emit typedef if not already done

    if (!ctx._emittedTuples.has(structName)) {
      ctx._emittedTuples.add(structName);
      ctx.classes.set(structName, { isTuple: true, fields: fields as unknown as ClassMetaField[], readonly: !!readonly });
      const fieldDecls = fields.map((f: TupleField) => {
        const ct = f.ctype.endsWith(' *') ? f.ctype.trimEnd() : f.ctype;
        return `${f.const ? 'const ' : ''}${ct}${ct.endsWith('*') ? '' : ' '}${f.name};`;
      }).join(' ');
      ctx.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
    }

    return structName;
}

  // Generate a full C declarator: handles function pointer types correctly
  // e.g. typeDecl({kind:'TypeFunc', params:[i32], ret:i32}, 'f') → 'int32_t (*f)(int32_t)'
export function typeDecl(ctx: CodeGenContext, typeNode: TypeAnn | null | undefined, name: string | null): string {
    if (!typeNode) return `void *${name ? ' ' + name : ''}`;
    if (typeNode.kind === 'TypeFunc') {
      return `tsc_closure${name ? ' ' + name : ''}`;
    }
    if (typeNode.kind === 'TypeArray' && typeNode.element?.kind === 'TypeFunc') {
      return `tsc_closure${name ? ' ' + name : ''}[]`;
    }
    return `${ctx.resolveType(typeNode)}${name ? ' ' + name : ''}`;
}

  // ----------------------------------------------------------------
  // Type inference from expression
  // ----------------------------------------------------------------
