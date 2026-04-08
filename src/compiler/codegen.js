// TSClang Code Generator
// Walks the AST and produces C source.

import { PRIMITIVE_MAP, toCType, fmtSpec, mangleType, mangleParams, inferLiteralCType } from './types.js';

export function codegen(ast, filename = 'input') {
  const ctx = new Context(filename);
  ctx.visitProgram(ast);
  return ctx.emit();
}

// ============================================================
class Context {
  constructor(filename) {
    this.filename = filename;
    this.includes = new Set(['#include "runtime.h"']);
    this.topLevel = [];     // forward decls, struct typedefs, functions
    this.mainStmts = [];    // statements inside main()
    this.lambdaCount = 0;
    this.restCount = 0;
    this.lambdaLines = [];  // hoisted lambda functions (emitted before topLevel)
    this.closureCount = 0;
    this.tempCount = 0;
    this.indent = 4;

    // Symbol table: name → { ctype, varKind }
    this.scopes = [new Map()];
    // Known classes: name → { fields, methods }
    this.classes = new Map();
    // Known interfaces
    this.interfaces = new Map();
    // Lambda hoisted functions (emitted before main)
    this.lambdas = [];
    // Are we inside a function body (not main)?
    this.inFunction = false;
    this.currentFuncName = null;
    this.currentFuncReturnType = null;
  }

  // ----------------------------------------------------------------
  // Scope helpers
  // ----------------------------------------------------------------
  pushScope() { this.scopes.push(new Map()); }
  popScope()  { this.scopes.pop(); }
  define(name, info) { this.scopes[this.scopes.length - 1].set(name, info); }
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }

  // ----------------------------------------------------------------
  // Output helpers
  // ----------------------------------------------------------------
  ind(n = 1) { return ' '.repeat(this.indent * n); }

  emit() {
    const parts = [...this.includes].sort();
    parts.push('');
    parts.push(...this.lambdaLines);
    parts.push(...this.topLevel);
    // Ensure blank line between topLevel and main
    if (this.topLevel.length > 0 && this.topLevel[this.topLevel.length - 1] !== '') {
      parts.push('');
    }
    if (this.mainStmts.length > 0 || true) {
      parts.push('int main(void) {');
      parts.push(`${this.ind()}TSC_INIT();`);
      parts.push(...this.mainStmts.map(s => this.ind() + s));
      parts.push(`${this.ind()}return 0;`);
      parts.push('}');
    }
    return parts.join('\n');
  }

  addTop(line) { this.topLevel.push(line); }
  addLambda(line) { this.lambdaLines.push(line); }
  addMain(line) {
    if (this.inFunction) {
      this._currentFuncLines.push(this.ind(this._funcDepth) + line);
    } else {
      this.mainStmts.push(line);
    }
  }

  // ----------------------------------------------------------------
  // Program
  // ----------------------------------------------------------------
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  // Get struct-like field definitions for a named type (interface or struct alias)
  getStructFields(typeName) {
    const cls = this.classes.get(typeName);
    if (cls?.isStruct && cls.fields) return cls.fields;
    const iface = this.interfaces.get(typeName);
    if (iface) return iface.filter(m => m.kind === 'PropSig');
    return null;
  }

  // Flatten nested TypeUnion into array of leaf types
  flattenUnion(typeAnn) {
    if (typeAnn.kind === 'TypeUnion') return typeAnn.types.flatMap(t => this.flattenUnion(t));
    return [typeAnn];
  }

  // Check if a type annotation is a pure string literal union (handles nested TypeUnions)
  isStringLiteralUnion(typeAnn) {
    if (!typeAnn) return false;
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return true;
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.every(t => this.isStringLiteralUnion(t));
    }
    return false;
  }

  // Extract string literal values from a string literal union type (handles nested TypeUnions)
  getStringLiteralMembers(typeAnn) {
    if (!typeAnn) return [];
    if (typeAnn.kind === 'TypeLiteral' && typeAnn.litKind === 'string') return [typeAnn.value];
    if (typeAnn.kind === 'TypeUnion') {
      return typeAnn.types.flatMap(t => this.getStringLiteralMembers(t));
    }
    return [];
  }

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
  }

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
  }

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
  }

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

  // ----------------------------------------------------------------
  // Block / statements
  // ----------------------------------------------------------------
  visitBlock(block, lines, depth) {
    this.pushScope();
    for (const s of block.body) this.visitStmt(s, lines, depth);
    this.popScope();
  }

  visitStmtInMain(node) {
    const lines = [];
    this.visitStmt(node, lines, 0);
    for (const l of lines) this.mainStmts.push(l);
  }

  visitStmt(node, lines, depth) {
    const I = ' '.repeat(this.indent * depth);  // indentation at current depth
    const p = (s) => lines.push(I + s);          // push with current-depth indent
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': {
        const { varKind, name, typeAnn, init } = node;

        // Object.fromEntries<{a: T, b: U}>(array) → compile-time struct init
        if (init?.kind === 'Call' &&
            init.callee?.kind === 'Member' &&
            init.callee?.object?.name === 'Object' &&
            init.callee?.prop === 'fromEntries' &&
            init.typeArgs?.[0]?.kind === 'TypeObject') {
          const typeArg = init.typeArgs[0];
          const fields = typeArg.fields;
          const fieldNames = fields.map(f => f.name);
          if (!this._fromEntriesCount) this._fromEntriesCount = 0;
          const structName = `_fromEntries_${this._fromEntriesCount++}`;
          const fieldDecls = fields.map(f => `${this.resolveType(f.typeAnn)} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${structName};`);
          this.classes.set(structName, { isStruct: true, fields });
          const arg = init.args[0]?.expr;
          let entriesElems = null;
          let isVar = false;
          if (arg?.kind === 'ArrayLit') {
            entriesElems = arg.elems;
          } else if (arg?.kind === 'Ident') {
            const consumed = this._fromEntriesConsumed?.get(arg.name);
            if (consumed) {
              // Emit entries typedefs now (after fromEntries struct, to match expected order)
              const et = this.resolveType(consumed.typeAnn.element);
              this.resolveType(consumed.typeAnn); // emits Array_tuple
              entriesElems = consumed.init?.kind === 'ArrayLit' ? consumed.init.elems : null;
            } else {
              const sym = this.lookup(arg.name);
              if (sym?.initNode?.kind === 'ArrayLit') entriesElems = sym.initNode.elems;
            }
            isVar = true;
          }
          const initParts = [];
          for (const elem of (entriesElems ?? [])) {
            const pair = elem.expr;
            if (pair?.kind !== 'ArrayLit' || pair.elems?.length < 2) continue;
            const keyNode = pair.elems[0]?.expr;
            const valNode = pair.elems[1]?.expr;
            if (keyNode?.kind !== 'Literal' || keyNode.litType !== 'string') continue;
            const key = keyNode.value;
            if (!fieldNames.includes(key)) throw new Error(`Object.fromEntries: key "${key}" is not a field of the target type`);
            initParts.push(`.${key} = ${this.exprToC(valNode, lines, depth)}`);
          }
          if (isVar) {
            p(`${structName} ${name} = {0};`);
            p(`${name} = (${structName}){${initParts.join(', ')}};`);
          } else {
            p(`${structName} ${name} = {${initParts.join(', ')}};`);
          }
          this.define(name, { ctype: structName, varKind });
          break;
        }

        // If consumed by fromEntries (Ident arg), defer all processing — no C emit, no typedefs yet
        if (this._fromEntriesConsumed?.has(name) && typeAnn?.kind === 'TypeArray') {
          this._fromEntriesConsumed.set(name, { typeAnn, init });
          this.define(name, { ctype: 'void', isArray: true, varKind, initNode: init });
          break;
        }

        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'never') {
          throw new Error(`"never" cannot be used as a variable type`);
        }
        if (typeAnn?.kind === 'TypeRef' && typeAnn.name === 'void') {
          throw new Error(`"void" can only be used as a return type`);
        }
        let ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'double');
        // Untyped number literals: integer → int32_t, float/decimal → double
        if (!typeAnn && init && init.kind === 'Literal' && init.litType === 'number') {
          const v = init.value;
          ctype = (v.includes('.') || v.includes('e') || v.includes('E')) ? 'double' : 'int32_t';
        }
        // ObjLit with named fields and no type annotation → anonymous struct
        if (!typeAnn && init?.kind === 'ObjLit' && init.props?.length > 0 && init.props.every(p => !p.spread && !p.computed)) {
          if (!this._anonStructCount) this._anonStructCount = 0;
          const anonName = `_anon_${this._anonStructCount++}`;
          const fields = init.props.map(p => {
            const ft = this.inferType(p.value);
            return { name: p.key, typeAnn: { kind: 'TypeRef', name: ft, typeArgs: [] }, _ctype: ft };
          });
          const fieldDecls = fields.map(f => `${f._ctype} ${f.name};`).join(' ');
          this.addTop(`typedef struct { ${fieldDecls} } ${anonName};`);
          this.classes.set(anonName, { isStruct: true, fields });
          ctype = anonName;
        }
        // Regular (non-const) enums, opt types, and structs don't use const qualifier in C
        const enumDef2 = this.classes.get(ctype);
        const isGenericClassInst = !enumDef2 && this._genericClasses &&
          [...this._genericClasses.keys()].some(n => ctype.startsWith(n + '_'));
        const suppressConst = (enumDef2?.isEnum && !enumDef2?.isConst && !enumDef2?.isStringLiteralUnion) || enumDef2?.isKeyOf || enumDef2?.isMutable || ctype.startsWith('opt_') || ctype.startsWith('_anon_') || (enumDef2 && !enumDef2.isEnum && !enumDef2.isStruct && !enumDef2.isScalarAlias && !enumDef2.isTuple) || isGenericClassInst;
        const qualifier = (varKind === 'const' && !suppressConst) ? 'const ' : '';

        // Optional type (opt_T): handle null/value init
        if (ctype.startsWith('opt_') && init) {
          const isNullInit = init.kind === 'Literal' && init.litType === 'null';
          if (isNullInit) {
            p(`${qualifier}${ctype} ${name} = {false, 0};`);
          } else {
            const valC = this.exprToC(init, lines, depth);
            // If init already evaluates to opt_T (e.g., from x?.toString()), assign directly
            const initType = this.inferType(init);
            if (initType === ctype) {
              p(`${qualifier}${ctype} ${name} = ${valC};`);
            } else {
              p(`${qualifier}${ctype} ${name} = {true, ${valC}};`);
            }
          }
          // Non-negative at() index: mark as potentially OOB (null check when printing)
          // Must be read AFTER exprToC(init) which sets _lastAtNonNeg
          const atNonNeg = this._lastAtNonNeg ?? false;
          this._lastAtNonNeg = undefined;
          this.define(name, { ctype, varKind, optIsNull: isNullInit || atNonNeg });
          break;
        }

        // String literal union: handle string literal init → enum value
        if (enumDef2?.isStringLiteralUnion && init?.kind === 'Literal' && init.litType === 'string') {
          const val = init.value;
          if (!enumDef2.members.includes(val)) {
            throw new Error(`"${val}" is not a valid value for type ${ctype}`);
          }
          p(`${qualifier}${ctype} ${name} = ${ctype}_${val};`);
          this.define(name, { ctype, varKind });
          break;
        }

        // TypeArray of primitive with ArrayLit init → plain C array (no const — C arrays can't be reassigned anyway)
        if (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind !== 'TypeFunc' && init) {
          const et = this.resolveType(typeAnn.element);
          if (init.kind === 'ArrayLit') {
            const elems = this.arrayLitToC(init, et, lines, depth);
            p(`${et} ${name}[] = {${elems.join(', ')}};`);
          } else {
            const initC = this.exprToC(init, lines, depth);
            p(`${et} ${name}[] = ${initC};`);
          }
          this.define(name, { ctype: et, isArray: true, arraySize: init.kind === 'ArrayLit' ? this.arrayLitSize(init) : -1, varKind, initNode: init });
          break;
        }

        // Tuple init: let pair: [i32, string] = [1, "hello"] → struct init
        {
          const tupleDef1 = this.classes.get(ctype);
          if (tupleDef1?.isTuple && init?.kind === 'ArrayLit') {
            const initParts = [];
            let fieldIdx = 0;
            for (const el of init.elems) {
              if (el.spread) {
                // spread: [...p] → copy all fields
                const spreadSrc = this.exprToC(el.expr, lines, depth);
                const srcType = this.inferType(el.expr);
                const srcDef = this.classes.get(srcType);
                const tupleHasRest = tupleDef1.fields.some(f => f.rest);
                if (!srcDef?.isTuple && !tupleHasRest) {
                  throw new Error('cannot spread runtime array into fixed-size tuple');
                }
                if (srcDef?.isTuple) {
                  for (const f of srcDef.fields) {
                    initParts.push(`.${tupleDef1.fields[fieldIdx].name} = ${spreadSrc}.${f.name}`);
                    fieldIdx++;
                  }
                }
                continue;
              }
              const field = tupleDef1.fields[fieldIdx++];
              if (!field) continue;
              // Rest field: collect remaining elems into a temp array
              if (field.rest) {
                const tailElems = [el, ...init.elems.slice(init.elems.indexOf(el) + 1)];
                const tailVar = `_tail_${this.tempCount++}`;
                const tailVals = tailElems.map(e => this.exprToC(e.expr, lines, depth)).join(', ');
                lines.push(`${field.elemType} ${tailVar}[] = {${tailVals}};`);
                initParts.push(`.${field.name} = ${tailVar}`);
                // Skip tail_len field — add length directly
                fieldIdx++; // skip _tail_len field
                initParts.push(`._tail_len = ${tailElems.length}`);
                break; // rest consumes all remaining elements
              }
              const valC = this.exprToC(el.expr, lines, depth);
              // Optional field: wrap non-opt value in {true, val}
              if (field.ctype.startsWith('opt_')) {
                const valType = this.inferType(el.expr);
                const initVal = (valType === field.ctype) ? valC : `{true, ${valC}}`;
                initParts.push(`.${field.name} = ${initVal}`);
              } else {
                initParts.push(`.${field.name} = ${valC}`);
              }
            }
            // Fill remaining optional fields with {false, 0}
            while (fieldIdx < tupleDef1.fields.length) {
              const field = tupleDef1.fields[fieldIdx++];
              if (field.ctype.startsWith('opt_')) initParts.push(`.${field.name} = {false, 0}`);
            }
            p(`${qualifier}${ctype} ${name} = {${initParts.join(', ')}};`);
            // Track which optional fields were not provided (null)
            const nullOptFields = new Set();
            for (let i = init.elems.length; i < tupleDef1.fields.length; i++) {
              const f = tupleDef1.fields[i];
              if (f.ctype.startsWith('opt_')) nullOptFields.add(f.name);
            }
            this.define(name, { ctype, varKind, nullOptFields: nullOptFields.size > 0 ? nullOptFields : null });
            break;
          }
        }

        // TypeFunc (or TypeArray of TypeFunc): function pointer declaration
        if (typeAnn?.kind === 'TypeFunc' || (typeAnn?.kind === 'TypeArray' && typeAnn.element?.kind === 'TypeFunc')) {
          let initC;
          if (init?.kind === 'ArrayLit') {
            // {square_i32, ...} — resolve each element as function ref
            const elems = init.elems.map(e => {
              if (e.expr?.kind === 'Ident') {
                const s = this.lookup(e.expr.name);
                return s?.funcName ?? e.expr.name;
              }
              return this.exprToC(e.expr, lines, depth);
            });
            initC = `{${elems.join(', ')}}`;
          } else {
            initC = init ? this.exprToC(init, lines, depth) : '0';
          }
          p(`${this.typeDecl(typeAnn, name)} = ${initC};`);
          this.define(name, { ctype: 'void *', funcPtr: true, varKind });
          break;
        }

        if (init) {
          // Special: arrow function → capture as function pointer
          if (init.kind === 'Arrow') {
            const lambdaName = this.hoistArrow(init, ctype, name);
            // Function pointers don't use const qualifier on the return type
            p(`${ctype} (*${name})(${this.arrowParamTypes(init)}) = ${lambdaName};`);
          } else if (!typeAnn && init.kind === 'Ident') {
            // Possibly a function reference — check symbol table
            const sym = this.lookup(init.name);
            if (sym?.funcName && sym?.params) {
              const pts = sym.params.filter(pp => !pp.rest).map(pp => pp.typeAnn ? this.resolveType(pp.typeAnn) : 'void *');
              p(`${sym.ctype} (*${name})(${pts.join(', ') || 'void'}) = ${sym.funcName};`);
              this.define(name, { ctype: sym.ctype, funcPtr: true, varKind, funcName: sym.funcName });
              break;
            }
            p(`${this.varDecl(qualifier, ctype, name)} = ${this.exprToC(init, lines, depth)};`);
          } else if (init.kind === 'ObjLit' && enumDef2?.isPartial) {
            // Partial<T> ObjLit: expand { name: "Alice" } → { .has_name = true, .name = ..., .has_age = false }
            const provided = new Map();
            for (const prop of init.props) {
              if (!prop.spread && !prop.computed) {
                provided.set(prop.key, this.exprToC(prop.value, lines, depth));
              }
            }
            const initParts = [];
            for (const f of enumDef2.fields ?? []) {
              const fname = typeof f === 'string' ? f : f.name;
              if (provided.has(fname)) {
                initParts.push(`.has_${fname} = true`);
                initParts.push(`.${fname} = ${provided.get(fname)}`);
              } else {
                initParts.push(`.has_${fname} = false`);
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = {${initParts.join(', ')}};`);
          } else {
            // Check if init is a Call whose callee returns a TypeFunc
            let callSym = null;
            if (init.kind === 'Call' && init.callee.kind === 'Ident') {
              callSym = this.lookup(init.callee.name);
            }
            if (!typeAnn && callSym?.returnType?.kind === 'TypeFunc') {
              const initC = this.exprToC(init, lines, depth);
              p(`${this.typeDecl(callSym.returnType, name)} = ${initC};`);
              this.define(name, { ctype: 'void *', funcPtr: true, varKind });
              break;
            }
            let initC;
            if (init.kind === 'Literal' && init.litType === 'number') {
              initC = this.literalToCTyped(init, ctype);
            } else {
              // For binary expressions with mixed integer types in const context:
              // cast operands and result explicitly to preserve well-defined semantics
              let mixedBinary = null;
              if (typeAnn && init.kind === 'Binary') {
                mixedBinary = this.tryConstMixedBinary(init, ctype, lines, depth);
              }
              if (mixedBinary !== null) {
                initC = mixedBinary;
              } else if (ctype === 'int64_t' && init.kind === 'Binary') {
                // For binary expressions assigned to int64_t with u32 operands,
                // widen operands individually to avoid overflow before cast
                initC = this.binaryWidened(init, ctype, lines, depth);
              } else {
                // Evaluate init first — this may throw (e.g. mixed let int types in binary)
                initC = this.exprToC(init, lines, depth);
              }
              // Implicit type conversion checks for typed assignments (skip if already handled by mixedBinary)
              if (typeAnn && mixedBinary === null) {
                const srcType = this.inferType(init);
                // Cannot implicitly convert string literal union to string
                if (ctype === 'String') {
                  const srcEnumDef = this.classes.get(srcType);
                  if (srcEnumDef?.isStringLiteralUnion) {
                    throw new Error(`cannot implicitly convert ${srcType} to string: use ".toString()" or "as string"`);
                  }
                }
                const illegalConversions = [
                  ['size_t',    'int32_t',  'usize', 'i32'],
                  ['int32_t',   'float',    'i32',   'f32'],
                  ['int64_t',   'double',   'i64',   'f64'],
                  ['int64_t',   'uint32_t', 'i64',   'u32'],
                  ['uint64_t',  'int64_t',  'u64',   'i64'],
                ];
                for (const [src, dst, srcTs, dstTs] of illegalConversions) {
                  if (srcType === src && ctype === dst) {
                    throw new Error(`cannot implicitly convert ${srcTs} to ${dstTs}: use "as ${dstTs}"`);
                  }
                }
                // Widening casts for non-binary expressions
                if (ctype === 'int64_t' && srcType === 'size_t') {
                  initC = `(int64_t)${initC}`;
                }
              }
            }
            // Cross-struct assignment: const b: Pt2 = a (where a is a different struct type)
            if (init.kind === 'Ident') {
              const initSym = this.lookup(init.name);
              const srcDef = initSym ? this.classes.get(initSym.ctype) : null;
              const dstDef = this.classes.get(ctype);
              if (srcDef?.isStruct && dstDef?.isStruct && initSym.ctype !== ctype) {
                const qualCast = qualifier === 'const ' ? 'const ' : '';
                initC = `*(${qualCast}${ctype} *)&${initC}`;
              }
            }
            p(`${this.varDecl(qualifier, ctype, name)} = ${initC};`);
          }
        } else {
          // No initializer: declare without init
          p(`${this.varDecl(qualifier, ctype, name)};`);
        }
        // Store compile-time value for const variables with literal init (used for const-cast overflow checking)
        let constValue = undefined;
        if (varKind === 'const' && init?.kind === 'Literal' && init.litType === 'number') {
          try { constValue = BigInt(init.value.replace(/_/g, '')); } catch(_) {}
        }
        this.define(name, { ctype, varKind, constValue, initNode: init });
        break;
      }

      case 'VarDestructObj': {
        const { varKind, pattern, init } = node;
        const initC = this.exprToC(init, lines, depth);
        const tmpName = `_obj_${this.tempCount++}`;
        const objType = this.inferType(init);
        p(`${objType} ${tmpName} = ${initC};`);
        for (const { name, alias, defaultVal } of pattern) {
          const qual = varKind === 'const' ? 'const ' : '';
          if (defaultVal) {
            const dC = this.exprToC(defaultVal, lines, depth);
            p(`${qual}int32_t ${alias} = (${tmpName}.${name} != 0) ? ${tmpName}.${name} : ${dC};`);
          } else {
            p(`${qual}int32_t ${alias} = ${tmpName}.${name};`);
          }
          this.define(alias, { ctype: 'int32_t', varKind });
        }
        break;
      }

      case 'VarDestructArr': {
        const { varKind, pattern, init } = node;
        const initType = this.inferType(init);
        const tupleDef0 = this.classes.get(initType);
        const qual = varKind === 'const' ? 'const ' : '';
        if (tupleDef0?.isTuple) {
          // Tuple destructuring: const [a, b] = pair → typed field access
          const initC = this.exprToC(init, lines, depth);
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            const field = tupleDef0.fields[i];
            const ctype = field ? field.ctype.replace(' *', '') : 'int32_t'; // strip pointer for rest
            p(`${qual}${ctype} ${elem.name} = ${initC}._${i};`);
            this.define(elem.name, { ctype, varKind });
          }
        } else {
          const initC = this.exprToC(init, lines, depth);
          const tmpName = `_arr_${this.tempCount++}`;
          p(`__auto_type ${tmpName} = ${initC};`);
          for (let i = 0; i < pattern.length; i++) {
            const elem = pattern[i];
            if (!elem) continue;
            if (elem.rest) {
              p(`/* rest: ${elem.name} */`);
            } else {
              p(`${qual}int32_t ${elem.name} = ${tmpName}._${i};`);
              this.define(elem.name, { ctype: 'int32_t', varKind });
            }
          }
        }
        break;
      }

      case 'ExprStmt': {
        const c = this.exprToC(node.expr, lines, depth);
        if (c && c !== '') {
          // Block-form assignments (&&=, ||=, ??=) already include semicolons
          if ((c.startsWith('{') && c.endsWith('}')) || c.startsWith('if (')) p(c);
          else p(`${c};`);
        }
        break;
      }

      case 'Return': {
        if (node.value) {
          const c = this.exprToC(node.value, lines, depth);
          p(`return ${c};`);
        } else {
          p('return;');
        }
        break;
      }

      case 'If': {
        // Detect narrowing: if (x != null) → narrow x to x.value inside block
        const isNullLit = (n) => (n.kind === 'Literal' && n.litType === 'null') || (n.kind === 'Ident' && n.name === 'null');
        let narrowVar = null;
        if (node.test.kind === 'Binary' && (node.test.op === '!=' || node.test.op === '!==')) {
          const nullSide = isNullLit(node.test.right) ? 'right' : isNullLit(node.test.left) ? 'left' : null;
          if (nullSide) {
            const optSide = nullSide === 'right' ? node.test.left : node.test.right;
            if (optSide.kind === 'Ident') {
              const sym = this.lookup(optSide.name);
              if (sym?.ctype?.startsWith('opt_')) narrowVar = optSide.name;
            }
          }
        }
        const testC = this.exprToC(node.test, lines, depth);
        const alt = node.alternate;
        // Single statement consequent (no braces)?
        const hasBraces = node.consequent.kind === 'Block';
        if (narrowVar) {
          if (!this._narrowedVars) this._narrowedVars = new Set();
          this._narrowedVars.add(narrowVar);
        }
        if (hasBraces) {
          p(`if (${testC}) {`);
          this.visitBlock(node.consequent, lines, depth + 1);
        } else if (node.consequent.kind === 'ExprStmt') {
          // Inline: if (cond) expr;
          const exprC = this.exprToC(node.consequent.expr, lines, depth);
          p(`if (${testC}) ${exprC};`);
        } else {
          p(`if (${testC}) {`);
          this.visitStmt(node.consequent, lines, depth + 1);
          p('}');
        }
        if (alt) {
          // else if: collapse into single line
          if (alt.kind === 'If') {
            p('} else if (' + this.exprToC(alt.test, lines, depth) + ') {');
            this.visitStmtOrBlock(alt.consequent, lines, depth + 1);
            // recurse for chained else-if
            let cur = alt.alternate;
            while (cur) {
              if (cur.kind === 'If') {
                p('} else if (' + this.exprToC(cur.test, lines, depth) + ') {');
                this.visitStmtOrBlock(cur.consequent, lines, depth + 1);
                cur = cur.alternate;
              } else {
                p('} else {');
                this.visitStmtOrBlock(cur, lines, depth + 1);
                cur = null;
              }
            }
            p('}');
          } else {
            if (hasBraces) p('} else {');
            else p('} else {');  // wrap single stmt else in braces too
            this.visitStmtOrBlock(alt, lines, depth + 1);
            p('}');
          }
        } else if (hasBraces) {
          p('}');
        }
        if (narrowVar) this._narrowedVars.delete(narrowVar);
        break;
      }

      case 'Block': {
        p('{');
        this.visitBlock(node, lines, depth + 1);
        p('}');
        break;
      }

      case 'For': {
        let initC = '';
        if (node.init) {
          if (node.init.kind === 'VarDecl') {
            const { varKind, name, typeAnn, init } = node.init;
            const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
            const initExpr = init ? this.exprToC(init, lines, depth) : '0';
            initC = `${ctype} ${name} = ${initExpr}`;
            this.define(name, { ctype, varKind });
          } else if (node.init.kind === 'ExprStmt') {
            initC = this.exprToC(node.init.expr, lines, depth);
          }
        }
        const testC = node.test ? this.exprToC(node.test, lines, depth) : '';
        const updC  = node.update ? this.exprToC(node.update, lines, depth) : '';
        p(`for (${initC}; ${testC}; ${updC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'ForOf': {
        const iterC = this.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${this.tempCount++}`;
        let elemType = 'int32_t';
        if (node.binding.kind === 'Ident') {
          if (node.binding.typeAnn) elemType = this.resolveType(node.binding.typeAnn);
        }
        const qual = node.varKind === 'const' ? 'const ' : '';
        const bindName = node.binding.kind === 'Ident' ? node.binding.name : null;
        const II = ' '.repeat(this.indent * (depth + 1));

        p(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          lines.push(`${II}${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
          this.define(bindName, { ctype: elemType, varKind: node.varKind });
        } else if (node.binding.kind === 'ArrayPattern') {
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`${II}${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'ForIn': {
        p(`/* for-in not supported */`);
        break;
      }

      case 'While': {
        const testC = this.exprToC(node.test, lines, depth);
        p(`while (${testC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'DoWhile': {
        const testC = this.exprToC(node.test, lines, depth);
        p('do {');
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        p(`} while (${testC});`);
        break;
      }

      case 'Break':
        if (node.label) p(`goto ${node.label}_break;`);
        else p('break;');
        break;
      case 'Continue':
        if (node.label) p(`goto ${node.label}_continue;`);
        else p('continue;');
        break;

      case 'Labeled': {
        const label = node.label;
        const inner = node.body;
        const usesBreak    = this.labelUsed(inner, label, 'break');
        const usesContinue = this.labelUsed(inner, label, 'continue');
        if (inner.kind === 'While' || inner.kind === 'For') {
          let headerLine;
          if (inner.kind === 'While') {
            const testC = this.exprToC(inner.test, lines, depth);
            headerLine = `while (${testC}) {`;
          } else {
            let initC = '';
            if (inner.init?.kind === 'VarDecl') {
              const { varKind, name, typeAnn, init } = inner.init;
              const ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
              const initExpr = init ? this.exprToC(init, lines, depth) : '0';
              initC = `${ctype} ${name} = ${initExpr}`;
              this.define(name, { ctype, varKind });
            }
            const testC = inner.test ? this.exprToC(inner.test, lines, depth) : '';
            const updC  = inner.update ? this.exprToC(inner.update, lines, depth) : '';
            headerLine = `for (${initC}; ${testC}; ${updC}) {`;
          }
          p(headerLine);
          const bodyLines = [];
          this.visitStmtOrBlock(inner.body, bodyLines, depth + 1);
          for (const bl of bodyLines) lines.push(bl);
          if (usesContinue) {
            const II = ' '.repeat(this.indent * (depth + 1));
            lines.push(`${II}${label}_continue:;`);
          }
          p('}');
          if (usesBreak) p(`${label}_break:;`);
        } else {
          this.visitStmt(inner, lines, depth);
        }
        break;
      }

      case 'Throw': {
        // throw new Error(msg) → tsc_throw(msg)
        const val = node.value;
        if (val?.kind === 'New' && val.name === 'Error' && val.args?.length === 1) {
          const msgC = this.exprToC(val.args[0].expr ?? val.args[0], lines, depth);
          p(`tsc_throw(${msgC});`);
        } else {
          const errC = this.exprToC(val, lines, depth);
          p(`tsc_throw(${errC});`);
        }
        break;
      }

      case 'TryCatch': {
        this.visitBlock(node.body, lines, depth);
        for (const c of node.catches) {
          p(`/* catch (${c.param}: ${c.typeAnn ? this.resolveType(c.typeAnn) : 'any'}) */`);
          this.visitBlock(c.body, lines, depth);
        }
        if (node.finally) {
          p('/* finally */');
          this.visitBlock(node.finally, lines, depth);
        }
        break;
      }

      case 'Switch': {
        const discType = this.inferType(node.discriminant);
        if (discType === 'double' || discType === 'float') {
          const loc = node.line ? `\n${this.filename}.tsc:${node.line}:` : '';
          throw new Error(`cannot switch on type 'f64'${loc}`);
        }
        for (let ci = 0; ci < node.cases.length; ci++) {
          const c = node.cases[ci];
          if (c.body.length === 0) continue;
          const last = c.body[c.body.length - 1];
          const isTerminator = last.kind === 'Break' || last.kind === 'Return' ||
                               last.kind === 'Throw' || last.kind === 'Continue';
          if (!isTerminator && ci < node.cases.length - 1) {
            const lastLine = last.line ?? c.line;
            const loc = lastLine ? `\n${this.filename}.tsc:${lastLine}:` : '';
            throw new Error(`implicit fallthrough${loc}`);
          }
        }
        const discC = this.exprToC(node.discriminant, lines, depth);
        const IS = ' '.repeat(this.indent * (depth + 1));
        p(`switch (${discC}) {`);
        // Check if discriminant is a string literal union type
        const discEnumDef = this.classes.get(discType);
        for (const c of node.cases) {
          if (c.test) {
            let caseC;
            if (discEnumDef?.isStringLiteralUnion && c.test.kind === 'Literal' && c.test.litType === 'string') {
              caseC = `${discType}_${c.test.value}`;
            } else {
              caseC = this.exprToC(c.test, lines, depth);
            }
            lines.push(`${IS}case ${caseC}:`);
          } else {
            lines.push(`${IS}default:`);
          }
          for (const s of c.body) this.visitStmt(s, lines, depth + 2);
        }
        p('}');
        break;
      }

      case 'Native': {
        p(node.content);
        break;
      }

      case 'Unsafe': {
        p('{');
        this.visitBlock(node.body, lines, depth + 1);
        p('}');
        break;
      }

      case 'Spawn': {
        p('/* spawn block — not yet implemented */');
        break;
      }

      case 'Noop': break;
      default:
        p(`/* unhandled stmt: ${node.kind} */`);
    }
  }

  visitStmtOrBlock(node, lines, depth) {
    if (node.kind === 'Block') this.visitBlock(node, lines, depth);
    else this.visitStmt(node, lines, depth);
  }

  // ----------------------------------------------------------------
  // Expressions → C string
  // ----------------------------------------------------------------
  exprToC(node, lines = [], depth = 0) {
    if (!node) return '0';
    switch (node.kind) {
      case 'Literal': return this.literalToC(node);

      case 'Ident': {
        if (node.name === 'keyof') throw new Error(`"keyof" can only be used in type position`);
        const kw = {
          'true': 'true', 'false': 'false', 'null': 'NULL',
          'undefined': 'NULL', 'this': 'self',
        };
        if (kw[node.name] !== undefined) return kw[node.name];
        // Narrowed optional variable: x → x.value inside if(x != null) block
        if (this._narrowedVars?.has(node.name)) {
          const sym2 = this.lookup(node.name);
          if (sym2?.ctype?.startsWith('opt_')) return `${node.name}.value`;
        }
        // Function reference (not a func-ptr variable): use mangled name
        const sym = this.lookup(node.name);
        if (sym?.funcName && !sym.funcPtr) return sym.funcName;
        return node.name;
      }

      case 'Binary': return this.binaryToC(node, lines, depth);
      case 'Unary':  return this.unaryToC(node, lines, depth);
      case 'Assign': return this.assignToC(node, lines, depth);
      case 'Ternary': {
        const c = this.exprToC(node.cond, lines, depth);
        const yRaw = this.exprToC(node.yes, lines, depth);
        const n = this.exprToC(node.no, lines, depth);
        // Wrap nested ternary in yes-branch to avoid ambiguity
        const y = node.yes.kind === 'Ternary' ? `(${yRaw})` : yRaw;
        return `(${c}) ? ${y} : ${n}`;
      }

      case 'Member': {
        const sym = node.object.kind === 'Ident' ? this.lookup(node.object.name) : null;
        // Rest param: .length → args_count
        if (sym?.rest && node.prop === 'length') {
          return sym.countVar ?? `${node.object.name}_count`;
        }
        // Enum member access: Direction.North → Direction_North
        if (node.object.kind === 'Ident') {
          const enumDef = this.classes.get(node.object.name);
          if (enumDef?.isEnum) return `${node.object.name}_${node.prop}`;
          // Labeled tuple field access: p.x → p._0 (look up via symbol type)
          const symForLabel = this.lookup(node.object.name);
          const tupleDef3 = symForLabel ? this.classes.get(symForLabel.ctype) : null;
          if (tupleDef3?.isTuple) {
            const field = tupleDef3.fields.find(f => f.label === node.prop);
            if (field) {
              const objC = this.exprToC(node.object, lines, depth);
              return `${objC}.${field.name}`;
            }
          }
        }
        const objC = this.exprToC(node.object, lines, depth);
        const isPtr = sym?.isPointer;
        return isPtr ? `${objC}->${node.prop}` : `${objC}.${node.prop}`;
      }

      case 'Index': {
        // Tuple index access: pair[0] → pair._0
        const objType = this.inferType(node.object);
        const tupleDef = this.classes.get(objType);
        if (tupleDef?.isTuple && node.index.kind === 'Literal' && node.index.litType === 'number') {
          const objC = this.exprToC(node.object, lines, depth);
          return `${objC}._${node.index.value}`;
        }
        const obj = this.exprToC(node.object, lines, depth);
        const idx = this.exprToC(node.index, lines, depth);
        return `${obj}[${idx}]`;
      }

      case 'Call': {
        return this.callToC(node, lines, depth);
      }

      case 'New': {
        return this.newToC(node, lines, depth);
      }

      case 'ArrayLit': {
        // Determine element type from first element
        const elems = node.elems.filter(e => !e.spread);
        const elemType = elems.length ? this.inferType(elems[0].expr) : 'int32_t';
        const arrType = `Array_${this.cTypeToIdent(elemType)}`;
        const dataVar = `_arr_data_${this.tempCount++}`;
        const items = elems.map(e => this.exprToC(e.expr, lines, depth)).join(', ');
        lines.push(`${elemType} ${dataVar}[] = {${items}};`);
        return `(${arrType}){.data = ${dataVar}, .length = ${elems.length}, .capacity = ${elems.length}}`;
      }

      case 'ObjLit': {
        const props = node.props.map(p => {
          if (p.spread) return `/* ...${this.exprToC(p.expr, lines, depth)} */`;
          if (p.computed) return `/* computed key */`;
          return `.${p.key} = ${this.exprToC(p.value, lines, depth)}`;
        });
        return `{${props.join(', ')}}`;
      }

      case 'Arrow': {
        // Hoisted lambda
        const lambdaName = this.hoistArrow(node, 'void', '_lambda');
        return lambdaName;
      }

      case 'Cast': {
        const ownershipTypes = ['Ref', 'Mut', 'Shared', 'Weak', 'Box', 'Arc', 'Rc'];
        if (node.castType.kind === 'TypeRef' && ownershipTypes.includes(node.castType.name)) {
          throw new Error(`cannot use "as" for ownership types`);
        }
        // String literal union → string: use values array
        if (node.castType.kind === 'TypeRef' && node.castType.name === 'string') {
          const exprType = this.inferType(node.expr);
          const exprEnumDef = this.classes.get(exprType);
          if (exprEnumDef?.isStringLiteralUnion) {
            const exprC = this.exprToC(node.expr, lines, depth);
            return `STR_LIT_RUNTIME(${exprType}_values[(int)${exprC}])`;
          }
        }
        const exprC = this.exprToC(node.expr, lines, depth);
        const ct = this.resolveType(node.castType);
        // Wrap complex expressions in parens to preserve operator precedence
        const needsParens = node.expr.kind === 'Binary' || node.expr.kind === 'Ternary' || node.expr.kind === 'Logical';
        return needsParens ? `(${ct})(${exprC})` : `(${ct})${exprC}`;
      }

      case 'Typeof': {
        const exprC = this.exprToC(node.expr, lines, depth);
        // Return the type string as known at compile time
        const sym = node.expr.kind === 'Ident' ? this.lookup(node.expr.name) : null;
        const ctype = sym?.ctype ?? 'int32_t';
        const tsName = this.ctypeToTsName(ctype);
        return `STR_LIT("${tsName}")`;
      }

      case 'Await':    return this.exprToC(node.expr, lines, depth);
      case 'Yield':    return node.value ? this.exprToC(node.value, lines, depth) : '0';
      case 'Drop':     return `/* drop(${this.exprToC(node.expr, lines, depth)}) */`;
      case 'NonNull':  return this.exprToC(node.expr, lines, depth);
      case 'Propagate': return this.exprToC(node.expr, lines, depth);
      case 'OptChain': {
        const obj = this.exprToC(node.object, lines, depth);
        return `${obj}.${node.prop}`;
      }

      default:
        return `/* expr:${node.kind} */`;
    }
  }

  // ----------------------------------------------------------------
  // Literals
  // ----------------------------------------------------------------
  literalToC(node) {
    if (node.litType === 'string') return `STR_LIT("${node.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
    if (node.litType === 'bool')   return node.value;
    if (node.litType === 'null')   return 'NULL';
    const v = node.value;
    // Convert 0o (octal) → C octal 0NNN format
    if (v.startsWith('0o') || v.startsWith('0O')) return '0' + v.slice(2);
    // Binary and hex pass through (gcc supports 0b prefix)
    return v;
  }

  // Emit a number literal with the correct suffix for the given target C type
  literalToCTyped(node, ctype) {
    let v = node.value;
    // Convert 0o (octal) → C octal 0NNN format
    if (v.startsWith('0o') || v.startsWith('0O')) v = '0' + v.slice(2);
    if (ctype === 'float') {
      // f32: add 'f' suffix if no decimal, or if decimal without suffix
      if (v.startsWith('0x') || v.startsWith('0X')) return `(float)${v}`;
      const base = v.endsWith('f') ? v : v + (v.includes('.') ? 'f' : '.0f');
      return base;
    }
    if (ctype === 'double') {
      if (v.includes('.') || v.includes('e') || v.includes('E')) return v;
      return v + '.0';
    }
    if (ctype === 'int64_t') return v + 'LL';
    if (ctype === 'uint64_t') {
      const n = BigInt(v);
      if (n > 4294967295n) return v + 'ULL';
      return v + 'U';
    }
    if (ctype === 'uint32_t' || ctype === 'uint16_t' || ctype === 'uint8_t') return v + 'U';
    if (ctype === 'size_t') return v + 'U';  // usize literals always get U suffix
    return v;
  }

  // ----------------------------------------------------------------
  // Binary
  // ----------------------------------------------------------------
  // Get compile-time constant value of a const-literal variable or literal node (BigInt or null)
  constVal(node) {
    if (node.kind === 'Literal' && node.litType === 'number') {
      try { return BigInt(node.value.replace(/_/g, '')); } catch(_) { return null; }
    }
    if (node.kind === 'Unary' && node.op === '-') {
      const v = this.constVal(node.expr ?? node.operand);
      return v !== null ? -v : null;
    }
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      return sym?.constValue ?? null;
    }
    return null;
  }

  // For const-context mixed integer binary expressions: cast operands and result explicitly.
  // Returns null if not applicable.
  tryConstMixedBinary(node, targetCtype, lines, depth) {
    const lt = this.inferType(node.left);
    const rt = this.inferType(node.right);
    // Only applies to arithmetic ops with const operands (not let variables)
    const arithOps = ['+', '-', '*', '/', '%'];
    if (!arithOps.includes(node.op)) return null;
    const leftIsLet  = node.left.kind  === 'Ident' && this.lookup(node.left.name)?.varKind === 'let';
    const rightIsLet = node.right.kind === 'Ident' && this.lookup(node.right.name)?.varKind === 'let';
    if (leftIsLet || rightIsLet) return null; // let vars handled separately (error or binaryWidened)

    // i64 + u32 or u32 + i64
    if ((lt === 'int64_t' && rt === 'uint32_t') || (lt === 'uint32_t' && rt === 'int64_t')) {
      // Compile-time overflow check if values are known
      const lv = this.constVal(node.left), rv = this.constVal(node.right);
      if (lv !== null && rv !== null) {
        const result = node.op === '+' ? lv + rv : node.op === '-' ? lv - rv :
                       node.op === '*' ? lv * rv : node.op === '/' ? lv / rv : lv % rv;
        const typeMax = { 'uint32_t': 4294967295n, 'uint8_t': 255n, 'uint16_t': 65535n,
                          'int32_t': 2147483647n, 'int64_t': 9223372036854775807n };
        const typeMin = { 'uint32_t': 0n, 'uint8_t': 0n, 'uint16_t': 0n,
                          'int32_t': -2147483648n, 'int64_t': -9223372036854775808n };
        if (targetCtype in typeMax && (result > typeMax[targetCtype] || result < typeMin[targetCtype])) {
          throw new Error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`);
        }
      }
      const [lC, rC] = [this.exprToC(node.left, lines, depth), this.exprToC(node.right, lines, depth)];
      const [lCast, rCast] = lt === 'int64_t' ? [lC, `(int64_t)${rC}`] : [`(int64_t)${lC}`, rC];
      const inner = `(uint32_t)(${lCast} ${node.op} ${rCast})`;
      return targetCtype === 'uint32_t' ? inner : `(${targetCtype})(${inner})`;
    }
    // i32 + u32 or u32 + i32
    if ((lt === 'int32_t' && rt === 'uint32_t') || (lt === 'uint32_t' && rt === 'int32_t')) {
      // Check if the u32 operand fits in i32 range
      const u32Node = lt === 'uint32_t' ? node.left : node.right;
      const u32Val = this.constVal(u32Node);
      if (u32Val !== null && u32Val > 2147483647n) {
        throw new Error(`cannot mix i32 and u32 in const expression: incompatible signed/unsigned ranges`);
      }
      const [lC, rC] = [this.exprToC(node.left, lines, depth), this.exprToC(node.right, lines, depth)];
      const [lCast, rCast] = lt === 'int32_t' ? [lC, `(int32_t)${rC}`] : [`(int32_t)${lC}`, rC];
      const inner = `(int32_t)(${lCast} ${node.op} ${rCast})`;
      return targetCtype === 'int32_t' ? inner : `(${targetCtype})(${inner})`;
    }
    // i64 + u32 → u8/u16: overflow check
    if (targetCtype === 'uint8_t' || targetCtype === 'uint16_t') {
      const typeMax = { 'uint8_t': 255n, 'uint16_t': 65535n };
      const typeMin = { 'uint8_t': 0n, 'uint16_t': 0n };
      const lv = this.constVal(node.left), rv = this.constVal(node.right);
      if (lv !== null && rv !== null) {
        const result = node.op === '+' ? lv + rv : node.op === '-' ? lv - rv :
                       node.op === '*' ? lv * rv : node.op === '/' ? lv / rv : lv % rv;
        if (result > typeMax[targetCtype] || result < typeMin[targetCtype]) {
          throw new Error(`const expression result ${result} overflows ${this.ctypeToTsName(targetCtype)}`);
        }
      }
    }
    return null;
  }

  // Emit a binary expression with operands widened to targetCtype to avoid overflow
  binaryWidened(node, targetCtype, lines, depth) {
    const widenOperand = (operand) => {
      if (operand.kind === 'Literal' && operand.litType === 'number') {
        return this.literalToCTyped(operand, targetCtype);
      }
      const ot = this.inferType(operand);
      const needsCast = (targetCtype === 'int64_t' && (ot === 'uint32_t' || ot === 'size_t' || ot === 'int32_t'));
      const c = this.exprToC(operand, lines, depth);
      return needsCast ? `(${targetCtype})${c}` : c;
    };
    const lC = widenOperand(node.left);
    const rC = widenOperand(node.right);
    return `${lC} ${node.op} ${rC}`;
  }

  binaryToC(node, lines, depth) {
    // Optional type comparisons: opt_T != null → opt.has_value, opt_T == null → !opt.has_value
    if (node.op === '!=' || node.op === '!==' || node.op === '==' || node.op === '===') {
      const isNull = (n) => n.kind === 'Literal' && n.litType === 'null';
      const optSide = isNull(node.right) ? node.left : isNull(node.left) ? node.right : null;
      if (optSide) {
        const optType = this.inferType(optSide);
        if (optType?.startsWith('opt_')) {
          const optC = this.exprToC(optSide, lines, depth);
          return (node.op === '!=' || node.op === '!==') ? `${optC}.has_value` : `!${optC}.has_value`;
        }
      }
    }

    // Nullish coalescing for optional types: opt_T ?? default → opt.has_value ? opt.value : default
    if (node.op === '??') {
      const leftType = this.inferType(node.left);
      if (leftType?.startsWith('opt_')) {
        const lC = this.exprToC(node.left, lines, depth);
        const rC = this.exprToC(node.right, lines, depth);
        // Error: || mixed with ?? requires parens
        if (node.right?.kind === 'Binary' && (node.right.op === '||' || node.right.op === '??')) {
          throw new Error(`"||" and "??" require parentheses when mixed`);
        }
        return `${lC}.has_value ? ${lC}.value : ${rC}`;
      }
    }

    // Error: || and ?? mixed without parens
    if (node.op === '||') {
      if (node.right?.kind === 'Binary' && node.right.op === '??') {
        throw new Error(`"||" and "??" require parentheses when mixed`);
      }
    }

    // ** uses pow() from math.h
    if (node.op === '**') {
      this.includes.add('#include <math.h>');
      const lC = this.exprToC(node.left, lines, depth);
      const rC = this.exprToC(node.right, lines, depth);
      const lLit = node.left.kind === 'Literal' && !node.left.value.includes('.');
      const rLit = node.right.kind === 'Literal' && !node.right.value.includes('.');
      return `pow(${lLit ? lC + '.0' : lC}, ${rLit ? rC + '.0' : rC})`;
    }

    // && / || with non-bool operands: JS operand-return semantics (returns the operand, not 0/1)
    if (node.op === '&&' || node.op === '||') {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      if (lt !== 'bool' && rt !== 'bool') {
        const tmp = `_tsc_lhs_${this.tempCount++}`;
        const lC = this.exprToC(node.left, lines, depth);
        const I = ' '.repeat(this.indent * depth);
        lines.push(`${I}${lt} ${tmp} = ${lC};`);
        const rC = this.exprToC(node.right, lines, depth);
        if (node.op === '&&') return `(${tmp}) ? ${rC} : ${tmp}`;
        else                  return `(${tmp}) ? ${tmp} : ${rC}`;
      }
    }

    // Wrap sub-expressions in parens when needed for precedence
    const needsParens = (child, parentOp, isRight) => {
      if (child.kind !== 'Binary') return child.kind === 'Assign';
      const prec = { '**':13, '*':12, '/':12, '%':12, '+':11, '-':11,
        '<<':10, '>>':10, '>>>':10, '<':9, '>':9, '<=':9, '>=':9,
        '==':8, '!=':8, '===':8, '!==':8,
        '&':7, '^':6, '|':5, '&&':4, '||':3, '??':3 };
      const pp = prec[parentOp] ?? 0;
      const cp = prec[child.op] ?? 0;
      if (cp < pp) return true;
      if (cp === pp && isRight) return true; // left-assoc needs parens on right
      return false;
    };
    // Check for illegal mixed integer types in arithmetic (when operands are let variables)
    const arithOps = ['+', '-', '*', '/', '%'];
    if (arithOps.includes(node.op)) {
      const lt = this.inferType(node.left);
      const rt = this.inferType(node.right);
      const mixedPairs = [['int64_t','uint32_t'],['uint32_t','int64_t'],
                          ['uint64_t','int64_t'],['int64_t','uint64_t']];
      for (const [a, b] of mixedPairs) {
        if (lt === a && rt === b) {
          // Only error if either operand is a let/var variable (not const/literal)
          const leftIsLet  = node.left.kind  === 'Ident' && this.lookup(node.left.name)?.varKind  === 'let';
          const rightIsLet = node.right.kind === 'Ident' && this.lookup(node.right.name)?.varKind === 'let';
          if (leftIsLet || rightIsLet) {
            const [tsA, tsB] = [a,b].map(t => this.ctypeToTsName(t));
            throw new Error(`cannot add ${tsA} and ${tsB}: no implicit widening for let variables, use "as"`);
          }
        }
      }
    }

    const lRaw = this.exprToC(node.left,  lines, depth);
    const rRaw = this.exprToC(node.right, lines, depth);
    const l = needsParens(node.left,  node.op, false) ? `(${lRaw})` : lRaw;
    const r = needsParens(node.right, node.op, true)  ? `(${rRaw})` : rRaw;
    const opMap = {
      '===': '==', '!==': '!=',
      '&&':  '&&', '||': '||', '??': '||',
    };
    const op = opMap[node.op] ?? node.op;

    // >>> (unsigned right shift) → (int32_t)((uint32_t)l >> r)
    if (node.op === '>>>') {
      return `(int32_t)((uint32_t)${l} >> ${r})`;
    }

    // Bitwise ops on integers — if used where double is expected, emit with cast
    const bitwiseOps = ['&', '|', '^', '<<', '>>'];
    if (bitwiseOps.includes(node.op)) {
      return `${l} ${op} ${r}`;
    }

    // String equality: use tsc_string_eq
    if ((node.op === '==' || node.op === '===' || node.op === '!=' || node.op === '!==') &&
        this.isStringExpr(node.left)) {
      const eq = `tsc_string_eq(${l}, ${r})`;
      return (node.op === '!=' || node.op === '!==') ? `!${eq}` : eq;
    }
    // String concat via +
    if (node.op === '+' && this.isStringExpr(node.left)) {
      return `tsc_string_concat(${l}, ${r})`;
    }
    return `${l} ${op} ${r}`;
  }

  isStringExpr(node) {
    if (node.kind === 'Literal' && node.litType === 'string') return true;
    if (node.kind === 'Ident') {
      const sym = this.lookup(node.name);
      return sym?.ctype === 'String';
    }
    return false;
  }

  // ----------------------------------------------------------------
  // Unary
  // ----------------------------------------------------------------
  unaryToC(node, lines, depth) {
    const e = this.exprToC(node.expr, lines, depth);
    switch (node.op) {
      case '!':     return `!${e}`;
      case '-':     return `-${e}`;
      case '~':     return `~${e}`;
      case '++pre': return `++${e}`;
      case '--pre': return `--${e}`;
      case '++post': return `${e}++`;
      case '--post': return `${e}--`;
      default: return `/* ${node.op} */${e}`;
    }
  }

  // ----------------------------------------------------------------
  // Assignment
  // ----------------------------------------------------------------
  assignToC(node, lines, depth) {
    // Check readonly tuple assignment: t[n] = ...
    if (node.left.kind === 'Index' && node.left.object.kind === 'Ident') {
      const sym = this.lookup(node.left.object.name);
      const tupleDef = sym?.ctype ? this.classes.get(sym.ctype) : null;
      if (tupleDef?.readonly) throw new Error('cannot assign to readonly tuple element');
    }
    if (node.left.kind === 'Ident') {
      const sym = this.lookup(node.left.name);
      if (sym && sym.varKind === 'const') {
        const loc = node.line ? `\n${this.filename}.tsc:${node.line}:` : '';
        throw new Error(`cannot assign to 'const' variable '${node.left.name}'${loc}`);
      }
      // String literal union: convert string literal to enum value
      if (sym && node.right?.kind === 'Literal' && node.right.litType === 'string') {
        const enumDef = this.classes.get(sym.ctype);
        if (enumDef?.isStringLiteralUnion) {
          const val = node.right.value;
          if (!enumDef.members.includes(val)) {
            throw new Error(`"${val}" is not a valid value for type ${sym.ctype}`);
          }
          const l = this.exprToC(node.left, lines, depth);
          return `${l} ${node.op} ${sym.ctype}_${val}`;
        }
      }
    }
    const l = this.exprToC(node.left, lines, depth);
    const r = this.exprToC(node.right, lines, depth);

    // >>>= → x = (int32_t)((uint32_t)x >> r)
    if (node.op === '>>>=') {
      return `${l} = (int32_t)((uint32_t)${l} >> ${r})`;
    }

    // **= → x = pow(x, r)
    if (node.op === '**=') {
      this.includes.add('#include <math.h>');
      return `${l} = pow(${l}, ${r})`;
    }
    // ??= → if (!x.has_value) { x = (opt_T){true, rhs}; }
    if (node.op === '??=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const optType = sym?.ctype;
      if (optType?.startsWith('opt_')) {
        if (sym) sym.optIsNull = false; // after ??=, variable is guaranteed to have a value
        return `if (!${l}.has_value) { ${l} = (${optType}){true, ${r}}; }`;
      }
      return `${l} = ${l} ?? ${r}`;
    }
    // &&= / ||= → JS semantics with temp
    if (node.op === '&&=' || node.op === '||=') {
      const sym = node.left.kind === 'Ident' ? this.lookup(node.left.name) : null;
      const lt = sym?.ctype ?? 'int32_t';
      const tmp = `_tsc_lhs`;
      const I = ' '.repeat(this.indent * depth);
      if (node.op === '&&=') {
        return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${r} : ${tmp}; }`;
      } else {
        return `{ ${lt} ${tmp} = ${l}; ${l} = (${tmp}) ? ${tmp} : ${r}; }`;
      }
    }

    return `${l} ${node.op} ${r}`;
  }

  // ----------------------------------------------------------------
  // Calls
  // ----------------------------------------------------------------
  callToC(node, lines, depth) {
    const { callee, args } = node;

    // Optional chaining: x?.method() where x is opt_T
    if (callee.kind === 'OptChain') {
      const obj = callee.object;
      const objType = this.inferType(obj);
      const objC = this.exprToC(obj, lines, depth);
      if (objType?.startsWith('opt_')) {
        const innerIdent = objType.slice(4);
        if (callee.prop === 'toString') {
          // Ensure opt_string typedef is emitted
          if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
          if (!this._emittedOptStructs.has('opt_string')) {
            this._emittedOptStructs.add('opt_string');
            this.addTop(`typedef struct { bool has_value; String value; } opt_string;`);
          }
          const fnName = `tsc_${innerIdent}_to_string`;
          return `${objC}.has_value ? (opt_string){true, ${fnName}(${objC}.value)} : (opt_string){false, STR_LIT("")}`;
        }
      }
      // Fallback: treat as non-optional
      const objC2 = this.exprToC(obj, lines, depth);
      return `${objC2}.${callee.prop}(${this.argsToC(args, lines, depth)})`;
    }

    // console.log / console.error / console.warn / console.debug
    if (callee.kind === 'Member' && callee.object.kind === 'Ident' && callee.object.name === 'console') {
      return this.consoleCall(callee.prop, args, lines, depth);
    }

    // performance.now()
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'performance' &&
        callee.prop === 'now') {
      return 'tsc_performance_now()';
    }

    // process.exit(n)
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'process' &&
        callee.prop === 'exit') {
      const code = args.length ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `exit(${code})`;
    }

    // Math.xxx
    if (callee.kind === 'Member' &&
        callee.object.kind === 'Ident' && callee.object.name === 'Math') {
      return this.mathCall(callee.prop, args, lines, depth);
    }

    // Enum.method() calls: Enum.values(), Enum.fromValue(), EnumMember.toString()
    if (callee.kind === 'Member') {
      // variable.toString() where variable is a string-literal-union type
      if (callee.prop === 'toString' && callee.object.kind === 'Ident') {
        const objSym = this.lookup(callee.object.name);
        const objEnumDef = objSym ? this.classes.get(objSym.ctype) : null;
        if (objEnumDef?.isStringLiteralUnion) {
          const objC = this.exprToC(callee.object, lines, depth);
          return `${objSym.ctype}_values[(int)${objC}]`;
        }
      }
      // EnumMember.toString() — callee.object is Member (Dir.North), prop is 'toString'
      if (callee.prop === 'toString' && callee.object.kind === 'Member') {
        const enumName = callee.object.object.kind === 'Ident' ? callee.object.object.name : null;
        const enumDef = enumName ? this.classes.get(enumName) : null;
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw new Error(`"toString()" is not available on const enum`);
          const memberC = `${enumName}_${callee.object.prop}`;
          if (enumDef.isStringEnum) return `${enumName}_strings[(int)${memberC}]`;
          return `${enumName}_names[(int)${memberC}]`;
        }
      }
      // Enum.values()
      if (callee.prop === 'values' && callee.object.kind === 'Ident') {
        const enumDef = this.classes.get(callee.object.name);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw new Error(`"values()" is not available on const enum`);
          return `${callee.object.name}_values`;
        }
      }
      // Enum.fromValue(n) — needs helper function emitted at top
      if (callee.prop === 'fromValue' && callee.object.kind === 'Ident') {
        const enumName = callee.object.name;
        const enumDef = this.classes.get(enumName);
        if (enumDef?.isEnum) {
          if (enumDef.isConst) throw new Error(`"fromValue()" is not available on const enum`);
          const n = enumDef.members.length;
          const helperName = `${enumName}_fromValue`;
          // Emit helper if not already emitted
          if (!this._emittedHelpers) this._emittedHelpers = new Set();
          if (!this._emittedHelpers.has(helperName)) {
            this._emittedHelpers.add(helperName);
            this.addTop(`typedef struct { bool has_value; ${enumName} value; } opt_${enumName};`);
            this.addTop(`static inline opt_${enumName} ${helperName}(int32_t v) {`);
            this.addTop(`    for (int i = 0; i < ${n}; i++) { if ((int32_t)${enumName}_values[i] == v) return (opt_${enumName}){true, ${enumName}_values[i]}; }`);
            this.addTop(`    return (opt_${enumName}){false, 0};`);
            this.addTop(`}`);
            this.addTop(``);
          }
          const argC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
          return `${helperName}(${argC})`;
        }
      }
    }

    // setTimeout / setInterval / clearTimeout
    if (callee.kind === 'Ident' && callee.name === 'setTimeout') {
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_timeout(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'setInterval') {
      const fn = this.exprToC(args[0].expr, lines, depth);
      const ms = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
      return `tsc_set_interval(${fn}, ${ms})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'clearTimeout') {
      const id = this.exprToC(args[0].expr, lines, depth);
      return `tsc_clear_timeout(${id})`;
    }

    // parseFloat / tryParseFloat / tryParseInt
    if (callee.kind === 'Ident' && callee.name === 'parseFloat') {
      return `tsc_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseFloat') {
      return `tsc_try_parse_f64(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'parseInt') {
      return `tsc_parse_i32(${this.exprToC(args[0].expr, lines, depth)})`;
    }
    if (callee.kind === 'Ident' && callee.name === 'tryParseInt') {
      return `tsc_try_parse_i32(${this.exprToC(args[0].expr, lines, depth)})`;
    }

    // sleep()
    if (callee.kind === 'Ident' && callee.name === 'sleep') {
      const ms = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
      return `tsc_sleep_awaitable(${ms})`;
    }

    // Method call on known object
    if (callee.kind === 'Member') {
      return this.methodCall(callee, args, lines, depth);
    }

    // Generic function call: monomorphize
    if (callee.kind === 'Ident' && this._genericFuncs?.has(callee.name)) {
      return this.callGeneric(callee.name, node.typeArgs ?? [], args, lines, depth);
    }

    // Plain function call — look up mangled name in scope
    let calleeC;
    let sym = null;
    if (callee.kind === 'Ident') {
      sym = this.lookup(callee.name);
      // funcPtr variables hold the name directly; functions use their mangled name
      calleeC = (sym?.funcName && !sym.funcPtr) ? sym.funcName : callee.name;
    } else {
      calleeC = this.exprToC(callee, lines, depth);
    }

    // Check for any-typed params: cannot pass typed value as any
    if (sym?.params) {
      for (let i = 0; i < sym.params.length && i < args.length; i++) {
        const p = sym.params[i];
        if (p.typeAnn?.kind === 'TypeRef' && p.typeAnn.name === 'any') {
          const argType = this.inferType(args[i].expr);
          if (argType !== 'void *' && argType !== null && argType !== undefined) {
            const tsType = this.ctypeToTsName(argType);
            throw new Error(`cannot pass ${tsType} as "any": any is opaque across function boundaries`);
          }
        }
      }
    }

    // Check if callee has a rest param — if so, bundle variadic args into a temp array
    const symParams = sym?.params;
    const restIdx = symParams ? symParams.findIndex(p => p.rest) : -1;
    if (restIdx >= 0) {
      const restParam = symParams[restIdx];
      let et = 'int32_t';
      if (restParam.typeAnn?.kind === 'TypeArray') et = this.resolveType(restParam.typeAnn.element);
      else if (restParam.typeAnn) et = this.resolveType(restParam.typeAnn);
      // Normal args before rest
      const normalArgs = args.slice(0, restIdx).map(a => this.exprToC(a.expr, lines, depth));
      // Variadic args from restIdx onward
      const varArgs = args.slice(restIdx);
      const I = ' '.repeat(this.indent * depth);
      const restName = `_rest_${this.restCount++}`;
      const varArgsC = varArgs.map(a => this.exprToC(a.expr, lines, depth)).join(', ');
      lines.push(`${I}${et} ${restName}[] = {${varArgsC}};`);
      const allArgs = [...normalArgs, restName, String(varArgs.length)];
      return `${calleeC}(${allArgs.join(', ')})`;
    }

    // Fill in default params at call site if fewer args are provided (skip if any spread arg)
    const hasSpread = args.some(a => a.spread);
    if (!hasSpread && symParams && args.length < symParams.filter(p => !p.rest).length) {
      const normalParams = symParams.filter(p => !p.rest);
      const filled = normalParams.map((p, i) => {
        if (i < args.length) return this.exprToC(args[i].expr, lines, depth);
        if (p.defaultVal) return this.exprToC(p.defaultVal, lines, depth);
        return '0'; // fallback (shouldn't happen if type-checked)
      });
      return `${calleeC}(${filled.join(', ')})`;
    }

    // If we have symParams, coerce string literals to enum values for string-literal-union params
    // (only when no spread args — spread needs argsToC expansion)
    const hasSpreadArgs = args.some(a => a.spread);
    if (symParams && !hasSpreadArgs) {
      const coercedArgs = args.map((a, i) => {
        const param = symParams[i];
        if (!param) return this.exprToC(a.expr, lines, depth);
        const paramType = param.typeAnn ? this.resolveType(param.typeAnn) : null;
        const paramEnumDef = paramType ? this.classes.get(paramType) : null;
        if (paramEnumDef?.isStringLiteralUnion && a.expr.kind === 'Literal' && a.expr.litType === 'string') {
          const val = a.expr.value;
          if (!paramEnumDef.members.includes(val)) {
            throw new Error(`"${val}" is not a valid value for type ${paramType}`);
          }
          return `${paramType}_${val}`;
        }
        // ObjLit arg to struct param: prefix with (StructType)
        if (paramEnumDef?.isStruct && a.expr.kind === 'ObjLit') {
          const initC = this.exprToC(a.expr, lines, depth);
          return `(${paramType})${initC}`;
        }
        return this.exprToC(a.expr, lines, depth);
      });
      return `${calleeC}(${coercedArgs.join(', ')})`;
    }

    const argsC = this.argsToC(args, lines, depth);
    return `${calleeC}(${argsC})`;
  }

  consoleCall(method, args, lines, depth) {
    const isErr = method === 'error' || method === 'warn' || method === 'debug';

    if (args.length === 0) {
      return isErr ? 'fprintf(stderr, "\\n")' : 'printf("\\n")';
    }

    const fmtParts = [];
    const fmtArgs  = [];

    for (const arg of args) {
      const expr  = arg.expr;
      const ctype = this.inferType(expr);

      // String literal → embed value directly in format string (no separate arg)
      if (expr.kind === 'Literal' && expr.litType === 'string') {
        fmtParts.push(expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%'));
        continue;
      }

      // A bare decimal integer literal is type `number` = f64 in TSClang
      if (this.isBareLiteralNumber(expr)) {
        const v = this.bareNumberValue(expr);
        fmtParts.push('%g');
        fmtArgs.push(v);
        continue;
      }

      const cexpr = this.exprToC(expr, lines, depth);

      // Bitwise ops: if operands are explicitly typed (from variables), use %d; otherwise %g (JS number)
      if (expr.kind === 'Binary' && ['&','|','^','<<','>>','>>>'].includes(expr.op)) {
        const hasTypedVar = (n) => {
          if (!n) return false;
          if (n.kind === 'Ident') {
            const s = this.lookup(n.name);
            return s?.ctype != null && s.ctype !== 'double' && s.ctype !== 'void *';
          }
          if (n.kind === 'Binary') return hasTypedVar(n.left) || hasTypedVar(n.right);
          return false;
        };
        if (hasTypedVar(expr)) {
          fmtParts.push('%d');
          fmtArgs.push(cexpr);
        } else {
          fmtParts.push('%g');
          fmtArgs.push(`(double)(${cexpr})`);
        }
        continue;
      }

      if (ctype === 'String') {
        fmtParts.push('%s');
        fmtArgs.push(`${cexpr}.data`);
      } else if (ctype === 'const char *' || ctype === 'char *') {
        fmtParts.push('%s');
        fmtArgs.push(cexpr);
      } else if (ctype === 'bool') {
        fmtParts.push('%s');
        fmtArgs.push(`${(expr.kind === 'Member' || expr.kind === 'Index') ? cexpr : '(' + cexpr + ')'} ? "true" : "false"`);
      } else if (ctype === 'double') {
        fmtParts.push('%g');
        fmtArgs.push(cexpr);
      } else if (ctype === 'float') {
        fmtParts.push('%g');
        fmtArgs.push(`(double)${cexpr}`);
      } else if (ctype === 'int64_t') {
        fmtParts.push('%lld');
        fmtArgs.push(`(long long)${cexpr}`);
      } else if (ctype === 'uint64_t') {
        fmtParts.push('%llu');
        fmtArgs.push(`(unsigned long long)${cexpr}`);
      } else if (ctype === 'uint8_t' || ctype === 'uint16_t') {
        fmtParts.push('%u');
        fmtArgs.push(`(unsigned)${cexpr}`);
      } else if (ctype === 'uint32_t') {
        fmtParts.push('%u');
        fmtArgs.push(cexpr);
      } else if (ctype === 'int8_t' || ctype === 'int16_t') {
        fmtParts.push('%d');
        fmtArgs.push(`(int)${cexpr}`);
      } else if (ctype === 'char') {
        fmtParts.push('%c');
        fmtArgs.push(cexpr);
      } else if (ctype === 'size_t') {
        fmtParts.push('%zu');
        fmtArgs.push(cexpr);
      } else {
        // Optional type (opt_T)
        if (ctype.startsWith('opt_')) {
          const innerIdent = ctype.slice(4); // e.g., "i32" from "opt_i32"
          const ed = this.classes.get(innerIdent);
          const sym2 = expr.kind === 'Ident' ? this.lookup(expr.name) : null;
          if (ed?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`${cexpr}.has_value ? (int)${cexpr}.value : -1`);
          } else if (sym2?.optIsNull || (() => {
              // Check if this is a null optional tuple field access: a[1] where _1 was not initialized
              if (expr.kind === 'Index' && expr.object.kind === 'Ident' && expr.index.kind === 'Literal') {
                const tSym = this.lookup(expr.object.name);
                return tSym?.nullOptFields?.has(`_${expr.index.value}`);
              }
              return false;
            })()) {
            // Null-initialized optional — show "some" or "null"
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? "some" : "null"`);
          } else if (innerIdent === 'string') {
            fmtParts.push('%s');
            fmtArgs.push(`${cexpr}.has_value ? ${cexpr}.value.data : "null"`);
          } else {
            // Numeric or other — print the value
            const identToCType2 = { 'i8':'int8_t', 'i16':'int16_t', 'i32':'int32_t', 'i64':'int64_t', 'u8':'uint8_t', 'u16':'uint16_t', 'u32':'uint32_t', 'u64':'uint64_t', 'f32':'float', 'f64':'double', 'bool':'bool', 'usize':'size_t' };
            const innerCType = identToCType2[innerIdent] ?? innerIdent;
            // For inline call expressions, create a temp var first (but not for simple Ident/Index/Member)
            let valExpr = cexpr;
            if (expr.kind === 'Call') {
              const tmp = `_at_${this.tempCount++}`;
              lines.push(`${ctype} ${tmp} = ${cexpr};`);
              valExpr = tmp;
            }
            if (innerCType === 'double' || innerCType === 'float') {
              fmtParts.push('%g');
              fmtArgs.push(`${valExpr}.value`);
            } else if (innerCType === 'int64_t') {
              fmtParts.push('%lld');
              fmtArgs.push(`(long long)${valExpr}.value`);
            } else if (innerCType === 'uint8_t' || innerCType === 'uint16_t') {
              fmtParts.push('%u');
              fmtArgs.push(`(unsigned)${valExpr}.value`);
            } else {
              fmtParts.push('%d');
              fmtArgs.push(`${valExpr}.value`);
            }
          }
          continue;
        } else {
          // String literal union enum: print the string value
          const enumDef = this.classes.get(ctype);
          if (enumDef?.isStringLiteralUnion) {
            fmtParts.push('%s');
            fmtArgs.push(`${ctype}_values[(int)${cexpr}]`);
          } else if (enumDef?.isEnum) {
            fmtParts.push('%d');
            fmtArgs.push(`(int)${cexpr}`);
          } else {
            fmtParts.push('%d');
            fmtArgs.push(cexpr);
          }
        }
      }
    }

    const fmt = '"' + fmtParts.join(' ') + '\\n"';
    if (fmtArgs.length === 0) {
      return isErr ? `fprintf(stderr, ${fmt})` : `printf(${fmt})`;
    }
    const allArgs = [fmt, ...fmtArgs].join(', ');
    return isErr ? `fprintf(stderr, ${allArgs})` : `printf(${allArgs})`;
  }

  // Check if a labeled break/continue with the given label is used in an AST subtree
  labelUsed(node, label, kind) {
    if (!node || typeof node !== 'object') return false;
    if (node.kind === kind.charAt(0).toUpperCase() + kind.slice(1) && node.label === label) return true;
    // Don't descend into nested labeled loops with the same label
    if (node.kind === 'Labeled' && node.label === label) return false;
    for (const val of Object.values(node)) {
      if (Array.isArray(val)) {
        for (const item of val) { if (this.labelUsed(item, label, kind)) return true; }
      } else if (val && typeof val === 'object' && val.kind) {
        if (this.labelUsed(val, label, kind)) return true;
      }
    }
    return false;
  }

  // Is this a bare integer number literal (or unary minus thereof)?
  isBareLiteralNumber(expr) {
    if (expr.kind === 'Literal' && expr.litType === 'number' &&
        !expr.value.includes('.') && !expr.value.includes('e') && !expr.value.includes('E') &&
        !expr.value.startsWith('0x') && !expr.value.startsWith('0b') && !expr.value.startsWith('0o') &&
        !expr.value.startsWith('0X') && !expr.value.startsWith('0B') && !expr.value.startsWith('0O')) {
      return true;
    }
    if (expr.kind === 'Unary' && expr.op === '-') return this.isBareLiteralNumber(expr.expr);
    return false;
  }

  // Get the double representation of a bare integer literal
  bareNumberValue(expr) {
    if (expr.kind === 'Literal') {
      return expr.value + '.0';
    }
    if (expr.kind === 'Unary' && expr.op === '-') {
      return '-' + this.bareNumberValue(expr.expr);
    }
    return '0.0';
  }

  mathCall(prop, args, lines, depth) {
    this.includes.add('#include <math.h>');
    const a0 = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
    const a1 = args[1] ? this.exprToC(args[1].expr, lines, depth) : '0';
    const a2 = args[2] ? this.exprToC(args[2].expr, lines, depth) : '0';
    const map = {
      abs: `fabs(${a0})`, floor: `floor(${a0})`, ceil: `ceil(${a0})`,
      round: `round(${a0})`, trunc: `trunc(${a0})`,
      sqrt: `sqrt(${a0})`, pow: `pow(${a0}, ${a1})`,
      log: `log(${a0})`, log2: `log2(${a0})`, log10: `log10(${a0})`,
      sin: `sin(${a0})`, cos: `cos(${a0})`, tan: `tan(${a0})`,
      min: `fmin(${a0}, ${a1})`, max: `fmax(${a0}, ${a1})`,
      hypot: `hypot(${a0}, ${a1})`,
      clamp: `(${a0} < ${a1} ? ${a1} : (${a0} > ${a2} ? ${a2} : ${a0}))`,
      sign: `((${a0} > 0.0) - (${a0} < 0.0) + 0.0)`,
    };
    if (prop === 'PI')   return 'M_PI';
    if (prop === 'E')    return 'M_E';
    if (prop === 'LN2')  return 'M_LN2';
    if (prop === 'LN10') return 'log(10.0)';
    if (prop === 'SQRT2') return 'M_SQRT2';
    return map[prop] ?? `/* Math.${prop} */(${a0})`;
  }

  // Monomorphize a generic function call
  callGeneric(name, typeArgs, args, lines, depth) {
    const tmpl = this._genericFuncs.get(name);
    if (!tmpl) return `${name}(${this.argsToC(args, lines, depth)})`;

    // Check for ambiguous overload (non-generic version exists in scope)
    const existing = this.lookup(name);
    if (existing?.funcName) {
      throw new Error(`ambiguous call: both generic and non-generic overload match`);
    }

    // Build substitution map: T → concrete C type
    const subst = new Map();
    for (let i = 0; i < tmpl.typeParams.length; i++) {
      const tp = tmpl.typeParams[i];
      let ctype;
      if (typeArgs[i]) {
        ctype = this.resolveType(typeArgs[i]);
      } else if (args[i]) {
        // For ObjLit args, create an anon struct so T has concrete fields
        if (args[i].expr?.kind === 'ObjLit') {
          ctype = this.inferObjLitType(args[i].expr);
        } else {
          ctype = this.inferType(args[i].expr);
        }
      } else {
        ctype = 'int32_t';
      }
      subst.set(tp.name, ctype);
    }

    // Handle structural constraint: T implements { ... } → use anonymous struct
    for (const tp of tmpl.typeParams) {
      if (tp.constraint?.kind === 'TypeObject' && !typeArgs[tmpl.typeParams.indexOf(tp)]) {
        if (args[0]) {
          const argType = args[0].expr?.kind === 'ObjLit'
            ? this.inferObjLitType(args[0].expr)
            : this.inferType(args[0].expr);
          subst.set(tp.name, argType);
        }
      }
    }

    // Compute suffix from resolved monomorphized parameter types (more accurate for utility types)
    const nonThisParams = tmpl.params.filter(p => p.name !== 'this' && p.name !== 'self' && p.typeAnn);
    const suffix = nonThisParams.length > 0
      ? nonThisParams.map(p => this.cTypeToIdent(this.resolveType(this.substType(p.typeAnn, subst)))).join('_')
      : tmpl.typeParams.map(tp => this.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
    const monoName = `${name}_${suffix}`;

    // Emit monomorphized function if not already done
    if (!this._emittedGenerics) this._emittedGenerics = new Set();
    if (!this._emittedGenerics.has(monoName)) {
      this._emittedGenerics.add(monoName);
      this.emitMonoFunc(tmpl, monoName, subst);
    }

    // Generate call args, casting ObjLit args to expected param struct types
    const resolvedParamTypes = nonThisParams.map(p =>
      this.resolveType(this.substType(p.typeAnn, subst)));
    const argsC = args.map((a, i) => {
      const expectedType = resolvedParamTypes[i];
      if (a.expr?.kind === 'ObjLit' && expectedType) {
        const structDef = this.classes.get(expectedType);
        if (structDef?.fields) {
          const fieldNames = structDef.fields.map(f => f.name ?? f);
          const filteredProps = a.expr.props.filter(p => !p.spread && !p.computed && fieldNames.includes(p.key));
          const propsC = filteredProps.map(p => `.${p.key} = ${this.exprToC(p.value, lines, depth)}`).join(', ');
          return `(${expectedType}){${propsC}}`;
        }
      }
      return this.exprToC(a.expr, lines, depth);
    }).join(', ');
    return `${monoName}(${argsC})`;
  }

  // Create a virtual anonymous struct for field lookup (not emitted to C output)
  // Used internally by callGeneric to resolve utility types like Pick<T, K>
  inferObjLitType(node) {
    const fields = node.props
      .filter(p => !p.spread && !p.computed)
      .map(p => ({ name: p.key, ctype: this.inferType(p.value) }));
    const sig = fields.map(f => `${f.ctype} ${f.name}`).join(';');
    if (!this._anonStructSigs) this._anonStructSigs = new Map();
    if (this._anonStructSigs.has(sig)) return this._anonStructSigs.get(sig);
    if (!this._anonStructCount) this._anonStructCount = 0;
    const anonName = `_anon_${this._anonStructCount++}`;
    const structFields = fields.map(f => ({
      name: f.name,
      typeAnn: { kind: 'TypeRef', name: f.ctype, typeArgs: [] },
    }));
    // Register in classes for field lookup but do NOT emit typedef (only used internally)
    this.classes.set(anonName, { isStruct: true, fields: structFields, _virtual: true });
    this._anonStructSigs.set(sig, anonName);
    return anonName;
  }

  // Substitute type params in a type annotation
  substType(typeNode, subst) {
    if (!typeNode) return typeNode;
    if (typeNode.kind === 'TypeRef') {
      if (subst.has(typeNode.name)) {
        const ct = subst.get(typeNode.name);
        // Convert C type back to TypeRef for resolveType
        return { kind: 'TypeRef', name: ct, typeArgs: [] };
      }
      return { ...typeNode, typeArgs: typeNode.typeArgs.map(t => this.substType(t, subst)) };
    }
    if (typeNode.kind === 'TypeArray') return { ...typeNode, element: this.substType(typeNode.element, subst) };
    if (typeNode.kind === 'TypeUnion') return { ...typeNode, types: typeNode.types.map(t => this.substType(t, subst)) };
    return typeNode;
  }

  // Substitute type params in an AST node
  substNode(node, subst) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => this.substNode(n, subst));
    const result = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'typeAnn' || k === 'returnType' || k === 'castType') {
        result[k] = this.substType(v, subst);
      } else {
        result[k] = this.substNode(v, subst);
      }
    }
    return result;
  }

  emitMonoFunc(tmpl, monoName, subst) {
    // Create a copy of the function with substituted type params
    const monoParams = tmpl.params.map(p => ({
      ...p,
      typeAnn: p.typeAnn ? this.substType(p.typeAnn, subst) : p.typeAnn,
    }));
    const monoReturnType = tmpl.returnType ? this.substType(tmpl.returnType, subst) : null;
    const monoBody = this.substNode(tmpl.body, subst);

    const monoNode = {
      kind: 'FuncDecl',
      name: monoName,
      _monoName: monoName, // skip mangleParams suffix
      params: monoParams,
      returnType: monoReturnType,
      body: monoBody,
      generator: tmpl.generator,
      decorators: tmpl.decorators,
      typeParams: [], // already monomorphized
    };
    this.visitFuncDecl(monoNode, true);
  }

  emitMonoClass(tmpl, monoName, subst) {
    const fields  = tmpl.members.filter(m => m.kind === 'Field');
    const methods = tmpl.members.filter(m => m.kind === 'Method');

    // Single-line typedef struct
    const fieldDecls = fields.map(f => {
      const ct = this.resolveType(this.substType(f.typeAnn ?? { kind: 'TypeRef', name: 'int32_t', typeArgs: [] }, subst));
      return `${ct} ${f.name};`;
    }).join(' ');
    this.addTop(`typedef struct { ${fieldDecls} } ${monoName};`);
    this.addTop('');

    // Register class so method dispatch works
    this.classes.set(monoName, {
      fields: fields.map(f => ({ ...f, typeAnn: f.typeAnn ? this.substType(f.typeAnn, subst) : f.typeAnn })),
      methods,
      isStruct: false,
    });

    // Constructor
    const ctor = methods.find(m => m.name === 'constructor');
    if (ctor) {
      const ctorParams = ctor.params
        .filter(p => p.name !== 'this')
        .map(p => ({ ...p, typeAnn: p.typeAnn ? this.substType(p.typeAnn, subst) : p.typeAnn }));
      const paramDecls = ctorParams
        .map(p => `${p.typeAnn ? this.resolveType(p.typeAnn) : 'void *'} ${p.name}`)
        .join(', ');
      const monoBody = this.substNode(ctor.body, subst);
      const bodyLines = this.emitFuncBody('new', monoBody, ctorParams, monoName, monoName);
      this.addTop(`static ${monoName} ${monoName}_new(${paramDecls}) {`);
      for (const l of bodyLines) this.addTop('    ' + l);
      this.addTop('}');
      this.addTop('');
    }

    // Instance / static methods
    for (const m of methods) {
      if (m.name === 'constructor') continue;
      const isStatic = m.modifiers?.includes('static');
      const monoParams = m.params.map(p => ({ ...p, typeAnn: p.typeAnn ? this.substType(p.typeAnn, subst) : p.typeAnn }));
      const monoReturnType = m.returnType ? this.resolveType(this.substType(m.returnType, subst)) : 'void';
      const monoBody = this.substNode(m.body, subst);

      const paramDecls = [];
      if (!isStatic) paramDecls.push(`${monoName} *self`);
      for (const p of monoParams) {
        if (p.name === 'this') continue;
        paramDecls.push(`${p.typeAnn ? this.resolveType(p.typeAnn) : 'void *'} ${p.name}`);
      }

      const bodyLines = this.emitFuncBody(m.name, monoBody, monoParams, monoReturnType, monoName);
      this.addTop(`static ${monoReturnType} ${monoName}_${m.name}(${paramDecls.join(', ')}) {`);
      for (const l of bodyLines) this.addTop('    ' + l);
      this.addTop('}');
      this.addTop('');
    }
  }

  methodCall(callee, args, lines, depth) {
    const objC = this.exprToC(callee.object, lines, depth);
    const prop  = callee.prop;
    const argsC = this.argsToC(args, lines, depth);

    // Array methods
    const arrMethods = {
      push: () => {
        const elemC = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0';
        const sym = callee.object.kind === 'Ident' ? this.lookup(callee.object.name) : null;
        const et = sym?.elemType ?? 'i32';
        return `tsc_array_push_${et}(&${objC}, ${elemC})`;
      },
      pop:    () => `tsc_array_pop(&${objC})`,
      length: () => `${objC}.length`,
      slice:  () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `{.data = ${objC}.data + ${a[0]??0}, .length = ${a[1]??0} - ${a[0]??0}}`; },
      join:   () => { const sep = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT(",")'; return `tsc_array_join(&${objC}, ${sep})`; },
      indexOf:() => { const v = this.exprToC(args[0].expr, lines, depth); return `tsc_array_index_of(&${objC}, ${v})`; },
      includes:()=>{ const v = this.exprToC(args[0].expr, lines, depth); return `tsc_array_includes(&${objC}, ${v})`; },
      map:    () => `tsc_array_map(&${objC}, ${argsC})`,
      filter: () => `tsc_array_filter(&${objC}, ${argsC})`,
      forEach:() => `tsc_array_foreach(&${objC}, ${argsC})`,
      reverse:() => `tsc_array_reverse(&${objC})`,
      sort:   () => `tsc_array_sort(&${objC}, ${argsC})`,
      fill:   () => { const v = args[0] ? this.exprToC(args[0].expr, lines, depth) : '0'; return `memset(${objC}.data, ${v}, ${objC}.length)`; },
      find:   () => `tsc_array_find(&${objC}, ${argsC})`,
      every:  () => `tsc_array_every(&${objC}, ${argsC})`,
      some:   () => `tsc_array_some(&${objC}, ${argsC})`,
      keys:   () => `tsc_array_keys(&${objC})`,
      values: () => `tsc_array_values(&${objC})`,
      entries:() => `tsc_array_entries(&${objC})`,
      flat:   () => `tsc_array_flat(&${objC})`,
      reduce: () => `tsc_array_reduce(&${objC}, ${argsC})`,
    };

    // String methods
    const strMethods = {
      length:     () => `${objC}.length`,
      slice:      () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_slice(${objC}, ${a[0]??0}, ${a[1]??'(int32_t)'+objC+'.length'})`; },
      indexOf:      () => `tsc_string_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      lastIndexOf:  () => `(int)tsc_string_last_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      at:           () => {
        // s.at(n) → tsc_string_at(s, n) returning opt_u8
        const idxNode = args[0]?.expr;
        const idxC = this.exprToC(idxNode, lines, depth);
        if (!this._emittedOptStructs) this._emittedOptStructs = new Set();
        if (!this._emittedOptStructs.has('opt_u8')) {
          this._emittedOptStructs.add('opt_u8');
          // opt_u8 is defined in runtime.h — no local typedef needed
        }
        // Flag: non-negative literal index might be OOB → optIsNull hint for VarDecl
        const idxVal = (idxNode?.kind === 'Literal' && idxNode?.litType === 'number') ? parseFloat(idxNode.value) : NaN;
        this._lastAtNonNeg = !isNaN(idxVal) && idxVal >= 0;
        return `tsc_string_at(${objC}, ${idxC})`;
      },
      includes:   () => `tsc_string_includes(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      startsWith: () => `tsc_string_starts_with(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      endsWith:   () => `tsc_string_ends_with(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      split:      () => `tsc_string_split(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      trim:       () => `tsc_string_trim(${objC})`,
      toUpperCase:() => `tsc_string_to_upper(${objC})`,
      toLowerCase:() => `tsc_string_to_lower(${objC})`,
      replace:    () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_replace(${objC}, ${a[0]}, ${a[1]})`; },
      padStart:   () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_start(${objC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      padEnd:     () => { const a = args.map(a => this.exprToC(a.expr, lines, depth)); return `tsc_string_pad_end(${objC}, ${a[0]}, ${a[1]??'STR_LIT(" ")'})`; },
      repeat:     () => `tsc_string_repeat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charAt:     () => `tsc_string_char_at(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      charCodeAt: () => `tsc_string_char_code_at(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      concat:     () => `tsc_string_concat(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
      codePoints: () => `tsc_codepoints(${objC})`,
      graphemes:  () => `tsc_graphemes(${objC})`,
    };

    // TscMap_* methods → explicit C function calls
    const objType2 = (callee.object.kind === 'Ident' ? this.lookup(callee.object.name)?.ctype : null)
      ?? this.inferType(callee.object);
    if (objType2?.startsWith('TscMap_')) {
      const mapSuffix = objType2.slice(7); // e.g., "string_i32"
      if (prop === 'set') return `tsc_map_set_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'get') return `tsc_map_get_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'has') return `tsc_map_has_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'delete') return `tsc_map_delete_${mapSuffix}(&${objC}, ${argsC})`;
      if (prop === 'size') return `(int32_t)${objC}._count`;
    }

    // Map methods
    const mapMethods = ['set','get','has','delete','keys','values','entries','size','forEach','clear'];

    // Float methods: toFixed, toPrecision
    const numMethods = {
      toFixed: () => {
        const objType = this.inferType(callee.object);
        if (objType === 'int32_t' || objType === 'int64_t' || objType === 'uint32_t')
          throw new Error(`"toFixed()" is only available on f32/f64`);
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw new Error(`"toFixed()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.${n}f", ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
      toPrecision: () => {
        const nArg = args[0]?.expr;
        if (!nArg || nArg.kind !== 'Literal')
          throw new Error(`"toPrecision()" argument must be a compile-time literal`);
        const n = nArg.value;
        const buf = `_buf_${this.tempCount++}`;
        lines.push(`char ${buf}[64];`);
        lines.push(`snprintf(${buf}, sizeof(${buf}), "%.*g", ${n}, ${objC});`);
        return `STR_LIT_RUNTIME(${buf})`;
      },
    };

    if (arrMethods[prop]) return arrMethods[prop]();
    if (strMethods[prop]) return strMethods[prop]();
    if (numMethods[prop]) return numMethods[prop]();

    // Generic method: obj.method(args) → ObjType_method(&obj, args)
    const sym = callee.object.kind === 'Ident' ? this.lookup(callee.object.name) : null;
    if (sym?.ctype && this.classes.has(sym.ctype)) {
      const suffix = args.length ? '_' + args.map(a => this.inferType(a.expr)).join('_') : '';
      return `${sym.ctype}_${prop}(&${objC}${argsC ? ', ' + argsC : ''})`;
    }

    // Fallback: obj.method(args)
    return `${objC}.${prop}(${argsC})`;
  }

  argsToC(args, lines, depth) {
    const parts = [];
    for (const a of args) {
      if (a.spread) {
        // Expand spread from a known C array: arr → arr[0], arr[1], ...
        const sym = a.expr?.kind === 'Ident' ? this.lookup(a.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          for (let i = 0; i < sym.arraySize; i++) parts.push(`${a.expr.name}[${i}]`);
        } else {
          parts.push(`/* ...${this.exprToC(a.expr, lines, depth)} */`);
        }
      } else {
        parts.push(this.exprToC(a.expr, lines, depth));
      }
    }
    return parts.join(', ');
  }

  // ----------------------------------------------------------------
  // new Foo() → Foo_new() or Foo = {0}
  // ----------------------------------------------------------------
  newToC(node, lines, depth) {
    const { name, args } = node;
    const argsC = this.argsToC(args, lines, depth);

    // new Error("msg") → (TscError){ .message = STR_LIT("msg") }
    if (name === 'Error') {
      const msgArg = args[0] ? this.exprToC(args[0].expr, lines, depth) : 'STR_LIT("")';
      return `(TscError){ .message = ${msgArg} }`;
    }

    // new Map<K,V>() → tsc_map_create_K_V()
    if (name === 'Map') {
      const [kt, vt] = (node.typeArgs ?? []).map(t => this.resolveType(t));
      const k = kt ? this.cTypeToIdent(kt) : 'string';
      const v = vt ? this.cTypeToIdent(vt) : 'i32';
      return `tsc_map_create_${k}_${v}()`;
    }

    // new Array<T>() or []
    if (name === 'Array') {
      return `tsc_array_create()`;
    }

    // new Shared<T>()
    if (name === 'Shared') {
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'void';
      return `tsc_arc_alloc(sizeof(${t}))`;
    }

    // new Weak<T>(val)
    if (name === 'Weak') {
      return `tsc_weak_create(${argsC})`;
    }

    // new Atomic<T>(val)
    if (name === 'Atomic') {
      const t = node.typeArgs?.[0] ? this.resolveType(node.typeArgs[0]) : 'int32_t';
      return `{.value = ${argsC || '0'}}`;
    }

    // new Channel<T>(cap)
    if (name === 'Channel') {
      const t = node.typeArgs?.[0] ? this.cTypeToIdent(this.resolveType(node.typeArgs[0])) : 'i32';
      return `{ ._inner = tsc_channel_create_${t}(${argsC}) }`;
    }

    // new Signal<T>(val)
    if (name === 'Signal') {
      const t = node.typeArgs?.[0] ? this.cTypeToIdent(this.resolveType(node.typeArgs[0])) : 'i32';
      return `tsc_signal_create_${t}(${argsC})`;
    }

    // new Promise<T>(...)
    if (name === 'Promise') {
      return `/* new Promise */ {0}`;
    }

    // new URL(...)
    if (name === 'URL') {
      if (args.length === 1) return `tsc_url_parse(${argsC})`;
      if (args.length === 2) return `tsc_url_parse_relative(${argsC.split(', ')[0]}, &${argsC.split(', ')[1]})`;
    }

    // Generic class instantiation: new Box<i32>(42) → Box_i32_new(42)
    if (this._genericClasses?.has(name)) {
      const tmpl = this._genericClasses.get(name);
      const typeArgs = node.typeArgs ?? [];
      const subst = new Map();
      for (let i = 0; i < tmpl.typeParams.length; i++) {
        const ct = typeArgs[i] ? this.resolveType(typeArgs[i]) : 'int32_t';
        subst.set(tmpl.typeParams[i].name, ct);
      }
      const suffix = tmpl.typeParams.map(tp => this.cTypeToIdent(subst.get(tp.name) ?? 'void')).join('_');
      const monoName = `${name}_${suffix}`;
      if (!this._emittedGenericClasses) this._emittedGenericClasses = new Set();
      if (!this._emittedGenericClasses.has(monoName)) {
        this._emittedGenericClasses.add(monoName);
        this.emitMonoClass(tmpl, monoName, subst);
      }
      return `${monoName}_new(${argsC})`;
    }

    // Known class with constructor
    const cls = this.classes.get(name);
    if (cls) {
      const hasCtor = cls.methods?.some(m => m.name === 'constructor');
      if (hasCtor) return `${name}_new(${argsC})`;
      return `{0}`;
    }

    // Unknown: zero-init struct
    return `(${name}){0}`;
  }

  // ----------------------------------------------------------------
  // Arrow function hoisting
  // ----------------------------------------------------------------
  hoistArrow(node, retType, hint) {
    const n = this.lambdaCount++;
    // Determine return type from body
    let ret = retType === 'void' ? this.inferArrowReturn(node) : retType;
    // Name uses the mangled return type (e.g. _lambda_0_i32)
    const retSuffix = this.cTypeToIdent(ret);
    const name = `_lambda_${n}_${retSuffix}`;
    const paramStrs = (node.params ?? []).map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      return `${ct} ${p.name}`;
    });
    const lines = [];
    if (node.body.kind === 'Block') {
      this.visitBlock(node.body, lines, 0);
    } else {
      const c = this.exprToC(node.body, lines, 0);
      lines.push(`return ${c};`);
    }
    this.addLambda(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addLambda('    ' + l);
    this.addLambda('}');
    this.addLambda('');
    return name;
  }

  inferArrowReturn(node) {
    if (node.returnType) return this.resolveType(node.returnType);
    if (node.body.kind !== 'Block') return this.inferType(node.body);
    return 'void';
  }

  // Format a variable declaration: qualifier + ctype + name with proper pointer spacing
  varDecl(qualifier, ctype, name) {
    if (ctype.endsWith(' *')) return `${qualifier}${ctype}${name}`;
    return `${qualifier}${ctype} ${name}`;
  }

  arrowParamTypes(node) {
    return (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
  }

  // Expand an ArrayLit's elements into C initializer strings, handling spreads.
  // Spread `...arr` on a known C array expands to arr[0], arr[1], ...
  arrayLitToC(node, _elemType, lines, depth) {
    const result = [];
    for (const e of node.elems) {
      if (e.spread) {
        // Expand spread from known array
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) {
          for (let i = 0; i < sym.arraySize; i++) {
            result.push(`${e.expr.name}[${i}]`);
          }
        } else {
          result.push(`/* ...${this.exprToC(e.expr, lines, depth)} */`);
        }
      } else {
        result.push(this.exprToC(e.expr, lines, depth));
      }
    }
    return result;
  }

  // Count the static size of an ArrayLit (expanding spread if possible)
  arrayLitSize(node) {
    let count = 0;
    for (const e of node.elems) {
      if (e.spread) {
        const sym = e.expr?.kind === 'Ident' ? this.lookup(e.expr.name) : null;
        if (sym?.isArray && sym.arraySize >= 0) count += sym.arraySize;
        else return -1; // unknown
      } else {
        count++;
      }
    }
    return count;
  }

  // ----------------------------------------------------------------
  // Type resolution
  // ----------------------------------------------------------------
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
  }

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
  }

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
  }

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
  }

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
  }

  ctypeToTsName(ctype) {
    const m = {
      'int8_t': 'i8', 'int16_t': 'i16', 'int32_t': 'i32', 'int64_t': 'i64',
      'uint8_t': 'u8', 'uint16_t': 'u16', 'uint32_t': 'u32', 'uint64_t': 'u64',
      'float': 'f32', 'double': 'f64', 'bool': 'bool',
      'String': 'string', 'size_t': 'usize', 'ptrdiff_t': 'isize',
    };
    return m[ctype] ?? ctype;
  }
}
