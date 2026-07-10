import type { CodeGenContext } from '../../codegen.js';
import type { Interface, TypeAlias, TypeAnn, MethodSig, PropSig, TypeUnion, TypeLiteral, ObjectField, Param, TypeRef, TypeTuple } from '@tsclang/ast';

export interface StructField {
  name: string;
  typeAnn?: TypeAnn | null;
  optional?: boolean;
  isMethod?: boolean;
}

function _emitStructType(
  ctx: CodeGenContext,
  cname: string,
  fieldParts: string[],
  fieldCTypes: string[]
): void {
  const isSelfRef = fieldCTypes.some(ct =>
    ct.includes(cname + ' *') || ct.includes(cname + '*')
  );

  const crossRefs = new Set<string>();
  for (const ct of fieldCTypes) {
    for (const m of ct.matchAll(/(\w+)\s*\*/g)) {
      const tn = m[1];
      if (tn === cname) continue;
      if (ctx._allStructNames?.has(tn) && !ctx._forwardDeclared.has(tn)) {
        crossRefs.add(tn);
      }
    }
  }

  const wasForwardDeclared = ctx._forwardDeclared.has(cname);

  if (isSelfRef || crossRefs.size > 0 || wasForwardDeclared) {
    for (const ref of crossRefs) ctx._ensureForwardDecl(ref);
    ctx._ensureForwardDecl(cname);
    ctx.addTop(`struct ${cname} { ${fieldParts.join(' ')} };`);
  } else {
    ctx.addTop(`typedef struct { ${fieldParts.join(' ')} } ${cname};`);
    ctx._forwardDeclared.add(cname);
  }
}

// types-alias.ts
export function visitInterface(ctx: CodeGenContext, node: Interface) {
    const { name, members } = node;
    if (name.length > 0 && name[0] >= 'a' && name[0] <= 'z') {
      throw ctx.error(`interface name "${name}" must start with uppercase (PascalCase)`, node);
    }
    const cname = ctx._modulePrefix ? ctx._modulePrefix + name : name;
    ctx.interfaces.set(name, members);

    const props = members.filter((m): m is PropSig => m.kind === 'PropSig');
    const methods = members.filter((m): m is MethodSig => m.kind === 'MethodSig');

    // Pure struct interface (no methods) → emit typedef struct
    if (methods.length === 0 && props.length > 0) {
      const fieldParts: string[] = [];
      const fieldCTypes: string[] = [];
      for (const f of props) {
        const ct = f.typeAnn ? ctx.resolveType(f.typeAnn) : 'int32_t';
        if (ct === name) {
          throw ctx.errorCode('E107', f, { name });
        }
        fieldCTypes.push(ct);
        if (f.optional) {
          fieldParts.push(`bool has_${f.name}; ${ct} ${f.name};`);
        } else {
          fieldParts.push(`${ct} ${f.name};`);
        }
      }
      _emitStructType(ctx, cname, fieldParts, fieldCTypes);
      ctx.classes.set(name, { isStruct: true, _cname: cname, fields: props });
      return;
    }

    if (methods.length === 0) return;

    if (ctx._strictRules?.has('no-interfaces')) {
      throw ctx.error('interfaces with methods are forbidden in strict mode (no-interfaces)', node);
    }

    // vtable typedef (single-line)
    const vtableFields = methods.map((m: MethodSig) => {
      const ret = m.returnType ? ctx.resolveType(m.returnType) : 'void';
      const params = m.params.map((p: Param) => p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *').join(', ');
      return `${ret} (*${m.name})(void *self${params ? ', ' + params : ''});`;
    });
    ctx.addTop(`typedef struct { ${vtableFields.join(' ')} } ${cname}_vtable;`);
    ctx.addTop(`typedef struct { void *self; const ${cname}_vtable *vtable; } ${cname};`);
    // Push blank directly so it appears between interface typedefs and following class typedefs
    ctx.typedefs.push('');
    ctx._lastAddedToTypedefs = true;
}

  // ----------------------------------------------------------------
  // Enums
  // ----------------------------------------------------------------
export function visitTypeAlias(ctx: CodeGenContext, node: TypeAlias) {
    const { name, typeAnn } = node;
    if (name.length > 0 && name[0] >= 'a' && name[0] <= 'z') {
      throw ctx.error(`type alias name "${name}" must start with uppercase (PascalCase)`, node);
    }
    const cname = ctx._modulePrefix ? ctx._modulePrefix + name : name;
    // String literal union: type Dir = "north" | "south"
    // → typedef enum + static const char* values[]
    if (ctx.isStringLiteralUnion(typeAnn)) {
      const members = ctx.getStringLiteralMembers(typeAnn);
      const enumVals = members.map((v: string) => `${cname}_${v}`).join(', ');
      ctx.addTop(`typedef enum { ${enumVals} } ${cname};`);
      const strVals = members.map((v: string) => `"${v}"`).join(', ');
      ctx.addTop(`static const char *${cname}_values[] = { ${strVals} };`);
      ctx.addTop('');
      ctx.classes.set(name, { isEnum: true, _cname: cname, isStringLiteralUnion: true, members });
    } else if (typeAnn?.kind === 'TypeObject') {
      // Struct alias: type Point = { x: f64; y: f64 } → typedef struct { double x; double y; } Point;
      const hasMethod = typeAnn.fields.some((f: ObjectField) => f.isMethod);
      if (hasMethod) throw ctx.error(`"type" alias cannot contain methods; use "interface" instead`);
      const fieldParts: string[] = [];
      const fieldCTypes: string[] = [];
      for (const f of typeAnn.fields) {
        const ct = ctx.resolveType(f.typeAnn);
        if (ct === name) {
          throw ctx.errorCode('E107', f, { name });
        }
        fieldCTypes.push(ct);
        fieldParts.push(`${ct} ${f.name};`);
      }
      _emitStructType(ctx, cname, fieldParts, fieldCTypes);
      ctx.classes.set(name, { isStruct: true, _cname: cname, fields: typeAnn.fields });
    } else if (typeAnn?.kind === 'TypeTuple') {
      // Tuple alias: type Point = [x: f64, y: f64] → typedef struct { double _0; double _1; } Point;
      ctx.resolveTupleType(typeAnn, cname);
    } else if (typeAnn?.kind === 'TypeRef' && typeAnn.typeArgs.length > 0) {
      // Utility types
      const utName = typeAnn.name;
      const utArgs = typeAnn.typeArgs;
      if (utName === 'Pick' && utArgs.length >= 2) {
        const baseTypeName = (utArgs[0] as TypeRef).name;
        const fields = ctx.getStructFields(baseTypeName);
        if (fields) {
          const pickedNames = ctx.getStringLiteralMembers(utArgs[1]);
          for (const pn of pickedNames) {
            if (!fields.some((f: StructField) => f.name === pn))
              throw ctx.errorCode('E108', null, { detail: `field "${pn}" does not exist in ${baseTypeName}` });
          }
          // Multi-pick: "name" | "age" → both picked
          const picked = fields.filter((f: StructField) => pickedNames.length > 0 ? pickedNames.includes(f.name) : true);
          const fieldDecls = picked.map((f: StructField) => `${ctx.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
          ctx.classes.set(name, { isStruct: true, _cname: cname, fields: picked });
        }
      } else if (utName === 'Omit' && utArgs.length >= 2) {
        const baseTypeName = (utArgs[0] as TypeRef).name;
        const fields = ctx.getStructFields(baseTypeName);
        if (fields) {
          const omitNames = ctx.getStringLiteralMembers(utArgs[1]);
          for (const on of omitNames) {
            if (!fields.some((f: StructField) => f.name === on))
              throw ctx.errorCode('E108', null, { detail: `field "${on}" does not exist in ${baseTypeName}` });
          }
          const kept = fields.filter((f: StructField) => !omitNames.includes(f.name));
          const fieldDecls = kept.map((f: StructField) => `${ctx.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
          ctx.classes.set(name, { isStruct: true, _cname: cname, fields: kept });
        }
      } else if (utName === 'Partial' && utArgs.length >= 1) {
        const baseTypeName = (utArgs[0] as TypeRef).name;
        const fields = ctx.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.flatMap((f: StructField) => {
            const ct = ctx.resolveType(f.typeAnn);
            return [`bool has_${f.name};`, `${ct} ${f.name};`];
          }).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
          ctx.classes.set(name, { isStruct: true, _cname: cname, isMutable: true, isPartial: true, fields });
        }
      } else if (utName === 'Required' && utArgs.length >= 1) {
        const baseTypeName = (utArgs[0] as TypeRef).name;
        const fields = ctx.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.map((f: StructField) => `${ctx.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
          ctx.classes.set(name, { isStruct: true, _cname: cname, isMutable: true, fields });
        }
      } else if (utName === 'Readonly' && utArgs.length >= 1) {
        const baseTypeName = (utArgs[0] as TypeRef).name;
        const fields = ctx.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.map((f: StructField) => `const ${ctx.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
          ctx.classes.set(name, { isStruct: true, _cname: cname, fields });
        }
      } else if (utName === 'NonNullable' && utArgs.length >= 1) {
        // NonNullable<T | null> → T (transparent alias, strips opt_)
        let inner = utArgs[0];
        if (inner.kind === 'TypeUnion') {
          const nonNull = inner.types.filter((t: TypeAnn) => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined')));
          if (nonNull.length === 1) inner = nonNull[0];
        }
        // Resolve without triggering lazy opt typedef emission
        ctx._noOptEmit = true;
        let innerCtype = ctx.resolveType(inner);
        ctx._noOptEmit = false;
        // If resolving through a MaybeX alias that maps to opt_T, get the inner T
        if (innerCtype.startsWith('opt_') && ctx._pendingOptTypedefs?.has(innerCtype)) {
          innerCtype = ctx._pendingOptTypedefs.get(innerCtype)!;
        } else if (innerCtype.startsWith('opt_')) {
          // Strip opt_ (best effort: opt_string → String via re-resolve... just use pending map)
          innerCtype = innerCtype.slice(4);
        }

        ctx._typeAliases.set(name, innerCtype); // transparent alias, no typedef
      } else if (utName === 'Record' && utArgs.length >= 2) {
        const keyTypeNode = utArgs[0];
        const valTypeNode = utArgs[1];
        const valCtype = ctx.resolveType(valTypeNode);

        if (ctx.isStringLiteralUnion(keyTypeNode)) {
          // Record<"x"|"y", f64> → struct { double x; double y; }
          const keys = ctx.getStringLiteralMembers(keyTypeNode);
          const fieldDecls = keys.map((k: string) => `${valCtype} ${k};`).join(' ');
          ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
          ctx.classes.set(name, { isStruct: true, _cname: cname, fields: keys.map((k: string) => ({ name: k, typeAnn: valTypeNode })) });
        } else {
          const keyCtype = ctx.resolveType(keyTypeNode);
          const keyEnumDef = ctx.classes.get(keyCtype);
          if (keyEnumDef?.isEnum && !keyEnumDef?.isStringLiteralUnion) {
            // Record<EnumType, V> → struct with enum member names as fields
            const rawMembers = keyEnumDef.members ?? [];
            const memberNames = rawMembers.map((m) => typeof m === 'string' ? m : m.name);
            const fieldDecls = memberNames.map((m) => `${valCtype} ${m};`).join(' ');
            ctx.addTop(`typedef struct { ${fieldDecls} } ${cname};`);
            ctx.classes.set(name, { isStruct: true, _cname: cname, fields: memberNames.map((m) => ({ name: m, typeAnn: valTypeNode })) });
          } else if (keyCtype === 'String' || keyCtype === 'string' || (keyTypeNode as TypeRef).name === 'string') {
            // Record<string, V> → TscMap alias
            const k = ctx.cTypeToIdent(keyCtype);
            const v = ctx.cTypeToIdent(valCtype);
            ctx._typeAliases.set(name, `TscMap_${k}_${v}`);
          } else {
            throw ctx.errorCode('E109', null, { detail: `Record key must be a string literal union or string enum, not ${(keyTypeNode as TypeRef).name ?? keyCtype}` });
          }
        }
      } else if (utName === 'Exclude' || utName === 'Extract') {
        throw ctx.error(`conditional types are not supported`);
      } else if (utName === 'ReturnType' && utArgs.length >= 1) {
        // ReturnType<typeof fn> → fn's return type
        const arg = utArgs[0];

        if (arg.kind === 'TypeTypeof') {
          const sym = ctx.lookup(arg.name);
          if (sym?.returnType) {
            ctx._typeAliases.set(name, ctx.resolveType(sym.returnType));
          } else if (sym?.ctype) {
            ctx._typeAliases.set(name, sym.ctype);
          } else {
            ctx._typeAliases.set(name, 'void');
          }
        } else {
          throw ctx.errorCode('E109', null, { detail: 'ReturnType argument must be a function type' });
        }
      } else if (utName === 'Parameters' && utArgs.length >= 1) {
        // Parameters<typeof fn> → tuple type of fn's params
        const arg = utArgs[0];
        if (arg.kind === 'TypeTypeof') {
          const sym = ctx.lookup(arg.name);
          if (sym?.params) {
            const params = sym.params.filter((p) => !p.rest);
            const tupleNode = {
              kind: 'TypeTuple',
              elements: params.map((p) => ({ typeAnn: p.typeAnn ?? { kind: 'TypeRef', name: 'i32', typeArgs: [] }, label: p.name, rest: false, optional: false })),
              readonly: false
            } as unknown as TypeTuple;
            const tupleName = ctx.resolveTupleType(tupleNode);

            ctx._typeAliases.set(name, tupleName);
          }
        }
      } else if (utName === 'Awaited' && utArgs.length >= 1) {
        // Awaited<Promise<T>> → T

        let inner = utArgs[0];
        // Unwrap all Promise<> wrappers
        while (inner.kind === 'TypeRef' && inner.name === 'Promise' && inner.typeArgs.length > 0) {
          inner = inner.typeArgs[0];
        }
        ctx._typeAliases.set(name, ctx.resolveType(inner));
      }
    } else if (typeAnn?.kind === 'TypeKeyOf') {
      // keyof T → string-literal-union enum of field names
      const targetTypeName = typeAnn.target?.name;
      const fields = targetTypeName ? ctx.getStructFields(targetTypeName) : null;
      if (fields && fields.length > 0) {
        const fieldNames = fields.map((f: StructField) => f.name);
        const enumVals = fieldNames.map((v: string) => `${cname}_${v}`).join(', ');
        ctx.addTop(`typedef enum { ${enumVals} } ${cname};`);
        const strVals = fieldNames.map((v: string) => `"${v}"`).join(', ');
        ctx.addTop(`static const char *${cname}_values[] = { ${strVals} };`);
        ctx.addTop('');
        ctx.classes.set(name, { isEnum: true, _cname: cname, isStringLiteralUnion: true, isKeyOf: true, members: fieldNames });
      }
    } else if (typeAnn?.kind === 'TypeRef' && typeAnn.typeArgs.length === 0) {
      // Scalar alias: type UserId = i32 → typedef int32_t UserId;
      // Skip generic type aliases (Pick<User, Fields>, etc.) — no C output
      const inner = ctx.resolveType(typeAnn);
      if (inner !== name) {
        ctx.addTop(`typedef ${inner} ${cname};`);
        ctx.classes.set(name, { isScalarAlias: true, _cname: cname, innerType: inner });
      }
    } else if (typeAnn?.kind === 'TypeUnion') {
      // Mixed union (non-string) → error if any member is a string literal
      const allMembers = ctx.flattenUnion(typeAnn);
      const hasString = allMembers.some((t: TypeAnn) => t.kind === 'TypeLiteral' && t.litKind === 'string');
      const hasNonString = allMembers.some((t: TypeAnn) => !(t.kind === 'TypeLiteral' && t.litKind === 'string'));
      if (hasString && hasNonString) {
        throw ctx.errorCode('E109', null, { detail: 'string literal union cannot be mixed with non-string types' });
      }

      // For nullable unions (T | null), compute opt name without emitting typedef yet
      const nonNullLeaves = allMembers.filter((t: TypeAnn) => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined'))
                                                  && !(t.kind === 'TypeLiteral' && t.value === 'null'));
      if (allMembers.length !== nonNullLeaves.length && nonNullLeaves.length === 1) {
        const inner = ctx.resolveType(nonNullLeaves[0]);
        const optName = `opt_${ctx.cTypeToIdent(inner)}`;
        ctx._typeAliases.set(name, optName);
        // Store for deferred typedef emission (emitted on first actual use)

        ctx._pendingOptTypedefs.set(optName, inner);
      } else {
        ctx._typeAliases.set(name, ctx.resolveType(typeAnn));
      }
    }
    // Other type aliases: no C output (structural types, generic aliases, etc.)
}

  // Get struct-like field definitions for a named type (interface or struct alias)
export function getStructFields(ctx: CodeGenContext, typeName: string): StructField[] | null {
    const cls = ctx.classes.get(typeName);
    if (cls?.isStruct && cls.fields) return cls.fields as StructField[];
    const iface = ctx.interfaces.get(typeName) as (MethodSig | PropSig)[] | undefined;
    if (iface) return iface.filter((m) => m.kind === 'PropSig') as PropSig[];
    return null;
}

  // Flatten nested TypeUnion into array of leaf types
export function flattenUnion(ctx: CodeGenContext, typeAnn: TypeAnn): TypeAnn[] {
    if (typeAnn.kind === 'TypeUnion') return typeAnn.types.flatMap((t: TypeAnn) => ctx.flattenUnion(t));
    return [typeAnn];
}

  // Check if a type annotation is a pure string literal union (handles nested TypeUnions)
export function isStringLiteralUnion(ctx: CodeGenContext, typeAnn: TypeAnn | null | undefined): boolean {
    if (!typeAnn) return false;
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return true;
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.every((t: TypeAnn) => ctx.isStringLiteralUnion(t));
    }
    return false;
}

  // Extract string literal values from a string literal union type (handles nested TypeUnions)
export function getStringLiteralMembers(ctx: CodeGenContext, typeAnn: TypeAnn | null | undefined): string[] {
    if (!typeAnn) return [];
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return [typeAnn.value];
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.flatMap((t: TypeAnn) => ctx.getStringLiteralMembers(t));
    }
    return [];
}
