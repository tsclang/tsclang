// stmt.js
export default {
  visitBlock(block, lines, depth) {
    this.pushScope();
    this._blockCleanupStack.push({ list: [], set: new Set() });
    const blockPoolVars = [];
    const blockHeapVars = [];
    const prevPoolVars = this._currentBlockPoolVars;
    const prevHeapVars = this._currentBlockHeapVars;
    this._currentBlockPoolVars = blockPoolVars;
    this._currentBlockHeapVars = blockHeapVars;
    if (!this._poolVarStack) this._poolVarStack = [];
    if (!this._heapVarStack) this._heapVarStack = [];
    this._poolVarStack.push(blockPoolVars);
    this._heapVarStack.push(blockHeapVars);
    for (const s of block.body) this.visitStmt(s, lines, depth);
    const I = ' '.repeat(this.indent * depth);
    for (let i = blockPoolVars.length - 1; i >= 0; i--) {
      const { name, className } = blockPoolVars[i];
      const sym = this.scopes.length > 0 ? this.lookup(name) : null;
      if (sym?._moved) continue;
      const cls = this.classes.get(className);
      if (cls?._isPool) {
        this._ensurePoolDrop(className);
        lines.push(`${I}${cls._poolDropFn}(${name});`);
      }
    }
    for (let i = blockHeapVars.length - 1; i >= 0; i--) {
      const { name, className } = blockHeapVars[i];
      const sym = this.scopes.length > 0 ? this.lookup(name) : null;
      if (sym?._moved) continue;
      const cls = this.classes.get(className);
      if (cls?._isHeap) {
        this._ensureHeapDestructor(className);
        lines.push(`${I}if (${name} != NULL) { ${className}_destructor(${name}); tsc_free(${name}); }`);
        if (sym) sym._moved = true;
      }
    }
    const blockCleanup = this._blockCleanupStack.pop();
    for (let i = blockCleanup.list.length - 1; i >= 0; i--) {
      lines.push(`${I}${blockCleanup.list[i]};`);
    }
    this._currentBlockPoolVars = prevPoolVars;
    this._currentBlockHeapVars = prevHeapVars;
    this._poolVarStack.pop();
    this._heapVarStack.pop();
    this.popScope();
  },

  visitStmtInMain(node) {
    const lines = [];
    if (this._debugLines && node?.line) {
      this.mainStmts.push(`#line ${node.line} "${this.filename}"`);
    }
    this.visitStmt(node, lines, 0);
    for (const l of lines) this.mainStmts.push(l);
  },

  visitStmt(node, lines, depth) {
    this._currentNode = node;
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': this._visitVarDecl(node, lines, depth); break;
      case 'VarDestructObj':
      case 'VarDestructArr': this._visitVarDestruct(node, lines, depth); break;
      case 'ExprStmt':
      case 'Return':
      case 'If':
      case 'Block':
      case 'For':
      case 'ForOf':
      case 'ForIn':
      case 'While':
      case 'DoWhile':
      case 'Break':
      case 'Continue':
      case 'Labeled':
      case 'Throw':
      case 'TryCatch':
      case 'Switch':
      case 'Native':
      case 'Unsafe':
      case 'Spawn':
      case 'Noop':
        this._visitControlFlow(node, lines, depth); break;
      case 'Match': this.emitMatchVarDecl(node, lines, depth); break;
      case 'Select': this.emitSelectVarDecl(node, lines, depth); break;
      case 'Propagate': this.emitPropagateVarDecl(node, lines, depth); break;
      case 'NonNull': this.emitPropagateVarDecl(node, lines, depth); break;
      default: {
        const I = ' '.repeat(this.indent * depth);
        lines.push(I + `/* unhandled stmt: ${node.kind} */`);
      }
    }
  },

  visitStmtOrBlock(node, lines, depth) {
    if (node.kind === 'Block') this.visitBlock(node, lines, depth);
    else this.visitStmt(node, lines, depth);
  },
};
