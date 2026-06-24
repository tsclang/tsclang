import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MOCK_PKG_DEPS, resolveRange } from '../registry.js';
import { rangesCompatible } from '../../semver.js';
import { validateBuildKeys, validateStrictRules } from '../config-validator.js';

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

  const cfgErr = (msg: string): never => {
    process.stderr.write(`ConfigError: tsc.package.json: ${msg}\n`);
    process.exit(1);
  };

  if (!config.name) cfgErr(`missing required field 'name'`);
  if (!config.version) cfgErr(`missing required field 'version'`);

  if (!/^\d+\.\d+\.\d+/.test(String(config.version))) {
    cfgErr(`'version' must be a valid semver string, got '${config.version}'`);
  }

  const type = (config.type as string) || 'package';

  if (type === 'library' && config.main) {
    cfgErr(`library projects must not have a 'main' entry point`);
  }
  if (type === 'executable' && !config.main) {
    cfgErr(`executable project requires 'main' field`);
  }

  if (config.builds) {
    for (const [buildName, buildCfg] of Object.entries(config.builds as Record<string, Record<string, unknown>>)) {
      if (buildCfg && typeof buildCfg === 'object') {
        const err = validateBuildKeys(buildCfg, buildName);
        if (err) cfgErr(err);
      }
    }
  }

  if (config.strict) {
    const err = validateStrictRules(config.strict, 'tsc.package.json');
    if (err) cfgErr(err);
  }

  if (type === 'library') {
    process.stderr.write(`ConfigError: 'tsclang run' is not available for library projects\n`);
    process.exit(1);
  }

  if (type === 'package' && config.dependencies) {
    const deps = config.dependencies as Record<string, string>;
    const resolved: Record<string, string> = {};
    const requiredBy: Record<string, { range: string; pkg: string }> = {};

    for (const [pkg, range] of Object.entries(deps)) {
      const ver = resolveRange(pkg, range);
      if (!ver) cfgErr(`Cannot resolve '${pkg}@${range}': no matching version found`);
      resolved[pkg] = ver!;
      const transitiveDeps = MOCK_PKG_DEPS[`${pkg}@${ver}`] || {};
      for (const [dep, depRange] of Object.entries(transitiveDeps)) {
        if (requiredBy[dep]) {
          if (!rangesCompatible(requiredBy[dep].range, depRange)) {
            process.stderr.write(`ConfigError: Version conflict: '${dep}' required as '${requiredBy[dep].range}' by ${requiredBy[dep].pkg} and '${depRange}' by ${pkg}; incompatible (flat tree)\n`);
            process.exit(1);
          }
        } else {
          requiredBy[dep] = { range: depRange, pkg };
        }
      }
    }

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
