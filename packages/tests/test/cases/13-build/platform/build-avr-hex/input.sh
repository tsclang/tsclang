# Reference platform @tsclang/avr (#276): real build through the installed
# preset — avr-gcc + avr-objcopy produce the .hex. Gated by needs-tools: the
# case skips on machines without the AVR toolchain (skip policy of the corpus).
export TSC_REGISTRY=catalog.json
cat > tsc.package.json <<'MANIFEST'
{
  "name": "blink",
  "version": "0.0.1",
  "type": "package",
  "main": "main.tsc"
}
MANIFEST

tsclang platform install @tsclang/avr >/dev/null
tsclang build --build avr
test -f build/avr/main.hex && echo "hex-built"
