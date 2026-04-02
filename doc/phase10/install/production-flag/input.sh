tsclang install --production
# devDependencies not installed
test ! -d node_modules/devtool && echo "dev-absent"
