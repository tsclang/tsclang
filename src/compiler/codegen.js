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
    parts.push(...this.topLevel);
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
      case 'TypeAlias':   break; // type-only, no C output
      case 'FuncDecl':    this.visitFuncDecl(node, true); break;
      case 'FuncOverload': break; // skip overload signatures
      case 'VarDecl':     this.visitGlobalVar(node); break;
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
    const { name, superClass, members, decorators } = node;
    const fields = members.filter(m => m.kind === 'Field');
    const methods = members.filter(m => m.kind === 'Method');
    this.classes.set(name, { fields, methods, superClass });

    // typedef struct
    let structBody = '';
    if (superClass) structBody += `    ${superClass} _base;\n`;
    for (const f of fields) {
      const ctype = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
      structBody += `    ${ctype} ${f.name};\n`;
    }
    this.addTop(`typedef struct { ${fields.map(f => {
      const ct = f.typeAnn ? this.resolveType(f.typeAnn) : 'int32_t';
      return `${ct} ${f.name}`;
    }).join('; ')};${superClass ? ' /* extends ' + superClass + ' */' : ''} } ${name};`);
    this.addTop('');

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

    const methods = members.filter(m => m.kind === 'MethodSig');
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
  visitEnum(node) {
    const { name, members } = node;
    let counter = 0;
    const entries = members.map(m => {
      const val = m.value ? this.exprToC(m.value) : String(counter++);
      if (!m.value) ; else { try { counter = parseInt(val) + 1; } catch {} }
      return { name: m.name, val };
    });
    this.addTop(`typedef enum { ${entries.map(e => `${name}_${e.name} = ${e.val}`).join(', ')} } ${name};`);
    this.addTop(`static const ${name} ${name}_values[] = { ${entries.map(e => `${name}_${e.name}`).join(', ')} };`);
    this.addTop(`static const char *${name}_names[] = { ${entries.map(e => `"${e.name}"`).join(', ')} };`);
    this.addTop('');
    this.classes.set(name, { isEnum: true, members: entries });
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
    const { name, params, returnType, body, generator, decorators } = node;
    const retType = returnType ? this.resolveType(returnType) : 'void';
    const suffix = mangleParams(params);
    const cname = name ? `${name}${suffix}` : `_anon_${this.lambdaCount++}`;

    const paramStrs = params.map(p => {
      if (p.rest) {
        const et = p.typeAnn ? this.resolveType(p.typeAnn) : 'int32_t';
        return `${et} *${p.name}, int32_t ${p.name}_count`;
      }
      const ct = p.typeAnn ? this.resolveType(p.typeAnn) : 'void *';
      return `${ct} ${p.name}`;
    });

    const lines = this.emitFuncBody(name, body, params, retType);
    this.addTop(`${retType} ${cname}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');

    if (name) this.define(name, { ctype: retType, funcName: cname });
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
    for (const p of params) {
      if (p.typeAnn) this.define(p.name, { ctype: this.resolveType(p.typeAnn) });
    }
    this.visitBlock(body, lines, 0);
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
    const ind = (d = depth) => ' '.repeat(this.indent * (d + 1));
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': {
        const { varKind, name, typeAnn, init } = node;
        let ctype = typeAnn ? this.resolveType(typeAnn) : (init ? this.inferType(init) : 'int32_t');
        const qualifier = varKind === 'const' ? 'const ' : '';
        if (init) {
          // Special: arrow function → capture as function pointer
          if (init.kind === 'Arrow') {
            const lambdaName = this.hoistArrow(init, ctype, name);
            lines.push(`${qualifier}${ctype} (*${name})(${this.arrowParamTypes(init)}) = ${lambdaName};`);
          } else {
            const initC = this.exprToC(init, lines, depth);
            lines.push(`${qualifier}${ctype} ${name} = ${initC};`);
          }
        } else {
          lines.push(`${qualifier}${ctype} ${name} = {0};`);
        }
        this.define(name, { ctype, varKind });
        break;
      }

      case 'VarDestructObj': {
        const { varKind, pattern, init } = node;
        const initC = this.exprToC(init, lines, depth);
        const tmpName = `_obj_${this.tempCount++}`;
        const objType = this.inferType(init);
        lines.push(`${objType} ${tmpName} = ${initC};`);
        for (const { name, alias, defaultVal } of pattern) {
          const qual = varKind === 'const' ? 'const ' : '';
          if (defaultVal) {
            const dC = this.exprToC(defaultVal, lines, depth);
            lines.push(`${qual}int32_t ${alias} = (${tmpName}.${name} != 0) ? ${tmpName}.${name} : ${dC};`);
          } else {
            lines.push(`${qual}int32_t ${alias} = ${tmpName}.${name};`);
          }
          this.define(alias, { ctype: 'int32_t', varKind });
        }
        break;
      }

      case 'VarDestructArr': {
        const { varKind, pattern, init } = node;
        const initC = this.exprToC(init, lines, depth);
        const tmpName = `_arr_${this.tempCount++}`;
        lines.push(`__auto_type ${tmpName} = ${initC};`);
        for (let i = 0; i < pattern.length; i++) {
          const elem = pattern[i];
          if (!elem) continue;
          const qual = varKind === 'const' ? 'const ' : '';
          if (elem.rest) {
            lines.push(`/* rest: ${elem.name} */`);
          } else {
            lines.push(`${qual}int32_t ${elem.name} = ${tmpName}._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind });
          }
        }
        break;
      }

      case 'ExprStmt': {
        const c = this.exprToC(node.expr, lines, depth);
        if (c && c !== '') lines.push(`${c};`);
        break;
      }

      case 'Return': {
        if (node.value) {
          const c = this.exprToC(node.value, lines, depth);
          lines.push(`return ${c};`);
        } else {
          lines.push('return;');
        }
        break;
      }

      case 'If': {
        const testC = this.exprToC(node.test, lines, depth);
        lines.push(`if (${testC}) {`);
        this.visitStmtOrBlock(node.consequent, lines, depth + 1);
        if (node.alternate) {
          lines.push('} else {');
          this.visitStmtOrBlock(node.alternate, lines, depth + 1);
        }
        lines.push('}');
        break;
      }

      case 'Block': {
        lines.push('{');
        this.visitBlock(node, lines, depth + 1);
        lines.push('}');
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
        lines.push(`for (${initC}; ${testC}; ${updC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        lines.push('}');
        break;
      }

      case 'ForOf': {
        const iterC = this.exprToC(node.iterable, lines, depth);
        const ivar = `_i_${this.tempCount++}`;
        // Determine element type from binding
        let elemType = 'int32_t';
        if (node.binding.kind === 'Ident') {
          if (node.binding.typeAnn) elemType = this.resolveType(node.binding.typeAnn);
        }
        const qual = node.varKind === 'const' ? 'const ' : '';
        const bindName = node.binding.kind === 'Ident' ? node.binding.name : null;

        lines.push(`for (size_t ${ivar} = 0; ${ivar} < ${iterC}.length; ${ivar}++) {`);
        if (bindName) {
          lines.push(`    ${qual}${elemType} ${bindName} = ${iterC}.data[${ivar}];`);
          this.define(bindName, { ctype: elemType, varKind: node.varKind });
        } else if (node.binding.kind === 'ArrayPattern') {
          // [k, v] destructure
          for (let i = 0; i < node.binding.elems.length; i++) {
            const elem = node.binding.elems[i];
            if (!elem) continue;
            lines.push(`    ${qual}int32_t ${elem.name} = ${iterC}.data[${ivar}]._${i};`);
            this.define(elem.name, { ctype: 'int32_t', varKind: node.varKind });
          }
        }
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        lines.push('}');
        break;
      }

      case 'ForIn': {
        // Iterating object keys — not common in TSClang, emit warning comment
        lines.push(`/* for-in not supported */`);
        break;
      }

      case 'While': {
        const testC = this.exprToC(node.test, lines, depth);
        lines.push(`while (${testC}) {`);
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        lines.push('}');
        break;
      }

      case 'DoWhile': {
        const testC = this.exprToC(node.test, lines, depth);
        lines.push('do {');
        this.visitStmtOrBlock(node.body, lines, depth + 1);
        lines.push(`} while (${testC});`);
        break;
      }

      case 'Break':    lines.push('break;'); break;
      case 'Continue': lines.push('continue;'); break;

      case 'Throw': {
        // In TSClang, throw becomes returning a Result with error
        const errC = this.exprToC(node.value, lines, depth);
        lines.push(`/* throw */ fprintf(stderr, "Error\\n"); exit(1); (void)(${errC});`);
        break;
      }

      case 'TryCatch': {
        this.visitBlock(node.body, lines, depth);
        // catches handled at semantic level; for now just emit the blocks
        for (const c of node.catches) {
          lines.push(`/* catch (${c.param}: ${c.typeAnn ? this.resolveType(c.typeAnn) : 'any'}) */`);
          this.visitBlock(c.body, lines, depth);
        }
        if (node.finally) {
          lines.push('/* finally */');
          this.visitBlock(node.finally, lines, depth);
        }
        break;
      }

      case 'Switch': {
        const discC = this.exprToC(node.discriminant, lines, depth);
        lines.push(`switch (${discC}) {`);
        for (const c of node.cases) {
          if (c.test) lines.push(`    case ${this.exprToC(c.test, lines, depth)}:`);
          else        lines.push('    default:');
          for (const s of c.body) this.visitStmt(s, lines, depth + 1);
        }
        lines.push('}');
        break;
      }

      case 'Native': {
        // Inline C snippet
        lines.push(node.content);
        break;
      }

      case 'Unsafe': {
        lines.push('{');
        this.visitBlock(node.body, lines, depth + 1);
        lines.push('}');
        break;
      }

      case 'Spawn': {
        // stub
        lines.push('/* spawn block — not yet implemented */');
        break;
      }

      case 'Noop': break;
      default:
        lines.push(`/* unhandled stmt: ${node.kind} */`);
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
        const kw = {
          'true': 'true', 'false': 'false', 'null': 'NULL',
          'undefined': 'NULL', 'this': 'self',
        };
        return kw[node.name] ?? node.name;
      }

      case 'Binary': return this.binaryToC(node, lines, depth);
      case 'Unary':  return this.unaryToC(node, lines, depth);
      case 'Assign': return this.assignToC(node, lines, depth);
      case 'Ternary': {
        const c = this.exprToC(node.cond, lines, depth);
        const y = this.exprToC(node.yes, lines, depth);
        const n = this.exprToC(node.no, lines, depth);
        return `(${c}) ? ${y} : ${n}`;
      }

      case 'Member': {
        const objC = this.exprToC(node.object, lines, depth);
        // Detect if object is a pointer
        const sym = node.object.kind === 'Ident' ? this.lookup(node.object.name) : null;
        const isPtr = sym?.isPointer;
        return isPtr ? `${objC}->${node.prop}` : `${objC}.${node.prop}`;
      }

      case 'Index': {
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
        const exprC = this.exprToC(node.expr, lines, depth);
        const ct = this.resolveType(node.castType);
        return `(${ct})${exprC}`;
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
    // Number: keep as-is
    let v = node.value;
    if (v.startsWith('0x') || v.startsWith('0X')) return v;
    if (v.includes('.') || v.includes('e') || v.includes('E')) {
      // f32 suffix
      return v;
    }
    return v;
  }

  // ----------------------------------------------------------------
  // Binary
  // ----------------------------------------------------------------
  binaryToC(node, lines, depth) {
    const l = this.exprToC(node.left, lines, depth);
    const r = this.exprToC(node.right, lines, depth);
    const opMap = {
      '===': '==', '!==': '!=',
      '&&':  '&&', '||': '||', '??': '||',
    };
    const op = opMap[node.op] ?? node.op;

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
    const l = this.exprToC(node.left, lines, depth);
    const r = this.exprToC(node.right, lines, depth);
    return `${l} ${node.op} ${r}`;
  }

  // ----------------------------------------------------------------
  // Calls
  // ----------------------------------------------------------------
  callToC(node, lines, depth) {
    const { callee, args } = node;

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

    // Plain function call
    const calleeC = this.exprToC(callee, lines, depth);
    const argsC = this.argsToC(args, lines, depth);
    return `${calleeC}(${argsC})`;
  }

  consoleCall(method, args, lines, depth) {
    const file = (method === 'error' || method === 'warn' || method === 'debug') ? 'stderr' : 'stdout';
    const printFn = file === 'stderr' ? 'fprintf(stderr, ' : 'printf(';

    if (args.length === 0) {
      return `${printFn === 'printf(' ? 'printf' : 'fprintf(stderr'}("\\n")`;
    }

    // Build format string + args
    const fmtParts = [];
    const fmtArgs  = [];

    for (const arg of args) {
      const expr = arg.expr;
      const cexpr = this.exprToC(expr, lines, depth);
      const ctype = this.inferType(expr);

      if (ctype === 'String') {
        fmtParts.push('%s');
        fmtArgs.push(`${cexpr}.data`);
      } else if (ctype === 'bool') {
        fmtParts.push('%s');
        fmtArgs.push(`(${cexpr}) ? "true" : "false"`);
      } else if (ctype === 'double' || ctype === 'float') {
        fmtParts.push('%g');
        fmtArgs.push(cexpr);
      } else if (ctype === 'int64_t') {
        fmtParts.push('%lld');
        fmtArgs.push(`(long long)(${cexpr})`);
      } else if (ctype === 'uint64_t') {
        fmtParts.push('%llu');
        fmtArgs.push(`(unsigned long long)(${cexpr})`);
      } else if (ctype === 'uint8_t' || ctype === 'uint16_t' || ctype === 'uint32_t') {
        fmtParts.push('%u');
        fmtArgs.push(cexpr);
      } else if (ctype === 'char') {
        fmtParts.push('%c');
        fmtArgs.push(cexpr);
      } else if (ctype === 'size_t') {
        fmtParts.push('%zu');
        fmtArgs.push(cexpr);
      } else {
        fmtParts.push('%d');
        fmtArgs.push(cexpr);
      }
    }

    const fmt = '"' + fmtParts.join(' ') + '\\n"';
    const allArgs = [fmt, ...fmtArgs].join(', ');

    if (file === 'stderr') return `fprintf(stderr, ${allArgs})`;
    return `printf(${allArgs})`;
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
      indexOf:    () => `tsc_string_index_of(${objC}, ${this.exprToC(args[0].expr, lines, depth)})`,
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

    // Map methods
    const mapMethods = ['set','get','has','delete','keys','values','entries','size','forEach','clear'];

    if (arrMethods[prop]) return arrMethods[prop]();
    if (strMethods[prop]) return strMethods[prop]();

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
    return args.map(a => {
      if (a.spread) return `/* ...${this.exprToC(a.expr, lines, depth)} */`;
      return this.exprToC(a.expr, lines, depth);
    }).join(', ');
  }

  // ----------------------------------------------------------------
  // new Foo() → Foo_new() or Foo = {0}
  // ----------------------------------------------------------------
  newToC(node, lines, depth) {
    const { name, args } = node;
    const argsC = this.argsToC(args, lines, depth);

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
    const name = `_lambda_${n}_fn`;
    // Determine return type from body
    let ret = retType === 'void' ? this.inferArrowReturn(node) : retType;
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
    this.addTop(`static ${ret} ${name}(${paramStrs.join(', ') || 'void'}) {`);
    for (const l of lines) this.addTop('    ' + l);
    this.addTop('}');
    this.addTop('');
    return name;
  }

  inferArrowReturn(node) {
    if (node.returnType) return this.resolveType(node.returnType);
    if (node.body.kind !== 'Block') return this.inferType(node.body);
    return 'void';
  }

  arrowParamTypes(node) {
    return (node.params ?? []).map(p => p.typeAnn ? this.resolveType(p.typeAnn) : 'void *').join(', ');
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

      // User-defined type
      return name;
    }

    if (typeNode.kind === 'TypeArray') {
      const et = this.resolveType(typeNode.element);
      return `Array_${this.cTypeToIdent(et)}`;
    }

    if (typeNode.kind === 'TypeUnion') {
      // T | null → opt_T
      const nonNull = typeNode.types.filter(t => !(t.kind === 'TypeRef' && (t.name === 'null' || t.name === 'undefined')));
      if (nonNull.length === 1) {
        const inner = this.resolveType(nonNull[0]);
        return `opt_${this.cTypeToIdent(inner)}`;
      }
      return 'void *';
    }

    return 'void';
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
        return sym?.ctype ?? 'int32_t';
      }
      case 'Binary': {
        if (['+','-','*','/','%'].includes(node.op)) {
          const lt = this.inferType(node.left);
          const rt = this.inferType(node.right);
          if (lt === 'String' || rt === 'String') return 'String';
          if (lt === 'double' || rt === 'double') return 'double';
          if (lt === 'float'  || rt === 'float')  return 'float';
          return lt;
        }
        return 'bool';
      }
      case 'Member': {
        if (node.prop === 'length') return 'size_t';
        if (node.prop === 'data')   return 'const char *';
        return 'int32_t';
      }
      case 'Call': {
        if (node.callee.kind === 'Member') {
          if (node.callee.object.kind === 'Ident' && node.callee.object.name === 'performance') return 'double';
        }
        return 'int32_t';
      }
      case 'New':  return node.name;
      case 'ObjLit': return 'int32_t';
      case 'ArrayLit': {
        const first = node.elems.find(e => !e.spread);
        const et = first ? this.inferType(first.expr) : 'int32_t';
        return `Array_${this.cTypeToIdent(et)}`;
      }
      case 'Cast':   return this.resolveType(node.castType);
      case 'Ternary': return this.inferType(node.yes);
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
    return m[ctype] ?? ctype.replace(/[^a-zA-Z0-9]/g, '_');
  }

  ctypeToTsName(ctype) {
    const m = {
      'int32_t': 'i32', 'int64_t': 'i64', 'uint8_t': 'u8',
      'double': 'f64', 'float': 'f32', 'bool': 'bool',
      'String': 'string', 'size_t': 'usize',
    };
    return m[ctype] ?? ctype;
  }
}
