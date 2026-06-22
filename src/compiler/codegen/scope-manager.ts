// ScopeManager — encapsulates the symbol table (scope stack).
// Extracted from Context to reduce god-object coupling.

import type { SymbolInfo } from '../ast-types/symbol.js';

export class ScopeManager {
  scopes: Map<string, SymbolInfo>[];

  constructor() {
    this.scopes = [new Map()];
  }

  pushScope(): void {
    this.scopes.push(new Map());
  }

  popScope(): Map<string, SymbolInfo> {
    return this.scopes.pop()!;
  }

  define(name: string, info: SymbolInfo): void {
    this.scopes[this.scopes.length - 1].set(name, info);
  }

  lookup(name: string): SymbolInfo | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name)!;
    }
    return null;
  }

  remove(name: string): void {
    this.scopes[this.scopes.length - 1].delete(name);
  }
}
