import { readFileSync } from 'fs';
import { resolve } from 'path';
import { flagValue } from '../args.js';
import { generateProjectCmake } from '../cmake.js';
import { DEFAULT_TARGET } from '@tsclang/shared';

export function runBuildCmakeCommand(args: string[]): void {
  const pkgFile = args[1];
  if (!pkgFile) {
    console.error('tsclang build-cmake: missing tsc.package.json file');
    process.exit(1);
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(resolve(pkgFile), 'utf8'));
  } catch (e) {
    process.stderr.write(`tsclang build-cmake: cannot read '${pkgFile}': ${(e as Error).message}\n`);
    process.exit(1);
  }

  const buildNameArg = flagValue(args, '--build') ?? null;
  const builds = (pkg.builds ?? {}) as Record<string, Record<string, unknown>>;
  const buildNames = Object.keys(builds);
  const buildName = buildNameArg ?? (buildNames.length === 1 ? buildNames[0] : null);
  const buildCfg = buildName ? (builds[buildName] ?? {}) : {};

  const projectName = (pkg.name as string | undefined)?.replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_-]/g, '_') ?? 'project';
  const target      = (buildCfg.target as string) ?? DEFAULT_TARGET;
  const mcu         = (buildCfg.mcu as string) ?? null;
  const toolchain   = (buildCfg.toolchain as string) ?? (target === 'avr' ? 'avr-gcc' : 'gcc');
  const optimize    = (buildCfg.optimize as string) ?? null;
  const mainTsc     = (pkg.main as string) ?? `${projectName}.tsc`;
  const mainFile    = mainTsc.replace(/\.tsc$/, '.c');

  process.stdout.write(generateProjectCmake({ projectName, target, mcu, toolchain, optimize, mainFile }));
  process.exit(0);
}
