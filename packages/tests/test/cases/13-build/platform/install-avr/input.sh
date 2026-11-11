# Reference platform @tsclang/avr (#276): install adds the hex build preset
# and the flash script; the profile declaration travels inside the archive.
# Runs everywhere — install itself needs no toolchain.
export TSC_REGISTRY=catalog.json
cat > tsc.package.json <<'MANIFEST'
{
  "name": "blink",
  "version": "0.0.1",
  "type": "package",
  "main": "main.tsc"
}
MANIFEST

tsclang platform install @tsclang/avr
grep -q '"avr"' tsc.package.json && echo "preset-added"
grep -q 'avr:flash' tsc.package.json && echo "script-added"
test -f tsc_packages/@tsclang/avr/index.d.tsc && echo "profile-extracted"
grep -q 'target: "avr"' tsc_packages/@tsclang/avr/index.d.tsc && echo "profile-avr-target"
