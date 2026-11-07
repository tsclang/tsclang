tsclang init myavr --avr
grep -q '"profile": "avr"' myavr/tsc.package.json && echo "profile-ok"
grep -q '"emit": "flash"' myavr/tsc.package.json && echo "emit-ok"
test -f myavr/src/main.tsc && echo "main-ok"
