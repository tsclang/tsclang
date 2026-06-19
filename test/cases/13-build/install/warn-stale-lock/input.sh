echo '{"name":"test","version":"1.0.0","dependencies":{"mylib":"1.0.0"}}' > tsc.package.json
echo '{"version":1,"packages":{}}' > tsc.package.lock
echo 'let x: i32 = 42;' > app.tsc
tsclang build app.tsc --outDir tmp/ 2>&1 | grep -q "out of date" && echo "stale-warning"