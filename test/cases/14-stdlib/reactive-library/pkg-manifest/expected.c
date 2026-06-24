#include "runtime.h"

int32_t mathlib_square_i32(int32_t x) {
    return (int32_t)((uint32_t)x * (uint32_t)x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", mathlib_square_i32(5));
    return 0;
}
