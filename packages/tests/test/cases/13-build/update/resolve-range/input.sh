echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{"lib":"^1.0.0"}}' > tsc.package.json
tsclang update lib
grep -A2 '"lib"' tsc.package.lock | grep -q '"version": "1.2.3"' && echo "resolved"
