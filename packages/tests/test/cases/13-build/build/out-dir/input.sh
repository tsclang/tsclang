tsclang build main.tsc --emit c --out-dir ./out
test -f out/main.c && echo "in-outdir"
