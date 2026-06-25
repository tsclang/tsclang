# TSClang PS2 toolchain — PlayStation 2 (ee-gcc / ps2dev SDK)
# Requires ps2dev toolchain: https://github.com/ps2dev/ps2dev
# Usage: cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-ps2.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR mips)

find_program(EE_GCC  ee-gcc  REQUIRED)
find_program(EE_AR   ee-ar   REQUIRED)
find_program(EE_OBJCOPY ee-objcopy)

set(CMAKE_C_COMPILER   ${EE_GCC})
set(CMAKE_AR           ${EE_AR})

# EE (Emotion Engine) GCC flags
# -mabi=eabi      : PS2 EE ABI
# -mno-float-gprs : use FPU registers
# -G0             : no small-data section
set(CMAKE_C_FLAGS "-mabi=eabi -mno-float-gprs -G0 -O2 -std=c11 -DTSC_PS2 -DTSC_NO_LIBUV" CACHE STRING "")

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
