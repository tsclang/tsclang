tsclang init --type library mylib
test -f mylib/tsc.package.json && echo "name-ok"
test ! -d library && echo "no-literal-dir"
