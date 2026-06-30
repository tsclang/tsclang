import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { MOCK_REGISTRY, readLock, writeLock, readManifest } from '@tsclang/pm';
import type { LockPackage } from '@tsclang/pm';
import { PACKAGE_FILE, PACKAGES_DIR } from '@tsclang/shared';
import { hasFlag, getPositional } from '../args.js';

export function runSearchCommand(args: string[]): void {
  const query = args[1] ?? '';
  const matches = Object.entries(MOCK_REGISTRY).filter(([name]) =>
    !query || name.includes(query)
  );
  if (matches.length === 0) {
    process.stdout.write(`No packages found matching "${query}"\n`);
  } else {
    process.stdout.write(`Found ${matches.length} package${matches.length > 1 ? 's' : ''}${query ? ` matching "${query}"` : ''}:\n`);
    for (const [name, entry] of matches) {
      const latest = (entry.versions ?? []).slice(-1)[0] ?? '?';
      process.stdout.write(`  ${name}@${latest} — ${entry.description ?? ''}\n`);
    }
  }
  process.exit(0);
}

export function runPublishCommand(): void {
  const pkgPath = join(process.cwd(), PACKAGE_FILE);
  if (!existsSync(pkgPath)) {
    process.stderr.write('tsclang publish: tsc.package.json not found\n');
    process.exit(1);
  }
  let pkg: { name?: string; version?: string };
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch (e) {
    process.stderr.write(`tsclang publish: invalid tsc.package.json: ${(e as Error).message}\n`);
    process.exit(1);
  }
  const { name, version } = pkg;
  if (!name || !version) {
    process.stderr.write('tsclang publish: tsc.package.json must have "name" and "version"\n');
    process.exit(1);
  }

  const files: Record<string, string> = {};
  const collectFiles = (dir: string, base = ''): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === PACKAGES_DIR || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      const rel  = base ? `${base}/${entry}` : entry;
      if (statSync(full).isDirectory()) {
        collectFiles(full, rel);
      } else if (entry.endsWith('.tsc') || entry === PACKAGE_FILE) {
        files[rel] = readFileSync(full, 'utf8');
      }
    }
  };
  collectFiles(process.cwd());

  const archive = JSON.stringify({ name, version, files }, null, 2);
  const outFile = join(process.cwd(), `${name}-${version}.tspkg`);
  writeFileSync(outFile, archive, 'utf8');
  const n = Object.keys(files).length;
  process.stdout.write(`Published ${name}@${version} (${n} file${n !== 1 ? 's' : ''})\n`);
  process.exit(0);
}

export function runInstallCommand(args: string[]): void {
  const productionFlag = hasFlag(args, '--production');
  const pkgArg = getPositional(args, 'install');

  if (productionFlag && !pkgArg) {
    process.exit(0);
  }

  if (!pkgArg) {
    const manifest = readManifest();
    if (!manifest) {
      console.error('tsclang install: no tsc.package.json found in current directory');
      process.exit(1);
    }
    const deps: Record<string, string> = productionFlag
      ? (manifest.dependencies || {})
      : { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
    const lock = readLock();
    let installed = 0, updated = 0;
    for (const [name, version] of Object.entries(deps)) {
      if (!lock.packages[name]) {
        lock.packages[name] = { version };
        installed++;
      } else if (lock.packages[name].version !== version) {
        lock.packages[name].version = version;
        updated++;
      }
    }
    const removed: string[] = [];
    for (const name of Object.keys(lock.packages)) {
      if (!deps[name]) { delete lock.packages[name]; removed.push(name); }
    }
    writeLock(lock);
    const parts: string[] = [];
    if (installed) parts.push(`${installed} installed`);
    if (updated) parts.push(`${updated} updated`);
    if (removed.length) parts.push(`${removed.length} removed`);
    process.stdout.write(parts.length ? parts.join(', ') + '\n' : 'Already up to date\n');
    process.exit(0);
  }

  if (pkgArg.endsWith('.tspkg')) {
    const archivePath = resolve(pkgArg);
    if (!existsSync(archivePath)) {
      process.stderr.write(`tsclang install: file not found: ${pkgArg}\n`);
      process.exit(1);
    }
    let archive: { name?: string; version?: string; files?: Record<string, string> };
    try { archive = JSON.parse(readFileSync(archivePath, 'utf8')); } catch (e) {
      process.stderr.write(`tsclang install: invalid .tspkg file: ${(e as Error).message}\n`);
      process.exit(1);
    }
    const { name: pkgName, version: pkgVersion, files } = archive;
    if (!pkgName || !pkgVersion || !files) {
      process.stderr.write('tsclang install: malformed .tspkg (missing name/version/files)\n');
      process.exit(1);
    }
    const pkgDir = join(PACKAGES_DIR, pkgName);
    mkdirSync(pkgDir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(pkgDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, 'utf8');
    }
    const lock = readLock();
    lock.packages[pkgName] = { version: pkgVersion, source: 'local' };
    writeLock(lock);
    process.stdout.write(`Installed ${pkgName}@${pkgVersion}\n`);
    process.exit(0);
  }

  let pkgName: string, pkgVersion: string, pkgSource: string;
  if (pkgArg.startsWith('git+')) {
    pkgName = pkgArg.split('/').pop()!.replace(/\.git$/, '');
    pkgVersion = 'git';
    pkgSource = pkgArg;
  } else {
    const atIdx = pkgArg.lastIndexOf('@');
    if (atIdx > 0) {
      pkgName = pkgArg.slice(0, atIdx);
      pkgVersion = pkgArg.slice(atIdx + 1);
    } else {
      pkgName = pkgArg;
      pkgVersion = 'latest';
    }
    pkgSource = 'registry';
  }

  mkdirSync(join(PACKAGES_DIR, pkgName), { recursive: true });

  const lock = readLock();
  lock.packages[pkgName] = { version: pkgVersion, source: pkgSource };
  writeLock(lock);

  process.exit(0);
}

export function runUpdateCommand(args: string[]): void {
  const pkgArg = getPositional(args, 'update');

  if (pkgArg) {
    const lock = readLock();
    lock.packages[pkgArg] = { ...(lock.packages[pkgArg] || {}) };
    lock.packages[pkgArg].version = 'latest';
    writeLock(lock);
  } else {
    writeLock({ version: 1, packages: {} });
  }

  process.exit(0);
}
