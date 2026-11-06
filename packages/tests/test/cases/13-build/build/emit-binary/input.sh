tsclang build main.tsc --emit binary --out-dir dist
test -f dist/main && echo "binary-exists"
