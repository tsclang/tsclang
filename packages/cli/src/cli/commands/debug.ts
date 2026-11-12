import { writeFileSync, mkdtempSync, readFileSync, existsSync } from 'fs';
import { join, resolve, dirname, delimiter } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { compileTsc } from '@tsclang/compiler';
import { GCC_LINK_FLAGS, RUNTIME_DIR, DEBUG_FLAG, PACKAGE_FILE } from '@tsclang/shared';
import { parseToolchainSpec, resolveToolchain } from '@tsclang/pm';
import { missingInput } from '../helpers.js';
import { toolAvailable } from '../toolchain.js';

/** The manifest's explicit compiler choice: the first builds.<n>.toolchain
 * pin. #282 — a hand-written pin is the only thing that authorizes PATH. */
function readPinnedToolchain(): string | null {
  const manifestPath = join(process.cwd(), PACKAGE_FILE);
  if (!existsSync(manifestPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as { builds?: Record<string, { toolchain?: unknown }> };
    for (const cfg of Object.values(pkg.builds ?? {})) {
      if (cfg && typeof cfg === 'object' && typeof cfg.toolchain === 'string' && cfg.toolchain) return cfg.toolchain;
    }
  } catch {
    // an invalid manifest is build/validate's diagnostic to report
  }
  return null;
}

export function runDebugCommand(args: string[], rootDir: string): void {
  const inputFile = args[1];
  if (!inputFile) {
    missingInput('debug');
  }
  const inputPath = resolve(inputFile);
  const { c } = compileTsc(inputPath, { debugLines: true, sourcemap: true });
  const tmpDir = mkdtempSync(join(tmpdir(), 'tsclang-dbg-'));
  const mainC = join(tmpDir, 'main.c');
  const binaryPath = join(tmpDir, 'main');
  writeFileSync(mainC, c, 'utf8');
  const runtimeInc = join(rootDir, RUNTIME_DIR);

  // #282: debug compiles, so the toolchain contract of `build` applies — the
  // isolated platform cache is the default source; PATH only for the
  // manifest's pinned builds.<n>.toolchain, never a silent system gcc.
  const pin = readPinnedToolchain();
  const spec = pin !== null ? parseToolchainSpec(pin) : { name: 'clang', version: undefined as string | undefined };
  const resolved = resolveToolchain(spec.name, { version: spec.version, allowPath: pin !== null });
  if (!resolved) {
    process.stderr.write(`ConfigError: tsclang debug requires a toolchain '${spec.name}' — none is configured\n`);
    process.stderr.write('hint: tsclang platform install @tsclang/desktop  (toolchains ship with the platform package)\n');
    process.stderr.write(`hint: or pin one explicitly: builds.<n>.toolchain = "${spec.name}"\n`);
    process.exit(1);
  }
  const ccCommand = resolved.kind === 'isolated' ? join(resolved.binDir, spec.name) : spec.name;
  const ccEnv = resolved.kind === 'isolated' ? withBinDirOnPath({ ...process.env }, resolved.binDir) : process.env;
  const ccResult = spawnSync(ccCommand, [mainC, '-o', binaryPath, DEBUG_FLAG, `-I${runtimeInc}`, ...GCC_LINK_FLAGS], { encoding: 'utf8', env: ccEnv });
  if (ccResult.status !== 0) {
    process.stderr.write(ccResult.stderr || `${spec.name} failed\n`);
    process.exit(1);
  }
  if (toolAvailable('gdb')) {
    const gdbArgs = ['--source-directory', dirname(inputPath), '-q', binaryPath];
    spawnSync('gdb', gdbArgs, { stdio: 'inherit' });
  } else if (toolAvailable('lldb')) {
    // the LLVM-world debugger — desktop is clang/LLVM-only (#282)
    spawnSync('lldb', ['-q', binaryPath], { stdio: 'inherit' });
  } else {
    process.stderr.write('tsclang debug: no debugger found (gdb or lldb), running without one\n');
    const r = spawnSync(binaryPath, [], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
}

// PATH/Path both keys: MSYS/Git-Bash parents send `PATH`, native Windows
// sends `Path` — a stale duplicate must not shadow the prepended dir
function withBinDirOnPath(env: NodeJS.ProcessEnv, binDir: string): NodeJS.ProcessEnv {
  const value = `${binDir}${delimiter}${process.env.Path ?? process.env.PATH ?? ''}`;
  env.PATH = value;
  env.Path = value;
  return env;
}
