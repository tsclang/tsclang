tsclang build main.tsc --emit c --out-dir dist
test -f dist/main.c && echo "c-exists"
test ! -f dist/main && echo "binary-absent"
