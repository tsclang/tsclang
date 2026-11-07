echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{"lib":"^1.0.0","mylib":"^1.0.0"}}' > tsc.package.json
tsclang update
grep -q '"lib"' tsc.package.lock && grep -q '"mylib"' tsc.package.lock && echo "lock-kept"
