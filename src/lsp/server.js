// TSClang LSP server (Language Server Protocol over stdio)
// Handles: initialize, textDocument/didOpen, hover, completion, definition

function sendMsg(obj) {
  const json = JSON.stringify(obj);
  const len  = Buffer.byteLength(json, 'utf8');
  process.stdout.write(`Content-Length: ${len}\r\n\r\n${json}`);
}

function respond(id, result) { sendMsg({ jsonrpc: '2.0', id, result }); }

const docs = new Map(); // uri → { text, symbols }

// Scan text for symbols (name → {type, line, col, kind})
function buildSymbols(text) {
  const symbols = new Map();
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let m = line.match(/(?:const|let|var)\s+(\w+)\s*:\s*(\w+)/);
    if (m) {
      const col = line.indexOf(m[1], line.search(/(?:const|let|var)/));
      symbols.set(m[1], { type: m[2], line: li, col, kind: 'variable' });
    }
    m = line.match(/function\s+(\w+)\s*\(/);
    if (m) {
      const col = line.indexOf(m[1]);
      symbols.set(m[1], { type: 'function', line: li, col, kind: 'function' });
    }
  }
  return symbols;
}

function wordAt(text, line, character) {
  const lineStr = text.split('\n')[line] ?? '';
  let start = character;
  while (start > 0 && /\w/.test(lineStr[start - 1])) start--;
  let end = character;
  while (end < lineStr.length && /\w/.test(lineStr[end])) end++;
  return lineStr.slice(start, end);
}

function contextAt(text, line, character) {
  const lineStr = text.split('\n')[line] ?? '';
  const before  = lineStr.slice(0, character);
  const m = before.match(/Math\.(\w*)$/);
  if (m) return { kind: 'member', obj: 'Math', prefix: m[1] };
  return { kind: 'identifier' };
}

const MATH_MEMBERS = [
  { label: 'sqrt',  kind: 3, detail: '(x: f64): f64' },
  { label: 'abs',   kind: 3, detail: '(x: f64): f64' },
  { label: 'floor', kind: 3, detail: '(x: f64): f64' },
  { label: 'ceil',  kind: 3, detail: '(x: f64): f64' },
  { label: 'round', kind: 3, detail: '(x: f64): f64' },
  { label: 'pow',   kind: 3, detail: '(x: f64, y: f64): f64' },
  { label: 'max',   kind: 3, detail: '(a: f64, b: f64): f64' },
  { label: 'min',   kind: 3, detail: '(a: f64, b: f64): f64' },
  { label: 'PI',    kind: 6, detail: 'f64' },
  { label: 'E',     kind: 6, detail: 'f64' },
  { label: 'LN2',   kind: 6, detail: 'f64' },
  { label: 'LOG2E', kind: 6, detail: 'f64' },
];

const KEYWORD_COMPLETIONS = [
  'const', 'let', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'new', 'true', 'false', 'null', 'import', 'export',
].map(label => ({ label, kind: 14 }));

function handleMsg(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    respond(id, {
      capabilities: {
        textDocumentSync: 1,
        hoverProvider: true,
        completionProvider: { triggerCharacters: ['.'] },
        definitionProvider: true,
      },
      serverInfo: { name: 'tsclang-lsp', version: '1.0' },
    });
    return;
  }

  if (method === 'initialized' || method === '$/cancelRequest') return;

  if (method === 'textDocument/didOpen') {
    const { uri, text } = params.textDocument;
    docs.set(uri, { text, symbols: buildSymbols(text) });
    return;
  }

  if (method === 'textDocument/didChange') {
    const { uri } = params.textDocument;
    const text = params.contentChanges.at(-1).text;
    docs.set(uri, { text, symbols: buildSymbols(text) });
    return;
  }

  if (method === 'textDocument/hover') {
    const { uri } = params.textDocument;
    const { line, character } = params.position;
    const doc = docs.get(uri);
    if (!doc) { respond(id, null); return; }
    const word = wordAt(doc.text, line, character);
    const sym  = word ? doc.symbols.get(word) : null;
    if (!sym) { respond(id, null); return; }
    respond(id, { contents: { kind: 'markdown', value: `**${word}**: ${sym.type}` } });
    return;
  }

  if (method === 'textDocument/completion') {
    const { uri } = params.textDocument;
    const { line, character } = params.position;
    const doc = docs.get(uri);
    if (!doc) { respond(id, { items: KEYWORD_COMPLETIONS }); return; }
    const ctx = contextAt(doc.text, line, character);
    if (ctx.kind === 'member' && ctx.obj === 'Math') {
      respond(id, { items: MATH_MEMBERS });
      return;
    }
    const symItems = [...doc.symbols.entries()].map(([name, s]) => ({
      label: name, kind: s.kind === 'function' ? 3 : 6, detail: s.type,
    }));
    respond(id, { items: [...KEYWORD_COMPLETIONS, ...symItems] });
    return;
  }

  if (method === 'textDocument/definition') {
    const { uri } = params.textDocument;
    const { line, character } = params.position;
    const doc = docs.get(uri);
    if (!doc) { respond(id, null); return; }
    const word = wordAt(doc.text, line, character);
    const sym  = word ? doc.symbols.get(word) : null;
    if (!sym) { respond(id, null); return; }
    respond(id, [{
      uri,
      range: {
        start: { line: sym.line, character: sym.col },
        end:   { line: sym.line, character: sym.col + word.length },
      },
    }]);
    return;
  }

  if (method === 'shutdown') { process.exit(0); }
  if (method === 'exit')     { process.exit(0); }

  if (id !== undefined) {
    sendMsg({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}

export function startLsp() {
  let buf = Buffer.alloc(0);
  process.stdin.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const sep = buf.indexOf('\r\n\r\n');
      if (sep === -1) break;
      const hdr = buf.slice(0, sep).toString('utf8');
      const m   = hdr.match(/Content-Length:\s*(\d+)/i);
      if (!m) { buf = buf.slice(sep + 4); continue; }
      const len = parseInt(m[1], 10);
      if (buf.length < sep + 4 + len) break;
      const body = buf.slice(sep + 4, sep + 4 + len).toString('utf8');
      buf = buf.slice(sep + 4 + len);
      try { handleMsg(JSON.parse(body)); } catch {}
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
