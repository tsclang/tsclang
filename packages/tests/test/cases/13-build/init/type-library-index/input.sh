tsclang init mylib --library
tsclang build mylib/index.tsc --emit c --out-dir out
test -f out/index.c && echo "compiles-ok"
