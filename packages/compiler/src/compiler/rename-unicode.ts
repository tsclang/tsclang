// Rename pass: unicode identifiers → ASCII-mangled names for C emission.
//
// Runs AFTER semantic checks and BEFORE codegen, so diagnostics keep source
// names while the generated C stays portable (avr-gcc, retro toolchains and
// MSVC do not guarantee non-ASCII identifiers). Deterministic and pure: for
// ASCII identifiers ([A-Za-z0-9_]) it is a no-op, so all existing code is
// unaffected.
//
// Scheme (spec: 02-syntax/02-identifiers.md): every character outside
// [A-Za-z0-9_] is replaced by 'u' + lowercase hex codepoint — 4 digits for
// BMP (ц → u0446), 6 for astral (𝒳 → u01d4b3). '$' is not valid in standard
// C identifiers and is mangled the same way (a$b → au0024b).
//
// Not renamed (C-world or ambient): RawC, Native, DeclareModule subtrees;
// the `name` of DeclareFunction/DeclareConst (extern C symbols).

import type { Program } from '@tsclang/ast';

const RE_NAME_KEYS = new Set([
  'name', 'key', 'prop', 'label', 'param', 'superClass', 'enumName', 'caseName', 'className',
]);
// Keys holding plain string[] name lists (vs node arrays walked normally).
const STR_ARR_KEYS = new Set(['typeParams', 'captures', 'fields']);
const SKIP_SUBTREE = new Set(['RawC', 'Native', 'DeclareModule']);
const KEEP_NAME = new Set(['DeclareFunction', 'DeclareConst']);

export function mangleIdent(name: string): string {
  if (!/[^\w]/.test(name)) return name; // \w = [A-Za-z0-9_] — ASCII fast path
  let out = '';
  for (const ch of name) {
    if (/\w/.test(ch)) {
      out += ch;
    } else {
      const cp = ch.codePointAt(0)!;
      out += 'u' + cp.toString(16).padStart(cp <= 0xffff ? 4 : 6, '0');
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walk(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }
  if (!isPlainObject(node)) return;

  const kind = typeof node.kind === 'string' ? node.kind : null;
  if (kind && SKIP_SUBTREE.has(kind)) return;

  for (const [k, v] of Object.entries(node)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      if (RE_NAME_KEYS.has(k) && !(k === 'name' && kind !== null && KEEP_NAME.has(kind))) {
        node[k] = mangleIdent(v);
      }
    } else if (Array.isArray(v)) {
      if (v.length > 0 && STR_ARR_KEYS.has(k) && v.every((x) => typeof x === 'string')) {
        node[k] = v.map((x) => mangleIdent(x as string));
      } else {
        walk(v);
      }
    } else if (isPlainObject(v)) {
      walk(v);
    }
  }
}

export function renameUnicodeIdents(ast: Program): Program {
  walk(ast);
  return ast;
}
