#include "runtime.h"

int32_t math_mul_i32_i32(int32_t a, int32_t b) {
    return (int32_t)((uint32_t)a * (uint32_t)b);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", math_mul_i32_i32(6, 7));
    return 0;
}
