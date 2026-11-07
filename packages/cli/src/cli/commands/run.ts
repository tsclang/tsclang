import { readFileSync, writeFileSync, mkdtempSync, rmSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, delimiter } from 'path';
import { spawnSync } from 'child_process';
import { findPackageJson } from '@tsclang/compiler';
import { firstPositional } from '../args.js';

// npm-style named task runner: `tsclang run <name>` executes scripts.<name> from
// the ROOT tsc.package.json through the host shell (same trust model as
// builds.<name>.command — dependency manifests are never read). The script's
// exit code becomes the CLI's exit code.
export function runRunCommand(args: string[]): void {
  const pkgPath = findPackageJson(process.cwd());
  if (!pkgPath) {
    process.stderr.write('tsclang run: requires a tsc.package.json\n');
    process.exit(1);
  }

  let pkg: { scripts?: Record<string, unknown> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`tsclang run: error reading tsc.package.json: ${(e as Error).message}\n`);
    process.exit(1);
  }

  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
      ? (pkg.scripts as Record<string, unknown>)
      : {};
  const name = firstPositional(args, 'run');

  if (!name) {
    const names = Object.keys(scripts);
    if (!names.length) {
      process.stdout.write('no scripts in tsc.package.json\n');
    } else {
      process.stdout.write('scripts:\n');
      for (const n of names) process.stdout.write(`  ${n}\n`);
    }
    process.exit(0);
  }

  const cmd = scripts[name];
  if (typeof cmd !== 'string' || !cmd.trim()) {
    const available = Object.keys(scripts).join(', ');
    process.stderr.write(`ConfigError: unknown script '${name}'${available ? `; available: ${available}` : '; no scripts defined'}\n`);
    process.exit(1);
  }

  process.stdout.write(`> ${name}: ${cmd}\n`);

  // Self-shim: a temp dir with a `tsclang` wrapper prepended to PATH, so
  // `tsclang ...` inside a script always invokes THIS CLI even without a
  // global install (the node_modules/.bin idea, self-contained).
  const cliBin = process.argv[1] ? resolve(process.argv[1]) : null;
  const shimDir = mkdtempSync(join(tmpdir(), 'tsclang-run-'));
  try {
    const env = { ...process.env };
    if (cliBin) {
      if (process.platform === 'win32') {
        writeFileSync(join(shimDir, 'tsclang.cmd'), `@node "${cliBin}" %*\r\n`);
      } else {
        const shim = join(shimDir, 'tsclang');
        writeFileSync(shim, `#!/bin/sh\nexec node "${cliBin}" "$@"\n`);
        chmodSync(shim, 0o755);
      }
      env.PATH = `${shimDir}${delimiter}${env.PATH ?? ''}`;
    }
    const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env });
    process.exit(r.status ?? 1);
  } finally {
    rmSync(shimDir, { recursive: true, force: true });
  }
}
