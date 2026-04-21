# TSClang Spectrum toolchain — ZX Spectrum (z88dk / sccz80)
# Requires z88dk: https://github.com/z88dk/z88dk
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-spectrum.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR z80)

find_program(SCCZ80  sccz80   REQUIRED)
find_program(Z88DK_AR  z88dk-ar REQUIRED)

set(CMAKE_C_COMPILER   ${SCCZ80})
set(CMAKE_AR           ${Z88DK_AR})

# z88dk / sccz80 flags
# +zx       : ZX Spectrum target
# -O2       : optimization
# -DSPEC48K : 48KB model
set(CMAKE_C_FLAGS "+zx -O2 -DSPEC48K -DTSC_SPECTRUM -DTSC_NO_LIBUV" CACHE STRING "")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
