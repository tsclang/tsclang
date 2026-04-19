# TSClang NES toolchain — cc65 / ld65
# Requires cc65 installed and available in PATH.
# Usage: tsclang build --target nes → cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-nes.cmake

set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR 6502)

find_program(CC65  cc65  REQUIRED)
find_program(CA65  ca65  REQUIRED)
find_program(LD65  ld65  REQUIRED)
find_program(AR65  ar65  REQUIRED)

set(CMAKE_C_COMPILER   ${CC65})
set(CMAKE_ASM_COMPILER ${CA65})
set(CMAKE_LINKER       ${LD65})
set(CMAKE_AR           ${AR65})

# cc65 NES target flags
# -t nes         : NES target (crt0, linker config, memory map)
# -O             : enable optimizer
# -Cl            : treat local variables as static (register variable heuristic)
# -DTSC_NES      : enable TSC_NES guards in runtime headers
set(CMAKE_C_FLAGS "-t nes -O -Cl -DTSC_NES" CACHE STRING "" FORCE)

# Linker: produce iNES ROM (.nes)
# ld65 config for NES NROM-128 (32KB PRG, no CHR RAM)
set(CMAKE_EXE_LINKER_FLAGS "-t nes -o output.nes" CACHE STRING "" FORCE)

# cc65 doesn't use CMake's standard compile/link pipeline well —
# this toolchain is a reference config; actual invocation via tsclang CLI
set(CMAKE_C_COMPILER_WORKS TRUE)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

# Output
set(CMAKE_EXECUTABLE_SUFFIX ".nes")
