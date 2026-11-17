// One-off helper: generate expected.c for test dirs given as args.
import { compileTsc } from '@tsclang/compiler';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const dir of process.argv.slice(2)) {
  const r = compileTsc(resolve(dir, 'input.tsc'), { target: 'desktop' });
  if (!r.c) { console.error('NO C for', dir, r.errors?.[0]?.message); continue; }
  writeFileSync(resolve(dir, 'expected.c'), r.c);
  console.log('wrote', dir);
}
