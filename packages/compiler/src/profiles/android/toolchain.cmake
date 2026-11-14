# TSClang Android toolchain — NDK clang (ndk-clang)
# Cross-compiles to aarch64-linux-android (API 24+). The toolchain binary
# comes from the isolated @tsclang/android bundle (~/.tsclang/platforms) or
# a PATH-pinned builds.<n>.toolchain; the bundle ships sysroot/ next to bin/.
# Usage: tsclang build --target android → cmake -DCMAKE_TOOLCHAIN_FILE=...

set(CMAKE_SYSTEM_NAME Android)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_ANDROID_API 24)

find_program(NDK_CLANG ndk-clang REQUIRED)
set(CMAKE_C_COMPILER ${NDK_CLANG})

# The bundle layout is <root>/bin + <root>/sysroot — derive the sysroot from
# the compiler location so PATH-pinned NDK layouts work unchanged.
get_filename_component(_tsc_ndk_bindir ${NDK_CLANG} DIRECTORY)
if(EXISTS "${_tsc_ndk_bindir}/../sysroot")
  set(CMAKE_SYSROOT "${_tsc_ndk_bindir}/../sysroot")
endif()

# bionic: pthreads are in libc (-lpthread is a hard error since NDK r18);
# executables are PIE (required for API 24+)
set(ANDROID_TARGET_FLAG "--target=aarch64-linux-android24")
set(CMAKE_C_FLAGS "${ANDROID_TARGET_FLAG} -std=c11" CACHE STRING "" FORCE)
set(CMAKE_EXE_LINKER_FLAGS "${ANDROID_TARGET_FLAG} -fPIE -pie -lm" CACHE STRING "" FORCE)

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
