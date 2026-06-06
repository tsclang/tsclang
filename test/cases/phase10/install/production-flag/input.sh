tsclang install --production
# devDependencies not installed
test ! -d tsc_packages/devtool && echo "dev-absent"
