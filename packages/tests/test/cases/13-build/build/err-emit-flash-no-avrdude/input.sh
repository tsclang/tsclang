# Flash diagnostics without any AVR toolchain installed: avr-gcc and
# avr-objcopy are shims that just create the -o artifact, so the pipeline
# reaches the avrdude step and fails there — the config error and the manual
# install instruction are the assertion. needs-unix: on Windows the runner
# re-executes this script inside WSL, where process.platform is linux, so the
# instruction text (apt) is identical on every CI OS.
mkdir -p shims
printf '%s\n' '#!/bin/sh' 'out=""; prev=""' 'for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done' '[ -n "$out" ] && : > "$out"' 'exit 0' > shims/avr-gcc
printf '%s\n' '#!/bin/sh' 'last=""' 'for a in "$@"; do last="$a"; done' ': > "$last"' 'exit 0' > shims/avr-objcopy
chmod +x shims/avr-gcc shims/avr-objcopy
PATH="$PWD/shims:$PATH"
export PATH

tsclang build main.tsc --build avr --out-dir dist 2>&1
