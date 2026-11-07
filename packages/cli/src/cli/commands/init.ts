import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { flagValue, firstPositional, hasFlagAny } from '../args.js';
import { packageGenerate } from '@tsclang/pm';
import { PackageType, PACKAGE_FILE } from '@tsclang/shared';

export function runInitCommand(args: string[]): void {
  const name = firstPositional(args, 'init');

  const hasDeclaration = hasFlagAny(args, '--declaration', '-d');
  const hasLibrary = hasFlagAny(args, '--library', '-l');
  const hasPlatform = hasFlagAny(args, '--platform', '-p');
  const hasAvr = hasFlagAny(args, '--avr');

  let type: PackageType = (flagValue(args, '--type') ?? 'executable') as PackageType;

  if (hasDeclaration) type = 'declaration';
  if (hasLibrary) type = 'library';
  if (hasPlatform) type = 'platform';

  const preset: 'desktop' | 'avr' = hasAvr ? 'avr' : 'desktop';
  const pkgName = name || 'myapp';

  if (name) {
    mkdirSync(name, { recursive: true });
    process.chdir(name);
  }

  const pkg = packageGenerate(pkgName, type, preset);

  writeFileSync(PACKAGE_FILE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  if (type === 'executable') {
    mkdirSync('src', { recursive: true });
    if (!existsSync('src/main.tsc')) {
      writeFileSync('src/main.tsc', 'console.log("Hello, World!");\n', 'utf8');
    }

    mkdirSync('test', { recursive: true });
    if (!existsSync('test/main.test.tsc')) {
      writeFileSync('test/main.test.tsc', [
        'function add(a: i32, b: i32): i32 {',
        '  return a + b',
        '}',
        '',
        'let result = add(1, 1)',
        'if (result != 2) {',
        '  console.error("FAIL: add(1, 1) = " + result.toString())',
        '  process.exit(1)',
        '}',
        'console.log("PASS: add(1, 1) = " + result.toString())',
        '',
      ].join('\n'), 'utf8');
    }
  }

  if (type === 'library' && !existsSync('index.tsc')) {
    writeFileSync('index.tsc', 'export function hello(): string {\n  return "Hello, World!"\n}\n', 'utf8');
  }

  if (type === 'declaration' && !existsSync('index.d.tsc')) {
    writeFileSync('index.d.tsc', [
      'declare function example_add(a: i32, b: i32): i32',
      'declare const EXAMPLE_OK: i32 = 0',
      '',
    ].join('\n'), 'utf8');
  }

  process.exit(0);
}
