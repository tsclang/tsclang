/**
 * @fileoverview IRGenerator — converts annotated AST to IR.
 *
 * Spec: spec/16-tooling/16-compiler.md — IR section.
 * Issue: #28 — AST to IR translator.
 *
 * Runs standalone (not yet integrated into codegen pipeline — that's #30).
 * Uses memory-based SSA: each declared variable gets one SSA name,
 * assignments modify in place. No phi nodes needed for correctness.
 *
 * Supported AST nodes:
 *   Statements: VarDecl, Return, If, While, For, ExprStmt, Block
 *   Expressions: Literal, Ident, Binary, Unary, Call, Member, Index, Assign, Ternary, Cast
 *
 * Unsupported (TODO — future phases):
 *   ForOf, ForIn, DoWhile, Switch, TryCatch, Throw, Break, Continue
 *   Arrow, FuncExpr, New, ArrayLit, ObjLit, TemplateLit, Match, Await, Yield
 */

import { IRModule, IRFunction, IRBasicBlock, IRInstruction } from './index.js';

export class IRGenerator {
  constructor(opts = {}) {
    this.opts = opts;
  }

  /**
   * Generate IR from a Program AST.
   * @param {{kind: 'Program', body: []}} ast
   * @returns {IRModule}
   */
  generate(ast) {
    const mod = new IRModule('main');
    this._module = mod;

    for (const stmt of ast.body) {
      if (stmt.kind === 'FuncDecl' && stmt.body) {
        mod.addFunction(this._lowerFunction(stmt));
      }
    }
    return mod;
  }

  // ─── Function lowering ───────────────────────────────────────────────

  _lowerFunction(funcDecl) {
    const returnType = funcDecl.returnType
      ? this._typeName(funcDecl.returnType)
      : 'void';

    const params = (funcDecl.params || []).map(p => ({
      name: p.name,
      ctype: p.typeAnn ? this._typeName(p.typeAnn) : 'auto',
    }));

    const fn = new IRFunction(funcDecl.name || '<anonymous>', returnType, params);
    this._fn = fn;

    const entry = fn.addBlock('entry');
    this._currentBlock = entry;

    // Scope tracking: variable name → SSA name
    this._scopes = [new Map()];
    // Register params at function scope
    for (const p of params) {
      this._scopes[0].set(p.name, p.name);
    }

    // Block counter for unique labels
    this._blockCounter = 0;

    if (funcDecl.body) {
      this._lowerBlock(funcDecl.body);
    }

    // Implicit void return if block is unterminated
    if (this._currentBlock && this._currentBlock.terminator === null) {
      this._currentBlock.setTerminator(IRInstruction.ret());
    }

    return fn;
  }

  // ─── Statement lowering ──────────────────────────────────────────────

  _lowerBlock(block) {
    if (!block || !block.body) return;
    this._pushScope();
    for (const stmt of block.body) {
      this._lowerStatement(stmt);
    }
    this._popScope();
  }

  _lowerStatement(stmt) {
    if (!stmt || !stmt.kind) return;
    if (!this._currentBlock || this._currentBlock.terminator !== null) return;

    switch (stmt.kind) {
      case 'VarDecl':
        this._lowerVarDecl(stmt);
        break;
      case 'Return':
        this._lowerReturn(stmt);
        break;
      case 'If':
        this._lowerIf(stmt);
        break;
      case 'While':
        this._lowerWhile(stmt);
        break;
      case 'For':
        this._lowerFor(stmt);
        break;
      case 'ExprStmt':
        this._lowerExprStmt(stmt);
        break;
      case 'Block':
        this._lowerBlock(stmt);
        break;
      default:
        // Unsupported statement — skip for now
        break;
    }
  }

  _lowerVarDecl(stmt) {
    const type = stmt.typeAnn ? this._typeName(stmt.typeAnn) : 'auto';
    const ssaName = this._fn.freshName(stmt.name);
    this._defineVar(stmt.name, ssaName);

    if (stmt.init) {
      const initVal = this._lowerExpression(stmt.init);
      this._emit(IRInstruction.alloc(ssaName, type, initVal, this._loc(stmt)));
    } else {
      this._emit(IRInstruction.alloc(ssaName, type, undefined, this._loc(stmt)));
    }
  }

  _lowerReturn(stmt) {
    if (stmt.value) {
      const val = this._lowerExpression(stmt.value);
      this._currentBlock.setTerminator(IRInstruction.ret(val, this._loc(stmt)));
    } else {
      this._currentBlock.setTerminator(IRInstruction.ret(undefined, this._loc(stmt)));
    }
  }

  _lowerIf(stmt) {
    const cond = this._lowerExpression(stmt.test);
    const id = this._blockCounter++;
    const thenLabel = `then_${id}`;
    const endLabel = `end_${id}`;
    const hasElse = stmt.alternate != null;
    const elseLabel = hasElse ? `else_${id}` : endLabel;

    this._currentBlock.setTerminator(IRInstruction.branch(cond, thenLabel, elseLabel));

    // Then block
    this._currentBlock = this._fn.addBlock(thenLabel);
    this._lowerStatement(stmt.consequent);
    const thenFalls = this._currentBlock !== null && this._currentBlock.terminator === null;
    if (thenFalls) this._currentBlock.setTerminator(IRInstruction.jump(endLabel));

    // Else block
    let elseFalls = false;
    if (hasElse) {
      this._currentBlock = this._fn.addBlock(elseLabel);
      this._lowerStatement(stmt.alternate);
      elseFalls = this._currentBlock !== null && this._currentBlock.terminator === null;
      if (elseFalls) this._currentBlock.setTerminator(IRInstruction.jump(endLabel));
    }

    // Merge block: needed if any branch falls through, or if no else
    // (when no else, branch targets endLabel directly → block must exist)
    const needMerge = !hasElse || thenFalls || elseFalls;
    if (needMerge) {
      this._currentBlock = this._fn.addBlock(endLabel);
    } else {
      this._currentBlock = null;
    }
  }

  _lowerWhile(stmt) {
    const id = this._blockCounter++;
    const condLabel = `while_cond_${id}`;
    const bodyLabel = `while_body_${id}`;
    const endLabel = `while_end_${id}`;

    this._currentBlock.setTerminator(IRInstruction.jump(condLabel));

    const condBlock = this._fn.addBlock(condLabel);
    const cond = this._lowerExpressionInBlock(stmt.test, condBlock);
    condBlock.setTerminator(IRInstruction.branch(cond, bodyLabel, endLabel));

    const bodyBlock = this._fn.addBlock(bodyLabel);
    this._currentBlock = bodyBlock;
    this._lowerStatement(stmt.body);
    if (this._currentBlock && this._currentBlock.terminator === null) {
      this._currentBlock.setTerminator(IRInstruction.jump(condLabel));
    }

    const endBlock = this._fn.addBlock(endLabel);
    this._currentBlock = endBlock;
  }

  _lowerFor(stmt) {
    const id = this._blockCounter++;
    const condLabel = `for_cond_${id}`;
    const bodyLabel = `for_body_${id}`;
    const updateLabel = `for_update_${id}`;
    const endLabel = `for_end_${id}`;

    // Init
    if (stmt.init) {
      if (stmt.init.kind === 'VarDecl' || stmt.init.kind === 'VarDecls') {
        const decls = stmt.init.kind === 'VarDecls' ? stmt.init.decls : [stmt.init];
        for (const d of decls) {
          this._lowerVarDecl(d);
        }
      } else {
        this._lowerExpression(stmt.init);
      }
    }

    this._currentBlock.setTerminator(IRInstruction.jump(condLabel));

    const condBlock = this._fn.addBlock(condLabel);
    let condVal = true;
    if (stmt.test) {
      condVal = this._lowerExpressionInBlock(stmt.test, condBlock);
    }
    condBlock.setTerminator(IRInstruction.branch(condVal, bodyLabel, endLabel));

    const bodyBlock = this._fn.addBlock(bodyLabel);
    this._currentBlock = bodyBlock;
    this._lowerStatement(stmt.body);
    if (this._currentBlock && this._currentBlock.terminator === null) {
      this._currentBlock.setTerminator(IRInstruction.jump(updateLabel));
    }

    const updateBlock = this._fn.addBlock(updateLabel);
    if (stmt.update) {
      this._lowerExpressionInBlock(stmt.update, updateBlock);
    }
    updateBlock.setTerminator(IRInstruction.jump(condLabel));

    const endBlock = this._fn.addBlock(endLabel);
    this._currentBlock = endBlock;
  }

  _lowerExprStmt(stmt) {
    if (stmt.expr.kind === 'Call') {
      this._lowerCallVoid(stmt.expr);
    } else {
      this._lowerExpression(stmt.expr);
    }
  }

  // ─── Expression lowering ─────────────────────────────────────────────

  /**
   * Lower an expression to an IRValue.
   * Side effects: may emit instructions to the current block.
   * @returns {string | number | boolean | null}
   */
  _lowerExpression(expr) {
    if (!expr || !expr.kind) return null;

    switch (expr.kind) {
      case 'Literal':
        return this._lowerLiteral(expr);

      case 'Ident':
        return this._lookupVar(expr.name) ?? expr.name;

      case 'Binary':
        return this._lowerBinary(expr);

      case 'Unary':
        return this._lowerUnary(expr);

      case 'Call':
        return this._lowerCall(expr);

      case 'Member':
        return this._lowerMember(expr);

      case 'Index':
        return this._lowerIndex(expr);

      case 'Assign':
        return this._lowerAssign(expr);

      case 'Ternary':
        return this._lowerTernary(expr);

      case 'Cast':
        return this._lowerExpression(expr.expr);

      case 'NonNull':
        return this._lowerExpression(expr.expr);

      default:
        return null;
    }
  }

  _lowerLiteral(expr) {
    switch (expr.litType) {
      case 'number': {
        const n = Number(expr.value);
        return isNaN(n) ? expr.value : n;
      }
      case 'string':
        return `"${expr.value}"`;
      case 'char':
        return `'${expr.value}'`;
      case 'bool':
        return expr.value === 'true' || expr.value === true;
      case 'null':
        return null;
      default:
        return expr.value;
    }
  }

  _lowerBinary(expr) {
    const left = this._lowerExpression(expr.left);
    const right = this._lowerExpression(expr.right);
    return `${left} ${expr.op} ${right}`;
  }

  _lowerUnary(expr) {
    const val = this._lowerExpression(expr.expr);
    const op = expr.op;
    if (op === '++pre' || op === '--pre') {
      const one = op === '++pre' ? '+' : '-';
      return `${val} ${one} 1`;
    }
    if (op === '++post' || op === '--post') {
      const one = op === '++post' ? '+' : '-';
      return `${val} ${one} 1`;
    }
    return `${op}${val}`;
  }

  _lowerCall(expr) {
    const fnName = this._calleeName(expr.callee);
    const args = (expr.args || []).map(a => this._lowerExpression(a.expr));

    // Determine if we need a result (expression context) or void (statement)
    const dest = this._fn.freshName('tmp');
    this._emit(IRInstruction.call(dest, fnName, args, this._loc(expr)));
    return dest;
  }

  /**
   * Lower a call as void (no dest) — used in statement context.
   */
  _lowerCallVoid(expr) {
    const fnName = this._calleeName(expr.callee);
    const args = (expr.args || []).map(a => this._lowerExpression(a.expr));
    this._emit(IRInstruction.call(null, fnName, args, this._loc(expr)));
    return null;
  }

  _calleeName(callee) {
    if (callee.kind === 'Ident') return callee.name;
    if (callee.kind === 'Member') {
      const obj = this._calleeName(callee.object);
      return `${obj}.${callee.prop}`;
    }
    return '<expr>';
  }

  _lowerMember(expr) {
    const obj = this._lowerExpression(expr.object);
    return `${obj}.${expr.prop}`;
  }

  _lowerIndex(expr) {
    const obj = this._lowerExpression(expr.object);
    const idx = this._lowerExpression(expr.index);
    return `${obj}[${idx}]`;
  }

  _lowerAssign(expr) {
    const target = this._assignTarget(expr.left);
    let value;

    if (expr.op === '=') {
      value = this._lowerExpression(expr.right);
    } else {
      // Compound: x += y → x = x + y
      const op = expr.op.slice(0, -1); // remove '='
      const right = this._lowerExpression(expr.right);
      value = `${target} ${op} ${right}`;
    }

    this._emit(IRInstruction.assign(target, value, this._loc(expr)));
    return target;
  }

  _assignTarget(left) {
    if (left.kind === 'Ident') {
      return this._lookupVar(left.name) ?? left.name;
    }
    if (left.kind === 'Member') {
      return this._lowerMember(left);
    }
    if (left.kind === 'Index') {
      return this._lowerIndex(left);
    }
    return '<target>';
  }

  _lowerTernary(expr) {
    const cond = this._lowerExpression(expr.cond);
    const yes = this._lowerExpression(expr.yes);
    const no = this._lowerExpression(expr.no);
    return `${cond} ? ${yes} : ${no}`;
  }

  // ─── Expression lowering in a specific block ─────────────────────────

  /**
   * Lower expression but emit to a specific block (not current).
   * Used for loop conditions.
   */
  _lowerExpressionInBlock(expr, block) {
    const savedBlock = this._currentBlock;
    this._currentBlock = block;
    const result = this._lowerExpression(expr);
    this._currentBlock = savedBlock;
    return result;
  }

  // ─── Scope management ────────────────────────────────────────────────

  _pushScope() {
    this._scopes.push(new Map());
  }

  _popScope() {
    this._scopes.pop();
  }

  _defineVar(name, ssaName) {
    this._scopes[this._scopes.length - 1].set(name, ssaName);
  }

  _lookupVar(name) {
    for (let i = this._scopes.length - 1; i >= 0; i--) {
      if (this._scopes[i].has(name)) {
        return this._scopes[i].get(name);
      }
    }
    return undefined;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  _emit(instr) {
    if (this._currentBlock && this._currentBlock.terminator === null) {
      this._currentBlock.addInstruction(instr);
    }
  }

  _loc(node) {
    if (node && node.line) {
      return { line: node.line, col: node.col || 0 };
    }
    return null;
  }

  _typeName(typeAnn) {
    if (!typeAnn) return 'auto';
    if (typeAnn.kind === 'TypeRef') return typeAnn.name;
    if (typeAnn.kind === 'TypeArray') return `${this._typeName(typeAnn.element)}[]`;
    if (typeAnn.kind === 'TypeFixedArray') return `${this._typeName(typeAnn.element)}[${typeAnn.size}]`;
    if (typeAnn.kind === 'TypeTuple') return 'tuple';
    if (typeAnn.kind === 'TypeUnion') return 'union';
    if (typeAnn.kind === 'TypeObject') return 'object';
    if (typeAnn.kind === 'TypeFunc') return 'function';
    if (typeAnn.kind === 'TypePointer') return `${this._typeName(typeAnn.pointee)}*`;
    return 'auto';
  }
}
