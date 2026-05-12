# Request completions at position after "Math."
SRC='const pi = Math.'
OPEN_REQ='{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///test.tsc","languageId":"tsc","version":1,"text":"'"$SRC"'"}}}'
COMP_REQ='{"jsonrpc":"2.0","id":2,"method":"textDocument/completion","params":{"textDocument":{"uri":"file:///test.tsc"},"position":{"line":0,"character":17}}}'
SHUTDOWN='{"jsonrpc":"2.0","id":3,"method":"shutdown","params":{}}'

send_lsp() { printf "Content-Length: %d\r\n\r\n%s" "${#1}" "$1"; }

RESP=$( (send_lsp "$OPEN_REQ"; send_lsp "$COMP_REQ"; send_lsp "$SHUTDOWN") | tsclang lsp 2>/dev/null | tr -d '\r' | grep '^{' | head -2 | tail -1 )
node -e "
const r = JSON.parse('$RESP');
const items = r.result?.items ?? r.result ?? [];
const labels = items.map(i => i.label);
if (!labels.includes('sqrt')) { console.error('expected sqrt, got:', labels.slice(0,5)); process.exit(1); }
if (!labels.includes('PI')) { console.error('expected PI, got:', labels.slice(0,5)); process.exit(1); }
console.log('completion-ok');
"
