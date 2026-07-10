import type { Stmt, Param, Decorator, TypeAnn, TypeRef, FuncOverload, DeclareModule, DeclareConst, DeclareFunction, VarDeclItem } from '@tsclang/ast';
import type { CodeGenContext, DeclareModuleEntry } from '../../codegen.js';
// dispatch.ts
import { handleStdlibImport, LANGUAGE_BUILTINS } from '../../stdlib-registry.js';
export function visitTopLevel(ctx: CodeGenContext, node: Stmt) {
    if (!node) return;
    switch (node.kind) {
      case 'Import':
        // Check if source is a declared ambient module (declare module "name" { ... })
        if (ctx._declaredModules?.has(node.source)) {
          const decls = ctx._declaredModules.get(node.source)!;
          const requestedNames = new Set((node.names ?? []).map((n: string | { name: string }) => typeof n === 'object' ? n.name : n));
          for (const decl of decls) {
            if (!requestedNames.size || requestedNames.has(decl.name)) {
              if (decl.kind === 'DeclareFunction') ctx.visitDeclareFunction(decl as DeclareFunction);
              else if (decl.kind === 'DeclareConst') {
                const ct = ctx.resolveType(decl.typeAnn);
                ctx.topLevel.push(`extern ${ct} ${decl.name};`);
                ctx.topLevel.push('');
                ctx.define(decl.name, { ctype: ct, varKind: 'const' });
              }
            }
          }
          break;
        }
        // Handle stdlib imports via registry
        if (handleStdlibImport(ctx, node)) {
          break;
        }
      case 'ExportFrom': {
        // export { X, Y } from "./module"  OR  export { X, Y }  OR  export { X as Y }
        const { names, source } = node;
        if (source) {
          const resolvedPath = ctx._sourceToPath?.[source];
          const moduleExports = resolvedPath ? ctx._importedModules?.[resolvedPath] : null;
          for (const n of (names ?? [])) {
            const origName = typeof n === 'object' ? n.name : n;
            const localName = typeof n === 'object' && n.alias ? n.alias : origName;
            const entry = moduleExports?.[origName] ?? ctx.lookup(origName);
            if (entry) {
              ctx.define(localName, entry);
              ctx._exports.set(localName, entry);
            }
          }
        } else {
          for (const n of (names ?? [])) {
            const origName = typeof n === 'object' ? n.name : n;
            const exportName = typeof n === 'object' && n.alias ? n.alias : origName;
            let entry = ctx.lookup(origName);
            if (!entry) {
              entry = ctx.classes.get(origName) ?? null;
              if (!entry && ctx._typeAliases?.has(origName)) {
                entry = { _isTypeAlias: true, cType: ctx._typeAliases.get(origName) };
              }
            }
            if (entry) ctx._exports.set(exportName, entry);
          }
        }
        break;
      }
      case 'Export': {
        if (node.default) throw ctx.error('"export default" is not allowed; use named exports only');
        if (node.decl?.kind === 'FuncDecl') {
          ctx.visitFuncDecl(node.decl, true, true); // isExported=true → no static
        } else if (node.decl?.kind === 'ExtensionFunc') {
          ctx.visitExtensionFunc(node.decl);
        } else {
          ctx.visitTopLevel(node.decl);
        }
        // Track exported symbol for bundle system
        const _exportedName = (node.decl as { name?: string }).name;
        if (_exportedName) {
          let _entry = ctx.lookup(_exportedName);
          if (!_entry) {
            // Types live in type tables, not scope
            _entry = ctx.classes.get(_exportedName) ?? null;
            if (!_entry && ctx._typeAliases?.has(_exportedName)) {
              _entry = { _isTypeAlias: true, cType: ctx._typeAliases.get(_exportedName) };
            }
          }
          if (_entry) ctx._exports.set(_exportedName, _entry);
        }
        break;
      }
      case 'ClassDecl':   ctx.visitClassDecl(node); break;
      case 'Interface':   ctx.visitInterface(node); break;
      case 'Enum':        ctx.visitEnum(node); break;
      case 'TypeAlias':   ctx.visitTypeAlias(node); break;
      case 'FuncDecl':    ctx.visitFuncDecl(node, true, false); break; // not exported → static
      case 'FuncOverload':
        // Collect signatures; implementation FuncDecl will emit them

        { const _sigs = ctx._pendingOverloads.get(node.name) ?? [];
          // Check for duplicate/ambiguous signature
          const newSig = (node.params ?? []).map((p: Param) => p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *').join(', ');
          const dupSig = _sigs.find((s: FuncOverload) => {
            const sig = (s.params ?? []).map((p: Param) => p.typeAnn ? ctx.resolveType(p.typeAnn) : 'void *').join(', ');
            return sig === newSig;
          });
          if (dupSig) {
            const paramDesc = (node.params ?? []).map((p: Param) => `${p.name}: ${(p.typeAnn as TypeRef | undefined)?.name ?? '?'}`).join(', ');
            throw ctx.errorCode('E119', null, { detail: `ambiguous overload for '${node.name}': duplicate signature '(${paramDesc})'` });
          }
          _sigs.push(node);
          ctx._pendingOverloads.set(node.name, _sigs); }
        break;
      case 'VarDecl': {
        // process.argv assignment → alias _argv in scope, emit in main
        if (node.init?.kind === 'Member' &&
            node.init.object?.kind === 'Ident' && node.init.object.name === 'process' &&
            node.init.prop === 'argv') {
          ctx._useArgcArgv = true;
          // Array_string is predefined in runtime.h (no need to emit typedef)

          ctx._emittedArrayStructs.add('Array_string');
          ctx.define(node.name, { ctype: 'Array_string', varKind: node.varKind, _cAlias: '_argv' });
          break;
        }
        // volatile<T> global variable → emit as plain global C var (before main)
        if (node.typeAnn?.kind === 'TypeRef' && node.typeAnn.name === 'volatile') {
          const vCtype = ctx.resolveType(node.typeAnn);
          const vInit = node.init ? ctx.exprToC(node.init) : '0';
          ctx.addTop(`${vCtype} ${node.name} = ${vInit};`);
          ctx.addTop('');
          ctx.define(node.name, { ctype: vCtype, varKind: node.varKind });
          break;
        }

        // @static decorator: emit as compile-time static backing (BSS-friendly)
        const staticDec = (node.decorators ?? []).find((d: Decorator) => d.name === 'static');
        if (staticDec && node.init?.kind === 'New' && node.init.name === 'Array') {
          const capArg = node.init.args?.[0];
          if (capArg) {
            const capC = ctx.exprToC(capArg.expr, [], 0);
            const et = node.init.typeArgs?.[0] ? ctx.resolveType(node.init.typeArgs[0]) : 'int32_t';
            const etId = ctx.cTypeToIdent(et);
            const dataVar = `${node.name}_data`;
            ctx.topLevel.push(`static ${et} ${dataVar}[${capC}];`);
            ctx.topLevel.push(`static struct { ${et} *data; size_t length; size_t capacity; } ${node.name} = {`);
            ctx.topLevel.push(`    .data = ${dataVar}, .length = 0, .capacity = ${capC}`);
            ctx.topLevel.push(`};`);
            ctx.topLevel.push('');
            const arrName = `Array_${etId}`;
            ctx.define(node.name, { ctype: arrName, varKind: node.varKind, elemType: etId, arrElemCType: et, isArray: true, _isStaticArray: true });
            break;
          }
        }
        if (staticDec && node.typeAnn?.kind === 'TypeFixedArray') {
          const et = ctx.resolveType(node.typeAnn.element);
          const size = node.typeAnn.size;
          if (ctx._ramSize != null) {
            const bytes = size * ctx._cTypeBytes(et);
            ctx._bssUsage = (ctx._bssUsage ?? 0) + bytes;
            if (ctx._bssUsage > ctx._ramSize) {
              throw ctx.error(`TypeError: Static BSS usage (${ctx._bssUsage} bytes) exceeds ram_size (${ctx._ramSize} bytes)`);
            }
          }
          const initLines: string[] = [];
          ctx.visitStmt(node, initLines, 0);
          // Rewrite the emitted line to be static
          for (const line of initLines) {
            const trimmed = line.trim();
            if (trimmed) ctx.topLevel.push('static ' + trimmed);
          }
          ctx.topLevel.push('');
          ctx.define(node.name, { ctype: et, varKind: node.varKind, isFixedArray: true, arraySize: size });
          break;
        }
        if (staticDec && node.init?.kind === 'New' && node.init.name === 'Map') {
          const capArg = node.init.args?.[0];
          if (capArg) {
            const capC = ctx.exprToC(capArg.expr, [], 0);
            const [kt, vt] = (node.init.typeArgs ?? []).map((t: TypeAnn) => ctx.resolveType(t));
            const k = kt ?? 'int32_t';
            const v = vt ?? 'int32_t';
            const kId = ctx.cTypeToIdent(k);
            const vId = ctx.cTypeToIdent(v);
            const smType = `StaticMap_${kId}_${vId}`;

            if (!ctx._emittedStaticMaps.has(smType)) {
              ctx._emittedStaticMaps.add(smType);
              ctx.addTop(`typedef struct {`);
              ctx.addTop(`    ${k} keys[${capC}];`);
              ctx.addTop(`    ${v} values[${capC}];`);
              ctx.addTop(`    bool used[${capC}];`);
              ctx.addTop(`    size_t capacity;`);
              ctx.addTop(`    size_t count;`);
              ctx.addTop(`} ${smType};`);
              ctx.addTop('');
            }
            ctx.topLevel.push(`static ${smType} ${node.name} = {.capacity = ${capC}};`);
            ctx.topLevel.push('');
            ctx.define(node.name, { ctype: smType, varKind: node.varKind, _isStaticMap: true, _smSuffix: `${kId}_${vId}` });
            break;
          }
        }

        // Make it a static global if: referenced by a top-level function body,
        // OR in library mode (no main()), OR @static decorator forces BSS lifetime
        const needsStatic = ctx._libraryMode || ctx._funcRefVars?.has(node.name) || !!staticDec;
        if (needsStatic) {
          // Module-level variable → static global (not inside main)
          const _origName = node.name;
          if (ctx._modulePrefix) node.name = ctx._modulePrefix + _origName;

          // Detect non-constant initializer — C requires static globals to have
          // constant initializers. Split: zero-init declaration + runtime assignment.
          // Use AST inspection (not exprToC) to avoid codegen side effects.
          const _hasCallNode = (nd: unknown): boolean => {
            if (!nd || typeof nd !== 'object') return false;
            if (Array.isArray(nd)) return nd.some(_hasCallNode);
            const n = nd as Record<string, unknown>;
            if (n.kind === 'Call') return true;
            if (n.kind === 'Arrow' || n.kind === 'FuncDecl') return false;
            return _hasCallNode(n.callee) || _hasCallNode(n.object) || _hasCallNode(n.expr) ||
                   _hasCallNode(n.left) || _hasCallNode(n.right) || _hasCallNode(n.init) ||
                   _hasCallNode(n.value) || _hasCallNode(n.args) || _hasCallNode(n.elems);
          };
          let _splitInit: string | null = null;
          if (node.init && _hasCallNode(node.init)) {
            const _savedInit = node.init;
            node.init = null;
            const varLines: string[] = [];
            ctx.visitStmt(node, varLines, 0);
            node.init = _savedInit;
            for (const line of varLines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              ctx.topLevel.push('static ' + trimmed);
            }
            ctx.topLevel.push('');
            // Generate init expression and collect runtime assignment
            const _initC = ctx.exprToC(_savedInit, [], 0);
            _splitInit = `${ctx._modulePrefix ? (ctx._modulePrefix + _origName) : _origName} = ${_initC};`;
            if (ctx._libraryMode) {
              ctx._libInitStmts.push(_splitInit);
            } else {
              ctx.mainStmts.push(_splitInit);
            }
          } else {
            const varLines: string[] = [];
            ctx.visitStmt(node, varLines, 0);
            for (const line of varLines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              ctx.topLevel.push('static ' + trimmed);
            }
            ctx.topLevel.push('');
          }

          node.name = _origName;
          if (ctx._modulePrefix) {
            const _cName = ctx._modulePrefix + _origName;
            const _sym = ctx.lookup(_cName);
            if (_sym) {
              ctx.scopes[ctx.scopes.length - 1].delete(_cName);
              _sym._cAlias = _cName;
              ctx.define(_origName, _sym);
            }
          }
        } else {
          // Runtime-init variable → stays inside main()
          ctx.visitStmtInMain(node);
        }
        break;
      }
      case 'ExtensionFunc': ctx.visitExtensionFunc(node); break;
      case 'VarDecls': node.decls.forEach((d: VarDeclItem) => ctx.visitTopLevel(d)); break;
      case 'DeclareConst':    ctx.visitDeclareConst(node); break;
      case 'DeclareFunction': ctx.visitDeclareFunction(node); break;
      case 'DeclareModule':   ctx.visitDeclareModule(node); break;
      case 'DeclarePlatform': break;
      case 'Noop':        break;
      default:
        // Top-level expression (e.g. console.log at top level)
        ctx.visitStmtInMain(node);
    }
}

export function visitDeclareModule(ctx: CodeGenContext, node: DeclareModule) {

    ctx._declaredModules.set(node.moduleName, node.body as unknown as DeclareModuleEntry[]);
}

export function visitDeclareConst(ctx: CodeGenContext, node: DeclareConst) {
    const prevDeclare = ctx._inDeclare;
    ctx._inDeclare = true;
    const { name, typeAnn, init } = node;
    const ct = ctx.resolveType(typeAnn);
    const initC = init ? ctx.exprToC(init, [], 0) : '0';
    ctx.topLevel.push(`static const ${ct} ${name} = ${initC};`);
    ctx.topLevel.push('');
    // Register in scope so later references work
    ctx.define(name, { ctype: ct, varKind: 'const' });
    ctx._inDeclare = prevDeclare;
}

export function visitDeclareFunction(ctx: CodeGenContext, node: DeclareFunction) {
    const prevDeclare = ctx._inDeclare;
    ctx._inDeclare = true;
    const { name, params, returnType } = node;
    const retC = returnType ? ctx.resolveType(returnType) : 'void';
    const paramParts = (params ?? []).map((p: Param) => {
      const ct = p.typeAnn ? ctx.resolveType(p.typeAnn) : 'int32_t';
      return ct.endsWith(' *') ? `${ct}${p.name}` : `${ct} ${p.name}`;
    });
    const paramStr = paramParts.length > 0 ? paramParts.join(', ') : 'void';
    // Try to include a known library for well-known math functions
    const mathFuncs = new Set(['sin','cos','tan','asin','acos','atan','atan2','sqrt','pow','exp','log','log2','log10','floor','ceil','fabs','fmod','hypot']);
    if (mathFuncs.has(name)) ctx.includes.add('#include <math.h>');
    ctx.topLevel.push(`extern ${retC} ${name}(${paramStr});`);
    ctx.topLevel.push('');
    // Register in scope
    ctx.define(name, { ctype: retC, varKind: 'const', funcName: name, params: node.params ?? [] });
    ctx._inDeclare = prevDeclare;
}
