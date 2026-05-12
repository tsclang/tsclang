# Open a document and hover over a variable to get its type
SRC='const x: i32 = 42; console.log(x);'
OPEN_REQ='{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///test.tsc","languageId":"tsc","version":1,"text":"'"$SRC"'"}}}'
HOVER_REQ='{"jsonrpc":"2.0","id":2,"method":"textDocument/hover","params":{"textDocument":{"uri":"file:///test.tsc"},"position":{"line":0,"character":6}}}'
SHUTDOWN='{"jsonrpc":"2.0","id":3,"method":"shutdown","params":{}}'

send_lsp() {
  local msg="$1"
  printf "Content-Length: %d\r\n\r\n%s" "${#msg}" "$msg"
}

RESP=$( (send_lsp "$OPEN_REQ"; send_lsp "$HOVER_REQ"; send_lsp "$SHUTDOWN") | tsclang lsp 2>/dev/null | tr -d '\r' | grep '^{' | head -2 | tail -1 )
node -e "
const r = JSON.parse('$RESP');
const val = r.result?.contents?.value ?? '';
if (!val.includes('i32')) { console.error('expected i32 in hover, got:', val); process.exit(1); }
console.log('hover-ok');
"
