echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{}}' > tsc.package.json
tsclang install mylib@^1.0.0
tsclang remove mylib
test ! -d tsc_packages/mylib && echo "dir-gone"
grep -q mylib tsc.package.lock || echo "lock-clean"
grep -q mylib tsc.package.json || echo "manifest-clean"
