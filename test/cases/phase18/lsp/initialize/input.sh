# Send LSP initialize request and check response has capabilities
REQ='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":null,"capabilities":{}}}'
LEN=${#REQ}
RESP=$(printf "Content-Length: %d\r\n\r\n%s" "$LEN" "$REQ" | tsclang lsp 2>/dev/null | tr -d '\r' | grep '^{')
node -e "
const r = JSON.parse('$RESP');
if (r.id !== 1) process.exit(1);
if (!r.result?.capabilities) process.exit(1);
console.log('lsp-ok');
console.log('hover:', !!r.result.capabilities.hoverProvider);
console.log('completion:', !!r.result.capabilities.completionProvider);
"
