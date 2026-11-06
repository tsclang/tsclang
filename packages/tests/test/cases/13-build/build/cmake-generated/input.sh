tsclang build main.tsc --emit c --out-dir dist
test -f dist/CMakeLists.txt && echo "cmake-exists"
