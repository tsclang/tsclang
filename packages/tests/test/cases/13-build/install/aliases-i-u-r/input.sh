echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{}}' > tsc.package.json
tsclang i lib@1.0.0
sed -i 's/"lib": "1.0.0"/"lib": "^1.0.0"/' tsc.package.json
tsclang u lib
tsclang r lib
test ! -d tsc_packages/lib && echo "clean"
