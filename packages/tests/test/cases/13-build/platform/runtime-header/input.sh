# runtimeHeader profile option (#277): a platform package points codegen at
# its own C-runtime header — the generated main.c includes runtime_spectrum.h
# instead of the desktop runtime.h. The profile package is authored by hand
# (tsc_packages/@demo/specrt), build emits C only — no toolchain needed.
mkdir -p tsc_packages/@demo/specrt
cat > tsc_packages/@demo/specrt/index.d.tsc <<'PROFILE'
declare platform {
    target: "spectrum"
    runtimeHeader: "runtime_spectrum.h"
}
PROFILE

tsclang build main.tsc --platform @demo/specrt --out-dir dist
grep -q '#include "runtime_spectrum.h"' dist/main.c && echo "runtime-header-applied"
