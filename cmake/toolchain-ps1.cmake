# TSClang PS1 toolchain — PlayStation 1 (psn00bsdk / mipsel-unknown-elf-gcc)
# Requires psn00bsdk: https://github.com/Lameguy64/PSn00bSDK
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-ps1.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR mips)

find_program(MIPS_GCC  mipsel-unknown-elf-gcc  REQUIRED)
find_program(MIPS_AR   mipsel-unknown-elf-ar   REQUIRED)

set(CMAKE_C_COMPILER   ${MIPS_GCC})
set(CMAKE_AR           ${MIPS_AR})

# PSX MIPS GCC flags
# -msoft-float  : software floating point (no FPU on PS1 GTE)
# -fno-builtin  : avoid libc assumptions
# -G0           : no GP-relative addressing
set(CMAKE_C_FLAGS "-march=r3000 -msoft-float -fno-builtin -G0 -O2 -std=c11 -DTSC_PS1 -DTSC_NO_LIBUV" CACHE STRING "")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
