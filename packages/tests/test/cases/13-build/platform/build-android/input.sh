#!/bin/sh
# Android cross-compile contract (#283): the NDK clang driver must be invoked
# with the bionic target triple, PIE executable flags, -lm and -std=c11 — and
# never -lpthread (bionic keeps pthread in libc since API 24; the flag is a
# hard link error there). A PATH-pinned toolchain resolves WITHOUT --sysroot
# (the driver finds its own; an isolated bundle adds it — bundle e2e tier).
# ndk-clang is a shim that records argv and fakes the artifact, so the case is
# deterministic on every host. needs-unix: on win32 the runner re-executes the
# script inside WSL (a native spawn cannot exec script shims).

mkdir -p shims
printf '%s\n' '#!/bin/sh' \
  'printf "%s\n" "$@" > ndk-argv.txt' \
  'prev=' \
  'for a in "$@"; do' \
  '  [ "$prev" = "-o" ] && : > "$a"' \
  '  prev="$a"' \
  'done' > shims/ndk-clang
chmod +x shims/ndk-clang
PATH="$PWD/shims:$PATH"
export PATH

tsclang build --build android --out-dir out

test -f out/main && echo "binary-ok"
grep -qx -- '--target=aarch64-linux-android24' ndk-argv.txt && echo "target-ok"
grep -qx -- '-fPIE' ndk-argv.txt && grep -qx -- '-pie' ndk-argv.txt && echo "pie-ok"
grep -qx -- '-lm' ndk-argv.txt && echo "lm-ok"
grep -qx -- '-std=c11' ndk-argv.txt && echo "std-ok"
if grep -qx -- '-lpthread' ndk-argv.txt; then echo "unexpected -lpthread"; exit 1; fi
echo "no-pthread-ok"
