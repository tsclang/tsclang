# TSClang Genesis toolchain — Sega Genesis / Mega Drive (SGDK / m68k-elf-gcc)
# Requires SGDK: https://github.com/Stephane-D/SGDK
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-genesis.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR m68k)

find_program(M68K_GCC  m68k-elf-gcc  REQUIRED)
find_program(M68K_AR   m68k-elf-ar   REQUIRED)

set(CMAKE_C_COMPILER   ${M68K_GCC})
set(CMAKE_AR           ${M68K_AR})

# Motorola 68000 flags
# -m68000       : target 68000 (no 68020+ instructions)
# -mshort       : int = 16-bit (Sega ROM convention)
# -fomit-frame-pointer: save registers (tight RAM)
set(CMAKE_C_FLAGS "-m68000 -mshort -fomit-frame-pointer -O2 -std=c11 -DTSC_GENESIS -DTSC_NO_LIBUV" CACHE STRING "")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
