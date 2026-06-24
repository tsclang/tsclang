echo 'export function main(): void { console.log("hello"); }' > input.tsc
tsclang build input.tsc --outDir build-out --emit c
grep "CMAKE_C_STANDARD_REQUIRED" build-out/CMakeLists.txt
