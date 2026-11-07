import { readFileSync } from 'fs';
import { join } from 'path';
import { format } from './helps/format.js';
import { help } from './helps/help.js';
import { build } from './helps/build.js';
import { run } from './helps/run.js';
import { init } from './helps/init.js';
import { lint } from './helps/lint.js';
import { explain } from './helps/explain.js';

export function getVersion(rootDir: string): string {
  return JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;
}

export function getHelpText(version: string): string {
  return help.replace('{version}', version);
}

export const CMD_HELP: Record<string, string> = {
  build,
  run,
  init,
  lint,
  format,
  explain,
};
