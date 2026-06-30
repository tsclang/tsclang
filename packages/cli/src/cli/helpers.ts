import { existsSync } from 'fs';
import { renderDiagnostic } from '@tsclang/compiler';
import type { TscError } from '@tsclang/compiler';

export function missingInput(cmd: string): never {
  process.stderr.write(`tsclang ${cmd}: missing input file\n\nUsage: tsclang ${cmd} <input.tsc> [options]\nRun 'tsclang ${cmd} --help' for details.\n`);
  process.exit(1);
}

export function checkInput(cmd: string, inputPath: string): void {
  if (!existsSync(inputPath)) {
    process.stderr.write(`tsclang ${cmd}: file not found: ${inputPath}\n`);
    process.exit(1);
  }
}

export function reportErrors(e: unknown, filename: string): void {
  const err = e as { isTscErrorBag?: boolean; errors?: TscError[]; isTscError?: boolean; message?: string; stack?: string };
  const errors = err?.isTscErrorBag ? err.errors
               : err?.isTscError    ? [err as unknown as TscError]
               : null;
  if (errors) {
    for (const e of errors) {
      process.stderr.write(renderDiagnostic(e, { contextLines: 1 }) + '\n');
    }
    const n = errors.length;
    process.stderr.write(`aborting due to ${n} error${n > 1 ? 's' : ''}\n`);
  } else {
    process.stderr.write(`${filename}: ${err?.message ?? e}\n`);
    if (process.env.TSC_DEBUG) process.stderr.write(err?.stack + '\n');
    process.stderr.write('aborting due to 1 error\n');
  }
}
