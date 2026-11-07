tsclang init mylib --library
cd mylib
tsclang run dts > /dev/null
test -f build/dts/index.d.tsc && echo "dts-ok"
