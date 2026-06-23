// Context base interface for declaration merging.

import type { SymbolInfo } from './symbol.js';

export interface Context {
  // Core properties (constructor-initialized in codegen.ts)
  filename: string;
  src: string;
  classes: Map<string, unknown>;
  interfaces: Map<string, unknown>;
  lambdas: Map<string, unknown>;
  typeAliases: Map<string, unknown>;
  _typeAliases: Map<string, unknown>;
  _warnings: unknown[];
  _errors: unknown[];
  _exports: unknown[];

  // Scope management
  scopes: Map<string, SymbolInfo>[];
  _scopeMgr: unknown;
  _borrowTracker: unknown;
  _output: unknown;

  // Capabilities
  _capabilities: Record<string, unknown>;
  _strictRules?: Set<string>;
  _defaultNumber: string;
  _targetName: string;

  // Output sections
  includes: Set<string>;
  typedefs: string[];
  topLevel: string[];
  mainStmts: string[];
  lambdaLines: string[];

  // Error helpers
  error(msg: string, node?: unknown): Error;
  warn(msg: string, node?: unknown): void;

  // Scope delegates
  pushScope(): void;
  popScope(): Map<string, SymbolInfo>;
  define(name: string, info: SymbolInfo): void;
  lookup(name: string): SymbolInfo | null;

  // Type delegates (TypeChecker methods)
  resolveType(typeAnn: unknown): string | null;
  inferType(expr: unknown): string;

  // Codegen core
  ind(depth: number): string;
  emit(): string;
  exprToC(expr: unknown, lines: string[], depth: number): string;
  visitStmt(stmt: unknown, lines: string[], depth: number): void;
  visitProgram(ast: unknown): void;
}
