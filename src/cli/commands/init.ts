import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { flagValue, hasFlagAny } from '../args.js';

export function runInitCommand(args: string[]): void {
  let name: string | null = null;
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('-')) {
      name = args[i];
      break;
    }
  }

  const hasLibrary = hasFlagAny(args, '--library', '-l');
  const hasDeclaration = hasFlagAny(args, '--declaration', '-d');
  let type = flagValue(args, '--type') ?? 'executable';
  if (hasLibrary) type = 'library';
  if (hasDeclaration) type = 'declaration';

  const pkgName = name || 'myapp';

  if (name) {
    mkdirSync(name, { recursive: true });
    process.chdir(name);
  }

  let pkg;
  if (type === 'executable') {
    pkg = { version: '0.1.0', type, main: 'src/main.tsc', name: pkgName };
  } else {
    pkg = { version: '0.1.0', name: pkgName, type };
  }

  writeFileSync('tsc.package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  if (type === 'executable') {
    mkdirSync('src', { recursive: true });
    if (!existsSync('src/main.tsc')) {
      writeFileSync('src/main.tsc', 'console.log("Hello, World!");\n', 'utf8');
    }
  }

  process.exit(0);
}
