// AST optimizer — activated by --optimize flag
// Strategy:
//   Phase 1: fold constant binary/unary expressions everywhere (bottom-up)
//   Phase 2: propagate const literals into OTHER const initializers only
//   Phase 3: eliminate consts that have zero refs outside their own init
//   Phase 4: dead branch elimination (if(false)/if(true))

import type {
  Program, Stmt, Expression, Literal, BaseNode,
  VarDecl, Return, ExprStmt, If, Block, While, For,
  ClassDecl, ClassMember, Method, Ident,
} from '@tsclang/ast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numLit(value: number): Literal {
  return { kind: 'Literal', litType: 'number', value: String(value) };
}

function boolLit(value: boolean): Literal {
  return { kind: 'Literal', litType: 'bool', value: value ? 'true' : 'false' };
}

function isNumLit(node: unknown): node is Literal {
  return node != null && typeof node === 'object' &&
    (node as BaseNode).kind === 'Literal' &&
    (node as Literal).litType === 'number';
}

function isBoolLit(node: unknown): node is Literal {
  return node != null && typeof node === 'object' &&
    (node as BaseNode).kind === 'Literal' &&
    (node as Literal).litType === 'bool';
}

function isLit(node: unknown): node is Literal {
  return node != null && typeof node === 'object' &&
    (node as BaseNode).kind === 'Literal';
}

function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// Unwrap Export wrapper → inner decl
function innerDecl(s: Stmt | undefined | null): Stmt | undefined {
  return s != null && (s as BaseNode).kind === 'Export'
    ? (s as { decl: Stmt }).decl
    : (s ?? undefined);
}

// ---------------------------------------------------------------------------
// Phase 1: fold constant expressions (bottom-up, in-place clone)
// ---------------------------------------------------------------------------

function foldExpr(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(foldExpr);

  const src = node as Record<string, any>;
  const out: Record<string, any> = {};
  for (const k of Object.keys(src)) {
    out[k] = k === 'parent' ? src[k] : foldExpr(src[k]);
  }

  if (out.kind === 'Binary') {
    const { left, right, op } = out as { op: string; left: Expression; right: Expression };
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
    const op: string = out.op;
    const operand: Expression | undefined = out.operand ?? out.expr;
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

// Internal shape used for narrowing in foldExpr
interface Binary { op: string; left: Expression; right: Expression; }

// Apply foldExpr to every VarDecl init in a stmt list (non-recursive into functions).
function foldInits(stmts: Stmt[]): Stmt[] {
  return stmts.map((s: Stmt): Stmt => {
    const decl = innerDecl(s);
    if (decl && (decl as BaseNode).kind === 'VarDecl') {
      const vd = decl as VarDecl;
      if (vd.init) {
        const newInit = foldExpr(vd.init) as Expression;
        const newDecl: VarDecl = { ...vd, init: newInit };
        return decl === s ? newDecl : { ...(s as object), decl: newDecl } as unknown as Stmt;
      }
    }
    if ((s as BaseNode).kind === 'Return') {
      const r = s as Return;
      if (r.value) return { ...r, value: foldExpr(r.value) as Expression } as Stmt;
    }
    if ((s as BaseNode).kind === 'ExprStmt') {
      const e = s as ExprStmt;
      return { ...e, expr: foldExpr(e.expr) as Expression } as Stmt;
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// Phase 2: propagate const literals into OTHER const initializers only
// ---------------------------------------------------------------------------

function substInExpr(node: unknown, constMap: Map<string, Literal>): unknown {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(n => substInExpr(n, constMap));
  const src = node as Record<string, any>;
  if (src.kind === 'Ident' && constMap.has(src.name)) {
    return { ...constMap.get(src.name)! };
  }
  const out: Record<string, any> = {};
  for (const k of Object.keys(src)) {
    out[k] = k === 'parent' ? src[k] : substInExpr(src[k], constMap);
  }
  return out;
}

function propagateConstToConst(stmts: Stmt[]): Stmt[] {
  const constMap = new Map<string, Literal>();
  return stmts.map((s: Stmt): Stmt => {
    const decl = innerDecl(s);
    if (decl && (decl as BaseNode).kind === 'VarDecl') {
      const vd = decl as VarDecl;
      if (vd.varKind === 'const' && vd.init) {
        const newInit = foldExpr(substInExpr(vd.init, constMap)) as Expression;
        if (isLit(newInit)) constMap.set(vd.name, newInit);
        const newDecl: VarDecl = { ...vd, init: newInit };
        return decl === s ? newDecl : { ...(s as object), decl: newDecl } as unknown as Stmt;
      }
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// Phase 3: eliminate consts with zero refs outside their own init
// ---------------------------------------------------------------------------

function countIdents(node: unknown, counts: Map<string, number>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => countIdents(n, counts)); return; }
  const n = node as BaseNode;
  if (n.kind === 'Ident') {
    const ident = n as unknown as Ident;
    counts.set(ident.name, (counts.get(ident.name) ?? 0) + 1);
    return;
  }
  for (const k of Object.keys(node as object)) {
    if (k !== 'parent') countIdents((node as Record<string, unknown>)[k], counts);
  }
}

function eliminateUnusedConsts(stmts: Stmt[]): Stmt[] {
  const refs = new Map<string, number>();
  for (const s of stmts) {
    const decl = innerDecl(s);
    if (decl && (decl as BaseNode).kind === 'VarDecl') {
      const vd = decl as VarDecl;
      if (vd.varKind !== 'const' && vd.init) countIdents(vd.init, refs);
    } else {
      countIdents(s, refs);
    }
  }
  for (const s of stmts) {
    const decl = innerDecl(s);
    if (decl && (decl as BaseNode).kind === 'VarDecl') {
      const vd = decl as VarDecl;
      if (vd.varKind === 'const' && vd.init && !isLit(vd.init)) {
        countIdents(vd.init, refs);
      }
    }
  }

  return stmts.filter((s: Stmt) => {
    const decl = innerDecl(s);
    if (decl && (decl as BaseNode).kind === 'VarDecl') {
      const vd = decl as VarDecl;
      if (vd.varKind === 'const' && isLit(vd.init)) {
        return (refs.get(vd.name) ?? 0) > 0;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Phase 4: dead branch elimination
// ---------------------------------------------------------------------------

function deadBranches(stmts: Stmt[]): Stmt[] {
  const out: Stmt[] = [];
  for (const s of stmts) {
    const kind = (s as BaseNode).kind;
    if (kind === 'If') {
      const ifNode = s as If;
      const test = foldExpr(ifNode.test) as Expression;
      if (isBoolLit(test)) {
        if (test.value === 'false') {
          if (ifNode.alternate) {
            const altKind = (ifNode.alternate as BaseNode).kind;
            const alt: Stmt[] = altKind === 'Block'
              ? deadBranches((ifNode.alternate as Block).body)
              : deadBranches([ifNode.alternate]);
            out.push(...alt);
          }
          continue;
        } else {
          const consKind = (ifNode.consequent as BaseNode).kind;
          const body: Stmt[] = consKind === 'Block'
            ? deadBranches((ifNode.consequent as Block).body)
            : deadBranches([ifNode.consequent]);
          out.push(...body);
          const last = body[body.length - 1];
          const lastKind = last ? (last as BaseNode).kind : '';
          if (lastKind === 'Return' || lastKind === 'Throw' || lastKind === 'Break' || lastKind === 'Continue') break;
          continue;
        }
      }
      const consKind = (ifNode.consequent as BaseNode).kind;
      const altKind = ifNode.alternate ? (ifNode.alternate as BaseNode).kind : '';
      out.push({
        ...ifNode,
        test,
        consequent: consKind === 'Block'
          ? { ...(ifNode.consequent as object), body: deadBranches((ifNode.consequent as Block).body) }
          : ifNode.consequent,
        alternate: ifNode.alternate
          ? (altKind === 'Block'
              ? { ...(ifNode.alternate as object), body: deadBranches((ifNode.alternate as Block).body) }
              : (deadBranches([ifNode.alternate])[0] ?? null))
          : null,
      } as unknown as If);
      continue;
    }
    if (kind === 'Block') {
      const block = s as Block;
      out.push({ ...block, body: deadBranches(block.body) } as Block);
      continue;
    }
    if (kind === 'While' || kind === 'For') {
      const loop = s as While | For;
      const bodyKind = (loop.body as BaseNode).kind;
      const body: Stmt = bodyKind === 'Block'
        ? { ...(loop.body as object), body: deadBranches((loop.body as Block).body) } as unknown as Stmt
        : loop.body;
      out.push({ ...loop, body } as unknown as While | For);
      continue;
    }
    out.push(s);
    if (kind === 'Return' || kind === 'Throw' || kind === 'Break' || kind === 'Continue') break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Apply all four phases to a function/method body's statement list
// ---------------------------------------------------------------------------

function optimizeBody(stmts: Stmt[]): Stmt[] {
  let s = foldInits(stmts);
  s = propagateConstToConst(s);
  s = eliminateUnusedConsts(s);
  s = deadBranches(s);
  return s;
}

// Recursively apply to function/class bodies
// At runtime, FuncDecl/Method body is a Block node from parseBlock(),
// even though AST types declare it as Stmt[]. This captures the real shape.
interface BlockBody { kind: 'Block'; body: Stmt[] }

function optimizeNode(node: Stmt): Stmt {
  const kind = (node as BaseNode).kind;

  if (kind === 'FuncDecl' || kind === 'ArrowFunc') {
    const fn = node as BaseNode & Record<string, unknown>;
    const body = fn.body as BlockBody | undefined;
    if (body?.kind === 'Block') {
      return { ...fn, body: { ...body, body: optimizeBody(body.body).map(optimizeNode) } } as unknown as Stmt;
    }
  }

  if (kind === 'ClassDecl') {
    const cls = node as ClassDecl;
    const members = (cls.members ?? []).map((m: ClassMember) => {
      if (m.kind !== 'Method') return m;
      const mbody = m.body as unknown as BlockBody | undefined;
      if (mbody?.kind === 'Block') {
        return { ...m, body: { ...mbody, body: optimizeBody(mbody.body).map(optimizeNode) } } as unknown as Method;
      }
      return m;
    });
    return { ...cls, members } as ClassDecl;
  }

  return node;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function optimize(ast: Program): Program {
  let body = optimizeBody(ast.body);
  body = body.map(optimizeNode);
  return { ...ast, body };
}
