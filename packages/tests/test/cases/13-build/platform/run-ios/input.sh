# Real Xcode compile e2e for iOS (#283): needs-tools gates on xcrun, so this
# case runs only on a macOS host with Xcode Command Line Tools. Both SDKs
# compile (device triple included); the simulator binary is host-runnable
# macho — it is executed directly, no emulator. Build chatter goes to a log so
# expected.out is the program's own output only.
tsclang build main.tsc --build ios-sim --out-dir out-sim >build.log 2>&1 || { cat build.log; exit 1; }
out-sim/main
tsclang build main.tsc --build ios-device --out-dir out-dev >build.log 2>&1 || { cat build.log; exit 1; }
