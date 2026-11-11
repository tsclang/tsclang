import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { MOCK_REGISTRY, readLock, writeLock, readManifest, resolveRange, manifestAddDependency, manifestRemoveDependency } from '@tsclang/pm';
import type { LockPackage, LockFile } from '@tsclang/pm';
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
      // Platform packages carry C headers + toolchain files alongside sources:
      // .tsc (incl. .d.tsc declarations), .h, .cmake (toolchain.cmake).
      } else if (entry.endsWith('.tsc') || entry.endsWith('.h') || entry.endsWith('.cmake') || entry === PACKAGE_FILE) {
        files[rel] = readFileSync(full, 'utf8');
      }
    }
  };
  collectFiles(process.cwd());

  const archive = JSON.stringify({ name, version, files }, null, 2);
  // Scoped names carry '/', which is not a valid filename — materialize with
  // a dash (npm does the same for tarballs): @tsclang/probe → @tsclang-probe-1.0.0.tspkg
  const outFile = join(process.cwd(), `${name.replace('/', '-')}-${version}.tspkg`);
  writeFileSync(outFile, archive, 'utf8');
  const n = Object.keys(files).length;
  process.stdout.write(`Published ${name}@${version} (${n} file${n !== 1 ? 's' : ''})\n`);
  process.exit(0);
}

// Bare `install` / auto-install after `update`: reconcile the lock with the
// manifest — resolves each constraint to an exact version, prunes entries no
// longer listed. Returns the one-line summary.
function syncFromManifest(production: boolean): string {
  const manifest = readManifest();
  if (!manifest) {
    process.stderr.write('tsclang install: no tsc.package.json found in current directory\n');
    process.exit(1);
  }
  const deps: Record<string, string> = production
    ? (manifest.dependencies || {})
    : { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
  const lock = readLock();
  let installed = 0, updated = 0;
  for (const [name, range] of Object.entries(deps)) {
    const resolved = resolveRange(name, range) ?? range;
    if (!lock.packages[name]) {
      lock.packages[name] = { version: resolved };
      installed++;
    } else if (lock.packages[name].version !== resolved) {
      lock.packages[name].version = resolved;
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
  return parts.length ? parts.join(', ') : 'Already up to date';
}

export function runInstallCommand(args: string[]): void {
  const productionFlag = hasFlag(args, '--production');
  const pkgArg = getPositional(args, 'install');

  if (!pkgArg) {
    process.stdout.write(syncFromManifest(productionFlag) + '\n');
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
    manifestAddDependency(pkgName, pkgVersion);
    const lock = readLock();
    lock.packages[pkgName] = { version: pkgVersion, source: 'local' };
    writeLock(lock);
    process.stdout.write(`Installed ${pkgName}@${pkgVersion}\n`);
    process.exit(0);
  }

  // npm semantics: the package is recorded in dependencies of the manifest
  // (creating one when absent) and pinned to an exact version in the lock.
  let pkgName: string, constraint: string, lockVersion: string, pkgSource: string;
  if (pkgArg.startsWith('git+')) {
    pkgName = pkgArg.split('/').pop()!.replace(/\.git$/, '');
    constraint = pkgArg;
    lockVersion = 'git';
    pkgSource = pkgArg;
  } else {
    const atIdx = pkgArg.lastIndexOf('@');
    if (atIdx > 0) {
      pkgName = pkgArg.slice(0, atIdx);
      constraint = pkgArg.slice(atIdx + 1);
      lockVersion = resolveRange(pkgName, constraint) ?? constraint;
    } else {
      pkgName = pkgArg;
      lockVersion = resolveRange(pkgName, 'latest') ?? 'latest';
      constraint = /^\d/.test(lockVersion) ? `^${lockVersion}` : lockVersion;
    }
    pkgSource = 'registry';
  }

  mkdirSync(join(PACKAGES_DIR, pkgName), { recursive: true });
  manifestAddDependency(pkgName, constraint);

  const lock = readLock();
  lock.packages[pkgName] = { version: lockVersion, source: pkgSource };
  writeLock(lock);

  process.stdout.write(`Installed ${pkgName}@${lockVersion}\n`);
  process.exit(0);
}

export function runUpdateCommand(args: string[]): void {
  const pkgArg = getPositional(args, 'update');
  const manifest = readManifest();
  if (!manifest) {
    process.stderr.write('tsclang update: no tsc.package.json found in current directory\n');
    process.exit(1);
  }
  const deps: Record<string, string> = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };
  const lock: LockFile = readLock();

  if (pkgArg) {
    const range = deps[pkgArg];
    if (range === undefined) {
      process.stderr.write(`tsclang update: package '${pkgArg}' is not in tsc.package.json\n`);
      process.exit(1);
    }
    const resolved = resolveRange(pkgArg, range) ?? range;
    const prev = lock.packages[pkgArg]?.version;
    const entry: LockPackage = { ...(lock.packages[pkgArg] || {}), version: resolved };
    lock.packages[pkgArg] = entry;
    writeLock(lock);
    process.stdout.write(prev && prev !== resolved
      ? `Updated ${pkgArg} ${prev} -> ${resolved}\n`
      : `Updated ${pkgArg} -> ${resolved}\n`);
    process.exit(0);
  }

  // Bare update: re-resolve every dependency, then sync the lock with the
  // manifest (the auto-install the spec promises) — never wipe the lock.
  let changed = 0;
  for (const [name, range] of Object.entries(deps)) {
    const resolved = resolveRange(name, range) ?? range;
    const prev = lock.packages[name]?.version;
    if (!prev || prev !== resolved) {
      lock.packages[name] = { ...(lock.packages[name] || {}), version: resolved };
      changed++;
    }
  }
  for (const name of Object.keys(lock.packages)) {
    if (!deps[name]) delete lock.packages[name];
  }
  writeLock(lock);
  process.stdout.write(changed
    ? `Updated ${changed} package${changed > 1 ? 's' : ''}\n`
    : 'Already up to date\n');
  process.exit(0);
}

export function runRemoveCommand(args: string[]): void {
  const pkgArg = getPositional(args, 'remove');
  if (!pkgArg) {
    process.stderr.write('tsclang remove: missing package name\n');
    process.exit(1);
  }

  const lock = readLock();
  const inLock = lock.packages[pkgArg] !== undefined;
  const inManifest = manifestRemoveDependency(pkgArg);
  const pkgDir = join(PACKAGES_DIR, pkgArg);
  const onDisk = existsSync(pkgDir);

  if (!inLock && !inManifest && !onDisk) {
    process.stderr.write(`tsclang remove: package '${pkgArg}' is not installed\n`);
    process.exit(1);
  }

  if (inLock) {
    delete lock.packages[pkgArg];
    writeLock(lock);
  }
  if (onDisk) rmSync(pkgDir, { recursive: true, force: true });

  process.stdout.write(`Removed ${pkgArg}\n`);
  process.exit(0);
}
