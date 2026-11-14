# Real Xcode compile e2e for iOS (#283): needs-tools gates on xcrun + vtool,
# so this case runs only on a macOS host with Xcode Command Line Tools. Both
# SDKs compile (device triple included). The simulator artifact is a TRUE sim
# slice: dyld kills IOSSIMULATOR-platform macho exec'd from a macOS process,
# so the run goes through a vtool-retagged copy (LC_BUILD_VERSION -> macos) —
# the code and ABI are identical on Apple Silicon, only the platform tag
# differs. Build chatter goes to a log so expected.out is the program's own
# output only; run failures echo diagnostics (a dyld kill is silent).
tsclang build main.tsc --build ios-sim --out-dir out-sim >build.log 2>&1 || { cat build.log; exit 1; }
vtool -set-build-version macos 13.0 13.0 -replace -output run-sim out-sim/main || { echo "vtool failed"; exit 1; }
./run-sim || { echo "run-sim exited $?"; exit 1; }
tsclang build main.tsc --build ios-device --out-dir out-dev >build.log 2>&1 || { cat build.log; exit 1; }
