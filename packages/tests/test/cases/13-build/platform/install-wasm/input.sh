# Reference platform @tsclang/wasm (#276): install adds the wasm build preset
# (emcc flow); the wasm profile declaration travels inside the archive.
# Runs everywhere — install itself needs no toolchain.
export TSC_REGISTRY=catalog.json
cat > tsc.package.json <<'MANIFEST'
{
  "name": "wasmapp",
  "version": "0.0.1",
  "type": "package",
  "main": "main.tsc"
}
MANIFEST

tsclang platform install @tsclang/wasm
grep -q '"wasm"' tsc.package.json && echo "preset-added"
test -f tsc_packages/@tsclang/wasm/index.d.tsc && echo "profile-extracted"
grep -q 'target: "wasm"' tsc_packages/@tsclang/wasm/index.d.tsc && echo "profile-wasm-target"
grep -q 'toolchain: "emcc"' tsc_packages/@tsclang/wasm/index.d.tsc && echo "profile-emcc-toolchain"
