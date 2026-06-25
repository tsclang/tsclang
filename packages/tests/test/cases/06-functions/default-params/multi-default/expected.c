#include "runtime.h"

int32_t calc_i32_i32_i32(int32_t x, int32_t y, int32_t z) {
    return (int32_t)((uint32_t)(int32_t)((uint32_t)x + (uint32_t)y) + (uint32_t)z);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", calc_i32_i32_i32(1, 2, 3));
    printf("%d\n", calc_i32_i32_i32(1, 10, 3));
    printf("%d\n", calc_i32_i32_i32(1, 10, 20));
    return 0;
}
