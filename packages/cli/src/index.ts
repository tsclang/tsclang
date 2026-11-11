#!/usr/bin/env node
// TSClang CLI entry point — slim dispatcher

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { hasFlag, hasFlagAny, isKnownCommand, checkUnknownFlags, COMMAND_ALIASES } from './cli/args.js';
import { getVersion, getHelpText, CMD_HELP } from './cli/help.js';
import { setColorEnabled } from '@tsclang/compiler';
import { startLsp } from './lsp/server.js';
import { runBuildCommand } from './cli/commands/build.js';
import { runRunCommand } from './cli/commands/run.js';
import { runExplainCommand } from './cli/commands/explain.js';
import { runValidateConfigCommand } from './cli/commands/config.js';
import { runInitCommand } from './cli/commands/init.js';
import { runEmitDtsCommand, runLintCommand } from './cli/commands/source.js';
import { runSearchCommand, runPublishCommand, runInstallCommand, runUpdateCommand, runRemoveCommand } from './cli/commands/package.js';
import { runDebugCommand } from './cli/commands/debug.js';
import { runTestCommand } from './cli/commands/test.js';
import { runDoctorCommand } from './cli/commands/doctor.js';
import { runPlatformCommand, PLATFORM_SUBCOMMANDS } from './cli/commands/platform.js';

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

let command = args[0];
// Canonicalize single-letter aliases (i/u/r) in place BEFORE every check:
// --help dispatch, unknown-flag validation and the switch below all see the
// canonical name, and args[0] is rewritten so command parsers' getPositional
// (which skips the token equal to the command name) works for aliases too.
if (COMMAND_ALIASES[command]) {
  command = COMMAND_ALIASES[command];
  args[0] = command;
}

if (!command || command === '--help' || command === '-h') {
  console.log(getHelpText(VERSION));
  process.exit(0);
}

// `platform` — first nested command group (#265). Handled BEFORE the flat
// --help/flag machinery: the group has its own subcommand routing, per-
// subcommand help and per-subcommand flag validation ('platform <sub>' keys
// in COMMAND_FLAGS), so the generic paths above must not intercept it.
if (command === 'platform') {
  const sub = args[1] !== undefined && !args[1].startsWith('-') ? args[1] : undefined;
  if (args.length === 1 || hasFlagAny(args, '--help', '-h')) {
    // Bare group / --help: group help, or the subcommand's help when given
    // (`platform install --help`).
    console.log(CMD_HELP[sub ? `platform ${sub}` : 'platform'] ?? CMD_HELP['platform']);
    process.exit(0);
  }
  if (!PLATFORM_SUBCOMMANDS.includes(sub as (typeof PLATFORM_SUBCOMMANDS)[number])) {
    if (sub === undefined) {
      // first token after `platform` is a flag the group does not accept
      console.error(`tsclang: unknown option '${args[1]}' for 'platform'`);
    } else {
      console.error(`tsclang: unknown platform command '${sub}'`);
    }
    console.error("Run 'tsclang platform --help' for usage.");
    process.exit(1);
  }
  const platformFlagError = checkUnknownFlags(args.slice(1), `platform ${sub}`);
  if (platformFlagError) {
    console.error(`tsclang: ${platformFlagError}`);
    console.error(`Run 'tsclang platform ${sub} --help' for usage.`);
    process.exit(1);
  }
  runPlatformCommand(sub!);
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
  case 'remove':
    runRemoveCommand(args);
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
  case 'doctor':
    // first async command (npm update check); owns its exit codes
    void runDoctorCommand(args, CLI_ROOT);
    break;
  default:
    console.error(`tsclang: unknown command '${command}'`);
    process.exit(1);
}
