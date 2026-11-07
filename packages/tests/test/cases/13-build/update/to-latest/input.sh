echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{"mylib":"^1.0.0"}}' > tsc.package.json
tsclang update mylib
grep -A2 '"mylib"' tsc.package.lock | grep -q '"version": "1.0.0"' && echo "updated"
