echo '{"name":"app","version":"0.1.0","type":"package","dependencies":{"lib":"1.0.0"},"devDependencies":{"devtool":"1.0.0"}}' > tsc.package.json
tsclang install --production
test ! -d tsc_packages/devtool && echo "dev-absent"
grep -q '"lib"' tsc.package.lock && echo "prod-synced"
