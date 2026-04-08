import { mangleParams } from '../types.js';
// top-level.js
export default {
  visitProgram(ast) {
    // Pre-scan: find variables exclusively consumed by Object.fromEntries(varName)
    this._fromEntriesConsumed = new Map();
    for (const node of ast.body) {
      const stmt = node.kind === 'Export' ? node.decl : node;
      if (stmt?.kind === 'VarDecl' &&
          stmt.init?.kind === 'Call' &&
          stmt.init.callee?.kind === 'Member' &&
          stmt.init.callee?.object?.name === 'Object' &&
          stmt.init.callee?.prop === 'fromEntries' &&
          stmt.init.args?.[0]?.expr?.kind === 'Ident') {
        this._fromEntriesConsumed.set(stmt.init.args[0].expr.name, null);
      }
    }
    for (const node of ast.body) this.visitTopLevel(node);
  },

  visitTopLevel(node) {
    if (!node) return;
    switch (node.kind) {
      case 'ProfileAnnotation': break; // ignore for now
      case 'Import':  break; // stdlib handled via includes
      case 'Export':  this.visitTopLevel(node.decl); break;
      case 'ClassDecl':   this.visitClassDecl(node); break;
      case 'Interface':   this.visitInterface(node); break;
      case 'Enum':        this.visitEnum(node); break;
      case 'TypeAlias':   this.visitTypeAlias(node); break;
      case 'FuncDecl':    this.visitFuncDecl(node, true); break;
      case 'FuncOverload': break; // skip overload signatures
      case 'VarDecl':     this.visitStmtInMain(node); break;
      case 'Noop':        break;
      default:
        // Top-level expression (e.g. console.log at top level)
        this.visitStmtInMain(node);
    }
  },

  // ----------------------------------------------------------------
  // Classes
  // ----------------------------------------------------------------
  visitClassDecl(node) {
    const { name, superClass, members, decorators, typeParams } = node;
    // Generic class: store as template
    if (typeParams?.length > 0) {
      if (!this._genericClasses) this._genericClasses = new Map();
      this._genericClasses.set(name, node);
      return;
    }
    const fields = members.filter(m => m.kind === 'Field');
    const methods = members.filter(m => m.kind === 'Method');
    this.classes.set(name, { fields, methods, superClass });

    // Map TSClang base class names → C names
    const cBase = superClass === 'Error' ? 'TscError' : superClass;

    // Simple class (no methods, no base) → single-line struct
    if (!cBase && methods.length === 0) {
      const fieldParts = fields.map(f => {
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        return `${ct} ${f.name};`;
      });
      this.addTop(`typedef struct { ${fieldParts.join(' ')} } ${name};`);
      this.addTop('');
    } else {
      // typedef struct (multi-line)
      this.addTop(`typedef struct {`);
      if (cBase) this.addTop(`    ${cBase} _base;`);
      for (const f of fields) {
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        this.addTop(`    ${ct} ${f.name};`);
      }
      this.addTop(`} ${name};`);
      this.addTop('');
    }

    // Constructor if present
    const ctor = methods.find(m => m.name === 'constructor');
    if (ctor) {
      this.emitMethod(name, { ...ctor, name: 'new', isStatic: true, returnTypeOverride: name }, false);
    }

    // Methods
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      const isStatic = m.modifiers.includes('static');
      this.emitMethod(name, m, isStatic);
    }
  },

  emitMethod(className, m, isStatic) {
    if (!m.body) return; // abstract / overload
    const suffix = mangleParams(m.params);
    const retType = m.returnTypeOverride ?? (m.returnType ? this.resolveType(m.returnType) : 'void');
    const nameMangled = isStatic
      ? `${className}_${m.name}${suffix}`
      : `${className}_${m.name}${suffix}`;

    const params = [];
    if (!isStatic && m.name !== 'new') params.push(`${className} *self`);
    for (const p of m.params) {
      if (p.name === 'this') continue;
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      params.push(`${ct} ${p.name}`);
    }

    const lines = this.emitFuncBody(m.name, m.body, m.params, retType, className);
    this.addTop(`static ${retType} ${nameMangled}(${params.join(', ')}) {`);
    for (const l of lines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');
  },

  // ----------------------------------------------------------------
  // Interfaces
  // ----------------------------------------------------------------
  visitInterface(node) {
    const { name, members } = node;
    this.interfaces.set(name, members);

    const props = members.filter(m => m.kind === 'PropSig');
    const methods = members.filter(m => m.kind === 'MethodSig');

    // Pure struct interface (no methods) → emit typedef struct
    if (methods.length === 0 && props.length > 0) {
      const fieldParts = [];
      for (const f of props) {
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        if (f.optional) {
          // Optional field: bool has_X; T X; (no opt_T wrapper needed)
          fieldParts.push(`bool has_${f.name}; ${ct} ${f.name};`);
        } else {
          fieldParts.push(`${ct} ${f.name};`);
        }
      }
      this.addTop(`typedef struct { ${fieldParts.join(' ')} } ${name};`);
      // No blank line — consecutive typedefs can follow immediately
      this.classes.set(name, { isStruct: true, fields: props });
      return;
    }

    if (methods.length === 0) return;

    // vtable typedef
    const vtableLines = methods.map(m => {
      const ret = m.returnType ? this.resolveType(m.returnType) : 'void';
      const params = m.params.map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
      return `    ${ret} (*${m.name})(void *self${params ? ', ' + params : ''});`;
    });
    this.addTop(`typedef struct {`);
    for (const l of vtableLines) this.addTop(l);
    this.addTop(`} ${name}_vtable;`);
    this.addTop(`typedef struct { void *self; const ${name}_vtable *vtable; } ${name};`);
    this.addTop('');
  },

  // ----------------------------------------------------------------
  // Enums
  // ----------------------------------------------------------------
  visitTypeAlias(node) {
    const { name, typeAnn } = node;
    // String literal union: type Dir = "north" | "south"
    // → typedef enum + static const char* values[]
    if (this.isStringLiteralUnion(typeAnn)) {
      const members = this.getStringLiteralMembers(typeAnn);
      const enumVals = members.map(v => `${name}_${v}`).join(', ');
      this.addTop(`typedef enum { ${enumVals} } ${name};`);
      const strVals = members.map(v => `"${v}"`).join(', ');
      this.addTop(`static const char *${name}_values[] = { ${strVals} };`);
      this.addTop('');
      this.classes.set(name, { isEnum: true, isStringLiteralUnion: true, members });
    } else if (typeAnn?.kind === 'TypeObject') {
      // Struct alias: type Point = { x: f64; y: f64 } → typedef struct { double x; double y; } Point;
      const hasMethod = typeAnn.fields.some(f => f.isMethod);
      if (hasMethod) throw new Error(`"type" alias cannot contain methods; use "interface" instead`);
      const fields = typeAnn.fields.map(f => {
        const ct = this.resolveType(f.typeAnn);
        return `${ct} ${f.name};`;
      }).join(' ');
      this.addTop(`typedef struct { ${fields} } ${name};`);
      this.classes.set(name, { isStruct: true, fields: typeAnn.fields });
    } else if (typeAnn?.kind === 'TypeTuple') {
      // Tuple alias: type Point = [x: f64, y: f64] → typedef struct { double _0; double _1; } Point;
      this.resolveTupleType(typeAnn, name);
    } else if (typeAnn?.kind === 'TypeRef' && typeAnn.typeArgs.length > 0) {
      // Utility types
      const utName = typeAnn.name;
      const utArgs = typeAnn.typeArgs;
      if (utName === 'Pick' && utArgs.length >= 2) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const pickedNames = this.getStringLiteralMembers(utArgs[1]);
          for (const pn of pickedNames) {
            if (!fields.some(f => f.name === pn))
              throw new Error(`field "${pn}" does not exist in ${baseTypeName}`);
          }
          // Multi-pick: "name" | "age" → both picked
          const picked = fields.filter(f => pickedNames.length > 0 ? pickedNames.includes(f.name) : true);
          const fieldDecls = picked.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields: picked });
        }
      } else if (utName === 'Omit' && utArgs.length >= 2) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const omitNames = this.getStringLiteralMembers(utArgs[1]);
          for (const on of omitNames) {
            if (!fields.some(f => f.name === on))
              throw new Error(`field "${on}" does not exist in ${baseTypeName}`);
          }
          const kept = fields.filter(f => !omitNames.includes(f.name));
          const fieldDecls = kept.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields: kept });
        }
      } else if (utName === 'Partial' && utArgs.length >= 1) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.flatMap(f => {
            const ct = this.resolveType(f.typeAnn);
            return [`bool has_${f.name};`, `${ct} ${f.name};`];
          }).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, isMutable: true, isPartial: true, fields });
        }
      } else if (utName === 'Required' && utArgs.length >= 1) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, isMutable: true, fields });
        }
      } else if (utName === 'Readonly' && utArgs.length >= 1) {
        const baseTypeName = utArgs[0].name;
        const fields = this.getStructFields(baseTypeName);
        if (fields) {
          const fieldDecls = fields.map(f => `const ${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields });
        }
      } else if (utName === 'NonNullable' && utArgs.length >= 1) {
        // NonNullable<T | null> → T (transparent alias, strips opt_)
        let inner = utArgs[0];
        if (inner.kind === 'TypeUnion') {
          const nonNull = inner.types.filter(t => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined')));
          if (nonNull.length === 1) inner = nonNull[0];
        }
        // Resolve without triggering lazy opt typedef emission
        this._noOptEmit = true;
        let innerCtype = this.resolveType(inner);
        this._noOptEmit = false;
        // If resolving through a MaybeX alias that maps to opt_T, get the inner T
        if (innerCtype.startsWith('opt_') && this._pendingOptTypedefs?.has(innerCtype)) {
          innerCtype = this._pendingOptTypedefs.get(innerCtype);
        } else if (innerCtype.startsWith('opt_')) {
          // Strip opt_ (best effort: opt_string → String via re-resolve... just use pending map)
          innerCtype = innerCtype.slice(4);
        }
        if (!this._typeAliases) this._typeAliases = new Map();
        this._typeAliases.set(name, innerCtype); // transparent alias, no typedef
      } else if (utName === 'Record' && utArgs.length >= 2) {
        const keyTypeNode = utArgs[0];
        const valTypeNode = utArgs[1];
        const valCtype = this.resolveType(valTypeNode);
        if (!this._typeAliases) this._typeAliases = new Map();
        if (this.isStringLiteralUnion(keyTypeNode)) {
          // Record<"x"|"y", f64> → struct { double x; double y; }
          const keys = this.getStringLiteralMembers(keyTypeNode);
          const fieldDecls = keys.map(k => `${valCtype} ${k};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
          this.classes.set(name, { isStruct: true, fields: keys.map(k => ({ name: k, typeAnn: valTypeNode })) });
        } else {
          const keyCtype = this.resolveType(keyTypeNode);
          const keyEnumDef = this.classes.get(keyCtype);
          if (keyEnumDef?.isEnum && !keyEnumDef?.isStringLiteralUnion) {
            // Record<EnumType, V> → struct with enum member names as fields
            const rawMembers = keyEnumDef.members ?? [];
            const memberNames = rawMembers.map(m => typeof m === 'string' ? m : m.name);
            const fieldDecls = memberNames.map(m => `${valCtype} ${m};`).join(' ');
            this.addTop(`typedef struct { ${fieldDecls} } ${name};`);
            this.classes.set(name, { isStruct: true, fields: memberNames.map(m => ({ name: m, typeAnn: valTypeNode })) });
          } else if (keyCtype === 'String' || keyCtype === 'string' || keyTypeNode.name === 'string') {
            // Record<string, V> → TscMap alias
            const k = this.cTypeToIdent(keyCtype);
            const v = this.cTypeToIdent(valCtype);
            this._typeAliases.set(name, `TscMap_${k}_${v}`);
          } else {
            throw new Error(`Record key must be a string literal union or string enum, not ${keyTypeNode.name ?? keyCtype}`);
          }
        }
      } else if (utName === 'Exclude' || utName === 'Extract') {
        throw new Error(`conditional types are not supported`);
      } else if (utName === 'ReturnType' && utArgs.length >= 1) {
        // ReturnType<typeof fn> → fn's return type
        const arg = utArgs[0];
        if (!this._typeAliases) this._typeAliases = new Map();
        if (arg.kind === 'TypeTypeof') {
          const sym = this.lookup(arg.name);
          if (sym?.returnType) {
            this._typeAliases.set(name, this.resolveType(sym.returnType));
          } else if (sym?.ctype) {
            this._typeAliases.set(name, sym.ctype);
          } else {
            this._typeAliases.set(name, 'void');
          }
        } else {
          throw new Error(`ReturnType argument must be a function type`);
        }
      } else if (utName === 'Parameters' && utArgs.length >= 1) {
        // Parameters<typeof fn> → tuple type of fn's params
        const arg = utArgs[0];
        if (arg.kind === 'TypeTypeof') {
          const sym = this.lookup(arg.name);
          if (sym?.params) {
            const params = sym.params.filter(p => !p.rest);
            const tupleNode = {
              kind: 'TypeTuple',
              elements: params.map(p => ({ typeAnn: p.typeAnn ?? { kind: 'TypeRef', name: 'i32', typeArgs: [] }, label: p.name, rest: false, optional: false })),
              readonly: false
            };
            const tupleName = this.resolveTupleType(tupleNode);
            if (!this._typeAliases) this._typeAliases = new Map();
            this._typeAliases.set(name, tupleName);
          }
        }
      } else if (utName === 'Awaited' && utArgs.length >= 1) {
        // Awaited<Promise<T>> → T
        if (!this._typeAliases) this._typeAliases = new Map();
        let inner = utArgs[0];
        // Unwrap all Promise<> wrappers
        while (inner.kind === 'TypeRef' && inner.name === 'Promise' && inner.typeArgs.length > 0) {
          inner = inner.typeArgs[0];
        }
        this._typeAliases.set(name, this.resolveType(inner));
      }
    } else if (typeAnn?.kind === 'TypeKeyOf') {
      // keyof T → string-literal-union enum of field names
      const targetTypeName = typeAnn.target?.name;
      const fields = targetTypeName ? this.getStructFields(targetTypeName) : null;
      if (fields && fields.length > 0) {
        const fieldNames = fields.map(f => f.name);
        const enumVals = fieldNames.map(v => `${name}_${v}`).join(', ');
        this.addTop(`typedef enum { ${enumVals} } ${name};`);
        const strVals = fieldNames.map(v => `"${v}"`).join(', ');
        this.addTop(`static const char *${name}_values[] = { ${strVals} };`);
        this.addTop('');
        this.classes.set(name, { isEnum: true, isStringLiteralUnion: true, isKeyOf: true, members: fieldNames });
      }
    } else if (typeAnn?.kind === 'TypeRef' && typeAnn.typeArgs.length === 0) {
      // Scalar alias: type UserId = i32 → typedef int32_t UserId;
      // Skip generic type aliases (Pick<User, Fields>, etc.) — no C output
      const inner = this.resolveType(typeAnn);
      if (inner !== name) {
        this.addTop(`typedef ${inner} ${name};`);
        this.classes.set(name, { isScalarAlias: true, innerType: inner });
      }
    } else if (typeAnn?.kind === 'TypeUnion') {
      // Mixed union (non-string) → error if any member is a string literal
      const allMembers = this.flattenUnion(typeAnn);
      const hasString = allMembers.some(t => t.kind === 'TypeLiteral' && t.litKind === 'string');
      const hasNonString = allMembers.some(t => !(t.kind === 'TypeLiteral' && t.litKind === 'string'));
      if (hasString && hasNonString) {
        throw new Error(`string literal union cannot be mixed with non-string types`);
      }
      if (!this._typeAliases) this._typeAliases = new Map();
      // For nullable unions (T | null), compute opt name without emitting typedef yet
      const nonNullLeaves = allMembers.filter(t => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined'))
                                                  && !(t.kind === 'TypeLiteral' && t.value === 'null'));
      if (allMembers.length !== nonNullLeaves.length && nonNullLeaves.length === 1) {
        const inner = this.resolveType(nonNullLeaves[0]);
        const optName = `opt_${this.cTypeToIdent(inner)}`;
        this._typeAliases.set(name, optName);
        // Store for deferred typedef emission (emitted on first actual use)
        if (!this._pendingOptTypedefs) this._pendingOptTypedefs = new Map();
        this._pendingOptTypedefs.set(optName, inner);
      } else {
        this._typeAliases.set(name, this.resolveType(typeAnn));
      }
    }
    // Other type aliases: no C output (structural types, generic aliases, etc.)
  },

  // Get struct-like field definitions for a named type (interface or struct alias)
  getStructFields(typeName) {
    const cls = this.classes.get(typeName);
    if (cls?.isStruct && cls.fields) return cls.fields;
    const iface = this.interfaces.get(typeName);
    if (iface) return iface.filter(m => m.kind === 'PropSig');
    return null;
  },

  // Flatten nested TypeUnion into array of leaf types
  flattenUnion(typeAnn) {
    if (typeAnn.kind === 'TypeUnion') return typeAnn.types.flatMap(t => this.flattenUnion(t));
    return [typeAnn];
  },

  // Check if a type annotation is a pure string literal union (handles nested TypeUnions)
  isStringLiteralUnion(typeAnn) {
    if (!typeAnn) return false;
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return true;
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.every(t => this.isStringLiteralUnion(t));
    }
    return false;
  },

  // Extract string literal values from a string literal union type (handles nested TypeUnions)
  getStringLiteralMembers(typeAnn) {
    if (!typeAnn) return [];
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return [typeAnn.value];
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.flatMap(t => this.getStringLiteralMembers(t));
    }
    return [];
  },

  visitEnum(node) {
    const { name, members, isConst } = node;
    let counter = 0;
    // Detect string enum: first member with a string value
    const isStringEnum = members.some(m => m.value?.litType === 'string');
    const entries = members.map(m => {
      if (isStringEnum) {
        const strVal = m.value ? m.value.value : m.name;
        const idx = counter++;
        return { name: m.name, val: String(idx), strVal };
      }
      const val = m.value ? this.exprToC(m.value) : String(counter++);
      if (m.value) { try { counter = parseInt(val) + 1; } catch {} }
      return { name: m.name, val };
    });
    this.addTop(`typedef enum { ${entries.map(e => `${name}_${e.name} = ${e.val}`).join(', ')} } ${name};`);
    if (!isConst) {
      if (isStringEnum) {
        this.addTop(`static const char *${name}_strings[] = { ${entries.map(e => `"${e.strVal}"`).join(', ')} };`);
      } else {
        this.addTop(`static const ${name} ${name}_values[] = { ${entries.map(e => `${name}_${e.name}`).join(', ')} };`);
        this.addTop(`static const char *${name}_names[] = { ${entries.map(e => `"${e.name}"`).join(', ')} };`);
      }
    }
    this.addTop('');
    this.classes.set(name, { isEnum: true, isStringEnum, isConst, members: entries });
  },

  // ----------------------------------------------------------------
  // Global variables
  // ----------------------------------------------------------------
  visitGlobalVar(node) {
    const { varKind, name, typeAnn, init } = node;
    const isConst = varKind === 'const';
    const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
    const qualifier = isConst ? 'static const ' : 'static ';
    if (init) {
      const initC = this.exprToC(init);
      this.addTop(`${qualifier}${ctype} ${name} = ${initC};`);
    } else {
      this.addTop(`${qualifier}${ctype} ${name} = {0};`);
    }
    this.addTop('');
    this.define(name, { ctype, varKind });
  },

  // ----------------------------------------------------------------
  // Functions
  // ----------------------------------------------------------------
  visitFuncDecl(node, isTopLevel = false) {
    if (!node.body) return; // overload signature
    const { name, params, returnType, body, generator, decorators, typeParams } = node;
    // Generic function: store as template, emit on demand at call sites
    if (typeParams?.length > 0) {
      // Check: Pick<T, K> in return type where K is a generic param → error
      if (returnType?.kind === 'TypeRef' && returnType.name === 'Pick' && returnType.typeArgs?.length >= 2) {
        const keyArg = returnType.typeArgs[1];
        const typeParamNames = new Set(typeParams.map(tp => tp.name));
        if (keyArg.kind === 'TypeRef' && typeParamNames.has(keyArg.name)) {
          throw new Error(`Pick with runtime key in return type is not supported`);
        }
      }
      if (!this._genericFuncs) this._genericFuncs = new Map();
      this._genericFuncs.set(name, node);
      return;
    }
    const isNever = returnType?.kind === 'TypeRef' && returnType.name === 'never';
    // Infer return type from first return statement if no annotation
    let retType;
    if (returnType) {
      retType = this.resolveType(returnType);
    } else if (body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const retStmt = stmts.find(s => s.kind === 'Return' && s.value);
      retType = retStmt ? this.inferType(retStmt.value) : 'void';
    } else {
      retType = 'void';
    }
    const suffix = node._monoName ? '' : mangleParams(params);
    const cname = node._monoName ?? (name ? `${name}${suffix}` : `_anon_${this.lambdaCount++}`);

    // never return type: body must end with throw/abort
    if (isNever && body) {
      const stmts = body.kind === 'Block' ? body.body : [body];
      const last = stmts[stmts.length - 1];
      if (!last || last.kind !== 'Throw') {
        throw new Error(`function with return type "never" must not return`);
      }
    }

    const paramStrs = params.map(p => {
      if (p.rest) {
        // ...args: T[] → T *args, int32_t args_count (unwrap the array type)
        let et = 'int32_t';
        if (p.typeAnn) {
          const resolved = this.resolveType(p.typeAnn);
          // If resolved is Array_X, extract element type; otherwise use as-is
          if (p.typeAnn.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
          else et = resolved;
        }
        return `${et} *${p.name}, int32_t ${p.name}_count`;
      }
      if (p.destructArr) {
        // [a, b]: T[] → T *_arr  (destructured in body)
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        return `${et} *_arr`;
      }
      if (p.typeAnn?.kind === 'TypeFunc') return this.typeDecl(p.typeAnn, p.name);
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });

    // Define before body for recursion support
    if (name) this.define(name, { ctype: retType, funcName: cname, params, returnType });

    const lines = this.emitFuncBody(name, body, params, retType);
    // Special C syntax when return type is a function pointer: RET (*NAME(PARAMS))(FP_PARAMS)
    let funcSig;
    if (returnType?.kind === 'TypeFunc') {
      const fpRet = this.resolveType(returnType.ret);
      const fpParams = returnType.params.map(pt => this.resolveType(pt)).join(', ') || 'void';
      funcSig = `${fpRet} (*${cname}(${paramStrs.join(', ') || 'void'}))(${fpParams})`;
    } else {
      const prefix = isNever ? '_Noreturn ' : '';
      const retSep = retType.endsWith('*') ? '' : ' ';
      funcSig = `${prefix}${retType}${retSep}${cname}(${paramStrs.join(', ') || 'void'})`;
    }
    // Add blank line before function if there's preceding content without a trailing blank
    if (this.topLevel.length > 0 && this.topLevel[this.topLevel.length - 1] !== '') {
      this.addTop('');
    }
    this.addTop(`${funcSig} {`);
    for (const l of lines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');
  },

  emitFuncBody(funcName, body, params, retType, className = null) {
    const saved = { inFunction: this.inFunction, funcName: this.currentFuncName, retType: this.currentFuncReturnType };
    this.inFunction = true;
    this.currentFuncName = funcName;
    this.currentFuncReturnType = retType;
    const lines = [];
    this._currentFuncLines = lines;
    this._funcDepth = 0;

    this.pushScope();
    // For constructors: declare 'self' as value; for instance methods: as pointer
    const isCtor = className && (funcName === 'new' || funcName === 'constructor');
    if (className) {
      this.define('self', { ctype: className, isPointer: !isCtor });
      // 'this' keyword in source → 'self' in C; also define 'this' for Member lookup
      this.define('this', { ctype: className, isPointer: !isCtor });
      if (isCtor) lines.push(`${className} self;`);
    }
    for (const p of params) {
      if (p.rest) {
        // Rest param: element type, mark as rest
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        this.define(p.name, { ctype: et, rest: true, countVar: `${p.name}_count` });
      } else if (p.destructArr) {
        // Array destructuring: emit bindings at top of function body
        let et = 'int32_t';
        if (p.typeAnn?.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
        else if (p.typeAnn) et = this.resolveType(p.typeAnn);
        for (let i = 0; i < p.destructArr.length; i++) {
          const slot = p.destructArr[i];
          if (!slot) continue; // skip (,, c)
          lines.push(`${et} ${slot.name} = _arr[${i}];`);
          this.define(slot.name, { ctype: et });
        }
      } else if (p.typeAnn) {
        this.define(p.name, { ctype: this.resolveType(p.typeAnn) });
      }
    }
    this.visitBlock(body, lines, 0);
    if (isCtor) lines.push('return self;');
    this.popScope();

    this.inFunction = saved.inFunction;
    this.currentFuncName = saved.funcName;
    this.currentFuncReturnType = saved.retType;
    return lines;
  }
};
