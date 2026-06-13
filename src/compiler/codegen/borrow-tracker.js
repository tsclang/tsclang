// BorrowTracker — encapsulates borrow checking state.
// Extracted from Context to reduce god-object coupling.
//
// Responsibilities:
//   - Track Ref/Mut borrows per scope
//   - Track mutability quarantines (closures capturing Mut refs)
//   - Release borrows/quarantines on scope exit
//
// Depends on ScopeManager for scope iteration (releaseQuarantineBy).

export class BorrowTracker {
  constructor(scopeMgr) {
    this._scopeMgr = scopeMgr;
    this._scopeBorrowStack = [[]];
    this._scopeMutQuarantineStack = [[]];
    this._scopeMutBorrowStack = [[]];
  }

  // Called alongside ScopeManager.pushScope().
  pushScope() {
    this._scopeBorrowStack.push([]);
    this._scopeMutQuarantineStack.push([]);
    this._scopeMutBorrowStack.push([]);
  }

  // Called after ScopeManager.popScope() with the popped scope Map.
  // Handles closure quarantine cleanup + borrow count decrement.
  onScopeExit(poppedScope) {
    // Release quarantines held by closures going out of scope
    const dyingClosures = new Set();
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

    // Decrement Ref borrow counts
    const borrows = this._scopeBorrowStack.pop();
    for (const sym of borrows) {
      sym._refBorrowCount = (sym._refBorrowCount || 0) - 1;
      if (sym._refBorrowCount <= 0) sym._refBorrowCount = 0;
    }

    // Clear Mut quarantines
    const mutQ = this._scopeMutQuarantineStack.pop();
    for (const sym of mutQ) {
      delete sym._mutQuarantined;
      delete sym._quarantinedBy;
    }

    // Clear Mut borrows
    const mutB = this._scopeMutBorrowStack.pop();
    for (const sym of mutB) {
      delete sym._mutBorrowedBy;
    }
  }

  trackRefBorrow(sym) {
    if (!sym) return;
    sym._refBorrowCount = (sym._refBorrowCount || 0) + 1;
    const current = this._scopeBorrowStack[this._scopeBorrowStack.length - 1];
    if (current) current.push(sym);
  }

  trackMutBorrow(sym) {
    if (!sym) return;
    const current = this._scopeMutBorrowStack[this._scopeMutBorrowStack.length - 1];
    if (current) current.push(sym);
  }

  trackMutQuarantine(sym, closureVarName = null) {
    if (!sym) return;
    sym._mutQuarantined = true;
    if (closureVarName) sym._quarantinedBy = closureVarName;
    const current = this._scopeMutQuarantineStack[this._scopeMutQuarantineStack.length - 1];
    if (current) current.push(sym);
  }

  // Release all quarantines held by a specific closure (called on closure return).
  releaseQuarantineBy(closureVarName) {
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
