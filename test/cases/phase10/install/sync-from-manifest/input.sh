echo '{"name":"test","version":"1.0.0","dependencies":{"mylib":"1.0.0","otherlib":"2.0.0"}}' > tsc.package.json
tsclang install
test -f tsc.package.lock && echo "lock-created"
grep -q '"mylib"' tsc.package.lock && grep -q '"otherlib"' tsc.package.lock && echo "deps-synced"