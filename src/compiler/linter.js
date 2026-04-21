// linter.js — AST-based lint rules for TSClang

// Generic recursive AST walker
function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor);
    } else if (val && typeof val === 'object' && val.kind) {
      walkAst(val, visitor);
    }
  }
}

// Walk only the immediate statements of a Block (one level deep)
function blockBody(node) {
  if (!node) return [];
  if (node.kind === 'Block') return node.body || [];
  if (Array.isArray(node)) return node;
  return [node];
}

// ─── Rules ────────────────────────────────────────────────────────────────────

// no-unreachable: code after return/throw/break/continue in the same block
function checkNoUnreachable(ast) {
  const results = [];
  const TERMINATORS = new Set(['Return', 'Throw', 'Break', 'Continue']);

  const checkBlock = (stmts) => {
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (!s) continue;
      // Recurse into nested blocks first
      if (s.kind === 'Block') checkBlock(s.body || []);
      if (s.kind === 'If') {
        checkBlock(blockBody(s.consequent));
        if (s.alternate) checkBlock(blockBody(s.alternate));
      }
      if (s.kind === 'While' || s.kind === 'For' || s.kind === 'ForOf') {
        checkBlock(blockBody(s.body));
      }
      if (s.kind === 'TryCatch') {
        checkBlock(s.body?.body || []);
        if (s.catches) for (const c of s.catches) checkBlock(c.body?.body || []);
        if (s.finally) checkBlock(s.finally.body || []);
      }
      if (s.kind === 'FuncDecl' || s.kind === 'ArrowFunc') {
        checkBlock(blockBody(s.body));
      }
      // Check for unreachable: terminator not at end of block
      if (TERMINATORS.has(s.kind) && i < stmts.length - 1) {
        const next = stmts[i + 1];
        if (next && next.line) {
          results.push({ line: next.line, col: 1, message: `unreachable code after '${s.kind.toLowerCase()}'` });
        }
        break; // report first unreachable, rest are redundant
      }
    }
  };

  walkAst(ast, node => {
    if (node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') {
      checkBlock(blockBody(node.body));
    }
    if (node.kind === 'ClassDecl') {
      for (const m of node.methods || []) checkBlock(blockBody(m.body));
    }
  });

  return results;
}

// prefer-const: let that is never reassigned after declaration
function checkPreferConst(ast) {
  const results = [];

  // For each function scope, collect lets and assignments
  const analyzeScope = (params, stmts, scopeName) => {
    const lets = []; // { name, line, col }
    const assigned = new Set(); // names that are reassigned

    const collectLets = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl' && s.varKind === 'let') {
          lets.push({ name: s.name, line: s.line || 0, col: s.col || 1 });
        }
        if (s.kind === 'Block') collectLets(s.body);
        if (s.kind === 'If') {
          collectLets(blockBody(s.consequent));
          if (s.alternate) collectLets(blockBody(s.alternate));
        }
        if (s.kind === 'While' || s.kind === 'For' || s.kind === 'ForOf') {
          collectLets(blockBody(s.body));
        }
        if (s.kind === 'TryCatch') {
          collectLets(s.body?.body || []);
          if (s.catches) for (const c of s.catches) collectLets(c.body?.body || []);
        }
      }
    };

    const collectAssignments = (node) => {
      if (!node || typeof node !== 'object') return;
      // Assign: x = ..., x += ..., x -= ...
      if (node.kind === 'Assign' && node.target?.kind === 'Ident') {
        assigned.add(node.target.name);
      }
      // Unary ++ / -- on ident
      if (node.kind === 'Unary' && (node.op === '++' || node.op === '--') &&
          node.expr?.kind === 'Ident') {
        assigned.add(node.expr.name);
      }
      // PostUnary ++ / --
      if (node.kind === 'PostUnary' && (node.op === '++' || node.op === '--') &&
          node.expr?.kind === 'Ident') {
        assigned.add(node.expr.name);
      }
      for (const val of Object.values(node)) {
        if (Array.isArray(val)) for (const item of val) collectAssignments(item);
        else if (val && typeof val === 'object' && val.kind) collectAssignments(val);
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
  walkAst(ast, node => {
    if (node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') {
      analyzeScope(node.params || [], blockBody(node.body), node.name);
    }
  });
  // Also analyze top-level
  analyzeScope([], ast.body || [], '<top>');

  return results;
}

// no-unused-var: let/const declared but never referenced elsewhere
function checkNoUnusedVar(ast) {
  const results = [];

  const analyzeScope = (stmts, paramNames = new Set()) => {
    const declared = []; // { name, line, col }
    const usedNames = new Set();
    const paramNamesLocal = new Set(paramNames);

    const collectDecls = (stmts) => {
      for (const s of stmts || []) {
        if (!s) continue;
        if (s.kind === 'VarDecl') {
          declared.push({ name: s.name, line: s.line || 0, col: s.col || 1 });
        }
        if (s.kind === 'FuncDecl') {
          // Don't descend into nested functions — they have their own scope
          return;
        }
        if (s.kind === 'Block') collectDecls(s.body);
        if (s.kind === 'If') {
          collectDecls(blockBody(s.consequent));
          if (s.alternate) collectDecls(blockBody(s.alternate));
        }
        if (s.kind === 'While' || s.kind === 'For' || s.kind === 'ForOf') {
          collectDecls(blockBody(s.body));
        }
        if (s.kind === 'TryCatch') {
          collectDecls(s.body?.body || []);
          if (s.catches) for (const c of s.catches) collectDecls(c.body?.body || []);
        }
      }
    };

    const collectUsages = (node, declLine) => {
      if (!node || typeof node !== 'object') return;
      // An Ident that is NOT the LHS of a VarDecl at its declaration line
      if (node.kind === 'Ident') {
        usedNames.add(node.name);
        return;
      }
      // VarDecl: don't count the declared name on the LHS as a usage,
      // but DO walk the init expression for usages
      if (node.kind === 'VarDecl') {
        if (node.init) collectUsages(node.init, node.line);
        return;
      }
      for (const val of Object.values(node)) {
        if (Array.isArray(val)) for (const item of val) collectUsages(item, declLine);
        else if (val && typeof val === 'object' && val.kind) collectUsages(val, declLine);
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
  analyzeScope(ast.body || []);

  // Each function's scope
  walkAst(ast, node => {
    if (node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') {
      const params = new Set((node.params || []).map(p => p.name).filter(Boolean));
      analyzeScope(blockBody(node.body), params);
    }
  });

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const RULES = {
  'no-unreachable': { severity: 'error',   check: checkNoUnreachable },
  'prefer-const':   { severity: 'warning', check: checkPreferConst   },
  'no-unused-var':  { severity: 'warning', check: checkNoUnusedVar   },
};

export function lint(ast, { rules = Object.keys(RULES) } = {}) {
  const diagnostics = [];
  for (const name of rules) {
    const rule = RULES[name];
    if (!rule) continue;
    for (const d of rule.check(ast)) {
      diagnostics.push({ rule: name, severity: rule.severity, ...d });
    }
  }
  return diagnostics.sort((a, b) => (a.line || 0) - (b.line || 0));
}

export function applyFixes(src, diagnostics) {
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
