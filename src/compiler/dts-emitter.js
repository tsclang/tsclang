// Declaration emitter: tsclang emit-dts <file.tsc>
// Reads AST, emits export declare ... for exported symbols.

import { lex }   from './lexer.js';
import { parse } from './parser.js';

// Convert a TypeRef AST node back to TSC syntax string
function typeToStr(t) {
  if (!t) return 'any';
  if (t.kind === 'TypeRef') {
    if (!t.typeArgs?.length) return t.name;
    return `${t.name}<${t.typeArgs.map(typeToStr).join(', ')}>`;
  }
  if (t.kind === 'TypeUnion') return t.types.map(typeToStr).join(' | ');
  if (t.kind === 'TypeIntersection') return t.types.map(typeToStr).join(' & ');
  if (t.kind === 'ArrayType') return `${typeToStr(t.element)}[]`;
  if (t.kind === 'TypeLiteral' || t.kind === 'TypeObject') {
    const fields = (t.members ?? t.fields ?? []).map(m => `${m.name}: ${typeToStr(m.typeAnn)}`).join('; ');
    return `{ ${fields} }`;
  }
  if (t.kind === 'TupleType') return `[${(t.elements ?? []).map(typeToStr).join(', ')}]`;
  if (t.kind === 'FunctionType') {
    const params = (t.params ?? []).map(p => `${p.name}: ${typeToStr(p.typeAnn)}`).join(', ');
    return `(${params}) => ${typeToStr(t.returnType)}`;
  }
  if (t.kind === 'OptionalType') return `${typeToStr(t.inner)}?`;
  return 'any';
}

// Format a parameter
function paramStr(p) {
  const name = p.name ?? p.binding?.name ?? '_';
  const type = p.typeAnn ? `: ${typeToStr(p.typeAnn)}` : '';
  return name + type;
}

// Emit declaration for a single exported node
function emitDecl(node) {
  if (!node) return null;
  const n = node.kind === 'Export' ? node.decl : node;

  if (n?.kind === 'FuncDecl') {
    const params = (n.params ?? []).map(paramStr).join(', ');
    const ret = n.returnType ? `: ${typeToStr(n.returnType)}` : ': void';
    return `export declare function ${n.name}(${params})${ret};`;
  }

  if (n?.kind === 'ClassDecl') {
    const lines = [`export declare class ${n.name} {`];
    for (const m of (n.members ?? [])) {
      if (m.kind === 'Field') {
        lines.push(`  ${m.name}: ${typeToStr(m.typeAnn)};`);
      } else if (m.kind === 'Constructor' || (m.kind === 'Method' && m.name === 'constructor')) {
        const params = (m.params ?? []).map(paramStr).join(', ');
        lines.push(`  constructor(${params});`);
      } else if (m.kind === 'Method' && m.name !== 'constructor') {
        const params = (m.params ?? []).map(paramStr).join(', ');
        const ret = m.returnType ? `: ${typeToStr(m.returnType)}` : ': void';
        lines.push(`  ${m.name}(${params})${ret};`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  if (n?.kind === 'TypeAlias') {
    return `export declare type ${n.name} = ${typeToStr(n.typeAnn)};`;
  }

  if (n?.kind === 'VarDecl' && (n.varKind === 'const' || n.varKind === 'let')) {
    const type = n.typeAnn ? `: ${typeToStr(n.typeAnn)}` : '';
    return `export declare const ${n.name}${type};`;
  }

  return null;
}

export function emitDtsSync(src, filename) {
  const tokens = lex(src, filename);
  const ast    = parse(tokens, filename, src);

  const decls = [];
  for (const node of ast.body) {
    if (node.kind !== 'Export') continue;
    const d = emitDecl(node);
    if (d) decls.push(d);
  }
  return decls;
}
