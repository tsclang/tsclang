tsclang build main.tsc --emit binary --outDir dist
test -f dist/main && echo "binary-exists"
