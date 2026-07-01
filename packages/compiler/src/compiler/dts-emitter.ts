// Declaration emitter: tsclang emit-dts <file.tsc>
// Reads AST, emits export declare ... for exported symbols.

import { lex }   from './lexer.js';
import { parse } from './parser.js';

// Convert a TypeRef AST node back to TSC syntax string
function typeToStr(t: unknown): string {
  if (!t) return 'any';
  const n = t as Record<string, unknown>;
  if (n.kind === 'TypeRef') {
    const typeArgs = n.typeArgs as unknown[] | undefined;
    if (!typeArgs?.length) return n.name as string;
    return `${n.name as string}<${typeArgs.map(typeToStr).join(', ')}>`;
  }
  if (n.kind === 'TypeUnion') return (n.types as unknown[]).map(typeToStr).join(' | ');
  if (n.kind === 'TypeIntersection') return (n.types as unknown[]).map(typeToStr).join(' & ');
  if (n.kind === 'ArrayType') return `${typeToStr(n.element)}[]`;
  if (n.kind === 'TypeLiteral' || n.kind === 'TypeObject') {
    const members = (n.members ?? n.fields ?? []) as Record<string, unknown>[];
    const fields = members.map(m => `${m.name as string}: ${typeToStr(m.typeAnn)}`).join('; ');
    return `{ ${fields} }`;
  }
  if (n.kind === 'TupleType') return `[${((n.elements ?? []) as unknown[]).map(typeToStr).join(', ')}]`;
  if (n.kind === 'FunctionType') {
    const params = ((n.params ?? []) as Record<string, unknown>[]).map(p => `${p.name as string}: ${typeToStr(p.typeAnn)}`).join(', ');
    return `(${params}) => ${typeToStr(n.returnType)}`;
  }
  if (n.kind === 'OptionalType') return `${typeToStr(n.inner)}?`;
  return 'any';
}

// Format a parameter
function paramStr(p: unknown): string {
  const n = p as Record<string, unknown>;
  const binding = n.binding as Record<string, unknown> | undefined;
  const name = (n.name ?? binding?.name ?? '_') as string;
  const type = n.typeAnn ? `: ${typeToStr(n.typeAnn)}` : '';
  return name + type;
}

// Emit declaration for a single exported node
function emitDecl(node: unknown): string | null {
  if (!node) return null;
  const raw = node as Record<string, unknown>;
  const n: Record<string, unknown> = raw.kind === 'Export' ? (raw.decl as Record<string, unknown>) : raw;

  if (n?.kind === 'FuncDecl') {
    const params = ((n.params ?? []) as Record<string, unknown>[]).map(paramStr).join(', ');
    const ret = n.returnType ? `: ${typeToStr(n.returnType)}` : ': void';
    return `export declare function ${n.name as string}(${params})${ret};`;
  }

  if (n?.kind === 'ClassDecl') {
    const lines = [`export declare class ${n.name as string} {`];
    for (const m of (n.members ?? []) as Record<string, unknown>[]) {
      if (m.kind === 'Field') {
        lines.push(`  ${m.name as string}: ${typeToStr(m.typeAnn)};`);
      } else if (m.kind === 'Constructor' || (m.kind === 'Method' && m.name === 'constructor')) {
        const params = ((m.params ?? []) as Record<string, unknown>[]).map(paramStr).join(', ');
        lines.push(`  constructor(${params});`);
      } else if (m.kind === 'Method' && m.name !== 'constructor') {
        const params = ((m.params ?? []) as Record<string, unknown>[]).map(paramStr).join(', ');
        const ret = m.returnType ? `: ${typeToStr(m.returnType)}` : ': void';
        lines.push(`  ${m.name as string}(${params})${ret};`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  if (n?.kind === 'TypeAlias') {
    return `export declare type ${n.name as string} = ${typeToStr(n.typeAnn)};`;
  }

  if (n?.kind === 'VarDecl' && (n.varKind === 'const' || n.varKind === 'let')) {
    const type = n.typeAnn ? `: ${typeToStr(n.typeAnn)}` : '';
    return `export declare const ${n.name as string}${type};`;
  }

  return null;
}

export function emitDtsSync(src: string, filename: string): string[] {
  const tokens = lex(src, filename);
  const { ast, errors: parseErrors } = parse(tokens, filename, src);
  if (parseErrors.length > 0) {
    const msg = parseErrors.map(e => e.message).join('; ');
    throw new Error(`Parse errors: ${msg}`);
  }

  const decls: string[] = [];
  for (const node of ast.body) {
    if (node.kind !== 'Export') continue;
    const d = emitDecl(node);
    if (d) decls.push(d);
  }
  return decls;
}
