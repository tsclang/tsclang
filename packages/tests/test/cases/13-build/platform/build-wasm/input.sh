# Reference platform @tsclang/wasm (#276): real build through the installed
# preset — emcc produces the standalone .wasm. Gated by needs-tools: the case
# skips on machines without emscripten (skip policy of the corpus).
export TSC_REGISTRY=catalog.json
cat > tsc.package.json <<'MANIFEST'
{
  "name": "wasmapp",
  "version": "0.0.1",
  "type": "package",
  "main": "main.tsc"
}
MANIFEST

tsclang platform install @tsclang/wasm >/dev/null
tsclang build --build wasm
test -f build/wasm/main.wasm && echo "wasm-built"
