#!/bin/sh
# iOS cross-compile contract (#283): compilation goes through
# `xcrun --sdk iphoneos clang` with the arm64-apple-ios16.0 target, PIE and
# -std=c11 — and no -lm (on darwin libm is part of libSystem). There is no
# iOS bundle (the Apple SDK is not redistributable): the #282 gate is the
# explicit clang pin, xcrun itself rides PATH — that IS the platform's story.
# clang and xcrun are shims (argv record + faked artifact), so the case is
# deterministic on every host. needs-unix: on win32 the runner re-executes
# the script inside WSL (a native spawn cannot exec script shims).

mkdir -p shims
printf '%s\n' '#!/bin/sh' 'exit 0' > shims/clang
printf '%s\n' '#!/bin/sh' \
  'printf "%s\n" "$@" > xcrun-argv.txt' \
  'prev=' \
  'for a in "$@"; do' \
  '  [ "$prev" = "-o" ] && : > "$a"' \
  '  prev="$a"' \
  'done' > shims/xcrun
chmod +x shims/clang shims/xcrun
PATH="$PWD/shims:$PATH"
export PATH

tsclang build --build ios-device --out-dir out

test -f out/main && echo "binary-ok"
grep -qx -- '--sdk' xcrun-argv.txt && grep -qx -- 'iphoneos' xcrun-argv.txt && grep -qx -- 'clang' xcrun-argv.txt && echo "xcrun-ok"
grep -qx -- '-target=arm64-apple-ios16.0' xcrun-argv.txt && echo "target-ok"
grep -qx -- '-fPIE' xcrun-argv.txt && grep -qx -- '-pie' xcrun-argv.txt && echo "pie-ok"
grep -qx -- '-std=c11' xcrun-argv.txt && echo "std-ok"
if grep -qx -- '-lm' xcrun-argv.txt; then echo "unexpected -lm"; exit 1; fi
echo "no-lm-ok"
