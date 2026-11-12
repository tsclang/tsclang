# Compiling emits need an EXPLICIT toolchain (#282: bare tsclang is a
# transpiler): builds.app pins gcc — a hand-written pin is the one thing
# that authorizes resolving the compiler from PATH.
tsclang build main.tsc --build app --emit binary --out-dir dist
test -f dist/main && echo "binary-exists"
