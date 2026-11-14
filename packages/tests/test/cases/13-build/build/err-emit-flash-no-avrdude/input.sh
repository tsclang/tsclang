# Flash diagnostics with avrdude genuinely absent: avr-gcc and avr-objcopy
# are shims that just create the -o artifact, so the pipeline reaches the
# avrdude step. PATH is then scrubbed to shims + a node symlink ONLY — CI
# images ship a real avrdude in /usr/bin, and node's own directory could sit
# next to it, so a plain "hide /usr/bin" is not deterministic. The config
# error and the manual install instruction are the assertion.
# needs-unix: on Windows the runner re-executes this script inside WSL, where
# process.platform is linux, so the instruction text (apt) is identical on
# every CI OS.
mkdir -p shims
printf '%s\n' '#!/bin/sh' 'out=""; prev=""' 'for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done' '[ -n "$out" ] && : > "$out"' 'exit 0' > shims/avr-gcc
printf '%s\n' '#!/bin/sh' 'last=""' 'for a in "$@"; do last="$a"; done' ': > "$last"' 'exit 0' > shims/avr-objcopy
chmod +x shims/avr-gcc shims/avr-objcopy
NODE_BIN="$(command -v node)"
ln -sf "$NODE_BIN" shims/node
PATH="$PWD/shims"
export PATH

tsclang build main.tsc --build avr --out-dir dist 2>&1
