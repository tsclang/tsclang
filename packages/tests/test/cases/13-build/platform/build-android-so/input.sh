#!/bin/sh
# Android shared-library emit (#283): --emit so is the library rung of the
# binary target — the driver must get -shared -fPIC (NOT the PIE executable
# flags) and produce <stem>.so for wrapping into an .aar/.apk by Gradle.
# Same ndk-clang shim technique as the sibling build-android case.

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

tsclang build --build android-so --out-dir out

test -f out/main.so && echo "so-ok"
grep -qx -- '--target=aarch64-linux-android24' ndk-argv.txt && echo "target-ok"
grep -qx -- '-shared' ndk-argv.txt && grep -qx -- '-fPIC' ndk-argv.txt && echo "shared-ok"
grep -qx -- '-lm' ndk-argv.txt && echo "lm-ok"
if grep -qx -- '-pie' ndk-argv.txt || grep -qx -- '-fPIE' ndk-argv.txt; then
  echo "unexpected PIE flags for a shared lib"; exit 1
fi
echo "no-pie-ok"
