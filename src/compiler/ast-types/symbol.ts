// Symbol info type definitions for TSClang compiler
// Stage 2 of JS→TS migration (#84)
//
// SymbolInfo is stored in ScopeManager's scope Maps.
// A single Map holds variable symbols, function symbols, type aliases,
// namespace refs, and macro stubs — hence the union type.

export interface SymbolInfo {
  // Type information
  ctype?: string;
  cType?: string;
  varKind?: 'let' | 'const' | 'var';

  // Function symbols
  funcName?: string;
  funcPtr?: boolean;
  params?: unknown[];
  isRefParam?: boolean;
  isMutParam?: boolean;

  // Ownership
  isArc?: boolean;
  isWeak?: boolean;
  isClosure?: boolean;
  isStruct?: boolean;
  isEnum?: boolean;
  isPool?: boolean;
  isHeap?: boolean;
  _isHeap?: boolean;
  _isPool?: boolean;
  _moved?: boolean;
  _movedFields?: string[];
  _movedLine?: number;
  _movedSourceNode?: unknown;
  _refBorrowCount?: number;
  _mutBorrowed?: boolean;
  _mutQuarantined?: boolean;
  _quarantinedBy?: string | null;

  // Namespace
  _isNamespace?: boolean;
  _namespaceExports?: Record<string, unknown>;

  // Type alias
  _isTypeAlias?: boolean;

  // Generator state
  _isGenState?: boolean;
  _gi?: number;
  _genArgs?: unknown[];

  // Misc
  _suppressVoidWarning?: boolean;
  _isLibcFunc?: boolean;
  _isLibcVariadic?: boolean;
  _isStackMacro?: boolean;
  _isAvrObj?: boolean;
  _avrName?: string;
  _isVtable?: boolean;
  _isFsNamespace?: boolean;
}
