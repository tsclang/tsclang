#include "runtime.h"

int32_t math_mul_i32_i32(int32_t a, int32_t b) {
    return a * b;
}

int32_t math_square_i32(int32_t x) {
    return math_mul_i32_i32(x, x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", math_mul_i32_i32(3, 4));
    printf("%d\n", math_square_i32(5));
    return 0;
}
