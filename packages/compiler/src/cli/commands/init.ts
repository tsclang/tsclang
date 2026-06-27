import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { flagValue, hasFlagAny } from '../args.js';
import { packageGenerate } from '../package.js';
import { PackageType } from '../../types/package-type.js';

export function runInitCommand(args: string[]): void {
  let name: string | null = null;
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('-')) {
      name = args[i];
      break;
    }
  }

  const hasDeclaration = hasFlagAny(args, '--declaration', '-d');
  const hasLibrary = hasFlagAny(args, '--library', '-l');
  const hasPlatform = hasFlagAny(args, '--platform', '-p');

  let type: PackageType = (flagValue(args, '--type') ?? 'executable') as PackageType;

  if (hasDeclaration) type = 'declaration';
  if (hasLibrary) type = 'library';
  if (hasPlatform) type = 'platform';

  const pkgName = name || 'myapp';

  if (name) {
    mkdirSync(name, { recursive: true });
    process.chdir(name);
  }

  const pkg = packageGenerate(pkgName, type);

  writeFileSync('tsc.package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  if (type === 'executable') {
    mkdirSync('src', { recursive: true });
    if (!existsSync('src/main.tsc')) {
      writeFileSync('src/main.tsc', 'console.log("Hello, World!");\n', 'utf8');
    }
  }

  process.exit(0);
}
