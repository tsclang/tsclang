# TSClang WebAssembly toolchain — Emscripten (emcc) or clang wasm32
# Requires Emscripten SDK: https://emscripten.org/docs/getting_started/
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-wasm.cmake

set(CMAKE_SYSTEM_NAME Emscripten)
set(CMAKE_SYSTEM_PROCESSOR wasm32)

find_program(EMCC   emcc   REQUIRED)
find_program(EMAR   emar)
find_program(EMRANLIB emranlib)

set(CMAKE_C_COMPILER   ${EMCC})
set(CMAKE_AR           ${EMAR})
set(CMAKE_RANLIB       ${EMRANLIB})

# Emscripten flags
# -O2               : optimized output
# -sWASM=1          : emit .wasm (not asm.js)
# -sEXPORTED_FUNCTIONS: list exported symbols (override per project)
# -sSTANDALONE_WASM=1: produce standalone .wasm without JS runtime (for wasm32 bare)
set(CMAKE_C_FLAGS "-O2 -DTSC_WASM -DTSC_NO_LIBUV -sWASM=1" CACHE STRING "")
set(CMAKE_EXE_LINKER_FLAGS "-sSTANDALONE_WASM=1 -sWASM_BIGINT=1" CACHE STRING "")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
