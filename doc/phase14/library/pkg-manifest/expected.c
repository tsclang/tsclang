#include "runtime.h"

int32_t mathlib_square_i32(int32_t x) {
    return x * x;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", mathlib_square_i32(5));
    return 0;
}
