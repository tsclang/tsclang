echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{}}' > tsc.package.json
tsclang install mylib
grep -q '"mylib": "\^1.0.0"' tsc.package.json && echo "manifest-updated"
