// ScopeManager — encapsulates the symbol table (scope stack).
// Extracted from Context to reduce god-object coupling.
//
// Responsibilities:
//   - Manage scope stack (push/pop Map-based scopes)
//   - Symbol declaration (define)
//   - Symbol resolution (lookup)
//
// NOT responsible for:
//   - Borrow tracking (BorrowTracker)
//   - Heap auto-marking (Context.define wrapper handles cleanup registration)

export class ScopeManager {
  constructor() {
    this.scopes = [new Map()];
  }

  pushScope() {
    this.scopes.push(new Map());
  }

  // Pop and return the removed scope Map.
  // Caller is responsible for borrow/closure cleanup on the popped scope.
  popScope() {
    return this.scopes.pop();
  }

  // Declare a symbol in the current (topmost) scope.
  define(name, info) {
    this.scopes[this.scopes.length - 1].set(name, info);
  }

  // Search the scope stack bottom-up for a symbol.
  // Returns the symbol info object or null if not found.
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }

  // Remove a symbol from the current scope (used by const-prefix renaming fixup).
  remove(name) {
    this.scopes[this.scopes.length - 1].delete(name);
  }
}
