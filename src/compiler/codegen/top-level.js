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

    // Pre-scan: find Shared<T> and Weak<T> usage to know which classes need _refcount/_weakcount
    this._arcClasses = new Map();
    const _scanArc = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(_scanArc); return; }
      if (n.kind === 'New' && (n.name === 'Shared' || n.name === 'Weak')) {
        const tArg = n.typeArgs?.[0];
        if (tArg?.kind === 'TypeRef') {
          const info = this._arcClasses.get(tArg.name) ?? {};
          if (n.name === 'Shared') { info.shared = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          if (n.name === 'Weak') { info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true; }
          this._arcClasses.set(tArg.name, info);
        }
      }
      if (n.kind === 'VarDecl') {
        const _checkTypeAnn = (ta) => {
          if (!ta) return;
          if (ta.kind === 'TypeRef' && (ta.name === 'Shared' || ta.name === 'Weak')) {
            const tArg = ta.typeArgs?.[0];
            if (tArg?.kind === 'TypeRef') {
              const info = this._arcClasses.get(tArg.name) ?? {};
              if (ta.name === 'Shared') { info.shared = true; info.refFirst = false; }
              if (ta.name === 'Weak') { info.weak = true; info.refFirst = false; }
              this._arcClasses.set(tArg.name, info);
            }
          }
        };
        _checkTypeAnn(n.typeAnn);
      }
      // Also scan TypeRef fields for Weak<T>
      if (n.kind === 'TypeRef' && n.name === 'Weak') {
        const tArg = n.typeArgs?.[0];
        if (tArg?.kind === 'TypeRef') {
          const info = this._arcClasses.get(tArg.name) ?? {};
          info.weak = true; if (!info.hasOwnProperty('refFirst')) info.refFirst = true;
          this._arcClasses.set(tArg.name, info);
        }
      }
      for (const key of Object.keys(n)) {
        const child = n[key];
        if (child && typeof child === 'object') _scanArc(child);
      }
    };
    for (const node of ast.body) _scanArc(node);

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
      case 'FuncOverload':
        // Collect signatures; implementation FuncDecl will emit them
        if (!this._pendingOverloads) this._pendingOverloads = new Map();
        { const _sigs = this._pendingOverloads.get(node.name) ?? [];
          _sigs.push(node);
          this._pendingOverloads.set(node.name, _sigs); }
        break;
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
    // Register as struct (isStruct:true allows const qualifier in VarDecl)
    this.classes.set(name, { fields, methods, superClass, isStruct: true });

    // Map TSClang base class names → C names
    const cBase = superClass === 'Error' ? 'TscError' : superClass;

    // Check if this class is used as Shared<T> or Weak<T>
    const arcInfo = this._arcClasses?.get(name);

    // All-static class with no fields → no struct needed (just a namespace)
    const allStatic = methods.length > 0 && methods.every(m => m.modifiers.includes('static'));
    const hasUserFields = fields.length > 0 || cBase;

    if (!allStatic || hasUserFields) {
      // Build field list (single-line struct always)
      const userFieldParts = [];
      if (cBase) userFieldParts.push(`${cBase} _base;`);
      for (const f of fields) {
        const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
        if (ct.endsWith(' *')) userFieldParts.push(`${ct.slice(0, -2)} *${f.name};`);
        else userFieldParts.push(`${ct} ${f.name};`);
      }

      if (arcInfo) {
        const arcPre = arcInfo.refFirst ? [
          ...(arcInfo.shared || arcInfo.weak ? ['int32_t _refcount;'] : []),
          ...(arcInfo.weak ? ['int32_t _weakcount;'] : []),
        ] : [];
        const arcPost = arcInfo.refFirst ? [] : [
          ...(arcInfo.shared || arcInfo.weak ? ['int32_t _refcount;'] : []),
          ...(arcInfo.weak ? ['int32_t _weakcount;'] : []),
        ];
        const allFields = [...arcPre, ...userFieldParts, ...arcPost];
        const isSelfRef = fields.some(f => {
          const ct = f.typeAnn ? this.resolveType(f.typeAnn) : '';
          return ct.includes(name + ' *') || ct.includes(name + '*');
        });
        if (isSelfRef) {
          this.addTop(`typedef struct ${name} ${name};`);
          this.addTop(`struct ${name} { ${allFields.join(' ')} };`);
        } else {
          this.addTop(`typedef struct { ${allFields.join(' ')} } ${name};`);
        }
      } else {
        this.addTop(`typedef struct { ${userFieldParts.join(' ')} } ${name};`);
      }
      this.addTop('');
    }

    // Constructor if present
    const ctor = methods.find(m => m.name === 'constructor');
    if (ctor) {
      this.emitMethod(name, { ...ctor, name: 'new', isStatic: true, returnTypeOverride: name }, true);
    }

    // Methods: emit with explicit-implements style (void *_self) when class has 'implements'
    const explicitImplements = node.implements_ ?? [];
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      const isStatic = m.modifiers.includes('static');
      this.emitMethod(name, m, isStatic, explicitImplements);
    }

    // Emit vtable constants for each explicitly implemented interface
    for (const ifaceName of explicitImplements) {
      this.emitVtableConstant(name, ifaceName);
    }
  },

  emitVtableConstant(className, ifaceName) {
    const ifaceDef = this.interfaces.get(ifaceName);
    if (!ifaceDef) return;
    const ifaceMethods = ifaceDef.filter(m => m.kind === 'MethodSig');
    const vtableName = `${className}_${ifaceName}_vtable`;
    const entries = ifaceMethods.map(m => {
      return `    .${m.name} = ${className}_${m.name}`;
    }).join(',\n');
    this.addTop(`static const ${ifaceName}_vtable ${vtableName} = { ${ifaceMethods.map(m => `.${m.name} = ${className}_${m.name}`).join(', ')} };`);
    this.addTop('');
  },

  emitMethod(className, m, isStatic, explicitImplements = []) {
    if (!m.body) return; // abstract / overload
    // Methods are NOT mangled by param types (class prefix already disambiguates)
    const retType = m.returnTypeOverride ?? (m.returnType ? this.resolveType(m.returnType) : 'void');
    const nameMangled = `${className}_${m.name}`;

    const isMut = m.modifiers?.includes('mut');
    // Move-method: returns the class itself by value → self passed by value
    const isMoveMethod = !isStatic && m.name !== 'new' && retType === className;

    // Interface-implements style: method takes (void *_self) for explicit implements
    const isIfaceMethod = !isStatic && m.name !== 'new' && explicitImplements.length > 0;

    // Emit body first so we can inspect it for self-mutation
    const lines = this.emitFuncBody(m.name, m.body, m.params, retType, className, isMoveMethod, isMut);

    // Determine whether method mutates self
    const mutatesself = isMut || lines.some(l => /self->[\w]+ *=/.test(l));

    const params = [];
    if (!isStatic && m.name !== 'new') {
      if (isMoveMethod) {
        params.push(`${className} self`);
      } else if (isIfaceMethod) {
        // Interface-style: void *_self
        params.push(`void *_self`);
      } else if (mutatesself) {
        params.push(`${className} *self`);
      } else {
        params.push(`const ${className} *self`);
      }
    }
    for (const p of m.params) {
      if (p.name === 'this') continue;
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      params.push(`${ct} ${p.name}`);
    }

    // For iface-style methods: always prepend self cast (vtable requires void *_self signature)
    let finalLines = lines;
    if (isIfaceMethod) {
      finalLines = [`${className} *self = (${className} *)_self;`, `(void)self;`, ...lines];
    }

    // Register method in class so call sites can resolve it
    const cls = this.classes.get(className);
    if (cls) {
      if (!cls._methodNames) cls._methodNames = new Map();
      cls._methodNames.set(m.name, { isStatic, nameMangled, isMut: mutatesself, isMoveMethod, isIfaceMethod });
    }
    this.addTop(`static ${retType} ${nameMangled}(${params.join(', ') || 'void'}) {`);
    for (const l of finalLines) this.addTop('    ' + l);
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

    // vtable typedef (single-line)
    const vtableFields = methods.map(m => {
      const ret = m.returnType ? this.resolveType(m.returnType) : 'void';
      const params = m.params.map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
      return `${ret} (*${m.name})(void *self${params ? ', ' + params : ''});`;
    });
    this.addTop(`typedef struct { ${vtableFields.join(' ')} } ${name}_vtable;`);
    this.addTop(`typedef struct { void *self; const ${name}_vtable *vtable; } ${name};`);
    // Push blank directly so it appears between interface typedefs and following class typedefs
    this.typedefs.push('');
    this._lastAddedToTypedefs = true;
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

    // If there are pending overload signatures for this function, emit one C function per signature
    const pendingSigs = name ? this._pendingOverloads?.get(name) : null;
    if (pendingSigs?.length) {
      this._pendingOverloads.delete(name);
      const implRetType = returnType ? this.resolveType(returnType) : 'void';
      const allOverloads = [];
      for (const sig of pendingSigs) {
        // Build a synthetic node with this signature's params but the implementation's body
        const sigSuffix = mangleParams(sig.params);
        const sigCname = `${name}${sigSuffix}`;
        const synth = { ...node, params: sig.params, _monoName: sigCname };
        this.visitFuncDecl(synth, isTopLevel);
        allOverloads.push({ funcName: sigCname, params: sig.params });
      }
      // Register all overloads in scope for call-site dispatch
      if (name) {
        this.define(name, {
          ctype: implRetType,
          funcName: allOverloads[0].funcName,
          params: allOverloads[0].params,
          overloads: allOverloads,
          _overloadsInitialized: true,
          returnType,
        });
      }
      return;
    }

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
          // Unwrap element type without emitting Array struct typedef
          if (p.typeAnn.kind === 'TypeArray') et = this.resolveType(p.typeAnn.element);
          else et = this.resolveType(p.typeAnn);
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

    // Define before body for recursion support.
    // For overloads: store all variants keyed by param count, and keep the first definition
    // as a sentinel so that callToC can resolve by arg count.
    if (name) {
      const existing = this.lookup(name);
      if (existing && existing.funcName !== cname) {
        // This is an overload: add to the overloads map
        if (!existing.overloads) existing.overloads = [];
        existing.overloads.push({ funcName: cname, params });
        // Also add the first definition as overload if not already done
        if (!existing._overloadsInitialized) {
          existing.overloads.unshift({ funcName: existing.funcName, params: existing.params });
          existing._overloadsInitialized = true;
        }
      } else {
        this.define(name, { ctype: retType, funcName: cname, params, returnType });
      }
    }

    const lines = this.emitFuncBody(name, body, params, retType);
    // Track whether this function heap-allocates String return values
    if (retType === 'String') {
      const heapOps = ['tsc_string_concat','tsc_string_repeat','tsc_string_replace',
                       'tsc_string_pad','tsc_string_to_','tsc_i32_to_string','tsc_f64_to_string',
                       'tsc_i64_to_string','tsc_u32_to_string','tsc_u64_to_string',
                       'tsc_bool_to_string','tsc_char_to_string'];
      const heapsString = lines.some(l => l.trimStart().startsWith('return ') &&
                                          heapOps.some(op => l.includes(op)));
      if (!this._heapStringFuncs) this._heapStringFuncs = new Set();
      if (heapsString) this._heapStringFuncs.add(cname);
    }
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

  emitFuncBody(funcName, body, params, retType, className = null, isMoveMethod = false, isMut = false) {
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
      // move-method: self passed by value → use as value (not pointer)
      const selfIsPointer = !isCtor && !isMoveMethod;
      this.define('self', { ctype: className, isPointer: selfIsPointer });
      // 'this' keyword in source → 'self' in C; also define 'this' for Member lookup
      this.define('this', { ctype: className, isPointer: selfIsPointer });
      if (isCtor) lines.push(`${className} self = {0};`);
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
        const _ct = this.resolveType(p.typeAnn);
        this.define(p.name, { ctype: _ct, isPointer: _ct.endsWith('*') });
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
