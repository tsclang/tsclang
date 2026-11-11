# Install a declaration-only .tspkg (index.d.tsc, no index.tsc)
tsclang install greetdecl-1.0.0.tspkg

# The import must resolve to the package's index.d.tsc
tsclang build main.tsc --emit c --no-cache && echo "build-ok"

# The declaration must surface as a C extern (no impl: the platform package
# or the project provides the C side)
grep -q "extern int32_t decl_add" main.c && echo "extern-ok"
