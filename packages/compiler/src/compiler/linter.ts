// linter.ts — AST-based lint rules for TSClang

import type { Program } from '@tsclang/ast';

interface LintDiagnostic {
  rule?: string;
  severity?: string;
  line?: number;
  col?: number;
  message: string;
  fixable?: boolean;
  fixKind?: string;
  fixLine?: number;
}

interface VarInfo {
  name: string;
  line: number;
  col: number;
}

// Generic recursive AST walker
function walkAst(node: unknown, visitor: (node: Record<string, unknown>) => void) {
  if (!node || typeof node !== 'object') return;
  visitor(node as Record<string, unknown>);
  for (const val of Object.values(node) as unknown[]) {
    if (Array.isArray(val)) {
      for (const item of val as unknown[]) walkAst(item, visitor);
    } else if (val && typeof val === 'object' && (val as Record<string, unknown>).kind) {
      walkAst(val, visitor);
    }
  }
}

// Walk only the immediate statements of a Block (one level deep)
function blockBody(node: unknown): Record<string, unknown>[] {
  if (!node) return [];
  const n = node as Record<string, unknown>;
  if (n.kind === 'Block') return (n.body as Record<string, unknown>[]) || [];
  if (Array.isArray(node)) return node as Record<string, unknown>[];
  return [n];
}

// ─── Rules ────────────────────────────────────────────────────────────────────

// no-unreachable: code after return/throw/break/continue in the same block
function checkNoUnreachable(ast: Program): LintDiagnostic[] {
  const results: LintDiagnostic[] = [];
  const TERMINATORS = new Set(['Return', 'Throw', 'Break', 'Continue']);

  const checkBlock = (stmts: Record<string, unknown>[]) => {
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (!s) continue;
      // Recurse into nested blocks first
      if (s.kind === 'Block') checkBlock((s.body as Record<string, unknown>[]) || []);
      if (s.kind === 'If') {
        checkBlock(blockBody(s.consequent));
        if (s.alternate) checkBlock(blockBody(s.alternate));
      }
      if (s.kind === 'While' || s.kind === 'For' || s.kind === 'ForOf') {
        checkBlock(blockBody(s.body));
      }
      if (s.kind === 'TryCatch') {
        checkBlock(((s.body as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
        if (s.catches) for (const c of (s.catches as Record<string, unknown>[])) checkBlock(((c.body as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
        if (s.finally) checkBlock(((s.finally as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
      }
      if (s.kind === 'FuncDecl' || s.kind === 'ArrowFunc') {
        checkBlock(blockBody(s.body));
      }
      // Check for unreachable: terminator not at end of block
      if (TERMINATORS.has(s.kind as string) && i < stmts.length - 1) {
        const next = stmts[i + 1];
        if (next && next.line) {
          results.push({ line: next.line as number, col: 1, message: `unreachable code after '${(s.kind as string).toLowerCase()}'` });
        }
        break; // report first unreachable, rest are redundant
      }
    }
  };

  walkAst(ast, (node: Record<string, unknown>) => {
    if (node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') {
      checkBlock(blockBody(node.body));
    }
    if (node.kind === 'ClassDecl') {
      for (const m of ((node.methods as Record<string, unknown>[]) || [])) checkBlock(blockBody(m.body));
    }
  });

  return results;
}

// prefer-const: let that is never reassigned after declaration
function checkPreferConst(ast: Program): LintDiagnostic[] {
  const results: LintDiagnostic[] = [];

  // For each function scope, collect lets and assignments
  const analyzeScope = (params: unknown, stmts: Record<string, unknown>[], scopeName: unknown) => {
    const lets: VarInfo[] = []; // { name, line, col }
    const assigned = new Set<string>(); // names that are reassigned

    const collectLets = (stmts: Record<string, unknown>[]) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl' && s.varKind === 'let') {
          lets.push({ name: s.name as string, line: (s.line as number) || 0, col: (s.col as number) || 1 });
        }
        if (s.kind === 'Block') collectLets((s.body as Record<string, unknown>[]) || []);
        if (s.kind === 'If') {
          collectLets(blockBody(s.consequent));
          if (s.alternate) collectLets(blockBody(s.alternate));
        }
        if (s.kind === 'While' || s.kind === 'For' || s.kind === 'ForOf') {
          collectLets(blockBody(s.body));
        }
        if (s.kind === 'TryCatch') {
          collectLets(((s.body as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
          if (s.catches) for (const c of (s.catches as Record<string, unknown>[])) collectLets(((c.body as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
        }
      }
    };

    const collectAssignments = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      // Assign: x = ..., x += ..., x -= ...
      if (n.kind === 'Assign' && (n.target as Record<string, unknown> | undefined)?.kind === 'Ident') {
        assigned.add((n.target as Record<string, unknown>).name as string);
      }
      // Unary ++ / -- on ident
      if (n.kind === 'Unary' && (n.op === '++' || n.op === '--') &&
          (n.expr as Record<string, unknown> | undefined)?.kind === 'Ident') {
        assigned.add((n.expr as Record<string, unknown>).name as string);
      }
      // PostUnary ++ / --
      if (n.kind === 'PostUnary' && (n.op === '++' || n.op === '--') &&
          (n.expr as Record<string, unknown> | undefined)?.kind === 'Ident') {
        assigned.add((n.expr as Record<string, unknown>).name as string);
      }
      for (const val of Object.values(n) as unknown[]) {
        if (Array.isArray(val)) for (const item of val as unknown[]) collectAssignments(item);
        else if (val && typeof val === 'object' && (val as Record<string, unknown>).kind) collectAssignments(val);
      }
    };

    collectLets(stmts);
    for (const s of stmts || []) collectAssignments(s);

    for (const { name, line, col } of lets) {
      if (!assigned.has(name)) {
        results.push({ line, col, message: `'${name}' is never reassigned, use 'const' instead`, fixable: true, fixKind: 'let-to-const', fixLine: line });
      }
    }
  };

  // Analyze each function independently
  walkAst(ast, (node: Record<string, unknown>) => {
    if (node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') {
      analyzeScope(node.params || [], blockBody(node.body), node.name);
    }
  });
  // Also analyze top-level
  analyzeScope([], (ast.body || []) as unknown as Record<string, unknown>[], '<top>');

  return results;
}

// no-unused-var: let/const declared but never referenced elsewhere
function checkNoUnusedVar(ast: Program): LintDiagnostic[] {
  const results: LintDiagnostic[] = [];

  const analyzeScope = (stmts: Record<string, unknown>[], paramNames = new Set<string>()) => {
    const declared: VarInfo[] = []; // { name, line, col }
    const usedNames = new Set<string>();
    const paramNamesLocal = new Set(paramNames);

    const collectDecls = (stmts: Record<string, unknown>[]) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl') {
          declared.push({ name: s.name as string, line: (s.line as number) || 0, col: (s.col as number) || 1 });
        }
        if (s.kind === 'FuncDecl') {
          // Don't descend into nested functions — they have their own scope
          return;
        }
        if (s.kind === 'Block') collectDecls((s.body as Record<string, unknown>[]) || []);
        if (s.kind === 'If') {
          collectDecls(blockBody(s.consequent));
          if (s.alternate) collectDecls(blockBody(s.alternate));
        }
        if (s.kind === 'While' || s.kind === 'For' || s.kind === 'ForOf') {
          collectDecls(blockBody(s.body));
        }
        if (s.kind === 'TryCatch') {
          collectDecls(((s.body as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
          if (s.catches) for (const c of (s.catches as Record<string, unknown>[])) collectDecls(((c.body as Record<string, unknown> | undefined)?.body || []) as Record<string, unknown>[]);
        }
      }
    };

    const collectUsages = (node: unknown, declLine: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      // An Ident that is NOT the LHS of a VarDecl at its declaration line
      if (n.kind === 'Ident') {
        usedNames.add(n.name as string);
        return;
      }
      // VarDecl: don't count the declared name on the LHS as a usage,
      // but DO walk the init expression for usages
      if (n.kind === 'VarDecl') {
        if (n.init) collectUsages(n.init, n.line);
        return;
      }
      for (const val of Object.values(n) as unknown[]) {
        if (Array.isArray(val)) for (const item of val as unknown[]) collectUsages(item, declLine);
        else if (val && typeof val === 'object' && (val as Record<string, unknown>).kind) collectUsages(val, declLine);
      }
    };

    collectDecls(stmts);
    for (const s of stmts || []) collectUsages(s, null);

    for (const { name, line, col } of declared) {
      if (!usedNames.has(name) && !paramNamesLocal.has(name)) {
        results.push({ line, col, message: `'${name}' is declared but never used` });
      }
    }
  };

  // Top-level scope
  analyzeScope((ast.body || []) as unknown as Record<string, unknown>[]);

  // Each function's scope
  walkAst(ast, (node: Record<string, unknown>) => {
    if (node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') {
      const params = new Set(((node.params || []) as Record<string, unknown>[]).map((p: Record<string, unknown>) => p.name as string).filter(Boolean));
      analyzeScope(blockBody(node.body), params);
    }
  });

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const RULES: Record<string, { severity: string; check: (ast: Program) => LintDiagnostic[] }> = {
  'no-unreachable': { severity: 'error',   check: checkNoUnreachable },
  'prefer-const':   { severity: 'warning', check: checkPreferConst   },
  'no-unused-var':  { severity: 'warning', check: checkNoUnusedVar   },
};

export function lint(ast: Program, { rules = Object.keys(RULES) }: { rules?: string[] } = {}): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  for (const name of rules) {
    const rule = RULES[name];
    if (!rule) continue;
    for (const d of rule.check(ast)) {
      diagnostics.push({ rule: name, severity: rule.severity, ...d });
    }
  }
  return diagnostics.sort((a, b) => (a.line || 0) - (b.line || 0));
}

export function applyFixes(src: string, diagnostics: LintDiagnostic[]): string {
  const lines = src.split('\n');
  for (const d of diagnostics) {
    if (!d.fixable || !d.fixLine) continue;
    if (d.fixKind === 'let-to-const') {
      const i = d.fixLine - 1;
      if (lines[i]) lines[i] = lines[i].replace(/\blet\b/, 'const');
    }
  }
  return lines.join('\n');
}
