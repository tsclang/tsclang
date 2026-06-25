tsclang build main.tsc --emit c --outDir dist
test -f dist/CMakeLists.txt && echo "cmake-exists"
