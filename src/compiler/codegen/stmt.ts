// stmt.ts
export default {
  visitBlock(this: any, block: any, lines: any, depth: any) {
    this.pushScope();
    this._blockCleanupStack.push({ list: [], set: new Set() });
    const blockPoolVars: any[] = [];
    const blockHeapVars: any[] = [];
    const prevPoolVars = this._currentBlockPoolVars;
    const prevHeapVars = this._currentBlockHeapVars;
    this._currentBlockPoolVars = blockPoolVars;
    this._currentBlockHeapVars = blockHeapVars;
    if (!this._poolVarStack) this._poolVarStack = [];
    if (!this._heapVarStack) this._heapVarStack = [];
    this._poolVarStack.push(blockPoolVars);
    this._heapVarStack.push(blockHeapVars);
    const _heapMovedSnapshot = this._snapshotHeapMoved();
    for (const s of block.body) this.visitStmt(s, lines, depth);
    this._restoreHeapMoved(_heapMovedSnapshot);
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

  visitStmtInMain(this: any, node: any) {
    const lines: any[] = [];
    if (this._debugLines && node?.line) {
      this.mainStmts.push(`#line ${node.line} "${this.filename}"`);
    }
    this.visitStmt(node, lines, 0);
    for (const l of lines) this.mainStmts.push(l);
  },

  visitStmt(this: any, node: any, lines: any, depth: any) {
    this._currentNode = node;
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': this._visitVarDecl(node, lines, depth); break;
      case 'VarDecls': node.decls.forEach((d: any) => this._visitVarDecl(d, lines, depth)); break;
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
      default:
        throw this.error(`internal: unhandled statement kind '${node.kind}'`, node);
    }
  },

  visitStmtOrBlock(this: any, node: any, lines: any, depth: any) {
    if (node.kind === 'Block') this.visitBlock(node, lines, depth);
    else this.visitStmt(node, lines, depth);
  },
};
