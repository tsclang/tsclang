// tsclang doctor — environment & project wizard (#259).
// Non-interactive (no TTY): full report, manual instructions instead of
// questions. Interactive prompts and PATH auto-fix land in the follow-up
// step; this file already branches on `interactive` where they will hook in.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { arch, platform as osPlatform } from 'os';
import { PACKAGE_FILE } from '@tsclang/shared';
import { hasFlag } from '../args.js';
import { findTool, msvcDetect } from '../toolchain.js';
import { collectManifestDiagnostics } from './config.js';
import { RECOMMENDED_TOOLS, profileFromBuilds, type ToolProfile } from '../doctor/recommended.js';
import { suggestManifestAdditions, type ManifestAdditions } from '../doctor/suggest.js';
import { installSource, localVersion, updateLine } from '../doctor/version.js';

type Write = (s: string) => void;

const PLATFORM_NAMES: Record<string, string> = { win32: 'windows', darwin: 'macOS' };

function pathFixHint(w: Write, foundAt: string): void {
  const dir = dirname(foundAt);
  if (osPlatform() === 'win32') {
    w('    manual PATH fix (Windows PowerShell, then restart the terminal):');
    w(`      [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";${dir}", "User")`);
  } else {
    w('    manual PATH fix:');
    w(`      export PATH="${dir}:$PATH"   # add to ~/.profile`);
  }
}

function reportMsvc(w: Write): void {
  const m = msvcDetect();
  if (m.inPath) {
    w('  [~] msvc - optional: cl.exe in PATH');
  } else if (m.clPath) {
    w(`  [~] msvc - optional: VS found (${m.vsRoot}), cl.exe not in PATH - run from a Developer PowerShell`);
    w('      (PATH alone is not enough: cl needs INCLUDE/LIB from vcvarsall - no auto-fix)');
  } else {
    w('  [~] msvc - optional: not found');
    w('    install: winget install Microsoft.VisualStudio.2022.BuildTools (+ C++ workload) (book 00.2.1)');
  }
}

function applyManifestAdditions(pkgPath: string, pkg: Record<string, unknown>, additions: ManifestAdditions): void {
  pkg.builds = { ...((pkg.builds as Record<string, unknown>) ?? {}), ...additions.builds };
  pkg.scripts = { ...((pkg.scripts as Record<string, string>) ?? {}), ...additions.scripts };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

function readManifest(): { parsed: Record<string, unknown> | null; parseError: string | null } {
  const pkgPath = resolve(process.cwd(), PACKAGE_FILE);
  if (!existsSync(pkgPath)) return { parsed: null, parseError: null };
  try {
    return { parsed: JSON.parse(readFileSync(pkgPath, 'utf8')), parseError: null };
  } catch (e) {
    return { parsed: null, parseError: (e as Error).message };
  }
}

export async function runDoctorCommand(args: string[], rootDir: string): Promise<void> {
  const projectOnly = hasFlag(args, '--project');
  const toolsOnly = hasFlag(args, '--tools');
  const fix = hasFlag(args, '--fix');
  const interactive = process.stdin.isTTY === true; // prompts land in the follow-up step
  let problems = 0;
  const w: Write = (s: string) => { process.stdout.write(s + '\n'); };

  w('tsclang doctor');
  w('');

  w(`Platform:  ${PLATFORM_NAMES[osPlatform()] ?? osPlatform()} ${arch()}`);
  const source = installSource();
  w(`Version:   ${localVersion(rootDir)} (${source === 'dev' ? 'dev install: npm link' : 'npm global'})`);
  w(`Update:    ${updateLine(rootDir, source)}`);
  w('');

  // --- Project ---
  // The manifest is read even when the Project section is skipped: the
  // Toolchains profile is derived from its builds.
  const manifest = readManifest();
  let pkg: Record<string, unknown> | null = null;
  if (!toolsOnly) {
    const pkgPath = resolve(process.cwd(), PACKAGE_FILE);
    if (!existsSync(pkgPath)) {
      w('Project: no tsc.package.json (not a project directory - run tsclang init to create one)');
    } else if (manifest.parseError || !manifest.parsed) {
      w('Project: tsc.package.json');
      w(`  ConfigError: tsc.package.json: invalid JSON: ${manifest.parseError}`);
      problems++;
    } else {
      pkg = manifest.parsed;
      const name = String(pkg.name ?? 'unknown');
      const type = String(pkg.type ?? 'unknown');
      w(`Project: tsc.package.json - ${name} (${type})`);
      const diagnostics = collectManifestDiagnostics(pkg);
      if (diagnostics.length) {
        for (const d of diagnostics) w(`  ${d}`);
        problems++;
      } else {
        w('  ok: manifest valid');
      }

      if (typeof pkg.main === 'string' && pkg.main) {
        if (existsSync(resolve(process.cwd(), pkg.main))) {
          w(`  ok: main file ${pkg.main} found`);
        } else {
          w(`  [!] main file not found: ${pkg.main}`);
          problems++;
        }
      }

      const additions = suggestManifestAdditions(pkg);
      if (additions && fix) {
        applyManifestAdditions(pkgPath, pkg, additions);
        const added = [
          Object.keys(additions.scripts).length ? `+scripts: ${Object.keys(additions.scripts).join(', ')}` : '',
          Object.keys(additions.builds).length ? `+builds: ${Object.keys(additions.builds).join(', ')}` : '',
        ].filter(Boolean).join('; ');
        w(`  fixed: tsc.package.json (${added})`);
      } else if (additions) {
        const missingScripts = Object.keys(additions.scripts);
        const missingBuilds = Object.keys(additions.builds);
        if (missingScripts.length) {
          w(`  [!] scripts missing: ${missingScripts.join(', ')} (preset ${type}/${additions.preset})`);
          problems++;
        }
        if (missingBuilds.length) {
          w(`  [!] builds missing: ${missingBuilds.join(', ')} (preset ${type}/${additions.preset})`);
          problems++;
        }
        if (interactive) {
          // prompts land in the follow-up step
        } else {
          w('    manual: add to tsc.package.json:');
          if (missingScripts.length) w(`      scripts: ${missingScripts.join(', ')}`);
          if (missingBuilds.length) w(`      builds: ${missingBuilds.join(', ')}`);
        }
      }
    }
    w('');
  }

  // --- Toolchains ---
  if (!projectOnly) {
    const profile: ToolProfile = manifest.parsed ? profileFromBuilds(manifest.parsed) : 'desktop';
    w(`Toolchains (${profile}):`);
    for (const tool of RECOMMENDED_TOOLS[profile]) {
      if (tool.platforms && !tool.platforms.includes(osPlatform())) continue;
      if (tool.name === 'msvc') { reportMsvc(w); continue; }

      const loc = findTool(tool.name);
      if (loc.inPath) {
        w(tool.required ? `  [ok] ${tool.name}` : `  [~] ${tool.name} - optional, found`);
      } else if (loc.foundAt) {
        w(`  ${tool.required ? '[!]' : '[~]'} ${tool.name} - installed at ${loc.foundAt}, not in PATH`);
        pathFixHint(w, loc.foundAt);
        if (tool.required) problems++;
      } else {
        w(`  ${tool.required ? '[x]' : '[~]'} ${tool.name} - ${tool.required ? 'not found' : 'optional, not found'}`);
        const install = osPlatform() === 'win32' ? tool.installWin : tool.installUnix;
        if (install) w(`    install: ${install} (book 00.2.1)`);
        if (tool.required) problems++;
      }
    }
    w('');
  }

  if (problems > 0) {
    w(`problems found: ${problems}`);
    process.exit(1);
  }
  w('no problems found');
  process.exit(0);
}
