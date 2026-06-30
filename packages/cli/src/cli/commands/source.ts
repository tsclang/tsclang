import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename, extname, dirname, join } from 'path';
import { lex, parse, lint, applyFixes, emitDtsSync } from '@tsclang/compiler';
import { hasFlag, getPositional } from '../args.js';
import { missingInput, reportErrors } from '../helpers.js';

export function runEmitDtsCommand(args: string[]): void {
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('emit-dts');
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);
  const decls = emitDtsSync(src, filename);
  const outName = basename(inputPath, extname(inputPath)) + '.d.tsc';
  const outPath = join(dirname(inputPath), outName);
  writeFileSync(outPath, decls.join('\n') + '\n', 'utf8');
  process.stdout.write(`Emitted ${outName} (${decls.length} declarations)\n`);
  process.exit(0);
}

export async function runFormatCommand(args: string[]): Promise<void> {
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('format');
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const { format } = await import('../../formatter.js');
  const formatted = format(src);
  writeFileSync(inputPath, formatted, 'utf8');
  process.exit(0);
}

export function runLintCommand(args: string[]): void {
  const fixFlag    = hasFlag(args, '--fix');
  const ruleArg    = args.find((a: string) => a.startsWith('--rule='));
  const ruleFilter = ruleArg ? [ruleArg.slice('--rule='.length)] : undefined;
  const inputFile  = getPositional(args, 'lint');
  if (!inputFile) {
    missingInput('lint');
  }
  const inputPath = resolve(inputFile);
  const src = readFileSync(inputPath, 'utf8');
  const filename = basename(inputPath);

  let ast;
  try {
    const tokens = lex(src, filename);
    const { ast: parsedAst, errors: parseErrors } = parse(tokens, filename, src);
    if (parseErrors.length > 0) {
      const bag = parseErrors.map((e: unknown) => Object.assign(e as Record<string, unknown>, { kind: 'error' }));
      throw { isTscErrorBag: true, errors: bag };
    }
    ast = parsedAst;
  } catch (e) {
    reportErrors(e, filename);
    process.exit(1);
  }

  const diagnostics = lint(ast, { rules: ruleFilter });

  if (fixFlag) {
    const fixed = applyFixes(src, diagnostics);
    writeFileSync(inputPath, fixed, 'utf8');
    const remaining = diagnostics.filter((d: { fixable: boolean }) => !d.fixable);
    for (const d of remaining) {
      const tag = d.severity === 'error' ? 'LintError' : 'LintWarning';
      process.stderr.write(`${tag}[${(d as { rule: string }).rule}]: ${(d as { message: string }).message} at line ${(d as { line: number }).line}\n`);
    }
    process.exit(remaining.some((d: { severity: string }) => d.severity === 'error') ? 1 : 0);
  }

  for (const d of diagnostics) {
    const tag = d.severity === 'error' ? 'LintError' : 'LintWarning';
    process.stderr.write(`${tag}[${(d as { rule: string }).rule}]: ${(d as { message: string }).message} at line ${(d as { line: number }).line}\n`);
  }
  process.exit(diagnostics.length > 0 ? 1 : 0);
}
