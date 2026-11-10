// Interactive prompts for `tsclang doctor` — the only place the CLI ever asks
// the user a question. NOT readline: rl.question() drops lines that arrive
// with no question pending, so answers piped in one chunk (`printf 'y\na\n' |`)
// would be lost and the pending question would hang forever. Here the lines
// are buffered first and each question drains the queue; EOF resolves the
// waiter with '' so defaults apply instead of hanging.

let started = false;
const pending: string[] = [];
let stdinClosed = false;
let waiter: ((answer: string) => void) | null = null;

function start(): void {
  if (started) return;
  started = true;
  process.stdin.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) pending.push(trimmed);
    }
    flush();
  });
  process.stdin.on('close', () => {
    stdinClosed = true;
    flush();
  });
  process.stdin.on('end', () => {
    stdinClosed = true;
    flush();
  });
}

function flush(): void {
  while (waiter !== null && pending.length > 0) {
    const cb = waiter;
    waiter = null;
    cb(pending.shift()!);
  }
  if (waiter !== null && stdinClosed) {
    const cb = waiter;
    waiter = null;
    cb(''); // EOF → empty answer → the caller's default
  }
}

export function ask(question: string): Promise<string> {
  start();
  return new Promise((resolve) => {
    process.stdout.write(question);
    waiter = resolve;
    flush();
  });
}

export async function askYesNo(question: string, def = true): Promise<boolean> {
  const answer = await ask(`${question} [${def ? 'Y/n' : 'y/N'}]: `);
  if (!answer) return def;
  return answer.toLowerCase().startsWith('y');
}

export type FixAction = 'auto' | 'manual' | 'skip';

export async function askFixAction(question: string): Promise<FixAction> {
  const answer = (await ask(`${question} (a)uto / (m)anual / (s)kip: `)).toLowerCase();
  if (answer.startsWith('a')) return 'auto';
  if (answer.startsWith('s')) return 'skip';
  if (answer.startsWith('m')) return 'manual';
  return 'manual'; // unclear input → the safe path: instructions, no changes
}

export function closePrompt(): void {
  if (stdinClosed) return;
  process.stdin.destroy();
}
