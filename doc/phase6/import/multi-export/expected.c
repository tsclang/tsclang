#include "runtime.h"

int32_t mul_i32_i32(int32_t a, int32_t b) {
    return a * b;
}

int32_t square_i32(int32_t x) {
    return mul_i32_i32(x, x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", mul_i32_i32(3, 4));
    printf("%d\n", square_i32(5));
    return 0;
}
