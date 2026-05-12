# Try to emit wasm binary — emcc is not available, should get ConfigError
tsclang build wasm-src.tsc --emit wasm 2>&1 || true
