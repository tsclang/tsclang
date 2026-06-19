#include "runtime.h"

int32_t math_mul_i32_i32(int32_t a, int32_t b) {
    return a * b;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", math_mul_i32_i32(6, 7));
    return 0;
}
