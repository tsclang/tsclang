// First-run onboarding wizard (#274). Fires once per machine: stdin is a TTY
// (or TSC_WIZARD_INTERACTIVE=1), ~/.tsclang does not exist yet and TSC_WIZARD
// is not off/0. The wizard installs MACHINE-LEVEL pieces only — isolated
// toolchains through the same install mechanics as `platform install` — and
// never writes to the project manifest: onboarding must be safe in any
// directory, including one the user just cloned.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { userHome } from '@tsclang/pm';
import { ask } from './doctor/prompt.js';
import { fetchPlatformArchive, installToolchains } from './commands/platform.js';

export interface WizardChoice {
  label: string;
  name: string;
  tools: string;
  preselected?: boolean;
}

export const WIZARD_CHOICES: WizardChoice[] = [
  { label: 'desktop', name: '@tsclang/desktop', tools: 'gcc + make + cmake', preselected: true },
  { label: 'avr', name: '@tsclang/avr', tools: 'avr-gcc + avrdude' },
  { label: 'wasm', name: '@tsclang/wasm', tools: 'emscripten' },
];

/** Is the wizard due on this machine? Gates, in order: TSC_WIZARD=off/0 →
 * never; TTY (explicit, or TSC_WIZARD_INTERACTIVE=1, or a real stdin TTY);
 * ~/.tsclang must not exist yet (any wizard outcome writes a marker there). */
export function wizardDue(opts: { tty?: boolean; home?: string } = {}): boolean {
  const disable = process.env.TSC_WIZARD;
  if (disable === 'off' || disable === '0') return false;
  const tty = opts.tty ?? (process.env.TSC_WIZARD_INTERACTIVE === '1' || process.stdin.isTTY === true);
  if (!tty) return false;
  const home = opts.home ?? userHome();
  return !existsSync(join(home, '.tsclang'));
}

/** Entry point for the dispatcher: run the wizard when due, never throw —
 * onboarding problems must not break the command the user actually typed. */
export async function maybeRunWizard(): Promise<void> {
  if (!wizardDue()) return;
  try {
    await runWizard(userHome());
  } catch (e) {
    process.stderr.write(`tsclang: wizard failed: ${(e as Error)?.message ?? e}\n`);
  }
}

async function runWizard(home: string): Promise<void> {
  process.stdout.write('Welcome to tsclang! Set up platforms:\n');
  for (const c of WIZARD_CHOICES) {
    process.stdout.write(`  ${c.preselected ? '[x]' : '[ ]'} ${c.label.padEnd(8)} ${c.tools}\n`);
  }
  const answer = (await ask('Select platforms (e.g. "1 3"; Enter = preselected; s = skip forever): ')).toLowerCase();
  mkdirSync(join(home, '.tsclang'), { recursive: true });

  if (answer === 's' || answer === 'skip') {
    writeMarker(home, { skip: 'all' });
    process.stdout.write('Skipped — run `tsclang platform install <name>` any time.\n');
    return;
  }

  // '' → the preselected set; otherwise space-separated tokens: choice numbers
  // ('1'..'3'), labels ('desktop') or package names. Invalid tokens drop.
  let selected = WIZARD_CHOICES.filter((c) => c.preselected);
  if (answer) {
    selected = [];
    for (const token of answer.split(/\s+/).filter(Boolean)) {
      const byIndex = /^[1-9][0-9]*$/.test(token) ? WIZARD_CHOICES[Number(token) - 1] : undefined;
      const choice = byIndex ?? WIZARD_CHOICES.find((c) => c.label === token || c.name === token);
      if (choice && !selected.includes(choice)) selected.push(choice);
    }
  }
  // The machine marker is written BEFORE any install attempt: a broken
  // registry must not resurrect the wizard on every run.
  writeMarker(home, { installed: selected.map((c) => c.name) });

  const offline = !!process.env.TSC_NO_NETWORK;
  for (const c of selected) {
    process.stdout.write(`platform ${c.label}:\n`);
    try {
      const archive = await fetchPlatformArchive(c.name, { offline });
      await installToolchains(archive.name, archive.version, archive.platform, offline);
    } catch (e) {
      process.stdout.write(`  not available: ${(e as Error)?.message ?? e}\n`);
      process.stdout.write(`  install later: tsclang platform install ${c.name}\n`);
    }
  }
  process.stdout.write('Done — see `tsclang doctor` for the environment report.\n');
}

function writeMarker(home: string, data: Record<string, unknown>): void {
  writeFileSync(join(home, '.tsclang', 'wizard.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
