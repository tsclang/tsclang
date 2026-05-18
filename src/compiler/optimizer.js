// AST optimizer — activated by "// @opt" annotation or #[profile(opt: true)]
// Strategy:
//   Phase 1: fold constant binary/unary expressions everywhere (bottom-up)
//   Phase 2: propagate const literals into OTHER const initializers only
//   Phase 3: eliminate consts that have zero refs outside their own init
//   Phase 4: dead branch elimination (if(false)/if(true))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numLit(value) {
  return { kind: 'Literal', litType: 'number', value: String(value) };
}

function boolLit(value) {
  return { kind: 'Literal', litType: 'bool', value: value ? 'true' : 'false' };
}

function isNumLit(node) {
  return node?.kind === 'Literal' && node.litType === 'number';
}

function isBoolLit(node) {
  return node?.kind === 'Literal' && node.litType === 'bool';
}

function isLit(node) {
  return node?.kind === 'Literal';
}

function isPowerOf2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

// Unwrap Export wrapper → inner decl
function innerDecl(s) {
  return s?.kind === 'Export' ? s.decl : s;
}

// ---------------------------------------------------------------------------
// Phase 1: fold constant expressions (bottom-up, in-place clone)
// ---------------------------------------------------------------------------

function foldExpr(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(foldExpr);

  const out = {};
  for (const k of Object.keys(node)) {
    out[k] = k === 'parent' ? node[k] : foldExpr(node[k]);
  }

  if (out.kind === 'Binary') {
    const { left, right, op } = out;
    if (isNumLit(left) && isNumLit(right)) {
      const l = Number(left.value);
      const r = Number(right.value);
      switch (op) {
        case '+': return numLit(l + r);
        case '-': return numLit(l - r);
        case '*': return numLit(l * r);
        case '/': return numLit(Math.trunc(l / r));
        case '%': return numLit(l % r);
        case '**': return numLit(l ** r);
        case '<':  return boolLit(l < r);
        case '>':  return boolLit(l > r);
        case '<=': return boolLit(l <= r);
        case '>=': return boolLit(l >= r);
        case '===': case '==': return boolLit(l === r);
        case '!==': case '!=': return boolLit(l !== r);
      }
    }
    if (isBoolLit(left) && isBoolLit(right)) {
      const l = left.value === 'true';
      const r = right.value === 'true';
      if (op === '&&') return boolLit(l && r);
      if (op === '||') return boolLit(l || r);
    }
    // Strength reduction: x * 2 → x + x, x * 2^n → x << n
    if (op === '*') {
      if (isNumLit(left) && !isNumLit(right) && right.kind === 'Ident') {
        const v = Number(left.value);
        if (isPowerOf2(v)) {
          if (v === 2) return { ...out, op: '+', left: { ...right }, right: { ...right } };
          return { ...out, op: '<<', left: { ...right }, right: numLit(Math.log2(v)) };
        }
      }
      if (isNumLit(right) && !isNumLit(left) && left.kind === 'Ident') {
        const v = Number(right.value);
        if (isPowerOf2(v)) {
          if (v === 2) return { ...out, op: '+', left: { ...left }, right: { ...left } };
          return { ...out, op: '<<', left: { ...left }, right: numLit(Math.log2(v)) };
        }
      }
    }
  }

  if (out.kind === 'Unary') {
    const { op } = out;
    const operand = out.operand ?? out.expr;
    if (isNumLit(operand)) {
      if (op === '-') return numLit(-Number(operand.value));
      if (op === '+') return numLit(+Number(operand.value));
    }
    if (isBoolLit(operand) && op === '!') {
      return boolLit(operand.value !== 'true');
    }
  }

  return out;
}

// Apply foldExpr to every VarDecl init in a stmt list (non-recursive into functions).
function foldInits(stmts) {
  return stmts.map(s => {
    const decl = innerDecl(s);
    if (decl?.kind === 'VarDecl' && decl.init) {
      const newInit = foldExpr(decl.init);
      const newDecl = { ...decl, init: newInit };
      return decl === s ? newDecl : { ...s, decl: newDecl };
    }
    if (s?.kind === 'Return' && s.value) {
      return { ...s, value: foldExpr(s.value) };
    }
    if (s?.kind === 'ExprStmt' && s.expr) {
      return { ...s, expr: foldExpr(s.expr) };
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// Phase 2: propagate const literals into OTHER const initializers only
// ---------------------------------------------------------------------------

function substInExpr(node, constMap) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(n => substInExpr(n, constMap));
  if (node.kind === 'Ident' && constMap.has(node.name)) {
    return { ...constMap.get(node.name) };
  }
  const out = {};
  for (const k of Object.keys(node)) {
    out[k] = k === 'parent' ? node[k] : substInExpr(node[k], constMap);
  }
  return out;
}

function propagateConstToConst(stmts) {
  const constMap = new Map(); // name → Literal (only literal-valued consts)
  return stmts.map(s => {
    const decl = innerDecl(s);
    if (decl?.kind === 'VarDecl' && decl.varKind === 'const' && decl.init) {
      // Substitute previously known consts into this init, then fold
      const newInit = foldExpr(substInExpr(decl.init, constMap));
      if (isLit(newInit)) constMap.set(decl.name, newInit);
      const newDecl = { ...decl, init: newInit };
      return decl === s ? newDecl : { ...s, decl: newDecl };
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// Phase 3: eliminate consts with zero refs outside their own init
// ---------------------------------------------------------------------------

function countIdents(node, counts) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => countIdents(n, counts)); return; }
  if (node.kind === 'Ident') {
    counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
    return;
  }
  for (const k of Object.keys(node)) {
    if (k !== 'parent') countIdents(node[k], counts);
  }
}

function eliminateUnusedConsts(stmts) {
  // Count refs in: non-VarDecl stmts + VarDecl inits of non-const decls
  const refs = new Map();
  for (const s of stmts) {
    const decl = innerDecl(s);
    if (decl?.kind === 'VarDecl') {
      if (decl.varKind !== 'const' && decl.init) countIdents(decl.init, refs);
    } else {
      countIdents(s, refs);
    }
  }
  // Also count refs in const inits that are NOT fully resolved (not a literal),
  // because those chains still depend on earlier consts.
  for (const s of stmts) {
    const decl = innerDecl(s);
    if (decl?.kind === 'VarDecl' && decl.varKind === 'const' && decl.init && !isLit(decl.init)) {
      countIdents(decl.init, refs);
    }
  }

  return stmts.filter(s => {
    const decl = innerDecl(s);
    if (decl?.kind === 'VarDecl' && decl.varKind === 'const' && isLit(decl.init)) {
      return (refs.get(decl.name) ?? 0) > 0;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Phase 4: dead branch elimination
// ---------------------------------------------------------------------------

function deadBranches(stmts) {
  const out = [];
  for (const s of stmts) {
    if (s?.kind === 'If') {
      const test = foldExpr(s.test);
      if (isBoolLit(test)) {
        if (test.value === 'false') {
          // Dropped; check alternate
          if (s.alternate) {
            const alt = s.alternate?.kind === 'Block'
              ? deadBranches(s.alternate.body)
              : deadBranches([s.alternate]);
            out.push(...alt);
          }
          continue;
        } else {
          // Keep consequent body only
          const body = s.consequent?.kind === 'Block'
            ? deadBranches(s.consequent.body)
            : deadBranches([s.consequent]);
          out.push(...body);
          const last = body[body.length - 1];
          if (last?.kind === 'Return' || last?.kind === 'Throw' || last?.kind === 'Break' || last?.kind === 'Continue') break;
          continue;
        }
      }
      // Non-constant condition: recurse
      out.push({
        ...s,
        test,
        consequent: s.consequent?.kind === 'Block'
          ? { ...s.consequent, body: deadBranches(s.consequent.body) }
          : s.consequent,
        alternate: s.alternate?.kind === 'Block'
          ? { ...s.alternate, body: deadBranches(s.alternate.body) }
          : s.alternate
            ? (deadBranches([s.alternate])[0] ?? null)
            : null,
      });
      continue;
    }
    if (s?.kind === 'Block') {
      out.push({ ...s, body: deadBranches(s.body) });
      continue;
    }
    if (s?.kind === 'While' || s?.kind === 'For') {
      const body = s.body?.kind === 'Block'
        ? { ...s.body, body: deadBranches(s.body.body) }
        : s.body;
      out.push({ ...s, body });
      continue;
    }
    out.push(s);
    // Remove unreachable code after terminator
    if (s?.kind === 'Return' || s?.kind === 'Throw' || s?.kind === 'Break' || s?.kind === 'Continue') break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Apply all four phases to a function/method body's statement list
// ---------------------------------------------------------------------------

function optimizeBody(stmts) {
  let s = foldInits(stmts);
  s = propagateConstToConst(s);
  s = eliminateUnusedConsts(s);
  s = deadBranches(s);
  return s;
}

// Recursively apply to function/class bodies
function optimizeNode(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(optimizeNode);

  if ((node.kind === 'FuncDecl' || node.kind === 'ArrowFunc') && node.body?.kind === 'Block') {
    return { ...node, body: { ...node.body, body: optimizeBody(node.body.body).map(optimizeNode) } };
  }

  if (node.kind === 'ClassDecl') {
    const members = (node.members ?? []).map(m => {
      if (m.kind === 'Method' && m.body?.kind === 'Block') {
        return { ...m, body: { ...m.body, body: optimizeBody(m.body.body).map(optimizeNode) } };
      }
      return m;
    });
    return { ...node, members };
  }

  return node;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function optimize(ast) {
  let body = optimizeBody(ast.body);
  body = body.map(optimizeNode);
  return { ...ast, body };
}
