import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { parsePlatformDecl } from '../compiler/profile.js';

export interface Capabilities {
  target?: string;
  allocator?: string;
  async?: string;
  fpu?: boolean;
  bits?: number;
  usize?: string;
  defaultNumber?: string;
  unaligned_access?: boolean;
  os?: boolean;
  posix?: boolean;
  strtoll?: boolean;
  console_uart?: boolean;
  console_baud?: number;
  toolchain?: string;
  toolchainFile?: string;
  include?: string;
  heap_size?: number;
  stack_size?: number;
  ram_size?: number;
  flash_size?: number;
}

export const DESKTOP_CAPABILITIES: Capabilities = {
  allocator: 'heap',
  async: 'libuv',
  fpu: true,
  bits: 64,
  usize: 'u64',
  unaligned_access: true,
  os: true,
};

export function loadProfile(name: string, profilesDir: string, inputFile?: string): Capabilities | null {
  const dtsPath = join(profilesDir, name + '.d.tsc');
  const jsonPath = join(profilesDir, name + '.json');
  if (existsSync(dtsPath)) {
    try { return parsePlatformDecl(readFileSync(dtsPath, 'utf8'), dtsPath); } catch { return null; }
  }
  if (existsSync(jsonPath)) {
    try { return JSON.parse(readFileSync(jsonPath, 'utf8')); } catch { return null; }
  }

  const pkgDir = name.startsWith('@') ? name : null;
  if (pkgDir) {
    const pkgDts = join(inputFile ? dirname(resolve(inputFile)) : process.cwd(), 'tsc_packages', pkgDir, 'index.d.tsc');
    if (existsSync(pkgDts)) {
      try { return parsePlatformDecl(readFileSync(pkgDts, 'utf8'), pkgDts); } catch { return null; }
    }
  }

  if (name.endsWith('.d.tsc') || name.endsWith('.json')) {
    const localPath = resolve(name);
    if (existsSync(localPath)) {
      try {
        if (name.endsWith('.d.tsc')) return parsePlatformDecl(readFileSync(localPath, 'utf8'), localPath);
        return JSON.parse(readFileSync(localPath, 'utf8'));
      } catch { return null; }
    }
  }

  return null;
}

export function listAvailableProfiles(profilesDir: string): string[] {
  return readdirSync(profilesDir)
    .filter((f: string) => f.endsWith('.d.tsc') || f.endsWith('.json'))
    .map((f: string) => f.replace(/\.(d\.tsc|json)$/, ''))
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
}

export function capabilityDefines(caps: Capabilities | null | undefined): string[] {
  if (!caps) return [];
  const defs: string[] = [];
  if (caps.posix === false) defs.push('-DTSC_NO_POSIX');
  if (caps.strtoll === false) defs.push('-DTSC_NO_STRTOLL');
  if (caps.console_uart) {
    defs.push('-DTSC_CONSOLE_UART');
    if (caps.console_baud) defs.push(`-DTSC_CONSOLE_BAUD=${caps.console_baud}`);
  }
  return defs;
}
