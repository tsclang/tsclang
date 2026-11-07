#!/bin/sh
# Flash pipeline e2e without hardware: real avr-gcc and avr-objcopy compile the
# generated C into a real .hex; avrdude is a shim that records its argv — the
# exact delivery command is the assertion. needs-unix: on Windows the runner
# re-executes this script inside WSL (a native win32 spawn cannot exec script
# shims, so the mock only resolves in a real unix environment).

mkdir -p shims
printf '%s\n' '#!/bin/sh' 'echo "avrdude $@" > avrdude-args.txt' > shims/avrdude
chmod +x shims/avrdude
PATH="$PWD/shims:$PATH"
export PATH

tsclang build --build uno --out-dir out

test -f out/main.hex && echo "hex-ok"
cat avrdude-args.txt
