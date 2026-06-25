import { explainError, ERROR_CATALOG } from '../../compiler/error-catalog.js';

export function runExplainCommand(args: string[]): void {
  const code = args[1];
  if (!code) {
    const codes = Object.keys(ERROR_CATALOG).join(', ');
    console.error(`tsclang explain: missing error code\nKnown codes: ${codes}`);
    process.exit(1);
  }
  const text = explainError(code);
  if (!text) {
    console.error(`tsclang explain: unknown error code '${code}'`);
    process.exit(1);
  }
  process.stdout.write(text + '\n');
  process.exit(0);
}
