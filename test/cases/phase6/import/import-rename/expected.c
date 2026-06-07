#include "runtime.h"

int32_t module_add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}

int32_t module_mul_i32_i32(int32_t a, int32_t b) {
    return a * b;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", module_add_i32_i32(3, 4));
    printf("%d\n", module_mul_i32_i32(3, 4));
    return 0;
}
