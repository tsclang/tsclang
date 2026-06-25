# Request go-to-definition for a function call
SRC='function greet(): void {}\ngreet();'
OPEN_REQ='{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///test.tsc","languageId":"tsc","version":1,"text":"function greet(): void {}\ngreet();"}}}'
DEF_REQ='{"jsonrpc":"2.0","id":2,"method":"textDocument/definition","params":{"textDocument":{"uri":"file:///test.tsc"},"position":{"line":1,"character":1}}}'
SHUTDOWN='{"jsonrpc":"2.0","id":3,"method":"shutdown","params":{}}'

send_lsp() { printf "Content-Length: %d\r\n\r\n%s" "${#1}" "$1"; }

RESP=$( (send_lsp "$OPEN_REQ"; send_lsp "$DEF_REQ"; send_lsp "$SHUTDOWN") | tsclang lsp 2>/dev/null | tr -d '\r' | grep '^{' | head -2 | tail -1 )
node -e "
const r = JSON.parse('$RESP');
const loc = Array.isArray(r.result) ? r.result[0] : r.result;
const line = loc?.range?.start?.line ?? -1;
if (line !== 0) { console.error('expected line 0, got:', line); process.exit(1); }
console.log('definition-ok');
console.log('line:', line);
"
