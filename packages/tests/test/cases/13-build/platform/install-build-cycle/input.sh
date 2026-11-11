# Official-scope platform (no name prefix — docker model): install adds the
# build preset, then `tsclang build --build hello` emits C with it (emit "c"
# needs no compiler, so the case runs wherever gcc is absent).
export TSC_REGISTRY=catalog.json
cat > tsc.package.json <<'MANIFEST'
{
  "name": "hellocycle",
  "version": "0.0.1",
  "type": "package",
  "main": "main.tsc"
}
MANIFEST

tsclang platform install @tsclang/hello
tsclang build --build hello && echo "build-ok"
test -f build/hello/main.c && echo "c-generated"
