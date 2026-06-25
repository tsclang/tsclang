# TSClang DOS toolchain — MS-DOS (djgpp / i386-pc-msdosdjgpp GCC)
# Requires djgpp: https://github.com/jwt27/build-gcc
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-dos.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR i386)

find_program(DJGPP_GCC  i386-pc-msdosdjgpp-gcc  REQUIRED)
find_program(DJGPP_AR   i386-pc-msdosdjgpp-ar   REQUIRED)

set(CMAKE_C_COMPILER   ${DJGPP_GCC})
set(CMAKE_AR           ${DJGPP_AR})

# djgpp flags
# -mpreferred-stack-boundary=2 : DOS 4-byte stack alignment
# -std=gnu11                   : use gnu11 for inline asm compatibility
set(CMAKE_C_FLAGS "-std=gnu11 -O2 -mpreferred-stack-boundary=2 -DTSC_DOS -DTSC_NO_LIBUV" CACHE STRING "")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
