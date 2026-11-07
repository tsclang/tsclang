#!/usr/bin/env node
// TSClang CLI entry point — slim dispatcher

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { hasFlag, hasFlagAny, isKnownCommand, checkUnknownFlags } from './cli/args.js';
import { getVersion, getHelpText, CMD_HELP } from './cli/help.js';
import { setColorEnabled } from '@tsclang/compiler';
import { startLsp } from './lsp/server.js';
import { runBuildCommand } from './cli/commands/build.js';
import { runRunCommand } from './cli/commands/run.js';
import { runExplainCommand } from './cli/commands/explain.js';
import { runValidateConfigCommand } from './cli/commands/config.js';
import { runInitCommand } from './cli/commands/init.js';
import { runEmitDtsCommand, runFormatCommand, runLintCommand } from './cli/commands/source.js';
import { runSearchCommand, runPublishCommand, runInstallCommand, runUpdateCommand } from './cli/commands/package.js';
import { runDebugCommand } from './cli/commands/debug.js';
import { runTestCommand } from './cli/commands/test.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const CLI_ROOT = resolve(__dirname, '..');
const COMPILER_ROOT = resolve(dirname(_require.resolve('@tsclang/compiler')), '..');

const args = process.argv.slice(2);

if (hasFlag(args, '--no-color')) setColorEnabled(false);

const VERSION = getVersion(CLI_ROOT);

if (hasFlagAny(args, '--version', '-v')) {
  console.log(`tsclang ${VERSION}`);
  process.exit(0);
}

const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(getHelpText(VERSION));
  process.exit(0);
}

// `<cmd> --help` prints the per-command help where defined, main help otherwise (#243)
if (isKnownCommand(command) && hasFlagAny(args, '--help', '-h')) {
  console.log(CMD_HELP[command] ?? getHelpText(VERSION));
  process.exit(0);
}

// Typos and unknown options must fail loudly instead of being dropped (#244)
const flagError = checkUnknownFlags(args, command);
if (flagError) {
  console.error(`tsclang: ${flagError}`);
  console.error("Run 'tsclang --help' for usage.");
  process.exit(1);
}

switch (command) {
  case 'build':
    runBuildCommand(args, COMPILER_ROOT);
    break;
  case 'run':
    runRunCommand(args);
    break;
  case 'debug':
    runDebugCommand(args, COMPILER_ROOT);
    break;
  case 'init':
    runInitCommand(args);
    break;
  case 'lint':
    runLintCommand(args);
    break;
  case 'format':
    runFormatCommand(args);
    break;
  case 'emit-dts':
    runEmitDtsCommand(args);
    break;
  case 'explain':
    runExplainCommand(args);
    break;
  case 'validate-config':
    runValidateConfigCommand(args);
    break;
  case 'install':
    runInstallCommand(args);
    break;
  case 'update':
    runUpdateCommand(args);
    break;
  case 'search':
    runSearchCommand(args);
    break;
  case 'publish':
    runPublishCommand();
    break;
  case 'lsp':
    startLsp();
    break;
  case 'test':
    runTestCommand(args, COMPILER_ROOT);
    break;
  default:
    console.error(`tsclang: unknown command '${command}'`);
    process.exit(1);
}
