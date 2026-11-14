# Real Xcode compile e2e for iOS async (#287): builds.<n>.async = "libuv" in
# the preset switches the scheduler — the CLI resolves the libuv bundle root
# (TSC_LIBUV env, provided by the CI macos job / needs-tools env: gate) and
# links the static lib into the simulator slice. The run goes through the
# vtool-retagged copy like run-ios (dyld platform gating); build chatter goes
# to a log so expected.out is the program's own output only.
tsclang build main.tsc --build ios-sim-async --out-dir out >build.log 2>&1 || { cat build.log; exit 1; }
vtool -set-build-version macos 13.0 13.0 -replace -output run out/main || { echo "vtool failed"; exit 1; }
./run || { echo "run exited $?"; exit 1; }
