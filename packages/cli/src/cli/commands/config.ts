import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MOCK_PKG_DEPS, resolveRange, rangesCompatible, validatePlatformSection } from '@tsclang/pm';
import { PACKAGE_TYPE_VALUES } from '@tsclang/shared';
import { validateBuildKeys, validateStrictRules } from '../config-validator.js';

export interface DepsResolution {
  resolved: Record<string, string>;
  // Ready-to-print stderr lines, same format the command has always used
  diagnostics: string[];
}

// Dependency resolution for `type: package` manifests against the mock
// registry. Pure (no IO) — shared by validate-config output and doctor.
export function resolveDeps(config: Record<string, unknown>): DepsResolution {
  const diagnostics: string[] = [];
  const resolved: Record<string, string> = {};
  const requiredBy: Record<string, { range: string; pkg: string }> = {};

  for (const [pkg, range] of Object.entries(config.dependencies as Record<string, string>)) {
    const ver = resolveRange(pkg, range);
    if (!ver) {
      diagnostics.push(`ConfigError: Cannot resolve '${pkg}@${range}': no matching version found`);
      continue;
    }
    resolved[pkg] = ver;
    const transitiveDeps = MOCK_PKG_DEPS[`${pkg}@${ver}`] || {};
    for (const [dep, depRange] of Object.entries(transitiveDeps)) {
      if (requiredBy[dep]) {
        if (!rangesCompatible(requiredBy[dep].range, depRange)) {
          diagnostics.push(`ConfigError: Version conflict: '${dep}' required as '${requiredBy[dep].range}' by ${requiredBy[dep].pkg} and '${depRange}' by ${pkg}; incompatible (flat tree)`);
        }
      } else {
        requiredBy[dep] = { range: depRange, pkg };
      }
    }
  }

  return { resolved, diagnostics };
}

// All manifest validation errors as ready-to-print stderr lines. The command
// prints only the first one and exits — byte-identical to the old
// exit-on-first-error flow; doctor consumes the full list.
export function collectManifestDiagnostics(config: Record<string, unknown>): string[] {
  const diagnostics: string[] = [];
  const err = (msg: string): void => {
    diagnostics.push(`ConfigError: tsc.package.json: ${msg}`);
  };

  if (!config.name) err(`missing required field 'name'`);
  if (!config.version) err(`missing required field 'version'`);

  if (!/^\d+\.\d+\.\d+/.test(String(config.version))) {
    err(`'version' must be a valid semver string, got '${config.version}'`);
  }

  const type = config.type as string | undefined;

  if (!type) err(`missing required field 'type'`);
  if (!(PACKAGE_TYPE_VALUES as readonly string[]).includes(type!)) {
    err(`'type' must be one of: ${PACKAGE_TYPE_VALUES.join(', ')}; got '${type}'`);
  }

  if (type === 'library' && config.main) {
    err(`library projects must not have a 'main' entry point`);
  }
  if (type === 'executable' && !config.main) {
    err(`executable project requires 'main' field`);
  }

  // Platform section: `type: "platform"` and the section are inseparable.
  // For every other type the key is rejected — project toolchain pinning
  // lives in builds.<n>.toolchain (spec 13-build.md, "Pinned toolchain").
  const hasPlatformSection = config.platform !== undefined;
  if (type === 'platform' && !hasPlatformSection) {
    err(`platform package requires a 'platform' section (profile, toolchains, builds)`);
  }
  if (type !== 'platform' && hasPlatformSection) {
    err(`'platform' section is only allowed for type "platform"; toolchain pinning belongs in builds.<n>.toolchain`);
  }
  if (hasPlatformSection) {
    const platformErr = validatePlatformSection(config.platform);
    if (platformErr) err(platformErr);
  }

  if (config.builds) {
    for (const [buildName, buildCfg] of Object.entries(config.builds as Record<string, Record<string, unknown>>)) {
      if (buildCfg && typeof buildCfg === 'object') {
        const err2 = validateBuildKeys(buildCfg, buildName);
        if (err2) err(err2);
      }
    }
  }

  if (config.strict) {
    const err2 = validateStrictRules(config.strict, 'tsc.package.json');
    if (err2) err(err2);
  }

  // scripts: named tasks for `tsclang run` — an object of non-empty strings
  if (config.scripts !== undefined) {
    if (!config.scripts || typeof config.scripts !== 'object' || Array.isArray(config.scripts)) {
      err(`'scripts' must be an object of named shell commands, got ${JSON.stringify(config.scripts)}`);
    }
    for (const [scriptName, scriptCmd] of Object.entries(config.scripts as Record<string, unknown>)) {
      if (typeof scriptCmd !== 'string' || !scriptCmd.trim()) {
        err(`scripts.${scriptName} must be a non-empty string, got ${JSON.stringify(scriptCmd)}`);
      }
    }
  }

  if (type === 'package' && config.dependencies) {
    diagnostics.push(...resolveDeps(config).diagnostics);
  }

  return diagnostics;
}

export function runValidateConfigCommand(args: string[]): void {
  const jsonFile = args[1];
  if (!jsonFile) {
    console.error('tsclang validate-config: missing config file');
    process.exit(1);
  }

  let raw: string;
  try {
    raw = readFileSync(resolve(jsonFile), 'utf8');
  } catch (e) {
    process.stderr.write(`tsclang: cannot read '${jsonFile}': ${(e as Error).message}\n`);
    process.exit(1);
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`ConfigError: tsc.package.json: invalid JSON: ${(e as Error).message}\n`);
    process.exit(1);
  }

  const diagnostics = collectManifestDiagnostics(config);
  if (diagnostics.length) {
    process.stderr.write(diagnostics[0] + '\n');
    process.exit(1);
  }

  const type = config.type as string;

  if (type === 'package' && config.dependencies) {
    const { resolved } = resolveDeps(config);
    for (const [pkg, ver] of Object.entries(resolved)) {
      process.stdout.write(`resolved: ${pkg}@${ver}\n`);
    }
    process.exit(0);
  }

  if (config.builds) {
    const buildEntries = Object.entries(config.builds as Record<string, Record<string, unknown>>);
    const embeddedBuilds = buildEntries.filter(([, b]) => b?.target && !['desktop', 'x86_64-linux', 'x86_64-windows'].includes(b.target as string));
    if (embeddedBuilds.length === 1 && buildEntries.length === 1) {
      const [, b] = embeddedBuilds[0];
      let line = `target: ${b.target}`;
      if (b.mcu) line += ` mcu=${b.mcu}`;
      if (b.freq != null) line += ` freq=${b.freq}`;
      if (b.frequency != null) line += ` freq=${b.frequency}`;
      process.stdout.write(line + '\n');
    } else {
      process.stdout.write(`builds: ${Object.keys(config.builds as Record<string, unknown>).join(', ')}\n`);
    }
  }
  if (config.dependencies) {
    const deps = Object.entries(config.dependencies as Record<string, string>).map(([n, v]) => `${n}@${v}`);
    process.stdout.write(`dependencies: ${deps.join(', ')}\n`);
  }
  if (config.targets) {
    process.stdout.write(`targets: ${(config.targets as string[]).join(', ')}\n`);
  }
  process.exit(0);
}
