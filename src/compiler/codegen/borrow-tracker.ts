// @ts-nocheck — Stage 6: mixin file, types added in Stage 8
// BorrowTracker — encapsulates borrow checking state.
// Extracted from Context to reduce god-object coupling.

import type { SymbolInfo } from '../ast-types/symbol.js';
import type { ScopeManager } from './scope-manager.js';

export class BorrowTracker {
  _scopeMgr: ScopeManager;
  _scopeBorrowStack: SymbolInfo[][];
  _scopeMutQuarantineStack: SymbolInfo[][];
  _scopeMutBorrowStack: SymbolInfo[][];

  constructor(scopeMgr: ScopeManager) {
    this._scopeMgr = scopeMgr;
    this._scopeBorrowStack = [[]];
    this._scopeMutQuarantineStack = [[]];
    this._scopeMutBorrowStack = [[]];
  }

  pushScope(): void {
    this._scopeBorrowStack.push([]);
    this._scopeMutQuarantineStack.push([]);
    this._scopeMutBorrowStack.push([]);
  }

  onScopeExit(poppedScope: Map<string, SymbolInfo>): void {
    const dyingClosures = new Set<string>();
    for (const [name, sym] of poppedScope) {
      if (sym.funcPtr || sym.isClosure) dyingClosures.add(name);
    }
    if (dyingClosures.size > 0) {
      for (const scopeLevel of this._scopeMgr.scopes) {
        for (const [, sym] of scopeLevel) {
          if (sym._quarantinedBy && dyingClosures.has(sym._quarantinedBy)) {
            delete sym._mutQuarantined;
            delete sym._quarantinedBy;
          }
        }
      }
    }

    const borrows = this._scopeBorrowStack.pop()!;
    for (const sym of borrows) {
      sym._refBorrowCount = (sym._refBorrowCount || 0) - 1;
      if (sym._refBorrowCount! <= 0) sym._refBorrowCount = 0;
    }

    const mutQ = this._scopeMutQuarantineStack.pop()!;
    for (const sym of mutQ) {
      delete sym._mutQuarantined;
      delete sym._quarantinedBy;
    }

    const mutB = this._scopeMutBorrowStack.pop()!;
    for (const sym of mutB) {
      delete sym._mutBorrowed;
    }
  }

  trackRefBorrow(sym: SymbolInfo | null): void {
    if (!sym) return;
    sym._refBorrowCount = (sym._refBorrowCount || 0) + 1;
    const current = this._scopeBorrowStack[this._scopeBorrowStack.length - 1];
    if (current) current.push(sym);
  }

  trackMutBorrow(sym: SymbolInfo | null): void {
    if (!sym) return;
    const current = this._scopeMutBorrowStack[this._scopeMutBorrowStack.length - 1];
    if (current) current.push(sym);
  }

  trackMutQuarantine(sym: SymbolInfo | null, closureVarName: string | null = null): void {
    if (!sym) return;
    sym._mutQuarantined = true;
    if (closureVarName) sym._quarantinedBy = closureVarName;
    const current = this._scopeMutQuarantineStack[this._scopeMutQuarantineStack.length - 1];
    if (current) current.push(sym);
  }

  releaseQuarantineBy(closureVarName: string): void {
    for (const scopeLevel of this._scopeMgr.scopes) {
      for (const [, sym] of scopeLevel) {
        if (sym._quarantinedBy === closureVarName) {
          delete sym._mutQuarantined;
          delete sym._quarantinedBy;
        }
      }
    }
  }
}
