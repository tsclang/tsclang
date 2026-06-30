#!/usr/bin/env node
// TSClang CLI entry point — slim dispatcher

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { hasFlag, hasFlagAny } from './cli/args.js';
import { getVersion, getHelpText, CMD_HELP } from './cli/help.js';
import { setColorEnabled } from '@tsclang/compiler';
import { startLsp } from './lsp/server.js';
import { runBuildCommand } from './cli/commands/build.js';
import { runExplainCommand } from './cli/commands/explain.js';
import { runValidateConfigCommand } from './cli/commands/config.js';
import { runInitCommand } from './cli/commands/init.js';
import { runEmitDtsCommand, runFormatCommand, runLintCommand } from './cli/commands/source.js';
import { runSearchCommand, runPublishCommand, runInstallCommand, runUpdateCommand } from './cli/commands/package.js';
import { runBuildCmakeCommand } from './cli/commands/build-cmake.js';
import { runRunCommand, runDebugCommand } from './cli/commands/run.js';
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
  process.exit(command ? 0 : 1);
}

if (CMD_HELP[command] && hasFlagAny(args, '--help', '-h')) {
  console.log(CMD_HELP[command]);
  process.exit(0);
}

switch (command) {
  case 'build':
    runBuildCommand(args, COMPILER_ROOT);
    break;
  case 'run':
    runRunCommand(args, COMPILER_ROOT);
    break;
  case 'debug':
    runDebugCommand(args, COMPILER_ROOT);
    break;
  case 'init':
    runInitCommand(args);
    break;
  case 'build-cmake':
    runBuildCmakeCommand(args);
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
    runTestCommand(args);
    break;
  default:
    console.error(`tsclang: unknown command '${command}'`);
    process.exit(1);
}
