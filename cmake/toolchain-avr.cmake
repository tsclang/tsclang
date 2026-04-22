# TSClang AVR toolchain — avr-gcc
# Requires avr-gcc and avr-libc installed.
# Usage: tsclang build --target avr → cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-avr.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR avr)

find_program(AVR_GCC avr-gcc REQUIRED)
find_program(AVR_AR  avr-ar  REQUIRED)
find_program(AVR_OBJCOPY avr-objcopy REQUIRED)

set(CMAKE_C_COMPILER   ${AVR_GCC})
set(CMAKE_AR           ${AVR_AR})

# MCU and frequency — override with -DMCU=atmega2560 etc.
set(MCU   "atmega328p" CACHE STRING "AVR MCU type")
set(F_CPU "16000000UL" CACHE STRING "CPU clock frequency in Hz")

# avr-gcc flags
# -mmcu      : target MCU
# -DF_CPU    : clock frequency for <util/delay.h>
# -Os        : optimize for size (standard for embedded)
# -std=gnu11 : C11 with GNU extensions (needed for statement-expressions in macros)
# -DTSC_EMBEDDED -DTSC_AVR : enable TSC guards in runtime headers
set(CMAKE_C_FLAGS
    "-mmcu=${MCU} -DF_CPU=${F_CPU} -Os -std=gnu11 -DTSC_EMBEDDED -DTSC_AVR"
    CACHE STRING "" FORCE)
set(CMAKE_EXE_LINKER_FLAGS "-mmcu=${MCU}" CACHE STRING "" FORCE)

# Platform headers take priority over default src/runtime/std/
# This causes #include "std/hal.h" to resolve to platforms/avr/std/hal.h
set(TSCLANG_RUNTIME "${CMAKE_CURRENT_SOURCE_DIR}/src/runtime")
include_directories(BEFORE "${TSCLANG_RUNTIME}/platforms/avr")

# avr-gcc needs these for try_compile to work
set(CMAKE_C_COMPILER_WORKS TRUE)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

# Post-build: produce .hex for flashing
set(CMAKE_EXECUTABLE_SUFFIX ".elf")
