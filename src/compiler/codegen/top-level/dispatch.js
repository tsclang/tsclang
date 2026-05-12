// dispatch.js
export default {
  visitTopLevel(node) {
    if (!node) return;
    switch (node.kind) {
      case 'ProfileAnnotation': {
        if (node.content.startsWith('isr(')) this._pendingIsrAnnotation = node.content;
        break;
      }
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
        // Handle stdlib imports that require includes or special registration
        if (node.source === 'std/avr') {
          this.includes.add('#include "std/avr.h"');
          // Direct-call avr functions: funcName maps TSClang name → C function
          const _avrFuncMap = {
            pinMode: 'tsc_avr_pin_mode', digitalWrite: 'tsc_avr_digital_write',
            digitalRead: 'tsc_avr_digital_read', delay: 'tsc_avr_delay',
            delayMicroseconds: 'tsc_avr_delay_us', serialBegin: 'tsc_avr_serial_begin',
            serialWrite: 'tsc_avr_serial_write', serialRead: 'tsc_avr_serial_read',
            serialAvailable: 'tsc_avr_serial_available', analogWrite: 'tsc_avr_analog_write',
            interruptEnable: 'tsc_avr_interrupt_enable', interruptDisable: 'tsc_avr_interrupt_disable',
          };
          const _avrReturnTypes = {
            digitalRead: 'bool', serialAvailable: 'bool', serialRead: 'uint8_t',
          };
          for (const name of (node.names ?? [])) {
            if (name === 'SleepMode') { this._avrSleepModeImported = true; continue; }
            if (_avrFuncMap[name]) {
              const _rt = _avrReturnTypes[name];
              this.define(name, { ctype: _rt ?? 'void', funcName: _avrFuncMap[name], varKind: 'const',
                _suppressVoidWarning: !!_rt });
            } else {
              this.define(name, { ctype: '_avr_' + name, varKind: 'const', _isAvrObj: true, _avrName: name });
            }
          }
        } else if (node.source === 'std/random') {
          this._stdRandomImported = true;
        } else if (node.source === 'std/string') {
          for (const name of (node.names ?? [])) {
            if (name === 'atob' || name === 'btoa') this._stdStringBase64 = true;
            else if (name === 'decodeUtf8') this._stdStringDecodeUtf8 = true;
            else if (name === 'encodeUtf8') this._stdStringEncodeUtf8 = true;
            else if (name === 'Regex') this._stdStringRegex = true;
            // 'String' namespace — no extra registration needed
          }
        } else if (node.source === 'std/embedded') {
          this._stdEmbeddedImported = true;
        } else if (node.source === 'std/temporal') {
          this.includes.add('#include "std/temporal.h"');
          this._stdTemporalImported = true;
        } else if (node.source === 'std/fs') {
          if (this._isEmbeddedOrRetro()) {
            throw this.error(`TypeError: 'std/fs' is not available on embedded targets`);
          }
          this.includes.add('#include "std/fs.h"');
          this._stdFsImported = true;
          if (node.namespace && node.names.length > 0) {
            this.define(node.names[0], { ctype: '__fs_namespace__', _isFsNamespace: true, varKind: 'const' });
          }
          this.classes.set('TscFileStat', { isStruct: true,
            fields: [{ name: 'size', ctype: 'int64_t' }, { name: 'isFile', ctype: 'bool' },
                     { name: 'isDirectory', ctype: 'bool' }, { name: 'mtime', ctype: 'int64_t' }] });
        } else if (node.source === 'std/url') {
          this.includes.add('#include "std/url.h"');
          this._stdUrlImported = true;
        } else if (node.source === 'std/blob') {
          // #include "std/blob.h" only added when TscBlob is actually used (isTscBlob path in stmt.js)
          this._stdBlobImported = true;
        } else if (node.source === 'std/io') {
          this.includes.add('#include "std/io.h"');
          this._stdIoImported = true;
          // Register Reader/Writer as vtable interface types
          for (const nm of (node.names ?? [])) {
            if (nm === 'Reader') {
              if (!this._emittedReaderVtable) {
                this._emittedReaderVtable = true;
                // Array_u8 must appear before Reader vtable
                this._ensureArrayStruct('Array_u8', 'uint8_t');
                this.typedefs.push('');
                this.addTop('typedef struct {');
                this.addTop('    size_t (*read)(void *self, uint8_t *buf, size_t len);');
                this.addTop('} Reader_vtable;');
                this.addTop('typedef struct { void *self; const Reader_vtable *vtable; } Reader;');
                this.addTop('');
              }
              this.classes.set('Reader', { isStruct: true, _isVtable: true, _vtableKind: 'Reader',
                fields: [{ name: 'self', ctype: 'void *' }, { name: 'vtable', ctype: 'const Reader_vtable *' }] });
            }
            if (nm === 'Writer') {
              if (!this._emittedWriterVtable) {
                this._emittedWriterVtable = true;
                // Array_u8 must appear before Writer vtable
                this._ensureArrayStruct('Array_u8', 'uint8_t');
                this.typedefs.push('');
                this.addTop('typedef struct {');
                this.addTop('    size_t (*write)(void *self, const uint8_t *buf, size_t len);');
                this.addTop('} Writer_vtable;');
                this.addTop('typedef struct { void *self; const Writer_vtable *vtable; } Writer;');
                this.addTop('');
              }
              this.classes.set('Writer', { isStruct: true, _isVtable: true, _vtableKind: 'Writer',
                fields: [{ name: 'self', ctype: 'void *' }, { name: 'vtable', ctype: 'const Writer_vtable *' }] });
            }
          }
        } else if (node.source === 'std/reactive') {
          this.includes.add('#include "std/reactive.h"');
          this._stdReactiveImported = true;
          this._reactiveClosureCount = 0;
          this._capturedSignalMap = new Map(); // varName → pointer expr like "_closure_0_captured.x"
        } else if (node.source === 'std/ws') {
          this.includes.add('#include "std/ws.h"');
          this._stdWsImported = true;
        } else if (node.source === 'std/net') {
          if (this._isEmbeddedOrRetro()) {
            throw this.error(`TypeError: 'std/net' is not available on embedded targets`);
          }
          this.includes.add('#include "std/net.h"');
          this._stdNetImported = true;
          // Register TscResponse so inferType resolves .ok → bool, .status → int32_t
          this.classes.set('TscResponse', {
            isStruct: true,
            fields: [{ name: 'ok', ctype: 'bool' }, { name: 'status', ctype: 'int32_t' }],
          });
        } else if (node.source === 'std/libc') {
          this.includes.add('#include <stdio.h>');
          const _libcVariadic = new Set(['printf', 'vprintf', 'fprintf', 'vfprintf', 'sprintf', 'vsprintf', 'snprintf', 'vsnprintf', 'scanf', 'sscanf', 'fscanf']);
          for (const nm of (node.names ?? [])) {
            const isVar = _libcVariadic.has(nm);
            this.define(nm, { ctype: 'int32_t', funcName: nm, params: null, _isLibcFunc: true, _isLibcVariadic: isVar });
          }
        } else if (node.source === 'std/hal') {
          if (!this._isEmbeddedOrRetro()) {
            throw this.error(`TypeError: 'std/hal' requires an embedded platform target`);
          }
          this.includes.add('#include "std/hal.h"');
          this._stdHalImported = true;
        }
        break; // stdlib handled via includes
      case 'ExportFrom': {
        // export { X, Y } from "./module"  OR  export { X, Y }
        const { names, source } = node;
        if (source) {
          // Re-export from external module: look up in _importedModules
          const resolvedPath = this._sourceToPath?.[source];
          const moduleExports = resolvedPath ? this._importedModules?.[resolvedPath] : null;
          for (const name of (names ?? [])) {
            const entry = moduleExports?.[name] ?? this.lookup(name);
            if (entry) {
              this.define(name, entry);
              this._exports.set(name, entry);
            }
          }
        } else {
          // export { X, Y } — re-export already-defined symbols
          for (const name of (names ?? [])) {
            const entry = this.lookup(name);
            if (entry) this._exports.set(name, entry);
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
          const _entry = this.lookup(_exportedName);
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
          const varLines = [];
          this.visitStmt(node, varLines, 0);
          for (const line of varLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            this.topLevel.push('static ' + trimmed);
          }
          this.topLevel.push('');
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
    const { name, typeAnn, init } = node;
    const ct = this.resolveType(typeAnn);
    const initC = init ? this.exprToC(init, [], 0) : '0';
    this.topLevel.push(`static const ${ct} ${name} = ${initC};`);
    this.topLevel.push('');
    // Register in scope so later references work
    this.define(name, { ctype: ct, varKind: 'const' });
  },

  visitDeclareFunction(node) {
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
  },
};
