echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{"mylib":"^1.0.0"}}' > tsc.package.json
tsclang update mylib
test -f tsc.package.lock && echo "lock-updated"
