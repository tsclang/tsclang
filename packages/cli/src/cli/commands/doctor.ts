// tsclang doctor — environment & project wizard (#259).
// Non-interactive (no TTY): full report, manual instructions instead of
// questions. Interactive: asks before each check ("Проверим ваш проект?") and
// offers every fix as (a)uto / (m)anual / (s)kip — an auto-fix that fails
// falls back to the printed manual instructions. PATH auto-fix is Windows
// only (unix shells each own their rc file).

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
import { askFixAction, askYesNo, closePrompt } from '../doctor/prompt.js';
import { applyUserPathWin } from '../doctor/pathfix.js';

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

// The snippet shown as a preview before asking and as the manual instructions
// after choosing (m)anual — the exact JSON that auto would merge in.
function printManifestAdditions(w: Write, additions: ManifestAdditions): void {
  w('    merge into tsc.package.json:');
  if (Object.keys(additions.scripts).length) {
    w(`      "scripts": ${JSON.stringify(additions.scripts, null, 2).replace(/\n/g, '\n      ')}`);
  }
  if (Object.keys(additions.builds).length) {
    w(`      "builds": ${JSON.stringify(additions.builds, null, 2).replace(/\n/g, '\n      ')}`);
  }
}

function fixedSummary(additions: ManifestAdditions): string {
  return [
    Object.keys(additions.scripts).length ? `+scripts: ${Object.keys(additions.scripts).join(', ')}` : '',
    Object.keys(additions.builds).length ? `+builds: ${Object.keys(additions.builds).join(', ')}` : '',
  ].filter(Boolean).join('; ');
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
  // TSC_DOCTOR_INTERACTIVE forces the prompt flow under a piped stdin (tests/CI);
  // without a TTY the command falls back to a plain report with manual hints.
  const interactive = process.env.TSC_DOCTOR_INTERACTIVE === '1' || process.stdin.isTTY === true;
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
  let wantProject = !toolsOnly;
  if (wantProject && interactive && !projectOnly && manifest.parsed) {
    wantProject = await askYesNo('Проверим ваш проект?');
  }
  if (wantProject && !toolsOnly) {
    const pkgPath = resolve(process.cwd(), PACKAGE_FILE);
    if (!existsSync(pkgPath)) {
      w('Project: no tsc.package.json (not a project directory - run tsclang init to create one)');
    } else if (manifest.parseError || !manifest.parsed) {
      w('Project: tsc.package.json');
      w(`  ConfigError: tsc.package.json: invalid JSON: ${manifest.parseError}`);
      problems++;
    } else {
      const pkg = manifest.parsed;
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
        w(`  fixed: tsc.package.json (${fixedSummary(additions)})`);
      } else if (additions) {
        const missingScripts = Object.keys(additions.scripts);
        const missingBuilds = Object.keys(additions.builds);
        let warnings = 0;
        if (missingScripts.length) {
          w(`  [!] scripts missing: ${missingScripts.join(', ')} (preset ${type}/${additions.preset})`);
          warnings++;
        }
        if (missingBuilds.length) {
          w(`  [!] builds missing: ${missingBuilds.join(', ')} (preset ${type}/${additions.preset})`);
          warnings++;
        }
        let resolved = false;
        if (interactive) {
          printManifestAdditions(w, additions);
          const action = await askFixAction('Добавить?');
          if (action === 'auto') {
            try {
              applyManifestAdditions(pkgPath, pkg, additions);
              w(`  fixed: tsc.package.json (${fixedSummary(additions)})`);
              resolved = true;
            } catch (e) {
              // auto failed for any reason (permissions, locked file) — the
              // manual instructions are printed so the fix is never lost
              w(`  auto-fix failed: ${(e as Error).message}`);
              printManifestAdditions(w, additions);
            }
          } else if (action === 'manual') {
            printManifestAdditions(w, additions);
          }
        } else {
          w('    manual: add to tsc.package.json:');
          if (missingScripts.length) w(`      scripts: ${missingScripts.join(', ')}`);
          if (missingBuilds.length) w(`      builds: ${missingBuilds.join(', ')}`);
        }
        if (!resolved) problems += warnings;
      }
    }
    w('');
  } else if (interactive && !toolsOnly) {
    w('');
  }

  // --- Toolchains ---
  if (!projectOnly) {
    const profile: ToolProfile = manifest.parsed ? profileFromBuilds(manifest.parsed) : 'desktop';
    let wantTools = true;
    if (interactive && !toolsOnly) {
      wantTools = await askYesNo(`Проверим рекомендуемые тулчейны? (профиль: ${profile})`);
    }
    if (wantTools) {
      w(`Toolchains (${profile}):`);
      for (const tool of RECOMMENDED_TOOLS[profile]) {
        if (tool.platforms && !tool.platforms.includes(osPlatform())) continue;
        if (tool.name === 'msvc') { reportMsvc(w); continue; }

        const loc = findTool(tool.name);
        if (loc.inPath) {
          w(tool.required ? `  [ok] ${tool.name}` : `  [~] ${tool.name} - optional, found`);
        } else if (loc.foundAt) {
          w(`  ${tool.required ? '[!]' : '[~]'} ${tool.name} - installed at ${loc.foundAt}, not in PATH`);
          let resolved = false;
          if (tool.required && interactive) {
            const action = await askFixAction('Добавить в PATH?');
            if (action === 'auto') {
              if (osPlatform() === 'win32') {
                const res = applyUserPathWin(dirname(loc.foundAt));
                if (res.ok) {
                  w('    fixed: user PATH (restart the terminal to apply)');
                  resolved = true;
                } else {
                  w(`    auto-fix failed: ${res.error}`);
                  pathFixHint(w, loc.foundAt);
                }
              } else {
                // auto is Windows-only: each unix shell owns its rc file
                w('    auto PATH fix is Windows-only (unix shells own their rc files)');
                pathFixHint(w, loc.foundAt);
              }
            } else if (action === 'manual') {
              pathFixHint(w, loc.foundAt);
            }
          } else {
            pathFixHint(w, loc.foundAt);
          }
          if (tool.required && !resolved) problems++;
        } else {
          w(`  ${tool.required ? '[x]' : '[~]'} ${tool.name} - ${tool.required ? 'not found' : 'optional, not found'}`);
          const install = osPlatform() === 'win32' ? tool.installWin : tool.installUnix;
          if (install) w(`    install: ${install} (book 00.2.1)`);
          if (tool.required) problems++;
        }
      }
      w('');
    }
  }

  closePrompt();
  if (problems > 0) {
    w(`problems found: ${problems}`);
    process.exit(1);
  }
  w('no problems found');
  process.exit(0);
}
