// stmt.ts
import type { Stmt, Block, VarDeclItem } from '@tsclang/ast';
import type { CodeGenContext } from '../codegen.js';

export function visitBlock(ctx: CodeGenContext, block: Block, lines: string[], depth: number) {
    ctx.pushScope();
    ctx._blockCleanupStack.push({ list: [], set: new Set() });
    const blockPoolVars: { name: string; className: string }[] = [];
    const blockHeapVars: { name: string; className: string }[] = [];
    const prevPoolVars = ctx._currentBlockPoolVars;
    const prevHeapVars = ctx._currentBlockHeapVars;
    ctx._currentBlockPoolVars = blockPoolVars;
    ctx._currentBlockHeapVars = blockHeapVars;
    if (!ctx._poolVarStack) ctx._poolVarStack = [];
    if (!ctx._heapVarStack) ctx._heapVarStack = [];
    ctx._poolVarStack.push(blockPoolVars);
    ctx._heapVarStack.push(blockHeapVars);
    const _heapMovedSnapshot = ctx._snapshotHeapMoved();
    for (const s of block.body) visitStmt(ctx, s, lines, depth);
    ctx._restoreHeapMoved(_heapMovedSnapshot);
    const I = ' '.repeat(ctx.indent * depth);
    for (let i = blockPoolVars.length - 1; i >= 0; i--) {
      const { name, className } = blockPoolVars[i];
      const sym = ctx.scopes.length > 0 ? ctx.lookup(name) : null;
      if (sym?._moved) continue;
      const cls = ctx.classes.get(className);
      if (cls?._isPool) {
        ctx._ensurePoolDrop(className);
        lines.push(`${I}${cls._poolDropFn}(${name});`);
      }
    }
    for (let i = blockHeapVars.length - 1; i >= 0; i--) {
      const { name, className } = blockHeapVars[i];
      const sym = ctx.scopes.length > 0 ? ctx.lookup(name) : null;
      if (sym?._moved) continue;
      const cls = ctx.classes.get(className);
      if (cls?._isHeap) {
        ctx._ensureHeapDestructor(className);
        lines.push(`${I}if (${name} != NULL) { ${className}_destructor(${name}); tsc_free(${name}); }`);
        if (sym) sym._moved = true;
      }
    }
    const blockCleanup = ctx._blockCleanupStack.pop();
    for (let i = blockCleanup!.list.length - 1; i >= 0; i--) {
      lines.push(`${I}${blockCleanup!.list[i]};`);
    }
    ctx._currentBlockPoolVars = prevPoolVars;
    ctx._currentBlockHeapVars = prevHeapVars;
    ctx._poolVarStack.pop();
    ctx._heapVarStack.pop();
    ctx.popScope();
}

export function visitStmtInMain(ctx: CodeGenContext, node: Stmt) {
    const lines: string[] = [];
    if (ctx._debugLines && node?.line) {
      ctx.mainStmts.push(`#line ${node.line} "${ctx.filename}"`);
    }
    visitStmt(ctx, node, lines, 0);
    for (const l of lines) ctx.mainStmts.push(l);
}

export function visitStmt(ctx: CodeGenContext, node: Stmt, lines: string[], depth: number) {
    ctx._currentNode = node;
    if (!node) return;

    switch (node.kind) {
      case 'VarDecl': ctx._visitVarDecl(node, lines, depth); break;
      case 'VarDecls': node.decls.forEach((d: VarDeclItem) => {
        if (d.kind === 'VarDestructObj' || d.kind === 'VarDestructArr') ctx._visitVarDestruct(d, lines, depth);
        else ctx._visitVarDecl(d, lines, depth);
      }); break;
      case 'VarDestructObj':
      case 'VarDestructArr': ctx._visitVarDestruct(node, lines, depth); break;
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
        ctx._visitControlFlow(node, lines, depth); break;
      default:
        throw ctx.error(`internal: unhandled statement kind '${node.kind}'`, node);
    }
}

export function visitStmtOrBlock(ctx: CodeGenContext, node: Stmt, lines: string[], depth: number) {
    if (node.kind === 'Block') visitBlock(ctx, node, lines, depth);
    else visitStmt(ctx, node, lines, depth);
}
