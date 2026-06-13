// dispatch.js
import { handleStdlibImport, STDLIB_HANDLERS, LANGUAGE_BUILTINS } from '../../stdlib-registry.js';
export default {
  visitTopLevel(node) {
    if (!node) return;
    switch (node.kind) {
      case 'Import':
        // Check if source is a declared ambient module (declare module "name" { ... })
        if (this._declaredModules?.has(node.source)) {
          const decls = this._declaredModules.get(node.source);
          const requestedNames = new Set(node.names ?? []);
          for (const decl of decls) {
            if (!requestedNames.size || requestedNames.has(decl.name)) {
              if (decl.kind === 'DeclareFunction') this.visitDeclareFunction(decl);
              else if (decl.kind === 'DeclareConst') {
                const ct = this.resolveType(decl.typeAnn);
                this.topLevel.push(`extern ${ct} ${decl.name};`);
                this.topLevel.push('');
                this.define(decl.name, { ctype: ct, varKind: 'const' });
              }
            }
          }
          break;
        }
        // Handle stdlib imports via registry
        if (handleStdlibImport(this, node)) {
          break;
        }
      case 'ExportFrom': {
        // export { X, Y } from "./module"  OR  export { X, Y }  OR  export { X as Y }
        const { names, source } = node;
        if (source) {
          const resolvedPath = this._sourceToPath?.[source];
          const moduleExports = resolvedPath ? this._importedModules?.[resolvedPath] : null;
          for (const n of (names ?? [])) {
            const origName = typeof n === 'object' ? n.name : n;
            const localName = typeof n === 'object' && n.alias ? n.alias : origName;
            const entry = moduleExports?.[origName] ?? this.lookup(origName);
            if (entry) {
              this.define(localName, entry);
              this._exports.set(localName, entry);
            }
          }
        } else {
          for (const n of (names ?? [])) {
            const origName = typeof n === 'object' ? n.name : n;
            const exportName = typeof n === 'object' && n.alias ? n.alias : origName;
            let entry = this.lookup(origName);
            if (!entry) {
              entry = this.classes.get(origName);
              if (!entry && this._typeAliases?.has(origName)) {
                entry = { _isTypeAlias: true, cType: this._typeAliases.get(origName) };
              }
            }
            if (entry) this._exports.set(exportName, entry);
          }
        }
        break;
      }
      case 'Export': {
        if (node.default) throw this.error('"export default" is not allowed; use named exports only');
        if (node.decl?.kind === 'FuncDecl') {
          this.visitFuncDecl(node.decl, true, true); // isExported=true → no static
        } else if (node.decl?.kind === 'ExtensionFunc') {
          this.visitExtensionFunc(node.decl);
        } else {
          this.visitTopLevel(node.decl);
        }
        // Track exported symbol for bundle system
        const _exportedName = node.decl?.name;
        if (_exportedName) {
          let _entry = this.lookup(_exportedName);
          if (!_entry) {
            // Types live in type tables, not scope
            _entry = this.classes.get(_exportedName);
            if (!_entry && this._typeAliases?.has(_exportedName)) {
              _entry = { _isTypeAlias: true, cType: this._typeAliases.get(_exportedName) };
            }
          }
          if (_entry) this._exports.set(_exportedName, _entry);
        }
        break;
      }
      case 'ClassDecl':   this.visitClassDecl(node); break;
      case 'Interface':   this.visitInterface(node); break;
      case 'Enum':        this.visitEnum(node); break;
      case 'TypeAlias':   this.visitTypeAlias(node); break;
      case 'FuncDecl':    this.visitFuncDecl(node, true, false); break; // not exported → static
      case 'FuncOverload':
        // Collect signatures; implementation FuncDecl will emit them
        { const _sigs = this._pendingOverloads.get(node.name) ?? [];
          // Check for duplicate/ambiguous signature
          const newSig = (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
          const dupSig = _sigs.find(s => {
            const sig = (s.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
            return sig === newSig;
          });
          if (dupSig) {
            const paramDesc = (node.params ?? []).map(p => `${p.name}: ${p.typeAnn?.name ?? '?'}`).join(', ');
            throw this.error(`TypeError: Ambiguous overload for '${node.name}': duplicate signature '(${paramDesc})'`);
          }
          _sigs.push(node);
          this._pendingOverloads.set(node.name, _sigs); }
        break;
      case 'VarDecl': {
        // process.argv assignment → alias _argv in scope, emit in main
        if (node.init?.kind === 'Member' &&
            node.init.object?.kind === 'Ident' && node.init.object.name === 'process' &&
            node.init.prop === 'argv') {
          this._useArgcArgv = true;
          // Array_string is predefined in runtime.h (no need to emit typedef)
          this._emittedArrayStructs.add('Array_string');
          this.define(node.name, { ctype: 'Array_string', varKind: node.varKind, _cAlias: '_argv' });
          break;
        }
        // volatile<T> global variable → emit as plain global C var (before main)
        if (node.typeAnn?.kind === 'TypeRef' && node.typeAnn.name === 'volatile') {
          const vCtype = this.resolveType(node.typeAnn);
          const vInit = node.init ? this.exprToC(node.init) : '0';
          this.addTop(`${vCtype} ${node.name} = ${vInit};`);
          this.addTop('');
          this.define(node.name, { ctype: vCtype, varKind: node.varKind });
          break;
        }

        // @static decorator: emit as compile-time static backing (BSS-friendly)
        const staticDec = (node.decorators ?? []).find(d => d.name === 'static');
        if (staticDec && node.init?.kind === 'New' && node.init.name === 'Array') {
          const capArg = node.init.args?.[0];
          if (capArg) {
            const capC = this.exprToC(capArg.expr, [], 0);
            const et = node.init.typeArgs?.[0] ? this.resolveType(node.init.typeArgs[0]) : 'int32_t';
            const etId = this.cTypeToIdent(et);
            const dataVar = `${node.name}_data`;
            this.topLevel.push(`static ${et} ${dataVar}[${capC}];`);
            this.topLevel.push(`static struct { ${et} *data; size_t length; size_t capacity; } ${node.name} = {`);
            this.topLevel.push(`    .data = ${dataVar}, .length = 0, .capacity = ${capC}`);
            this.topLevel.push(`};`);
            this.topLevel.push('');
            const arrName = `Array_${etId}`;
            this.define(node.name, { ctype: arrName, varKind: node.varKind, elemType: etId, arrElemCType: et, isArray: true, _isStaticArray: true });
            break;
          }
        }
        if (staticDec && node.typeAnn?.kind === 'TypeFixedArray') {
          const et = this.resolveType(node.typeAnn.element);
          const size = node.typeAnn.size;
          if (this._ramSize != null) {
            const bytes = size * this._cTypeBytes(et);
            this._bssUsage = (this._bssUsage ?? 0) + bytes;
            if (this._bssUsage > this._ramSize) {
              throw this.error(`TypeError: Static BSS usage (${this._bssUsage} bytes) exceeds ram_size (${this._ramSize} bytes)`);
            }
          }
          const initLines = [];
          this.visitStmt(node, initLines, 0);
          // Rewrite the emitted line to be static
          for (const line of initLines) {
            const trimmed = line.trim();
            if (trimmed) this.topLevel.push('static ' + trimmed);
          }
          this.topLevel.push('');
          this.define(node.name, { ctype: et, varKind: node.varKind, isFixedArray: true, arraySize: size });
          break;
        }
        if (staticDec && node.init?.kind === 'New' && node.init.name === 'Map') {
          const capArg = node.init.args?.[0];
          if (capArg) {
            const capC = this.exprToC(capArg.expr, [], 0);
            const [kt, vt] = (node.init.typeArgs ?? []).map(t => this.resolveType(t));
            const k = kt ?? 'int32_t';
            const v = vt ?? 'int32_t';
            const kId = this.cTypeToIdent(k);
            const vId = this.cTypeToIdent(v);
            const smType = `StaticMap_${kId}_${vId}`;
            if (!this._emittedStaticMaps.has(smType)) {
              this._emittedStaticMaps.add(smType);
              this.addTop(`typedef struct {`);
              this.addTop(`    ${k} keys[${capC}];`);
              this.addTop(`    ${v} values[${capC}];`);
              this.addTop(`    bool used[${capC}];`);
              this.addTop(`    size_t capacity;`);
              this.addTop(`    size_t count;`);
              this.addTop(`} ${smType};`);
              this.addTop('');
            }
            this.topLevel.push(`static ${smType} ${node.name} = {.capacity = ${capC}};`);
            this.topLevel.push('');
            this.define(node.name, { ctype: smType, varKind: node.varKind, _isStaticMap: true, _smSuffix: `${kId}_${vId}` });
            break;
          }
        }

        // Make it a static global if: referenced by a top-level function body,
        // OR in library mode (no main()), OR @static decorator forces BSS lifetime
        const needsStatic = this._libraryMode || this._funcRefVars?.has(node.name) || !!staticDec;
        if (needsStatic) {
          // Module-level variable → static global (not inside main)
          const _origName = node.name;
          if (this._modulePrefix) node.name = this._modulePrefix + _origName;
          const varLines = [];
          this.visitStmt(node, varLines, 0);
          node.name = _origName;
          for (const line of varLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.topLevel.push('static ' + trimmed);
          }
          this.topLevel.push('');
          if (this._modulePrefix) {
            const _cName = this._modulePrefix + _origName;
            const _sym = this.lookup(_cName);
            if (_sym) {
              this.scopes[this.scopes.length - 1].delete(_cName);
              _sym._cAlias = _cName;
              this.define(_origName, _sym);
            }
          }
        } else {
          // Runtime-init variable → stays inside main()
          this.visitStmtInMain(node);
        }
        break;
      }
      case 'ExtensionFunc': this.visitExtensionFunc(node); break;
      case 'DeclareConst':    this.visitDeclareConst(node); break;
      case 'DeclareFunction': this.visitDeclareFunction(node); break;
      case 'DeclareModule':   this.visitDeclareModule(node); break;
      case 'Noop':        break;
      default:
        // Top-level expression (e.g. console.log at top level)
        this.visitStmtInMain(node);
    }
  },

  visitDeclareModule(node) {
    this._declaredModules.set(node.moduleName, node.body);
  },

  visitDeclareConst(node) {
    const prevDeclare = this._inDeclare;
    this._inDeclare = true;
    const { name, typeAnn, init } = node;
    const ct = this.resolveType(typeAnn);
    const initC = init ? this.exprToC(init, [], 0) : '0';
    this.topLevel.push(`static const ${ct} ${name} = ${initC};`);
    this.topLevel.push('');
    // Register in scope so later references work
    this.define(name, { ctype: ct, varKind: 'const' });
    this._inDeclare = prevDeclare;
  },

  visitDeclareFunction(node) {
    const prevDeclare = this._inDeclare;
    this._inDeclare = true;
    const { name, params, returnType } = node;
    const retC = returnType ? this.resolveType(returnType) : 'void';
    const paramParts = (params ?? []).map(p => {
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });
    const paramStr = paramParts.length > 0 ? paramParts.join(', ') : 'void';
    // Try to include a known library for well-known math functions
    const mathFuncs = new Set(['sin','cos','tan','asin','acos','atan','atan2','sqrt','pow','exp','log','log2','log10','floor','ceil','fabs','fmod','hypot']);
    if (mathFuncs.has(name)) this.includes.add('#include <math.h>');
    this.topLevel.push(`extern ${retC} ${name}(${paramStr});`);
    this.topLevel.push('');
    // Register in scope
    this.define(name, { ctype: retC, varKind: 'const', funcName: name, params: node.params ?? [] });
    this._inDeclare = prevDeclare;
  },
};
