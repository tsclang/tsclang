tsclang build main.tsc --emit c --outDir ./out
test -f out/main.c && echo "in-outdir"
